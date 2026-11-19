/**
 * `nowaikit doctor`: one command that checks everything a working setup needs and says how to fix
 * whatever is wrong. It uses the same instance loader and client as the MCP server, so what it reports
 * is what Claude, Cursor or VS Code will actually get.
 */
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { VERSION } from '../utils/version.js';
import { detectClients } from './detect-clients.js';

const execFileAsync = promisify(execFile);

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'info';

export interface CheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface DoctorOptions {
  instance?: string;
  json?: boolean;
  /** Skip network calls to npm and the instance (used by tests). */
  offline?: boolean;
}

/**
 * ServiceNow's Basic auth restriction (Brazil, also seen on patched Australia): Basic auth API calls
 * keep working only for accounts on the allowlist once the default decision stops being "Maintain
 * current login". Says whether this connection would break.
 */
export function basicAuthCheck(input: {
  authMethod: string;
  props: Record<string, string>;
  roles: Set<string>;
  webServiceOnly: boolean;
  userName?: string;
}): CheckResult {
  const { props } = input;
  const enforce = props['glide.authenticate.basic_auth.restriction.enforce'];
  const active = props['glide.authenticate.basic_auth.restriction.active'];
  const decision = props['glide.authenticate.basic_auth.restriction.default_decision'] || '';
  const title = 'Basic auth restriction';
  if (enforce === undefined && active === undefined) {
    return { id: 'basic_auth', title, status: 'info', detail: 'not on this release (no glide.authenticate.basic_auth.restriction properties)' };
  }
  const mode = enforce === 'true' ? 'enforce mode' : 'tracking mode';
  if (input.authMethod !== 'basic') {
    return { id: 'basic_auth', title, status: 'ok', detail: `${mode}; this connection uses OAuth, so it is not affected` };
  }
  const allowedRoles = (props['glide.authenticate.basic_auth.allowed_roles'] || 'snc_basic_auth_api_access').split(',').map((r) => r.trim()).filter(Boolean);
  const allowedUsers = (props['glide.authenticate.basic_auth.allowed_users'] || '').split(',').map((u) => u.trim().toLowerCase()).filter(Boolean);
  const viaRole = allowedRoles.some((r) => input.roles.has(r));
  const viaUser = !!input.userName && allowedUsers.includes(input.userName.toLowerCase());
  const viaWsao = input.webServiceOnly && props['glide.authenticate.basic_auth.allow_wsao'] !== 'false';
  const maintained = /maintain current login/i.test(decision);
  if (viaRole || viaUser || viaWsao) {
    const why = viaRole ? `has ${allowedRoles.find((r) => input.roles.has(r))}` : viaUser ? 'is in glide.authenticate.basic_auth.allowed_users' : 'is a web service access only account';
    return { id: 'basic_auth', title, status: 'ok', detail: `${mode}; this Basic auth account ${why}, so it stays allowed` };
  }
  return {
    id: 'basic_auth', title, status: maintained ? 'warn' : 'fail',
    detail: maintained
      ? `${mode}; this connection uses Basic and will break when the default decision flips from "Maintain current login" (the account is not on the Basic auth allowlist)`
      : `${mode}; default decision "${decision || 'unknown'}" and this Basic auth account is not on the allowlist`,
    fix: 'Switch this instance to OAuth in `nowaikit setup` (recommended), or ask an admin to grant snc_basic_auth_api_access to the account.',
  };
}

/** Compare dotted versions. Returns -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify an unauthenticated probe of the instance REST API. A healthy instance answers 401 JSON;
 * a sleeping developer instance answers with an HTML page or a redirect to developer.servicenow.com.
 */
export function classifyProbe(status: number, contentType: string, body: string, location: string): { state: 'up' | 'hibernating' | 'down' | 'unexpected'; detail: string } {
  const text = body.slice(0, 4000).toLowerCase();
  if (/hibernat/.test(text) || /developer\.servicenow\.com/.test(location) || /instance\s+is\s+(asleep|sleeping)/.test(text)) {
    return { state: 'hibernating', detail: 'The instance is hibernating (developer instances sleep when unused).' };
  }
  if (status === 401 || status === 200) return { state: 'up', detail: 'up, REST API responding.' };
  if (status >= 300 && status < 400) return { state: 'unexpected', detail: `Redirected to ${location || 'another page'} (HTTP ${status}).` };
  if (status >= 500) return { state: 'down', detail: `Instance error (HTTP ${status}).` };
  if (/text\/html/.test(contentType)) return { state: 'unexpected', detail: `Got an HTML page instead of the REST API (HTTP ${status}).` };
  return { state: 'unexpected', detail: `Unexpected response (HTTP ${status}).` };
}

function nodeCheck(): CheckResult {
  const v = process.versions.node;
  const ok = compareVersions(v, '20.0.0') >= 0;
  return {
    id: 'node', title: 'Node.js', status: ok ? 'ok' : 'fail', detail: `v${v}`,
    fix: ok ? undefined : 'Install Node.js 20 or newer from https://nodejs.org (22 LTS recommended).',
  };
}

async function versionCheck(offline?: boolean): Promise<CheckResult> {
  if (offline) return { id: 'version', title: 'NowAIKit version', status: 'info', detail: VERSION };
  try {
    const r = await fetchWithTimeout('https://registry.npmjs.org/nowaikit/latest', { headers: { Accept: 'application/json' } }, 5000);
    const latest = String(((await r.json()) as { version?: string }).version || '');
    if (!latest) throw new Error('no version');
    const cmp = compareVersions(VERSION, latest);
    return cmp >= 0
      ? { id: 'version', title: 'NowAIKit version', status: 'ok', detail: `${VERSION} (latest)` }
      : { id: 'version', title: 'NowAIKit version', status: 'warn', detail: `${VERSION}, latest is ${latest}`, fix: 'Run `nowaikit update`.' };
  } catch {
    return { id: 'version', title: 'NowAIKit version', status: 'info', detail: `${VERSION} (could not reach npm to compare)` };
  }
}

/** Find a nowaikit entry in an MCP client config and check that what it launches exists. */
export function inspectClientConfig(raw: string, configKey: string): { found: boolean; problem?: string; launch?: string; fullToolList?: boolean } {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return { found: false, problem: 'The config file is not valid JSON, so the client ignores every server in it.' };
  }
  const servers = json?.[configKey] || json?.mcpServers || json?.servers || {};
  const entry = Object.entries(servers).find(([k, v]) => /nowaikit|servicenow/i.test(k) || /nowaikit/i.test(JSON.stringify(v)));
  if (!entry) return { found: false };
  const v = entry[1] as { command?: string; args?: string[]; url?: string; env?: Record<string, string> };
  if (v.url) return { found: true, launch: v.url };
  const launch = [v.command, ...(v.args || [])].filter(Boolean).join(' ');
  const script = (v.args || []).find((a) => /\.(m?js|cjs)$/.test(a));
  if (script && !existsSync(script)) return { found: true, launch, problem: `It points at ${script}, which does not exist.` };
  // No discovery mode and no role package means the whole catalog is listed to the model every session.
  const env = v.env || {};
  const args = (v.args || []).join(' ');
  const fullToolList = !env.MCP_TOOL_DISCOVERY && !env.MCP_TOOL_PACKAGE && !env.SN_PERSONA && !/--lean|--package|--persona|--discovery/.test(args);
  return { found: true, launch, fullToolList };
}

function clientChecks(): CheckResult[] {
  const out: CheckResult[] = [];
  for (const c of detectClients()) {
    if (!existsSync(c.configPath)) continue;
    let raw = '';
    try { raw = readFileSync(c.configPath, 'utf8'); } catch { continue; }
    const r = inspectClientConfig(raw, c.configKey);
    if (!r.found && !r.problem) continue;
    // Claude Code loads MCP tools on demand, so a full list costs it little.
    const heavy = !r.problem && r.fullToolList && c.id !== 'claude-code';
    out.push({
      id: `client:${c.id}`,
      title: c.name,
      status: r.problem ? 'fail' : heavy ? 'warn' : 'ok',
      detail: r.problem ? r.problem : `configured (${r.launch})${heavy ? '; lists all ~550 tools (about 80K tokens each conversation)' : ''}`,
      fix: r.problem
        ? 'Run `nowaikit setup` to rewrite this client\'s config.'
        : heavy
        ? 'Add "MCP_TOOL_DISCOVERY": "lean" to its env (or re-run `nowaikit setup`). Every tool stays reachable through search_tools.'
        : undefined,
    });
  }
  if (!out.length) {
    out.push({ id: 'clients', title: 'AI clients', status: 'warn', detail: 'No AI client is configured to use NowAIKit yet.', fix: 'Run `nowaikit setup` and pick your client (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, ...).' });
  }
  return out;
}

async function sdkCheck(offline?: boolean): Promise<CheckResult> {
  if (offline) return { id: 'sdk', title: 'ServiceNow SDK (optional)', status: 'info', detail: 'skipped' };
  try {
    const { stdout } = await execFileAsync('now-sdk', ['--version'], { timeout: 15000 });
    const v = (stdout.match(/\d+\.\d+\.\d+/) || [''])[0];
    const ok = v && compareVersions(v, '4.14.2') >= 0;
    return {
      id: 'sdk', title: 'ServiceNow SDK (optional)', status: ok ? 'ok' : 'warn', detail: v || stdout.trim(),
      fix: ok ? undefined : 'Only needed for the fluent_* tools: npm i -g @servicenow/sdk@latest',
    };
  } catch {
    return { id: 'sdk', title: 'ServiceNow SDK (optional)', status: 'info', detail: 'not installed globally (only needed for the fluent_* tools; they fall back to npx)' };
  }
}

async function instanceChecks(opts: DoctorOptions): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  let manager: any;
  try {
    const { InstanceManager } = await import('../servicenow/instances.js');
    manager = new InstanceManager();
  } catch (e) {
    out.push({
      id: 'config', title: 'Instance configuration', status: 'fail',
      detail: e instanceof Error ? e.message.split('\n')[0]! : String(e),
      fix: 'Run `nowaikit setup` to connect an instance.',
    });
    return out;
  }
  const names: string[] = manager.listNames();
  if (!names.length) {
    out.push({ id: 'config', title: 'Instance configuration', status: 'fail', detail: 'No ServiceNow instance is configured.', fix: 'Run `nowaikit setup`.' });
    return out;
  }
  const target = opts.instance || manager.getCurrentName();
  if (opts.instance && !names.some((n: string) => n.toLowerCase() === opts.instance!.toLowerCase())) {
    out.push({ id: 'config', title: 'Instance configuration', status: 'fail', detail: `No instance named "${opts.instance}". Configured: ${names.join(', ')}` });
    return out;
  }
  const def = process.env.SN_DEFAULT_INSTANCE;
  out.push({
    id: 'config', title: 'Instance configuration', status: 'ok',
    detail: `${names.length} instance(s); default "${manager.getCurrentName()}"${def ? ` (from SN_DEFAULT_INSTANCE)` : ''}; checking "${target}"`,
  });
  if (opts.offline) return out;

  const client = manager.getClient(target);
  const url: string = client.instanceUrl;

  // Reachability, without credentials.
  let reachable = false;
  try {
    const r = await fetchWithTimeout(`${url}/api/now/table/sys_user?sysparm_limit=1`, { headers: { Accept: 'application/json' } });
    const body = await r.text().catch(() => '');
    const probe = classifyProbe(r.status, r.headers.get('content-type') || '', body, r.headers.get('location') || '');
    reachable = probe.state === 'up';
    out.push({
      id: 'reach', title: 'Instance reachable', status: probe.state === 'up' ? 'ok' : 'fail', detail: `${url}: ${probe.detail}`,
      fix: probe.state === 'hibernating'
        ? 'Wake it at https://developer.servicenow.com (sign in, then "Wake up instance"), wait a few minutes, and run doctor again.'
        : probe.state === 'up' ? undefined : 'Check the instance URL in your config and that the instance is up.',
    });
  } catch (e) {
    const msg = e instanceof Error ? ((e as any).cause?.code || e.message) : String(e);
    out.push({
      id: 'reach', title: 'Instance reachable', status: 'fail', detail: `${url}: ${msg}`,
      fix: /ENOTFOUND/.test(String(msg)) ? 'The hostname does not resolve. Check the instance URL for typos.' : 'Check your network, VPN or proxy, and the instance URL.',
    });
  }
  if (!reachable) return out;

  // Authentication and identity.
  let user: any;
  try {
    user = await client.getCurrentUser();
    out.push({ id: 'auth', title: 'Login', status: 'ok', detail: `signed in as ${user.user_name || user.user_display_name || 'unknown'}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out.push({
      id: 'auth', title: 'Login', status: 'fail', detail: msg.split('\n')[0]!,
      fix: /401/.test(msg)
        ? 'Credentials were rejected. Run `nowaikit auth login`, or for SSO-only accounts switch this instance to OAuth in `nowaikit setup`.'
        : msg.split('\n').slice(1, 4).join(' ').trim() || 'Run `nowaikit auth test` for details.',
    });
    return out;
  }

  // Roles: the common reason a working login still fails on tools.
  let userRoles = new Set<string>();
  try {
    const roles = await client.queryRecords({
      table: 'sys_user_has_role', query: `user=${user.user_sys_id}^state=active`, fields: 'role.name', limit: 500,
    });
    const names = new Set((roles.records as any[]).map((r) => String(r['role.name'] ?? '')).filter(Boolean));
    userRoles = names;
    const admin = names.has('admin');
    const itil = names.has('itil');
    // Australia adds sn_cmdb_admin and sn_cmdb_editor; CMDB tools work with those alone.
    const cmdb = ['sn_cmdb_admin', 'sn_cmdb_editor'].filter((r) => names.has(r));
    const ok = admin || itil || cmdb.length > 0;
    out.push({
      id: 'roles', title: 'Roles', status: ok ? 'ok' : 'warn',
      detail: admin ? 'admin' : itil ? `itil${cmdb.length ? `, ${cmdb.join(', ')}` : ''} (admin-only tools such as scripts, ACLs and update sets will be refused)` : cmdb.length ? `${cmdb.join(', ')} (CMDB tools only; ITSM tools need itil)` : `${names.size} role(s), none of admin, itil, sn_cmdb_admin or sn_cmdb_editor`,
      fix: ok ? undefined : 'Most ITSM tools need itil; developer tools need admin; CMDB work can use sn_cmdb_editor. Ask your ServiceNow admin to grant the roles you need.',
    });
  } catch {
    out.push({ id: 'roles', title: 'Roles', status: 'info', detail: 'could not read your roles (sys_user_has_role is restricted for this account)' });
  }

  // Basic auth restriction: will this connection keep working when ServiceNow tightens Basic auth?
  try {
    const [props, me] = await Promise.all([
      client.queryRecords({ table: 'sys_properties', query: 'nameSTARTSWITHglide.authenticate.basic_auth', fields: 'name,value', limit: 30 }),
      client.queryRecords({ table: 'sys_user', query: `sys_id=${user.user_sys_id}`, fields: 'web_service_access_only,user_name', limit: 1 }).catch(() => ({ records: [] as any[] })),
    ]);
    const map = Object.fromEntries((props.records as any[]).map((p) => [String(p.name), String(p.value ?? '')]));
    const rec = (me.records as any[])[0] || {};
    out.push(basicAuthCheck({
      authMethod: String((client as any).authMethod || 'basic'),
      props: map,
      roles: userRoles,
      webServiceOnly: String(rec.web_service_access_only) === 'true',
      userName: String(rec.user_name || user.user_name || ''),
    }));
  } catch { /* optional */ }

  // Release family, from the build tag.
  try {
    const p = await client.queryRecords({ table: 'sys_properties', query: 'name=glide.buildtag.last', fields: 'value', limit: 1 });
    const tag = String((p.records[0] as any)?.value || '');
    if (tag) {
      const { releaseContext } = await import('../servicenow/release.js');
      const ctx = releaseContext(tag);
      const name = ctx.current.label ? `${ctx.current.label}${ctx.current.patch ? ` patch ${ctx.current.patch}` : ''}` : '';
      const next = ctx.target ? `; next family ${ctx.target.label}${ctx.target.status === 'early_availability' ? ' (early availability)' : ''}` : '';
      out.push({ id: 'release', title: 'ServiceNow release', status: 'info', detail: name ? `${name}${next} (${tag})` : tag });
    }
  } catch { /* optional */ }

  // Permission gates as the server will apply them for this instance.
  const flag = (k: string) => (process.env[k] || 'false').toLowerCase() === 'true';
  const gates = ['WRITE_ENABLED', 'SCRIPTING_ENABLED', 'CMDB_WRITE_ENABLED', 'ATF_ENABLED'].map((k) => `${k.replace('_ENABLED', '').toLowerCase()} ${flag(k) ? 'on' : 'off'}`);
  out.push({ id: 'gates', title: 'Permissions', status: 'info', detail: gates.join(', '), fix: flag('WRITE_ENABLED') ? undefined : 'Read-only. To allow changes, set writeEnabled for this instance in `nowaikit setup` (or WRITE_ENABLED=true).' });
  return out;
}

export async function runDoctorChecks(opts: DoctorOptions = {}): Promise<CheckResult[]> {
  const results: CheckResult[] = [nodeCheck()];
  const [version, instance, sdk] = await Promise.all([versionCheck(opts.offline), instanceChecks(opts), sdkCheck(opts.offline)]);
  results.push(version, ...instance, ...clientChecks(), sdk);
  return results;
}

const ICON: Record<CheckStatus, string> = { ok: chalk.green('✓'), warn: chalk.yellow('!'), fail: chalk.red('✗'), info: chalk.dim('·') };

export async function runDoctor(opts: DoctorOptions = {}): Promise<number> {
  const results = await runDoctorChecks(opts);
  if (opts.json) {
    console.log(JSON.stringify({ version: VERSION, checks: results }, null, 2));
  } else {
    console.log('');
    console.log(chalk.bold('NowAIKit doctor'));
    console.log('');
    for (const r of results) {
      console.log(`  ${ICON[r.status]} ${chalk.bold(r.title)}  ${chalk.dim(r.detail)}`);
      if (r.fix && r.status !== 'ok') console.log(`      ${r.fix}`);
    }
    const fails = results.filter((r) => r.status === 'fail').length;
    const warns = results.filter((r) => r.status === 'warn').length;
    console.log('');
    console.log(fails ? chalk.red(`  ${fails} problem(s) to fix.`) : warns ? chalk.yellow(`  Working, with ${warns} suggestion(s).`) : chalk.green('  Everything looks good.'));
    console.log('');
  }
  return results.some((r) => r.status === 'fail') ? 1 : 0;
}
