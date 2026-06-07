import os from 'os';
import path from 'path';
import { promises as fsp } from 'fs';
import { generateComplianceReport } from '../../../src/agent/security/ComplianceReportGenerator';
import { ComplianceViolation } from '../../../src/agent/security/StaticSecurityScanner';
import { DevForgeFS } from '../../../src/utils/fs';
import {
  BranchStrategy,
  DeploymentTarget,
  DevForgeConfig,
  Framework,
  PackageManager,
} from '../../../src/types';

jest.mock('../../../src/utils/logger', () => ({
  logger: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeConfig(overrides: Partial<DevForgeConfig> = {}): DevForgeConfig {
  return {
    projectRoot: '/tmp/project',
    detected: {
      framework: Framework.NEXTJS,
      packageManager: PackageManager.NPM,
      nodeVersion: '20',
      hasDocker: false,
      hasTests: true,
      hasLinting: true,
      testCommand: 'npm test',
      buildCommand: 'npm run build',
      installCommand: 'npm ci',
      detectedAt: new Date().toISOString(),
    },
    user: {
      deploymentTarget: DeploymentTarget.VERCEL,
      branchStrategy: BranchStrategy.FEATURE_MAIN,
      dockerRequired: false,
      multiEnvironment: false,
      environments: [],
    },
    dryRun: false,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '2.0.0',
    ...overrides,
  };
}

const CRITICAL_VIOLATION: ComplianceViolation = {
  controlId: 'NIST-AC-6',
  standard: 'NIST',
  title: 'Missing permissions block (Least Privilege)',
  description: 'No permissions block found.',
  affectedFile: 'ci.yml',
  severity: 'critical',
  remediation: 'Add `permissions: contents: read` to your workflow.',
};

const HIGH_VIOLATION: ComplianceViolation = {
  controlId: 'NIST-SI-2',
  standard: 'NIST',
  title: 'Unpinned action (Integrity)',
  description: 'Action uses @main branch.',
  affectedFile: 'deploy.yml',
  severity: 'high',
  remediation: 'Pin action to a SHA.',
};

const MEDIUM_VIOLATION: ComplianceViolation = {
  controlId: 'NIST-CM-6',
  standard: 'NIST',
  title: 'Docker image using :latest tag',
  description: ':latest tag used.',
  affectedFile: 'deploy.yml',
  severity: 'medium',
  remediation: 'Pin Docker image to a specific version.',
};

const ISO_VIOLATION: ComplianceViolation = {
  controlId: 'ISO-A.9.4',
  standard: 'ISO27001',
  title: 'Plaintext secret',
  description: 'token= found in env.',
  affectedFile: 'ci.yml',
  severity: 'critical',
  remediation: 'Use ${{ secrets.* }} references.',
};

async function readReport(dir: string): Promise<string> {
  return fsp.readFile(path.join(dir, 'COMPLIANCE_REPORT.md'), 'utf-8');
}

async function listDir(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir);
  return entries;
}

describe('generateComplianceReport()', () => {
  let tmpDir: string;
  let fs: DevForgeFS;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'devforge-cg-'));
    fs = new DevForgeFS(tmpDir);
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes COMPLIANCE_REPORT.md to the project root', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('# DevForge Security & Compliance Report');
  });

  it('includes project metadata in the report header', async () => {
    await generateComplianceReport([], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('**Project:** nextjs → vercel');
    expect(report).toContain('**Risk Score:**');
    expect(report).toContain('**Generated:**');
  });

  it('includes executive summary table with correct counts', async () => {
    const violations = [CRITICAL_VIOLATION, HIGH_VIOLATION, MEDIUM_VIOLATION];
    await generateComplianceReport(violations, makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('| Critical | 1 |');
    expect(report).toContain('| High     | 1');
    expect(report).toContain('| Medium   | 1');
    expect(report).toContain('| Low      | 0');
  });

  it('sorts violations critical-first in the Violations section', async () => {
    await generateComplianceReport([MEDIUM_VIOLATION, CRITICAL_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    const critPos = report.indexOf('[CRITICAL]');
    const medPos = report.indexOf('[MEDIUM]');
    expect(critPos).toBeLessThan(medPos);
  });

  it('includes controlId, title, file, description, and remediation per violation', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('NIST-AC-6');
    expect(report).toContain('Missing permissions block');
    expect(report).toContain('**File:** ci.yml');
    expect(report).toContain('**Standard:** NIST SP 800-53');
    expect(report).toContain('**Description:** No permissions block found.');
    expect(report).toContain('**Remediation:**');
  });

  it('labels ISO violations with ISO 27001 Annex A standard', async () => {
    await generateComplianceReport([ISO_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('**Standard:** ISO 27001 Annex A');
  });

  it('includes Controls Checked section with pass/fail status', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('## Controls Checked');
    expect(report).toContain('❌ FAIL');
    expect(report).toContain('✅ PASS');
  });

  it('marks only the violated control as FAIL, others as PASS', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    // NIST-AC-6 violated → FAIL; NIST-SI-2 not violated → PASS
    expect(report).toContain('❌ FAIL — NIST SP 800-53 AC-6');
    expect(report).toContain('✅ PASS — NIST SP 800-53 SI-2');
  });

  it('includes How to Fix section for critical and high violations', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION, HIGH_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('## How to Fix');
    expect(report).toContain('Step 1:');
    expect(report).toContain('Step 2:');
  });

  it('omits How to Fix section when no critical/high violations', async () => {
    await generateComplianceReport([MEDIUM_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).not.toContain('## How to Fix');
  });

  it('prints no violations message when list is empty', async () => {
    await generateComplianceReport([], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('_No violations detected._');
    expect(report).toContain('**Risk Score:** 0/100');
  });

  it('computes risk score: critical=40, high=20, medium=10, low=5', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION, HIGH_VIOLATION], makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('**Risk Score:** 60/100');
  });

  it('caps risk score at 100', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...CRITICAL_VIOLATION,
      controlId: `NIST-X-${i}`,
    }));
    await generateComplianceReport(many, makeConfig(), fs);
    const report = await readReport(tmpDir);
    expect(report).toContain('**Risk Score:** 100/100');
  });

  it('creates a timestamped .bak file if COMPLIANCE_REPORT.md already exists', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION], makeConfig(), fs);
    await generateComplianceReport([HIGH_VIOLATION], makeConfig(), fs);

    const files = await listDir(tmpDir);
    const backups = files.filter((f) => f.endsWith('.md.bak'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^COMPLIANCE_REPORT_.*\.md\.bak$/);
  });

  it('backup contains the previous report content', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION], makeConfig(), fs);
    const firstReport = await readReport(tmpDir);

    await generateComplianceReport([HIGH_VIOLATION], makeConfig(), fs);

    const files = await listDir(tmpDir);
    const bakFile = files.find((f) => f.endsWith('.md.bak'))!;
    const bakContent = await fsp.readFile(path.join(tmpDir, bakFile), 'utf-8');
    expect(bakContent).toBe(firstReport);
  });

  it('second run replaces the report with updated content', async () => {
    await generateComplianceReport([CRITICAL_VIOLATION], makeConfig(), fs);
    await generateComplianceReport([HIGH_VIOLATION], makeConfig(), fs);

    const report = await readReport(tmpDir);
    expect(report).toContain('NIST-SI-2');
    expect(report).not.toContain('[CRITICAL] NIST-AC-6');
  });

  it('logs success message after writing', async () => {
    const { logger } = jest.requireMock('../../../src/utils/logger') as {
      logger: { success: jest.Mock };
    };
    logger.success.mockClear();
    await generateComplianceReport([], makeConfig(), fs);
    expect(logger.success).toHaveBeenCalledWith(
      expect.stringContaining('COMPLIANCE_REPORT.md'),
    );
  });
});
