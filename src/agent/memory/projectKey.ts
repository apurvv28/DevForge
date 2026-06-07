import { execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';

export function deriveProjectKey(): string {
  try {
    // Try to get git remote URL
    const out = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    if (out) {
      return sha256(out);
    }
  } catch {
    // ignore
  }

  // Fallback to absolute project path
  try {
    const cwd = process.cwd();
    return sha256(path.resolve(cwd));
  } catch {
    return sha256('unknown');
  }
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export default deriveProjectKey;
