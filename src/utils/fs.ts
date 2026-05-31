/* eslint-disable security/detect-non-literal-fs-filename */
import * as fs from 'fs/promises';
import * as path from 'path';
import { PathTraversalError, ValidationError } from './errors';
import { logger } from './logger';

const DEFAULT_MAX_BYTES = 512 * 1024; // 512 KB
const MAX_LIST_DEPTH = 3;

/**
 * DevForgeFS — a centralized, security-hardened file system abstraction.
 *
 * All file I/O in DevForge flows through this class to enforce:
 *  - Path traversal protection on every operation
 *  - File size limits on reads
 *  - Atomic writes via temp-file-then-rename
 *  - Dry-run mode that logs but never touches disk
 */
export class DevForgeFS {
  public readonly projectRoot: string;
  public readonly dryRun: boolean;

  constructor(projectRoot: string, dryRun = false) {
    this.projectRoot = path.resolve(projectRoot);
    this.dryRun = dryRun;
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Resolves `relativePath` against projectRoot and ensures it doesn't
   * escape the sandbox.  Returns the resolved absolute path.
   */
  private resolveSafe(relativePath: string): string {
    const resolved = path.resolve(this.projectRoot, relativePath);
    const relative = path.relative(this.projectRoot, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new PathTraversalError(
        `Path traversal detected: "${relativePath}" resolves outside project root`,
      );
    }
    return resolved;
  }

  // ── public API ───────────────────────────────────────────────────────

  /**
   * Read a file within the project root.
   *
   * @param relativePath — path relative to projectRoot
   * @param maxBytes     — maximum allowed file size (default 512 KB)
   * @returns UTF-8 string content
   */
  async readFile(relativePath: string, maxBytes: number = DEFAULT_MAX_BYTES): Promise<string> {
    const resolved = this.resolveSafe(relativePath);

    const stat = await fs.stat(resolved);
    if (stat.size > maxBytes) {
      throw new ValidationError(
        `File "${relativePath}" is ${stat.size} bytes, exceeding the ${maxBytes}-byte limit`,
      );
    }

    return fs.readFile(resolved, 'utf-8');
  }

  /**
   * Atomically write a file within the project root.
   *
   * In dry-run mode the write is logged but not executed.
   * Otherwise we write to a `.devforge.tmp` sidecar first, then rename
   * to the final path so that a crash mid-write never leaves a
   * half-written file.
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    const resolved = this.resolveSafe(relativePath);

    if (this.dryRun) {
      logger.info(`[dry-run] Would write ${content.length} bytes to ${relativePath}`);
      return;
    }

    // Ensure the parent directory exists
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${resolved}.devforge.tmp`;
    try {
      await fs.writeFile(tmpPath, content, 'utf-8');
      await fs.rename(tmpPath, resolved);
    } catch (err) {
      // Best-effort cleanup of the temp file
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * Check whether a file (or directory) exists within the project root.
   */
  async fileExists(relativePath: string): Promise<boolean> {
    const resolved = this.resolveSafe(relativePath);
    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove a file within the project root.
   * In dry-run mode the removal is logged but not executed.
   */
  async removeFile(relativePath: string): Promise<void> {
    const resolved = this.resolveSafe(relativePath);

    if (this.dryRun) {
      logger.info(`[dry-run] Would remove ${relativePath}`);
      return;
    }

    try {
      await fs.unlink(resolved);
    } catch (err) {
      // If the file doesn't exist it's fine; otherwise rethrow
      try {
        const stat = await fs.stat(resolved);
        if (stat.isFile()) throw err;
      } catch {
        // file not found — ignore
      }
    }
  }

  /**
   * Create a directory (and all parents) within the project root.
   * In dry-run mode the creation is logged but not executed.
   */
  async ensureDir(relativePath: string): Promise<void> {
    const resolved = this.resolveSafe(relativePath);

    if (this.dryRun) {
      logger.info(`[dry-run] Would create directory ${relativePath}`);
      return;
    }

    await fs.mkdir(resolved, { recursive: true });
  }

  /**
   * List files recursively within the given directory, up to a maximum
   * depth of 3 levels.  Returns paths relative to the listed directory.
   */
  async listFiles(relativePath: string): Promise<string[]> {
    const resolved = this.resolveSafe(relativePath);
    const results: string[] = [];
    await this.walkDir(resolved, resolved, 0, results);
    return results;
  }

  // ── private helpers ──────────────────────────────────────────────────

  private async walkDir(
    base: string,
    current: string,
    depth: number,
    results: string[],
  ): Promise<void> {
    if (depth >= MAX_LIST_DEPTH) return;

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return; // directory may not exist or not readable
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const rel = path.relative(base, fullPath);
      if (entry.isDirectory()) {
        await this.walkDir(base, fullPath, depth + 1, results);
      } else {
        results.push(rel);
      }
    }
  }
}
