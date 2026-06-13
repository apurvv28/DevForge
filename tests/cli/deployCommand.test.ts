import { deployCommand } from '../../src/cli/deployCommand';
import { AwsDeployExecutor } from '../../src/engine/AwsDeployExecutor';
import * as fs from 'fs/promises';

jest.mock('fs/promises');
jest.mock('../../src/engine/AwsDeployExecutor');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const MOCK_PLAN = {
  target: 'aws_ecs',
  region: 'us-east-1',
  prerequisites: [],
  generatedAt: new Date().toISOString(),
  steps: [
    {
      id: 'step1',
      label: 'Step One',
      command: 'echo 1',
      destructive: false,
      retryable: true,
    },
  ],
};

describe('deployCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs successfully when plan exists and executor succeeds', async () => {
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(MOCK_PLAN));
    const mockExecute = jest.fn().mockResolvedValue({ success: true, executedStepsCount: 1 });
    (AwsDeployExecutor as jest.Mock).mockImplementation(() => ({
      execute: mockExecute,
    }));

    await deployCommand('/project', { dryRun: true });

    expect(fs.readFile).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalled();
  });

  it('throws an error if deploy plan file does not exist', async () => {
    (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

    await expect(deployCommand('/project')).rejects.toThrow('Deploy plan not found');
  });

  it('throws an error if deploy plan is invalid JSON', async () => {
    (fs.readFile as jest.Mock).mockResolvedValue('invalid-json');

    await expect(deployCommand('/project')).rejects.toThrow('Invalid deploy plan format');
  });

  it('handles execution failure from the executor', async () => {
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(MOCK_PLAN));
    const mockExecute = jest.fn().mockResolvedValue({ success: false, executedStepsCount: 0, error: 'Command failed' });
    (AwsDeployExecutor as jest.Mock).mockImplementation(() => ({
      execute: mockExecute,
    }));

    await expect(deployCommand('/project')).rejects.toThrow('Command failed');
  });
});
