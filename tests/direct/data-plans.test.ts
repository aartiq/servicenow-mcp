import { describe, it, expect, vi } from 'vitest';
import { DATA_PLANS, gatherPlan, planKeys, pick, addUrls } from '../../src/direct/data-plans.js';
import { getCapabilityMeta, REPORT_OUTPUT_RULES } from '../../src/prompts/index.js';
import aiGovernance from '../../src/prompts/capabilities/ai-governance-audit.js';
import csdm from '../../src/prompts/capabilities/csdm-data-foundations.js';
import { getCatalogTool } from '../../src/tools/index.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const ID = 'a'.repeat(32);

function stubClient() {
  return {
    instanceUrl: 'https://x.service-now.com',
    recordUrl: (t: string, id: string) => `https://x.service-now.com/${t}.do?sys_id=${id}`,
    queryRecords: vi.fn(async (p: any) => ({ count: 1, records: [{ sys_id: ID, number: p.table === 'incident' ? 'INC0010001' : p.table === 'change_request' ? 'CHG0030001' : 'X1', name: 'thing' }] })),
    runStats: vi.fn(async () => [{ groupby_fields: [{ field: 'state', value: 'open', display_value: 'Open' }], stats: { count: '3' } }]),
  } as unknown as ServiceNowClient;
}

const readOnly = (name: string) => !!(getCatalogTool(name) as any)?.annotations?.readOnlyHint;

/** The sections each capability must produce with typical arguments. */
const KEY_SECTIONS: Record<string, { args?: Record<string, string>; table?: string; keys: string[] }> = {
  'scan-health': { keys: ['release_info', 'recent_errors', 'slow_transactions_24h', 'scheduled_jobs'] },
  'scan-security': { keys: ['acl_posture', 'integration_auth_posture', 'admin_role_holders', 'mcp_exposure'] },
  'scan-debt': { keys: ['old_custom_script_includes', 'open_update_sets', 'dashboard_migration'] },
  'scan-upgrade': { keys: ['release_info', 'acl_posture', 'dashboard_migration'] },
  'scan-cmdb': { keys: ['data_foundations', 'csdm_health', 'duplicates', 'orphans', 'stale'] },
  'scan-automation': { table: 'incident', keys: ['trace_insert', 'trace_update', 'business_rule_scripts'] },
  'review-acls': { table: 'incident', keys: ['acl_posture', 'acls', 'acl_roles', 'open_read_acls', 'table_schema'] },
  'review-code': { args: { artifact: 'MyUtils' }, keys: ['artifact', 'recent_business_rules', 'recent_script_includes'] },
  'review-scripts': { keys: ['pattern_eval_server', 'recent_business_rules'] },
  'review-flows': { keys: ['active_flows', 'recent_flow_errors', 'flow_runs_30d_by_state'] },
  'ops-triage': { args: { incident: 'INC0010001' }, keys: ['investigation', 'incident_slas'] },
  'ops-risk': { args: { change: 'CHG0030001' }, keys: ['change_readiness', 'predicted_risk'] },
  'ops-deploy': { args: { updateset: 'Release 1' }, keys: ['update_set', 'update_set_changes'] },
  'docs-app': { args: { app: 'x_acme_app' }, keys: ['app', 'app_sys_script'] },
  'docs-release': { args: { updateset: 'Release 1' }, keys: ['update_set', 'update_set_changes'] },
  'docs-runbook': { args: { service: 'Email' }, keys: ['service', 'knowledge', 'recent_incidents'] },
  'docs-script': { args: { script: 'MyUtils' }, keys: ['script_include', 'references'] },
  'build-business-rule': { table: 'incident', keys: ['table_schema', 'existing_business_rules', 'trace_update'] },
  'build-atf-suite': { args: { target: 'MyUtils' }, keys: ['target_artifact', 'atf_suites', 'atf_code_coverage'] },
  'ai-governance-audit': { keys: ['ai_assets', 'ai_model_providers', 'agent_access_matrix', 'mcp_exposure', 'ai_policies'] },
  'csdm-data-foundations': { keys: ['data_foundations', 'csdm_health', 'life_cycle_by_stage'] },
  'integration-auth-audit': { keys: ['integration_auth_posture', 'credential_aliases', 'basic_auth_rest_messages'] },
  'mcp-exposure-review': { keys: ['mcp_exposure', 'external_agents', 'a2a_agent_access'] },
  'atf-coverage': { keys: ['atf_code_coverage', 'atf_suites', 'recent_test_results'] },
  'table-execution-order': { table: 'incident', keys: ['trace', 'trace_insert', 'same_order_collisions'] },
  'process-insights': { keys: ['process_mining_projects', 'process_mining_findings', 'reassignment_by_group_90d'] },
  'zero-day-response': { args: { threat: 'PHP2Shell' }, keys: ['threat_status', 'kev_compliance', 'security_dashboard'] },
  'kev-compliance-report': { keys: ['kev_compliance', 'open_kev_items', 'security_dashboard'] },
  'vuln-exposure-brief': { args: { cve: 'CVE-2026-109618' }, keys: ['security_dashboard', 'kev_compliance', 'threat_status'] },
};

describe('direct-mode data plans', () => {
  it('every capability has a plan, and every planned tool exists and only reads', async () => {
    const caps = getCapabilityMeta();
    expect(caps.length).toBeGreaterThanOrEqual(38);
    for (const cap of caps) {
      expect(DATA_PLANS[cap.name], `plan for ${cap.name}`).toBeDefined();
      for (const s of DATA_PLANS[cap.name]!) {
        if ('tool' in s) {
          expect(getCatalogTool(s.tool), `${cap.name}: tool ${s.tool}`).toBeDefined();
          expect(readOnly(s.tool), `${cap.name}: ${s.tool} must be read-only`).toBe(true);
        }
      }
      const keys = planKeys(cap.name);
      expect(new Set(keys).size, `${cap.name} has duplicate keys`).toBe(keys.length);
    }
  });

  for (const [cap, spec] of Object.entries(KEY_SECTIONS)) {
    it(`${cap} gathers its key sections`, async () => {
      const client = stubClient();
      const runTool = vi.fn(async (name: string) => ({ tool: name, sys_id: ID, incident: { sys_id: { value: ID } }, change: { sys_id: { value: ID } }, update_sets: [{ sys_id: ID }], records: [{ sys_id: ID }] }));
      const { results, coverage } = await gatherPlan(client, cap, { args: spec.args ?? {}, table: spec.table ?? '' }, { runTool, isReadOnlyTool: readOnly });
      for (const k of spec.keys) expect(results[k], `${cap}: ${k} (${JSON.stringify(coverage.find((c) => c.key === k))})`).toBeDefined();
      expect(coverage.length).toBe(planKeys(cap).length);
    });
  }

  it('reports missing arguments, failures and write tools instead of guessing', async () => {
    const client = stubClient();
    (client.queryRecords as any).mockRejectedValueOnce(new Error('Invalid table syslog_transaction'));
    const runTool = vi.fn(async () => { throw new Error('User Not Authorized'); });
    const { coverage } = await gatherPlan(client, 'docs-script', { args: {}, table: '' }, { runTool, isReadOnlyTool: readOnly });
    expect(coverage.every((c) => c.status === 'skipped' && /needs --arg script/.test(String(c.detail)))).toBe(true);
    const health = await gatherPlan(client, 'scan-health', { args: {}, table: '' }, { runTool, isReadOnlyTool: readOnly });
    expect(health.coverage.find((c) => c.key === 'release_info')).toMatchObject({ status: 'failed', detail: expect.stringMatching(/no access/) });
    DATA_PLANS['__test'] = [{ key: 'w', tool: 'create_incident' }];
    runTool.mockClear();
    const w = await gatherPlan(client, '__test', { args: {}, table: '' }, { runTool, isReadOnlyTool: readOnly });
    expect(w.coverage[0]).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/never run/) });
    expect(runTool).not.toHaveBeenCalled();
    delete DATA_PLANS['__test'];
  });

  it('adds record and list links to query rows', async () => {
    const client = stubClient();
    const { results } = await gatherPlan(client, 'ops-triage', { args: {}, table: '' }, { runTool: async () => ({ incident: { sys_id: { value: ID } }, similar_incidents: [{ sys_id: ID }] }), isReadOnlyTool: readOnly });
    const major = results.open_major_incidents as any;
    expect(major.records[0].record_url).toBe(`https://x.service-now.com/incident.do?sys_id=${ID}`);
    expect(major.list_url).toContain('incident_list.do?sysparm_query=');
    expect((results.investigation as any).incident.record_url).toContain('incident.do');
    expect((results.investigation as any).similar_incidents[0].record_url).toContain('incident.do');
  });

  it('pick and addUrls work on nested results', () => {
    expect(pick({ a: { records: [{ number: { value: 'INC1' } }] } }, 'a.records.0.number')).toBe('INC1');
    const out: any = { acls: [{ sys_id: ID }], duplicates: [{ records: [{ sys_id: ID }] }] };
    addUrls(stubClient(), out, { acls: 'sys_security_acl' });
    expect(out.acls[0].record_url).toContain('sys_security_acl.do');
    expect(out.duplicates[0].records[0].record_url).toContain('cmdb_ci.do');
  });

  it('the shared output rules ask for real links, severity tags and no invention', () => {
    expect(REPORT_OUTPUT_RULES).toMatch(/record_url/);
    expect(REPORT_OUTPUT_RULES).toMatch(/\[HIGH\]/);
    expect(REPORT_OUTPUT_RULES).toMatch(/Never invent/);
    expect(REPORT_OUTPUT_RULES).not.toMatch(/[\u2013\u2014]/);
  });

  it('assessment prompts name their direct-mode sections and ask for a score', () => {
    for (const cap of [aiGovernance, csdm]) {
      const text = cap.buildPrompt({}).map((m) => m.content.text).join('\n');
      for (const k of planKeys(cap.name)) expect(text, `${cap.name} mentions ${k}`).toContain(`\`${k}\``);
      expect(text).toMatch(/Score: NN\/100/);
      expect(text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe('only real record links survive', () => {
  it('turns links that are not in the gathered data back into plain text', async () => {
    const { keepKnownLinks } = await import('../../src/direct/executor.js');
    const host = 'https://x.service-now.com';
    const good = `${host}/cmdb_ci.do?sys_id=${'a'.repeat(32)}`;
    const garbled = `${host}/cmdb_ci.do?sys_id=${'a'.repeat(16)}${'b'.repeat(16)}`;
    const data = { cis: { records: [{ record_url: good }] } };
    const text = `See [NY2A](${good}) and [NY2B](${garbled}), the [list](${host}/cmdb_ci_list.do?sysparm_query=x), ${garbled} and [docs](https://docs.servicenow.com).`;
    const r = keepKnownLinks(text, data, host);
    expect(r.removed).toBe(2);
    expect(r.content).toContain(`[NY2A](${good})`);
    expect(r.content).toContain('and NY2B,');
    expect(r.content).toContain('cmdb_ci_list.do');
    expect(r.content).toContain('[docs](https://docs.servicenow.com)');
    expect(r.content).toContain('record link left out');
  });
});
