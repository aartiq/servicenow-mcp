import { ServiceNowError } from './errors.js';

/**
 * Permission tier utilities for NowAIKit tools.
 *
 * Tier 0 – Always available (all read tools)
 * Tier 1 – WRITE_ENABLED=true (standard ITSM writes)
 * Tier 2 – WRITE_ENABLED=true + CMDB_WRITE_ENABLED=true (CI create/update)
 * Tier 3 – WRITE_ENABLED=true + SCRIPTING_ENABLED=true (scripts/changesets)
 * Tier AI – NOW_ASSIST_ENABLED=true (generative AI tools)
 * Tier ATF – ATF_ENABLED=true (test execution)
 */

export function requireWrite(): void {
  if (process.env.WRITE_ENABLED !== 'true') {
    throw new ServiceNowError(
      'Write operations are disabled. Set WRITE_ENABLED=true to enable.',
      'WRITE_NOT_ENABLED'
    );
  }
}

export function requireCmdbWrite(): void {
  requireWrite();
  if (process.env.CMDB_WRITE_ENABLED !== 'true') {
    throw new ServiceNowError(
      'CMDB write operations are disabled. Set WRITE_ENABLED=true and CMDB_WRITE_ENABLED=true to enable.',
      'CMDB_WRITE_NOT_ENABLED'
    );
  }
}

export function requireScripting(): void {
  requireWrite();
  if (process.env.SCRIPTING_ENABLED !== 'true') {
    throw new ServiceNowError(
      'Scripting operations are disabled. Set WRITE_ENABLED=true and SCRIPTING_ENABLED=true to enable.',
      'SCRIPTING_NOT_ENABLED'
    );
  }
}

export function requireNowAssist(): void {
  if (process.env.NOW_ASSIST_ENABLED !== 'true') {
    throw new ServiceNowError(
      'Now Assist / AI features are disabled. Set NOW_ASSIST_ENABLED=true to enable.',
      'NOW_ASSIST_NOT_ENABLED'
    );
  }
}

export function requireAtf(): void {
  if (process.env.ATF_ENABLED !== 'true') {
    throw new ServiceNowError(
      'ATF test execution is disabled. Set ATF_ENABLED=true to enable.',
      'ATF_NOT_ENABLED'
    );
  }
}

export function requireFluent(): void {
  if (process.env.FLUENT_ENABLED !== 'true') {
    throw new ServiceNowError(
      'Fluent/now-sdk operations are disabled. Set FLUENT_ENABLED=true to enable.',
      'FLUENT_NOT_ENABLED'
    );
  }
}

export function isFluentEnabled(): boolean {
  return process.env.FLUENT_ENABLED === 'true';
}

export function isWriteEnabled(): boolean {
  return process.env.WRITE_ENABLED === 'true';
}

export function isCmdbWriteEnabled(): boolean {
  return process.env.WRITE_ENABLED === 'true' && process.env.CMDB_WRITE_ENABLED === 'true';
}

export function isScriptingEnabled(): boolean {
  return process.env.WRITE_ENABLED === 'true' && process.env.SCRIPTING_ENABLED === 'true';
}

export function isNowAssistEnabled(): boolean {
  return process.env.NOW_ASSIST_ENABLED === 'true';
}

export function isAtfEnabled(): boolean {
  return process.env.ATF_ENABLED === 'true';
}
