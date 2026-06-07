import { runStaticScan, ComplianceViolation } from '../../../src/agent/security/StaticSecurityScanner';

function findViolation(
  violations: ComplianceViolation[],
  controlId: string,
): ComplianceViolation | undefined {
  return violations.find((v) => v.controlId === controlId);
}

const CLEAN_WORKFLOW = `
name: CI
on: [push]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
        env:
          TOKEN: \${{ secrets.TOKEN }}
      - uses: actions/setup-node@1a4442cacd436585916779262731d1f5baa8e04a
        with:
          node-version: '20'
      - run: docker pull node:20-alpine
`;

describe('runStaticScan()', () => {
  it('returns no violations for a compliant workflow', () => {
    const result = runStaticScan({ 'ci.yml': CLEAN_WORKFLOW });
    expect(result).toHaveLength(0);
  });

  describe('NIST-AC-6 — missing permissions block', () => {
    it('flags critical when permissions block is absent', () => {
      const content = `name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n`;
      const result = runStaticScan({ 'ci.yml': content });
      const v = findViolation(result, 'NIST-AC-6');
      expect(v).toBeDefined();
      expect(v?.severity).toBe('critical');
      expect(v?.affectedFile).toBe('ci.yml');
    });

    it('does not flag when permissions block is present', () => {
      const result = runStaticScan({ 'ci.yml': CLEAN_WORKFLOW });
      const missing = result.filter(
        (v) => v.controlId === 'NIST-AC-6' && v.title.includes('Missing'),
      );
      expect(missing).toHaveLength(0);
    });
  });

  describe('NIST-AC-6 — write-all permissions', () => {
    it('flags high when permissions: write-all is set', () => {
      const content = `name: CI\non: [push]\npermissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n`;
      const result = runStaticScan({ 'ci.yml': content });
      const v = result.find((x) => x.controlId === 'NIST-AC-6' && x.severity === 'high');
      expect(v).toBeDefined();
    });
  });

  describe('NIST-SI-2 — unpinned action', () => {
    it('flags high when an action uses @main', () => {
      const content = `${CLEAN_WORKFLOW}\n      - uses: some-org/action@main\n`;
      const result = runStaticScan({ 'ci.yml': content });
      const v = findViolation(result, 'NIST-SI-2');
      expect(v).toBeDefined();
      expect(v?.severity).toBe('high');
    });

    it('flags high when an action uses @master', () => {
      const content = `${CLEAN_WORKFLOW}\n      - uses: some-org/action@master\n`;
      const result = runStaticScan({ 'ci.yml': content });
      expect(findViolation(result, 'NIST-SI-2')).toBeDefined();
    });

    it('does not flag SHA-pinned actions', () => {
      const result = runStaticScan({ 'ci.yml': CLEAN_WORKFLOW });
      expect(findViolation(result, 'NIST-SI-2')).toBeUndefined();
    });
  });

  describe('ISO-A.9.4 — plaintext secret', () => {
    it('flags critical when password= is hardcoded in env', () => {
      const content = `${CLEAN_WORKFLOW}\n        env:\n          password=mysecret123\n`;
      const result = runStaticScan({ 'ci.yml': content });
      const v = findViolation(result, 'ISO-A.9.4');
      expect(v).toBeDefined();
      expect(v?.severity).toBe('critical');
    });

    it('flags critical when token= is hardcoded', () => {
      const content = `${CLEAN_WORKFLOW}\n        env:\n          token=abc123\n`;
      const result = runStaticScan({ 'ci.yml': content });
      expect(findViolation(result, 'ISO-A.9.4')).toBeDefined();
    });

    it('does not flag secrets reference form', () => {
      const result = runStaticScan({ 'ci.yml': CLEAN_WORKFLOW });
      expect(findViolation(result, 'ISO-A.9.4')).toBeUndefined();
    });
  });

  describe('NIST-CM-6 — :latest docker tag', () => {
    it('flags medium when docker image uses :latest', () => {
      const content = `${CLEAN_WORKFLOW}\n      - run: docker pull myapp:latest\n        image: myapp:latest\n`;
      const result = runStaticScan({ 'ci.yml': content });
      const v = findViolation(result, 'NIST-CM-6');
      expect(v).toBeDefined();
      expect(v?.severity).toBe('medium');
    });

    it('does not flag pinned image tags', () => {
      const result = runStaticScan({ 'ci.yml': CLEAN_WORKFLOW });
      expect(findViolation(result, 'NIST-CM-6')).toBeUndefined();
    });
  });

  describe('ISO-A.12.6 — outdated Node.js', () => {
    it('flags medium when node-version is 16', () => {
      const content = CLEAN_WORKFLOW.replace("node-version: '20'", "node-version: '16'");
      const result = runStaticScan({ 'ci.yml': content });
      const v = findViolation(result, 'ISO-A.12.6');
      expect(v).toBeDefined();
      expect(v?.severity).toBe('medium');
    });

    it('does not flag node-version 18', () => {
      const content = CLEAN_WORKFLOW.replace("node-version: '20'", "node-version: '18'");
      const result = runStaticScan({ 'ci.yml': content });
      expect(findViolation(result, 'ISO-A.12.6')).toBeUndefined();
    });

    it('does not flag node-version 20', () => {
      const result = runStaticScan({ 'ci.yml': CLEAN_WORKFLOW });
      expect(findViolation(result, 'ISO-A.12.6')).toBeUndefined();
    });
  });

  it('scans multiple files and tags violations with the correct affectedFile', () => {
    const files = {
      'ci.yml': `name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n`,
      'deploy.yml': CLEAN_WORKFLOW,
    };
    const result = runStaticScan(files);
    const ciViolations = result.filter((v) => v.affectedFile === 'ci.yml');
    const deployViolations = result.filter((v) => v.affectedFile === 'deploy.yml');
    expect(ciViolations.length).toBeGreaterThan(0);
    expect(deployViolations).toHaveLength(0);
  });

  it('violation objects have all required fields', () => {
    const content = `name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n`;
    const [v] = runStaticScan({ 'ci.yml': content });
    expect(v).toMatchObject({
      controlId: expect.any(String),
      standard: expect.stringMatching(/^(NIST|ISO27001)$/),
      title: expect.any(String),
      description: expect.any(String),
      affectedFile: 'ci.yml',
      severity: expect.stringMatching(/^(low|medium|high|critical)$/),
      remediation: expect.any(String),
    });
  });
});
