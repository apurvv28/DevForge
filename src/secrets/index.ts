// Secret Analyzer
export {
  extractSecrets,
  generateSecretsDoc,
  getKnownSecretNames,
  type SecretInfo,
  type RenderedFile,
} from './secretsAnalyzer';

export function runSecretAnalyzer(): void {
  console.log('Secret Analyzer');
}
