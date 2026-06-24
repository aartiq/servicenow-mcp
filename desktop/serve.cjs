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

  // Validate the instance URL
  let parsedInstance;
  try {
    parsedInstance = new URL(instanceUrl);
    if (parsedInstance.protocol !== 'https:' && parsedInstance.protocol !== 'http:') {
      throw new Error('bad protocol');
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid instance URL' }));
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
