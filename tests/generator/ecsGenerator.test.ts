import { generateEcsFiles, EcsConfig } from '../../src/generator/ecsGenerator';
import { DevForgeFS } from '../../src/utils/fs';
import { renderTemplate } from '../../src/engine/templateRenderer';
import {
  ECS_WORKFLOW_TEMPLATE,
  ECS_TASK_DEFINITION_TEMPLATE,
  ECS_README_TEMPLATE,
  ECS_SECRETS_REQUIRED_TEMPLATE,
} from '../../src/templates/deploy/ecs';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const BASE_CFG: EcsConfig = {
  ecrRegistry: '123456789.dkr.ecr.us-east-1.amazonaws.com',
  imageName: 'my-app',
  awsRegion: 'us-east-1',
  taskFamily: 'my-app-task',
  containerName: 'my-app',
  ecsCluster: 'my-ecs-cluster',
  ecsService: 'my-ecs-service',
  executionRoleArn: 'arn:aws:iam::123456:role/ecs-exec',
  cpu: '512',
  memory: '1024',
  port: 3000,
};

function makeMockFs(): jest.Mocked<DevForgeFS> {
  return {
    fileExists: jest.fn().mockResolvedValue(false),
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(undefined),
    ensureDir: jest.fn().mockResolvedValue(undefined),
    projectRoot: '/project',
    dryRun: false,
  } as unknown as jest.Mocked<DevForgeFS>;
}

describe('ecsGenerator', () => {
  let mockFs: jest.Mocked<DevForgeFS>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs = makeMockFs();
  });

  it('writes expected files', async () => {
    const res = await generateEcsFiles(BASE_CFG, mockFs);
    expect(res.errors).toHaveLength(0);
    expect(res.written).toContain('.github/workflows/deploy-ecs.yml');
    expect(res.written).toContain('ecs/task-definition.json');
    expect(res.written).toContain('ecs/README.md');
    expect(res.written).toContain('ecs/SECRETS_REQUIRED.md');
  });

  it('validates task definition JSON', async () => {
    const rendered = renderTemplate(ECS_TASK_DEFINITION_TEMPLATE, new Map([
      ['TASK_FAMILY', BASE_CFG.taskFamily],
      ['ECR_REGISTRY', BASE_CFG.ecrRegistry],
      ['IMAGE_NAME', BASE_CFG.imageName],
      ['AWS_REGION', BASE_CFG.awsRegion],
      ['CONTAINER_NAME', BASE_CFG.containerName],
      ['CPU', BASE_CFG.cpu],
      ['MEMORY', BASE_CFG.memory],
      ['PORT', String(BASE_CFG.port)],
      ['EXECUTION_ROLE_ARN', BASE_CFG.executionRoleArn],
    ]));

    // parse to ensure it's valid JSON
    const parsed = JSON.parse(rendered);
    expect(parsed.family).toBe(BASE_CFG.taskFamily);
    expect(parsed.containerDefinitions[0].image).toContain(BASE_CFG.imageName);
  });

  it('substitutes values in workflow', async () => {
    await generateEcsFiles(BASE_CFG, mockFs);
    const call = (mockFs.writeFile as jest.Mock).mock.calls.find((c) => c[0] === '.github/workflows/deploy-ecs.yml');
    expect(call).toBeDefined();
    expect(call![1]).toContain('amazon-ecs-render-task-definition');
    expect(call![1]).toContain('amazon-ecs-deploy-task-definition');
    expect(call![1]).toContain(BASE_CFG.ecrRegistry);
  });
});
