import chalk from 'chalk';
import { ComplianceViolation } from '../security/StaticSecurityScanner';

const SEVERITY_ORDER: ComplianceViolation['severity'][] = ['critical', 'high', 'medium', 'low'];

export function printSecurityReport(violations: ComplianceViolation[], riskScore: number): void {
  console.log('');

  if (riskScore > 70) {
    console.log(chalk.red('⛔ High security risk detected'));
  } else if (riskScore >= 40) {
    console.log(chalk.yellow('⚠ Medium security risk'));
  } else {
    console.log(chalk.green('✓ Security scan passed'));
  }

  if (violations.length === 0) {
    console.log('');
    return;
  }

  const grouped = new Map<ComplianceViolation['severity'], ComplianceViolation[]>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const v of violations) {
    grouped.get(v.severity)?.push(v);
  }

  for (const sev of SEVERITY_ORDER) {
    const group = grouped.get(sev) ?? [];
    for (const v of group) {
      const label = formatLabel(sev);
      console.log(`${label} ${v.controlId} — ${v.title} in ${v.affectedFile}`);
      console.log(`  Remediation: ${v.remediation}`);
    }
  }

  console.log('');
}

function formatLabel(severity: ComplianceViolation['severity']): string {
  switch (severity) {
    case 'critical':
      return chalk.red('[CRITICAL]');
    case 'high':
      return chalk.yellow('[HIGH]');
    case 'medium':
      return chalk.cyan('[MEDIUM]');
    default:
      return chalk.gray('[LOW]');
  }
}
