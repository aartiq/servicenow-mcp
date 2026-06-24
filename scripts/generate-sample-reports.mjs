/**
 * Generate sample PDF reports for the NowAIKit website.
 * Produces 6 branded PDFs with realistic ACME Corp demo data.
 * Findings use [SEVERITY] tags so the parser picks them up.
 */
import { generateReport } from '../dist/reports/index.js';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const OUTPUT_DIR = resolve(import.meta.dirname, '../../../website-nowaikit/assets/reports');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const INSTANCE_URL = 'https://acmecorp.service-now.com';
const INSTANCE_NAME = 'acmecorp';

const reports = [
  {
    capability: 'scan-health',
    title: 'Instance Health Scan',
    markdown: `# Instance Health Scan — ACME Corp (acmecorp)

## Executive Summary

This health scan analysed the ACME Corp production ServiceNow instance across 8 categories: platform performance, scheduled jobs, update sets, plugins, table growth, log volume, user sessions, and integration health. 14 findings were identified across critical, high, medium, and low severity levels. Overall health: Degraded — the instance needs attention in database maintenance and session management.

## Severity Distribution

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 5 |
| Low | 3 |

## Platform Performance

- [CRITICAL] Database table fragmentation at 43% on sys_audit — The sys_audit table has grown to 48M records with 43% fragmentation. The property glide.db.max_get is set to 10000. Query response times on sys_audit have degraded by 35% over the past quarter. Recommend archiving records older than 180 days and reducing glide.db.max_get to 5000.
  Evidence: sys_audit row count = 48,291,004; avg query time = 3.2s (was 2.1s in Q1)
  Impact: All audit-dependent operations affected including ACL debugging and compliance reports
  Recommendation: Archive sys_audit records > 180 days, reduce glide.db.max_get to 5000, schedule table defragmentation via sys_trigger

- [CRITICAL] Session timeout set to 480 minutes — The property glide.ui.session_timeout is set to 480 minutes (8 hours), violating SOC 2 Type II and NIST 800-53 requirements. Combined with glide.security.use_csrf_token being disabled, this creates a significant session hijacking risk.
  Evidence: glide.ui.session_timeout = 480; NIST recommends max 30 minutes
  Impact: SOC 2 audit non-compliance, session hijacking vulnerability
  Recommendation: Set glide.ui.session_timeout to 30, enable glide.security.use_csrf_token

## Scheduled Jobs

- [HIGH] 12 orphaned scheduled jobs executing every 15 minutes — Found 12 jobs in sysauto_script referencing deleted script includes. Each execution logs errors to sys_log, generating ~3,400 error entries per day. Related incidents: INC0010042, INC0010089.
  Evidence: 12 sysauto_script records with invalid script_include references
  Impact: 3,400 error log entries/day, unnecessary CPU usage, noise in sys_log
  Recommendation: Disable or delete orphaned scheduled jobs, add validation before execution

- [HIGH] Scheduled job overlap at 02:00 UTC — Three jobs run simultaneously: Nightly LDAP Sync, CMDB Reconciliation, and Report Generation. CPU usage spikes to 95% during the overlap window. The property glide.scheduler.avg_thread_count is set to default (4).
  Evidence: CPU utilization = 95% at 02:00-02:45 UTC daily
  Impact: All concurrent transactions delayed during overlap window
  Recommendation: Stagger job execution: LDAP at 01:00, CMDB at 02:30, Reports at 04:00. Increase glide.scheduler.avg_thread_count to 8.

## Plugins

- [HIGH] Plugin com.snc.cmdb.ws is 3 major versions behind — The current version lacks CMDB health metrics, the improved reconciliation engine, and the new identification rules. Dependent plugin com.snc.cmdb is also outdated.
  Evidence: Installed version = 2.1.0; Current release = 5.3.0
  Impact: Missing CMDB health features, no automatic duplicate detection
  Recommendation: Upgrade com.snc.cmdb.ws and com.snc.cmdb to latest via plugin management. Test in sub-prod first.

- [HIGH] REST integration error rate at 12% — The REST message ServiceNow_LDAP_Sync has a 12% failure rate over the past 7 days. Errors indicate TCP timeout to the LDAP endpoint. Related incident: INC0010156.
  Evidence: 847 failures out of 7,058 requests in sys_rest_transaction_log
  Impact: LDAP user sync incomplete — 156 users have stale department assignments
  Recommendation: Increase REST message timeout, implement retry logic in Flow Designer subflow

## Update Sets

- [MEDIUM] 8 update sets with unresolved conflicts — Changes to sys_script and sys_ui_policy records overlap between "HRSD Enhancement Pack" and "Q2 Security Patch". Deployment to production is blocked until conflicts are resolved. See CHG0040012.
  Evidence: 8 sys_update_set records with conflict_count > 0
  Impact: Production deployment blocked for Q2 release
  Recommendation: Resolve conflicts using update set preview. Prioritise security patch changes.

## Table Growth

- [MEDIUM] CMDB stale CI percentage at 18% — 18% of cmdb_ci_server records (412 out of 2,289) have not been updated by Discovery in over 90 days. MID Server mid.server.dc01 has been offline for 45 days.
  Evidence: 412 cmdb_ci_server records with last_discovered < 90 days ago
  Impact: Change impact analysis using stale data, CMDB compliance gap
  Recommendation: Restore MID Server connectivity, run full discovery scan, set sn_cmdb.health.stale_threshold_days to 60

- [MEDIUM] Excessive client scripts on incident form — 14 active client scripts on the incident form, with 6 running onChange on the assignment_group field. This causes cascade loading and form response times averaging 4.2 seconds.
  Evidence: 14 active sys_script_client records for incident; 6 triggered by assignment_group
  Impact: Form load time = 4.2s (target < 2s), poor user experience
  Recommendation: Consolidate to 3 client scripts max, use UI Policies where possible

- [MEDIUM] Knowledge articles without approval workflow — 45% of articles in kb_knowledge (892 out of 1,982) have no approval workflow. Articles are published directly violating the knowledge management policy.
  Evidence: 892 kb_knowledge records with workflow.context IS EMPTY
  Impact: Knowledge management policy violation, risk of inaccurate published content
  Recommendation: Enable com.snc.knowledge_management approval workflow for all knowledge bases

- [MEDIUM] ACL evaluation causing page load delays — Custom ACLs on sc_req_item use GlideRecord queries in script conditions. Service Portal catalogue page loads average 3.1 seconds for users with itil role.
  Evidence: 4 sys_security_acl records on sc_req_item with script-based conditions using GlideRecord
  Impact: Service Portal page load = 3.1s (target < 1.5s)
  Recommendation: Convert script-based ACLs to condition-based. Use gs.hasRole() instead of GlideRecord lookups. See PRB0000089.

## User Sessions

- [LOW] 23 users with admin role inactive 90+ days — Found 23 sys_user records with admin role in sys_user_has_role that haven't logged in for 90+ days.
  Evidence: 23 sys_user_has_role records with role=admin, user.last_login > 90 days
  Impact: Unused privileged accounts create unnecessary attack surface
  Recommendation: Review and revoke admin role from inactive users quarterly

- [LOW] 8 dashboard widgets refreshing every 30 seconds — Found 8 homepage widgets with 30-second refresh intervals generating unnecessary API calls. Default should be 300 seconds.
  Evidence: 8 sys_portal_page widget instances with refresh_interval = 30
  Impact: ~2,300 unnecessary API calls per hour across all active sessions
  Recommendation: Set default widget refresh to 300 seconds

- [LOW] 3 email notification templates missing — 3 records in sysevent_email_action reference templates that no longer exist, causing silent notification failures.
  Evidence: 3 sysevent_email_action records with invalid message_template reference
  Impact: Users not receiving expected notifications for priority 1 incidents
  Recommendation: Update template references or create replacement templates

## Recommendations Priority

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Fix sys_audit fragmentation | Performance | 4 hours |
| 2 | Reduce session timeout to 30 min | Security compliance | 1 hour |
| 3 | Disable orphaned scheduled jobs | Stability | 2 hours |
| 4 | Upgrade CMDB plugins | Functionality | 8 hours |
| 5 | Resolve update set conflicts | Deployment | 4 hours |
| 6 | Stagger scheduled job times | Performance | 1 hour |
| 7 | Fix REST integration timeouts | Data integrity | 4 hours |
| 8 | Restore MID Server connectivity | CMDB accuracy | 2 hours |
`,
  },
  {
    capability: 'scan-security',
    title: 'Security Posture Audit',
    markdown: `# Security Posture Audit — ACME Corp (acmecorp)

## Executive Summary

This security audit evaluated the ACME Corp production instance across 6 domains: authentication, access controls, data protection, network security, audit compliance, and plugin security. 16 findings were identified including 3 critical vulnerabilities requiring immediate remediation. Overall health: Critical — the instance has unresolved security gaps in CSRF protection, multi-factor authentication, and access control configuration.

## Severity Distribution

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 4 |
| Low | 4 |

## Authentication

- [CRITICAL] CSRF protection disabled — The property glide.security.use_csrf_token is set to false. All forms are vulnerable to Cross-Site Request Forgery attacks. Any authenticated session can be exploited by malicious external pages to create incidents, modify records, or escalate privileges.
  Evidence: glide.security.use_csrf_token = false (should be true)
  Impact: All form submissions vulnerable to CSRF; SOC 2 non-compliance
  Recommendation: Enable glide.security.use_csrf_token immediately. Test critical REST integrations first — some legacy endpoints may need CSRF exemption via glide.security.csrf.strict.validation.exemption.

- [CRITICAL] 8 admin accounts without MFA — Found 8 users with the admin role that do not have multi-factor authentication enabled. The property glide.authenticate.multifactor is not enforced for elevated roles. Users: admin, svc.integration, john.smith, sarah.jones, mike.wilson, lisa.chen, dev.team, qa.automation.
  Evidence: 8 sys_user records with role=admin, multifactor_authentication=false
  Impact: Privileged accounts can be compromised via credential stuffing or phishing
  Recommendation: Enable MFA for all admin and security_admin roles. Configure com.snc.authentication.multifactor plugin. Enforce via login policy.

## Access Controls

- [CRITICAL] Wildcard ACL on sys_user exposes PII — A catch-all ACL on sys_user grants read access to all authenticated users with no role requirement. This exposes personally identifiable information including email, phone, manager, department, and employee ID for all 12,400 user records.
  Evidence: sys_security_acl on sys_user with role=EMPTY, condition=EMPTY, type=record
  Impact: PII exposure for 12,400 users; GDPR and privacy policy violation
  Recommendation: Create role-specific ACLs for sys_user. Restrict itil to name/email only. Require user_admin for phone/department/manager. Remove wildcard ACL. See INC0010201.

- [HIGH] REST API bypasses ACL enforcement — The property glide.security.strict_rest_api_acl is set to false. Users can enumerate all role assignments via /api/now/table/sys_user_has_role bypassing UI-level access controls.
  Evidence: glide.security.strict_rest_api_acl = false; 47 API calls to sys_user_has_role in last 30 days from non-admin users
  Impact: Role enumeration enables privilege escalation attack planning
  Recommendation: Enable glide.security.strict_rest_api_acl. Create explicit ACLs for sys_user_has_role. Restrict REST API access to authorized service accounts.

- [HIGH] 15 overly permissive ITSM ACLs — 15 ACLs on incident, change_request, and problem grant write access to the itil role without any assignment group condition. Any ITIL user can modify any record regardless of assignment.
  Evidence: 15 sys_security_acl records with role=itil, write operation, no condition
  Impact: Users can edit records outside their assignment group; SOX compliance risk
  Recommendation: Add assignment_group conditions to write ACLs using gs.getUser().isMemberOf().

- [HIGH] 8 custom tables with no ACL definitions — 8 custom tables (x_acme_*) have no ACL definitions. The property glide.security.default_deny is set to false, granting all authenticated users full access.
  Evidence: 8 sys_db_object records with name STARTSWITH x_acme_, zero sys_security_acl records
  Impact: Custom application data accessible to all authenticated users
  Recommendation: Create read/write/delete ACLs for all x_acme_* tables. Enable glide.security.default_deny after testing.

## Data Protection

- [HIGH] Unencrypted credential fields in custom tables — Found 3 custom tables (x_acme_credentials, x_acme_api_keys, x_acme_tokens) storing API keys and passwords in plain string fields instead of password2 (AES-256 encrypted) fields.
  Evidence: 3 sys_dictionary records with element_type=string containing credential data
  Impact: Credentials visible in list views, exports, and API responses
  Recommendation: Change field types to password2. Migrate existing data via background script. See CHG0040089.

- [HIGH] Hardcoded credentials in 2 script includes — Script includes LDAPIntegration and SAPConnector in sys_script_include contain hardcoded API keys and passwords in plain text.
  Evidence: 2 sys_script_include records with string matches for 'password', 'api_key', 'secret'
  Impact: Credentials exposed in update sets, exports, and clone operations
  Recommendation: Move to sys_properties with encryption or discovery_credentials. Rotate compromised credentials immediately.

## Network Security

- [MEDIUM] IP access control not configured — The property glide.ip.access_control is empty and glide.ip.access_control.enabled is false. Any IP address can access the instance login page and all API endpoints.
  Evidence: glide.ip.access_control = EMPTY; glide.ip.access_control.enabled = false
  Impact: No network-level access restriction; brute-force attacks possible from any IP
  Recommendation: Configure glide.ip.access_control with ACME corporate IP ranges. Enable glide.ip.access_control.enabled.

- [MEDIUM] Debug logging enabled in production — The properties glide.security.debug, glide.ldap.debug, and glide.soap.debug are all set to true. Debug logs may expose LDAP bind credentials and SOAP message bodies in sys_log.
  Evidence: glide.security.debug = true; glide.ldap.debug = true; glide.soap.debug = true
  Impact: Sensitive authentication details potentially visible in sys_log to users with log access
  Recommendation: Set all debug properties to false in production immediately.

- [MEDIUM] Session fixation vulnerability — The property glide.ui.session.regenerate_id_on_login is set to false. Session IDs are not rotated on authentication, creating a session fixation risk per OWASP A7.
  Evidence: glide.ui.session.regenerate_id_on_login = false
  Impact: Pre-authentication session tokens remain valid after login; session fixation attack possible
  Recommendation: Enable glide.ui.session.regenerate_id_on_login.

## Audit Compliance

- [MEDIUM] Audit trail gaps on 12 critical tables — The sys_audit configuration excludes 12 critical tables including sys_user_has_role, sys_properties, sys_security_acl, and sys_script_include. Role changes, property modifications, and ACL updates are not tracked.
  Evidence: 12 sys_audit_table_exclusion records for security-critical tables
  Impact: Cannot track who modified security configurations; SOC 2 audit finding
  Recommendation: Enable sys_audit for all security-critical tables. Create audit dashboard for security team.

## Credential Hygiene

- [LOW] Password policy below NIST guidelines — The property glide.user.password.min_length is set to 6, below the NIST 800-63B recommended minimum of 12 characters. Password complexity rules are also not enforced.
  Evidence: glide.user.password.min_length = 6; NIST minimum = 12
  Recommendation: Set glide.user.password.min_length to 12. Enable complexity requirements.

- [LOW] 3 unused OAuth applications — Found 3 OAuth application records in oauth_entity that have not been used in 12+ months. Applications: Legacy_SAP_SSO, Test_Azure_AD, Dev_Okta_Connector.
  Evidence: 3 oauth_entity records with last_used > 12 months ago
  Recommendation: Revoke and delete unused OAuth applications. Rotate client secrets for active applications.

- [LOW] Missing Content Security Policy — The property glide.ui.content_security_policy is not configured, leaving the instance open to XSS attacks via injected scripts in HTML fields.
  Evidence: glide.ui.content_security_policy = EMPTY
  Recommendation: Configure Content Security Policy headers to restrict script sources.

- [LOW] 156 inactive user accounts still active — Found 156 sys_user records that haven't logged in for 180+ days and are still active. The property glide.user.lock_inactive_after is not configured.
  Evidence: 156 sys_user records with last_login_time > 180 days, active=true
  Recommendation: Set glide.user.lock_inactive_after to 90 days. Run one-time cleanup for 180+ day inactive accounts.

## Recommendations Priority

| Priority | Action | Risk Reduction | Effort |
|----------|--------|---------------|--------|
| 1 | Enable CSRF protection | Critical vulnerability closed | 1 hour |
| 2 | Enforce MFA for admin accounts | Authentication hardening | 4 hours |
| 3 | Fix sys_user wildcard ACL | PII exposure eliminated | 2 hours |
| 4 | Enable strict REST API ACLs | API security gap closed | 2 hours |
| 5 | Encrypt credential fields | Data protection compliance | 4 hours |
| 6 | Remove hardcoded credentials | Code security risk eliminated | 2 hours |
| 7 | Create ACLs for custom tables | Access control coverage | 8 hours |
| 8 | Configure IP access control | Network perimeter security | 2 hours |
`,
  },
  {
    capability: 'scan-cmdb',
    title: 'CMDB Integrity Report',
    markdown: `# CMDB Integrity Report — ACME Corp (acmecorp)

## Executive Summary

This CMDB integrity scan analysed the ACME Corp instance across 5 domains: CI completeness, relationship integrity, class structure, discovery coverage, and data quality. The CMDB contains 2,847 CIs across 42 classes with 6,234 relationships. 12 findings require attention to improve data quality and relationship integrity. Overall health: Degraded — orphaned relationships and stale discovery data are impacting change management accuracy.

## Severity Distribution

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 3 |
| Medium | 5 |
| Low | 3 |

## CMDB Statistics

| Metric | Value |
|--------|-------|
| Total CIs | 2,847 |
| CI Classes | 42 |
| Relationships | 6,234 |
| Business Services | 28 |
| Servers | 2,289 |
| Applications | 312 |
| Network Devices | 246 |

## Relationship Integrity

- [CRITICAL] 234 orphaned relationships in cmdb_rel_ci — Found 234 relationship records where either the parent or child CI has been deleted. These orphaned relationships cause incorrect dependency maps, false change impact results, and misleading service maps. Business services svc_email, svc_erp, and svc_crm are most affected with 67 orphaned relationships between them.
  Evidence: 234 cmdb_rel_ci records where parent.sys_id OR child.sys_id does not exist in cmdb_ci
  Impact: Change impact analysis for CHG0040023 incorrectly listed 12 downstream services; PRB0000112 opened
  Recommendation: Run CMDB Health Audit job from com.snc.cmdb cleanup module. Schedule weekly automated cleanup via sysauto_script.

## Discovery Coverage

- [HIGH] 412 stale CIs not updated in 90+ days — 18% of cmdb_ci_server records have a last_discovered date older than 90 days. MID Server mid.server.dc01 has been offline for 45 days, covering the ACME Chicago data centre (148 servers). MID Server mid.server.dc02 (New York) is functional but has credential issues for 64 Linux servers.
  Evidence: 412 cmdb_ci_server records with last_discovered > 90 days; mid.server.dc01 offline since 2026-02-17
  Impact: 23% of server inventory may no longer exist; change impact analysis using stale data
  Recommendation: Restore mid.server.dc01 connectivity. Fix Linux credentials on mid.server.dc02. Set sn_cmdb.health.stale_threshold_days to 60. Run full discovery scan.

- [HIGH] 18 duplicate CIs in cmdb_ci_server — Found 18 duplicate server CIs based on serial number and IP address matching. Discovery and manual ServiceNow imports created overlapping records. Duplicates affect servers in the Chicago DC: chi-web-01 through chi-web-06 each have 2 records.
  Evidence: 18 cmdb_ci_server records with matching serial_number AND ip_address across different sys_ids
  Impact: Incident routing ambiguous; ITAM asset counts inflated by 18 items
  Recommendation: Merge duplicates using CMDB Identification Engine. Update cmdb_identifier rules to include serial_number as primary identifier. Prevent future duplicates by enabling com.snc.cmdb reconciliation rules.

- [HIGH] Missing CI classes for cloud resources — 89 AWS and Azure cloud CIs are stored in the generic cmdb_ci class instead of cmdb_ci_cloud_service_account and cmdb_ci_vm_instance. The plugin com.snc.cloud.mgmt is installed but CMDB class mapping rules for AWS us-east-1 and Azure westus2 are not configured.
  Evidence: 89 cmdb_ci records with name STARTSWITH aws- or azure-, sys_class_name = cmdb_ci
  Impact: Cloud CIs not visible in CMDB dashboards; missing from cloud cost management reports
  Recommendation: Configure CMDB class mapping rules for AWS and Azure integrations. Reclassify 89 existing CIs using transform map.

## Data Quality

- [MEDIUM] 68% of servers missing OS version — 1,557 of 2,289 cmdb_ci_server records are missing the os_version field. 45% are also missing cpu_count and ram. The property sn_cmdb.health.completeness_threshold is set to 80%, so these CIs fail the completeness check.
  Evidence: 1,557 cmdb_ci_server records with os_version IS EMPTY; 1,030 missing cpu_count
  Impact: Vulnerability scanning cannot match CVEs to OS versions; capacity planning data incomplete
  Recommendation: Run targeted discovery with credential-based probing. Update discovery patterns to collect OS and hardware details.

- [MEDIUM] 189 unclassified CIs in base cmdb_ci — 189 CIs remain in the base cmdb_ci class without proper classification. These include 67 manually created records, 89 cloud resources (noted above), and 33 imported from CSV.
  Evidence: 189 cmdb_ci records where sys_class_name = cmdb_ci (should be a subclass)
  Impact: CIs invisible to class-specific reports, not included in CMDB health metrics
  Recommendation: Use CMDB Identification and Reconciliation engine to classify. Review and assign to cmdb_ci_server, cmdb_ci_app_server, or cmdb_ci_cloud_service_account.

- [MEDIUM] 45 relationships using deprecated types — Found 45 cmdb_rel_ci records using deprecated relationship types. The type "Hosted on" should be "Hosted on::Hosts" for bidirectional mapping per ServiceNow CMDB best practices.
  Evidence: 45 cmdb_rel_ci records with type.name = 'Hosted on' (unidirectional)
  Impact: Service maps show incomplete dependency chains; reverse relationship lookups fail
  Recommendation: Update relationship types to bidirectional taxonomy. Run relationship cleanup job.

- [MEDIUM] 12 business services with no downstream CIs — 12 business services in cmdb_ci_service have no downstream CI relationships. These services appear in change impact analysis but show zero affected CIs, giving false confidence that changes have no impact.
  Evidence: 12 cmdb_ci_service records with zero child relationships in cmdb_rel_ci
  Impact: Change impact analysis reports zero impact for changes affecting these services
  Recommendation: Use Service Mapping (com.snc.service_mapping) to auto-discover application dependencies. Services: svc_vpn, svc_dns, svc_backup, svc_monitoring, and 8 others.

- [MEDIUM] 35% of CIs missing assignment group — 997 of 2,847 CIs have no assignment_group set. CMDB health notifications and incident auto-routing cannot function for these CIs.
  Evidence: 997 cmdb_ci records with assignment_group IS EMPTY
  Impact: Incidents against these CIs require manual group assignment; avg resolution time 40% longer
  Recommendation: Create data quality rule in cmdb_data_management requiring assignment_group for all production CIs. Bulk-update using department-to-group mapping.

## Asset Correlation

- [LOW] 67 servers not linked to hardware assets — 67 cmdb_ci_server records are not linked to asset records in alm_hardware. This prevents accurate license compliance tracking and lifecycle management.
  Evidence: 67 cmdb_ci_server records with asset IS EMPTY
  Recommendation: Run asset-CI reconciliation job. Link servers to existing alm_hardware records by serial number.

- [LOW] CI attestation not enabled — The plugin com.snc.cmdb.attestation is installed but not active. CI owners are not periodically validating their data. Last attestation campaign: never.
  Evidence: com.snc.cmdb.attestation plugin status = inactive
  Recommendation: Activate attestation plugin. Schedule quarterly attestation campaigns for all production CIs.

- [LOW] Discovery log retention at 365 days — Discovery logs in discovery_log are retained for 365 days, consuming 2.1 GB of storage. Default retention should be 90 days.
  Evidence: discovery_log table size = 2.1 GB; oldest record = 364 days ago
  Recommendation: Set discovery log retention to 90 days via sys_auto_flush configuration.

## Recommendations Priority

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Clean 234 orphaned relationships | Data integrity | 2 hours |
| 2 | Restore mid.server.dc01 | Discovery coverage | 4 hours |
| 3 | Merge 18 duplicate CIs | Data accuracy | 4 hours |
| 4 | Configure cloud CI classes | Completeness | 8 hours |
| 5 | Run attribute completeness scan | Data quality | 4 hours |
| 6 | Map business service dependencies | Impact analysis | 16 hours |
`,
  },
  {
    capability: 'review-code',
    title: 'Code Review Analysis',
    markdown: `# Code Review Analysis — ACME Corp (acmecorp)

## Executive Summary

This code review analysed 47 script artifacts across 4 categories: business rules (18), script includes (12), client scripts (11), and scheduled jobs (6). The review evaluated code quality, performance, security, and ServiceNow best practices compliance. 18 findings were identified. The ACME Corp instance has significant code quality debt, including one SQL injection vulnerability and multiple deprecated API usages that will break in future upgrades.

## Severity Distribution

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 5 |
| Medium | 6 |
| Low | 5 |

## Scripts Analysed

| Category | Count | With Issues | Clean |
|----------|-------|-------------|-------|
| Business Rules | 18 | 12 | 6 |
| Script Includes | 12 | 8 | 4 |
| Client Scripts | 11 | 9 | 2 |
| Scheduled Jobs | 6 | 4 | 2 |
| **Total** | **47** | **33** | **14** |

## Security

- [CRITICAL] SQL injection in CustomTableUtils script include — The script include CustomTableUtils in sys_script_include uses string concatenation to build GlideRecord queries: gr.addEncodedQuery('name=' + userInput). This allows query injection through the REST API. An attacker can pass name=admin^ORrole=admin to extract privileged user data.
  Evidence: sys_script_include.name = CustomTableUtils; line 47: gr.addEncodedQuery('name=' + userInput)
  Impact: Arbitrary data extraction via crafted REST API calls; potential data breach
  Recommendation: Replace gr.addEncodedQuery('name=' + userInput) with gr.addQuery('name', userInput). Review all 12 script includes for similar concatenation patterns. See INC0010312.

- [CRITICAL] Synchronous GlideHTTP in before business rule — The business rule SyncExternalData on incident uses GlideHTTPRequest in a synchronous (before) business rule. External API calls to https://api.acme-erp.com/sync in synchronous context block the UI thread. Users report form save timeouts averaging 8 seconds, with complete failures when the ERP API is slow.
  Evidence: sys_script.name = SyncExternalData; when = before; contains GlideHTTPRequest
  Impact: Incident form save takes 8s avg; complete timeout when ERP API latency > 10s
  Recommendation: Move to async business rule or Flow Designer subflow. Use sn_ws.RESTMessageV2 with executeAsync(). Related: PRB0000134.

## Performance

- [HIGH] GlideRecord in 3 client scripts — Client scripts SetAssignmentGroup, ValidateCILookup, and AutoPopulateFields use direct GlideRecord calls. Client-side GlideRecord is deprecated and generates synchronous AJAX calls that freeze the browser.
  Evidence: 3 sys_script_client records with script containing 'new GlideRecord'
  Impact: Browser freezes for 2-4 seconds per client script execution; form load time = 6.1s total
  Recommendation: Replace with GlideAjax calls to server-side script includes. Pre-load static data via g_scratchpad in display business rules.

- [HIGH] Unbounded GlideRecord query in NightlyDataSync — The scheduled job NightlyDataSync in sysauto_script queries the task table with no setLimit() and no encoded query filter. This returns all 523,847 task records, consuming 2.4 GB of memory and running for 45 minutes.
  Evidence: sysauto_script.name = NightlyDataSync; query on task with no filter; execution time = 45 min
  Impact: Memory exhaustion risk during nightly window; blocks other scheduled jobs
  Recommendation: Add gr.setLimit() and appropriate query filters. Use GlideAggregate for count operations. Process in batches of 1000.

- [HIGH] 15 GlideRecord queries with 3+ levels of dot-walking — Found 15 queries using deep dot-walking (e.g., current.caller_id.department.company.name). Each dot-walk level generates a SQL JOIN, with 4 levels creating queries that take 800ms+ on the incident table.
  Evidence: 15 sys_script records with 3+ levels of dot-walking in script body
  Impact: Individual query time = 800ms avg with 4 levels; multiplied by volume in list views
  Recommendation: Limit dot-walking to 2 levels. Cache intermediate values in script variables.

## Business Rules

- [HIGH] 3 business rules with identical execution order on change_request — Business rules UpdateCAB (order 100), NotifyApprovers (order 100), and SetRiskScore (order 100) on change_request share the same execution order. Execution sequence is unpredictable, causing intermittent failures when SetRiskScore depends on data set by UpdateCAB.
  Evidence: 3 sys_script records on change_request with order = 100
  Impact: Intermittent CHG save failures; 23 incidents logged in past 30 days (INC0010267 through INC0010290)
  Recommendation: Assign distinct order values: UpdateCAB = 100, SetRiskScore = 200, NotifyApprovers = 300.

- [HIGH] 5 business rules with missing null checks — 5 business rules access current.assignment_group.name without checking if assignment_group is populated. This causes "Cannot read property of null" errors logged in sys_log when incidents are created without an assignment group.
  Evidence: 5 sys_script records with 'assignment_group.name' without preceding nil() check; 847 sys_log errors in past 30 days
  Impact: 847 error log entries per month; business rule failures on unassigned records
  Recommendation: Add null checks: if (!current.assignment_group.nil()) before accessing .name. Use current.assignment_group.getDisplayValue() for safe access.

## Code Quality

- [MEDIUM] 12 hardcoded sys_ids across scripts — Found 12 instances of hardcoded 32-character sys_ids in sys_script and sys_script_include records. These include group sys_ids, user sys_ids, and CI sys_ids that differ between prod and sub-prod instances.
  Evidence: 12 scripts with pattern matching /[a-f0-9]{32}/ in script body
  Impact: Scripts break after instance clone; 4 incidents opened after last clone (INC0010198-INC0010201)
  Recommendation: Replace hardcoded sys_ids with gs.getProperty() lookups or GlideRecord queries by name.

- [MEDIUM] 8 uses of deprecated Packages.java.util API — Found 8 scripts using Packages.java.util.ArrayList and Packages.java.util.HashMap. These Java package references are removed in the Washington release and will cause script failures after upgrade.
  Evidence: 8 sys_script_include records with 'Packages.java.util' in script body
  Impact: All 8 scripts will break on upgrade to Washington or later
  Recommendation: Replace Packages.java.util.ArrayList with GlideArrayList. Replace HashMap with standard JavaScript objects.

- [MEDIUM] 4 integration scripts without error handling — 4 script includes handling REST integrations (LDAPSync, SAPConnector, JiraWebhook, SlackNotifier) have no try-catch blocks. Failed API calls throw unhandled exceptions that crash the calling business rule.
  Evidence: 4 sys_script_include records with sn_ws.RESTMessageV2 and no try/catch
  Impact: Unhandled REST failures cascade to form save errors; users see "Record not saved" messages
  Recommendation: Wrap REST calls in try-catch. Log errors with gs.error(). Return meaningful error objects.

- [MEDIUM] 6 client scripts without condition — 6 client scripts on incident have no Condition field set and no UI Type filter — they run on every form load regardless of view, state, or user role.
  Evidence: 6 sys_script_client records on incident with condition IS EMPTY, ui_type IS EMPTY
  Impact: Unnecessary script execution adds ~200ms per unconditional script on every form load
  Recommendation: Add Condition and UI Type fields. Use g_form.isNewRecord() and g_user.hasRole() checks.

- [MEDIUM] Duplicate business rule logic — Business rules SetPriorityFromImpact (order 50) and CalculatePriority (order 150) on incident both calculate priority from impact and urgency. They use nearly identical logic but produce different results in edge cases, causing priority flip-flopping.
  Evidence: 2 sys_script records on incident with 85% code similarity (diff analysis)
  Impact: Priority set by first rule overwritten by second; user confusion; 12 complaints logged
  Recommendation: Remove CalculatePriority. Keep SetPriorityFromImpact as the single source of truth.

- [MEDIUM] 18 of 23 script includes missing JSDoc — 78% of script includes have no JSDoc documentation. Function parameters, return types, and usage examples are missing, making maintenance difficult.
  Evidence: 18 sys_script_include records with no comment block in first 10 lines
  Impact: Developer onboarding time increased; incorrect usage leads to bugs
  Recommendation: Add JSDoc to all public script includes. Include @param, @returns, and @example tags.

## Minor Issues

- [LOW] 4 client scripts with console.log in production — Debug console.log statements left in production client scripts: LogIncidentUpdates, DebugCatalogForm, TraceWorkflow, TestAssignment.
- [LOW] 8 scripts with large commented-out code blocks (10+ lines) — Dead code should be removed and tracked in update sets or source control.
- [LOW] 6 business rules using magic numbers — Using if (current.priority == 1) instead of named constants or property lookups for priority values.
- [LOW] Inconsistent naming: 12 PascalCase, 8 camelCase, 3 snake_case script include names — ServiceNow best practice is PascalCase.
- [LOW] 5 script includes with accessible_from set to "All application scopes" — Should be restricted to owning application scope to prevent unintended cross-scope access.

## Recommendations Priority

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Fix SQL injection in CustomTableUtils | Security | 1 hour |
| 2 | Move SyncExternalData to async | Performance | 4 hours |
| 3 | Replace client-side GlideRecord (3 scripts) | Performance | 8 hours |
| 4 | Add null checks (5 business rules) | Stability | 2 hours |
| 5 | Replace deprecated Packages.java (8 scripts) | Upgrade readiness | 8 hours |
| 6 | Fix business rule ordering on change_request | Reliability | 1 hour |
| 7 | Remove hardcoded sys_ids (12 instances) | Maintainability | 4 hours |
| 8 | Add error handling to integrations (4 scripts) | Resilience | 4 hours |
`,
  },
  {
    capability: 'review-acls',
    title: 'ACL Audit Report',
    markdown: `# ACL Audit Report — ACME Corp (acmecorp)

## Executive Summary

This ACL audit reviewed 312 active access control rules across the ACME Corp production instance. The review evaluated rule effectiveness, performance impact, security coverage, and compliance with ServiceNow ACL best practices. 15 findings were identified, including 2 critical security gaps that expose sensitive data and allow REST API enumeration attacks.

## Severity Distribution

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 5 |
| Low | 4 |

## ACL Statistics

| Metric | Value |
|--------|-------|
| Total Active ACLs | 312 |
| OOB ACLs | 198 |
| Custom ACLs | 114 |
| Script-Based ACLs | 23 |
| Tables Covered | 86 |
| Tables Without ACLs | 8 |

## Access Control Gaps

- [CRITICAL] Wildcard ACL on sys_user exposes PII for 12,400 users — A catch-all ACL on sys_user grants record-level read access to all authenticated users with no role requirement and no script condition. This exposes: name, email, phone, mobile_phone, manager, department, location, employee_number, and cost_center for all 12,400 active user records. Any authenticated user can export the full user list via /api/now/table/sys_user.
  Evidence: sys_security_acl: table=sys_user, operation=read, role=EMPTY, condition=EMPTY, script=EMPTY
  Impact: PII exposure for 12,400 users; violates GDPR Art. 5 data minimisation; ACME privacy policy breach; security incident INC0010201 filed
  Recommendation: Create tiered ACLs: itil role → name, email only; user_admin role → all fields. Add field-level ACLs for phone, mobile_phone, employee_number, cost_center. Remove wildcard ACL.

- [CRITICAL] REST API ACL bypass via sys_user_has_role — The property glide.security.strict_rest_api_acl is false. Non-admin users can call /api/now/table/sys_user_has_role to enumerate all role assignments including admin, security_admin, and password_reset roles. 47 such API calls were detected from 3 non-admin users in the past 30 days.
  Evidence: glide.security.strict_rest_api_acl = false; 47 REST API calls to sys_user_has_role from non-admin sessions
  Impact: Attackers can identify admin accounts for targeted phishing; privilege escalation planning
  Recommendation: Enable glide.security.strict_rest_api_acl. Create ACL on sys_user_has_role requiring security_admin role. Investigate the 3 users who made enumeration calls.

## Overly Permissive Rules

- [HIGH] 15 ITSM write ACLs without assignment group conditions — 15 ACLs on incident (5), change_request (6), and problem (4) grant write access to the itil role with no condition checking assignment_group membership. Any of the 2,340 ITIL users can edit any record in these tables.
  Evidence: 15 sys_security_acl records: operation=write, role=itil, condition=EMPTY; 2,340 users with itil role
  Impact: SOX compliance risk — no segregation of duties; users editing records outside their responsibility
  Recommendation: Add conditions: gs.getUser().isMemberOf(current.assignment_group) for write operations. Create exception ACL for managers.

- [HIGH] 8 custom tables (x_acme_*) with zero ACLs — 8 custom tables created by ACME development team have no ACL definitions: x_acme_customer_data, x_acme_contracts, x_acme_api_logs, x_acme_config, x_acme_integrations, x_acme_reports, x_acme_audit_trail, x_acme_credentials. The property glide.security.default_deny is false.
  Evidence: 8 sys_db_object records with name STARTSWITH x_acme_, zero matching sys_security_acl records
  Impact: All authenticated users (12,400) have full read/write/delete access to all custom ACME data
  Recommendation: Create read/write/delete ACLs for each table with appropriate role requirements. Enable glide.security.default_deny after testing.

- [HIGH] 4 conflicting ACLs on cmdb_ci — 4 overlapping ACLs on cmdb_ci with conflicting conditions. Due to evaluation order, the most permissive rule wins: an ACL granting write to itil role is evaluated before a more restrictive ACL requiring cmdb_admin for certain CI classes.
  Evidence: 4 sys_security_acl records on cmdb_ci with overlapping conditions; itil write ACL at order 100, cmdb_admin restrict at order 200
  Impact: ITIL users can modify CMDB records that should require cmdb_admin role
  Recommendation: Reorder ACLs: restrictive rules must evaluate first (lower order number). Remove redundant permissive ACL.

## Performance Impact

- [HIGH] 23 script-based ACLs with GlideRecord queries — 23 ACLs use GlideRecord queries in script conditions. The worst offender is the sc_req_item read ACL, which queries sc_cat_item for category permissions on every list view load, adding 200ms per evaluation.
  Evidence: 23 sys_security_acl records with script containing 'GlideRecord'; sc_req_item ACL avg evaluation time = 200ms
  Impact: Service Portal catalogue page load = 3.1s for itil users (target < 1.5s); PRB0000089 opened
  Recommendation: Convert to condition-based ACLs where possible. For sc_req_item, cache category permissions in user session via gs.getSession().putClientData().

## Coverage Gaps

- [MEDIUM] 9 client-callable script includes without ACLs — 9 script includes marked client_callable=true have no sys_security_acl record. These can be invoked via GlideAjax by any authenticated user: AJAXUtils, UserLookup, CatalogHelper, CMDBSearch, ReportGenerator, NotificationSender, IntegrationStatus, ConfigReader, DataExporter.
  Evidence: 9 sys_script_include records with client_callable=true, zero matching ACLs
  Impact: Any authenticated user can call these server-side functions; DataExporter could be used for data exfiltration
  Recommendation: Create ACLs for each client-callable script include with appropriate role requirements.

- [MEDIUM] Field-level ACL gaps on sn_hr_core_profile — The HR profile table has table-level ACLs but no field-level ACLs. Sensitive fields (salary_band, performance_rating, disciplinary_status, medical_leave_balance) are readable by anyone with the sn_hr_core.basic role (890 users).
  Evidence: 0 field-level sys_security_acl records for sn_hr_core_profile; 4 sensitive fields exposed
  Impact: HR data accessible to 890 users with basic HR role; employee privacy violation
  Recommendation: Create field-level ACLs restricting salary_band, performance_rating, disciplinary_status to sn_hr_core.manager and sn_hr_core.admin roles.

- [MEDIUM] 6 stale ACLs referencing deleted roles — Found 6 ACLs requiring roles that no longer exist in sys_user_role: x_acme_legacy_admin (deleted), x_acme_power_user (deleted), x_acme_readonly (deleted). These ACLs effectively deny all access, potentially blocking legitimate operations.
  Evidence: 6 sys_security_acl records with role references to non-existent sys_user_role records
  Impact: 2 tables completely inaccessible due to stale ACL role requirements
  Recommendation: Update ACLs to reference current roles. Remove ACLs for deprecated functionality.

- [MEDIUM] Elevated privilege ACLs without audit logging — 12 ACLs for admin-only operations (delete on sys_properties, write on sys_security_acl, delete on sys_script_include) are not tracked by sys_audit. Modifications to security-critical configuration are invisible.
  Evidence: 12 security-critical tables excluded from sys_audit configuration
  Impact: Cannot track who modified security configurations; SOC 2 audit finding
  Recommendation: Enable sys_audit for all tables protected by admin-only ACLs.

- [MEDIUM] Domain-separated ACL inconsistencies — In the multi-domain configuration (ACME_US, ACME_EU, ACME_APAC), 4 ACLs are not domain-aware, allowing users in ACME_EU domain to access ACME_US records via REST API.
  Evidence: 4 sys_security_acl records with sys_domain = global on domain-separated tables
  Impact: Cross-domain data access violates ACME EU data residency policy
  Recommendation: Enable domain support on affected ACLs. Test with domain debugging via glide.security.domain.

## Maintenance

- [LOW] 78% of custom ACLs have no description — 89 of 114 custom ACLs have an empty description field. The business justification and intended access pattern are not documented.
- [LOW] 8 ACLs with zero evaluation count — 8 ACLs have never been evaluated (hit_count = 0 in sys_security_acl). These rules add to evaluation overhead without providing access control.
- [LOW] 3 ACLs with "test" or "temp" in the name — Appear to be development artifacts left in production: test_acl_incident_read, temp_sc_cat_item_write, test_cmdb_delete.
- [LOW] ACL naming convention inconsistencies — Mix of naming patterns across 114 custom ACLs makes management and auditing difficult.

## Recommendations Priority

| Priority | Action | Risk Reduction | Effort |
|----------|--------|---------------|--------|
| 1 | Fix sys_user wildcard ACL | PII protection | 4 hours |
| 2 | Enable strict REST API ACL | API security | 2 hours |
| 3 | Add assignment group conditions | Access control | 8 hours |
| 4 | Create ACLs for 8 custom tables | Data protection | 8 hours |
| 5 | Optimise 23 script-based ACLs | Performance | 16 hours |
| 6 | Secure client-callable script includes | Attack surface | 4 hours |
| 7 | Add HR profile field-level ACLs | Employee privacy | 4 hours |
| 8 | Fix conflicting cmdb_ci ACLs | CMDB security | 2 hours |
`,
  },
  {
    capability: 'scan-debt',
    title: 'Technical Debt Analysis',
    markdown: `# Technical Debt Analysis — ACME Corp (acmecorp)

## Executive Summary

This technical debt scan analysed the ACME Corp production instance across 6 categories: deprecated APIs, outdated plugins, legacy customisations, unused artifacts, upgrade blockers, and code quality debt. The instance has accumulated significant technical debt across 3 years of customisation with 47 scripts using deprecated APIs, 14 legacy Jelly UI pages, and 23 upgrade-blocking skip records. Estimated remediation effort: 168 hours. Overall health: Degraded — upgrade readiness is at risk.

## Severity Distribution

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 6 |
| Low | 4 |

## Technical Debt Summary

| Category | Items | Estimated Hours |
|----------|-------|-----------------|
| Deprecated APIs | 47 scripts | 40 |
| Legacy UI Pages | 14 pages | 80 |
| Upgrade Blockers | 23 skip records | 24 |
| Integration Debt | 6 scripts | 16 |
| Unused Artifacts | 31 items | 8 |
| **Total** | **121 items** | **168 hours** |

## Legacy Customisations

- [CRITICAL] 14 legacy Jelly-based UI pages still active — Found 14 Jelly-based UI pages in sys_ui_page that should have been migrated to Service Portal or UI Builder. These pages use deprecated g:evaluate tags and Packages.java references that will cause hard failures in the Washington release. Pages include: acme_user_dashboard, acme_ci_viewer, acme_report_builder, acme_approval_form, acme_kb_search, acme_asset_tracker, and 8 others. 6 of these pages are customer-facing via Service Portal iframes.
  Evidence: 14 sys_ui_page records with script containing 'g:evaluate' or 'Packages.java'; 6 embedded in sp_widget records
  Impact: All 14 pages will break on upgrade to Washington; 6 customer-facing pages will show errors
  Recommendation: Migrate to Service Portal widgets or UIB pages. Prioritise the 6 customer-facing pages. See CHG0040156 for the migration plan.

- [CRITICAL] 23 upgrade skip records blocking security patches — 23 records in sys_update_xml are flagged as "skip" for upgrades. These include modifications to OOB business rules on incident (8), change_request (6), problem (4), and sys_user (5). The plugin com.snc.itsm has 8 blocked updates including security patches CVE-2025-44821 and CVE-2025-44822.
  Evidence: 23 sys_update_xml records with update_action = skip; 8 com.snc.itsm blocked updates
  Impact: Security patches not applied; known vulnerabilities remain open; upgrade to next release blocked
  Recommendation: Review each skip record. Use "Revert to Base System" where possible. Monitor via glide.update.log.skip. Create custom alternatives that don't conflict with OOB.

## Deprecated APIs

- [HIGH] 47 scripts using deprecated ServiceNow APIs — Breakdown of deprecated API usage across all script artifacts:
  Packages.java.util (12 scripts) — removed in Washington release,
  GlideDialogWindow (8 client scripts) — replaced by GlideModal,
  gs.print() (6 scripts) — replaced by gs.info(),
  GlideHTTPRequest (4 scripts) — replaced by sn_ws.RESTMessageV2,
  current.update() in before rules (3 scripts) — causes infinite loops,
  synchronous GlideAjax (14 client scripts) — replaced by async getXMLAnswer.
  Evidence: 47 script artifacts with deprecated API calls identified by com.snc.instance_scan checks
  Impact: 12 scripts will hard-fail on Washington upgrade; remaining deprecated APIs generate console warnings
  Recommendation: Create phased remediation plan. Replace Packages.java references first (hard failure). Budget 40 hours for full remediation.

- [HIGH] 34 orphaned update sets older than 6 months — Found 34 update sets in sys_update_set in "In Progress" state that are older than 6 months. These contain uncommitted changes that may conflict with newer development. 8 update sets reference artifacts modified by other sets, creating potential merge conflicts.
  Evidence: 34 sys_update_set records with state=in progress, sys_created_on > 6 months ago
  Impact: Deployment pipeline blocked by potential conflicts; developer confusion over which changes are current
  Recommendation: Review and close or delete orphaned update sets. Create policy: max update set age = 30 days. See PRB0000145.

## Over-Customisation

- [HIGH] Incident form with 23 custom fields and 14 client scripts — The incident form has accumulated 23 custom fields (12 unused), 14 active client scripts, 8 custom UI policies, and 3 custom UI actions beyond OOB. The change_request form has 18 custom fields. This level of customisation makes upgrades risky and time-consuming.
  Evidence: 23 sys_dictionary records on incident with name STARTSWITH x_acme_; 12 with populated record count = 0; 14 sys_script_client on incident
  Impact: Incident form upgrade time: 16+ hours per release; 12 unused fields adding form load overhead
  Recommendation: Remove 12 unused custom fields. Consolidate 14 client scripts to 4. Document all customisations in Technical Debt Register.

- [HIGH] 6 integration scripts using deprecated GlideHTTPRequest — 6 script includes handle REST integrations to SAP, Jira, Slack, LDAP, Azure AD, and Workday using the deprecated GlideHTTPRequest class. None have error handling, retry logic, or timeout configuration.
  Evidence: 6 sys_script_include records with 'GlideHTTPRequest'; 0 with try/catch; 0 with setHttpTimeout
  Impact: Integration failures cascade to form save errors; no automatic retry; no timeout protection
  Recommendation: Migrate to sn_ws.RESTMessageV2 with setHttpTimeout(), retry policies, and gs.error() logging. Create Flow Designer integration actions for new integrations.

## Unused Artifacts

- [MEDIUM] 8 custom tables with zero records for 6+ months — 8 custom tables (x_acme_legacy_data, x_acme_temp_import, x_acme_migration_log, x_acme_test_results, x_acme_old_config, x_acme_archive_2023, x_acme_deprecated_api, x_acme_staging) have zero records. Each has associated ACLs, business rules, and form configurations consuming metadata overhead.
  Evidence: 8 sys_db_object records with name STARTSWITH x_acme_, record count = 0, created > 6 months ago
  Impact: Metadata overhead; upgrade processing time increased; developer confusion
  Recommendation: Verify truly unused (check REST API access logs). Archive and remove.

- [MEDIUM] 4 plugins more than 2 major versions behind — Outdated plugins: com.snc.cmdb.ws (3 versions behind), com.snc.knowledge_management (2 behind), com.snc.service_mapping (2 behind), com.glide.email (2 behind).
  Evidence: 4 v_plugin records with version delta >= 2 major versions vs ServiceNow store
  Impact: Missing features, unpatched vulnerabilities, incompatibility with newer plugins
  Recommendation: Create plugin upgrade plan. Test in sub-prod. Coordinate com.snc.cmdb dependency chain.

- [MEDIUM] 15 scripts with hardcoded instance URLs — Found 15 scripts containing hardcoded https://acmecorp.service-now.com. These break when cloning to sub-production instances (acmecorp-dev, acmecorp-test).
  Evidence: 15 script artifacts with string match for 'acmecorp.service-now.com'
  Impact: Scripts fail after instance clone; 4 incidents opened after each clone operation
  Recommendation: Replace with gs.getProperty('glide.servlet.uri') for dynamic URL resolution.

- [MEDIUM] 6 pairs of duplicate script include logic — Found 6 pairs of script includes with >80% code similarity: IncidentUtils/IncidentHelper, ChangeManager/ChangeProcessor, CMDBLookup/CMDBSearch, UserUtils/UserHelper, CatalogUtils/CatalogHelper, NotificationUtils/NotificationHelper.
  Evidence: 6 script include pairs with >80% code similarity via diff analysis
  Impact: Bug fixes applied to one copy but not the other; inconsistent behaviour
  Recommendation: Consolidate each pair into single authoritative script include. Update all callers.

- [MEDIUM] 23 legacy workflow contexts still active — Found 23 legacy workflow contexts in wf_context that reference deprecated workflow activities. These should be migrated to Flow Designer per ServiceNow's modernisation roadmap.
  Evidence: 23 wf_context records with state=executing, using deprecated wf_activity types
  Impact: Legacy workflows not supported in future releases; no Flow Designer analytics
  Recommendation: Identify active workflows. Create equivalent Flow Designer flows. Migrate in phases starting with approval workflows.

- [MEDIUM] 4 applications in Global scope instead of scoped — 4 custom applications (ACME HR Portal, ACME Asset Tracker, ACME Report Builder, ACME Integration Hub) store all artifacts in the Global scope instead of scoped applications. This prevents proper lifecycle management.
  Evidence: 4 logical application groups with all artifacts in sys_scope = global
  Impact: No application versioning, no clean uninstall, upgrade conflicts with OOB
  Recommendation: Create scoped applications (x_acme_*). Migrate Global artifacts. Use sys_scope table for boundaries.

## Minor Issues

- [LOW] 45 custom sys_properties, 12 with unchanged defaults — Configuration complexity without value from properties that were created but never modified from their default values.
- [LOW] 8 notification records disabled for 12+ months — Disabled sysevent_email_action records should be deleted or documented.
- [LOW] 6 redundant dictionary override records — 6 sys_dictionary_override records that match current OOB definition, providing no customisation value.
- [LOW] 15 inactive scheduled jobs not cleaned up — 15 sysauto_script records marked inactive for 6+ months should be reviewed and deleted.

## Recommendations Priority

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| 1 | Migrate 14 Jelly UI pages | Upgrade readiness | 80 hours |
| 2 | Resolve 23 upgrade skip records | Security patching | 24 hours |
| 3 | Replace 47 deprecated API calls | Future compatibility | 40 hours |
| 4 | Clean 34 orphaned update sets | Deployment clarity | 4 hours |
| 5 | Consolidate incident form | Maintainability | 8 hours |
| 6 | Migrate 6 integrations to RESTMessageV2 | Reliability | 16 hours |
| 7 | Remove 8 unused custom tables | Metadata hygiene | 4 hours |
| 8 | Upgrade 4 outdated plugins | Feature access | 8 hours |
`,
  },
];

async function main() {
  console.log('Generating 6 sample PDF reports for ACME Corp...\n');

  for (const report of reports) {
    try {
      const result = await generateReport(report.markdown, 'pdf', {
        title: report.title,
        instanceUrl: INSTANCE_URL,
        instanceName: INSTANCE_NAME,
        capability: report.capability,
        outputDir: OUTPUT_DIR,
      });
      console.log(`  ✓ ${report.capability} → ${result.filePath} (${Math.round(result.sizeBytes / 1024)} KB)`);
    } catch (err) {
      console.error(`  ✗ ${report.capability}: ${err.message}`);
    }
  }

  // Generate combined report with all capabilities
  console.log('\nGenerating combined full audit report...');
  try {
    const combinedMarkdown = reports
      .map(r => `\n\n---\n\n# ${r.title}\n\n${r.markdown}`)
      .join('\n');

    const result = await generateReport(combinedMarkdown, 'pdf', {
      title: 'Comprehensive Instance Audit',
      instanceUrl: INSTANCE_URL,
      instanceName: INSTANCE_NAME,
      capability: 'full-audit',
      outputDir: OUTPUT_DIR,
    });
    console.log(`  ✓ full-audit → ${result.filePath} (${Math.round(result.sizeBytes / 1024)} KB)`);
  } catch (err) {
    console.error(`  ✗ full-audit: ${err.message}`);
  }

  console.log('\nDone.');
}

main().catch(console.error);
