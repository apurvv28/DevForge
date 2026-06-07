import { execFile } from 'child_process';
import { sanitizeString } from '../../utils/sanitizer';
import { logger } from '../../utils/logger';
import { TrivyScanResult } from './trivyTypes';

const MAX_STDOUT_BYTES = 10 * 1024 * 1024; // 10 MB

async function runTrivy(args: string[], timeoutMs: number): Promise<TrivyScanResult> {
  return new Promise((resolve, reject) => {
    execFile('trivy', args, { timeout: timeoutMs, maxBuffer: MAX_STDOUT_BYTES }, (err, stdout) => {
      if (err) return reject(err);
      resolve(JSON.parse(stdout) as TrivyScanResult);
    });
  });
}

export class TrivyRunner {
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        execFile('trivy', ['--version'], { timeout: 5000 }, (err) => resolve(!err));
      } catch {
        resolve(false);
      }
    });
  }

  async scanImage(imageName: string): Promise<TrivyScanResult> {
    const safe = sanitizeString(imageName, 256);
    logger.info(`[trivy] Scanning image: ${safe}`);
    return runTrivy(['image', '--format', 'json', '--exit-code', '0', '--quiet', safe], 120_000);
  }

  async scanFilesystem(projectRoot: string): Promise<TrivyScanResult> {
    const safe = sanitizeString(projectRoot, 512);
    logger.info(`[trivy] Scanning filesystem: ${safe}`);
    return runTrivy(
      ['fs', '--format', 'json', '--exit-code', '0', '--quiet', '--scanners', 'vuln,secret', safe],
      60_000,
    );
  }

  async scanConfig(workflowDir: string): Promise<TrivyScanResult> {
    const safe = sanitizeString(workflowDir, 512);
    logger.info(`[trivy] Scanning config: ${safe}`);
    return runTrivy(['config', '--format', 'json', '--exit-code', '0', '--quiet', safe], 30_000);
  }
}
