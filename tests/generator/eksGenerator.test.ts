import { generateEksFiles, EksConfig } from '../../src/generator/eksGenerator';
import { DevForgeFS } from '../../src/utils/fs';
import { validateK8sManifest } from '../../src/validator/yamlValidator';
import {
  EKS_WORKFLOW_TEMPLATE,
  EKS_K8S_DEPLOYMENT_TEMPLATE,
  EKS_K8S_SERVICE_TEMPLATE,
  EKS_K8S_INGRESS_TEMPLATE,
  EKS_SECRETS_REQUIRED_TEMPLATE,
} from '../../src/templates/deploy/eks';
import { renderTemplate } from '../../src/engine/templateRenderer';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const BASE_CFG: EksConfig = {
  ecrRegistry: '123456789.dkr.ecr.us-east-1.amazonaws.com',
  imageName: 'my-app',
  eksClusterName: 'my-cluster',
  awsRegion: 'us-east-1',
  appName: 'my-app',
  replicas: 2,
  port: 3000,
  domain: 'app.example.com',
};

function makeMockFs(): jest.Mocked<DevForgeFS> {
  return {
    fileExists: jest.fn().mockResolvedValue(false),
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(undefined),
    ensureDir: jest.fn().mockResolvedValue(undefined),
    projectRoot: '/project',
    dryRun: false,
  } as unknown as jest.Mocked<DevForgeFS>;
}

describe('eksGenerator', () => {
  let mockFs: jest.Mocked<DevForgeFS>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs = makeMockFs();
  });

  // ── Happy path ────────────────────────────────────────────────────

  describe('generateEksFiles — happy path', () => {
    it('writes all 5 expected files', async () => {
      const result = await generateEksFiles(BASE_CFG, mockFs);

      expect(result.errors).toHaveLength(0);
      expect(result.written).toHaveLength(5);
      expect(result.written).toContain('.github/workflows/deploy-eks.yml');
      expect(result.written).toContain('k8s/deployment.yaml');
      expect(result.written).toContain('k8s/service.yaml');
      expect(result.written).toContain('k8s/ingress.yaml');
      expect(result.written).toContain('SECRETS_REQUIRED.md');
    });

    it('creates parent directories before writing', async () => {
      await generateEksFiles(BASE_CFG, mockFs);

      expect(mockFs.ensureDir).toHaveBeenCalledWith('.github/workflows');
      expect(mockFs.ensureDir).toHaveBeenCalledWith('k8s');
    });

    it('calls writeFile exactly 5 times', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      expect(mockFs.writeFile).toHaveBeenCalledTimes(5);
    });
  });

  // ── Variable substitution ─────────────────────────────────────────

  describe('variable substitution', () => {
    it('substitutes ECR_REGISTRY in workflow', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call).toBeDefined();
      expect(call![1]).toContain('123456789.dkr.ecr.us-east-1.amazonaws.com');
    });

    it('substitutes IMAGE_NAME in workflow', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('my-app');
    });

    it('substitutes EKS_CLUSTER_NAME in workflow', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('my-cluster');
    });

    it('substitutes AWS_REGION in workflow', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('us-east-1');
    });

    it('substitutes REPLICAS in deployment manifest', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('replicas: 2');
    });

    it('substitutes PORT in deployment manifest', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('3000');
    });

    it('substitutes DOMAIN in ingress manifest', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/ingress.yaml',
      );
      expect(call![1]).toContain('app.example.com');
    });

    it('substitutes APP_NAME in service manifest', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/service.yaml',
      );
      expect(call![1]).toContain('my-app');
    });
  });

  // ── Workflow content checks ───────────────────────────────────────

  describe('workflow content', () => {
    it('uses OIDC role-to-assume, not static keys', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('role-to-assume');
      expect(call![1]).not.toContain('aws-access-key-id:');
    });

    it('uses aws-actions/configure-aws-credentials@v4', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('aws-actions/configure-aws-credentials@v4');
    });

    it('uses aws-actions/amazon-ecr-login@v2', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('aws-actions/amazon-ecr-login@v2');
    });

    it('includes kubectl rollout status', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('kubectl rollout status');
    });

    it('includes docker build command', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === '.github/workflows/deploy-eks.yml',
      );
      expect(call![1]).toContain('docker build');
    });
  });

  // ── K8s manifest structure ────────────────────────────────────────

  describe('k8s manifest structure', () => {
    it('deployment has matching selector and template labels', async () => {
      const vars = new Map([
        ['ECR_REGISTRY', BASE_CFG.ecrRegistry],
        ['IMAGE_NAME', BASE_CFG.imageName],
        ['EKS_CLUSTER_NAME', BASE_CFG.eksClusterName],
        ['AWS_REGION', BASE_CFG.awsRegion],
        ['APP_NAME', BASE_CFG.appName],
        ['REPLICAS', '2'],
        ['PORT', '3000'],
        ['DOMAIN', BASE_CFG.domain],
      ]);
      const rendered = renderTemplate(EKS_K8S_DEPLOYMENT_TEMPLATE, vars);
      const validation = validateK8sManifest(rendered, 'k8s/deployment.yaml');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('service manifest is valid k8s yaml', async () => {
      const vars = new Map([
        ['ECR_REGISTRY', BASE_CFG.ecrRegistry],
        ['IMAGE_NAME', BASE_CFG.imageName],
        ['EKS_CLUSTER_NAME', BASE_CFG.eksClusterName],
        ['AWS_REGION', BASE_CFG.awsRegion],
        ['APP_NAME', BASE_CFG.appName],
        ['REPLICAS', '2'],
        ['PORT', '3000'],
        ['DOMAIN', BASE_CFG.domain],
      ]);
      const rendered = renderTemplate(EKS_K8S_SERVICE_TEMPLATE, vars);
      const validation = validateK8sManifest(rendered, 'k8s/service.yaml');
      expect(validation.valid).toBe(true);
    });

    it('ingress manifest is valid k8s yaml', async () => {
      const vars = new Map([
        ['ECR_REGISTRY', BASE_CFG.ecrRegistry],
        ['IMAGE_NAME', BASE_CFG.imageName],
        ['EKS_CLUSTER_NAME', BASE_CFG.eksClusterName],
        ['AWS_REGION', BASE_CFG.awsRegion],
        ['APP_NAME', BASE_CFG.appName],
        ['REPLICAS', '2'],
        ['PORT', '3000'],
        ['DOMAIN', BASE_CFG.domain],
      ]);
      const rendered = renderTemplate(EKS_K8S_INGRESS_TEMPLATE, vars);
      const validation = validateK8sManifest(rendered, 'k8s/ingress.yaml');
      expect(validation.valid).toBe(true);
    });

    it('deployment uses apps/v1 apiVersion', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('apiVersion: apps/v1');
    });

    it('deployment kind is Deployment', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('kind: Deployment');
    });

    it('deployment includes liveness and readiness probes on /health', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('livenessProbe');
      expect(call![1]).toContain('readinessProbe');
      expect(call![1]).toContain('/health');
    });

    it('deployment includes resource requests and limits', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('requests:');
      expect(call![1]).toContain('limits:');
    });

    it('service kind is Service with ClusterIP', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/service.yaml',
      );
      expect(call![1]).toContain('kind: Service');
      expect(call![1]).toContain('ClusterIP');
    });

    it('ingress kind is Ingress', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/ingress.yaml',
      );
      expect(call![1]).toContain('kind: Ingress');
    });
  });

  // ── SECRETS_REQUIRED.md ───────────────────────────────────────────

  describe('SECRETS_REQUIRED.md', () => {
    it('documents both OIDC and static key options', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'SECRETS_REQUIRED.md',
      );
      expect(call![1]).toContain('AWS_ROLE_ARN');
      expect(call![1]).toContain('AWS_ACCESS_KEY_ID');
      expect(call![1]).toContain('AWS_SECRET_ACCESS_KEY');
    });

    it('includes cluster name in documentation', async () => {
      await generateEksFiles(BASE_CFG, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'SECRETS_REQUIRED.md',
      );
      expect(call![1]).toContain('my-cluster');
    });
  });

  // ── Error handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('continues after a single file write error and records the error', async () => {
      mockFs.writeFile
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValue(undefined);

      const result = await generateEksFiles(BASE_CFG, mockFs);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.path).toBe('.github/workflows/deploy-eks.yml');
      // Remaining files should still be attempted
      expect(result.written.length).toBeGreaterThan(0);
    });

    it('continues after ensureDir failure', async () => {
      mockFs.ensureDir
        .mockRejectedValueOnce(new Error('Dir failed'))
        .mockResolvedValue(undefined);

      const result = await generateEksFiles(BASE_CFG, mockFs);

      expect(result.errors).toHaveLength(1);
      // Other files still processed
      expect(result.written.length).toBeGreaterThan(0);
    });

    it('returns all errors when all writes fail', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      const result = await generateEksFiles(BASE_CFG, mockFs);

      expect(result.errors).toHaveLength(5);
      expect(result.written).toHaveLength(0);
    });
  });

  // ── validateK8sManifest unit tests ───────────────────────────────

  describe('validateK8sManifest', () => {
    it('returns valid for a well-formed Deployment', () => {
      const yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test
spec:
  selector:
    matchLabels:
      app: test
  template:
    metadata:
      labels:
        app: test
    spec:
      containers: []
`;
      const r = validateK8sManifest(yaml);
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });

    it('errors when selector matchLabels key is absent from template labels', () => {
      const yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test
spec:
  selector:
    matchLabels:
      app: test
  template:
    metadata:
      labels:
        name: test
    spec:
      containers: []
`;
      const r = validateK8sManifest(yaml);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.code === 'SELECTOR_LABEL_MISMATCH')).toBe(true);
    });

    it('errors on missing apiVersion', () => {
      const yaml = `kind: Deployment
metadata:
  name: test
spec: {}
`;
      const r = validateK8sManifest(yaml);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.message.includes('apiVersion'))).toBe(true);
    });

    it('errors on syntax error', () => {
      const r = validateK8sManifest('{ invalid: yaml: content:');
      expect(r.valid).toBe(false);
      expect(r.errors[0]!.code).toBe('SYNTAX_ERROR');
    });

    it('returns valid for a well-formed Service', () => {
      const yaml = `apiVersion: v1
kind: Service
metadata:
  name: test
spec:
  selector:
    app: test
  ports:
    - port: 80
`;
      const r = validateK8sManifest(yaml);
      expect(r.valid).toBe(true);
    });

    it('returns valid for a well-formed Ingress', () => {
      const yaml = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: test
spec:
  rules: []
`;
      const r = validateK8sManifest(yaml);
      expect(r.valid).toBe(true);
    });
  });

  // ── Template content unit tests ───────────────────────────────────

  describe('EKS template exports', () => {
    it('EKS_WORKFLOW_TEMPLATE contains required placeholders', () => {
      expect(EKS_WORKFLOW_TEMPLATE).toContain('{{ECR_REGISTRY}}');
      expect(EKS_WORKFLOW_TEMPLATE).toContain('{{IMAGE_NAME}}');
      expect(EKS_WORKFLOW_TEMPLATE).toContain('{{EKS_CLUSTER_NAME}}');
      expect(EKS_WORKFLOW_TEMPLATE).toContain('{{AWS_REGION}}');
      expect(EKS_WORKFLOW_TEMPLATE).toContain('{{APP_NAME}}');
    });

    it('EKS_K8S_DEPLOYMENT_TEMPLATE contains required placeholders', () => {
      expect(EKS_K8S_DEPLOYMENT_TEMPLATE).toContain('{{APP_NAME}}');
      expect(EKS_K8S_DEPLOYMENT_TEMPLATE).toContain('{{ECR_REGISTRY}}');
      expect(EKS_K8S_DEPLOYMENT_TEMPLATE).toContain('{{IMAGE_NAME}}');
      expect(EKS_K8S_DEPLOYMENT_TEMPLATE).toContain('{{REPLICAS}}');
      expect(EKS_K8S_DEPLOYMENT_TEMPLATE).toContain('{{PORT}}');
    });

    it('EKS_K8S_SERVICE_TEMPLATE contains required placeholders', () => {
      expect(EKS_K8S_SERVICE_TEMPLATE).toContain('{{APP_NAME}}');
      expect(EKS_K8S_SERVICE_TEMPLATE).toContain('{{PORT}}');
    });

    it('EKS_K8S_INGRESS_TEMPLATE contains required placeholders', () => {
      expect(EKS_K8S_INGRESS_TEMPLATE).toContain('{{APP_NAME}}');
      expect(EKS_K8S_INGRESS_TEMPLATE).toContain('{{DOMAIN}}');
    });

    it('EKS_SECRETS_REQUIRED_TEMPLATE mentions both credential options', () => {
      expect(EKS_SECRETS_REQUIRED_TEMPLATE).toContain('AWS_ROLE_ARN');
      expect(EKS_SECRETS_REQUIRED_TEMPLATE).toContain('AWS_ACCESS_KEY_ID');
    });
  });

  // ── Custom replica / port / domain values ────────────────────────

  describe('custom config values', () => {
    it('respects custom replica count', async () => {
      const cfg = { ...BASE_CFG, replicas: 5 };
      await generateEksFiles(cfg, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('replicas: 5');
    });

    it('respects custom port', async () => {
      const cfg = { ...BASE_CFG, port: 8080 };
      await generateEksFiles(cfg, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/deployment.yaml',
      );
      expect(call![1]).toContain('8080');
    });

    it('respects custom domain in ingress', async () => {
      const cfg = { ...BASE_CFG, domain: 'api.mycompany.io' };
      await generateEksFiles(cfg, mockFs);
      const call = (mockFs.writeFile as jest.Mock).mock.calls.find(
        (c) => c[0] === 'k8s/ingress.yaml',
      );
      expect(call![1]).toContain('api.mycompany.io');
    });
  });
});
