import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import inquirer from 'inquirer';
import { buildGenerationPlan } from '../../src/engine/ruleEngine';
import { renderTemplateFromArray } from '../../src/engine/templateRenderer';
import { getTemplate } from '../../src/templates';
import { DeploymentTarget, Framework, validateConfig } from '../../src/types';
import { updateCommand } from '../../src/cli/updateCommand';

jest.mock('inquirer');

const mockedInquirer = inquirer as jest.Mocked<typeof inquirer>;

describe('updateCommand', () => {
  let projectRoot: string;
  let logSpy: jest.SpyInstance;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devforge-update-'));
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await fs.rm(projectRoot, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('preserves custom blocks, skips unchanged files, and prints a diff for changed files', async () => {
    const config = validateConfig({
      projectRoot,
      detected: {
        framework: Framework.NEXTJS,
        packageManager: 'npm',
        nodeVersion: '20',
        hasDocker: false,
        hasTests: true,
        hasLinting: true,
        testCommand: 'npm test',
        buildCommand: 'npm run build',
        installCommand: 'npm ci',
        detectedAt: new Date().toISOString(),
      },
      user: {
        deploymentTarget: DeploymentTarget.VERCEL,
        branchStrategy: 'feature_main',
        dockerRequired: false,
        multiEnvironment: false,
        environments: [],
      },
      dryRun: false,
      generatedAt: new Date().toISOString(),
      devforgeVersion: '1.0.0',
    });

    const plan = buildGenerationPlan(config);
    const baseFile = plan.files.find((file) => file.templateId === 'base-ci');
    const deployFile = plan.files.find((file) => file.templateId === 'vercel-deploy');

    expect(baseFile).toBeDefined();
    expect(deployFile).toBeDefined();

    const baseContent = renderTemplateFromArray(getTemplate(baseFile!.templateId), baseFile!.variables);
    const deployRendered = renderTemplateFromArray(
      getTemplate(deployFile!.templateId),
      deployFile!.variables,
    );

    const preservedDeployContent = deployRendered.replace(
      '# @devforge-preserve-start: my-custom-step\n#   ... your custom YAML ...\n# @devforge-preserve-end: my-custom-step',
      '# @devforge-preserve-start: my-custom-step\n#   - name: preserved-step\n#     run: echo preserved\n# @devforge-preserve-end: my-custom-step',
    );

    const stalePlan = { ...plan, planHash: `stale-${plan.planHash}` };

    await fs.mkdir(path.join(projectRoot, '.devforge'), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, '.devforge', 'last-run.json'),
      JSON.stringify(
        {
          generationResult: { written: [], skipped: [], backed_up: [], errors: [] },
          planHash: stalePlan.planHash,
          timestamp: new Date().toISOString(),
          config,
        },
        null,
        2,
      ),
    );

    await fs.mkdir(path.join(projectRoot, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(projectRoot, baseFile!.path), baseContent);
    await fs.writeFile(
      path.join(projectRoot, deployFile!.path),
      preservedDeployContent.replace('name: Deploy to Vercel', 'name: Old Deploy to Vercel'),
    );

    mockedInquirer.prompt.mockResolvedValue({ apply: true });

    await updateCommand(projectRoot, { dryRun: false });

    const output = logSpy.mock.calls.flat().join('\n');
    expect(output).not.toContain(baseFile!.path);
    expect(output).toContain('-name: Old Deploy to Vercel');
    expect(output).toContain('+name: Deploy to Vercel');

    const updatedBase = await fs.readFile(path.join(projectRoot, baseFile!.path), 'utf8');
    const updatedDeploy = await fs.readFile(path.join(projectRoot, deployFile!.path), 'utf8');

    expect(updatedBase).toBe(baseContent);
    expect(updatedDeploy).toContain('# @devforge-preserve-start: my-custom-step');
    expect(updatedDeploy).toContain('echo preserved');
    expect(updatedDeploy).toContain('name: Deploy to Vercel');

    const lastRun = JSON.parse(
      await fs.readFile(path.join(projectRoot, '.devforge', 'last-run.json'), 'utf8'),
    );
    expect(lastRun.planHash).toBe(plan.planHash);
    expect(lastRun.config.projectRoot).toBe(projectRoot);
  });
});