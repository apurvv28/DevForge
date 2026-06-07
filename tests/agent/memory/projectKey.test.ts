import { deriveProjectKey } from '../../../src/agent/memory/projectKey';

describe('projectKey', () => {
  it('returns a hex string of length 64', () => {
    const key = deriveProjectKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
  });
});
