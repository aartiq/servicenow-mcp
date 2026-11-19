/**
 * ATF (Automated Test Framework) tools — latest release.
 * Read tools: Tier 0. Execution tools require ATF_ENABLED=true.
 * Latest release added: Failure Insight (get_atf_failure_insight) showing metadata diffs.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireAtf } from '../utils/permissions.js';

export function getAtfToolDefinitions() {
  return [
    {
      name: 'list_atf_suites',
      description: 'List ATF test suites in the instance',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active suites only' },
          query: { type: 'string', description: 'Additional filter' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_atf_suite',
      description: 'Get details of a test suite including test count',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Test suite sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'run_atf_suite',
      description: 'Execute an ATF test suite (requires ATF_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the test suite' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_atf_tests',
      description: 'List ATF test cases, optionally filtered by suite',
      inputSchema: {
        type: 'object',
        properties: {
          suite_sys_id: { type: 'string', description: 'Filter by test suite sys_id' },
          active: { type: 'boolean', description: 'Filter to active tests only' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_atf_test',
      description: 'Get details of a specific test case',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the test' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'run_atf_test',
      description: 'Execute a single ATF test (requires ATF_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the test' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'get_atf_suite_result',
      description: 'Get the results of a test suite run',
      inputSchema: {
        type: 'object',
        properties: {
          result_sys_id: { type: 'string', description: 'System ID of the suite result record' },
        },
        required: ['result_sys_id'],
      },
    },
    {
      name: 'list_atf_test_results',
      description: 'List individual test results within a suite run',
      inputSchema: {
        type: 'object',
        properties: {
          suite_result_sys_id: { type: 'string', description: 'Filter by suite result sys_id' },
          limit: { type: 'number', description: 'Max results (default: 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_atf_failure_insight',
      description: 'Get ATF Failure Insight data — metadata changes between last successful and failed run (role changes, field value changes)',
      inputSchema: {
        type: 'object',
        properties: {
          result_sys_id: { type: 'string', description: 'System ID of the failed suite result' },
        },
        required: ['result_sys_id'],
      },
    },
  ];
}

export async function executeAtfToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_atf_suites': {
      let query = args.active !== false ? 'active=true' : '';
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const limit = Math.max(1, Number(args.limit) || 20);
      // Ask for one extra row so a full page can say there's more instead of looking complete.
      const resp = await client.queryRecords({ table: 'sys_atf_test_suite', query: query || undefined, limit: limit + 1, fields: 'sys_id,name,active,description,sys_updated_on' });
      const suites = resp.records.slice(0, limit);
      const more = resp.records.length > limit;
      return { count: suites.length, suites, ...(more ? { more: true, note: `Showing the first ${limit}. Raise limit or narrow with query to see the rest.` } : {}) };
    }
    case 'get_atf_suite': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_atf_test_suite', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({ table: 'sys_atf_test_suite', query: `name=${args.sys_id_or_name}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Test suite not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'run_atf_suite': {
      requireAtf();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // ATF runs are triggered through the CI/CD API (requires the CI/CD for
      // Applications plugin, com.snc.cicd, active by default on modern instances).
      // The old /api/now/atf/runner/* path does not exist and returns
      // "Requested URI does not represent any resource".
      try {
        const result = await client.callNowAssist(`/api/sn_cicd/testsuite/run?test_suite_sys_id=${encodeURIComponent(args.sys_id)}`, {});
        return { action: 'suite_run_started', sys_id: args.sys_id, ...result };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new ServiceNowError(
          `Could not start ATF suite ${args.sys_id} via the CI/CD API (/api/sn_cicd/testsuite/run): ${msg}. ` +
          `This needs the CI/CD for Applications plugin (com.snc.cicd) and the sn_cicd role. If unavailable, run the suite from the ATF UI.`,
          'ATF_RUN_FAILED'
        );
      }
    }
    case 'list_atf_tests': {
      let query = args.active !== false ? 'active=true' : '';
      if (args.suite_sys_id) {
        // Suite membership lives in sys_atf_test_suite_test; sys_atf_test has no suite field, and ServiceNow
        // ignores a filter on a missing field, which used to return every test.
        const links = await client.queryRecords({ table: 'sys_atf_test_suite_test', query: `test_suite=${args.suite_sys_id}^ORDERBYorder`, fields: 'test', limit: 1000 });
        const ids = (links.records as any[]).map((r) => (r.test && typeof r.test === 'object' ? r.test.value : r.test)).filter(Boolean);
        if (!ids.length) return { count: 0, tests: [], note: 'This suite has no tests.' };
        query = query ? `${query}^sys_idIN${ids.join(',')}` : `sys_idIN${ids.join(',')}`;
      }
      const resp = await client.queryRecords({ table: 'sys_atf_test', query: query || undefined, limit: args.limit || 20 });
      return { count: resp.count, tests: resp.records };
    }
    case 'get_atf_test': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_atf_test', args.sys_id);
    }
    case 'run_atf_test': {
      requireAtf();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // ServiceNow's CI/CD API runs test SUITES, not individual tests; there is no
      // supported REST endpoint for a single ATF test.
      throw new ServiceNowError(
        `Running a single ATF test over REST is not supported by ServiceNow (only test suites can be run, via the CI/CD API). ` +
        `Add test ${args.sys_id} to a suite and use run_atf_suite, or run it from the ATF UI.`,
        'NOT_SUPPORTED'
      );
    }
    case 'get_atf_suite_result': {
      if (!args.result_sys_id) throw new ServiceNowError('result_sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_atf_test_suite_result', args.result_sys_id);
    }
    case 'list_atf_test_results': {
      let query = '';
      if (args.suite_result_sys_id) query = `parent=${args.suite_result_sys_id}`;
      const resp = await client.queryRecords({
        table: 'sys_atf_test_result',
        query: query || undefined,
        limit: args.limit || 50,
        orderBy: '-sys_created_on',
        fields: 'sys_id,test,test_name,status,output,parent,first_failing_step,start_time,end_time,run_time,sys_updated_on',
      });
      return { count: resp.count, results: resp.records };
    }
    case 'get_atf_failure_insight': {
      if (!args.result_sys_id) throw new ServiceNowError('result_sys_id is required', 'INVALID_REQUEST');
      // Failure Insight stores its "what changed" diffs in sys_atf_what_changed, keyed by the
      // failing test result. Accept a suite result (its tests' rows) or a single test result.
      const resp = await client.queryRecords({
        table: 'sys_atf_what_changed',
        query: `sys_atf_test_result.parent=${args.result_sys_id}^ORsys_atf_test_result=${args.result_sys_id}`,
        limit: 200,
        fields: 'sys_id,type,sys_atf_test_result,previous_test_result,sys_atf_step,application_file,update_name,update_set,sys_created_on',
      });
      return {
        result_sys_id: args.result_sys_id,
        failure_insight: resp.records,
        summary: `Found ${resp.count} metadata change(s) between last passing and failing run`,
        note: 'Failure Insight (sys_atf_what_changed) lists the application files and update sets that changed between the last passing run and the failing run',
      };
    }
    default:
      return null;
  }
}
