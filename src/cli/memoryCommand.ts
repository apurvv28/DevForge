import { CredentialManager } from '../agent/credentials/CredentialManager';
import ElasticMemoryStore from '../agent/memory/ElasticMemoryStore';
import { deriveProjectKey } from '../agent/memory/projectKey';
import { logger } from '../utils/logger';

export async function memoryStatsCommand(): Promise<number> {
  const manager = new CredentialManager();
  const stored = await manager.tryLoadCredentials();
  if (!stored) {
    logger.info('No stored credentials found. Run `devforge agent reset` to configure.');
    return 1;
  }

  if (!ElasticMemoryStore.isConfiguredFromCredentials(stored.credentials)) {
    logger.info('Agent memory (Elasticsearch) is not configured in your credentials.');
    return 0;
  }

  const url = String(stored.credentials.ELASTICSEARCH_URL);
  const key = String(stored.credentials.ELASTICSEARCH_API_KEY);
  const store = new ElasticMemoryStore(url, key);
  const projectKey = deriveProjectKey();

  try {
    const items = await store.retrieve(projectKey, undefined, 10000).catch(() => []);

    const total = items.length;
    const oldest = items.reduce(
      (acc: string | null, cur) => {
        const ts = cur.timestamp;
        if (!ts) return acc;
        if (!acc) return ts;
        return acc < ts ? acc : ts;
      },
      null as string | null,
    );

    const sizeEstimate = items.reduce((sum: number, cur) => sum + JSON.stringify(cur).length, 0);

    const maskedUrl = url.replace(/(^https?:\/\/)[^@/]+@?/, '$1***@');

    logger.info(`Project key: ${projectKey}`);
    logger.info(`Total memories: ${total}`);
    logger.info(`Memory store: ${maskedUrl}`);
    logger.info(`Oldest memory: ${oldest ?? 'unknown'}`);
    logger.info(`Estimated size (bytes): ${sizeEstimate}`);

    return 0;
  } catch (err) {
    logger.error('Failed retrieving memory stats: ' + (err as Error).message);
    return 1;
  }
}
