import { execSync } from 'child_process';

export interface GitRemoteInfo {
  owner: string;
  repo: string;
  url: string;
}

/**
 * Detect the Git remote URL for origin.
 * Returns the URL string, or null if not available.
 */
export function detectGitRemoteUrl(): string | null {
  try {
    const out = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Detect the current Git branch.
 * Falls back to 'main' if detection fails.
 */
export function detectCurrentBranch(): string {
  try {
    const out = execSync('git branch --show-current', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return out.length > 0 ? out : 'main';
  } catch {
    return 'main';
  }
}

/**
 * Parse a Git remote URL (SSH or HTTPS) into owner/repo/normalized URL.
 *
 * Supports:
 *  - git@github.com:owner/repo.git
 *  - https://github.com/owner/repo.git
 *  - https://github.com/owner/repo
 *  - ssh://git@github.com/owner/repo.git
 */
export function parseGitRemote(remoteUrl: string): GitRemoteInfo | null {
  const trimmed = remoteUrl.trim();

  // SSH format: git@github.com:owner/repo.git
  const sshMatch = trimmed.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const owner = sshMatch[2]!;
    const repo = sshMatch[3]!;
    return {
      owner,
      repo,
      url: `https://${host}/${owner}/${repo}.git`,
    };
  }

  // SSH protocol: ssh://git@github.com/owner/repo.git
  const sshProtoMatch = trimmed.match(/^ssh:\/\/git@([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshProtoMatch) {
    const host = sshProtoMatch[1];
    const owner = sshProtoMatch[2]!;
    const repo = sshProtoMatch[3]!;
    return {
      owner,
      repo,
      url: `https://${host}/${owner}/${repo}.git`,
    };
  }

  // HTTPS format: https://github.com/owner/repo(.git)?
  const httpsMatch = trimmed.match(/^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    const host = httpsMatch[1];
    const owner = httpsMatch[2]!;
    const repo = httpsMatch[3]!;
    return {
      owner,
      repo,
      url: `https://${host}/${owner}/${repo}.git`,
    };
  }

  return null;
}
