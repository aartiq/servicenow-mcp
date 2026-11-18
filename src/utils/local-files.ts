/**
 * Local file access for `upload_attachment { file_path }`.
 *
 * Lets the server read a file straight from disk and attach it, so the bytes never pass through the
 * model's tool call (which caps how much a model can write in one call, far below NowAIKit's own
 * limits). Works on Windows, macOS and Linux.
 *
 * Security model (self-contained, does not depend on any upstream gateway):
 * - OFF by default. Only the local stdio entry point (server.ts, no HTTP transport) switches it on,
 *   because there the server runs on the user's own machine. Anything that imports NowAIKit as a
 *   library, or runs it in HTTP mode, keeps it off, so a remote caller can never read the host's disk.
 * - NOWAIKIT_LOCAL_FILES=true forces it on (e.g. HTTP mode on your own laptop); =false forces it off.
 * - A block list for secrets always applies (SSH/cloud keys, .env files, credential stores, MCP client
 *   configs that hold ServiceNow passwords, NowAIKit's own token store, OS system dirs). Symlinks are
 *   resolved first, so a link pointing into a blocked location is caught.
 * - NOWAIKIT_UPLOAD_DIRS (path-delimiter separated) optionally restricts uploads to those folders.
 * - NOWAIKIT_UPLOAD_MAX_MB caps the size (default 50, matching the source_url cap).
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ServiceNowError } from './errors.js';

let enabledByEntryPoint = false;

/** Called by the local stdio server at startup. Nothing else should call this. */
export function enableLocalFileAccess(): void {
  enabledByEntryPoint = true;
}

/** Test helper: reset to the library default (off). */
export function resetLocalFileAccess(): void {
  enabledByEntryPoint = false;
}

export function isLocalFileAccessEnabled(): boolean {
  const v = (process.env.NOWAIKIT_LOCAL_FILES || '').trim().toLowerCase();
  if (['false', '0', 'off', 'no'].includes(v)) return false;
  if (['true', '1', 'on', 'yes'].includes(v)) return true;
  return enabledByEntryPoint;
}

type PathMod = typeof path.posix;

export interface PathEnv {
  pathMod: PathMod;
  /** Case-insensitive file systems by default on Windows and macOS. */
  caseInsensitive: boolean;
}

function defaultEnv(): PathEnv {
  return {
    pathMod: path as unknown as PathMod,
    caseInsensitive: process.platform === 'win32' || process.platform === 'darwin',
  };
}

/** Directory names that hold keys or credentials. Matched against any path segment. */
const BLOCKED_DIR_SEGMENTS = new Set([
  '.ssh', '.gnupg', '.aws', '.azure', '.kube', '.docker', '.password-store', 'keychains', '.vault',
]);

/** Consecutive segment pairs that mark a credential store. */
const BLOCKED_SEGMENT_PAIRS: Array<[string, string]> = [
  ['.config', 'gcloud'],
  ['.config', 'nowaikit'], // NowAIKit's own token store
  ['microsoft', 'credentials'], // Windows Credential Manager files
  ['microsoft', 'protect'], // Windows DPAPI master keys
  ['microsoft', 'crypto'],
  ['microsoft', 'vault'],
];

/** Exact file names that hold secrets (MCP client configs carry ServiceNow passwords). */
const BLOCKED_FILE_NAMES = new Set([
  '.netrc', '_netrc', '.npmrc', '.pypirc', '.pgpass', '.git-credentials', '.vault-token',
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'credentials',
  'claude_desktop_config.json', '.claude.json', 'mcp.json', 'mcp_config.json',
]);

/** Extensions for private keys, certificates and password vaults. */
const BLOCKED_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.kdbx']);

/** .env files are blocked, except obvious templates. */
const ENV_TEMPLATE_SUFFIXES = new Set(['example', 'sample', 'template', 'dist']);

/** OS system locations (checked as path prefixes). */
const BLOCKED_PREFIXES_POSIX = ['/etc', '/private/etc', '/proc', '/sys', '/dev', '/boot', '/root', '/var/db'];
const BLOCKED_PREFIXES_WIN = ['c:\\windows'];

function isInside(child: string, dir: string, env: PathEnv): boolean {
  const norm = (p: string) => (env.caseInsensitive ? p.toLowerCase() : p);
  const rel = env.pathMod.relative(norm(dir), norm(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !env.pathMod.isAbsolute(rel));
}

/**
 * Return a human-readable reason if this (already resolved, absolute) path must not be uploaded,
 * or null if it is allowed. Pure function so it can be tested for every platform.
 */
export function blockedReason(absPath: string, env: PathEnv = defaultEnv()): string | null {
  const { pathMod } = env;
  const segments = absPath.split(/[\\/]+/).filter(Boolean).map((s) => s.toLowerCase());
  const base = (segments[segments.length - 1] || '').toLowerCase();

  for (const s of segments.slice(0, -1)) {
    if (BLOCKED_DIR_SEGMENTS.has(s)) return `it is inside a credentials folder (${s})`;
  }
  for (let i = 0; i < segments.length - 1; i++) {
    for (const [a, b] of BLOCKED_SEGMENT_PAIRS) {
      if (segments[i] === a && segments[i + 1] === b) return `it is inside a credential store (${a}/${b})`;
    }
  }
  if (BLOCKED_FILE_NAMES.has(base)) return `"${base}" usually contains secrets`;
  if (base === '.env' || base.startsWith('.env.')) {
    const suffix = base.slice(5);
    if (!ENV_TEMPLATE_SUFFIXES.has(suffix)) return `"${base}" is an environment file that usually contains secrets`;
  }
  const ext = pathMod.extname(base);
  if (BLOCKED_EXTENSIONS.has(ext)) return `"${ext}" files are private keys, certificates or password vaults`;

  const isWin = pathMod === path.win32;
  const candidate = isWin ? absPath.toLowerCase() : absPath;
  const sep = isWin ? '\\' : '/';
  for (const p of isWin ? BLOCKED_PREFIXES_WIN : BLOCKED_PREFIXES_POSIX) {
    if (candidate === p || candidate.startsWith(p + sep)) return `it is in a protected system location (${p})`;
  }
  return null;
}

/**
 * Turn what the model passed into an absolute path: accepts absolute paths on any OS, `~` and `~/`
 * (or `~\`), `file://` URLs, and paths relative to the server's working directory.
 */
export function normalizeInputPath(input: string, home = homedir(), cwd = process.cwd(), pathMod: PathMod = path as unknown as PathMod): string {
  let p = String(input || '').trim();
  if (!p) throw new ServiceNowError('file_path is empty', 'INVALID_REQUEST');
  // Strip surrounding quotes some clients add around paths with spaces.
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) p = p.slice(1, -1);
  if (/^file:\/\//i.test(p)) {
    try {
      p = fileURLToPath(p);
    } catch {
      throw new ServiceNowError(`file_path is not a valid file:// URL: ${input}`, 'INVALID_REQUEST');
    }
  }
  if (p === '~') p = home;
  else if (p.startsWith('~/') || p.startsWith('~\\')) p = pathMod.join(home, p.slice(2));
  return pathMod.isAbsolute(p) ? pathMod.normalize(p) : pathMod.resolve(cwd, p);
}

function maxBytes(): number {
  const mb = Number(process.env.NOWAIKIT_UPLOAD_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

/** Allowlisted folders, resolved through symlinks the same way the file is (e.g. /var -> /private/var on macOS). */
async function allowedDirs(): Promise<string[]> {
  const dirs = (process.env.NOWAIKIT_UPLOAD_DIRS || '')
    .split(path.delimiter)
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => normalizeInputPath(d));
  return Promise.all(dirs.map((d) => fs.realpath(d).catch(() => d)));
}

export interface LocalUploadFile {
  path: string;
  size: number;
  bytes: Buffer;
}

/** Validate and read a local file for upload. Throws a clear ServiceNowError on any refusal. */
export async function readLocalUploadFile(input: string): Promise<LocalUploadFile> {
  if (!isLocalFileAccessEnabled()) {
    throw new ServiceNowError(
      'file_path only works when NowAIKit runs on your own machine (the local stdio server used by Claude Desktop, ' +
        'Claude Code, Cursor and similar). This server cannot read local files. Use source_url, or content_base64 for small files.',
      'LOCAL_FILES_DISABLED'
    );
  }
  const requested = normalizeInputPath(input);

  let real: string;
  try {
    real = await fs.realpath(requested); // resolves symlinks, so a link into ~/.ssh is caught below
  } catch (e: any) {
    const code = e?.code === 'EACCES' || e?.code === 'EPERM' ? 'permission denied' : 'file not found';
    throw new ServiceNowError(`Cannot read file_path "${requested}": ${code}.`, 'LOCAL_FILE_NOT_FOUND');
  }

  const reason = blockedReason(real);
  if (reason) {
    throw new ServiceNowError(`Refusing to upload "${real}": ${reason}. NowAIKit never uploads secrets from disk.`, 'LOCAL_FILE_BLOCKED');
  }

  const dirs = await allowedDirs();
  if (dirs.length && !dirs.some((d) => isInside(real, d, defaultEnv()))) {
    throw new ServiceNowError(
      `Refusing to upload "${real}": it is outside the folders allowed by NOWAIKIT_UPLOAD_DIRS (${dirs.join(', ')}).`,
      'LOCAL_FILE_BLOCKED'
    );
  }

  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new ServiceNowError(`file_path "${real}" is not a regular file.`, 'INVALID_REQUEST');
  if (stat.size === 0) throw new ServiceNowError(`file_path "${real}" is empty. Nothing was attached.`, 'INVALID_REQUEST');
  const cap = maxBytes();
  if (stat.size > cap) {
    throw new ServiceNowError(
      `file_path "${real}" is ${(stat.size / 1024 / 1024).toFixed(1)}MB, over the ${cap / 1024 / 1024}MB limit (NOWAIKIT_UPLOAD_MAX_MB).`,
      'ATTACHMENT_TOO_LARGE'
    );
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(real);
  } catch (e: any) {
    throw new ServiceNowError(`Cannot read file_path "${real}": ${e?.code || 'read error'}.`, 'LOCAL_FILE_NOT_FOUND');
  }
  return { path: real, size: bytes.length, bytes };
}
