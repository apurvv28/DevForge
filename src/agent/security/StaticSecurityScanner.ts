export interface ComplianceViolation {
  controlId: string;
  standard: 'NIST' | 'ISO27001';
  title: string;
  description: string;
  affectedFile: string;
  lineReference?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  remediation: string;
}

interface StaticRule {
  controlId: string;
  standard: ComplianceViolation['standard'];
  title: string;
  severity: ComplianceViolation['severity'];
  remediation: string;
  detect(content: string): { matched: boolean; lineReference?: string };
  description(lineRef?: string): string;
}

const RULES: StaticRule[] = [
  {
    controlId: 'NIST-AC-6',
    standard: 'NIST',
    title: 'Missing permissions block (Least Privilege)',
    severity: 'critical',
    remediation: 'Add a top-level `permissions` block to restrict token scopes.',
    detect(content) {
      const hasPermissions = /^permissions:/m.test(content);
      return { matched: !hasPermissions };
    },
    description() {
      return 'Workflow has no `permissions` block, granting the default write-all token scope.';
    },
  },
  {
    controlId: 'NIST-AC-6',
    standard: 'NIST',
    title: 'Write-all permissions (Least Privilege)',
    severity: 'high',
    remediation: 'Replace `permissions: write-all` with granular, least-privilege scopes.',
    detect(content) {
      const match = content.match(/^(permissions:\s*write-all)/m);
      return { matched: Boolean(match), lineReference: match ? match[1] : undefined };
    },
    description() {
      return 'Workflow uses `permissions: write-all`, violating the principle of least privilege.';
    },
  },
  {
    controlId: 'NIST-SI-2',
    standard: 'NIST',
    title: 'Unpinned action (Integrity)',
    severity: 'high',
    remediation:
      'Pin every third-party action to an immutable commit SHA (e.g. `uses: actions/checkout@a81bbbf`).',
    detect(content) {
      const match = content.match(/uses:\s*\S+@(main|master)\b/);
      return { matched: Boolean(match), lineReference: match ? match[0] : undefined };
    },
    description(lineRef) {
      return `Action uses \`@main\` or \`@master\` branch ref instead of a pinned SHA${lineRef ? ` (${lineRef})` : ''}.`;
    },
  },
  {
    controlId: 'ISO-A.9.4',
    standard: 'ISO27001',
    title: 'Plaintext secret in env block (Access Control)',
    severity: 'critical',
    remediation: 'Replace hardcoded values with `${{ secrets.SECRET_NAME }}` references.',
    detect(content) {
      const match = content.match(
        /(password|token|key)\s*=\s*(?!\$\{\{\s*secrets\.)["']?[^\s$"'{}]+["']?/i,
      );
      return { matched: Boolean(match), lineReference: match ? match[0] : undefined };
    },
    description(lineRef) {
      return `Plaintext secret pattern detected in workflow env block${lineRef ? `: \`${lineRef}\`` : ''}.`;
    },
  },
  {
    controlId: 'NIST-CM-6',
    standard: 'NIST',
    title: 'Docker image using :latest tag (Config Settings)',
    severity: 'medium',
    remediation: 'Pin Docker images to a specific digest or version tag (e.g. `image:1.2.3`).',
    detect(content) {
      const match = content.match(/image:\s*\S+:latest\b/);
      return { matched: Boolean(match), lineReference: match ? match[0] : undefined };
    },
    description(lineRef) {
      return `Docker image uses the mutable \`:latest\` tag${lineRef ? ` (${lineRef})` : ''}, causing non-deterministic builds.`;
    },
  },
  {
    controlId: 'ISO-A.12.6',
    standard: 'ISO27001',
    title: 'Outdated Node.js version (Vulnerability Management)',
    severity: 'medium',
    remediation: 'Upgrade to Node.js 18 or higher to receive security patches.',
    detect(content) {
      const match = content.match(/node-version:\s*['"]?(1[0-7]|[1-9])\b/);
      return { matched: Boolean(match), lineReference: match ? match[0] : undefined };
    },
    description(lineRef) {
      return `Node.js version below 18 detected${lineRef ? ` (${lineRef})` : ''}, which is no longer receiving security updates.`;
    },
  },
];

export function runStaticScan(fileContents: Record<string, string>): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  for (const [affectedFile, content] of Object.entries(fileContents)) {
    // NIST-AC-6 missing-permissions only makes sense for top-level workflow files
    for (const rule of RULES) {
      const { matched, lineReference } = rule.detect(content);
      if (matched) {
        violations.push({
          controlId: rule.controlId,
          standard: rule.standard,
          title: rule.title,
          description: rule.description(lineReference),
          affectedFile,
          lineReference,
          severity: rule.severity,
          remediation: rule.remediation,
        });
      }
    }
  }

  return violations;
}
