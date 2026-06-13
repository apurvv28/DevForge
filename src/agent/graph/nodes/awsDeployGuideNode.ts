import inquirer from 'inquirer';
import { DevForgeConfig, DeploymentTarget } from '../../../types';
import { DevForgeFS } from '../../../utils/fs';
import { logger } from '../../../utils/logger';
import { LLMProvider } from '../../providers/types';
import { inspectAwsCli, safeMetadataForLlm, AwsCliMetadata } from '../../aws/awsCliInspector';
import { buildDeployPlan } from '../../aws/awsDeployPlan';

const AWS_TARGETS = new Set<string>([
  DeploymentTarget.AWS_EC2,
  DeploymentTarget.AWS_ECS,
  DeploymentTarget.AWS_EKS,
]);

function targetLabel(target: string): string {
  const labels: Record<string, string> = {
    aws_ec2: 'EC2',
    aws_ecs: 'ECS (Fargate)',
    aws_eks: 'EKS',
  };
  // eslint-disable-next-line security/detect-object-injection
  return labels[target] ?? target;
}

function buildPrompt(
  target: string,
  meta: Record<string, unknown>,
  framework: string,
  iacTool: string | undefined,
  environments: string[],
): string {
  return `You are a DevOps expert. Generate a complete, step-by-step AWS deployment guide in Markdown.

## Context (non-sensitive metadata only)
- Deployment target: ${targetLabel(target)}
- Framework: ${framework}
- IaC tool: ${iacTool ?? 'none specified'}
- Environments: ${environments.length > 0 ? environments.join(', ') : 'production'}
- AWS region: ${meta.region}
- AWS account suffix: ${meta.accountIdSuffix}
- Caller ARN (masked): ${meta.callerArn}
- Default VPC ID: ${meta.defaultVpcId}
- Availability zones: ${JSON.stringify(meta.availabilityZones)}
${meta.eksClusterNames && (meta.eksClusterNames as string[]).length > 0 ? `- Existing EKS clusters: ${JSON.stringify(meta.eksClusterNames)}` : ''}
${meta.ecsClusterArns && (meta.ecsClusterArns as string[]).length > 0 ? `- Existing ECS clusters: ${JSON.stringify(meta.ecsClusterArns)}` : ''}

## Requirements
1. Use the actual region and VPC from the metadata above in all commands.
2. Include ALL CLI commands needed from start to finish — do not skip steps.
3. Use placeholder values like <YOUR_VALUE> only for things that cannot be inferred.
4. Include a "Prerequisites" section listing what needs to be installed/configured.
5. Include a "GitHub Actions Secrets" section listing exactly which secrets to add.
6. Include a "Verification" section with commands to confirm successful deployment.
7. Structure: Prerequisites → Infrastructure Setup → Docker Build & Push → Deploy → Verify → Rollback.
8. NEVER include AWS access keys, secret keys, or any credentials in the output.
9. Keep commands copy-pasteable and accurate for the given region.

Output ONLY the Markdown document, starting with # AWS Deployment Guide.`;
}

export async function runAwsDeployGuideNode(
  config: DevForgeConfig,
  fs: DevForgeFS,
  provider: LLMProvider,
): Promise<void> {
  const target = config.user.deploymentTarget;

  if (!AWS_TARGETS.has(target)) return;

  logger.info(`[aws-guide] Checking AWS CLI login for ${targetLabel(target)}...`);

  const meta = await inspectAwsCli(target as 'aws_ec2' | 'aws_ecs' | 'aws_eks');

  if (!meta.isLoggedIn) {
    logger.warn('[aws-guide] AWS CLI not logged in — generating guide with placeholder values.');
    await generateAndWrite(config, fs, provider, meta);
    return;
  }

  logger.info(
    `[aws-guide] Detected AWS account suffix: ${meta.accountIdSuffix}, region: ${meta.region}`,
  );

  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: 'confirm',
      name: 'proceed',
      message: `DevForge can generate a personalised AWS deployment guide using your detected region (${meta.region ?? 'unknown'}) and VPC. Non-sensitive metadata only will be sent to the LLM. Proceed?`,
      default: true,
    },
  ]);

  if (!proceed) {
    logger.info('[aws-guide] Skipped AWS deployment guide generation.');
    return;
  }

  await generateAndWrite(config, fs, provider, meta);
}

async function generateAndWrite(
  config: DevForgeConfig,
  fs: DevForgeFS,
  provider: LLMProvider,
  meta: AwsCliMetadata,
): Promise<void> {
  const safeMeta = safeMetadataForLlm(meta);
  const prompt = buildPrompt(
    config.user.deploymentTarget,
    safeMeta,
    config.detected.framework,
    config.user.iacTool,
    config.user.environments,
  );

  logger.info('[aws-guide] Generating AWS deployment guide via LLM...');

  let guideContent: string;
  try {
    guideContent = await provider.chat([{ role: 'user', content: prompt }], {
      maxTokens: 4096,
      temperature: 0.2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[aws-guide] LLM call failed (${msg}), writing placeholder guide.`);
    guideContent = buildPlaceholderGuide(config.user.deploymentTarget, meta.region);
  }

  await fs.ensureDir('.devforge');
  await fs.writeFile('.devforge/AWS_DEPLOYMENT_GUIDE.md', guideContent);
  logger.success('[aws-guide] ✓ .devforge/AWS_DEPLOYMENT_GUIDE.md created');

  try {
    const deployPlan = buildDeployPlan(config, meta);
    await fs.writeFile('.devforge/deploy-plan.json', JSON.stringify(deployPlan, null, 2));
    logger.success('[aws-guide] ✓ .devforge/deploy-plan.json created');
  } catch (planErr) {
    const msg = planErr instanceof Error ? planErr.message : String(planErr);
    logger.warn(`[aws-guide] Failed to generate deploy-plan.json: ${msg}`);
  }
}

function buildPlaceholderGuide(target: string, region: string | null): string {
  return `# AWS Deployment Guide

> Generated by DevForge (offline fallback — LLM unavailable)

## Target: ${targetLabel(target)}
## Region: ${region ?? '<YOUR_REGION>'}

Please re-run \`devforge init\` with a configured LLM provider to get a fully populated guide,
or follow the official AWS documentation for ${targetLabel(target)} deployments.

## GitHub Actions Secrets Required
See \`.devforge/SECRETS_REQUIRED.md\` for the full list.
`;
}
