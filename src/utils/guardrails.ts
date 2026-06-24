import { ServiceNowError } from './errors.js';

/**
 * Write guardrails — defense-in-depth beyond the binary WRITE_ENABLED flag.
 *
 * Config (all optional, comma-separated):
 *   NOWAIKIT_TABLE_DENYLIST   — tables that may never be written (e.g. sys_user,sys_properties)
 *   NOWAIKIT_FIELD_DENYLIST   — fields that may never be written; "table.field" or bare "field"
 *   NOWAIKIT_WRITE_SCOPE_PREFIX — if set, only tables matching one of these prefixes may be written
 *                                 (e.g. "x_" to confine agents to scoped-app tables)
 *
 * Built-in always-denied fields protect credentials/security regardless of config.
 */

const BUILTIN_FIELD_DENYLIST = new Set<string>([
  'sys_user.user_password',
  'sys_user.password',
  'user_password',
  'password',
]);

function parseList(envVar: string): string[] {
  const raw = process.env[envVar];
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Throw if writes to `table` (optionally touching `fields`) are blocked by guardrails. */
export function assertWriteAllowed(table: string, fields?: Record<string, unknown>): void {
  const t = table.toLowerCase();

  const tableDenylist = parseList('NOWAIKIT_TABLE_DENYLIST');
  if (tableDenylist.includes(t)) {
    throw new ServiceNowError(
      `Writes to "${table}" are blocked by NOWAIKIT_TABLE_DENYLIST.`,
      'WRITE_GUARDRAIL'
    );
  }

  const scopePrefixes = parseList('NOWAIKIT_WRITE_SCOPE_PREFIX');
  if (scopePrefixes.length > 0 && !scopePrefixes.some((p) => t.startsWith(p))) {
    throw new ServiceNowError(
      `Writes to "${table}" are blocked: not within an allowed scope prefix (${scopePrefixes.join(', ')}).`,
      'WRITE_GUARDRAIL'
    );
  }

  if (fields) {
    const fieldDenylist = new Set([...BUILTIN_FIELD_DENYLIST, ...parseList('NOWAIKIT_FIELD_DENYLIST')]);
    for (const field of Object.keys(fields)) {
      const f = field.toLowerCase();
      if (fieldDenylist.has(f) || fieldDenylist.has(`${t}.${f}`)) {
        throw new ServiceNowError(
          `Writing field "${field}" on "${table}" is blocked by the field denylist.`,
          'WRITE_GUARDRAIL'
        );
      }
    }
  }
}

/** Whether a table is on the delete denylist (delete is treated as a write to the table). */
export function assertDeleteAllowed(table: string): void {
  assertWriteAllowed(table);
}
