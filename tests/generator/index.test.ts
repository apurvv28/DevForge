import { runGenerator, GenerationResult } from '../../src/generator';
import { GenerationPlan } from '../../src/engine/ruleEngine';
import { DevForgeFS } from '../../src/utils/fs';
import { DeploymentTarget, Framework } from '../../src/types';
import * as templateModule from '../../src/templates';
import * as rendererModule from '../../src/engine/templateRenderer';
import inquirer from 'inquirer';

// Mock modules
jest.mock('../../src/templates');
jest.mock('../../src/engine/templateRenderer');
jest.mock('inquirer');

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Generator Module', () => {
  let mockFs: jest.Mocked<DevForgeFS>;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock DevForgeFS with async methods
    mockFs = {
      fileExists: jest.fn().mockResolvedValue(false),
      readFile: jest.fn().mockResolvedValue(''),
      writeFile: jest.fn().mockResolvedValue(undefined),
      ensureDir: jest.fn().mockResolvedValue(undefined),
      projectRoot: '/',
      dryRun: false,
    } as any;

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    // Default mock responses
    (templateModule.getTemplate as jest.Mock).mockReturnValue(
      'template content',
    );
    (rendererModule.renderTemplate as jest.Mock).mockReturnValue(
      'rendered content',
    );
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────────
  // Basic File Generation Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Basic File Generation', () => {
    it('should generate a single file successfully', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [{ key: 'nodeVersion', value: '18' }],
          },
        ],
        planHash: 'test123',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const result = await runGenerator(plan, mockFs);

      expect(result.written).toContain('.github/workflows/ci.yml');
      expect(result.skipped.length).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(mockFs.ensureDir).toHaveBeenCalledWith('.github/workflows');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.github/workflows/ci.yml',
        'rendered content',
      );
    });

    it('should generate multiple files', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-node',
            variables: [],
          },
          {
            path: 'docker-compose.yml',
            templateId: 'docker-compose',
            variables: [],
          },
        ],
        planHash: 'test456',
        framework: Framework.EXPRESS,
        deploymentTarget: DeploymentTarget.DOCKER,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const result = await runGenerator(plan, mockFs);

      expect(result.written.length).toBe(3);
      expect(result.written).toContain('.github/workflows/ci.yml');
      expect(result.written).toContain('Dockerfile');
      expect(result.written).toContain('docker-compose.yml');
      expect(mockFs.writeFile).toHaveBeenCalledTimes(4); // 3 files + last-run.json
    });

    it('should handle empty plan', async () => {
      const plan: GenerationPlan = {
        files: [],
        planHash: 'empty',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const result = await runGenerator(plan, mockFs);

      expect(result.written.length).toBe(0);
      expect(result.skipped.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('should handle null plan', async () => {
      const result = await runGenerator(null as any, mockFs);

      expect(result.written.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // File Conflict Handling Tests
  // ─────────────────────────────────────────────────────────────────

  describe('File Conflict Handling', () => {
    it('should skip file when user chooses skip', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'conflict1',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.fileExists.mockResolvedValue(true);
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({
        action: 'skip',
      });

      const result = await runGenerator(plan, mockFs);

      expect(result.skipped).toContain('.github/workflows/ci.yml');
      expect(result.written.length).toBe(0);
      // Only last-run.json written, not the skipped file
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    });

    it('should overwrite file when user chooses overwrite', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'conflict2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.fileExists.mockResolvedValue(true);
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({
        action: 'overwrite',
      });

      const result = await runGenerator(plan, mockFs);

      expect(result.written).toContain('.github/workflows/ci.yml');
      expect(result.backed_up.length).toBe(0);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.github/workflows/ci.yml',
        'rendered content',
      );
    });

    it('should backup and overwrite file when user chooses backup', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'conflict3',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.fileExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue('existing content');
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({
        action: 'backup',
      });

      const result = await runGenerator(plan, mockFs);

      expect(result.backed_up).toContain('.github/workflows/ci.yml');
      expect(result.written).toContain('.github/workflows/ci.yml');
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.github/workflows/ci.yml.devforge.bak',
        'existing content',
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.github/workflows/ci.yml',
        'rendered content',
      );
    });

    it('should prompt user for each conflicting file', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'file1.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file2.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'conflict4',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.fileExists.mockResolvedValue(true);
      (inquirer.prompt as unknown as jest.Mock)
        .mockResolvedValueOnce({ action: 'skip' })
        .mockResolvedValueOnce({ action: 'overwrite' });

      const result = await runGenerator(plan, mockFs);

      expect(result.skipped).toContain('file1.yml');
      expect(result.written).toContain('file2.yml');
      expect(inquirer.prompt).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Template Rendering Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Template Rendering', () => {
    it('should render template with variables', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [
              { key: 'nodeVersion', value: '18' },
              { key: 'packageManager', value: 'npm' },
            ],
          },
        ],
        planHash: 'render1',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      const mockRenderer = rendererModule.renderTemplate as jest.Mock;
      mockRenderer.mockReturnValue('rendered with variables');

      await runGenerator(plan, mockFs);

      expect(mockRenderer).toHaveBeenCalledWith(
        'template content',
        expect.any(Map),
      );
    });

    it('should handle template rendering errors', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'render2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      (rendererModule.renderTemplate as jest.Mock).mockImplementation(() => {
        throw new Error('Undefined variable: missingVar');
      });

      const result = await runGenerator(plan, mockFs);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toBeDefined();
      expect(result.errors[0]!.path).toBe('.github/workflows/ci.yml');
      expect(result.errors[0]!.error).toContain('Undefined variable');
      expect(result.written.length).toBe(0);
    });

    it('should handle missing template', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'nonexistent',
            variables: [],
          },
        ],
        planHash: 'render3',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      (templateModule.getTemplate as jest.Mock).mockImplementation(() => {
        throw new Error('Template not found: nonexistent');
      });

      const result = await runGenerator(plan, mockFs);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toBeDefined();
      expect(result.errors[0]!.error).toContain('Template not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Error Handling and Recovery Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Error Handling and Recovery', () => {
    it('should continue after file write error', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'file1.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file2.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'error1',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.writeFile
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(undefined);

      const result = await runGenerator(plan, mockFs);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toBeDefined();
      expect(result.errors[0]!.path).toBe('file1.yml');
      // Second file should still be written
      expect(result.written).toContain('file2.yml');
    });

    it('should handle backup creation failure gracefully', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'error2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.fileExists.mockResolvedValue(true);
      mockFs.readFile.mockRejectedValue(new Error('Read permission denied'));
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({
        action: 'backup',
      });

      const result = await runGenerator(plan, mockFs);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toBeDefined();
      expect(result.errors[0]!.error).toContain('Failed to create backup');
    });

    it('should handle directory creation failure', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'error3',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.ensureDir.mockRejectedValue(new Error('Directory creation failed'));

      const result = await runGenerator(plan, mockFs);

      // Error should be caught and recorded
      expect(result.errors.length).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Last-Run Metadata Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Last-Run Metadata', () => {
    it('should write last-run.json metadata', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'metadata1',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      await runGenerator(plan, mockFs);

      expect(mockFs.ensureDir).toHaveBeenCalledWith('.devforge');
      // Find the call to writeFile for last-run.json
      const calls = (mockFs.writeFile as jest.Mock).mock.calls;
      const lastRunCall = calls.find((call) =>
        call[0].includes('last-run.json'),
      );
      expect(lastRunCall).toBeDefined();
      expect(lastRunCall![0]).toBe('.devforge/last-run.json');

      // Verify metadata structure
      const metadata = JSON.parse(lastRunCall![1]);
      expect(metadata.planHash).toBe('metadata1');
      expect(metadata.timestamp).toBeDefined();
      expect(metadata.generationResult).toBeDefined();
    });

    it('should include correct result data in metadata', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'file1.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file2.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'metadata2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      mockFs.fileExists
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      (inquirer.prompt as unknown as jest.Mock).mockResolvedValue({
        action: 'skip',
      });

      await runGenerator(plan, mockFs);

      const calls = (mockFs.writeFile as jest.Mock).mock.calls;
      const lastRunCall = calls.find((call) =>
        call[0].includes('last-run.json'),
      );
      const metadata = JSON.parse(lastRunCall![1]);

      expect(metadata.generationResult.written).toContain('file1.yml');
      expect(metadata.generationResult.skipped).toContain('file2.yml');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Summary Display Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Summary Display', () => {
    it('should display generation summary', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'summary1',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      await runGenerator(plan, mockFs);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated 1 file'),
      );
    });

    it('should show plural files in summary', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'file1.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file2.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'summary2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      await runGenerator(plan, mockFs);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Generated 2 files'),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Integration Tests
  // ─────────────────────────────────────────────────────────────────

  describe('Integration Tests', () => {
    it('should handle real-world generation scenario', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: '.github/workflows/ci.yml',
            templateId: 'base-ci',
            variables: [
              { key: 'nodeVersion', value: '18' },
              { key: 'packageManager', value: 'npm' },
            ],
          },
          {
            path: '.github/workflows/deploy.yml',
            templateId: 'vercel-deploy',
            variables: [
              { key: 'nodeVersion', value: '18' },
              { key: 'framework', value: 'nextjs' },
            ],
          },
          {
            path: 'Dockerfile',
            templateId: 'dockerfile-nextjs',
            variables: [{ key: 'nodeVersion', value: '18' }],
          },
        ],
        planHash: 'integration1',
        framework: Framework.NEXTJS,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      (templateModule.getTemplate as jest.Mock).mockReturnValue(
        'template content',
      );
      (rendererModule.renderTemplate as jest.Mock).mockReturnValue(
        'rendered yaml content',
      );

      const result = await runGenerator(plan, mockFs);

      expect(result.written.length).toBe(3);
      expect(result.skipped.length).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(mockFs.ensureDir).toHaveBeenCalledWith('.github/workflows');
    });

    it('should handle mixed success and failure scenario', async () => {
      const plan: GenerationPlan = {
        files: [
          {
            path: 'file1.yml',
            templateId: 'base-ci',
            variables: [],
          },
          {
            path: 'file2.yml',
            templateId: 'broken',
            variables: [],
          },
          {
            path: 'file3.yml',
            templateId: 'base-ci',
            variables: [],
          },
        ],
        planHash: 'integration2',
        framework: Framework.REACT,
        deploymentTarget: DeploymentTarget.VERCEL,
        generatedAt: new Date().toISOString(),
        devforgeVersion: '1.0.0',
      };

      (templateModule.getTemplate as jest.Mock)
        .mockReturnValueOnce('template content')
        .mockImplementationOnce(() => {
          throw new Error('Template not found');
        })
        .mockReturnValueOnce('template content');

      const result = await runGenerator(plan, mockFs);

      expect(result.written.length).toBe(2);
      expect(result.errors.length).toBe(1);
      // Should have successfully written file1 and file3 despite file2 error
      expect(result.written).toContain('file1.yml');
      expect(result.written).toContain('file3.yml');
    });
  });
});
