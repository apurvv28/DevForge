import { load, dump } from 'js-yaml';
import { DevForgeFS } from '../../utils/fs';
import { logger } from '../../utils/logger';
import { validateWorkflowYaml } from '../../validator/yamlValidator';
import { ComplianceViolation } from './StaticSecurityScanner';

export interface FixResult {
  violation: ComplianceViolation;
  applied: boolean;
  description: string;
}

// Controls that cannot be auto-fixed safely.
const MANUAL_ONLY = new Set(['NIST-SI-2', 'ISO-A.9.4', 'ISO-A.12.6']);

export async function applyAutoFixes(
  violations: ComplianceViolation[],
  fs: DevForgeFS,
): Promise<FixResult[]> {
  const results: FixResult[] = [];

  for (const v of violations) {
    results.push(await attemptFix(v, fs));
  }

  printSummary(results);
  return results;
}

async function attemptFix(v: ComplianceViolation, fs: DevForgeFS): Promise<FixResult> {
  if (MANUAL_ONLY.has(v.controlId)) {
    return { violation: v, applied: false, description: 'manual action required' };
  }

  // NIST-CM-6 — :latest tag in Dockerfile (string replacement, not YAML)
  if (v.controlId === 'NIST-CM-6') {
    return fixLatestTag(v, fs);
  }

  // NIST-AC-6 — missing permissions block OR write-all
  if (v.controlId === 'NIST-AC-6') {
    return fixPermissions(v, fs);
  }

  return { violation: v, applied: false, description: 'no fix available for this control' };
}

// ── NIST-AC-6 fixes ──────────────────────────────────────────────────

async function fixPermissions(v: ComplianceViolation, fs: DevForgeFS): Promise<FixResult> {
  const isMissing = v.title.toLowerCase().includes('missing');
  const isWriteAll = v.title.toLowerCase().includes('write-all');

  if (!isMissing && !isWriteAll) {
    return { violation: v, applied: false, description: 'unrecognised NIST-AC-6 variant' };
  }

  let original: string;
  try {
    original = await fs.readFile(v.affectedFile);
  } catch {
    return { violation: v, applied: false, description: `could not read ${v.affectedFile}` };
  }

  let patched: string;
  try {
    patched = isMissing ? addPermissionsBlock(original) : replaceWriteAll(original);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { violation: v, applied: false, description: `YAML parse failed: ${msg}` };
  }

  const validation = validateWorkflowYaml(patched, v.affectedFile);
  if (!validation.valid) {
    const reason = validation.errors.map((e) => e.message).join('; ');
    return { violation: v, applied: false, description: `patched YAML is invalid: ${reason}` };
  }

  await fs.writeFile(`${v.affectedFile}.bak`, original);
  await fs.writeFile(v.affectedFile, patched);

  const desc = isMissing
    ? 'added `permissions: contents: read` at workflow level'
    : 'replaced `permissions: write-all` with `permissions: contents: read`';

  return { violation: v, applied: true, description: desc };
}

function addPermissionsBlock(content: string): string {
  const doc = load(content) as Record<string, unknown>;
  if (doc['permissions']) return content; // already present — nothing to do
  doc['permissions'] = { contents: 'read' };
  return dump(doc, { lineWidth: -1 });
}

function replaceWriteAll(content: string): string {
  const doc = load(content) as Record<string, unknown>;
  doc['permissions'] = { contents: 'read' };
  return dump(doc, { lineWidth: -1 });
}

// ── NIST-CM-6 fix ────────────────────────────────────────────────────

async function fixLatestTag(v: ComplianceViolation, fs: DevForgeFS): Promise<FixResult> {
  let original: string;
  try {
    original = await fs.readFile(v.affectedFile);
  } catch {
    return { violation: v, applied: false, description: `could not read ${v.affectedFile}` };
  }

  if (!/:latest\b/.test(original)) {
    return { violation: v, applied: false, description: 'no :latest tag found in file' };
  }

  const patched = original.replace(/:latest\b/g, ':stable');

  await fs.writeFile(`${v.affectedFile}.bak`, original);
  await fs.writeFile(v.affectedFile, patched);

  logger.info(
    `[auto-fix] Replaced :latest with :stable in ${v.affectedFile}. ` +
      'Pin to a specific version for fully deterministic builds.',
  );

  return {
    violation: v,
    applied: true,
    description: 'replaced :latest with :stable (pin to a specific version when possible)',
  };
}

// ── Summary ──────────────────────────────────────────────────────────

function printSummary(results: FixResult[]): void {
  const applied = results.filter((r) => r.applied);
  const skipped = results.filter((r) => !r.applied);

  if (applied.length > 0) {
    logger.success(`✓ Applied ${applied.length} automatic fix${applied.length === 1 ? '' : 'es'}`);
  }

  for (const r of skipped) {
    logger.warn(`✗ ${r.violation.controlId} skipped (${r.description})`);
  }
}
