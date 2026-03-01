/**
 * Security Operations (SecOps) tools — security incidents, vulnerabilities, and GRC.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getSecurityToolDefinitions() {
  return [
    {
      name: 'create_security_incident',
      description: 'Create a Security Operations incident (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief description of the security event' },
          category: { type: 'string', description: 'Incident category (e.g., "Malware", "Phishing", "Data Breach", "Unauthorized Access")' },
          subcategory: { type: 'string', description: 'Incident subcategory' },
          severity: { type: 'number', description: '1=High, 2=Medium, 3=Low' },
          description: { type: 'string', description: 'Detailed description of the security incident' },
          affected_cis: { type: 'array', items: { type: 'string' }, description: 'List of affected CI sys_ids' },
          assignment_group: { type: 'string', description: 'SOC team or assignment group' },
        },
        required: ['short_description', 'category'],
      },
    },
    {
      name: 'get_security_incident',
      description: 'Get full details of a security incident by number or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Security incident number (SIR...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_security_incident',
      description: 'Update a security incident record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the security incident' },
          fields: { type: 'object', description: 'Fields to update (state, severity, containment_status, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_security_incidents',
      description: 'List security incidents with filters (severity, state, category)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (open, analysis, contain, eradicate, recover, review, closed)' },
          severity: { type: 'number', description: 'Filter by severity (1=High, 2=Medium, 3=Low)' },
          category: { type: 'string', description: 'Filter by incident category' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'list_vulnerabilities',
      description: 'List vulnerability entries from the Vulnerability Response module',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (open, in_review, risk_accepted, closed)' },
          severity: { type: 'string', description: 'Filter by CVSS severity (critical, high, medium, low)' },
          ci_sysid: { type: 'string', description: 'Filter by affected CI sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'get_vulnerability',
      description: 'Get details of a specific vulnerability entry including CVSS score and affected CIs',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Vulnerability number (VIT...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_vulnerability',
      description: 'Update a vulnerability entry (state, risk acceptance notes, remediation date) (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the vulnerability entry' },
          fields: { type: 'object', description: 'Fields to update (state, risk_acceptance_notes, remediation_date, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_grc_risks',
      description: 'List GRC (Governance, Risk, Compliance) risk entries',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by risk state (draft, assess, review, accepted, closed)' },
          category: { type: 'string', description: 'Filter by risk category' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_grc_risk',
      description: 'Get details of a GRC risk including impact, likelihood, and controls',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Risk number or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_grc_controls',
      description: 'List GRC controls with optional filter by risk or policy',
      inputSchema: {
        type: 'object',
        properties: {
          risk_sysid: { type: 'string', description: 'Filter controls by related risk sys_id' },
          state: { type: 'string', description: 'Filter by control state (draft, attest, review, exception, compliant, non_compliant)' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_threat_intelligence',
      description: 'Query threat intelligence data — IOCs, threat actors, and campaigns',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (IP, domain, hash, actor name)' },
          type: { type: 'string', description: 'Filter by IOC type: ip_address, domain, file_hash, url, email' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['query'],
      },
    },
    // ─── Security Playbooks ───────────────────────────────────────────
    {
      name: 'list_security_playbooks',
      description: 'List available security response playbooks',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter active only (default true)' },
          category: { type: 'string', description: 'Filter by category (incident_response, threat_hunting, compliance)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'run_security_playbook',
      description: 'Execute a security response playbook against an incident. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          playbook_sys_id: { type: 'string', description: 'Playbook sys_id to execute' },
          incident_sys_id: { type: 'string', description: 'Security incident sys_id to run against' },
          parameters: { type: 'object', description: 'Optional playbook input parameters' },
        },
        required: ['playbook_sys_id', 'incident_sys_id'],
      },
    },
    // ─── Security Dashboard & Posture ─────────────────────────────────
    {
      name: 'get_security_dashboard',
      description: 'Get security posture dashboard — open incidents by severity, vulnerability counts, mean time to resolve',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look-back period in days (default 30)' },
        },
        required: [],
      },
    },
    {
      name: 'scan_vulnerabilities',
      description: 'Trigger a vulnerability scan for specified CIs or groups. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_ids: { type: 'array', items: { type: 'string' }, description: 'CI sys_ids to scan' },
          group: { type: 'string', description: 'CI group to scan (alternative to ci_sys_ids)' },
          scan_type: { type: 'string', description: 'Scan type: full, quick, compliance (default full)' },
        },
        required: [],
      },
    },
    // ─── GRC Compliance ───────────────────────────────────────────────
    {
      name: 'create_grc_risk',
      description: 'Create a new GRC risk entry. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Risk name' },
          category: { type: 'string', description: 'Risk category' },
          description: { type: 'string', description: 'Risk description' },
          impact: { type: 'number', description: 'Impact score (1-5)' },
          likelihood: { type: 'number', description: 'Likelihood score (1-5)' },
          owner: { type: 'string', description: 'Risk owner user sys_id' },
        },
        required: ['name', 'category'],
      },
    },
    {
      name: 'list_compliance_policies',
      description: 'List GRC compliance policies and their current status',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (draft, published, retired)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_compliance_assessment',
      description: 'Get compliance assessment results for a policy or control',
      inputSchema: {
        type: 'object',
        properties: {
          policy_sys_id: { type: 'string', description: 'Policy sys_id' },
          control_sys_id: { type: 'string', description: 'Control sys_id (alternative to policy)' },
        },
        required: [],
      },
    },
    {
      name: 'list_audit_results',
      description: 'List audit results and findings',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (open, in_progress, closed)' },
          severity: { type: 'string', description: 'Filter by severity (critical, high, medium, low)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeSecurityToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_security_incident': {
      requireWrite();
      if (!args.short_description || !args.category) throw new ServiceNowError('short_description and category are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_si_incident', args);
      return { ...result, summary: `Created security incident ${result.number || result.sys_id}` };
    }
    case 'get_security_incident': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_si_incident', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_si_incident', query: `number=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Security incident not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_security_incident': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sn_si_incident', args.sys_id, args.fields);
      return { ...result, summary: `Updated security incident ${args.sys_id}` };
    }
    case 'list_security_incidents': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.severity) parts.push(`severity=${args.severity}`);
      if (args.category) parts.push(`category=${args.category}`);
      if (args.query) parts.push(args.query);
      return await client.queryRecords({ table: 'sn_si_incident', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'list_vulnerabilities': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.severity) parts.push(`severity=${args.severity}`);
      if (args.ci_sysid) parts.push(`cmdb_ci=${args.ci_sysid}`);
      if (args.query) parts.push(args.query);
      return await client.queryRecords({ table: 'sn_vul_entry', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_vulnerability': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_vul_entry', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_vul_entry', query: `number=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Vulnerability not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_vulnerability': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sn_vul_entry', args.sys_id, args.fields);
      return { ...result, summary: `Updated vulnerability ${args.sys_id}` };
    }
    case 'list_grc_risks': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.category) parts.push(`category=${args.category}`);
      return await client.queryRecords({ table: 'sn_risk_risk', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_grc_risk': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_risk_risk', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_risk_risk', query: `number=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`GRC risk not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_grc_controls': {
      const parts: string[] = [];
      if (args.risk_sysid) parts.push(`risks=${args.risk_sysid}`);
      if (args.state) parts.push(`state=${args.state}`);
      return await client.queryRecords({ table: 'sn_compliance_control', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_threat_intelligence': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const q = args.type
        ? `type=${args.type}^valueCONTAINS${args.query}`
        : `valueCONTAINS${args.query}`;
      return await client.queryRecords({ table: 'sn_ti_observable', query: q, limit: args.limit ?? 25 });
    }
    case 'list_security_playbooks': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.category) parts.push(`category=${args.category}`);
      return await client.queryRecords({ table: 'sn_si_playbook', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'run_security_playbook': {
      requireWrite();
      if (!args.playbook_sys_id || !args.incident_sys_id) throw new ServiceNowError('playbook_sys_id and incident_sys_id are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_si_playbook_execution', { playbook: args.playbook_sys_id, incident: args.incident_sys_id, ...(args.parameters || {}) });
      return { action: 'executed', ...result };
    }
    case 'get_security_dashboard': {
      const days = args.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      const [openHigh, openMed, openLow, vulns, resolved] = await Promise.all([
        client.queryRecords({ table: 'sn_si_incident', query: `state!=closed^severity=1`, limit: 1, fields: 'sys_id' }),
        client.queryRecords({ table: 'sn_si_incident', query: `state!=closed^severity=2`, limit: 1, fields: 'sys_id' }),
        client.queryRecords({ table: 'sn_si_incident', query: `state!=closed^severity=3`, limit: 1, fields: 'sys_id' }),
        client.queryRecords({ table: 'sn_vul_entry', query: `state=open`, limit: 1, fields: 'sys_id' }),
        client.queryRecords({ table: 'sn_si_incident', query: `state=closed^sys_updated_on>=${since}`, limit: 1, fields: 'sys_id' }),
      ]);
      return { period_days: days, open_incidents: { high: openHigh.count, medium: openMed.count, low: openLow.count }, open_vulnerabilities: vulns.count, resolved_incidents_period: resolved.count };
    }
    case 'scan_vulnerabilities': {
      requireWrite();
      if (!args.ci_sys_ids?.length && !args.group) throw new ServiceNowError('ci_sys_ids or group is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_vul_scan_request', { ci_list: args.ci_sys_ids?.join(',') || '', group: args.group || '', scan_type: args.scan_type || 'full' });
      return { action: 'scan_requested', ...result };
    }
    case 'create_grc_risk': {
      requireWrite();
      if (!args.name || !args.category) throw new ServiceNowError('name and category are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_risk_risk', { name: args.name, category: args.category, ...(args.description ? { description: args.description } : {}), ...(args.impact ? { impact: String(args.impact) } : {}), ...(args.likelihood ? { likelihood: String(args.likelihood) } : {}), ...(args.owner ? { owner: args.owner } : {}) });
      return { action: 'created', ...result };
    }
    case 'list_compliance_policies': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      return await client.queryRecords({ table: 'sn_compliance_policy', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_compliance_assessment': {
      if (!args.policy_sys_id && !args.control_sys_id) throw new ServiceNowError('policy_sys_id or control_sys_id is required', 'INVALID_REQUEST');
      const query = args.policy_sys_id ? `policy=${args.policy_sys_id}` : `control=${args.control_sys_id}`;
      return await client.queryRecords({ table: 'sn_compliance_assessment', query, limit: 50 });
    }
    case 'list_audit_results': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.severity) parts.push(`severity=${args.severity}`);
      return await client.queryRecords({ table: 'sn_audit_result', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    default:
      return null;
  }
}
