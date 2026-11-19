#!/usr/bin/env node
/**
 * NowAIKit Web Server
 *
 * Zero-dependency Node.js server that:
 * 1. Serves the built renderer/dist/ static files
 * 2. Proxies /api/ai/* requests to AI providers (bypasses CORS)
 *
 * Security:
 * - Binds to localhost only by default (set HOST=0.0.0.0 to expose)
 * - CORS restricted to same-origin (configurable via ALLOWED_ORIGINS)
 * - Requires X-NowAIKit-Proxy header on AI proxy requests (CSRF protection)
 * - Path traversal and null-byte injection protection
 * - Only whitelisted headers forwarded to upstream providers
 * - API keys are never logged
 *
 * Usage:
 *   node serve.js              # default port 4175, localhost only
 *   PORT=3000 node serve.js    # custom port
 *   HOST=0.0.0.0 node serve.js # expose to network (use with caution)
 *   npm run serve              # via package.json script
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '4175', 10);
const HOST = process.env.HOST || '127.0.0.1';
const STATIC_DIR = path.join(__dirname, 'renderer', 'dist');

// Configurable allowed origins (comma-separated)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

// ─── MIME types ──────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json',
};

// ─── AI provider proxy config ────────────────────────────────────────────────

const AI_PROXIES = {
  '/api/ai/anthropic':  { target: 'https://api.anthropic.com', strip: '/api/ai/anthropic' },
  '/api/ai/openai':     { target: 'https://api.openai.com',    strip: '/api/ai/openai' },
  '/api/ai/google':     { target: 'https://generativelanguage.googleapis.com', strip: '/api/ai/google' },
  '/api/ai/groq':       { target: 'https://api.groq.com',      strip: '/api/ai/groq' },
  '/api/ai/openrouter': { target: 'https://openrouter.ai',     strip: '/api/ai/openrouter' },
  '/api/ai/ollama':     { target: 'http://localhost:11434',     strip: '/api/ai/ollama' },
  '/api/ai/lmstudio':   { target: 'http://localhost:1234',      strip: '/api/ai/lmstudio' },
};

// Headers that are safe to forward to upstream AI providers
const ALLOWED_PROXY_HEADERS = new Set([
  'content-type', 'authorization', 'x-api-key', 'anthropic-version',
  'accept', 'accept-encoding', 'user-agent',
]);

// Headers safe to forward to ServiceNow instances
const ALLOWED_SNOW_HEADERS = new Set([
  'content-type', 'authorization', 'accept', 'accept-encoding', 'user-agent',
]);

// ─── Security helpers ────────────────────────────────────────────────────────

/** Check if an origin is allowed for CORS */
function isAllowedOrigin(origin) {
  if (!origin) return true; // Same-origin requests have no Origin header
  // Always allow same-host requests
  if (origin.startsWith(`http://localhost:${PORT}`) || origin.startsWith(`http://127.0.0.1:${PORT}`)) return true;
  // Allow dev server
  if (origin.startsWith('http://localhost:5173') || origin.startsWith('http://127.0.0.1:5173')) return true;
  // Allow custom configured origins
  return ALLOWED_ORIGINS.includes(origin);
}

/** Strip potential API key patterns from strings (for safe logging) */
function sanitizeForLog(str) {
  if (!str) return str;
  // Redact common API key patterns
  return str
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-***REDACTED***')
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***REDACTED***')
    .replace(/AIza[a-zA-Z0-9_-]+/g, 'AIza***REDACTED***')
    .replace(/gsk_[a-zA-Z0-9_-]+/g, 'gsk_***REDACTED***')
    .replace(/sk-or-[a-zA-Z0-9_-]+/g, 'sk-or-***REDACTED***')
    .replace(/key=[^&\s]+/g, 'key=***REDACTED***');
}

// ─── Rate limiting (simple per-IP) ──────────────────────────────────────────

const rateLimits = new Map(); // IP -> { count, resetAt }
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '60', 10); // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW };
    rateLimits.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Periodically clean up stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  }
}, 60000);

// ─── Proxy handler ───────────────────────────────────────────────────────────

function proxyRequest(req, res, proxyConfig) {
  const rewritten = req.url.replace(proxyConfig.strip, '') || '/';
  const target = new URL(rewritten, proxyConfig.target);

  // Collect request body (limit to 10MB)
  const chunks = [];
  let totalSize = 0;
  const MAX_BODY = 10 * 1024 * 1024;

  req.on('data', chunk => {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (totalSize > MAX_BODY) return;
    const body = Buffer.concat(chunks);

    // Only forward whitelisted headers
    const headers = { 'host': target.hostname };
    for (const [key, value] of Object.entries(req.headers)) {
      if (ALLOWED_PROXY_HEADERS.has(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    const isTargetHttps = target.protocol === 'https:';
    const mod = isTargetHttps ? https : http;
    const options = {
      hostname: target.hostname,
      port: isTargetHttps ? 443 : (parseInt(target.port, 10) || 80),
      path: target.pathname + target.search,
      method: req.method,
      headers,
    };

    const origin = req.headers.origin;
    const allowedOrigin = isAllowedOrigin(origin) ? (origin || '*') : '';

    const proxyReq = mod.request(options, (proxyRes) => {
      // Set CORS headers for the allowed origin
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, X-NowAIKit-Proxy');
      }

      // Forward response headers (skip upstream CORS headers)
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        const lower = key.toLowerCase();
        if (lower.startsWith('access-control-')) continue;
        if (value) res.setHeader(key, value);
      }

      res.writeHead(proxyRes.statusCode || 500);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`Proxy error -> ${target.hostname}: ${sanitizeForLog(err.message)}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AI provider unreachable. Check your internet connection.' }));
    });

    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
}

// ─── ServiceNow proxy handler ─────────────────────────────────────────────────

/**
 * Proxies requests to a ServiceNow instance (bypasses CORS).
 * Route: /api/snow/{base64url-encoded-instance-url}/{rest-of-path}
 * Example: /api/snow/aHR0cHM6Ly9kZXYxMjM0NS5zZXJ2aWNlLW5vdy5jb20/api/now/table/incident?sysparm_limit=5
 */
function proxySnowRequest(req, res) {
  // Parse: /api/snow/{encodedBase}/{path...}
  const after = req.url.slice('/api/snow/'.length);
  const slashIdx = after.indexOf('/');
  if (slashIdx < 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing instance URL segment' }));
    return;
  }
  const encodedBase = after.slice(0, slashIdx);
  const restPath = after.slice(slashIdx); // includes leading /

  let instanceUrl;
  try {
    instanceUrl = Buffer.from(encodedBase, 'base64url').toString('utf8');
  } catch {
    try { instanceUrl = Buffer.from(encodedBase, 'base64').toString('utf8'); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid base64 instance URL' }));
      return;
    }
  }

  // Validate the instance URL. SSRF guard: only https, and only ServiceNow hosts.
  // Without this, a caller could make the local server proxy to arbitrary internal
  // hosts (e.g. cloud metadata at 169.254.169.254) or intranet services.
  let parsedInstance;
  try {
    parsedInstance = new URL(instanceUrl);
    if (parsedInstance.protocol !== 'https:') {
      throw new Error('bad protocol');
    }
    const host = parsedInstance.hostname.toLowerCase();
    const allowed = host.endsWith('.service-now.com') || host.endsWith('.servicenowservices.com');
    if (!allowed) {
      throw new Error('host not allowed');
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid instance URL: must be an https ServiceNow host (*.service-now.com)' }));
    return;
  }

  const target = new URL(restPath, instanceUrl);

  // Collect request body
  const chunks = [];
  let totalSize = 0;
  const MAX_BODY = 10 * 1024 * 1024;

  req.on('data', chunk => {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (totalSize > MAX_BODY) return;
    const body = Buffer.concat(chunks);

    const headers = { 'host': target.hostname };
    for (const [key, value] of Object.entries(req.headers)) {
      if (ALLOWED_SNOW_HEADERS.has(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    const isHttps = target.protocol === 'https:';
    const mod = isHttps ? https : http;
    const options = {
      hostname: target.hostname,
      port: isHttps ? 443 : (parseInt(target.port, 10) || 80),
      path: target.pathname + target.search,
      method: req.method,
      headers,
    };

    const origin = req.headers.origin;
    const allowedOrigin = isAllowedOrigin(origin) ? (origin || '*') : '';

    const proxyReq = mod.request(options, (proxyRes) => {
      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-NowAIKit-Proxy');
      }

      for (const [key, value] of Object.entries(proxyRes.headers)) {
        const lower = key.toLowerCase();
        if (lower.startsWith('access-control-')) continue;
        if (value) res.setHeader(key, value);
      }

      res.writeHead(proxyRes.statusCode || 500);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`Snow proxy error -> ${target.hostname}: ${err.message}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ServiceNow instance unreachable. Check the URL and your network.' }));
    });

    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
}

// ─── Static file handler ─────────────────────────────────────────────────────

function serveStatic(req, res) {
  // Decode URL and reject null bytes
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (urlPath.includes('\0')) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  let filePath = path.resolve(STATIC_DIR, urlPath === '/' ? 'index.html' : '.' + urlPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback: serve index.html for client-side routes
      filePath = path.join(STATIC_DIR, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';

      // Security headers
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
      res.end(data);
    });
  });
}

// ─── Report generation handler ───────────────────────────────────────────────

/**
 * POST /api/report/generate
 * Body: { markdown, format, title, instanceUrl, instanceName, capability }
 * Returns: binary file with appropriate Content-Type
 */
function handleReportGenerate(req, res) {
  const chunks = [];
  let totalSize = 0;
  const MAX_BODY = 10 * 1024 * 1024;

  req.on('data', chunk => {
    totalSize += chunk.length;
    if (totalSize > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', async () => {
    if (totalSize > MAX_BODY) return;

    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { markdown, format, title, instanceUrl, instanceName, capability } = body;

      if (!markdown || !format || !title) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'markdown, format, and title are required' }));
        return;
      }

      if (format !== 'pdf' && format !== 'pptx') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'format must be "pdf" or "pptx"' }));
        return;
      }

      // Dynamic import of the report module (ESM from CJS)
      const reportModule = await import(path.resolve(__dirname, '..', 'dist', 'reports', 'index.js'));
      const result = await reportModule.generateReport(markdown, format, {
        title,
        instanceUrl: instanceUrl || '',
        instanceName: instanceName || 'instance',
        capability: capability || '',
      });

      // Read generated file and send it
      const fileBuffer = fs.readFileSync(result.filePath);
      const contentType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      const fileName = path.basename(result.filePath);

      const origin = req.headers.origin;
      const allowedOrigin = isAllowedOrigin(origin) ? (origin || '*') : '';

      const headers = {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length,
      };
      if (allowedOrigin) {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
      }

      res.writeHead(200, headers);
      res.end(fileBuffer);

      // Cleanup temp file
      try { fs.unlinkSync(result.filePath); } catch { /* ignore */ }
    } catch (err) {
      console.error('Report generation error:', err.message || err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Report generation failed: ' + (err.message || 'unknown error') }));
    }
  });
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

/** Read a JSON file from ~/.config/nowaikit (returns null if missing/invalid). */
function readNowaikitJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'nowaikit', file), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * POST /api/ai/claude-cli
 * Runs the local `claude` CLI (Claude Code subscription) headlessly with the NowAIKit MCP loaded, so
 * it answers with real ServiceNow data using the user's subscription instead of an API key. The MCP
 * server authenticates from the active instance's stored config (basic creds, or an OAuth token it
 * self-refreshes). Returns an Anthropic-Messages-shaped body so the chat UI handles it unchanged.
 * Body: { messages: [{role, content}], system?: string, instanceUrl?: string }
 */
function handleClaudeCli(req, res) {
  const chunks = [];
  let total = 0;
  const MAX = 5 * 1024 * 1024;
  req.on('data', (c) => {
    total += c.length;
    if (total > MAX) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      req.destroy();
    } else {
      chunks.push(c);
    }
  });
  req.on('end', () => {
    if (total > MAX) return;
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const system = typeof body.system === 'string' ? body.system : '';
    const instanceUrl = typeof body.instanceUrl === 'string' ? body.instanceUrl : '';

    const textOf = (c) =>
      typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('') : '';
    const prompt = messages
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${textOf(m.content)}`)
      .join('\n\n')
      .trim();
    if (!prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No prompt to send' }));
      return;
    }

    // Resolve the active instance and build an MCP config so claude has the ServiceNow tools.
    const cfg = readNowaikitJson('instances.json');
    let inst = null;
    if (cfg && cfg.instances) {
      const list = Object.values(cfg.instances);
      inst = list.find((i) => i.instanceUrl === instanceUrl) || list.find((i) => i.name === cfg.defaultInstance) || list[0] || null;
    }
    const mcpEnv = { MCP_TOOL_DISCOVERY: 'lean' };
    if (inst) {
      mcpEnv.SERVICENOW_INSTANCE_URL = inst.instanceUrl;
      mcpEnv.SERVICENOW_AUTH_METHOD = inst.authMethod || 'basic';
      if (inst.authMethod === 'oauth') {
        if (inst.clientId) mcpEnv.SERVICENOW_OAUTH_CLIENT_ID = inst.clientId;
        if (inst.clientSecret) mcpEnv.SERVICENOW_OAUTH_CLIENT_SECRET = inst.clientSecret;
        // The MCP server reads and self-refreshes the stored per-user token from tokens.json.
      } else {
        if (inst.username) mcpEnv.SERVICENOW_BASIC_USERNAME = inst.username;
        if (inst.password) mcpEnv.SERVICENOW_BASIC_PASSWORD = inst.password;
      }
    }

    const serverJs = path.resolve(__dirname, '..', 'dist', 'server.js');
    const mcpConfig = { mcpServers: { nowaikit: { command: process.execPath, args: [serverJs], env: mcpEnv } } };
    let mcpConfigPath;
    try {
      mcpConfigPath = path.join(os.tmpdir(), `nowaikit-mcp-${process.pid}-${total}.json`);
      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig), { mode: 0o600 });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Could not prepare MCP config: ' + (e.message || e) }));
      return;
    }
    const cleanup = () => { try { fs.unlinkSync(mcpConfigPath); } catch { /* ignore */ } };

    const bin = process.env.NOWAIKIT_CLAUDE_BIN || 'claude';
    // Restrict to the NowAIKit MCP tools and block the built-in filesystem/shell tools, and run in a
    // neutral temp dir, so the web chat's claude only touches ServiceNow, never the local machine.
    const args = [
      '-p', '--output-format', 'json',
      '--mcp-config', mcpConfigPath,
      '--allowedTools', 'mcp__nowaikit',
      '--disallowedTools', 'Bash,Edit,Write,Read,WebFetch,WebSearch',
    ];
    if (system) args.push('--append-system-prompt', system);

    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(bin, args, { shell: process.platform === 'win32', cwd: os.tmpdir() });
    } catch (e) {
      cleanup();
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to start Claude CLI: ' + (e.message || e) }));
      return;
    }
    child.on('error', (e) => {
      cleanup();
      const msg = e.code === 'ENOENT'
        ? 'Claude CLI not found. Install Claude Code, run `claude login`, or set NOWAIKIT_CLAUDE_BIN to the claude binary.'
        : 'Claude CLI error: ' + e.message;
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: msg }));
      }
    });
    child.stdout.on('data', (d) => { stdout += d; if (stdout.length > MAX) child.kill(); });
    child.stderr.on('data', (d) => { stderr += d; });
    try { child.stdin.end(prompt); } catch { /* ignore */ }

    child.on('close', (code) => {
      cleanup();
      if (res.headersSent) return;
      if (code !== 0 && !stdout) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Claude CLI exited ${code}` + (stderr ? ': ' + stderr.slice(0, 500) : '') }));
        return;
      }
      let text = '';
      try {
        const parsed = JSON.parse(stdout);
        text = parsed.result || parsed.text || (parsed.is_error ? 'Error: ' + (parsed.error || 'unknown') : '');
      } catch {
        text = stdout.trim();
      }
      const origin = req.headers.origin;
      const headers = { 'Content-Type': 'application/json' };
      if (isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin || '*';
      res.writeHead(200, headers);
      res.end(JSON.stringify({ role: 'assistant', model: 'claude-cli', stop_reason: 'end_turn', content: [{ type: 'text', text: text || '(no output)' }] }));
    });
  });
}

// ─── NowAIKit MCP bridge (real tool execution + MCP Apps views + doctor) ─────

/**
 * The web UI talks to a real NowAIKit MCP server (../dist/server.js over stdio) through these routes,
 * so the chat runs the same tools as Claude Desktop or the CLI, including the MCP Apps views and the
 * app-only tools the views call. The client advertises the MCP Apps UI extension so the server lists
 * open_* view tools with `_meta.ui.resourceUri` and the app_* tools (visibility ["app"]).
 *
 * Instance selection: the stored NowAIKit config (~/.config/nowaikit/instances.json) supplies the
 * credentials. The instance is the entry whose URL matches the one the UI has active (preferring the
 * SN_DEFAULT_INSTANCE name when several entries share a URL), else SN_DEFAULT_INSTANCE, else the
 * config default. Credentials never pass through the browser.
 *
 *   GET  /api/mcp/status                     -> { available, instance }
 *   POST /api/mcp/tools     { instanceUrl? } -> { tools }
 *   POST /api/mcp/call      { name, arguments, instanceUrl? } -> { result: CallToolResult }
 *   POST /api/mcp/resource  { uri, instanceUrl? } -> ReadResourceResult
 *   POST /api/mcp/doctor    { instanceUrl? } -> { checks }
 */
const NOWAIKIT_ROOT = path.resolve(__dirname, '..');
const MCP_SERVER_JS = path.join(NOWAIKIT_ROOT, 'dist', 'server.js');
const MCP_SDK_DIR = path.join(NOWAIKIT_ROOT, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', 'client');
const UI_EXTENSION = 'io.modelcontextprotocol/ui';

let mcpBridge = null; // { client, instance, tools }
let mcpBridgePending = null;

function bridgeAvailable() {
  return fs.existsSync(MCP_SERVER_JS) && fs.existsSync(path.join(MCP_SDK_DIR, 'index.js'));
}

/** Resolve a NowAIKit instance name from the URL the UI has active. Returns '' to use the default. */
function resolveInstanceName(instanceUrl) {
  const pref = process.env.SN_DEFAULT_INSTANCE || '';
  const cfg = readNowaikitJson('instances.json');
  if (!cfg || !cfg.instances) return pref;
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  const target = norm(instanceUrl);
  if (target) {
    const entries = Object.entries(cfg.instances).filter(([, v]) => norm(v && v.instanceUrl) === target);
    if (entries.length) {
      const preferred = entries.find(([k]) => k === pref);
      return (preferred || entries[0])[0];
    }
  }
  return pref;
}

async function getMcpBridge(instanceUrl) {
  const instance = resolveInstanceName(instanceUrl);
  if (mcpBridge && mcpBridge.instance === instance) return mcpBridge;
  if (mcpBridgePending) {
    await mcpBridgePending.catch(() => {});
    if (mcpBridge && mcpBridge.instance === instance) return mcpBridge;
  }
  mcpBridgePending = (async () => {
    if (mcpBridge) {
      try { await mcpBridge.client.close(); } catch { /* ignore */ }
      mcpBridge = null;
    }
    const { pathToFileURL } = require('url');
    const { Client } = await import(pathToFileURL(path.join(MCP_SDK_DIR, 'index.js')).href);
    const { StdioClientTransport } = await import(pathToFileURL(path.join(MCP_SDK_DIR, 'stdio.js')).href);
    const env = { ...process.env };
    if (instance) env.SN_DEFAULT_INSTANCE = instance;
    // Instance credentials come from the stored config, so drop any stray env-level instance settings.
    for (const k of Object.keys(env)) if (k.startsWith('SERVICENOW_')) delete env[k];
    if (!env.SN_INSTANCES_CONFIG) env.SN_INSTANCES_CONFIG = path.join(os.homedir(), '.config', 'nowaikit', 'instances.json');
    const transport = new StdioClientTransport({ command: process.execPath, args: [MCP_SERVER_JS], env, cwd: NOWAIKIT_ROOT, stderr: 'ignore' });
    const client = new Client(
      { name: 'nowaikit-web', version: '1' },
      { capabilities: { extensions: { [UI_EXTENSION]: { mimeTypes: ['text/html;profile=mcp-app'] } } } },
    );
    await client.connect(transport);
    client.onclose = () => { if (mcpBridge && mcpBridge.client === client) mcpBridge = null; };
    const tools = [];
    let cursor;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    mcpBridge = { client, instance, tools };
    return mcpBridge;
  })();
  try {
    return await mcpBridgePending;
  } finally {
    mcpBridgePending = null;
  }
}

function readJsonBody(req, max = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > max) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!total) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(req, res, status, obj) {
  const headers = { 'Content-Type': 'application/json' };
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}

async function handleMcpBridge(req, res) {
  const route = req.url.split('?')[0].slice('/api/mcp/'.length);
  if (route === 'status' && req.method === 'GET') {
    return sendJson(req, res, 200, { available: bridgeAvailable(), instance: mcpBridge ? mcpBridge.instance : null });
  }
  if (req.method !== 'POST') return sendJson(req, res, 405, { error: 'Method not allowed' });
  if (!bridgeAvailable()) {
    return sendJson(req, res, 503, { error: 'NowAIKit server build not found. Run `npm run build` in the nowaikit root.' });
  }
  let body;
  try { body = await readJsonBody(req); } catch (e) { return sendJson(req, res, 400, { error: e.message }); }
  const instanceUrl = typeof body.instanceUrl === 'string' ? body.instanceUrl : '';
  try {
    if (route === 'doctor') {
      const { pathToFileURL } = require('url');
      const doctor = await import(pathToFileURL(path.join(NOWAIKIT_ROOT, 'dist', 'cli', 'doctor.js')).href);
      const instance = resolveInstanceName(instanceUrl) || undefined;
      const checks = await doctor.runDoctorChecks({ instance });
      return sendJson(req, res, 200, { checks, instance: instance || null });
    }
    const bridge = await getMcpBridge(instanceUrl);
    if (route === 'tools') return sendJson(req, res, 200, { tools: bridge.tools, instance: bridge.instance });
    if (route === 'call') {
      const name = typeof body.name === 'string' ? body.name : '';
      if (!name) return sendJson(req, res, 400, { error: 'name is required' });
      const args = body.arguments && typeof body.arguments === 'object' ? body.arguments : {};
      const result = await bridge.client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
      return sendJson(req, res, 200, { result });
    }
    if (route === 'resource') {
      const uri = typeof body.uri === 'string' ? body.uri : '';
      if (!uri.startsWith('ui://')) return sendJson(req, res, 400, { error: 'Only ui:// resources can be read here' });
      return sendJson(req, res, 200, await bridge.client.readResource({ uri }));
    }
    return sendJson(req, res, 404, { error: 'Unknown MCP bridge route' });
  } catch (e) {
    // A dead server process: drop it so the next call starts a fresh one.
    if (mcpBridge && /closed|EPIPE|not connected/i.test(String(e && e.message))) mcpBridge = null;
    return sendJson(req, res, 500, { error: sanitizeForLog(String((e && e.message) || e)) });
  }
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  const allowed = isAllowedOrigin(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    if (!allowed) {
      res.writeHead(403);
      res.end('Origin not allowed');
      return;
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, X-NowAIKit-Proxy',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // Common proxy security checks
  const proxySecurityCheck = () => {
    if (!req.headers['x-nowaikit-proxy']) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing X-NowAIKit-Proxy header' }));
      return false;
    }
    if (!allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Origin not allowed' }));
      return false;
    }
    const ip = req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
      return false;
    }
    return true;
  };

  // Claude Code subscription (local claude CLI) — spawns claude with the NowAIKit MCP loaded.
  if (req.url === '/api/ai/claude-cli' && req.method === 'POST') {
    if (!proxySecurityCheck()) return;
    handleClaudeCli(req, res);
    return;
  }

  // Check if this is an AI proxy request
  for (const [prefix, config] of Object.entries(AI_PROXIES)) {
    if (req.url.startsWith(prefix)) {
      if (!proxySecurityCheck()) return;
      proxyRequest(req, res, config);
      return;
    }
  }

  // Check if this is a ServiceNow proxy request
  if (req.url.startsWith('/api/snow/')) {
    if (!proxySecurityCheck()) return;
    proxySnowRequest(req, res);
    return;
  }

  // NowAIKit MCP bridge (tools, MCP Apps views, doctor)
  if (req.url.startsWith('/api/mcp/')) {
    if (req.method !== 'GET' && !proxySecurityCheck()) return;
    void handleMcpBridge(req, res);
    return;
  }

  // Report generation endpoint
  if (req.url === '/api/report/generate' && req.method === 'POST') {
    if (!proxySecurityCheck()) return;
    handleReportGenerate(req, res);
    return;
  }

  // Serve static files
  serveStatic(req, res);
});

// Try preferred port, fall back to alternatives if busy
const FALLBACK_PORTS = [PORT, PORT + 1, PORT + 2, PORT + 3, PORT + 10, 0];
let portIndex = 0;

function tryListen() {
  const tryPort = FALLBACK_PORTS[portIndex];
  server.listen(tryPort, HOST);
}

server.on('listening', () => {
  const actualPort = server.address().port;
  if (actualPort !== PORT) {
    console.log(`\n  ⚠ Port ${PORT} was in use, using port ${actualPort} instead.`);
  }
  console.log(`\n  NowAIKit Web Server`);
  console.log(`  ───────────────────────────────`);
  console.log(`  Local:   http://localhost:${actualPort}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log(`  Network: http://${HOST}:${actualPort}`);
  }
  console.log(`\n  AI proxy:    /api/ai/*   -> provider APIs (CORS proxied)`);
  console.log(`  Snow proxy:  /api/snow/* -> ServiceNow instances (CORS proxied)`);
  console.log(`  Static:      ${STATIC_DIR}`);
  console.log(`\n  All AI providers + ServiceNow instances supported.`);
  console.log(`  Press Ctrl+C to stop.\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    portIndex++;
    if (portIndex < FALLBACK_PORTS.length) {
      const next = FALLBACK_PORTS[portIndex] || 'random';
      console.log(`  Port ${FALLBACK_PORTS[portIndex - 1]} is in use, trying ${next}…`);
      tryListen();
    } else {
      console.error(`  ✕ All ports are in use. Set PORT=<number> to specify a port.`);
      process.exit(1);
    }
  } else {
    console.error(`  ✕ Server error: ${err.message}`);
    process.exit(1);
  }
});

tryListen();
