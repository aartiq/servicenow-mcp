/**
 * `nowaikit auth` subcommands — per-user OAuth / login management.
 *
 * login  — opens browser to ServiceNow OAuth consent, stores token
 * logout — removes stored token
 * whoami — show which ServiceNow user is currently authenticated
 */
import { input, password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { listInstances } from './config-store.js';

interface UserToken {
  instanceUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  snUser: string;
  snUserSysId: string;
}

interface TokenStore {
  tokens: Record<string, UserToken>;
}

function tokenPath(): string {
  const dir = join(homedir(), '.config', 'nowaikit');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'tokens.json');
}

function loadTokens(): TokenStore {
  const p = tokenPath();
  if (!existsSync(p)) return { tokens: {} };
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as TokenStore;
  } catch {
    return { tokens: {} };
  }
}

function saveTokens(store: TokenStore): void {
  writeFileSync(tokenPath(), JSON.stringify(store, null, 2), 'utf8');
}

function tokenKey(instanceUrl: string): string {
  return instanceUrl.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_');
}

export async function authLogin(): Promise<void> {
  const instances = listInstances();
  if (instances.length === 0) {
    console.log(chalk.yellow('No instances configured. Run `nowaikit setup` first.'));
    return;
  }

  const instanceUrl = instances.length === 1
    ? instances[0]!.instanceUrl
    : await select<string>({
        message: 'Choose instance to authenticate against:',
        choices: instances.map(i => ({ name: `${i.name} (${i.instanceUrl})`, value: i.instanceUrl })),
      });

  const instance = instances.find(i => i.instanceUrl === instanceUrl);
  if (!instance) return;

  console.log('');
  console.log(chalk.bold('Per-user OAuth login'));
  console.log(chalk.dim('Your queries will run in your own ServiceNow permission context.'));
  console.log('');

  if (instance.authMethod === 'oauth' && instance.clientId) {
    // OAuth Authorization Code flow — open browser
    const authUrl =
      `${instanceUrl}/oauth_auth.do` +
      `?response_type=code&client_id=${instance.clientId}` +
      `&redirect_uri=http://localhost:8765/callback`;

    console.log(chalk.cyan('Open this URL in your browser to authenticate:'));
    console.log(chalk.underline(authUrl));
    console.log('');

    const code = await input({
      message: 'Paste the authorization code from the redirect URL:',
    });

    const spinner = ora('Exchanging authorization code for token…').start();
    try {
      const resp = await fetch(`${instanceUrl}/oauth_token.do`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: instance.clientId,
          client_secret: instance.clientSecret || '',
          code,
          redirect_uri: 'http://localhost:8765/callback',
        }).toString(),
      });

      if (!resp.ok) {
        spinner.fail(chalk.red(`Token exchange failed: ${resp.status} ${resp.statusText}`));
        return;
      }

      const data = await resp.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      // Get the ServiceNow user tied to this token
      const meResp = await fetch(`${instanceUrl}/api/now/table/sys_user?sysparm_query=sys_idINSTANCEOF&sysparm_limit=1`, {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: 'application/json',
        },
      });
      const meData = await meResp.json() as { result?: Array<{ sys_id?: { value: string }; user_name?: { value: string } }> };
      const snUserSysId = meData.result?.[0]?.sys_id?.value || '';
      const snUser = meData.result?.[0]?.user_name?.value || 'unknown';

      const store = loadTokens();
      store.tokens[tokenKey(instanceUrl)] = {
        instanceUrl,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000 * 0.9,
        snUser,
        snUserSysId,
      };
      saveTokens(store);

      spinner.succeed(chalk.green(`Authenticated as ${snUser} on ${instanceUrl}`));
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    }
  } else {
    // Basic auth per-user: prompt credentials, store them
    const username = await input({ message: 'Your ServiceNow username:' });
    const pass = await password({ message: 'Your ServiceNow password:', mask: '•' });

    const spinner = ora('Verifying credentials…').start();
    try {
      const creds = Buffer.from(`${username}:${pass}`).toString('base64');
      const resp = await fetch(
        `${instanceUrl}/api/now/table/sys_user?sysparm_query=user_name=${encodeURIComponent(username)}&sysparm_limit=1`,
        { headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' } }
      );
      if (!resp.ok) {
        spinner.fail(chalk.red(`Auth failed: ${resp.status} ${resp.statusText}`));
        return;
      }
      const data = await resp.json() as { result?: Array<{ sys_id?: { value: string }; user_name?: { value: string } }> };
      const snUserSysId = data.result?.[0]?.sys_id?.value || '';

      const store = loadTokens();
      store.tokens[tokenKey(instanceUrl)] = {
        instanceUrl,
        accessToken: creds,
        refreshToken: '',
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // basic auth doesn't expire
        snUser: username,
        snUserSysId,
      };
      saveTokens(store);

      spinner.succeed(chalk.green(`Saved credentials for ${username} on ${instanceUrl}`));
    } catch (err) {
      spinner.fail(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
}

export function authLogout(instanceUrl?: string): void {
  const store = loadTokens();
  if (instanceUrl) {
    const key = tokenKey(instanceUrl);
    if (store.tokens[key]) {
      delete store.tokens[key];
      saveTokens(store);
      console.log(chalk.green(`Logged out from ${instanceUrl}`));
    } else {
      console.log(chalk.yellow(`No token found for ${instanceUrl}`));
    }
  } else {
    store.tokens = {};
    saveTokens(store);
    console.log(chalk.green('Logged out from all instances'));
  }
}

export function authWhoami(): void {
  const store = loadTokens();
  const tokens = Object.values(store.tokens);
  if (tokens.length === 0) {
    console.log(chalk.dim('Not authenticated. Run `nowaikit auth login`'));
    return;
  }
  for (const t of tokens) {
    const expired = Date.now() > t.expiresAt;
    const status = expired ? chalk.red('(expired)') : chalk.green('(active)');
    console.log(`  ${t.instanceUrl} → ${chalk.bold(t.snUser)} ${status}`);
  }
}

export function getStoredToken(instanceUrl: string): UserToken | undefined {
  const store = loadTokens();
  return store.tokens[tokenKey(instanceUrl)];
}
