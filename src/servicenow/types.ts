// ─── Core Infrastructure Types ───────────────────────────────────────────────

/**
 * Execution context for API calls:
 * - service-account: one shared account for all queries (default)
 * - per-user:        each user authenticates with their own token
 * - impersonation:   service account with X-Sn-Impersonate header per user
 */
export type AuthMode = 'service-account' | 'per-user' | 'impersonation';

export interface ServiceNowConfig {
  instanceUrl: string;
  authMethod: 'oauth' | 'basic';
  /** Execution context — defaults to 'service-account' */
  authMode?: AuthMode;
  /** For impersonation mode: the sys_id of the user to impersonate */
  impersonateUserSysId?: string;
  /** For per-user mode: pre-loaded Bearer token (from keychain / auth store) */
  perUserBearerToken?: string;
  oauth?: {
    clientId?: string;
    clientSecret?: string;
    username?: string;
    password?: string;
  };
  basic?: {
    username?: string;
    password?: string;
  };
  maxRetries?: number;
  retryDelayMs?: number;
  requestTimeoutMs?: number;
}

export interface QueryRecordsParams {
  table: string;
  query?: string;
  fields?: string;
  limit?: number;
  orderBy?: string;
  offset?: number;
}

export interface QueryRecordsResponse {
  count: number;
  records: ServiceNowRecord[];
}

export interface ServiceNowRecord {
  [key: string]: string | number | boolean | ServiceNowReference | null | undefined;
}

export interface ServiceNowReference {
  value: string;
  display_value: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface ServiceNowApiResponse<T = any> {
  result: T;
}

export interface ServiceNowApiError {
  error: {
    message: string;
    detail?: string;
  };
  status: string;
}

// ─── Core Platform Tool Params ────────────────────────────────────────────────

export interface GetRecordParams {
  table: string;
  sys_id: string;
  fields?: string;
}

export interface GetUserParams {
  user_identifier: string;
}

export interface GetGroupParams {
  group_identifier: string;
}

// ─── CMDB Tool Params ─────────────────────────────────────────────────────────

export interface SearchCmdbCiParams {
  query?: string;
  limit?: number;
}

export interface GetCmdbCiParams {
  ci_sys_id: string;
  fields?: string;
}

export interface ListRelationshipsParams {
  ci_sys_id: string;
}

export interface CreateCmdbCiParams {
  ci_class: string;
  name: string;
  attributes?: Record<string, string>;
}

export interface UpdateCmdbCiParams {
  sys_id: string;
  attributes: Record<string, string>;
}

export interface AddCiRelationshipParams {
  parent_sys_id: string;
  child_sys_id: string;
  type?: string;
}

// ─── ITOM Tool Params ─────────────────────────────────────────────────────────

export interface ListDiscoverySchedulesParams {
  active_only?: boolean;
}

export interface ListMidServersParams {
  active_only?: boolean;
}

export interface ListActiveEventsParams {
  query?: string;
  limit?: number;
}

export interface ServiceMappingSummaryParams {
  service_sys_id: string;
}

export interface CreateEventParams {
  source: string;
  resource: string;
  metric_name: string;
  severity: number;
  description?: string;
  additional_info?: string;
}

export interface UpdateEventParams {
  sys_id: string;
  fields: Record<string, string>;
}

export interface ResolveEventParams {
  sys_id: string;
  resolution_notes?: string;
}

// ─── Incident Tool Params ─────────────────────────────────────────────────────

export interface CreateIncidentParams {
  short_description: string;
  urgency?: number;
  impact?: number;
  priority?: number;
  description?: string;
  assignment_group?: string;
  caller_id?: string;
  category?: string;
  subcategory?: string;
}

export interface GetIncidentParams {
  number_or_sysid: string;
}

export interface UpdateIncidentParams {
  sys_id: string;
  fields: Record<string, string | number>;
}

export interface ResolveIncidentParams {
  sys_id: string;
  resolution_code: string;
  resolution_notes: string;
}

export interface CloseIncidentParams {
  sys_id: string;
}

export interface AddWorkNoteParams {
  table: string;
  sys_id: string;
  note: string;
}

export interface AddCommentParams {
  table: string;
  sys_id: string;
  comment: string;
}

// ─── Problem Tool Params ──────────────────────────────────────────────────────

export interface CreateProblemParams {
  short_description: string;
  description?: string;
  assignment_group?: string;
  priority?: number;
}

export interface GetProblemParams {
  number_or_sysid: string;
}

export interface UpdateProblemParams {
  sys_id: string;
  fields: Record<string, string | number>;
}

export interface ResolveProblemParams {
  sys_id: string;
  root_cause: string;
  resolution_notes: string;
}

// ─── Change Request Tool Params ───────────────────────────────────────────────

export interface CreateChangeRequestParams {
  short_description: string;
  assignment_group: string;
  description?: string;
  category?: string;
  priority?: string | number;
  risk?: string | number;
  impact?: string | number;
  urgency?: string | number;
}

export interface GetChangeRequestParams {
  number_or_sysid: string;
}

export interface UpdateChangeRequestParams {
  sys_id: string;
  fields: Record<string, string | number>;
}

export interface ListChangeRequestsParams {
  query?: string;
  state?: string;
  limit?: number;
}

export interface SubmitChangeForApprovalParams {
  sys_id: string;
}

export interface CloseChangeRequestParams {
  sys_id: string;
  close_code: string;
  close_notes: string;
}

// ─── Task Tool Params ─────────────────────────────────────────────────────────

export interface GetTaskParams {
  number_or_sysid: string;
}

export interface UpdateTaskParams {
  sys_id: string;
  fields: Record<string, string | number>;
}

export interface ListMyTasksParams {
  limit?: number;
}

export interface CompleteTaskParams {
  sys_id: string;
  close_notes?: string;
}

// ─── Knowledge Base Tool Params ───────────────────────────────────────────────

export interface ListKnowledgeBasesParams {
  limit?: number;
}

export interface SearchKnowledgeParams {
  query: string;
  limit?: number;
  knowledge_base?: string;
}

export interface GetKnowledgeArticleParams {
  number_or_sysid: string;
}

export interface CreateKnowledgeArticleParams {
  short_description: string;
  text: string;
  knowledge_base_sys_id: string;
  category?: string;
}

export interface UpdateKnowledgeArticleParams {
  sys_id: string;
  fields: Record<string, string>;
}

export interface PublishKnowledgeArticleParams {
  sys_id: string;
}

// ─── Service Catalog Tool Params ──────────────────────────────────────────────

export interface ListCatalogItemsParams {
  category?: string;
  limit?: number;
}

export interface SearchCatalogParams {
  query: string;
  limit?: number;
}

export interface GetCatalogItemParams {
  sys_id_or_name: string;
}

export interface OrderCatalogItemParams {
  sys_id: string;
  quantity?: number;
  variables?: Record<string, string>;
}

// ─── Approval Tool Params ─────────────────────────────────────────────────────

export interface GetMyApprovalsParams {
  state?: string;
}

export interface ListApprovalsParams {
  query?: string;
  state?: string;
  limit?: number;
}

export interface ApproveRequestParams {
  sys_id: string;
  comments?: string;
}

export interface RejectRequestParams {
  sys_id: string;
  comments: string;
}

// ─── SLA Tool Params ──────────────────────────────────────────────────────────

export interface GetSlaDetailsParams {
  task_sys_id: string;
}

export interface ListActiveSLAsParams {
  query?: string;
  limit?: number;
}

// ─── User / Group Extended Params ────────────────────────────────────────────

export interface ListUsersParams {
  query?: string;
  limit?: number;
}

export interface CreateUserParams {
  user_name: string;
  email: string;
  first_name: string;
  last_name: string;
  title?: string;
  department?: string;
}

export interface UpdateUserParams {
  sys_id: string;
  fields: Record<string, string>;
}

export interface ListGroupsParams {
  query?: string;
  limit?: number;
}

export interface CreateGroupParams {
  name: string;
  description?: string;
  manager?: string;
}

export interface UpdateGroupParams {
  sys_id: string;
  fields: Record<string, string>;
}

export interface AddUserToGroupParams {
  user_sys_id: string;
  group_sys_id: string;
}

export interface RemoveUserFromGroupParams {
  member_sys_id: string;
}

// ─── Reporting Tool Params ────────────────────────────────────────────────────

export interface ListReportsParams {
  category?: string;
  limit?: number;
  search?: string;
}

export interface GetReportParams {
  sys_id_or_name: string;
}

export interface RunReportParams {
  sys_id: string;
}

export interface CreateReportParams {
  name: string;
  table: string;
  type: string;
  conditions?: string;
  group_by?: string;
  order_by?: string;
}

export interface GetPerformanceAnalyticsParams {
  widget_sys_id: string;
  time_range?: string;
}

export interface TrendQueryParams {
  table: string;
  date_field: string;
  group_by: string;
  query?: string;
  periods?: number;
}

export interface RunAggregateQueryParams {
  table: string;
  group_by: string;
  aggregate?: string;
  query?: string;
  limit?: number;
}

export interface ExportReportDataParams {
  table: string;
  query?: string;
  fields?: string;
  format?: 'json' | 'csv';
  limit?: number;
}

// ─── ATF Tool Params ──────────────────────────────────────────────────────────

export interface ListAtfSuitesParams {
  active?: boolean;
  query?: string;
  limit?: number;
}

export interface GetAtfSuiteParams {
  sys_id_or_name: string;
}

export interface RunAtfSuiteParams {
  sys_id: string;
}

export interface ListAtfTestsParams {
  suite_sys_id?: string;
  active?: boolean;
  limit?: number;
}

export interface GetAtfTestParams {
  sys_id: string;
}

export interface RunAtfTestParams {
  sys_id: string;
}

export interface GetAtfSuiteResultParams {
  result_sys_id: string;
}

export interface ListAtfTestResultsParams {
  suite_result_sys_id?: string;
  limit?: number;
}

export interface GetAtfTestResultParams {
  result_sys_id: string;
}

export interface GetAtfFailureInsightParams {
  result_sys_id: string;
}

export interface ListAtfStepsParams {
  test_sys_id: string;
}

// ─── Now Assist / AI Tool Params ─────────────────────────────────────────────

export interface NlqQueryParams {
  question: string;
  table?: string;
  limit?: number;
}

export interface AiSearchParams {
  query: string;
  sources?: string[];
  limit?: number;
}

export interface GenerateSummaryParams {
  table: string;
  sys_id: string;
}

export interface SuggestResolutionParams {
  incident_sys_id: string;
}

export interface GenerateWorkNotesParams {
  table: string;
  sys_id: string;
  context?: string;
}

export interface CategorizeIncidentParams {
  short_description: string;
  description?: string;
}

export interface PredictiveScoreParams {
  table: string;
  sys_id: string;
}

export interface GetVirtualAgentTopicsParams {
  active?: boolean;
  category?: string;
  limit?: number;
}

export interface TriggerAgenticPlaybookParams {
  playbook_sys_id: string;
  context?: Record<string, string>;
}

// ─── Scripting Tool Params ────────────────────────────────────────────────────

export interface ListBusinessRulesParams {
  table?: string;
  active?: boolean;
  limit?: number;
}

export interface GetBusinessRuleParams {
  sys_id: string;
}

export interface CreateBusinessRuleParams {
  name: string;
  table: string;
  when: string;
  condition?: string;
  script: string;
  active?: boolean;
  order?: number;
}

export interface UpdateBusinessRuleParams {
  sys_id: string;
  fields: Record<string, string | boolean | number>;
}

export interface ListScriptIncludesParams {
  query?: string;
  active?: boolean;
  limit?: number;
}

export interface GetScriptIncludeParams {
  sys_id_or_name: string;
}

export interface CreateScriptIncludeParams {
  name: string;
  script: string;
  api_name?: string;
  access?: string;
  active?: boolean;
}

export interface UpdateScriptIncludeParams {
  sys_id: string;
  fields: Record<string, string | boolean>;
}

export interface ListClientScriptsParams {
  table?: string;
  type?: string;
  active?: boolean;
  limit?: number;
}

export interface GetClientScriptParams {
  sys_id: string;
}

export interface ListChangesetsParams {
  state?: string;
  limit?: number;
}

export interface GetChangesetParams {
  sys_id_or_name: string;
}

export interface CommitChangesetParams {
  sys_id: string;
}

export interface PublishChangesetParams {
  sys_id: string;
}

// ─── Agile Tool Params ────────────────────────────────────────────────────────

export interface CreateStoryParams {
  short_description: string;
  story_points?: number;
  sprint?: string;
  epic?: string;
  description?: string;
  assigned_to?: string;
}

export interface UpdateStoryParams {
  sys_id: string;
  fields: Record<string, string | number>;
}

export interface ListStoriesParams {
  sprint?: string;
  state?: string;
  limit?: number;
}

export interface CreateEpicParams {
  short_description: string;
  description?: string;
  project?: string;
}

export interface UpdateEpicParams {
  sys_id: string;
  fields: Record<string, string>;
}

export interface ListEpicsParams {
  project?: string;
  state?: string;
  limit?: number;
}

export interface CreateScrumTaskParams {
  short_description: string;
  story_sys_id?: string;
  assigned_to?: string;
}

export interface UpdateScrumTaskParams {
  sys_id: string;
  fields: Record<string, string>;
}

export interface ListScrumTasksParams {
  story_sys_id?: string;
  assigned_to?: string;
  limit?: number;
}

// ─── Analytics Tool Params ────────────────────────────────────────────────────

export interface GetSysLogParams {
  query?: string;
  limit?: number;
}

export interface ListScheduledJobsParams {
  active?: boolean;
  query?: string;
  limit?: number;
}

// ─── Natural Language Tool Params (legacy) ────────────────────────────────────

export interface NaturalLanguageSearchParams {
  query: string;
  limit?: number;
}

export interface NaturalLanguageUpdateParams {
  instruction: string;
  table: string;
}
