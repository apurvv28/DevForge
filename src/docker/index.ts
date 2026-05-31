// Docker Integration
export { generateDockerFiles, hasDockerFiles, getDockerfileTemplate } from './dockerGenerator';
export type { DockerGenerationResult } from './dockerGenerator';

export function runDocker(): void {
  console.log('Docker Integration');
}
