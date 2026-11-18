/**
 * Backward-compatible configuration aliases.
 *
 * Earlier docs and the website taught a few names the server never read (SN_INSTANCE_URL, SN_USERNAME,
 * SN_PASSWORD, SN_OAUTH_*, SN_PERSONA, HTTP_PORT and the --allow-* launch flags). They are accepted here
 * so every documented setup works. The canonical names always win when both are set, so nothing that
 * works today changes behaviour.
 */

type Env = Record<string, string | undefined>;

/** Launch flags an MCP client may pass after `npx nowaikit` / `nowaikit-mcp`. */
const BOOLEAN_FLAGS: Record<string, Record<string, string>> = {
  '--allow-write': { WRITE_ENABLED: 'true' },
  '--allow-cmdb': { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true' },
  '--allow-scripting': { WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true' },
  '--allow-atf': { ATF_ENABLED: 'true' },
  '--allow-agentic': { NOW_ASSIST_ENABLED: 'true' },
  '--allow-now-assist': { NOW_ASSIST_ENABLED: 'true' },
  '--allow-fluent': { FLUENT_ENABLED: 'true' },
  '--allow-all': { WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true', ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'true' },
  '--read-only': { WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false' },
  '--lean': { MCP_TOOL_DISCOVERY: 'lean' },
};

/** Flags that take a value: --persona developer or --persona=developer. */
const VALUE_FLAGS: Record<string, string> = {
  '--persona': 'SN_PERSONA',
  '--package': 'MCP_TOOL_PACKAGE',
  '--instance': 'SN_DEFAULT_INSTANCE',
  '--transport': 'TRANSPORT',
  '--port': 'PORT',
  '--discovery': 'MCP_TOOL_DISCOVERY',
};

/** Persona names used in older docs → MCP_TOOL_PACKAGE. */
export const PERSONA_PACKAGES: Record<string, string> = {
  developer: 'platform_developer',
  platform_developer: 'platform_developer',
  architect: 'platform_developer',
  admin: 'system_administrator',
  administrator: 'system_administrator',
  system_administrator: 'system_administrator',
  itsm: 'service_desk',
  service_desk: 'service_desk',
  agent: 'service_desk',
  change: 'change_coordinator',
  change_coordinator: 'change_coordinator',
  knowledge: 'knowledge_author',
  knowledge_author: 'knowledge_author',
  catalog: 'catalog_builder',
  catalog_builder: 'catalog_builder',
  itom: 'itom_engineer',
  itom_engineer: 'itom_engineer',
  agile: 'agile_manager',
  agile_manager: 'agile_manager',
  ai: 'ai_developer',
  ai_developer: 'ai_developer',
  portal: 'portal_developer',
  portal_developer: 'portal_developer',
  integration: 'integration_engineer',
  integration_engineer: 'integration_engineer',
  devops: 'devops_engineer',
  devops_engineer: 'devops_engineer',
  itam: 'itam_analyst',
  itam_analyst: 'itam_analyst',
  full: 'full',
  msp: 'full',
  hrsd: 'full',
  csm: 'full',
  grc: 'full',
  readonly: 'full',
};

/** True for a launch flag the server understands (so a client launch with flags still starts the server). */
export function isServerFlag(arg: string): boolean {
  const name = arg.split('=')[0]!;
  return name in BOOLEAN_FLAGS || name in VALUE_FLAGS;
}

/**
 * Apply flag and env aliases in place. Returns notes for anything worth logging (to stderr).
 * Canonical env vars already set by the user are never overwritten by an alias; launch flags are
 * explicit, so they do apply.
 */
export function applyCompatAliases(env: Env = process.env, argv: string[] = process.argv.slice(2)): string[] {
  const notes: string[] = [];
  const alias = (from: string, to: string) => {
    if (env[from] && !env[to]) env[to] = env[from];
  };

  // Launch flags.
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [name, inline] = arg.split(/=(.*)/s);
    if (name! in BOOLEAN_FLAGS) {
      Object.assign(env, BOOLEAN_FLAGS[name!]);
    } else if (name! in VALUE_FLAGS) {
      const value = inline ?? argv[i + 1];
      if (value !== undefined && !value.startsWith('--')) {
        env[VALUE_FLAGS[name!]!] = value;
        if (inline === undefined) i++;
      }
    }
  }

  // Env names from older docs.
  alias('SN_INSTANCE_URL', 'SERVICENOW_INSTANCE_URL');
  alias('SN_USERNAME', 'SERVICENOW_USERNAME');
  alias('SN_PASSWORD', 'SERVICENOW_PASSWORD');
  alias('SN_OAUTH_CLIENT_ID', 'SERVICENOW_OAUTH_CLIENT_ID');
  alias('SN_OAUTH_CLIENT_SECRET', 'SERVICENOW_OAUTH_CLIENT_SECRET');
  alias('SN_AUTH_METHOD', 'SERVICENOW_AUTH_METHOD');
  alias('HTTP_PORT', 'PORT');
  if (env.SN_OAUTH_CLIENT_ID && !env.SERVICENOW_AUTH_METHOD) env.SERVICENOW_AUTH_METHOD = 'oauth';
  if (env.SERVICENOW_OAUTH_CLIENT_ID && env.SN_USERNAME && !env.SERVICENOW_OAUTH_USERNAME) env.SERVICENOW_OAUTH_USERNAME = env.SN_USERNAME;
  if (env.SERVICENOW_OAUTH_CLIENT_ID && env.SN_PASSWORD && !env.SERVICENOW_OAUTH_PASSWORD) env.SERVICENOW_OAUTH_PASSWORD = env.SN_PASSWORD;

  // SN_PERSONA → MCP_TOOL_PACKAGE.
  const persona = (env.SN_PERSONA || '').trim().toLowerCase().replace(/-/g, '_');
  if (persona && !env.MCP_TOOL_PACKAGE) {
    const pkg = PERSONA_PACKAGES[persona];
    if (pkg) env.MCP_TOOL_PACKAGE = pkg;
    else notes.push(`SN_PERSONA="${env.SN_PERSONA}" is not a known persona; using the full tool set.`);
  }
  if (persona === 'readonly' && !env.WRITE_ENABLED) env.WRITE_ENABLED = 'false';
  return notes;
}
