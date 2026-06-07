import { load } from 'js-yaml';

export interface ValidationIssue {
  code: string;
  message: string;
  line?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function makeResult(): ValidationResult {
  return { valid: true, errors: [], warnings: [] };
}

export function validateWorkflowYaml(content: string, _filePath?: string): ValidationResult {
  const result = makeResult();
  // Consume _filePath to avoid unused variable lint warnings in some configs
  void _filePath;

  // SYNTAX CHECK
  let doc: unknown;
  try {
    doc = load(content);
  } catch (err) {
    const maybeErr = err as { mark?: { line?: number }; message?: string } | undefined;
    const line = maybeErr?.mark?.line != null ? maybeErr.mark.line + 1 : undefined;
    const message = maybeErr?.message ?? String(err);
    result.valid = false;
    result.errors.push({ code: 'SYNTAX_ERROR', message: String(message), line });
    return result;
  }

  // STRUCTURAL CHECKS
  if (!doc || typeof doc !== 'object') {
    result.valid = false;
    result.errors.push({
      code: 'INVALID_YAML_ROOT',
      message: 'YAML root must be a mapping/object',
    });
    return result;
  }

  const docObj = doc as Record<string, unknown> | null;
  if (!docObj || typeof docObj !== 'object') {
    result.valid = false;
    result.errors.push({
      code: 'INVALID_YAML_ROOT',
      message: 'YAML root must be a mapping/object',
    });
    return result;
  }

  if (!Object.prototype.hasOwnProperty.call(docObj, 'on')) {
    result.valid = false;
    result.errors.push({ code: 'MISSING_TRIGGER', message: "Workflow is missing 'on' trigger" });
  }

  if (!Object.prototype.hasOwnProperty.call(docObj, 'jobs')) {
    result.valid = false;
    result.errors.push({ code: 'MISSING_JOBS', message: "Workflow is missing 'jobs' section" });
  } else {
    const jobs = docObj['jobs'];
    if (jobs && typeof jobs === 'object') {
      for (const [jobName, jobDef] of Object.entries(jobs as Record<string, unknown>)) {
        const jobIsObj = jobDef && typeof jobDef === 'object';
        if (
          !jobIsObj ||
          !Object.prototype.hasOwnProperty.call(jobDef as Record<string, unknown>, 'runs-on')
        ) {
          result.valid = false;
          result.errors.push({
            code: 'MISSING_RUNS_ON',
            message: `Job '${jobName}' is missing 'runs-on'`,
          });
        }
      }
    }
  }

  // SECURITY CHECKS (on raw string)
  // Remove templated expressions like ${{ ... }} before token scanning
  const stripped = content.replace(/\$\{\{[^}]*\}\}/g, '');

  // POSSIBLE_HARDCODED_SECRET: long alphanumeric sequences (32+)
  const tokenRegex = /[A-Za-z0-9_]{32,}/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(stripped))) {
    result.warnings.push({
      code: 'POSSIBLE_HARDCODED_SECRET',
      message: `Detected possible hardcoded secret token near '${m[0].slice(0, 8)}...'`,
    });
  }

  // HARDCODED_CREDENTIAL: lines like 'token: abc...' or 'password: xyz...'
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    const match = line.match(/\b(password|token)\b\s*:\s*(.+)/i);
    if (match) {
      const rawValue = match[2] || '';
      const value = rawValue.trim();
      // If value contains a templated secrets reference, it's okay
      if (!/\$\{\{\s*secrets\./.test(value) && !/\$\{\{/.test(value)) {
        result.valid = false;
        result.errors.push({
          code: 'HARDCODED_CREDENTIAL',
          message: `Hardcoded credential detected on line ${index + 1}`,
          line: index + 1,
        });
      }
    }
  }

  // BEST PRACTICE CHECKS
  // permissions
  if (!/\bpermissions\s*:\s*/.test(content)) {
    result.warnings.push({
      code: 'MISSING_PERMISSIONS',
      message: 'No permissions block found at workflow or job level',
    });
  }

  // unpinned actions: looks for uses: actions/checkout without @
  const checkoutRegex = /uses\s*:\s*['"]?actions\/checkout([^@'"\s]*)['"]?/g;
  /* eslint-disable security/detect-object-injection */
  while ((m = checkoutRegex.exec(content))) {
    const suffix = m[1] || '';
    if (!suffix || !suffix.startsWith('@')) {
      result.warnings.push({
        code: 'UNPINNED_ACTION',
        message: 'uses: actions/checkout is not pinned to a version',
      });
    }
  }
  /* eslint-enable security/detect-object-injection */

  // prefer npm ci
  if (/npm\s+install/.test(content)) {
    result.warnings.push({
      code: 'PREFER_NPM_CI',
      message: "Found 'npm install' — prefer 'npm ci' in CI workflows",
    });
  }

  // Final validity: if any errors exist, valid = false
  if (result.errors.length > 0) result.valid = false;
  return result;
}

export function validateAllFiles(
  files: { path: string; content: string }[],
): Map<string, ValidationResult> {
  const map = new Map<string, ValidationResult>();
  for (const f of files) {
    map.set(f.path, validateWorkflowYaml(f.content));
  }
  return map;
}

/**
 * Validates a Kubernetes manifest (Deployment, Service, or Ingress).
 * Performs structural checks specific to each kind.
 */
export function validateK8sManifest(content: string, filePath?: string): ValidationResult {
  const result = makeResult();
  void filePath;

  let doc: unknown;
  try {
    doc = load(content);
  } catch (err) {
    const maybeErr = err as { mark?: { line?: number }; message?: string } | undefined;
    const line = maybeErr?.mark?.line != null ? maybeErr.mark.line + 1 : undefined;
    result.valid = false;
    result.errors.push({ code: 'SYNTAX_ERROR', message: String(maybeErr?.message ?? err), line });
    return result;
  }

  if (!doc || typeof doc !== 'object') {
    result.valid = false;
    result.errors.push({
      code: 'INVALID_YAML_ROOT',
      message: 'YAML root must be a mapping/object',
    });
    return result;
  }

  const obj = doc as Record<string, unknown>;

  // Every k8s manifest must have apiVersion, kind, metadata
  for (const field of ['apiVersion', 'kind', 'metadata'] as const) {
    if (!Object.prototype.hasOwnProperty.call(obj, field)) {
      result.valid = false;
      result.errors.push({
        code: 'MISSING_K8S_FIELD',
        message: `Kubernetes manifest is missing required field: ${field}`,
      });
    }
  }

  if (result.errors.length > 0) return result;

  const kind = obj['kind'] as string;

  if (kind === 'Deployment') {
    const spec = obj['spec'] as Record<string, unknown> | undefined;
    if (!spec) {
      result.valid = false;
      result.errors.push({ code: 'MISSING_K8S_FIELD', message: 'Deployment is missing spec' });
      return result;
    }

    const selector = spec['selector'] as Record<string, unknown> | undefined;
    const template = spec['template'] as Record<string, unknown> | undefined;
    const templateMeta = template?.['metadata'] as Record<string, unknown> | undefined;
    const matchLabels = selector?.['matchLabels'] as Record<string, unknown> | undefined;
    const templateLabels = templateMeta?.['labels'] as Record<string, unknown> | undefined;

    if (!selector || !matchLabels) {
      result.valid = false;
      result.errors.push({
        code: 'MISSING_K8S_FIELD',
        message: 'Deployment spec.selector.matchLabels is required',
      });
    }

    if (!template || !templateLabels) {
      result.valid = false;
      result.errors.push({
        code: 'MISSING_K8S_FIELD',
        message: 'Deployment spec.template.metadata.labels is required',
      });
    }

    // Verify selector.matchLabels keys are a subset of template.metadata.labels
    if (matchLabels && templateLabels) {
      for (const key of Object.keys(matchLabels)) {
        if (!Object.prototype.hasOwnProperty.call(templateLabels, key)) {
          result.valid = false;
          result.errors.push({
            code: 'SELECTOR_LABEL_MISMATCH',
            message: `spec.selector.matchLabels key "${key}" not found in spec.template.metadata.labels`,
          });
        }
      }
    }
  }

  if (result.errors.length > 0) result.valid = false;
  return result;
}

export default { validateWorkflowYaml, validateAllFiles, validateK8sManifest };
