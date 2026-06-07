/**
 * EKS Generator — produces GitHub Actions workflow + Kubernetes manifests
 * for deploying to Amazon EKS via ECR.
 */
import { DevForgeFS } from '../utils/fs';
import { renderTemplate } from '../engine/templateRenderer';
import { validateK8sManifest } from '../validator/yamlValidator';
import { GeneratorError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  EKS_WORKFLOW_TEMPLATE,
  EKS_K8S_DEPLOYMENT_TEMPLATE,
  EKS_K8S_SERVICE_TEMPLATE,
  EKS_K8S_INGRESS_TEMPLATE,
  EKS_SECRETS_REQUIRED_TEMPLATE,
} from '../templates/deploy/eks';

export interface EksConfig {
  ecrRegistry: string;
  imageName: string;
  eksClusterName: string;
  awsRegion: string;
  appName: string;
  replicas: number;
  port: number;
  domain: string;
}

export interface EksGenerationResult {
  written: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Builds the substitution variable map for all EKS templates.
 */
function buildVars(cfg: EksConfig): Map<string, string> {
  return new Map<string, string>([
    ['ECR_REGISTRY', cfg.ecrRegistry],
    ['IMAGE_NAME', cfg.imageName],
    ['EKS_CLUSTER_NAME', cfg.eksClusterName],
    ['AWS_REGION', cfg.awsRegion],
    ['APP_NAME', cfg.appName],
    ['REPLICAS', String(cfg.replicas)],
    ['PORT', String(cfg.port)],
    ['DOMAIN', cfg.domain],
  ]);
}

/**
 * Generates all EKS-related files:
 *  - .github/workflows/deploy-eks.yml
 *  - k8s/deployment.yaml
 *  - k8s/service.yaml
 *  - k8s/ingress.yaml
 *  - SECRETS_REQUIRED.md
 *
 * K8s manifests are validated before writing.
 * Errors are collected per-file; generation continues after a failure.
 */
export async function generateEksFiles(
  cfg: EksConfig,
  fs: DevForgeFS,
): Promise<EksGenerationResult> {
  const result: EksGenerationResult = { written: [], errors: [] };
  const vars = buildVars(cfg);

  const files: Array<{ path: string; template: string; validateK8s: boolean }> = [
    {
      path: '.github/workflows/deploy-eks.yml',
      template: EKS_WORKFLOW_TEMPLATE,
      validateK8s: false,
    },
    {
      path: 'k8s/deployment.yaml',
      template: EKS_K8S_DEPLOYMENT_TEMPLATE,
      validateK8s: true,
    },
    {
      path: 'k8s/service.yaml',
      template: EKS_K8S_SERVICE_TEMPLATE,
      validateK8s: true,
    },
    {
      path: 'k8s/ingress.yaml',
      template: EKS_K8S_INGRESS_TEMPLATE,
      validateK8s: true,
    },
    {
      path: 'SECRETS_REQUIRED.md',
      template: EKS_SECRETS_REQUIRED_TEMPLATE,
      validateK8s: false,
    },
  ];

  for (const file of files) {
    try {
      const rendered = renderTemplate(file.template, vars);

      if (file.validateK8s) {
        const validation = validateK8sManifest(rendered, file.path);
        if (!validation.valid) {
          const msgs = validation.errors.map((e) => `${e.code}: ${e.message}`).join('; ');
          throw new GeneratorError(`K8s manifest validation failed for ${file.path}: ${msgs}`);
        }
      }

      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      if (dir) await fs.ensureDir(dir);

      await fs.writeFile(file.path, rendered);
      result.written.push(file.path);
      logger.success(`Generated: ${file.path}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ path: file.path, error: msg });
      logger.error(`Error generating ${file.path}: ${msg}`);
    }
  }

  return result;
}
