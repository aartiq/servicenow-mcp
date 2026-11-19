import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture every now-sdk invocation instead of running npx.
const calls: Array<{ args: string[]; cwd?: string }> = [];
let failNextFrozen = false;
vi.mock('child_process', () => ({
  execFile: (_cmd: string, args: string[], opts: any, cb: (e: any, r: any) => void) => {
    calls.push({ args: args.slice(1), cwd: opts?.cwd });
    if (failNextFrozen && args.includes('--frozenKeys')) { failNextFrozen = false; cb(Object.assign(new Error('build failed'), { stderr: 'Keys file is out-of-date' }), null); return; }
    const out = args.includes('--version') ? '4.14.2'
      : args[1] === 'auth' ? '[now-sdk] Listing all credentials:\n[other]\n      host = https://other.service-now.com\n      default = Yes\n[mydemo]\n      host = https://demo.service-now.com\n      default = No\n'
      : args[1] === 'query' || args[1] === 'exec' ? '{"ok":true}' : 'done';
    cb(null, { stdout: out, stderr: '' });
  },
}));

const { executeFluentToolCall, getFluentToolDefinitions } = await import('../../src/tools/fluent.js');
const client = {} as any;
const last = () => calls[calls.length - 1];

describe('Fluent SDK CLI arguments (now-sdk 4.14.2)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    calls.length = 0;
    process.env.FLUENT_ENABLED = 'true';
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });
  afterEach(() => {
    for (const k of ['FLUENT_ENABLED', 'WRITE_ENABLED', 'SCRIPTING_ENABLED']) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  });

  it('query always passes the required --query', async () => {
    await executeFluentToolCall(client, 'fluent_sdk_query', { table: 'incident', fields: ['number'], limit: 2, display_value: 'all' });
    expect(last().args).toEqual(['query', 'incident', '--query', 'sys_idISNOTEMPTY', '--fields', 'number', '--limit', '2', '--display-value', 'all', '-o', 'json']);
  });

  it('explain uses raw output and the 4.14 flags', async () => {
    await executeFluentToolCall(client, 'fluent_explain', { topic: 'catalog variable', peek: true, range: '3' });
    expect(last().args).toEqual(['explain', 'catalog variable', '--peek', '--range', '3', '--format', 'raw']);
    await executeFluentToolCall(client, 'fluent_explain', { list: true });
    expect(last().args).toEqual(['explain', '--list', '--format', 'raw']);
  });

  it('init uses --appName/--packageName/--scopeName and runs in the target directory', async () => {
    await executeFluentToolCall(client, 'fluent_init', { name: 'My App', scope: 'x_acme_my_app', template: 'typescript.basic', directory: '/tmp/proj' });
    expect(last().args).toEqual(['init', '--appName', 'My App', '--packageName', 'my-app', '--scopeName', 'x_acme_my_app', '--template', 'typescript.basic']);
    expect(last().cwd).toBe('/tmp/proj');
  });

  it('init creates a new project folder rather than reporting the SDK as missing', async () => {
    const { mkdtempSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const dir = join(mkdtempSync(join(tmpdir(), 'nk-fluent-')), 'acme', 'linker');
    await executeFluentToolCall(client, 'fluent_init', { name: 'Linker', scope: 'x_acme_linker', directory: dir });
    expect(existsSync(dir)).toBe(true);
    expect(last().cwd).toBe(dir);
  });

  it('a missing project folder is reported as a missing folder', async () => {
    await expect(executeFluentToolCall(client, 'fluent_exec', { directory: '/definitely/not/here', script: 'gs.info(1)', reason: 'test' }))
      .rejects.toMatchObject({ message: expect.stringMatching(/Directory not found/) });
  });

  it('uses the SDK login that matches the instance NowAIKit is connected to', async () => {
    await executeFluentToolCall({ instanceUrl: 'https://demo.service-now.com/' } as any, 'fluent_sdk_query', { table: 'incident' });
    expect(last().args).toEqual(['query', 'incident', '--query', 'sys_idISNOTEMPTY', '--auth', 'mydemo', '-o', 'json']);
  });

  it('refuses to fall back to an SDK login for a different instance', async () => {
    await expect(executeFluentToolCall({ instanceUrl: 'https://elsewhere.service-now.com' } as any, 'fluent_sdk_query', { table: 'incident' }))
      .rejects.toMatchObject({ code: 'SDK_AUTH_MISMATCH' });
  });

  it('an explicit auth alias always wins', async () => {
    await executeFluentToolCall({ instanceUrl: 'https://elsewhere.service-now.com' } as any, 'fluent_sdk_query', { table: 'incident', auth: 'dev' });
    expect(last().args).toContain('dev');
  });

  it('validate builds once first on a project that has never been built', async () => {
    failNextFrozen = true;
    const r: any = await executeFluentToolCall(client, 'fluent_validate', { directory: '/tmp/proj' });
    expect(r.valid).toBe(true);
    expect(calls.map((c) => c.args.join(' '))).toEqual(['build /tmp/proj --frozenKeys --errorOnConflict', 'build /tmp/proj', 'build /tmp/proj --frozenKeys --errorOnConflict']);
  });

  it('init always names a template so the CLI never stops to ask', async () => {
    await executeFluentToolCall(client, 'fluent_init', { name: 'App', scope: 'x_acme_app', directory: '/tmp/proj2' });
    expect(last().args).toContain('typescript.basic');
    await executeFluentToolCall(client, 'fluent_init', { from: 'abc', directory: '/tmp/proj3' });
    expect(last().args).not.toContain('--template');
  });

  it('build takes the project directory as a positional argument', async () => {
    await executeFluentToolCall(client, 'fluent_build', { directory: '/tmp/proj', frozen_keys: true });
    expect(calls[0].args).toEqual(['build', '/tmp/proj', '--frozenKeys']);
  });

  it('validate is a strict build (there is no validate command)', async () => {
    await executeFluentToolCall(client, 'fluent_validate', { directory: '/tmp/proj' });
    expect(last().args).toEqual(['build', '/tmp/proj', '--frozenKeys', '--errorOnConflict']);
  });

  it('install, download, transform, dependencies, pack', async () => {
    await executeFluentToolCall(client, 'fluent_install', { directory: '/p', skip_flow_activation: true, auth: 'dev' });
    expect(last().args).toEqual(['install', '--source', '/p', '--skip-flow-activation', '--auth', 'dev']);
    await executeFluentToolCall(client, 'fluent_download', { target: './meta', directory: '/p', incremental: true });
    expect(last().args).toEqual(['download', './meta', '--source', '/p', '--incremental']);
    await executeFluentToolCall(client, 'fluent_transform', { tables: ['sys_script_include', 'sys_script'], directory: '/p' });
    expect(last().args).toEqual(['transform', '--table', 'sys_script_include,sys_script', '--directory', '/p']);
    await executeFluentToolCall(client, 'fluent_dependencies', { add: 'sys_security_acl', scope: 'global', sys_ids: ['a'.repeat(32)] });
    expect(last().args).toEqual(['dependencies', 'a'.repeat(32), '--add', 'sys_security_acl', '--scope', 'global']);
    await executeFluentToolCall(client, 'fluent_pack', { directory: '/p' });
    expect(last().args).toEqual(['pack', '/p']);
  });

  it('exec needs a reason and SCRIPTING_ENABLED', async () => {
    await expect(executeFluentToolCall(client, 'fluent_exec', { script: 'gs.info(1)' })).rejects.toThrow(/reason/);
    await executeFluentToolCall(client, 'fluent_exec', { script: 'gs.info(1)', reason: 'check', scope: 'global' });
    expect(last().args).toEqual(['exec', 'gs.info(1)', '--reason', 'check', '--scope', 'global', '-o', 'json']);
    process.env.SCRIPTING_ENABLED = 'false';
    await expect(executeFluentToolCall(client, 'fluent_exec', { script: 'x', reason: 'y' })).rejects.toThrow();
  });

  it('cicd covers rollback and single tests', async () => {
    await executeFluentToolCall(client, 'fluent_cicd', { action: 'rollback', scope: 'x_acme_app', appVersion: '1.0.0' });
    expect(last().args).toEqual(['cicd', 'rollback', '--scope', 'x_acme_app', '--app-version', '1.0.0']);
    await executeFluentToolCall(client, 'fluent_cicd', { action: 'test', testName: 'Smoke', runInCloud: true });
    expect(last().args).toEqual(['cicd', 'test', 'run', '--test-name', 'Smoke', '--run-in-cloud']);
    await executeFluentToolCall(client, 'fluent_cicd', { action: 'testsuite', testSuiteSysId: 'b'.repeat(32) });
    expect(last().args).toEqual(['cicd', 'testsuite', 'run', '--test-suite-sys-id', 'b'.repeat(32)]);
  });

  it('writes are refused without WRITE_ENABLED', async () => {
    process.env.WRITE_ENABLED = 'false';
    await expect(executeFluentToolCall(client, 'fluent_install', {})).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('tracks SDK 4.14.2', async () => {
    const v = await executeFluentToolCall(client, 'fluent_version', {});
    expect(v).toMatchObject({ installed: '4.14.2', recommended: '4.14.2', upToDate: true });
    const names = getFluentToolDefinitions().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['fluent_install', 'fluent_download', 'fluent_transform', 'fluent_dependencies', 'fluent_pack', 'fluent_exec']));
  });
});
