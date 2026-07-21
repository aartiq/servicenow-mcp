import { ServiceNowError } from './errors.js';
import { getDelegatedAuth } from './request-context.js';

/**
 * Permission tier utilities for NowAIKit tools.
 *
 * Tier 0 – Always available (all read tools)
 * Tier 1 – WRITE_ENABLED=true (standard ITSM writes)
 * Tier 2 – WRITE_ENABLED=true + CMDB_WRITE_ENABLED=true (CI create/update)
 * Tier 3 – WRITE_ENABLED=true + SCRIPTING_ENABLED=true (scripts/changesets)
 * Tier AI – NOW_ASSIST_ENABLED=true (generative AI tools)
 * Tier ATF – ATF_ENABLED=true (test execution)
 *
 * Source of truth: process.env sets the server's capability CEILING. When a request
 * runs under a delegated-auth context (DELEGATED_AUTH mode, e.g. behind a trusted
 * gateway), the per-user policy can only NARROW that ceiling, never widen it — a
 * forged/over-permissive delegated flag can never enable a tier the operator left
 * disabled. So the effective capability is (env AND delegated).
 */

export function isWriteEnabled(): boolean {
  const env = process.env.WRITE_ENABLED === 'true';
  const d = getDelegatedAuth();
  return d ? env && d.flags?.write === true : env;
}

export function isCmdbWriteEnabled(): boolean {
  const env = process.env.WRITE_ENABLED === 'true' && process.env.CMDB_WRITE_ENABLED === 'true';
  const d = getDelegatedAuth();
  return d ? env && d.flags?.write === true && d.flags?.cmdbWrite === true : env;
}

export function isScriptingEnabled(): boolean {
  const env = process.env.WRITE_ENABLED === 'true' && process.env.SCRIPTING_ENABLED === 'true';
  const d = getDelegatedAuth();
  return d ? env && d.flags?.write === true && d.flags?.scripting === true : env;
}

export function isNowAssistEnabled(): boolean {
  const env = process.env.NOW_ASSIST_ENABLED === 'true';
  const d = getDelegatedAuth();
  return d ? env && d.flags?.nowAssist === true : env;
}

export function isAtfEnabled(): boolean {
  const env = process.env.ATF_ENABLED === 'true';
  const d = getDelegatedAuth();
  return d ? env && d.flags?.atf === true : env;
}

export function requireWrite(): void {
  if (!isWriteEnabled()) {
    throw new ServiceNowError(
      'Write operations are disabled. Set WRITE_ENABLED=true to enable.',
      'WRITE_NOT_ENABLED'
    );
  }
}

export function requireCmdbWrite(): void {
  requireWrite();
  if (!isCmdbWriteEnabled()) {
    throw new ServiceNowError(
      'CMDB write operations are disabled. Set WRITE_ENABLED=true and CMDB_WRITE_ENABLED=true to enable.',
      'CMDB_WRITE_NOT_ENABLED'
    );
  }
}

export function requireScripting(): void {
  requireWrite();
  if (!isScriptingEnabled()) {
    throw new ServiceNowError(
      'Scripting operations are disabled. Set WRITE_ENABLED=true and SCRIPTING_ENABLED=true to enable.',
      'SCRIPTING_NOT_ENABLED'
    );
  }
}

export function requireNowAssist(): void {
  if (!isNowAssistEnabled()) {
    throw new ServiceNowError(
      'Now Assist / AI features are disabled. Set NOW_ASSIST_ENABLED=true to enable.',
      'NOW_ASSIST_NOT_ENABLED'
    );
  }
}

export function requireAtf(): void {
  if (!isAtfEnabled()) {
    throw new ServiceNowError(
      'ATF test execution is disabled. Set ATF_ENABLED=true to enable.',
      'ATF_NOT_ENABLED'
    );
  }
}

// Fluent/now-sdk availability is a local server concern, not a per-user policy —
// it always reads from the environment.
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
