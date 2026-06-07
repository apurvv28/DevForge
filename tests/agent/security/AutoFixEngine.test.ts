import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import { load } from 'js-yaml';
import { applyAutoFixes, FixResult } from '../../../src/agent/security/AutoFixEngine';
import { ComplianceViolation } from '../../../src/agent/security/StaticSecurityScanner';
import { DevForgeFS } from '../../../src/utils/fs';

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── helpers ───────────────────────────────────────────────────────────

async function writeFile(dir: string, name: string, content: string): Promise<void> {
  await fsp.writeFile(path.join(dir, name), content, 'utf-8');
}

async function readFile(dir: string, name: string): Promise<string> {
  return fsp.readFile(path.join(dir, name), 'utf-8');
}

async function exists(dir: string, name: string): Promise<boolean> {
  try {
    await fsp.access(path.join(dir, name));
    return true;
  } catch {
    return false;
  }
}

function makeViolation(
  overrides: Partial<ComplianceViolation> &
    Pick<ComplianceViolation, 'controlId' | 'title' | 'affectedFile'>,
): ComplianceViolation {
  return {
    standard: 'NIST',
    description: 'test description',
    severity: 'high',
    remediation: 'fix it',
    ...overrides,
  };
}

/** Run fixes on a single violation and return the single result. */
async function fixOne(v: ComplianceViolation, fs: DevForgeFS): Promise<FixResult> {
  const results = await applyAutoFixes([v], fs);
  if (!results[0]) throw new Error('Expected one FixResult');
  return results[0];
}

// ── fixtures ──────────────────────────────────────────────────────────

const WORKFLOW_NO_PERMS = `\
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;

const WORKFLOW_WRITE_ALL = `\
name: CI
on: [push]
permissions: write-all
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;

const WORKFLOW_WITH_PERMS = `\
name: CI
on: [push]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;

const DOCKERFILE_LATEST = 'FROM node:latest\nRUN npm install\n';
const DOCKERFILE_VERSIONED = 'FROM node:20-alpine\nRUN npm install\n';

// ── tests ─────────────────────────────────────────────────────────────

describe('applyAutoFixes()', () => {
  let tmpDir: string;
  let fs: DevForgeFS;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'devforge-afe-'));
    fs = new DevForgeFS(tmpDir);
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  // ── NIST-AC-6: missing permissions ───────────────────────────────

  describe('NIST-AC-6 — missing permissions block', () => {
    const makeV = (file = 'ci.yml') =>
      makeViolation({
        controlId: 'NIST-AC-6',
        title: 'Missing permissions block (Least Privilege)',
        affectedFile: file,
      });

    it('adds permissions: contents: read to the workflow', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      const result = await fixOne(makeV(), fs);

      expect(result.applied).toBe(true);
      const doc = load(await readFile(tmpDir, 'ci.yml')) as Record<string, unknown>;
      expect(doc['permissions']).toEqual({ contents: 'read' });
    });

    it('creates a .bak file containing the original content', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      await fixOne(makeV(), fs);

      expect(await exists(tmpDir, 'ci.yml.bak')).toBe(true);
      expect(await readFile(tmpDir, 'ci.yml.bak')).toBe(WORKFLOW_NO_PERMS);
    });

    it('produces valid YAML after patching', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      await fixOne(makeV(), fs);

      const patchedYaml = await readFile(tmpDir, 'ci.yml');
      expect(() => load(patchedYaml)).not.toThrow();
    });

    it('does not remove an existing permissions block', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_WITH_PERMS);
      await fixOne(makeV(), fs);

      const doc = load(await readFile(tmpDir, 'ci.yml')) as Record<string, unknown>;
      expect(doc['permissions']).toBeDefined();
    });

    it('returns applied:false when the file does not exist', async () => {
      const result = await fixOne(makeV('nonexistent.yml'), fs);
      expect(result.applied).toBe(false);
      expect(result.description).toContain('could not read');
    });
  });

  // ── NIST-AC-6: write-all ─────────────────────────────────────────

  describe('NIST-AC-6 — write-all permissions', () => {
    const makeV = (file = 'ci.yml') =>
      makeViolation({
        controlId: 'NIST-AC-6',
        title: 'Write-all permissions (Least Privilege)',
        affectedFile: file,
      });

    it('replaces write-all with contents: read', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_WRITE_ALL);
      const result = await fixOne(makeV(), fs);

      expect(result.applied).toBe(true);
      const doc = load(await readFile(tmpDir, 'ci.yml')) as Record<string, unknown>;
      expect(doc['permissions']).toEqual({ contents: 'read' });
    });

    it('creates a .bak file before patching', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_WRITE_ALL);
      await fixOne(makeV(), fs);

      expect(await exists(tmpDir, 'ci.yml.bak')).toBe(true);
    });

    it('produces valid YAML after patching', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_WRITE_ALL);
      await fixOne(makeV(), fs);

      const patchedWA = await readFile(tmpDir, 'ci.yml');
      expect(() => load(patchedWA)).not.toThrow();
    });
  });

  // ── NIST-CM-6: :latest tag ───────────────────────────────────────

  describe('NIST-CM-6 — :latest docker tag', () => {
    const makeV = (file = 'Dockerfile') =>
      makeViolation({
        controlId: 'NIST-CM-6',
        title: 'Docker image using :latest tag',
        affectedFile: file,
        standard: 'NIST',
      });

    it('replaces :latest with :stable', async () => {
      await writeFile(tmpDir, 'Dockerfile', DOCKERFILE_LATEST);
      const result = await fixOne(makeV(), fs);

      expect(result.applied).toBe(true);
      const patched = await readFile(tmpDir, 'Dockerfile');
      expect(patched).toContain(':stable');
      expect(patched).not.toContain(':latest');
    });

    it('creates a .bak file containing the original content', async () => {
      await writeFile(tmpDir, 'Dockerfile', DOCKERFILE_LATEST);
      await fixOne(makeV(), fs);

      expect(await exists(tmpDir, 'Dockerfile.bak')).toBe(true);
      expect(await readFile(tmpDir, 'Dockerfile.bak')).toBe(DOCKERFILE_LATEST);
    });

    it('replaces all :latest occurrences', async () => {
      await writeFile(tmpDir, 'Dockerfile', 'FROM node:latest\nFROM python:latest\n');
      await fixOne(makeV(), fs);

      const patched = await readFile(tmpDir, 'Dockerfile');
      expect(patched).not.toContain(':latest');
      expect(patched.match(/:stable/g)).toHaveLength(2);
    });

    it('returns applied:false when file has no :latest tag', async () => {
      await writeFile(tmpDir, 'Dockerfile', DOCKERFILE_VERSIONED);
      const result = await fixOne(makeV(), fs);
      expect(result.applied).toBe(false);
    });

    it('returns applied:false when the file does not exist', async () => {
      const result = await fixOne(makeV(), fs);
      expect(result.applied).toBe(false);
      expect(result.description).toContain('could not read');
    });
  });

  // ── NIST-SI-2: manual only ───────────────────────────────────────

  describe('NIST-SI-2 — unpinned actions (manual only)', () => {
    it('returns applied:false without touching the file', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      const v = makeViolation({
        controlId: 'NIST-SI-2',
        title: 'Unpinned action (Integrity)',
        affectedFile: 'ci.yml',
      });

      const result = await fixOne(v, fs);

      expect(result.applied).toBe(false);
      expect(result.description).toContain('manual action required');
      expect(await readFile(tmpDir, 'ci.yml')).toBe(WORKFLOW_NO_PERMS);
      expect(await exists(tmpDir, 'ci.yml.bak')).toBe(false);
    });
  });

  // ── ISO controls: manual only ────────────────────────────────────

  describe('ISO-A.9.4 — plaintext secret (manual only)', () => {
    it('returns applied:false', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      const v = makeViolation({
        controlId: 'ISO-A.9.4',
        title: 'Plaintext secret',
        affectedFile: 'ci.yml',
        standard: 'ISO27001',
      });

      const result = await fixOne(v, fs);
      expect(result.applied).toBe(false);
    });
  });

  // ── Unknown control ──────────────────────────────────────────────

  describe('unknown control ID', () => {
    it('returns applied:false with descriptive message', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      const v = makeViolation({
        controlId: 'UNKNOWN-X-1',
        title: 'Some unknown rule',
        affectedFile: 'ci.yml',
      });

      const result = await fixOne(v, fs);
      expect(result.applied).toBe(false);
      expect(result.description).toContain('no fix available');
    });
  });

  // ── Mixed batch ──────────────────────────────────────────────────

  describe('mixed violations batch', () => {
    it('applies fixable violations and skips manual-only ones independently', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      await writeFile(tmpDir, 'Dockerfile', DOCKERFILE_LATEST);

      const violations: ComplianceViolation[] = [
        makeViolation({ controlId: 'NIST-AC-6', title: 'Missing permissions block (Least Privilege)', affectedFile: 'ci.yml' }),
        makeViolation({ controlId: 'NIST-SI-2', title: 'Unpinned action (Integrity)', affectedFile: 'ci.yml' }),
        makeViolation({ controlId: 'NIST-CM-6', title: 'Docker image using :latest tag', affectedFile: 'Dockerfile', standard: 'NIST' }),
      ];

      const results = await applyAutoFixes(violations, fs);
      const applied = results.filter((r) => r.applied);
      const skipped = results.filter((r) => !r.applied);

      expect(applied).toHaveLength(2);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]?.violation.controlId).toBe('NIST-SI-2');
    });
  });

  // ── Summary logging ──────────────────────────────────────────────

  describe('summary output', () => {
    it('logs success count for a single applied fix', async () => {
      const { logger } = jest.requireMock('../../../src/utils/logger') as {
        logger: { success: jest.Mock; warn: jest.Mock };
      };
      logger.success.mockClear();

      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      await fixOne(
        makeViolation({ controlId: 'NIST-AC-6', title: 'Missing permissions block (Least Privilege)', affectedFile: 'ci.yml' }),
        fs,
      );

      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('Applied 1 automatic fix'));
    });

    it('logs plural "fixes" when more than one applied', async () => {
      const { logger } = jest.requireMock('../../../src/utils/logger') as {
        logger: { success: jest.Mock };
      };
      logger.success.mockClear();

      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      await writeFile(tmpDir, 'Dockerfile', DOCKERFILE_LATEST);

      await applyAutoFixes(
        [
          makeViolation({ controlId: 'NIST-AC-6', title: 'Missing permissions block (Least Privilege)', affectedFile: 'ci.yml' }),
          makeViolation({ controlId: 'NIST-CM-6', title: 'Docker image using :latest tag', affectedFile: 'Dockerfile', standard: 'NIST' }),
        ],
        fs,
      );

      expect(logger.success).toHaveBeenCalledWith(expect.stringContaining('Applied 2 automatic fixes'));
    });

    it('logs warn with control ID for each skipped violation', async () => {
      const { logger } = jest.requireMock('../../../src/utils/logger') as {
        logger: { warn: jest.Mock };
      };
      logger.warn.mockClear();

      await fixOne(
        makeViolation({ controlId: 'NIST-SI-2', title: 'Unpinned action (Integrity)', affectedFile: 'ci.yml' }),
        fs,
      );

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('NIST-SI-2'));
    });

    it('returns empty array for empty violations list', async () => {
      const results = await applyAutoFixes([], fs);
      expect(results).toEqual([]);
    });
  });

  // ── FixResult shape ──────────────────────────────────────────────

  describe('FixResult shape', () => {
    it('each result contains violation, applied, and description fields', async () => {
      await writeFile(tmpDir, 'ci.yml', WORKFLOW_NO_PERMS);
      const result = await fixOne(
        makeViolation({ controlId: 'NIST-AC-6', title: 'Missing permissions block (Least Privilege)', affectedFile: 'ci.yml' }),
        fs,
      );

      expect(result).toMatchObject({
        violation: expect.objectContaining({ controlId: 'NIST-AC-6' }),
        applied: expect.any(Boolean),
        description: expect.any(String),
      });
    });
  });
});
