import { IaCExecutor } from '../../src/engine/IaCExecutor';
import { IaCDetectionResult, DeploymentTarget } from '../../src/types';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';

jest.mock('child_process');
jest.mock('fs/promises', () => ({
  access: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createMockChild(exitCode: number) {
  return {
    on: jest.fn((event, cb) => {
      if (event === 'close') {
        setTimeout(() => cb(exitCode), 5);
      }
    }),
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
  };
}

describe('IaCExecutor', () => {
  let mockSpawn: jest.Mock;
  let mockAccess: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawn = spawn as unknown as jest.Mock;
    mockAccess = fs.access as unknown as jest.Mock;
    mockAccess.mockResolvedValue(undefined); // default: file exists
  });

  it('returns failure if no tool is detected', async () => {
    const executor = new IaCExecutor('/app', false);
    const detection: IaCDetectionResult = {
      detected: false,
      tool: null,
      entryPoints: [],
      isDeployReady: false,
      configDir: null,
    };

    const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
    expect(res.success).toBe(false);
    expect(res.output).toContain('No IaC tool detected');
  });

  it('returns failure for unsupported tools', async () => {
    const executor = new IaCExecutor('/app', false);
    const detection: IaCDetectionResult = {
      detected: true,
      tool: 'pulumi' as any, // force unsupported through check
      entryPoints: [],
      isDeployReady: false,
      configDir: null,
    };
    // Override tool choice to trigger default case
    (detection as any).tool = 'unsupported_tool';

    const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
    expect(res.success).toBe(false);
    expect(res.output).toContain('Unsupported IaC tool');
  });

  describe('terraform', () => {
    const detection: IaCDetectionResult = {
      detected: true,
      tool: 'terraform',
      entryPoints: ['main.tf'],
      isDeployReady: true,
      configDir: '.',
    };

    it('runs dry-run for terraform when .terraform exists', async () => {
      const executor = new IaCExecutor('/app', true);
      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
      expect(res.dryRun).toBe(true);
      expect(res.output).toContain('[dry-run] Would execute: terraform plan');
    });

    it('runs dry-run for terraform when .terraform does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT')); // .terraform does not exist
      const executor = new IaCExecutor('/app', true);
      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
    });

    it('executes terraform successfully when .terraform does not exist', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT')); // triggers init
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(0));

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(3); // init, plan, apply
    });

    it('fails if terraform init fails', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(1)); // init fails

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(false);
    });

    it('fails if terraform plan fails', async () => {
      mockAccess.mockResolvedValue(undefined); // .terraform exists, skips init
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(1)); // plan fails

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(false);
    });
  });

  describe('cdk', () => {
    const detection: IaCDetectionResult = {
      detected: true,
      tool: 'cdk',
      entryPoints: ['bin/app.ts'],
      isDeployReady: true,
      configDir: '.',
    };

    it('runs dry-run for CDK', async () => {
      const executor = new IaCExecutor('/app', true);
      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
      expect(res.output).toContain('cdk deploy');
    });

    it('executes cdk successfully', async () => {
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(0));

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
    });

    it('fails if cdk diff fails', async () => {
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(1)); // diff fails

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(false);
    });
  });

  describe('boto3', () => {
    const detection: IaCDetectionResult = {
      detected: true,
      tool: 'boto3',
      entryPoints: ['scripts/deploy.py'],
      isDeployReady: true,
      configDir: '.',
    };

    it('runs dry-run for boto3', async () => {
      const executor = new IaCExecutor('/app', true);
      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
    });

    it('executes boto3 successfully', async () => {
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(0));

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
    });

    it('falls back to execution without --dry-run if dry-run command exits non-zero', async () => {
      const executor = new IaCExecutor('/app', false);
      mockSpawn
        .mockReturnValueOnce(createMockChild(1)) // dry run fails
        .mockReturnValueOnce(createMockChild(0)); // non-dry run succeeds

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });
  });

  describe('pulumi', () => {
    const detection: IaCDetectionResult = {
      detected: true,
      tool: 'pulumi',
      entryPoints: ['Pulumi.yaml'],
      isDeployReady: true,
      configDir: '.',
    };

    it('runs dry-run for pulumi', async () => {
      const executor = new IaCExecutor('/app', true);
      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
    });

    it('executes pulumi successfully', async () => {
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(0));

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(true);
    });

    it('fails if pulumi preview fails', async () => {
      const executor = new IaCExecutor('/app', false);
      mockSpawn.mockImplementation(() => createMockChild(1));

      const res = await executor.execute(detection, DeploymentTarget.AWS_ECS);
      expect(res.success).toBe(false);
    });
  });
});
