/**
 * Governance & multi-instance tools — bulk writes with rollback, and
 * cross-instance comparison. Built on the existing client + safety layer.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { assertWriteAllowed } from '../utils/guardrails.js';
import { appendAudit } from '../utils/audit.js';
import { instanceManager } from '../servicenow/instances.js';

export function getGovernanceToolDefinitions() {
  return [
    {
      name: 'bulk_create_records',
      description: 'Create many records in one table in a single call, tracking every created sys_id and returning a rollback_token. With rollback_on_error=true, a mid-way failure deletes everything already created so the batch is all-or-nothing. Supports dry_run. Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Target table' },
          records: { type: 'array', items: { type: 'object' }, description: 'Array of field key-value objects to create' },
          rollback_on_error: { type: 'boolean', description: 'If a create fails, delete the ones already created (default false)' },
          dry_run: { type: 'boolean', description: 'Preview the resolved payloads without creating anything' },
        },
        required: ['table', 'records'],
      },
    },
    {
      name: 'rollback_changes',
      description: 'Delete a set of previously-created records, e.g. the rollback_token returned by bulk_create_records. Requires WRITE_ENABLED=true.',
      inputSchema: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            description: 'Array of { table, sys_id } to delete',
            items: { type: 'object', properties: { table: { type: 'string' }, sys_id: { type: 'string' } }, required: ['table', 'sys_id'] },
          },
        },
        required: ['changes'],
      },
    },
    {
      name: 'compare_instances',
      description: 'Compare two configured ServiceNow instances: record counts for a table (with optional query) and/or a specific system property value. Useful for dev→prod drift detection and governance.',
      inputSchema: {
        type: 'object',
        properties: {
          instance_a: { type: 'string', description: 'First instance name (as configured)' },
          instance_b: { type: 'string', description: 'Second instance name (as configured)' },
          table: { type: 'string', description: 'Table to compare record counts for (optional)' },
          query: { type: 'string', description: 'Encoded query to scope the count (optional)' },
          property: { type: 'string', description: 'A sys_properties name to compare values for (optional)' },
        },
        required: ['instance_a', 'instance_b'],
      },
    },
  ];
}

export async function executeGovernanceToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'bulk_create_records': {
      requireWrite();
      const { table, records } = args;
      if (!table || !Array.isArray(records)) throw new ServiceNowError('table and records[] are required', 'INVALID_REQUEST');
      for (const rec of records) assertWriteAllowed(table, rec);
      if (args.dry_run) {
        return { action: 'dry_run', would: 'bulk_create', table, count: records.length, payloads: records, note: 'No records created. Re-run without dry_run to apply.' };
      }
      const instance = instanceManager.getCurrentName();
      const created: Array<{ table: string; sys_id: string }> = [];
      try {
        for (const rec of records) {
          const r = await client.createRecord(table, rec);
          const sysId = (r as any)?.sys_id;
          if (sysId) created.push({ table, sys_id: sysId });
          await appendAudit({ instance, tool: 'bulk_create_records', action: 'create', table, sys_id: sysId, result: 'ok' }, rec);
        }
        return { action: 'bulk_created', table, count: created.length, created, rollback_token: created };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await appendAudit({ instance, tool: 'bulk_create_records', action: 'create', table, result: 'error', error: message });
        if (args.rollback_on_error && created.length) {
          const rolledBack: string[] = [];
          for (const c of created.reverse()) {
            try { await client.deleteRecord(c.table, c.sys_id); rolledBack.push(c.sys_id); } catch { /* best effort */ }
          }
          return { action: 'rolled_back', error: message, created_then_deleted: rolledBack, note: 'Batch failed; created records were rolled back.' };
        }
        return { action: 'partial', error: message, created, rollback_token: created, note: 'Batch failed mid-way. Use rollback_changes with rollback_token to undo.' };
      }
    }

    case 'rollback_changes': {
      requireWrite();
      const changes = args.changes;
      if (!Array.isArray(changes)) throw new ServiceNowError('changes[] is required', 'INVALID_REQUEST');
      const instance = instanceManager.getCurrentName();
      const results: Array<{ table: string; sys_id: string; ok: boolean; error?: string }> = [];
      for (const c of changes) {
        try {
          await client.deleteRecord(c.table, c.sys_id);
          await appendAudit({ instance, tool: 'rollback_changes', action: 'delete', table: c.table, sys_id: c.sys_id, result: 'ok' });
          results.push({ table: c.table, sys_id: c.sys_id, ok: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await appendAudit({ instance, tool: 'rollback_changes', action: 'delete', table: c.table, sys_id: c.sys_id, result: 'error', error: msg });
          results.push({ table: c.table, sys_id: c.sys_id, ok: false, error: msg });
        }
      }
      return { action: 'rollback', total: changes.length, succeeded: results.filter((r) => r.ok).length, results };
    }

    case 'compare_instances': {
      const { instance_a, instance_b, table, query, property } = args;
      if (!instance_a || !instance_b) throw new ServiceNowError('instance_a and instance_b are required', 'INVALID_REQUEST');
      const a = instanceManager.getClient(instance_a);
      const b = instanceManager.getClient(instance_b);
      const out: Record<string, any> = { instance_a, instance_b };

      if (table) {
        const countOf = async (c: ServiceNowClient) => {
          const res = await c.queryRecords({ table, query, fields: 'sys_id', limit: 1 });
          // queryRecords caps; use a stats call via aggregate for accuracy
          const stats = await (c as any).runAggregateQuery?.(table, '', 'COUNT', query).catch(() => null);
          const n = stats?.stats?.count ?? stats?.count;
          return n != null ? Number(n) : res.count;
        };
        const [ca, cb] = await Promise.all([countOf(a), countOf(b)]);
        out.record_count = { table, query: query || null, [instance_a]: ca, [instance_b]: cb, delta: cb - ca, match: ca === cb };
      }

      if (property) {
        const propOf = async (c: ServiceNowClient) => {
          const res = await c.queryRecords({ table: 'sys_properties', query: `name=${property}`, fields: 'name,value', limit: 1 });
          return res.records[0]?.value ?? null;
        };
        const [pa, pb] = await Promise.all([propOf(a), propOf(b)]);
        out.property = { name: property, [instance_a]: pa, [instance_b]: pb, match: pa === pb };
      }

      if (!table && !property) out.note = 'Pass a table and/or property to compare.';
      return out;
    }
  }
  return null;
}
