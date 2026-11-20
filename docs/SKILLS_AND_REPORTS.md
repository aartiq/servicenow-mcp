# Skills & Branded Reports

NowAIKit can run a capability end to end from the command line, no MCP client needed. It fetches the ServiceNow data for you, hands it to an AI model, and writes the result to the terminal, a Markdown file, or a branded PDF/PPTX. This is "direct mode" (also called Apex skills): you bring your own model, NowAIKit does the ServiceNow work around it.

## Run a skill

```bash
# See the available skills
nowaikit capabilities

# Run one against a configured instance
nowaikit run scan-health -i demo2

# Write the output to a file
nowaikit run scan-health -i demo2 -o health.md
```

Common flags: `-i <instance>`, `-p <provider>`, `-m <model>`, `-t <table>`, `-s <scope>`, `-f <focus>`, `--arg <key=value>`, `--format <md|pdf|pptx>`, `-o <file>`.

`--arg` passes a skill argument and can be repeated, for example `--arg incident=INC0010001`, `--arg change=CHG0030001`, `--arg updateset="Release 4"`, `--arg operation=insert` or `--arg days=30`.

## What a skill gathers

Before the model is called, NowAIKit runs the skill's data plan: the read-only tools, queries and counts that skill needs, through the same code the MCP server uses. Nothing is written, and tools that change data are never run in direct mode.

- Every record in the data carries a `record_url`, and every list carries a `list_url`, so the report can link to the real record instead of making up a link.
- The data starts with a `data_coverage` section. Anything that could not be gathered (a missing argument, a plugin that is not installed, a table the account cannot read) is listed with the reason, and the report says so instead of guessing.
- Single-record skills take the record as an argument (`ops-triage --arg incident=...`, `ops-risk --arg change=...`). Without one they pick the most relevant open record and say which.

## Assessment skills

| Skill | What it reports |
|-------|-----------------|
| `ai-governance-audit` | AI Control Tower assets and approvals, the LLM provider behind each Otto skill, who can run each AI agent, Guardian and guardrails, MCP and A2A exposure, AI CIs and runtime health |
| `csdm-data-foundations` | ServiceNow's own CMDB and CSDM Data Foundations scores (CSDM stages Foundation to Fly, CMDB tabs, KB playbook links), CSDM 5 domains, services and offerings, product models, relationships and life cycle stage adoption |
| `integration-auth-audit` | The Basic auth restriction: which integrations break when the default decision flips, OAuth clients by grant and token format, credential aliases, outbound Basic auth, failed logins, and an OAuth migration plan |
| `mcp-exposure-review` | MCP servers and tools, A2A agents and who can call them, external agent providers, OAuth clients and the agent MCP properties |
| `atf-coverage` | ATF code coverage per script, recently changed scripts with no tests, suites and results, and the tests to write first |
| `table-execution-order` | Everything that runs for one table operation in order (ACLs, data policies, business rules, engines, notifications, flows, workflows), with a Mermaid diagram |
| `process-insights` | Process Mining projects and findings plus reassignment and reopen data: bottlenecks, automation candidates and a plan |
| `zero-day-response` | One named threat from intel to closure: the CVEs and their CISA KEV deadline, vulnerable items and services, remediation tasks, changes, exceptions and the security incident, with next actions |
| `kev-compliance-report` | CISA KEV items against their due dates: fixed on time, late, open and overdue, by group and CVE, with the trend |
| `vuln-exposure-brief` | A one-page CISO brief: posture, KEV position, a named threat, exposed services and the decisions needed |

Existing skills now cover more: `scan-upgrade` reads the release from `glide.buildtag.last` and checks the known Australia and Brazil changes, `review-acls` and `scan-security` cover Deny Unless ACLs and ACLs whose role no longer exists, and `scan-cmdb` uses Data Foundations and the CSDM life cycle fields.

```bash
nowaikit run ai-governance-audit -i demo2 -p claude-cli -o ai-governance.md
nowaikit run table-execution-order -i demo2 -t incident --arg operation=insert
nowaikit report csdm-data-foundations -i demo2 -p claude-cli --brand-company "Acme"
nowaikit report zero-day-response -i demo2 -p claude-cli --arg threat=PHP2Shell --arg cve=CVE-2026-109618,CVE-2026-109619
```

Record links in a report always come from the gathered data. If the model writes a link to a record that is not in the data (for example a garbled sys_id), NowAIKit turns it back into plain text.

With `-p claude-cli`, the call runs with no tools and at low effort, since the data is already gathered. Set `NOWAIKIT_CLAUDE_EFFORT` (low, medium, high) and `NOWAIKIT_LLM_TIMEOUT_MS` (default 10 minutes) to change that.

## Instance Scan skills

ServiceNow's Instance Scan runs best-practice checks (security, performance, upgradability, manageability and user experience) and stores the results on the instance. NowAIKit reads those results and builds them into the scan skills.

`scan-instance` is the dedicated Instance Scan report. It takes the latest and previous run of every saved scan and covers:

- scores, plus findings grouped by category, priority, check, table and application
- which checks are new, worse, better or resolved since the previous run
- whether any checks cover Now Assist, AI agents or Virtual Agent, compared with the AI agents and skills on the instance
- remediation for the top checks, based on each check's own resolution notes

```bash
# Report on the results already on the instance
nowaikit run scan-instance -i demo2 -p claude-cli -o scan.md

# Security checks only
nowaikit run scan-instance -i demo2 -s security

# One scan result (sys_id, SR number or CI/CD progress id)
nowaikit run scan-instance -i demo2 --scan-result SR0001234

# Run a suite first, wait for it, then report on the new result
nowaikit run scan-instance -i demo2 --run-scan "suite:Instance Security Hardening Settings"
```

`--run-scan` accepts the following:

- `suite:<name or sys_id>` re-runs a suite's saved instance-wide scan.
- `combo:<sys_id>` re-runs a saved scan combo.
- `point:<table>:<sys_id>` scans one record.
- `apps:<suite>:<scope ids>` runs a suite against scoped apps.
- `update-sets:<suite>:<ids>` runs a suite against update sets.
- `full` runs every active check. On a large instance that can take hours.

Scans run through the CI/CD REST API, so the account needs `sn_cicd.sys_ci_automation` or admin. NowAIKit polls the progress for up to 15 minutes. Set `NOWAIKIT_SCAN_TIMEOUT_MS` to wait longer. The CI/CD API can only re-run a suite that has already been run once instance-wide. For a new suite, run it once from Instance Scan in the platform UI.

`scan-health`, `scan-security`, `scan-debt` and `scan-upgrade` also pull the Instance Scan findings that matter to them (performance and manageability, security, manageability and upgradability, and upgradability) and cite them as evidence.

In an MCP client the same data comes from three tools:

- `get_instance_scan_summary` gives the grouped view.
- `get_instance_scan_findings` lists individual findings, filtered by result, check, category, priority or table.
- `run_instance_scan` starts a scan. It needs `WRITE_ENABLED=true`. Pass `async: true` to follow the scan as a job.

## Choose a model

You can point NowAIKit at a hosted API, a local model, or your own AI subscription.

| Provider | Flag | Key needed? |
|----------|------|-------------|
| Anthropic | `-p anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `-p openai` | `OPENAI_API_KEY` |
| Gemini | `-p gemini` | `GEMINI_API_KEY` |
| Ollama (local) | `-p ollama` | no |
| LM Studio (local) | `-p lmstudio` | no |
| **Claude Code subscription** | `-p claude-cli` | **no** |
| **Codex subscription** | `-p codex-cli` | **no** |

### Using your own Claude Code or Codex subscription

If you already pay for Claude Code or Codex, you don't need an API key. NowAIKit shells out to the CLI you already have signed in:

```bash
nowaikit run scan-health -i demo2 -p claude-cli
nowaikit run scan-health -i demo2 -p codex-cli
```

If the binary isn't on your `PATH`, point to it with `NOWAIKIT_CLAUDE_BIN` or `NOWAIKIT_CODEX_BIN`.

For a fully on-device run (nothing leaves the machine), use `-p ollama` with a local model. That is the recommended setup for sensitive or regulated instances: ServiceNow, your laptop, and the model all stay local.

## Branded PDF and PPTX reports

Add `--format pdf` (or `pptx`) to turn a skill's output into a client-ready report. By default it carries NowAIKit branding. To white-label it, set a company name, accent colour, and logo:

```bash
nowaikit run scan-health -i demo2 -p claude-cli \
  --format pdf \
  --brand-company "Acme" \
  --brand-color "#2563EB" \
  --brand-logo ./logo.png \
  -o ./acme-scan-health.pdf
```

- `--brand-company` — name on the cover and footer.
- `--brand-color` — accent colour, any hex (with or without `#`).
- `--brand-logo` — PNG shown on the cover. Optional.

`report` is a shortcut for `run --format pdf`, so this also works:

```bash
nowaikit report scan-health -i demo2 -p claude-cli --brand-company "Acme"
```

### Scores, finding IDs, links and the findings register

- Assessment skills end with `Score: NN/100` and a score per area. The PDF shows the score and the area table on the summary page.
- Each finding has a stable ID (for example `ACL-03`), a severity, evidence with a link to the record, the impact, the recommendation and an effort (S, M or L).
- Markdown links and URLs in the output become clickable links in the PDF and PPTX.
- Next to every PDF or PPTX, NowAIKit writes a findings register as `<name>.findings.csv` and `<name>.findings.json`, one row per finding, ready for a spreadsheet or a backlog.

### Branding via environment variables

Handy when the same branding applies to every run (CI, a client engagement):

```bash
export NOWAIKIT_REPORT_COMPANY="Acme"
export NOWAIKIT_REPORT_ACCENT="#2563EB"
export NOWAIKIT_REPORT_LOGO="/path/to/logo.png"
export NOWAIKIT_REPORT_FOOTER="Acme Confidential"

nowaikit run scan-health -i demo2 -p claude-cli --format pdf -o report.pdf
```

Precedence is CLI flag, then environment variable, then the NowAIKit default. Leave everything unset and reports look exactly as before. White-labelled reports keep a small "Powered by NowAIKit" line.

## Notes

- Direct mode is a single text-in, text-out call around data NowAIKit already fetched (see "What a skill gathers"). It is not agentic tool-calling, which is why a CLI subscription (`claude-cli` / `codex-cli`) fits cleanly here but not in the agentic chat clients.
- The instance type you pick during `nowaikit setup` (Production, Development, Demo, Test/QA) is a label for your own record keeping; it doesn't change tool behaviour.
