# servicenow-mcp — Usage Examples

This document provides real-world examples of using the servicenow-mcp server (400+ tools across all ServiceNow modules).

## Table of Contents

- [Quick Reference — Full Tool Catalog](#quick-reference)
- [Setup](#setup)

### Platform & Operations
- [Core Platform Examples](#core-platform-examples)
- [CMDB Examples](#cmdb-examples)
- [ITOM Examples](#itom-examples)
- [System Properties Examples](#system-properties-examples)
- [Update Set Examples](#update-set-examples)

### ITSM & Service Management
- [ITSM Examples](#itsm-examples)
- [Change Management Examples](#change-management-examples)

### Development & Automation
- [Scripting Enhancement Examples](#scripting-enhancement-examples)
- [Flow Designer Examples](#flow-designer-examples)
- [DevOps & Pipeline Examples](#devops--pipeline-examples)

### Portals & Integration
- [Service Portal & Widget Examples](#service-portal--widget-examples)
- [Integration Examples](#integration-examples)

### Notifications, Analytics & AI
- [Notification & Attachment Examples](#notification--attachment-examples)
- [Performance Analytics Examples](#performance-analytics-examples)
- [Natural Language Examples](#natural-language-examples)

### HR, CSM & Asset Management
- [HRSD Examples](#hrsd-examples)
- [CSM Examples](#csm-examples)
- [IT Asset Management Examples](#it-asset-management-examples)
- [Virtual Agent Examples](#virtual-agent-examples)

### App Studio & New Capabilities
- [Scoped Application Examples](#scoped-application-examples)
- [Report & Dashboard Creation Examples](#report--dashboard-creation-examples)
- [Catalog Item & Approval Rule Examples](#catalog-item--approval-rule-examples)

### Advanced
- [Advanced Workflows](#advanced-workflows)

### New in v2.4
- [Slash Command Examples](#slash-command-examples)
- [@ Mention Examples](#-mention-examples)
- [HTTP API Examples (Lovable / Bolt / v0)](#http-api-examples)
- [CLI Wizard Examples](#cli-wizard-examples)

---

## Slash Command Examples

Slash commands appear in Claude Desktop, Cursor, and any MCP-aware client when you type `/`.

### `/morning-standup`
```
/morning-standup
→ Summarises P1/P2 open incidents, changes due today, any SLA breaches
```

### `/my-tickets`
```
/my-tickets
→ Lists all open tasks, incidents, and requests assigned to you
```

### `/p1-alerts`
```
/p1-alerts
→ Active P1 incidents with how long they've been open and who is assigned
```

### `/create-incident`
```
/create-incident
→ Guided form: short description, category, priority, assignment group
→ Creates the incident and returns the INC number
```

### `/sla-breaches`
```
/sla-breaches
→ All records currently breaching or at risk of breaching SLA
```

### `/ci-health`
```
/ci-health
→ Checks CMDB CI completeness, open incidents on CIs, and relationship gaps
```

### `/run-atf`
```
/run-atf
→ Triggers the default ATF suite, waits for results, shows any failures with ATF Failure Insight details
```

### `/switch-instance`
```
/switch-instance
→ Shows list of configured instances; select one to switch active instance
```

### `/knowledge-search query="VPN setup"`
```
/knowledge-search query="VPN setup"
→ Returns top matching KB articles for the query
```

### Custom slash command (`servicenow-mcp.commands.json`)
```json
[
  {
    "name": "network-p1-runbook",
    "description": "P1 runbook for Network Ops",
    "template": "List all P1 incidents in category 'Network'. For each: number, description, assigned_to, time open. Flag SLA breaches."
  }
]
```
```
/network-p1-runbook
→ Runs the custom template against your instance
```

---

## @ Mention Examples

Type `@` in Claude Desktop or Cursor to pull live data into your AI context.

### `@my-incidents`
```
@my-incidents
→ Attaches all open incidents assigned to you as context
→ Then ask: "Which of these is closest to SLA breach?"
```

### `@open-changes`
```
@open-changes
→ Attaches pending change requests awaiting approval
→ Then ask: "Summarise the risk level across these changes"
```

### `@sla-breaches`
```
@sla-breaches
→ Attaches all records currently breaching SLA
→ Then ask: "Draft a status email to the team about these breaches"
```

### `@ci:<name>`
```
@ci:web-prod-01
→ Attaches CMDB record for CI named "web-prod-01"
→ Then ask: "What incidents are open on this CI? What depends on it?"
```

### `@kb:<title>`
```
@kb:VPN-setup
→ Attaches knowledge article matching "VPN-setup"
→ Then ask: "Summarise the resolution steps from this article"
```

### `@instance:info`
```
@instance:info
→ Attaches metadata for the current active instance (name, URL, version)
```

---

## HTTP API Examples

Start the server: `npm run serve` (or `node dist/http-server.js`)

Open `http://localhost:3100` for the visual dashboard.

### List all available tools
```bash
curl http://localhost:3100/api/tools | jq '.tools[].name'
```

### Call a tool
```bash
curl -X POST http://localhost:3100/api/tool \
  -H "Content-Type: application/json" \
  -d '{ "tool": "list_incidents", "params": { "limit": 5, "query": "priority=1^active=true" } }'
```

### With API key authentication
```bash
curl -X POST http://localhost:3100/api/tool \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-secret-key" \
  -d '{ "tool": "get_incident", "params": { "number_or_sysid": "INC0010001" } }'
```

### From a Lovable / Bolt / v0 app (TypeScript)
```typescript
// lib/servicenow.ts
const BASE = import.meta.env.VITE_NOWAIKIT_URL || 'http://localhost:3100';
const KEY  = import.meta.env.VITE_NOWAIKIT_KEY  || '';

export async function callSN<T>(tool: string, params = {}): Promise<T> {
  const res = await fetch(`${BASE}/api/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
    },
    body: JSON.stringify({ tool, params }),
  });
  const { result, error } = await res.json() as { result?: T; error?: string };
  if (error) throw new Error(error);
  return result as T;
}

// Usage in a React component:
const incidents = await callSN('list_incidents', { limit: 10 });
const change    = await callSN('get_change_request', { number_or_sysid: 'CHG0001234' });
const schema    = await callSN('get_table_schema',   { table: 'incident' });
```

### Route to a named instance (multi-instance)
```bash
curl -X POST http://localhost:3100/api/tool \
  -H "Content-Type: application/json" \
  -d '{ "tool": "list_incidents", "params": { "limit": 5 }, "instance": "prod" }'
```

### Health check (no auth required)
```bash
curl http://localhost:3100/api/health
# → { "status": "ok", "instance": "prod", "toolCount": 400, "ssoEnabled": false, ... }
```

---

## CLI Wizard Examples

### First-time setup
```bash
npx servicenow-mcp setup
# Wizard: URL → auth → test connection → tool package → AI client selection → done
```

### Add a second instance
```bash
servicenow-mcp setup --add
# Prompts for the new instance name, URL, credentials
```

### Per-user login (enterprise, runs queries in user's own ACL context)
```bash
servicenow-mcp auth login
# Opens browser → ServiceNow OAuth consent → token stored
servicenow-mcp auth whoami
# → Logged in as john.doe@acme.com (roles: itil, admin)
```

### List and switch instances
```bash
servicenow-mcp instances list
# → default (https://dev12345.service-now.com) [active]
# → prod    (https://acme.service-now.com)

servicenow-mcp instances remove dev
```

---

## Quick Reference

### Tool Catalog

| Tool Name | Module | Purpose | Write? | Key Parameters |
|-----------|--------|---------|--------|----------------|
| **Core & CMDB** | | | | |
| query_records | Core | Query any table with filters | No | table, query, fields, limit |
| get_record | Core | Get a single record by sys_id | No | table, sys_id |
| get_table_schema | Core | Inspect table field structure | No | table |
| get_user | Core | Look up user by email/username | No | user_identifier |
| get_group | Core | Find assignment group | No | group_identifier |
| search_cmdb_ci | Core | Search CMDB CIs | No | query, limit |
| get_cmdb_ci | Core | Get CI details | No | ci_sys_id |
| list_relationships | Core | Show CI dependencies | No | ci_sys_id |
| list_discovery_schedules | Core | Check discovery schedules | No | active_only |
| list_mid_servers | Core | List MID servers | No | active_only |
| list_active_events | Core | Monitor infrastructure events | No | query, limit |
| cmdb_health_dashboard | Core | CMDB data quality metrics | No | — |
| service_mapping_summary | Core | Service dependency map | No | service_sys_id |
| natural_language_search | Core | Plain-English record search | No | query, limit |
| get_my_approvals | Core | Get pending approvals | No | — |
| approve_request | Core | Approve a request | **Yes** | sys_id |
| reject_request | Core | Reject a request | **Yes** | sys_id, reason |
| **Incidents** | | | | |
| create_incident | Incident | Create a new incident | **Yes** | short_description, priority |
| get_incident | Incident | Get incident by number/sys_id | No | number_or_sysid |
| update_incident | Incident | Update incident fields | **Yes** | sys_id, fields |
| resolve_incident | Incident | Resolve an incident | **Yes** | sys_id, resolution_notes |
| close_incident | Incident | Close an incident | **Yes** | sys_id |
| add_work_note | Incident | Add internal work note | **Yes** | sys_id, note |
| add_comment | Incident | Add customer-visible comment | **Yes** | sys_id, comment |
| get_sla_details | Incident | Get SLA details for a task | No | task_sys_id |
| list_active_slas | Incident | List breached/active SLAs | No | query, limit |
| **Problems** | | | | |
| create_problem | Problem | Create a problem record | **Yes** | short_description |
| get_problem | Problem | Get problem by number/sys_id | No | number_or_sysid |
| update_problem | Problem | Update problem fields | **Yes** | sys_id, fields |
| resolve_problem | Problem | Resolve a problem | **Yes** | sys_id |
| **Change Management** | | | | |
| create_change_request | Change | Create a change request | **Yes** | short_description, type |
| get_change_request | Change | Get change by number/sys_id | No | number_or_sysid |
| update_change_request | Change | Update change fields | **Yes** | sys_id, fields |
| list_change_requests | Change | List change requests | No | query, state, limit |
| submit_change_for_approval | Change | Submit change to CAB | **Yes** | sys_id |
| close_change_request | Change | Close a change | **Yes** | sys_id, close_code |
| **Tasks** | | | | |
| get_task | Task | Get a generic task | No | sys_id |
| list_my_tasks | Task | List tasks assigned to me | No | limit |
| complete_task | Task | Mark task as complete | **Yes** | sys_id |
| **Knowledge** | | | | |
| list_knowledge_bases | Knowledge | List KB bases | No | limit |
| search_knowledge | Knowledge | Search articles | No | query, limit |
| get_knowledge_article | Knowledge | Get full article | No | sys_id_or_number |
| create_knowledge_article | Knowledge | Create KB article | **Yes** | title, text, kb_knowledge_base |
| update_knowledge_article | Knowledge | Update KB article | **Yes** | sys_id, fields |
| publish_knowledge_article | Knowledge | Publish draft article | **Yes** | sys_id |
| **Service Catalog** | | | | |
| list_catalog_items | Catalog | List catalog items | No | query, limit |
| search_catalog | Catalog | Search catalog | No | query |
| get_catalog_item | Catalog | Get item details | No | sys_id_or_name |
| create_catalog_item | Catalog | Create a new catalog item | **Yes** | name, short_description |
| update_catalog_item | Catalog | Update a catalog item | **Yes** | sys_id, fields |
| order_catalog_item | Catalog | Place a catalog order | **Yes** | catalog_item_sys_id, variables |
| create_approval_rule | Catalog | Create an approval rule | **Yes** | name, table, approver_type, approver |
| **Users & Groups** | | | | |
| list_users | User | List users | No | query, limit |
| create_user | User | Create a user | **Yes** | user_name, email, first_name, last_name |
| update_user | User | Update user fields | **Yes** | sys_id, fields |
| list_groups | User | List groups | No | query, limit |
| create_group | User | Create a group | **Yes** | name |
| update_group | User | Update group fields | **Yes** | sys_id, fields |
| add_user_to_group | User | Add user to group | **Yes** | user_sys_id, group_sys_id |
| remove_user_from_group | User | Remove user from group | **Yes** | user_sys_id, group_sys_id |
| **Reporting & Scheduled Jobs** | | | | |
| list_reports | Reporting | List saved reports | No | search, category |
| get_report | Reporting | Get report details | No | sys_id_or_name |
| create_report | Reporting | Create a new saved report | **Yes** | title, table, type |
| update_report | Reporting | Update a saved report | **Yes** | sys_id, fields |
| run_aggregate_query | Reporting | Run COUNT/SUM/AVG aggregation | No | table, group_by |
| trend_query | Reporting | Time-bucketed trend data | No | table, date_field, group_by |
| export_report_data | Reporting | Export table data as JSON | No | table, query, fields |
| get_sys_log | Reporting | Get system log entries | No | query, limit |
| list_scheduled_jobs | Reporting | List scheduled jobs | No | active, limit |
| get_scheduled_job | Reporting | Get a scheduled job | No | sys_id_or_name |
| create_scheduled_job | Reporting | Create a scheduled job | **Yes** | name, script, run_type |
| update_scheduled_job | Reporting | Update a scheduled job | **Yes** | sys_id, fields |
| trigger_scheduled_job | Reporting | Run a job immediately | **Yes** | sys_id |
| list_job_run_history | Reporting | Job run history/logs | No | job_sys_id, status |
| **ATF Testing** | | | | |
| list_atf_suites | ATF | List test suites | No | query, limit |
| get_atf_suite | ATF | Get suite details | No | sys_id_or_name |
| run_atf_suite | ATF | Run a test suite | ATF | suite_sys_id |
| list_atf_tests | ATF | List ATF tests | No | query, limit |
| get_atf_test | ATF | Get test details | No | sys_id_or_name |
| run_atf_test | ATF | Run a single test | ATF | test_sys_id |
| get_atf_suite_result | ATF | Get suite run results | No | result_sys_id |
| list_atf_test_results | ATF | List test results | No | suite_result_sys_id |
| get_atf_failure_insight | ATF | ATF Failure Insight details | No | test_result_sys_id |
| **Now Assist / AI** | | | | |
| nlq_query | NowAssist | Natural language query | AI | query |
| ai_search | NowAssist | AI semantic search | AI | query, limit |
| generate_summary | NowAssist | Generate record summary | AI | table, sys_id |
| suggest_resolution | NowAssist | AI resolution suggestion | AI | incident_sys_id |
| categorize_incident | NowAssist | AI categorization | AI | description |
| get_virtual_agent_topics | NowAssist | List VA topics | No | — |
| trigger_agentic_playbook | NowAssist | Run agentic playbook | AI | playbook_name |
| generate_work_notes | NowAssist | AI-generated work notes | AI | task_sys_id |
| get_pi_models | NowAssist | List PI AI models | AI | — |
| **Scripting (SCRIPTING_ENABLED=true)** | | | | |
| list_business_rules | Script | List business rules | No | table, active |
| get_business_rule | Script | Get rule script | No | sys_id |
| create_business_rule | Script | Create business rule | Script | name, table, when, script |
| update_business_rule | Script | Update business rule | Script | sys_id, fields |
| list_script_includes | Script | List script includes | No | query, active |
| get_script_include | Script | Get script include | No | sys_id_or_name |
| create_script_include | Script | Create script include | Script | name, script |
| update_script_include | Script | Update script include | Script | sys_id, fields |
| list_client_scripts | Script | List client scripts | No | table, type, active |
| get_client_script | Script | Get client script | No | sys_id |
| create_client_script | Script | Create client script | Script | name, table, type, script |
| update_client_script | Script | Update client script | Script | sys_id, fields |
| list_ui_policies | Script | List UI policies | No | table, active |
| get_ui_policy | Script | Get UI policy details | No | sys_id |
| create_ui_policy | Script | Create UI policy | Script | short_description, table |
| list_ui_actions | Script | List UI actions (buttons) | No | table, type, active |
| get_ui_action | Script | Get UI action script | No | sys_id |
| create_ui_action | Script | Create UI action button | Script | name, table, action_name |
| update_ui_action | Script | Update UI action | Script | sys_id, fields |
| list_acls | Script | List ACL rules | No | table, operation |
| get_acl | Script | Get ACL details | No | sys_id |
| create_acl | Script | Create ACL rule | Script | name, operation |
| update_acl | Script | Update ACL rule | Script | sys_id, fields |
| list_changesets | Script | List update sets | No | state, limit |
| get_changeset | Script | Get update set details | No | sys_id_or_name |
| commit_changeset | Script | Commit update set | Script | sys_id |
| publish_changeset | Script | Export update set to XML | Script | sys_id |
| **Agile / Scrum** | | | | |
| create_story | Agile | Create a user story | **Yes** | name, description |
| update_story | Agile | Update a story | **Yes** | sys_id, fields |
| list_stories | Agile | List stories | No | sprint_sys_id |
| create_epic | Agile | Create an epic | **Yes** | name |
| update_epic | Agile | Update an epic | **Yes** | sys_id, fields |
| list_epics | Agile | List epics | No | — |
| create_scrum_task | Agile | Create a scrum task | **Yes** | story_sys_id, name |
| update_scrum_task | Agile | Update a scrum task | **Yes** | sys_id, fields |
| list_scrum_tasks | Agile | List scrum tasks | No | story_sys_id |
| **HRSD** | | | | |
| create_hr_case | HRSD | Create HR case | **Yes** | short_description, hr_service |
| get_hr_case | HRSD | Get HR case | No | number_or_sysid |
| update_hr_case | HRSD | Update HR case | **Yes** | sys_id, fields |
| list_hr_cases | HRSD | List HR cases | No | state, hr_service |
| close_hr_case | HRSD | Close HR case | **Yes** | sys_id, close_notes |
| list_hr_services | HRSD | List available HR services | No | — |
| **CSM** | | | | |
| create_customer_case | CSM | Create customer case | **Yes** | short_description |
| get_customer_case | CSM | Get customer case | No | number_or_sysid |
| update_customer_case | CSM | Update customer case | **Yes** | sys_id, fields |
| list_customer_cases | CSM | List customer cases | No | query, state |
| list_accounts | CSM | List CSM accounts | No | query |
| list_contacts | CSM | List contacts | No | query, account_sys_id |
| **Security Operations & GRC** | | | | |
| create_security_incident | Security | Create SecOps incident | **Yes** | short_description, category |
| get_security_incident | Security | Get SecOps incident | No | number_or_sysid |
| update_security_incident | Security | Update SecOps incident | **Yes** | sys_id, fields |
| list_security_incidents | Security | List SecOps incidents | No | state, severity |
| list_vulnerabilities | Security | List vulnerability entries | No | state, severity |
| get_vulnerability | Security | Get vulnerability details | No | number_or_sysid |
| update_vulnerability | Security | Update vulnerability | **Yes** | sys_id, fields |
| list_grc_risks | Security | List GRC risks | No | state, category |
| get_grc_risk | Security | Get GRC risk details | No | number_or_sysid |
| list_grc_controls | Security | List GRC controls | No | risk_sysid, state |
| get_threat_intelligence | Security | Query threat intel (IOCs) | No | query, type |
| **Flow Designer** | | | | |
| list_flows | Flow | List flows | No | query, active |
| get_flow | Flow | Get flow details | No | name_or_sysid |
| trigger_flow | Flow | Trigger a flow | **Yes** | flow_sys_id, inputs |
| get_flow_execution | Flow | Get execution status | No | execution_sysid |
| list_flow_executions | Flow | List flow executions | No | flow_sys_id, status |
| list_subflows | Flow | List subflows | No | query, active |
| get_subflow | Flow | Get subflow details | No | name_or_sysid |
| list_action_instances | Flow | List flow actions | No | query, category |
| get_process_automation | Flow | Get Process Automation | No | name_or_sysid |
| list_process_automations | Flow | List Process Automations | No | query, active |
| **Service Portal & UI Builder** | | | | |
| list_portals | Portal | List all portals | No | query, limit |
| get_portal | Portal | Get portal config | No | id (url_suffix or sys_id) |
| create_portal | Portal | Create a new Service Portal | **Yes** | title, url_suffix |
| list_portal_pages | Portal | List portal pages | No | portal_sys_id |
| get_portal_page | Portal | Get page details | No | sys_id |
| create_portal_page | Portal | Create a new portal page | **Yes** | title, id, portal_sys_id |
| list_portal_widgets | Portal | List portal widgets | No | query, limit |
| get_portal_widget | Portal | Get widget source code | No | id_or_sysid |
| create_portal_widget | Portal | Create new widget | **Yes** | name, id |
| update_portal_widget | Portal | Update widget source | **Yes** | sys_id, fields |
| list_widget_instances | Portal | List widget placements | No | widget_sys_id |
| list_ux_apps | Portal | List Next Experience apps | No | query |
| get_ux_app | Portal | Get UX app config | No | sys_id_or_name |
| list_ux_pages | Portal | List UX app pages | No | app_sys_id |
| list_portal_themes | Portal | List portal themes | No | limit |
| get_portal_theme | Portal | Get theme CSS variables | No | sys_id |
| **Integration Hub** *(new)* | | | | |
| list_rest_messages | Integration | List REST Message definitions | No | query, limit |
| get_rest_message | Integration | Get REST Message config | No | sys_id_or_name |
| list_rest_message_functions | Integration | List HTTP methods in a REST Msg | No | rest_message_sys_id |
| create_rest_message | Integration | Create REST Message | **Yes** | name, endpoint |
| list_transform_maps | Integration | List Transform Maps | No | query, target_table |
| get_transform_map | Integration | Get Transform Map details | No | sys_id_or_name |
| run_transform_map | Integration | Run Transform Map on Import Set | **Yes** | transform_map_sys_id, import_set_sys_id |
| list_transform_field_maps | Integration | List field mappings | No | transform_map_sys_id |
| list_import_sets | Integration | List Import Sets | No | state, query |
| get_import_set | Integration | Get Import Set details | No | sys_id |
| create_import_set_row | Integration | Insert staging table row | **Yes** | staging_table, data |
| list_data_sources | Integration | List Import Set data sources | No | query, type |
| list_event_registry | Integration | List registered events | No | query, limit |
| get_event_registry_entry | Integration | Get event definition | No | name_or_sysid |
| register_event | Integration | Register custom event | Script | name, table |
| fire_event | Integration | Fire a ServiceNow event | **Yes** | event_name, table, record_sys_id |
| list_event_log | Integration | List fired events log | No | event_name, state |
| list_oauth_applications | Integration | List OAuth app registry | No | query |
| list_credential_aliases | Integration | List credential aliases | No | query, type |
| **Notifications & Attachments** *(new)* | | | | |
| list_notifications | Notification | List email notifications | No | query, table, event |
| get_notification | Notification | Get notification details | No | sys_id_or_name |
| create_notification | Notification | Create email notification | **Yes** | name, table |
| update_notification | Notification | Update notification | **Yes** | sys_id, fields |
| list_email_logs | Notification | List outbound email log | No | state, recipient |
| get_email_log | Notification | Get email log entry | No | sys_id |
| list_attachments | Notification | List attachments on a record | No | table, record_sys_id |
| get_attachment_metadata | Notification | Get attachment metadata | No | attachment_sys_id |
| delete_attachment | Notification | Delete an attachment | **Yes** | attachment_sys_id |
| upload_attachment | Notification | Upload file to a record | **Yes** | table, record_sys_id, file_name, content_type, content_base64 |
| list_email_templates | Notification | List email templates | No | query |
| list_notification_subscriptions | Notification | List user subscriptions | No | user_sys_id |
| **Performance Analytics & Data Quality** *(new)* | | | | |
| list_pa_indicators | Performance | List PA KPI indicators | No | query, category |
| get_pa_indicator | Performance | Get indicator details | No | sys_id_or_name |
| get_pa_scorecard | Performance | Get current KPI scorecard | No | indicator_sys_id |
| get_pa_time_series | Performance | Get historical KPI data | No | indicator_sys_id, start_date |
| list_pa_breakdowns | Performance | List PA breakdowns/dimensions | No | query |
| list_pa_dashboards | Performance | List PA dashboards | No | query |
| get_pa_dashboard | Performance | Get PA dashboard | No | sys_id_or_name |
| create_dashboard | Performance | Create a new PA dashboard | **Yes** | name |
| update_dashboard | Performance | Update a PA dashboard | **Yes** | sys_id, fields |
| list_homepages | Performance | List homepage dashboards | No | query |
| list_pa_jobs | Performance | List PA collection jobs | No | active, query |
| get_pa_job | Performance | Get PA job details | No | sys_id |
| check_table_completeness | Performance | Data quality completeness audit | No | table, fields |
| get_table_record_count | Performance | Count records in a table | No | table, query |
| compare_record_counts | Performance | Compare counts across tables | No | tables |
| **Scoped Applications (App Studio)** | | | | |
| list_scoped_apps | AppStudio | List scoped applications | No | query, active, limit |
| get_scoped_app | AppStudio | Get scoped app details | No | id (sys_id or scope) |
| create_scoped_app | AppStudio | Create a new scoped application | **Yes** | name, scope |
| update_scoped_app | AppStudio | Update a scoped application | **Yes** | sys_id, fields |

---

## Setup

### MCP Client Configuration

Add to your MCP client (e.g., Claude Desktop config):

```json
{
  "mcpServers": {
    "servicenow": {
      "command": "node",
      "args": ["/path/to/servicenow-mcp/dist/server.js"],
      "env": {
        "SERVICENOW_INSTANCE_URL": "https://dev12345.service-now.com",
        "SERVICENOW_AUTH_METHOD": "oauth",
        "SERVICENOW_CLIENT_ID": "your_client_id",
        "SERVICENOW_CLIENT_SECRET": "your_client_secret",
        "SERVICENOW_USERNAME": "admin",
        "SERVICENOW_PASSWORD": "password",
        "WRITE_ENABLED": "false",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

---

## Core Platform Examples

### Example 1: Get Table Schema

**Use Case:** Understanding the structure of the incident table before querying.

**Tool Call:**
```json
{
  "tool": "get_table_schema",
  "arguments": {
    "tableName": "incident"
  }
}
```

**Expected Output:**
```json
{
  "table": {
    "name": "incident",
    "label": "Incident",
    "super_class": "task"
  },
  "columns": [
    {
      "element": "number",
      "column_label": "Number",
      "internal_type": "string",
      "mandatory": true,
      "max_length": 40
    },
    {
      "element": "short_description",
      "column_label": "Short description",
      "internal_type": "string",
      "mandatory": false,
      "max_length": 160
    },
    {
      "element": "priority",
      "column_label": "Priority",
      "internal_type": "integer",
      "mandatory": false
    },
    {
      "element": "assigned_to",
      "column_label": "Assigned to",
      "internal_type": "reference",
      "mandatory": false,
      "reference": "sys_user"
    },
    {
      "element": "state",
      "column_label": "State",
      "internal_type": "integer",
      "mandatory": false
    }
  ]
}
```

**What You Learn:**
- Field names and types
- Required vs optional fields
- Reference fields point to other tables
- Maximum lengths for strings

---

### Example 2: Query High-Priority Incidents

**Use Case:** Find all active P1 incidents assigned to the Database team.

**Tool Call:**
```json
{
  "tool": "query_records",
  "arguments": {
    "table": "incident",
    "query": "active=true^priority=1^assignment_group.name=Database",
    "fields": "number,short_description,assigned_to,state,opened_at,sys_updated_on",
    "limit": 10,
    "orderBy": "-sys_updated_on"
  }
}
```

**Expected Output:**
```json
{
  "count": 3,
  "records": [
    {
      "number": "INC0010001",
      "short_description": "SAP system down in production",
      "assigned_to": {
        "value": "5137153cc611227c000bbd1bd8cd2005",
        "display_value": "Fred Luddy"
      },
      "state": "2",
      "opened_at": "2024-02-10 14:30:22",
      "sys_updated_on": "2024-02-12 09:15:33"
    },
    {
      "number": "INC0010045",
      "short_description": "Database cluster failover issue",
      "assigned_to": {
        "value": "5137153cc611227c000bbd1bd8cd2006",
        "display_value": "David Miller"
      },
      "state": "2",
      "opened_at": "2024-02-11 08:20:15",
      "sys_updated_on": "2024-02-12 08:42:10"
    },
    {
      "number": "INC0010078",
      "short_description": "Oracle connection timeout errors",
      "assigned_to": {
        "value": "5137153cc611227c000bbd1bd8cd2007",
        "display_value": "Sarah Chen"
      },
      "state": "1",
      "opened_at": "2024-02-12 07:05:44",
      "sys_updated_on": "2024-02-12 07:05:44"
    }
  ]
}
```

**Insights:**
- Query uses encoded query syntax: `field=value^field2=value2` (^ means AND)
- Can query related tables with dot-walking: `assignment_group.name`
- State "2" = Work in Progress, "1" = New
- Results ordered by most recently updated

---

### Example 3: Get Specific Record

**Use Case:** Retrieve complete details of a specific incident.

**Tool Call:**
```json
{
  "tool": "get_record",
  "arguments": {
    "table": "incident",
    "sys_id": "9d385017c611228701d22104cc95c371",
    "fields": "number,short_description,description,priority,state,assigned_to,opened_by,opened_at,work_notes"
  }
}
```

**Expected Output:**
```json
{
  "number": "INC0010001",
  "short_description": "SAP system down in production",
  "description": "Users unable to access SAP production environment. Getting connection timeout errors. Critical business impact - payroll processing blocked.",
  "priority": "1",
  "state": "2",
  "assigned_to": {
    "value": "5137153cc611227c000bbd1bd8cd2005",
    "display_value": "Fred Luddy"
  },
  "opened_by": {
    "value": "681ccaf9c0a8016400b98a06818d57c7",
    "display_value": "Joe Employee"
  },
  "opened_at": "2024-02-10 14:30:22",
  "work_notes": "2024-02-12 09:15:33 - Fred Luddy\nInvestigating database connection pool. Found max connections reached.\n\n2024-02-11 16:20:15 - Fred Luddy\nWorking with DBA team to increase connection limits."
}
```

---

### Example 4: Get User Information

**Use Case:** Look up user details by email or username.

**Tool Call:**
```json
{
  "tool": "get_user",
  "arguments": {
    "user_identifier": "fred.luddy@example.com"
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "5137153cc611227c000bbd1bd8cd2005",
  "user_name": "fred.luddy",
  "name": "Fred Luddy",
  "email": "fred.luddy@example.com",
  "title": "Senior System Administrator",
  "department": {
    "value": "221ba7ae0a0a0b99000e5fd90a05f5f5",
    "display_value": "IT Operations"
  },
  "active": true,
  "roles": "admin,itil,itil_admin"
}
```

---

### Example 5: Get Group Information

**Use Case:** Find assignment group details.

**Tool Call:**
```json
{
  "tool": "get_group",
  "arguments": {
    "group_identifier": "Database"
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "8a5055c9c61122780043563ef53438e3",
  "name": "Database",
  "description": "Database administration and support team",
  "active": true,
  "manager": {
    "value": "5137153cc611227c000bbd1bd8cd2005",
    "display_value": "Fred Luddy"
  },
  "type": "assigned_group"
}
```

---

## CMDB Examples

### Example 6: Search Configuration Items

**Use Case:** Find all production servers in a specific datacenter.

**Tool Call:**
```json
{
  "tool": "search_cmdb_ci",
  "arguments": {
    "query": "sys_class_name=cmdb_ci_server^operational_status=1^locationLIKEDC-EAST",
    "limit": 20
  }
}
```

**Expected Output:**
```json
{
  "count": 5,
  "records": [
    {
      "sys_id": "00a96c0d3790200044e0bfc8bcbe5db4",
      "name": "SAP-PROD-DB01",
      "sys_class_name": "cmdb_ci_server",
      "operational_status": "1",
      "support_group": {
        "value": "8a5055c9c61122780043563ef53438e3",
        "display_value": "Database"
      },
      "location": {
        "value": "108752c5c611227501b682158cc93cde",
        "display_value": "DC-EAST-01"
      }
    },
    {
      "sys_id": "01a96c0d3790200044e0bfc8bcbe5db5",
      "name": "SAP-PROD-APP01",
      "sys_class_name": "cmdb_ci_server",
      "operational_status": "1",
      "support_group": {
        "value": "d625dccec0a8016700a222a0f7900d06",
        "display_value": "Application Support"
      },
      "location": {
        "value": "108752c5c611227501b682158cc93cde",
        "display_value": "DC-EAST-01"
      }
    }
  ]
}
```

---

### Example 7: Get CI Details

**Use Case:** Get complete information about a specific server.

**Tool Call:**
```json
{
  "tool": "get_cmdb_ci",
  "arguments": {
    "ci_sys_id": "00a96c0d3790200044e0bfc8bcbe5db4"
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "00a96c0d3790200044e0bfc8bcbe5db4",
  "name": "SAP-PROD-DB01",
  "sys_class_name": "cmdb_ci_server",
  "operational_status": "1",
  "support_group": {
    "value": "8a5055c9c61122780043563ef53438e3",
    "display_value": "Database"
  },
  "managed_by": {
    "value": "5137153cc611227c000bbd1bd8cd2005",
    "display_value": "Fred Luddy"
  },
  "owned_by": {
    "value": "681ccaf9c0a8016400b98a06818d57c7",
    "display_value": "Joe Employee"
  },
  "location": {
    "value": "108752c5c611227501b682158cc93cde",
    "display_value": "DC-EAST-01"
  },
  "install_status": "1",
  "asset_tag": "SRV-12345"
}
```

---

### Example 8: List CI Relationships

**Use Case:** Understand dependencies - what connects to this database server?

**Tool Call:**
```json
{
  "tool": "list_relationships",
  "arguments": {
    "ci_sys_id": "00a96c0d3790200044e0bfc8bcbe5db4"
  }
}
```

**Expected Output:**
```json
{
  "count": 8,
  "relationships": [
    {
      "sys_id": "a6c45e93c611227400d421948a7ba7f1",
      "parent": {
        "value": "01a96c0d3790200044e0bfc8bcbe5db5",
        "display_value": "SAP-PROD-APP01"
      },
      "child": {
        "value": "00a96c0d3790200044e0bfc8bcbe5db4",
        "display_value": "SAP-PROD-DB01"
      },
      "type": {
        "value": "d93304fb0a0a0b78006a2912f2f352d1",
        "display_value": "Depends on::Used by"
      },
      "port": "1521"
    },
    {
      "sys_id": "b7d56fa4c711338500e421059b8ca8g2",
      "parent": {
        "value": "00a96c0d3790200044e0bfc8bcbe5db4",
        "display_value": "SAP-PROD-DB01"
      },
      "child": {
        "value": "02b97d1e4801311044f0cfc9bcce5e95",
        "display_value": "STORAGE-SAN-001"
      },
      "type": {
        "value": "e04418290a0a0b5e0116894de1d632f3",
        "display_value": "Uses::Used by"
      }
    }
  ]
}
```

**What This Shows:**
- SAP-PROD-APP01 depends on SAP-PROD-DB01 (application → database)
- SAP-PROD-DB01 uses STORAGE-SAN-001 (database → storage)
- Port 1521 indicates Oracle database connection

---

## ITOM Examples

### Example 9: List Discovery Schedules

**Use Case:** Check which discovery schedules are active and when they last ran.

**Tool Call:**
```json
{
  "tool": "list_discovery_schedules",
  "arguments": {
    "active_only": true
  }
}
```

**Expected Output:**
```json
{
  "count": 4,
  "schedules": [
    {
      "sys_id": "0c441abbc611227501b5db8a3b9a2f2f",
      "name": "Production Network Discovery",
      "discovers": "10.0.0.0/8",
      "type": "Network Discovery",
      "active": true,
      "next_run": "2024-02-13 02:00:00",
      "run_as": {
        "value": "5137153cc611227c000bbd1bd8cd2005",
        "display_value": "Fred Luddy"
      }
    },
    {
      "sys_id": "1d552bccd722338601c6de9b4c0b3e3e",
      "name": "Windows Server Discovery",
      "discovers": "Windows Servers",
      "type": "Windows",
      "active": true,
      "next_run": "2024-02-13 03:00:00",
      "run_as": {
        "value": "5137153cc611227c000bbd1bd8cd2005",
        "display_value": "Fred Luddy"
      }
    },
    {
      "sys_id": "2e663cdde833449712d7fa8c5d1c4f4f",
      "name": "Linux Server Discovery",
      "discovers": "Linux Servers",
      "type": "Unix",
      "active": true,
      "next_run": "2024-02-13 04:00:00",
      "run_as": {
        "value": "5137153cc611227c000bbd1bd8cd2005",
        "display_value": "Fred Luddy"
      }
    }
  ]
}
```

---

### Example 10: Check MID Server Status

**Use Case:** Verify all MID servers are up and healthy.

**Tool Call:**
```json
{
  "tool": "list_mid_servers",
  "arguments": {
    "active_only": true
  }
}
```

**Expected Output:**
```json
{
  "count": 3,
  "mid_servers": [
    {
      "sys_id": "0f774efef944449812c8eb9c6d2e5g5g",
      "name": "MID-DC-EAST-01",
      "status": "Up",
      "host_name": "mid-server-east.company.com",
      "ip_address": "10.10.1.50",
      "last_refreshed": "2024-02-12 19:58:15",
      "validated": "2024-02-12 00:05:22"
    },
    {
      "sys_id": "1g885fgfg055550923d9fc0d7e3f6h6h",
      "name": "MID-DC-WEST-01",
      "status": "Up",
      "host_name": "mid-server-west.company.com",
      "ip_address": "10.20.1.50",
      "last_refreshed": "2024-02-12 19:57:48",
      "validated": "2024-02-12 00:06:15"
    },
    {
      "sys_id": "2h996ghgh166661034e0gd1e8f4g7i7i",
      "name": "MID-CLOUD-01",
      "status": "Up",
      "host_name": "mid-server-cloud.company.com",
      "ip_address": "172.16.1.100",
      "last_refreshed": "2024-02-12 19:59:02",
      "validated": "2024-02-12 00:04:55"
    }
  ]
}
```

**Health Check:** All MID servers showing "Up" status and refreshed within last minute = healthy!

---

### Example 11: List Active Events

**Use Case:** Monitor critical infrastructure events.

**Tool Call:**
```json
{
  "tool": "list_active_events",
  "arguments": {
    "query": "severity=1^node.nameLIKEPROD",
    "limit": 10
  }
}
```

**Expected Output:**
```json
{
  "count": 2,
  "events": [
    {
      "sys_id": "3i007hih277772145f1he2f9g5h8j8j",
      "number": "EVT0010234",
      "source": "Nagios",
      "node": {
        "value": "00a96c0d3790200044e0bfc8bcbe5db4",
        "display_value": "SAP-PROD-DB01"
      },
      "severity": "1",
      "state": "Ready",
      "time_of_event": "2024-02-12 19:45:30",
      "message_key": "CPU_CRITICAL",
      "description": "CPU utilization above 95% for 10 minutes"
    },
    {
      "sys_id": "4j118iji388883256g2if3g0h6i9k9k",
      "number": "EVT0010235",
      "source": "SCOM",
      "node": {
        "value": "01a96c0d3790200044e0bfc8bcbe5db5",
        "display_value": "SAP-PROD-APP01"
      },
      "severity": "1",
      "state": "Ready",
      "time_of_event": "2024-02-12 19:50:12",
      "message_key": "DISK_CRITICAL",
      "description": "Disk space on C: drive at 98% capacity"
    }
  ]
}
```

---

### Example 12: CMDB Health Dashboard

**Use Case:** Get completeness metrics for CMDB data quality.

**Tool Call:**
```json
{
  "tool": "cmdb_health_dashboard",
  "arguments": {}
}
```

**Expected Output:**
```json
{
  "server_metrics": {
    "total": 245,
    "with_ip": 238,
    "with_os": 240,
    "with_serial": 195,
    "ip_completeness": "97.14",
    "os_completeness": "97.96"
  },
  "network_metrics": {
    "total": 1520,
    "with_ip": 1485,
    "with_mac": 1512,
    "ip_completeness": "97.70",
    "mac_completeness": "99.47"
  },
  "note": "For comprehensive CMDB health metrics, use the CMDB Health Dashboard UI or CMDB Health APIs if available"
}
```

**Analysis:**
- 97% server IP completeness = Good
- Only 79.6% have serial numbers = Needs improvement
- 99.5% network adapters have MAC addresses = Excellent

---

### Example 13: Service Mapping Summary

**Use Case:** Understand service dependencies for change impact analysis.

**Tool Call:**
```json
{
  "tool": "service_mapping_summary",
  "arguments": {
    "service_sys_id": "5c4a3g2b1d5e4f6789h0i1j2k3l4m5n6"
  }
}
```

**Expected Output:**
```json
{
  "service": {
    "sys_id": "5c4a3g2b1d5e4f6789h0i1j2k3l4m5n6",
    "name": "SAP ERP Production",
    "operational_status": "1",
    "owned_by": {
      "value": "681ccaf9c0a8016400b98a06818d57c7",
      "display_value": "Joe Employee"
    },
    "managed_by": {
      "value": "5137153cc611227c000bbd1bd8cd2005",
      "display_value": "Fred Luddy"
    },
    "business_criticality": "1"
  },
  "related_cis_count": 47,
  "related_cis": [
    {
      "sys_id": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      "ci_id": {
        "value": "00a96c0d3790200044e0bfc8bcbe5db4",
        "display_value": "SAP-PROD-DB01"
      },
      "service_id": {
        "value": "5c4a3g2b1d5e4f6789h0i1j2k3l4m5n6",
        "display_value": "SAP ERP Production"
      }
    }
  ]
}
```

**Insight:** SAP ERP service depends on 47 CIs - careful change planning required!

---

## ITSM Examples

### Example 14: Create Change Request (Write Operation)

**Use Case:** Automate change request creation for planned maintenance.

**Prerequisites:** 
- `WRITE_ENABLED=true` in environment
- Proper permissions in ServiceNow

**Tool Call:**
```json
{
  "tool": "create_change_request",
  "arguments": {
    "short_description": "Upgrade SAP database to latest patch level",
    "description": "Apply SAP database patches to resolve known performance issues. Requires 2-hour maintenance window.",
    "assignment_group": "8a5055c9c61122780043563ef53438e3",
    "category": "Software",
    "priority": "3",
    "risk": "3",
    "impact": "2",
    "urgency": "3"
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "9e4b5d6c7f8a9b0c1d2e3f4a5b6c7d8e",
  "number": "CHG0030152",
  "short_description": "Upgrade SAP database to latest patch level",
  "state": "1",
  "assigned_to": null,
  "assignment_group": {
    "value": "8a5055c9c61122780043563ef53438e3",
    "display_value": "Database"
  },
  "priority": "3",
  "risk": "3",
  "impact": "2",
  "urgency": "3",
  "opened_at": "2024-02-12 20:15:44",
  "opened_by": {
    "value": "5137153cc611227c000bbd1bd8cd2005",
    "display_value": "Fred Luddy"
  }
}
```

**Success:** Change request CHG0030152 created and assigned to Database group!

---

## Natural Language Examples

### Example 15: Natural Language Search

**Use Case:** Query ServiceNow using plain English instead of encoded queries.

**Tool Call:**
```json
{
  "tool": "natural_language_search",
  "arguments": {
    "query": "find all incidents about SAP that are assigned to the Database team",
    "limit": 5
  }
}
```

**Expected Output:**
```json
{
  "query": "find all incidents about SAP that are assigned to the Database team",
  "table": "incident",
  "count": 3,
  "records": [
    {
      "sys_id": "9d385017c611228701d22104cc95c371",
      "number": "INC0010001",
      "short_description": "SAP system down in production",
      "description": "Users unable to access SAP production environment...",
      "state": "2",
      "assigned_to": {
        "value": "5137153cc611227c000bbd1bd8cd2005",
        "display_value": "Fred Luddy"
      }
    },
    {
      "sys_id": "0f496128c722339012d8fa9c5e2e4f5g",
      "number": "INC0010078",
      "short_description": "SAP interface errors",
      "description": "SAP to Salesforce integration failing...",
      "state": "1"
    }
  ],
  "note": "Natural language search is simplified. For advanced NLP, consider ServiceNow Virtual Agent or external NLP integration."
}
```

---

### Example 16: Natural Language Update

**Use Case:** Update a record using conversational language.

**Prerequisites:** `WRITE_ENABLED=true`

**Tool Call:**
```json
{
  "tool": "natural_language_update",
  "arguments": {
    "instruction": "Update incident INC0010001 saying I'm working on it and will have an update in 30 minutes",
    "table": "incident"
  }
}
```

**Expected Output:**
```json
{
  "instruction": "Update incident INC0010001 saying I'm working on it and will have an update in 30 minutes",
  "table": "incident",
  "sys_id": "9d385017c611228701d22104cc95c371",
  "updated_record": {
    "sys_id": "9d385017c611228701d22104cc95c371",
    "number": "INC0010001",
    "state": "2",
    "work_notes": "Update via natural language: I'm working on it and will have an update in 30 minutes",
    "sys_updated_on": "2024-02-12 20:25:18"
  },
  "note": "Natural language update is simplified. Always verify changes."
}
```

---

## Advanced Workflows

### Workflow 1: Incident Investigation

**Scenario:** Investigate a production incident end-to-end.

```javascript
// 1. Get the incident details
const incident = await mcp.callTool('get_record', {
  table: 'incident',
  sys_id: 'INC_SYS_ID',
  fields: 'number,short_description,cmdb_ci,assigned_to'
});

// 2. Get the affected CI
const ci = await mcp.callTool('get_cmdb_ci', {
  ci_sys_id: incident.cmdb_ci.value
});

// 3. Check CI relationships (what else might be affected?)
const relationships = await mcp.callTool('list_relationships', {
  ci_sys_id: ci.sys_id
});

// 4. Check for active events on this CI
const events = await mcp.callTool('list_active_events', {
  query: `node=${ci.sys_id}`,
  limit: 10
});

// 5. Find similar incidents
const similarIncidents = await mcp.callTool('query_records', {
  table: 'incident',
  query: `cmdb_ci=${ci.sys_id}^opened_at>javascript:gs.daysAgoStart(30)`,
  limit: 5
});
```

---

### Workflow 2: Change Impact Analysis

**Scenario:** Assess impact before scheduling a change.

```javascript
// 1. Get the service being changed
const service = await mcp.callTool('service_mapping_summary', {
  service_sys_id: 'SERVICE_SYS_ID'
});

// 2. Get all related CIs
console.log(`Service has ${service.related_cis_count} dependent CIs`);

// 3. Check for active incidents on related CIs
for (const ci of service.related_cis) {
  const incidents = await mcp.callTool('query_records', {
    table: 'incident',
    query: `cmdb_ci=${ci.ci_id.value}^active=true`,
    fields: 'number,short_description,priority'
  });
  
  if (incidents.count > 0) {
    console.log(`Warning: ${ci.ci_id.display_value} has ${incidents.count} active incidents`);
  }
}

// 4. Check CMDB health for these CIs
const health = await mcp.callTool('cmdb_health_dashboard', {});
console.log(`CMDB completeness: ${health.server_metrics.ip_completeness}%`);

// 5. Create the change request if safe
if (allClear) {
  const change = await mcp.callTool('create_change_request', {
    short_description: 'Planned service upgrade',
    assignment_group: 'GROUP_SYS_ID',
    priority: '3',
    risk: '3'
  });
}
```

---

### Workflow 3: ITOM Health Check

**Scenario:** Daily health check of discovery infrastructure.

```javascript
// 1. Check all MID servers are up
const midServers = await mcp.callTool('list_mid_servers', {
  active_only: false
});

const downMids = midServers.mid_servers.filter(mid => mid.status !== 'Up');
if (downMids.length > 0) {
  console.log(`Alert: ${downMids.length} MID servers are down!`);
}

// 2. Check discovery schedules ran successfully
const schedules = await mcp.callTool('list_discovery_schedules', {
  active_only: true
});

console.log(`${schedules.count} active discovery schedules`);

// 3. Check for critical events
const criticalEvents = await mcp.callTool('list_active_events', {
  query: 'severity=1^state!=Closed',
  limit: 50
});

console.log(`${criticalEvents.count} critical events need attention`);

// 4. CMDB health check
const cmdbHealth = await mcp.callTool('cmdb_health_dashboard', {});

if (parseFloat(cmdbHealth.server_metrics.ip_completeness) < 90) {
  console.log('Warning: Server IP completeness below 90%');
}
```

---

## Error Handling Examples

### Error Reference

| Error Code | Situation | Cause | Solution |
|-----------|-----------|-------|----------|
| TABLE_NOT_ALLOWED | Query restricted table | Not in allowlist | Add to ALLOWED_TABLES or set ALLOW_ANY_TABLE=true |
| WRITE_NOT_ENABLED | Write operation blocked | WRITE_ENABLED=false | Set WRITE_ENABLED=true |
| VALIDATION_ERROR | Invalid parameter | Malformed sys_id | Verify 32-character hex string |
| AUTHENTICATION_FAILED | OAuth failure | Invalid credentials | Check CLIENT_ID/SECRET |
| RATE_LIMITED | Too many requests | Exceeded API limit | Implement retry logic with backoff |

---

### Example: Table Not Allowed

**Tool Call:**
```json
{
  "tool": "query_records",
  "arguments": {
    "table": "sys_user_password",
    "query": "active=true"
  }
}
```

**Error Response:**
```json
{
  "error": "Table \"sys_user_password\" is not in allowlist. Enable ALLOW_ANY_TABLE=true or add to ALLOWED_TABLES",
  "code": "TABLE_NOT_ALLOWED"
}
```

---

### Example: Write Operation Blocked

**Tool Call:**
```json
{
  "tool": "create_change_request",
  "arguments": {
    "short_description": "Test change"
  }
}
```

**Error Response (when WRITE_ENABLED=false):**
```json
{
  "error": "Write operation \"create_change_request\" not allowed. Enable WRITE_ENABLED=true",
  "code": "WRITE_NOT_ENABLED"
}
```

---

### Example: Invalid sys_id Format

**Tool Call:**
```json
{
  "tool": "get_record",
  "arguments": {
    "table": "incident",
    "sys_id": "INVALID_ID"
  }
}
```

**Error Response:**
```json
{
  "error": "Invalid sys_id format. Must be 32-character hex string",
  "code": "VALIDATION_ERROR"
}
```

---

## Tips for Effective Usage

### 1. Start with Schema
Always check table schema before querying to understand available fields:
```json
{"tool": "get_table_schema", "arguments": {"tableName": "incident"}}
```

### 2. Use Field Filtering
Request only needed fields to reduce response size:
```json
{"fields": "number,short_description,state,priority"}
```

### 3. Leverage Encoded Queries

Build complex queries with ServiceNow's encoded query syntax:

| Operator | Meaning | Example |
|----------|---------|---------|
| `^` | AND | `active=true^priority=1` |
| `^OR` | OR | `priority=1^ORpriority=2` |
| `^NQ` | New Query (parentheses) | `(field1=val1^field2=val2)^ORfield3=val3` |
| `LIKE` | Contains | `descriptionLIKEDatabase` |
| `STARTSWITH` | Begins with | `nameSTARTSWITHHello` |
| `>`, `<`, `>=`, `<=` | Comparisons | `opened_at>2024-01-01` |
| `.` | Dot-walk (related) | `assignment_group.name=Database` |

Example: `active=true^priority=1^ORpriority=2^assignment_groupLIKEDatabase`

### 4. Order Results
Use `orderBy` with `-` prefix for descending:
```json
{"orderBy": "-sys_updated_on"}  // Most recent first
```

### 5. Paginate Large Result Sets
```json
{
  "limit": 100,
  "offset": 0    // First page
}
// Then offset: 100, 200, 300, etc.
```

### 6. Dot-Walk for Related Data
Access related table fields:
```json
{"query": "assignment_group.name=Database^cmdb_ci.location.nameLIKEDC-EAST"}
```

### 7. Monitor Rate Limits
The client includes automatic retry with exponential backoff, but be mindful of:
- ServiceNow instance rate limits
- Large queries (use pagination)
- Frequent polling (cache when possible)

---

## HR Service Delivery (HRSD) Examples

### Example 20: Open an Onboarding Case

**Use Case:** Create an HR onboarding case for a new hire.

**Tool Call:**
```json
{
  "tool": "create_hr_case",
  "arguments": {
    "short_description": "Onboarding for Jane Smith - Engineering",
    "hr_service": "Onboarding",
    "subject_person": "jane.smith",
    "description": "New employee starting 2025-04-01. Requires laptop provisioning, badge access, and system accounts.",
    "priority": 2
  }
}
```

**Expected Result:**
```json
{
  "sys_id": "hrcase001abc",
  "number": "HRCS0001001",
  "state": "open",
  "summary": "Created HR case HRCS0001001"
}
```

---

### Example 21: Get HR Case Details

**Use Case:** Look up the status of an HR case by number.

**Tool Call:**
```json
{
  "tool": "get_hr_case",
  "arguments": {
    "number_or_sysid": "HRCS0001001"
  }
}
```

---

### Example 22: List Open HR Cases for an Employee

**Use Case:** Find all open HR cases for a specific subject person.

**Tool Call:**
```json
{
  "tool": "list_hr_cases",
  "arguments": {
    "state": "open",
    "subject_person": "jane.smith",
    "limit": 10
  }
}
```

---

### Example 23: List Available HR Services

**Use Case:** Find all active HR services (Onboarding, Offboarding, Benefits, Payroll, etc.).

**Tool Call:**
```json
{
  "tool": "list_hr_services",
  "arguments": {
    "active": true,
    "limit": 50
  }
}
```

---

### Example 24: Get Employee HR Profile

**Use Case:** Retrieve employment details, department, and manager for an employee.

**Tool Call:**
```json
{
  "tool": "get_hr_profile",
  "arguments": {
    "user_identifier": "john.doe"
  }
}
```

**Expected Result:**
```json
{
  "user": "John Doe",
  "department": "Engineering",
  "manager": "Alice Manager",
  "employment_type": "Full-Time",
  "hire_date": "2023-01-15"
}
```

---

### Example 25: Create HR Task on a Case

**Use Case:** Add an IT provisioning task to an existing HR onboarding case.

**Tool Call:**
```json
{
  "tool": "create_hr_task",
  "arguments": {
    "hr_case_sysid": "hrcase001abc",
    "short_description": "Provision laptop and accounts for new hire",
    "assigned_to": "it.provisioning",
    "due_date": "2025-04-01T09:00:00Z"
  }
}
```

---

### Example 26: Close an HR Case

**Use Case:** Close a resolved onboarding case with resolution notes.

**Tool Call:**
```json
{
  "tool": "close_hr_case",
  "arguments": {
    "sys_id": "hrcase001abc",
    "close_notes": "All onboarding tasks completed. Employee fully set up.",
    "close_code": "Resolved"
  }
}
```

---

## Customer Service Management (CSM) Examples

### Example 27: Create a Customer Service Case

**Use Case:** Log a new case for a customer reporting a product defect.

**Tool Call:**
```json
{
  "tool": "create_csm_case",
  "arguments": {
    "short_description": "Payment gateway returning 500 errors",
    "account": "Acme Corp",
    "contact": "Bob Johnson",
    "category": "Technical",
    "subcategory": "API Integration",
    "priority": 1,
    "description": "Customer reports consistent 500 errors from payment gateway API since 2025-03-15 14:00 UTC."
  }
}
```

**Expected Result:**
```json
{
  "number": "CS0001234",
  "state": "open",
  "priority": "1 - Critical",
  "summary": "Created CSM case CS0001234"
}
```

---

### Example 28: Get Case Details

**Tool Call:**
```json
{
  "tool": "get_csm_case",
  "arguments": {
    "number_or_sysid": "CS0001234"
  }
}
```

---

### Example 29: List Cases for an Account

**Use Case:** Show all open cases for Acme Corp.

**Tool Call:**
```json
{
  "tool": "list_csm_cases",
  "arguments": {
    "account": "Acme Corp",
    "state": "open",
    "limit": 20
  }
}
```

---

### Example 30: Get Account Details

**Use Case:** Retrieve account information including primary contact and industry.

**Tool Call:**
```json
{
  "tool": "get_csm_account",
  "arguments": {
    "name_or_sysid": "Acme Corp"
  }
}
```

---

### Example 31: List Contacts for an Account

**Tool Call:**
```json
{
  "tool": "list_csm_contacts",
  "arguments": {
    "account_sysid": "acmeacct001abc",
    "limit": 25
  }
}
```

---

### Example 32: Check Case SLA Status

**Use Case:** Verify if a critical case is approaching SLA breach.

**Tool Call:**
```json
{
  "tool": "get_csm_case_sla",
  "arguments": {
    "case_sysid": "cs001abc"
  }
}
```

**Expected Result:**
```json
{
  "sla_name": "P1 Response SLA",
  "breached": false,
  "time_remaining": "2h 15m",
  "percentage_elapsed": 72
}
```

---

### Example 33: Close a Customer Case

**Tool Call:**
```json
{
  "tool": "close_csm_case",
  "arguments": {
    "sys_id": "cs001abc",
    "resolution_code": "Solved by Engineering",
    "resolution_notes": "Root cause identified as misconfigured TLS certificate. Renewed and deployed to production at 18:42 UTC."
  }
}
```

---

## Security Operations Examples

### Example 34: Create a Security Incident

**Use Case:** Log a ransomware detection event from your SIEM.

**Tool Call:**
```json
{
  "tool": "create_security_incident",
  "arguments": {
    "short_description": "Ransomware variant detected on PROD-DB-01",
    "category": "Malware",
    "subcategory": "Ransomware",
    "severity": 1,
    "description": "EDR detected WannaCry variant attempting lateral movement. Host isolated at 09:32 UTC.",
    "assignment_group": "SOC Tier 2"
  }
}
```

**Expected Result:**
```json
{
  "number": "SIR0001001",
  "state": "open",
  "severity": "1 - High",
  "summary": "Created security incident SIR0001001"
}
```

---

### Example 35: List High-Severity Security Incidents

**Tool Call:**
```json
{
  "tool": "list_security_incidents",
  "arguments": {
    "severity": 1,
    "state": "open",
    "limit": 25
  }
}
```

---

### Example 36: List Critical Vulnerabilities on Production Servers

**Use Case:** Find all critical CVSS-scored vulnerabilities on CIs tagged as production.

**Tool Call:**
```json
{
  "tool": "list_vulnerabilities",
  "arguments": {
    "state": "open",
    "severity": "critical",
    "limit": 50
  }
}
```

---

### Example 37: Get Vulnerability Details

**Tool Call:**
```json
{
  "tool": "get_vulnerability",
  "arguments": {
    "number_or_sysid": "VIT0001234"
  }
}
```

**Expected Result:**
```json
{
  "number": "VIT0001234",
  "vulnerability": "CVE-2024-1234",
  "cvss_score": 9.8,
  "severity": "Critical",
  "affected_ci": "PROD-WEB-01",
  "state": "open",
  "remediation_date": "2025-04-30"
}
```

---

### Example 38: Accept Risk on a Vulnerability

**Use Case:** Mark a vulnerability as risk-accepted with business justification.

**Tool Call:**
```json
{
  "tool": "update_vulnerability",
  "arguments": {
    "sys_id": "vul001abc",
    "fields": {
      "state": "risk_accepted",
      "risk_acceptance_notes": "Compensating control in place via WAF rule. Reviewed by CISO 2025-03-20."
    }
  }
}
```

---

### Example 39: List GRC Risks in Draft State

**Tool Call:**
```json
{
  "tool": "list_grc_risks",
  "arguments": {
    "state": "draft",
    "category": "Data Privacy",
    "limit": 20
  }
}
```

---

### Example 40: Get GRC Risk Details

**Tool Call:**
```json
{
  "tool": "get_grc_risk",
  "arguments": {
    "number_or_sysid": "RSK0001001"
  }
}
```

---

### Example 41: List GRC Controls for a Risk

**Tool Call:**
```json
{
  "tool": "list_grc_controls",
  "arguments": {
    "risk_sysid": "risk001abc",
    "state": "non_compliant",
    "limit": 25
  }
}
```

---

### Example 42: Search Threat Intelligence

**Use Case:** Check if a suspicious IP address is in the threat intelligence database.

**Tool Call:**
```json
{
  "tool": "get_threat_intelligence",
  "arguments": {
    "query": "185.220.101.47",
    "type": "ip_address"
  }
}
```

**Expected Result:**
```json
{
  "count": 1,
  "records": [
    {
      "value": "185.220.101.47",
      "type": "ip_address",
      "confidence": 95,
      "threat_actor": "APT41",
      "campaign": "Operation ShadowNet",
      "last_seen": "2025-03-18"
    }
  ]
}
```

---

## Flow Designer Examples

### Example 43: List All Active Flows

**Tool Call:**
```json
{
  "tool": "list_flows",
  "arguments": {
    "active": true,
    "limit": 50
  }
}
```

---

### Example 44: Get Flow Details

**Use Case:** Inspect the actions and trigger of a specific flow before triggering it.

**Tool Call:**
```json
{
  "tool": "get_flow",
  "arguments": {
    "name_or_sysid": "Employee Offboarding"
  }
}
```

---

### Example 45: Trigger a Flow with Inputs

**Use Case:** Programmatically trigger the Employee Offboarding flow.

**Tool Call:**
```json
{
  "tool": "trigger_flow",
  "arguments": {
    "flow_sys_id": "flow001abc",
    "inputs": {
      "employee_sys_id": "user001abc",
      "effective_date": "2025-04-01",
      "termination_type": "voluntary"
    }
  }
}
```

**Expected Result:**
```json
{
  "sys_id": "exec001abc",
  "status": "running",
  "summary": "Triggered flow flow001abc"
}
```

---

### Example 46: Check Flow Execution Status

**Tool Call:**
```json
{
  "tool": "get_flow_execution",
  "arguments": {
    "execution_sysid": "exec001abc"
  }
}
```

**Expected Result:**
```json
{
  "sys_id": "exec001abc",
  "status": "complete",
  "started": "2025-03-20T10:00:00Z",
  "ended": "2025-03-20T10:02:34Z",
  "error": null
}
```

---

### Example 47: List Recent Executions of a Flow

**Use Case:** Review the last 10 runs of a scheduled flow to check for errors.

**Tool Call:**
```json
{
  "tool": "list_flow_executions",
  "arguments": {
    "flow_sys_id": "flow001abc",
    "status": "error",
    "limit": 10
  }
}
```

---

### Example 48: List Available Subflows

**Tool Call:**
```json
{
  "tool": "list_subflows",
  "arguments": {
    "query": "notification",
    "active": true,
    "limit": 25
  }
}
```

---

### Example 49: List Process Automation Playbooks

**Use Case:** Show all active Process Automation Designer playbooks.

**Tool Call:**
```json
{
  "tool": "list_process_automations",
  "arguments": {
    "active": true,
    "limit": 50
  }
}
```

---

## Advanced Multi-Step Workflow Examples

### Example 50: Incident Triage Workflow

**Use Case:** Triage a reported outage — query CMDB, create incident, assign, and add work note.

**Step 1 — Find the affected CI:**
```json
{ "tool": "search_cmdb_ci", "arguments": { "query": "name=PROD-WEB-01" } }
```

**Step 2 — Create the incident:**
```json
{
  "tool": "create_incident",
  "arguments": {
    "short_description": "PROD-WEB-01 unresponsive — HTTP 503",
    "urgency": 1,
    "impact": 1,
    "category": "Infrastructure",
    "assignment_group": "Web Operations"
  }
}
```

**Step 3 — Add initial work note:**
```json
{
  "tool": "add_work_note",
  "arguments": {
    "table": "incident",
    "sys_id": "inc001abc",
    "note": "CMDB: PROD-WEB-01 (Linux, Apache 2.4) hosts the customer portal. CI owner: web.ops team. Last discovery: 2025-03-19."
  }
}
```

---

### Example 51: Change Request with CAB Approval

**Step 1 — Create change request:**
```json
{
  "tool": "create_change_request",
  "arguments": {
    "short_description": "Upgrade PostgreSQL from 14 to 16 on PROD-DB cluster",
    "category": "Database",
    "risk": "moderate",
    "assignment_group": "DBA Team"
  }
}
```

**Step 2 — Submit for CAB approval:**
```json
{ "tool": "submit_change_for_approval", "arguments": { "sys_id": "chg001abc" } }
```

**Step 3 — Check approval status:**
```json
{ "tool": "get_my_approvals", "arguments": {} }
```

---

### Example 52: End-to-End Security Incident Response

**Step 1 — Create SecOps incident:**
```json
{
  "tool": "create_security_incident",
  "arguments": {
    "short_description": "Suspected credential stuffing on login portal",
    "category": "Unauthorized Access",
    "severity": 2,
    "assignment_group": "SOC Tier 1"
  }
}
```

**Step 2 — Check threat intel on source IPs:**
```json
{ "tool": "get_threat_intelligence", "arguments": { "query": "91.108.4.0/22", "type": "ip_address" } }
```

**Step 3 — Find associated vulnerabilities:**
```json
{ "tool": "list_vulnerabilities", "arguments": { "severity": "high", "state": "open", "limit": 10 } }
```

**Step 4 — Update incident with findings:**
```json
{
  "tool": "update_security_incident",
  "arguments": {
    "sys_id": "sir001abc",
    "fields": {
      "state": "analysis",
      "work_notes": "Source IPs match known Tor exit nodes. Correlating with open CVE-2024-5678 on auth service."
    }
  }
}
```

---

### Example 53: HR Onboarding End-to-End

**Step 1 — Open HR case:**
```json
{
  "tool": "create_hr_case",
  "arguments": {
    "short_description": "Onboarding — Alex Turner, Software Engineer",
    "hr_service": "Onboarding",
    "subject_person": "alex.turner"
  }
}
```

**Step 2 — Add provisioning task:**
```json
{
  "tool": "create_hr_task",
  "arguments": {
    "hr_case_sysid": "hrcase002abc",
    "short_description": "Provision MacBook Pro and GitHub access",
    "assigned_to": "it.provisioning",
    "due_date": "2025-04-01T09:00:00Z"
  }
}
```

**Step 3 — Trigger onboarding flow:**
```json
{
  "tool": "trigger_flow",
  "arguments": {
    "flow_sys_id": "onboarding_flow_sysid",
    "inputs": { "employee_sys_id": "alex.turner.sysid", "start_date": "2025-04-01" }
  }
}
```

---

### Example 54: ATF Regression Test Run

**Step 1 — List test suites:**
```json
{ "tool": "list_atf_suites", "arguments": { "active": true, "limit": 10 } }
```

**Step 2 — Run the regression suite:**
```json
{ "tool": "run_atf_suite", "arguments": { "suite_sys_id": "suite001abc" } }
```

**Step 3 — Check suite results:**
```json
{ "tool": "get_atf_suite_result", "arguments": { "result_sys_id": "result001abc" } }
```

**Step 4 — Get Failure Insight for a failed test:**
```json
{ "tool": "get_atf_failure_insight", "arguments": { "test_result_sys_id": "testresult001abc" } }
```

---

### Example 55: Reporting — Incident Trend Analysis

**Use Case:** Analyse incident volume by category over the last quarter.

**Tool Call:**
```json
{
  "tool": "trend_query",
  "arguments": {
    "table": "incident",
    "field": "opened_at",
    "period": "quarter",
    "group_by": "category"
  }
}
```

**Expected Result:**
```json
{
  "period": "2025-Q1",
  "data": [
    { "category": "Network", "count": 142 },
    { "category": "Hardware", "count": 87 },
    { "category": "Software", "count": 201 },
    { "category": "Security", "count": 34 }
  ]
}
```

---

### Example 56: Knowledge Base — Find and Publish Article

**Step 1 — Search for existing articles:**
```json
{ "tool": "search_knowledge", "arguments": { "query": "VPN setup guide", "limit": 5 } }
```

**Step 2 — Create a new article if none exists:**
```json
{
  "tool": "create_knowledge_article",
  "arguments": {
    "short_description": "How to set up the corporate VPN on macOS",
    "knowledge_base": "IT Self-Service",
    "category": "Networking",
    "text": "# VPN Setup Guide\n\n1. Download the VPN client...\n2. Enter server address...\n3. Authenticate with your corporate credentials."
  }
}
```

**Step 3 — Publish the article:**
```json
{ "tool": "publish_knowledge_article", "arguments": { "sys_id": "kb001abc" } }
```

---

### Example 57: Agile Sprint Planning

**Step 1 — Create an epic:**
```json
{
  "tool": "create_epic",
  "arguments": {
    "short_description": "ServiceNow MCP Integration Phase 2",
    "description": "Extend MCP integration to cover HRSD and CSM modules",
    "release": "Q2 2025"
  }
}
```

**Step 2 — Create stories under the epic:**
```json
{
  "tool": "create_story",
  "arguments": {
    "short_description": "As an HR admin, I can create HR cases via AI assistant",
    "epic_sys_id": "epic001abc",
    "story_points": 5,
    "assigned_to": "developer.one"
  }
}
```

**Step 3 — List stories in the epic:**
```json
{ "tool": "list_stories", "arguments": { "epic_sys_id": "epic001abc", "limit": 20 } }
```

---

### Example 58: Now Assist — AI-Powered Incident Resolution

**Step 1 — Generate a summary of a complex incident:**
```json
{ "tool": "generate_summary", "arguments": { "table": "incident", "sys_id": "inc001abc" } }
```

**Step 2 — Get AI-suggested resolution:**
```json
{ "tool": "suggest_resolution", "arguments": { "incident_sys_id": "inc001abc" } }
```

**Step 3 — Auto-categorise a new incident:**
```json
{
  "tool": "categorize_incident",
  "arguments": {
    "short_description": "Outlook not opening after Windows update KB5034441",
    "description": "Multiple users on Windows 11 reporting Outlook crashes immediately after launch following the March 2025 cumulative update."
  }
}
```

**Expected Result:**
```json
{
  "category": "Software",
  "subcategory": "Email Client",
  "suggested_assignment_group": "Desktop Support",
  "confidence": 0.94
}
```

---

### Example 59: Natural Language Search

**Use Case:** Query ServiceNow using plain English without knowing field names.

**Tool Call:**
```json
{
  "tool": "natural_language_search",
  "arguments": {
    "query": "Show me all critical incidents opened this week that are still unassigned",
    "limit": 20
  }
}
```

---

### Example 60: CMDB Dependency Map for a Service

**Use Case:** Understand the full dependency chain for a business service before a change window.

**Step 1 — Find the service CI:**
```json
{ "tool": "search_cmdb_ci", "arguments": { "query": "name=Customer Portal" } }
```

**Step 2 — Get its relationships:**
```json
{
  "tool": "list_relationships",
  "arguments": {
    "ci_sys_id": "ci001abc",
    "relationship_type": "Depends on"
  }
}
```

**Step 3 — Get service mapping summary:**
```json
{ "tool": "service_mapping_summary", "arguments": { "service_sys_id": "ci001abc" } }
```

---

### Example 61: Scripting — Create a Business Rule

**Use Case:** Add a business rule to auto-assign incidents based on category.

**Tool Call:**
```json
{
  "tool": "create_business_rule",
  "arguments": {
    "name": "Auto-assign Network incidents",
    "table": "incident",
    "when": "before",
    "insert": true,
    "condition": "current.category == 'network'",
    "script": "current.assignment_group = gs.getGroupByName('Network Operations');"
  }
}
```

---

### Example 62: Multi-Instance — Switch Context

**Use Case:** Query production data without leaving your AI session.

Configure `instances.json` with both `dev` and `production` entries (see [docs/MULTI_INSTANCE.md](docs/MULTI_INSTANCE.md)), then ask:

```
Switch to the production instance and show me the top 5 open P1 incidents.
```

---

### Example 63: Service Catalog — Order an Item

**Use Case:** Submit a catalog request for a new software license.

**Step 1 — Browse catalog:**
```json
{ "tool": "list_catalog_items", "arguments": { "category": "Software", "limit": 20 } }
```

**Step 2 — Get item details and variables:**
```json
{ "tool": "get_catalog_item", "arguments": { "item_sys_id": "catalog001abc" } }
```

**Step 3 — Place the order:**
```json
{
  "tool": "order_catalog_item",
  "arguments": {
    "item_sys_id": "catalog001abc",
    "quantity": 1,
    "variables": {
      "software_name": "JetBrains IntelliJ IDEA",
      "justification": "Required for Java microservice development"
    }
  }
}
```

---

### Example 64: User Management — Bulk Group Update

**Use Case:** Add multiple engineers to the On-Call rotation group.

**Step 1 — Get the group sys_id:**
```json
{ "tool": "get_group", "arguments": { "group_identifier": "On-Call Rotation" } }
```

**Step 2 — Add each user:**
```json
{ "tool": "add_user_to_group", "arguments": { "user_identifier": "alice.smith", "group_identifier": "group001abc" } }
```
```json
{ "tool": "add_user_to_group", "arguments": { "user_identifier": "bob.jones", "group_identifier": "group001abc" } }
```

---

### Example 65: Performance Analytics Dashboard Query

**Use Case:** Pull KPIs for the monthly IT operations review.

**Tool Call:**
```json
{
  "tool": "run_aggregate_query",
  "arguments": {
    "table": "incident",
    "aggregate": "COUNT",
    "group_by": ["state", "priority"],
    "query": "opened_atONLast 30 days@javascript:gs.beginningOfLast30Days()@javascript:gs.endOfLast30Days()"
  }
}
```

---

### Example 66: Discovery — Check MID Server Health

**Use Case:** Verify all MID servers are up before running a discovery schedule.

**Tool Call:**
```json
{ "tool": "list_mid_servers", "arguments": { "active_only": true } }
```

**Expected Result:**
```json
{
  "count": 3,
  "records": [
    { "name": "MID-LONDON-01", "status": "Up", "version": "Tokyo Patch 8" },
    { "name": "MID-NYC-01", "status": "Up", "version": "Tokyo Patch 8" },
    { "name": "MID-SYDNEY-01", "status": "Down", "last_seen": "2025-03-19T06:00:00Z" }
  ]
}
```

---

### Example 67: Virtual Agent — List Topics

**Use Case:** Audit active Virtual Agent conversation topics.

**Tool Call:**
```json
{ "tool": "get_virtual_agent_topics", "arguments": { "active": true, "limit": 30 } }
```

---

### Example 68: Agentic Playbook — Trigger AI Workflow

**Use Case:** Launch a Now Assist Agentic Playbook for automated incident remediation.

**Tool Call:**
```json
{
  "tool": "trigger_agentic_playbook",
  "arguments": {
    "playbook_name": "Incident Auto-Remediation",
    "context": {
      "incident_sys_id": "inc001abc",
      "severity": "high"
    }
  }
}
```

---

### Example 69: AI Search — Semantic Knowledge Query

**Use Case:** Use the AI Search API to find contextually relevant KB articles.

**Tool Call:**
```json
{
  "tool": "ai_search",
  "arguments": {
    "query": "laptop keeps overheating and shutting down unexpectedly",
    "limit": 5
  }
}
```

---

### Example 70: Changeset Workflow

**Use Case:** Commit and publish a development changeset to the next environment.

**Step 1 — List open changesets:**
```json
{ "tool": "list_changesets", "arguments": { "state": "in_progress" } }
```

**Step 2 — Commit the changeset:**
```json
{ "tool": "commit_changeset", "arguments": { "changeset_sys_id": "cs001abc" } }
```

**Step 3 — Publish it:**
```json
{ "tool": "publish_changeset", "arguments": { "changeset_sys_id": "cs001abc" } }
```

---

## Tips and Best Practices

### 1. Start Read-Only

Keep `WRITE_ENABLED=false` until you understand what each tool does. All read operations are always available.

### 2. Use Role-Based Packages in Production

Set `MCP_TOOL_PACKAGE` to limit the tools exposed to what each persona actually needs. This reduces the attack surface and keeps responses focused.

```env
MCP_TOOL_PACKAGE=service_desk   # For L1/L2 agents
MCP_TOOL_PACKAGE=itom_engineer  # For infrastructure teams
MCP_TOOL_PACKAGE=ai_developer   # For Now Assist integrations
```

### 3. Leverage Natural Language for Complex Queries

Instead of constructing encoded queries manually, use `natural_language_search` to let the AI translate your intent:

```
Show me all change requests opened last week that are pending CAB approval for the London data centre.
```

### 4. Chain Tools for Richer Context

The most powerful use cases combine multiple tools. Always use `get_cmdb_ci` and `list_relationships` before a change, and `generate_summary` before an incident update.

### 5. OAuth 2.0 for Production

Always use OAuth 2.0 Client Credentials in production rather than Basic Auth. See [docs/CLIENT_SETUP.md](docs/CLIENT_SETUP.md) for setup instructions.

### 6. Monitor Rate Limits

The client includes automatic retry with exponential backoff, but be mindful of:
- ServiceNow instance rate limits (configurable in `glide.rest.quota.enabled`)
- Large result sets — use `limit` and `offset` for pagination
- Frequent polling — cache read-only results where possible

### 7. Use Encoded Queries for Precision

For complex filters, pass an encoded ServiceNow query string directly:

```json
{"query": "assignment_group.name=Database^cmdb_ci.location.nameLIKEDC-EAST"}
```

---

## Next Steps

- Review [SECURITY.md](SECURITY.md) for security best practices
- Check [CONTRIBUTING.md](CONTRIBUTING.md) to extend functionality
- See [docs/TOOLS.md](docs/TOOLS.md) for the full tool reference (270+ tools)

---

## Additional Real-World Examples

### Example 71: Get Schema for a Custom Table

**Use Case:** Inspect the fields of a custom application table before querying it.

**Tool Call:**
```json
{ "tool": "get_table_schema", "arguments": { "tableName": "x_acme_project_task" } }
```

---

### Example 72: Paginate Large Result Sets

**Use Case:** Retrieve all incidents from the last month in batches of 100.

**Tool Call (page 1):**
```json
{
  "tool": "query_records",
  "arguments": {
    "table": "incident",
    "query": "opened_atONLast month@javascript:gs.beginningOfLast30Days()@javascript:gs.endOfLast30Days()",
    "limit": 100,
    "offset": 0
  }
}
```

**Tool Call (page 2):**
```json
{
  "tool": "query_records",
  "arguments": {
    "table": "incident",
    "query": "opened_atONLast month@javascript:gs.beginningOfLast30Days()@javascript:gs.endOfLast30Days()",
    "limit": 100,
    "offset": 100
  }
}
```

---

### Example 73: Get a Single Record by sys_id

**Tool Call:**
```json
{
  "tool": "get_record",
  "arguments": {
    "table": "change_request",
    "sys_id": "chg001abc000000000000000000000001"
  }
}
```

---

### Example 74: Get Incident by Number

**Tool Call:**
```json
{
  "tool": "get_incident",
  "arguments": { "number_or_sysid": "INC0012345" }
}
```

---

### Example 75: Resolve an Incident

**Tool Call:**
```json
{
  "tool": "resolve_incident",
  "arguments": {
    "sys_id": "inc001abc",
    "resolution_code": "Solved (Permanently)",
    "resolution_notes": "Restarted the Apache service and identified the root cause as a memory leak in the request handler. Applied hotfix v1.2.1."
  }
}
```

---

### Example 76: Add Customer-Visible Comment

**Use Case:** Update the caller on progress without exposing internal notes.

**Tool Call:**
```json
{
  "tool": "add_comment",
  "arguments": {
    "table": "incident",
    "sys_id": "inc001abc",
    "comment": "We have identified the issue and our team is actively working on a fix. Expected resolution: 30 minutes."
  }
}
```

---

### Example 77: Create a Problem Record

**Use Case:** Open a problem from a recurring incident pattern.

**Tool Call:**
```json
{
  "tool": "create_problem",
  "arguments": {
    "short_description": "Recurring Apache crashes on PROD-WEB cluster",
    "description": "7 incidents in the past 14 days all linked to Apache memory leak (INC001, INC002, INC005).",
    "assignment_group": "Web Operations",
    "urgency": 2
  }
}
```

---

### Example 78: List My Pending Tasks

**Use Case:** Daily task review for a technician starting their shift.

**Tool Call:**
```json
{
  "tool": "list_my_tasks",
  "arguments": { "limit": 20 }
}
```

---

### Example 79: Complete a Task

**Tool Call:**
```json
{
  "tool": "complete_task",
  "arguments": {
    "sys_id": "task001abc",
    "close_notes": "Replaced faulty NIC on server PROD-DB-02. Verified network connectivity restored."
  }
}
```

---

### Example 80: Create a New User

**Use Case:** Provision a new service account via AI assistant.

**Tool Call:**
```json
{
  "tool": "create_user",
  "arguments": {
    "user_name": "svc_monitoring",
    "first_name": "Monitoring",
    "last_name": "Service Account",
    "email": "svc.monitoring@company.com",
    "active": true,
    "roles": ["itil_admin"]
  }
}
```

---

### Example 81: Search Knowledge Base

**Tool Call:**
```json
{
  "tool": "search_knowledge",
  "arguments": {
    "query": "how to reset Active Directory password",
    "limit": 5
  }
}
```

---

### Example 82: Get My Pending Approvals

**Use Case:** Review all approvals awaiting action from the current user.

**Tool Call:**
```json
{
  "tool": "get_my_approvals",
  "arguments": { "limit": 10 }
}
```

---

### Example 83: Approve a Request

**Tool Call:**
```json
{
  "tool": "approve_request",
  "arguments": {
    "approval_sys_id": "appr001abc",
    "comments": "Approved. Change aligns with Q1 roadmap and has been tested in staging."
  }
}
```

---

### Example 84: Reject a Catalog Request

**Tool Call:**
```json
{
  "tool": "reject_request",
  "arguments": {
    "approval_sys_id": "appr002abc",
    "comments": "Rejected. Insufficient business justification provided. Please resubmit with cost-benefit analysis."
  }
}
```

---

### Example 85: Check Active SLAs

**Tool Call:**
```json
{
  "tool": "list_active_slas",
  "arguments": {
    "table": "incident",
    "breached": false,
    "limit": 25
  }
}
```

---

### Example 86: Get SLA Details for a Ticket

**Tool Call:**
```json
{
  "tool": "get_sla_details",
  "arguments": { "task_sys_id": "inc001abc" }
}
```

---

### Example 87: List ITOM Discovery Schedules

**Use Case:** Check which discovery schedules are running and their last status.

**Tool Call:**
```json
{
  "tool": "list_discovery_schedules",
  "arguments": { "active_only": true }
}
```

---

### Example 88: List Active Infrastructure Events

**Use Case:** Monitor real-time infrastructure events for anomalies.

**Tool Call:**
```json
{
  "tool": "list_active_events",
  "arguments": {
    "query": "severity=1",
    "limit": 20
  }
}
```

---

### Example 89: Get CMDB Health Dashboard

**Use Case:** Weekly CMDB data quality review meeting.

**Tool Call:**
```json
{ "tool": "cmdb_health_dashboard", "arguments": {} }
```

**Expected Result:**
```json
{
  "total_cis": 12847,
  "stale_cis": 234,
  "duplicate_cis": 18,
  "orphaned_relationships": 91,
  "health_score": 97.1
}
```

---

### Example 90: Get Scheduled Reports List

**Tool Call:**
```json
{
  "tool": "list_scheduled_jobs",
  "arguments": { "active": true, "limit": 20 }
}
```

---

### Example 91: Run a Specific ATF Test

**Use Case:** Run a single ATF test in isolation after a code change.

**Tool Call:**
```json
{
  "tool": "run_atf_test",
  "arguments": { "test_sys_id": "test001abc" }
}
```

---

### Example 92: Get ATF Test Results

**Tool Call:**
```json
{
  "tool": "list_atf_test_results",
  "arguments": {
    "suite_result_sys_id": "suiteresult001abc",
    "status": "failed"
  }
}
```

---

### Example 93: Predictive Intelligence — Get Models

**Use Case:** List available Predictive Intelligence models for categorisation and routing.

**Tool Call:**
```json
{ "tool": "get_pi_models", "arguments": { "active": true } }
```

---

### Example 94: Generate Work Notes Summary

**Use Case:** Before escalating an incident, generate a concise summary of all work notes.

**Tool Call:**
```json
{
  "tool": "generate_work_notes",
  "arguments": {
    "table": "incident",
    "sys_id": "inc001abc"
  }
}
```

---

### Example 95: List Script Includes

**Use Case:** Review existing script includes before creating a new utility function.

**Tool Call:**
```json
{
  "tool": "list_script_includes",
  "arguments": {
    "query": "IncidentUtils",
    "limit": 10
  }
}
```

---

### Example 96: Get a Business Rule

**Tool Call:**
```json
{
  "tool": "get_business_rule",
  "arguments": { "name_or_sysid": "Auto-assign Network incidents" }
}
```

---

### Example 97: Update a Story's Status

**Use Case:** Move an Agile story to "In Progress" when work begins.

**Tool Call:**
```json
{
  "tool": "update_story",
  "arguments": {
    "sys_id": "story001abc",
    "fields": { "state": "2", "assigned_to": "developer.one" }
  }
}
```

---

### Example 98: List Epics in a Release

**Tool Call:**
```json
{
  "tool": "list_epics",
  "arguments": {
    "release": "Q2 2025",
    "limit": 20
  }
}
```

---

### Example 99: Get MS Copilot Topics

**Use Case:** Review topics configured for Microsoft Copilot integration.

**Tool Call:**
```json
{ "tool": "get_ms_copilot_topics", "arguments": { "active": true } }
```

---

### Example 100: NLQ Query — Natural Language to ServiceNow Query

**Use Case:** Convert a business question into a ServiceNow query automatically.

**Tool Call:**
```json
{
  "tool": "nlq_query",
  "arguments": {
    "question": "How many P2 incidents were resolved within SLA last quarter by the Network team?",
    "table": "incident"
  }
}
```

---

### Example 101: Export Report Data

**Use Case:** Pull raw data from a saved report for external analysis.

**Tool Call:**
```json
{
  "tool": "export_report_data",
  "arguments": {
    "report_sys_id": "report001abc",
    "format": "json"
  }
}
```

---

### Example 102: Get System Log Entries

**Use Case:** Diagnose a platform issue by querying recent system log entries.

**Tool Call:**
```json
{
  "tool": "get_sys_log",
  "arguments": {
    "level": "error",
    "limit": 50,
    "query": "sourceCONTAINSBusinessRule"
  }
}
```

---

### Example 103: Update a Change Request

**Tool Call:**
```json
{
  "tool": "update_change_request",
  "arguments": {
    "sys_id": "chg001abc",
    "fields": {
      "risk": "low",
      "justification": "Low-risk update — only configuration file change, fully reversible within 5 minutes."
    }
  }
}
```

---

### Example 104: Close a Change Request

**Tool Call:**
```json
{
  "tool": "close_change_request",
  "arguments": {
    "sys_id": "chg001abc",
    "close_code": "successful",
    "close_notes": "Change implemented successfully during maintenance window. All validation tests passed."
  }
}
```

---

### Example 105: List Client Scripts

**Use Case:** Audit client-side scripts on the incident form before a platform upgrade.

**Tool Call:**
```json
{
  "tool": "list_client_scripts",
  "arguments": {
    "table": "incident",
    "active": true,
    "limit": 20
  }
}
```

---

## Service Portal & Widget Examples

### Example 106: List All Portals

**Use Case:** Discover all Service Portal configurations in the instance.

**Tool Call:**
```json
{
  "tool": "list_portals",
  "arguments": {
    "limit": 25
  }
}
```

**Expected Output:**
```json
{
  "count": 3,
  "records": [
    { "sys_id": "a2…", "title": "Employee Service Center", "url_suffix": "esc" },
    { "sys_id": "b3…", "title": "IT Service Portal", "url_suffix": "sp" },
    { "sys_id": "c4…", "title": "Customer Portal", "url_suffix": "csm" }
  ]
}
```

---

### Example 107: Get Widget Source Code

**Use Case:** Retrieve the full Angular template and server script of a widget for review.

**Tool Call:**
```json
{
  "tool": "get_portal_widget",
  "arguments": {
    "id_or_sysid": "widget-cool-clock"
  }
}
```

---

### Example 108: Create a Portal Widget

**Use Case:** Create a new widget that shows the current user's open incidents.

**Tool Call:**
```json
{
  "tool": "create_portal_widget",
  "arguments": {
    "name": "My Open Incidents",
    "id": "my-open-incidents",
    "template": "<div><h3>My Open Incidents</h3><ul><li ng-repeat='inc in data.incidents'>{{inc.number}} - {{inc.short_description}}</li></ul></div>",
    "css": "h3 { color: #333; font-size: 18px; }",
    "client_script": "api.controller = function($scope) { };",
    "server_script": "data.incidents = []; var gr = new GlideRecord('incident'); gr.addQuery('caller_id', gs.getUserID()); gr.addQuery('active', true); gr.query(); while(gr.next()) { data.incidents.push({number: gr.number+'', short_description: gr.short_description+''}); }"
  }
}
```

---

## Integration Examples

### Example 109: List REST Message Definitions

**Use Case:** Audit all outbound integrations configured in the instance.

**Tool Call:**
```json
{
  "tool": "list_rest_messages",
  "arguments": {
    "query": "Slack",
    "limit": 10
  }
}
```

---

### Example 110: Fire a Custom Event

**Use Case:** Trigger a custom event to kick off a notification workflow.

**Tool Call:**
```json
{
  "tool": "fire_event",
  "arguments": {
    "event_name": "myapp.incident.escalated",
    "table": "incident",
    "record_sys_id": "abc123def456...",
    "parm1": "P1",
    "parm2": "Escalated to L3 support"
  }
}
```

---

### Example 111: Run a Transform Map

**Use Case:** Process an import set by running a transform map to create incidents from CSV data.

**Tool Call:**
```json
{
  "tool": "run_transform_map",
  "arguments": {
    "transform_map_sys_id": "tm_sys_id_here",
    "import_set_sys_id": "is_sys_id_here"
  }
}
```

---

## Notification & Attachment Examples

### Example 112: Upload an Attachment

**Use Case:** Attach a screenshot or log file to an incident record.

**Tool Call:**
```json
{
  "tool": "upload_attachment",
  "arguments": {
    "table": "incident",
    "record_sys_id": "abc123...",
    "file_name": "error_screenshot.png",
    "content_type": "image/png",
    "content_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ..."
  }
}
```

---

### Example 113: List Attachments on a Record

**Use Case:** List all files attached to a change request.

**Tool Call:**
```json
{
  "tool": "list_attachments",
  "arguments": {
    "table": "change_request",
    "record_sys_id": "chg_sys_id_here"
  }
}
```

---

### Example 114: Create an Email Notification

**Use Case:** Create a notification that emails the assignment group when an incident is reassigned.

**Tool Call:**
```json
{
  "tool": "create_notification",
  "arguments": {
    "name": "Incident Reassigned - Notify Group",
    "table": "incident",
    "event": "incident.reassigned",
    "subject": "Incident ${number} has been reassigned to your group",
    "message_html": "<p>Incident <b>${number}</b> has been assigned to your group: ${assignment_group.display_value}.</p><p>Priority: ${priority.display_value}</p>",
    "recipients": "assignment_group",
    "active": true
  }
}
```

---

## Performance Analytics Examples

### Example 115: Get PA Scorecard

**Use Case:** Get the current value and trend for the "Mean Time to Resolve" KPI.

**Tool Call:**
```json
{
  "tool": "get_pa_scorecard",
  "arguments": {
    "indicator_sys_id": "pa_indicator_sys_id_here",
    "period": "last_30_days",
    "include_scores": true
  }
}
```

**Expected Output:**
```json
{
  "indicator": {
    "name": "Mean Time to Resolve",
    "unit": "hours",
    "direction": "down"
  },
  "current_value": "4.2",
  "previous_value": "5.8",
  "trend": "down",
  "last_collected": "2026-02-20"
}
```

---

### Example 116: Check Table Data Completeness

**Use Case:** Audit how complete the incident table data is — are key fields being filled in?

**Tool Call:**
```json
{
  "tool": "check_table_completeness",
  "arguments": {
    "table": "incident",
    "fields": "assigned_to,assignment_group,category,priority,cmdb_ci",
    "query": "active=true",
    "sample_size": 200
  }
}
```

**Expected Output:**
```json
{
  "table": "incident",
  "sample_size": 200,
  "field_completeness": {
    "assigned_to": { "completeness_pct": "78.5%", "non_empty": 157, "total": 200 },
    "assignment_group": { "completeness_pct": "91.0%", "non_empty": 182, "total": 200 },
    "category": { "completeness_pct": "64.0%", "non_empty": 128, "total": 200 },
    "priority": { "completeness_pct": "99.5%", "non_empty": 199, "total": 200 },
    "cmdb_ci": { "completeness_pct": "42.5%", "non_empty": 85, "total": 200 }
  }
}
```

---

## Scripting Enhancement Examples

### Example 117: Create a UI Action

**Use Case:** Add an "Escalate to L3" button to the incident form.

**Tool Call:**
```json
{
  "tool": "create_ui_action",
  "arguments": {
    "name": "Escalate to L3",
    "table": "incident",
    "action_name": "escalate_to_l3",
    "script": "var gr = new GlideRecord('incident'); if (gr.get(current.sys_id)) { gr.assignment_group = gs.getGroupSysID('L3-Support'); gr.comments = 'Escalated to L3 support team.'; gr.update(); } gs.addInfoMessage('Incident escalated to L3 Support.');",
    "condition": "current.active == true && current.priority == 1",
    "form_button": true,
    "active": true
  }
}
```

---

### Example 118: Create a Scheduled Job

**Use Case:** Schedule a nightly cleanup job to archive old closed incidents.

**Tool Call:**
```json
{
  "tool": "create_scheduled_job",
  "arguments": {
    "name": "Archive Closed Incidents (90d+)",
    "script": "var gr = new GlideRecord('incident'); gr.addQuery('active', false); gr.addQuery('closed_at', '<', gs.daysAgo(90)); gr.query(); while (gr.next()) { gr.u_archived = true; gr.update(); } gs.log('Archived ' + gr.getRowCount() + ' closed incidents.');",
    "run_type": "daily",
    "run_time": "03:00:00",
    "active": true
  }
}
```

---

### Example 119: Create an ACL Rule

**Use Case:** Restrict delete access on the change_request table to admin users only.

**Tool Call:**
```json
{
  "tool": "create_acl",
  "arguments": {
    "name": "change_request.*",
    "type": "record",
    "operation": "delete",
    "admin_overrides": true,
    "script": "answer = gs.hasRole('admin');",
    "description": "Only admins can delete change requests",
    "active": true
  }
}
```


---

## Scoped Application Examples

### Example 120: List All Scoped Applications

**Use Case:** Discover all custom scoped applications installed in the instance.

**Tool Call:**
```json
{
  "tool": "list_scoped_apps",
  "arguments": {
    "active": true,
    "limit": 25
  }
}
```

**Expected Output:**
```json
{
  "count": 4,
  "records": [
    { "sys_id": "a1b2c3…", "name": "IT Operations Dashboard", "scope": "x_myco_itops", "version": "1.2.0", "active": "true" },
    { "sys_id": "d4e5f6…", "name": "HR Self-Service", "scope": "x_myco_hrss", "version": "2.0.1", "active": "true" }
  ]
}
```

---

### Example 121: Get Scoped App Details

**Use Case:** Inspect the configuration of a specific scoped app by scope name.

**Tool Call:**
```json
{
  "tool": "get_scoped_app",
  "arguments": {
    "id": "x_myco_itops"
  }
}
```

---

### Example 122: Create a Scoped Application

**Use Case:** Bootstrap a new scoped application for a custom asset tracking solution.

**Tool Call:**
```json
{
  "tool": "create_scoped_app",
  "arguments": {
    "name": "Custom Asset Tracker",
    "scope": "x_myco_assettrk",
    "version": "1.0.0",
    "short_description": "Tracks custom hardware assets beyond default ITAM coverage",
    "vendor": "My Company",
    "active": true
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "abc123def456…",
  "summary": "Created scoped app \"Custom Asset Tracker\" with scope \"x_myco_assettrk\""
}
```

---

### Example 123: Update a Scoped Application

**Use Case:** Bump the version number of a scoped app after a release.

**Tool Call:**
```json
{
  "tool": "update_scoped_app",
  "arguments": {
    "sys_id": "abc123def456…",
    "fields": {
      "version": "1.1.0",
      "short_description": "Tracks custom hardware assets — now with lifecycle reporting"
    }
  }
}
```

---

## Report & Dashboard Creation Examples

### Example 124: Create a Bar Chart Report

**Use Case:** Create a report showing incident counts grouped by priority.

**Tool Call:**
```json
{
  "tool": "create_report",
  "arguments": {
    "title": "Incidents by Priority",
    "table": "incident",
    "type": "bar",
    "field": "priority",
    "aggregate": "COUNT",
    "query": "active=true"
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "rpt001abc…",
  "summary": "Created report \"Incidents by Priority\" (bar) on table \"incident\""
}
```

---

### Example 125: Create a Trend Report

**Use Case:** Create a line chart report to track monthly change request volumes.

**Tool Call:**
```json
{
  "tool": "create_report",
  "arguments": {
    "title": "Monthly Change Request Trend",
    "table": "change_request",
    "type": "line",
    "field": "opened_at",
    "aggregate": "COUNT"
  }
}
```

---

### Example 126: Update an Existing Report

**Use Case:** Add a query filter to an existing report to exclude resolved incidents.

**Tool Call:**
```json
{
  "tool": "update_report",
  "arguments": {
    "sys_id": "rpt001abc…",
    "fields": {
      "filter_fields": "active=true^state!=6",
      "title": "Open Incidents by Priority"
    }
  }
}
```

---

### Example 127: Create a Performance Analytics Dashboard

**Use Case:** Create a new PA dashboard for the ITSM team with role-based visibility.

**Tool Call:**
```json
{
  "tool": "create_dashboard",
  "arguments": {
    "name": "ITSM Operations Dashboard",
    "description": "Key ITSM KPIs for the operations team",
    "roles": "itil,itil_admin",
    "active": true
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "dash001abc…",
  "summary": "Created dashboard \"ITSM Operations Dashboard\""
}
```

---

### Example 128: Update a Dashboard

**Use Case:** Rename a dashboard and open it up to all roles.

**Tool Call:**
```json
{
  "tool": "update_dashboard",
  "arguments": {
    "sys_id": "dash001abc…",
    "fields": {
      "name": "All-Staff Operations Overview",
      "roles": ""
    }
  }
}
```

---

## Catalog Item & Approval Rule Examples

### Example 129: Create a Catalog Item

**Use Case:** Add a new "Request a Laptop" catalog item to the IT hardware category.

**Tool Call:**
```json
{
  "tool": "create_catalog_item",
  "arguments": {
    "name": "Request a Laptop",
    "short_description": "Request a standard or developer laptop for a new or existing employee",
    "description": "<p>Use this form to request a laptop. Standard laptops ship within 3 business days. Developer laptops may take up to 5 business days.</p>",
    "category": "hardware_category_sys_id",
    "price": "0",
    "delivery_time": "3 00:00:00",
    "active": true
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "cat001abc…",
  "summary": "Created catalog item \"Request a Laptop\""
}
```

---

### Example 130: Update a Catalog Item

**Use Case:** Update the price and delivery time of an existing catalog item.

**Tool Call:**
```json
{
  "tool": "update_catalog_item",
  "arguments": {
    "sys_id": "cat001abc…",
    "fields": {
      "price": "0",
      "delivery_time": "2 00:00:00",
      "short_description": "Request a standard or developer laptop — now delivered in 2 days"
    }
  }
}
```

---

### Example 131: Create an Approval Rule

**Use Case:** Automatically route all new catalog requests (`sc_request`) to the IT Manager group for approval.

**Tool Call:**
```json
{
  "tool": "create_approval_rule",
  "arguments": {
    "name": "IT Manager Approval for All Requests",
    "table": "sc_request",
    "approver_type": "group",
    "approver": "it_manager_group_sys_id",
    "active": true,
    "order": 100
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "apr001abc…",
  "summary": "Created approval rule \"IT Manager Approval for All Requests\" for table \"sc_request\" with group approver"
}
```

---

### Example 132: Create a Conditional Approval Rule

**Use Case:** Require VP approval only for high-cost catalog requests (price > $500).

**Tool Call:**
```json
{
  "tool": "create_approval_rule",
  "arguments": {
    "name": "VP Approval for High-Cost Requests",
    "table": "sc_request",
    "approver_type": "user",
    "approver": "vp_user_sys_id",
    "condition": "price>500",
    "order": 200,
    "active": true
  }
}
```

---

### Example 133: Create a Portal for a New Department

**Use Case:** Set up a dedicated Service Portal for the HR department.

**Tool Call:**
```json
{
  "tool": "create_portal",
  "arguments": {
    "title": "HR Self-Service Portal",
    "url_suffix": "hrss",
    "description": "Employee self-service portal for HR requests and information"
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "por001abc…",
  "summary": "Created portal \"HR Self-Service Portal\" at /hrss"
}
```

---

### Example 134: Create a Portal Page

**Use Case:** Add an "Employee Onboarding" page to the HR Self-Service Portal.

**Tool Call:**
```json
{
  "tool": "create_portal_page",
  "arguments": {
    "title": "Employee Onboarding",
    "id": "onboarding",
    "portal_sys_id": "por001abc…",
    "description": "Guides new employees through required onboarding tasks"
  }
}
```

**Expected Output:**
```json
{
  "sys_id": "pg001abc…",
  "summary": "Created portal page \"Employee Onboarding\" (id: onboarding)"
}
```
