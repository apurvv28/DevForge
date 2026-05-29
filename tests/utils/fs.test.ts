import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DevForgeFS } from '../../src/utils';
import { PathTraversalError, ValidationError } from '../../src/utils/errors';

jest.mock('fs/promises', () => {
  const original = jest.requireActual('fs/promises');
  return {
    __esModule: true,
    ...original,
    rename: jest.fn().mockImplementation((src, dest) => original.rename(src, dest)),
  };
});

let tmpDir: string;
let devFS: DevForgeFS;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-test-'));
  devFS = new DevForgeFS(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── path traversal protection ──────────────────────────────────────────

describe('path traversal protection', () => {
  it('throws PathTraversalError for ../ escape in readFile', async () => {
    await expect(devFS.readFile('../../../etc/passwd')).rejects.toThrow(PathTraversalError);
  });

  it('throws PathTraversalError for ../ escape in writeFile', async () => {
    await expect(devFS.writeFile('../../escape.txt', 'bad')).rejects.toThrow(PathTraversalError);
  });

  it('throws PathTraversalError for ../ escape in fileExists', async () => {
    await expect(devFS.fileExists('../../../etc/passwd')).rejects.toThrow(PathTraversalError);
  });

  it('throws PathTraversalError for ../ escape in ensureDir', async () => {
    await expect(devFS.ensureDir('../../escape-dir')).rejects.toThrow(PathTraversalError);
  });

  it('throws PathTraversalError for ../ escape in listFiles', async () => {
    await expect(devFS.listFiles('../../')).rejects.toThrow(PathTraversalError);
  });
});

// ── readFile ───────────────────────────────────────────────────────────

describe('readFile', () => {
  it('reads a file within the project root', async () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    await fs.writeFile(filePath, 'hello world', 'utf-8');

    const content = await devFS.readFile('hello.txt');
    expect(content).toBe('hello world');
  });

  it('reads a file in a subdirectory', async () => {
    const subDir = path.join(tmpDir, 'sub');
    await fs.mkdir(subDir);
    await fs.writeFile(path.join(subDir, 'nested.txt'), 'nested', 'utf-8');

    const content = await devFS.readFile('sub/nested.txt');
    expect(content).toBe('nested');
  });

  it('throws ValidationError when file exceeds maxBytes', async () => {
    const bigContent = 'x'.repeat(1024);
    const filePath = path.join(tmpDir, 'big.txt');
    await fs.writeFile(filePath, bigContent, 'utf-8');

    await expect(devFS.readFile('big.txt', 100)).rejects.toThrow(ValidationError);
  });

  it('allows reading files within maxBytes', async () => {
    const content = 'small';
    const filePath = path.join(tmpDir, 'small.txt');
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await devFS.readFile('small.txt', 1024);
    expect(result).toBe('small');
  });
});

// ── writeFile (normal mode) ────────────────────────────────────────────

describe('writeFile', () => {
  it('writes a file atomically within project root', async () => {
    await devFS.writeFile('output.txt', 'hello');
    const result = await fs.readFile(path.join(tmpDir, 'output.txt'), 'utf-8');
    expect(result).toBe('hello');
  });

  it('creates parent directories automatically', async () => {
    await devFS.writeFile('deep/nested/dir/file.yml', 'content');
    const result = await fs.readFile(path.join(tmpDir, 'deep/nested/dir/file.yml'), 'utf-8');
    expect(result).toBe('content');
  });

  it('cleans up temp file on write failure', async () => {
    // Make the target directory read-only to force rename to fail
    const dir = path.join(tmpDir, 'readonly');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'target.txt'), 'original', 'utf-8');

    // Create a fs instance with a projectRoot that we'll break
    const brokenFS = new DevForgeFS(tmpDir);

    // Mock fs.rename to simulate failure
    (fs.rename as jest.Mock).mockRejectedValueOnce(new Error('rename failed'));

    await expect(brokenFS.writeFile('readonly/target.txt', 'new content')).rejects.toThrow(
      'rename failed',
    );

    // Verify temp file was cleaned up
    const tmpFilePath = path.join(tmpDir, 'readonly/target.txt.devforge.tmp');
    await expect(fs.access(tmpFilePath)).rejects.toThrow();
  });
});

// ── writeFile (dry-run mode) ───────────────────────────────────────────

describe('writeFile (dry-run)', () => {
  it('does not write to disk when dryRun is true', async () => {
    const dryFS = new DevForgeFS(tmpDir, true);
    await dryFS.writeFile('dryrun.txt', 'should not exist');

    const exists = await fs
      .access(path.join(tmpDir, 'dryrun.txt'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

// ── fileExists ─────────────────────────────────────────────────────────

describe('fileExists', () => {
  it('returns true for an existing file', async () => {
    await fs.writeFile(path.join(tmpDir, 'exists.txt'), 'yes', 'utf-8');
    await expect(devFS.fileExists('exists.txt')).resolves.toBe(true);
  });

  it('returns false for a non-existing file', async () => {
    await expect(devFS.fileExists('no-such-file.txt')).resolves.toBe(false);
  });
});

// ── ensureDir ──────────────────────────────────────────────────────────

describe('ensureDir', () => {
  it('creates nested directories', async () => {
    await devFS.ensureDir('a/b/c');
    const stat = await fs.stat(path.join(tmpDir, 'a/b/c'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('does not create directories in dry-run mode', async () => {
    const dryFS = new DevForgeFS(tmpDir, true);
    await dryFS.ensureDir('should-not-exist');

    const exists = await fs
      .access(path.join(tmpDir, 'should-not-exist'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});

// ── listFiles ──────────────────────────────────────────────────────────

describe('listFiles', () => {
  it('lists files in a flat directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
    await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b');

    const files = await devFS.listFiles('.');
    expect(files.sort()).toEqual(expect.arrayContaining(['a.txt', 'b.txt']));
  });

  it('lists files recursively up to depth 3', async () => {
    // depth 0 → tmpDir
    // depth 1 → d1
    // depth 2 → d1/d2
    // depth 3 → d1/d2/d3 (should NOT list files inside d3)
    await fs.mkdir(path.join(tmpDir, 'sub', 'd1', 'd2', 'd3'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'sub', 'level1.txt'), 'l1');
    await fs.writeFile(path.join(tmpDir, 'sub', 'd1', 'level2.txt'), 'l2');
    await fs.writeFile(path.join(tmpDir, 'sub', 'd1', 'd2', 'level3.txt'), 'l3');
    await fs.writeFile(path.join(tmpDir, 'sub', 'd1', 'd2', 'd3', 'level4.txt'), 'l4');

    const files = await devFS.listFiles('sub');

    expect(files).toContain('level1.txt');
    expect(files).toContain(path.join('d1', 'level2.txt'));
    expect(files).toContain(path.join('d1', 'd2', 'level3.txt'));
    // depth 3 file should NOT be listed (walkDir stops at depth >= 3)
    expect(files).not.toContain(path.join('d1', 'd2', 'd3', 'level4.txt'));
  });

  it('returns empty array for non-existent directory', async () => {
    const files = await devFS.listFiles('no-such-dir');
    expect(files).toEqual([]);
  });
});
