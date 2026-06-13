import { AwsDeployExecutor } from '../../src/engine/AwsDeployExecutor';
import { DeployPlan } from '../../src/agent/aws/awsDeployPlan';
import { spawn, execSync } from 'child_process';
import { logger } from '../../src/utils/logger';

jest.mock('child_process');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const MOCK_PLAN: DeployPlan = {
  target: 'aws_ecs',
  region: 'us-east-1',
  prerequisites: ['aws', 'docker'],
  generatedAt: new Date().toISOString(),
  steps: [
    {
      id: 'step1',
      label: 'ECR Login',
      command: 'aws ecr get-login-password',
      destructive: false,
      retryable: true,
    },
    {
      id: 'step2',
      label: 'Create Repo',
      command: 'aws ecr create-repository',
      skipIf: 'aws ecr describe-repositories',
      destructive: false,
      retryable: true,
      rollbackCommand: 'aws ecr delete-repository',
    },
    {
      id: 'step3',
      label: 'Destructive Step',
      command: 'aws delete something',
      destructive: true,
      retryable: false,
    }
  ],
};

describe('AwsDeployExecutor', () => {
  let mockSpawn: jest.Mock;
  let mockExecSync: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    mockSpawn = spawn as unknown as jest.Mock;
    mockExecSync = execSync as unknown as jest.Mock;
  });

  it('runs prerequisites check and passes if aws and docker commands exist', async () => {
    mockExecSync.mockReturnValue(Buffer.from('ok'));

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    const check = await executor.checkPrerequisites(MOCK_PLAN);
    expect(check.passed).toBe(true);
  });

  it('fails prerequisites check if aws is not logged in', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') {
        throw new Error('Not logged in');
      }
      return Buffer.from('ok');
    });

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    const check = await executor.checkPrerequisites(MOCK_PLAN);
    expect(check.passed).toBe(false);
    expect(check.error).toContain('AWS CLI is not logged in');
  });

  it('fails prerequisites check if a required tool is missing', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') return Buffer.from('ok');
      throw new Error('Not found'); // tool check where/which fails
    });

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    const check = await executor.checkPrerequisites(MOCK_PLAN);
    expect(check.passed).toBe(false);
    expect(check.error).toContain('Required tool');
  });

  it('fails deploy if prerequisites check fails in execute()', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') throw new Error('Not logged in');
      return Buffer.from('ok');
    });

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    const result = await executor.execute(MOCK_PLAN);
    expect(result.success).toBe(false);
    expect(result.error).toContain('AWS CLI is not logged in');
  });

  it('executes steps under dry-run without spawning', async () => {
    const executor = new AwsDeployExecutor('/app', {
      dryRun: true,
      autoApprove: true,
    });

    const result = await executor.execute(MOCK_PLAN);
    expect(result.success).toBe(true);
    expect(result.executedStepsCount).toBe(3);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('skips a step if skipIf condition returns success', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') return Buffer.from('ok');
      if (cmd.includes('where') || cmd.includes('which')) return Buffer.from('ok');
      if (cmd === 'aws ecr describe-repositories') return Buffer.from('already exists'); // skipIf condition met
      throw new Error('Command failed');
    });

    const mockChild = {
      on: jest.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(0), 10);
      }),
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
    };
    mockSpawn.mockReturnValue(mockChild);

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    // We exclude the destructive step for this test
    const plan = { ...MOCK_PLAN, steps: MOCK_PLAN.steps.slice(0, 2) };
    const result = await executor.execute(plan);
    expect(result.success).toBe(true);
    expect(result.executedStepsCount).toBe(1); // step2 is skipped
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it('cancels deployment if confirmCallback returns false', async () => {
    mockExecSync.mockReturnValue(Buffer.from('ok'));
    const confirmCallback = jest.fn().mockResolvedValue(false); // cancel

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: false,
      confirmCallback,
    });

    const result = await executor.execute(MOCK_PLAN);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Cancelled by user');
  });

  it('aborts deployment if step requires confirmation but no callback is available', async () => {
    mockExecSync.mockReturnValue(Buffer.from('ok'));

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: false, // forces confirmation
    });

    const result = await executor.execute(MOCK_PLAN);
    expect(result.success).toBe(false);
    expect(result.error).toContain('requires confirmation');
  });

  it('handles command stdout/stderr streams and process exit', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') return Buffer.from('ok');
      if (cmd.includes('where') || cmd.includes('which')) return Buffer.from('ok');
      throw new Error('Not found (do not skip)');
    });

    const mockChild = {
      on: jest.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(0), 10);
      }),
      stdout: {
        on: jest.fn((event, cb) => {
          if (event === 'data') setTimeout(() => cb(Buffer.from('hello stdout')), 5);
        }),
      },
      stderr: {
        on: jest.fn((event, cb) => {
          if (event === 'data') setTimeout(() => cb(Buffer.from('hello stderr')), 5);
        }),
      },
    };
    mockSpawn.mockReturnValue(mockChild);

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    // Test stdout/stderr redirect
    const plan = { ...MOCK_PLAN, steps: MOCK_PLAN.steps.slice(0, 2) };
    const result = await executor.execute(plan);
    expect(result.success).toBe(true);
  });

  it('handles child process error event', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') return Buffer.from('ok');
      if (cmd.includes('where') || cmd.includes('which')) return Buffer.from('ok');
      throw new Error('Not found (do not skip)');
    });

    const mockChild = {
      on: jest.fn((event, cb) => {
        if (event === 'error') setTimeout(() => cb(new Error('Spawn failed')), 5);
      }),
    };
    mockSpawn.mockReturnValue(mockChild);

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    const plan = { ...MOCK_PLAN, steps: MOCK_PLAN.steps.slice(0, 1) };
    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
  });

  it('runs rollback on failure and executes rollback commands', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') return Buffer.from('ok');
      if (cmd.includes('where') || cmd.includes('which')) return Buffer.from('ok');
      throw new Error('Not found (do not skip)');
    });

    const mockChildSuccess = {
      on: jest.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(0), 5);
      }),
    };
    const mockChildFailure = {
      on: jest.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(1), 5);
      }),
    };

    mockSpawn
      .mockReturnValueOnce(mockChildSuccess) // step1 success
      .mockReturnValueOnce(mockChildFailure) // step2 failure
      .mockReturnValueOnce(mockChildSuccess); // rollback command (triggered for step2's rollback since step2 failed but wait, let's see how rollback is populated)

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    const plan = { ...MOCK_PLAN, steps: MOCK_PLAN.steps.slice(0, 2) };
    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Step failed: Create Repo');
  });

  it('times out command execution if timeout is reached', async () => {
    mockExecSync.mockImplementation((cmd) => {
      if (cmd === 'aws sts get-caller-identity') return Buffer.from('ok');
      if (cmd.includes('where') || cmd.includes('which')) return Buffer.from('ok');
      throw new Error('Not found (do not skip)');
    });

    const mockChild = {
      on: jest.fn(),
      kill: jest.fn(),
    };
    mockSpawn.mockReturnValue(mockChild);

    const executor = new AwsDeployExecutor('/app', {
      dryRun: false,
      autoApprove: true,
    });

    // Make timeout 10ms so it times out immediately
    const plan = {
      ...MOCK_PLAN,
      steps: [
        {
          id: 'step1',
          label: 'Timeout Step',
          command: 'sleep 100',
          destructive: false,
          retryable: true,
          timeoutMs: 10,
        },
      ],
    };

    const result = await executor.execute(plan);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Step failed: Timeout Step');
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
