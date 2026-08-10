/**
 * NowAIKit — BYOK LLM Client
 *
 * Supports multiple LLM providers for direct mode execution.
 * Users bring their own API key (BYOK) — no vendor lock-in.
 *
 * Features:
 *  - Providers: Anthropic, OpenAI, Google Gemini, Ollama, LM Studio, and the
 *    user's own Claude Code / Codex subscription via their local CLI (no API key)
 *  - Automatic retry with exponential backoff (honors Retry-After) on 429/5xx
 *  - Per-request timeout via AbortController
 *  - Optional token streaming via an onToken callback
 */

import { spawn } from 'node:child_process';

export type LlmProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'lmstudio' | 'claude-cli' | 'codex-cli';

export interface LlmConfig {
  provider: LlmProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-request timeout in ms (default 120000). */
  timeoutMs?: number;
  /** Max retry attempts on 429/5xx/network errors (default 3). */
  maxRetries?: number;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

/** Optional streaming callback — invoked with each text delta as it arrives. */
export type OnToken = (delta: string) => void;

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-sonnet-4-7',
  openai: 'gpt-5.5',
  gemini: 'gemini-3.5-flash',
  ollama: 'llama3.3',
  lmstudio: 'auto',
  // CLI-subscription providers: empty means "let the CLI use its own default model".
  'claude-cli': '',
  'codex-cli': '',
};

const PROVIDER_URLS: Record<LlmProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  // Gemini appends `/{model}:generateContent` (or :streamGenerateContent) at call time.
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  ollama: 'http://localhost:11434/api/chat',
  lmstudio: 'http://localhost:1234/v1/chat/completions',
  // CLI-subscription providers run a local binary, no HTTP endpoint.
  'claude-cli': '',
  'codex-cli': '',
};

// Local / no-API-key providers. The CLI-subscription providers use the user's own
// Claude Code / Codex login, so they need no API key here either.
const LOCAL_PROVIDERS: LlmProvider[] = ['ollama', 'lmstudio', 'claude-cli', 'codex-cli'];
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function resolveConfig(config: LlmConfig): { url: string; model: string; apiKey: string } {
  const provider = config.provider;
  const url = config.baseUrl || PROVIDER_URLS[provider];
  const model = config.model || DEFAULT_MODELS[provider];
  const apiKey = config.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`] || '';

  if (!LOCAL_PROVIDERS.includes(provider) && !apiKey) {
    throw new Error(`API key required for ${provider}. Set ${provider.toUpperCase()}_API_KEY or pass --api-key`);
  }

  return { url, model, apiKey };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with timeout + retry/backoff. Retries on network errors and
 * retryable HTTP status codes, honoring the Retry-After header when present.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; maxRetries: number; providerLabel: string }
): Promise<Response> {
  const { timeoutMs, maxRetries, providerLabel } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) {
        return response;
      }
      // Retryable status — compute backoff (prefer Retry-After header).
      const retryAfter = Number(response.headers.get('retry-after'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(1000 * 2 ** attempt, 15000);
      await sleep(backoff);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (attempt === maxRetries) {
        throw new Error(
          `${providerLabel} request failed${isAbort ? ` (timeout after ${timeoutMs}ms)` : ''}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      await sleep(Math.min(1000 * 2 ** attempt, 15000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${providerLabel} request failed`);
}

/** Read an SSE/line-delimited stream, yielding raw data lines. */
async function readStream(response: Response, onLine: (line: string) => void): Promise<void> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onLine(line);
    }
  }
  if (buffer.trim()) onLine(buffer.trim());
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(url: string, model: string, apiKey: string, messages: LlmMessage[], maxTokens: number, opts: RetryOpts, onToken?: OnToken): Promise<LlmResponse> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMsgs = messages.filter((m) => m.role !== 'system');
  const body = {
    model,
    max_tokens: maxTokens,
    stream: !!onToken,
    ...(systemMsg ? { system: systemMsg.content } : {}),
    messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
  };
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  }, { ...opts, providerLabel: 'Anthropic API' });

  if (!response.ok) throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`);

  if (onToken) {
    let content = '';
    let outTokens = 0;
    let inTokens = 0;
    await readStream(response, (line) => {
      if (!line.startsWith('data:')) return;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') return;
      try {
        const ev = JSON.parse(json) as any;
        if (ev.type === 'content_block_delta' && ev.delta?.text) { content += ev.delta.text; onToken(ev.delta.text); }
        if (ev.usage?.output_tokens) outTokens = ev.usage.output_tokens;
        if (ev.message?.usage?.input_tokens) inTokens = ev.message.usage.input_tokens;
      } catch { /* ignore partial */ }
    });
    return { content, model, usage: { input_tokens: inTokens, output_tokens: outTokens } };
  }

  const data = (await response.json()) as any;
  return {
    content: data.content?.[0]?.text || '',
    model: data.model || model,
    usage: data.usage ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } : undefined,
  };
}

// ─── OpenAI / LM Studio (OpenAI-compatible) ─────────────────────────────────────

async function callOpenAI(url: string, model: string, apiKey: string, messages: LlmMessage[], maxTokens: number, opts: RetryOpts, onToken?: OnToken): Promise<LlmResponse> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: !!onToken,
    ...(onToken ? { stream_options: { include_usage: true } } : {}),
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const response = await fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify(body) }, { ...opts, providerLabel: 'OpenAI API' });
  if (!response.ok) throw new Error(`OpenAI API error (${response.status}): ${await response.text()}`);

  if (onToken) {
    let content = '';
    let inTokens = 0;
    let outTokens = 0;
    await readStream(response, (line) => {
      if (!line.startsWith('data:')) return;
      const json = line.slice(5).trim();
      if (!json || json === '[DONE]') return;
      try {
        const ev = JSON.parse(json) as any;
        const delta = ev.choices?.[0]?.delta?.content;
        if (delta) { content += delta; onToken(delta); }
        if (ev.usage) { inTokens = ev.usage.prompt_tokens || inTokens; outTokens = ev.usage.completion_tokens || outTokens; }
      } catch { /* ignore */ }
    });
    return { content, model, usage: { input_tokens: inTokens, output_tokens: outTokens } };
  }

  const data = (await response.json()) as any;
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: data.model || model,
    usage: data.usage ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens } : undefined,
  };
}

// ─── Google Gemini ──────────────────────────────────────────────────────────────

async function callGemini(baseUrl: string, model: string, apiKey: string, messages: LlmMessage[], maxTokens: number, opts: RetryOpts, onToken?: OnToken): Promise<LlmResponse> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const chatMsgs = messages.filter((m) => m.role !== 'system');
  const body: Record<string, unknown> = {
    contents: chatMsgs.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  };
  const verb = onToken ? 'streamGenerateContent' : 'generateContent';
  const sep = onToken ? '?alt=sse&' : '?';
  const url = `${baseUrl}/${model}:${verb}${sep}key=${encodeURIComponent(apiKey)}`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { ...opts, providerLabel: 'Gemini API' });

  if (!response.ok) throw new Error(`Gemini API error (${response.status}): ${await response.text()}`);

  if (onToken) {
    let content = '';
    let inTokens = 0;
    let outTokens = 0;
    await readStream(response, (line) => {
      if (!line.startsWith('data:')) return;
      const json = line.slice(5).trim();
      if (!json) return;
      try {
        const ev = JSON.parse(json) as any;
        const delta = ev.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
        if (delta) { content += delta; onToken(delta); }
        if (ev.usageMetadata) { inTokens = ev.usageMetadata.promptTokenCount || inTokens; outTokens = ev.usageMetadata.candidatesTokenCount || outTokens; }
      } catch { /* ignore */ }
    });
    return { content, model, usage: { input_tokens: inTokens, output_tokens: outTokens } };
  }

  const data = (await response.json()) as any;
  const content = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  return {
    content,
    model: data.modelVersion || model,
    usage: data.usageMetadata
      ? { input_tokens: data.usageMetadata.promptTokenCount || 0, output_tokens: data.usageMetadata.candidatesTokenCount || 0 }
      : undefined,
  };
}

// ─── Ollama ─────────────────────────────────────────────────────────────────────

async function callOllama(url: string, model: string, messages: LlmMessage[], opts: RetryOpts, onToken?: OnToken): Promise<LlmResponse> {
  const body = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: !!onToken,
  };
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { ...opts, providerLabel: 'Ollama API' });

  if (!response.ok) throw new Error(`Ollama API error (${response.status}): ${await response.text()}`);

  if (onToken) {
    let content = '';
    await readStream(response, (line) => {
      try {
        const ev = JSON.parse(line) as any;
        if (ev.message?.content) { content += ev.message.content; onToken(ev.message.content); }
      } catch { /* ignore */ }
    });
    return { content, model };
  }

  const data = (await response.json()) as any;
  return { content: data.message?.content || '', model: data.model || model };
}

interface RetryOpts { timeoutMs: number; maxRetries: number; }

// ── CLI-subscription providers (Claude Code / Codex) ────────────────────────
// Shell out to the user's locally installed `claude` / `codex` CLI, which run on the
// user's own subscription. No API key. The Apex executor gathers the ServiceNow data
// itself and makes a single text-in/text-out call, so a headless CLI call fits cleanly.

function flattenMessages(messages: LlmMessage[]): { system: string; prompt: string } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const prompt = messages
    .filter((m) => m.role !== 'system')
    .map((m) => (m.role === 'assistant' ? 'Assistant: ' : '') + m.content)
    .join('\n\n');
  return { system, prompt };
}

function runCli(bin: string, args: string[], input: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new Error(`Could not start "${bin}". Is it installed and on your PATH? (${e instanceof Error ? e.message : e})`));
      return;
    }
    let out = '';
    let err = '';
    const timer = setTimeout(() => { try { child!.kill('SIGKILL'); } catch { /* ignore */ } reject(new Error(`"${bin}" timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout?.on('data', (d) => { out += d.toString(); });
    child.stderr?.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Could not run "${bin}". Is the CLI installed and logged in? (${e instanceof Error ? e.message : e})`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`"${bin}" exited with code ${code}: ${(err || out).slice(0, 500).trim()}`));
    });
    try { if (input) child.stdin?.write(input); child.stdin?.end(); } catch { /* ignore */ }
  });
}

/** Claude Code CLI — uses the user's Claude subscription. `claude -p` reads the prompt from stdin. */
async function callClaudeCli(config: LlmConfig, messages: LlmMessage[]): Promise<LlmResponse> {
  const { system, prompt } = flattenMessages(messages);
  const bin = process.env.NOWAIKIT_CLAUDE_BIN || 'claude';
  const args = ['-p'];
  if (config.model) args.push('--model', config.model);
  if (system) args.push('--append-system-prompt', system);
  const text = await runCli(bin, args, prompt, config.timeoutMs ?? 300000);
  return { content: text, model: config.model || 'claude-code' };
}

/** OpenAI Codex CLI — uses the user's Codex/ChatGPT subscription. Headless via `codex exec`. */
async function callCodexCli(config: LlmConfig, messages: LlmMessage[]): Promise<LlmResponse> {
  const { system, prompt } = flattenMessages(messages);
  const full = system ? `${system}\n\n${prompt}` : prompt;
  const bin = process.env.NOWAIKIT_CODEX_BIN || 'codex';
  const args = ['exec'];
  if (config.model) args.push('--model', config.model);
  args.push('-'); // read the prompt from stdin
  const text = await runCli(bin, args, full, config.timeoutMs ?? 300000);
  return { content: text, model: config.model || 'codex' };
}

/**
 * Send messages to the configured LLM provider and get a response.
 * Pass `onToken` to stream the response token-by-token (also returns the full text).
 */
export async function callLlm(config: LlmConfig, messages: LlmMessage[], onToken?: OnToken): Promise<LlmResponse> {
  const { url, model, apiKey } = resolveConfig(config);
  const maxTokens = config.maxTokens || 8192;
  const opts: RetryOpts = {
    timeoutMs: config.timeoutMs ?? 120000,
    maxRetries: config.maxRetries ?? 3,
  };

  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(url, model, apiKey, messages, maxTokens, opts, onToken);
    case 'openai':
      return callOpenAI(url, model, apiKey, messages, maxTokens, opts, onToken);
    case 'gemini':
      return callGemini(url, model, apiKey, messages, maxTokens, opts, onToken);
    case 'ollama':
      return callOllama(url, model, messages, opts, onToken);
    case 'lmstudio':
      return callOpenAI(url, model, apiKey, messages, maxTokens, opts, onToken);
    case 'claude-cli':
      return callClaudeCli(config, messages);
    case 'codex-cli':
      return callCodexCli(config, messages);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * List available models for a provider that supports discovery.
 * Currently Ollama (`/api/tags`); returns an empty array for others.
 */
export async function listProviderModels(config: Pick<LlmConfig, 'provider' | 'baseUrl' | 'apiKey'>): Promise<string[]> {
  if (config.provider === 'ollama') {
    const base = config.baseUrl?.replace(/\/api\/chat$/, '') || 'http://localhost:11434';
    try {
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return (data.models || []).map((m: any) => m.name).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}
