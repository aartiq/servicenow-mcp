#!/usr/bin/env node
/**
 * nowaikit CLI entry point.
 *
 * Commands:
 *   nowaikit setup [--add]   — interactive setup wizard
 *   nowaikit web             — start the web dashboard in your browser
 *   nowaikit auth login      — per-user OAuth login
 *   nowaikit auth logout     — remove stored token
 *   nowaikit auth whoami     — show current authenticated user
 *   nowaikit instances list  — list configured instances
 *   nowaikit instances remove <name>  — remove an instance
 *   nowaikit capabilities    — list all 26 Apex capabilities
 *   nowaikit run <capability> — run a capability in direct mode (BYOK)
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { runSetup } from './setup.js';
import { authLogin, authLogout, authWhoami } from './auth.js';
import { listInstances, removeInstance, getDefaultInstance, loadConfig } from './config-store.js';

// Read version from package.json so it stays in sync
const __cliDir = path.dirname(fileURLToPath(import.meta.url));
const __pkgJson = JSON.parse(readFileSync(path.resolve(__cliDir, '..', '..', 'package.json'), 'utf8'));
const CLI_VERSION: string = __pkgJson.version;
import { runShortcuts } from './shortcuts.js';

// Brand colors (matches nowaitkit.com — teal/navy palette)
// Terminal-adaptive: white/subtle/dim use chalk built-ins so text stays visible
// on both dark and light (bright-white) terminal backgrounds.
const teal    = chalk.hex('#00D4AA');
const navy    = chalk.hex('#0F4C81');
const bright  = chalk.hex('#00B899');
const dim     = chalk.gray;
const white   = chalk.bold;
const subtle  = chalk.dim;
const gray    = chalk.hex('#8B949E');
const success = chalk.hex('#10B981');
const err     = chalk.hex('#E8466A');

function logoText(): string {
  return white('Now') + teal.bold('AI') + white('Kit');
}

function cliBanner(): void {
  console.log('');
  console.log(teal.bold('  ███╗  ██╗ ██████╗ ██╗    ██╗') + '   ' + gray(' █████╗ ██╗') + '   ' + teal.bold('██╗  ██╗██╗████████╗'));
  console.log(teal.bold('  ████╗ ██║██╔═══██╗██║    ██║') + '   ' + gray('██╔══██╗██║') + '   ' + teal.bold('██║ ██╔╝██║╚══██╔══╝'));
  console.log(teal.bold('  ██╔██╗██║██║   ██║██║ █╗ ██║') + '   ' + gray('███████║██║') + '   ' + teal.bold('█████╔╝ ██║   ██║'));
  console.log(teal.bold('  ██║╚████║██║   ██║██║███╗██║') + '   ' + gray('██╔══██║██║') + '   ' + teal.bold('██╔═██╗ ██║   ██║'));
  console.log(teal.bold('  ██║ ╚███║╚██████╔╝╚███╔███╔╝') + '   ' + gray('██║  ██║██║') + '   ' + teal.bold('██║  ██╗██║   ██║'));
  console.log(teal.bold('  ╚═╝  ╚══╝ ╚═════╝  ╚══╝╚══╝') + '   ' + gray('╚═╝  ╚═╝╚═╝') + '   ' + teal.bold('╚═╝  ╚═╝╚═╝   ╚═╝') + '  ' + teal('✦'));
  console.log('');
  console.log(`  ${logoText()}  ${dim('—')} ${subtle('The #1 AI App for ServiceNow')}`);
  console.log(dim('  Connect ') + teal.bold('Any AI') + dim(' to ServiceNow. Instantly.'));
  console.log('');
}

/** Non-blocking update check — prints a notice if a newer version exists on npm. */
async function checkForUpdate(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://registry.npmjs.org/nowaikit/latest', {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return;
    const data = await res.json() as { version?: string };
    const latest = data.version;
    if (!latest || latest === CLI_VERSION) return;

    // Simple semver comparison: split into parts and compare numerically
    const cur = CLI_VERSION.split('.').map(Number);
    const lat = latest.split('.').map(Number);
    const isNewer = lat[0] > cur[0]
      || (lat[0] === cur[0] && lat[1] > cur[1])
      || (lat[0] === cur[0] && lat[1] === cur[1] && lat[2] > cur[2]);
    if (!isNewer) return;

    console.log('');
    console.log(chalk.hex('#FF6B35')(`  ⬆  Update available: ${CLI_VERSION} → ${latest}`));
    console.log(dim(`     Run ${teal('npx nowaikit@latest')} to update`));
    console.log('');
  } catch {
    // Network error, timeout, offline — skip silently
  }
}

// Fire update check in background (non-blocking — doesn't delay CLI startup)
const updateCheckPromise = checkForUpdate();

const program = new Command();

program
  .name('nowaikit')
  .description('The Most Comprehensive ServiceNow AI Toolkit')
  .version(CLI_VERSION)
  .addHelpText('before', '')
  .addHelpText('beforeAll', () => {
    cliBanner();
    return '';
  });

// ─── setup ────────────────────────────────────────────────────────────────────
program
  .command('setup')
  .description('Interactive setup wizard — connect to ServiceNow and your AI client')
  .option('--add', 'Add another instance without overwriting existing config')
  .action(async (opts: { add?: boolean }) => {
    await runSetup({ add: opts.add });
  });

// ─── auth ─────────────────────────────────────────────────────────────────────
const auth = program.command('auth').description('Per-user authentication management');

auth
  .command('login')
  .description('Authenticate as yourself — queries run in your own ServiceNow permission context')
  .action(async () => {
    await authLogin();
  });

auth
  .command('logout [instanceUrl]')
  .description('Remove stored authentication token')
  .action((instanceUrl?: string) => {
    authLogout(instanceUrl);
  });

auth
  .command('whoami')
  .description('Show which ServiceNow user is currently authenticated')
  .action(() => {
    authWhoami();
  });

// ─── instances ────────────────────────────────────────────────────────────────
const instances = program.command('instances').description('Manage configured ServiceNow instances');

instances
  .command('list')
  .description('List all configured instances')
  .action(() => {
    const list = listInstances();
    if (list.length === 0) {
      console.log('');
      console.log(dim('  No instances configured. Run ') + teal('nowaikit setup') + dim(' to add one.'));
      console.log('');
      return;
    }
    console.log('');
    console.log(dim('  ' + '─'.repeat(60)));
    console.log(`  ${dim('NAME'.padEnd(16))} ${dim('URL'.padEnd(36))} ${dim('AUTH')}`);
    console.log(dim('  ' + '─'.repeat(60)));
    for (const inst of list) {
      const envBadge = inst.environment
        ? (inst.environment === 'production'  ? err(' PROD ')
          : inst.environment === 'development' ? success(' DEV  ')
          : inst.environment === 'test'        ? chalk.hex('#FF6B35')(' TEST ')
          : inst.environment === 'staging'     ? navy(' STG  ')
          : dim(' PDI  '))
        : '';
      console.log(
        `  ${teal(inst.name.padEnd(16))} ${bright(inst.instanceUrl.padEnd(36))} ${dim(inst.authMethod)}${envBadge ? ' ' + envBadge : ''}`
      );
      if (inst.group) {
        console.log(`  ${' '.repeat(16)} ${dim('group: ' + inst.group)}`);
      }
    }
    console.log(dim('  ' + '─'.repeat(60)));
    console.log('');
  });

instances
  .command('remove <name>')
  .description('Remove a configured instance')
  .action((name: string) => {
    const removed = removeInstance(name);
    if (removed) {
      console.log(`  ${success('✓')} ${white(`Removed instance "${name}"`)}`);
    } else {
      console.log(`  ${err('✗')} ${white(`Instance "${name}" not found`)}`);
    }
  });

// ─── web ──────────────────────────────────────────────────────────────────────
program
  .command('web')
  .description('Start the NowAIKit web dashboard in your browser')
  .option('-p, --port <port>', 'Port to listen on', '4175')
  .option('--host <host>', 'Host to bind to (use 0.0.0.0 for network)', '127.0.0.1')
  .option('--no-open', 'Do not auto-open browser')
  .action((opts: { port: string; host: string; open: boolean }) => {
    // Locate serve.js relative to this CLI file (dist/cli/index.js -> ../../desktop/serve.js)
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgRoot = path.resolve(cliDir, '..', '..');
    const serveJs = path.join(pkgRoot, 'desktop', 'serve.cjs');
    const staticDir = path.join(pkgRoot, 'desktop', 'renderer', 'dist');

    if (!existsSync(serveJs)) {
      console.log('');
      console.log(err('  Web UI server not found.'));
      console.log(dim('  If you installed via npm, make sure you have the latest version:'));
      console.log(teal('    npm install -g nowaikit@latest'));
      console.log('');
      process.exit(1);
    }

    if (!existsSync(staticDir)) {
      console.log('');
      console.log(err('  Web UI assets not found.'));
      console.log(dim('  The web UI may not have been built. If running from source:'));
      console.log(teal('    cd desktop && npm install && npm run build:web'));
      console.log('');
      process.exit(1);
    }

    cliBanner();
    console.log(dim('  Starting web dashboard…'));
    console.log('');

    const child = spawn('node', [serveJs], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: opts.port,
        HOST: opts.host,
      },
    });

    // Auto-open browser after a short delay
    if (opts.open) {
      setTimeout(() => {
        const url = `http://localhost:${opts.port}`;
        try {
          if (process.platform === 'darwin') execSync(`open ${url}`, { stdio: 'ignore' });
          else if (process.platform === 'win32') execSync(`start ${url}`, { stdio: 'ignore' });
          else execSync(`xdg-open ${url}`, { stdio: 'ignore' });
        } catch {
          // Browser open failed silently — user can open manually
        }
      }, 1000);
    }

    child.on('exit', (code) => process.exit(code ?? 0));
  });

// ─── shortcuts ────────────────────────────────────────────────────────────────
program
  .command('shortcuts')
  .description('Show all available commands, slash commands, and keyboard shortcuts')
  .action(() => {
    runShortcuts();
  });

// ─── capabilities ─────────────────────────────────────────────────────────────
program
  .command('capabilities')
  .alias('caps')
  .description('List all 26 capabilities (scan / review / build / ops / docs)')
  .action(async () => {
    cliBanner();
    const { getCapabilityMeta } = await import('../prompts/index.js');
    const caps = getCapabilityMeta();
    const categories = ['scan', 'review', 'build', 'ops', 'docs'] as const;
    const labels: Record<string, string> = {
      scan: 'Scan & Monitor',
      review: 'Review & Audit',
      build: 'Build & Generate',
      ops: 'Operations',
      docs: 'Documentation',
    };

    for (const cat of categories) {
      const group = caps.filter(c => c.category === cat);
      if (group.length === 0) continue;
      console.log(white(`  ${labels[cat]} (${group.length}):\n`));
      for (const c of group) {
        console.log(`  ${teal('/' + c.name)}`);
        console.log(`  ${dim(c.description)}`);
        console.log('');
      }
    }
    console.log(dim(`  Total: ${caps.length} capabilities\n`));
  });

// ─── run (direct mode) ───────────────────────────────────────────────────────
program
  .command('run <capability>')
  .description('Run a capability in direct mode (no MCP client needed — BYOK)')
  .option('-i, --instance <name>', 'ServiceNow instance name')
  .option('-p, --provider <provider>', 'LLM provider: anthropic, openai, ollama, lmstudio')
  .option('-m, --model <model>', 'LLM model name')
  .option('-k, --api-key <key>', 'LLM API key (or set *_API_KEY env var)')
  .option('-o, --output <file>', 'Write output to file')
  .option('-t, --table <table>', 'Target table name')
  .option('-s, --scope <scope>', 'Application scope or scan scope')
  .option('-f, --focus <focus>', 'Review focus: security, performance, all')
  .option('--format <format>', 'Output format: md (default), pdf, pptx')
  .action(async (
    capability: string,
    options: { instance?: string; provider?: string; model?: string; apiKey?: string; output?: string; table?: string; scope?: string; focus?: string; format?: string }
  ) => {
    cliBanner();

    const ora = (await import('ora')).default;

    // Load stored AI config from instance config (CLI flags override)
    const config = loadConfig();
    const instanceConfig = options.instance
      ? config.instances[options.instance]
      : getDefaultInstance();

    const storedProvider = instanceConfig?.aiProvider;
    const storedModel = instanceConfig?.aiModel;
    const storedApiKey = instanceConfig?.aiApiKey;
    const storedBaseUrl = instanceConfig?.aiBaseUrl;

    // Resolution order: CLI flag > env var > stored config > default
    const provider = (options.provider || process.env.LLM_PROVIDER || storedProvider || 'anthropic') as import('../direct/llm-client.js').LlmProvider;
    const model = options.model || storedModel;
    const apiKey = options.apiKey || storedApiKey;
    const baseUrl = storedBaseUrl;

    // If no provider configured and no env vars set, show helpful guidance
    const localProviders = ['ollama', 'lmstudio'];
    if (!localProviders.includes(provider) && !apiKey && !process.env[`${provider.toUpperCase()}_API_KEY`]) {
      console.log('');
      console.log(err('  AI analysis requires an LLM provider. Options:'));
      console.log('');
      console.log(`    ${teal('1.')} Run ${teal('npx nowaikit setup')} to configure ${dim('(Ollama recommended — free, local)')}`);
      console.log(`    ${teal('2.')} Set ${teal('ANTHROPIC_API_KEY')} or ${teal('OPENAI_API_KEY')} environment variable`);
      console.log(`    ${teal('3.')} Use ${teal('--provider ollama')} for local Ollama ${dim('(no API key needed)')}`);
      console.log('');
      process.exit(1);
    }

    const spinner = ora(`Running ${teal(capability)} in direct mode (${provider})...`).start();

    try {
      const { executeDirectly } = await import('../direct/executor.js');

      const args: Record<string, string> = {};
      if (options.table) args.table = options.table;
      if (options.scope) args.scope = options.scope;
      if (options.focus) args.focus = options.focus;

      const result = await executeDirectly({
        capability,
        args,
        instance: options.instance,
        llmConfig: {
          provider,
          model,
          apiKey,
          baseUrl,
        },
        output: options.output,
      });

      spinner.succeed(`Capability completed (${result.dataGathered} data points gathered)`);

      const reportFormat = options.format?.toLowerCase();
      if (reportFormat === 'pdf' || reportFormat === 'pptx') {
        // Generate branded report
        const reportSpinner = ora(`Generating ${reportFormat.toUpperCase()} report...`).start();
        try {
          const { generateReport } = await import('../reports/index.js');
          const config = loadConfig();
          const instConfig = options.instance
            ? config.instances[options.instance]
            : getDefaultInstance();
          const instName = options.instance || config.defaultInstance || 'instance';

          const reportResult = await generateReport(result.content, reportFormat, {
            title: capability.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            instanceUrl: instConfig?.instanceUrl || '',
            instanceName: instName,
            capability,
            outputDir: options.output ? undefined : undefined,
          });

          // If -o flag specified, use that as output path
          if (options.output) {
            const { renameSync } = await import('fs');
            renameSync(reportResult.filePath, options.output);
            reportSpinner.succeed(`Report saved to ${white(options.output)} (${Math.round(reportResult.sizeBytes / 1024)} KB)`);
          } else {
            reportSpinner.succeed(`Report saved to ${white(reportResult.filePath)} (${Math.round(reportResult.sizeBytes / 1024)} KB)`);
          }
        } catch (reportError) {
          reportSpinner.fail('Report generation failed');
          console.error(err(`\n  ${reportError instanceof Error ? reportError.message : 'Unknown error'}`));
          // Still output the markdown as fallback
          console.log('\n' + result.content);
        }
      } else if (options.output) {
        const { writeFileSync: writeFile } = await import('fs');
        writeFile(options.output, result.content);
        console.log(`\n  ${success('✓')} Output written to ${white(options.output)}`);
      } else {
        console.log('\n' + result.content);
      }

      if (result.usage) {
        console.log(dim(`\n  Model: ${result.model} | Input: ${result.usage.input_tokens} tokens | Output: ${result.usage.output_tokens} tokens`));
      }
    } catch (error) {
      spinner.fail('Execution failed');
      console.error(err(`\n  ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });

// ─── report (convenience alias for run --format) ────────────────────────────
program
  .command('report <capability>')
  .description('Generate a branded report — shortcut for `run <capability> --format pdf`')
  .option('-i, --instance <name>', 'ServiceNow instance name')
  .option('-p, --provider <provider>', 'LLM provider: anthropic, openai, ollama, lmstudio')
  .option('-m, --model <model>', 'LLM model name')
  .option('-k, --api-key <key>', 'LLM API key')
  .option('-o, --output <file>', 'Output file path')
  .option('-t, --table <table>', 'Target table name')
  .option('-s, --scope <scope>', 'Application scope or scan scope')
  .option('--format <format>', 'Output format: pdf (default), pptx', 'pdf')
  .action(async (capability: string, options: any) => {
    // Delegate to `run` with format defaulting to pdf
    const args = ['run', capability];
    if (options.instance) args.push('-i', options.instance);
    if (options.provider) args.push('-p', options.provider);
    if (options.model) args.push('-m', options.model);
    if (options.apiKey) args.push('-k', options.apiKey);
    if (options.output) args.push('-o', options.output);
    if (options.table) args.push('-t', options.table);
    if (options.scope) args.push('-s', options.scope);
    args.push('--format', options.format || 'pdf');
    await program.parseAsync(['node', 'nowaikit', ...args]);
  });

// Await update check (already running in background) then run CLI
updateCheckPromise.finally(() => {
  program.parseAsync(process.argv).catch((e: unknown) => {
    console.error(err('Error:'), e instanceof Error ? e.message : e);
    process.exit(1);
  });
});
