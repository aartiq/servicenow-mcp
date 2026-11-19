/**
 * Parity tools closing the remaining gaps vs ServiceNow's first-party MCP servers
 * (HRSD, CSM, Quickstart summarization, Now Assist skills) plus a server health check.
 *
 * Two kinds of tools:
 *  - Pure REST (work on any instance): list_csm_case_tasks, advance_hr_case,
 *    search_hr_knowledge, mcp_health_check.
 *  - Now Assist skill-backed (light up when Now Assist is licensed; otherwise they still
 *    return the assembled record context so the connected LLM can do the reasoning — this
 *    is deliberately better than ServiceNow, which hard-requires Now Assist): summarize_record,
 *    get_case_sentiment, generate_case_activity_response, generate_csm_resolution_notes,
 *    check_hr_eligibility.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { isScriptingEnabled, requireWrite } from '../utils/permissions.js';
import { invokeNowAssistSkill } from './now-assist-skills.js';

/**
 * Best-effort Now Assist skill invocation by (partial) name. Returns null if unavailable.
 * Skills are registered in sn_nowassist_skill_config and run through the server-side
 * sn_one_extend.OneExtendUtil API (no REST endpoint exists), exactly like test_now_assist_skill.
 * That path needs SCRIPTING_ENABLED, so without it the caller falls back to returning context.
 */
async function tryInvokeSkill(client: ServiceNowClient, skillName: string, input: Record<string, any>): Promise<any | null> {
  if (!isScriptingEnabled()) return null;
  try {
    const found = await client.queryRecords({
      table: 'sn_nowassist_skill_config',
      query: `nameCONTAINS${skillName}^active=true^skill_table=sys_one_extend_capability`,
      limit: 1,
      fields: 'sys_id,name',
    });
    if (found.count === 0) return null;
    const cfg = found.records[0] as any;
    const run = await invokeNowAssistSkill(client, cfg.sys_id, input);
    if (run.result === undefined || run.result === null) return null;
    return { skill: cfg.name, output: run.result };
  } catch {
    return null;
  }
}

/** Pull a task record + its journal (comments/work notes) for AI context assembly. */
async function recordContext(client: ServiceNowClient, table: string, sysId: string): Promise<any> {
  const record = await client.getRecord(table, sysId);
  const journal = await client.queryRecords({
    table: 'sys_journal_field',
    query: `element_id=${sysId}^ORDERBYsys_created_on`,
    fields: 'element,value,sys_created_by,sys_created_on',
    limit: 100,
  }).catch(() => ({ records: [] }));
  return { record, activity: (journal as any).records };
}

async function resolveCase(client: ServiceNowClient, table: string, ref: string): Promise<string> {
  if (/^[0-9a-f]{32}$/i.test(ref)) return ref;
  const r = await client.queryRecords({ table, query: `number=${ref}`, limit: 1 });
  if (r.count === 0) throw new ServiceNowError(`Record not found: ${ref}`, 'NOT_FOUND');
  return (r.records[0] as any).sys_id;
}

export function getSnParityToolDefinitions() {
  return [
    {
      name: 'list_csm_case_tasks',
      description: 'List the tasks on a CSM case (sn_customerservice_task). Parity with ServiceNow CSM "Get Case Tasks"',
      inputSchema: {
        type: 'object',
        properties: {
          case: { type: 'string', description: 'CSM case number or sys_id' },
          active: { type: 'boolean', description: 'Only active tasks' },
          limit: { type: 'number', description: 'Max records (default 50)' },
        },
        required: ['case'],
      },
    },
    {
      name: 'advance_hr_case',
      description: 'Advance an HR case to its next state/stage (sn_hr_core_case). Parity with ServiceNow HRSD "HR Case Advance". Requires WRITE_ENABLED=true',
      inputSchema: {
        type: 'object',
        properties: {
          case: { type: 'string', description: 'HR case number or sys_id' },
          state: { type: 'string', description: 'Target state value (if known); otherwise increments the current state' },
          work_notes: { type: 'string', description: 'Optional work note to add on advance' },
        },
        required: ['case'],
      },
    },
    {
      name: 'search_hr_knowledge',
      description: 'Search HR-scoped knowledge articles (kb_knowledge in HR knowledge bases). Parity with ServiceNow HRSD "HR Knowledge Search"',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text' },
          kb: { type: 'string', description: 'Optional specific HR knowledge base sys_id' },
          limit: { type: 'number', description: 'Max records (default 20)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'mcp_health_check',
      description: 'Health check: confirm the instance is reachable and the configured credentials resolve to a valid user. Parity with ServiceNow MCP "Health Check"',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'summarize_record',
      description: 'Summarize a record (incident/case/etc.) using the Now Assist summarization skill when available, otherwise return the assembled record + activity for the caller to summarize. Parity with ServiceNow Quickstart incident/case summarization',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table (e.g. incident, sn_customerservice_case, sn_hr_core_case)' },
          record: { type: 'string', description: 'Record number or sys_id' },
        },
        required: ['table', 'record'],
      },
    },
    {
      name: 'get_case_sentiment',
      description: 'Assess customer sentiment on a CSM case via the Now Assist sentiment skill when available, else return the case + customer comments for sentiment analysis. Parity with ServiceNow CSM "Sentiment Analysis"',
      inputSchema: {
        type: 'object',
        properties: {
          case: { type: 'string', description: 'CSM case number or sys_id' },
          table: { type: 'string', description: 'Case table (default sn_customerservice_case)' },
        },
        required: ['case'],
      },
    },
    {
      name: 'generate_case_activity_response',
      description: 'Draft an agent reply for a CSM case activity stream via the Now Assist activity-response skill when available, else return the case context to draft from. Parity with ServiceNow CSM "Activity Response"',
      inputSchema: {
        type: 'object',
        properties: {
          case: { type: 'string', description: 'CSM case number or sys_id' },
          table: { type: 'string', description: 'Case table (default sn_customerservice_case)' },
          instruction: { type: 'string', description: 'Optional tone/instruction for the reply' },
        },
        required: ['case'],
      },
    },
    {
      name: 'generate_csm_resolution_notes',
      description: 'Generate CSM resolution notes via the Now Assist resolution-notes skill when available, else return the case + work notes to summarize. Parity with ServiceNow CSM "Generate Resolution Notes"',
      inputSchema: {
        type: 'object',
        properties: {
          case: { type: 'string', description: 'CSM case number or sys_id' },
          table: { type: 'string', description: 'Case table (default sn_customerservice_case)' },
        },
        required: ['case'],
      },
    },
    {
      name: 'check_hr_eligibility',
      description: 'Check an employee\'s eligibility for an HR service/policy via the Policy Based HR Case Evaluator skill when available, else return the employee + service context. Parity with ServiceNow HRSD "HR Eligibility Check"',
      inputSchema: {
        type: 'object',
        properties: {
          user: { type: 'string', description: 'Employee sys_id, user_name, or email' },
          hr_service: { type: 'string', description: 'HR service sys_id or name to check eligibility for' },
        },
        required: ['user', 'hr_service'],
      },
    },
  ];
}

export async function executeSnParityToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'list_csm_case_tasks': {
      const caseId = await resolveCase(client, 'sn_customerservice_case', args.case);
      const parts = [`parent=${caseId}`];
      if (args.active !== undefined) parts.push(`active=${args.active ? 'true' : 'false'}`);
      return await client.queryRecords({ table: 'sn_customerservice_task', query: parts.join('^'), limit: args.limit ?? 50 });
    }
    case 'advance_hr_case': {
      requireWrite();
      const caseId = await resolveCase(client, 'sn_hr_core_case', args.case);
      const payload: Record<string, any> = {};
      if (args.state !== undefined) {
        payload.state = args.state;
      } else {
        const cur = await client.getRecord('sn_hr_core_case', caseId);
        // HR case states are not sequential numbers: Draft(1) > Ready(10) > Work in Progress(18) > Closed Complete(3);
        // Awaiting Acceptance(20)/Awaiting Approval(11)/Suspended(24) resume to Work in Progress.
        const NEXT: Record<string, string> = { '1': '10', '10': '18', '20': '18', '11': '18', '24': '18', '18': '3' };
        const curState = String((cur as any).state?.value ?? (cur as any).state ?? '1');
        const next = NEXT[curState];
        if (!next) throw new ServiceNowError(`HR case ${args.case} is in state ${curState}, which has no next stage (closed or cancelled). Pass state explicitly to override.`, 'INVALID_STATE');
        payload.state = next;
      }
      if (args.work_notes) payload.work_notes = args.work_notes;
      const result = await client.updateRecord('sn_hr_core_case', caseId, payload);
      return { ...result, summary: `Advanced HR case ${args.case} to state ${payload.state}` };
    }
    case 'search_hr_knowledge': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const parts = [`workflow_state=published`, `short_descriptionLIKE${args.query}^ORtextLIKE${args.query}`];
      if (args.kb) parts.push(`kb_knowledge_base=${args.kb}`);
      else parts.push('kb_knowledge_base.titleLIKEHR^ORkb_knowledge_base.titleLIKEHuman Resources');
      return await client.queryRecords({
        table: 'kb_knowledge',
        query: parts.join('^'),
        fields: 'number,short_description,kb_knowledge_base,kb_knowledge_base.title,workflow_state,sys_id',
        limit: args.limit ?? 20,
      });
    }
    case 'mcp_health_check': {
      try {
        const user = await client.getCurrentUser();
        return { ok: true, reachable: true, authenticated: true, user, note: 'Instance reachable and credentials resolve to a valid user.' };
      } catch (e) {
        return { ok: false, reachable: true, authenticated: false, error: e instanceof Error ? e.message : String(e), note: 'Instance responded but the credentials did not authenticate. See the auth diagnostic in the error.' };
      }
    }
    case 'summarize_record': {
      const sysId = await resolveCase(client, args.table, args.record);
      const ctx = await recordContext(client, args.table, sysId);
      const skill = await tryInvokeSkill(client, 'summariz', { table: args.table, sys_id: sysId });
      return { table: args.table, sys_id: sysId, ...ctx, now_assist: skill, note: skill ? 'Now Assist summary included.' : 'Now Assist summarization skill not found; summarize from the returned record + activity.' };
    }
    case 'get_case_sentiment': {
      const table = args.table || 'sn_customerservice_case';
      const sysId = await resolveCase(client, table, args.case);
      const ctx = await recordContext(client, table, sysId);
      const skill = await tryInvokeSkill(client, 'sentiment', { table, sys_id: sysId });
      return { table, sys_id: sysId, ...ctx, now_assist: skill, note: skill ? 'Now Assist sentiment included.' : 'Now Assist sentiment skill not found; assess sentiment from the returned comments/activity.' };
    }
    case 'generate_case_activity_response': {
      const table = args.table || 'sn_customerservice_case';
      const sysId = await resolveCase(client, table, args.case);
      const ctx = await recordContext(client, table, sysId);
      const skill = await tryInvokeSkill(client, 'activity response', { table, sys_id: sysId, instruction: args.instruction });
      return { table, sys_id: sysId, ...ctx, instruction: args.instruction, now_assist: skill, note: skill ? 'Now Assist draft included.' : 'Now Assist activity-response skill not found; draft a reply from the returned context.' };
    }
    case 'generate_csm_resolution_notes': {
      const table = args.table || 'sn_customerservice_case';
      const sysId = await resolveCase(client, table, args.case);
      const ctx = await recordContext(client, table, sysId);
      const skill = await tryInvokeSkill(client, 'resolution', { table, sys_id: sysId });
      return { table, sys_id: sysId, ...ctx, now_assist: skill, note: skill ? 'Now Assist resolution notes included.' : 'Now Assist resolution-notes skill not found; draft resolution notes from the returned work notes/activity.' };
    }
    case 'check_hr_eligibility': {
      const u = await client.queryRecords({ table: 'sys_user', query: `user_name=${args.user}^ORemail=${args.user}^ORsys_id=${args.user}`, limit: 1 });
      if (u.count === 0) throw new ServiceNowError(`User not found: ${args.user}`, 'NOT_FOUND');
      const user = u.records[0];
      const svc = await client.queryRecords({ table: 'sn_hr_core_service', query: `sys_id=${args.hr_service}^ORname=${args.hr_service}`, limit: 1 }).catch(() => ({ records: [], count: 0 }));
      const service = (svc as any).count ? (svc as any).records[0] : { note: `HR service not resolved: ${args.hr_service}` };
      const skill = await tryInvokeSkill(client, 'Case Evaluator', { user: (user as any).sys_id, hr_service: args.hr_service });
      return { user, hr_service: service, now_assist: skill, note: skill ? 'Policy Based HR Case Evaluator result included.' : 'Policy Based HR Case Evaluator skill not found; evaluate eligibility from the employee + HR service context.' };
    }
    default:
      return null;
  }
}
