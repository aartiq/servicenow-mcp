/**
 * Tool Router — aggregates all domain tool modules and implements the
 * MCP_TOOL_PACKAGE role-based packaging system.
 *
 * Tool packages (set via MCP_TOOL_PACKAGE env var):
 *   full (default), service_desk, change_coordinator, knowledge_author,
 *   catalog_builder, system_administrator, platform_developer, itom_engineer,
 *   agile_manager, ai_developer, portal_developer, integration_engineer
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

// Core (existing 15 tools)
import { getCoreToolDefinitions, executeCoreToolCall } from './core.js';
// ITSM
import { getIncidentToolDefinitions, executeIncidentToolCall } from './incident.js';
import { getProblemToolDefinitions, executeProblemToolCall } from './problem.js';
import { getChangeToolDefinitions, executeChangeToolCall } from './change.js';
import { getTaskToolDefinitions, executeTaskToolCall } from './task.js';
// Service Management
import { getKnowledgeToolDefinitions, executeKnowledgeToolCall } from './knowledge.js';
import { getCatalogToolDefinitions, executeCatalogToolCall } from './catalog.js';
// User / Group
import { getUserToolDefinitions, executeUserToolCall } from './user.js';
// Reporting & Analytics
import { getReportingToolDefinitions, executeReportingToolCall } from './reporting.js';
// ATF
import { getAtfToolDefinitions, executeAtfToolCall } from './atf.js';
// Now Assist / AI
import { getNowAssistToolDefinitions, executeNowAssistToolCall } from './now-assist.js';
// Scripting
import { getScriptToolDefinitions, executeScriptToolCall } from './script.js';
// Agile
import { getAgileToolDefinitions, executeAgileToolCall } from './agile.js';
// HR Service Delivery
import { getHrsdToolDefinitions, executeHrsdToolCall } from './hrsd.js';
// Customer Service Management
import { getCsmToolDefinitions, executeCsmToolCall } from './csm.js';
// Security Operations & GRC
import { getSecurityToolDefinitions, executeSecurityToolCall } from './security.js';
// Flow Designer & Process Automation
import { getFlowToolDefinitions, executeFlowToolCall } from './flow.js';
// Service Portal & UI Builder
import { getPortalToolDefinitions, executePortalToolCall } from './portal.js';
// Integration (REST Messages, Transform Maps, Events)
import { getIntegrationToolDefinitions, executeIntegrationToolCall } from './integration.js';
// Notifications, Email, Attachments
import { getNotificationToolDefinitions, executeNotificationToolCall } from './notification.js';
// Performance Analytics & Data Quality
import { getPerformanceToolDefinitions, executePerformanceToolCall } from './performance.js';
// System Properties
import { getSysPropertiesToolDefinitions, executeSysPropertiesToolCall } from './sys-properties.js';
// Update Set management
import { getUpdateSetToolDefinitions, executeUpdateSetToolCall } from './updateset.js';
// Virtual Agent authoring
import { getVaToolDefinitions, executeVaToolCall } from './va.js';
// IT Asset Management
import { getItamToolDefinitions, executeItamToolCall } from './itam.js';
// DevOps & pipeline tracking
import { getDevopsToolDefinitions, executeDevopsToolCall } from './devops.js';
// Scoped Application (App Studio)
import { getAppStudioToolDefinitions, executeAppStudioToolCall } from './app-studio.js';
// Machine Learning & Predictive Intelligence
import { getMlToolDefinitions, executeMlToolCall } from './ml.js';
// Workspace & UI Builder
import { getWorkspaceToolDefinitions, executeWorkspaceToolCall } from './workspace.js';
// Mobile
import { getMobileToolDefinitions, executeMobileToolCall } from './mobile.js';
// Deployment & Artifacts
import { getDeploymentToolDefinitions, executeDeploymentToolCall } from './deployment.js';

// ─── Package Definitions ──────────────────────────────────────────────────────

const PACKAGE_TOOL_NAMES: Record<string, string[]> = {
  devops_engineer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_devops_pipelines', 'get_devops_pipeline', 'list_deployments', 'get_deployment',
    'create_devops_change', 'track_deployment', 'get_devops_insights',
    'create_update_set', 'switch_update_set', 'get_current_update_set', 'list_update_sets',
    'complete_update_set', 'preview_update_set', 'export_update_set', 'ensure_active_update_set',
    'get_change_request', 'create_change_request', 'list_change_requests',
  ],
  itam_analyst: [
    'query_records', 'get_record',
    'list_assets', 'get_asset', 'create_asset', 'update_asset', 'retire_asset',
    'list_software_licenses', 'get_license_compliance', 'list_asset_contracts',
    'track_asset_lifecycle', 'get_license_optimization',
  ],
  portal_developer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_portals', 'get_portal', 'create_portal', 'list_portal_pages', 'get_portal_page', 'create_portal_page',
    'list_portal_widgets', 'get_portal_widget', 'create_portal_widget', 'update_portal_widget',
    'list_widget_instances',
    'list_ux_apps', 'get_ux_app', 'list_ux_pages',
    'list_portal_themes', 'get_portal_theme',
    'list_ui_policies', 'get_ui_policy', 'create_ui_policy',
    'list_ui_actions', 'get_ui_action', 'create_ui_action', 'update_ui_action',
    'list_client_scripts', 'get_client_script', 'create_client_script', 'update_client_script',
    'list_changesets', 'get_changeset', 'commit_changeset', 'publish_changeset',
  ],
  integration_engineer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_rest_messages', 'get_rest_message', 'list_rest_message_functions', 'create_rest_message',
    'list_transform_maps', 'get_transform_map', 'run_transform_map', 'list_transform_field_maps',
    'list_import_sets', 'get_import_set', 'create_import_set_row', 'list_data_sources',
    'list_event_registry', 'get_event_registry_entry', 'register_event', 'fire_event', 'list_event_log',
    'list_oauth_applications', 'list_credential_aliases',
    'list_changesets', 'get_changeset', 'commit_changeset', 'publish_changeset',
  ],
  service_desk: [
    // Core read
    'query_records', 'get_record', 'get_user', 'get_group',
    // Incident full lifecycle
    'create_incident', 'get_incident', 'update_incident', 'resolve_incident', 'close_incident', 'add_work_note', 'add_comment',
    // Approvals
    'get_my_approvals', 'approve_request', 'reject_request',
    // Knowledge read
    'search_knowledge', 'get_knowledge_article', 'list_knowledge_bases',
    // SLA
    'get_sla_details', 'list_active_slas',
    // Tasks
    'get_task', 'list_my_tasks', 'complete_task',
    // Natural language
    'natural_language_search',
  ],
  change_coordinator: [
    'query_records', 'get_record', 'get_user', 'get_group',
    'create_change_request', 'get_change_request', 'update_change_request', 'list_change_requests', 'submit_change_for_approval', 'close_change_request',
    'get_my_approvals', 'approve_request', 'reject_request',
    'get_problem', 'list_change_requests',
    'search_cmdb_ci', 'get_cmdb_ci', 'list_relationships',
    'schedule_cab_meeting',
  ],
  knowledge_author: [
    'query_records', 'get_record', 'get_user',
    'list_knowledge_bases', 'search_knowledge', 'get_knowledge_article', 'create_knowledge_article', 'update_knowledge_article', 'publish_knowledge_article',
    'list_catalog_items', 'search_catalog', 'get_catalog_item',
    'retire_knowledge_article',
  ],
  catalog_builder: [
    'query_records', 'get_record', 'get_user',
    'list_catalog_items', 'search_catalog', 'get_catalog_item', 'create_catalog_item', 'update_catalog_item', 'order_catalog_item',
    'create_approval_rule',
    'list_users', 'list_groups',
    'create_catalog_variable', 'create_catalog_ui_policy',
  ],
  system_administrator: [
    'query_records', 'get_record', 'get_user', 'get_group', 'get_table_schema',
    'list_users', 'create_user', 'update_user', 'list_groups', 'create_group', 'update_group', 'add_user_to_group', 'remove_user_from_group',
    'list_reports', 'get_report', 'create_report', 'update_report', 'run_aggregate_query', 'trend_query', 'export_report_data', 'get_sys_log',
    'list_scheduled_jobs', 'get_scheduled_job', 'create_scheduled_job', 'update_scheduled_job', 'trigger_scheduled_job', 'list_job_run_history',
    'list_acls', 'get_acl', 'create_acl', 'update_acl',
    'list_notifications', 'get_notification', 'create_notification', 'update_notification',
    'list_email_logs', 'get_email_log',
    'list_attachments', 'get_attachment_metadata', 'upload_attachment', 'delete_attachment',
    'check_table_completeness', 'get_table_record_count', 'compare_record_counts',
    'list_pa_indicators', 'get_pa_indicator', 'get_pa_scorecard', 'get_pa_time_series',
    'list_pa_dashboards', 'get_pa_dashboard', 'create_dashboard', 'update_dashboard',
    'list_oauth_applications', 'list_credential_aliases',
    'get_system_property', 'set_system_property', 'list_system_properties', 'search_system_properties',
    'bulk_get_properties', 'bulk_set_properties', 'list_property_categories',
    'get_current_update_set', 'list_update_sets',
    'create_update_set', 'switch_update_set', 'complete_update_set', 'preview_update_set', 'ensure_active_update_set',
    'create_scheduled_report', 'create_kpi',
  ],
  platform_developer: [
    'query_records', 'get_record', 'get_table_schema',
    'list_scoped_apps', 'get_scoped_app', 'create_scoped_app', 'update_scoped_app',
    'list_business_rules', 'get_business_rule', 'create_business_rule', 'update_business_rule',
    'list_script_includes', 'get_script_include', 'create_script_include', 'update_script_include',
    'list_client_scripts', 'get_client_script', 'create_client_script', 'update_client_script',
    'list_ui_policies', 'get_ui_policy', 'create_ui_policy',
    'list_ui_actions', 'get_ui_action', 'create_ui_action', 'update_ui_action',
    'list_acls', 'get_acl', 'create_acl', 'update_acl',
    'list_changesets', 'get_changeset', 'commit_changeset', 'publish_changeset',
    'list_atf_suites', 'get_atf_suite', 'run_atf_suite', 'list_atf_tests', 'get_atf_test', 'run_atf_test', 'get_atf_suite_result', 'list_atf_test_results', 'get_atf_failure_insight',
  ],
  itom_engineer: [
    'query_records', 'get_record', 'get_table_schema',
    'search_cmdb_ci', 'get_cmdb_ci', 'list_relationships', 'cmdb_health_dashboard', 'service_mapping_summary',
    'list_discovery_schedules', 'list_mid_servers', 'list_active_events',
    'run_aggregate_query', 'trend_query',
    'create_ci_relationship', 'cmdb_impact_analysis', 'run_discovery_scan',
  ],
  agile_manager: [
    'query_records', 'get_record', 'get_user',
    'create_story', 'update_story', 'list_stories',
    'create_epic', 'update_epic', 'list_epics',
    'create_scrum_task', 'update_scrum_task', 'list_scrum_tasks',
    'list_users',
  ],
  ai_developer: [
    'query_records', 'get_record', 'natural_language_search',
    'nlq_query', 'ai_search', 'generate_summary', 'suggest_resolution', 'categorize_incident',
    'get_virtual_agent_topics', 'trigger_agentic_playbook', 'get_ms_copilot_topics', 'generate_work_notes', 'get_pi_models',
    'search_knowledge', 'get_knowledge_article',
  ],
};

// ─── All Tool Definitions ─────────────────────────────────────────────────────

const ALL_TOOLS = [
  ...getCoreToolDefinitions(),
  ...getIncidentToolDefinitions(),
  ...getProblemToolDefinitions(),
  ...getChangeToolDefinitions(),
  ...getTaskToolDefinitions(),
  ...getKnowledgeToolDefinitions(),
  ...getCatalogToolDefinitions(),
  ...getUserToolDefinitions(),
  ...getReportingToolDefinitions(),
  ...getAtfToolDefinitions(),
  ...getNowAssistToolDefinitions(),
  ...getScriptToolDefinitions(),
  ...getAgileToolDefinitions(),
  ...getHrsdToolDefinitions(),
  ...getCsmToolDefinitions(),
  ...getSecurityToolDefinitions(),
  ...getFlowToolDefinitions(),
  ...getPortalToolDefinitions(),
  ...getIntegrationToolDefinitions(),
  ...getNotificationToolDefinitions(),
  ...getPerformanceToolDefinitions(),
  ...getSysPropertiesToolDefinitions(),
  ...getUpdateSetToolDefinitions(),
  ...getVaToolDefinitions(),
  ...getItamToolDefinitions(),
  ...getDevopsToolDefinitions(),
  ...getAppStudioToolDefinitions(),
  ...getMlToolDefinitions(),
  ...getWorkspaceToolDefinitions(),
  ...getMobileToolDefinitions(),
  ...getDeploymentToolDefinitions(),
];

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTools() {
  const packageName = (process.env.MCP_TOOL_PACKAGE || 'full').toLowerCase();

  if (packageName === 'full') {
    return ALL_TOOLS;
  }

  const allowed = PACKAGE_TOOL_NAMES[packageName];
  if (!allowed) {
    console.error(`[WARN] Unknown MCP_TOOL_PACKAGE "${packageName}". Using "full".`);
    return ALL_TOOLS;
  }

  const allowedSet = new Set(allowed);
  return ALL_TOOLS.filter(t => allowedSet.has(t.name));
}

export async function executeTool(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  // Try each domain handler in order; first non-null result wins
  const handlers = [
    () => executeCoreToolCall(client, name, args),
    () => executeIncidentToolCall(client, name, args),
    () => executeProblemToolCall(client, name, args),
    () => executeChangeToolCall(client, name, args),
    () => executeTaskToolCall(client, name, args),
    () => executeKnowledgeToolCall(client, name, args),
    () => executeCatalogToolCall(client, name, args),
    () => executeUserToolCall(client, name, args),
    () => executeReportingToolCall(client, name, args),
    () => executeAtfToolCall(client, name, args),
    () => executeNowAssistToolCall(client, name, args),
    () => executeScriptToolCall(client, name, args),
    () => executeAgileToolCall(client, name, args),
    () => executeHrsdToolCall(client, name, args),
    () => executeCsmToolCall(client, name, args),
    () => executeSecurityToolCall(client, name, args),
    () => executeFlowToolCall(client, name, args),
    () => executePortalToolCall(client, name, args),
    () => executeIntegrationToolCall(client, name, args),
    () => executeNotificationToolCall(client, name, args),
    () => executePerformanceToolCall(client, name, args),
    () => executeSysPropertiesToolCall(client, name, args),
    () => executeUpdateSetToolCall(client, name, args),
    () => executeVaToolCall(client, name, args),
    () => executeItamToolCall(client, name, args),
    () => executeDevopsToolCall(client, name, args),
    () => executeAppStudioToolCall(client, name, args),
    () => executeMlToolCall(client, name, args),
    () => executeWorkspaceToolCall(client, name, args),
    () => executeMobileToolCall(client, name, args),
    () => executeDeploymentToolCall(client, name, args),
  ];

  for (const handler of handlers) {
    const result = await handler();
    if (result !== null) return result;
  }

  throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
}
