/**
 * IT Asset Management (ITAM) tools — hardware/software asset lifecycle.
 *
 * Tier 0 (Read):  list_assets, get_asset, list_software_licenses, get_license_compliance,
 *                  list_asset_contracts
 * Tier 1 (Write): create_asset, update_asset, retire_asset
 *
 * ServiceNow tables: alm_asset, alm_hardware, alm_license, ast_contract
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getItamToolDefinitions() {
  return [
    {
      name: 'list_assets',
      description: 'List IT assets with optional filtering by state, class, or assigned user',
      inputSchema: {
        type: 'object',
        properties: {
          asset_class: { type: 'string', description: 'Asset class: "alm_hardware", "alm_license", "alm_consumable"' },
          state: { type: 'string', description: 'Asset state: "in_use", "in_stock", "retired", "missing"' },
          assigned_to: { type: 'string', description: 'User sys_id to filter by assignee' },
          location: { type: 'string', description: 'Location name or sys_id' },
          query: { type: 'string', description: 'Additional encoded query' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_asset',
      description: 'Get full details of an IT asset including financial and lifecycle data',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Asset sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_asset',
      description: 'Create a new IT asset record. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          display_name: { type: 'string', description: 'Asset display name' },
          asset_tag: { type: 'string', description: 'Unique asset tag' },
          model_category: { type: 'string', description: 'Category sys_id (Hardware, Software, etc.)' },
          model: { type: 'string', description: 'Model sys_id' },
          serial_number: { type: 'string', description: 'Serial number' },
          assigned_to: { type: 'string', description: 'User sys_id' },
          location: { type: 'string', description: 'Location sys_id' },
          cost: { type: 'number', description: 'Purchase cost' },
          cost_center: { type: 'string', description: 'Cost center sys_id' },
          purchase_date: { type: 'string', description: 'Purchase date (YYYY-MM-DD)' },
        },
        required: ['display_name'],
      },
    },
    {
      name: 'update_asset',
      description: 'Update an IT asset record. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Asset sys_id' },
          fields: { type: 'object', description: 'Fields to update' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'retire_asset',
      description: 'Retire an IT asset (mark as disposed/retired). **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Asset sys_id' },
          disposal_reason: { type: 'string', description: 'Reason for retirement' },
          disposal_date: { type: 'string', description: 'Disposal date (YYYY-MM-DD)' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_software_licenses',
      description: 'List software license records with compliance status',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_license_compliance',
      description: 'Get license compliance summary — purchased vs. installed vs. in use counts',
      inputSchema: {
        type: 'object',
        properties: {
          license_sys_id: { type: 'string', description: 'Software license sys_id (optional — omit for all)' },
        },
        required: [],
      },
    },
    {
      name: 'list_asset_contracts',
      description: 'List asset maintenance and support contracts',
      inputSchema: {
        type: 'object',
        properties: {
          asset_sys_id: { type: 'string', description: 'Filter by linked asset' },
          active: { type: 'boolean', description: 'Filter to active contracts (default true)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'track_asset_lifecycle',
      description: 'Track asset lifecycle events and stage transitions',
      inputSchema: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Asset tag or sys_id' },
          new_stage: { type: 'string', description: 'Lifecycle stage: in_stock/in_use/in_maintenance/retired/disposed' },
          notes: { type: 'string', description: 'Transition notes' },
        },
        required: ['asset_id', 'new_stage'],
      },
    },
    {
      name: 'get_license_optimization',
      description: 'Analyze software license usage and recommend optimizations',
      inputSchema: {
        type: 'object',
        properties: {
          software_name: { type: 'string', description: 'Optional filter by software name' },
          threshold_pct: { type: 'number', description: 'Usage threshold percentage (default: 80)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeItamToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_assets': {
      let query = '';
      if (args.state) query = `install_status=${args.state}`;
      if (args.assigned_to) query = query ? `${query}^assigned_to=${args.assigned_to}` : `assigned_to=${args.assigned_to}`;
      if (args.location) query = query ? `${query}^locationLIKE${args.location}` : `locationLIKE${args.location}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const table = args.asset_class || 'alm_asset';
      const resp = await client.queryRecords({
        table,
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,display_name,asset_tag,serial_number,install_status,assigned_to,location,cost,purchase_date,sys_updated_on',
      });
      return { count: resp.count, assets: resp.records };
    }

    case 'get_asset': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.getRecord('alm_asset', args.sys_id);
      return result;
    }

    case 'create_asset': {
      if (!args.display_name) throw new ServiceNowError('display_name is required', 'INVALID_REQUEST');
      requireWrite();
      const payload: Record<string, any> = { display_name: args.display_name };
      const fields = ['asset_tag', 'model_category', 'model', 'serial_number', 'assigned_to', 'location', 'cost', 'cost_center', 'purchase_date'];
      for (const f of fields) { if (args[f] !== undefined) payload[f] = args[f]; }
      const result = await client.createRecord('alm_asset', payload);
      return { action: 'created', display_name: args.display_name, ...result };
    }

    case 'update_asset': {
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      requireWrite();
      const result = await client.updateRecord('alm_asset', args.sys_id, args.fields);
      return { action: 'updated', sys_id: args.sys_id, ...result };
    }

    case 'retire_asset': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      requireWrite();
      const payload: Record<string, any> = { install_status: 'retired' };
      if (args.disposal_reason) payload.disposal_reason = args.disposal_reason;
      if (args.disposal_date) payload.disposal_date = args.disposal_date;
      const result = await client.updateRecord('alm_asset', args.sys_id, payload);
      return { action: 'retired', sys_id: args.sys_id, ...result };
    }

    case 'list_software_licenses': {
      const resp = await client.queryRecords({
        table: 'alm_license',
        query: args.query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,display_name,license_count,license_available,license_inuse,cost,product,vendor,expiry_date,sys_updated_on',
      });
      return { count: resp.count, licenses: resp.records };
    }

    case 'get_license_compliance': {
      const query = args.license_sys_id ? `sys_id=${args.license_sys_id}` : undefined;
      const resp = await client.queryRecords({
        table: 'alm_license',
        query,
        limit: args.license_sys_id ? 1 : 100,
        fields: 'sys_id,display_name,product,license_count,license_available,license_inuse,cost,expiry_date',
      });
      const summary = resp.records.map((r: any) => ({
        license: r.display_name,
        product: r.product,
        purchased: r.license_count,
        in_use: r.license_inuse,
        available: r.license_available,
        compliance: Number(r.license_inuse) <= Number(r.license_count) ? 'compliant' : 'over-licensed',
        expires: r.expiry_date,
      }));
      return { count: resp.count, compliance_report: summary };
    }

    case 'list_asset_contracts': {
      let query = args.active !== false ? 'active=true' : '';
      if (args.asset_sys_id) query = query ? `${query}^asset=${args.asset_sys_id}` : `asset=${args.asset_sys_id}`;
      const resp = await client.queryRecords({
        table: 'ast_contract',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,number,short_description,vendor,start_date,end_date,cost,active,sys_updated_on',
      });
      return { count: resp.count, contracts: resp.records };
    }

    case 'track_asset_lifecycle': {
      if (!args.asset_id || !args.new_stage)
        throw new ServiceNowError('asset_id and new_stage are required', 'INVALID_REQUEST');
      requireWrite();
      const stageMap: Record<string, string> = {
        in_stock: '6', in_use: '1', in_maintenance: '7', retired: '8', disposed: '9',
      };
      let sysId = args.asset_id;
      if (!/^[0-9a-f]{32}$/i.test(args.asset_id)) {
        const resp = await client.queryRecords({ table: 'alm_asset', query: `asset_tag=${args.asset_id}^ORsys_id=${args.asset_id}`, limit: 1 });
        if (resp.count === 0) throw new ServiceNowError(`Asset not found: ${args.asset_id}`, 'NOT_FOUND');
        sysId = resp.records[0].sys_id;
      }
      const result = await client.updateRecord('alm_asset', sysId, {
        install_status: stageMap[args.new_stage] || args.new_stage,
        work_notes: args.notes || '',
      });
      return { action: 'lifecycle_updated', sys_id: sysId, new_stage: args.new_stage, ...result };
    }

    case 'get_license_optimization': {
      const threshold = args.threshold_pct || 80;
      let query = '';
      if (args.software_name) query = `display_nameLIKE${args.software_name}`;
      const resp = await client.queryRecords({
        table: 'alm_license',
        query: query || undefined,
        limit: 100,
        fields: 'sys_id,display_name,product,license_count,license_available,license_inuse,cost,expiry_date',
      });
      const recommendations = resp.records.map((r: any) => {
        const total = Number(r.license_count) || 0;
        const inUse = Number(r.license_inuse) || 0;
        const available = Number(r.license_available) || 0;
        const usagePct = total > 0 ? Math.round((inUse / total) * 100) : 0;
        let recommendation = 'optimal';
        if (usagePct < threshold) recommendation = 'underutilized — consider reducing licenses';
        if (inUse > total) recommendation = 'over-allocated — purchase additional licenses';
        return {
          license: r.display_name,
          product: r.product,
          total,
          in_use: inUse,
          available,
          usage_pct: usagePct,
          cost: r.cost,
          expires: r.expiry_date,
          recommendation,
        };
      });
      const underutilized = recommendations.filter((r: any) => r.recommendation.startsWith('underutilized'));
      const overAllocated = recommendations.filter((r: any) => r.recommendation.startsWith('over-allocated'));
      return {
        total_licenses: resp.count,
        threshold_pct: threshold,
        underutilized_count: underutilized.length,
        over_allocated_count: overAllocated.length,
        recommendations,
      };
    }

    default:
      return null;
  }
}
