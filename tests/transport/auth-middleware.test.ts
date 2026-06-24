import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authMiddleware, isAuthRequired } from '../../src/transport/auth-middleware.js';
import type { AuthRequest } from '../../src/transport/auth-middleware.js';
import type { ServerResponse } from 'http';

function createMockReq(headers: Record<string, string> = {}): AuthRequest {
  return {
    headers,
    authenticated: undefined,
  } as unknown as AuthRequest;
}

function createMockRes() {
  const res = {
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
  return res;
}

describe('authMiddleware', () => {
  const originalEnv = process.env.NOWAIKIT_API_KEY;

  beforeEach(() => {
    delete process.env.NOWAIKIT_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NOWAIKIT_API_KEY = originalEnv;
    } else {
      delete process.env.NOWAIKIT_API_KEY;
    }
  });

  it('passes all requests through when NOWAIKIT_API_KEY is not set', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.authenticated).toBe(true);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('passes requests with valid Bearer token when API key is set', () => {
    process.env.NOWAIKIT_API_KEY = 'test-secret-key';
    const req = createMockReq({ authorization: 'Bearer test-secret-key' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.authenticated).toBe(true);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('returns 401 when API key is set but no auth header is provided', () => {
    process.env.NOWAIKIT_API_KEY = 'test-secret-key';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Missing or invalid Authorization header. Use: Bearer <NOWAIKIT_API_KEY>' })
    );
  });

  it('returns 401 when auth header does not start with Bearer', () => {
    process.env.NOWAIKIT_API_KEY = 'test-secret-key';
    const req = createMockReq({ authorization: 'Basic dXNlcjpwYXNz' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
  });

  it('returns 403 when Bearer token does not match API key', () => {
    process.env.NOWAIKIT_API_KEY = 'test-secret-key';
    const req = createMockReq({ authorization: 'Bearer wrong-key' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'application/json' });
    expect(res.end).toHaveBeenCalledWith(
      JSON.stringify({ error: 'Invalid API key' })
    );
  });

  it('does not set authenticated on req when auth fails', () => {
    process.env.NOWAIKIT_API_KEY = 'test-secret-key';
    const req = createMockReq({ authorization: 'Bearer wrong-key' });
    const res = createMockRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(req.authenticated).toBeUndefined();
  });
});

describe('isAuthRequired', () => {
  const originalEnv = process.env.NOWAIKIT_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NOWAIKIT_API_KEY = originalEnv;
    } else {
      delete process.env.NOWAIKIT_API_KEY;
    }
  });

  it('returns false when NOWAIKIT_API_KEY is not set', () => {
    delete process.env.NOWAIKIT_API_KEY;
    expect(isAuthRequired()).toBe(false);
  });

  it('returns true when NOWAIKIT_API_KEY is set', () => {
    process.env.NOWAIKIT_API_KEY = 'my-key';
    expect(isAuthRequired()).toBe(true);
  });

  it('returns true when NOWAIKIT_API_KEY is set to empty string', () => {
    process.env.NOWAIKIT_API_KEY = '';
    // Empty string is falsy in JS, so isAuthRequired should return false
    expect(isAuthRequired()).toBe(false);
  });
});
