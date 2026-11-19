/**
 * Approval-management parity tools — matches ServiceNow's Advanced Approval Management AI
 * MCP surface (quotes, ad-hoc approvers, routing preview, recall, history) but generalized
 * to any approvable record, not just CPQ quotes. Read: Tier 0. Actions: Tier 1 (WRITE_ENABLED).
 *
 * Tables:
 *   sysapproval_approver — approval requests (the approver rows)
 *   sysapproval_group    — approval groups
 *   sn_quote / sn_sales_quote / quote — CPQ quotes (name varies by version)
 *   wf_approval / sys_approval_rule — routing definitions
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const QUOTE_TABLES = ['sn_quote_mgmt_core_quote', 'sn_sales_quote', 'quote'];

export function getApprovalsExtraToolDefinitions() {
  return [
    {
      name: 'get_quote',
      description: 'Get a CPQ/sales quote record by number or sys_id (tries known quote tables)',
      inputSchema: {
        type: 'object',
        properties: {
          number: { type: 'string', description: 'Quote number' },
          sys_id: { type: 'string', description: 'Quote sys_id' },
          table: { type: 'string', description: 'Explicit quote table if you know it' },
        },
        required: [],
      },
    },
    {
      name: 'list_quotes',
      description: 'List CPQ/sales quotes with optional filters (state, account)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Explicit quote table if you know it' },
          state: { type: 'string', description: 'Filter by state' },
          account: { type: 'string', description: 'Filter by account sys_id' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_approval_history',
      description: 'Get the approval progression/history for any record (sysapproval_approver rows, ordered)',
      inputSchema: {
        type: 'object',
        properties: {
          record: { type: 'string', description: 'sys_id of the record under approval (source record)' },
          limit: { type: 'number', description: 'Max approver rows (default 100)' },
        },
        required: ['record'],
      },
    },
    {
      name: 'preview_approval_routing',
      description: 'Preview the planned approver path for a record before/after submission (existing sysapproval_approver rows + matching approval rules)',
      inputSchema: {
        type: 'object',
        properties: {
          record: { type: 'string', description: 'sys_id of the record to preview routing for' },
          table: { type: 'string', description: 'Table of the record (to match approval rules)' },
        },
        required: ['record'],
      },
    },
    {
      name: 'add_adhoc_approver',
      description: 'Add an ad-hoc approver to an in-flight approval on a record (inserts a sysapproval_approver row). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          record: { type: 'string', description: 'sys_id of the record under approval (sets sysapproval)' },
          approver: { type: 'string', description: 'sys_id of the user to add as approver' },
          source_table: { type: 'string', description: 'Table of the source record (source_table field)' },
        },
        required: ['record', 'approver'],
      },
    },
    {
      name: 'recall_approval_request',
      description: 'Recall/withdraw approval requests on a record by cancelling pending approver rows (state → cancelled/no_longer_required). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          record: { type: 'string', description: 'sys_id of the record whose approvals to recall' },
        },
        required: ['record'],
      },
    },
    {
      name: 'submit_for_approval',
      description: 'Submit any record for approval by setting its approval field to "requested" (generic, not just change). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table of the record' },
          sys_id: { type: 'string', description: 'sys_id of the record' },
          approval_field: { type: 'string', description: 'Approval field name (default "approval")' },
        },
        required: ['table', 'sys_id'],
      },
    },
  ];
}

async function findQuote(client: ServiceNowClient, query: string, tables: string[]): Promise<{ table: string; record: any } | null> {
  for (const t of tables) {
    try {
      const r = await client.queryRecords({ table: t, query, limit: 1 });
      if (r.count > 0) return { table: t, record: r.records[0] };
    } catch { /* table may not exist in this instance */ }
  }
  return null;
}

export async function executeApprovalsExtraToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'get_quote': {
      const tables = args.table ? [args.table] : QUOTE_TABLES;
      if (args.sys_id) {
        for (const t of tables) { try { return { table: t, quote: await client.getRecord(t, args.sys_id) }; } catch { /* try next */ } }
        throw new ServiceNowError('Quote not found by sys_id in known quote tables', 'NOT_FOUND');
      }
      if (!args.number) throw new ServiceNowError('number or sys_id is required', 'INVALID_REQUEST');
      const hit = await findQuote(client, `number=${args.number}`, tables);
      if (!hit) throw new ServiceNowError(`Quote ${args.number} not found (CPQ/Sales quote tables may not be installed)`, 'NOT_FOUND');
      return { table: hit.table, quote: hit.record };
    }
    case 'list_quotes': {
      const tables = args.table ? [args.table] : QUOTE_TABLES;
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.account) parts.push(`account=${args.account}`);
      for (const t of tables) {
        try {
          const r = await client.queryRecords({ table: t, query: parts.join('^'), limit: args.limit ?? 25 });
          if (r.count > 0 || t === tables[tables.length - 1]) return { table: t, ...r };
        } catch { /* try next */ }
      }
      return { count: 0, records: [], note: 'No CPQ/Sales quote table found on this instance.' };
    }
    case 'get_approval_history': {
      if (!args.record) throw new ServiceNowError('record is required', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sysapproval_approver',
        query: `sysapproval=${args.record}^ORDERBYorder`,
        fields: 'approver,approver.name,state,order,comments,sys_created_on,sys_updated_on,group',
        limit: args.limit ?? 100,
      });
    }
    case 'preview_approval_routing': {
      if (!args.record) throw new ServiceNowError('record is required', 'INVALID_REQUEST');
      const existing = await client.queryRecords({
        table: 'sysapproval_approver',
        query: `sysapproval=${args.record}^ORDERBYorder`,
        fields: 'approver,approver.name,state,order,group,group.name',
        limit: 100,
      });
      let rules: any = { records: [], count: 0 };
      if (args.table) {
        rules = await client.queryRecords({
          table: 'sysrule_assignment',
          query: `table=${args.table}`,
          fields: 'name,order,active',
          limit: 20,
        }).catch(() => ({ records: [], count: 0 }));
      }
      return {
        record: args.record,
        planned_approvers: (existing as any).records,
        matching_assignment_rules: (rules as any).records,
        note: 'Shows current sysapproval_approver rows (the actual planned path) plus any assignment rules for the table. A full pre-submission dry-run requires the record to be evaluated by the workflow engine.',
      };
    }
    case 'add_adhoc_approver': {
      requireWrite();
      if (!args.record || !args.approver) throw new ServiceNowError('record and approver are required', 'INVALID_REQUEST');
      const payload: Record<string, any> = { sysapproval: args.record, approver: args.approver, state: 'requested' };
      if (args.source_table) payload.source_table = args.source_table;
      const result = await client.createRecord('sysapproval_approver', payload);
      // Field-level write ACLs (OOB: sysapproval only on change_request on insert) can silently drop the
      // reference fields, leaving an orphan approval row. Detect that, remove it and say why.
      const refVal = (v: any) => (v && typeof v === 'object' ? v.value : v);
      if (!refVal((result as any).sysapproval) || !refVal((result as any).approver)) {
        const orphan = refVal((result as any).sys_id);
        if (orphan) await client.deleteRecord('sysapproval_approver', String(orphan)).catch(() => undefined);
        throw new ServiceNowError(
          `ServiceNow accepted the approval row but dropped its record/approver reference (field-level ACL on sysapproval_approver; OOB only change requests accept ad-hoc approvers over REST). The empty row was removed. Add the approver from the record's form or a flow instead.`,
          'INSUFFICIENT_PRIVILEGES',
        );
      }
      return { ...result, summary: `Added ad-hoc approver ${args.approver} to record ${args.record}` };
    }
    case 'recall_approval_request': {
      requireWrite();
      if (!args.record) throw new ServiceNowError('record is required', 'INVALID_REQUEST');
      const pending = await client.queryRecords({ table: 'sysapproval_approver', query: `sysapproval=${args.record}^stateINrequested,not requested`, fields: 'sys_id', limit: 100 });
      let cancelled = 0;
      for (const r of pending.records as any[]) {
        await client.updateRecord('sysapproval_approver', r.sys_id, { state: 'cancelled' }).then(() => cancelled++).catch(() => {});
      }
      return { record: args.record, cancelled, summary: `Recalled ${cancelled} pending approval request(s)` };
    }
    case 'submit_for_approval': {
      requireWrite();
      if (!args.table || !args.sys_id) throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
      const field = args.approval_field || 'approval';
      const result = await client.updateRecord(args.table, args.sys_id, { [field]: 'requested' });
      return { ...result, summary: `Submitted ${args.table}/${args.sys_id} for approval (${field}=requested)` };
    }
    default:
      return null;
  }
}
