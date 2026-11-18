import { describe, it, expect } from 'vitest';
import { applyCompatAliases, isServerFlag, PERSONA_PACKAGES } from '../../src/utils/compat.js';

describe('compat aliases', () => {
  it('maps the documented SN_* env names', () => {
    const env: Record<string, string | undefined> = { SN_INSTANCE_URL: 'https://x.service-now.com', SN_USERNAME: 'u', SN_PASSWORD: 'p', HTTP_PORT: '3100' };
    applyCompatAliases(env, []);
    expect(env).toMatchObject({ SERVICENOW_INSTANCE_URL: 'https://x.service-now.com', SERVICENOW_USERNAME: 'u', SERVICENOW_PASSWORD: 'p', PORT: '3100' });
  });

  it('never overrides canonical names', () => {
    const env: Record<string, string | undefined> = { SN_INSTANCE_URL: 'https://old', SERVICENOW_INSTANCE_URL: 'https://canonical', PORT: '3000', HTTP_PORT: '9' };
    applyCompatAliases(env, []);
    expect(env.SERVICENOW_INSTANCE_URL).toBe('https://canonical');
    expect(env.PORT).toBe('3000');
  });

  it('turns SN_OAUTH_* into an OAuth config with the user credentials', () => {
    const env: Record<string, string | undefined> = { SN_INSTANCE_URL: 'https://x', SN_OAUTH_CLIENT_ID: 'id', SN_OAUTH_CLIENT_SECRET: 's', SN_USERNAME: 'u', SN_PASSWORD: 'p' };
    applyCompatAliases(env, []);
    expect(env).toMatchObject({ SERVICENOW_AUTH_METHOD: 'oauth', SERVICENOW_OAUTH_CLIENT_ID: 'id', SERVICENOW_OAUTH_CLIENT_SECRET: 's', SERVICENOW_OAUTH_USERNAME: 'u', SERVICENOW_OAUTH_PASSWORD: 'p' });
  });

  it('applies launch flags', () => {
    const env: Record<string, string | undefined> = {};
    applyCompatAliases(env, ['--allow-write', '--allow-scripting', '--persona', 'developer', '--instance=demo', '--lean']);
    expect(env).toMatchObject({ WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true', SN_PERSONA: 'developer', MCP_TOOL_PACKAGE: 'platform_developer', SN_DEFAULT_INSTANCE: 'demo', MCP_TOOL_DISCOVERY: 'lean' });
  });

  it('maps every persona to a real package and warns on unknown ones', () => {
    const real = ['full', 'service_desk', 'change_coordinator', 'knowledge_author', 'catalog_builder', 'system_administrator', 'platform_developer',
      'itom_engineer', 'agile_manager', 'ai_developer', 'portal_developer', 'integration_engineer', 'devops_engineer', 'itam_analyst'];
    for (const pkg of Object.values(PERSONA_PACKAGES)) expect(real).toContain(pkg);
    const env: Record<string, string | undefined> = { SN_PERSONA: 'wizard' };
    expect(applyCompatAliases(env, [])[0]).toMatch(/not a known persona/);
    expect(env.MCP_TOOL_PACKAGE).toBeUndefined();
  });

  it('recognises server flags', () => {
    expect(isServerFlag('--allow-write')).toBe(true);
    expect(isServerFlag('--persona=dev')).toBe(true);
    expect(isServerFlag('setup')).toBe(false);
    expect(isServerFlag('--help')).toBe(false);
  });
});
