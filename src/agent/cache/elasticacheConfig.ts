import { sanitizeString } from '../../utils/sanitizer';
import { StoredCredentials } from '../credentials/types';
import { ElastiCacheConfig } from './types';

const ELASTICACHE_CREDENTIAL_KEYS = new Set([
  'ELASTICACHE_ENABLED',
  'ELASTICACHE_HOST',
  'ELASTICACHE_PORT',
  'ELASTICACHE_AUTH_TOKEN',
  'ELASTICACHE_TLS',
  'ELASTICACHE_KEY_PREFIX',
]);

export function isElasticacheCredentialKey(key: string): boolean {
  return ELASTICACHE_CREDENTIAL_KEYS.has(key);
}

type ElasticacheEnvKey =
  | 'DEVFORGE_ELASTICACHE_ENABLED'
  | 'DEVFORGE_ELASTICACHE_HOST'
  | 'DEVFORGE_ELASTICACHE_PORT'
  | 'DEVFORGE_ELASTICACHE_AUTH_TOKEN'
  | 'DEVFORGE_ELASTICACHE_TLS'
  | 'DEVFORGE_ELASTICACHE_KEY_PREFIX'
  | 'ELASTICACHE_ENDPOINT';

function readEnv(name: ElasticacheEnvKey): string | undefined {
  switch (name) {
    case 'DEVFORGE_ELASTICACHE_ENABLED':
      return envValue(name);
    case 'DEVFORGE_ELASTICACHE_HOST':
      return envValue(name);
    case 'DEVFORGE_ELASTICACHE_PORT':
      return envValue(name);
    case 'DEVFORGE_ELASTICACHE_AUTH_TOKEN':
      return envValue(name);
    case 'DEVFORGE_ELASTICACHE_TLS':
      return envValue(name);
    case 'DEVFORGE_ELASTICACHE_KEY_PREFIX':
      return envValue(name);
    case 'ELASTICACHE_ENDPOINT':
      return envValue(name);
    default:
      return undefined;
  }
}

function envValue(key: ElasticacheEnvKey): string | undefined {
  switch (key) {
    case 'DEVFORGE_ELASTICACHE_ENABLED':
      return trimEnv('DEVFORGE_ELASTICACHE_ENABLED');
    case 'DEVFORGE_ELASTICACHE_HOST':
      return trimEnv('DEVFORGE_ELASTICACHE_HOST');
    case 'DEVFORGE_ELASTICACHE_PORT':
      return trimEnv('DEVFORGE_ELASTICACHE_PORT');
    case 'DEVFORGE_ELASTICACHE_AUTH_TOKEN':
      return trimEnv('DEVFORGE_ELASTICACHE_AUTH_TOKEN');
    case 'DEVFORGE_ELASTICACHE_TLS':
      return trimEnv('DEVFORGE_ELASTICACHE_TLS');
    case 'DEVFORGE_ELASTICACHE_KEY_PREFIX':
      return trimEnv('DEVFORGE_ELASTICACHE_KEY_PREFIX');
    case 'ELASTICACHE_ENDPOINT':
      return trimEnv('ELASTICACHE_ENDPOINT');
    default:
      return undefined;
  }
}

function trimEnv(name: ElasticacheEnvKey): string | undefined {
  switch (name) {
    case 'DEVFORGE_ELASTICACHE_ENABLED':
      return process.env.DEVFORGE_ELASTICACHE_ENABLED?.trim();
    case 'DEVFORGE_ELASTICACHE_HOST':
      return process.env.DEVFORGE_ELASTICACHE_HOST?.trim();
    case 'DEVFORGE_ELASTICACHE_PORT':
      return process.env.DEVFORGE_ELASTICACHE_PORT?.trim();
    case 'DEVFORGE_ELASTICACHE_AUTH_TOKEN':
      return process.env.DEVFORGE_ELASTICACHE_AUTH_TOKEN?.trim();
    case 'DEVFORGE_ELASTICACHE_TLS':
      return process.env.DEVFORGE_ELASTICACHE_TLS?.trim();
    case 'DEVFORGE_ELASTICACHE_KEY_PREFIX':
      return process.env.DEVFORGE_ELASTICACHE_KEY_PREFIX?.trim();
    case 'ELASTICACHE_ENDPOINT':
      return process.env.ELASTICACHE_ENDPOINT?.trim();
    default:
      return undefined;
  }
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === '1' || value.toLowerCase() === 'yes';
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65_535) {
    return fallback;
  }

  return parsed;
}

export function resolveElastiCacheConfig(
  storedCredentials?: StoredCredentials | null,
): ElastiCacheConfig | null {
  const stored = storedCredentials?.credentials ?? {};

  const enabled =
    parseBoolean(readEnv('DEVFORGE_ELASTICACHE_ENABLED'), false) ||
    parseBoolean(stored.ELASTICACHE_ENABLED, false);

  if (!enabled) {
    return null;
  }

  const host =
    readEnv('DEVFORGE_ELASTICACHE_HOST') ??
    stored.ELASTICACHE_HOST ??
    readEnv('ELASTICACHE_ENDPOINT');

  if (!host) {
    return null;
  }

  const port = parsePort(readEnv('DEVFORGE_ELASTICACHE_PORT') ?? stored.ELASTICACHE_PORT, 6379);
  const authToken = readEnv('DEVFORGE_ELASTICACHE_AUTH_TOKEN') ?? stored.ELASTICACHE_AUTH_TOKEN;
  const tls = parseBoolean(readEnv('DEVFORGE_ELASTICACHE_TLS') ?? stored.ELASTICACHE_TLS, true);
  const keyPrefix = sanitizeString(
    readEnv('DEVFORGE_ELASTICACHE_KEY_PREFIX') ??
      stored.ELASTICACHE_KEY_PREFIX ??
      'devforge:agent:',
    64,
  );

  return {
    enabled: true,
    host: sanitizeString(host, 255),
    port,
    authToken: authToken ? sanitizeString(authToken, 512) : undefined,
    tls,
    keyPrefix,
    connectTimeoutMs: 5_000,
  };
}
