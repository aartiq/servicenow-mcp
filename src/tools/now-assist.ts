/**
 * Now Assist & ServiceNow AI tools — latest release.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 *
 * ServiceNow APIs used:
 *   - Now Assist Skills: POST /api/sn_assist/skill/invoke
 *   - Agentic Playbooks:  POST /api/sn_assist/playbook/trigger  
 *   - AI Search:          GET  /api/now/ai_search/search
 *   - Predictive Intel.:  POST /api/sn_ml/solution/{id}/predict (LightGBM in latest release)
 *   - NLQ:               POST /api/sn_nl_text_to_value/text_query
 *   - Virtual Agent:      GET  /api/sn_cs/topic               (streaming in latest release)
 *   - MS Copilot 365:     GET  /api/sn_assist/copilot/topics   
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
      name: 'generate_summary',
      description: 'Generate an AI summary of any record using Now Assist (latest release: sn_assist/skill/summarize)',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident", "change_request")' },
          sys_id: { type: 'string', description: 'System ID of the record' },
        },
        required: ['table', 'sys_id'],
      },
    },
    {
      name: 'suggest_resolution',
      description: 'Get AI-powered resolution suggestion for an incident based on similar past incidents',
      inputSchema: {
        type: 'object',
        properties: {
          incident_sys_id: { type: 'string', description: 'System ID of the incident' },
        },
        required: ['incident_sys_id'],
      },
    },
    {
      name: 'categorize_incident',
      description: 'Use Predictive Intelligence to predict category, assignment group, and priority (latest release: LightGBM algorithm)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Incident short description' },
          description: { type: 'string', description: 'Optional full description for better accuracy' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'get_virtual_agent_topics',
      description: 'List Virtual Agent topics available in the instance (latest release: streaming VA API)',
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
      name: 'trigger_agentic_playbook',
      description: 'Invoke an Agentic Playbook — context-aware AI agents that complete tasks autonomously ',
      inputSchema: {
        type: 'object',
        properties: {
          playbook_sys_id: { type: 'string', description: 'System ID of the Agentic Playbook' },
          context: { type: 'object', description: 'Context key-value pairs to pass to the playbook' },
        },
        required: ['playbook_sys_id'],
      },
    },
    {
      name: 'get_ms_copilot_topics',
      description: 'List VA topics exposed to Microsoft Copilot 365 via Custom Engine Agent integration ',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'generate_work_notes',
      description: 'Generate AI-drafted work notes for a record based on its current context',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          sys_id: { type: 'string', description: 'System ID of the record' },
          context: { type: 'string', description: 'Additional context to include in the draft' },
        },
        required: ['table', 'sys_id'],
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

export async function executeNowAssistToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
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
    case 'generate_summary': {
      if (!args.table || !args.sys_id) throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
      // Now Assist Skill: POST /api/sn_assist/skill/invoke
      const result = await client.callNowAssist('/api/sn_assist/skill/invoke', {
        skill: 'summarize',
        input: { table: args.table, sys_id: args.sys_id },
      });
      return { table: args.table, sys_id: args.sys_id, summary: result?.output?.summary || result };
    }
    case 'suggest_resolution': {
      if (!args.incident_sys_id) throw new ServiceNowError('incident_sys_id is required', 'INVALID_REQUEST');
      const result = await client.callNowAssist('/api/sn_assist/skill/invoke', {
        skill: 'resolution_suggestion',
        input: { table: 'incident', sys_id: args.incident_sys_id },
      });
      return { incident_sys_id: args.incident_sys_id, suggestion: result?.output || result };
    }
    case 'categorize_incident': {
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      // Predictive Intelligence ML API: POST /api/sn_ml/solution/{id}/predict
      // Get available PI solutions first then predict
      const piResp = await client.queryRecords({ table: 'ml_solution', query: 'active=true^table_name=incident', limit: 1, fields: 'sys_id,name' });
      if (piResp.count === 0) {
        return { message: 'No active Predictive Intelligence solution found for incident table. Enable PI plugin and train a model.' };
      }
      const solutionId = String(piResp.records[0].sys_id);
      const result = await client.callNowAssist(`/api/sn_ml/solution/${solutionId}/predict`, {
        short_description: args.short_description,
        description: args.description,
      });
      return { short_description: args.short_description, prediction: result, algorithm_note: 'LightGBM available in latest release' };
    }
    case 'get_virtual_agent_topics': {
      // VA API: GET /api/sn_cs/topic (streaming support added)
      let query = '';
      if (args.active !== false) query = 'active=true';
      if (args.category) query = query ? `${query}^category.title=${args.category}` : `category.title=${args.category}`;
      const resp = await client.queryRecords({ table: 'sys_cs_topic', query: query || undefined, limit: args.limit || 20, fields: 'sys_id,name,active,category,description' });
      return { count: resp.count, topics: resp.records, note: 'ServiceNow VA supports streaming responses and Google Chat v2.0' };
    }
    case 'trigger_agentic_playbook': {
      if (!args.playbook_sys_id) throw new ServiceNowError('playbook_sys_id is required', 'INVALID_REQUEST');
      // Agentic Playbooks API
      const result = await client.callNowAssist('/api/sn_assist/playbook/trigger', {
        playbook_sys_id: args.playbook_sys_id,
        context: args.context || {},
      });
      return { playbook_sys_id: args.playbook_sys_id, result, note: 'Agentic Playbooks are a latest release feature' };
    }
    case 'get_ms_copilot_topics': {
      // MS Copilot 365 Custom Engine Agent
      const result = await client.callNowAssist('/api/sn_assist/copilot/topics', {});
      return { topics: result, note: 'Microsoft Copilot 365 integration (Custom Engine Agent) is a latest release feature' };
    }
    case 'generate_work_notes': {
      if (!args.table || !args.sys_id) throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
      const result = await client.callNowAssist('/api/sn_assist/skill/invoke', {
        skill: 'work_notes_draft',
        input: { table: args.table, sys_id: args.sys_id, context: args.context },
      });
      return { table: args.table, sys_id: args.sys_id, draft: result?.output?.text || result };
    }
    case 'get_pi_models': {
      const resp = await client.queryRecords({ table: 'ml_solution', query: 'active=true', limit: 20, fields: 'sys_id,name,table_name,type,active,sys_updated_on' });
      return { count: resp.count, models: resp.records, note: 'Predictive Intelligence supports LightGBM, Feed Forward Neural Net, and XGBoost' };
    }
    default:
      return null;
  }
}
