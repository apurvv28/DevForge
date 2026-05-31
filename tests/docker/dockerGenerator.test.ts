import { generateDockerFiles, hasDockerFiles, getDockerfileTemplate } from '../../src/docker/dockerGenerator';
import { GenerationPlan, PlannedFile, TemplateVariable } from '../../src/engine/ruleEngine';
import { DevForgeFS } from '../../src/utils/fs';
import { Framework, DeploymentTarget } from '../../src/types';

/**
 * Mock DevForgeFS for Docker generator tests
 */
class MockDevForgeFS implements Partial<DevForgeFS> {
  private files: Map<string, string> = new Map();

  async writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
  }

  async readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (!content) {
      throw new Error(`File not found: ${filePath}`);
    }
    return content;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return this.files.has(filePath);
  }

  getContent(filePath: string): string | undefined {
    return this.files.get(filePath);
  }

  getAllFiles(): Map<string, string> {
    return this.files;
  }
}

/**
 * Helper to create test GenerationPlan
 */
function createTestPlan(
  framework: Framework,
  dockerFiles: string[] = ['Dockerfile', 'docker-compose.yml', '.dockerignore'],
): GenerationPlan {
  const files: PlannedFile[] = dockerFiles.map((path) => ({
    path,
    templateId:
      path === 'Dockerfile'
        ? framework === Framework.NEXTJS
          ? 'dockerfile-nextjs'
          : 'dockerfile-node'
        : path === 'docker-compose.yml'
          ? 'docker-compose'
          : 'dockerignore',
    variables: [
      { key: 'nodeVersion', value: '18' },
      { key: 'packageManager', value: 'npm' },
      { key: 'framework', value: framework },
      { key: 'installCommand', value: 'npm install' },
      { key: 'buildCommand', value: 'npm run build' },
      { key: 'testCommand', value: 'npm test' },
    ],
  }));

  return {
    files,
    planHash: 'test-hash',
    framework,
    deploymentTarget: DeploymentTarget.DOCKER,
    generatedAt: new Date().toISOString(),
    devforgeVersion: '1.0.0',
  };
}

describe('Docker Generator', () => {
  let mockFs: MockDevForgeFS;

  beforeEach(() => {
    mockFs = new MockDevForgeFS();
  });

  describe('generateDockerFiles', () => {
    it('should generate Dockerfile for Node.js applications', async () => {
      const plan = createTestPlan(Framework.EXPRESS, ['Dockerfile']);

      const result = await generateDockerFiles(plan, mockFs as any);

      expect(result.generated).toContain('Dockerfile');
      expect(result.errors).toHaveLength(0);

      const dockerfile = mockFs.getContent('Dockerfile');
      expect(dockerfile).toBeDefined();
      expect(dockerfile).toContain('FROM node:18-alpine');
      expect(dockerfile).toContain('USER nodejs');
      expect(dockerfile).toContain('adduser -S nodejs');
      expect(dockerfile).toContain('EXPOSE 3000');
      expect(dockerfile).toContain('dumb-init');
    });

    it('should generate Dockerfile for Next.js applications', async () => {
      const plan = createTestPlan(Framework.NEXTJS, ['Dockerfile']);
      if (plan.files[0]) {
        plan.files[0].templateId = 'dockerfile-nextjs';
      }

      const result = await generateDockerFiles(plan, mockFs as any);

      expect(result.generated).toContain('Dockerfile');
      const dockerfile = mockFs.getContent('Dockerfile');
      expect(dockerfile).toContain('FROM node:18-alpine');
      expect(dockerfile).toContain('USER nodejs');
      expect(dockerfile).toContain('.next');
    });

    it('should generate docker-compose.yml', async () => {
      const plan = createTestPlan(Framework.EXPRESS, ['docker-compose.yml']);

      const result = await generateDockerFiles(plan, mockFs as any);

      expect(result.generated).toContain('docker-compose.yml');
      const compose = mockFs.getContent('docker-compose.yml');
      expect(compose).toBeDefined();
      expect(compose).toContain('version: \'3.8\'');
      expect(compose).toContain('services:');
      expect(compose).toContain('app:');
      expect(compose).toContain('redis:');
    });

    it('should generate .dockerignore', async () => {
      const plan = createTestPlan(Framework.EXPRESS, ['.dockerignore']);

      const result = await generateDockerFiles(plan, mockFs as any);

      expect(result.generated).toContain('.dockerignore');
      const dockerignore = mockFs.getContent('.dockerignore');
      expect(dockerignore).toBeDefined();
      expect(dockerignore).toContain('node_modules');
      expect(dockerignore).toContain('.git');
      expect(dockerignore).toContain('.env');
      expect(dockerignore).toContain('coverage');
    });

    it('should generate all three Docker files', async () => {
      const plan = createTestPlan(Framework.EXPRESS);

      const result = await generateDockerFiles(plan, mockFs as any);

      expect(result.generated).toHaveLength(3);
      expect(result.generated).toContain('Dockerfile');
      expect(result.generated).toContain('docker-compose.yml');
      expect(result.generated).toContain('.dockerignore');
    });

    it('should use multi-stage Dockerfile for optimized builds', async () => {
      const plan = createTestPlan(Framework.EXPRESS, ['Dockerfile']);

      const result = await generateDockerFiles(plan, mockFs as any);

      const dockerfile = mockFs.getContent('Dockerfile');
      expect(dockerfile).toContain('FROM node:18-alpine AS builder');
      expect(dockerfile).toContain('FROM node:18-alpine');
      expect(dockerfile).toContain('COPY --from=builder');
    });

    it('should include health checks in Dockerfile', async () => {
      const plan = createTestPlan(Framework.EXPRESS, ['Dockerfile']);

      const result = await generateDockerFiles(plan, mockFs as any);

      const dockerfile = mockFs.getContent('Dockerfile');
      expect(dockerfile).toContain('HEALTHCHECK');
      expect(dockerfile).toContain('--interval=30s');
      expect(dockerfile).toContain('--timeout=3s');
    });

    it('should set up non-root user correctly', async () => {
      const plan = createTestPlan(Framework.EXPRESS, ['Dockerfile']);

      const result = await generateDockerFiles(plan, mockFs as any);

      const dockerfile = mockFs.getContent('Dockerfile');
      expect(dockerfile).toContain('addgroup');
      expect(dockerfile).toContain('adduser');
      expect(dockerfile).toContain('USER nodejs');
    });
  });

  describe('hasDockerFiles', () => {
    it('should return true if plan has Dockerfile', () => {
      const plan = createTestPlan(Framework.EXPRESS, ['Dockerfile']);
      expect(hasDockerFiles(plan)).toBe(true);
    });

    it('should return true if plan has docker-compose.yml', () => {
      const plan = createTestPlan(Framework.EXPRESS, ['docker-compose.yml']);
      expect(hasDockerFiles(plan)).toBe(true);
    });

    it('should return true if plan has .dockerignore', () => {
      const plan = createTestPlan(Framework.EXPRESS, ['.dockerignore']);
      expect(hasDockerFiles(plan)).toBe(true);
    });

    it('should return false if plan has no Docker files', () => {
      const plan = createTestPlan(Framework.EXPRESS, []);
      expect(hasDockerFiles(plan)).toBe(false);
    });
  });

  describe('getDockerfileTemplate', () => {
    it('should return dockerfile-node for Express', () => {
      const plan = createTestPlan(Framework.EXPRESS);
      expect(getDockerfileTemplate(plan)).toBe('dockerfile-node');
    });

    it('should return dockerfile-nextjs for NextJS', () => {
      const plan = createTestPlan(Framework.NEXTJS);
      expect(getDockerfileTemplate(plan)).toBe('dockerfile-nextjs');
    });

    it('should return dockerfile-node for other frameworks', () => {
      const plan = createTestPlan(Framework.REACT);
      expect(getDockerfileTemplate(plan)).toBe('dockerfile-node');
    });
  });
});
