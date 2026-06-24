/**
 * Shared HTTP server for SSE/Streamable HTTP transport, REST API, and dashboard.
 * Used when TRANSPORT=sse or TRANSPORT=http.
 */
import { createServer, type Server as HttpServer } from 'http';
import { authMiddleware, type AuthRequest } from './auth-middleware.js';
import { logger } from '../utils/logging.js';

export interface HttpServerOptions {
  port: number;
  host: string;
  corsOrigin: string;
}

type Middleware = (req: AuthRequest, res: any, next: () => void) => void;
type RouteHandler = (req: AuthRequest, res: any) => void | Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
  requiresAuth: boolean;
}

/**
 * Lightweight Express-like HTTP server without the Express dependency.
 * Supports routing, CORS, auth middleware, and JSON body parsing.
 */
export class NowAIKitHttpServer {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];
  private server: HttpServer | null = null;
  private corsOrigin: string;

  constructor(private options: HttpServerOptions) {
    this.corsOrigin = options.corsOrigin;
  }

  /** Register a route. */
  route(method: string, path: string, handler: RouteHandler, requiresAuth = true): void {
    this.routes.push({ method: method.toUpperCase(), path, handler, requiresAuth });
  }

  /** Convenience methods. */
  get(path: string, handler: RouteHandler, requiresAuth = true): void { this.route('GET', path, handler, requiresAuth); }
  post(path: string, handler: RouteHandler, requiresAuth = true): void { this.route('POST', path, handler, requiresAuth); }
  delete(path: string, handler: RouteHandler, requiresAuth = true): void { this.route('DELETE', path, handler, requiresAuth); }

  /** Add a global middleware. */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
  }

  /** Get the underlying HTTP server (for SSE/WebSocket upgrades). */
  getHttpServer(): HttpServer {
    if (!this.server) throw new Error('Server not started');
    return this.server;
  }

  /** Start listening. */
  async start(): Promise<void> {
    this.server = createServer(async (req: AuthRequest, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', this.corsOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        await this.handleRequest(req, res);
      } catch (error) {
        logger.error('HTTP request error', error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(this.options.port, this.options.host, () => {
        logger.info(`HTTP server listening on ${this.options.host}:${this.options.port}`);
        resolve();
      });
    });
  }

  /** Stop the server. */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: AuthRequest, res: any): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() || 'GET';

    // Find matching route
    const route = this.routes.find(r => {
      if (r.method !== method) return false;
      return matchPath(r.path, pathname);
    });

    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Auth check
    if (route.requiresAuth) {
      const authPassed = await new Promise<boolean>((resolve) => {
        authMiddleware(req, res, () => resolve(true));
        // If authMiddleware ended the response, resolve false
        if (res.writableEnded) resolve(false);
      });
      if (!authPassed) return;
    }

    // Parse JSON body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        (req as any).body = await parseJsonBody(req);
      } catch {
        (req as any).body = {};
      }
    }

    // Parse URL params
    const params = extractParams(route.path, pathname);
    (req as any).params = params;
    (req as any).query = Object.fromEntries(url.searchParams);

    await route.handler(req, res);
  }
}

/** Parse JSON body from request stream. */
function parseJsonBody(req: AuthRequest): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** Simple path matching with :param support. */
function matchPath(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((p, i) => p.startsWith(':') || p === pathParts[i]);
}

/** Extract named params from path. */
function extractParams(pattern: string, pathname: string): Record<string, string> {
  const params: Record<string, string> = {};
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  patternParts.forEach((p, i) => {
    if (p.startsWith(':')) {
      params[p.slice(1)] = pathParts[i]!;
    }
  });
  return params;
}

/** Create an HTTP server with defaults from env vars. */
export function createHttpServer(): NowAIKitHttpServer {
  return new NowAIKitHttpServer({
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  });
}
