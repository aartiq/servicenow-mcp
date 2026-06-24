/**
 * ServiceNow Encoded Query Syntax Reference — static MCP resource.
 * Prevents LLM hallucination on query syntax by providing authoritative reference.
 */

export const QUERY_SYNTAX_REFERENCE = `# ServiceNow Encoded Query Syntax Reference

## Comparison Operators
| Operator | Syntax | Example |
|----------|--------|---------|
| Equals | \`field=value\` | \`active=true\` |
| Not equals | \`field!=value\` | \`state!=6\` |
| Greater than | \`field>value\` | \`priority<3\` |
| Greater or equal | \`field>=value\` | \`priority>=1\` |
| Less than | \`field<value\` | \`reassignment_count<5\` |
| Less or equal | \`field<=value\` | \`impact<=2\` |
| Contains | \`fieldLIKEvalue\` | \`short_descriptionLIKEnetwork\` |
| Does not contain | \`fieldNOT LIKEvalue\` | \`short_descriptionNOT LIKEtest\` |
| Starts with | \`fieldSTARTSWITHvalue\` | \`numberSTARTSWITHINC\` |
| Ends with | \`fieldENDSWITHvalue\` | \`nameENDSWITH-prod\` |
| Is empty | \`fieldISEMPTY\` | \`assigned_toISEMPTY\` |
| Is not empty | \`fieldISNOTEMPTY\` | \`resolved_atISNOTEMPTY\` |
| In list | \`fieldINvalue1,value2\` | \`stateIN1,2,3\` |
| Not in list | \`fieldNOT INvalue1,value2\` | \`priorityNOT IN4,5\` |
| Between | \`fieldBETWEENval1@val2\` | \`priorityBETWEEN1@3\` |
| Instance of | \`fieldINSTANCEOFvalue\` | \`sys_class_nameINSTANCEOFcmdb_ci_server\` |

## Logical Operators
| Operator | Syntax | Example |
|----------|--------|---------|
| AND | \`^\` | \`active=true^priority=1\` |
| OR | \`^OR\` | \`priority=1^ORpriority=2\` |
| New query | \`^NQ\` | \`active=true^NQstate=6\` (union of two queries) |

## Ordering
| Operation | Syntax | Example |
|-----------|--------|---------|
| Ascending | \`^ORDERBYfield\` | \`^ORDERBYnumber\` |
| Descending | \`^ORDERBYDESCfield\` | \`^ORDERBYDESCsys_created_on\` |

## Date Functions (JavaScript)
Use these in query values for dynamic date ranges:
| Function | Description | Example |
|----------|-------------|---------|
| \`javascript:gs.daysAgo(N)\` | N days ago | \`sys_created_on>=javascript:gs.daysAgo(7)\` |
| \`javascript:gs.beginningOfToday()\` | Start of today | \`sys_created_on>=javascript:gs.beginningOfToday()\` |
| \`javascript:gs.endOfToday()\` | End of today | \`sys_created_on<=javascript:gs.endOfToday()\` |
| \`javascript:gs.beginningOfThisMonth()\` | Start of month | \`sys_created_on>=javascript:gs.beginningOfThisMonth()\` |
| \`javascript:gs.beginningOfThisYear()\` | Start of year | \`sys_created_on>=javascript:gs.beginningOfThisYear()\` |
| \`javascript:gs.beginningOfLastMonth()\` | Start of last month | date range queries |
| \`javascript:gs.endOfLastMonth()\` | End of last month | date range queries |
| \`javascript:gs.hoursAgo(N)\` | N hours ago | \`sys_updated_on>=javascript:gs.hoursAgo(4)\` |
| \`javascript:gs.minutesAgo(N)\` | N minutes ago | real-time monitoring |
| \`javascript:gs.now()\` | Current timestamp | \`sys_created_on<=javascript:gs.now()\` |
| \`javascript:gs.getUserID()\` | Current user sys_id | \`assigned_to=javascript:gs.getUserID()\` |

## Reference Fields (Dot-Walking)
Access fields on referenced records using dot notation:
\`\`\`
caller_id.name=John Smith
assigned_to.email=john@example.com
assignment_group.manager.name=Jane
cmdb_ci.sys_class_name=cmdb_ci_linux_server
\`\`\`

## Common Query Patterns
\`\`\`
# Active P1/P2 incidents
active=true^priority<=2^ORDERBYDESCsys_created_on

# My open incidents
active=true^assigned_to=javascript:gs.getUserID()

# Incidents created in last 7 days
sys_created_on>=javascript:gs.daysAgo(7)^active=true

# Changes scheduled this week
state=scheduled^start_date>=javascript:gs.beginningOfThisWeek()^start_date<=javascript:gs.endOfThisWeek()

# Unassigned high-priority incidents
active=true^priority<=2^assigned_toISEMPTY

# CIs by class hierarchy
sys_class_nameINSTANCEOFcmdb_ci_server^operational_status=1

# SLA breaches in progress
has_breached=true^stage=in_progress

# Knowledge articles containing keyword
workflow_state=published^short_descriptionLIKEvpn^ORtextLIKEvpn

# Tasks assigned to a specific group
active=true^assignment_group.name=Service Desk
\`\`\`

## Anti-Patterns (DO NOT USE)
- **Never use** \`sys_id=*\` — sys_id is always a 32-char hex string
- **Never use** \`LIKE\` on sys_id fields — use exact match (\`=\`)
- **Never fabricate sys_ids** — always query to find real ones first
- **Never use** \`javascript:eval()\` or arbitrary JS — only \`gs.*\` functions listed above
- **Don't mix** \`^OR\` and \`^\` without understanding precedence — AND binds tighter than OR
- **Don't use** display values in queries — use internal values (e.g., state=1 not state=New)
- **Don't dot-walk** more than 3 levels deep — performance degrades significantly

## State Values Reference
| Table | Field | Values |
|-------|-------|--------|
| incident | state | 1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed, 8=Canceled |
| incident | priority | 1=Critical, 2=High, 3=Moderate, 4=Low, 5=Planning |
| change_request | state | -5=New, -4=Assess, -3=Authorize, -2=Scheduled, -1=Implement, 0=Review, 3=Closed, 4=Canceled |
| problem | state | 1=New, 2=Assess, 3=Root Cause Analysis, 4=Fix in Progress, 5=Resolved, 7=Closed |
| sc_request | state | 1=Open, 2=Work in Progress, 3=Closed Complete, 4=Closed Incomplete |
`;
