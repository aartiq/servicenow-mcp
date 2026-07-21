# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.5.0] — 2026-07-22

### Added — Visualization / reporting (charts for Copilot & Teams)
- **`visualize_aggregate`** — group a table by a field (incidents by priority, cases by state, etc.) and get back chart-ready data, a markdown table, a summary, and a ready-to-render **Adaptive Card** with a native Teams `Chart.*` element (column / bar / pie / donut).
- **`visualize_trend`** — count records over time (day / week / month) and get a line-chart Adaptive Card plus the series data.
- Why a card: Microsoft Copilot Studio passes an MCP tool result to the model as text/JSON and does not render images an MCP server returns. A native Adaptive Card chart renders client-side in Teams, so the numbers stay inside the tenant (no third-party chart service). Drop the returned `adaptive_card` into a Copilot Studio "Send an adaptive card" step. The `table_markdown` is an always-renders fallback.

## [4.4.1] — 2026-07-21

### Security
- **Delegated permission tiers now narrow, never widen.** A delegated-auth context can only reduce the server's env-configured capability ceiling; a forged `x-nowaikit-*-enabled` header can never enable a tier (`write`/`scripting`/`cmdbWrite`/`nowAssist`/`atf`) the operator left disabled. Effective capability is `env AND delegated`.
- **Optional gateway secret for delegated auth.** When `NOWAIKIT_DELEGATED_SECRET` is set, delegated-auth headers are only trusted if the request carries a matching `x-nowaikit-gateway-secret` (constant-time compared); otherwise the token and all flags are dropped (fail closed).
- **Encoded-query injection hardening.** `blast_radius_*` tools validate table/field identifiers and reject the `^ = ,` operator characters in name inputs, so a crafted value can't inject `^OR`/`^NQ` clauses. `get_user` / `get_group` now build lookups with `URLSearchParams` and reject `^ = & # ?` in the identifier.

### Changed — usability
- `blast_radius_*` descriptions state the LIKE-match limitation (candidates to review, not definitive) and clarify this is config/metadata impact (distinct from `cmdb_impact_analysis`). `field_references` and `property_usage` return a top-level total.
- `pull_artifact` / `push_artifact` / `sync_status` accept a name or a sys_id. `push_artifact` warns it overwrites without merging and takes an optional `expected_updated_on` to abort on a conflict; it also reports `ignored_fields`. `sync_status` returns `sys_updated_on` for that conflict check.

## [4.4.0] — 2026-07-21

### Added — Blast Radius (static impact analysis)
- **`blast_radius_table_configs`** — every config artifact scoped to a table (business rules, client scripts, UI policies, ACLs, UI actions, data policies, dictionary fields), with per-type counts. Run before altering or removing a table.
- **`blast_radius_field_references`** — a field's dictionary entry plus any scripts that mention the field name. Run before renaming or removing a field.
- **`blast_radius_script_dependents`** — what references a Script Include / artifact by name, across script-bearing config tables.
- **`blast_radius_update_sets`** — which update sets already capture changes to an artifact, so you know what is in-flight before you touch it.
- **`blast_radius_property_usage`** — scripts that read a system property, plus the property record. All read-only; each lane degrades independently if a plugin/table is absent.

### Added — Local Sync (pull/push artifacts to files)
- **`pull_artifact`** / **`push_artifact`** — fetch an artifact's editable fields (e.g. a Service Portal widget's template/css/script) to local files, edit, and write them back. Keeps large bodies out of the model context and gives a git-style edit loop. File writes are confined to `NOWAIKIT_SYNC_DIR`; with it unset, content is returned inline and nothing touches disk.
- **`sync_status`** — field-by-field diff of instance content vs your local/edited content.
- **`list_supported_artifacts`** — the artifact tables and fields that support sync.

## [4.3.0] — 2026-07-21

### Added — Multi-tenant / delegated auth
- Delegated-auth mode binds a per-request user identity and capability policy from context headers, so one shared server can serve many users, each governed by their own ServiceNow access.
- `withUser()` can route a request to the caller's own instance (SSRF-guarded to ServiceNow hosts), and the permission tiers honour the delegated policy over environment flags.
- Added a `core` tool-discovery mode, an `./embed` entry point, a `nowaikit-mcp` bin, and a fix so the HTTP/SSE transport reuses the already-parsed request body (no more `-32700` on the streamable transport).

### Fixed — ServiceNow REST endpoint audit
- **`get_catalog_item`** now returns an item's variables and a `mandatory_variables` list via the Service Catalog API, so callers know which fields an order requires.
- **`get_performance_analytics`** uses the PA Scorecards API (`/api/now/pa/scorecards`) instead of the widget renderer; accepts an indicator or a widget sys_id.
- **`search_knowledge`** uses Zing full-text search and no longer lets an OR clause leak unpublished articles.
- **`categorize_incident`** and **`get_ms_copilot_topics`** read real tables instead of calling endpoints that do not exist.
- Removed tools that pointed at the non-existent `sn_assist` REST namespace (`generate_summary`, `suggest_resolution`, `generate_work_notes`, `trigger_agentic_playbook`).

---

## [4.1.6] — 2026-06-24

### Added — ServiceNow product-documentation search
- **`search_servicenow_docs`** — full-text search over the official ServiceNow documentation (servicenow.com/docs): API references (GlideRecord, GlideSystem…), admin/developer guides, encoded-query operators, release notes. Returns ranked results with title, breadcrumb, URL, snippet, and a `ref`.
- **`fetch_servicenow_doc`** — fetch the full readable text of a docs page (by `ref` from search, or by URL). Lets an AI ground answers in current docs instead of training-data guesses.
- Backed by the public Fluid Topics REST API that powers servicenow.com/docs. Read-only, no instance credentials required, SSRF-guarded to ServiceNow domains. Complements the existing `fluent_explain` (live SDK docs) and `search_knowledge` (instance KB).

### Added — Progress notifications for long-running tools
- Long operations (discovery scans, ATF suites/tests, CMDB reconcile/impact, bulk creates, imports, transform maps, vulnerability scans, instance compares, ML training) now emit MCP **progress notifications** when the client supplies a `progressToken`, so UIs show live activity instead of a silent hang. Fully backward-compatible — clients that don't request progress see no change.

---

## [4.1.5] — 2026-06-24

### Added — MCP tool annotations
- Every tool now ships MCP **annotations** (`readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`), derived from the read/write/destructive tier system. Clients (Claude, Cursor, …) can auto-approve safe reads and prompt before writes/deletes — making "read-only by default" machine-readable. (Most MCP servers don't implement these.)

---

## [4.1.4] — 2026-06-24

### Added — Performance Analytics authoring
- **`create_pa_indicator`** — create a PA indicator/KPI on `pa_indicators` (source facts table, aggregation, conditions, unit, direction). Write-gated.
- **`create_pa_breakdown`** — create a PA breakdown on `pa_breakdowns` to slice indicators by a dimension. Write-gated.

(Completes the PA write tools alongside the existing `create_dashboard`. Thanks to @b4rk13 for the idea.)

---

## [4.1.3] — 2026-06-24

### Fixed
- **`query_records` descending sort** — `orderBy: "-field"` now correctly sorts descending (`ORDERBYDESC<field>`) instead of returning the oldest record. Fixes the "can't get the latest record" bug. ([#8](https://github.com/aartiq/servicenow-mcp/issues/8))
- **Docker build** — the image now installs build dependencies (TypeScript) and copies `scripts/`, so `npm run build` succeeds; production deps are pruned afterward. ([#4](https://github.com/aartiq/servicenow-mcp/issues/4))

### Changed
- Repository is now `aartiq/servicenow-mcp` (canonical); homepage → nowaikit.com.

---

## [4.1.1] — 2026-06-23

### Added — `@servicenow/sdk` 4.8 parity for the Fluent tooling
- **`fluent_sdk_query`** — wraps the new `now-sdk query <table>` CLI command (ServiceNow SDK 4.8): a read-only Table API query run directly against your authenticated instance, ideal for resolving sys_ids, inspecting schemas, and checking records while authoring Fluent code.
- **`fluent_version`** — reports the installed `@servicenow/sdk` version, compares it to the version NowAIKit tracks features against (4.8.0), and returns an upgrade hint when out of date. `fluent_build` now surfaces the same version warning in its output.
- **`fluent_explain`** — curated known-topic list covering the APIs introduced in SDK 4.8 (Playbook, RestMessage, Alias, AliasTemplate, RetryPolicy, DataLookup) plus AIAF `roleMap`, NASK, and Flow `TryCatch`/`DoInParallel`.

### Changed
- ServiceNow release support refreshed to the **Australia** GA (May 2026) as current, with Zurich (n-1) and Yokohama (n-2).

---

## [4.0.0] — 2026-04-25

### Added

#### Multi-Transport Support
- **SSE Transport** (`TRANSPORT=sse`) — Server-Sent Events over HTTP, enabling remote MCP connections
- **Streamable HTTP Transport** (`TRANSPORT=http`) — MCP 2025-03-26 spec compliant streaming
- **Bearer token auth** via `NOWAIKIT_API_KEY` env var for HTTP transports
- **CORS configuration** via `CORS_ORIGIN` env var
- **Health endpoint** at `GET /health` with server status, tool count, transport type

#### A2A (Agent-to-Agent) Protocol
- **Agent Card** at `GET /.well-known/agent.json` — automatic discovery by A2A-compatible agents
- **Task execution** — `POST /a2a/tasks/send` for synchronous tool invocation via A2A
- **SSE streaming** — `POST /a2a/tasks/sendSubscribe` for streaming task updates
- **Task management** — `GET /a2a/tasks/:id`, `POST /a2a/tasks/:id/cancel`
- Tools mapped to A2A skills by domain (Incident Management, CMDB, Security, etc.)

#### HTTP REST API
- `GET /api/tools` — List all tools with schemas
- `POST /api/tool` — Execute any tool via REST
- `GET /api/resources`, `GET /api/resource?uri=...` — Read MCP resources
- `GET /api/prompts` — List slash commands
- `GET /api/instances`, `POST /api/instances/switch` — Instance management

#### Web Dashboard
- Dark-theme dashboard at `GET /` when HTTP transport is active
- Tool explorer with search, tool executor, instance status

#### Dynamic Schema Discovery
- **`discover_table`** — Reads table schema from `sys_dictionary` at runtime
- Generates dynamic CRUD tools: `dynamic_query_<table>`, `dynamic_get_<table>`, `dynamic_create_<table>`, `dynamic_update_<table>`, `dynamic_delete_<table>`
- 30-minute TTL cache, schema fallback via record probing

#### Now Assist Skill Management
- `create_now_assist_skill` — Create Now Assist skills with input/output schemas
- `list_now_assist_skills` — Query available skills
- `get_now_assist_skill` — Get skill details
- `test_now_assist_skill` — Test skill execution via Now Assist API

#### AI Agent Framework
- `create_ai_agent` — Create AI agents with automatic ACL generation
- `list_ai_agents`, `get_ai_agent` — Query and inspect agents
- `create_agentic_workflow` — Create agent workflow definitions

#### CMDB Reconciliation Engine
- `cmdb_find_duplicates` — Detect duplicate CIs by configurable matching fields
- `cmdb_find_orphans` — Find CIs with no relationships
- `cmdb_find_stale` — Find CIs not updated in N days
- `cmdb_reconcile` — Merge, retire, or remove with dry-run support

#### Multi-Agent Orchestration
- `create_playbook` — Define reusable multi-step tool chains
- `execute_playbook` — Execute playbooks with context passing between steps
- `list_playbooks` — Query playbook definitions

#### Fluent / now-sdk Integration
- `fluent_explain` — Look up ServiceNow platform conventions via now-sdk
- `fluent_init` — Scaffold new Fluent applications
- `fluent_build` — Build Fluent projects
- `fluent_validate` — Validate Fluent code
- New `FLUENT_ENABLED` permission tier

#### ML Enhancements
- `ml_similar_incidents` — Find similar past incidents by keyword analysis
- `ml_auto_categorize` — Auto-categorize records based on description analysis

#### Encoded Query Reference
- `@query-syntax` MCP resource — comprehensive ServiceNow query syntax documentation
- Includes operators, date functions, dot-walking, common patterns, anti-patterns
- Prevents LLM hallucination on encoded query syntax

#### ATF Suite Generation Capability
- `build-atf-suite` Apex capability — generates runnable ATF test suites from any artifact
- Supports basic, standard, and comprehensive coverage levels

### Changed
- Server version bumped to 4.0.0
- `server.ts` refactored with `createServer()` factory for transport flexibility
- `getTools()` now includes dynamically discovered tables
- Tool router extended with discovery and dynamic tool handlers

### Stats
- Total static tools: **394** (up from 371 in v3.1)
- Dynamic tools: **unlimited** (via discover_table)
- New test coverage: **195 tests** (up from 88)
- New capabilities: **27** (up from 26)

---

## [2.6.0] — 2026-03-28

### Added
- **Generic CRUD tools** — `create_record`, `update_record`, `delete_record` for any ServiceNow table (requires `WRITE_ENABLED=true`)
- **Fluent Query** — `fluent_query` tool with GlideQuery-style chained queries (where, select, aggregate, groupBy, orderBy)
- **Batch API** — `batch_request` tool for multi-operation batching (50-70% fewer round-trips, up to 50 operations per batch)
- **Server-side scripting** — `execute_script` tool for GlideRecord/GlideQuery execution on the instance
- Added new tools to `platform_developer`, `ai_developer`, `system_administrator`, `devops_engineer`, `portal_developer`, and `integration_engineer` packages

### Fixed
- **Permission gating defect** — `executeNowAssistToolCall()` and `executeScriptToolCall()` called permission checks before checking tool name, blocking unrelated tools from executing. Now returns `null` for unrelated tools before checking permissions.
- `execute_background_script` no longer incorrectly requires `NOW_ASSIST_ENABLED`

### Stats
- Total tools: **400+** (371 actual, up from 368 in v2.5)

---

## [2.4.0] — 2026-02-22

### Added

#### Zero-Config Setup Wizard
- **`npx nowaikit setup`** — interactive CLI wizard replaces all manual config file editing
  - Auto-detects installed AI clients: Claude Desktop, Cursor, VS Code, Windsurf, Continue.dev, Claude Code, Codex, Gemini
  - Tests ServiceNow connection before writing any config
  - Writes directly to each client's config file — no copy-paste required
  - `--add` flag to add additional instances to existing config
- **`nowaikit auth login/logout/whoami`** — per-user OAuth Authorization Code flow
  - Tokens stored in `~/.config/nowaikit/tokens.json`
  - Queries run in each user's own ServiceNow ACL context (no shared admin account)
- **`nowaikit instances list/remove`** — manage configured instances

#### Slash Commands (`/` — MCP Prompts)
Built-in prompt templates that appear in Claude Desktop, Cursor, and any MCP-aware client:
- `/morning-standup` — P1/P2 incidents, today's changes, SLA breaches
- `/my-tickets` — open tasks/incidents assigned to current user
- `/p1-alerts` — active P1 incidents with time-open and assignee
- `/my-changes` — pending change requests and approval status
- `/knowledge-search` — search KB with freetext query
- `/create-incident` — guided incident creation form
- `/sla-breaches` — records currently breaching SLA
- `/ci-health` — CMDB CI health check
- `/run-atf` — trigger ATF test suite
- `/switch-instance` — interactive instance picker
- `/deploy-updateset` — guided update set commit flow
- Custom commands via `nowaikit.commands.json`

#### @ Mentions (`@` — MCP Resources)
Named data references users can pull into AI context with `@`:
- `@my-incidents` — open incidents assigned to current user
- `@open-changes` — open change requests pending approval
- `@sla-breaches` — records breaching SLA
- `@instance:info` — current instance metadata
- `@ci:<name>` — CMDB record by name
- `@kb:<title>` — Knowledge article by title

#### HTTP API Server (`nowaikit serve`)
- `node dist/http-server.js` / `npm run serve` — REST wrapper around all MCP tools
- `POST /api/tool` — call any tool by name with params
- `GET /api/tools` — list all 400+ tools
- `GET /api/health` — health check + instance info
- `GET /api/resources` — list @ resources
- `GET /api/resource?uri=...` — read a resource
- `GET /api/prompts` — list slash commands
- Bearer token auth via `NOWAIKIT_API_KEY`
- CORS headers configurable via `CORS_ORIGIN`
- Enables Lovable, Bolt, v0, Replit apps to call ServiceNow without credentials in the browser

#### Web Dashboard
- Served at `GET /` and `GET /dashboard` by the HTTP server
- Dark-theme UI with sidebar navigation
- Pages: health overview, instance list, tool browser (search), slash commands, @ resources, audit log viewer
- No build step — fully self-contained HTML/CSS/JS

#### SSO / OIDC Authentication
- `GET /auth/login` — redirects browser to IdP (Okta, Entra, etc.)
- `GET /auth/callback` — OIDC Authorization Code exchange + ServiceNow token exchange (JWT Bearer grant, RFC 7523)
- Config: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`
- `orgConfig.require_sso` enforcement for enterprise deployments

#### Audit Logging
- Every tool call, resource read, and prompt resolve is logged as JSONL
- Destinations: file (`~/.config/nowaikit/audit.jsonl`), webhook (`AUDIT_WEBHOOK_URL`), stdout
- Wired into both MCP server (`server.ts`) and HTTP API server (`http-server.ts`)
- Log fields: timestamp, event type, tool/resource/prompt name, instance, authMode, user, success, durationMs, error

#### Org / Team Policy (`nowaikit.org.json`)
- Admin-deployable config for enterprise teams (MDM/GPO)
- Enforces: allowed instance URLs, locked tool package, max permission tier, SSO requirement, allowed AI clients, write/record limits
- Load order: `NOWAIKIT_ORG_CONFIG` env → `/etc/nowaikit/org.json` → `./nowaikit.org.json`
- Org name and logo shown in health API response

#### Per-User Execution Context
- Three auth modes: `service-account` (default), `per-user` (OAuth per user), `impersonation` (`X-Sn-Impersonate` header)
- `withUser()` method on ServiceNow client to inject user context
- All queries can run in the individual user's ServiceNow ACL context — no shared admin account bypassing data controls

#### Electron Desktop App (`desktop/`)
- Full cross-platform desktop application: Electron 33 + React 18 + TypeScript + Vite
- 8-step first-run setup wizard (same flow as CLI, but visual)
- Pages: Dashboard (health cards), Instances, Tools (searchable grid), Logs
- System tray integration and auto-updates via `electron-updater` + GitHub Releases
- Packages to `.dmg` (macOS, notarized), `.exe` NSIS (Windows), `.AppImage` + `.deb` (Linux)
- Bundles nowaikit HTTP server — no separate installation required
- See `desktop/BUILDING.md` for build and code-signing instructions

#### Smithery Registry (`smithery.yaml`)
- One-command install: `smithery install nowaikit`
- GUI config schema mapping all env vars to form fields

### Changed
- `src/server.ts` registers `prompts` capability alongside tools and resources
- `src/servicenow/types.ts` — added `AuthMode` type and new `ServiceNowConfig` fields
- `src/servicenow/client.ts` — added `withUser()`, `getImpersonateHeader()`, `X-Sn-Impersonate` support
- `package.json` — added `bin: { nowaikit }`, `serve` and `setup` scripts; new deps: `@inquirer/prompts`, `chalk`, `commander`, `ora`
- Total tools: 400+; all tools now fully audit-logged

---

## [2.3.0] — 2026-02-22

### Added

#### New Tool Capabilities
- **Scoped Applications (App Studio)** (4 tools): `list_scoped_apps`, `get_scoped_app`, `create_scoped_app`, `update_scoped_app`
- **Report Creation** (2 tools): `create_report`, `update_report`
- **Dashboard Creation** (2 tools): `create_dashboard`, `update_dashboard`
- **Portal & Page Creation** (2 tools): `create_portal`, `create_portal_page`
- **Catalog Item Management** (2 tools): `create_catalog_item`, `update_catalog_item`
- **Approval Rules** (1 tool): `create_approval_rule`

#### Role-Based Packages Extended
- `platform_developer` — now includes scoped application tools
- `portal_developer` — now includes portal and page creation
- `catalog_builder` — now includes catalog item creation and approval rule tools
- `system_administrator` — now includes report and dashboard creation

### Changed
- MCP server version bumped to 2.3.0
- Total tools: 270+ → 400+

---

## [2.2.0] — 2026-02-22

### Added

#### New Tool Modules (42 new tools)
- **System Properties** (12 tools): `get_system_property`, `set_system_property`, `list_system_properties`, `delete_system_property`, `search_system_properties`, `bulk_get_properties`, `bulk_set_properties`, `export_properties`, `import_properties`, `validate_property`, `list_property_categories`, `get_property_history`
- **Update Set Management** (8 tools): `get_current_update_set`, `list_update_sets`, `create_update_set`, `switch_update_set`, `complete_update_set`, `preview_update_set`, `export_update_set`, `ensure_active_update_set`
- **Virtual Agent Authoring** (7 tools): `create_va_topic`, `update_va_topic`, `get_va_topic`, `list_va_topics_full`, `get_va_conversation`, `list_va_conversations`, `list_va_categories`
- **IT Asset Management** (8 tools): `list_assets`, `get_asset`, `create_asset`, `update_asset`, `retire_asset`, `list_software_licenses`, `get_license_compliance`, `list_asset_contracts`
- **DevOps & Pipeline Tracking** (7 tools): `list_devops_pipelines`, `get_devops_pipeline`, `list_deployments`, `get_deployment`, `create_devops_change`, `track_deployment`, `get_devops_insights`

#### New Role-Based Tool Packages
- `devops_engineer` — DevOps, pipelines, update sets, change management (~25 tools)
- `itam_analyst` — Asset CRUD, license compliance, contracts (~15 tools)

#### Documentation & Banner
- Replaced stale stats in `docs/assets/banner.svg` (270+ tools, 15+ AI clients, 120+ examples)
- Added Google AI Studio step-by-step setup guide
- Added VS Code native MCP (1.99+) setup guide (no subscription required)
- Updated all tool counts across README, TOOLS.md, TOOL_PACKAGES.md, EXAMPLES.md to 270+
- Replaced all "21 modules" references with "all ServiceNow modules"
- Removed "Free, Forever" emphasis; replaced with accurate MIT license note

---

## [2.1.0] — 2026-02-21

### Added

#### New Tool Modules (102 new tools)
- **HR Service Delivery** (12 tools): `create_hr_case`, `get_hr_case`, `update_hr_case`, `list_hr_cases`, `close_hr_case`, `list_hr_services`, `get_hr_service`, `get_hr_profile`, `update_hr_profile`, `list_hr_tasks`, `create_hr_task`, `get_hr_case_activity`
- **Customer Service Management** (11 tools): `create_csm_case`, `get_csm_case`, `update_csm_case`, `list_csm_cases`, `close_csm_case`, `get_csm_account`, `list_csm_accounts`, `get_csm_contact`, `list_csm_contacts`, `get_csm_case_sla`, `list_csm_products`
- **Security Operations & GRC** (11 tools): `create_security_incident`, `get_security_incident`, `update_security_incident`, `list_security_incidents`, `list_vulnerabilities`, `get_vulnerability`, `update_vulnerability`, `list_grc_risks`, `get_grc_risk`, `list_grc_controls`, `get_threat_intelligence`
- **Flow Designer & Process Automation** (10 tools): `list_flows`, `get_flow`, `trigger_flow`, `get_flow_execution`, `list_flow_executions`, `list_subflows`, `get_subflow`, `list_action_instances`, `get_process_automation`, `list_process_automations`
- **Service Portal & UI Builder** (14 tools): `list_portals`, `get_portal`, `list_portal_pages`, `get_portal_page`, `list_portal_widgets`, `get_portal_widget`, `create_portal_widget`, `update_portal_widget`, `list_widget_instances`, `list_ux_apps`, `get_ux_app`, `list_ux_pages`, `list_portal_themes`, `get_portal_theme`
- **Integration & Middleware** (19 tools): REST Messages, Transform Maps, Import Sets, Event Registry, OAuth/Credentials
- **Notifications & Attachments** (12 tools): `list_notifications`, `get_notification`, `create_notification`, `update_notification`, `list_email_logs`, `get_email_log`, `list_attachments`, `get_attachment_metadata`, `delete_attachment`, `upload_attachment`, `list_email_templates`, `list_notification_subscriptions`
- **Performance Analytics & Data Quality** (13 tools): PA indicators, scorecards, time-series, dashboards, data completeness checks

#### Enhancements to Existing Modules (16 tools)
- **Scripting** (+11 tools): `list_ui_policies`, `get_ui_policy`, `create_ui_policy`, `list_ui_actions`, `get_ui_action`, `create_ui_action`, `update_ui_action`, `list_acls`, `get_acl`, `create_acl`, `update_acl`
- **Reporting** (+5 tools): `get_scheduled_job`, `create_scheduled_job`, `update_scheduled_job`, `trigger_scheduled_job`, `list_job_run_history`
- **Now Assist** (+1 tool): `generate_work_notes` — AI-drafted work notes for any record

#### New Role-Based Tool Packages
- `portal_developer` — Service Portal / UI Builder focused (~35 tools)
- `integration_engineer` — REST Messages, Transform Maps, Events (~30 tools)

#### ServiceNow Client Enhancements
- `uploadAttachment(table, recordSysId, fileName, contentType, contentBase64)` — Binary upload to Attachment API (`/api/now/attachment/file`)

#### Documentation
- Expanded `README.md` with beginner and advanced setup guides for 12 AI clients (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, ChatGPT, Gemini, Codex, Cline, Amazon Q, JetBrains AI, Docker)
- Updated `docs/TOOLS.md` — full 230-tool reference
- Updated `docs/TOOL_PACKAGES.md` — 12-package documentation
- Updated `docs/SCRIPTING.md` — UI Policies, UI Actions, ACL management guide
- Updated `docs/REPORTING.md` — Scheduled job CRUD and execution history
- Updated `EXAMPLES.md` — 120+ usage examples with new module examples

### Changed
- `src/server.ts` MCP server version bumped to `2.1.0`
- `src/tools/index.ts` expanded with 4 new module imports and 2 new packages
- Total tools: 112 → 230 (+118 net, includes HRSD/CSM/Security/Flow from imported modules)
- Total modules: 17 → 21

---

## [2.0.0] — 2025-02-20

### Added

#### Core Architecture
- Modular domain-based tool architecture — each domain has its own `src/tools/domain.ts` file
- Role-based tool packaging via `MCP_TOOL_PACKAGE` environment variable (10 packages)
- Four-tier permission system (`WRITE_ENABLED`, `CMDB_WRITE_ENABLED`, `SCRIPTING_ENABLED`, `NOW_ASSIST_ENABLED`)
- `src/utils/permissions.ts` — centralized permission gate functions
- ATF execution gating via `ATF_ENABLED` environment variable

#### New Tool Domains (97 new tools, 112 total)
- **Incident Management** (7 tools): `create_incident`, `get_incident`, `update_incident`, `resolve_incident`, `close_incident`, `add_work_note`, `add_comment`
- **Problem Management** (4 tools): `create_problem`, `get_problem`, `update_problem`, `resolve_problem`
- **Change Management** (5 tools): `get_change_request`, `list_change_requests`, `update_change_request`, `submit_change_for_approval`, `close_change_request`
- **Task Management** (4 tools): `get_task`, `list_my_tasks`, `update_task`, `complete_task`
- **Knowledge Base** (6 tools): `list_knowledge_bases`, `search_knowledge`, `get_knowledge_article`, `create_knowledge_article`, `update_knowledge_article`, `publish_knowledge_article`
- **Service Catalog** (4 tools): `list_catalog_items`, `search_catalog`, `get_catalog_item`, `order_catalog_item`
- **Approvals** (4 tools): `get_my_approvals`, `list_approvals`, `approve_request`, `reject_request`
- **SLA** (2 tools): `get_sla_details`, `list_active_slas`
- **User & Group Management** (8 tools): `list_users`, `create_user`, `update_user`, `list_groups`, `create_group`, `update_group`, `add_user_to_group`, `remove_user_from_group`
- **Reporting & Analytics** (8 tools): `list_reports`, `get_report`, `run_aggregate_query`, `trend_query`, `get_performance_analytics`, `export_report_data`, `get_sys_log`, `list_scheduled_jobs`
- **ATF Testing** (9 tools): `list_atf_suites`, `get_atf_suite`, `run_atf_suite`, `list_atf_tests`, `get_atf_test`, `run_atf_test`, `get_atf_suite_result`, `list_atf_test_results`, `get_atf_failure_insight`
- **Now Assist / AI** (10 tools): `nlq_query`, `ai_search`, `generate_summary`, `suggest_resolution`, `categorize_incident`, `get_pi_models`, `get_virtual_agent_topics`, `trigger_agentic_playbook`, `get_ms_copilot_topics`, `get_virtual_agent_stream`
- **Scripting** (16 tools): Business rules, script includes, client scripts, changesets (full CRUD)
- **Agile / Scrum** (9 tools): Stories, epics, scrum tasks (full CRUD)

#### Latest Release API Support
- Now Assist Agentic Playbooks (`POST /api/sn_assist/playbook/trigger`)
- ATF Failure Insight (`GET /api/now/table/sys_atf_failure_insight`)
- AI Search (`GET /api/now/ai_search/search`)
- Predictive Intelligence with LightGBM (`POST /api/sn_ml/solution/{id}/predict`)
- Performance Analytics API (`GET /api/now/pa/widget/{sys_id}`)
- Stats/Aggregate API (`GET /api/now/stats/{table}`)
- Microsoft Copilot 365 topic bridge (`/api/sn_assist/copilot/topics`)
- Virtual Agent streaming API

#### Client Integration Support
- **Claude Desktop**: Basic Auth and OAuth config templates (`clients/claude-desktop/`)
- **Claude Code**: Setup guide with `claude mcp add` commands
- **OpenAI Codex / GPT-4.1**: Python function-calling client (`clients/codex/servicenow_openai_client.py`)
- **Google Gemini / Vertex AI**: Python function-calling client (`clients/gemini/servicenow_gemini_client.py`)
- **Cursor**: MCP config files for basic and OAuth (`clients/cursor/.cursor/`)
- **VS Code**: MCP config files with extensions recommendations (`clients/vscode/.vscode/`)
- All clients include both `.env.basic.example` and `.env.oauth.example` files

#### ServiceNow Client Enhancements
- `createRecord(table, data)` — POST to Table API
- `updateRecord(table, sysId, data)` — PATCH to Table API
- `deleteRecord(table, sysId)` — DELETE from Table API
- `callNowAssist(endpoint, payload)` — POST to Now Assist / AI endpoints
- `runAggregateQuery(table, groupBy, aggregate, query)` — GET Stats API

#### Documentation
- Comprehensive `README.md` with beginner and advanced developer guides
- `docs/TOOLS.md` — full 112-tool reference with parameters and permissions
- `docs/TOOL_PACKAGES.md` — role-based package documentation
- `docs/CLIENT_SETUP.md` — unified setup guide for all 6 AI clients
- `docs/NOW_ASSIST.md` — Now Assist / AI integration guide
- `docs/ATF.md` — ATF testing guide with Failure Insight walkthrough
- `docs/SCRIPTING.md` — scripting management guide with latest release notes
- `docs/REPORTING.md` — reporting and analytics guide
- `docs/MULTI_INSTANCE.md` — multi-instance setup guide
- Per-client `SETUP.md` in each `clients/*/` directory
- `instances.example.json` — multi-instance config template

#### Configuration
- Updated `.env.example` with all new environment variables

### Changed
- `src/tools/index.ts` refactored into a domain router with package filtering
- Original 15 tools migrated to `src/tools/core.ts` (unchanged behavior)
- `src/servicenow/types.ts` expanded with 100+ new interfaces
- Version bumped from 1.0.0 to 2.0.0

---

## [1.0.0] — 2025-02-12

### Added
- Initial release with 15 tools
- Core platform tools: query records, get record, get table schema, get user, get group
- CMDB tools: search CI, get CI, list relationships
- ITOM tools: list discovery schedules, list MID servers, list active events, CMDB health dashboard, service mapping summary
- ITSM: create change request
- Experimental: natural language search, natural language update
- Basic Auth and OAuth 2.0 support
- Read-only by default with `WRITE_ENABLED` flag
- Vitest test suite
