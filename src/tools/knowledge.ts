/**
 * Knowledge Base tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { isScriptingEnabled, requireWrite } from '../utils/permissions.js';

export function getKnowledgeToolDefinitions() {
  return [
    {
      name: 'list_knowledge_bases',
      description: 'List all knowledge bases available in the instance',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'search_knowledge',
      description: 'Search knowledge base articles by keyword',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords or phrase' },
          limit: { type: 'number', description: 'Max articles (default: 10)' },
          knowledge_base: { type: 'string', description: 'Optional: filter by knowledge base sys_id or name' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_knowledge_article',
      description: 'Get the full content of a knowledge article by number (KB...) or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Article number (KB...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'create_knowledge_article',
      description: 'Create a new knowledge article (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Article title' },
          text: { type: 'string', description: 'Article body (HTML or plain text)' },
          knowledge_base_sys_id: { type: 'string', description: 'sys_id of the target knowledge base' },
          category: { type: 'string', description: 'Article category' },
        },
        required: ['short_description', 'text', 'knowledge_base_sys_id'],
      },
    },
    {
      name: 'update_knowledge_article',
      description: 'Update a knowledge article (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the article' },
          fields: { type: 'object', description: 'Key-value pairs to update (e.g., {"text": "...updated content..."})' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'publish_knowledge_article',
      description: 'Publish a draft knowledge article (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the article to publish' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'retire_knowledge_article',
      description: '[Write] Retire a knowledge article (mark as outdated)',
      inputSchema: {
        type: 'object',
        properties: {
          article_id: { type: 'string', description: 'Article number (KB...) or sys_id' },
        },
        required: ['article_id'],
      },
    },
  ];
}

/**
 * Publish or retire an article the way the platform's Publish/Retire UI actions do. Knowledge
 * articles move through their knowledge base's publish/retire workflow, so a plain Table API
 * write of workflow_state is reverted (it stays draft). With SCRIPTING_ENABLED we call
 * KnowledgeUIAction server-side (instant or approval flow, as configured); otherwise we try the
 * Table API and report the state the article actually ended up in.
 */
async function runKbLifecycle(client: ServiceNowClient, sysId: string, action: 'publish' | 'retire'): Promise<{ state: string; method: string; record: any; note?: string }> {
  const target = action === 'publish' ? 'published' : 'retired';
  let method = 'table_api';
  if (isScriptingEnabled()) {
    method = 'knowledge_ui_action';
    const call = action === 'publish' ? 'publish(gr)' : 'retireKnowledgeRecord(gr)';
    const exec = await client.executeScript(
      `var gr = new GlideRecord('kb_knowledge');\n` +
      `if (!gr.get(${JSON.stringify(sysId)})) return { error: 'not found' };\n` +
      `new global.KnowledgeUIAction().${call};\n` +
      `return { ok: true };`,
    );
    const out = exec?.result ?? exec?.output;
    if (exec?.ok === false || out?.error) {
      throw new ServiceNowError(`Knowledge ${action} failed: ${exec?.error || out?.error}`, 'OPERATION_FAILED');
    }
  } else {
    await client.updateRecord('kb_knowledge', sysId, { workflow_state: target });
  }
  const record = await client.getRecord('kb_knowledge', sysId);
  const state = String((record as any).workflow_state ?? '');
  let note: string | undefined;
  if (state !== target) {
    note = method === 'table_api'
      ? `The knowledge base workflow kept the article in "${state}". Articles must go through the KB ${action} workflow; enable SCRIPTING_ENABLED so NowAIKit can run it the way the ${action === 'publish' ? 'Publish' : 'Retire'} button does.`
      : `The knowledge base ${action} workflow left the article in "${state}" (for example awaiting approval).`;
  }
  return { state, method, record, note };
}

export async function executeKnowledgeToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_knowledge_bases': {
      const resp = await client.queryRecords({ table: 'kb_knowledge_base', query: 'active=true', limit: args.limit || 20, fields: 'sys_id,title,description,owner,workflow_state' });
      return { count: resp.count, knowledge_bases: resp.records };
    }
    case 'search_knowledge': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      // Zing full-text search (123TEXTQUERY321) gives relevance ranking and keeps the
      // published filter as a proper AND. The previous LIKE^OR form let the OR break out
      // of the workflow_state=published constraint and leak unpublished articles.
      let query = `workflow_state=published^123TEXTQUERY321=${args.query}`;
      if (args.knowledge_base) {
        query += /^[0-9a-f]{32}$/i.test(args.knowledge_base)
          ? `^kb_knowledge_base=${args.knowledge_base}`
          : `^kb_knowledge_base.title=${args.knowledge_base}`;
      }
      const resp = await client.queryRecords({ table: 'kb_knowledge', query, limit: args.limit || 10, fields: 'sys_id,number,short_description,workflow_state,kb_knowledge_base,view_count' });
      return { count: resp.count, articles: resp.records };
    }
    case 'get_knowledge_article': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('kb_knowledge', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'kb_knowledge', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Article not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_knowledge_article': {
      requireWrite();
      if (!args.short_description || !args.text || !args.knowledge_base_sys_id)
        throw new ServiceNowError('short_description, text, and knowledge_base_sys_id are required', 'INVALID_REQUEST');
      const result = await client.createRecord('kb_knowledge', {
        short_description: args.short_description,
        text: args.text,
        kb_knowledge_base: args.knowledge_base_sys_id,
        category: args.category,
        workflow_state: 'draft',
      });
      // Additive: keep the full record (backward-compatible for every client) and add a clear,
      // human-facing article link + summary so the agent presents the UI link, not a
      // /api/now/table/... reference link from the record's reference fields.
      const sysId = typeof result.sys_id === 'object' ? result.sys_id?.value : result.sys_id;
      const number = typeof result.number === 'object' ? result.number?.value : result.number;
      const base = client.instanceUrl;
      return {
        ...result,
        url: sysId ? `${base}/kb_knowledge.do?sys_id=${sysId}` : undefined,
        view_url: number ? `${base}/kb_view.do?sysparm_article=${number}` : undefined,
        summary: `Created knowledge article ${number || sysId} (draft). Open it at ${base}/kb_knowledge.do?sys_id=${sysId}`,
      };
    }
    case 'update_knowledge_article': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('kb_knowledge', args.sys_id, args.fields);
      return { ...result, summary: `Updated knowledge article ${args.sys_id}` };
    }
    case 'publish_knowledge_article': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const res = await runKbLifecycle(client, args.sys_id, 'publish');
      return { ...res.record, workflow_state: res.state, method: res.method, ...(res.note ? { note: res.note } : {}), summary: res.state === 'published' ? `Published knowledge article ${args.sys_id}` : `Publish started for ${args.sys_id}; article is now "${res.state}"` };
    }
    case 'retire_knowledge_article': {
      requireWrite();
      if (!args.article_id) throw new ServiceNowError('article_id is required', 'INVALID_REQUEST');
      let sysId = args.article_id;
      if (!/^[0-9a-f]{32}$/i.test(args.article_id)) {
        const resp = await client.queryRecords({ table: 'kb_knowledge', query: `number=${args.article_id}^ORsys_id=${args.article_id}`, limit: 1 });
        if (resp.count === 0) throw new ServiceNowError(`Article not found: ${args.article_id}`, 'NOT_FOUND');
        sysId = resp.records[0].sys_id;
      }
      const res = await runKbLifecycle(client, String(sysId), 'retire');
      return { ...res.record, workflow_state: res.state, method: res.method, ...(res.note ? { note: res.note } : {}), summary: res.state === 'retired' ? `Retired knowledge article ${args.article_id}` : `Retire started for ${args.article_id}; article is now "${res.state}"` };
    }
    default:
      return null;
  }
}
