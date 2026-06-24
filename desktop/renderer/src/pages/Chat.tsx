import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { AppInstance, AppSettings, AiProviderId } from '../App.js';
import { PROVIDER_ICONS } from '../components/ProviderIcons.js';
import { api as unifiedApi } from '../api.js';

// ── Message types (Anthropic format, used across all providers) ───────────────
type CPText   = { type: 'text'; text: string };
type CPTool   = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
type CPResult = { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
type ContentPart = CPText | CPTool | CPResult;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentPart[];
}

// ── Display items (flattened for rendering) ───────────────────────────────────
type DisplayItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; parts: ContentPart[] }
  | { kind: 'tool'; tu: CPTool; result?: CPResult };

function toDisplayItems(messages: ChatMessage[]): DisplayItem[] {
  const results = new Map<string, CPResult>();
  for (const m of messages) {
    if (m.role === 'user' && Array.isArray(m.content))
      for (const c of m.content as ContentPart[])
        if (c.type === 'tool_result') results.set(c.tool_use_id, c);
  }

  const out: DisplayItem[] = [];
  for (const m of messages) {
    if (m.role === 'user' && typeof m.content === 'string') {
      out.push({ kind: 'user', text: m.content });
    } else if (m.role === 'assistant' && Array.isArray(m.content)) {
      for (const p of m.content as ContentPart[]) {
        if (p.type === 'text') out.push({ kind: 'assistant', parts: [p] });
        if (p.type === 'tool_use') out.push({ kind: 'tool', tu: p as CPTool, result: results.get((p as CPTool).id) });
      }
    }
  }
  return out;
}

// ── Basic markdown → React ────────────────────────────────────────────────────
function renderMd(text: string): React.ReactNode[] {
  const codeBlock = /```[\w]*\n?([\s\S]*?)```/g;
  const out: React.ReactNode[] = [];
  let last = 0, key = 0;
  let m: RegExpExecArray | null;
  while ((m = codeBlock.exec(text)) !== null) {
    if (m.index > last) out.push(renderInline(text.slice(last, m.index), key++));
    out.push(<pre key={key++} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'10px 14px', overflowX:'auto', fontSize:'0.8rem', margin:'8px 0' }}><code>{m[1].trim()}</code></pre>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(renderInline(text.slice(last), key++));
  return out;
}

function renderInline(text: string, key: number): React.ReactNode {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*)/g);
  return (
    <span key={key} style={{ whiteSpace:'pre-wrap' }}>
      {parts.map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`'))   return <code key={i} style={{ background:'var(--surface3)', padding:'1px 5px', borderRadius:4, fontSize:'0.82em' }}>{p.slice(1,-1)}</code>;
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>;
        return p;
      })}
    </span>
  );
}

// ── Report export helper ─────────────────────────────────────────────────────
async function downloadReport(markdown: string, format: 'pdf' | 'pptx') {
  const res = await fetch('/api/report/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, title: 'NowAIKit Chat Export', format }),
  });
  if (!res.ok) throw new Error(`Report generation failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-export-${Date.now()}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Check if text qualifies for report export (long + has markdown headings) */
function isExportable(text: string): boolean {
  return text.length > 500 && /^#{1,3}\s/m.test(text);
}

function ExportToolbar({ text }: { text: string }) {
  const [busy, setBusy] = useState<'pdf' | 'pptx' | null>(null);

  async function handleExport(format: 'pdf' | 'pptx') {
    setBusy(format);
    try { await downloadReport(text, format); }
    catch { /* toast/notification could go here */ }
    finally { setBusy(null); }
  }

  const btnStyle: React.CSSProperties = {
    background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4,
    color:'var(--text2)', padding:'2px 8px', fontSize:'0.7rem', fontWeight:600,
    cursor:'pointer', transition:'all .15s',
  };

  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
      <span style={{ fontSize:'0.68rem', color:'var(--dim)' }}>Export:</span>
      <button onClick={() => handleExport('pdf')}  disabled={busy !== null} style={{ ...btnStyle, opacity: busy ? 0.5 : 1 }}>
        {busy === 'pdf' ? '…' : 'PDF'}
      </button>
      <button onClick={() => handleExport('pptx')} disabled={busy !== null} style={{ ...btnStyle, opacity: busy ? 0.5 : 1 }}>
        {busy === 'pptx' ? '…' : 'PPTX'}
      </button>
    </div>
  );
}

// ── Collapsible tool call card ────────────────────────────────────────────────
function ToolCard({ tu, result }: { tu: CPTool; result?: CPResult }) {
  const [open, setOpen] = useState(false);
  const ok = result && !result.is_error;
  return (
    <div style={{ background:'#1a1f35', border:'1px solid #2e3a5f', borderRadius:8, fontSize:'0.78rem', overflow:'hidden', fontFamily:'monospace' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
        background:'transparent', border:'none', color:'#93c5fd', cursor:'pointer', textAlign:'left',
      }}>
        <span style={{ fontSize:'0.7rem', opacity:.7 }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontWeight:600 }}>{tu.name}</span>
        {result && <span className={ok ? 'badge-green' : 'badge-red'} style={{ marginLeft:'auto' }}>{ok ? 'ok' : 'error'}</span>}
        {!result && <span className="badge-dim" style={{ marginLeft:'auto' }}>running…</span>}
      </button>
      {open && (
        <div style={{ padding:'8px 10px', borderTop:'1px solid #2e3a5f' }}>
          <div style={{ color:'var(--dim)', fontSize:'0.68rem', marginBottom:3, letterSpacing:'0.05em' }}>INPUT</div>
          <pre style={{ fontSize:'0.74rem', overflowX:'auto', color:'#a5f3fc', marginBottom:result ? 8 : 0 }}>{JSON.stringify(tu.input, null, 2)}</pre>
          {result && <>
            <div style={{ color:'var(--dim)', fontSize:'0.68rem', marginBottom:3, letterSpacing:'0.05em' }}>{result.is_error ? 'ERROR' : 'OUTPUT'}</div>
            <pre style={{ fontSize:'0.74rem', overflowX:'auto', color: result.is_error ? 'var(--red)' : '#a5f3fc' }}>{result.content}</pre>
          </>}
        </div>
      )}
    </div>
  );
}

// ── Provider / model config ───────────────────────────────────────────────────
const LOCAL_PROVIDERS = new Set<AiProviderId>(['ollama', 'lmstudio']);

const PROVIDER_META: { id: AiProviderId; label: string }[] = [
  { id: 'anthropic',  label: 'Claude' },
  { id: 'openai',     label: 'ChatGPT' },
  { id: 'google',     label: 'Gemini' },
  { id: 'groq',       label: 'Groq' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama',     label: 'Ollama' },
  { id: 'lmstudio',   label: 'LM Studio' },
];

const MODELS_BY_PROVIDER: Record<AiProviderId, { value: string; label: string }[]> = {
  anthropic: [
    { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { value: 'gpt-5.2',         label: 'GPT-5.2' },
    { value: 'gpt-5.2-pro',     label: 'GPT-5.2 Pro' },
    { value: 'gpt-5.1',         label: 'GPT-5.1' },
    { value: 'gpt-5-mini',      label: 'GPT-5 mini' },
    { value: 'gpt-5-nano',      label: 'GPT-5 nano' },
    { value: 'gpt-4.1',         label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini',    label: 'GPT-4.1 mini' },
    { value: 'gpt-4o',          label: 'GPT-4o' },
    { value: 'o3',              label: 'o3' },
    { value: 'o4-mini',         label: 'o4 mini' },
  ],
  google: [
    { value: 'gemini-3.1-pro-preview',  label: 'Gemini 3.1 Pro' },
    { value: 'gemini-3-pro-preview',     label: 'Gemini 3 Pro' },
    { value: 'gemini-3-flash-preview',   label: 'Gemini 3 Flash' },
    { value: 'gemini-2.5-flash',         label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro',           label: 'Gemini 2.5 Pro' },
  ],
  groq: [
    { value: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick' },
    { value: 'meta-llama/llama-4-scout-17b-16e-instruct',     label: 'Llama 4 Scout' },
    { value: 'llama-3.3-70b-versatile',                       label: 'Llama 3.3 70B' },
    { value: 'llama-3.1-8b-instant',                          label: 'Llama 3.1 8B' },
  ],
  openrouter: [
    { value: 'openai/o1-pro',                                   label: 'OpenAI o1 Pro' },
    { value: 'xai/grok-4',                                      label: 'Grok 4 (xAI)' },
    { value: 'anthropic/claude-3.7-sonnet',                      label: 'Claude 3.7 Sonnet' },
    { value: 'google/gemini-2.0-flash-001',                      label: 'Gemini 2.0 Flash' },
    { value: 'deepseek/deepseek-r1:free',                        label: 'DeepSeek R1 (free)' },
    { value: 'meta-llama/llama-4-maverick-17b-128e-instruct',    label: 'Llama 4 Maverick' },
    { value: 'meta-llama/llama-3.3-70b-instruct',                label: 'Llama 3.3 70B' },
    { value: 'google/gemma-2-9b-it:free',                        label: 'Gemma 2 9B (free)' },
  ],
  ollama: [
    { value: 'llama3.3:latest',       label: 'Llama 3.3 70B' },
    { value: 'llama3.2:latest',       label: 'Llama 3.2 3B' },
    { value: 'qwen3:latest',          label: 'Qwen 3' },
    { value: 'deepseek-r1:latest',    label: 'DeepSeek R1' },
    { value: 'gemma3:latest',         label: 'Gemma 3' },
    { value: 'phi4:latest',           label: 'Phi-4' },
    { value: 'mistral:latest',        label: 'Mistral' },
    { value: 'granite3.3:latest',     label: 'Granite 3.3' },
  ],
  lmstudio: [
    { value: 'llama-3.3-70b',         label: 'Llama 3.3 70B' },
    { value: 'qwen3-8b',              label: 'Qwen 3 8B' },
    { value: 'deepseek-r1-distill',   label: 'DeepSeek R1 Distill' },
    { value: 'gemma-3-9b',            label: 'Gemma 3 9B' },
    { value: 'phi-4',                 label: 'Phi-4' },
    { value: 'mistral-7b',            label: 'Mistral 7B' },
  ],
};

const SUGGESTIONS = [
  'Show me my 5 most recent open incidents',
  'List all critical change requests scheduled for this week',
  'Find all CIs with no owner assigned',
  'What problems have been open for more than 30 days?',
];

// ── Tool type (for slash-command picker + API calls) ─────────────────────────
interface ToolDef {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

// ── Smart tool selection (max 128 to stay within provider limits) ────────────
const MAX_TOOLS = 128;

// Essential tools always included (generic querying, core operations)
const ESSENTIAL_TOOLS = new Set([
  'query_records', 'get_record', 'get_table_schema', 'get_user', 'get_group',
  'get_incident', 'create_incident', 'update_incident', 'resolve_incident',
  'get_change_request', 'list_change_requests', 'create_change_request', 'update_change_request',
  'get_task', 'list_my_tasks', 'update_task',
  'get_problem', 'create_problem', 'update_problem',
  'search_knowledge', 'get_knowledge_article',
  'add_work_note', 'add_comment',
  'search_cmdb_ci', 'get_cmdb_ci',
  'list_users', 'list_groups',
  'natural_language_search',
]);

// Synonym mapping: user term → tool name fragments to boost
const SYNONYMS: Record<string, string[]> = {
  incident: ['incident', 'resolve_incident', 'close_incident', 'add_work_note', 'add_comment'],
  incidents: ['incident', 'query_records'],
  change: ['change_request', 'change'],
  changes: ['change_request', 'query_records'],
  problem: ['problem'],
  problems: ['problem', 'query_records'],
  task: ['task'],
  tasks: ['task', 'query_records'],
  user: ['user', 'get_user'],
  users: ['user', 'list_users', 'query_records'],
  group: ['group'],
  groups: ['group', 'list_groups'],
  knowledge: ['knowledge'],
  kb: ['knowledge'],
  ci: ['cmdb', 'ci'],
  cmdb: ['cmdb', 'ci'],
  server: ['cmdb', 'ci_server'],
  catalog: ['catalog'],
  flow: ['flow'],
  report: ['report', 'aggregate', 'trend'],
  sla: ['sla'],
  approval: ['approval'],
  hr: ['hr_'],
  security: ['security'],
  vulnerability: ['vulnerab'],
  asset: ['asset'],
  license: ['license'],
  portal: ['portal'],
  widget: ['widget'],
  script: ['script', 'business_rule'],
  acl: ['acl'],
  notification: ['notification', 'email'],
  atf: ['atf'],
  test: ['atf', 'test'],
};

function stem(word: string): string {
  // Simple stemming: remove trailing s, es, ing, ed
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
  if (word.endsWith('es')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  return word;
}

function selectRelevantTools(allTools: ToolDef[], userMessage: string): ToolDef[] {
  if (allTools.length <= MAX_TOOLS) return allTools;

  const q = userMessage.toLowerCase();
  const rawWords = q.split(/\s+/).filter(w => w.length > 2);
  // Add stemmed variants
  const words = [...new Set([...rawWords, ...rawWords.map(stem)])];

  // Collect synonym boost fragments
  const boostFragments: string[] = [];
  for (const w of rawWords) {
    const syns = SYNONYMS[w] || SYNONYMS[stem(w)];
    if (syns) boostFragments.push(...syns);
  }

  const scored = allTools.map(t => {
    let score = 0;
    const name = t.name.toLowerCase();
    const desc = (t.description || '').toLowerCase();

    // Essential tools always get a base score
    if (ESSENTIAL_TOOLS.has(t.name)) score += 5;

    // Word matching (with stemmed variants)
    for (const w of words) {
      if (name.includes(w)) score += 3;
      if (desc.includes(w)) score += 1;
    }

    // Synonym boost
    for (const frag of boostFragments) {
      if (name.includes(frag)) score += 4;
    }

    // Boost common operation prefixes
    if (name.startsWith('list_') || name.startsWith('get_') || name.startsWith('search_')) score += 1;

    return { tool: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_TOOLS).map(s => s.tool);
}

// ── Chat via IPC — with full tool execution loop ────────────────────────────
// Flow: send messages + tool defs → AI responds → if tool_use → execute tools →
//       send results back → AI responds again → repeat until no more tool calls.
const MAX_TOOL_ROUNDS = 8; // safety limit

async function callProviderApi(
  provider: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  onUpdate: (msgs: ChatMessage[]) => void,
  baseUrl?: string,
): Promise<{ messages?: ChatMessage[]; error?: string }> {
  if (!apiKey && !LOCAL_PROVIDERS.has(provider as AiProviderId)) return { error: 'No API key configured. Go to Settings to add one.' };

  const a = unifiedApi;

  let currentMessages = [...messages];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Build message array preserving full content structure for the API
      const apiMessages = currentMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const result = await a.sendChat({
        provider, apiKey, model,
        messages: apiMessages,
        tools: tools.length > 0 ? tools : undefined,
        baseUrl,
      });

      if (result.error) return { error: result.error };

      // Parse response content (may include text + tool_use blocks)
      const rawContent = result.content ?? [];
      const assistantParts: ContentPart[] = rawContent.map(c => {
        if (c.type === 'tool_use') {
          return { type: 'tool_use', id: c.id ?? `toolu_${Date.now()}`, name: c.name ?? '', input: (c.input ?? {}) as Record<string, unknown> } as CPTool;
        }
        return { type: 'text' as const, text: c.text ?? '' } as CPText;
      });

      currentMessages = [...currentMessages, { role: 'assistant', content: assistantParts }];
      onUpdate(currentMessages);

      // Check if AI wants to call tools
      const toolUses = assistantParts.filter((p): p is CPTool => p.type === 'tool_use');
      if (toolUses.length === 0 || result.stop_reason !== 'tool_use') {
        // No tool calls — done
        return { messages: currentMessages };
      }

      // Execute each tool call and collect results
      const toolResults: CPResult[] = [];
      for (const tu of toolUses) {
        try {
          const execResult = await a.executeTool(tu.name, tu.input);
          const resultText = execResult.success
            ? (typeof execResult.result === 'string' ? execResult.result : JSON.stringify(execResult.result, null, 2))
            : `Error: ${execResult.error ?? 'Tool execution failed'}`;

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: resultText,
            is_error: !execResult.success,
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            is_error: true,
          });
        }
      }

      // Add tool results as a user message and loop
      currentMessages = [...currentMessages, { role: 'user', content: toolResults }];
      onUpdate(currentMessages);
    }

    return { messages: currentMessages, error: 'Tool execution limit reached. The AI made too many consecutive tool calls.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Request failed' };
  }
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  settings: AppSettings;
  serverUrl: string;
  instances: AppInstance[];
}

// ── Chat history persistence ─────────────────────────────────────────────────
const CHAT_STORAGE_KEY = 'nowaikit_chat_history';

function saveChatHistory(providerId: string, msgs: ChatMessage[]) {
  try {
    const all = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    all[providerId] = msgs;
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(all));
  } catch { /* quota exceeded or other error — ignore */ }
}

function loadChatHistory(providerId: string): ChatMessage[] {
  try {
    const all = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    return all[providerId] || [];
  } catch { return []; }
}

function clearChatHistory(providerId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    delete all[providerId];
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export default function Chat({ settings, serverUrl, instances }: Props): React.ReactElement {
  const [provider,  setProvider]  = useState<AiProviderId>(settings.activeProvider || 'anthropic');
  const [model,     setModel]     = useState(settings.model || 'claude-sonnet-4-6');
  const [messages,  setMessages]  = useState<ChatMessage[]>(() => loadChatHistory(settings.activeProvider || 'anthropic'));
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  // Slash-command tool picker
  const [allTools,    setAllTools]    = useState<ToolDef[]>([]);
  const [slashOpen,   setSlashOpen]   = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex,  setSlashIndex]  = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const slashRef  = useRef<HTMLDivElement>(null);
  const prevProviderRef = useRef(provider);

  // Persist messages whenever they change — but NOT when provider just switched
  // (otherwise old provider's messages get saved under new provider key)
  useEffect(() => {
    if (prevProviderRef.current === provider) {
      saveChatHistory(provider, messages);
    }
  }, [messages, provider]);

  // Sync model when provider changes — load saved history for that provider
  useEffect(() => {
    const models = MODELS_BY_PROVIDER[provider];
    const firstModel = models[0].value;
    if (!models.find(m => m.value === model)) setModel(firstModel);
    // Load saved history for this provider (or empty if none)
    setMessages(loadChatHistory(provider));
    setError('');
    prevProviderRef.current = provider;
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  // Load tool list for slash-command picker
  useEffect(() => {
    const a = unifiedApi;
    a.listTools().then(d => setAllTools(d ?? [])).catch(() => {});
  }, []);

  // Close slash popup on outside click
  useEffect(() => {
    if (!slashOpen) return;
    const handler = (e: MouseEvent) => {
      if (!slashRef.current?.contains(e.target as Node) && !inputRef.current?.contains(e.target as Node)) {
        setSlashOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [slashOpen]);

  const activeProvider = settings.providers[provider];
  const isLocal  = LOCAL_PROVIDERS.has(provider);
  const hasKey   = isLocal || Boolean(activeProvider?.apiKey);
  const active   = instances.find(i => i.active);
  const displayItems = toDisplayItems(messages);

  // Slash-command filtered tool list
  const filteredTools = slashFilter
    ? allTools.filter(t => t.name.toLowerCase().includes(slashFilter.toLowerCase()) || t.description?.toLowerCase().includes(slashFilter.toLowerCase()))
    : allTools;
  const slashTools = filteredTools.slice(0, 10);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    // Detect slash command
    const slashMatch = val.match(/(?:^|\s)\/([\w_]*)$/);
    if (slashMatch) {
      setSlashFilter(slashMatch[1]);
      setSlashIndex(0);
      setSlashOpen(true);
    } else {
      setSlashOpen(false);
    }
  }

  function pickSlashTool(tool: ToolDef) {
    // Replace the trailing /... with the tool name
    const newInput = input.replace(/(?:^|\s)\/([\w_]*)$/, match => {
      const space = match.startsWith(' ') ? ' ' : '';
      return `${space}/${tool.name} `;
    });
    setInput(newInput);
    setSlashOpen(false);
    inputRef.current?.focus();
  }

  async function send(text?: string) {
    const userText = (text ?? input).trim();
    if (!userText || loading) return;
    setInput('');
    setError('');
    setSlashOpen(false);

    // Expand /toolname shortcuts → hint for the AI
    const expandedText = userText.replace(/\/([\w_]+)/g, (_match, name) => {
      const found = allTools.find(t => t.name === name);
      return found ? `(use tool: ${name})` : _match;
    });

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: expandedText !== userText ? userText : userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Select most relevant tools (max 128) based on user's query
      const relevantTools = selectRelevantTools(allTools, userText);

      const result = await callProviderApi(
        provider, activeProvider?.apiKey ?? '', model, newMessages, relevantTools,
        (updatedMsgs) => setMessages(updatedMsgs), // live update as tools execute
        activeProvider?.baseUrl,
      );
      setLoading(false);
      if (result.error) { setError(result.error); return; }
      if (result.messages) setMessages(result.messages);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Chat request failed');
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (slashOpen && slashTools.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, slashTools.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && slashOpen)) {
        e.preventDefault();
        if (slashTools[slashIndex]) pickSlashTool(slashTools[slashIndex]);
        return;
      }
      if (e.key === 'Escape') { setSlashOpen(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const selectStyle: React.CSSProperties = {
    background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6,
    color:'var(--text)', padding:'6px 10px', fontSize:'0.8rem',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)', maxWidth:900, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12, flexWrap:'wrap' }}>
        <div style={{ minWidth:0 }}>
          <h2 className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            AI Chat
          </h2>
          {active && <div style={{ fontSize:'0.78rem', color:'var(--dim)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Instance: {active.name} · {active.url}</div>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, flexWrap:'wrap' }}>
          {/* Provider selector */}
          <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:6, overflow:'hidden' }}>
            {PROVIDER_META.map(p => {
              const hasProviderKey = LOCAL_PROVIDERS.has(p.id) || Boolean(settings.providers[p.id]?.apiKey);
              return (
                <button key={p.id} onClick={() => setProvider(p.id)} style={{
                  padding:'5px 12px', border:'none', fontSize:'0.78rem', cursor:'pointer',
                  background: provider === p.id ? 'var(--accent)' : 'transparent',
                  color: provider === p.id ? '#fff' : hasProviderKey ? 'var(--text2)' : 'var(--dim)',
                  fontWeight: provider === p.id ? 600 : 400, transition:'all .15s',
                  display:'flex', alignItems:'center', gap:5,
                }}>
                  {React.createElement(PROVIDER_ICONS[p.id] ?? (() => null), { size: 14, color: provider === p.id ? '#fff' : 'currentColor' })} {p.label}
                  {hasProviderKey && provider !== p.id && <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--green)' }} />}
                </button>
              );
            })}
          </div>
          {/* Model selector */}
          <select value={model} onChange={e => setModel(e.target.value)} style={selectStyle}>
            {MODELS_BY_PROVIDER[provider].map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          {messages.length > 0 && (<>
            <button className="btn-ghost" onClick={() => { clearChatHistory(provider); setMessages([]); setError(''); }} style={{ padding:'6px 14px', fontSize:'0.8rem' }}>New Chat</button>
          </>)}
        </div>
      </div>

      {/* No API key warning */}
      {!hasKey && !isLocal && (
        <div style={{ background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:'0.875rem', color:'var(--yellow)' }}>
          No API key for <strong>{PROVIDER_META.find(p => p.id === provider)?.label}</strong>. Go to <strong>Settings → AI Providers</strong> to add your key.
        </div>
      )}

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', marginBottom:16, display:'flex', flexDirection:'column', gap:4 }}>
        {displayItems.length === 0 && (
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, color:'var(--dim)' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'1.8rem', marginBottom:8 }}>🔗</div>
              <div style={{ fontSize:'0.95rem', color:'var(--text2)', fontWeight:500 }}>Ask anything about your ServiceNow instance</div>
              <div style={{ fontSize:'0.8rem', marginTop:4 }}>Type <code style={{ background:'var(--surface2)', padding:'1px 5px', borderRadius:3 }}>/</code> to browse &amp; run tools · Shift+Enter for new line</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%', maxWidth:560 }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} style={{
                  background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8,
                  color:'var(--text2)', padding:'10px 14px', textAlign:'left', fontSize:'0.85rem', cursor:'pointer',
                  transition:'all .15s',
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {displayItems.map((item, i) => {
          if (item.kind === 'user') return (
            <div key={i} style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
              <div style={{ background:'var(--accent)', color:'#fff', borderRadius:8, padding:'10px 12px', maxWidth:'88%', fontSize:'0.85rem', lineHeight:1.5 }}>
                {item.text}
              </div>
            </div>
          );
          if (item.kind === 'assistant') {
            const text = (item.parts[0] as CPText).text;
            return (
              <div key={i} style={{ display:'flex', justifyContent:'flex-start', marginBottom:6 }}>
                <div style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', maxWidth:'88%', fontSize:'0.85rem', lineHeight:1.5 }}>
                  {renderMd(text)}
                  {isExportable(text) && <ExportToolbar text={text} />}
                </div>
              </div>
            );
          }
          if (item.kind === 'tool') return (
            <div key={i} style={{ maxWidth:'95%', marginBottom:4 }}>
              <ToolCard tu={item.tu} result={item.result} />
            </div>
          );
          return null;
        })}

        {loading && (
          <div style={{ display:'flex', justifyContent:'flex-start', marginBottom:4 }}>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'3px 14px 14px 14px', padding:'12px 16px' }}>
              <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                {[0,1,2].map(j => (
                  <div key={j} style={{ width:7, height:7, borderRadius:'50%', background:'var(--dim)', animation:`bounce .9s ease-in-out ${j*0.2}s infinite alternate` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:8, padding:'10px 14px', color:'var(--red)', fontSize:'0.85rem' }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Slash-command tool picker */}
      {slashOpen && slashTools.length > 0 && (
        <div ref={slashRef} style={{
          position:'relative', marginBottom:4,
        }}>
          <div style={{
            position:'absolute', bottom:'100%', left:0, right:0,
            background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8,
            boxShadow:'0 8px 24px rgba(0,0,0,0.4)', zIndex:50, maxHeight:280, overflowY:'auto',
          }}>
            <div style={{ padding:'8px 12px 6px', fontSize:'0.7rem', color:'var(--dim)', textTransform:'uppercase', letterSpacing:'0.07em', borderBottom:'1px solid var(--border)' }}>
              Tools — Tab or Enter to select · Esc to close
            </div>
            {slashTools.map((t, i) => (
              <button key={t.name} onMouseDown={e => { e.preventDefault(); pickSlashTool(t); }} style={{
                display:'flex', alignItems:'baseline', gap:10, width:'100%', padding:'8px 12px',
                background: i === slashIndex ? 'var(--accent-bg)' : 'transparent',
                border:'none', cursor:'pointer', textAlign:'left', transition:'background .1s',
                borderBottom: i < slashTools.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <code style={{ color:'var(--accent)', fontWeight:600, fontSize:'0.8rem', flexShrink:0 }}>/{t.name}</code>
                <span style={{ fontSize:'0.75rem', color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.description}</span>
              </button>
            ))}
            {allTools.length > 10 && (
              <div style={{ padding:'6px 12px', fontSize:'0.72rem', color:'var(--dim)', borderTop:'1px solid var(--border)' }}>
                {filteredTools.length} tools · type to filter
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input row */}
      <div style={{ display:'flex', gap:10, alignItems:'flex-end', paddingBottom:4 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKey}
          placeholder="Ask anything… or type / to browse tools (Enter to send)"
          rows={1}
          disabled={loading || !hasKey}
          style={{
            flex:1, background:'var(--surface2)', border:'1px solid var(--border)',
            borderRadius:10, color:'var(--text)', padding:'11px 14px',
            fontSize:'0.9rem', resize:'none', outline:'none',
            transition:'border-color .15s, box-shadow .15s', minHeight:46, maxHeight:160,
            lineHeight:1.5,
            ...(input ? { borderColor:'var(--accent)', boxShadow:'0 0 0 3px var(--accent-bg)' } : {}),
          }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim() || !hasKey}
          className="btn-primary"
          style={{ padding:'11px 20px', borderRadius:10, flexShrink:0, opacity: (loading || !input.trim() || !hasKey) ? 0.45 : 1 }}
        >
          {loading ? <span className="spinner" style={{ width:16, height:16, borderWidth:2 }} /> : 'Send'}
        </button>
      </div>

      <style>{`
        @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-5px); } }
        textarea:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-bg) !important; }
      `}</style>
    </div>
  );
}
