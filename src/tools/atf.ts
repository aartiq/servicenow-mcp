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
      const resp = await client.queryRecords({ table: 'sys_atf_test_suite', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,active,description,sys_updated_on' });
      return { count: resp.count, suites: resp.records };
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
      // ServiceNow ATF runner API: POST /api/now/atf/runner/run_suite
      const result = await client.callNowAssist('/api/now/atf/runner/run_suite', { sys_id: args.sys_id });
      return { ...result, summary: `Started test suite ${args.sys_id}` };
    }
    case 'list_atf_tests': {
      let query = args.active !== false ? 'active=true' : '';
      if (args.suite_sys_id) query = query ? `${query}^test_suite=${args.suite_sys_id}` : `test_suite=${args.suite_sys_id}`;
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
      const result = await client.callNowAssist('/api/now/atf/runner/run_test', { sys_id: args.sys_id });
      return { ...result, summary: `Started test ${args.sys_id}` };
    }
    case 'get_atf_suite_result': {
      if (!args.result_sys_id) throw new ServiceNowError('result_sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_atf_test_suite_result', args.result_sys_id);
    }
    case 'list_atf_test_results': {
      let query = '';
      if (args.suite_result_sys_id) query = `test_suite_result=${args.suite_result_sys_id}`;
      const resp = await client.queryRecords({ table: 'sys_atf_result', query: query || undefined, limit: args.limit || 50, fields: 'sys_id,test,status,message,test_suite_result,sys_updated_on' });
      return { count: resp.count, results: resp.records };
    }
    case 'get_atf_failure_insight': {
      if (!args.result_sys_id) throw new ServiceNowError('result_sys_id is required', 'INVALID_REQUEST');
      // ATF Failure Insight: query sys_atf_failure_insight table
      const resp = await client.queryRecords({ table: 'sys_atf_failure_insight', query: `test_suite_result=${args.result_sys_id}` });
      return {
        result_sys_id: args.result_sys_id,
        failure_insight: resp.records,
        summary: `Found ${resp.count} metadata change(s) between last passing and failing run`,
        note: 'Failure Insight (latest release) surfaces role changes, field value changes, and configuration diffs that caused test failures',
      };
    }
    default:
      return null;
  }
}
