import * as fs from 'fs/promises';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { logger } from '../utils/logger';
import { AwsDeployExecutor } from '../engine/AwsDeployExecutor';
import { DeployPlan, DeployStep } from '../agent/aws/awsDeployPlan';

export interface DeployCommandOptions {
  dryRun?: boolean;
  yes?: boolean;
  plan?: string;
}

export async function deployCommand(
  projectRoot: string,
  options: DeployCommandOptions = {},
): Promise<void> {
  const planPath = options.plan
    ? path.resolve(projectRoot, options.plan)
    : path.resolve(projectRoot, '.devforge/deploy-plan.json');

  // 1. Read deploy plan file
  let rawPlan: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    rawPlan = await fs.readFile(planPath, 'utf-8');
  } catch {
    logger.error(`\n✗ Deploy plan not found at: ${planPath}`);
    logger.info(
      'Please run "devforge init" first with an AWS target (aws_ecs, aws_eks, or aws_ec2) to generate the deployment plan.',
    );
    throw new Error('Deploy plan not found');
  }

  let plan: DeployPlan;
  try {
    plan = JSON.parse(rawPlan) as DeployPlan;
  } catch (err) {
    logger.error(
      `\n✗ Failed to parse deploy plan: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new Error('Invalid deploy plan format');
  }

  logger.info(
    chalk.bold(chalk.cyan(`\n🚀 Initializing AWS Deployment: ${plan.target.toUpperCase()}`)),
  );
  logger.info(`Region: ${plan.region}`);
  logger.info(`Steps count: ${plan.steps.length}`);
  if (options.dryRun) {
    logger.info(chalk.yellow('Mode: Dry Run (simulating commands without disk/AWS modification)'));
  }

  // 2. Define the step approval logic
  const confirmCallback = async (step: DeployStep): Promise<boolean> => {
    if (options.yes && !step.destructive) {
      logger.info(`[auto-approve] Proceeding with step: ${step.label}`);
      return true;
    }

    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: 'confirm',
        name: 'proceed',
        message: `${step.destructive ? chalk.red('[DESTRUCTIVE] ') : ''}Execute step "${chalk.cyan(step.label)}"?\nCommand: ${chalk.gray(step.command)}\nProceed?`,
        default: true,
      },
    ]);
    return proceed;
  };

  // 3. Initialize and execute
  const executor = new AwsDeployExecutor(projectRoot, {
    dryRun: !!options.dryRun,
    autoApprove: !!options.yes,
    confirmCallback,
  });

  const result = await executor.execute(plan);

  if (result.success) {
    logger.success(
      `\n✓ Deployment completed successfully! (${result.executedStepsCount}/${plan.steps.length} steps run)`,
    );
  } else {
    logger.error(`\n✗ Deployment failed: ${result.error}`);
    throw new Error(result.error || 'Deployment failed');
  }
}
