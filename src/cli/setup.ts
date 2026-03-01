/**
 * Interactive setup wizard — `servicenow-mcp setup`
 *
 * Walks the user through:
 *   1. ServiceNow instance
 *   2. Auth method (Basic / OAuth)
 *   3. Credentials
 *   4. Connection test
 *   5. Permission tier / tool package
 *   6. Features & shortcuts overview
 *   7. AI client installation
 */
import { input, password, select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { addInstance, loadConfig } from './config-store.js';
import { detectClients } from './detect-clients.js';
import { writeClientConfig } from './writers/index.js';
import type { InstanceConfig } from './config-store.js';

// ─── Brand colors (teal/navy palette) ────────────────────────────────────────
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
const dim     = chalk.gray;                  // terminal-adaptive dim text
const white   = chalk.bold;                  // terminal-adaptive primary text (works on light + dark)
const subtle  = chalk.dim;                   // terminal-adaptive secondary text

const TOTAL_STEPS = 7;

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
  return white('ServiceNow ') + teal.bold('MCP');
}

function banner(): void {
  console.log('');
  console.log(bright('  ╔═╗') + teal('╔╗╔') + dim('  ') + teal('╔╦╗') + bright('╔═╗') + teal('╔═╗'));
  console.log(teal('  ╚═╗') + navy('║║║') + dim('  ') + navy(' ║ ') + teal('║║║') + navy('╠═╝'));
  console.log(navy('  ╚═╝') + teal('╝╚╝') + dim('  ') + teal(' ╩ ') + navy('╩ ╩') + teal('╩  ') + dim('  ') + teal('✦'));
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
 * Ensures the `servicenow-mcp` binary is available on PATH by running `npm link`
 * in the package root. Skips silently if it's already linked.
 */
async function ensureGlobalCommand(): Promise<void> {
  if (isCommandAvailable('servicenow-mcp')) return;

  const spinner = ora({
    text: dim('  Making `servicenow-mcp` available as a global command…'),
    color: 'cyan',
  }).start();

  const pkgRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');

  try {
    execSync('npm link', { cwd: pkgRoot, stdio: 'pipe' });
    spinner.succeed(success('  `servicenow-mcp` is now available as a global command'));
  } catch {
    try {
      const prefix = execSync('npm config get prefix', { encoding: 'utf8', stdio: 'pipe' }).trim();
      execSync('npm link', {
        cwd: pkgRoot,
        stdio: 'pipe',
        env: { ...process.env, npm_config_prefix: prefix },
      });
      spinner.succeed(success('  `servicenow-mcp` linked via npm prefix'));
    } catch {
      spinner.warn(warn('  Could not link globally — permission denied'));
      console.log('');
      console.log(dim('  Fix options (choose one):'));
      console.log(brand('    sudo npm link')                    + dim('              # if using system Node'));
      console.log(brand('    npm install -g @aartiq/servicenow-mcp')    + dim('   # install from npm registry'));
      console.log(brand('    npx @aartiq/servicenow-mcp instances list') + dim(' # use npx instead'));
    }
  }
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

  const instanceId = await input({
    message: brand('?') + ' Instance name ' + dim('(e.g. acme, dev12345)') + brand(':'),
    validate: (v: string) => {
      if (!v.trim()) return 'Instance name is required';
      if (/\s/.test(v)) return 'No spaces allowed';
      return true;
    },
  });

  let instanceUrl: string;
  let trimmed = instanceId.trim().toLowerCase();
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
      dim('Run `servicenow-mcp auth login` separately for each user.'),
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
    const action = await select<'retry' | 'creds' | 'save' | 'cancel'>({
      message: warn('?') + ' What would you like to do?' + brand(':'),
      choices: [
        { name: `${brand('↻')} Retry connection`,                          value: 'retry' },
        { name: `${accent('✏')} Re-enter credentials`,                     value: 'creds' },
        { name: `${subtle('💾')} Save config anyway ${dim('(fix later)')}`, value: 'save' },
        { name: `${err('✕')} Cancel setup`,                                value: 'cancel' },
      ],
    });

    if (action === 'cancel') {
      console.log('');
      box([err('Setup cancelled.')], err);
      console.log('');
      return;
    }
    if (action === 'save') break;
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
    message: brand('?') + ' Enable write operations ' + dim('(create/update/delete)') + brand('?'),
    default: false,
  });

  const nowAssistEnabled = await confirm({
    message: brand('?') + ' Enable Now Assist / AI features' + brand('?'),
    default: false,
  });

  // ─── Step 6: Features & Shortcuts ─────────────────────────────────────────
  step(6, 'Features & Shortcuts');

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
  console.log(`  ${dim('Custom commands:')} create a ${brand('servicenow-mcp.commands.json')} ${dim('in your project root.')}`);
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
    toolPackage,
    nowAssistEnabled,
    group: group || undefined,
    environment,
    addedAt: new Date().toISOString(),
  };

  addInstance(instance);

  box([
    success(`✓ Instance "${instance.name}" saved`),
    dim(`  ~/.config/servicenow-mcp/instances.json`),
  ], success);

  // ─── Step 7: AI Client Installation ───────────────────────────────────────
  step(7, 'Install into AI Client(s)');

  const clients = detectClients();
  const detected = clients.filter(c => c.detected);
  const notDetected = clients.filter(c => !c.detected);

  if (detected.length === 0) {
    console.log(warn('  No AI clients detected. Generating .env file instead.'));
    const dotenvClient = clients.find(c => c.id === 'dotenv')!;
    const result = writeClientConfig(dotenvClient, instance);
    console.log(result.success ? success(`  ✓ ${result.message}`) : err(`  ✗ ${result.message}`));
    await ensureGlobalCommand();
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
  printSummary(instance);
}

// ─── Final summary ──────────────────────────────────────────────────────────
function printSummary(instance: InstanceConfig): void {
  console.log('');
  divider();
  console.log('');

  console.log(bright('  ╔═╗') + teal('╔╗╔') + dim('  ') + teal('╔╦╗') + bright('╔═╗') + teal('╔═╗'));
  console.log(teal('  ╚═╗') + navy('║║║') + dim('  ') + navy(' ║ ') + teal('║║║') + navy('╠═╝'));
  console.log(navy('  ╚═╝') + teal('╝╚╝') + dim('  ') + teal(' ╩ ') + navy('╩ ╩') + teal('╩  ') + dim('  ') + teal('✦'));
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
    `${dim('  NowAssist:')}  ${instance.nowAssistEnabled ? success('enabled') : dim('disabled')}`,
  ], brand);

  console.log('');
  console.log(`  ${accent('▸')} ${white('Get started — restart your AI client, then try:')}`);
  console.log('');
  console.log(`    ${brand('❯')} ${white('List my 5 most recent open incidents')}`);
  console.log(`    ${brand('❯')} ${accent('/morning-standup')}`);
  console.log(`    ${brand('❯')} ${accent('@my-incidents')}`);

  console.log('');
  console.log(`  ${accent('▸')} ${white('Manage from the terminal:')}`);
  console.log('');
  console.log(`    ${brand('servicenow-mcp setup --add')}         ${dim('Add another instance')}`);
  console.log(`    ${brand('servicenow-mcp instances list')}      ${dim('Show configured instances')}`);
  console.log(`    ${brand('servicenow-mcp instances remove')}    ${dim('Remove an instance')}`);
  if (instance.authMode === 'per-user') {
    console.log(`    ${brand('servicenow-mcp auth login')}          ${dim('Authenticate as yourself')}`);
  }

  console.log('');
  divider();
  console.log('');
}
