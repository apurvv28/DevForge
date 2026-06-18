/**
 * tests/agent/security/fixtures.test.ts
 *
 * Integration tests for the full security agent pipeline.
 * Each test reads a real fixture file from tests/fixtures/workflows/ and
 * drives it through one or more subsystems:
 *   - StaticSecurityScanner  (req 2)
 *   - SecurityComplianceAgent (req 3)
 *   - AutoFixEngine           (req 4)
 *   - ComplianceReportGenerator (req 5)
 */

import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import { load } from 'js-yaml';

import { runStaticScan, ComplianceViolation } from '../../../src/agent/security/StaticSecurityScanner';
import { SecurityComplianceAgent } from '../../../src/agent/agents/SecurityComplianceAgent';
import { applyAutoFixes } from '../../../src/agent/security/AutoFixEngine';
import { generateComplianceReport } from '../../../src/agent/security/ComplianceReportGenerator';
import { AgentCache } from '../../../src/agent/cache/AgentCache';
import { StoredCredentials } from '../../../src/agent/credentials/types';
import { AgentContext } from '../../../src/agent/types';
import { LLMProvider } from '../../../src/agent/providers/types';
import { DevForgeFS } from '../../../src/utils/fs';
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

// ── constants ─────────────────────────────────────────────────────────

const FIXTURES = path.resolve(__dirname, '../../fixtures/workflows');

const FIXTURE = {
  noPerms:        'insecure-no-permissions.yml',
  writeAll:       'insecure-write-all.yml',
  unpinned:       'insecure-unpinned-actions.yml',
  hardcodedSecret:'insecure-hardcoded-secret.yml',
  latestDocker:   'insecure-latest-docker.yml',
  clean:          'clean-workflow.yml',
} as const;

// ── helpers ───────────────────────────────────────────────────────────

async function fixtureContent(name: string): Promise<string> {
  return fsp.readFile(path.join(FIXTURES, name), 'utf-8');
}

function fixtureMap(...names: string[]): Record<string, string> {
  // Populated synchronously in beforeAll; used via closure below.
  throw new Error('call loadFixtures() first');
}
// Overridden below after beforeAll loads content.
let CONTENTS: Record<string, string> = {};

function scanFixture(...names: string[]): ComplianceViolation[] {
  const map: Record<string, string> = {};
  for (const n of names) map[n] = CONTENTS[n]!;
  return runStaticScan(map);
}

function find(violations: ComplianceViolation[], controlId: string): ComplianceViolation | undefined {
  return violations.find((v) => v.controlId === controlId);
}

const ONLINE_CREDS: StoredCredentials = {
  provider: 'openai',
  credentials: { OPENAI_API_KEY: 'test-key' },
  setupAt: new Date().toISOString(),
  version: 1,
};

function mockProvider(extra: ComplianceViolation[] = []): LLMProvider {
  const payload = { violations: extra, riskScore: extra.length * 10 };
  return {
    name: 'mock',
    chat: jest.fn().mockResolvedValue(JSON.stringify(payload)),
    isAvailable: jest.fn().mockResolvedValue(true),
  };
}

function makeConfig(): DevForgeConfig {
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
  };
}

// ── setup ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  for (const name of Object.values(FIXTURE)) {
    CONTENTS[name] = await fixtureContent(name);
  }
});

// ── Req 1: fixtures exist and are non-empty ───────────────────────────

describe('Fixture files', () => {
  it.each(Object.values(FIXTURE))('%s exists and is non-empty', (name) => {
    expect(CONTENTS[name]).toBeTruthy();
    expect(CONTENTS[name]!.length).toBeGreaterThan(0);
  });
});

// ── Req 2: StaticSecurityScanner × fixtures ───────────────────────────

describe('StaticSecurityScanner — fixture-driven', () => {
  describe('insecure-no-permissions.yml', () => {
    it('flags NIST-AC-6 (missing permissions) as critical', () => {
      const v = find(scanFixture(FIXTURE.noPerms), 'NIST-AC-6');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('critical');
      expect(v!.affectedFile).toBe(FIXTURE.noPerms);
    });

    it('does not flag NIST-SI-2 (actions are SHA-pinned)', () => {
      expect(find(scanFixture(FIXTURE.noPerms), 'NIST-SI-2')).toBeUndefined();
    });
  });

  describe('insecure-write-all.yml', () => {
    it('flags NIST-AC-6 (write-all) as high', () => {
      const violations = scanFixture(FIXTURE.writeAll);
      const v = violations.find(
        (x) => x.controlId === 'NIST-AC-6' && x.severity === 'high',
      );
      expect(v).toBeDefined();
      expect(v!.affectedFile).toBe(FIXTURE.writeAll);
    });
  });

  describe('insecure-unpinned-actions.yml', () => {
    it('flags NIST-SI-2 (unpinned action) as high', () => {
      const v = find(scanFixture(FIXTURE.unpinned), 'NIST-SI-2');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('high');
      expect(v!.affectedFile).toBe(FIXTURE.unpinned);
    });

    it('does not flag NIST-AC-6 (permissions block is present)', () => {
      const noPermsViolations = scanFixture(FIXTURE.unpinned).filter(
        (v) => v.controlId === 'NIST-AC-6' && v.title.includes('Missing'),
      );
      expect(noPermsViolations).toHaveLength(0);
    });
  });

  describe('insecure-hardcoded-secret.yml', () => {
    it('flags ISO-A.9.4 (plaintext secret) as critical', () => {
      const v = find(scanFixture(FIXTURE.hardcodedSecret), 'ISO-A.9.4');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('critical');
      expect(v!.affectedFile).toBe(FIXTURE.hardcodedSecret);
    });
  });

  describe('insecure-latest-docker.yml', () => {
    it('flags NIST-CM-6 (:latest docker tag) as medium', () => {
      const v = find(scanFixture(FIXTURE.latestDocker), 'NIST-CM-6');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('medium');
      expect(v!.affectedFile).toBe(FIXTURE.latestDocker);
    });
  });

  describe('clean-workflow.yml', () => {
    it('produces zero violations', () => {
      expect(scanFixture(FIXTURE.clean)).toHaveLength(0);
    });
  });

  describe('cross-file isolation', () => {
    it('violations from insecure-no-permissions.yml do not appear for clean-workflow.yml', () => {
      const mixed = runStaticScan({
        [FIXTURE.noPerms]: CONTENTS[FIXTURE.noPerms]!,
        [FIXTURE.clean]:   CONTENTS[FIXTURE.clean]!,
      });
      const cleanViolations = mixed.filter((v) => v.affectedFile === FIXTURE.clean);
      expect(cleanViolations).toHaveLength(0);
    });

    it('each fixture file is tagged with its own affectedFile', () => {
      const mixed = runStaticScan({
        [FIXTURE.noPerms]:  CONTENTS[FIXTURE.noPerms]!,
        [FIXTURE.writeAll]: CONTENTS[FIXTURE.writeAll]!,
        [FIXTURE.unpinned]: CONTENTS[FIXTURE.unpinned]!,
      });
      for (const v of mixed) {
        expect([FIXTURE.noPerms, FIXTURE.writeAll, FIXTURE.unpinned]).toContain(v.affectedFile);
      }
    });

    it('violation objects from fixtures have all required fields', () => {
      const [v] = scanFixture(FIXTURE.noPerms);
      expect(v).toMatchObject({
        controlId:    expect.any(String),
        standard:     expect.stringMatching(/^(NIST|ISO27001)$/),
        title:        expect.any(String),
        description:  expect.any(String),
        affectedFile: expect.any(String),
        severity:     expect.stringMatching(/^(low|medium|high|critical)$/),
        remediation:  expect.any(String),
      });
    });
  });
});

// ── Req 3: SecurityComplianceAgent × fixtures ─────────────────────────

describe('SecurityComplianceAgent — fixture-driven', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sca-fix-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  function freshCache(): AgentCache {
    return new AgentCache({ cachePath: path.join(tmpDir, `cache-${Math.random()}.json`) });
  }

  function makeContext(files: string[]): AgentContext {
    return { config: makeConfig(), generatedFiles: files, lastRunJson: null, failureSignals: [] };
  }

  it('merges two extra LLM violations with static results from insecure-no-permissions.yml', async () => {
    const readFile = jest.fn().mockResolvedValue(CONTENTS[FIXTURE.noPerms]);

    const extraViolations: ComplianceViolation[] = [
      {
        controlId: 'NIST-AU-2',
        standard: 'NIST',
        title: 'No audit logging step',
        description: 'Missing audit step.',
        affectedFile: FIXTURE.noPerms,
        severity: 'medium',
        remediation: 'Add an audit logging step.',
      },
      {
        controlId: 'NIST-SC-8',
        standard: 'NIST',
        title: 'No TLS enforcement',
        description: 'Connections may be unencrypted.',
        affectedFile: FIXTURE.noPerms,
        severity: 'high',
        remediation: 'Enforce TLS in deployment config.',
      },
    ];

    const agent = new SecurityComplianceAgent(
      mockProvider(extraViolations),
      ONLINE_CREDS,
      freshCache(),
      readFile,
    );

    const result = await agent.run(makeContext([FIXTURE.noPerms]));
    const controlIds = result.recommendations.map((r) => r.title);

    // Static caught NIST-AC-6
    expect(controlIds.some((t) => t.includes('NIST-AC-6'))).toBe(true);
    // LLM extras also present
    expect(controlIds.some((t) => t.includes('NIST-AU-2'))).toBe(true);
    expect(controlIds.some((t) => t.includes('NIST-SC-8'))).toBe(true);
  });

  it('deduplicates when LLM returns a violation already found by static scanner', async () => {
    const readFile = jest.fn().mockResolvedValue(CONTENTS[FIXTURE.noPerms]);

    // LLM echoes the same NIST-AC-6 already caught by static scan
    const duplicate: ComplianceViolation[] = [
      {
        controlId: 'NIST-AC-6',
        standard: 'NIST',
        title: 'Missing permissions block (Least Privilege)',
        description: 'No permissions block — duplicate.',
        affectedFile: FIXTURE.noPerms,
        severity: 'critical',
        remediation: 'Add permissions block.',
      },
    ];

    const agent = new SecurityComplianceAgent(
      mockProvider(duplicate),
      ONLINE_CREDS,
      freshCache(),
      readFile,
    );

    const result = await agent.run(makeContext([FIXTURE.noPerms]));
    const ac6Count = result.recommendations.filter((r) => r.title.includes('NIST-AC-6')).length;
    expect(ac6Count).toBe(1);
  });

  it('returns static-only results for insecure-unpinned-actions.yml when LLM returns empty', async () => {
    const readFile = jest.fn().mockResolvedValue(CONTENTS[FIXTURE.unpinned]);
    const agent = new SecurityComplianceAgent(
      mockProvider([]),
      ONLINE_CREDS,
      freshCache(),
      readFile,
    );

    const result = await agent.run(makeContext([FIXTURE.unpinned]));
    expect(result.recommendations.some((r) => r.title.includes('NIST-SI-2'))).toBe(true);
  });

  it('returns zero violations for clean-workflow.yml with empty LLM response', async () => {
    const readFile = jest.fn().mockResolvedValue(CONTENTS[FIXTURE.clean]);
    const agent = new SecurityComplianceAgent(
      mockProvider([]),
      ONLINE_CREDS,
      freshCache(),
      readFile,
    );

    const result = await agent.run(makeContext([FIXTURE.clean]));
    expect(result.recommendations).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('surfaces critical/high violations from insecure-hardcoded-secret.yml as AgentWarnings', async () => {
    const readFile = jest.fn().mockResolvedValue(CONTENTS[FIXTURE.hardcodedSecret]);
    const agent = new SecurityComplianceAgent(
      mockProvider([]),
      ONLINE_CREDS,
      freshCache(),
      readFile,
    );

    const result = await agent.run(makeContext([FIXTURE.hardcodedSecret]));
    expect(result.warnings.length).toBeGreaterThan(0);
    result.warnings.forEach((w) => {
      expect(['critical', 'high']).toContain(w.severity);
    });
  });
});

// ── Req 4: AutoFixEngine × fixtures ──────────────────────────────────

describe('AutoFixEngine — fixture-driven', () => {
  let tmpDir: string;
  let devFs: DevForgeFS;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'afe-fix-'));
    devFs = new DevForgeFS(tmpDir);
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  async function copyFixture(name: string): Promise<void> {
    await fsp.writeFile(path.join(tmpDir, name), CONTENTS[name]!, 'utf-8');
  }

  async function readTmp(name: string): Promise<string> {
    return fsp.readFile(path.join(tmpDir, name), 'utf-8');
  }

  async function tmpExists(name: string): Promise<boolean> {
    try { await fsp.access(path.join(tmpDir, name)); return true; } catch { return false; }
  }

  describe('insecure-no-permissions.yml', () => {
    it('adds permissions block and reports applied:true', async () => {
      await copyFixture(FIXTURE.noPerms);

      const v: ComplianceViolation = {
        controlId: 'NIST-AC-6',
        standard: 'NIST',
        title: 'Missing permissions block (Least Privilege)',
        description: 'No permissions block.',
        affectedFile: FIXTURE.noPerms,
        severity: 'critical',
        remediation: 'Add permissions block.',
      };

      const [result] = await applyAutoFixes([v], devFs);
      expect(result?.applied).toBe(true);

      const patched = load(await readTmp(FIXTURE.noPerms)) as Record<string, unknown>;
      expect(patched['permissions']).toEqual({ contents: 'read' });
    });

    it('creates a .bak file before patching', async () => {
      await copyFixture(FIXTURE.noPerms);
      const original = CONTENTS[FIXTURE.noPerms]!;

      const v: ComplianceViolation = {
        controlId: 'NIST-AC-6',
        standard: 'NIST',
        title: 'Missing permissions block (Least Privilege)',
        description: 'No permissions block.',
        affectedFile: FIXTURE.noPerms,
        severity: 'critical',
        remediation: 'Add permissions block.',
      };

      await applyAutoFixes([v], devFs);

      expect(await tmpExists(`${FIXTURE.noPerms}.bak`)).toBe(true);
      expect(await readTmp(`${FIXTURE.noPerms}.bak`)).toBe(original);
    });

    it('patched YAML parses without error', async () => {
      await copyFixture(FIXTURE.noPerms);

      const v: ComplianceViolation = {
        controlId: 'NIST-AC-6',
        standard: 'NIST',
        title: 'Missing permissions block (Least Privilege)',
        description: 'No permissions block.',
        affectedFile: FIXTURE.noPerms,
        severity: 'critical',
        remediation: 'Add permissions block.',
      };

      await applyAutoFixes([v], devFs);
      expect(() => load(CONTENTS[FIXTURE.noPerms]!)).not.toThrow();
      const patchedContent = await readTmp(FIXTURE.noPerms);
      expect(() => load(patchedContent)).not.toThrow();
    });
  });

  describe('insecure-write-all.yml', () => {
    it('replaces write-all with contents: read and reports applied:true', async () => {
      await copyFixture(FIXTURE.writeAll);

      const v: ComplianceViolation = {
        controlId: 'NIST-AC-6',
        standard: 'NIST',
        title: 'Write-all permissions (Least Privilege)',
        description: 'write-all used.',
        affectedFile: FIXTURE.writeAll,
        severity: 'high',
        remediation: 'Replace write-all.',
      };

      const [result] = await applyAutoFixes([v], devFs);
      expect(result?.applied).toBe(true);

      const patched = load(await readTmp(FIXTURE.writeAll)) as Record<string, unknown>;
      expect(patched['permissions']).toEqual({ contents: 'read' });
    });

    it('creates a .bak file before patching', async () => {
      await copyFixture(FIXTURE.writeAll);

      const v: ComplianceViolation = {
        controlId: 'NIST-AC-6',
        standard: 'NIST',
        title: 'Write-all permissions (Least Privilege)',
        description: 'write-all used.',
        affectedFile: FIXTURE.writeAll,
        severity: 'high',
        remediation: 'Replace write-all.',
      };

      await applyAutoFixes([v], devFs);
      expect(await tmpExists(`${FIXTURE.writeAll}.bak`)).toBe(true);
    });

    it('patched YAML parses without error', async () => {
      await copyFixture(FIXTURE.writeAll);

      const v: ComplianceViolation = {
        controlId: 'NIST-AC-6',
        standard: 'NIST',
        title: 'Write-all permissions (Least Privilege)',
        description: 'write-all used.',
        affectedFile: FIXTURE.writeAll,
        severity: 'high',
        remediation: 'Replace write-all.',
      };

      await applyAutoFixes([v], devFs);
      const patchedContent = await readTmp(FIXTURE.writeAll);
      expect(() => load(patchedContent)).not.toThrow();
    });
  });
});

// ── Req 5: ComplianceReportGenerator × fixtures ───────────────────────

describe('ComplianceReportGenerator — fixture-driven', () => {
  let tmpDir: string;
  let devFs: DevForgeFS;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'crg-fix-'));
    devFs = new DevForgeFS(tmpDir);
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  async function readReport(): Promise<string> {
    return fsp.readFile(path.join(tmpDir, 'COMPLIANCE_REPORT.md'), 'utf-8');
  }

  function violationsFromFixtures(): ComplianceViolation[] {
    return [
      ...runStaticScan({ [FIXTURE.noPerms]:  CONTENTS[FIXTURE.noPerms]! }),
      ...runStaticScan({ [FIXTURE.writeAll]: CONTENTS[FIXTURE.writeAll]! }),
      ...runStaticScan({ [FIXTURE.unpinned]: CONTENTS[FIXTURE.unpinned]! }),
    ];
  }

  it('writes COMPLIANCE_REPORT.md containing all fixture violations', async () => {
    const violations = violationsFromFixtures();
    await generateComplianceReport(violations, makeConfig(), devFs);

    const report = await readReport();
    expect(report).toContain('# DevForge Security & Compliance Report');
    expect(report).toContain('NIST-AC-6');
    expect(report).toContain('NIST-SI-2');
  });

  it('executive summary counts match the fixture violations', async () => {
    const violations = violationsFromFixtures();
    const critCount = violations.filter((v) => v.severity === 'critical').length;
    const highCount  = violations.filter((v) => v.severity === 'high').length;

    await generateComplianceReport(violations, makeConfig(), devFs);

    const report = await readReport();
    expect(report).toContain(`| Critical | ${critCount}`);
    expect(report).toContain(`| High     | ${highCount}`);
  });

  it('creates a .bak file on second run and preserves first report content', async () => {
    const firstViolations  = runStaticScan({ [FIXTURE.noPerms]: CONTENTS[FIXTURE.noPerms]! });
    const secondViolations = runStaticScan({ [FIXTURE.unpinned]: CONTENTS[FIXTURE.unpinned]! });

    await generateComplianceReport(firstViolations, makeConfig(), devFs);
    const firstContent = await readReport();

    await generateComplianceReport(secondViolations, makeConfig(), devFs);

    const files = await fsp.readdir(tmpDir);
    const baks = files.filter((f) => f.endsWith('.md.bak'));
    expect(baks).toHaveLength(1);

    const bakContent = await fsp.readFile(path.join(tmpDir, baks[0]!), 'utf-8');
    expect(bakContent).toBe(firstContent);
  });

  it('second run overwrites report with new violation set', async () => {
    await generateComplianceReport(
      runStaticScan({ [FIXTURE.noPerms]: CONTENTS[FIXTURE.noPerms]! }),
      makeConfig(),
      devFs,
    );

    await generateComplianceReport(
      runStaticScan({ [FIXTURE.unpinned]: CONTENTS[FIXTURE.unpinned]! }),
      makeConfig(),
      devFs,
    );

    const report = await readReport();
    expect(report).toContain('NIST-SI-2');
    // The NIST-AC-6 missing-perms violation from the first run must not appear
    expect(report).not.toContain('[CRITICAL] NIST-AC-6');
  });
});
