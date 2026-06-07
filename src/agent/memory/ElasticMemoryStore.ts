import { Client } from '@elastic/elasticsearch';

export type MemoryType = 'recommendation' | 'detection' | 'user_preference' | 'compliance';

export interface AgentMemory {
  projectKey: string;
  timestamp: string; // ISO
  agentName: string;
  memoryType: MemoryType;
  data: Record<string, unknown>;
  ttlDays: number;
}

export class ElasticMemoryStore {
  private readonly client: Client;
  private readonly indexName: string;

  constructor(elasticUrl: string, apiKey: string, indexName = 'devforge-agent-memory') {
    const normalizedUrl = elasticUrl.replace(/\/+$/, '');
    this.client = new Client({
      node: normalizedUrl,
      auth: {
        apiKey,
      },
    });
    this.indexName = indexName;
  }

  async store(memory: AgentMemory): Promise<void> {
    await this.client.index({
      index: this.indexName,
      document: memory,
      refresh: 'wait_for',
    });
  }

  async retrieve(projectKey: string, agentName?: string, limit = 10): Promise<AgentMemory[]> {
    interface SearchQuery {
      bool: {
        must: Array<Record<string, unknown>>;
      };
    }

    const query: SearchQuery = { bool: { must: [{ term: { projectKey } }] } };
    if (agentName) {
      query.bool.must.push({ term: { agentName } });
    }

    const response = await this.client.search<AgentMemory>({
      index: this.indexName,
      size: limit,
      sort: [{ timestamp: { order: 'desc' } }],
      query,
    });

    const hits = response.hits.hits as Array<{ _source?: AgentMemory }>;
    return hits.map((hit) => hit._source).filter((source): source is AgentMemory => !!source);
  }

  async purgeExpired(): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const response = await this.client.deleteByQuery({
      index: this.indexName,
      query: {
        range: { timestamp: { lt: cutoff } },
      },
    });

    return response.deleted ?? 0;
  }

  static isConfiguredFromCredentials(credentials: Record<string, string> | undefined): boolean {
    if (!credentials) return false;
    return Boolean(credentials.ELASTICSEARCH_URL && credentials.ELASTICSEARCH_API_KEY);
  }
}

export default ElasticMemoryStore;
