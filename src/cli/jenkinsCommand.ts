/* eslint-disable n/no-unsupported-features/node-builtins */
import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { sanitizeString } from '../utils/sanitizer';
import { JenkinsClient } from '../utils/jenkinsClient';
import { detectGitRemoteUrl, detectCurrentBranch, parseGitRemote } from '../utils/git';
import { getTemplate } from '../templates';
import { renderTemplate } from '../engine/templateRenderer';

export interface JenkinsSetupOptions {
  jobName?: string;
  jenkinsUrl?: string;
  jenkinsUser?: string;
  jenkinsToken?: string;
  credentialsId?: string;
  branch?: string;
  overwrite?: boolean;
}

/**
 * `devforge jenkins setup` — automated Jenkins job creation and GitHub webhook wiring.
 */
export async function jenkinsSetupCommand(
  projectRoot: string,
  options: JenkinsSetupOptions = {},
): Promise<void> {
  logger.info('\n🔧 DevForge Jenkins Setup\n');

  // ── Step 1: Gather Jenkins credentials ──────────────────────────────
  const jenkinsUrl = options.jenkinsUrl ?? (await promptJenkinsUrl());
  const jenkinsUser = options.jenkinsUser ?? (await promptJenkinsUser());
  const jenkinsToken = options.jenkinsToken ?? (await promptJenkinsToken());

  // ── Step 2: Detect Git remote and branch ────────────────────────────
  logger.info('Detecting Git repository...');
  const remoteUrl = detectGitRemoteUrl();
  if (!remoteUrl) {
    logger.error(
      'Could not detect Git remote URL. Make sure this is a Git repository with an origin remote.',
    );
    process.exitCode = 1;
    return;
  }

  const gitInfo = parseGitRemote(remoteUrl);
  if (!gitInfo) {
    logger.error(`Could not parse Git remote URL: ${remoteUrl}`);
    process.exitCode = 1;
    return;
  }

  const branch = options.branch ?? detectCurrentBranch();
  const credentialsId = options.credentialsId ?? 'github-credentials';

  logger.info(`  Repository: ${gitInfo.owner}/${gitInfo.repo}`);
  logger.info(`  Branch:     ${branch}`);
  logger.info(`  Remote URL: ${gitInfo.url}`);

  // ── Step 3: Determine job name ──────────────────────────────────────
  const jobName = options.jobName ?? gitInfo.repo;
  logger.info(`  Job Name:   ${jobName}\n`);

  // ── Step 4: Render config.xml ───────────────────────────────────────
  logger.info('Rendering Jenkins job configuration...');
  const template = getTemplate('jenkins-job-config');
  const variables = new Map<string, string>([
    ['githubOwner', gitInfo.owner],
    ['githubRepo', gitInfo.repo],
    ['gitRemoteUrl', gitInfo.url],
    ['jenkinsCredentialsId', credentialsId],
    ['branch', branch],
  ]);
  const configXml = renderTemplate(template, variables);

  // ── Step 5: Connect to Jenkins and create/update the job ────────────
  logger.info(`Connecting to Jenkins at ${jenkinsUrl}...`);
  const client = new JenkinsClient({
    url: jenkinsUrl,
    username: jenkinsUser,
    apiToken: jenkinsToken,
  });

  const crumb = await client.getCrumb();
  if (crumb) {
    logger.info('  CSRF crumb acquired');
  } else {
    logger.info('  No CSRF crumb (crumb issuer may be disabled)');
  }

  const exists = await client.jobExists(jobName);

  if (exists) {
    if (!options.overwrite) {
      const { confirmOverwrite } = await inquirer.prompt<{ confirmOverwrite: boolean }>([
        {
          type: 'confirm',
          name: 'confirmOverwrite',
          message: `Job "${jobName}" already exists. Overwrite its configuration?`,
          default: false,
        },
      ]);

      if (!confirmOverwrite) {
        logger.info('Setup cancelled — existing job not modified.');
        return;
      }
    }

    logger.info(`Updating existing job "${jobName}"...`);
    const updated = await client.updateJob(jobName, configXml);
    if (!updated) {
      logger.error(
        'Failed to update Jenkins job. Check Jenkins URL, credentials, and permissions.',
      );
      process.exitCode = 1;
      return;
    }
    logger.success(`Job "${jobName}" updated successfully.`);
  } else {
    logger.info(`Creating new job "${jobName}"...`);
    const created = await client.createJob(jobName, configXml);
    if (!created) {
      logger.error(
        'Failed to create Jenkins job. Check Jenkins URL, credentials, and permissions.',
      );
      process.exitCode = 1;
      return;
    }
    logger.success(`Job "${jobName}" created successfully.`);
  }

  // ── Step 6: Register GitHub webhook (optional) ──────────────────────
  const githubToken = process.env.GITHUB_TOKEN ?? null;
  if (githubToken) {
    await registerGitHubWebhook(githubToken, gitInfo.owner, gitInfo.repo, jenkinsUrl);
  } else {
    logger.info('\n💡 No GITHUB_TOKEN found — skipping webhook registration.');
    logger.info('   To auto-register webhooks, set the GITHUB_TOKEN environment variable.');
  }

  // ── Step 7: Trigger initial build ───────────────────────────────────
  logger.info('\nTriggering initial build...');
  const triggered = await client.triggerBuild(jobName);
  if (triggered) {
    logger.success('Initial build triggered.');
  } else {
    logger.warn('Could not trigger initial build. You may need to start it manually.');
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const jobUrl = `${jenkinsUrl}/job/${encodeURIComponent(jobName)}/`;
  logger.info('\n┌' + '─'.repeat(60) + '┐');
  logger.info('│  ✓ Jenkins Setup Complete' + ' '.repeat(35) + '│');
  logger.info('└' + '─'.repeat(60) + '┘');
  logger.info(`\n  Job URL: ${jobUrl}`);
  logger.info(`  SCM:     ${gitInfo.url} (branch: ${branch})`);
  logger.info(`  Webhook: ${githubToken ? 'Registered' : 'Skipped (no GITHUB_TOKEN)'}\n`);
}

// ── Prompt helpers ────────────────────────────────────────────────────

async function promptJenkinsUrl(): Promise<string> {
  const { url } = await inquirer.prompt<{ url: string }>([
    {
      type: 'input',
      name: 'url',
      message: 'Jenkins controller URL (e.g. http://localhost:8080):',
      validate: (input: string) => {
        const trimmed = input.trim();
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          return 'URL must start with http:// or https://';
        }
        return true;
      },
    },
  ]);
  return sanitizeString(url.trim(), 512);
}

async function promptJenkinsUser(): Promise<string> {
  const { user } = await inquirer.prompt<{ user: string }>([
    {
      type: 'input',
      name: 'user',
      message: 'Jenkins username:',
      default: 'admin',
    },
  ]);
  return sanitizeString(user.trim(), 256);
}

async function promptJenkinsToken(): Promise<string> {
  const { token } = await inquirer.prompt<{ token: string }>([
    {
      type: 'password',
      name: 'token',
      message: 'Jenkins API token (or password):',
    },
  ]);
  return sanitizeString(token.trim(), 512);
}

// ── GitHub webhook registration ───────────────────────────────────────

async function registerGitHubWebhook(
  githubToken: string,
  owner: string,
  repo: string,
  jenkinsUrl: string,
): Promise<void> {
  const webhookUrl = `${jenkinsUrl.replace(/\/+$/, '')}/github-webhook/`;

  logger.info(`\nRegistering GitHub webhook → ${webhookUrl}`);

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push', 'pull_request'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          insecure_ssl: '0',
        },
      }),
    });

    if (res.status === 201) {
      logger.success('GitHub webhook registered successfully.');
    } else if (res.status === 422) {
      // 422 typically means webhook already exists
      logger.info('Webhook already exists for this repository.');
    } else {
      const body = await res.text().catch(() => '');
      logger.warn(`Webhook registration returned ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    logger.warn(`Webhook registration failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
