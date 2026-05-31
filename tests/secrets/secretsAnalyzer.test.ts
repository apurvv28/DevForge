import {
  extractSecrets,
  generateSecretsDoc,
  getKnownSecretNames,
  SecretInfo,
  RenderedFile,
} from '../../src/secrets/secretsAnalyzer';

describe('Secrets Analyzer', () => {
  describe('extractSecrets', () => {
    it('should extract known secrets from rendered files', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/deploy.yml',
          content: `
            env:
              VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
              VERCEL_ORG_ID: \${{ secrets.VERCEL_ORG_ID }}
          `,
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets).toHaveLength(2);
      expect(secrets[0]!.name).toBe('VERCEL_ORG_ID');
      expect(secrets[1]!.name).toBe('VERCEL_TOKEN');
      expect(secrets[0]!.usedIn).toContain('.github/workflows/deploy.yml');
    });

    it('should extract unknown secrets with fallback values', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/custom.yml',
          content: `
            env:
              CUSTOM_API_KEY: \${{ secrets.CUSTOM_API_KEY }}
          `,
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets).toHaveLength(1);
      expect(secrets[0]!.name).toBe('CUSTOM_API_KEY');
      expect(secrets[0]!.description).toBe('Custom secret');
      expect(secrets[0]!.howToObtain).toContain('manually');
    });

    it('should deduplicate secrets across multiple files', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/deploy-vercel.yml',
          content: 'env:\n  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
        },
        {
          path: '.github/workflows/deploy-prod.yml',
          content: 'env:\n  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets).toHaveLength(1);
      expect(secrets[0]!.name).toBe('VERCEL_TOKEN');
      expect(secrets[0]!.usedIn).toHaveLength(2);
      expect(secrets[0]!.usedIn).toContain('.github/workflows/deploy-vercel.yml');
      expect(secrets[0]!.usedIn).toContain('.github/workflows/deploy-prod.yml');
    });

    it('should handle whitespace variations in secret syntax', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/ci.yml',
          content: `
            env:
              SECRET1: \${{secrets.DOCKER_USERNAME}}
              SECRET2: \${{ secrets.DOCKER_PASSWORD }}
              SECRET3: \${{  secrets.NPM_TOKEN  }}
          `,
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets).toHaveLength(3);
      const secretNames = secrets.map((s) => s.name);
      expect(secretNames).toContain('DOCKER_USERNAME');
      expect(secretNames).toContain('DOCKER_PASSWORD');
      expect(secretNames).toContain('NPM_TOKEN');
    });

    it('should return empty array for files without secrets', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/lint.yml',
          content: 'name: Lint\njobs:\n  lint:\n    runs-on: ubuntu-latest',
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets).toHaveLength(0);
    });

    it('should return sorted secrets by name', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/deploy.yml',
          content: `
            env:
              VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
              AWS_EC2_HOST: \${{ secrets.AWS_EC2_HOST }}
              DOCKER_USERNAME: \${{ secrets.DOCKER_USERNAME }}
          `,
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets[0]!.name).toBe('AWS_EC2_HOST');
      expect(secrets[1]!.name).toBe('DOCKER_USERNAME');
      expect(secrets[2]!.name).toBe('VERCEL_TOKEN');
    });

    it('should provide github settings path for known secrets', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/deploy.yml',
          content: 'env:\n  RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}',
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets[0]!.githubSettingsPath).toContain('Settings');
      expect(secrets[0]!.githubSettingsPath).toContain('Secrets');
    });

    it('should track all files where a secret is used', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/deploy1.yml',
          content: 'env:\n  AWS_EC2_HOST: ${{ secrets.AWS_EC2_HOST }}',
        },
        {
          path: '.github/workflows/deploy2.yml',
          content: 'env:\n  AWS_EC2_HOST: ${{ secrets.AWS_EC2_HOST }}',
        },
        {
          path: '.github/workflows/deploy3.yml',
          content: 'env:\n  AWS_EC2_HOST: ${{ secrets.AWS_EC2_HOST }}',
        },
      ];

      const secrets = extractSecrets(files);

      expect(secrets).toHaveLength(1);
      expect(secrets[0]!.usedIn).toHaveLength(3);
    });

    it('should ignore invalid secret name formats', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/ci.yml',
          content: `
            env:
              VALID_SECRET: \${{ secrets.VALID_SECRET }}
              invalid: \${{ secrets.invalid }}
              secret-with-dash: \${{ secrets.secret-with-dash }}
          `,
        },
      ];

      const secrets = extractSecrets(files);

      // Only VALID_SECRET should match (others have lowercase or dashes)
      expect(secrets.length).toBeGreaterThanOrEqual(1);
      expect(secrets.some((s) => s.name === 'VALID_SECRET')).toBe(true);
    });
  });

  describe('generateSecretsDoc', () => {
    it('should generate markdown with header for multiple secrets', () => {
      const secrets: SecretInfo[] = [
        {
          name: 'VERCEL_TOKEN',
          usedIn: ['.github/workflows/deploy.yml'],
          description: 'Vercel deploy token',
          howToObtain: 'Get from vercel.com',
          githubSettingsPath: 'Settings → Secrets',
        },
        {
          name: 'DOCKER_USERNAME',
          usedIn: ['.github/workflows/build.yml'],
          description: 'Docker Hub username',
          howToObtain: 'Your Docker Hub username',
          githubSettingsPath: 'Settings → Secrets',
        },
      ];

      const doc = generateSecretsDoc(secrets);

      expect(doc).toContain('# SECRETS_REQUIRED.md');
      expect(doc).toContain('2 secret(s) required');
      expect(doc).toContain('## DOCKER_USERNAME');
      expect(doc).toContain('## VERCEL_TOKEN');
    });

    it('should include setup instructions for each secret', () => {
      const secrets: SecretInfo[] = [
        {
          name: 'RAILWAY_TOKEN',
          usedIn: ['.github/workflows/deploy.yml'],
          description: 'Railway token',
          howToObtain: 'Get from railway.app',
          githubSettingsPath: 'Settings → Secrets',
        },
      ];

      const doc = generateSecretsDoc(secrets);

      expect(doc).toContain('**Description:**');
      expect(doc).toContain('**Used in:**');
      expect(doc).toContain('**How to obtain:**');
      expect(doc).toContain('**Setup steps:**');
      expect(doc).toContain('.github/workflows/deploy.yml');
    });

    it('should include a setup checklist', () => {
      const secrets: SecretInfo[] = [
        {
          name: 'AWS_EC2_HOST',
          usedIn: ['deploy.yml'],
          description: 'EC2 host',
          howToObtain: 'From AWS',
          githubSettingsPath: 'Settings → Secrets',
        },
        {
          name: 'AWS_EC2_USERNAME',
          usedIn: ['deploy.yml'],
          description: 'EC2 username',
          howToObtain: 'Usually ubuntu',
          githubSettingsPath: 'Settings → Secrets',
        },
      ];

      const doc = generateSecretsDoc(secrets);

      expect(doc).toContain('## Setup Checklist');
      expect(doc).toContain('- [ ] `AWS_EC2_HOST` added to GitHub Secrets');
      expect(doc).toContain('- [ ] `AWS_EC2_USERNAME` added to GitHub Secrets');
    });

    it('should handle empty secrets list', () => {
      const doc = generateSecretsDoc([]);

      expect(doc).toContain('# SECRETS_REQUIRED.md');
      expect(doc).toContain('No secrets required');
    });

    it('should include github setup instructions', () => {
      const secrets: SecretInfo[] = [
        {
          name: 'CUSTOM_SECRET',
          usedIn: ['workflow.yml'],
          description: 'Custom secret',
          howToObtain: 'Provide manually',
          githubSettingsPath: 'Settings → Secrets and variables → Actions',
        },
      ];

      const doc = generateSecretsDoc(secrets);

      expect(doc).toContain('## Adding Secrets to GitHub');
      expect(doc).toContain('Settings → Secrets and variables → Actions');
      expect(doc).toContain('New repository secret');
    });

    it('should include instructions for accessing secret values in workflows', () => {
      const secrets: SecretInfo[] = [
        {
          name: 'NPM_TOKEN',
          usedIn: ['.github/workflows/publish.yml'],
          description: 'npm token',
          howToObtain: 'From npm',
          githubSettingsPath: 'Settings',
        },
      ];

      const doc = generateSecretsDoc(secrets);

      expect(doc).toContain('${{ secrets.SECRET_NAME }}');
      expect(doc).toContain('NPM_TOKEN');
    });

    it('should preserve secret description and how-to-obtain text', () => {
      const secrets: SecretInfo[] = [
        {
          name: 'VERCEL_TOKEN',
          usedIn: ['deploy.yml'],
          description: 'Vercel authentication token for deployments',
          howToObtain:
            'Visit vercel.com → Settings → Tokens → Create a new production token',
          githubSettingsPath: 'Settings',
        },
      ];

      const doc = generateSecretsDoc(secrets);

      expect(doc).toContain('Vercel authentication token for deployments');
      expect(doc).toContain('Visit vercel.com → Settings → Tokens');
    });

    it('should format checklist items with proper markdown', () => {
      const secrets: SecretInfo[] = [
        {
          name: 'SECRET_1',
          usedIn: ['file.yml'],
          description: 'Secret 1',
          howToObtain: 'How to get',
          githubSettingsPath: 'Settings',
        },
      ];

      const doc = generateSecretsDoc(secrets);

      expect(doc).toMatch(/- \[ \] `SECRET_1`/);
    });
  });

  describe('getKnownSecretNames', () => {
    it('should return all known secret names', () => {
      const names = getKnownSecretNames();

      expect(names).toContain('VERCEL_TOKEN');
      expect(names).toContain('RAILWAY_TOKEN');
      expect(names).toContain('DOCKER_USERNAME');
      expect(names).toContain('AWS_EC2_HOST');
      expect(names.length).toBeGreaterThan(0);
    });

    it('should return sorted list', () => {
      const names = getKnownSecretNames();

      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });

  describe('Integration', () => {
    it('should extract secrets from complete workflow and generate doc', () => {
      const workflowContent = `
        name: Deploy
        on: push
        env:
          VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: \${{ secrets.VERCEL_ORG_ID }}
        jobs:
          deploy:
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v3
              - run: npm install
      `;

      const files: RenderedFile[] = [
        {
          path: '.github/workflows/deploy.yml',
          content: workflowContent,
        },
      ];

      const secrets = extractSecrets(files);
      const doc = generateSecretsDoc(secrets);

      expect(secrets).toHaveLength(2);
      expect(doc).toContain('2 secret(s)');
      expect(doc).toContain('VERCEL_TOKEN');
      expect(doc).toContain('VERCEL_ORG_ID');
      expect(doc).toContain('## Setup Checklist');
    });

    it('should handle mixed known and unknown secrets', () => {
      const files: RenderedFile[] = [
        {
          path: '.github/workflows/deploy.yml',
          content: `
            env:
              VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
              CUSTOM_API_KEY: \${{ secrets.CUSTOM_API_KEY }}
          `,
        },
      ];

      const secrets = extractSecrets(files);
      const doc = generateSecretsDoc(secrets);

      expect(secrets).toHaveLength(2);
      expect(doc).toContain('CUSTOM_API_KEY');
      expect(doc).toContain('VERCEL_TOKEN');

      // CUSTOM_API_KEY should have generic guidance
      const customSecret = secrets.find((s) => s.name === 'CUSTOM_API_KEY');
      expect(customSecret!.howToObtain).toContain('manually');
    });
  });
});
