/**
 * Interactive setup wizard — `nowaikit setup`
 *
 * Walks the user through:
 *   1.  ServiceNow instance (with reachability auto-detect)
 *   2.  Auth method (Basic / OAuth)
 *   3.  Credentials
 *   4.  Connection test (with auto-fix suggestions on failure)
 *   5.  Permission tier / tool package
 *   6.  Component selection — MCP Server / SDK / Apex AI Skills (checkbox multi-select)
 *   7.  AI Provider — Ollama/LM Studio auto-detect, cloud API key (shown when Apex enabled)
 *   8.  Power Tools & Capabilities overview
 *   9.  Prompts, Shortcuts & Resources
 *   10. AI Client Installation
 *   11. Auto-Configuration (npm link, starter file, client config)
 */
import { input, password, select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import { addInstance, loadConfig } from './config-store.js';
import { detectClients } from './detect-clients.js';
import { writeClientConfig } from './writers/index.js';
import type { InstanceConfig, IntegrationMode } from './config-store.js';
import type { LlmProvider } from '../direct/llm-client.js';

// ─── Brand colors (matches nowaitkit.com — teal/navy palette) ───────────────
// NOTE: `white` and `subtle` use terminal-adaptive styles so text remains
//       visible on both dark *and* light (bright-white) terminal backgrounds.
const teal    = chalk.hex('#00D4AA');        // teal-500 — primary brand
const navy    = chalk.hex('#0F4C81');        // deep navy — secondary brand
const bright  = chalk.hex('#00B899');        // darker teal — visible on light bg too
const mint    = chalk.hex('#00997F');        // mint — code/light accent (dark-safe)
const brand   = teal;                        // primary brand color
const brandBg = chalk.bgHex('#00D4AA').black.bold; // teal badge bg (black text = always visible)
const accent  = teal;                        // accent (AI highlight)
const success = chalk.hex('#10B981');        // emerald-500
const warn    = chalk.hex('#FF6B35');        // amber/orange
const err     = chalk.hex('#E8466A');        // pink-500
const gray    = chalk.hex('#8B949E');        // muted gray — AI contrast in banner
const dim     = chalk.gray;                  // terminal-adaptive dim text
const white   = chalk.bold;                  // terminal-adaptive primary text (works on light + dark)
const subtle  = chalk.dim;                   // terminal-adaptive secondary text

const TOTAL_STEPS = 11;

const TOOL_PACKAGES = [
  { value: 'full',                 name: `${brand('full')}                 ${dim('— all 400+ tools')}` },
  { value: 'service_desk',        name: `${brand('service_desk')}        ${dim('— help desk agents')}` },
  { value: 'change_coordinator',  name: `${brand('change_coordinator')}  ${dim('— change managers')}` },
  { value: 'knowledge_author',   name: `${brand('knowledge_author')}   ${dim('— KB writers')}` },
  { value: 'catalog_builder',    name: `${brand('catalog_builder')}    ${dim('— catalog admins')}` },
  { value: 'system_administrator', name: `${brand('system_administrator')} ${dim('— SysAdmins')}` },
  { value: 'platform_developer', name: `${brand('platform_developer')} ${dim('— developers')}` },
  { value: 'itom_engineer',      name: `${brand('itom_engineer')}      ${dim('— IT Ops / monitoring')}` },
  { value: 'agile_manager',      name: `${brand('agile_manager')}      ${dim('— Scrum / SAFe teams')}` },
  { value: 'ai_developer',       name: `${brand('ai_developer')}       ${dim('— Now Assist / AI builders')}` },
];

// ─── Box drawing helpers ──────────────────────────────────────────────────────
function box(lines: string[], color = brand): void {
  const maxLen = Math.max(...lines.map(l => stripAnsi(l).length));
  const w = maxLen + 4;
  console.log(color(`  ╭${'─'.repeat(w)}╮`));
  for (const line of lines) {
    const pad = w - stripAnsi(line).length - 2;
    console.log(color('  │') + ' ' + line + ' '.repeat(pad) + color(' │'));
  }
  console.log(color(`  ╰${'─'.repeat(w)}╯`));
}

function divider(): void {
  console.log(dim('  ' + '─'.repeat(56)));
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

// ─── Progress bar (gradient fill) ─────────────────────────────────────────────
function progressBar(current: number, total: number): string {
  const width = 20;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  // Gradient blocks: mint → bright → teal → navy
  const colors = [mint, mint, bright, bright, teal, teal, teal, teal, navy, navy,
                  navy, navy, teal, teal, teal, teal, bright, bright, mint, mint];
  let bar = '';
  for (let i = 0; i < filled; i++) bar += colors[i]('█');
  bar += dim('░'.repeat(empty));
  const pct = dim(`${Math.round((current / total) * 100)}%`);
  return `  ${bar} ${pct}`;
}

// ─── Logo + Banner ────────────────────────────────────────────────────────────
function logoText(): string {
  return white('Now') + teal.bold('AI') + white('Kit');
}

function banner(): void {
  console.log('');
  // ASCII art logo — "NowAIKit" in block thick style, NOW/KIT teal, AI gray
  console.log(teal.bold('  ███╗  ██╗ ██████╗ ██╗    ██╗') + '   ' + gray(' █████╗ ██╗') + '   ' + teal.bold('██╗  ██╗██╗████████╗'));
  console.log(teal.bold('  ████╗ ██║██╔═══██╗██║    ██║') + '   ' + gray('██╔══██╗██║') + '   ' + teal.bold('██║ ██╔╝██║╚══██╔══╝'));
  console.log(teal.bold('  ██╔██╗██║██║   ██║██║ █╗ ██║') + '   ' + gray('███████║██║') + '   ' + teal.bold('█████╔╝ ██║   ██║'));
  console.log(teal.bold('  ██║╚████║██║   ██║██║███╗██║') + '   ' + gray('██╔══██║██║') + '   ' + teal.bold('██╔═██╗ ██║   ██║'));
  console.log(teal.bold('  ██║ ╚███║╚██████╔╝╚███╔███╔╝') + '   ' + gray('██║  ██║██║') + '   ' + teal.bold('██║  ██╗██║   ██║'));
  console.log(teal.bold('  ╚═╝  ╚══╝ ╚═════╝  ╚══╝╚══╝') + '   ' + gray('╚═╝  ╚═╝╚═╝') + '   ' + teal.bold('╚═╝  ╚═╝╚═╝   ╚═╝') + '  ' + teal('✦'));
  console.log('');
  console.log(`  ${logoText()}  ${dim('—')} ${subtle('Setup Wizard')}`);
  console.log('');
  console.log(dim('  Connect ') + teal.bold('Any AI') + dim(' to ServiceNow. Instantly.'));
  console.log(dim('  400+ tools  ·  All modules  ·  Any AI client'));
  console.log('');
  divider();
  console.log('');
}

// ─── Step header ──────────────────────────────────────────────────────────────
function step(n: number, title: string): void {
  console.log('');
  console.log(progressBar(n, TOTAL_STEPS));
  console.log('');
  const badge = brandBg(` ${n}/${TOTAL_STEPS} `);
  console.log(`  ${badge} ${white(title)}`);
  console.log('');
}

// ─── Section label ────────────────────────────────────────────────────────────
function sectionLabel(label: string): void {
  console.log(`  ${accent('▸')} ${subtle(label)}`);
}

// ─── Test connection ──────────────────────────────────────────────────────────

/** Extract the real error message from Node.js fetch failures (cause chain) */
function extractFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  // Node.js fetch wraps real errors in .cause
  const cause = (error as Error & { cause?: Error }).cause;
  if (cause) {
    const code = (cause as Error & { code?: string }).code;
    if (code === 'ENOTFOUND')      return `DNS lookup failed — hostname not found. Check the instance name.`;
    if (code === 'ECONNREFUSED')   return `Connection refused — the instance may be down or blocking access.`;
    if (code === 'ECONNRESET')     return `Connection reset by the server. Check firewall or VPN settings.`;
    if (code === 'ETIMEDOUT')      return `Connection timed out. Check network connectivity.`;
    if (code === 'CERT_HAS_EXPIRED') return `SSL certificate has expired on the ServiceNow instance.`;
    if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return `SSL certificate verification failed.`;
    if (code)                      return `Network error: ${code} — ${cause.message}`;
    return cause.message;
  }
  return error.message;
}

/**
 * Quick HEAD check — returns true if the URL is reachable (any HTTP response).
 * Does not throw; returns false on any network / DNS error.
 */
async function isUrlReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

async function testConnection(
  instanceUrl: string,
  authMethod: 'basic' | 'oauth',
  creds: Partial<InstanceConfig>
): Promise<{ ok: boolean; message: string }> {
  // Pre-flight: verify the hostname is reachable before attempting auth
  const spinner = ora({
    text: dim('  Checking instance reachability…'),
    color: 'cyan',
  }).start();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    await fetch(instanceUrl, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
  } catch (preflight) {
    const msg = extractFetchError(preflight);
    spinner.fail(err(`  Instance unreachable: ${msg}`));
    console.log('');
    console.log(dim('  Verify:'));
    console.log(dim('    • The instance name is correct (just the subdomain)'));
    console.log(dim('    • The instance is online at ') + accent(instanceUrl));
    console.log(dim('    • Your network/VPN allows access'));
    return { ok: false, message: msg };
  }

  spinner.text = dim('  Testing authentication…');

  try {
    const { ServiceNowClient } = await import('../servicenow/client.js');
    const client = new ServiceNowClient({
      instanceUrl,
      authMethod,
      basic: { username: creds.username, password: creds.password },
      oauth: {
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        username: creds.username,
        password: creds.password,
      },
      maxRetries: 1,
      requestTimeoutMs: 15000,
    });

    const result = await client.queryRecords({ table: 'sys_user', limit: 1 });
    spinner.succeed(success('  Connected — authentication verified'));
    return { ok: true, message: `Connected (${result.count >= 0 ? 'OK' : 'warning'})` };
  } catch (error) {
    const msg = extractFetchError(error);
    spinner.fail(err(`  Connection failed: ${msg}`));
    return { ok: false, message: msg };
  }
}

/** Returns true if `cmd` is resolvable on PATH. */
function isCommandAvailable(cmd: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${which} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures the `nowaikit` binary is available on PATH by running `npm link`
 * in the package root. Skips silently if it's already linked.
 */
async function ensureGlobalCommand(): Promise<void> {
  if (isCommandAvailable('nowaikit')) return;

  const spinner = ora({
    text: dim('  Making `nowaikit` available as a global command…'),
    color: 'cyan',
  }).start();

  const pkgRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');

  try {
    execSync('npm link', { cwd: pkgRoot, stdio: 'pipe' });
    spinner.succeed(success('  `nowaikit` is now available as a global command'));
  } catch {
    try {
      const prefix = execSync('npm config get prefix', { encoding: 'utf8', stdio: 'pipe' }).trim();
      execSync('npm link', {
        cwd: pkgRoot,
        stdio: 'pipe',
        env: { ...process.env, npm_config_prefix: prefix },
      });
      spinner.succeed(success('  `nowaikit` linked via npm prefix'));
    } catch {
      spinner.warn(warn('  Could not link globally — permission denied'));
      console.log('');
      console.log(dim('  Fix options (choose one):'));
      console.log(brand('    sudo npm link')            + dim('              # if using system Node'));
      console.log(brand('    npm install -g nowaikit')   + dim('   # install from npm registry'));
      console.log(brand('    npx nowaikit instances list') + dim(' # use npx instead'));
    }
  }
}

// ─── Local AI provider auto-detection ────────────────────────────────────────
interface DetectedProvider {
  running: boolean;
  models: string[];
}

async function detectLocalProviders(): Promise<{ ollama: DetectedProvider; lmstudio: DetectedProvider }> {
  const result = {
    ollama: { running: false, models: [] as string[] },
    lmstudio: { running: false, models: [] as string[] },
  };

  // Ollama: GET http://localhost:11434/api/tags
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any;
      result.ollama.running = true;
      result.ollama.models = (data.models || []).map((m: { name: string }) => m.name.replace(/:latest$/, ''));
    }
  } catch { /* not running */ }

  // LM Studio: GET http://localhost:1234/v1/models
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://localhost:1234/v1/models', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any;
      result.lmstudio.running = true;
      result.lmstudio.models = (data.data || []).map((m: { id: string }) => m.id);
    }
  } catch { /* not running */ }

  return result;
}

/** Fetch available models from Anthropic API, filtered to latest chat models. */
async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const models: string[] = (data.data || [])
      .map((m: { id: string }) => m.id)
      .filter((id: string) => /^claude-/.test(id) && !/-\d{8}$/.test(id))
      .sort();
    return models;
  } catch { return []; }
}

/** Fetch available models from OpenAI API, filtered to latest GPT chat models. */
async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const models: string[] = (data.data || [])
      .map((m: { id: string }) => m.id)
      .filter((id: string) => /^gpt-/.test(id) && !id.includes('instruct') && !id.includes('realtime') && !id.includes('audio') && !id.includes('search'))
      .sort()
      .reverse();
    return models;
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SETUP FLOW
// ═══════════════════════════════════════════════════════════════════════════════

export async function runSetup(options: { add?: boolean } = {}): Promise<void> {
  banner();

  const existing = loadConfig();
  const isFirstRun = Object.keys(existing.instances).length === 0 && !options.add;

  if (isFirstRun) {
    box([
      white("Welcome! Let's connect your first ServiceNow instance."),
      dim('This wizard will configure everything in under 2 minutes.'),
    ]);
  } else if (options.add) {
    box([
      white('Adding a new ServiceNow instance.'),
      dim('Your existing instances will not be affected.'),
    ]);
  }

  // ─── Step 1: Instance ──────────────────────────────────────────────────────
  step(1, 'ServiceNow Instance');

  sectionLabel('Enter your instance name — just the subdomain, not the full URL');
  console.log(dim('  Example: if your URL is https://acme.service-now.com, enter ') + brand('acme'));
  console.log('');

  let instanceUrl: string;
  let trimmed: string;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const instanceId = await input({
      message: brand('?') + ' Instance name ' + dim('(e.g. acme, dev12345)') + brand(':'),
      validate: (v: string) => {
        if (!v.trim()) return 'Instance name is required';
        if (/\s/.test(v)) return 'No spaces allowed';
        return true;
      },
    });

    trimmed = instanceId.trim().toLowerCase();
    // Strip full URL if user pasted one
    if (trimmed.startsWith('https://')) {
      instanceUrl = trimmed.replace(/\/+$/, '');
      trimmed = instanceUrl.replace('https://', '').replace('.service-now.com', '');
    } else if (trimmed.includes('.service-now.com')) {
      trimmed = trimmed.replace('.service-now.com', '').replace(/\/+$/, '');
      instanceUrl = `https://${trimmed}.service-now.com`;
    } else {
      instanceUrl = `https://${trimmed}.service-now.com`;
    }

    console.log(`  ${success('→')} ${dim('URL:')} ${accent(instanceUrl)}`);
    console.log('');

    // Auto-detect reachability before proceeding
    const reachSpinner = ora({ text: dim('  Checking if instance is reachable…'), color: 'cyan' }).start();
    const reachable = await isUrlReachable(instanceUrl);
    if (reachable) {
      reachSpinner.succeed(success('  Instance is reachable'));
      break;
    }

    // Not reachable — offer auto-fix options
    reachSpinner.warn(warn('  Instance not reachable — it may be offline or the name may be wrong'));
    console.log('');
    const fixAction = await select<'retry' | 'try_api' | 'try_https' | 'continue' | 'reenter'>({
      message: warn('?') + ' Auto-fix options' + brand(':'),
      choices: [
        { name: `${brand('↻')} Try again with same URL`,                                 value: 'retry' },
        { name: `${accent('/')} Try with /api prefix ${dim(`(${instanceUrl}/api)`)}`,   value: 'try_api' },
        { name: `${brand('🔒')} Try HTTPS variant ${dim('(already HTTPS — refresh)')}`, value: 'try_https' },
        { name: `${dim('✏')} Re-enter instance name`,                                    value: 'reenter' },
        { name: `${subtle('→')} Continue anyway ${dim('(fix manually later)')}`,         value: 'continue' },
      ],
    });

    if (fixAction === 'continue') {
      console.log(`  ${dim('→')} Continuing with unreachable instance — you can fix this in your config later.`);
      break;
    }
    if (fixAction === 'try_api') {
      const apiUrl = `${instanceUrl}/api`;
      const apiReachable = await isUrlReachable(apiUrl);
      if (apiReachable) {
        console.log(`  ${success('✓')} Reachable with /api prefix — continuing`);
        break;
      }
      console.log(`  ${warn('→')} Still not reachable. Try re-entering the instance name.`);
    }
    if (fixAction === 'try_https' || fixAction === 'retry') {
      const recheck = await isUrlReachable(instanceUrl);
      if (recheck) {
        console.log(`  ${success('✓')} Instance is now reachable`);
        break;
      }
      console.log(`  ${warn('→')} Still not reachable.`);
    }
    // 'reenter' falls through to top of loop naturally
    if (fixAction !== 'reenter') {
      // For all non-reenter choices that didn't break, offer to continue or reenter
      const nextAction = await select<'continue' | 'reenter'>({
        message: warn('?') + ' What next' + brand(':'),
        choices: [
          { name: `${dim('→')} Continue anyway`, value: 'continue' },
          { name: `${accent('✏')} Re-enter instance name`, value: 'reenter' },
        ],
      });
      if (nextAction === 'continue') break;
    }
    // loop continues for 'reenter'
  }

  const instanceName = await input({
    message: brand('?') + ' Short name ' + dim('(e.g. prod, dev, acme)') + brand(':'),
    default: trimmed.replace(/\.service-now\.com$/, '').replace(/[^a-z0-9_-]/gi, '-'),
    validate: (v: string) => (/^[a-z0-9_-]+$/i.test(v) ? true : 'Letters, numbers, - and _ only'),
  });

  const environment = await select<string>({
    message: brand('?') + ' Environment' + brand(':'),
    choices: [
      { name: `${accent('●')} Production`,       value: 'production' },
      { name: `${brand('●')} Development`,       value: 'development' },
      { name: `${warn('●')} Test / QA`,          value: 'test' },
      { name: `${subtle('●')} Staging / UAT`,    value: 'staging' },
      { name: `${dim('●')} Personal Dev (PDI)`,  value: 'pdi' },
    ],
  });

  const group = await input({
    message: brand('?') + ' Instance group ' + dim('(optional — Enter to skip)') + brand(':'),
    default: '',
  });

  // ─── Step 2: Authentication ────────────────────────────────────────────────
  step(2, 'Authentication');

  sectionLabel('Choose how to authenticate with ServiceNow');
  console.log('');

  const authMethod = await select<'basic' | 'oauth'>({
    message: brand('?') + ' Auth method' + brand(':'),
    choices: [
      { name: `${brand('🔑')} Basic ${dim('(username + password) — good for dev/PDI')}`, value: 'basic' },
      { name: `${accent('🔒')} OAuth 2.0 ${dim('— recommended for production')}`,       value: 'oauth' },
    ],
  });

  const authMode = await select<'service-account' | 'per-user' | 'impersonation'>({
    message: brand('?') + ' Execution context' + brand(':'),
    choices: [
      {
        name: `${brand('👤')} Service account ${dim('— one shared account (default)')}`,
        value: 'service-account',
      },
      {
        name: `${accent('👥')} Per-user ${dim('— each user authenticates individually (enterprise)')}`,
        value: 'per-user',
      },
      {
        name: `${subtle('🎭')} Impersonation ${dim('— service account + X-Sn-Impersonate per user')}`,
        value: 'impersonation',
      },
    ],
  });

  // ─── Step 3: Credentials ──────────────────────────────────────────────────
  step(3, 'Credentials');

  let username: string | undefined;
  let userPassword: string | undefined;
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  if (authMode === 'per-user') {
    box([
      warn('Per-user mode selected'),
      dim('Run `nowaikit auth login` separately for each user.'),
      dim('Provide a fallback service account for setup testing.'),
    ], warn);
    console.log('');
  }

  if (authMethod === 'basic') {
    username = await input({ message: brand('?') + ' Username' + brand(':') });
    userPassword = await password({ message: brand('?') + ' Password' + brand(':'), mask: '•' });
  } else {
    sectionLabel('OAuth 2.0 credentials');
    console.log('');
    clientId = await input({ message: brand('?') + ' Client ID' + brand(':') });
    clientSecret = await password({ message: brand('?') + ' Client Secret' + brand(':'), mask: '•' });
    console.log('');
    sectionLabel('Service account for token generation');
    console.log('');
    username = await input({ message: brand('?') + ' Username' + brand(':') });
    userPassword = await password({ message: brand('?') + ' Password' + brand(':'), mask: '•' });
  }

  // ─── Step 4: Test Connection ──────────────────────────────────────────────
  step(4, 'Testing Connection');

  let connected = false;
  while (!connected) {
    const { ok } = await testConnection(instanceUrl, authMethod, {
      username,
      password: userPassword,
      clientId,
      clientSecret,
    });

    if (ok) {
      connected = true;
      break;
    }

    console.log('');
    const action = await select<'retry' | 'creds' | 'fix_api' | 'fix_https' | 'save' | 'cancel'>({
      message: warn('?') + ' Connection failed — what would you like to do?' + brand(':'),
      choices: [
        { name: `${brand('↻')} Retry connection`,                                                    value: 'retry' },
        { name: `${accent('✏')} Re-enter credentials`,                                               value: 'creds' },
        { name: `${brand('/')} Auto-fix: try with /api prefix`,                                      value: 'fix_api' },
        { name: `${brand('🔒')} Auto-fix: switch to HTTPS`,                                          value: 'fix_https' },
        { name: `${subtle('💾')} Save config anyway ${dim('(fix later)')}`,                          value: 'save' },
        { name: `${err('✕')} Cancel setup`,                                                          value: 'cancel' },
      ],
    });

    if (action === 'cancel') {
      console.log('');
      box([err('Setup cancelled.')], err);
      console.log('');
      return;
    }
    if (action === 'save') break;

    if (action === 'fix_api') {
      // Try appending /api to the URL
      const apiUrl = instanceUrl.endsWith('/api') ? instanceUrl : `${instanceUrl}/api`;
      console.log(`  ${dim('→')} Trying ${accent(apiUrl)}…`);
      const reachable = await isUrlReachable(apiUrl);
      if (reachable) {
        instanceUrl = apiUrl;
        console.log(`  ${success('✓')} URL updated to ${accent(instanceUrl)}`);
      } else {
        console.log(`  ${warn('→')} /api prefix did not help. Try re-entering credentials.`);
      }
    }

    if (action === 'fix_https') {
      // Ensure URL uses HTTPS
      if (instanceUrl.startsWith('http://')) {
        instanceUrl = instanceUrl.replace('http://', 'https://');
        console.log(`  ${success('✓')} Switched to HTTPS: ${accent(instanceUrl)}`);
      } else {
        console.log(`  ${dim('→')} URL is already HTTPS: ${accent(instanceUrl)}`);
      }
    }

    if (action === 'creds') {
      console.log('');
      if (authMethod === 'basic') {
        username = await input({ message: brand('?') + ' Username' + brand(':') });
        userPassword = await password({ message: brand('?') + ' Password' + brand(':'), mask: '•' });
      } else {
        clientId = await input({ message: brand('?') + ' Client ID' + brand(':') });
        clientSecret = await password({ message: brand('?') + ' Client Secret' + brand(':'), mask: '•' });
        username = await input({ message: brand('?') + ' Username' + brand(':') });
        userPassword = await password({ message: brand('?') + ' Password' + brand(':'), mask: '•' });
      }
    }
  }

  // ─── Step 5: Permissions & Role ───────────────────────────────────────────
  step(5, 'Permissions & Role');

  sectionLabel('Select which tools to expose to your AI client');
  console.log('');

  const toolPackage = await select<string>({
    message: brand('?') + ' Tool package' + brand(':'),
    choices: TOOL_PACKAGES,
  });

  const writeEnabled = await confirm({
    message: brand('?') + ' Enable write operations ' + dim('(create/update/delete records)') + brand('?'),
    default: false,
  });

  let scriptingEnabled = false;
  let cmdbWriteEnabled = false;
  let atfEnabled = false;

  if (writeEnabled) {
    console.log('');
    sectionLabel('Advanced write permissions');
    console.log(dim('  These unlock powerful features but should be used carefully in production.'));
    console.log('');

    scriptingEnabled = await confirm({
      message: brand('?') + ' Enable script execution ' + dim('(Background Scripts, server-side JS)') + brand('?'),
      default: false,
    });

    cmdbWriteEnabled = await confirm({
      message: brand('?') + ' Enable CMDB write operations ' + dim('(create/update CIs and relationships)') + brand('?'),
      default: false,
    });

    atfEnabled = await confirm({
      message: brand('?') + ' Enable ATF test execution ' + dim('(run Automated Test Framework suites)') + brand('?'),
      default: false,
    });
  }

  const nowAssistEnabled = await confirm({
    message: brand('?') + ' Enable Now Assist / AI features' + brand('?'),
    default: false,
  });

  // ─── Step 6: Component Selection (checkbox multi-select) ───────────────────
  step(6, 'Component Selection');

  sectionLabel('Choose which NowAIKit components to enable');
  console.log(dim('  Use Space to toggle, Enter to confirm. At least one must be selected.'));
  console.log('');

  let selectedComponents: string[] = [];
  while (true) {
    selectedComponents = await checkbox<string>({
      message: brand('?') + ' Enable components ' + dim('(space to toggle, enter to confirm)') + brand(':'),
      choices: [
        {
          name: `${brand('MCP Server')}      ${dim('— AI clients discover and call tools automatically')}`,
          value: 'mcp',
          checked: true,
        },
        {
          name: `${accent('TypeScript SDK')}  ${dim('— import NowAIKit directly in your code')}`,
          value: 'sdk',
          checked: false,
        },
        {
          name: `${teal('AI Skills (Apex)')} ${dim('— 26 expert capabilities (scan, review, build, ops, docs)')}`,
          value: 'apex',
          checked: true,
        },
      ],
    });

    if (selectedComponents.length > 0) break;
    console.log(`  ${warn('!')} At least one component must be selected.`);
    console.log('');
  }

  const mcpEnabled  = selectedComponents.includes('mcp');
  const sdkEnabled  = selectedComponents.includes('sdk');
  const apexEnabled = selectedComponents.includes('apex');

  // Compute legacy integrationMode for backward compat
  let integrationMode: IntegrationMode;
  if (mcpEnabled && sdkEnabled) integrationMode = 'both';
  else if (sdkEnabled) integrationMode = 'sdk';
  else integrationMode = 'mcp';

  console.log('');
  if (mcpEnabled)  console.log(`  ${success('✓')} MCP Server — AI clients will auto-discover your 400+ tools`);
  if (sdkEnabled)  console.log(`  ${success('✓')} TypeScript SDK — import NowAIKit in your project`);
  if (apexEnabled) console.log(`  ${success('✓')} AI Skills (Apex) — 26 capabilities enabled`);
  if (!apexEnabled) console.log(`  ${dim('✗')} Apex AI Skills disabled — only MCP tools and ITSM prompts active`);
  console.log('');

  if (sdkEnabled) {
    box([
      white('SDK mode selected'),
      dim('Import NowAIKit in your TypeScript/JavaScript code:'),
      '',
      brand("  import { ServiceNowClient } from 'nowaikit/sdk';"),
      brand("  import { executeDirectly } from 'nowaikit/sdk';"),
      '',
      ...(mcpEnabled ? [] : [dim('MCP client configuration will be skipped.')]),
    ]);
    console.log('');
  }

  if (mcpEnabled && sdkEnabled) {
    console.log(`  ${success('→')} ${dim('Both MCP server and SDK imports will be available.')}`);
    console.log('');
  }

  // ─── Step 7: AI Provider (for Apex capabilities) ──────────────────────────
  let aiProvider: LlmProvider | undefined;
  let aiModel: string | undefined;
  let aiApiKey: string | undefined;
  let aiBaseUrl: string | undefined;

  if (apexEnabled) {
    step(7, 'AI Provider');

    sectionLabel('Configure the LLM for Apex AI capabilities (direct mode)');
    console.log(dim('  Apex capabilities like scan-health need an LLM for analysis.'));
    console.log(dim('  MCP mode (Claude Desktop, Cursor) uses the host AI — no key needed there.'));
    console.log('');

    const detectSpinner = ora({ text: dim('  Detecting local AI providers…'), color: 'cyan' }).start();
    const localProviders = await detectLocalProviders();
    detectSpinner.stop();

    if (localProviders.ollama.running) {
      const modelList = localProviders.ollama.models.length > 0
        ? localProviders.ollama.models.slice(0, 5).join(', ')
        : 'no models pulled yet';
      console.log(`  ${success('✓')} Ollama detected at localhost:11434 (${dim(modelList)})`);
    } else {
      console.log(`  ${dim('✗')} Ollama not detected`);
    }
    if (localProviders.lmstudio.running) {
      const modelList = localProviders.lmstudio.models.length > 0
        ? localProviders.lmstudio.models.slice(0, 3).join(', ')
        : 'model loaded';
      console.log(`  ${success('✓')} LM Studio detected at localhost:1234 (${dim(modelList)})`);
    } else {
      console.log(`  ${dim('✗')} LM Studio not detected`);
    }
    console.log('');

    // Build choices — detected providers first
    type ProviderChoice = { name: string; value: LlmProvider | 'skip' };
    const providerChoices: ProviderChoice[] = [];

    if (localProviders.ollama.running) {
      providerChoices.push({
        name: `${brand('Ollama')} ${dim('(local — detected, running)')}`,
        value: 'ollama',
      });
    } else {
      providerChoices.push({
        name: `${dim('Ollama')} ${dim('(local — not detected)')}`,
        value: 'ollama',
      });
    }

    if (localProviders.lmstudio.running) {
      providerChoices.push({
        name: `${brand('LM Studio')} ${dim('(local — detected, running)')}`,
        value: 'lmstudio',
      });
    } else {
      providerChoices.push({
        name: `${dim('LM Studio')} ${dim('(local — not detected)')}`,
        value: 'lmstudio',
      });
    }

    providerChoices.push(
      { name: `${accent('Anthropic')} ${dim('(cloud — requires API key)')}`, value: 'anthropic' },
      { name: `${accent('OpenAI')} ${dim('(cloud — requires API key)')}`, value: 'openai' },
      { name: `${accent('Google Gemini')} ${dim('(cloud — requires API key)')}`, value: 'gemini' },
      { name: `${subtle('Skip')} ${dim('(configure later with --provider flag or env var)')}`, value: 'skip' as LlmProvider | 'skip' },
    );

    const selectedProvider = await select<LlmProvider | 'skip'>({
      message: brand('?') + ' Select AI provider' + brand(':'),
      choices: providerChoices,
      default: localProviders.ollama.running ? 'ollama'
        : localProviders.lmstudio.running ? 'lmstudio'
        : undefined,
    });

    if (selectedProvider !== 'skip') {
      aiProvider = selectedProvider;

      // Model selection for local providers with detected models
      if (selectedProvider === 'ollama' && localProviders.ollama.models.length > 0) {
        const modelChoices = localProviders.ollama.models.map(m => ({
          name: brand(m),
          value: m,
        }));
        aiModel = await select<string>({
          message: brand('?') + ' Select Ollama model' + brand(':'),
          choices: modelChoices,
        });
        console.log(`  ${success('✓')} Ollama configured with ${accent(aiModel)} — no API key needed`);
      } else if (selectedProvider === 'lmstudio' && localProviders.lmstudio.models.length > 0) {
        const modelChoices = localProviders.lmstudio.models.map(m => ({
          name: brand(m),
          value: m,
        }));
        aiModel = await select<string>({
          message: brand('?') + ' Select LM Studio model' + brand(':'),
          choices: modelChoices,
        });
        console.log(`  ${success('✓')} LM Studio configured with ${accent(aiModel)} — no API key needed`);
      } else if (selectedProvider === 'ollama') {
        aiModel = await input({
          message: brand('?') + ' Ollama model name ' + dim('(e.g. llama3.3, codellama)') + brand(':'),
          default: 'llama3.3',
        });
        console.log(`  ${success('✓')} Ollama configured with ${accent(aiModel)} — no API key needed`);
      } else if (selectedProvider === 'lmstudio') {
        console.log(`  ${success('✓')} LM Studio configured — uses whatever model is loaded`);
      } else if (selectedProvider === 'anthropic') {
        aiApiKey = await password({
          message: brand('?') + ' Anthropic API key ' + dim('(sk-ant-...)') + brand(':'),
          mask: '•',
        });
        // Fetch available models from Anthropic API
        const anthropicModels = await fetchAnthropicModels(aiApiKey);
        if (anthropicModels.length > 0) {
          aiModel = await select<string>({
            message: brand('?') + ' Select model' + brand(':'),
            choices: anthropicModels.map(m => ({ name: brand(m), value: m })),
          });
        } else {
          aiModel = await input({
            message: brand('?') + ' Model ' + dim('(API fetch failed — enter manually)') + brand(':'),
            default: 'claude-sonnet-4-7',
          });
        }
        console.log(`  ${success('✓')} Anthropic configured with ${accent(aiModel)}`);
      } else if (selectedProvider === 'openai') {
        aiApiKey = await password({
          message: brand('?') + ' OpenAI API key ' + dim('(sk-...)') + brand(':'),
          mask: '•',
        });
        // Fetch available models from OpenAI API
        const openaiModels = await fetchOpenAIModels(aiApiKey);
        if (openaiModels.length > 0) {
          aiModel = await select<string>({
            message: brand('?') + ' Select model' + brand(':'),
            choices: openaiModels.map(m => ({ name: brand(m), value: m })),
          });
        } else {
          aiModel = await input({
            message: brand('?') + ' Model ' + dim('(API fetch failed — enter manually)') + brand(':'),
            default: 'gpt-5.5',
          });
        }
        console.log(`  ${success('✓')} OpenAI configured with ${accent(aiModel)}`);
      } else if (selectedProvider === 'gemini') {
        aiApiKey = await password({
          message: brand('?') + ' Google Gemini API key ' + dim('(AIza...)') + brand(':'),
          mask: '•',
        });
        aiModel = await input({
          message: brand('?') + ' Model ' + dim('(e.g. gemini-3.5-flash, gemini-3.1-pro-preview)') + brand(':'),
          default: 'gemini-3.5-flash',
        });
        console.log(`  ${success('✓')} Google Gemini configured with ${accent(aiModel)}`);
      }

      // Custom base URL option for advanced users
      const useCustomUrl = await confirm({
        message: brand('?') + ' Use a custom API endpoint URL' + brand('?'),
        default: false,
      });
      if (useCustomUrl) {
        aiBaseUrl = await input({
          message: brand('?') + ' Custom endpoint URL' + brand(':'),
        });
      }
    } else {
      console.log(`  ${dim('→')} AI provider skipped — use --provider flag or environment variables when running capabilities.`);
    }
    console.log('');
  }

  // ─── Step 8: Power Tools & Capabilities ─────────────────────────────────────
  step(8, 'Power Tools & Capabilities');

  console.log(`  ${accent('▸')} ${white('Power Tools')} ${dim('— advanced features included in NowAIKit v3.0')}`);
  console.log('');
  console.log(`    ${brand('fluent_query')}       ${dim('GlideQuery-style queries from your AI — structured,')}`);
  console.log(`                       ${dim('no scripts needed. Filter, aggregate, group, sort.')}`);
  console.log('');
  console.log(`    ${brand('batch_request')}      ${dim('Bundle up to 50 API calls in one request.')}`);
  console.log(`                       ${dim('Dramatically faster for bulk operations.')}`);
  console.log('');
  console.log(`    ${brand('execute_script')}     ${dim('Run server-side JavaScript directly on your instance.')}`);
  console.log(`                       ${dim('Requires scripting permission (Step 5).')}`);
  console.log('');
  divider();
  console.log('');

  if (apexEnabled) {
    console.log(`  ${accent('▸')} ${white('26 AI Capabilities')} ${dim('— run directly from terminal (no MCP client needed)')}`);
    console.log('');
    const capCategories = [
      { icon: '🔍', label: 'Scan & Monitor', items: ['health', 'security', 'debt', 'upgrade', 'cmdb', 'automation'] },
      { icon: '📋', label: 'Review & Audit', items: ['code', 'acls', 'scripts', 'flows'] },
      { icon: '🔨', label: 'Build & Generate', items: ['business-rule', 'client-script', 'test-plan', 'app', 'flow', 'portal', 'uib', 'catalog', 'rest-api'] },
      { icon: '⚡', label: 'Operations', items: ['triage', 'deploy', 'risk'] },
      { icon: '📄', label: 'Documentation', items: ['app', 'release', 'runbook', 'script'] },
    ];
    for (const cat of capCategories) {
      const cmds = cat.items.map(i => brand('/' + cat.label.split(' ')[0].toLowerCase() + '-' + i)).join(dim(', '));
      console.log(`    ${cat.icon} ${white(cat.label)}: ${cmds}`);
    }
    console.log('');
    console.log(dim('  Run any capability with: ') + brand('npx nowaikit run <capability>'));
    console.log(dim('  Supports: markdown, ') + accent('PDF (branded)') + dim(', ') + accent('PPTX (slide deck)') + dim(' output'));
    console.log(dim('  Generate reports:      ') + brand('npx nowaikit report scan-health --format pdf'));
    console.log(dim('  Supports: ') + accent('Anthropic') + dim(', ') + accent('OpenAI') + dim(', ') + accent('Ollama') + dim(' (BYOK — bring your own key)'));
    console.log('');

    const showMoreCaps = await confirm({
      message: brand('?') + ' Would you like to list all 26 capabilities in detail' + brand('?'),
      default: false,
    });

    if (showMoreCaps) {
      console.log('');
      try {
        const { getCapabilityMeta } = await import('../prompts/index.js');
        const caps = getCapabilityMeta();
        for (const c of caps) {
          console.log(`    ${brand('/' + c.name.padEnd(24))} ${dim(c.description)}`);
        }
      } catch {
        console.log(dim('  (Capability metadata not available — run ') + brand('npx nowaikit capabilities') + dim(' to see the full list)'));
      }
      console.log('');
    }
  } else {
    console.log(`  ${dim('▸')} ${dim('Apex AI Skills disabled — 26 capabilities not loaded.')}`);
    console.log('');
  }

  // ─── Step 9: Prompts, Shortcuts & Resources ────────────────────────────────
  step(9, 'Prompts, Shortcuts & Resources');

  console.log(`  ${accent('▸')} ${white('Slash Commands')} ${dim('(type / in your AI client)')}`);
  console.log('');
  const commands = [
    ['/morning-standup',  'Daily briefing: P1s, SLA breaches, changes'],
    ['/my-tickets',       'All open work assigned to you'],
    ['/p1-alerts',        'Active Priority 1 incidents'],
    ['/my-changes',       'Pending change requests'],
    ['/knowledge-search', 'Search knowledge base'],
    ['/create-incident',  'Guided incident creation'],
    ['/sla-breaches',     'Records breaching SLA'],
    ['/ci-health',        'CMDB CI health check'],
    ['/run-atf',          'Trigger ATF test suite'],
    ['/switch-instance',  'Switch to different instance'],
    ['/deploy-updateset', 'Preview and commit update set'],
  ];
  for (const [cmd, desc] of commands) {
    console.log(`    ${brand(cmd.padEnd(22))} ${dim(desc)}`);
  }

  console.log('');
  console.log(`  ${accent('▸')} ${white('@ Mentions')} ${dim('(type @ to reference live data)')}`);
  console.log('');
  const resources = [
    ['@my-incidents',  'Open incidents assigned to you'],
    ['@open-changes',  'Change requests pending approval'],
    ['@sla-breaches',  'Records breaching SLA'],
    ['@instance:info', 'Current instance metadata'],
    ['@ci:{name}',     'CMDB CI lookup (e.g. @ci:web-prod-01)'],
    ['@kb:{title}',    'KB article search (e.g. @kb:VPN-setup)'],
  ];
  for (const [res, desc] of resources) {
    console.log(`    ${accent(res.padEnd(22))} ${dim(desc)}`);
  }

  console.log('');
  console.log(`  ${dim('Custom commands:')} create a ${brand('nowaikit.commands.json')} ${dim('in your project root.')}`);
  console.log('');

  // ─── Save instance ────────────────────────────────────────────────────────
  const instance: InstanceConfig = {
    name: instanceName.toLowerCase(),
    instanceUrl,
    authMethod,
    username,
    password: userPassword,
    clientId,
    clientSecret,
    authMode,
    writeEnabled,
    scriptingEnabled,
    cmdbWriteEnabled,
    atfEnabled,
    toolPackage,
    nowAssistEnabled,
    integrationMode,
    mcpEnabled,
    sdkEnabled,
    apexEnabled,
    aiProvider,
    aiModel,
    aiApiKey,
    aiBaseUrl,
    group: group || undefined,
    environment,
    addedAt: new Date().toISOString(),
  };

  addInstance(instance);

  box([
    success(`✓ Instance "${instance.name}" saved`),
    dim(`  ~/.config/nowaikit/instances.json`),
  ], success);

  // ─── Step 10: AI Client Installation ──────────────────────────────────────
  step(10, 'Install into AI Client(s)');

  // SDK-only mode: skip MCP client configuration
  if (!mcpEnabled) {
    console.log(`  ${dim('Skipping AI client installation — MCP Server not enabled.')}`);
    console.log('');
    box([
      white('SDK / Apex mode — no MCP client needed'),
      '',
      dim('  Use NowAIKit directly in your code:'),
      brand("    import { ServiceNowClient } from 'nowaikit/sdk';"),
      '',
      dim('  Or run capabilities from the terminal:'),
      brand('    npx nowaikit run scan-health'),
    ]);
    await ensureGlobalCommand();
    await runAutoConfiguration(instance, mcpEnabled, sdkEnabled, []);
    printSummary(instance);
    return;
  }

  const clients = detectClients();
  const detected = clients.filter(c => c.detected);
  const notDetected = clients.filter(c => !c.detected);

  if (detected.length === 0) {
    console.log(warn('  No AI clients detected. Generating .env file instead.'));
    const dotenvClient = clients.find(c => c.id === 'dotenv')!;
    const result = writeClientConfig(dotenvClient, instance);
    console.log(result.success ? success(`  ✓ ${result.message}`) : err(`  ✗ ${result.message}`));
    await ensureGlobalCommand();
    await runAutoConfiguration(instance, mcpEnabled, sdkEnabled, []);
    printSummary(instance);
    return;
  }

  sectionLabel('Detected AI clients on this machine');
  console.log('');
  detected.forEach(c => console.log(`    ${success('✓')} ${white(c.name)}`));
  if (notDetected.length > 0) {
    notDetected
      .filter(c => c.id !== 'dotenv')
      .forEach(c => console.log(`    ${dim('✗')} ${dim(c.name)}`));
  }
  console.log('');

  const chosen = await checkbox<string>({
    message: brand('?') + ' Install into ' + dim('(space to select, enter to confirm)') + brand(':'),
    choices: detected.map(c => ({ name: c.name, value: c.id, checked: c.id !== 'dotenv' })),
  });

  if (chosen.length === 0) {
    console.log(warn('\n  No clients selected. Nothing written.'));
    await ensureGlobalCommand();
    await runAutoConfiguration(instance, mcpEnabled, sdkEnabled, []);
    printSummary(instance);
    return;
  }

  console.log('');
  for (const id of chosen) {
    const client = clients.find(c => c.id === id);
    if (!client) continue;
    const result = writeClientConfig(client, instance);
    if (result.success) {
      console.log(`  ${success('✓')} ${white(client.name)}: ${dim(result.message)}`);
      if (client.note) console.log(`    ${dim('→')} ${subtle(client.note)}`);
    } else {
      console.log(`  ${err('✗')} ${white(client.name)}: ${err(result.message)}`);
    }
  }

  await ensureGlobalCommand();
  await runAutoConfiguration(instance, mcpEnabled, sdkEnabled, chosen);
  printSummary(instance);
}

// ─── Step 11: Auto-Configuration ──────────────────────────────────────────────
async function runAutoConfiguration(
  instance: InstanceConfig,
  mcpEnabled: boolean,
  sdkEnabled: boolean,
  chosenClientIds: string[]
): Promise<void> {
  step(11, 'Auto-Configuration');

  // npm link (already handled by ensureGlobalCommand, but we surface it here)
  console.log(`  ${accent('▸')} ${white('Global command')} ${dim('— already handled by npm link above')}`);
  console.log('');

  // MCP: detect ALL clients and offer to configure any that weren't already chosen
  if (mcpEnabled) {
    const clients = detectClients();
    const allDetected = clients.filter(c => c.detected && c.id !== 'dotenv');
    const unconfigured = allDetected.filter(c => !chosenClientIds.includes(c.id));

    if (unconfigured.length > 0) {
      console.log(`  ${accent('▸')} ${white('Additional AI clients found')}`);
      console.log('');
      unconfigured.forEach(c => console.log(`    ${warn('○')} ${white(c.name)} ${dim('— not yet configured')}`));
      console.log('');

      const configureAll = await confirm({
        message: brand('?') + ' Auto-configure these additional clients too' + brand('?'),
        default: false,
      });

      if (configureAll) {
        console.log('');
        for (const client of unconfigured) {
          const result = writeClientConfig(client, instance);
          console.log(result.success
            ? `  ${success('✓')} ${white(client.name)}: ${dim(result.message)}`
            : `  ${err('✗')} ${white(client.name)}: ${err(result.message)}`
          );
        }
      }
    } else {
      console.log(`  ${success('✓')} All detected AI clients are already configured`);
    }
    console.log('');
  }

  // SDK: create starter nowaikit-example.ts in cwd
  if (sdkEnabled) {
    const examplePath = path.join(process.cwd(), 'nowaikit-example.ts');

    if (existsSync(examplePath)) {
      console.log(`  ${dim('→')} ${dim('Starter file already exists:')} ${accent(examplePath)}`);
    } else {
      const shouldCreate = await confirm({
        message: brand('?') + ' Create a starter ' + brand('nowaikit-example.ts') + ' in the current directory' + brand('?'),
        default: true,
      });

      if (shouldCreate) {
        const instanceUrl = instance.instanceUrl;
        const starter = [
          `/**`,
          ` * NowAIKit SDK — starter example`,
          ` * Generated by \`nowaikit setup\``,
          ` *`,
          ` * Docs: https://nowaikit.com/docs/sdk`,
          ` */`,
          `import { ServiceNowClient } from 'nowaikit/sdk';`,
          ``,
          `const client = new ServiceNowClient({`,
          `  instanceUrl: '${instanceUrl}',`,
          `  authMethod: '${instance.authMethod}',`,
          instance.authMethod === 'basic'
            ? `  basic: { username: process.env.SN_USERNAME!, password: process.env.SN_PASSWORD! },`
            : `  oauth: { clientId: process.env.SN_CLIENT_ID!, clientSecret: process.env.SN_CLIENT_SECRET!, username: process.env.SN_USERNAME!, password: process.env.SN_PASSWORD! },`,
          `});`,
          ``,
          `// Query open P1 incidents`,
          `const incidents = await client.queryRecords({`,
          `  table: 'incident',`,
          `  query: 'priority=1^state!=6',`,
          `  fields: 'number,short_description,assigned_to,state',`,
          `  limit: 10,`,
          `});`,
          ``,
          `console.log('Open P1 incidents:', incidents.records);`,
          ``,
          `// Create an incident`,
          `const newIncident = await client.createRecord('incident', {`,
          `  short_description: 'Test incident from NowAIKit SDK',`,
          `  priority: '3',`,
          `  category: 'software',`,
          `});`,
          ``,
          `console.log('Created incident:', newIncident.sys_id);`,
        ].join('\n');

        writeFileSync(examplePath, starter, 'utf8');
        console.log(`  ${success('✓')} Created starter file: ${accent(examplePath)}`);
      }
    }
    console.log('');
  }

  // Getting Started summary
  console.log(`  ${accent('▸')} ${white('Getting Started')}`);
  console.log('');
  if (mcpEnabled) {
    console.log(`    ${brand('1.')} Restart your AI client (Claude Desktop, Cursor, etc.)`);
    console.log(`    ${brand('2.')} Ask: ${accent('"List my 5 most recent open incidents"')}`);
    console.log(`    ${brand('3.')} Try a slash command: ${accent('/morning-standup')}`);
  } else if (sdkEnabled) {
    console.log(`    ${brand('1.')} Install dependencies: ${accent('npm install nowaikit')}`);
    console.log(`    ${brand('2.')} Run the example: ${accent('npx tsx nowaikit-example.ts')}`);
    console.log(`    ${brand('3.')} Explore capabilities: ${accent('npx nowaikit caps')}`);
  } else {
    console.log(`    ${brand('1.')} Explore capabilities: ${accent('npx nowaikit caps')}`);
    console.log(`    ${brand('2.')} Run a capability: ${accent('npx nowaikit run scan-health')}`);
    console.log(`    ${brand('3.')} See all commands: ${accent('npx nowaikit shortcuts')}`);
  }
  console.log('');
}

// ─── Final summary ──────────────────────────────────────────────────────────
function printSummary(instance: InstanceConfig): void {
  console.log('');
  divider();
  console.log('');

  console.log(teal.bold('  ███╗  ██╗ ██████╗ ██╗    ██╗') + '   ' + gray(' █████╗ ██╗') + '   ' + teal.bold('██╗  ██╗██╗████████╗'));
  console.log(teal.bold('  ████╗ ██║██╔═══██╗██║    ██║') + '   ' + gray('██╔══██╗██║') + '   ' + teal.bold('██║ ██╔╝██║╚══██╔══╝'));
  console.log(teal.bold('  ██╔██╗██║██║   ██║██║ █╗ ██║') + '   ' + gray('███████║██║') + '   ' + teal.bold('█████╔╝ ██║   ██║'));
  console.log(teal.bold('  ██║╚████║██║   ██║██║███╗██║') + '   ' + gray('██╔══██║██║') + '   ' + teal.bold('██╔═██╗ ██║   ██║'));
  console.log(teal.bold('  ██║ ╚███║╚██████╔╝╚███╔███╔╝') + '   ' + gray('██║  ██║██║') + '   ' + teal.bold('██║  ██╗██║   ██║'));
  console.log(teal.bold('  ╚═╝  ╚══╝ ╚═════╝  ╚══╝╚══╝') + '   ' + gray('╚═╝  ╚═╝╚═╝') + '   ' + teal.bold('╚═╝  ╚═╝╚═╝   ╚═╝') + '  ' + teal('✦'));
  console.log('');

  box([
    success('  Setup Complete!'),
    '',
    `${dim('  Instance:')}   ${accent(instance.instanceUrl)}`,
    `${dim('  Name:')}       ${white(instance.name)}`,
    ...(instance.environment ? [`${dim('  Env:')}        ${white(instance.environment)}`] : []),
    ...(instance.group       ? [`${dim('  Group:')}      ${white(instance.group)}`] : []),
    `${dim('  Tools:')}      ${white(instance.toolPackage || 'full')}`,
    `${dim('  Write:')}      ${instance.writeEnabled ? success('enabled') : dim('disabled')}`,
    ...(instance.scriptingEnabled ? [`${dim('  Scripting:')}  ${success('enabled')}`] : []),
    ...(instance.cmdbWriteEnabled ? [`${dim('  CMDB Write:')} ${success('enabled')}`] : []),
    ...(instance.atfEnabled       ? [`${dim('  ATF:')}        ${success('enabled')}`] : []),
    `${dim('  NowAssist:')}  ${instance.nowAssistEnabled ? success('enabled') : dim('disabled')}`,
    `${dim('  MCP:')}        ${instance.mcpEnabled !== false ? success('enabled') : dim('disabled')}`,
    `${dim('  SDK:')}        ${instance.sdkEnabled ? success('enabled') : dim('disabled')}`,
    `${dim('  Apex:')}       ${instance.apexEnabled !== false ? success('enabled') : dim('disabled')}`,
    ...(instance.aiProvider ? [`${dim('  AI:')}         ${success(instance.aiProvider)}${instance.aiModel ? dim(' / ' + instance.aiModel) : ''}`] : []),
  ], brand);

  // ── What's Next ──────────────────────────────────────────────────────────
  console.log('');
  console.log(`  ${accent('▸')} ${white("What's Next")} ${dim('— 3 recommended first actions:')}`);
  console.log('');

  if (instance.mcpEnabled !== false) {
    console.log(`    ${brand('1.')} ${white('Restart your AI client')} ${dim('so it picks up the new MCP server config')}`);
    console.log(`    ${brand('2.')} ${white('Ask your AI')} ${dim('→')} ${accent('"Show me my open P1 incidents"')}`);
    console.log(`    ${brand('3.')} ${white('Try a slash command')} ${dim('→')} ${accent('/morning-standup')}`);
  } else if (instance.sdkEnabled) {
    console.log(`    ${brand('1.')} ${white('Install')} ${dim('→')} ${accent('npm install nowaikit')}`);
    console.log(`    ${brand('2.')} ${white('Run the starter')} ${dim('→')} ${accent('npx tsx nowaikit-example.ts')}`);
    console.log(`    ${brand('3.')} ${white('Explore capabilities')} ${dim('→')} ${accent('nowaikit caps')}`);
  } else {
    console.log(`    ${brand('1.')} ${white('Explore capabilities')} ${dim('→')} ${accent('nowaikit caps')}`);
    console.log(`    ${brand('2.')} ${white('Run a capability')} ${dim('→')} ${accent('nowaikit run scan-health')}`);
    console.log(`    ${brand('3.')} ${white('See all shortcuts')} ${dim('→')} ${accent('nowaikit shortcuts')}`);
  }

  console.log('');
  console.log(`  ${accent('▸')} ${white('Power Tools')} ${dim('(available to your AI automatically):')}`);
  console.log('');
  console.log(`    ${brand('fluent_query')}          ${dim('Structured queries — no scripts needed')}`);
  console.log(`    ${brand('batch_request')}         ${dim('Up to 50 API calls in one request')}`);
  if (instance.scriptingEnabled) {
    console.log(`    ${brand('execute_script')}        ${dim('Run server-side JS on your instance')}`);
  }
  console.log('');

  if (instance.sdkEnabled) {
    console.log(`  ${accent('▸')} ${white('SDK Mode')} ${dim('(import in your TypeScript/JavaScript code):')}`);
    console.log('');
    console.log(`    ${brand("import { ServiceNowClient } from 'nowaikit/sdk';")} `);
    console.log(`    ${brand("import { executeDirectly } from 'nowaikit/sdk';")} `);
    console.log(`    ${brand("import { ServiceNowClient } from 'nowaikit/client';")} ${dim('// just the client')}`);
    console.log('');
  }

  console.log(`  ${accent('▸')} ${white('Direct Mode')} ${dim('(run capabilities from terminal — no MCP client):')}`);
  console.log('');
  console.log(`    ${brand('npx nowaikit capabilities')}    ${dim('List all 26 capabilities')}`);
  console.log(`    ${brand('npx nowaikit run scan-health')} ${dim('Run a capability directly')}`);
  console.log(`    ${brand('npx nowaikit report scan-health')} ${dim('Generate branded PDF report')}`);
  console.log(`    ${brand('nowaikit shortcuts')}           ${dim('Show all commands & keyboard shortcuts')}`);
  console.log('');

  console.log(`  ${accent('▸')} ${white('Manage from the terminal:')}`);
  console.log('');
  console.log(`    ${brand('nowaikit setup --add')}         ${dim('Add another instance')}`);
  console.log(`    ${brand('nowaikit instances list')}      ${dim('Show configured instances')}`);
  console.log(`    ${brand('nowaikit instances remove')}    ${dim('Remove an instance')}`);
  console.log(`    ${brand('nowaikit web')}                 ${dim('Open web dashboard')}`);
  if (instance.authMode === 'per-user') {
    console.log(`    ${brand('nowaikit auth login')}          ${dim('Authenticate as yourself')}`);
  }

  console.log('');
  divider();
  console.log('');
}
