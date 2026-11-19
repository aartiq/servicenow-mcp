/**
 * Platform operations: Instance Scan findings, ECC queue, fix scripts.
 * Read: Tier 0. Reprocess: Tier 1 (WRITE_ENABLED=true). Fix scripts: Tier 2 (SCRIPTING_ENABLED=true).
 *
 * Tables:
 *   scan_check_suite — Instance Scan suites
 *   scan_finding     — Instance Scan best-practice findings (scan_result, scan_check, scan_score)
 *   ecc_queue        — External Communication Channel queue (probes/sensors)
 *   sys_script_fix   — fix scripts
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';
import { getInstanceScanSummary, resolveScanResult, startInstanceScan, stripHtml, type ScanType } from '../servicenow/instance-scan.js';

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
      description: 'List Instance Scan findings (scan_finding) with the check name, category, priority, affected record and details. Filter by scan result, check, category, priority or table',
      inputSchema: {
        type: 'object',
        properties: {
          check: { type: 'string', description: 'Filter by check name (contains)' },
          suite_result: { type: 'string', description: 'Filter by scan result (scan_result sys_id). Same as result' },
          result: { type: 'string', description: 'Filter by scan result: sys_id, number (e.g. SR0001234) or CI/CD progress id. Use "latest" for the newest result that has findings' },
          table: { type: 'string', description: 'Filter by the table of the affected record (source_table)' },
          category: { type: 'string', description: 'Filter by check category: security, performance, upgradability, manageability, user_experience' },
          priority: { type: 'string', description: 'Filter by check priority: 1 (critical) to 4 (low), or a comma list such as "1,2"' },
          include_muted: { type: 'boolean', description: 'Include muted findings (default false)' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_instance_scan_summary',
      description: 'Summarise the latest Instance Scan results: each saved scan with its latest and previous run and scores, findings grouped by category, priority, check, table and application, trend per check against the previous run, remediation guidance for the top checks, and coverage of AI and agent checks',
      inputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string', description: 'Summarise one scan result (sys_id, number or CI/CD progress id) instead of the latest run of every saved scan' },
          categories: { type: 'string', description: 'Comma list of categories to report: security, performance, upgradability, manageability, user_experience (default all)' },
          max_results: { type: 'number', description: 'How many scan results to analyse in depth (default 6)' },
          top_checks: { type: 'number', description: 'How many checks to list with remediation (default 25)' },
          samples_per_check: { type: 'number', description: 'Sample findings per top check (default 2, 0 to skip)' },
        },
        required: [],
      },
    },
    {
      name: 'run_instance_scan',
      description: 'Start an Instance Scan through the CI/CD API: a saved suite scan (by suite or combo), a suite against scoped apps or update sets, a point scan of one record, or a full scan. Returns the progress id; pass async: true to follow the scan to the end as a job. Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          scan_type: { type: 'string', enum: ['suite', 'combo', 'scoped_apps', 'update_sets', 'point', 'full'], description: 'suite re-runs the saved instance-wide scan of a suite; full runs every active check and can take a long time' },
          suite: { type: 'string', description: 'Suite name or sys_id (suite, scoped_apps, update_sets)' },
          combo_sys_id: { type: 'string', description: 'scan_combo sys_id to re-run (combo)' },
          target_table: { type: 'string', description: 'Table of the record to scan (point)' },
          target_sys_id: { type: 'string', description: 'sys_id of the record to scan (point)' },
          app_scope_sys_ids: { type: 'array', items: { type: 'string' }, description: 'sys_scope sys_ids to scan (scoped_apps)' },
          update_set_sys_ids: { type: 'array', items: { type: 'string' }, description: 'sys_update_set sys_ids to scan (update_sets)' },
        },
        required: ['scan_type'],
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
      const resultRef = args.result || args.suite_result;
      if (resultRef) {
        if (String(resultRef).toLowerCase() === 'latest') {
          const latest = await client.queryRecords({ table: 'scan_result', query: 'finding_count>0^ORDERBYDESCsys_created_on', fields: 'sys_id', limit: 1 });
          if (!latest.records[0]) return { count: 0, records: [], summary: 'No scan result with findings on this instance.' };
          parts.push(`result=${(latest.records[0] as any).sys_id}`);
        } else {
          parts.push(`result=${(await resolveScanResult(client, String(resultRef))).sys_id}`);
        }
      }
      if (args.table) parts.push(`source_table=${args.table}`);
      if (args.category) parts.push(`check.category=${String(args.category).trim().toLowerCase().replace(/\s+/g, '_')}`);
      if (args.priority) parts.push(`check.priorityIN${String(args.priority).replace(/\s+/g, '')}`);
      if (!args.include_muted) parts.push('muted=false');
      const resp = await client.queryRecords({
        table: 'scan_finding',
        query: parts.join('^') + (parts.length ? '^' : '') + 'ORDERBYDESCsys_created_on',
        fields: 'sys_id,check,check.name,check.category,check.priority,source_table,source,finding_details,count,muted,result,result.number,sys_package.name,product_family,sys_created_on',
        limit: args.limit ?? 50,
      });
      const findings = (resp.records as any[]).map((f) => ({
        sys_id: f.sys_id,
        check: f.check,
        check_name: f['check.name'],
        category: f['check.category'],
        priority: f['check.priority'],
        table: f.source_table,
        record: f.source && typeof f.source === 'object' ? f.source.value : f.source,
        details: stripHtml(f.finding_details, 400),
        count: f.count,
        muted: f.muted,
        result: f['result.number'],
        result_sys_id: f.result && typeof f.result === 'object' ? f.result.value : f.result,
        application: f['sys_package.name'] || f.product_family || undefined,
        created: f.sys_created_on,
      }));
      // `records` keeps the key this tool has always returned.
      return { count: resp.count, records: findings };
    }
    case 'get_instance_scan_summary': {
      return await getInstanceScanSummary(client, {
        result: args.result,
        categories: args.categories,
        maxResults: args.max_results,
        topChecks: args.top_checks,
        samplesPerCheck: args.samples_per_check,
      });
    }
    case 'run_instance_scan': {
      requireWrite();
      const scanType = String(args.scan_type || '').trim() as ScanType;
      if (!scanType) throw new ServiceNowError('scan_type is required', 'INVALID_REQUEST');
      const started = await startInstanceScan(client, {
        scan_type: scanType,
        suite: args.suite,
        combo_sys_id: args.combo_sys_id,
        target_table: args.target_table,
        target_sys_id: args.target_sys_id,
        app_scope_sys_ids: args.app_scope_sys_ids,
        update_set_sys_ids: args.update_set_sys_ids,
      });
      return {
        action: 'scan_started',
        scan_type: started.scan_type,
        endpoint: started.endpoint,
        progress_id: started.progress_id,
        status: started.status,
        status_message: started.status_message,
        suite: started.suite,
        combo_sys_id: started.combo_sys_id,
        summary: `${scanType} scan ${started.status}${started.suite ? ` for suite "${started.suite}"` : ''}. ` +
          (started.progress_id ? `Progress id ${started.progress_id}. Call with async: true to follow it, or get_instance_scan_summary with result ${started.progress_id} once it finishes.` : 'No progress id was returned.'),
      };
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
