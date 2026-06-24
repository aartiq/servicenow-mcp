/**
 * Bearer token authentication middleware for HTTP/SSE transport.
 * Validates NOWAIKIT_API_KEY (comma-separated for multiple named keys) when set;
 * skips auth in dev mode (no key configured). Uses constant-time comparison and
 * a lightweight per-IP rate limiter.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { timingSafeEqual } from 'node:crypto';

export interface AuthRequest extends IncomingMessage {
  authenticated?: boolean;
}

/** Parse configured API keys (comma-separated). */
function configuredKeys(): string[] {
  const raw = process.env.NOWAIKIT_API_KEY;
  if (!raw) return [];
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

/** Constant-time check of a presented token against the configured set. */
function tokenMatches(presented: string, keys: string[]): boolean {
  const presentedBuf = Buffer.from(presented);
  let matched = false;
  for (const key of keys) {
    const keyBuf = Buffer.from(key);
    // timingSafeEqual requires equal-length buffers; compare against a padded copy.
    const a = Buffer.alloc(Math.max(presentedBuf.length, keyBuf.length));
    const b = Buffer.alloc(a.length);
    presentedBuf.copy(a);
    keyBuf.copy(b);
    if (presentedBuf.length === keyBuf.length && timingSafeEqual(a, b)) {
      matched = true; // keep looping to avoid early-exit timing signal
    }
  }
  return matched;
}

// ─── Rate limiter (fixed window, per IP) ────────────────────────────────────────

const RATE_WINDOW_MS = Number(process.env.NOWAIKIT_RATE_WINDOW_MS) || 60_000;
const RATE_MAX = Number(process.env.NOWAIKIT_RATE_MAX) || 120;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** Returns true if the request is within the rate limit (and records the hit). */
function withinRateLimit(req: IncomingMessage): boolean {
  if (RATE_MAX <= 0) return true; // disabled
  const ip = clientIp(req);
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_MAX;
}

/**
 * Express-compatible middleware that validates Bearer tokens.
 * If NOWAIKIT_API_KEY is not set, all requests pass through (dev mode).
 */
export function authMiddleware(req: AuthRequest, res: ServerResponse, next: () => void): void {
  const keys = configuredKeys();

  // No API key configured — dev mode, skip auth (but still rate-limit lightly).
  if (keys.length === 0) {
    req.authenticated = true;
    return next();
  }

  if (!withinRateLimit(req)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)) });
    res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }));
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or invalid Authorization header. Use: Bearer <NOWAIKIT_API_KEY>' }));
    return;
  }

  const token = authHeader.slice(7);
  if (!tokenMatches(token, keys)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid API key' }));
    return;
  }

  req.authenticated = true;
  next();
}

/** Check if auth is required (API key is configured). */
export function isAuthRequired(): boolean {
  return configuredKeys().length > 0;
}
