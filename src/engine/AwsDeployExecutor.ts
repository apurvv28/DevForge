import { spawn, execSync } from 'child_process';
import { DeployPlan, DeployStep } from '../agent/aws/awsDeployPlan';
import { logger } from '../utils/logger';
import { sanitizePath } from '../utils/sanitizer';

export interface AwsDeployExecutorOptions {
  dryRun: boolean;
  autoApprove: boolean;
  confirmCallback?: (step: DeployStep) => Promise<boolean>;
}

export interface AwsDeployExecutionResult {
  success: boolean;
  executedStepsCount: number;
  error?: string;
}

export class AwsDeployExecutor {
  constructor(
    private readonly projectRoot: string,
    private readonly options: AwsDeployExecutorOptions,
  ) {}

  /**
   * Performs pre-flight checks: AWS login and prerequisites in PATH.
   */
  async checkPrerequisites(plan: DeployPlan): Promise<{ passed: boolean; error?: string }> {
    // 1. Check AWS login
    try {
      execSync('aws sts get-caller-identity', { stdio: 'ignore' });
    } catch {
      return {
        passed: false,
        error:
          'AWS CLI is not logged in. Run "aws configure" or configure AWS environment variables.',
      };
    }

    // 2. Check each prerequisite in the plan
    for (const prereq of plan.prerequisites) {
      if (!this.hasPrerequisite(prereq)) {
        return {
          passed: false,
          error: `Required tool "${prereq}" was not found in your system PATH. Please install it to proceed.`,
        };
      }
    }

    return { passed: true };
  }

  private hasPrerequisite(cmd: string): boolean {
    try {
      const searchCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
      execSync(searchCmd, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Executes the deployment plan step-by-step.
   */
  async execute(plan: DeployPlan): Promise<AwsDeployExecutionResult> {
    const executedSteps: DeployStep[] = [];

    // Pre-flight check
    if (!this.options.dryRun) {
      const prereqCheck = await this.checkPrerequisites(plan);
      if (!prereqCheck.passed) {
        return { success: false, executedStepsCount: 0, error: prereqCheck.error };
      }
    }

    for (const step of plan.steps) {
      const cwd = step.cwd ? sanitizePath(step.cwd, this.projectRoot) : this.projectRoot;

      // 1. Check if step should be skipped
      if (step.skipIf && !this.options.dryRun) {
        const shouldSkip = this.checkSkipIf(step.skipIf, cwd);
        if (shouldSkip) {
          logger.info(`[deploy] Skipping step: ${step.label} (pre-condition met)`);
          continue;
        }
      }

      // 2. Prompt for confirmation if required
      if (this.options.confirmCallback) {
        const approved = await this.options.confirmCallback(step);
        if (!approved) {
          logger.info(`[deploy] Deployment cancelled by user at step: ${step.label}`);
          await this.rollback(executedSteps);
          return {
            success: false,
            executedStepsCount: executedSteps.length,
            error: 'Cancelled by user',
          };
        }
      } else if (!this.options.autoApprove || step.destructive) {
        // If no callback, and we don't have auto-approve, or it's destructive, warn and abort if not dryRun
        if (!this.options.dryRun) {
          return {
            success: false,
            executedStepsCount: executedSteps.length,
            error: `Step "${step.label}" requires confirmation but no interactive prompt is available.`,
          };
        }
      }

      // 3. Execute step command
      logger.info(`\n[deploy] Executing step: ${step.label}`);
      logger.info(`$ ${step.command}`);

      if (this.options.dryRun) {
        logger.info(`[dry-run] Would execute command in ${cwd}`);
        executedSteps.push(step);
        continue;
      }

      const success = await this.runCommand(step.command, cwd, step.timeoutMs || 300_000);
      if (!success) {
        logger.error(`[deploy] Step failed: ${step.label}`);
        // At this point, caller should handle retry / abort.
        // We trigger rollback here for completed steps.
        await this.rollback(executedSteps);
        return {
          success: false,
          executedStepsCount: executedSteps.length,
          error: `Step failed: ${step.label}`,
        };
      }

      executedSteps.push(step);
    }

    return { success: true, executedStepsCount: executedSteps.length };
  }

  /**
   * Rolls back executed steps in reverse order.
   */
  async rollback(steps: DeployStep[]): Promise<void> {
    if (steps.length === 0) return;

    logger.warn('\n[deploy] Initiating rollback for executed steps...');
    const reversed = [...steps].reverse();

    for (const step of reversed) {
      if (step.rollbackCommand) {
        logger.info(`[rollback] Running rollback for: ${step.label}`);
        logger.info(`$ ${step.rollbackCommand}`);
        const cwd = step.cwd ? sanitizePath(step.cwd, this.projectRoot) : this.projectRoot;
        await this.runCommand(step.rollbackCommand, cwd, 180_000);
      }
    }
    logger.warn('[deploy] Rollback completed.');
  }

  private checkSkipIf(cmd: string, cwd: string): boolean {
    try {
      execSync(cmd, { cwd, stdio: 'ignore' });
      return true; // Command succeeded, meaning resource exists or condition met, so we SKIP
    } catch {
      return false; // Command failed, meaning resource doesn't exist, so we DO NOT skip
    }
  }

  private async runCommand(command: string, cwd: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const child = spawn(command, [], {
        cwd,
        shell: true,
        env: process.env,
      });

      const timeout = setTimeout(() => {
        if (!settled) {
          logger.warn(`[deploy] Command timed out after ${timeoutMs}ms. Terminating process.`);
          child.kill('SIGTERM');
          settled = true;
          resolve(false);
        }
      }, timeoutMs);

      child.stdout?.on('data', (data) => {
        process.stdout.write(data);
      });

      child.stderr?.on('data', (data) => {
        process.stderr.write(data);
      });

      child.on('error', (err) => {
        if (!settled) {
          logger.error(`[deploy] Process error: ${err.message}`);
          clearTimeout(timeout);
          settled = true;
          resolve(false);
        }
      });

      child.on('close', (code) => {
        if (!settled) {
          clearTimeout(timeout);
          settled = true;
          resolve(code === 0);
        }
      });
    });
  }
}
