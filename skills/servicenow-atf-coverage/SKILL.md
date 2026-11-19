---
name: servicenow-atf-coverage
description: Find ServiceNow scripts with no Automated Test Framework coverage and close the gaps using NowAIKit MCP tools. Report coverage per script, flag recently changed code with no tests, run suites and explain failures. Use when the user asks about test coverage, untested code, ATF gaps, running ATF suites, or why an ATF test failed.
license: MIT
compatibility: Needs the NowAIKit MCP server (nowaikit 5.0 or later)
---

# ServiceNow ATF coverage

Show where tests are missing, focus on recently changed code, and verify with real ATF runs.

## Workflow

1. **Coverage.** `get_atf_code_coverage` for coverage per script and the list of recently changed scripts with no coverage. Those recent changes are the first priority.
2. **What exists.** `list_atf_suites` and `list_atf_tests` to see current suites and tests, and which ones touch the tables or scripts in question.
3. **Plan tests.** For each priority gap, propose test steps (record setup, the action that triggers the script, assertions on the result). Show the plan before building anything.
4. **Run.** `run_atf_suite` runs async: start it, then poll `get_atf_suite_result` until it completes.
5. **Explain failures.** `get_atf_failure_insight` for failing tests: the step, the error and the likely cause. Separate test problems from real defects.
6. **Report.** Coverage before and after, gaps left, and the failures with a suggested fix.

## Rules
- Read-only first. Coverage and listings do not change anything.
- Running ATF needs `ATF_ENABLED=true`. Any write, such as creating test records with `create_record`, needs `WRITE_ENABLED=true`. Show the plan first.
- Run ATF only on dev or test instances. Treat an unknown instance as production and do not run there.
- Link every script, test and result using the `record_url` the tools return. Never invent URLs.
