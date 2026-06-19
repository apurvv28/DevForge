import { jenkinsSetupCommand } from '../../src/cli/jenkinsCommand';
import inquirer from 'inquirer';
import { detectGitRemoteUrl, detectCurrentBranch, parseGitRemote } from '../../src/utils/git';
import { JenkinsClient } from '../../src/utils/jenkinsClient';

jest.mock('inquirer');
jest.mock('../../src/utils/git');
jest.mock('../../src/utils/jenkinsClient');
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('jenkinsCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('performs setup successfully for a new job', async () => {
    // 1. Mock git utils
    (detectGitRemoteUrl as jest.Mock).mockReturnValue('git@github.com:owner/repo.git');
    (parseGitRemote as jest.Mock).mockReturnValue({
      owner: 'owner',
      repo: 'repo',
      url: 'https://github.com/owner/repo.git',
    });
    (detectCurrentBranch as jest.Mock).mockReturnValue('main');

    // 2. Mock inquirer prompting for URL, user, token
    (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({
      url: 'http://localhost:8080',
      user: 'admin',
      token: 'my-token',
    });

    // 3. Mock JenkinsClient instance and methods
    const mockGetCrumb = jest.fn().mockResolvedValue('crumb-token');
    const mockJobExists = jest.fn().mockResolvedValue(false);
    const mockCreateJob = jest.fn().mockResolvedValue(true);
    const mockTriggerBuild = jest.fn().mockResolvedValue(true);

    (JenkinsClient as jest.Mock).mockImplementation(() => ({
      getCrumb: mockGetCrumb,
      jobExists: mockJobExists,
      createJob: mockCreateJob,
      triggerBuild: mockTriggerBuild,
    }));

    // Mock fetch for webhook
    mockFetch.mockResolvedValue({
      status: 201,
      text: jest.fn().mockResolvedValue(''),
    });

    process.env.GITHUB_TOKEN = 'mock-github-token';

    await jenkinsSetupCommand('/project', {
      jenkinsUrl: 'http://localhost:8080',
      jenkinsUser: 'admin',
      jenkinsToken: 'my-token',
    });

    expect(mockGetCrumb).toHaveBeenCalled();
    expect(mockJobExists).toHaveBeenCalledWith('repo');
    expect(mockCreateJob).toHaveBeenCalledWith('repo', expect.any(String));
    expect(mockTriggerBuild).toHaveBeenCalledWith('repo');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('performs setup successfully for an existing job with overwrite', async () => {
    (detectGitRemoteUrl as jest.Mock).mockReturnValue('git@github.com:owner/repo.git');
    (parseGitRemote as jest.Mock).mockReturnValue({
      owner: 'owner',
      repo: 'repo',
      url: 'https://github.com/owner/repo.git',
    });
    (detectCurrentBranch as jest.Mock).mockReturnValue('main');

    const mockGetCrumb = jest.fn().mockResolvedValue(null);
    const mockJobExists = jest.fn().mockResolvedValue(true);
    const mockUpdateJob = jest.fn().mockResolvedValue(true);
    const mockTriggerBuild = jest.fn().mockResolvedValue(true);

    (JenkinsClient as jest.Mock).mockImplementation(() => ({
      getCrumb: mockGetCrumb,
      jobExists: mockJobExists,
      updateJob: mockUpdateJob,
      triggerBuild: mockTriggerBuild,
    }));

    await jenkinsSetupCommand('/project', {
      jenkinsUrl: 'http://localhost:8080',
      jenkinsUser: 'admin',
      jenkinsToken: 'my-token',
      overwrite: true,
    });

    expect(mockJobExists).toHaveBeenCalledWith('repo');
    expect(mockUpdateJob).toHaveBeenCalledWith('repo', expect.any(String));
    expect(mockTriggerBuild).toHaveBeenCalledWith('repo');
  });

  it('fails gracefully when git remote is not detected', async () => {
    (detectGitRemoteUrl as jest.Mock).mockReturnValue(null);

    await jenkinsSetupCommand('/project', {
      jenkinsUrl: 'http://localhost:8080',
      jenkinsUser: 'admin',
      jenkinsToken: 'my-token',
    });

    expect(process.exitCode).toBe(1);
  });
});
