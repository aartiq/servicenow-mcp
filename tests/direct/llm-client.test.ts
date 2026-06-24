import { describe, it, expect } from 'vitest';
import { callLlm, listProviderModels } from '../../src/direct/llm-client.js';

describe('llm-client BYOK', () => {
  it('requires an API key for gemini', async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(
      callLlm({ provider: 'gemini' }, [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow(/API key required for gemini/);
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  });

  it('does not require an API key for local providers', async () => {
    // Should not throw the API-key error; will fail later on network, not config.
    await expect(
      callLlm({ provider: 'ollama', timeoutMs: 1, maxRetries: 0 }, [{ role: 'user', content: 'hi' }])
    ).rejects.not.toThrow(/API key required/);
  });

  it('listProviderModels returns [] for cloud providers', async () => {
    await expect(listProviderModels({ provider: 'anthropic' })).resolves.toEqual([]);
    await expect(listProviderModels({ provider: 'openai' })).resolves.toEqual([]);
    await expect(listProviderModels({ provider: 'gemini' })).resolves.toEqual([]);
  });
});
