import { AgentRuntime } from '../../src/agent/AgentRuntime';
import { BaseAgent } from '../../src/agent/BaseAgent';
import { AgentCache } from '../../src/agent/cache/AgentCache';
import { StoredCredentials } from '../../src/agent/credentials/types';
import { AgentContext, AgentResult } from '../../src/agent/types';
import { LLMProvider } from '../../src/agent/providers/types';
import {
  BranchStrategy,
  DeploymentTarget,
  DevForgeConfig,
  Framework,
  PackageManager,
} from '../../src/types';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('ora', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    warn: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
  })),
}));

const ONLINE_CREDS: StoredCredentials = {
  provider: 'openai',
  credentials: { OPENAI_API_KEY: 'test' },
  setupAt: new Date().toISOString(),
  version: 1,
};

function makeContext(): AgentContext {
  const config: DevForgeConfig = {
    projectRoot: '/tmp/project',
    detected: {
      framework: Framework.REACT,
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
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.0.0',
  };
  return { config, generatedFiles: [], lastRunJson: null, failureSignals: [] };
}

function okResult(name: string): AgentResult {
  return {
    agentName: name,
    success: true,
    messages: [],
    expectedOutputs: [],
    recommendations: [],
    warnings: [],
  };
}

class StubAgent extends BaseAgent {
  readonly agentName: string;
  private readonly runImpl: () => Promise<AgentResult>;
  readonly executionOrder: string[];

  constructor(
    name: string,
    runImpl: () => Promise<AgentResult>,
    executionOrder: string[],
  ) {
    const provider: LLMProvider = {
      name: 'stub',
      chat: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(false),
    };
    super(provider, 'stub prompt', ONLINE_CREDS, new AgentCache());
    this.agentName = name;
    this.runImpl = runImpl;
    this.executionOrder = executionOrder;
  }

  async run(_context: AgentContext): Promise<AgentResult> {
    const result = await this.runImpl();
    this.executionOrder.push(this.agentName);
    return result;
  }

  protected fallback(_context: AgentContext): AgentResult {
    return okResult(this.agentName);
  }
}

describe('AgentRuntime.runBackground()', () => {
  it('returns synchronously before the agent executes', async () => {
    const order: string[] = [];

    const agent = new StubAgent(
      'bg-agent',
      async () => {
        await new Promise((r) => setTimeout(r, 0));
        return okResult('bg-agent');
      },
      order,
    );

    const runtime = new AgentRuntime();
    const context = makeContext();

    // Mark that runBackground returned
    runtime.runBackground(agent, context);
    order.push('main-returned');

    // Let setImmediate fire and the agent's internal setTimeout(0) resolve
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(order[0]).toBe('main-returned');
    expect(order).toContain('bg-agent');
  });

  it('does not throw or hang when the agent throws', async () => {
    const order: string[] = [];

    const agent = new StubAgent(
      'crashing-agent',
      async () => {
        throw new Error('agent exploded');
      },
      order,
    );

    const runtime = new AgentRuntime();

    // Should not throw
    expect(() => runtime.runBackground(agent, makeContext())).not.toThrow();

    // Let setImmediate flush
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    // Execution attempted but threw; order should not include the agent name
    expect(order).not.toContain('crashing-agent');
  });

  it('logs a warning instead of crashing when agent throws', async () => {
    const { logger } = jest.requireMock('../../src/utils/logger') as {
      logger: { warn: jest.Mock };
    };
    logger.warn.mockClear();

    const agent = new StubAgent('err-agent', async () => { throw new Error('boom'); }, []);
    const runtime = new AgentRuntime();
    runtime.runBackground(agent, makeContext());

    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('err-agent'),
    );
  });

  it('runAll background mode returns empty array immediately', async () => {
    const order: string[] = [];
    const agent = new StubAgent('bg2', async () => okResult('bg2'), order);
    const runtime = new AgentRuntime();

    const results = await runtime.runAll([agent], makeContext(), 'background');

    expect(results).toEqual([]);

    // Agent runs after we awaited runAll
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(order).toContain('bg2');
  });

  it('multiple background agents all execute independently', async () => {
    const order: string[] = [];
    const agents = ['a1', 'a2', 'a3'].map(
      (name) => new StubAgent(name, async () => okResult(name), order),
    );
    const runtime = new AgentRuntime();

    for (const agent of agents) {
      runtime.runBackground(agent, makeContext());
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(order).toContain('a1');
    expect(order).toContain('a2');
    expect(order).toContain('a3');
  });
});
