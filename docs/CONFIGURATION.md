# Configuration reference

Every NowAIKit setting is an environment variable, set in your AI client's MCP config, a `.env` file in
the working directory, or your shell. `nowaikit setup` writes the common ones for you and
`nowaikit doctor` checks them. This page is the full list.

## Older names that still work

Earlier docs and the website used some shorter names. They are all accepted, and when both a short
name and its canonical name are set, the canonical name wins.

| Older name | Same as |
|------------|---------|
| `SN_INSTANCE_URL` | `SERVICENOW_INSTANCE_URL` |
| `SN_USERNAME` / `SN_PASSWORD` | `SERVICENOW_USERNAME` / `SERVICENOW_PASSWORD` (basic auth, or the OAuth user when a client ID is set) |
| `SN_OAUTH_CLIENT_ID` / `SN_OAUTH_CLIENT_SECRET` | `SERVICENOW_OAUTH_CLIENT_ID` / `SERVICENOW_OAUTH_CLIENT_SECRET` (and implies `SERVICENOW_AUTH_METHOD=oauth`) |
| `SN_AUTH_METHOD` | `SERVICENOW_AUTH_METHOD` |
| `SN_PERSONA` | `MCP_TOOL_PACKAGE`, see [Tool packages](TOOL_PACKAGES.md) for the persona names |
| `HTTP_PORT` | `PORT` |
| `SN_BEARER_TOKEN` | `SERVICENOW_BEARER_TOKEN` |

## Launch flags

An MCP client can pass these after `npx -y nowaikit` (or `nowaikit mcp`) instead of setting env vars.
Unlike the env aliases, an explicit flag always applies.

| Flag | Sets |
|------|------|
| `--allow-write` | `WRITE_ENABLED=true` |
| `--allow-cmdb` | `WRITE_ENABLED=true`, `CMDB_WRITE_ENABLED=true` |
| `--allow-scripting` | `WRITE_ENABLED=true`, `SCRIPTING_ENABLED=true` |
| `--allow-atf` | `ATF_ENABLED=true` |
| `--allow-agentic` (or `--allow-now-assist`) | `NOW_ASSIST_ENABLED=true` |
| `--allow-fluent` | `FLUENT_ENABLED=true` |
| `--allow-all` | write, CMDB, scripting, ATF and Now Assist |
| `--read-only` | write, CMDB and scripting off |
| `--lean` | `MCP_TOOL_DISCOVERY=lean` |
| `--persona <name>` | `SN_PERSONA` |
| `--package <name>` | `MCP_TOOL_PACKAGE` |
| `--discovery <mode>` | `MCP_TOOL_DISCOVERY` |
| `--instance <name>` | `SN_DEFAULT_INSTANCE` |
| `--transport <stdio\|sse\|http>` | `TRANSPORT` |
| `--port <n>` | `PORT` |

## Connection and authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICENOW_INSTANCE_URL` | (required) | e.g. `https://yourcompany.service-now.com` |
| `SERVICENOW_AUTH_METHOD` | `basic` | `basic` or `oauth` |
| `SERVICENOW_BASIC_USERNAME` / `SERVICENOW_BASIC_PASSWORD` | | Basic-auth credentials. |
| `SERVICENOW_OAUTH_CLIENT_ID` / `SERVICENOW_OAUTH_CLIENT_SECRET` | | OAuth app credentials. |
| `SERVICENOW_OAUTH_USERNAME` / `SERVICENOW_OAUTH_PASSWORD` | | Service account for the OAuth password grant. |
| `SERVICENOW_BEARER_TOKEN` | | A pre-obtained access token. Lets a process connect with only a token (used by gateways). |
| `SN_INSTANCES_CONFIG` | | Path to an `instances.json` file. See [Multi-instance](MULTI_INSTANCE.md). |
| `SN_INSTANCE_<NAME>_URL`, `_AUTH`, `_USERNAME`, `_PASSWORD`, `_CLIENT_ID`, `_CLIENT_SECRET` | | One group per instance. `_AUTH` is `basic` (default) or `oauth`. |
| `SN_DEFAULT_INSTANCE` | | The instance to start on when several are configured (env groups or the config file). |
| `NOWAIKIT_SN_MCP_TOKEN` | | Override the JWT bearer token the Action Fabric tools (`sn_mcp_*`, `sn_a2a_*`) send to ServiceNow's MCP and A2A endpoints. Normally not needed: `nowaikit auth login` with a JWT OAuth app covers it. |
| `MT_INSTANCE_ALLOW` | `.service-now.com` | Comma-separated host suffixes the server may connect to. Add yours for custom domains. |

For per-user OAuth login from the CLI, use `nowaikit auth login`, see
[OAuth setup](SERVICENOW_OAUTH_SETUP.md).

## Capability tiers (opt-in, off by default)

NowAIKit is read-only until you enable these. Each is a ceiling, see
[Delegated auth](DELEGATED_AUTH.md) for how they combine with per-request flags.

| Variable | Default | Description |
|----------|---------|-------------|
| `WRITE_ENABLED` | `false` | Allow create/update/delete. |
| `CMDB_WRITE_ENABLED` | `false` | Allow CMDB writes (needs `WRITE_ENABLED` too). |
| `SCRIPTING_ENABLED` | `false` | Allow script changes (business rules, script includes, client scripts, UI policies and actions, ACLs, changesets) and server-side script execution. Needs `WRITE_ENABLED` too. Reading scripts never needs it. |
| `ATF_ENABLED` | `false` | Allow ATF test execution. |
| `NOW_ASSIST_ENABLED` | `false` | Allow Now Assist (Otto) generative AI tools. |
| `FLUENT_ENABLED` | `false` | Allow the local ServiceNow SDK (`now-sdk`) commands behind the `fluent_*` tools. |

## Write guardrails and audit

| Variable | Default | Description |
|----------|---------|-------------|
| `NOWAIKIT_TABLE_DENYLIST` | | Comma-separated tables that may never be written, e.g. `sys_user,sys_properties`. |
| `NOWAIKIT_FIELD_DENYLIST` | | Comma-separated fields that may never be written, as `table.field` or a bare `field`. Credential fields are always blocked. |
| `NOWAIKIT_WRITE_SCOPE_PREFIX` | | If set, only tables starting with one of these prefixes may be written, e.g. `x_acme_`. |
| `NOWAIKIT_AUDIT_LOG` | `~/.config/nowaikit/audit.jsonl` | Where the append-only audit log of write calls goes. |
| `NOWAIKIT_AUDIT_DISABLED` | `false` | `true` turns the audit log off. |
| `NOWAIKIT_SKIP_MANDATORY_CHECK` | `false` | `true` skips the pre-write check for fields that data policies make mandatory. |

## Tool loading

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TOOL_DISCOVERY` | (unset) | `lean` advertises a small core plus `search_tools` and reaches the full catalog on demand. `core` advertises only the core CRUD tools. Unset advertises the whole package. Use `lean` for clients that cap tool count (Claude cloud tasks cap at 500). See [Tool packages](TOOL_PACKAGES.md). |
| `MCP_TOOL_PACKAGE` | `full` | Load a role-specific subset. See [Tool packages](TOOL_PACKAGES.md). |

| `NOWAIKIT_MCP_APPS` | (auto) | Interactive forms (`open_catalog_form`, `open_record_form`, `open_approvals`) in clients that render MCP Apps. `false` turns them off, `true` forces them on. |

`nowaikit setup` writes `MCP_TOOL_DISCOVERY=lean` for the full package by default, so a fresh install
stays under client caps while keeping every tool reachable.

## HTTP mode

Used by `nowaikit serve` or `TRANSPORT=http` / `sse`. Streamable HTTP MCP is at `/mcp`, SSE at `/sse`,
the REST API at `/api`, health at `/health` (and `/api/health`).

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT` | `stdio` | `stdio`, `sse` or `http`. |
| `PORT` | `3000` | Listening port (`HTTP_PORT` also works). |
| `HOST` | `0.0.0.0` (`127.0.0.1` with `nowaikit serve`) | Interface to bind. |
| `NOWAIKIT_API_KEY` | | Bearer key(s) the HTTP endpoints require, comma-separated for several. Unset means no auth, so set it on anything reachable from a network. |
| `CORS_ORIGIN` | `*` | Allowed CORS origin. |
| `NOWAIKIT_RATE_MAX` / `NOWAIKIT_RATE_WINDOW_MS` | `120` / `60000` | Request rate limit per client IP (max requests per window). `0` turns it off. |
| `NOWAIKIT_LOCAL_FILES` | on for stdio, off for HTTP | Lets `upload_attachment` read a local `file_path`. `true` forces it on, `false` off. |
| `NOWAIKIT_UPLOAD_DIRS` | | Restrict `file_path` uploads to these folders (path-delimiter separated). |
| `NOWAIKIT_UPLOAD_MAX_MB` | `50` | Size cap for `file_path` uploads. |

## Reliability

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_RETRIES` | `3` | Retries for failed reads. `0` means no retries (honored literally). Non-idempotent writes are never auto-retried when the response was lost, so a create can't be silently duplicated. |
| `RETRY_DELAY_MS` | `1000` | Base backoff between retries (exponential). |
| `REQUEST_TIMEOUT_MS` | `30000` | Per-request timeout. |

## Long-running operations

Some tools can take minutes: ATF suite runs, discovery scans, CMDB reconcile, transform maps, bulk
create and import, scheduled and PA job triggers, flows, playbooks, ML training and the ServiceNow SDK
(`fluent_build`, `fluent_cicd` and the rest). These tools run as background jobs so a slow call never
holds the chat open until the client gives up.

- Pass `async: true` to any of them to get a `job_id` back at once.
- Without it, the call runs as before. If it is still running after 20 seconds, it carries on as a job
  and the call returns `{ job_id, status: "running", poll_with: "get_job" }` instead of blocking.
  Calls that finish in time return exactly what they always did.
- `get_job` returns the status (`running`, `completed`, `failed`, `cancelled`), progress, elapsed time
  and, once finished, the tool result. `wait_seconds` (up to 25) waits for the end before answering.
  `list_jobs` lists your jobs and `cancel_job` stops one.
- Where ServiceNow runs the work in the background, the job follows ServiceNow's own status until it
  is done: ATF suites through the CI/CD progress API, discovery through `discovery_status`, flows through
  their flow context, and scheduled or PA jobs through the scheduler trigger. `get_job` then shows the
  final outcome, for example passed and failed test counts.
- `cancel_job` stops waiting at once. For ATF runs it also calls the CI/CD cancel API, and for flows
  `sn_fd.FlowAPI.cancel` (needs `SCRIPTING_ENABLED`). Other work already running in ServiceNow may still
  finish there, and nothing ServiceNow already did is rolled back.
- Jobs belong to whoever started them. Behind a gateway that is the delegated user (or token) and
  instance, and nobody else can see or cancel them. Without delegation every caller uses the server's
  own credentials, so they share one scope.
- Jobs live in the server's memory. Finished jobs are kept for an hour, and a restart forgets them (the
  ServiceNow side keeps running).

Clients that support MCP tasks get the same jobs as tasks, with no `async` flag needed:

- The 2026-07-28 tasks extension (`io.modelcontextprotocol/tasks`), used by Claude Code. When a request
  declares the extension, a long-running tool returns a task and the client polls `tasks/get`, which
  carries the progress as the status message and the result once done. `tasks/cancel` cancels.
- The 2025-11-25 tasks, used by VS Code. Long-running tools declare `execution.taskSupport: "optional"`,
  and `tasks/get`, `tasks/result`, `tasks/list` and `tasks/cancel` are served.

Progress notifications for clients that send a `progressToken` work as before.

| Variable | Default | Description |
|----------|---------|-------------|
| `NOWAIKIT_AUTO_ASYNC_MS` | `20000` | How long a long-running call may block before it continues as a job. `0` turns this off (calls block until done, as in 4.x). |
| `NOWAIKIT_JOB_TTL_MS` | `3600000` | How long a finished job is kept for `get_job`. |
| `NOWAIKIT_JOB_MAX_RUN_MS` | `7200000` | A job still running after this is stopped and marked failed. |
| `NOWAIKIT_JOB_POLL_MS` | `5000` | How often jobs poll ServiceNow for status, and the poll interval suggested to clients. |
| `NOWAIKIT_JOBS_MAX` | `200` | Jobs held in memory. The oldest finished jobs are dropped first. |
| `NOWAIKIT_JOBS_PER_USER` | `20` | Running jobs allowed per user at once. |

## Delegated auth (gateways, multi-tenant, backend-managed OAuth)

| Variable | Default | Description |
|----------|---------|-------------|
| `DELEGATED_AUTH` | (unset) | `true` enables delegated mode; `strict` requires a valid delegated token on every call and never falls back to base credentials. |
| `NOWAIKIT_REQUIRE_DELEGATION` | `false` | `true` enforces strict on top of `DELEGATED_AUTH=true`. |
| `NOWAIKIT_DELEGATED_SECRET` | | Shared secret that proves a request came from your trusted gateway. Set this in any real delegated deployment. |

Full contract (headers, error codes, capability model): [Delegated auth](DELEGATED_AUTH.md).

## CLI and misc

| Variable | Default | Description |
|----------|---------|-------------|
| `NOWAIKIT_OAUTH_PORT` | `8765` | Loopback port for the browser OAuth flow (`nowaikit auth login`). If 8765 is busy the CLI falls back to 8766, then 8767 (apps created by `nowaikit setup` register all three). Set this only to force a specific port, and register the matching redirect URL. |
| `NOWAIKIT_CLAUDE_BIN` / `NOWAIKIT_CODEX_BIN` | `claude` / `codex` | Path to the CLI binary when using the `claude-cli` / `codex-cli` provider or the web dashboard's Claude Code subscription option. |
| `NOWAIKIT_NO_UPDATE_CHECK` | `0` | `1` disables the startup update check. |
| `NOWAIKIT_MCP` | | `1` forces MCP server mode when `nowaikit` is launched (normally detected from piped stdio). |
| `NOWAIKIT_SYNC_DIR` | | Folder where `pull_artifact` writes one file per field (Local Sync). Unset returns content inline only. |
| `AGILE_TABLE_PREFIX` | `rm_` | Table prefix for the agile tools. |
| `LLM_PROVIDER` | `anthropic` | Default provider for `nowaikit run` / `report` (`anthropic`, `openai`, `gemini`, `ollama`, `lmstudio`, `claude-cli`, `codex-cli`). API keys come from `<PROVIDER>_API_KEY`, e.g. `ANTHROPIC_API_KEY`. |
| `NOWAIKIT_APEX_ENABLED` | `true` | `false` hides the AI skills (MCP prompts). |
| `SCRIPT_EXEC_ENDPOINT` | | Custom script execution endpoint, see [Script execution helper](SCRIPT-EXEC-HELPER.md). |
| `NOWAIKIT_REPORT_COMPANY`, `NOWAIKIT_REPORT_ACCENT`, `NOWAIKIT_REPORT_LOGO`, `NOWAIKIT_REPORT_FOOTER` | | White-label branding for PDF and PPTX reports. |

The setup wizard may also write `SN_INSTANCE_GROUP`, `SN_INSTANCE_ENVIRONMENT` and `SERVICENOW_AUTH_MODE`.
They are labels for the wizard and dashboard only and don't change how the server behaves.
