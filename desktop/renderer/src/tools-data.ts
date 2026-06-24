// Auto-generated tool manifest for browser-only mode
// Generated: 2026-02-28
// Total tools: 365

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    "name": "query_records",
    "description": "Query ServiceNow records with filtering, field selection, pagination, and sorting",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name (e.g., \"incident\", \"change_request\")"
        },
        "query": {
          "type": "string",
          "description": "Encoded query string (e.g., \"active=true^priority=1\")"
        },
        "fields": {
          "type": "string",
          "description": "Comma-separated fields to return"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default: 10, max: 1000)"
        },
        "orderBy": {
          "type": "string",
          "description": "Field to sort by. Prefix with \"-\" for descending"
        }
      },
      "required": [
        "table"
      ]
    }
  },
  {
    "name": "get_table_schema",
    "description": "Get the structure and field information for a ServiceNow table",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name to inspect"
        }
      },
      "required": [
        "table"
      ]
    }
  },
  {
    "name": "get_record",
    "description": "Retrieve complete details of a specific record by sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name"
        },
        "sys_id": {
          "type": "string",
          "description": "32-character system ID"
        },
        "fields": {
          "type": "string",
          "description": "Optional comma-separated fields"
        }
      },
      "required": [
        "table",
        "sys_id"
      ]
    }
  },
  {
    "name": "get_user",
    "description": "Look up user details by email or username",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user_identifier": {
          "type": "string",
          "description": "Email address or username"
        }
      },
      "required": [
        "user_identifier"
      ]
    }
  },
  {
    "name": "get_group",
    "description": "Find assignment group details by name or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "group_identifier": {
          "type": "string",
          "description": "Group name or sys_id"
        }
      },
      "required": [
        "group_identifier"
      ]
    }
  },
  {
    "name": "search_cmdb_ci",
    "description": "Search for configuration items (CIs) in the CMDB",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Encoded query (e.g., \"sys_class_name=cmdb_ci_server\")"
        },
        "limit": {
          "type": "number",
          "description": "Max CIs (default: 10, max: 100)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_cmdb_ci",
    "description": "Get complete information about a specific configuration item",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ci_sys_id": {
          "type": "string",
          "description": "System ID of the CI"
        },
        "fields": {
          "type": "string",
          "description": "Optional comma-separated fields"
        }
      },
      "required": [
        "ci_sys_id"
      ]
    }
  },
  {
    "name": "list_relationships",
    "description": "Show parent and child relationships for a CI",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ci_sys_id": {
          "type": "string",
          "description": "System ID of the CI"
        }
      },
      "required": [
        "ci_sys_id"
      ]
    }
  },
  {
    "name": "list_discovery_schedules",
    "description": "List discovery schedules and their run status",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active_only": {
          "type": "boolean",
          "description": "Only show active schedules"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_mid_servers",
    "description": "List MID servers and verify they are healthy",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active_only": {
          "type": "boolean",
          "description": "Only show servers with status \"Up\""
        }
      },
      "required": []
    }
  },
  {
    "name": "list_active_events",
    "description": "Monitor critical infrastructure events",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Filter events (e.g., \"severity=1\")"
        },
        "limit": {
          "type": "number",
          "description": "Max events (default: 10)"
        }
      },
      "required": []
    }
  },
  {
    "name": "cmdb_health_dashboard",
    "description": "Get CMDB data quality metrics (completeness of server and network CI data)",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "service_mapping_summary",
    "description": "View service dependencies and related CIs for impact analysis",
    "inputSchema": {
      "type": "object",
      "properties": {
        "service_sys_id": {
          "type": "string",
          "description": "System ID of the business service"
        }
      },
      "required": [
        "service_sys_id"
      ]
    }
  },
  {
    "name": "natural_language_search",
    "description": "Search ServiceNow using plain English (experimental)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Plain English query"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 10)"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "natural_language_update",
    "description": "Update a record using natural language (experimental, requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "instruction": {
          "type": "string",
          "description": "Natural language update instruction"
        },
        "table": {
          "type": "string",
          "description": "Table name"
        }
      },
      "required": [
        "instruction",
        "table"
      ]
    }
  },
  {
    "name": "list_instances",
    "description": "List all configured ServiceNow instances (multi-instance / multi-customer support)",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "switch_instance",
    "description": "Switch the active ServiceNow instance for this session",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Instance name as configured (e.g. \"prod\", \"dev\", \"customer_a\")"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "get_current_instance",
    "description": "Get the currently active ServiceNow instance name and URL",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "create_ci_relationship",
    "description": "[Write] Create a relationship between two CMDB Configuration Items",
    "inputSchema": {
      "type": "object",
      "properties": {
        "parent": {
          "type": "string",
          "description": "Parent CI sys_id"
        },
        "child": {
          "type": "string",
          "description": "Child CI sys_id"
        },
        "type": {
          "type": "string",
          "description": "Relationship type (e.g. \"Runs on::Runs\")"
        }
      },
      "required": [
        "parent",
        "child",
        "type"
      ]
    }
  },
  {
    "name": "cmdb_impact_analysis",
    "description": "Analyze the downstream impact of a Configuration Item change or outage",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ci_sys_id": {
          "type": "string",
          "description": "CI sys_id to analyze"
        },
        "depth": {
          "type": "number",
          "description": "Relationship depth to traverse (default: 2)"
        }
      },
      "required": [
        "ci_sys_id"
      ]
    }
  },
  {
    "name": "run_discovery_scan",
    "description": "[Write] Trigger a ServiceNow Discovery scan for network/infrastructure",
    "inputSchema": {
      "type": "object",
      "properties": {
        "schedule_id": {
          "type": "string",
          "description": "Discovery schedule sys_id to run"
        },
        "mid_server": {
          "type": "string",
          "description": "Optional MID server name"
        }
      },
      "required": [
        "schedule_id"
      ]
    }
  },
  {
    "name": "create_incident",
    "description": "Create a new incident record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Brief description of the issue"
        },
        "urgency": {
          "type": "number",
          "description": "1=High, 2=Medium, 3=Low"
        },
        "impact": {
          "type": "number",
          "description": "1=High, 2=Medium, 3=Low"
        },
        "priority": {
          "type": "number",
          "description": "1=Critical, 2=High, 3=Moderate, 4=Low"
        },
        "description": {
          "type": "string",
          "description": "Detailed description"
        },
        "assignment_group": {
          "type": "string",
          "description": "Assignment group name or sys_id"
        },
        "caller_id": {
          "type": "string",
          "description": "Caller user name or sys_id"
        },
        "category": {
          "type": "string",
          "description": "Incident category"
        },
        "subcategory": {
          "type": "string",
          "description": "Incident subcategory"
        }
      },
      "required": [
        "short_description"
      ]
    }
  },
  {
    "name": "get_incident",
    "description": "Get full details of an incident by number (e.g. INC0012345) or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Incident number (INC...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_incident",
    "description": "Update fields on an existing incident (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the incident"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update (e.g., {\"state\": \"2\", \"urgency\": \"1\"})"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "resolve_incident",
    "description": "Resolve an incident with resolution code and notes (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the incident"
        },
        "resolution_code": {
          "type": "string",
          "description": "Resolution code (e.g., \"Solved (Permanently)\")"
        },
        "resolution_notes": {
          "type": "string",
          "description": "Details of how the incident was resolved"
        }
      },
      "required": [
        "sys_id",
        "resolution_code",
        "resolution_notes"
      ]
    }
  },
  {
    "name": "close_incident",
    "description": "Close a resolved incident (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the incident"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "add_work_note",
    "description": "Add an internal work note to any ITSM record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name (e.g., \"incident\", \"change_request\")"
        },
        "sys_id": {
          "type": "string",
          "description": "System ID of the record"
        },
        "note": {
          "type": "string",
          "description": "Work note text (internal, not visible to end user)"
        }
      },
      "required": [
        "table",
        "sys_id",
        "note"
      ]
    }
  },
  {
    "name": "add_comment",
    "description": "Add a customer-visible comment to any ITSM record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name (e.g., \"incident\")"
        },
        "sys_id": {
          "type": "string",
          "description": "System ID of the record"
        },
        "comment": {
          "type": "string",
          "description": "Comment text (visible to end user/caller)"
        }
      },
      "required": [
        "table",
        "sys_id",
        "comment"
      ]
    }
  },
  {
    "name": "create_problem",
    "description": "Create a new problem record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Brief description of the problem"
        },
        "description": {
          "type": "string",
          "description": "Detailed description"
        },
        "assignment_group": {
          "type": "string",
          "description": "Assignment group name or sys_id"
        },
        "priority": {
          "type": "number",
          "description": "1=Critical, 2=High, 3=Moderate, 4=Low"
        }
      },
      "required": [
        "short_description"
      ]
    }
  },
  {
    "name": "get_problem",
    "description": "Get full details of a problem by number (PRB...) or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Problem number (PRB...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_problem",
    "description": "Update fields on an existing problem (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the problem"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "resolve_problem",
    "description": "Resolve a problem with root cause and resolution notes (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the problem"
        },
        "root_cause": {
          "type": "string",
          "description": "Root cause of the problem"
        },
        "resolution_notes": {
          "type": "string",
          "description": "How the problem was resolved"
        }
      },
      "required": [
        "sys_id",
        "root_cause",
        "resolution_notes"
      ]
    }
  },
  {
    "name": "create_change_request",
    "description": "Create a new change request (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Brief description of the change"
        },
        "description": {
          "type": "string",
          "description": "Detailed description and justification"
        },
        "type": {
          "type": "string",
          "description": "Change type: \"normal\", \"standard\", \"emergency\""
        },
        "category": {
          "type": "string",
          "description": "Change category (e.g. \"Software\", \"Hardware\", \"Network\")"
        },
        "risk": {
          "type": "string",
          "description": "Risk level: \"1\"=High, \"2\"=Medium, \"3\"=Low, \"4\"=Very Low"
        },
        "impact": {
          "type": "string",
          "description": "Impact: \"1\"=High, \"2\"=Medium, \"3\"=Low"
        },
        "priority": {
          "type": "string",
          "description": "Priority: \"1\"=Critical, \"2\"=High, \"3\"=Moderate, \"4\"=Low"
        },
        "assignment_group": {
          "type": "string",
          "description": "Assignment group name or sys_id"
        },
        "assigned_to": {
          "type": "string",
          "description": "Assignee username or sys_id"
        },
        "start_date": {
          "type": "string",
          "description": "Planned start date (ISO: YYYY-MM-DD HH:MM:SS)"
        },
        "end_date": {
          "type": "string",
          "description": "Planned end date (ISO: YYYY-MM-DD HH:MM:SS)"
        },
        "implementation_plan": {
          "type": "string",
          "description": "Step-by-step implementation plan"
        },
        "backout_plan": {
          "type": "string",
          "description": "Rollback plan if change fails"
        },
        "test_plan": {
          "type": "string",
          "description": "Testing and validation steps"
        },
        "cmdb_ci": {
          "type": "string",
          "description": "Affected CI sys_id"
        }
      },
      "required": [
        "short_description",
        "type"
      ]
    }
  },
  {
    "name": "get_change_request",
    "description": "Get full details of a change request by number (CHG...) or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Change number (CHG...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_change_request",
    "description": "Update fields on a change request (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the change request"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_change_requests",
    "description": "List change requests with optional filtering by state or query",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "state": {
          "type": "string",
          "description": "Change state (e.g., \"-5\"=Requested, \"-4\"=Draft, \"0\"=Open)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default: 10)"
        }
      },
      "required": []
    }
  },
  {
    "name": "submit_change_for_approval",
    "description": "Move a change request to \"Requested\" state for approval (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the change request"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "close_change_request",
    "description": "Close a change request with close code and notes (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the change request"
        },
        "close_code": {
          "type": "string",
          "description": "Close code (e.g., \"successful\", \"unsuccessful\")"
        },
        "close_notes": {
          "type": "string",
          "description": "Closure notes"
        }
      },
      "required": [
        "sys_id",
        "close_code",
        "close_notes"
      ]
    }
  },
  {
    "name": "schedule_cab_meeting",
    "description": "[Write] Schedule a Change Advisory Board (CAB) meeting",
    "inputSchema": {
      "type": "object",
      "properties": {
        "change_id": {
          "type": "string",
          "description": "Change request number (CHG...) or sys_id"
        },
        "date": {
          "type": "string",
          "description": "ISO date for the CAB meeting"
        },
        "duration_minutes": {
          "type": "number",
          "description": "Meeting duration in minutes"
        },
        "attendees": {
          "type": "string",
          "description": "Comma-separated group names"
        }
      },
      "required": [
        "change_id",
        "date"
      ]
    }
  },
  {
    "name": "get_task",
    "description": "Get details of any task record by number or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Task number or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_task",
    "description": "Update fields on a task record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the task"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_my_tasks",
    "description": "List tasks assigned to the currently configured user",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number",
          "description": "Max tasks to return (default: 10)"
        }
      },
      "required": []
    }
  },
  {
    "name": "complete_task",
    "description": "Mark a task as complete (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the task"
        },
        "close_notes": {
          "type": "string",
          "description": "Optional closure notes"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_knowledge_bases",
    "description": "List all knowledge bases available in the instance",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "search_knowledge",
    "description": "Search knowledge base articles by keyword",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search keywords or phrase"
        },
        "limit": {
          "type": "number",
          "description": "Max articles (default: 10)"
        },
        "knowledge_base": {
          "type": "string",
          "description": "Optional: filter by knowledge base sys_id or name"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "get_knowledge_article",
    "description": "Get the full content of a knowledge article by number (KB...) or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Article number (KB...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "create_knowledge_article",
    "description": "Create a new knowledge article (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Article title"
        },
        "text": {
          "type": "string",
          "description": "Article body (HTML or plain text)"
        },
        "knowledge_base_sys_id": {
          "type": "string",
          "description": "sys_id of the target knowledge base"
        },
        "category": {
          "type": "string",
          "description": "Article category"
        }
      },
      "required": [
        "short_description",
        "text",
        "knowledge_base_sys_id"
      ]
    }
  },
  {
    "name": "update_knowledge_article",
    "description": "Update a knowledge article (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the article"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update (e.g., {\"text\": \"...updated content...\"})"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "publish_knowledge_article",
    "description": "Publish a draft knowledge article (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the article to publish"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "retire_knowledge_article",
    "description": "[Write] Retire a knowledge article (mark as outdated)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "article_id": {
          "type": "string",
          "description": "Article number (KB...) or sys_id"
        }
      },
      "required": [
        "article_id"
      ]
    }
  },
  {
    "name": "list_catalog_items",
    "description": "List available service catalog items",
    "inputSchema": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "description": "Filter by category name or sys_id"
        },
        "limit": {
          "type": "number",
          "description": "Max items (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "search_catalog",
    "description": "Search the service catalog for items matching a keyword",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search keywords"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 10)"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "get_catalog_item",
    "description": "Get full details of a catalog item including its variables",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Catalog item sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "create_catalog_item",
    "description": "Create a new service catalog item (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Catalog item display name"
        },
        "short_description": {
          "type": "string",
          "description": "One-line summary shown in search results"
        },
        "description": {
          "type": "string",
          "description": "Full HTML description of the item"
        },
        "category": {
          "type": "string",
          "description": "sys_id of the catalog category (sc_category)"
        },
        "price": {
          "type": "string",
          "description": "Price (e.g. \"0\", \"99.99\")"
        },
        "delivery_time": {
          "type": "string",
          "description": "Estimated delivery time ISO 8601 duration (e.g. \"1 08:00:00\" for 1 day 8 hours)"
        },
        "active": {
          "type": "boolean",
          "description": "Make the item available in the catalog (default: true)"
        },
        "roles": {
          "type": "string",
          "description": "Comma-separated roles that can see the item"
        }
      },
      "required": [
        "name",
        "short_description"
      ]
    }
  },
  {
    "name": "update_catalog_item",
    "description": "Update an existing catalog item (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Catalog item sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (name, short_description, price, active, category, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "order_catalog_item",
    "description": "Order a service catalog item (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the catalog item"
        },
        "quantity": {
          "type": "number",
          "description": "Quantity to order (default: 1)"
        },
        "variables": {
          "type": "object",
          "description": "Catalog item variables as key-value pairs"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_approval_rule",
    "description": "Create an approval rule that automatically generates approval requests when a record matches given conditions (requires WRITE_ENABLED=true). Uses the sysapproval_rule table.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Rule name"
        },
        "table": {
          "type": "string",
          "description": "Table this rule applies to (e.g. \"sc_request\", \"change_request\")"
        },
        "approver_type": {
          "type": "string",
          "description": "\"user\" | \"group\" — whether the approver is a user or a group"
        },
        "approver": {
          "type": "string",
          "description": "sys_id of the approving user or group"
        },
        "condition": {
          "type": "string",
          "description": "Encoded query that determines when the rule fires (leave blank for always)"
        },
        "active": {
          "type": "boolean",
          "description": "Activate the rule immediately (default: true)"
        },
        "order": {
          "type": "number",
          "description": "Execution order relative to other rules (default: 100)"
        }
      },
      "required": [
        "name",
        "table",
        "approver_type",
        "approver"
      ]
    }
  },
  {
    "name": "get_my_approvals",
    "description": "List approvals pending for the currently configured user",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state: \"requested\", \"approved\", \"rejected\" (default: \"requested\")"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_approvals",
    "description": "List approval requests with optional filters",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "state": {
          "type": "string",
          "description": "Approval state filter"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 10)"
        }
      },
      "required": []
    }
  },
  {
    "name": "approve_request",
    "description": "Approve a pending approval request (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the approval record"
        },
        "comments": {
          "type": "string",
          "description": "Optional approval comments"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "reject_request",
    "description": "Reject a pending approval request (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the approval record"
        },
        "comments": {
          "type": "string",
          "description": "Reason for rejection (required)"
        }
      },
      "required": [
        "sys_id",
        "comments"
      ]
    }
  },
  {
    "name": "get_sla_details",
    "description": "Get SLA breach status for a specific task or incident",
    "inputSchema": {
      "type": "object",
      "properties": {
        "task_sys_id": {
          "type": "string",
          "description": "System ID of the task/incident"
        }
      },
      "required": [
        "task_sys_id"
      ]
    }
  },
  {
    "name": "list_active_slas",
    "description": "List active SLA records with optional filters",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 10)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_catalog_variable",
    "description": "[Write] Add a form variable to a service catalog item",
    "inputSchema": {
      "type": "object",
      "properties": {
        "cat_item_id": {
          "type": "string",
          "description": "Catalog item sys_id"
        },
        "name": {
          "type": "string",
          "description": "Variable name"
        },
        "question_text": {
          "type": "string",
          "description": "Label shown to user"
        },
        "type": {
          "type": "string",
          "description": "Variable type: string/reference/select_box/checkbox/date/date_time/integer/multi_line_text/email"
        },
        "order": {
          "type": "number",
          "description": "Display order (default: 100)"
        },
        "mandatory": {
          "type": "boolean",
          "description": "Required field"
        }
      },
      "required": [
        "cat_item_id",
        "name",
        "question_text",
        "type"
      ]
    }
  },
  {
    "name": "create_catalog_ui_policy",
    "description": "[Write] Create a UI policy for a catalog item form",
    "inputSchema": {
      "type": "object",
      "properties": {
        "cat_item_id": {
          "type": "string",
          "description": "Catalog item sys_id"
        },
        "short_description": {
          "type": "string",
          "description": "UI policy description"
        },
        "conditions": {
          "type": "string",
          "description": "Encoded condition query"
        },
        "reverse_if_false": {
          "type": "boolean",
          "description": "Reverse actions when condition is false"
        }
      },
      "required": [
        "cat_item_id",
        "short_description"
      ]
    }
  },
  {
    "name": "list_users",
    "description": "List users with optional search filter",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Filter (e.g., \"active=true^departmentLIKEIT\")"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_user",
    "description": "Create a new user account (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user_name": {
          "type": "string",
          "description": "Unique username (login name)"
        },
        "email": {
          "type": "string",
          "description": "Email address"
        },
        "first_name": {
          "type": "string",
          "description": "First name"
        },
        "last_name": {
          "type": "string",
          "description": "Last name"
        },
        "title": {
          "type": "string",
          "description": "Job title"
        },
        "department": {
          "type": "string",
          "description": "Department name or sys_id"
        }
      },
      "required": [
        "user_name",
        "email",
        "first_name",
        "last_name"
      ]
    }
  },
  {
    "name": "update_user",
    "description": "Update a user account (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the user"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_groups",
    "description": "List groups with optional search filter",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Filter (e.g., \"active=true^typeLIKEitil\")"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_group",
    "description": "Create a new assignment group (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Group name"
        },
        "description": {
          "type": "string",
          "description": "Group description"
        },
        "manager": {
          "type": "string",
          "description": "Manager user_name or sys_id"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "update_group",
    "description": "Update a group (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the group"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "add_user_to_group",
    "description": "Add a user to a group (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user_sys_id": {
          "type": "string",
          "description": "System ID of the user"
        },
        "group_sys_id": {
          "type": "string",
          "description": "System ID of the group"
        }
      },
      "required": [
        "user_sys_id",
        "group_sys_id"
      ]
    }
  },
  {
    "name": "remove_user_from_group",
    "description": "Remove a user from a group (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "member_sys_id": {
          "type": "string",
          "description": "System ID of the sys_user_grmember record"
        }
      },
      "required": [
        "member_sys_id"
      ]
    }
  },
  {
    "name": "list_reports",
    "description": "List saved reports in the instance (latest release: /api/now/reporting)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "search": {
          "type": "string",
          "description": "Search reports by name (uses sysparm_contains)"
        },
        "category": {
          "type": "string",
          "description": "Filter by report category"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_report",
    "description": "Get the definition and metadata of a saved report",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Report sys_id or exact name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "run_aggregate_query",
    "description": "Run a grouped aggregate (COUNT, SUM, AVG) query on any table (latest release: /api/now/stats/{table})",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table to query (e.g., \"incident\", \"task_sla\")"
        },
        "group_by": {
          "type": "string",
          "description": "Field to group results by (e.g., \"priority\", \"state\", \"assignment_group\")"
        },
        "aggregate": {
          "type": "string",
          "description": "Aggregate function: COUNT (default), SUM, AVG, MIN, MAX"
        },
        "query": {
          "type": "string",
          "description": "Optional encoded query filter"
        },
        "limit": {
          "type": "number",
          "description": "Max groups (default: 20)"
        }
      },
      "required": [
        "table",
        "group_by"
      ]
    }
  },
  {
    "name": "trend_query",
    "description": "Get time-bucketed trend data for a table (useful for monthly/weekly trend charts)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name (e.g., \"incident\")"
        },
        "date_field": {
          "type": "string",
          "description": "Date field to bucket by (e.g., \"opened_at\", \"sys_created_on\")"
        },
        "group_by": {
          "type": "string",
          "description": "Secondary grouping field (e.g., \"priority\", \"state\")"
        },
        "query": {
          "type": "string",
          "description": "Optional encoded query filter"
        },
        "periods": {
          "type": "number",
          "description": "Number of months to look back (default: 6)"
        }
      },
      "required": [
        "table",
        "date_field",
        "group_by"
      ]
    }
  },
  {
    "name": "get_performance_analytics",
    "description": "Get Performance Analytics widget data (requires PA plugin; latest release: /api/now/pa/widget/{sys_id})",
    "inputSchema": {
      "type": "object",
      "properties": {
        "widget_sys_id": {
          "type": "string",
          "description": "sys_id of the PA widget"
        },
        "time_range": {
          "type": "string",
          "description": "Time range (e.g., \"last_30_days\", \"last_quarter\")"
        }
      },
      "required": [
        "widget_sys_id"
      ]
    }
  },
  {
    "name": "export_report_data",
    "description": "Export raw table data as structured JSON for use in external reports",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table to export from"
        },
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "fields": {
          "type": "string",
          "description": "Comma-separated fields to include"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default: 100, max: 1000)"
        }
      },
      "required": [
        "table"
      ]
    }
  },
  {
    "name": "get_sys_log",
    "description": "Retrieve system log entries for debugging or auditing",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Filter (e.g., \"level=error^sys_created_onONToday@javascript:gs.beginningOfToday()@javascript:gs.endOfToday()\")"
        },
        "limit": {
          "type": "number",
          "description": "Max entries (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_scheduled_jobs",
    "description": "List scheduled jobs and their run schedules",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter to active jobs only (default: true)"
        },
        "query": {
          "type": "string",
          "description": "Additional filter"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_scheduled_job",
    "description": "Get full details of a scheduled job by sys_id or name",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Job sys_id or exact name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "create_scheduled_job",
    "description": "Create a new scheduled script execution job (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Job name"
        },
        "script": {
          "type": "string",
          "description": "Server-side JavaScript to run on schedule"
        },
        "run_type": {
          "type": "string",
          "description": "Schedule type: \"daily\", \"weekly\", \"monthly\", \"once\", \"periodically\""
        },
        "run_time": {
          "type": "string",
          "description": "Time to run (HH:MM:SS format for daily/weekly/monthly)"
        },
        "run_period": {
          "type": "string",
          "description": "Period interval for \"periodically\" type (e.g. \"00:15:00\" for 15 minutes)"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate immediately (default: true)"
        }
      },
      "required": [
        "name",
        "script",
        "run_type"
      ]
    }
  },
  {
    "name": "update_scheduled_job",
    "description": "Update a scheduled job (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Scheduled job sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (name, script, active, run_type, run_time, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "trigger_scheduled_job",
    "description": "Immediately execute a scheduled job on-demand (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Scheduled job sys_id to trigger"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_report",
    "description": "Create a new saved report on any table (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "Report title displayed in the list"
        },
        "table": {
          "type": "string",
          "description": "Table to report on (e.g. \"incident\", \"change_request\")"
        },
        "type": {
          "type": "string",
          "description": "Report type: \"bar\", \"column\", \"pie\", \"line\", \"list\", \"gauge\", \"single_score\", \"trend\", \"pivot\", \"calHeatmap\""
        },
        "field": {
          "type": "string",
          "description": "Primary grouping field for the report"
        },
        "query": {
          "type": "string",
          "description": "Encoded query to filter report data"
        },
        "aggregate": {
          "type": "string",
          "description": "Aggregate function: COUNT (default), SUM, AVG, MIN, MAX"
        },
        "group_by": {
          "type": "string",
          "description": "Secondary grouping field (stacked charts)"
        },
        "roles": {
          "type": "string",
          "description": "Comma-separated roles that can view the report"
        }
      },
      "required": [
        "title",
        "table",
        "type"
      ]
    }
  },
  {
    "name": "update_report",
    "description": "Update an existing saved report definition (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Report sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (title, type, query, field, aggregate, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_job_run_history",
    "description": "List recent run history for scheduled jobs (success/failure log)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "job_sys_id": {
          "type": "string",
          "description": "Filter by specific job sys_id"
        },
        "status": {
          "type": "string",
          "description": "Filter by run status: success, error, canceled"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_scheduled_report",
    "description": "[Write] Schedule a report for recurring email delivery",
    "inputSchema": {
      "type": "object",
      "properties": {
        "report_id": {
          "type": "string",
          "description": "Report sys_id"
        },
        "frequency": {
          "type": "string",
          "description": "Frequency: daily/weekly/monthly"
        },
        "recipients": {
          "type": "string",
          "description": "Email addresses"
        },
        "day_of_week": {
          "type": "string",
          "description": "Day of week (for weekly frequency)"
        },
        "day_of_month": {
          "type": "number",
          "description": "Day of month (for monthly frequency)"
        },
        "format": {
          "type": "string",
          "description": "Export format: pdf/csv/xlsx"
        }
      },
      "required": [
        "report_id",
        "frequency",
        "recipients"
      ]
    }
  },
  {
    "name": "create_kpi",
    "description": "[Write] Create a Key Performance Indicator from ServiceNow data",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "KPI name"
        },
        "table": {
          "type": "string",
          "description": "Source table"
        },
        "field": {
          "type": "string",
          "description": "Aggregate field"
        },
        "aggregate": {
          "type": "string",
          "description": "Aggregate function: COUNT/AVG/SUM/MIN/MAX"
        },
        "conditions": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "unit": {
          "type": "string",
          "description": "Display unit"
        }
      },
      "required": [
        "name",
        "table",
        "aggregate"
      ]
    }
  },
  {
    "name": "list_atf_suites",
    "description": "List ATF test suites in the instance",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter to active suites only"
        },
        "query": {
          "type": "string",
          "description": "Additional filter"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_atf_suite",
    "description": "Get details of a test suite including test count",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Test suite sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "run_atf_suite",
    "description": "Execute an ATF test suite (requires ATF_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the test suite"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_atf_tests",
    "description": "List ATF test cases, optionally filtered by suite",
    "inputSchema": {
      "type": "object",
      "properties": {
        "suite_sys_id": {
          "type": "string",
          "description": "Filter by test suite sys_id"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active tests only"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_atf_test",
    "description": "Get details of a specific test case",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the test"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "run_atf_test",
    "description": "Execute a single ATF test (requires ATF_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the test"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "get_atf_suite_result",
    "description": "Get the results of a test suite run",
    "inputSchema": {
      "type": "object",
      "properties": {
        "result_sys_id": {
          "type": "string",
          "description": "System ID of the suite result record"
        }
      },
      "required": [
        "result_sys_id"
      ]
    }
  },
  {
    "name": "list_atf_test_results",
    "description": "List individual test results within a suite run",
    "inputSchema": {
      "type": "object",
      "properties": {
        "suite_result_sys_id": {
          "type": "string",
          "description": "Filter by suite result sys_id"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_atf_failure_insight",
    "description": "Get ATF Failure Insight data — metadata changes between last successful and failed run (role changes, field value changes)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "result_sys_id": {
          "type": "string",
          "description": "System ID of the failed suite result"
        }
      },
      "required": [
        "result_sys_id"
      ]
    }
  },
  {
    "name": "nlq_query",
    "description": "Ask a natural language question and get structured ServiceNow data (ServiceNow NLQ API)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "question": {
          "type": "string",
          "description": "Plain English question (e.g., \"How many P1 incidents were opened this week?\")"
        },
        "table": {
          "type": "string",
          "description": "Optional target table hint"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 10)"
        }
      },
      "required": [
        "question"
      ]
    }
  },
  {
    "name": "ai_search",
    "description": "Semantic AI-powered search across KB, catalog, incidents (ServiceNow AI Search)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Natural language search query"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Sources to search: [\"kb\", \"catalog\", \"incident\"] (default: all)"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 10)"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "generate_summary",
    "description": "Generate an AI summary of any record using Now Assist (latest release: sn_assist/skill/summarize)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name (e.g., \"incident\", \"change_request\")"
        },
        "sys_id": {
          "type": "string",
          "description": "System ID of the record"
        }
      },
      "required": [
        "table",
        "sys_id"
      ]
    }
  },
  {
    "name": "suggest_resolution",
    "description": "Get AI-powered resolution suggestion for an incident based on similar past incidents",
    "inputSchema": {
      "type": "object",
      "properties": {
        "incident_sys_id": {
          "type": "string",
          "description": "System ID of the incident"
        }
      },
      "required": [
        "incident_sys_id"
      ]
    }
  },
  {
    "name": "categorize_incident",
    "description": "Use Predictive Intelligence to predict category, assignment group, and priority (latest release: LightGBM algorithm)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Incident short description"
        },
        "description": {
          "type": "string",
          "description": "Optional full description for better accuracy"
        }
      },
      "required": [
        "short_description"
      ]
    }
  },
  {
    "name": "get_virtual_agent_topics",
    "description": "List Virtual Agent topics available in the instance (latest release: streaming VA API)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter to active topics only"
        },
        "category": {
          "type": "string",
          "description": "Filter by topic category"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "trigger_agentic_playbook",
    "description": "Invoke an Agentic Playbook — context-aware AI agents that complete tasks autonomously ",
    "inputSchema": {
      "type": "object",
      "properties": {
        "playbook_sys_id": {
          "type": "string",
          "description": "System ID of the Agentic Playbook"
        },
        "context": {
          "type": "object",
          "description": "Context key-value pairs to pass to the playbook"
        }
      },
      "required": [
        "playbook_sys_id"
      ]
    }
  },
  {
    "name": "get_ms_copilot_topics",
    "description": "List VA topics exposed to Microsoft Copilot 365 via Custom Engine Agent integration ",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "generate_work_notes",
    "description": "Generate AI-drafted work notes for a record based on its current context",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name"
        },
        "sys_id": {
          "type": "string",
          "description": "System ID of the record"
        },
        "context": {
          "type": "string",
          "description": "Additional context to include in the draft"
        }
      },
      "required": [
        "table",
        "sys_id"
      ]
    }
  },
  {
    "name": "get_pi_models",
    "description": "List available Predictive Intelligence solutions (classification/similarity models)",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "list_business_rules",
    "description": "List business rules (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Filter by table name"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active rules only"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_business_rule",
    "description": "Get full details and script body of a business rule (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the business rule"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_business_rule",
    "description": "Create a new business rule (requires SCRIPTING_ENABLED=true). ServiceNow supports ES2021 async/await in scripts.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Rule name"
        },
        "table": {
          "type": "string",
          "description": "Table this rule applies to"
        },
        "when": {
          "type": "string",
          "description": "\"before\" | \"after\" | \"async\" | \"display\""
        },
        "script": {
          "type": "string",
          "description": "Server-side JavaScript. ServiceNow supports ES2021 (async/await, ?., ??)."
        },
        "condition": {
          "type": "string",
          "description": "Optional condition script"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate the rule (default: true)"
        },
        "order": {
          "type": "number",
          "description": "Execution order (default: 100)"
        }
      },
      "required": [
        "name",
        "table",
        "when",
        "script"
      ]
    }
  },
  {
    "name": "update_business_rule",
    "description": "Update a business rule (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the rule"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update (name, script, active, condition, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_script_includes",
    "description": "List script includes (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Filter (e.g., \"nameLIKEUtil\")"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active includes"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_script_include",
    "description": "Get full script body of a script include (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Script include sys_id or api_name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "create_script_include",
    "description": "Create a new script include (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Script include name"
        },
        "script": {
          "type": "string",
          "description": "Script body (class definition). ServiceNow supports ES2021."
        },
        "api_name": {
          "type": "string",
          "description": "API name used to call this from other scripts"
        },
        "access": {
          "type": "string",
          "description": "\"public\" or \"package_private\" (default: \"public\")"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate (default: true)"
        }
      },
      "required": [
        "name",
        "script"
      ]
    }
  },
  {
    "name": "update_script_include",
    "description": "Update a script include (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the script include"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_client_scripts",
    "description": "List client scripts (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Filter by table name"
        },
        "type": {
          "type": "string",
          "description": "\"onLoad\" | \"onChange\" | \"onSubmit\" | \"onCellEdit\""
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active scripts"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_client_script",
    "description": "Get full details and script body of a client script (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the client script"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_changesets",
    "description": "List update sets (changesets) (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state: \"in progress\", \"complete\", \"ignore\""
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_changeset",
    "description": "Get details of an update set (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Update set sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "commit_changeset",
    "description": "Commit an update set (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the update set"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "publish_changeset",
    "description": "Publish/export an update set to XML for deployment (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the update set"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_client_script",
    "description": "Create a new client script (onLoad, onChange, onSubmit, onCellEdit) (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Script name"
        },
        "table": {
          "type": "string",
          "description": "Table this client script applies to"
        },
        "type": {
          "type": "string",
          "description": "\"onLoad\" | \"onChange\" | \"onSubmit\" | \"onCellEdit\""
        },
        "script": {
          "type": "string",
          "description": "Client-side JavaScript. Use g_form, g_user, etc."
        },
        "field_name": {
          "type": "string",
          "description": "Field name (required for onChange/onCellEdit)"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate the script (default: true)"
        },
        "global": {
          "type": "boolean",
          "description": "Run script globally (default: false)"
        }
      },
      "required": [
        "name",
        "table",
        "type",
        "script"
      ]
    }
  },
  {
    "name": "update_client_script",
    "description": "Update an existing client script (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Client script sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (script, active, name, type, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_ui_policies",
    "description": "List UI Policies for a table (field visibility, mandatory, read-only rules) (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Filter by table name"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active policies only"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_ui_policy",
    "description": "Get full details and conditions of a UI Policy (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "UI Policy sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_ui_policy",
    "description": "Create a new UI Policy to control field behavior dynamically (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Policy description"
        },
        "table": {
          "type": "string",
          "description": "Table to apply this policy on"
        },
        "conditions": {
          "type": "string",
          "description": "Encoded query conditions that trigger the policy"
        },
        "script": {
          "type": "string",
          "description": "Optional script to run when conditions are met"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate immediately (default: true)"
        },
        "run_scripts": {
          "type": "boolean",
          "description": "Run script in addition to UI actions (default: false)"
        }
      },
      "required": [
        "short_description",
        "table"
      ]
    }
  },
  {
    "name": "list_ui_actions",
    "description": "List UI Actions (buttons, context menus, related links) for a table (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Filter by table name"
        },
        "type": {
          "type": "string",
          "description": "Filter by type: button, context_menu, related_link, list_link, list_button, list_context_menu"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active actions only"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_ui_action",
    "description": "Get full details and script of a UI Action (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "UI Action sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_ui_action",
    "description": "Create a new UI Action (button or link) on a form (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Button/link label visible to users"
        },
        "table": {
          "type": "string",
          "description": "Table to add this action on"
        },
        "action_name": {
          "type": "string",
          "description": "Internal action name (no spaces)"
        },
        "script": {
          "type": "string",
          "description": "Server-side script to execute when clicked"
        },
        "type": {
          "type": "string",
          "description": "\"button\" | \"context_menu\" | \"related_link\" | \"list_button\""
        },
        "condition": {
          "type": "string",
          "description": "Condition to show/hide the action"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate immediately (default: true)"
        },
        "form_button": {
          "type": "boolean",
          "description": "Show on form (default: true)"
        },
        "list_button": {
          "type": "boolean",
          "description": "Show on list (default: false)"
        }
      },
      "required": [
        "name",
        "table",
        "action_name"
      ]
    }
  },
  {
    "name": "update_ui_action",
    "description": "Update an existing UI Action (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "UI Action sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (name, script, active, condition, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_acls",
    "description": "List Access Control rules (ACLs) — who can read/write/create/delete records (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Filter ACLs by table name"
        },
        "operation": {
          "type": "string",
          "description": "Filter by operation: read, write, create, delete, execute"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active ACLs only"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_acl",
    "description": "Get full details of an ACL rule including its script and role requirements (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "ACL sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_acl",
    "description": "Create a new ACL rule to control access to a table or field (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "ACL name (typically \"table.field\" or \"table.*\")"
        },
        "type": {
          "type": "string",
          "description": "\"record\" | \"field\" | \"rest_endpoint\" | \"soap_endpoint\""
        },
        "operation": {
          "type": "string",
          "description": "\"read\" | \"write\" | \"create\" | \"delete\" | \"execute\""
        },
        "admin_overrides": {
          "type": "boolean",
          "description": "Allow admin to override (default: true)"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate immediately (default: true)"
        },
        "script": {
          "type": "string",
          "description": "Optional condition script (return true to allow)"
        },
        "roles": {
          "type": "string",
          "description": "Comma-separated roles required (e.g. \"admin,itil\")"
        },
        "description": {
          "type": "string",
          "description": "Description of this access rule"
        }
      },
      "required": [
        "name",
        "operation"
      ]
    }
  },
  {
    "name": "update_acl",
    "description": "Update an existing ACL rule (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "ACL sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (active, script, roles, condition, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "create_story",
    "description": "Create a new agile story/user story (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Story title"
        },
        "story_points": {
          "type": "number",
          "description": "Story point estimate"
        },
        "sprint": {
          "type": "string",
          "description": "Sprint sys_id or name"
        },
        "epic": {
          "type": "string",
          "description": "Epic sys_id"
        },
        "description": {
          "type": "string",
          "description": "Story description and acceptance criteria"
        },
        "assigned_to": {
          "type": "string",
          "description": "User sys_id or username"
        }
      },
      "required": [
        "short_description"
      ]
    }
  },
  {
    "name": "update_story",
    "description": "Update an agile story (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the story"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_stories",
    "description": "List agile stories with optional sprint or state filter",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sprint": {
          "type": "string",
          "description": "Filter by sprint sys_id"
        },
        "state": {
          "type": "string",
          "description": "Filter by state (e.g., \"1\"=Open, \"2\"=Work in Progress, \"3\"=Complete)"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_epic",
    "description": "Create a new epic (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Epic title"
        },
        "description": {
          "type": "string",
          "description": "Epic description and goals"
        },
        "project": {
          "type": "string",
          "description": "Project sys_id"
        }
      },
      "required": [
        "short_description"
      ]
    }
  },
  {
    "name": "update_epic",
    "description": "Update an epic (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the epic"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_epics",
    "description": "List epics with optional project or state filter",
    "inputSchema": {
      "type": "object",
      "properties": {
        "project": {
          "type": "string",
          "description": "Filter by project sys_id"
        },
        "state": {
          "type": "string",
          "description": "Filter by state"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_scrum_task",
    "description": "Create a scrum task (sub-task of a story) (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Task title"
        },
        "story_sys_id": {
          "type": "string",
          "description": "Parent story sys_id"
        },
        "assigned_to": {
          "type": "string",
          "description": "Assignee user_name or sys_id"
        }
      },
      "required": [
        "short_description"
      ]
    }
  },
  {
    "name": "update_scrum_task",
    "description": "Update a scrum task (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the scrum task"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_scrum_tasks",
    "description": "List scrum tasks, optionally filtered by story",
    "inputSchema": {
      "type": "object",
      "properties": {
        "story_sys_id": {
          "type": "string",
          "description": "Filter by parent story sys_id"
        },
        "assigned_to": {
          "type": "string",
          "description": "Filter by assignee"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default: 20)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_hr_case",
    "description": "Create a new HR Service Delivery case (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Brief description of the HR request"
        },
        "hr_service": {
          "type": "string",
          "description": "HR service sys_id or name (e.g. \"Onboarding\", \"Offboarding\")"
        },
        "subject_person": {
          "type": "string",
          "description": "User sys_id or username the case is about"
        },
        "description": {
          "type": "string",
          "description": "Full details of the HR request"
        },
        "assignment_group": {
          "type": "string",
          "description": "HR assignment group name or sys_id"
        },
        "priority": {
          "type": "number",
          "description": "1=Critical, 2=High, 3=Moderate, 4=Low"
        }
      },
      "required": [
        "short_description",
        "hr_service"
      ]
    }
  },
  {
    "name": "get_hr_case",
    "description": "Get full details of an HR case by number (e.g. HRCS0001234) or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "HR case number (HRCS...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_hr_case",
    "description": "Update fields on an existing HR case (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the HR case"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_hr_cases",
    "description": "List HR cases with optional filters (status, subject person, service)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state: open, work_in_progress, closed_complete, closed_incomplete"
        },
        "subject_person": {
          "type": "string",
          "description": "User sys_id or username to filter by"
        },
        "hr_service": {
          "type": "string",
          "description": "HR service name or sys_id"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query string"
        }
      },
      "required": []
    }
  },
  {
    "name": "close_hr_case",
    "description": "Close an HR case with resolution notes (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the HR case"
        },
        "close_notes": {
          "type": "string",
          "description": "Resolution or closure notes"
        },
        "close_code": {
          "type": "string",
          "description": "Closure code (e.g., \"Resolved\", \"Withdrawn\")"
        }
      },
      "required": [
        "sys_id",
        "close_notes"
      ]
    }
  },
  {
    "name": "list_hr_services",
    "description": "List available HR services (Onboarding, Offboarding, Benefits, Payroll, etc.)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter to active services only (default true)"
        },
        "query": {
          "type": "string",
          "description": "Filter by name or description"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_hr_service",
    "description": "Get details of a specific HR service including its tasks and SLAs",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "HR service sys_id or exact name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "get_hr_profile",
    "description": "Get the HR profile for a user (employment details, department, manager)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user_identifier": {
          "type": "string",
          "description": "Username, email, or sys_id of the user"
        }
      },
      "required": [
        "user_identifier"
      ]
    }
  },
  {
    "name": "update_hr_profile",
    "description": "Update HR profile fields for a user (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user_sys_id": {
          "type": "string",
          "description": "sys_id of the user whose profile to update"
        },
        "fields": {
          "type": "object",
          "description": "HR profile fields to update (e.g., {\"department\": \"Engineering\"})"
        }
      },
      "required": [
        "user_sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_hr_tasks",
    "description": "List HR tasks associated with an HR case",
    "inputSchema": {
      "type": "object",
      "properties": {
        "hr_case_sysid": {
          "type": "string",
          "description": "sys_id of the parent HR case"
        },
        "state": {
          "type": "string",
          "description": "Filter by task state (open, closed)"
        }
      },
      "required": [
        "hr_case_sysid"
      ]
    }
  },
  {
    "name": "create_hr_task",
    "description": "Create a task within an HR case (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "hr_case_sysid": {
          "type": "string",
          "description": "sys_id of the parent HR case"
        },
        "short_description": {
          "type": "string",
          "description": "Brief description of the task"
        },
        "assigned_to": {
          "type": "string",
          "description": "User sys_id or username to assign the task to"
        },
        "due_date": {
          "type": "string",
          "description": "Due date in ISO 8601 format"
        }
      },
      "required": [
        "hr_case_sysid",
        "short_description"
      ]
    }
  },
  {
    "name": "get_hr_case_activity",
    "description": "Get the full activity log and journal entries for an HR case",
    "inputSchema": {
      "type": "object",
      "properties": {
        "hr_case_sysid": {
          "type": "string",
          "description": "sys_id of the HR case"
        }
      },
      "required": [
        "hr_case_sysid"
      ]
    }
  },
  {
    "name": "create_onboarding_case",
    "description": "Create an employee onboarding case with all standard tasks. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "employee_sys_id": {
          "type": "string",
          "description": "New employee user sys_id"
        },
        "start_date": {
          "type": "string",
          "description": "Start date (ISO 8601)"
        },
        "department": {
          "type": "string",
          "description": "Department name or sys_id"
        },
        "manager": {
          "type": "string",
          "description": "Manager user sys_id"
        },
        "location": {
          "type": "string",
          "description": "Office location"
        },
        "job_title": {
          "type": "string",
          "description": "Job title"
        }
      },
      "required": [
        "employee_sys_id",
        "start_date"
      ]
    }
  },
  {
    "name": "create_offboarding_case",
    "description": "Create an employee offboarding case with exit tasks. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "employee_sys_id": {
          "type": "string",
          "description": "Departing employee user sys_id"
        },
        "last_day": {
          "type": "string",
          "description": "Last working day (ISO 8601)"
        },
        "reason": {
          "type": "string",
          "description": "Offboarding reason (resignation, termination, retirement)"
        },
        "manager": {
          "type": "string",
          "description": "Manager user sys_id"
        }
      },
      "required": [
        "employee_sys_id",
        "last_day"
      ]
    }
  },
  {
    "name": "get_hr_lifecycle_events",
    "description": "Get HR lifecycle events for an employee (promotions, transfers, leaves)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "employee_sys_id": {
          "type": "string",
          "description": "Employee user sys_id"
        },
        "event_type": {
          "type": "string",
          "description": "Filter by type: promotion, transfer, leave, onboarding, offboarding"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": [
        "employee_sys_id"
      ]
    }
  },
  {
    "name": "list_hr_document_templates",
    "description": "List available HR document templates (offer letters, contracts, policies)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "description": "Filter by category: onboarding, offboarding, benefits, policy"
        },
        "active": {
          "type": "boolean",
          "description": "Filter active only (default true)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_csm_case",
    "description": "Create a new Customer Service case (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Brief summary of the customer issue"
        },
        "account": {
          "type": "string",
          "description": "Account name or sys_id"
        },
        "contact": {
          "type": "string",
          "description": "Contact name or sys_id (the person raising the case)"
        },
        "category": {
          "type": "string",
          "description": "Case category (e.g., \"Product\", \"Billing\", \"Technical\")"
        },
        "subcategory": {
          "type": "string",
          "description": "Case subcategory"
        },
        "priority": {
          "type": "number",
          "description": "1=Critical, 2=High, 3=Moderate, 4=Low"
        },
        "description": {
          "type": "string",
          "description": "Detailed description of the customer issue"
        },
        "product": {
          "type": "string",
          "description": "Product or service sys_id related to the case"
        },
        "assignment_group": {
          "type": "string",
          "description": "CSM assignment group"
        }
      },
      "required": [
        "short_description"
      ]
    }
  },
  {
    "name": "get_csm_case",
    "description": "Get full details of a CSM case by number (e.g. CS0001234) or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Case number (CS...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_csm_case",
    "description": "Update fields on an existing CSM case (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the CSM case"
        },
        "fields": {
          "type": "object",
          "description": "Key-value pairs of fields to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_csm_cases",
    "description": "List CSM cases with optional filters (account, contact, state, priority)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "account": {
          "type": "string",
          "description": "Filter by account name or sys_id"
        },
        "contact": {
          "type": "string",
          "description": "Filter by contact name or sys_id"
        },
        "state": {
          "type": "string",
          "description": "Filter by state (open, resolved, closed)"
        },
        "priority": {
          "type": "number",
          "description": "Filter by priority (1-4)"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query"
        }
      },
      "required": []
    }
  },
  {
    "name": "close_csm_case",
    "description": "Close a CSM case with resolution details (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the CSM case"
        },
        "resolution_code": {
          "type": "string",
          "description": "How the case was resolved"
        },
        "resolution_notes": {
          "type": "string",
          "description": "Detailed resolution notes"
        }
      },
      "required": [
        "sys_id",
        "resolution_notes"
      ]
    }
  },
  {
    "name": "get_csm_account",
    "description": "Get details of a customer account including contacts and open cases count",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name_or_sysid": {
          "type": "string",
          "description": "Account name or sys_id"
        }
      },
      "required": [
        "name_or_sysid"
      ]
    }
  },
  {
    "name": "list_csm_accounts",
    "description": "List customer accounts with optional search filter",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search accounts by name"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active accounts only (default true)"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_csm_contact",
    "description": "Get details of a customer contact (name, account, phone, email)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name_or_sysid": {
          "type": "string",
          "description": "Contact name, email, or sys_id"
        }
      },
      "required": [
        "name_or_sysid"
      ]
    }
  },
  {
    "name": "list_csm_contacts",
    "description": "List contacts for an account or search across all contacts",
    "inputSchema": {
      "type": "object",
      "properties": {
        "account_sysid": {
          "type": "string",
          "description": "Filter contacts by account sys_id"
        },
        "query": {
          "type": "string",
          "description": "Search by name or email"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_csm_case_sla",
    "description": "Get SLA details and remaining time for a CSM case",
    "inputSchema": {
      "type": "object",
      "properties": {
        "case_sysid": {
          "type": "string",
          "description": "sys_id of the CSM case"
        }
      },
      "required": [
        "case_sysid"
      ]
    }
  },
  {
    "name": "list_csm_products",
    "description": "List products and services available in the CSM catalog",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search products by name"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_security_incident",
    "description": "Create a Security Operations incident (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Brief description of the security event"
        },
        "category": {
          "type": "string",
          "description": "Incident category (e.g., \"Malware\", \"Phishing\", \"Data Breach\", \"Unauthorized Access\")"
        },
        "subcategory": {
          "type": "string",
          "description": "Incident subcategory"
        },
        "severity": {
          "type": "number",
          "description": "1=High, 2=Medium, 3=Low"
        },
        "description": {
          "type": "string",
          "description": "Detailed description of the security incident"
        },
        "affected_cis": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "List of affected CI sys_ids"
        },
        "assignment_group": {
          "type": "string",
          "description": "SOC team or assignment group"
        }
      },
      "required": [
        "short_description",
        "category"
      ]
    }
  },
  {
    "name": "get_security_incident",
    "description": "Get full details of a security incident by number or sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Security incident number (SIR...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_security_incident",
    "description": "Update a security incident record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the security incident"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (state, severity, containment_status, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_security_incidents",
    "description": "List security incidents with filters (severity, state, category)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state (open, analysis, contain, eradicate, recover, review, closed)"
        },
        "severity": {
          "type": "number",
          "description": "Filter by severity (1=High, 2=Medium, 3=Low)"
        },
        "category": {
          "type": "string",
          "description": "Filter by incident category"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query string"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_vulnerabilities",
    "description": "List vulnerability entries from the Vulnerability Response module",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state (open, in_review, risk_accepted, closed)"
        },
        "severity": {
          "type": "string",
          "description": "Filter by CVSS severity (critical, high, medium, low)"
        },
        "ci_sysid": {
          "type": "string",
          "description": "Filter by affected CI sys_id"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query string"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_vulnerability",
    "description": "Get details of a specific vulnerability entry including CVSS score and affected CIs",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Vulnerability number (VIT...) or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "update_vulnerability",
    "description": "Update a vulnerability entry (state, risk acceptance notes, remediation date) (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "System ID of the vulnerability entry"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (state, risk_acceptance_notes, remediation_date, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_grc_risks",
    "description": "List GRC (Governance, Risk, Compliance) risk entries",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by risk state (draft, assess, review, accepted, closed)"
        },
        "category": {
          "type": "string",
          "description": "Filter by risk category"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_grc_risk",
    "description": "Get details of a GRC risk including impact, likelihood, and controls",
    "inputSchema": {
      "type": "object",
      "properties": {
        "number_or_sysid": {
          "type": "string",
          "description": "Risk number or sys_id"
        }
      },
      "required": [
        "number_or_sysid"
      ]
    }
  },
  {
    "name": "list_grc_controls",
    "description": "List GRC controls with optional filter by risk or policy",
    "inputSchema": {
      "type": "object",
      "properties": {
        "risk_sysid": {
          "type": "string",
          "description": "Filter controls by related risk sys_id"
        },
        "state": {
          "type": "string",
          "description": "Filter by control state (draft, attest, review, exception, compliant, non_compliant)"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_threat_intelligence",
    "description": "Query threat intelligence data — IOCs, threat actors, and campaigns",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search term (IP, domain, hash, actor name)"
        },
        "type": {
          "type": "string",
          "description": "Filter by IOC type: ip_address, domain, file_hash, url, email"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "name": "list_security_playbooks",
    "description": "List available security response playbooks",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter active only (default true)"
        },
        "category": {
          "type": "string",
          "description": "Filter by category (incident_response, threat_hunting, compliance)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "run_security_playbook",
    "description": "Execute a security response playbook against an incident. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "playbook_sys_id": {
          "type": "string",
          "description": "Playbook sys_id to execute"
        },
        "incident_sys_id": {
          "type": "string",
          "description": "Security incident sys_id to run against"
        },
        "parameters": {
          "type": "object",
          "description": "Optional playbook input parameters"
        }
      },
      "required": [
        "playbook_sys_id",
        "incident_sys_id"
      ]
    }
  },
  {
    "name": "get_security_dashboard",
    "description": "Get security posture dashboard — open incidents by severity, vulnerability counts, mean time to resolve",
    "inputSchema": {
      "type": "object",
      "properties": {
        "days": {
          "type": "number",
          "description": "Look-back period in days (default 30)"
        }
      },
      "required": []
    }
  },
  {
    "name": "scan_vulnerabilities",
    "description": "Trigger a vulnerability scan for specified CIs or groups. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "ci_sys_ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "CI sys_ids to scan"
        },
        "group": {
          "type": "string",
          "description": "CI group to scan (alternative to ci_sys_ids)"
        },
        "scan_type": {
          "type": "string",
          "description": "Scan type: full, quick, compliance (default full)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_grc_risk",
    "description": "Create a new GRC risk entry. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Risk name"
        },
        "category": {
          "type": "string",
          "description": "Risk category"
        },
        "description": {
          "type": "string",
          "description": "Risk description"
        },
        "impact": {
          "type": "number",
          "description": "Impact score (1-5)"
        },
        "likelihood": {
          "type": "number",
          "description": "Likelihood score (1-5)"
        },
        "owner": {
          "type": "string",
          "description": "Risk owner user sys_id"
        }
      },
      "required": [
        "name",
        "category"
      ]
    }
  },
  {
    "name": "list_compliance_policies",
    "description": "List GRC compliance policies and their current status",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state (draft, published, retired)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_compliance_assessment",
    "description": "Get compliance assessment results for a policy or control",
    "inputSchema": {
      "type": "object",
      "properties": {
        "policy_sys_id": {
          "type": "string",
          "description": "Policy sys_id"
        },
        "control_sys_id": {
          "type": "string",
          "description": "Control sys_id (alternative to policy)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_audit_results",
    "description": "List audit results and findings",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state (open, in_progress, closed)"
        },
        "severity": {
          "type": "string",
          "description": "Filter by severity (critical, high, medium, low)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_flows",
    "description": "List Flow Designer flows with optional filter by name, category, or active status",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search flows by name or description"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active flows only (default true)"
        },
        "category": {
          "type": "string",
          "description": "Filter by category (e.g., \"ITSM\", \"HR\", \"Security\")"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_flow",
    "description": "Get full details of a Flow Designer flow including its actions and trigger",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name_or_sysid": {
          "type": "string",
          "description": "Flow name or sys_id"
        }
      },
      "required": [
        "name_or_sysid"
      ]
    }
  },
  {
    "name": "trigger_flow",
    "description": "Trigger a Flow Designer flow with optional input parameters (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "flow_sys_id": {
          "type": "string",
          "description": "sys_id of the flow to trigger"
        },
        "inputs": {
          "type": "object",
          "description": "Key-value pairs for flow input variables"
        }
      },
      "required": [
        "flow_sys_id"
      ]
    }
  },
  {
    "name": "get_flow_execution",
    "description": "Get the status and details of a specific flow execution",
    "inputSchema": {
      "type": "object",
      "properties": {
        "execution_sysid": {
          "type": "string",
          "description": "sys_id of the flow execution to inspect"
        }
      },
      "required": [
        "execution_sysid"
      ]
    }
  },
  {
    "name": "list_flow_executions",
    "description": "List recent executions of a flow with status (completed, error, running)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "flow_sys_id": {
          "type": "string",
          "description": "sys_id of the parent flow"
        },
        "status": {
          "type": "string",
          "description": "Filter by status: running, complete, error, cancelled"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": [
        "flow_sys_id"
      ]
    }
  },
  {
    "name": "list_subflows",
    "description": "List available subflows that can be reused across flows",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search subflows by name"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active subflows only (default true)"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_subflow",
    "description": "Get full details of a subflow including its inputs, outputs, and actions",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name_or_sysid": {
          "type": "string",
          "description": "Subflow name or sys_id"
        }
      },
      "required": [
        "name_or_sysid"
      ]
    }
  },
  {
    "name": "list_action_instances",
    "description": "List reusable Flow Designer action instances available in the environment",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search actions by name or category"
        },
        "category": {
          "type": "string",
          "description": "Filter by action category (e.g., \"ServiceNow Core\", \"Integrations\")"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_process_automation",
    "description": "Get details of a Process Automation Designer playbook or process",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name_or_sysid": {
          "type": "string",
          "description": "Playbook or process name or sys_id"
        }
      },
      "required": [
        "name_or_sysid"
      ]
    }
  },
  {
    "name": "list_process_automations",
    "description": "List Process Automation Designer playbooks and processes",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search by name or description"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active processes only (default true)"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_flow",
    "description": "Create a new Flow Designer flow. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Flow name"
        },
        "description": {
          "type": "string",
          "description": "Flow description"
        },
        "trigger_type": {
          "type": "string",
          "description": "Trigger type: record, schedule, inbound_email, rest (default record)"
        },
        "trigger_table": {
          "type": "string",
          "description": "Trigger table (for record triggers)"
        },
        "scope": {
          "type": "string",
          "description": "Application scope"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "create_subflow",
    "description": "Create a new reusable subflow. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Subflow name"
        },
        "description": {
          "type": "string",
          "description": "Subflow description"
        },
        "inputs": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Input variable definitions [{name, type, mandatory}]"
        },
        "scope": {
          "type": "string",
          "description": "Application scope"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "create_flow_action",
    "description": "Create a custom Flow Designer action. **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Action name"
        },
        "description": {
          "type": "string",
          "description": "Action description"
        },
        "inputs": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Input definitions [{name, type, mandatory}]"
        },
        "outputs": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Output definitions [{name, type}]"
        },
        "script": {
          "type": "string",
          "description": "Action script body"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "publish_flow",
    "description": "Publish (activate) a draft flow or subflow. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "flow_sys_id": {
          "type": "string",
          "description": "Flow or subflow sys_id to publish"
        },
        "type": {
          "type": "string",
          "description": "Type: flow or subflow (default flow)"
        }
      },
      "required": [
        "flow_sys_id"
      ]
    }
  },
  {
    "name": "test_flow",
    "description": "Execute a flow in test mode with sample inputs. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "flow_sys_id": {
          "type": "string",
          "description": "Flow sys_id to test"
        },
        "test_inputs": {
          "type": "object",
          "description": "Test input values"
        }
      },
      "required": [
        "flow_sys_id"
      ]
    }
  },
  {
    "name": "get_flow_error_log",
    "description": "Get detailed error logs for failed flow executions",
    "inputSchema": {
      "type": "object",
      "properties": {
        "flow_sys_id": {
          "type": "string",
          "description": "Flow sys_id"
        },
        "days": {
          "type": "number",
          "description": "Look-back period in days (default 7)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": [
        "flow_sys_id"
      ]
    }
  },
  {
    "name": "list_portals",
    "description": "List all Service Portal configurations available in the instance",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search portals by title or url_suffix"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_portal",
    "description": "Create a new Service Portal configuration (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "Human-readable portal title"
        },
        "url_suffix": {
          "type": "string",
          "description": "URL path segment for the portal (e.g. \"myportal\" → /myportal)"
        },
        "default_homepage": {
          "type": "string",
          "description": "sys_id of the default homepage sp_page record"
        },
        "theme": {
          "type": "string",
          "description": "sys_id of the sp_theme to apply"
        },
        "logo": {
          "type": "string",
          "description": "sys_id of the logo attachment record"
        },
        "description": {
          "type": "string",
          "description": "Short description of the portal"
        }
      },
      "required": [
        "title",
        "url_suffix"
      ]
    }
  },
  {
    "name": "create_portal_page",
    "description": "Create a new page inside a Service Portal (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "Page title"
        },
        "id": {
          "type": "string",
          "description": "Unique page ID used in the URL (e.g. \"my-page\")"
        },
        "portal_sys_id": {
          "type": "string",
          "description": "sys_id of the parent Service Portal"
        },
        "description": {
          "type": "string",
          "description": "Brief description of the page purpose"
        }
      },
      "required": [
        "title",
        "id",
        "portal_sys_id"
      ]
    }
  },
  {
    "name": "get_portal",
    "description": "Get full configuration details of a Service Portal by sys_id or URL suffix",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Portal sys_id or url_suffix (e.g. \"sp\", \"itsm\")"
        }
      },
      "required": [
        "id"
      ]
    }
  },
  {
    "name": "list_portal_pages",
    "description": "List pages that belong to a Service Portal",
    "inputSchema": {
      "type": "object",
      "properties": {
        "portal_sys_id": {
          "type": "string",
          "description": "sys_id of the parent portal"
        },
        "query": {
          "type": "string",
          "description": "Filter pages by title or id"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": [
        "portal_sys_id"
      ]
    }
  },
  {
    "name": "get_portal_page",
    "description": "Get details of a specific Service Portal page including its layout",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Page sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_portal_widgets",
    "description": "List Service Portal widgets with optional search by name or category",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search widgets by name or description"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_portal_widget",
    "description": "Get full source code (HTML, CSS, client/server scripts) of a Service Portal widget",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id_or_sysid": {
          "type": "string",
          "description": "Widget sys_id or id field (e.g. \"widget-cool-clock\")"
        }
      },
      "required": [
        "id_or_sysid"
      ]
    }
  },
  {
    "name": "create_portal_widget",
    "description": "Create a new Service Portal widget with template, CSS, and scripts (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Human-readable widget name"
        },
        "id": {
          "type": "string",
          "description": "Unique widget ID/handle (e.g. \"my-custom-widget\")"
        },
        "template": {
          "type": "string",
          "description": "Angular HTML template"
        },
        "css": {
          "type": "string",
          "description": "SCSS/CSS styles"
        },
        "client_script": {
          "type": "string",
          "description": "Client-side controller JavaScript"
        },
        "server_script": {
          "type": "string",
          "description": "Server-side script (GlideRecord calls)"
        },
        "option_schema": {
          "type": "string",
          "description": "JSON array defining widget options"
        },
        "demo_data": {
          "type": "string",
          "description": "JSON object with demo data for preview"
        }
      },
      "required": [
        "name",
        "id"
      ]
    }
  },
  {
    "name": "update_portal_widget",
    "description": "Update an existing Service Portal widget's source code (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Widget sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update: template, css, client_script, server_script, name, etc."
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_widget_instances",
    "description": "List instances of a specific widget placed on portal pages",
    "inputSchema": {
      "type": "object",
      "properties": {
        "widget_sys_id": {
          "type": "string",
          "description": "Widget sys_id to find instances of"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": [
        "widget_sys_id"
      ]
    }
  },
  {
    "name": "list_ux_apps",
    "description": "List Next Experience (UI Builder) applications",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search apps by name"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_ux_app",
    "description": "Get configuration details of a Next Experience application",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "App sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "list_ux_pages",
    "description": "List pages within a Next Experience (UI Builder) application",
    "inputSchema": {
      "type": "object",
      "properties": {
        "app_sys_id": {
          "type": "string",
          "description": "Parent UX app sys_id"
        },
        "query": {
          "type": "string",
          "description": "Filter pages by name"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": [
        "app_sys_id"
      ]
    }
  },
  {
    "name": "list_portal_themes",
    "description": "List Service Portal themes (color palettes, CSS variables)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_portal_theme",
    "description": "Get full details of a Service Portal theme including CSS variables",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Theme sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_rest_messages",
    "description": "List outbound REST Message configurations (integrations with external APIs)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search by name or description"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_rest_message",
    "description": "Get full configuration of an outbound REST Message including its endpoints",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "REST Message sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "list_rest_message_functions",
    "description": "List HTTP methods (functions) defined within a REST Message",
    "inputSchema": {
      "type": "object",
      "properties": {
        "rest_message_sys_id": {
          "type": "string",
          "description": "Parent REST Message sys_id"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": [
        "rest_message_sys_id"
      ]
    }
  },
  {
    "name": "create_rest_message",
    "description": "Create a new outbound REST Message definition (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Unique REST Message name"
        },
        "endpoint": {
          "type": "string",
          "description": "Base URL endpoint (e.g. \"https://api.example.com/v1\")"
        },
        "description": {
          "type": "string",
          "description": "Purpose/description of this integration"
        },
        "use_mutual_auth": {
          "type": "boolean",
          "description": "Whether to use mutual TLS authentication"
        },
        "authentication_type": {
          "type": "string",
          "description": "Auth type: \"no_authentication\", \"basic\", \"oauth2\""
        }
      },
      "required": [
        "name",
        "endpoint"
      ]
    }
  },
  {
    "name": "list_transform_maps",
    "description": "List Transform Maps used for importing data into ServiceNow tables",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search by name or target table"
        },
        "target_table": {
          "type": "string",
          "description": "Filter by target table name (e.g. \"incident\")"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_transform_map",
    "description": "Get details of a Transform Map including its field mappings",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Transform Map sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "run_transform_map",
    "description": "Execute a Transform Map on an Import Set to load data (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "transform_map_sys_id": {
          "type": "string",
          "description": "sys_id of the Transform Map to run"
        },
        "import_set_sys_id": {
          "type": "string",
          "description": "sys_id of the Import Set containing source data"
        }
      },
      "required": [
        "transform_map_sys_id",
        "import_set_sys_id"
      ]
    }
  },
  {
    "name": "list_transform_field_maps",
    "description": "List field-level mappings within a Transform Map",
    "inputSchema": {
      "type": "object",
      "properties": {
        "transform_map_sys_id": {
          "type": "string",
          "description": "Parent Transform Map sys_id"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": [
        "transform_map_sys_id"
      ]
    }
  },
  {
    "name": "list_import_sets",
    "description": "List Import Sets with optional filter by state or staging table",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state: loaded, partial, transform_failed, complete"
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query string"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_import_set",
    "description": "Get details of a specific Import Set including row count and transform status",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Import Set sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_import_set_row",
    "description": "Insert a row into an Import Set staging table for later transformation (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "staging_table": {
          "type": "string",
          "description": "Staging table name (e.g. \"u_import_incident\"). Must already exist."
        },
        "data": {
          "type": "object",
          "description": "Key-value pairs for the staging table row"
        }
      },
      "required": [
        "staging_table",
        "data"
      ]
    }
  },
  {
    "name": "list_data_sources",
    "description": "List Import Set data source definitions (file/JDBC/REST loaders)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search by name"
        },
        "type": {
          "type": "string",
          "description": "Filter by type: file, jdbc, ldap, rest"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_event_registry",
    "description": "List registered event definitions in the ServiceNow event registry",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search events by name or description"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_event_registry_entry",
    "description": "Get details of a specific registered event definition",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name_or_sysid": {
          "type": "string",
          "description": "Event name (e.g. \"incident.created\") or sys_id"
        }
      },
      "required": [
        "name_or_sysid"
      ]
    }
  },
  {
    "name": "register_event",
    "description": "Register a new custom event in the event registry (requires SCRIPTING_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Unique event name (e.g. \"my_app.record_created\")"
        },
        "description": {
          "type": "string",
          "description": "Description of when this event fires"
        },
        "table": {
          "type": "string",
          "description": "Table that fires this event (e.g. \"incident\")"
        }
      },
      "required": [
        "name",
        "table"
      ]
    }
  },
  {
    "name": "fire_event",
    "description": "Fire a custom ServiceNow event for a specific record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "event_name": {
          "type": "string",
          "description": "Event name to fire (must be registered)"
        },
        "table": {
          "type": "string",
          "description": "Table name of the target record"
        },
        "record_sys_id": {
          "type": "string",
          "description": "sys_id of the record to fire the event on"
        },
        "parm1": {
          "type": "string",
          "description": "Optional first parameter passed to event handlers"
        },
        "parm2": {
          "type": "string",
          "description": "Optional second parameter passed to event handlers"
        }
      },
      "required": [
        "event_name",
        "table",
        "record_sys_id"
      ]
    }
  },
  {
    "name": "list_event_log",
    "description": "List recent event log entries (fired events and their processing status)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "event_name": {
          "type": "string",
          "description": "Filter by event name"
        },
        "state": {
          "type": "string",
          "description": "Filter by state: ready, processing, processed, error, transferred"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_oauth_applications",
    "description": "List OAuth application registry entries (client applications that can authenticate)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search by name or client ID"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_credential_aliases",
    "description": "List connection and credential aliases used by integrations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search by name"
        },
        "type": {
          "type": "string",
          "description": "Filter by type: basic, oauth2, api_key, certificate"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_notifications",
    "description": "List email notification definitions (sysevent_email_action)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search notifications by name"
        },
        "table": {
          "type": "string",
          "description": "Filter by target table (e.g. \"incident\")"
        },
        "event": {
          "type": "string",
          "description": "Filter by event trigger name"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active notifications only"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_notification",
    "description": "Get full details of an email notification definition including template and conditions",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Notification sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "create_notification",
    "description": "Create a new email notification definition (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Notification name"
        },
        "table": {
          "type": "string",
          "description": "Table that triggers this notification (e.g. \"incident\")"
        },
        "event": {
          "type": "string",
          "description": "Event name that fires this notification (e.g. \"incident.commented\")"
        },
        "subject": {
          "type": "string",
          "description": "Email subject line (supports ${field} variables)"
        },
        "message_html": {
          "type": "string",
          "description": "HTML body of the email notification"
        },
        "recipients": {
          "type": "string",
          "description": "Who receives the email (e.g. \"assigned_to\", \"watch_list\")"
        },
        "active": {
          "type": "boolean",
          "description": "Whether to activate immediately (default true)"
        },
        "condition": {
          "type": "string",
          "description": "Additional filter condition script"
        }
      },
      "required": [
        "name",
        "table"
      ]
    }
  },
  {
    "name": "update_notification",
    "description": "Update an existing email notification (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Notification sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update: name, subject, message_html, active, condition, etc."
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "list_email_logs",
    "description": "List outbound email log entries to track sent/failed emails",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "Filter by state: sent, failed, ready, sending, ignored"
        },
        "recipient": {
          "type": "string",
          "description": "Filter by recipient email address"
        },
        "subject": {
          "type": "string",
          "description": "Filter emails by subject (partial match)"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_email_log",
    "description": "Get full details of an email log entry including body and headers",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Email log sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_attachments",
    "description": "List attachments associated with a specific record",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name (e.g. \"incident\")"
        },
        "record_sys_id": {
          "type": "string",
          "description": "sys_id of the record whose attachments to list"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": [
        "table",
        "record_sys_id"
      ]
    }
  },
  {
    "name": "get_attachment_metadata",
    "description": "Get metadata (name, type, size) of a specific attachment by its sys_id",
    "inputSchema": {
      "type": "object",
      "properties": {
        "attachment_sys_id": {
          "type": "string",
          "description": "Attachment sys_id"
        }
      },
      "required": [
        "attachment_sys_id"
      ]
    }
  },
  {
    "name": "delete_attachment",
    "description": "Delete an attachment from a record (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "attachment_sys_id": {
          "type": "string",
          "description": "sys_id of the attachment to delete"
        }
      },
      "required": [
        "attachment_sys_id"
      ]
    }
  },
  {
    "name": "upload_attachment",
    "description": "Upload a base64-encoded attachment to a ServiceNow record (requires WRITE_ENABLED=true). Useful for adding files, screenshots, or documents to incidents, changes, etc.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name (e.g. \"incident\")"
        },
        "record_sys_id": {
          "type": "string",
          "description": "sys_id of the record to attach the file to"
        },
        "file_name": {
          "type": "string",
          "description": "File name including extension (e.g. \"screenshot.png\")"
        },
        "content_type": {
          "type": "string",
          "description": "MIME type (e.g. \"image/png\", \"application/pdf\", \"text/plain\", \"application/json\")"
        },
        "content_base64": {
          "type": "string",
          "description": "Base64-encoded file content (use standard base64 encoding)"
        }
      },
      "required": [
        "table",
        "record_sys_id",
        "file_name",
        "content_type",
        "content_base64"
      ]
    }
  },
  {
    "name": "list_email_templates",
    "description": "List email notification templates used by notifications",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search templates by name"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_notification_subscriptions",
    "description": "List user subscriptions to notifications (who has opted in/out)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user_sys_id": {
          "type": "string",
          "description": "User sys_id to list their subscriptions"
        },
        "notification_sys_id": {
          "type": "string",
          "description": "Filter by specific notification"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "send_emergency_broadcast",
    "description": "[Write] Send emergency broadcast notification to users or groups",
    "inputSchema": {
      "type": "object",
      "properties": {
        "subject": {
          "type": "string",
          "description": "Broadcast subject"
        },
        "body": {
          "type": "string",
          "description": "Message body"
        },
        "recipients": {
          "type": "string",
          "description": "Comma-separated user/group sys_ids"
        },
        "channels": {
          "type": "string",
          "description": "Delivery channels: email,sms,push"
        }
      },
      "required": [
        "subject",
        "body",
        "recipients"
      ]
    }
  },
  {
    "name": "schedule_notification",
    "description": "[Write] Schedule a notification for future delivery",
    "inputSchema": {
      "type": "object",
      "properties": {
        "notification_id": {
          "type": "string",
          "description": "Notification rule sys_id"
        },
        "schedule": {
          "type": "string",
          "description": "Cron expression or ISO date"
        },
        "active": {
          "type": "boolean",
          "description": "Whether the notification is active"
        }
      },
      "required": [
        "notification_id",
        "schedule"
      ]
    }
  },
  {
    "name": "list_pa_indicators",
    "description": "List Performance Analytics (PA) indicators (KPIs) available in the instance",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search indicators by name or description"
        },
        "category": {
          "type": "string",
          "description": "Filter by indicator category"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active indicators only (default true)"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_pa_indicator",
    "description": "Get details of a specific Performance Analytics indicator including its formula",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Indicator sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "get_pa_scorecard",
    "description": "Get current scorecard data for a PA indicator — returns current value, target, trend direction",
    "inputSchema": {
      "type": "object",
      "properties": {
        "indicator_sys_id": {
          "type": "string",
          "description": "PA indicator sys_id"
        },
        "breakdown_sys_id": {
          "type": "string",
          "description": "Optional breakdown (dimension) sys_id to segment data by group"
        },
        "period": {
          "type": "string",
          "description": "Time period: last_7_days, last_30_days, last_quarter, last_year (default: last_30_days)"
        },
        "include_scores": {
          "type": "boolean",
          "description": "Include individual score records (default false)"
        }
      },
      "required": [
        "indicator_sys_id"
      ]
    }
  },
  {
    "name": "get_pa_time_series",
    "description": "Get historical time-series data for a PA indicator to identify trends",
    "inputSchema": {
      "type": "object",
      "properties": {
        "indicator_sys_id": {
          "type": "string",
          "description": "PA indicator sys_id"
        },
        "start_date": {
          "type": "string",
          "description": "Start date in YYYY-MM-DD format (default: 30 days ago)"
        },
        "end_date": {
          "type": "string",
          "description": "End date in YYYY-MM-DD format (default: today)"
        },
        "limit": {
          "type": "number",
          "description": "Max data points to return (default 100)"
        }
      },
      "required": [
        "indicator_sys_id"
      ]
    }
  },
  {
    "name": "list_pa_breakdowns",
    "description": "List PA breakdowns (dimensions) available for segmenting indicator data",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search breakdowns by name"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_pa_dashboards",
    "description": "List Performance Analytics dashboards",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search dashboards by name"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_pa_dashboard",
    "description": "Get details of a PA dashboard including its widgets/tabs",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id_or_name": {
          "type": "string",
          "description": "Dashboard sys_id or name"
        }
      },
      "required": [
        "sys_id_or_name"
      ]
    }
  },
  {
    "name": "list_homepages",
    "description": "List homepage dashboards (CMS content pages used as homepages)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search by title"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_pa_jobs",
    "description": "List Performance Analytics data collection jobs and their schedules",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter to active jobs only (default true)"
        },
        "query": {
          "type": "string",
          "description": "Search by name"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_pa_job",
    "description": "Get details of a Performance Analytics collection job",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "PA job sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_dashboard",
    "description": "Create a new Performance Analytics dashboard (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Dashboard name"
        },
        "description": {
          "type": "string",
          "description": "Brief description of the dashboard"
        },
        "roles": {
          "type": "string",
          "description": "Comma-separated roles that can view this dashboard (leave blank for all)"
        },
        "active": {
          "type": "boolean",
          "description": "Activate the dashboard immediately (default: true)"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "update_dashboard",
    "description": "Update an existing PA dashboard (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Dashboard sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (name, description, roles, active, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "check_table_completeness",
    "description": "Analyze data quality and field completeness for a ServiceNow table — returns percentage of non-empty values per field",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name to analyze (e.g. \"incident\", \"cmdb_ci_server\")"
        },
        "fields": {
          "type": "string",
          "description": "Comma-separated field names to check (e.g. \"assigned_to,priority,category\")"
        },
        "query": {
          "type": "string",
          "description": "Optional encoded query to scope the analysis (e.g. \"active=true\")"
        },
        "sample_size": {
          "type": "number",
          "description": "Number of records to sample (default 100, max 500)"
        }
      },
      "required": [
        "table",
        "fields"
      ]
    }
  },
  {
    "name": "get_table_record_count",
    "description": "Get total record count for a ServiceNow table with optional filters",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table name"
        },
        "query": {
          "type": "string",
          "description": "Optional encoded query to count a subset"
        }
      },
      "required": [
        "table"
      ]
    }
  },
  {
    "name": "compare_record_counts",
    "description": "Compare record counts across multiple ServiceNow tables or time periods — useful for capacity planning",
    "inputSchema": {
      "type": "object",
      "properties": {
        "tables": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "List of table names to compare (e.g. [\"incident\", \"change_request\", \"problem\"])"
        },
        "query": {
          "type": "string",
          "description": "Optional query to apply to all tables"
        }
      },
      "required": [
        "tables"
      ]
    }
  },
  {
    "name": "get_system_property",
    "description": "Get a ServiceNow system property value and metadata by name",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Property name (e.g. \"glide.smtp.host\")"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "set_system_property",
    "description": "Create or update a ServiceNow system property value. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Property name"
        },
        "value": {
          "type": "string",
          "description": "Property value"
        },
        "description": {
          "type": "string",
          "description": "Optional description"
        },
        "type": {
          "type": "string",
          "description": "Property type: string, integer, boolean, choice, password2, etc."
        }
      },
      "required": [
        "name",
        "value"
      ]
    }
  },
  {
    "name": "list_system_properties",
    "description": "List system properties with optional filtering",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Encoded query to filter properties"
        },
        "category": {
          "type": "string",
          "description": "Filter by category (e.g. \"email\", \"security\")"
        },
        "type": {
          "type": "string",
          "description": "Filter by type (e.g. \"boolean\", \"string\")"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "delete_system_property",
    "description": "Delete a system property by name. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Property name to delete"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "search_system_properties",
    "description": "Search system properties by name, value, or description",
    "inputSchema": {
      "type": "object",
      "properties": {
        "search": {
          "type": "string",
          "description": "Search text matched against name, value, and description"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default 20)"
        }
      },
      "required": [
        "search"
      ]
    }
  },
  {
    "name": "bulk_get_properties",
    "description": "Retrieve multiple system property values in a single call",
    "inputSchema": {
      "type": "object",
      "properties": {
        "names": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Array of property names to retrieve"
        }
      },
      "required": [
        "names"
      ]
    }
  },
  {
    "name": "bulk_set_properties",
    "description": "Create or update multiple system properties in a single operation. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "properties": {
          "type": "array",
          "description": "Array of {name, value, description?} objects",
          "items": {
            "type": "object",
            "properties": {
              "name": {
                "type": "string"
              },
              "value": {
                "type": "string"
              },
              "description": {
                "type": "string"
              }
            },
            "required": [
              "name",
              "value"
            ]
          }
        }
      },
      "required": [
        "properties"
      ]
    }
  },
  {
    "name": "export_properties",
    "description": "Export system properties matching a query to a JSON object (useful for environment snapshots)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "category": {
          "type": "string",
          "description": "Filter by category"
        },
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        }
      },
      "required": []
    }
  },
  {
    "name": "import_properties",
    "description": "Import (create or update) system properties from a JSON object. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "properties": {
          "type": "object",
          "description": "Key-value map of property names to values (e.g. {\"glide.smtp.host\": \"smtp.example.com\"})"
        },
        "dry_run": {
          "type": "boolean",
          "description": "If true, show what would be changed without writing (default false)"
        }
      },
      "required": [
        "properties"
      ]
    }
  },
  {
    "name": "validate_property",
    "description": "Validate a property value against its declared type constraints without saving",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Property name"
        },
        "value": {
          "type": "string",
          "description": "Value to validate"
        }
      },
      "required": [
        "name",
        "value"
      ]
    }
  },
  {
    "name": "list_property_categories",
    "description": "List all unique property categories with their record counts",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "get_property_history",
    "description": "Get audit history of changes to a system property",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Property name"
        },
        "limit": {
          "type": "number",
          "description": "Max audit records (default 20)"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "get_current_update_set",
    "description": "Get the currently active Update Set for the session",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "list_update_sets",
    "description": "List Update Sets by state (in progress, complete, ignore)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "State filter: \"in progress\", \"complete\", \"ignore\""
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query filter"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_update_set",
    "description": "Create a new Update Set and optionally switch to it. **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Update Set name"
        },
        "description": {
          "type": "string",
          "description": "Purpose or description"
        },
        "release": {
          "type": "string",
          "description": "Target release label"
        },
        "switch_to": {
          "type": "boolean",
          "description": "Switch to this Update Set after creation (default true)"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "switch_update_set",
    "description": "Switch the active Update Set context to a specified Update Set. **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "sys_id of the target Update Set"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "complete_update_set",
    "description": "Mark an Update Set as complete (ready for migration). **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Update Set sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "preview_update_set",
    "description": "Preview all changes contained in an Update Set",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Update Set sys_id"
        },
        "limit": {
          "type": "number",
          "description": "Max records to list (default 100)"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "export_update_set",
    "description": "Get the XML export payload for an Update Set (as used in migration). **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Update Set sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "ensure_active_update_set",
    "description": "Ensure an active Update Set exists; create one automatically if none is in progress. **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "default_name": {
          "type": "string",
          "description": "Name to use when auto-creating (default: \"AI Session Update Set\")"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_va_topic",
    "description": "Create a new Virtual Agent conversation topic. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Topic name (display name)"
        },
        "description": {
          "type": "string",
          "description": "What this topic handles"
        },
        "category": {
          "type": "string",
          "description": "Topic category sys_id"
        },
        "active": {
          "type": "boolean",
          "description": "Activate immediately (default true)"
        },
        "fulfillment_type": {
          "type": "string",
          "description": "Fulfillment type: \"itsm_integration\", \"custom\", \"web_service\""
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "update_va_topic",
    "description": "Update a Virtual Agent topic properties. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Topic sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (name, description, active, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "get_va_topic",
    "description": "Get Virtual Agent topic details including intent and trigger phrases",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Topic sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_va_topics_full",
    "description": "List all Virtual Agent topics with category and status details",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter to active topics only (default true)"
        },
        "category": {
          "type": "string",
          "description": "Filter by category name"
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default 50)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_va_conversation",
    "description": "Get conversation history for a Virtual Agent session",
    "inputSchema": {
      "type": "object",
      "properties": {
        "conversation_id": {
          "type": "string",
          "description": "Conversation sys_id or session ID"
        },
        "limit": {
          "type": "number",
          "description": "Max messages (default 50)"
        }
      },
      "required": [
        "conversation_id"
      ]
    }
  },
  {
    "name": "list_va_conversations",
    "description": "List recent Virtual Agent conversations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "topic_sys_id": {
          "type": "string",
          "description": "Filter by topic"
        },
        "user_sys_id": {
          "type": "string",
          "description": "Filter by user"
        },
        "limit": {
          "type": "number",
          "description": "Max results (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_va_categories",
    "description": "List Virtual Agent topic categories",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number",
          "description": "Max results (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_assets",
    "description": "List IT assets with optional filtering by state, class, or assigned user",
    "inputSchema": {
      "type": "object",
      "properties": {
        "asset_class": {
          "type": "string",
          "description": "Asset class: \"alm_hardware\", \"alm_license\", \"alm_consumable\""
        },
        "state": {
          "type": "string",
          "description": "Asset state: \"in_use\", \"in_stock\", \"retired\", \"missing\""
        },
        "assigned_to": {
          "type": "string",
          "description": "User sys_id to filter by assignee"
        },
        "location": {
          "type": "string",
          "description": "Location name or sys_id"
        },
        "query": {
          "type": "string",
          "description": "Additional encoded query"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_asset",
    "description": "Get full details of an IT asset including financial and lifecycle data",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Asset sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_asset",
    "description": "Create a new IT asset record. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "display_name": {
          "type": "string",
          "description": "Asset display name"
        },
        "asset_tag": {
          "type": "string",
          "description": "Unique asset tag"
        },
        "model_category": {
          "type": "string",
          "description": "Category sys_id (Hardware, Software, etc.)"
        },
        "model": {
          "type": "string",
          "description": "Model sys_id"
        },
        "serial_number": {
          "type": "string",
          "description": "Serial number"
        },
        "assigned_to": {
          "type": "string",
          "description": "User sys_id"
        },
        "location": {
          "type": "string",
          "description": "Location sys_id"
        },
        "cost": {
          "type": "number",
          "description": "Purchase cost"
        },
        "cost_center": {
          "type": "string",
          "description": "Cost center sys_id"
        },
        "purchase_date": {
          "type": "string",
          "description": "Purchase date (YYYY-MM-DD)"
        }
      },
      "required": [
        "display_name"
      ]
    }
  },
  {
    "name": "update_asset",
    "description": "Update an IT asset record. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Asset sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "retire_asset",
    "description": "Retire an IT asset (mark as disposed/retired). **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Asset sys_id"
        },
        "disposal_reason": {
          "type": "string",
          "description": "Reason for retirement"
        },
        "disposal_date": {
          "type": "string",
          "description": "Disposal date (YYYY-MM-DD)"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_software_licenses",
    "description": "List software license records with compliance status",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_license_compliance",
    "description": "Get license compliance summary — purchased vs. installed vs. in use counts",
    "inputSchema": {
      "type": "object",
      "properties": {
        "license_sys_id": {
          "type": "string",
          "description": "Software license sys_id (optional — omit for all)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_asset_contracts",
    "description": "List asset maintenance and support contracts",
    "inputSchema": {
      "type": "object",
      "properties": {
        "asset_sys_id": {
          "type": "string",
          "description": "Filter by linked asset"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active contracts (default true)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "track_asset_lifecycle",
    "description": "Track asset lifecycle events and stage transitions",
    "inputSchema": {
      "type": "object",
      "properties": {
        "asset_id": {
          "type": "string",
          "description": "Asset tag or sys_id"
        },
        "new_stage": {
          "type": "string",
          "description": "Lifecycle stage: in_stock/in_use/in_maintenance/retired/disposed"
        },
        "notes": {
          "type": "string",
          "description": "Transition notes"
        }
      },
      "required": [
        "asset_id",
        "new_stage"
      ]
    }
  },
  {
    "name": "get_license_optimization",
    "description": "Analyze software license usage and recommend optimizations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "software_name": {
          "type": "string",
          "description": "Optional filter by software name"
        },
        "threshold_pct": {
          "type": "number",
          "description": "Usage threshold percentage (default: 80)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_devops_pipelines",
    "description": "List DevOps pipeline configurations registered in ServiceNow",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter to active pipelines (default true)"
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_devops_pipeline",
    "description": "Get details of a specific DevOps pipeline",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Pipeline sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_deployments",
    "description": "List recent application deployments tracked in ServiceNow",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pipeline_sys_id": {
          "type": "string",
          "description": "Filter by pipeline"
        },
        "environment": {
          "type": "string",
          "description": "Filter by environment (e.g. \"prod\", \"staging\")"
        },
        "state": {
          "type": "string",
          "description": "Filter by state: \"success\", \"failed\", \"in_progress\""
        },
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_deployment",
    "description": "Get details and status of a specific deployment",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Deployment sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_devops_change",
    "description": "Create a change request linked to a DevOps deployment for change governance. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "short_description": {
          "type": "string",
          "description": "Change short description"
        },
        "pipeline": {
          "type": "string",
          "description": "Pipeline name or sys_id"
        },
        "environment": {
          "type": "string",
          "description": "Target environment (prod, staging, dev)"
        },
        "artifact": {
          "type": "string",
          "description": "Artifact name or version being deployed"
        },
        "type": {
          "type": "string",
          "description": "Change type: normal, standard, emergency"
        },
        "assigned_to": {
          "type": "string",
          "description": "User sys_id"
        },
        "assignment_group": {
          "type": "string",
          "description": "Group sys_id"
        }
      },
      "required": [
        "short_description",
        "environment"
      ]
    }
  },
  {
    "name": "track_deployment",
    "description": "Record a deployment event in ServiceNow for audit and velocity tracking. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pipeline": {
          "type": "string",
          "description": "Pipeline sys_id or name"
        },
        "environment": {
          "type": "string",
          "description": "Target environment"
        },
        "artifact_name": {
          "type": "string",
          "description": "Artifact or application name"
        },
        "artifact_version": {
          "type": "string",
          "description": "Version or build number"
        },
        "status": {
          "type": "string",
          "description": "Deployment status: success, failed, rolled_back"
        },
        "notes": {
          "type": "string",
          "description": "Deployment notes"
        }
      },
      "required": [
        "environment",
        "artifact_name",
        "status"
      ]
    }
  },
  {
    "name": "get_devops_insights",
    "description": "Get deployment frequency, failure rate, and lead time metrics for a pipeline",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pipeline_sys_id": {
          "type": "string",
          "description": "Pipeline sys_id (optional — all pipelines if omitted)"
        },
        "days": {
          "type": "number",
          "description": "Number of days to analyse (default 30)"
        }
      },
      "required": []
    }
  },
  {
    "name": "list_scoped_apps",
    "description": "List scoped applications (custom apps) installed in the instance",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search apps by name or scope prefix"
        },
        "active": {
          "type": "boolean",
          "description": "Filter to active apps only"
        },
        "limit": {
          "type": "number",
          "description": "Max records to return (default 25)"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_scoped_app",
    "description": "Get full details of a scoped application by sys_id or scope name",
    "inputSchema": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "App sys_id or scope name (e.g. \"x_myco_myapp\")"
        }
      },
      "required": [
        "id"
      ]
    }
  },
  {
    "name": "create_scoped_app",
    "description": "Create a new scoped application in App Studio (requires WRITE_ENABLED=true). The scope prefix must be unique and follow the pattern x_<vendor>_<appname>.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Human-readable application name"
        },
        "scope": {
          "type": "string",
          "description": "Unique scope prefix, e.g. \"x_myco_myapp\". Must start with \"x_\"."
        },
        "version": {
          "type": "string",
          "description": "Application version string (e.g. \"1.0.0\"). Defaults to \"1.0.0\"."
        },
        "short_description": {
          "type": "string",
          "description": "Short description shown in the app list"
        },
        "description": {
          "type": "string",
          "description": "Full description of the application"
        },
        "vendor": {
          "type": "string",
          "description": "Vendor or author name"
        },
        "active": {
          "type": "boolean",
          "description": "Activate the app immediately (default: true)"
        },
        "logo": {
          "type": "string",
          "description": "App logo attachment sys_id (optional)"
        }
      },
      "required": [
        "name",
        "scope"
      ]
    }
  },
  {
    "name": "update_scoped_app",
    "description": "Update an existing scoped application (requires WRITE_ENABLED=true)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "App sys_id"
        },
        "fields": {
          "type": "object",
          "description": "Fields to update (name, version, short_description, description, active, vendor, etc.)"
        }
      },
      "required": [
        "sys_id",
        "fields"
      ]
    }
  },
  {
    "name": "ml_predict_change_risk",
    "description": "Predict the risk level of a change request using historical ML analysis",
    "inputSchema": {
      "type": "object",
      "properties": {
        "change_sys_id": {
          "type": "string",
          "description": "Change request sys_id to evaluate"
        },
        "type": {
          "type": "string",
          "description": "Change type: normal, standard, emergency"
        },
        "category": {
          "type": "string",
          "description": "Change category"
        }
      },
      "required": []
    }
  },
  {
    "name": "ml_detect_anomalies",
    "description": "Run anomaly detection on operational metrics (alert volume, incident trends, etc.)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table to analyze (e.g. incident, sn_agent_alert)"
        },
        "field": {
          "type": "string",
          "description": "Numeric field to analyse (e.g. priority, reassignment_count)"
        },
        "days": {
          "type": "number",
          "description": "Look-back period in days (default 30)"
        },
        "threshold": {
          "type": "number",
          "description": "Standard deviations for anomaly threshold (default 2)"
        }
      },
      "required": [
        "table",
        "field"
      ]
    }
  },
  {
    "name": "ml_forecast_incidents",
    "description": "Forecast incident volume for the next N days based on historical trends",
    "inputSchema": {
      "type": "object",
      "properties": {
        "days_ahead": {
          "type": "number",
          "description": "Number of days to forecast (default 7)"
        },
        "category": {
          "type": "string",
          "description": "Filter by category (optional)"
        },
        "priority": {
          "type": "string",
          "description": "Filter by priority (optional)"
        }
      },
      "required": []
    }
  },
  {
    "name": "ml_train_incident_classifier",
    "description": "Trigger training of the incident classification ML solution. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "solution_name": {
          "type": "string",
          "description": "ML solution name (default auto-detect)"
        }
      },
      "required": []
    }
  },
  {
    "name": "ml_train_change_risk",
    "description": "Trigger training of the change risk prediction ML model. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "solution_name": {
          "type": "string",
          "description": "ML solution name (default auto-detect)"
        }
      },
      "required": []
    }
  },
  {
    "name": "ml_train_anomaly_detector",
    "description": "Trigger training of an anomaly detection model for a specific table/field. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Target table for anomaly detection"
        },
        "field": {
          "type": "string",
          "description": "Numeric field to train on"
        }
      },
      "required": [
        "table",
        "field"
      ]
    }
  },
  {
    "name": "ml_evaluate_model",
    "description": "Get accuracy, training status, and metrics for a trained ML solution",
    "inputSchema": {
      "type": "object",
      "properties": {
        "model_sys_id": {
          "type": "string",
          "description": "ML solution sys_id"
        }
      },
      "required": [
        "model_sys_id"
      ]
    }
  },
  {
    "name": "ml_model_training_history",
    "description": "Get training run history and accuracy trends for an ML solution over time",
    "inputSchema": {
      "type": "object",
      "properties": {
        "model_sys_id": {
          "type": "string",
          "description": "ML solution sys_id"
        },
        "days": {
          "type": "number",
          "description": "Look-back period (default 90)"
        }
      },
      "required": [
        "model_sys_id"
      ]
    }
  },
  {
    "name": "ml_virtual_agent_nlu",
    "description": "Analyse Virtual Agent NLU performance — conversation completion rates and fallback metrics",
    "inputSchema": {
      "type": "object",
      "properties": {
        "topic_sys_id": {
          "type": "string",
          "description": "VA topic sys_id (optional, all topics if omitted)"
        },
        "days": {
          "type": "number",
          "description": "Analysis period in days (default 30)"
        }
      },
      "required": []
    }
  },
  {
    "name": "ml_process_optimization",
    "description": "Identify process bottlenecks using analysis of task durations and reassignment patterns",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Process table to analyse (e.g. incident, change_request, sc_task)"
        },
        "days": {
          "type": "number",
          "description": "Analysis period (default 90)"
        }
      },
      "required": [
        "table"
      ]
    }
  },
  {
    "name": "list_uib_pages",
    "description": "List UI Builder pages and their route configurations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number",
          "description": "Max records (default 25)"
        },
        "app": {
          "type": "string",
          "description": "Filter by UX app sys_id"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_uib_page",
    "description": "Get details of a specific UI Builder page including layout and child elements",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "UIB page sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_uib_page",
    "description": "Create a new UI Builder page with route registration. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "Page title"
        },
        "path": {
          "type": "string",
          "description": "URL path segment"
        },
        "app": {
          "type": "string",
          "description": "Parent UX app sys_id"
        },
        "layout": {
          "type": "string",
          "description": "Layout type: single, sidebar, tabbed (default single)"
        }
      },
      "required": [
        "title",
        "path"
      ]
    }
  },
  {
    "name": "update_uib_page",
    "description": "Update an existing UI Builder page. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "UIB page sys_id"
        },
        "title": {
          "type": "string"
        },
        "path": {
          "type": "string"
        },
        "layout": {
          "type": "string"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "delete_uib_page",
    "description": "Delete a UI Builder page. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "UIB page sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_uib_components",
    "description": "List available UI Builder components (macroponents) in the instance",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number",
          "description": "Max records (default 50)"
        },
        "scope": {
          "type": "string",
          "description": "Filter by scope/app"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_uib_component",
    "description": "Create a custom UI Builder component (macroponent). **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Component name"
        },
        "label": {
          "type": "string",
          "description": "Display label"
        },
        "description": {
          "type": "string"
        },
        "category": {
          "type": "string",
          "description": "Component category"
        }
      },
      "required": [
        "name",
        "label"
      ]
    }
  },
  {
    "name": "update_uib_component",
    "description": "Update a UI Builder component. **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Component sys_id"
        },
        "label": {
          "type": "string"
        },
        "description": {
          "type": "string"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "list_uib_data_brokers",
    "description": "List UI Builder data brokers (data sources for pages)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "page_sys_id": {
          "type": "string",
          "description": "Filter by page"
        },
        "limit": {
          "type": "number"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_uib_data_broker",
    "description": "Create a UI Builder data broker to feed data to a page. **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Broker name"
        },
        "table": {
          "type": "string",
          "description": "Source table"
        },
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "page": {
          "type": "string",
          "description": "Target page sys_id"
        }
      },
      "required": [
        "name",
        "table"
      ]
    }
  },
  {
    "name": "list_workspaces",
    "description": "List all configurable agent workspaces",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter active (default true)"
        },
        "limit": {
          "type": "number"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_workspace",
    "description": "Get details of a configurable agent workspace including tabs and lists",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Workspace sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_workspace",
    "description": "Create a new configurable agent workspace. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Workspace name"
        },
        "description": {
          "type": "string"
        },
        "table": {
          "type": "string",
          "description": "Primary table (e.g. incident)"
        },
        "icon": {
          "type": "string",
          "description": "Workspace icon name"
        }
      },
      "required": [
        "name",
        "table"
      ]
    }
  },
  {
    "name": "configure_workspace_list",
    "description": "Add or update a list view in an agent workspace. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "workspace_sys_id": {
          "type": "string",
          "description": "Workspace sys_id"
        },
        "table": {
          "type": "string",
          "description": "List table"
        },
        "title": {
          "type": "string",
          "description": "List title"
        },
        "query": {
          "type": "string",
          "description": "Encoded query filter"
        },
        "columns": {
          "type": "string",
          "description": "Comma-separated field names"
        }
      },
      "required": [
        "workspace_sys_id",
        "table",
        "title"
      ]
    }
  },
  {
    "name": "create_ux_app_route",
    "description": "Register a new route (URL path) in a UX app. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "app_sys_id": {
          "type": "string",
          "description": "UX app sys_id"
        },
        "path": {
          "type": "string",
          "description": "Route path"
        },
        "page_sys_id": {
          "type": "string",
          "description": "Target UIB page sys_id"
        },
        "title": {
          "type": "string",
          "description": "Route title"
        }
      },
      "required": [
        "app_sys_id",
        "path",
        "page_sys_id"
      ]
    }
  },
  {
    "name": "create_ux_experience",
    "description": "Create a new UX Experience (app shell) configuration. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Experience name"
        },
        "app_sys_id": {
          "type": "string",
          "description": "UX app sys_id"
        },
        "landing_page": {
          "type": "string",
          "description": "Landing page sys_id"
        }
      },
      "required": [
        "name",
        "app_sys_id"
      ]
    }
  },
  {
    "name": "list_mobile_app_configs",
    "description": "List ServiceNow mobile app configurations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "active": {
          "type": "boolean",
          "description": "Filter active (default true)"
        },
        "limit": {
          "type": "number"
        }
      },
      "required": []
    }
  },
  {
    "name": "get_mobile_app_config",
    "description": "Get details of a specific mobile app configuration",
    "inputSchema": {
      "type": "object",
      "properties": {
        "sys_id": {
          "type": "string",
          "description": "Mobile app config sys_id"
        }
      },
      "required": [
        "sys_id"
      ]
    }
  },
  {
    "name": "create_mobile_app_config",
    "description": "Create a new mobile app configuration. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "App name"
        },
        "description": {
          "type": "string"
        },
        "branding_color": {
          "type": "string",
          "description": "Primary colour hex"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "list_mobile_applets",
    "description": "List mobile applets (mini-apps within the mobile experience)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "app_config": {
          "type": "string",
          "description": "Filter by app config sys_id"
        },
        "limit": {
          "type": "number"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_mobile_applet",
    "description": "Create a mobile applet in a mobile app. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Applet name"
        },
        "table": {
          "type": "string",
          "description": "Applet data table"
        },
        "icon": {
          "type": "string",
          "description": "Applet icon"
        },
        "app_config": {
          "type": "string",
          "description": "Parent app config sys_id"
        }
      },
      "required": [
        "name",
        "table"
      ]
    }
  },
  {
    "name": "list_mobile_layouts",
    "description": "List mobile layout configurations",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "number"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_mobile_layout",
    "description": "Create a mobile layout for a specific view. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Layout name"
        },
        "table": {
          "type": "string",
          "description": "Target table"
        },
        "type": {
          "type": "string",
          "description": "Layout type: list, form, detail"
        }
      },
      "required": [
        "name",
        "table"
      ]
    }
  },
  {
    "name": "configure_offline_sync",
    "description": "Configure which tables/records are available offline in mobile. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table to sync offline"
        },
        "query": {
          "type": "string",
          "description": "Filter query for sync scope"
        },
        "max_records": {
          "type": "number",
          "description": "Max offline records (default 500)"
        }
      },
      "required": [
        "table"
      ]
    }
  },
  {
    "name": "send_push_notification",
    "description": "Send a push notification to mobile app users. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "user": {
          "type": "string",
          "description": "Target user sys_id"
        },
        "group": {
          "type": "string",
          "description": "Target group sys_id (alternative to user)"
        },
        "title": {
          "type": "string",
          "description": "Notification title"
        },
        "body": {
          "type": "string",
          "description": "Notification body text"
        },
        "action_url": {
          "type": "string",
          "description": "Deep link URL on tap"
        }
      },
      "required": [
        "title",
        "body"
      ]
    }
  },
  {
    "name": "get_mobile_analytics",
    "description": "Get mobile app usage analytics — sessions, active users, popular applets",
    "inputSchema": {
      "type": "object",
      "properties": {
        "days": {
          "type": "number",
          "description": "Analysis period in days (default 30)"
        }
      },
      "required": []
    }
  },
  {
    "name": "find_artifact",
    "description": "Search for platform artifacts by name, type, or scope (business rules, scripts, widgets, etc.)",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Artifact name or pattern"
        },
        "type": {
          "type": "string",
          "description": "Artifact type: business_rule, script_include, client_script, ui_policy, ui_action, widget, flow, sys_properties"
        },
        "scope": {
          "type": "string",
          "description": "Application scope name"
        },
        "limit": {
          "type": "number"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "name": "validate_artifact",
    "description": "Validate an artifact for best practices, security issues, and performance concerns",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Artifact table (e.g. sys_script, sys_script_include)"
        },
        "sys_id": {
          "type": "string",
          "description": "Artifact sys_id"
        }
      },
      "required": [
        "table",
        "sys_id"
      ]
    }
  },
  {
    "name": "clone_artifact",
    "description": "Clone a platform artifact to a new name/scope. **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Source artifact table"
        },
        "sys_id": {
          "type": "string",
          "description": "Source artifact sys_id"
        },
        "new_name": {
          "type": "string",
          "description": "Name for the cloned artifact"
        },
        "target_scope": {
          "type": "string",
          "description": "Target application scope (optional)"
        }
      },
      "required": [
        "table",
        "sys_id",
        "new_name"
      ]
    }
  },
  {
    "name": "validate_deployment",
    "description": "Pre-validate an update set or app before deployment — check for conflicts and missing dependencies",
    "inputSchema": {
      "type": "object",
      "properties": {
        "update_set_sys_id": {
          "type": "string",
          "description": "Update set sys_id to validate"
        },
        "app_sys_id": {
          "type": "string",
          "description": "Scoped app sys_id (alternative to update set)"
        }
      },
      "required": []
    }
  },
  {
    "name": "rollback_deployment",
    "description": "Rollback a deployment by reverting an update set. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "update_set_sys_id": {
          "type": "string",
          "description": "Committed update set sys_id to rollback"
        },
        "reason": {
          "type": "string",
          "description": "Reason for rollback"
        }
      },
      "required": [
        "update_set_sys_id"
      ]
    }
  },
  {
    "name": "list_deployment_history",
    "description": "List deployment history — committed update sets and app installs over time",
    "inputSchema": {
      "type": "object",
      "properties": {
        "days": {
          "type": "number",
          "description": "Look-back period (default 30)"
        },
        "limit": {
          "type": "number"
        }
      },
      "required": []
    }
  },
  {
    "name": "create_solution_package",
    "description": "Create a solution package from selected update sets for distribution. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "Package name"
        },
        "description": {
          "type": "string"
        },
        "update_sets": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Array of update set sys_ids to include"
        }
      },
      "required": [
        "name",
        "update_sets"
      ]
    }
  },
  {
    "name": "execute_background_script",
    "description": "Execute a background script on the instance (server-side JavaScript). **[Scripting]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "script": {
          "type": "string",
          "description": "JavaScript code to execute"
        },
        "scope": {
          "type": "string",
          "description": "Application scope (default global)"
        }
      },
      "required": [
        "script"
      ]
    }
  },
  {
    "name": "import_cmdb_data",
    "description": "Import CI data into CMDB via import set. **[Write]**",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Target CMDB table (e.g. cmdb_ci_server)"
        },
        "data": {
          "type": "array",
          "items": {
            "type": "object"
          },
          "description": "Array of records to import"
        }
      },
      "required": [
        "table",
        "data"
      ]
    }
  },
  {
    "name": "analyze_data_quality",
    "description": "Analyse data quality for a table — completeness, duplicates, stale records",
    "inputSchema": {
      "type": "object",
      "properties": {
        "table": {
          "type": "string",
          "description": "Table to analyse"
        },
        "required_fields": {
          "type": "string",
          "description": "Comma-separated fields that should be populated"
        },
        "days_stale": {
          "type": "number",
          "description": "Consider records stale after N days without update (default 180)"
        }
      },
      "required": [
        "table"
      ]
    }
  }
];
