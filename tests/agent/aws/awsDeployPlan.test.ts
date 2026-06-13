import { buildDeployPlan, getEcrRegistry, getSafeProjectName } from '../../../src/agent/aws/awsDeployPlan';
import { DevForgeConfig, DeploymentTarget, Framework, BranchStrategy } from '../../../src/types';
import { AwsCliMetadata } from '../../../src/agent/aws/awsCliInspector';

const MOCK_CONFIG = (target: DeploymentTarget): DevForgeConfig => ({
  projectRoot: '/projects/my-test-app',
  devforgeVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  dryRun: false,
  detected: {
    framework: Framework.EXPRESS,
    packageManager: 'npm' as any,
    nodeVersion: '20',
    hasDocker: true,
    hasTests: false,
    hasLinting: false,
    testCommand: null,
    buildCommand: null,
    installCommand: 'npm install',
    detectedAt: new Date().toISOString(),
  },
  user: {
    deploymentTarget: target,
    branchStrategy: BranchStrategy.FEATURE_MAIN,
    dockerRequired: true,
    multiEnvironment: false,
    environments: [],
    enableTrivyScan: false,
  },
});

const MOCK_META: AwsCliMetadata = {
  isLoggedIn: true,
  region: 'us-west-2',
  accountIdSuffix: '1234',
  accountIdFull: '123456789012',
  callerArn: 'arn:aws:sts::123456789012:assumed-role/TestRole',
  defaultVpcId: 'vpc-123456',
  availabilityZones: ['us-west-2a', 'us-west-2b'],
  eksClusterNames: ['my-eks-cluster'],
  ecsClusterArns: ['arn:aws:ecs:us-west-2:123456789012:cluster/my-ecs-cluster'],
};

describe('awsDeployPlan', () => {
  it('builds a valid ECS plan', () => {
    const config = MOCK_CONFIG(DeploymentTarget.AWS_ECS);
    const plan = buildDeployPlan(config, MOCK_META);

    expect(plan.target).toBe('aws_ecs');
    expect(plan.region).toBe('us-west-2');
    expect(plan.prerequisites).toContain('docker');
    expect(plan.prerequisites).toContain('aws');
    expect(plan.steps.length).toBe(6);

    const stepIds = plan.steps.map((s) => s.id);
    expect(stepIds).toEqual([
      'ecr-login',
      'create-ecr-repo',
      'docker-build',
      'docker-push',
      'register-task-def',
      'update-ecs-service',
    ]);

    expect(plan.steps[1]!.skipIf).toBeDefined();
    expect(plan.steps[1]!.rollbackCommand).toBeDefined();
    expect(plan.steps[5]!.destructive).toBe(true);
  });

  it('builds a valid EKS plan', () => {
    const config = MOCK_CONFIG(DeploymentTarget.AWS_EKS);
    const plan = buildDeployPlan(config, MOCK_META);

    expect(plan.target).toBe('aws_eks');
    expect(plan.region).toBe('us-west-2');
    expect(plan.prerequisites).toContain('kubectl');
    expect(plan.steps.length).toBe(7);

    const stepIds = plan.steps.map((s) => s.id);
    expect(stepIds).toEqual([
      'ecr-login',
      'create-ecr-repo',
      'docker-build',
      'docker-push',
      'update-kubeconfig',
      'k8s-apply',
      'k8s-rollout-status',
    ]);
  });

  it('builds a valid EC2 plan', () => {
    const config = MOCK_CONFIG(DeploymentTarget.AWS_EC2);
    const plan = buildDeployPlan(config, MOCK_META);

    expect(plan.target).toBe('aws_ec2');
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0]!.id).toBe('ec2-ssh-test');
    expect(plan.steps[1]!.id).toBe('ec2-deploy-app');
  });

  it('throws an error for unsupported targets', () => {
    const config = MOCK_CONFIG(DeploymentTarget.VERCEL);
    expect(() => buildDeployPlan(config, MOCK_META)).toThrow('Unsupported deployment target');
  });

  describe('helpers', () => {
    it('getEcrRegistry returns correct URL or placeholders', () => {
      expect(getEcrRegistry('123', 'us-east-1')).toBe('123.dkr.ecr.us-east-1.amazonaws.com');
      expect(getEcrRegistry(null, null)).toBe('<AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com');
    });

    it('getSafeProjectName normalizes names correctly', () => {
      expect(getSafeProjectName('/path/to/My_Project-Name!')).toBe('my-project-name-');
    });
  });
});
