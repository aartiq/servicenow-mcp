import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'scan-security',
  title: 'Security Audit',
  description:
    'Comprehensive security scan \u2014 ACLs, roles, scripts, APIs, compliance across ALL artifact types',
  category: 'scan',

  arguments: [
    {
      name: 'scope',
      description:
        'Audit scope: "instance" for full audit, or a specific table/app name for targeted audit',
      required: true,
    },
    {
      name: 'focus',
      description:
        'Narrow the audit focus: "acls", "roles", "scripts", "api", or "all" (default)',
      required: false,
    },
  ],

  recommendedTools: [
    'list_acls',
    'get_acl',
    'list_users',
    'list_groups',
    'list_business_rules',
    'list_script_includes',
    'list_client_scripts',
    'list_ui_policies',
    'list_ui_actions',
    'list_rest_messages',
    'list_oauth_applications',
    'query_records',
    'get_table_schema',
  ],

  buildPrompt(args) {
    const scope = args?.scope ?? 'instance';
    const focus = args?.focus ?? 'all';

    const isFullInstance = scope === 'instance';
    const scopeLabel = isFullInstance
      ? 'Full instance security audit'
      : `Targeted security audit of \`${scope}\``;

    const focusLabel: Record<string, string> = {
      all: 'All security domains',
      acls: 'ACLs & access control',
      roles: 'Roles & user privileges',
      scripts: 'Script security (server + client)',
      api: 'API & integration security',
    };

    const focusDescription = focusLabel[focus] ?? `Custom focus: ${focus}`;

    // ─── ACL Section ──────────────────────────────────────────────────────────

    const aclSection = [
      '## 1. ACL Security Analysis',
      '',
      'Use `list_acls`, `get_acl`, `query_records`, and `get_table_schema` to scan:',
      '',
      '### Missing ACLs',
      '- Tables with custom data but NO ACLs defined (query `sys_db_object` cross-referenced with `sys_security_acl`)',
      '- Tables with record-level ACLs but no field-level ACLs on sensitive fields (e.g., `password`, `email`, `ssn`)',
      '- CRUD operations missing coverage (table has read ACL but no create/write/delete)',
      '',
      '### Overly Permissive ACLs',
      '- ACLs with empty conditions and no script (unconditional access)',
      '- ACLs granting access to all roles via `*` wildcard',
      '- ACLs where the only check is `gs.hasRole("admin")` (admin-only shortcut)',
      '- ACLs with `advanced: false` and no condition (default allow)',
      '- Read ACLs that expose all fields without field-level restrictions',
      '',
      '### Dangerous Patterns',
      '- ACLs with `setWorkflow(false)` that skip other security checks',
      '- ACLs with `type: record` that have no condition and no script',
      '- Duplicate ACLs (same table + operation + role combination)',
      '- ACLs on `sys_*` tables that weaken platform security',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | ACL Name | Table | Operation | Issue | Recommendation |',
    ];

    // ─── Role Section ─────────────────────────────────────────────────────────

    const roleSection = [
      '## 2. Role & Privilege Analysis',
      '',
      'Use `list_users`, `list_groups`, and `query_records` on `sys_user_has_role`, `sys_user_role`, `sys_group_has_role` to scan:',
      '',
      '### Admin Overuse',
      '- Count of users with `admin` role (flag if > 10 or > 2% of total users)',
      '- Service accounts with `admin` (should use scoped roles)',
      '- Groups with `admin` role (every member inherits it)',
      '- Users with admin who have not logged in for 90+ days',
      '',
      '### Role Explosion',
      '- Total custom role count (flag if > 200)',
      '- Roles with no users or groups assigned (orphan roles)',
      '- Roles that contain other roles with conflicting permissions',
      '- Deeply nested role hierarchies (> 3 levels deep)',
      '',
      '### Privilege Escalation Risks',
      '- Custom roles that inherit from `admin` or `security_admin`',
      '- Roles granting access to `sys_script`, `sys_security_acl`, or `sys_user_has_role` tables',
      '- Users with both `impersonator` and elevated roles',
      '- Separation of duty violations (e.g., same user can create and approve changes)',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | Role/User | Issue | Risk | Recommendation |',
    ];

    // ─── Server Script Section ────────────────────────────────────────────────

    const serverScriptSection = [
      '## 3. Server-Side Script Security',
      '',
      'Use `list_business_rules`, `list_script_includes`, `list_scheduled_jobs`, and `query_records` to scan',
      'ALL server-side scriptable artifact types:',
      '',
      '### Artifact Types to Scan',
      '- **Business Rules** (`sys_script`) \u2014 before/after/async/display',
      '- **Script Includes** (`sys_script_include`) \u2014 classPrototype, on-demand, used by BRs/flows',
      '- **Fix Scripts** (`sys_script_fix`) \u2014 one-time execution scripts',
      '- **Scheduled Jobs** (`sysauto_script`) \u2014 recurring server scripts',
      '- **MID Server Script Includes** (`ecc_agent_script_include`)',
      '- **Script Actions** (`sysevent_script_action`) \u2014 event-driven scripts',
      '- **Processors** (`sys_processor`) \u2014 custom URL handlers',
      '- **Transform Map Scripts** (`sys_transform_script`) \u2014 onBefore/onAfter/onForeignInsert',
      '- **REST Message Functions** (`sys_rest_message_fn`) \u2014 scripted HTTP methods',
      '- **Scripted REST Resources** (`sys_ws_operation`) \u2014 custom API endpoints',
      '',
      '### Patterns to Flag',
      '- **Code injection:** `eval()`, `GlideEvaluator`, `GlideScopedEvaluator` with dynamic input',
      '- **SQL/GlideRecord injection:** string concatenation in `addQuery()` or `addEncodedQuery()`',
      '- **Credential exposure:** hardcoded passwords, API keys, tokens, connection strings',
      '- **Insecure imports:** `Packages.java.*`, `GlideHTTPClient` without TLS validation',
      '- **ACL bypass:** `setWorkflow(false)`, `autoSysFields(false)` without justification',
      '- **Missing input validation:** `current.getValue()` used directly in queries without sanitization',
      '- **Dangerous GlideSystem calls:** `gs.include()` with dynamic names, `gs.xmlToJSON()` with untrusted input',
      '- **Privilege escalation:** scripts that elevate roles or modify ACL tables',
      '- **Logging sensitive data:** `gs.log()` / `gs.debug()` with passwords or PII',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | Artifact Type | Name | Sys ID | Pattern Found | Line/Evidence | Recommendation |',
    ];

    // ─── Client Script Section ────────────────────────────────────────────────

    const clientScriptSection = [
      '## 4. Client-Side Script Security',
      '',
      'Use `list_client_scripts`, `list_ui_policies`, `list_ui_actions`, and `query_records` to scan',
      'ALL client-side scriptable artifact types:',
      '',
      '### Artifact Types to Scan',
      '- **Client Scripts** (`sys_script_client`) \u2014 onLoad, onChange, onSubmit, onCellEdit',
      '- **UI Policies** (`sys_ui_policy`) \u2014 with script actions',
      '- **UI Actions** (`sys_ui_action`) \u2014 with client=true or onclick scripts',
      '- **UI Pages** (`sys_ui_page`) \u2014 processing scripts, client scripts, HTML',
      '- **UI Macros** (`sys_ui_macro`) \u2014 Jelly template scripts',
      '- **Catalog Client Scripts** (`catalog_script_client`)',
      '- **Catalog UI Policies** (`catalog_ui_policy`)',
      '',
      '### Patterns to Flag',
      '- **XSS vulnerabilities:** `innerHTML`, `document.write()`, `jQuery.html()` with dynamic content',
      '- **Data exposure:** client scripts fetching sensitive fields (password, SSN, salary) via GlideAjax',
      '- **Client-only validation:** form validation without server-side enforcement in Business Rules',
      '- **Hardcoded values:** URLs, sys_ids, credentials embedded in client scripts',
      '- **DOM manipulation:** direct DOM access that may break across UI versions',
      '- **Excessive GlideAjax:** multiple synchronous server calls in a single script',
      '- **Console logging:** `console.log()`, `jslog()` exposing internal data',
      '- **Eval usage:** `eval()`, `new Function()`, `setTimeout` with string arguments',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | Artifact Type | Name | Pattern Found | Evidence | Recommendation |',
    ];

    // ─── Flows & Automation Section ───────────────────────────────────────────

    const flowSection = [
      '## 5. Flows & Automation Security',
      '',
      'Use `query_records` on `sys_hub_flow`, `sys_hub_action_instance`, and legacy `wf_workflow` to scan:',
      '',
      '- **Flow Actions** with inline scripts \u2014 same script patterns as server scripts',
      '- **Subflows** running as System \u2014 should use least-privilege run-as',
      '- **Legacy Workflows** (`wf_workflow`) with Run Script activities',
      '- **Flow triggers** on sensitive tables without condition filters',
      '- **Credential usage** in flows \u2014 plain-text vs credential alias',
      '- **Spoke actions** calling external systems without TLS verification',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | Flow/Workflow Name | Issue | Recommendation |',
    ];

    // ─── API Section ──────────────────────────────────────────────────────────

    const apiSection = [
      '## 6. API & Integration Security',
      '',
      'Use `list_rest_messages`, `list_oauth_applications`, and `query_records` to scan:',
      '',
      '### REST & SOAP',
      '- **REST Messages** (`sys_rest_message`) with basic auth over HTTP (not HTTPS)',
      '- **Scripted REST APIs** (`sys_ws_operation`) without ACL or role requirements',
      '- **REST endpoints** returning excessive data (no field selection, no pagination)',
      '- **SOAP endpoints** still active but unused',
      '',
      '### OAuth & Credentials',
      '- **OAuth applications** with overly broad scopes',
      '- **OAuth tokens** with no expiration or very long lifetimes',
      '- **Credential aliases** unused or referencing stale credentials',
      '- **Basic auth profiles** that should be migrated to OAuth',
      '',
      '### Data Exposure',
      '- **API endpoints** returning sensitive fields (password, SSN, etc.)',
      '- **Missing rate limiting** on public-facing APIs',
      '- **CORS misconfiguration** (`glide.rest.cors.*` properties)',
      '- **API versioning** \u2014 deprecated API versions still active',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | API Name | Type | Issue | Recommendation |',
    ];

    // ─── Portal Section ──────────────────────────────────────────────────────

    const portalSection = [
      '## 7. Portal & UI Security',
      '',
      'Use `query_records` on `sp_widget`, `sp_angular_provider`, `sp_page`, `sys_portal_page` to scan:',
      '',
      '- **SP Widgets** with inline `<script>` tags or `ng-bind-html` without `$sce.trustAsHtml` filtering',
      '- **Angular Providers** exposing server-side data without access control',
      '- **Widget server scripts** that query sensitive tables without role checks',
      '- **Client controllers** with `$http` calls bypassing standard API',
      '- **Portal pages** with embedded iframes to external domains',
      '- **CSS injection** via unvalidated user input in widget options',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | Widget/Page Name | Issue | Recommendation |',
    ];

    // ─── Integration Section ──────────────────────────────────────────────────

    const integrationSection = [
      '## 8. Integration & Data Pipeline Security',
      '',
      'Use `query_records` on `sys_transform_map`, `sys_import_set`, `sys_data_source` to scan:',
      '',
      '- **Transform Maps** with onBefore/onAfter scripts containing injection risks',
      '- **Import Sets** from untrusted external sources without validation',
      '- **Data Sources** using FTP or unencrypted protocols',
      '- **MID Server** integrations without certificate pinning',
      '- **LDAP/SSO** configurations with fallback to local auth',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | Integration Name | Type | Issue | Recommendation |',
    ];

    // ─── Notification Section ─────────────────────────────────────────────────

    const notificationSection = [
      '## 9. Notification Security',
      '',
      'Use `query_records` on `sysevent_email_action`, `sys_email_template`, `sys_email` to scan:',
      '',
      '- **Email notifications** with scripted conditions exposing sensitive data in mail body',
      '- **Email templates** with Jelly/Angular expressions that can be exploited (template injection)',
      '- **Mail scripts** (`sys_script_email`) querying sensitive fields for email body',
      '- **Notifications** sent to external domains with internal data',
      '- **SMS/Push** notifications with sensitive field references',
      '',
      '**Output per finding:**',
      '| Finding ID | Severity | Notification Name | Issue | Recommendation |',
    ];

    // ─── Build sections based on focus ────────────────────────────────────────

    let sections: string[][];
    switch (focus) {
      case 'acls':
        sections = [aclSection];
        break;
      case 'roles':
        sections = [roleSection];
        break;
      case 'scripts':
        sections = [serverScriptSection, clientScriptSection, flowSection];
        break;
      case 'api':
        sections = [apiSection, integrationSection];
        break;
      default:
        sections = [
          aclSection,
          roleSection,
          serverScriptSection,
          clientScriptSection,
          flowSection,
          apiSection,
          portalSection,
          integrationSection,
          notificationSection,
        ];
    }

    // ─── Report Format ────────────────────────────────────────────────────────

    const reportFormat = [
      '## Security Audit Report Format',
      '',
      'Compile ALL findings into this structure:',
      '',
      '```',
      'SECURITY AUDIT REPORT',
      '======================',
      `Scope: ${isFullInstance ? 'Full instance' : scope}`,
      `Focus: ${focusDescription}`,
      'Date: [current date]',
      '',
      'EXECUTIVE SUMMARY',
      '- Critical findings: X',
      '- High findings: X',
      '- Medium findings: X',
      '- Low findings: X',
      '- Overall risk rating: [Critical / High / Medium / Low]',
      '',
      'DETAILED FINDINGS',
      '-----------------',
      'Each finding MUST include:',
      '  Finding ID:      SEC-XXXX',
      '  Severity:        Critical / High / Medium / Low',
      '  Category:        ACL / Role / Server Script / Client Script / Flow / API / Portal / Integration / Notification',
      '  Artifact:        [type] — [name] (sys_id)',
      '  Evidence:        [exact code snippet, configuration value, or query result]',
      '  Risk:            [what an attacker could exploit]',
      '  Recommendation:  [specific fix with code example where applicable]',
      '',
      'SEVERITY DEFINITIONS',
      '  CRITICAL — Exploitable now; data breach or privilege escalation possible',
      '  HIGH     — Exploitable with moderate effort; significant data exposure',
      '  MEDIUM   — Weakness that could be chained with other issues',
      '  LOW      — Best-practice violation; minimal direct risk',
      '',
      'REMEDIATION PRIORITIES',
      '1. [Critical items — fix immediately]',
      '2. [High items — fix within 1 week]',
      '3. [Medium items — fix within 1 month]',
      '4. [Low items — address in next review cycle]',
      '',
      'COMPLIANCE NOTES',
      '- [Any SOX, HIPAA, GDPR, SOC2 implications]',
      '```',
    ];

    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: [
            '# Capability: Security Audit',
            '',
            `**Scope:** ${scopeLabel}`,
            `**Focus:** ${focusDescription}`,
            '',
            'This capability performs a comprehensive security audit covering EVERY scriptable',
            'and configurable artifact type in the ServiceNow instance. The audit is exhaustive \u2014',
            'it does not stop at ACLs and roles but inspects every place where security gaps can hide.',
            '',
            'CRITICAL INSTRUCTION: You must scan ALL artifact types listed below, not just the',
            'common ones. Security gaps often hide in overlooked areas like transform map scripts,',
            'UI macros, catalog client scripts, and email templates.',
            '',
            ...sections.flatMap(s => [...s, '']),
            ...reportFormat,
            '',
            '---',
            '',
            'Beginning security audit. Every finding must include its Finding ID, severity,',
            'category, concrete evidence, and a specific recommendation.',
            '',
            'After presenting your analysis, offer to generate a branded PDF or PPTX report by calling the `generate_report` tool with your full analysis.',
          ].join('\n'),
        },
      },
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: isFullInstance
            ? `Run a comprehensive security audit on my ServiceNow instance. Focus: ${focus}. Scan every artifact type and give me a structured report with finding IDs and severity ratings.`
            : `Run a targeted security audit on \`${scope}\`. Focus: ${focus}. Scan every relevant artifact type and give me a structured report with finding IDs and severity ratings.`,
        },
      },
    ];
  },
};

export default capability;
