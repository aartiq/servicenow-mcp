# Tool Reference — NowAIKit v2.6.0 (Latest Release)

Complete reference for all 400+ tools across all ServiceNow modules. All tools accept a `table` parameter override where applicable.

## Permission Tiers

| Tier | Requirement | Applies To |
|------|-------------|------------|
| Read | None (default) | All query/get/list tools |
| Write | `WRITE_ENABLED=true` | create_record, update_record, delete_record, resolve, order, approve |
| CMDB Write | `WRITE_ENABLED=true` + `CMDB_WRITE_ENABLED=true` | CI create/update/relate |
| Scripting | `WRITE_ENABLED=true` + `SCRIPTING_ENABLED=true` | Business rules, script includes, changesets |
| Now Assist | `NOW_ASSIST_ENABLED=true` | AI summaries, NLQ, agentic playbooks |
| ATF | `ATF_ENABLED=true` | Run test suites and individual tests |

---

## Core & CMDB (19 tools)

### query_records
Query records from any ServiceNow table with filtering, sorting and pagination.

**Parameters**:
- `table` (required) — Table name (e.g. `incident`, `sys_user`)
- `query` — Encoded query string (e.g. `state=1^priority=1`)
- `fields` — Comma-separated list of fields to return
- `limit` — Max records to return (default: 100)
- `offset` — Pagination offset

### get_record
Retrieve a single record by sys_id.

**Parameters**:
- `table` (required) — Table name
- `sys_id` (required) — Record sys_id

### create_record
Create a new record in any ServiceNow table. Requires `WRITE_ENABLED=true`.

**Parameters**:
- `table` (required) — Table name (e.g. `incident`, `sys_user_preference`)
- `fields` (required) — Key-value pairs for the new record fields

### update_record
Update an existing record in any ServiceNow table. Requires `WRITE_ENABLED=true`.

**Parameters**:
- `table` (required) — Table name
- `sys_id` (required) — 32-character system ID of the record
- `fields` (required) — Key-value pairs of fields to update

### delete_record
Delete a record from any ServiceNow table. Requires `WRITE_ENABLED=true`.

**Parameters**:
- `table` (required) — Table name
- `sys_id` (required) — 32-character system ID of the record

### get_table_schema
Get field definitions and metadata for a table.

**Parameters**:
- `table` (required) — Table name

### get_user
Look up a ServiceNow user by username, email, or sys_id.

**Parameters**:
- `identifier` (required) — Username, email, or sys_id

### get_group
Look up a ServiceNow group by name or sys_id.

**Parameters**:
- `identifier` (required) — Group name or sys_id

### search_cmdb_ci
Search CMDB configuration items by name or class.

**Parameters**:
- `query` (required) — CI name or search query
- `ci_class` — Filter by CI class (e.g. `cmdb_ci_server`)
- `limit` — Max records (default: 25)

### get_cmdb_ci
Get full details of a CMDB configuration item.

**Parameters**:
- `sys_id` (required) — CI sys_id

### list_relationships
List relationships for a CMDB CI.

**Parameters**:
- `ci_sys_id` (required) — CI sys_id
- `relationship_type` — Filter by relationship type

### list_discovery_schedules
List active Discovery schedules and their status.

**Parameters**:
- `active` — Filter by active status (default: true)
- `limit` — Max records

### list_mid_servers
List MID server status and version information.

**Parameters**:
- `status` — Filter by status (`up`, `down`)

### list_active_events
List active Event Management events and alerts.

**Parameters**:
- `severity` — Filter by severity level
- `limit` — Max records

### cmdb_health_dashboard
Get CMDB health metrics and stale CI counts.

**Parameters**: None

### service_mapping_summary
Get Service Mapping application service summaries.

**Parameters**:
- `limit` — Max services to return

### create_change_request
Create a new change request record. **[Write]**

**Parameters**:
- `short_description` (required)
- `description`
- `type` — `normal`, `standard`, `emergency`
- `assignment_group`
- `risk` — `1` (High) to `4` (Low)

### natural_language_search
Search records using a plain English question.

**Parameters**:
- `query` (required) — Natural language question

### natural_language_update
Update a record using natural language instructions. **[Write]**

**Parameters**:
- `table` (required)
- `sys_id` (required)
- `instruction` (required) — Plain English update instruction

---

## Incident Management (7 tools)

### create_incident
Create a new incident. **[Write]**

**Parameters**:
- `short_description` (required)
- `urgency` — `1` (High), `2` (Medium), `3` (Low)
- `impact` — `1`, `2`, `3`
- `description`
- `assignment_group`
- `caller_id`

### get_incident
Get incident details by number or sys_id.

**Parameters**:
- `identifier` (required) — Incident number (INC0001234) or sys_id

### update_incident
Update an existing incident. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required) — Object with fields to update

### resolve_incident
Resolve an incident with resolution code and notes. **[Write]**

**Parameters**:
- `sys_id` (required)
- `close_code` (required) — Resolution code
- `close_notes` (required) — Resolution notes

### close_incident
Close a resolved incident. **[Write]**

**Parameters**:
- `sys_id` (required)

### add_work_note
Add a work note (internal) to any task record. **[Write]**

**Parameters**:
- `table` (required) — e.g. `incident`
- `sys_id` (required)
- `note` (required)

### add_comment
Add a customer-visible comment to a task record. **[Write]**

**Parameters**:
- `table` (required)
- `sys_id` (required)
- `comment` (required)

---

## Problem Management (4 tools)

### create_problem
Create a new problem record. **[Write]**

**Parameters**:
- `short_description` (required)
- `description`
- `assignment_group`

### get_problem
Get problem details by number or sys_id.

**Parameters**:
- `identifier` (required)

### update_problem
Update an existing problem. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### resolve_problem
Mark a problem as resolved with fix notes. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fix_notes` (required)

---

## Change Management (5 tools)

### get_change_request
Get change request details by number or sys_id.

**Parameters**:
- `identifier` (required)

### list_change_requests
List change requests with optional filters.

**Parameters**:
- `state` — Change state filter
- `type` — `normal`, `standard`, `emergency`
- `limit`

### update_change_request
Update an existing change request. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### submit_change_for_approval
Move a change request to the approval state. **[Write]**

**Parameters**:
- `sys_id` (required)

### close_change_request
Close a change request after implementation. **[Write]**

**Parameters**:
- `sys_id` (required)
- `close_code`
- `close_notes`

---

## Task Management (4 tools)

### get_task
Get task details by number or sys_id.

**Parameters**:
- `identifier` (required)

### list_my_tasks
List tasks assigned to the current user.

**Parameters**:
- `state` — Filter by state
- `limit`

### update_task
Update a task record. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### complete_task
Mark a task as complete. **[Write]**

**Parameters**:
- `sys_id` (required)
- `close_notes`

---

## Knowledge Base (6 tools)

### list_knowledge_bases
List available knowledge bases.

**Parameters**:
- `active` — Filter by active (default: true)

### search_knowledge
Search knowledge articles across all bases.

**Parameters**:
- `query` (required) — Search text
- `kb_sys_id` — Limit to specific knowledge base
- `limit`

### get_knowledge_article
Get full knowledge article content.

**Parameters**:
- `sys_id` (required)

### create_knowledge_article
Create a new knowledge article. **[Write]**

**Parameters**:
- `short_description` (required) — Article title
- `text` (required) — Article body (HTML)
- `kb_knowledge_base` — Knowledge base sys_id
- `category`

### update_knowledge_article
Update an existing knowledge article. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### publish_knowledge_article
Publish a draft knowledge article. **[Write]**

**Parameters**:
- `sys_id` (required)

---

## Service Catalog, Approvals & SLA (10 tools)

### list_catalog_items
List service catalog items.

**Parameters**:
- `category` — Filter by category
- `limit`

### search_catalog
Search for catalog items by name or description.

**Parameters**:
- `query` (required)
- `limit`

### get_catalog_item
Get full details of a catalog item including variables.

**Parameters**:
- `sys_id` (required)

### order_catalog_item
Place an order for a catalog item. **[Write]**

**Parameters**:
- `sys_id` (required) — Catalog item sys_id
- `quantity` — Default: 1
- `variables` — Key/value pairs for item variables

### get_my_approvals
List pending approval requests for the current user.

**Parameters**:
- `limit`

### list_approvals
List all approval requests with optional filters.

**Parameters**:
- `state` — `requested`, `approved`, `rejected`
- `limit`

### approve_request
Approve a pending approval request. **[Write]**

**Parameters**:
- `sys_id` (required) — Approval record sys_id
- `comments`

### reject_request
Reject a pending approval request. **[Write]**

**Parameters**:
- `sys_id` (required)
- `comments`

### get_sla_details
Get SLA information for a task record.

**Parameters**:
- `task_sys_id` (required)

### list_active_slas
List active SLA records approaching breach.

**Parameters**:
- `table` — Task table (default: `incident`)
- `limit`

---

## User & Group Management (8 tools)

### list_users
List ServiceNow users with optional filters.

**Parameters**:
- `query` — Encoded query
- `active` — Filter by active (default: true)
- `limit`

### create_user
Create a new user. **[Write]**

**Parameters**:
- `user_name` (required)
- `first_name`, `last_name`, `email`, `title`, `department`

### update_user
Update user record fields. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_groups
List user groups.

**Parameters**:
- `query`
- `limit`

### create_group
Create a new user group. **[Write]**

**Parameters**:
- `name` (required)
- `description`
- `manager`

### update_group
Update a user group. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### add_user_to_group
Add a user to a group. **[Write]**

**Parameters**:
- `user_sys_id` (required)
- `group_sys_id` (required)

### remove_user_from_group
Remove a user from a group. **[Write]**

**Parameters**:
- `user_sys_id` (required)
- `group_sys_id` (required)

---

## Reporting & Analytics (13 tools)

### list_reports
List saved reports in ServiceNow.

**Parameters**:
- `query` — Filter by name or category
- `limit`

### get_report
Get a report definition by sys_id or name.

**Parameters**:
- `identifier` (required)

### run_aggregate_query
Run an aggregate (GROUP BY + COUNT/SUM) query.

**Parameters**:
- `table` (required)
- `group_by` (required) — Field to group by
- `query` — Filter query
- `aggregate` — `COUNT`, `SUM`, `AVG` (default: `COUNT`)

### trend_query
Query record counts over time periods (monthly buckets).

**Parameters**:
- `table` (required)
- `date_field` (required) — Date field to bucket by
- `group_by` — Secondary grouping field
- `query` — Base filter
- `periods` — Number of months to include (default: 6)

### get_performance_analytics
Get Performance Analytics widget data (ServiceNow PA API).

**Parameters**:
- `widget_sys_id` (required) — PA widget sys_id
- `time_range` — e.g. `last_30_days`

### export_report_data
Export records as structured data for a given query.

**Parameters**:
- `table` (required)
- `query`
- `fields` — Comma-separated list
- `format` — `json` (default)

### get_sys_log
Retrieve system log entries.

**Parameters**:
- `level` — `error`, `warning`, `info`
- `source`
- `limit`

### list_scheduled_jobs
List scheduled jobs (sys_trigger records).

**Parameters**:
- `active` — Filter by active
- `limit`

### get_scheduled_job
Get details of a specific scheduled job. **[Read]**

**Parameters**:
- `sys_id` (required)

### create_scheduled_job
Create a new scheduled script job. **[Write]**

**Parameters**:
- `name` (required)
- `script` (required) — JavaScript to execute
- `run_type` — `daily`, `weekly`, `monthly`, `periodically`, `once`
- `run_time` — Time to run (HH:MM:SS)
- `active`

### update_scheduled_job
Update a scheduled job's script or schedule. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### trigger_scheduled_job
Trigger a scheduled job to run immediately. **[Write]**

**Parameters**:
- `sys_id` (required) — Scheduled job sys_id

### list_job_run_history
List execution history for a scheduled job.

**Parameters**:
- `job_sys_id` — Filter by job sys_id
- `limit`

---

## ATF Testing (9 tools) — Requires `ATF_ENABLED=true`

### list_atf_suites
List Automated Test Framework test suites.

**Parameters**:
- `active` — Filter by active
- `query`
- `limit`

### get_atf_suite
Get ATF test suite details.

**Parameters**:
- `identifier` (required) — sys_id or name

### run_atf_suite
Execute a test suite and return the result sys_id. **[ATF_ENABLED]**

**Parameters**:
- `sys_id` (required) — Suite sys_id

### list_atf_tests
List ATF test cases.

**Parameters**:
- `suite_sys_id` — Filter by suite
- `active`
- `limit`

### get_atf_test
Get ATF test case details.

**Parameters**:
- `sys_id` (required)

### run_atf_test
Execute a single ATF test. **[ATF_ENABLED]**

**Parameters**:
- `sys_id` (required)

### get_atf_suite_result
Get results of an ATF suite run.

**Parameters**:
- `result_sys_id` (required)

### list_atf_test_results
List individual test results within a suite run.

**Parameters**:
- `suite_result_sys_id`
- `limit`

### get_atf_failure_insight
**Latest release**: Get Failure Insight report showing metadata changes between the last successful and failed run — surfaces role changes and field value changes that caused test failures.

**Parameters**:
- `result_sys_id` (required)

---

## Now Assist / AI (10 tools) — Requires `NOW_ASSIST_ENABLED=true`

### nlq_query
Send a natural language question and get structured query results.

**Parameters**:
- `question` (required) — Plain English question
- `table` — Scope to a specific table

### ai_search
Semantic AI search across knowledge, catalog, and records (ServiceNow AI Search API).

**Parameters**:
- `query` (required)
- `sources` — Array: `kb`, `catalog`, `incident`, etc.
- `limit`

### generate_summary
Generate an AI summary of any record using Now Assist. **[NOW_ASSIST_ENABLED]**

**Parameters**:
- `table` (required)
- `sys_id` (required)

### suggest_resolution
Get AI-powered resolution suggestions based on similar past incidents. **[NOW_ASSIST_ENABLED]**

**Parameters**:
- `incident_sys_id` (required)

### categorize_incident
Predict incident category, assignment group, and priority using Predictive Intelligence. **[NOW_ASSIST_ENABLED]**

**Parameters**:
- `short_description` (required)
- `description`

### get_pi_models
List available Predictive Intelligence models.

**Parameters**: None

### get_virtual_agent_topics
List Virtual Agent topics.

**Parameters**:
- `active`
- `category`
- `limit`

### trigger_agentic_playbook
**Latest release**: Invoke a Now Assist Agentic Playbook. **[NOW_ASSIST_ENABLED]**

**Parameters**:
- `playbook_sys_id` (required)
- `context` — Key/value context object

### get_ms_copilot_topics
**Latest release**: List topics exposed to Microsoft Copilot 365.

**Parameters**: None

### generate_work_notes
Generate AI-drafted work notes for a record based on its current context. **[NOW_ASSIST_ENABLED]**

**Parameters**:
- `table` (required) — Table name
- `sys_id` (required) — Record sys_id
- `context` — Additional context to include in the draft

---

## Scripting (27 tools) — Requires `SCRIPTING_ENABLED=true`

All scripting tools require `WRITE_ENABLED=true` + `SCRIPTING_ENABLED=true`.

### list_business_rules
List business rule definitions.

**Parameters**:
- `table` — Filter by target table
- `active`
- `limit`

### get_business_rule
Get full business rule record including script body.

**Parameters**:
- `sys_id` (required)

### create_business_rule
Create a new business rule. **[Scripting]**

**Parameters**:
- `name` (required)
- `table` (required)
- `when` (required) — `before`, `after`, `async`, `display`
- `script` (required)
- `condition`
- `active`

### update_business_rule
Update a business rule. **[Scripting]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_script_includes
List script includes.

**Parameters**:
- `query`
- `active`
- `limit`

### get_script_include
Get full script include record with script body.

**Parameters**:
- `identifier` (required) — sys_id or API name

### create_script_include
Create a new script include. **[Scripting]**

**Parameters**:
- `name` (required)
- `script` (required)
- `api_name`
- `access` — `public` or `package_private`

### update_script_include
Update a script include. **[Scripting]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_client_scripts
List client scripts.

**Parameters**:
- `table`
- `type` — `onLoad`, `onChange`, `onSubmit`, `onCellEdit`
- `active`
- `limit`

### get_client_script
Get client script details and body.

**Parameters**:
- `sys_id` (required)

### create_client_script
Create a new client script. **[Scripting]**

**Parameters**:
- `name` (required)
- `table` (required)
- `type` (required)
- `script` (required)
- `condition`

### update_client_script
Update a client script. **[Scripting]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_changesets
List update sets (changesets).

**Parameters**:
- `state` — `in progress`, `complete`, `ignore`
- `limit`

### get_changeset
Get changeset details.

**Parameters**:
- `identifier` (required) — sys_id or name

### commit_changeset
Commit a changeset. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### publish_changeset
Publish a changeset to the target instance. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### list_ui_policies
List UI policies. **[Scripting]**

**Parameters**:
- `table` — Filter by target table
- `active`
- `limit`

### get_ui_policy
Get UI policy details and actions. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### create_ui_policy
Create a new UI policy. **[Scripting]**

**Parameters**:
- `short_description` (required)
- `table` (required)
- `conditions` — JSON condition string
- `active`

### list_ui_actions
List UI actions (buttons, context menu items). **[Scripting]**

**Parameters**:
- `table` — Filter by target table
- `active`
- `limit`

### get_ui_action
Get UI action details and script. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### create_ui_action
Create a new UI action. **[Scripting]**

**Parameters**:
- `name` (required)
- `table` (required)
- `script` (required)
- `action_name`
- `active`

### update_ui_action
Update a UI action script or properties. **[Scripting]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_acls
List Access Control List rules. **[Scripting]**

**Parameters**:
- `table` — Filter by target table
- `operation` — `read`, `write`, `create`, `delete`
- `active`
- `limit`

### get_acl
Get ACL rule details and condition scripts. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### create_acl
Create a new ACL rule. **[Scripting]**

**Parameters**:
- `name` (required) — `table.operation` format (e.g. `incident.write`)
- `operation` (required) — `read`, `write`, `create`, `delete`
- `active`
- `condition` — Condition script
- `script` — Advanced condition script

### update_acl
Update an existing ACL rule. **[Scripting]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

---

## Agile / Scrum (9 tools)

Table names use the `AGILE_TABLE_PREFIX` env var (default: `rm_`).

### create_story
Create an agile user story. **[Write]**

**Parameters**:
- `short_description` (required)
- `description`
- `story_points`
- `sprint`
- `epic`

### update_story
Update a user story. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_stories
List user stories with optional filters.

**Parameters**:
- `sprint`
- `epic`
- `state`
- `limit`

### create_epic
Create an epic. **[Write]**

**Parameters**:
- `short_description` (required)
- `description`

### update_epic
Update an epic. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_epics
List epics.

**Parameters**:
- `state`
- `limit`

### create_scrum_task
Create a scrum task. **[Write]**

**Parameters**:
- `short_description` (required)
- `story_sys_id`
- `assigned_to`
- `hours_remaining`

### update_scrum_task
Update a scrum task. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_scrum_tasks
List scrum tasks.

**Parameters**:
- `story_sys_id`
- `assigned_to`
- `limit`

---

## HR Service Delivery (12 tools)

### create_hr_case
Create a new HR case. **[Write]**

**Parameters**:
- `short_description` (required)
- `hr_service` — HR service sys_id
- `opened_for` — Subject person sys_id
- `description`

### get_hr_case
Get HR case details by number or sys_id.

**Parameters**:
- `identifier` (required)

### update_hr_case
Update an HR case. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_hr_cases
List HR cases with optional filters.

**Parameters**:
- `state` — Case state filter
- `hr_service`
- `limit`

### close_hr_case
Close an HR case. **[Write]**

**Parameters**:
- `sys_id` (required)
- `close_notes`

### list_hr_services
List available HR services.

**Parameters**:
- `active` — Filter by active (default: true)
- `limit`

### get_hr_service
Get HR service details.

**Parameters**:
- `sys_id` (required)

### get_hr_profile
Get HR profile for a user.

**Parameters**:
- `user_sys_id` (required)

### update_hr_profile
Update an HR profile record. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_hr_tasks
List HR tasks associated with a case.

**Parameters**:
- `case_sys_id` — Filter by parent case
- `limit`

### create_hr_task
Create an HR task. **[Write]**

**Parameters**:
- `short_description` (required)
- `case_sys_id` — Parent HR case
- `assigned_to`

### get_hr_case_activity
Get the activity log for an HR case.

**Parameters**:
- `case_sys_id` (required)

---

## Customer Service Management (11 tools)

### create_csm_case
Create a new CSM case. **[Write]**

**Parameters**:
- `short_description` (required)
- `account` — Account sys_id
- `contact` — Contact sys_id
- `description`
- `priority`

### get_csm_case
Get CSM case details by number or sys_id.

**Parameters**:
- `identifier` (required)

### update_csm_case
Update a CSM case. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_csm_cases
List CSM cases with optional filters.

**Parameters**:
- `account` — Filter by account
- `state`
- `limit`

### close_csm_case
Close a CSM case. **[Write]**

**Parameters**:
- `sys_id` (required)
- `close_notes`

### get_csm_account
Get CSM account details.

**Parameters**:
- `sys_id` (required)

### list_csm_accounts
List CSM accounts.

**Parameters**:
- `query`
- `limit`

### get_csm_contact
Get CSM contact details.

**Parameters**:
- `sys_id` (required)

### list_csm_contacts
List CSM contacts.

**Parameters**:
- `account_sys_id` — Filter by account
- `limit`

### get_csm_case_sla
Get SLA details for a CSM case.

**Parameters**:
- `case_sys_id` (required)

### list_csm_products
List products associated with CSM cases.

**Parameters**:
- `limit`

---

## Security Operations & GRC (11 tools)

### create_security_incident
Create a security incident. **[Write]**

**Parameters**:
- `short_description` (required)
- `severity` — `1` (Critical) to `4` (Low)
- `category`
- `description`

### get_security_incident
Get security incident details.

**Parameters**:
- `identifier` (required)

### update_security_incident
Update a security incident. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_security_incidents
List security incidents.

**Parameters**:
- `state`
- `severity`
- `limit`

### list_vulnerabilities
List vulnerability entries.

**Parameters**:
- `state` — `open`, `in_progress`, `resolved`
- `risk_rating`
- `limit`

### get_vulnerability
Get vulnerability details.

**Parameters**:
- `sys_id` (required)

### update_vulnerability
Update a vulnerability record. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_grc_risks
List GRC risk records.

**Parameters**:
- `state`
- `limit`

### get_grc_risk
Get GRC risk details.

**Parameters**:
- `sys_id` (required)

### list_grc_controls
List GRC control records.

**Parameters**:
- `risk_sys_id` — Filter by related risk
- `limit`

### get_threat_intelligence
Get threat intelligence entries from the ServiceNow threat feed.

**Parameters**:
- `type` — Indicator type (e.g. `IP`, `URL`)
- `limit`

---

## Flow Designer & Process Automation (10 tools)

### list_flows
List Flow Designer flows.

**Parameters**:
- `active`
- `category`
- `limit`

### get_flow
Get flow details and trigger configuration.

**Parameters**:
- `sys_id` (required)

### trigger_flow
Trigger a flow execution. **[Write]**

**Parameters**:
- `sys_id` (required) — Flow sys_id
- `inputs` — Key/value input object

### get_flow_execution
Get the status and results of a flow execution.

**Parameters**:
- `execution_id` (required)

### list_flow_executions
List flow execution history.

**Parameters**:
- `flow_sys_id` — Filter by flow
- `status` — `running`, `completed`, `failed`
- `limit`

### list_subflows
List subflows.

**Parameters**:
- `active`
- `limit`

### get_subflow
Get subflow details.

**Parameters**:
- `sys_id` (required)

### list_action_instances
List action instances in a flow execution.

**Parameters**:
- `execution_id` (required)

### get_process_automation
Get a Process Automation Designer process.

**Parameters**:
- `sys_id` (required)

### list_process_automations
List Process Automation Designer processes.

**Parameters**:
- `active`
- `limit`

---

## Service Portal & UI Builder (14 tools)

### list_portals
List Service Portal configurations.

**Parameters**:
- `active` — Filter by active (default: true)
- `limit`

### get_portal
Get portal configuration and settings.

**Parameters**:
- `sys_id` (required)

### list_portal_pages
List pages in a Service Portal.

**Parameters**:
- `portal_sys_id` — Filter by portal
- `limit`

### get_portal_page
Get portal page details and layout.

**Parameters**:
- `sys_id` (required)

### list_portal_widgets
List Service Portal widgets.

**Parameters**:
- `query`
- `limit`

### get_portal_widget
Get widget template, CSS, client/server scripts.

**Parameters**:
- `sys_id` (required)

### create_portal_widget
Create a new Service Portal widget. **[Write]**

**Parameters**:
- `name` (required)
- `id` (required) — Widget ID (unique slug)
- `template` — HTML template
- `client_script` — Angular client controller script
- `server_script` — Server-side data script
- `css` — Widget CSS

### update_portal_widget
Update an existing widget's code. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_widget_instances
List widget instances placed on portal pages.

**Parameters**:
- `widget_sys_id` — Filter by widget
- `page_sys_id` — Filter by page
- `limit`

### list_ux_apps
List Next Experience (UI Builder) app configurations.

**Parameters**:
- `active`
- `limit`

### get_ux_app
Get UX app details and routing.

**Parameters**:
- `sys_id` (required)

### list_ux_pages
List pages in a Next Experience app.

**Parameters**:
- `app_sys_id` — Filter by UX app
- `limit`

### list_portal_themes
List Service Portal themes.

**Parameters**:
- `limit`

### get_portal_theme
Get portal theme CSS variables and settings.

**Parameters**:
- `sys_id` (required)

---

## Integration & Middleware (19 tools)

### list_rest_messages
List REST Message configurations.

**Parameters**:
- `query`
- `limit`

### get_rest_message
Get REST Message details, headers, and authentication.

**Parameters**:
- `sys_id` (required)

### list_rest_message_functions
List HTTP methods (functions) for a REST Message.

**Parameters**:
- `rest_message_sys_id` (required)

### create_rest_message
Create a new REST Message configuration. **[Write]**

**Parameters**:
- `name` (required)
- `rest_endpoint` (required) — Base URL
- `description`

### list_transform_maps
List Transform Maps.

**Parameters**:
- `query`
- `limit`

### get_transform_map
Get Transform Map details and field mappings.

**Parameters**:
- `sys_id` (required)

### run_transform_map
Execute a Transform Map on an import set. **[Write]**

**Parameters**:
- `transform_map_sys_id` (required)
- `import_set_sys_id` (required)

### list_transform_field_maps
List field mappings for a Transform Map.

**Parameters**:
- `transform_map_sys_id` (required)

### list_import_sets
List import set records.

**Parameters**:
- `query`
- `limit`

### get_import_set
Get import set details and processing status.

**Parameters**:
- `sys_id` (required)

### create_import_set_row
Create a row in a staging import set table. **[Write]**

**Parameters**:
- `staging_table` (required) — Import set staging table name
- `data` (required) — Key/value field data

### list_data_sources
List configured data sources for imports.

**Parameters**:
- `limit`

### list_event_registry
List registered events in the event registry.

**Parameters**:
- `query`
- `limit`

### get_event_registry_entry
Get event registry entry details.

**Parameters**:
- `sys_id` (required)

### register_event
Register a new event in the event registry. **[Scripting]**

**Parameters**:
- `name` (required) — Fully qualified event name (e.g. `myapp.record.created`)
- `table` (required) — Target table
- `description`

### fire_event
Fire a ServiceNow event. **[Write]**

**Parameters**:
- `name` (required) — Event name
- `table` (required)
- `sys_id` (required) — Record sys_id
- `param1` — Optional first parameter
- `param2` — Optional second parameter

### list_event_log
List recent event log entries.

**Parameters**:
- `name` — Filter by event name
- `limit`

### list_oauth_applications
List OAuth provider applications.

**Parameters**:
- `limit`

### list_credential_aliases
List credential alias configurations.

**Parameters**:
- `limit`

---

## Notifications & Attachments (12 tools)

### list_notifications
List email notification configurations.

**Parameters**:
- `table` — Filter by target table
- `active`
- `limit`

### get_notification
Get notification details, subject, and message body.

**Parameters**:
- `sys_id` (required)

### create_notification
Create a new email notification. **[Write]**

**Parameters**:
- `name` (required)
- `table` (required)
- `subject` (required)
- `message_html` — HTML email body
- `active`

### update_notification
Update an existing notification. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### list_email_logs
List email delivery log entries.

**Parameters**:
- `state` — `sent`, `failed`, `skipped`
- `limit`

### get_email_log
Get email log entry details.

**Parameters**:
- `sys_id` (required)

### list_attachments
List attachments for a record.

**Parameters**:
- `table` (required)
- `record_sys_id` (required)

### get_attachment_metadata
Get attachment metadata (name, size, content type).

**Parameters**:
- `sys_id` (required)

### delete_attachment
Delete an attachment by sys_id. **[Write]**

**Parameters**:
- `sys_id` (required)

### upload_attachment
Upload a file attachment to a record. **[Write]**

**Parameters**:
- `table` (required)
- `record_sys_id` (required)
- `file_name` (required)
- `content_type` (required) — MIME type (e.g. `application/pdf`)
- `content_base64` (required) — Base64-encoded file content

### list_email_templates
List email notification templates.

**Parameters**:
- `query`
- `limit`

### list_notification_subscriptions
List notification subscription records.

**Parameters**:
- `user_sys_id` — Filter by user
- `limit`

---

## Performance Analytics & Data Quality (13 tools)

### list_pa_indicators
List Performance Analytics indicators.

**Parameters**:
- `active` — Filter by active (default: true)
- `limit`

### get_pa_indicator
Get PA indicator details and definition.

**Parameters**:
- `sys_id` (required)

### get_pa_scorecard
Get current PA scorecard scores for an indicator.

**Parameters**:
- `indicator_sys_id` (required)
- `limit`

### get_pa_time_series
Get time-series data for a PA indicator.

**Parameters**:
- `indicator_sys_id` (required)
- `periods` — Number of periods (default: 12)

### list_pa_breakdowns
List PA breakdown definitions for an indicator.

**Parameters**:
- `indicator_sys_id` (required)

### list_pa_dashboards
List Performance Analytics dashboards.

**Parameters**:
- `limit`

### get_pa_dashboard
Get PA dashboard details and widget layout.

**Parameters**:
- `sys_id` (required)

### list_homepages
List ServiceNow homepage layouts.

**Parameters**:
- `limit`

### list_pa_jobs
List Performance Analytics collection jobs.

**Parameters**:
- `active`
- `limit`

### get_pa_job
Get PA job details and run schedule.

**Parameters**:
- `sys_id` (required)

### check_table_completeness
Check field completeness for a table (samples up to 500 records and computes per-field fill rate).

**Parameters**:
- `table` (required)
- `fields` — Comma-separated fields to check (default: all)
- `query` — Optional filter query

### get_table_record_count
Get the total record count for a table.

**Parameters**:
- `table` (required)
- `query` — Optional filter

### compare_record_counts
Compare record counts across two tables or two filtered views.

**Parameters**:
- `table1` (required)
- `table2` (required)
- `query1` — Optional filter for table1
- `query2` — Optional filter for table2

---

## System Properties (12 tools)

### get_system_property
Get a single system property value by name.

**Parameters**:
- `name` (required) — Property name (e.g. `glide.system.name`)

### set_system_property
Create or update a system property value. **[Write]**

**Parameters**:
- `name` (required)
- `value` (required)
- `description`
- `type` — `string`, `integer`, `boolean`

### list_system_properties
List system properties with optional category or name filter.

**Parameters**:
- `category`
- `name_like` — Partial name match
- `limit`

### delete_system_property
Delete a system property by name. **[Write]**

**Parameters**:
- `name` (required)

### search_system_properties
Search system properties by partial name or value.

**Parameters**:
- `query` (required) — Partial name or value
- `limit`

### bulk_get_properties
Get multiple system property values in one call.

**Parameters**:
- `names` (required) — Array of property names

### bulk_set_properties
Set multiple system property values in one call. **[Write]**

**Parameters**:
- `properties` (required) — Object mapping name → value

### export_properties
Export system properties to a JSON snapshot for backup/comparison.

**Parameters**:
- `category`
- `name_like`
- `limit`

### import_properties
Import system properties from a JSON snapshot. **[Write]**

**Parameters**:
- `properties` (required) — Array of `{name, value}` objects
- `dry_run` — Validate without saving (default false)

### validate_property
Validate a property value against its declared type without saving.

**Parameters**:
- `name` (required)
- `value` (required)

### list_property_categories
List all distinct system property categories.

**Parameters**:
- `limit`

### get_property_history
Get audit history for a system property (changes over time).

**Parameters**:
- `name` (required)
- `limit`

---

## Update Set Management (8 tools)

### get_current_update_set
Get all currently active (in-progress) Update Sets.

### list_update_sets
List Update Sets filtered by state.

**Parameters**:
- `state` — `in progress`, `complete`, `ignore`
- `query`
- `limit`

### create_update_set
Create a new Update Set and optionally switch to it. **[Scripting]**

**Parameters**:
- `name` (required)
- `description`
- `release`
- `switch_to` — Switch after creation (default true)

### switch_update_set
Switch the active Update Set context. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### complete_update_set
Mark an Update Set as complete. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### preview_update_set
Preview all changes (sys_update_xml records) contained in an Update Set.

**Parameters**:
- `sys_id` (required)
- `limit`

### export_update_set
Get the XML export summary for an Update Set. **[Scripting]**

**Parameters**:
- `sys_id` (required)

### ensure_active_update_set
Ensure an active Update Set exists; auto-creates one if none is in progress. **[Scripting]**

**Parameters**:
- `default_name` — Name for auto-created set (default: `AI Session Update Set YYYY-MM-DD`)

---

## Virtual Agent (7 tools)

### create_va_topic
Create a new Virtual Agent conversation topic. **[Write]**

**Parameters**:
- `name` (required)
- `description`
- `category` — Category sys_id
- `active` — Default true
- `fulfillment_type` — `itsm_integration`, `custom`, `web_service`

### update_va_topic
Update Virtual Agent topic properties. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required) — Fields to update

### get_va_topic
Get Virtual Agent topic details including intent and trigger phrases.

**Parameters**:
- `sys_id` (required)

### list_va_topics_full
List all Virtual Agent topics with category and status details.

**Parameters**:
- `active` — Default true
- `category` — Filter by category name
- `query`
- `limit`

### get_va_conversation
Get conversation history for a Virtual Agent session.

**Parameters**:
- `conversation_id` (required)
- `limit`

### list_va_conversations
List recent Virtual Agent conversations.

**Parameters**:
- `topic_sys_id`
- `user_sys_id`
- `limit`

### list_va_categories
List Virtual Agent topic categories.

**Parameters**:
- `limit`

---

## IT Asset Management / ITAM (8 tools)

### list_assets
List IT assets with optional type/status filter.

**Parameters**:
- `asset_class` — `hardware`, `software`, `consumable`
- `status` — `in use`, `in stock`, `retired`
- `assigned_to`
- `query`
- `limit`

### get_asset
Get full asset record details.

**Parameters**:
- `sys_id` (required)

### create_asset
Create a new asset record. **[Write]**

**Parameters**:
- `asset_tag` (required)
- `model` — Model sys_id or name
- `serial_number`
- `assigned_to`
- `location`
- `status`

### update_asset
Update asset fields. **[Write]**

**Parameters**:
- `sys_id` (required)
- `fields` (required)

### retire_asset
Mark an asset as retired (sets install_status to retired). **[Write]**

**Parameters**:
- `sys_id` (required)
- `reason`

### list_software_licenses
List software license records.

**Parameters**:
- `vendor`
- `product`
- `limit`

### get_license_compliance
Get license compliance report showing purchased vs. in-use counts.

**Parameters**:
- `license_sys_id` — Specific license; all licenses if omitted
- `limit`

### list_asset_contracts
List asset contracts (maintenance, support).

**Parameters**:
- `active` — Default true
- `limit`

---

## DevOps & Pipeline Tracking (7 tools)

### list_devops_pipelines
List DevOps pipeline configurations registered in ServiceNow.

**Parameters**:
- `active` — Default true
- `limit`

### get_devops_pipeline
Get details of a specific DevOps pipeline.

**Parameters**:
- `sys_id` (required)

### list_deployments
List recent application deployments tracked in ServiceNow.

**Parameters**:
- `pipeline_sys_id`
- `environment` — e.g. `prod`, `staging`
- `state` — `success`, `failed`, `in_progress`
- `limit`

### get_deployment
Get details and status of a specific deployment.

**Parameters**:
- `sys_id` (required)

### create_devops_change
Create a change request linked to a DevOps deployment. **[Write]**

**Parameters**:
- `short_description` (required)
- `environment` (required)
- `pipeline`
- `artifact`
- `type` — `normal`, `standard`, `emergency`
- `assigned_to`
- `assignment_group`

### track_deployment
Record a deployment event for audit and velocity tracking. **[Write]**

**Parameters**:
- `environment` (required)
- `artifact_name` (required)
- `status` (required) — `success`, `failed`, `rolled_back`
- `pipeline`
- `artifact_version`
- `notes`

### get_devops_insights
Get deployment frequency, failure rate, and lead time metrics.

**Parameters**:
- `pipeline_sys_id` — All pipelines if omitted
- `days` — Look-back window (default 30)

---

## See Also

- [TOOL_PACKAGES.md](TOOL_PACKAGES.md) — Role-based packages
- [NOW_ASSIST.md](NOW_ASSIST.md) — Now Assist integration guide
- [ATF.md](ATF.md) — ATF testing guide
- [SCRIPTING.md](SCRIPTING.md) — Scripting management guide
- [REPORTING.md](REPORTING.md) — Reporting and analytics guide
