/**
 * Platform operations: Instance Scan findings, ECC queue, fix scripts.
 * Read: Tier 0. Reprocess: Tier 1 (WRITE_ENABLED=true). Fix scripts: Tier 2 (SCRIPTING_ENABLED=true).
 *
 * Tables:
 *   scan_suite       — Instance Scan suites
 *   scan_finding     — Instance Scan best-practice findings
 *   ecc_queue        — External Communication Channel queue (probes/sensors)
 *   sys_script_fix   — fix scripts
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';

export function getPlatformOpsToolDefinitions() {
  return [
    {
      name: 'list_scan_suites',
      description: 'List Instance Scan suites (scan_suite) available to run',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search suites by name' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_instance_scan_findings',
      description: 'List Instance Scan findings (scan_finding) — best-practice violations, optionally by check or suite result',
      inputSchema: {
        type: 'object',
        properties: {
          check: { type: 'string', description: 'Filter by check name (contains)' },
          suite_result: { type: 'string', description: 'Filter by scan suite result sys_id' },
          table: { type: 'string', description: 'Filter by target table' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ecc_queue',
      description: 'Inspect the ECC queue (ecc_queue) — MID server probes/sensors, by state, agent, or topic',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (e.g. "ready", "processed", "error")' },
          queue: { type: 'string', description: 'Direction: "input" or "output"' },
          agent: { type: 'string', description: 'MID server agent name (contains)' },
          topic: { type: 'string', description: 'Topic (contains)' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'resubmit_ecc_probe',
      description: 'Re-queue an ECC probe/sensor by setting its state back to ready (ecc_queue). Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sys_id of the ecc_queue record' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'run_fix_script',
      description: 'Execute a fix script (sys_script_fix) by name or sys_id on the server. Requires WRITE_ENABLED=true and SCRIPTING_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Fix script name' },
          sys_id: { type: 'string', description: 'sys_id of the fix script' },
        },
        required: [],
      },
    },
  ];
}

export async function executePlatformOpsToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'list_scan_suites': {
      const query = args.query ? `nameCONTAINS${args.query}` : '';
      return await client.queryRecords({
        table: 'scan_check_suite',
        query,
        limit: args.limit ?? 50,
        fields: 'sys_id,name,description,active,private,scorecard,sys_scope,sys_updated_on',
      });
    }
    case 'get_instance_scan_findings': {
      const parts: string[] = [];
      if (args.check) parts.push(`check.nameCONTAINS${args.check}`);
      if (args.suite_result) parts.push(`suite_result=${args.suite_result}`);
      if (args.table) parts.push(`table=${args.table}`);
      return await client.queryRecords({
        table: 'scan_finding',
        query: parts.join('^') + (parts.length ? '^' : '') + 'ORDERBYDESCsys_created_on',
        fields: 'check,check.name,table,document,description,suite_result',
        limit: args.limit ?? 50,
      });
    }
    case 'get_ecc_queue': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.queue) parts.push(`queue=${args.queue}`);
      if (args.agent) parts.push(`agentCONTAINS${args.agent}`);
      if (args.topic) parts.push(`topicCONTAINS${args.topic}`);
      return await client.queryRecords({
        table: 'ecc_queue',
        query: parts.join('^') + (parts.length ? '^' : '') + 'ORDERBYDESCsys_created_on',
        fields: 'agent,topic,name,source,queue,state,processed,error_string',
        limit: args.limit ?? 50,
      });
    }
    case 'resubmit_ecc_probe': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('ecc_queue', args.sys_id, { state: 'ready' });
      return { ...result, summary: `Re-queued ECC record ${args.sys_id}` };
    }
    case 'run_fix_script': {
      requireScripting();
      let fix;
      if (args.sys_id) {
        fix = await client.getRecord('sys_script_fix', args.sys_id);
      } else if (args.name) {
        const resp = await client.queryRecords({ table: 'sys_script_fix', query: `name=${args.name}`, limit: 1 });
        if (resp.count === 0) throw new ServiceNowError(`Fix script not found: ${args.name}`, 'NOT_FOUND');
        fix = resp.records[0];
      } else {
        throw new ServiceNowError('name or sys_id is required', 'INVALID_REQUEST');
      }
      const script = (fix as any).script;
      if (!script) throw new ServiceNowError('Fix script has no script body', 'INVALID_REQUEST');
      const output = await client.executeScript(script);
      return { fix_script: (fix as any).name, output, summary: `Executed fix script "${(fix as any).name}"` };
    }
    default:
      return null;
  }
}
