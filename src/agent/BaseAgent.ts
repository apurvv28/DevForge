import { AgentCache } from './cache/AgentCache';
import { buildCacheKey } from './cache/cacheKey';
import { StoredCredentials } from './credentials/types';
import { AgentFallbackError } from './errors';
import { isOfflineMode } from './OfflineFallback';
import { AgentContext, AgentResult } from './types';
import { AgentMessage, ChatOptions, LLMProvider } from './providers/types';
import { logger } from '../utils/logger';
import ElasticMemoryStore from './memory/ElasticMemoryStore';
import { deriveProjectKey } from './memory/projectKey';

const MAX_HISTORY_LENGTH = 20;

export abstract class BaseAgent {
  protected readonly provider: LLMProvider;
  protected readonly history: AgentMessage[] = [];
  protected readonly systemPrompt: string;
  protected readonly cache: AgentCache;
  protected readonly storedCredentials: StoredCredentials;

  public abstract readonly agentName: string;

  constructor(
    provider: LLMProvider,
    systemPrompt: string,
    storedCredentials: StoredCredentials,
    cache: AgentCache = new AgentCache(),
  ) {
    this.provider = provider;
    this.systemPrompt = systemPrompt;
    this.storedCredentials = storedCredentials;
    this.cache = cache;
  }

  protected async chat(
    userMessage: string,
    context: AgentContext,
    options?: ChatOptions,
  ): Promise<string> {
    if (isOfflineMode(this.storedCredentials)) {
      throw new AgentFallbackError(this.fallback(context));
    }

    // Inject memory from Elasticsearch if configured
    try {
      const creds = this.storedCredentials?.credentials;
      if (ElasticMemoryStore.isConfiguredFromCredentials(creds)) {
        const url = String(creds!['ELASTICSEARCH_URL']);
        const key = String(creds!['ELASTICSEARCH_API_KEY']);
        const store = new ElasticMemoryStore(url, key);
        const projectKey = deriveProjectKey();
        const memories = await store.retrieve(projectKey, this.agentName, 5).catch(() => []);
        if (memories && memories.length > 0) {
          const memText = memories
            .map((m) => `[${m.timestamp}] ${m.agentName}: ${JSON.stringify(m.data).slice(0, 1000)}`)
            .join('\n');
          options = {
            ...options,
            systemPrompt: `${memText}\n${options?.systemPrompt ?? this.systemPrompt}`,
          };
        }
      }
    } catch (err) {
      logger.warn('Failed loading agent memory (non-fatal): ' + (err as Error).message);
    }

    const cacheKey = buildCacheKey(this.agentName, this.systemPrompt, userMessage);
    const cached = await this.cache.get(cacheKey);
    if (cached !== null) {
      this.appendToHistory({ role: 'user', content: userMessage });
      this.appendToHistory({ role: 'assistant', content: cached });
      return cached;
    }

    if (!(await this.provider.isAvailable())) {
      logger.warn(`Provider ${this.provider.name} is unavailable. Using fallback.`);
      throw new AgentFallbackError(this.fallback(context));
    }

    this.appendToHistory({ role: 'user', content: userMessage });

    try {
      const response = await this.provider.chat(this.history, {
        ...options,
        systemPrompt: options?.systemPrompt ?? this.systemPrompt,
      });

      // Store short memory of the interaction (best-effort)
      try {
        const creds = this.storedCredentials?.credentials;
        if (ElasticMemoryStore.isConfiguredFromCredentials(creds)) {
          const url = String(creds!['ELASTICSEARCH_URL']);
          const key = String(creds!['ELASTICSEARCH_API_KEY']);
          const store = new ElasticMemoryStore(url, key);
          const projectKey = deriveProjectKey();
          const mem = {
            projectKey,
            timestamp: new Date().toISOString(),
            agentName: this.agentName,
            memoryType: 'recommendation' as const,
            data: { userMessage, response: response.slice(0, 8192) },
            ttlDays: 30,
          };
          // don't await to avoid blocking; best-effort
          store.store(mem).catch((e) => logger.warn('Failed storing agent memory: ' + e.message));
        }
      } catch (err) {
        logger.warn('Failed storing agent memory (non-fatal): ' + (err as Error).message);
      }

      this.appendToHistory({ role: 'assistant', content: response });
      await this.cache.set(cacheKey, response);

      return response;
    } catch (error) {
      if (error instanceof AgentFallbackError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown provider error';
      logger.warn(`Provider ${this.provider.name} failed: ${message}. Using fallback.`);
      throw new AgentFallbackError(this.fallback(context));
    }
  }

  protected abstract fallback(context: AgentContext): AgentResult;

  abstract run(context: AgentContext): Promise<AgentResult>;

  private appendToHistory(message: AgentMessage): void {
    this.history.push(message);
    this.trimHistory();
  }

  private trimHistory(): void {
    while (this.history.length > MAX_HISTORY_LENGTH) {
      this.history.shift();
    }
  }
}
