/**
 * Scoped Application (App Studio) tools — manage ServiceNow scoped apps.
 * Read tools: Tier 0. Write/create tools: Tier 1 (WRITE_ENABLED=true).
 * ServiceNow table: sys_app (scoped applications), sys_scope (application scopes).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

/** Slugify an app name into the scope suffix (lowercase, underscores, alnum only). */
function appNameSlug(name: string): string {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'app';
}

/**
 * The instance's REGISTERED vendor prefix for custom apps. Primary source is the
 * `glide.appcreator.company.code` property; falls back to the most common `x_<code>_`
 * among existing custom scopes (ignoring ServiceNow's own `x_snc_`). Returns '' if unknown.
 */
async function getInstanceVendorPrefix(client: ServiceNowClient): Promise<string> {
  try {
    const r = await client.queryRecords({
      table: 'sys_properties',
      query: 'name=glide.appcreator.company.code',
      fields: 'value',
      limit: 1,
    });
    const code = ((r.records?.[0] as any)?.value || '').toString().trim();
    if (code) return code.toLowerCase();
  } catch { /* fall through */ }
  try {
    const r = await client.queryRecords({
      table: 'sys_scope',
      query: 'scopeSTARTSWITHx_^scopeNOT LIKEx_snc_',
      fields: 'scope',
      limit: 100,
    });
    const counts: Record<string, number> = {};
    for (const s of (r.records || []) as any[]) {
      const m = String(s.scope).match(/^x_([a-z0-9]+)_/);
      if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top) return top[0];
  } catch { /* fall through */ }
  return '';
}

export function getAppStudioToolDefinitions() {
  return [
    // ── Scoped Applications ─────────────────────────────────────────────────
    {
      name: 'list_scoped_apps',
      description: 'List scoped applications (custom apps) installed in the instance',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search apps by name or scope prefix' },
          active: { type: 'boolean', description: 'Filter to active apps only' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_scoped_app',
      description: 'Get full details of a scoped application by sys_id or scope name',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'App sys_id or scope name (e.g. "x_myco_myapp")' },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_scoped_app',
      description:
        'Create a new scoped application in App Studio (requires WRITE_ENABLED=true). ' +
        'The scope follows x_<vendor>_<appname>, where <vendor> is the instance\'s REGISTERED ' +
        'vendor prefix (glide.appcreator.company.code), not an arbitrary value. Leave scope blank ' +
        'to auto-derive it from the instance vendor prefix + app name; if you pass a scope whose ' +
        'vendor segment differs from the instance prefix, it is corrected to the registered one.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable application name' },
          scope: {
            type: 'string',
            description: 'Optional. Scope like "x_<instanceVendor>_myapp". If omitted, derived from the instance vendor prefix + app name. Must start with "x_".',
          },
          version: {
            type: 'string',
            description: 'Application version string (e.g. "1.0.0"). Defaults to "1.0.0".',
          },
          short_description: { type: 'string', description: 'Short description shown in the app list' },
          description: { type: 'string', description: 'Full description of the application' },
          vendor: { type: 'string', description: 'Vendor or author name' },
          active: { type: 'boolean', description: 'Activate the app immediately (default: true)' },
          logo: { type: 'string', description: 'App logo attachment sys_id (optional)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_scoped_app',
      description: 'Update an existing scoped application (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'App sys_id' },
          fields: {
            type: 'object',
            description:
              'Fields to update (name, version, short_description, description, active, vendor, etc.)',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
  ];
}

export async function executeAppStudioToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_scoped_apps': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORscopeCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_app',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,scope,version,short_description,active,vendor,sys_updated_on',
      });
    }

    case 'get_scoped_app': {
      if (!args.id) throw new ServiceNowError('id is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.id)) {
        return await client.getRecord('sys_app', args.id);
      }
      const resp = await client.queryRecords({
        table: 'sys_app',
        query: `scope=${args.id}^ORname=${args.id}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Scoped app not found: ${args.id}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'create_scoped_app': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');

      // Determine the instance's REGISTERED vendor prefix so we never create an app under an
      // arbitrary/guessed prefix (e.g. x_ukpn_...). ServiceNow custom apps must use the company code.
      const vendorCode = await getInstanceVendorPrefix(client);
      let scope: string = args.scope;
      let note: string | undefined;

      if (!scope) {
        if (!vendorCode) {
          throw new ServiceNowError(
            'No scope given and the instance vendor prefix could not be determined ' +
            '(glide.appcreator.company.code is empty). Pass an explicit scope like x_<vendor>_<app>.',
            'INVALID_REQUEST',
          );
        }
        scope = `x_${vendorCode}_${appNameSlug(args.name)}`;
        note = `Scope derived from the instance's registered vendor prefix (glide.appcreator.company.code="${vendorCode}").`;
      } else {
        if (!scope.startsWith('x_'))
          throw new ServiceNowError('scope must start with "x_" (e.g. x_myco_myapp)', 'INVALID_REQUEST');
        // If the caller's vendor segment differs from the instance's registered prefix, correct it.
        if (vendorCode) {
          const m = scope.match(/^x_([a-z0-9]+)_(.+)$/i);
          if (m && m[1].toLowerCase() !== vendorCode.toLowerCase()) {
            const corrected = `x_${vendorCode}_${m[2]}`;
            note = `Corrected the vendor prefix from "x_${m[1]}_" to the instance's registered prefix "x_${vendorCode}_" (requested "${scope}").`;
            scope = corrected;
          }
        }
      }

      const data: Record<string, any> = {
        name: args.name,
        scope,
        version: args.version ?? '1.0.0',
        active: args.active !== false,
      };
      if (args.short_description) data.short_description = args.short_description;
      if (args.description) data.description = args.description;
      if (args.vendor) data.vendor = args.vendor;
      if (args.logo) data.logo = args.logo;
      // Creating a sys_app makes ServiceNow create a "default" update set for the new scope and repoint
      // the caller's current update set preference at it. Restore the caller's previous update set so
      // later changes don't silently land in the new app's default set.
      const prefQuery = 'name=sys_update_set^user=javascript:gs.getUserID()';
      const before = await client.queryRecords({ table: 'sys_user_preference', query: prefQuery, fields: 'sys_id,value', limit: 1 }).catch(() => undefined);
      const beforeValue = before?.records?.[0]?.value ? String(before.records[0].value) : undefined;
      const result = await client.createRecord('sys_app', data);
      let updateSetNote: string | undefined;
      if (beforeValue) {
        try {
          const after = await client.queryRecords({ table: 'sys_user_preference', query: prefQuery, fields: 'sys_id,value', limit: 1 });
          const afterRec = after.records?.[0] as any;
          if (afterRec && String(afterRec.value) !== beforeValue) {
            await client.updateRecord('sys_user_preference', String(afterRec.sys_id), { value: beforeValue });
            updateSetNote = 'ServiceNow switched your current update set to the new app\'s default update set; it was restored to your previous one.';
          } else if (!afterRec) {
            const me = await client.queryRecords({ table: 'sys_user', query: 'sys_id=javascript:gs.getUserID()', fields: 'sys_id', limit: 1 });
            const uid = me.records?.[0]?.sys_id;
            if (uid) await client.createRecord('sys_user_preference', { name: 'sys_update_set', user: String(uid), value: beforeValue, type: 'string' });
            updateSetNote = 'ServiceNow reset your current update set while creating the app; it was restored to your previous one.';
          }
        } catch { /* best effort */ }
      }
      return {
        ...result,
        ...(updateSetNote ? { update_set_note: updateSetNote } : {}),
        scope,
        summary: `Created scoped app "${args.name}" with scope "${scope}"`,
        ...(note ? { note } : {}),
      };
    }

    case 'update_scoped_app': {
      requireWrite();
      if (!args.sys_id || !args.fields)
        throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sys_app', args.sys_id, args.fields);
      return { ...result, summary: `Updated scoped app ${args.sys_id}` };
    }

    default:
      return null;
  }
}
