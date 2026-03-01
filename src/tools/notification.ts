/**
 * Notification, Email, and Attachment tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by servicenow-helper's direct script deployment and snow-flow's artifact management.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

export function getNotificationToolDefinitions() {
  return [
    // ── Email Notifications ──────────────────────────────────────────────────
    {
      name: 'list_notifications',
      description: 'List email notification definitions (sysevent_email_action)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search notifications by name' },
          table: { type: 'string', description: 'Filter by target table (e.g. "incident")' },
          event: { type: 'string', description: 'Filter by event trigger name' },
          active: { type: 'boolean', description: 'Filter to active notifications only' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_notification',
      description: 'Get full details of an email notification definition including template and conditions',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Notification sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_notification',
      description: 'Create a new email notification definition (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Notification name' },
          table: { type: 'string', description: 'Table that triggers this notification (e.g. "incident")' },
          event: { type: 'string', description: 'Event name that fires this notification (e.g. "incident.commented")' },
          subject: { type: 'string', description: 'Email subject line (supports ${field} variables)' },
          message_html: { type: 'string', description: 'HTML body of the email notification' },
          recipients: {
            type: 'string',
            description: 'Who receives the email (e.g. "assigned_to", "watch_list")',
          },
          active: { type: 'boolean', description: 'Whether to activate immediately (default true)' },
          condition: { type: 'string', description: 'Additional filter condition script' },
        },
        required: ['name', 'table'],
      },
    },
    {
      name: 'update_notification',
      description: 'Update an existing email notification (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Notification sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update: name, subject, message_html, active, condition, etc.',
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    // ── Email Log ────────────────────────────────────────────────────────────
    {
      name: 'list_email_logs',
      description: 'List outbound email log entries to track sent/failed emails',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: sent, failed, ready, sending, ignored' },
          recipient: { type: 'string', description: 'Filter by recipient email address' },
          subject: { type: 'string', description: 'Filter emails by subject (partial match)' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_email_log',
      description: 'Get full details of an email log entry including body and headers',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Email log sys_id' },
        },
        required: ['sys_id'],
      },
    },
    // ── Attachments ──────────────────────────────────────────────────────────
    {
      name: 'list_attachments',
      description: 'List attachments associated with a specific record',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g. "incident")' },
          record_sys_id: { type: 'string', description: 'sys_id of the record whose attachments to list' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['table', 'record_sys_id'],
      },
    },
    {
      name: 'get_attachment_metadata',
      description: 'Get metadata (name, type, size) of a specific attachment by its sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          attachment_sys_id: { type: 'string', description: 'Attachment sys_id' },
        },
        required: ['attachment_sys_id'],
      },
    },
    {
      name: 'delete_attachment',
      description: 'Delete an attachment from a record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          attachment_sys_id: { type: 'string', description: 'sys_id of the attachment to delete' },
        },
        required: ['attachment_sys_id'],
      },
    },
    {
      name: 'upload_attachment',
      description:
        'Upload a base64-encoded attachment to a ServiceNow record (requires WRITE_ENABLED=true). ' +
        'Useful for adding files, screenshots, or documents to incidents, changes, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g. "incident")' },
          record_sys_id: { type: 'string', description: 'sys_id of the record to attach the file to' },
          file_name: { type: 'string', description: 'File name including extension (e.g. "screenshot.png")' },
          content_type: {
            type: 'string',
            description:
              'MIME type (e.g. "image/png", "application/pdf", "text/plain", "application/json")',
          },
          content_base64: {
            type: 'string',
            description: 'Base64-encoded file content (use standard base64 encoding)',
          },
        },
        required: ['table', 'record_sys_id', 'file_name', 'content_type', 'content_base64'],
      },
    },
    // ── Notification Templates ────────────────────────────────────────────────
    {
      name: 'list_email_templates',
      description: 'List email notification templates used by notifications',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search templates by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── Subscriptions ────────────────────────────────────────────────────────
    {
      name: 'list_notification_subscriptions',
      description: 'List user subscriptions to notifications (who has opted in/out)',
      inputSchema: {
        type: 'object',
        properties: {
          user_sys_id: { type: 'string', description: 'User sys_id to list their subscriptions' },
          notification_sys_id: { type: 'string', description: 'Filter by specific notification' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'send_emergency_broadcast',
      description: '[Write] Send emergency broadcast notification to users or groups',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Broadcast subject' },
          body: { type: 'string', description: 'Message body' },
          recipients: { type: 'string', description: 'Comma-separated user/group sys_ids' },
          channels: { type: 'string', description: 'Delivery channels: email,sms,push' },
        },
        required: ['subject', 'body', 'recipients'],
      },
    },
    {
      name: 'schedule_notification',
      description: '[Write] Schedule a notification for future delivery',
      inputSchema: {
        type: 'object',
        properties: {
          notification_id: { type: 'string', description: 'Notification rule sys_id' },
          schedule: { type: 'string', description: 'Cron expression or ISO date' },
          active: { type: 'boolean', description: 'Whether the notification is active' },
        },
        required: ['notification_id', 'schedule'],
      },
    },
  ];
}

export async function executeNotificationToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // ── Email Notifications ──────────────────────────────────────────────────
    case 'list_notifications': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      if (args.table) parts.push(`collection=${args.table}`);
      if (args.event) parts.push(`event_name=${args.event}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sysevent_email_action',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,collection,event_name,active,send_self,sys_updated_on',
      });
    }
    case 'get_notification': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sysevent_email_action', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'sysevent_email_action',
        query: `name=${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Notification not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_notification': {
      requireWrite();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        collection: args.table,
        active: args.active !== false,
      };
      if (args.event) data.event_name = args.event;
      if (args.subject) data.subject = args.subject;
      if (args.message_html) data.message_html = args.message_html;
      if (args.recipients) data.recipient_fields = args.recipients;
      if (args.condition) data.condition = args.condition;
      const result = await client.createRecord('sysevent_email_action', data);
      return { ...result, summary: `Created notification "${args.name}" for table "${args.table}"` };
    }
    case 'update_notification': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sysevent_email_action', args.sys_id, args.fields);
      return { ...result, summary: `Updated notification ${args.sys_id}` };
    }
    // ── Email Log ────────────────────────────────────────────────────────────
    case 'list_email_logs': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.recipient) parts.push(`receiverCONTAINS${args.recipient}`);
      if (args.subject) parts.push(`subjectCONTAINS${args.subject}`);
      return await client.queryRecords({
        table: 'sys_email',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        orderBy: '-sys_created_on',
        fields: 'sys_id,state,subject,receiver,sys_created_on,error_string',
      });
    }
    case 'get_email_log': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_email', args.sys_id);
    }
    // ── Attachments ──────────────────────────────────────────────────────────
    case 'list_attachments': {
      if (!args.table || !args.record_sys_id) {
        throw new ServiceNowError('table and record_sys_id are required', 'INVALID_REQUEST');
      }
      return await client.queryRecords({
        table: 'sys_attachment',
        query: `table_name=${args.table}^table_sys_id=${args.record_sys_id}`,
        limit: args.limit ?? 25,
        fields: 'sys_id,file_name,content_type,size_bytes,table_name,table_sys_id,sys_created_on',
      });
    }
    case 'get_attachment_metadata': {
      if (!args.attachment_sys_id) throw new ServiceNowError('attachment_sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_attachment', args.attachment_sys_id);
    }
    case 'delete_attachment': {
      requireWrite();
      if (!args.attachment_sys_id) throw new ServiceNowError('attachment_sys_id is required', 'INVALID_REQUEST');
      await client.deleteRecord('sys_attachment', args.attachment_sys_id);
      return { success: true, summary: `Deleted attachment ${args.attachment_sys_id}` };
    }
    case 'upload_attachment': {
      requireWrite();
      if (!args.table || !args.record_sys_id || !args.file_name || !args.content_type || !args.content_base64) {
        throw new ServiceNowError(
          'table, record_sys_id, file_name, content_type, and content_base64 are required',
          'INVALID_REQUEST'
        );
      }
      const result = await client.uploadAttachment(
        args.table,
        args.record_sys_id,
        args.file_name,
        args.content_type,
        args.content_base64
      );
      return {
        ...result,
        summary: `Uploaded attachment "${args.file_name}" to ${args.table}:${args.record_sys_id}`,
      };
    }
    // ── Templates ────────────────────────────────────────────────────────────
    case 'list_email_templates': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sysevent_email_template',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,message_html,subject,sys_updated_on',
      });
    }
    // ── Subscriptions ────────────────────────────────────────────────────────
    case 'list_notification_subscriptions': {
      const parts: string[] = [];
      if (args.user_sys_id) parts.push(`user=${args.user_sys_id}`);
      if (args.notification_sys_id) parts.push(`notification=${args.notification_sys_id}`);
      return await client.queryRecords({
        table: 'sys_notif_subscription',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,user,notification,receive_emails,sys_updated_on',
      });
    }
    case 'send_emergency_broadcast': {
      requireWrite();
      if (!args.subject || !args.body || !args.recipients)
        throw new ServiceNowError('subject, body, and recipients are required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_email', {
        type: 'send-ready',
        subject: args.subject,
        body_text: args.body,
        recipients: args.recipients,
        importance: 'high',
      });
      return { ...result, summary: `Sent emergency broadcast: "${args.subject}" to ${args.recipients}` };
    }
    case 'schedule_notification': {
      requireWrite();
      if (!args.notification_id || !args.schedule)
        throw new ServiceNowError('notification_id and schedule are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sysevent_email_action', args.notification_id, {
        schedule: args.schedule,
        active: args.active !== false ? 'true' : 'false',
      });
      return { ...result, summary: `Scheduled notification ${args.notification_id} with schedule: ${args.schedule}` };
    }
    default:
      return null;
  }
}
