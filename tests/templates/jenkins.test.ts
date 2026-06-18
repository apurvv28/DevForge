import { getTemplate } from '../../src/templates/index';
import { renderTemplate } from '../../src/engine/templateRenderer';

describe('Jenkinsfile Templates', () => {
  const baseVars = new Map<string, string>([
    ['devforgeVersion', '1.0.0'],
    ['nodeVersion', '18.16.0'],
    ['packageManager', 'npm'],
    ['installCommand', 'npm ci'],
    ['buildCommand', 'npm run build'],
    ['testCommand', 'npm test'],
    ['framework', 'react'],
    ['jenkinsAgentLabel', 'custom-agent'],
    ['jenkinsNodeTool', 'NodeJS-18'],
  ]);

  describe('jenkins-base-ci template', () => {
    it('should render correctly with base variables', () => {
      const template = getTemplate('jenkins-base-ci');
      const rendered = renderTemplate(template, baseVars);

      expect(rendered).toContain("agent { label 'custom-agent' }");
      expect(rendered).toContain('nodejs \'NodeJS-18\'');
      expect(rendered).toContain('sh \'npm ci\'');
      expect(rendered).toContain('sh \'npm test\'');
      expect(rendered).toContain('sh \'npm run build\'');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-vercel-deploy template', () => {
    it('should render vercel deployment stages', () => {
      const template = getTemplate('jenkins-vercel-deploy');
      const rendered = renderTemplate(template, baseVars);

      expect(rendered).toContain("agent { label 'custom-agent' }");
      expect(rendered).toContain('VERCEL_TOKEN     = credentials(\'vercel-token\')');
      expect(rendered).toContain('npx vercel --prod --token $VERCEL_TOKEN --yes');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-railway-deploy template', () => {
    it('should render railway deployment stages', () => {
      const template = getTemplate('jenkins-railway-deploy');
      const rendered = renderTemplate(template, baseVars);

      expect(rendered).toContain('RAILWAY_TOKEN = credentials(\'railway-token\')');
      expect(rendered).toContain('npx railway up --service $JOB_NAME --environment production');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-render-deploy template', () => {
    it('should render render deployment stages', () => {
      const template = getTemplate('jenkins-render-deploy');
      const rendered = renderTemplate(template, baseVars);

      expect(rendered).toContain('RENDER_DEPLOY_HOOK = credentials(\'render-deploy-hook\')');
      expect(rendered).toContain('curl --request POST');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-firebase-deploy template', () => {
    it('should render firebase deployment stages', () => {
      const template = getTemplate('jenkins-firebase-deploy');
      const rendered = renderTemplate(template, baseVars);

      expect(rendered).toContain('FIREBASE_TOKEN = credentials(\'firebase-token\')');
      expect(rendered).toContain('npx firebase-tools deploy --token $FIREBASE_TOKEN --non-interactive');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-aws-ec2-deploy template', () => {
    it('should render ec2 deployment stages', () => {
      const template = getTemplate('jenkins-aws-ec2-deploy');
      const rendered = renderTemplate(template, baseVars);

      expect(rendered).toContain('EC2_HOST     = credentials(\'aws-ec2-host\')');
      expect(rendered).toContain('sshagent(credentials: [\'aws-ec2-ssh-key\'])');
      expect(rendered).toContain('pm2 restart app');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-aws-ecs-deploy template', () => {
    it('should render ecs deployment stages', () => {
      const template = getTemplate('jenkins-aws-ecs-deploy');
      const vars = new Map([
        ...baseVars,
        ['AWS_REGION', 'us-west-2'],
        ['ECR_REGISTRY', '123456789.dkr.ecr.us-west-2.amazonaws.com'],
        ['IMAGE_NAME', 'my-ecs-app'],
        ['ECS_CLUSTER', 'my-cluster'],
        ['ECS_SERVICE', 'my-service'],
        ['TASK_FAMILY', 'my-task-family'],
      ]);
      const rendered = renderTemplate(template, vars);

      expect(rendered).toContain("AWS_DEFAULT_REGION = 'us-west-2'");
      expect(rendered).toContain("ECR_REGISTRY       = '123456789.dkr.ecr.us-west-2.amazonaws.com'");
      expect(rendered).toContain("IMAGE_NAME         = 'my-ecs-app'");
      expect(rendered).toContain("ECS_CLUSTER        = 'my-cluster'");
      expect(rendered).toContain("ECS_SERVICE         = 'my-service'");
      expect(rendered).toContain("TASK_FAMILY         = 'my-task-family'");
      expect(rendered).toContain("'AmazonWebServices' + 'CredentialsBinding'");
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-aws-eks-deploy template', () => {
    it('should render eks deployment stages', () => {
      const template = getTemplate('jenkins-aws-eks-deploy');
      const vars = new Map([
        ...baseVars,
        ['AWS_REGION', 'us-west-2'],
        ['ECR_REGISTRY', '123456789.dkr.ecr.us-west-2.amazonaws.com'],
        ['IMAGE_NAME', 'my-eks-app'],
        ['EKS_CLUSTER_NAME', 'my-cluster'],
        ['APP_NAME', 'my-app-name'],
      ]);
      const rendered = renderTemplate(template, vars);

      expect(rendered).toContain("AWS_DEFAULT_REGION  = 'us-west-2'");
      expect(rendered).toContain("ECR_REGISTRY        = '123456789.dkr.ecr.us-west-2.amazonaws.com'");
      expect(rendered).toContain("IMAGE_NAME          = 'my-eks-app'");
      expect(rendered).toContain("EKS_CLUSTER_NAME    = 'my-cluster'");
      expect(rendered).toContain("APP_NAME            = 'my-app-name'");
      expect(rendered).toContain('kubectl set image deployment/$APP_NAME');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });

  describe('jenkins-docker-build template', () => {
    it('should render docker build and push stages', () => {
      const template = getTemplate('jenkins-docker-build');
      const vars = new Map([
        ...baseVars,
        ['APP_NAME', 'my-docker-app'],
      ]);
      const rendered = renderTemplate(template, vars);

      expect(rendered).toContain('DOCKER_HUB_CREDS = credentials(\'docker-hub-credentials\')');
      expect(rendered).toContain('docker build -t $DOCKER_HUB_CREDS_USR/my-docker-app:$BUILD_NUMBER .');
      expect(rendered).not.toContain('{{');
      expect(rendered).not.toContain('}}');
    });
  });
});
