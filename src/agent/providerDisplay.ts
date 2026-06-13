import { AgentProviderName } from './providers/types';

export function formatProviderName(provider: AgentProviderName): string {
  switch (provider) {
    case 'nova-pro':
      return 'Amazon Nova Pro';
    case 'gemini':
      return 'Google Gemini';
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'bedrock':
      return 'Amazon Bedrock';
    case 'grok':
      return 'Grok (xAI)';
    case 'offline':
      return 'Offline';
    default:
      return 'Unknown provider';
  }
}

export function getProviderMode(provider: AgentProviderName): string {
  return provider === 'offline' ? 'Offline' : 'Online';
}

export function maskCredential(value: string): string {
  if (value.length === 0) {
    return '****';
  }

  if (value.length <= 4) {
    return `${value}***`;
  }

  return `${value.slice(0, 4)}***`;
}
