import { auditWorkflowContent } from '../../src/cli/auditCommand';

function baseWorkflow(overrides: string): string {
  return `name: CI
on: [push]
permissions:
  contents: read
  pull-requests: write
concurrency:
  group: ci-${'${{ github.ref }}'}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
${overrides}`;
}

describe('auditCommand rule coverage', () => {
  it('flags S1 hardcoded credentials', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('      - run: echo done\n      - name: Secret\n        env:\n          token: super-secret-value\n'),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'S1')).toBe(true);
  });

  it('flags S2 unpinned checkout', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace('actions/checkout@v4', 'actions/checkout'),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'S2')).toBe(true);
  });

  it('flags S3 missing permissions', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace(/permissions:[\s\S]*?concurrency:/, 'concurrency:'),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'S3')).toBe(true);
  });

  it('flags S4 pull_request_target with write permissions', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace('on: [push]', 'on: pull_request_target').replace(
        'pull-requests: write',
        'contents: write',
      ),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'S4')).toBe(true);
  });

  it('flags S5 secrets passed to an untrusted action', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace(
        '- uses: actions/upload-artifact@v4',
        '- uses: some-external/action@v1',
      ).replace(
        'path: dist/',
        'path: dist/\n        env:\n          API_TOKEN: ${{ secrets.API_TOKEN }}',
      ),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'S5')).toBe(true);
  });

  it('flags P1 missing dependency caching', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace('          cache: npm\n', ''),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'P1')).toBe(true);
  });

  it('flags P2 npm install usage', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace('npm ci', 'npm install'),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'P2')).toBe(true);
  });

  it('flags P3 missing artifact upload', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace(/\n      - uses: actions\/upload-artifact@v4[\s\S]*$/, ''),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'P3')).toBe(true);
  });

  it('flags B1 missing timeout-minutes', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace('    timeout-minutes: 10\n', ''),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'B1')).toBe(true);
  });

  it('flags B2 hardcoded node version instead of matrix', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace('          node-version: 20', '          node-version: 18').replace(
        '          cache: npm\n',
        '          cache: npm\n',
      ),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'B2')).toBe(true);
  });

  it('flags B3 missing concurrency cancel-in-progress', () => {
    const issues = auditWorkflowContent(
      baseWorkflow('').replace(/concurrency:[\s\S]*?jobs:/, 'jobs:'),
      '.github/workflows/ci.yml',
    );

    expect(issues.some((issue) => issue.code === 'B3')).toBe(true);
  });
});