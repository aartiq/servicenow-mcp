/**
 * Service Portal & UI Builder tools — manage portals, pages, widgets, and themes.
 * Read tools: Tier 0. Write/deploy tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by snow-flow's "Deployment" category tools.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getPortalToolDefinitions() {
  return [
    // ── Service Portal ──────────────────────────────────────────────────────
    {
      name: 'list_portals',
      description: 'List all Service Portal configurations available in the instance',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search portals by title or url_suffix' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'create_portal',
      description: 'Create a new Service Portal configuration (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Human-readable portal title' },
          url_suffix: {
            type: 'string',
            description: 'URL path segment for the portal (e.g. "myportal" → /myportal)',
          },
          default_homepage: {
            type: 'string',
            description: 'sys_id of the default homepage sp_page record',
          },
          theme: { type: 'string', description: 'sys_id of the sp_theme to apply' },
          logo: { type: 'string', description: 'sys_id of the logo attachment record' },
          description: { type: 'string', description: 'Short description of the portal' },
        },
        required: ['title', 'url_suffix'],
      },
    },
    {
      name: 'create_portal_page',
      description: 'Create a new page inside a Service Portal (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Page title' },
          id: { type: 'string', description: 'Unique page ID used in the URL (e.g. "my-page")' },
          portal_sys_id: { type: 'string', description: 'sys_id of the parent Service Portal' },
          description: { type: 'string', description: 'Brief description of the page purpose' },
        },
        required: ['title', 'id', 'portal_sys_id'],
      },
    },
    {
      name: 'get_portal',
      description: 'Get full configuration details of a Service Portal by sys_id or URL suffix',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Portal sys_id or url_suffix (e.g. "sp", "itsm")' },
        },
        required: ['id'],
      },
    },
    {
      name: 'list_portal_pages',
      description: 'List pages that belong to a Service Portal',
      inputSchema: {
        type: 'object',
        properties: {
          portal_sys_id: { type: 'string', description: 'sys_id of the parent portal' },
          query: { type: 'string', description: 'Filter pages by title or id' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: ['portal_sys_id'],
      },
    },
    {
      name: 'get_portal_page',
      description: 'Get details of a specific Service Portal page including its layout',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Page sys_id' },
        },
        required: ['sys_id'],
      },
    },
    // ── Widgets ──────────────────────────────────────────────────────────────
    {
      name: 'list_portal_widgets',
      description: 'List Service Portal widgets with optional search by name or category',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search widgets by name or description' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_portal_widget',
      description: 'Get full source code (HTML, CSS, client/server scripts) of a Service Portal widget',
      inputSchema: {
        type: 'object',
        properties: {
          id_or_sysid: { type: 'string', description: 'Widget sys_id or id field (e.g. "widget-cool-clock")' },
        },
        required: ['id_or_sysid'],
      },
    },
    {
      name: 'create_portal_widget',
      description: 'Create a new Service Portal widget with template, CSS, and scripts (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable widget name' },
          id: { type: 'string', description: 'Unique widget ID/handle (e.g. "my-custom-widget")' },
          template: { type: 'string', description: 'Angular HTML template' },
          css: { type: 'string', description: 'SCSS/CSS styles' },
          client_script: { type: 'string', description: 'Client-side controller JavaScript' },
          server_script: { type: 'string', description: 'Server-side script (GlideRecord calls)' },
          option_schema: { type: 'string', description: 'JSON array defining widget options' },
          demo_data: { type: 'string', description: 'JSON object with demo data for preview' },
        },
        required: ['name', 'id'],
      },
    },
    {
      name: 'update_portal_widget',
      description: 'Update an existing Service Portal widget\'s source code (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Widget sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update: template, css, client_script, server_script, name, etc.',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_widget_instances',
      description: 'List instances of a specific widget placed on portal pages',
      inputSchema: {
        type: 'object',
        properties: {
          widget_sys_id: { type: 'string', description: 'Widget sys_id to find instances of' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['widget_sys_id'],
      },
    },
    // ── UI Builder (Next Experience) ────────────────────────────────────────
    {
      name: 'list_ux_apps',
      description: 'List Next Experience (UI Builder) applications',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search apps by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ux_app',
      description: 'Get configuration details of a Next Experience application',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'App sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'list_ux_pages',
      description: 'List pages within a Next Experience (UI Builder) application',
      inputSchema: {
        type: 'object',
        properties: {
          app_sys_id: { type: 'string', description: 'Parent UX app sys_id' },
          query: { type: 'string', description: 'Filter pages by name' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: ['app_sys_id'],
      },
    },
    // ── Themes & Branding ───────────────────────────────────────────────────
    {
      name: 'list_portal_themes',
      description: 'List Service Portal themes (color palettes, CSS variables)',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_portal_theme',
      description: 'Get full details of a Service Portal theme including CSS variables',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Theme sys_id' },
        },
        required: ['sys_id'],
      },
    },
  ];
}

export async function executePortalToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // ── Service Portal ──────────────────────────────────────────────────────
    case 'create_portal': {
      requireWrite();
      if (!args.title || !args.url_suffix)
        throw new ServiceNowError('title and url_suffix are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        title: args.title,
        url_suffix: args.url_suffix,
      };
      if (args.default_homepage) data.default_homepage = args.default_homepage;
      if (args.theme) data.theme = args.theme;
      if (args.logo) data.logo = args.logo;
      if (args.description) data.description = args.description;
      const result = await client.createRecord('sp_portal', data);
      return { ...result, summary: `Created portal "${args.title}" at /${args.url_suffix}` };
    }
    case 'create_portal_page': {
      requireWrite();
      if (!args.title || !args.id || !args.portal_sys_id)
        throw new ServiceNowError('title, id, and portal_sys_id are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        title: args.title,
        id: args.id,
        sp_portal: args.portal_sys_id,
      };
      if (args.description) data.description = args.description;
      const result = await client.createRecord('sp_page', data);
      return { ...result, summary: `Created portal page "${args.title}" (id: ${args.id})` };
    }
    case 'list_portals': {
      const parts: string[] = [];
      if (args.query) parts.push(`titleCONTAINS${args.query}^ORurl_suffixCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sp_portal',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,title,url_suffix,default_homepage,theme,sys_updated_on',
      });
    }
    case 'get_portal': {
      if (!args.id) throw new ServiceNowError('id is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.id)) {
        return await client.getRecord('sp_portal', args.id);
      }
      const resp = await client.queryRecords({
        table: 'sp_portal',
        query: `url_suffix=${args.id}^ORtitle=${args.id}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Portal not found: ${args.id}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_portal_pages': {
      if (!args.portal_sys_id) throw new ServiceNowError('portal_sys_id is required', 'INVALID_REQUEST');
      const parts = [`sp_portal=${args.portal_sys_id}`];
      if (args.query) parts.push(`titleCONTAINS${args.query}^ORidCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sp_page',
        query: parts.join('^'),
        limit: args.limit ?? 50,
        fields: 'sys_id,title,id,sp_portal,sys_updated_on',
      });
    }
    case 'get_portal_page': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sp_page', args.sys_id);
    }
    // ── Widgets ──────────────────────────────────────────────────────────────
    case 'list_portal_widgets': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sp_widget',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 50,
        fields: 'sys_id,name,id,description,category,sys_updated_on',
      });
    }
    case 'get_portal_widget': {
      if (!args.id_or_sysid) throw new ServiceNowError('id_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.id_or_sysid)) {
        return await client.getRecord('sp_widget', args.id_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sp_widget',
        query: `id=${args.id_or_sysid}^ORname=${args.id_or_sysid}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Widget not found: ${args.id_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_portal_widget': {
      requireWrite();
      if (!args.name || !args.id) throw new ServiceNowError('name and id are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        id: args.id,
        template: args.template || '',
        css: args.css || '',
        client_script: args.client_script || '',
        script: args.server_script || '',
      };
      if (args.option_schema) data.option_schema = args.option_schema;
      if (args.demo_data) data.demo_data = args.demo_data;
      const result = await client.createRecord('sp_widget', data);
      return { ...result, summary: `Created widget "${args.name}" with id "${args.id}"` };
    }
    case 'update_portal_widget': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      // Map friendly field name
      if (args.fields.server_script !== undefined) {
        args.fields.script = args.fields.server_script;
        delete args.fields.server_script;
      }
      const result = await client.updateRecord('sp_widget', args.sys_id, args.fields);
      return { ...result, summary: `Updated widget ${args.sys_id}` };
    }
    case 'list_widget_instances': {
      if (!args.widget_sys_id) throw new ServiceNowError('widget_sys_id is required', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sp_instance',
        query: `sp_widget=${args.widget_sys_id}`,
        limit: args.limit ?? 25,
        fields: 'sys_id,sp_widget,sp_container,sp_page,sys_updated_on',
      });
    }
    // ── UI Builder ──────────────────────────────────────────────────────────
    case 'list_ux_apps': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_ux_app_config',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,sys_scope,sys_updated_on',
      });
    }
    case 'get_ux_app': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_ux_app_config', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'sys_ux_app_config',
        query: `name=${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`UX App not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_ux_pages': {
      if (!args.app_sys_id) throw new ServiceNowError('app_sys_id is required', 'INVALID_REQUEST');
      const parts = [`ux_app_config=${args.app_sys_id}`];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_ux_page',
        query: parts.join('^'),
        limit: args.limit ?? 50,
        fields: 'sys_id,name,ux_app_config,sys_updated_on',
      });
    }
    // ── Themes ──────────────────────────────────────────────────────────────
    case 'list_portal_themes': {
      return await client.queryRecords({
        table: 'sp_theme',
        limit: args.limit ?? 25,
        fields: 'sys_id,name,css_variables,sys_updated_on',
      });
    }
    case 'get_portal_theme': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sp_theme', args.sys_id);
    }
    default:
      return null;
  }
}
