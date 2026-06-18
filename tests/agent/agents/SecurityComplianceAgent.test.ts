import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SecurityComplianceAgent } from '../../../src/agent/agents/SecurityComplianceAgent';
import { AgentCache } from '../../../src/agent/cache/AgentCache';
import { StoredCredentials } from '../../../src/agent/credentials/types';
import { AgentContext } from '../../../src/agent/types';
import { LLMProvider } from '../../../src/agent/providers/types';
import {
  BranchStrategy,
  DeploymentTarget,
  DevForgeConfig,
  Framework,
  PackageManager,
} from '../../../src/types';

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const onlineCreds: StoredCredentials = {
  provider: 'openai',
  credentials: { OPENAI_API_KEY: 'test' },
  setupAt: new Date().toISOString(),
  version: 1,
};

const offlineCreds: StoredCredentials = {
  provider: 'offline',
  credentials: {},
  setupAt: new Date().toISOString(),
  version: 1,
};

let tmpDir: string;
beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sca-test-'));
});
afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function freshCache(): AgentCache {
  return new AgentCache({ cachePath: path.join(tmpDir, `cache-${Math.random()}.json`) });
}

function makeConfig(overrides?: Partial<DevForgeConfig>): DevForgeConfig {
  return {
    projectRoot: '/tmp/proj',
    detected: {
      framework: Framework.NEXTJS,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: true,
      hasLinting: true,
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      installCommand: 'npm ci',
      detectedAt: new Date().toISOString(),
    },
    user: {
      deploymentTarget: DeploymentTarget.VERCEL,
      branchStrategy: BranchStrategy.FEATURE_MAIN,
      dockerRequired: false,
      multiEnvironment: false,
      environments: [],
      enableJenkinsfile: false,
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.0.0',
    ...overrides,
  };
}

function makeContext(generatedFiles: string[] = [], overrides?: Partial<AgentContext>): AgentContext {
  return {
    config: makeConfig(),
    generatedFiles,
    lastRunJson: null,
    failureSignals: [],
    ...overrides,
  };
}

function makeProvider(response: string, available = true): LLMProvider {
  return {
    name: 'mock',
    chat: jest.fn().mockResolvedValue(response),
    isAvailable: jest.fn().mockResolvedValue(available),
  };
}

const INSECURE_WORKFLOW = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
        env:
          token=hardcoded123
`;

const CLEAN_WORKFLOW = `
name: CI
on: [push]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
`;

describe('SecurityComplianceAgent', () => {
  describe('run() — static scan only (no readable files)', () => {
    it('returns success with no violations when no files are provided', async () => {
      const agent = new SecurityComplianceAgent(
        makeProvider('{"violations":[],"riskScore":0}'),
        onlineCreds,
        freshCache(),
      );
      const result = await agent.run(makeContext([]));
      expect(result.success).toBe(true);
      expect(result.recommendations).toHaveLength(0);
    });
  });

  describe('run() — static scan from file contents', () => {
    it('detects violations in an insecure workflow', async () => {
      const readFile = jest.fn().mockResolvedValue(INSECURE_WORKFLOW);
      const agent = new SecurityComplianceAgent(
        makeProvider('{"violations":[],"riskScore":10}'),
        onlineCreds,
        freshCache(),
        readFile,
      );
      const result = await agent.run(makeContext(['ci.yml']));
      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.every((r) => r.type === 'security')).toBe(true);
    });

    it('surfaces critical and high violations as warnings', async () => {
      const readFile = jest.fn().mockResolvedValue(INSECURE_WORKFLOW);
      const agent = new SecurityComplianceAgent(
        makeProvider('{"violations":[],"riskScore":50}'),
        onlineCreds,
        freshCache(),
        readFile,
      );
      const result = await agent.run(makeContext(['ci.yml']));
      expect(result.warnings.length).toBeGreaterThan(0);
      result.warnings.forEach((w) => {
        expect(['critical', 'high']).toContain(w.severity);
      });
    });

    it('returns no violations for a clean workflow', async () => {
      const readFile = jest.fn().mockResolvedValue(CLEAN_WORKFLOW);
      const agent = new SecurityComplianceAgent(
        makeProvider('{"violations":[],"riskScore":0}'),
        onlineCreds,
        freshCache(),
        readFile,
      );
      const result = await agent.run(makeContext(['ci.yml']));
      expect(result.recommendations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('run() — LLM merge', () => {
    it('merges unique LLM violations with static ones', async () => {
      const readFile = jest.fn().mockResolvedValue(CLEAN_WORKFLOW);
      const llmExtra = {
        violations: [
          {
            controlId: 'NIST-AU-2',
            standard: 'NIST',
            title: 'No audit logging',
            description: 'Missing audit step.',
            affectedFile: 'ci.yml',
            severity: 'medium',
            remediation: 'Add audit logging step.',
          },
        ],
        riskScore: 20,
      };
      const agent = new SecurityComplianceAgent(
        makeProvider(JSON.stringify(llmExtra)),
        onlineCreds,
        freshCache(),
        readFile,
      );
      const result = await agent.run(makeContext(['ci.yml']));
      const titles = result.recommendations.map((r) => r.title);
      expect(titles.some((t) => t.includes('NIST-AU-2'))).toBe(true);
    });

    it('deduplicates LLM violations already found by static scan', async () => {
      const readFile = jest.fn().mockResolvedValue(INSECURE_WORKFLOW);
      const duplicate = {
        violations: [
          {
            controlId: 'NIST-SI-2',
            standard: 'NIST',
            title: 'Unpinned action',
            description: 'Already caught.',
            affectedFile: 'ci.yml',
            severity: 'high',
            remediation: 'Pin it.',
          },
        ],
        riskScore: 30,
      };
      const agent = new SecurityComplianceAgent(
        makeProvider(JSON.stringify(duplicate)),
        onlineCreds,
        freshCache(),
        readFile,
      );
      const result = await agent.run(makeContext(['ci.yml']));
      const si2 = result.recommendations.filter((r) => r.title.includes('NIST-SI-2'));
      expect(si2).toHaveLength(1);
    });

    it('falls back to static results when LLM returns invalid JSON', async () => {
      const readFile = jest.fn().mockResolvedValue(INSECURE_WORKFLOW);
      const agent = new SecurityComplianceAgent(
        makeProvider('not-json'),
        onlineCreds,
        freshCache(),
        readFile,
      );
      const result = await agent.run(makeContext(['ci.yml']));
      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('run() — offline mode', () => {
    it('skips LLM call and returns static-only results when offline', async () => {
      const readFile = jest.fn().mockResolvedValue(INSECURE_WORKFLOW);
      const provider = makeProvider('{}');
      const agent = new SecurityComplianceAgent(
        provider,
        offlineCreds,
        freshCache(),
        readFile,
      );
      const result = await agent.run(makeContext(['ci.yml']));
      expect(provider.chat).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('fallback()', () => {
    it('returns a successful result with no violations', () => {
      const agent = new SecurityComplianceAgent(makeProvider('{}'), onlineCreds, freshCache());
      const result = agent['fallback'](makeContext());
      expect(result.agentName).toBe('SecurityComplianceAgent');
      expect(result.success).toBe(true);
      expect(result.recommendations).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('agentName', () => {
    it('is SecurityComplianceAgent', () => {
      const agent = new SecurityComplianceAgent(makeProvider('{}'), onlineCreds, freshCache());
      expect(agent.agentName).toBe('SecurityComplianceAgent');
    });
  });
});
