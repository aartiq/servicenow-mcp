# Reporting & Analytics Guide (Latest Release)

This guide covers the 13 reporting and analytics tools. Read tools require no special flags. Scheduled job write tools require `WRITE_ENABLED=true`.

## Tool Overview

| Tool | Description | API Used | Permission |
|------|-------------|----------|------------|
| `list_reports` | List saved reports | Table API (`sys_report`) | Read |
| `get_report` | Get report definition | Table API | Read |
| `run_aggregate_query` | GROUP BY query with COUNT/SUM | Stats API (`/api/now/stats/{table}`) | Read |
| `trend_query` | Monthly trend data | Stats API (date bucketing) | Read |
| `get_performance_analytics` | PA widget data | PA API (`/api/now/pa/widget/{sys_id}`) | Read |
| `export_report_data` | Structured data export | Table API | Read |
| `get_sys_log` | System log entries | Table API (`sys_log`) | Read |
| `list_scheduled_jobs` | Scheduled jobs list | Table API (`sys_trigger`) | Read |
| `get_scheduled_job` | Get a scheduled job record | Table API (`sysauto`) | Read |
| `create_scheduled_job` | Create a new scheduled script | Table API (`sysauto_script`) | Write |
| `update_scheduled_job` | Update schedule or script | Table API (`sysauto`) | Write |
| `trigger_scheduled_job` | Force immediate execution | Table API (`sysauto`) PATCH | Write |
| `list_job_run_history` | Execution history log | Table API (`sysauto_trigger_log`) | Read |

## Common Use Cases

### Incident Trend by Priority (Last 6 Months)

```
run trend_query:
  table: incident
  date_field: opened_at
  group_by: priority
  periods: 6
```

Returns monthly counts grouped by priority level.

### SLA Compliance Rate

```
run_aggregate_query:
  table: task_sla
  group_by: has_breached
  aggregate: COUNT
```

Returns count of breached vs. compliant SLAs.

### Top Teams by Open Incidents

```
run_aggregate_query:
  table: incident
  group_by: assignment_group
  query: state!=6
  aggregate: COUNT
```

### Performance Analytics Widget

```
get_performance_analytics:
  widget_sys_id: <PA widget sys_id>
  time_range: last_30_days
```

Uses the ServiceNow Performance Analytics API: `GET /api/now/pa/widget/{sys_id}`

## Scheduled Job Workflows

### Create and Schedule a Script

```
1. Create a new daily script job
   → create_scheduled_job name="Nightly Cleanup" script="gs.info('running');" run_type="daily" run_time="02:00:00"

2. Verify the job was created
   → get_scheduled_job sys_id="<sys_id>"

3. Trigger immediately to test
   → trigger_scheduled_job sys_id="<sys_id>"

4. Check execution history
   → list_job_run_history job_sys_id="<sys_id>"
```

### Update a Scheduled Job

```
1. List all active scheduled jobs
   → list_scheduled_jobs active=true

2. Update the script or schedule
   → update_scheduled_job sys_id="<sys_id>" fields={script: "// updated script", run_type: "weekly"}
```

## Latest Reporting APIs

| API | Endpoint | Notes |
|-----|----------|-------|
| Stats (Aggregate) | `GET /api/now/stats/{table}` | GROUP BY, SUM, COUNT, AVG |
| Performance Analytics | `GET /api/now/pa/widget/{sys_id}` | PA scorecard data |
| Reporting | `GET /api/now/reporting` | Saved report search (latest release) |
| Table (for sys_report) | `GET /api/now/table/sys_report` | Report definitions |
