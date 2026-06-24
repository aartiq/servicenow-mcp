import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'scan-upgrade',
  title: 'Upgrade Readiness Check',
  description:
    'Check deprecated APIs, incompatible patterns, and plugin conflicts before upgrading to the next ServiceNow release',
  category: 'scan',

  arguments: [
    {
      name: 'target_release',
      description:
        'Target ServiceNow release (e.g. "zurich", "xanadu"). If omitted, checks against latest known release.',
      required: false,
    },
  ],

  recommendedTools: [
    'list_business_rules',
    'list_script_includes',
    'list_client_scripts',
    'query_records',
    'list_system_properties',
    'get_table_schema',
  ],

  buildPrompt(args) {
    const targetRelease = args?.target_release ?? 'latest';
    const releaseLabel =
      targetRelease === 'latest'
        ? 'Latest available release'
        : `${targetRelease.charAt(0).toUpperCase()}${targetRelease.slice(1)}`;

    // ─── Deprecated API Section ───────────────────────────────────────────────

    const deprecatedApiSection = [
      '## 1. Deprecated API Usage Across All Scripts',
      '',
      'Scan ALL scriptable artifact types for deprecated API calls that will break or behave',
      'differently in newer releases:',
      '',
      '### Artifact Types to Scan',
      '- **Business Rules** (`sys_script`)',
      '- **Script Includes** (`sys_script_include`)',
      '- **Client Scripts** (`sys_script_client`)',
      '- **Fix Scripts** (`sys_script_fix`)',
      '- **Scheduled Jobs** (`sysauto_script`)',
      '- **UI Actions** (`sys_ui_action`)',
      '- **UI Pages** (`sys_ui_page`) \u2014 processing scripts + client scripts',
      '- **UI Macros** (`sys_ui_macro`)',
      '- **Catalog Client Scripts** (`catalog_script_client`)',
      '- **Script Actions** (`sysevent_script_action`)',
      '- **Processors** (`sys_processor`)',
      '- **Transform Map Scripts** (`sys_transform_script`)',
      '- **Scripted REST Resources** (`sys_ws_operation`)',
      '- **REST Message Function Scripts** (`sys_rest_message_fn`)',
      '- **MID Server Script Includes** (`ecc_agent_script_include`)',
      '- **Flow Designer Script Steps** (within `sys_hub_action_instance`)',
      '- **SP Widget Server/Client Scripts** (`sp_widget`)',
      '',
      '### Deprecated Patterns to Flag',
      '',
      '**Server-Side (High Risk):**',
      '- `Packages.java.*` \u2014 Java package imports (blocked in scoped apps, deprecated in global)',
      '- `GlideRecord.getDisplayValue()` without field parameter',
      '- `current.getDisplayValue()` in async BRs (current not available)',
      '- `GlideRecord.getRowCount()` \u2014 performance issues, use `getRowCount` with caution',
      '- `getReference()` \u2014 synchronous reference lookup, use GlideRecord query',
      '- `gs.print()` \u2014 replaced by `gs.info()`',
      '- `gs.log()` \u2014 use scoped `gs.debug()` / `gs.info()` / `gs.warn()` / `gs.error()`',
      '- `GlideHTTPClient` \u2014 use `sn_ws.RESTMessageV2`',
      '- `XMLDocument` / `XMLDocument2` deprecated methods',
      '- `GlideEmailOutbound` direct usage \u2014 use Event + Notification pattern',
      '',
      '**Client-Side (High Risk):**',
      '- `GlideDialogWindow` \u2014 replaced by `GlideModal` / UI Builder modals',
      '- `GlideAjax.getXMLWait()` \u2014 synchronous, use `getXML()` with callback',
      '- `g_form.getReference()` without callback (synchronous)',
      '- `gel()` / `gel_dec()` \u2014 legacy DOM functions',
      '- `$j()` / `$$()` \u2014 Prototype.js selectors (removed in newer UI)',
      '- `g_list` API changes across versions',
      '- `GlideDialogForm` deprecated constructors',
      '',
      '**Output:** Table of deprecated calls with artifact, location, risk level, and replacement API',
    ];

    // ─── Hardcoded Sys IDs ────────────────────────────────────────────────────

    const hardcodedSysIdSection = [
      '## 2. Hardcoded Sys IDs',
      '',
      'Scan ALL scriptable artifacts for hardcoded sys_id values (32-character hex strings):',
      '',
      '- Regex pattern: `/[0-9a-f]{32}/` in script bodies',
      '- For each found sys_id, identify what record it references (if possible)',
      '- Sys IDs that differ between instances WILL break during upgrade/clone',
      '',
      '### Common Problem Areas',
      '- Hardcoded user sys_ids (should use `gs.getUserID()` or properties)',
      '- Hardcoded group sys_ids (should use `getByName()` or reference qualifiers)',
      '- Hardcoded catalog item / variable sys_ids (differ per instance)',
      '- Hardcoded table sys_ids (`sys_db_object` records)',
      '- Hardcoded update set / application sys_ids',
      '',
      '### Exceptions (Lower Risk)',
      '- System tables and OOB records that are consistent across instances',
      '- Dictionary references to well-known OOB fields',
      '',
      '**Output:** Hardcoded sys_id inventory with artifact, sys_id, referenced record (if resolved), and risk',
    ];

    // ─── Direct Table Queries ─────────────────────────────────────────────────

    const directQuerySection = [
      '## 3. Direct Table Queries That Should Use APIs',
      '',
      'Scan scripts for direct GlideRecord queries on tables that have dedicated APIs:',
      '',
      '- **`sys_user_has_role`** \u2014 use `gs.hasRole()` / `GlideUser.hasRole()`',
      '- **`sys_user_group`** / **`sys_user_grmember`** \u2014 use `gs.getUser().isMemberOf()`',
      '- **`sys_properties`** \u2014 use `gs.getProperty()` / `gs.setProperty()`',
      '- **`sys_choice`** \u2014 use `GlideChoice` API',
      '- **`cmdb_ci`** and subclasses \u2014 use CMDB APIs where available',
      '- **`sys_attachment`** \u2014 use `GlideSysAttachment` API',
      '- **`sys_journal_field`** \u2014 use `current.work_notes.getJournalEntry()`',
      '- **`task_sla`** \u2014 use `SLACalculation` API',
      '',
      'Direct table queries bypass business logic, ACLs, and may break when table schemas change.',
      '',
      '**Output:** List of direct query patterns with artifact, table queried, and recommended API',
    ];

    // ─── Version-Specific Behavior ────────────────────────────────────────────

    const versionBehaviorSection = [
      '## 4. Version-Specific Behavior Assumptions',
      '',
      'Scan for patterns that assume specific platform behavior which changes across releases:',
      '',
      '- **Execution order assumptions:** Business Rules relying on specific execution order',
      '  (order field < 100 or > 900 may conflict with OOB rules in new releases)',
      '- **Null handling changes:** `current.field == null` vs `current.field.nil()` behavior differences',
      '- **Scope isolation changes:** Global scripts accessing scoped resources or vice versa',
      '- **GlideRecord query behavior:** `get()` vs `addQuery()` + `query()` subtle differences across versions',
      '- **Security context changes:** `gs.getUser()` behavior in scheduled job context',
      '- **Time zone handling:** `GlideDateTime` parsing differences',
      '- **REST API versioning:** `/api/now/v1` vs `/api/now/v2` differences',
      '',
      '**Output:** Behavior-dependent patterns with artifact, assumption, and risk if behavior changes',
    ];

    // ─── Plugin Compatibility ─────────────────────────────────────────────────

    const pluginSection = [
      '## 5. Plugin Compatibility',
      '',
      'Use `query_records` on `v_plugin` and `list_system_properties` to check:',
      '',
      '- **Active plugins** against known compatibility matrix for target release',
      '- **Plugin dependencies:** plugins requiring other plugins that may be deprecated',
      '- **Store apps** that may not have a compatible version for target release',
      '- **Plugin activation order** dependencies that may change',
      '- **Demo data plugins** active in production (may interfere with upgrades)',
      '- **Legacy plugins** replaced by new functionality in target release:',
      '  - Legacy Workflow \u2192 Flow Designer',
      '  - Legacy Portal \u2192 Service Portal / Next Experience',
      '  - Legacy CMDB \u2192 CMDB Workspace',
      '  - Legacy Reporting \u2192 Performance Analytics',
      '',
      '**Output:** Plugin compatibility matrix with status (compatible/deprecated/unknown/at-risk)',
    ];

    // ─── UI & Navigation ──────────────────────────────────────────────────────

    const uiSection = [
      '## 6. Custom UI & Navigation Compatibility',
      '',
      'Use `query_records` to scan UI artifacts that may break with UI framework changes:',
      '',
      '### Classic UI \u2192 Next Experience Migration',
      '- **UI Pages** (`sys_ui_page`) \u2014 Jelly-based pages will not render in Next Experience',
      '- **UI Macros** (`sys_ui_macro`) \u2014 Jelly macros are Classic UI only',
      '- **Formatters** (`sys_ui_formatter`) \u2014 may need workspace equivalents',
      '- **Homepage widgets** (`sys_ui_hp_publisher`) \u2014 replaced by dashboard/workspace',
      '- **Content blocks** \u2014 Classic CMS content not compatible with Next Experience',
      '',
      '### Service Portal \u2192 Next Experience',
      '- **SP Widgets** (`sp_widget`) using AngularJS 1.x \u2014 no path to Next Experience without rewrite',
      '- **Angular Providers** \u2014 will need migration to Seismic components',
      '- **SP Pages** with custom CSS that may conflict with Next Experience theming',
      '- **SP Themes** and CSS includes \u2014 not compatible with workspace theming',
      '',
      '### Navigation',
      '- **Custom modules** (`sys_app_module`) with URL-type links to Classic UI pages',
      '- **Application menus** relying on Classic UI navigation structure',
      '- **Interceptors** (`sys_ui_interceptor`) \u2014 behavior may change',
      '',
      '**Output:** UI migration risk matrix per artifact type with estimated rewrite effort',
    ];

    // ─── Java Package Imports ─────────────────────────────────────────────────

    const javaImportSection = [
      '## 7. Java Package Imports in Scripts',
      '',
      'Scan ALL server-side scripts for Java package usage via `Packages.*`:',
      '',
      '### Patterns to Find',
      '- `Packages.java.lang.*` (String, Integer, etc.)',
      '- `Packages.java.util.*` (ArrayList, HashMap, etc.)',
      '- `Packages.java.io.*` (File, InputStream, etc.)',
      '- `Packages.java.net.*` (URL, HttpURLConnection, etc.)',
      '- `Packages.javax.*` (xml, crypto, etc.)',
      '- `Packages.org.*` (apache, json, etc.)',
      '- `Packages.com.glide.*` (direct Glide Java API access)',
      '- `Packages.com.snc.*` (ServiceNow internal Java classes)',
      '',
      '### Migration Path',
      '- `Packages.java.util.ArrayList` \u2192 use JavaScript arrays `[]`',
      '- `Packages.java.util.HashMap` \u2192 use JavaScript objects `{}`',
      '- `Packages.java.lang.String` \u2192 use JavaScript string methods',
      '- `Packages.java.io.*` \u2192 use `GlideSysAttachment`, `sn_ws.RESTMessageV2`',
      '- `Packages.com.glide.*` \u2192 use documented Scoped API equivalents',
      '',
      'Java imports are BLOCKED in scoped applications and will be removed in future releases.',
      '',
      '**Output:** Java import inventory with artifact, import path, usage context, and JavaScript replacement',
    ];

    // ─── Undocumented API Usage ───────────────────────────────────────────────

    const undocumentedApiSection = [
      '## 8. Undocumented & Internal API Usage',
      '',
      'Scan for usage of undocumented/internal APIs that can break without notice:',
      '',
      '- **`GlideController`** methods not in public documentation',
      '- **`GlideappCalculationHelper`** and other `Glideapp*` internal classes',
      '- **`GlidePluginManager`** direct calls (use `gs.hasPlugin()` instead)',
      '- **`GlideUpdateManager`** / `GlideUpdateSet` internal methods',
      '- **`TableUtils`** undocumented methods',
      '- **`GlideDBObjectManager`** direct access',
      '- **Internal REST endpoints** (`/xmlstats.do`, `/navpage.do`, `/stats.do`)',
      '- **`SNC.*`** namespace calls (internal ServiceNow classes)',
      '- **`global.*`** scope crossover calls in scoped apps',
      '- **`new GlideScriptEvaluator()`** and similar internal evaluators',
      '',
      '**Output:** Undocumented API inventory with artifact, API call, risk level, and documented alternative',
    ];

    // ─── Report Format ────────────────────────────────────────────────────────

    const reportFormat = [
      '## Upgrade Readiness Report Format',
      '',
      'Compile ALL findings into this structure:',
      '',
      '```',
      'UPGRADE READINESS REPORT',
      '========================',
      `Target Release: ${releaseLabel}`,
      'Current Version: [detected from instance]',
      'Date: [current date]',
      '',
      'READINESS SCORE',
      '  Overall: [Ready / Ready with Caveats / Not Ready]',
      '  Estimated remediation: [X hours/days]',
      '',
      'MIGRATION RISK MATRIX',
      '------------------------------------------------------------',
      '| Artifact Type          | Count | Risk   | Effort         |',
      '|-----------------------|-------|--------|----------------|',
      '| Deprecated APIs       | X     | [H/M/L]| [hours/days]   |',
      '| Hardcoded sys_ids     | X     | [H/M/L]| [hours/days]   |',
      '| Direct table queries  | X     | [H/M/L]| [hours/days]   |',
      '| Version assumptions   | X     | [H/M/L]| [hours/days]   |',
      '| Plugin conflicts      | X     | [H/M/L]| [hours/days]   |',
      '| UI compatibility      | X     | [H/M/L]| [hours/days]   |',
      '| Java imports          | X     | [H/M/L]| [hours/days]   |',
      '| Undocumented APIs     | X     | [H/M/L]| [hours/days]   |',
      '------------------------------------------------------------',
      '',
      'RISK DEFINITIONS',
      '  HIGH   \u2014 Will break during or after upgrade; must fix before upgrade',
      '  MEDIUM \u2014 May cause issues; should fix before upgrade',
      '  LOW    \u2014 Minor risk; can fix after upgrade',
      '',
      'BLOCKING ISSUES (must resolve before upgrade)',
      '1. [issue + affected artifact]',
      '',
      'PRE-UPGRADE CHECKLIST',
      '[ ] All deprecated APIs replaced',
      '[ ] Hardcoded sys_ids converted to properties',
      '[ ] Plugin compatibility verified',
      '[ ] Custom UI migration plan created',
      '[ ] Java imports replaced with JavaScript equivalents',
      '[ ] Undocumented APIs replaced with supported alternatives',
      '[ ] Clone + test upgrade completed in sub-prod',
      '',
      'DETAILED FINDINGS',
      '[Organized by category, each item with artifact, code evidence, risk, and fix]',
      '```',
    ];

    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: [
            '# Capability: Upgrade Readiness Check',
            '',
            `**Target Release:** ${releaseLabel}`,
            '',
            'This capability scans every scriptable and configurable artifact type for patterns',
            'that will break, degrade, or behave differently after upgrading to the target release.',
            'The output is a migration risk matrix that tells you exactly what to fix before upgrading.',
            '',
            'CRITICAL INSTRUCTION: Scan ALL artifact types listed in each section. Upgrade issues',
            'hide everywhere \u2014 a single `Packages.java` call in an obscure UI Page processor can',
            'block an entire upgrade.',
            '',
            ...deprecatedApiSection, '',
            ...hardcodedSysIdSection, '',
            ...directQuerySection, '',
            ...versionBehaviorSection, '',
            ...pluginSection, '',
            ...uiSection, '',
            ...javaImportSection, '',
            ...undocumentedApiSection, '',
            ...reportFormat,
            '',
            '---',
            '',
            'Beginning upgrade readiness check. Every finding must include the artifact type,',
            'name, exact code evidence, risk level, and specific remediation steps.',
            '',
            'After presenting your analysis, offer to generate a branded PDF or PPTX report by calling the `generate_report` tool with your full analysis.',
          ].join('\n'),
        },
      },
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text:
            targetRelease === 'latest'
              ? 'Run an upgrade readiness check on my ServiceNow instance for the latest release. Scan every artifact type and give me a migration risk matrix.'
              : `Run an upgrade readiness check on my ServiceNow instance for the ${releaseLabel} release. Scan every artifact type and give me a migration risk matrix.`,
        },
      },
    ];
  },
};

export default capability;
