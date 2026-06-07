import ElasticMemoryStore from '../../../src/agent/memory/ElasticMemoryStore';

describe('ElasticMemoryStore.isConfiguredFromCredentials', () => {
  it('returns false for undefined or missing keys', () => {
    expect(ElasticMemoryStore.isConfiguredFromCredentials(undefined)).toBe(false);
    expect(ElasticMemoryStore.isConfiguredFromCredentials({})).toBe(false);
    expect(
      ElasticMemoryStore.isConfiguredFromCredentials({ ELASTICSEARCH_URL: 'http://x' }),
    ).toBe(false);
  });

  it('returns true when both keys are present', () => {
    expect(
      ElasticMemoryStore.isConfiguredFromCredentials({
        ELASTICSEARCH_URL: 'http://x',
        ELASTICSEARCH_API_KEY: 'key',
      }),
    ).toBe(true);
  });
});
