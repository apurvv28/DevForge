import * as path from 'path';
import { DevForgeConfig, DeploymentTarget } from '../../types';
import { AwsCliMetadata } from './awsCliInspector';

export interface DeployStep {
  id: string;
  label: string;
  command: string;
  args?: string[]; // Optional if command is a full shell command string or contains pipelines
  cwd?: string;
  timeoutMs?: number;
  destructive: boolean;
  rollbackCommand?: string;
  skipIf?: string;
  retryable: boolean;
}

export interface DeployPlan {
  target: 'aws_ec2' | 'aws_ecs' | 'aws_eks';
  region: string;
  steps: DeployStep[];
  generatedAt: string;
  prerequisites: string[];
}

/**
 * Builds the ECR registry URL from the account ID and region.
 */
export function getEcrRegistry(accountId: string | null, region: string | null): string {
  const acc = accountId || '<AWS_ACCOUNT_ID>';
  const reg = region || '<AWS_REGION>';
  return `${acc}.dkr.ecr.${reg}.amazonaws.com`;
}

/**
 * Normalizes project folder name to a safe AWS resource name prefix.
 */
export function getSafeProjectName(projectRoot: string): string {
  const base = path.basename(projectRoot);
  return base.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

export function buildEcsDeployPlan(config: DevForgeConfig, meta: AwsCliMetadata): DeployPlan {
  const appName = getSafeProjectName(config.projectRoot);
  const region = meta.region || 'us-east-1';
  const accountId = meta.accountIdFull;
  const registry = getEcrRegistry(accountId, region);

  const steps: DeployStep[] = [
    {
      id: 'ecr-login',
      label: 'Authenticate Docker with Amazon ECR',
      command: `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry}`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'create-ecr-repo',
      label: 'Create ECR Repository',
      command: `aws ecr create-repository --repository-name ${appName} --region ${region}`,
      skipIf: `aws ecr describe-repositories --repository-names ${appName} --region ${region}`,
      destructive: false,
      retryable: true,
      rollbackCommand: `aws ecr delete-repository --repository-name ${appName} --region ${region} --force`,
    },
    {
      id: 'docker-build',
      label: 'Build Docker Image',
      command: `docker build -t ${registry}/${appName}:latest .`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'docker-push',
      label: 'Push Docker Image to ECR',
      command: `docker push ${registry}/${appName}:latest`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'register-task-def',
      label: 'Register ECS Task Definition',
      command: `aws ecs register-task-definition --cli-input-json file://ecs/task-definition.json --region ${region}`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'update-ecs-service',
      label: 'Update ECS Service',
      command: `aws ecs update-service --cluster ${appName}-cluster --service ${appName}-service --task-definition ${appName}-task --region ${region}`,
      destructive: true,
      retryable: true,
    },
  ];

  return {
    target: 'aws_ecs',
    region,
    steps,
    generatedAt: new Date().toISOString(),
    prerequisites: ['aws', 'docker'],
  };
}

export function buildEksDeployPlan(config: DevForgeConfig, meta: AwsCliMetadata): DeployPlan {
  const appName = getSafeProjectName(config.projectRoot);
  const region = meta.region || 'us-east-1';
  const accountId = meta.accountIdFull;
  const registry = getEcrRegistry(accountId, region);
  const clusterName = meta.eksClusterNames[0] || `${appName}-cluster`;

  const steps: DeployStep[] = [
    {
      id: 'ecr-login',
      label: 'Authenticate Docker with Amazon ECR',
      command: `aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${registry}`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'create-ecr-repo',
      label: 'Create ECR Repository',
      command: `aws ecr create-repository --repository-name ${appName} --region ${region}`,
      skipIf: `aws ecr describe-repositories --repository-names ${appName} --region ${region}`,
      destructive: false,
      retryable: true,
      rollbackCommand: `aws ecr delete-repository --repository-name ${appName} --region ${region} --force`,
    },
    {
      id: 'docker-build',
      label: 'Build Docker Image',
      command: `docker build -t ${registry}/${appName}:latest .`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'docker-push',
      label: 'Push Docker Image to ECR',
      command: `docker push ${registry}/${appName}:latest`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'update-kubeconfig',
      label: 'Update local kubeconfig for EKS Cluster',
      command: `aws eks update-kubeconfig --name ${clusterName} --region ${region}`,
      destructive: false,
      retryable: true,
    },
    {
      id: 'k8s-apply',
      label: 'Apply Kubernetes Resource Manifests',
      command: `kubectl apply -f k8s/`,
      destructive: true,
      retryable: true,
      rollbackCommand: `kubectl delete -f k8s/ --ignore-not-found=true`,
    },
    {
      id: 'k8s-rollout-status',
      label: 'Verify Kubernetes Rollout Status',
      command: `kubectl rollout status deployment/${appName} --timeout=120s`,
      destructive: false,
      retryable: true,
    },
  ];

  return {
    target: 'aws_eks',
    region,
    steps,
    generatedAt: new Date().toISOString(),
    prerequisites: ['aws', 'docker', 'kubectl'],
  };
}

export function buildEc2DeployPlan(config: DevForgeConfig, meta: AwsCliMetadata): DeployPlan {
  const region = meta.region || 'us-east-1';

  // EC2 deployment is SSH-based, requiring host variables.
  // We provide placeholder commands to deploy code via SSH.
  const steps: DeployStep[] = [
    {
      id: 'ec2-ssh-test',
      label: 'Verify SSH Connectivity to EC2 Host',
      command:
        'ssh -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i ${AWS_EC2_SSH_KEY} ${AWS_EC2_USERNAME}@${AWS_EC2_HOST} "echo SSH Success"',
      destructive: false,
      retryable: true,
    },
    {
      id: 'ec2-deploy-app',
      label: 'Run Remote Deployment Commands via SSH',
      command:
        'ssh -i ${AWS_EC2_SSH_KEY} ${AWS_EC2_USERNAME}@${AWS_EC2_HOST} "cd ~/app && git pull origin main && npm install && npm run build && pm2 restart app || pm2 start dist/index.js --name app"',
      destructive: true,
      retryable: true,
    },
  ];

  return {
    target: 'aws_ec2',
    region,
    steps,
    generatedAt: new Date().toISOString(),
    prerequisites: ['aws', 'ssh'],
  };
}

export function buildDeployPlan(config: DevForgeConfig, meta: AwsCliMetadata): DeployPlan {
  const target = config.user.deploymentTarget;
  switch (target) {
    case DeploymentTarget.AWS_ECS:
      return buildEcsDeployPlan(config, meta);
    case DeploymentTarget.AWS_EKS:
      return buildEksDeployPlan(config, meta);
    case DeploymentTarget.AWS_EC2:
      return buildEc2DeployPlan(config, meta);
    default:
      throw new Error(`Unsupported deployment target for AWS automation: ${target}`);
  }
}
