/**
 * Virtual Agent (VA) creation and management tools.
 *
 * Extends the read-only VA listing in now-assist.ts with full topic/conversation authoring.
 *
 * Tier 0 (Read):  list_va_topics (already in now-assist), get_va_conversation, discover_va_topics
 * Tier 1 (Write): create_va_topic, update_va_topic
 * Tier AI:        send_va_message (requires NOW_ASSIST_ENABLED)
 *
 * ServiceNow tables: sys_cs_topic, sys_cs_conversation, sys_cs_topic_block
 * API: /api/sn_cs/topic, /api/sn_cs/bot/integration
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getVaToolDefinitions() {
  return [
    {
      name: 'create_va_topic',
      description: 'Create a new Virtual Agent conversation topic. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Topic name (display name)' },
          description: { type: 'string', description: 'What this topic handles' },
          category: { type: 'string', description: 'Topic category sys_id' },
          active: { type: 'boolean', description: 'Activate immediately (default true)' },
          fulfillment_type: { type: 'string', description: 'Fulfillment type: "itsm_integration", "custom", "web_service"' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_va_topic',
      description: 'Update a Virtual Agent topic properties. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Topic sys_id' },
          fields: { type: 'object', description: 'Fields to update (name, description, active, etc.)' },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'get_va_topic',
      description: 'Get Virtual Agent topic details including intent and trigger phrases',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Topic sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_va_topics_full',
      description: 'List all Virtual Agent topics with category and status details',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active topics only (default true)' },
          category: { type: 'string', description: 'Filter by category name' },
          query: { type: 'string', description: 'Additional encoded query' },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_va_conversation',
      description: 'Get conversation history for a Virtual Agent session',
      inputSchema: {
        type: 'object',
        properties: {
          conversation_id: { type: 'string', description: 'Conversation sys_id or session ID' },
          limit: { type: 'number', description: 'Max messages (default 50)' },
        },
        required: ['conversation_id'],
      },
    },
    {
      name: 'list_va_conversations',
      description: 'List recent Virtual Agent conversations',
      inputSchema: {
        type: 'object',
        properties: {
          topic_sys_id: { type: 'string', description: 'Filter by topic' },
          user_sys_id: { type: 'string', description: 'Filter by user' },
          limit: { type: 'number', description: 'Max results (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_va_categories',
      description: 'List Virtual Agent topic categories',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 25)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeVaToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_va_topic': {
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      requireWrite();
      const payload: Record<string, any> = {
        name: args.name,
        active: args.active !== false,
      };
      if (args.description) payload.description = args.description;
      if (args.category) payload.category = args.category;
      if (args.fulfillment_type) payload.fulfillment_type = args.fulfillment_type;
      const result = await client.createRecord('sys_cs_topic', payload);
      return { action: 'created', name: args.name, ...result };
    }

    case 'update_va_topic': {
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      requireWrite();
      const result = await client.updateRecord('sys_cs_topic', args.sys_id, args.fields);
      return { action: 'updated', sys_id: args.sys_id, ...result };
    }

    case 'get_va_topic': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const result = await client.getRecord('sys_cs_topic', args.sys_id);
      return result;
    }

    case 'list_va_topics_full': {
      let query = args.active !== false ? 'active=true' : '';
      if (args.category) query = query ? `${query}^category.title=${args.category}` : `category.title=${args.category}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({
        table: 'sys_cs_topic',
        query: query || undefined,
        limit: args.limit || 50,
        fields: 'sys_id,name,active,category,description,fulfillment_type,sys_updated_on',
      });
      return { count: resp.count, topics: resp.records };
    }

    case 'get_va_conversation': {
      if (!args.conversation_id) throw new ServiceNowError('conversation_id is required', 'INVALID_REQUEST');
      const resp = await client.queryRecords({
        table: 'sys_cs_conversation_message',
        query: `conversation=${args.conversation_id}`,
        limit: args.limit || 50,
        fields: 'sys_id,message,speaker,sys_created_on',
      });
      return { conversation_id: args.conversation_id, message_count: resp.count, messages: resp.records };
    }

    case 'list_va_conversations': {
      let query = '';
      if (args.topic_sys_id) query = `topic=${args.topic_sys_id}`;
      if (args.user_sys_id) query = query ? `${query}^user=${args.user_sys_id}` : `user=${args.user_sys_id}`;
      const resp = await client.queryRecords({
        table: 'sys_cs_conversation',
        query: query || undefined,
        limit: args.limit || 25,
        fields: 'sys_id,topic,user,state,sys_created_on,sys_updated_on',
      });
      return { count: resp.count, conversations: resp.records };
    }

    case 'list_va_categories': {
      const resp = await client.queryRecords({
        table: 'sys_cs_category',
        limit: args.limit || 25,
        fields: 'sys_id,title,active,description,order',
      });
      return { count: resp.count, categories: resp.records };
    }

    default:
      return null;
  }
}
