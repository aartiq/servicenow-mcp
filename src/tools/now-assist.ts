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
      // ServiceNow NLQ API: POST /api/sn_nl_text_to_value/text_query
      const result = await client.callNowAssist('/api/sn_nl_text_to_value/text_query', {
        question: args.question,
        table: args.table,
        limit: args.limit || 10,
      });
      return { question: args.question, ...result };
    }
    case 'ai_search': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      // ServiceNow AI Search API: GET /api/now/ai_search/search
      const params = new URLSearchParams({ q: args.query, limit: String(args.limit || 10) });
      if (args.sources) params.set('sources', args.sources.join(','));
      const result = await client.callNowAssist(`/api/now/ai_search/search?${params.toString()}`, {});
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
