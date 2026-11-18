/**
 * ServiceNow AI / Predictive Intelligence tools.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 *
 * A note on scope: ServiceNow does not expose a public inbound REST API for running
 * Now Assist skills (summarize / resolution suggestion / work-note drafting) or for
 * triggering Agentic workflows — those run through server-side script APIs
 * (sn_one_extend.OneExtendUtil / AiAgentRuntimeUtil) that a customer must wrap in a
 * Scripted REST resource. So instead of calling fabricated endpoints, the tools here
 * read real ServiceNow tables:
 *   - Predictive Intelligence solutions: ml_solution table
 *   - Virtual Agent / Copilot topics:     sys_cs_topic table
 *   - Incident categorization suggestion:  similar resolved incidents (Table API heuristic)
 *   - AI Search / NLQ:                     ServiceNow search APIs
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireNowAssist } from '../utils/permissions.js';

export function getNowAssistToolDefinitions() {
  return [
    {
      name: 'nlq_query',
      description: 'Ask a natural language question and get structured ServiceNow data (ServiceNow NLQ API)',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Plain English question (e.g., "How many P1 incidents were opened this week?")' },
          table: { type: 'string', description: 'Optional target table hint' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['question'],
      },
    },
    {
      name: 'ai_search',
      description: 'Semantic AI-powered search across KB, catalog, incidents (ServiceNow AI Search)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          sources: { type: 'array', items: { type: 'string' }, description: 'Sources to search: ["kb", "catalog", "incident"] (default: all)' },
          search_app: { type: 'string', description: 'Optional AI Search application (sys_search_context_config) name or sys_id. Default: Service Portal Default Search Application' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'categorize_incident',
      description: 'Suggest category, assignment group, and priority for an incident by analysing similar resolved incidents (Table API). Predictive Intelligence has no public REST prediction endpoint; for model-based scoring run PI on-record and read the predicted field.',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Incident short description' },
          description: { type: 'string', description: 'Optional full description (not required for the heuristic)' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'get_virtual_agent_topics',
      description: 'List Virtual Agent topics available in the instance (sys_cs_topic)',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active topics only' },
          category: { type: 'string', description: 'Filter by topic category' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_ms_copilot_topics',
      description: 'List the Virtual Agent topics (sys_cs_topic) that back a Microsoft Copilot integration. Copilot topic mapping itself is configured in Copilot Studio on the Microsoft side, not exposed via ServiceNow REST.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pi_models',
      description: 'List available Predictive Intelligence solutions (classification/similarity models)',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ];
}

const NOW_ASSIST_TOOL_NAMES = new Set([
  'nlq_query', 'ai_search', 'categorize_incident', 'get_virtual_agent_topics',
  'get_ms_copilot_topics', 'get_pi_models',
]);

const SOURCE_TABLES: Record<string, string[]> = {
  kb: ['kb_knowledge'],
  knowledge: ['kb_knowledge'],
  catalog: ['sc_cat_item', 'sc_cat_item_producer', 'sc_cat_item_guide'],
  incident: ['incident'],
};

// AI Search runs through the AI Search Assist API (POST /api/now/aisa/search) against a search
// application (sys_search_context_config). Default: the Service Portal default search application.
async function aiSearch(
  client: ServiceNowClient,
  term: string,
  opts: { limit?: number; sources?: string[]; table?: string; searchApp?: string },
): Promise<any> {
  const appQuery = opts.searchApp
    ? (/^[0-9a-f]{32}$/i.test(opts.searchApp) ? `sys_id=${opts.searchApp}` : `name=${opts.searchApp}`)
    : 'search_engine=ai_search^name=Service Portal Default Search Application';
  let apps = await client.queryRecords({ table: 'sys_search_context_config', query: appQuery, limit: 1, fields: 'sys_id,name' })
    .catch(() => ({ count: 0, records: [] as any[] }));
  if (!apps.count && !opts.searchApp) {
    apps = await client.queryRecords({ table: 'sys_search_context_config', query: 'search_engine=ai_search', limit: 1, fields: 'sys_id,name' })
      .catch(() => ({ count: 0, records: [] as any[] }));
  }
  if (!apps.count) {
    throw new ServiceNowError(
      opts.searchApp
        ? `Search application not found: ${opts.searchApp}`
        : "This needs the AI Search plugin (com.glide.ais), which isn't active on this instance (no AI Search application found).",
      opts.searchApp ? 'NOT_FOUND' : 'PLUGIN_NOT_ACTIVE',
    );
  }
  const app = apps.records[0] as any;
  let resp: any;
  try {
    resp = await client.callNowAssist('/api/now/aisa/search', { searchContextConfigId: app.sys_id, searchTerm: term, rpSysId: 'nowaikit' });
  } catch (e) {
    if (e instanceof ServiceNowError && e.code === 'NOT_FOUND') {
      throw new ServiceNowError("This needs the AI Search Assist plugin (com.glide.ais.aisa), which isn't active on this instance.", 'PLUGIN_NOT_ACTIVE');
    }
    throw e;
  }
  let results: any[] = resp?.result?.search?.searchResults ?? [];
  const tables = new Set<string>([
    ...(opts.sources ?? []).flatMap((src) => SOURCE_TABLES[String(src).toLowerCase()] ?? [String(src)]),
    ...(opts.table ? [opts.table] : []),
  ]);
  if (tables.size) results = results.filter((r) => tables.has(r.table));
  results = results.slice(0, opts.limit || 10).map((r) => ({
    sys_id: r.sysId,
    table: r.table,
    title: typeof r.title === 'string' ? r.title.replace(/<\/?highlight>/g, '') : r.title,
    text: typeof r.text === 'string' ? r.text.replace(/<\/?highlight>/g, '') : r.text,
    fields: Object.fromEntries((r.columns ?? []).map((c: any) => [c.fieldName, c.displayValue || c.value])),
  }));
  return { search_application: app.name, count: results.length, results };
}

export async function executeNowAssistToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  // Only gate Now Assist tools — return null for unrelated tools so dispatch continues
  if (!NOW_ASSIST_TOOL_NAMES.has(name)) return null;
  requireNowAssist();

  switch (name) {
    case 'nlq_query': {
      if (!args.question) throw new ServiceNowError('question is required', 'INVALID_REQUEST');
      // NLQ has no public REST endpoint (the old /api/sn_nl_text_to_value/text_query never existed;
      // /api/now/nlq only exposes the query log). Answer the question with AI Search instead.
      const result = await aiSearch(client, args.question, { limit: args.limit, table: args.table });
      return {
        question: args.question,
        ...result,
        note: 'ServiceNow Natural Language Query has no public REST API, so this question was answered with AI Search. For counts and aggregates, use aggregate_report or query_records.',
      };
    }
    case 'ai_search': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const result = await aiSearch(client, args.query, { limit: args.limit, sources: args.sources, searchApp: args.search_app });
      return { query: args.query, ...result };
    }
    case 'categorize_incident': {
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      // No public REST exists to run a Predictive Intelligence prediction (sn_ml is
      // script-only). Redirect to a real Table API heuristic: find similar resolved
      // incidents by text and surface their most common category / assignment group /
      // priority as a suggestion.
      const terms = String(args.short_description).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const resp = await client.queryRecords({
        table: 'incident',
        query: `short_descriptionLIKE${terms}^stateIN6,7`,
        limit: 20,
        fields: 'number,short_description,category,subcategory,assignment_group,priority',
      });
      const top = (key: string): { value: string; count: number }[] => {
        const counts: Record<string, number> = {};
        for (const r of resp.records as any[]) {
          const raw = r[key];
          const v = raw && typeof raw === 'object' ? raw.display_value || raw.value : raw;
          if (v) counts[v] = (counts[v] || 0) + 1;
        }
        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([value, count]) => ({ value, count }));
      };
      return {
        short_description: args.short_description,
        based_on_incidents: resp.count,
        suggested_category: top('category')[0]?.value || null,
        suggested_assignment_group: top('assignment_group')[0]?.value || null,
        suggested_priority: top('priority')[0]?.value || null,
        category_distribution: top('category'),
        note: resp.count
          ? 'Suggestion derived from similar resolved incidents (Table API). For model-based scoring, run Predictive Intelligence on-record and read the predicted field.'
          : 'No similar resolved incidents were found to base a suggestion on.',
      };
    }
    case 'get_virtual_agent_topics': {
      let query = '';
      if (args.active !== false) query = 'active=true';
      if (args.category) query = query ? `${query}^category.title=${args.category}` : `category.title=${args.category}`;
      const resp = await client.queryRecords({ table: 'sys_cs_topic', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,active,category,description' });
      return { count: resp.count, topics: resp.records };
    }
    case 'get_ms_copilot_topics': {
      // No ServiceNow REST endpoint lists "Copilot topics"; topic authoring lives in
      // Copilot Studio on the Microsoft side. The real ServiceNow-side data is the VA
      // topic table, which is what a Copilot integration surfaces.
      const resp = await client.queryRecords({ table: 'sys_cs_topic', query: 'active=true', limit: args.limit || 20, fields: 'sys_id,name,active,category,description' });
      return {
        count: resp.count,
        topics: resp.records,
        note: 'These are Virtual Agent topics (sys_cs_topic). Microsoft Copilot topic mapping is configured in Copilot Studio, not exposed via ServiceNow REST.',
      };
    }
    case 'get_pi_models': {
      const resp = await client.queryRecords({ table: 'ml_solution', query: 'active=true', limit: 20, fields: 'sys_id,name,table_name,type,active,sys_updated_on' });
      return { count: resp.count, models: resp.records };
    }
    default:
      return null;
  }
}
