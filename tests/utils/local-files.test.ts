import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  blockedReason,
  normalizeInputPath,
  readLocalUploadFile,
  enableLocalFileAccess,
  resetLocalFileAccess,
  isLocalFileAccessEnabled,
  type PathEnv,
} from '../../src/utils/local-files.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { executeTool } from '../../src/tools/index.js';

/** Restore env in place. Reassigning process.env detaches it from the real environment (os.homedir() etc.). */
function restoreEnv(saved: NodeJS.ProcessEnv) {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
}


const posix: PathEnv = { pathMod: path.posix, caseInsensitive: false };
const win: PathEnv = { pathMod: path.win32 as unknown as typeof path.posix, caseInsensitive: true };

describe('blockedReason: macOS / Linux paths', () => {
  it.each([
    '/Users/me/.ssh/id_rsa',
    '/home/me/.ssh/config',
    '/home/me/.aws/credentials',
    '/home/me/project/.env',
    '/home/me/project/.env.production',
    '/home/me/certs/server.pem',
    '/home/me/keys/app.key',
    '/home/me/vault.kdbx',
    '/etc/passwd',
    '/proc/self/environ',
    '/home/me/.config/nowaikit/tokens.json',
    '/home/me/.config/gcloud/credentials.db',
    '/Users/me/Library/Application Support/Claude/claude_desktop_config.json',
    '/Users/me/.claude.json',
    '/Users/me/.cursor/mcp.json',
    '/Users/me/Library/Keychains/login.keychain-db',
    '/home/me/.netrc',
    '/home/me/.npmrc',
  ])('blocks %s', (p) => {
    expect(blockedReason(p, posix)).not.toBeNull();
  });

  it.each([
    '/Users/me/Downloads/ServiceNow_Discovery_Onboarding_Tracker_v7.xlsx',
    '/home/me/reports/q3.pdf',
    '/home/me/project/.env.example',
    '/home/me/project/.env.sample',
    '/tmp/screenshot.png',
    '/home/me/id_rsa_notes.txt',
  ])('allows %s', (p) => {
    expect(blockedReason(p, posix)).toBeNull();
  });
});

describe('blockedReason: Windows paths', () => {
  it.each([
    'C:\\Users\\me\\.ssh\\id_ed25519',
    'C:\\Users\\me\\.aws\\credentials',
    'C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Credentials\\ABC123',
    'C:\\Users\\me\\AppData\\Roaming\\Microsoft\\Protect\\S-1-5\\key',
    'C:\\Windows\\System32\\config\\SAM',
    'c:\\windows\\win.ini',
    'C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
    'C:\\Users\\me\\.config\\nowaikit\\tokens.json',
    'C:\\Users\\me\\project\\.ENV',
    'D:\\certs\\SERVER.PFX',
  ])('blocks %s', (p) => {
    expect(blockedReason(p, win)).not.toBeNull();
  });

  it.each([
    'C:\\Users\\me\\Documents\\Tracker v7.xlsx',
    'D:\\Shared\\Reports\\incident-export.csv',
    '\\\\fileserver\\team\\handover.docx',
  ])('allows %s', (p) => {
    expect(blockedReason(p, win)).toBeNull();
  });
});

describe('normalizeInputPath', () => {
  it('expands ~ on POSIX', () => {
    expect(normalizeInputPath('~/Downloads/a.xlsx', '/Users/me', '/srv', path.posix)).toBe('/Users/me/Downloads/a.xlsx');
  });
  it('expands ~\\ on Windows and normalises forward slashes', () => {
    const w = path.win32 as unknown as typeof path.posix;
    expect(normalizeInputPath('~\\Documents\\a.xlsx', 'C:\\Users\\me', 'C:\\srv', w)).toBe('C:\\Users\\me\\Documents\\a.xlsx');
    expect(normalizeInputPath('C:/Users/me/a.xlsx', 'C:\\Users\\me', 'C:\\srv', w)).toBe('C:\\Users\\me\\a.xlsx');
  });
  it('resolves relative paths against the working folder', () => {
    expect(normalizeInputPath('out/a.csv', '/Users/me', '/srv/app', path.posix)).toBe('/srv/app/out/a.csv');
  });
  it('strips quotes clients put around paths with spaces', () => {
    expect(normalizeInputPath('"/Users/me/My Files/a.xlsx"', '/Users/me', '/', path.posix)).toBe('/Users/me/My Files/a.xlsx');
  });
  it('accepts file:// URLs for the current OS', () => {
    const p = path.join(os.tmpdir(), 'some file.xlsx');
    expect(normalizeInputPath(pathToFileURL(p).href)).toBe(p);
  });
  it('rejects an empty path', () => {
    expect(() => normalizeInputPath('  ')).toThrow(/empty/);
  });
});

describe('readLocalUploadFile (real file system)', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nwk-upload-'));
    resetLocalFileAccess();
    delete process.env.NOWAIKIT_LOCAL_FILES;
    delete process.env.NOWAIKIT_UPLOAD_DIRS;
    delete process.env.NOWAIKIT_UPLOAD_MAX_MB;
  });
  afterEach(async () => {
    restoreEnv(saved);
    resetLocalFileAccess();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('is OFF by default (library / gateway / HTTP use)', async () => {
    const f = path.join(dir, 'a.txt');
    await fs.writeFile(f, 'hello');
    expect(isLocalFileAccessEnabled()).toBe(false);
    await expect(readLocalUploadFile(f)).rejects.toMatchObject({ code: 'LOCAL_FILES_DISABLED' });
  });

  it('reads the file once the stdio entry point enables it', async () => {
    enableLocalFileAccess();
    const f = path.join(dir, 'a.txt');
    await fs.writeFile(f, 'hello');
    const r = await readLocalUploadFile(f);
    expect(r.bytes.toString()).toBe('hello');
    expect(r.size).toBe(5);
  });

  it('NOWAIKIT_LOCAL_FILES=false overrides the stdio default; =true enables it explicitly', async () => {
    enableLocalFileAccess();
    process.env.NOWAIKIT_LOCAL_FILES = 'false';
    expect(isLocalFileAccessEnabled()).toBe(false);
    resetLocalFileAccess();
    process.env.NOWAIKIT_LOCAL_FILES = 'true';
    expect(isLocalFileAccessEnabled()).toBe(true);
  });

  it('catches a symlink that points into a credentials folder', async () => {
    enableLocalFileAccess();
    const secretDir = path.join(dir, '.ssh');
    await fs.mkdir(secretDir);
    await fs.writeFile(path.join(secretDir, 'id_rsa'), 'PRIVATE');
    const link = path.join(dir, 'innocent.txt');
    await fs.symlink(path.join(secretDir, 'id_rsa'), link);
    await expect(readLocalUploadFile(link)).rejects.toMatchObject({ code: 'LOCAL_FILE_BLOCKED' });
  });

  it('enforces NOWAIKIT_UPLOAD_DIRS when set', async () => {
    enableLocalFileAccess();
    const allowed = path.join(dir, 'outbox');
    await fs.mkdir(allowed);
    await fs.writeFile(path.join(allowed, 'ok.csv'), 'a,b');
    await fs.writeFile(path.join(dir, 'outside.csv'), 'a,b');
    process.env.NOWAIKIT_UPLOAD_DIRS = allowed;
    await expect(readLocalUploadFile(path.join(allowed, 'ok.csv'))).resolves.toMatchObject({ size: 3 });
    await expect(readLocalUploadFile(path.join(dir, 'outside.csv'))).rejects.toMatchObject({ code: 'LOCAL_FILE_BLOCKED' });
  });

  it('refuses missing, empty, directory and oversized files with clear codes', async () => {
    enableLocalFileAccess();
    await expect(readLocalUploadFile(path.join(dir, 'nope.xlsx'))).rejects.toMatchObject({ code: 'LOCAL_FILE_NOT_FOUND' });
    await fs.writeFile(path.join(dir, 'empty.txt'), '');
    await expect(readLocalUploadFile(path.join(dir, 'empty.txt'))).rejects.toThrow(/empty/);
    await expect(readLocalUploadFile(dir)).rejects.toThrow(/not a regular file/);
    process.env.NOWAIKIT_UPLOAD_MAX_MB = '0.00001';
    await fs.writeFile(path.join(dir, 'big.bin'), Buffer.alloc(1024));
    await expect(readLocalUploadFile(path.join(dir, 'big.bin'))).rejects.toMatchObject({ code: 'ATTACHMENT_TOO_LARGE' });
  });
});

describe('upload_attachment with file_path (end to end, mocked ServiceNow)', () => {
  let dir: string;
  const saved = { ...process.env };
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nwk-upload-e2e-'));
    resetLocalFileAccess();
    process.env.WRITE_ENABLED = 'true';
    delete process.env.NOWAIKIT_LOCAL_FILES;
  });
  afterEach(async () => {
    restoreEnv(saved);
    resetLocalFileAccess();
    vi.unstubAllGlobals();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const client = () => new ServiceNowClient({
    instanceUrl: 'https://example.service-now.com',
    authMethod: 'basic', basic: { username: 'a', password: 'b' },
  });

  it('sends the exact file bytes, defaults the name, guesses the type, returns the sha256', async () => {
    enableLocalFileAccess();
    // ~39 KB, the size that failed through the model's tool call
    const bytes = Buffer.from(Array.from({ length: 39 * 1024 }, (_, i) => i % 251));
    const f = path.join(dir, 'ServiceNow_Discovery_Onboarding_Tracker_v7.xlsx');
    await fs.writeFile(f, bytes);

    let sentUrl = '';
    let sentType = '';
    let sentBody: Buffer = Buffer.alloc(0);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      sentUrl = String(url);
      sentType = init.headers['Content-Type'];
      sentBody = Buffer.from(init.body);
      return new Response(JSON.stringify({ result: { sys_id: 'att1', file_name: 'ServiceNow_Discovery_Onboarding_Tracker_v7.xlsx' } }), { status: 201 });
    }));

    const out: any = await executeTool(client(), 'upload_attachment', {
      table: 'incident', record_sys_id: 'a'.repeat(32), file_path: f,
    });

    expect(sentUrl).toContain('file_name=ServiceNow_Discovery_Onboarding_Tracker_v7.xlsx');
    expect(sentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(sentBody.equals(bytes)).toBe(true);
    expect(out.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(out.size_bytes).toBe(bytes.length);
    expect(out.source_path).toBe(await fs.realpath(f));
  });

  it('rejects more than one source and missing file_name for the other sources', async () => {
    enableLocalFileAccess();
    await expect(executeTool(client(), 'upload_attachment', {
      table: 'incident', record_sys_id: 'a'.repeat(32), file_path: '/x', source_url: 'https://x',
    })).rejects.toThrow(/only one/);
    await expect(executeTool(client(), 'upload_attachment', {
      table: 'incident', record_sys_id: 'a'.repeat(32), source_url: 'https://x',
    })).rejects.toThrow(/file_name is required/);
  });

  it('refuses file_path when the server is not a local stdio server', async () => {
    const f = path.join(dir, 'a.txt');
    await fs.writeFile(f, 'x');
    vi.stubGlobal('fetch', vi.fn());
    await expect(executeTool(client(), 'upload_attachment', {
      table: 'incident', record_sys_id: 'a'.repeat(32), file_path: f,
    })).rejects.toMatchObject({ code: 'LOCAL_FILES_DISABLED' });
  });
});
