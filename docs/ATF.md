# ATF Testing Guide (Latest Release)

This guide covers the 9 Automated Test Framework (ATF) tools available when `ATF_ENABLED=true`.

## Prerequisites

```env
ATF_ENABLED=true
WRITE_ENABLED=true  # Required for running tests (write operations)
```

## Tool Overview

| Tool | Permission | Description |
|------|-----------|-------------|
| `list_atf_suites` | Read | List test suites |
| `get_atf_suite` | Read | Get suite details |
| `run_atf_suite` | ATF_ENABLED | Execute a test suite |
| `list_atf_tests` | Read | List test cases |
| `get_atf_test` | Read | Get test details |
| `run_atf_test` | ATF_ENABLED | Execute a single test |
| `get_atf_suite_result` | Read | Get suite run results |
| `list_atf_test_results` | Read | List test results |
| `get_atf_failure_insight` | Read | **Latest**: Failure Insight analysis |

## Common Workflows

### Run Regression Suite After Deployment

```
1. List available test suites
   → list_atf_suites

2. Run the regression suite
   → run_atf_suite sys_id="<suite_sys_id>"
   → Returns: {result_sys_id: "abc123", status: "running"}

3. Get results
   → get_atf_suite_result result_sys_id="abc123"
   → Returns: {status: "complete", passed: 47, failed: 2}

4. Investigate failures (ATF Failure Insight)
   → get_atf_failure_insight result_sys_id="abc123"
   → Returns: changes between last pass and this failure
```

### ATF Failure Insight

`get_atf_failure_insight` is a latest release tool that compares metadata between the last successful ATF run and the current failed run. It surfaces:

- User role changes (a role was added/removed from the ATF user)
- Field value changes on records referenced by tests
- Configuration changes that may have broken test assertions

**Example output**:
```json
{
  "changes_since_last_pass": [
    {
      "type": "role_change",
      "user": "atf_test_user",
      "removed_role": "itil",
      "changed_at": "2025-03-15T10:23:00Z"
    },
    {
      "type": "field_change",
      "table": "sys_properties",
      "field": "glide.authenticate.multifactor",
      "old_value": "false",
      "new_value": "true"
    }
  ]
}
```

API: `GET /api/now/table/sys_atf_failure_insight`

## ServiceNow ATF APIs

| API | Endpoint |
|-----|----------|
| Run Suite | `POST /api/now/atf/runner/run_suite` |
| List Suites | `GET /api/now/table/sys_atf_test_suite` |
| Get Results | `GET /api/now/table/sys_atf_result` |
| Failure Insight | `GET /api/now/table/sys_atf_failure_insight` |

## Configuration Example

```env
ATF_ENABLED=true
WRITE_ENABLED=true
MCP_TOOL_PACKAGE=platform_developer
```
