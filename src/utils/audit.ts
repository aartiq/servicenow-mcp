/**
 * Append-only audit log for mutating operations.
 *
 * Writes one JSON object per line to NOWAIKIT_AUDIT_LOG (default
 * ~/.config/nowaikit/audit.jsonl). Records who/what/when without storing full
 * payloads — field VALUES are hashed, only field NAMES are kept in the clear —
 * so the log is safe to retain for compliance/MSP use.
 *
 * Set NOWAIKIT_AUDIT_DISABLED=true to turn it off.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { logger } from './logging.js';

export interface AuditEntry {
  instance: string;
  tool: string;
  action: 'create' | 'update' | 'delete' | string;
  table?: string;
  sys_id?: string;
  field_names?: string[];
  payload_hash?: string;
  dry_run?: boolean;
  result?: 'ok' | 'error';
  error?: string;
}

function auditPath(): string {
  return process.env.NOWAIKIT_AUDIT_LOG || join(homedir(), '.config', 'nowaikit', 'audit.jsonl');
}

function hashPayload(fields?: Record<string, unknown>): string | undefined {
  if (!fields) return undefined;
  try {
    return createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 16);
  } catch {
    return undefined;
  }
}

/** Append an audit entry. Best-effort — never throws into the caller. */
export async function appendAudit(entry: AuditEntry, fields?: Record<string, unknown>): Promise<void> {
  if (process.env.NOWAIKIT_AUDIT_DISABLED === 'true') return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
    field_names: entry.field_names ?? (fields ? Object.keys(fields) : undefined),
    payload_hash: entry.payload_hash ?? hashPayload(fields),
  }) + '\n';
  try {
    const path = auditPath();
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line, 'utf8');
  } catch (err) {
    logger.warn(`Audit log write failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
