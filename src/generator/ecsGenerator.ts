import { DevForgeFS } from '../utils/fs';
import { renderTemplate } from '../engine/templateRenderer';
import { z } from 'zod';
import { GeneratorError } from '../utils/errors';
import {
  ECS_WORKFLOW_TEMPLATE,
  ECS_TASK_DEFINITION_TEMPLATE,
  ECS_README_TEMPLATE,
  ECS_SECRETS_REQUIRED_TEMPLATE,
} from '../templates/deploy/ecs';

export interface EcsConfig {
  ecrRegistry: string;
  imageName: string;
  awsRegion: string;
  taskFamily: string;
  containerName: string;
  ecsCluster: string;
  ecsService: string;
  executionRoleArn: string;
  cpu: string;
  memory: string;
  port: number;
}

export interface EcsGenerationResult {
  written: string[];
  errors: Array<{ path: string; error: string }>;
}

function buildVars(cfg: EcsConfig): Map<string, string> {
  return new Map<string, string>([
    ['ECR_REGISTRY', cfg.ecrRegistry],
    ['IMAGE_NAME', cfg.imageName],
    ['AWS_REGION', cfg.awsRegion],
    ['TASK_FAMILY', cfg.taskFamily],
    ['CONTAINER_NAME', cfg.containerName],
    ['ECS_CLUSTER', cfg.ecsCluster],
    ['ECS_SERVICE', cfg.ecsService],
    ['EXECUTION_ROLE_ARN', cfg.executionRoleArn],
    ['CPU', cfg.cpu],
    ['MEMORY', cfg.memory],
    ['PORT', String(cfg.port)],
  ]);
}

// Zod schema for ECS task definition structural validation
const ContainerDefSchema = z.object({
  name: z.string(),
  image: z.string(),
  portMappings: z
    .array(z.object({ containerPort: z.number(), protocol: z.string().optional() }))
    .optional(),
});

const TaskDefSchema = z.object({
  family: z.string(),
  networkMode: z.string(),
  requiresCompatibilities: z.array(z.string()),
  cpu: z.string(),
  memory: z.string(),
  containerDefinitions: z.array(ContainerDefSchema),
});

export async function generateEcsFiles(
  cfg: EcsConfig,
  fs: DevForgeFS,
): Promise<EcsGenerationResult> {
  const result: EcsGenerationResult = { written: [], errors: [] };
  const vars = buildVars(cfg);

  const files: Array<{ path: string; template: string; validateJson?: boolean }> = [
    { path: '.github/workflows/deploy-ecs.yml', template: ECS_WORKFLOW_TEMPLATE },
    {
      path: 'ecs/task-definition.json',
      template: ECS_TASK_DEFINITION_TEMPLATE,
      validateJson: true,
    },
    { path: 'ecs/README.md', template: ECS_README_TEMPLATE },
    { path: 'ecs/SECRETS_REQUIRED.md', template: ECS_SECRETS_REQUIRED_TEMPLATE },
  ];

  for (const file of files) {
    try {
      const rendered = renderTemplate(file.template, vars);

      if (file.validateJson) {
        try {
          const parsed = JSON.parse(rendered);
          const parsedSafe = TaskDefSchema.safeParse(parsed);
          if (!parsedSafe.success) {
            throw new GeneratorError(
              `Task definition validation failed: ${parsedSafe.error.message}`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new GeneratorError(`Invalid JSON for ${file.path}: ${msg}`);
        }
      }

      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      if (dir) await fs.ensureDir(dir);

      await fs.writeFile(file.path, rendered);
      result.written.push(file.path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ path: file.path, error: msg });
    }
  }

  return result;
}

export default { generateEcsFiles };
