import { execSync } from 'child_process';
import { parseGitRemote, detectGitRemoteUrl, detectCurrentBranch } from '../../src/utils/git';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('git utils', () => {
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('parseGitRemote', () => {
    it('parses standard SSH format', () => {
      const result = parseGitRemote('git@github.com:apurvv28/DevForge.git');
      expect(result).toEqual({
        owner: 'apurvv28',
        repo: 'DevForge',
        url: 'https://github.com/apurvv28/DevForge.git',
      });
    });

    it('parses standard SSH format without .git suffix', () => {
      const result = parseGitRemote('git@github.com:apurvv28/DevForge');
      expect(result).toEqual({
        owner: 'apurvv28',
        repo: 'DevForge',
        url: 'https://github.com/apurvv28/DevForge.git',
      });
    });

    it('parses SSH protocol format', () => {
      const result = parseGitRemote('ssh://git@github.com/owner/repo.git');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        url: 'https://github.com/owner/repo.git',
      });
    });

    it('parses HTTPS format', () => {
      const result = parseGitRemote('https://github.com/owner/repo.git');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        url: 'https://github.com/owner/repo.git',
      });
    });

    it('parses HTTPS format without .git suffix', () => {
      const result = parseGitRemote('https://github.com/owner/repo');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        url: 'https://github.com/owner/repo.git',
      });
    });

    it('returns null for invalid/unsupported formats', () => {
      expect(parseGitRemote('not-a-valid-url')).toBeNull();
      expect(parseGitRemote('')).toBeNull();
    });
  });

  describe('detectGitRemoteUrl', () => {
    it('returns the URL when execSync succeeds', () => {
      mockExecSync.mockReturnValue('git@github.com:owner/repo.git\n' as any);
      const result = detectGitRemoteUrl();
      expect(result).toBe('git@github.com:owner/repo.git');
      expect(mockExecSync).toHaveBeenCalledWith('git remote get-url origin', expect.any(Object));
    });

    it('returns null when execSync throws', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('git command failed');
      });
      const result = detectGitRemoteUrl();
      expect(result).toBeNull();
    });
  });

  describe('detectCurrentBranch', () => {
    it('returns current branch name when execSync succeeds', () => {
      mockExecSync.mockReturnValue('feature-branch\n' as any);
      const result = detectCurrentBranch();
      expect(result).toBe('feature-branch');
      expect(mockExecSync).toHaveBeenCalledWith('git branch --show-current', expect.any(Object));
    });

    it('returns main when execSync throws', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('git command failed');
      });
      const result = detectCurrentBranch();
      expect(result).toBe('main');
    });

    it('returns main when output is empty', () => {
      mockExecSync.mockReturnValue('\n' as any);
      const result = detectCurrentBranch();
      expect(result).toBe('main');
    });
  });
});
