# Role-based tool packages

There are two independent ways to control how many tools your AI client sees: **discovery mode** (how
the catalog is exposed) and **packages** (which subset is in scope). They compose.

## Discovery mode (`MCP_TOOL_DISCOVERY`)

The full catalog is 500+ tools. Some clients cap how many an MCP server can advertise (Claude cloud
tasks cap at 500), and loading every definition also costs context. Discovery mode keeps the advertised
list small while keeping the whole catalog reachable.

| Mode | Advertised tools | Use when |
|------|------------------|----------|
| `lean` | 17: `search_tools`, `run_tool`, `get_job` and 14 core record, schema and instance tools. The model finds anything else on demand, and `search_tools` adds what it finds to the session's tool list (clients that support `tools/list_changed` see them straight away; others call them through `run_tool`). | Recommended default. Works with every client, keeps token cost low. `nowaikit setup` writes this for the full package. |
| `core` | 14: only the core CRUD, query and instance tools, no `search_tools`. | You want a fixed, deterministic set with no discovery round-trip. |
| unset | The whole package (all 500+ for `full`). | A client with no tool cap where you want everything listed directly. |

```bash
MCP_TOOL_DISCOVERY=lean
# or pass the launch flag: npx -y nowaikit --lean
```

Clients that render MCP Apps (Claude, ChatGPT, VS Code) also get the three interactive form tools
(`open_catalog_form`, `open_record_form`, `open_approvals`) in every mode, including `lean`, `core` and
any package. Set `NOWAIKIT_MCP_APPS=false` to turn them off.

## Packages (`MCP_TOOL_PACKAGE`)

Load a role-specific subset instead of the full set. This keeps the tool list focused for a given role.
Packages are already small, so they don't usually need `lean`.

## Available packages

Counts are what the server advertises for each package, including `search_tools`. They are computed
from `PACKAGE_TOOL_NAMES` in `src/tools/index.ts`. `SN_PERSONA` (or `--persona`) is a short alias that
picks the package for you.

| Package | `SN_PERSONA` | Target role | Tools |
|---------|--------------|-------------|------:|
| `full` | `full` | All roles (default) | 581 |
| `service_desk` | `itsm` | IT help desk agent | 27 |
| `change_coordinator` | `change` | Change manager | 21 |
| `knowledge_author` | `knowledge` | KB content creator | 14 |
| `catalog_builder` | `catalog` | Catalog administrator | 17 |
| `system_administrator` | `admin` | System administrator | 96 |
| `platform_developer` | `developer` | Platform developer | 78 |
| `itom_engineer` | `itom` | ITOM and CMDB engineer | 28 |
| `agile_manager` | `agile` | Agile team lead | 14 |
| `ai_developer` | `ai` | Otto (Now Assist) and AI agent developer | 69 |
| `portal_developer` | `portal` | Service Portal and UI Builder developer | 38 |
| `integration_engineer` | `integration` | Integration specialist | 35 |
| `devops_engineer` | `devops` | DevOps and pipeline engineer | 28 |
| `itam_analyst` | `itam` | IT Asset Management analyst | 13 |

The package name itself also works as a persona (`SN_PERSONA=service_desk`). A few older persona names
map to the full set: `msp`, `hrsd`, `csm` and `grc`. `readonly` gives the full set with writes off, and
`architect` maps to `platform_developer`.

## Usage

```bash
# In .env file
MCP_TOOL_PACKAGE=service_desk

# Or by persona
SN_PERSONA=itsm

# Or as a launch flag
npx -y nowaikit --persona itsm

# In Claude Desktop config
"env": {
  "MCP_TOOL_PACKAGE": "service_desk"
}
```

## Package definitions

### full
All 581 tools. Default when `MCP_TOOL_PACKAGE` is not set.

### service_desk
Tools for IT help desk agents handling incidents, requests, and approvals.

Includes:
- All incident tools (create, get, update, resolve, close, work notes, comments)
- All approval tools (list my approvals, approve, reject) and the interactive approvals view
- Knowledge search and retrieval (read-only)
- Interactive catalog and record forms (`open_catalog_form`, `open_record_form`)
- SLA tracking
- Task management
- Core read tools

### change_coordinator
Tools for change managers reviewing and coordinating change requests.

Includes:
- All change request tools
- Approval tools
- Problem management (read + create)
- CMDB CI read tools
- Core read tools

### knowledge_author
Tools for creating and publishing knowledge base content.

Includes:
- Full knowledge base tools (create, update, publish)
- Catalog read tools
- Core read tools

### catalog_builder
Tools for building and managing the service catalog.

Includes:
- Full catalog tools, including catalog variables, catalog UI policies and approval rules
- Interactive catalog form for testing items
- User and group read tools
- Core read tools

### system_administrator
Tools for system administrators managing users, groups, schedules, and security.

Includes:
- Full user and group management
- Reporting, analytics, and scheduled job management (create/update/trigger)
- Notifications and email log
- Attachment management (upload, list, delete)
- ACL management, including Deny Unless ACLs and the ACL posture check (`get_acl_posture`)
- Release awareness (`get_release_info`), integration authentication posture and the table operation trace
- Performance Analytics and data quality checks, including Platform Analytics dashboards and their migration status
- OAuth applications and credential aliases
- System properties (single and bulk)
- Update set management
- CMDB reconciliation (duplicates, orphans, stale CIs)
- Instance Scan (suites, findings, summary, running a scan)
- System log
- Core read tools

### platform_developer
Tools for platform developers managing scripts, automations, and security rules.

Includes:
- Full scripting tools (business rules, script includes, client scripts)
- UI Policies and UI Actions (create/update)
- ACL rule management
- Changeset management
- ATF testing tools and ATF code coverage (`get_atf_code_coverage`)
- What runs when for a table operation (`trace_table_operation`) and the release check (`get_release_info`)
- Scoped applications
- Fluent and ServiceNow SDK tools (`fluent_init`, `fluent_build`, `fluent_install`, `fluent_pack` and the rest)
- ServiceNow documentation search
- Instance Scan (suites, findings, summary, running a scan)
- Core read tools
- Requires: `SCRIPTING_ENABLED=true` for script changes (script reads need nothing),
  `ATF_ENABLED=true` to run tests, `FLUENT_ENABLED=true` for SDK commands

### portal_developer
Tools for Service Portal and UI Builder developers.

Includes:
- Full Service Portal tools (portals, pages, widgets CRUD)
- Next Experience / UI Builder apps and pages
- Portal themes
- UI Policies and UI Actions
- Client script management
- Changeset management
- Core read tools
- Requires: `SCRIPTING_ENABLED=true` (for write tools)

### integration_engineer
Tools for integration and middleware specialists.

Includes:
- REST Message configuration (create/list)
- Transform Map execution and field mapping
- Import Set management
- Event registry and event firing
- OAuth and credential alias read tools, integration authentication posture (Basic auth restriction) and MCP exposure
- Changeset management
- Core read tools
- Requires: `WRITE_ENABLED=true`, `SCRIPTING_ENABLED=true` (for register_event)

### itom_engineer
Tools for IT operations and CMDB engineers.

Includes:
- Full CMDB tools (read + create/update with CMDB_WRITE_ENABLED)
- Discovery and MID server tools
- Event management tools
- Service Mapping
- CSDM health, ServiceNow Data Foundations scores and AI and MCP CIs (`get_csdm_health`, `get_cmdb_data_foundations`, `list_ai_inventory_cis`)
- Core read tools

### agile_manager
Tools for agile team leads managing sprints and backlogs.

Includes:
- Full agile/scrum tools (stories, epics, tasks)
- User read tools
- Core read tools

### ai_developer
Tools for developers building Now Assist and AI integrations.

Includes:
- Now Assist (Otto) tools: NLQ, AI Search, categorization, Virtual Agent and Copilot topics
- Now Assist skills (create, list, get, test)
- AI agents, agentic workflows and playbooks
- ServiceNow Action Fabric: the instance's MCP servers (`sn_mcp_*`) and A2A agents (`sn_a2a_*`)
- AI governance reads: model provider per skill, runtime metrics, who can run each agent, agent teams and strategies, external agent runs and MCP exposure
- Predictive Intelligence tools
- Fluent query and batch tools, ServiceNow documentation search
- Knowledge read tools
- Core read tools
- Requires: `NOW_ASSIST_ENABLED=true` for generative tools, OAuth sign-in with JWT tokens for Action Fabric

### devops_engineer
Tools for DevOps engineers managing CI/CD pipelines and deployment tracking.

Includes:
- DevOps pipeline and deployment tools (list, get, create, track, insights)
- Update Set management (create, switch, complete, preview, export)
- Change request tools (create, get, list)
- Core read tools

### itam_analyst
Tools for IT Asset Management analysts tracking hardware and software assets.

Includes:
- Asset lifecycle tools (list, get, create, update, retire)
- Software license compliance tools
- Asset contract management
- Core read tools

## Permission requirements by package

| Package | WRITE_ENABLED | Additional Flags |
|---------|--------------|-----------------|
| `full` | Depends on use | All flags apply |
| `service_desk` | true (for create/resolve) | |
| `change_coordinator` | true (for updates) | |
| `knowledge_author` | true (for create/publish) | |
| `catalog_builder` | true | |
| `system_administrator` | true | |
| `platform_developer` | true | `SCRIPTING_ENABLED=true`, `ATF_ENABLED=true`, `FLUENT_ENABLED=true` |
| `itom_engineer` | true | `CMDB_WRITE_ENABLED=true` |
| `agile_manager` | true | |
| `ai_developer` | false | `NOW_ASSIST_ENABLED=true` |
| `portal_developer` | true | `SCRIPTING_ENABLED=true` |
| `integration_engineer` | true | `SCRIPTING_ENABLED=true` (for register_event) |
| `devops_engineer` | true | |
| `itam_analyst` | true | |
