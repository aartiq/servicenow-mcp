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

describe('claude-cli provider', () => {
  it('runs a plain text call: no tools, no MCP servers, instructions on stdin', async () => {
    const { mkdtempSync, writeFileSync, chmodSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const dir = mkdtempSync(join(tmpdir(), 'nak-cli-'));
    const bin = join(dir, 'fake-claude.sh');
    writeFileSync(bin, '#!/bin/sh\nprintf "ARGS:%s|" "$@"\necho\ncat\n');
    chmodSync(bin, 0o755);
    const saved = process.env.NOWAIKIT_CLAUDE_BIN;
    process.env.NOWAIKIT_CLAUDE_BIN = bin;
    try {
      const r = await callLlm({ provider: 'claude-cli', model: 'claude-sonnet-5-5' }, [
        { role: 'system', content: 'SYSTEM RULES' },
        { role: 'user', content: 'THE DATA' },
      ]);
      expect(r.content).toContain('ARGS:-p|ARGS:--tools|ARGS:|ARGS:--strict-mcp-config|ARGS:--effort|ARGS:low|');
      expect(r.content).not.toContain('--append-system-prompt');
      expect(r.content.indexOf('SYSTEM RULES')).toBeLessThan(r.content.indexOf('THE DATA'));
    } finally {
      if (saved === undefined) delete process.env.NOWAIKIT_CLAUDE_BIN; else process.env.NOWAIKIT_CLAUDE_BIN = saved;
    }
  });
});
