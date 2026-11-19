/**
 * CMDB Reconciliation tools — find duplicates, orphans, stale CIs, and reconcile.
 * Read tools: Tier 0. Reconcile action: Tier 2 (CMDB_WRITE_ENABLED=true).
 *
 * CSDM life cycle: CIs carry both the legacy status fields (install_status, operational_status)
 * and the CSDM life cycle fields (life_cycle_stage, life_cycle_stage_status, references keyed by
 * name). Reads return both. cmdb_reconcile retires with the legacy fields by default; retire_using
 * "life_cycle" sets End of Life / Retired, "both" sets both, and "auto" follows
 * csdm.lifecycle.migration.activated.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireCmdbWrite } from '../utils/permissions.js';

export function getCmdbReconciliationToolDefinitions() {
  return [
    {
      name: 'cmdb_find_duplicates',
      description: 'Find duplicate CIs by matching on specified fields (in-memory grouping)',
      inputSchema: {
        type: 'object',
        properties: {
          ci_class: { type: 'string', description: 'CI class table (default cmdb_ci)' },
          match_fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Fields to match on for duplicate detection (default: name, serial_number, ip_address)',
          },
          limit: { type: 'number', description: 'Max CIs to scan (default 100)' },
        },
        required: [],
      },
    },
    {
      name: 'cmdb_find_orphans',
      description: 'Find CIs with no relationships in cmdb_rel_ci',
      inputSchema: {
        type: 'object',
        properties: {
          ci_class: { type: 'string', description: 'CI class table (default cmdb_ci)' },
          limit: { type: 'number', description: 'Max orphan CIs to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'cmdb_find_stale',
      description: 'Find CIs not updated within a given number of days that are still operational. "Operational" can mean the legacy operational_status, the CSDM life cycle stage (life_cycle_stage = Operational), or either',
      inputSchema: {
        type: 'object',
        properties: {
          ci_class: { type: 'string', description: 'CI class table (default cmdb_ci)' },
          lifecycle_model: { type: 'string', enum: ['legacy', 'life_cycle', 'either'], description: 'How to tell a CI is operational: legacy (operational_status = 1, default), life_cycle (CSDM life_cycle_stage = Operational) or either' },
          days_threshold: { type: 'number', description: 'Number of days since last update to consider stale (default 90)' },
          limit: { type: 'number', description: 'Max stale CIs to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'cmdb_reconcile',
      description: 'Act on duplicate, stale, or orphan CIs — merge, retire, or remove (requires CMDB_WRITE_ENABLED). Supports dry_run mode.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['merge_duplicates', 'retire_stale', 'remove_orphans'],
            description: 'Reconciliation action to perform',
          },
          targets: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of CI sys_ids to act on',
          },
          dry_run: { type: 'boolean', description: 'Preview changes without applying (default true)' },
          retire_using: {
            type: 'string',
            enum: ['install_status', 'life_cycle', 'both', 'auto'],
            description: 'How a CI is retired: install_status (default: operational_status=6, install_status=7), life_cycle (CSDM life_cycle_stage "End of Life", life_cycle_stage_status "Retired"), both, or auto (life_cycle when csdm.lifecycle.migration.activated is true, else install_status)',
          },
        },
        required: ['action', 'targets'],
      },
    },
  ];
}

const LEGACY_RETIRE = { operational_status: 6, install_status: 7 };
const LIFE_CYCLE_RETIRE = { life_cycle_stage: 'End of Life', life_cycle_stage_status: 'Retired' };
const LIFE_CYCLE_FIELDS = 'install_status,life_cycle_stage,life_cycle_stage_status';

/** The fields that retire a CI for the chosen model, after checking the life cycle values exist. */
export async function retireFields(client: ServiceNowClient, mode: unknown): Promise<{ mode: string; fields: Record<string, any>; detail: string }> {
  let m = String(mode || 'install_status').toLowerCase();
  if (!['install_status', 'life_cycle', 'both', 'auto'].includes(m)) {
    throw new ServiceNowError('retire_using must be install_status, life_cycle, both or auto', 'INVALID_REQUEST');
  }
  if (m === 'auto') {
    const p = await client.queryRecords({ table: 'sys_properties', query: 'name=csdm.lifecycle.migration.activated', fields: 'value', limit: 1 }).catch(() => ({ records: [] as any[] }));
    m = String((p.records[0] as any)?.value) === 'true' ? 'life_cycle' : 'install_status';
  }
  if (m !== 'install_status') {
    const [stage, status] = await Promise.all([
      client.queryRecords({ table: 'life_cycle_stage', query: 'name=End of Life', fields: 'name', limit: 1 }).catch(() => ({ records: [] as any[] })),
      client.queryRecords({ table: 'life_cycle_stage_status', query: 'name=Retired', fields: 'name', limit: 1 }).catch(() => ({ records: [] as any[] })),
    ]);
    if (!stage.records.length || !status.records.length) {
      throw new ServiceNowError('CSDM life cycle values "End of Life" / "Retired" were not found (life_cycle_stage, life_cycle_stage_status). Use retire_using: "install_status" on this instance.', 'INVALID_REQUEST');
    }
  }
  const fields = m === 'install_status' ? { ...LEGACY_RETIRE } : m === 'life_cycle' ? { ...LIFE_CYCLE_RETIRE } : { ...LEGACY_RETIRE, ...LIFE_CYCLE_RETIRE };
  const detail = m === 'install_status'
    ? 'operational_status=6 (retired)'
    : m === 'life_cycle'
      ? 'life_cycle_stage=End of Life, life_cycle_stage_status=Retired'
      : 'operational_status=6, install_status=7, life_cycle_stage=End of Life, life_cycle_stage_status=Retired';
  return { mode: m, fields, detail };
}

const CMDB_RECON_TOOL_NAMES = new Set([
  'cmdb_find_duplicates', 'cmdb_find_orphans', 'cmdb_find_stale', 'cmdb_reconcile',
]);

export async function executeCmdbReconciliationToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (!CMDB_RECON_TOOL_NAMES.has(name)) return null;

  switch (name) {
    case 'cmdb_find_duplicates': {
      const ciClass = args.ci_class || 'cmdb_ci';
      const matchFields = args.match_fields && Array.isArray(args.match_fields) && args.match_fields.length > 0
        ? args.match_fields
        : ['name', 'serial_number', 'ip_address'];
      const limit = args.limit || 100;

      const fields = ['sys_id', 'name', 'sys_class_name', ...matchFields, ...LIFE_CYCLE_FIELDS.split(',')].filter(
        (v, i, a) => a.indexOf(v) === i
      );

      const resp = await client.queryRecords({
        table: ciClass,
        query: 'active=true',
        limit,
        fields: fields.join(','),
      });

      // Group CIs by composite key of match fields
      const groups = new Map<string, any[]>();
      for (const record of resp.records) {
        const key = matchFields
          .map((f: string) => String(record[f] ?? '').toLowerCase().trim())
          .join('||');
        // Skip records where all match fields are empty
        const allEmpty = matchFields.every((f: string) => !record[f] || String(record[f]).trim() === '');
        if (allEmpty) continue;

        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(record);
      }

      // Filter to groups with more than one CI (actual duplicates)
      const duplicates: { match_key: string; count: number; records: any[] }[] = [];
      for (const [key, records] of groups) {
        if (records.length > 1) {
          duplicates.push({ match_key: key, count: records.length, records });
        }
      }

      return {
        ci_class: ciClass,
        match_fields: matchFields,
        scanned: resp.records.length,
        duplicate_groups: duplicates.length,
        duplicates,
      };
    }

    case 'cmdb_find_orphans': {
      const ciClass = args.ci_class || 'cmdb_ci';
      const limit = args.limit || 50;

      const ciResp = await client.queryRecords({
        table: ciClass,
        query: 'active=true',
        limit,
        fields: `sys_id,name,sys_class_name,operational_status,${LIFE_CYCLE_FIELDS}`,
      });

      const orphans: any[] = [];
      for (const ci of ciResp.records) {
        const sysId = String(ci.sys_id);
        // Check for any relationship (as parent or child)
        const relResp = await client.queryRecords({
          table: 'cmdb_rel_ci',
          query: `parent=${sysId}^ORchild=${sysId}`,
          limit: 1,
          fields: 'sys_id',
        });
        if (relResp.count === 0) {
          orphans.push(ci);
        }
      }

      return {
        ci_class: ciClass,
        scanned: ciResp.records.length,
        orphan_count: orphans.length,
        orphans,
      };
    }

    case 'cmdb_find_stale': {
      const ciClass = args.ci_class || 'cmdb_ci';
      const daysThreshold = args.days_threshold || 90;
      const limit = args.limit || 50;

      const model = String(args.lifecycle_model || 'legacy').toLowerCase();
      const operational: Record<string, string> = {
        legacy: 'operational_status=1',
        life_cycle: 'life_cycle_stage.name=Operational',
        either: 'operational_status=1^ORlife_cycle_stage.name=Operational',
      };
      if (!operational[model]) throw new ServiceNowError('lifecycle_model must be legacy, life_cycle or either', 'INVALID_REQUEST');
      const query = `sys_updated_on<javascript:gs.daysAgo(${daysThreshold})^${operational[model]}^active=true`;

      const resp = await client.queryRecords({
        table: ciClass,
        query,
        limit,
        fields: `sys_id,name,sys_class_name,operational_status,sys_updated_on,discovery_source,${LIFE_CYCLE_FIELDS}`,
      });

      return {
        ci_class: ciClass,
        days_threshold: daysThreshold,
        stale_count: resp.count,
        stale_cis: resp.records,
        ...(model !== 'legacy' ? { lifecycle_model: model } : {}),
      };
    }

    case 'cmdb_reconcile': {
      requireCmdbWrite();
      if (!args.action) throw new ServiceNowError('action is required', 'INVALID_REQUEST');
      if (!args.targets || !Array.isArray(args.targets) || args.targets.length === 0) {
        throw new ServiceNowError('targets must be a non-empty array of sys_ids', 'INVALID_REQUEST');
      }

      const validActions = ['merge_duplicates', 'retire_stale', 'remove_orphans'];
      if (!validActions.includes(args.action)) {
        throw new ServiceNowError(
          `Invalid action: "${args.action}". Must be one of: ${validActions.join(', ')}`,
          'INVALID_REQUEST'
        );
      }

      const dryRun = args.dry_run !== false;
      const retire = await retireFields(client, args.retire_using);
      const results: { sys_id: string; action: string; status: string; detail: string }[] = [];

      switch (args.action) {
        case 'merge_duplicates': {
          // First target is the survivor; remaining are merged into it
          const [survivorId, ...duplicateIds] = args.targets;
          if (duplicateIds.length === 0) {
            throw new ServiceNowError('merge_duplicates requires at least 2 targets (first is survivor)', 'INVALID_REQUEST');
          }

          if (dryRun) {
            results.push({ sys_id: survivorId, action: 'keep', status: 'dry_run', detail: 'Would be kept as the survivor CI' });
            for (const dupId of duplicateIds) {
              results.push({ sys_id: dupId, action: 'retire', status: 'dry_run', detail: 'Would be retired and relationships moved to survivor' });
            }
          } else {
            results.push({ sys_id: survivorId, action: 'keep', status: 'completed', detail: 'Kept as survivor CI' });
            for (const dupId of duplicateIds) {
              // Move relationships from duplicate to survivor
              const parentRels = await client.queryRecords({
                table: 'cmdb_rel_ci',
                query: `parent=${dupId}`,
                limit: 200,
                fields: 'sys_id,child,type',
              });
              for (const rel of parentRels.records) {
                await client.updateRecord('cmdb_rel_ci', String(rel.sys_id), { parent: survivorId });
              }

              const childRels = await client.queryRecords({
                table: 'cmdb_rel_ci',
                query: `child=${dupId}`,
                limit: 200,
                fields: 'sys_id,parent,type',
              });
              for (const rel of childRels.records) {
                await client.updateRecord('cmdb_rel_ci', String(rel.sys_id), { child: survivorId });
              }

              // Retire the duplicate
              await client.updateRecord('cmdb_ci', dupId, retire.fields);
              results.push({ sys_id: dupId, action: 'retire', status: 'completed', detail: `Retired; ${parentRels.count + childRels.count} relationships moved to survivor` });
            }
          }
          break;
        }

        case 'retire_stale': {
          for (const sysId of args.targets) {
            if (dryRun) {
              results.push({ sys_id: sysId, action: 'retire', status: 'dry_run', detail: `Would set ${retire.detail}` });
            } else {
              await client.updateRecord('cmdb_ci', sysId, retire.fields);
              results.push({ sys_id: sysId, action: 'retire', status: 'completed', detail: `Set ${retire.detail}` });
            }
          }
          break;
        }

        case 'remove_orphans': {
          for (const sysId of args.targets) {
            if (dryRun) {
              results.push({ sys_id: sysId, action: 'retire', status: 'dry_run', detail: `Would retire orphan CI (${retire.detail})` });
            } else {
              await client.updateRecord('cmdb_ci', sysId, retire.fields);
              results.push({ sys_id: sysId, action: 'retire', status: 'completed', detail: `Orphan CI retired (${retire.detail})` });
            }
          }
          break;
        }
      }

      return {
        action: args.action,
        dry_run: dryRun,
        retire_using: retire.mode,
        target_count: args.targets.length,
        results,
      };
    }

    default:
      return null;
  }
}
