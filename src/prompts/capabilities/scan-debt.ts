import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'scan-debt',
  title: 'Technical Debt Analysis',
  description:
    'Find dead code, unused scripts, duplicate logic, stale configurations across ALL artifact types',
  category: 'scan',

  arguments: [
    {
      name: 'scope',
      description:
        'Scope of analysis: "instance" (default) for full scan, or a specific table/app name',
      required: false,
    },
  ],

  recommendedTools: [
    'list_business_rules',
    'list_script_includes',
    'list_client_scripts',
    'list_ui_policies',
    'list_ui_actions',
    'query_records',
    'list_update_sets',
    'list_scheduled_jobs',
    'list_flows',
  ],

  buildPrompt(args) {
    const scope = args?.scope ?? 'instance';
    const isFullInstance = scope === 'instance';
    const scopeLabel = isFullInstance
      ? 'Full instance technical debt analysis'
      : `Technical debt analysis for \`${scope}\``;

    // ─── Inactive / Disabled Artifacts ────────────────────────────────────────

    const inactiveSection = [
      '## 1. Inactive & Disabled Artifacts',
      '',
      'Scan ALL artifact types for inactive/disabled items that are candidates for removal:',
      '',
      'Use `list_business_rules`, `list_client_scripts`, `list_ui_policies`, `list_ui_actions`,',
      '`list_scheduled_jobs`, `list_flows`, and `query_records` to find:',
      '',
      '- **Business Rules** (`sys_script`) \u2014 `active=false`; note last modified date',
      '- **Client Scripts** (`sys_script_client`) \u2014 `active=false`',
      '- **UI Policies** (`sys_ui_policy`) \u2014 `active=false`',
      '- **UI Actions** (`sys_ui_action`) \u2014 `active=false`',
      '- **Scheduled Jobs** (`sysauto_script`) \u2014 `active=false`',
      '- **Flows** (`sys_hub_flow`) \u2014 `active=false` or draft state',
      '- **Workflows** (`wf_workflow`) \u2014 `active=false` (legacy)',
      '- **Script Includes** (`sys_script_include`) \u2014 `active=false`',
      '- **Notifications** (`sysevent_email_action`) \u2014 `active=false`',
      '- **ACLs** (`sys_security_acl`) \u2014 `active=false`',
      '- **Transform Maps** (`sys_transform_map`) \u2014 `active=false`',
      '- **Data Sources** (`sys_data_source`) \u2014 `active=false`',
      '',
      'For each, note: name, table, last modified, last modified by, inactive duration.',
      'Flag items inactive for > 90 days as safe removal candidates.',
      '',
      '**Output:** Count per artifact type + detailed list sorted by inactive duration',
    ];

    // ─── Unused Script Includes ───────────────────────────────────────────────

    const unusedScriptsSection = [
      '## 2. Unreferenced Script Includes',
      '',
      'Use `list_script_includes` and `query_records` to identify Script Includes not referenced',
      'by any other artifact:',
      '',
      '- Get all active Script Includes (name and API name)',
      '- For each, search across these artifact types for references to its name:',
      '  - Business Rules scripts',
      '  - Other Script Includes',
      '  - Client Scripts (GlideAjax calls)',
      '  - Fix Scripts',
      '  - Scheduled Jobs',
      '  - Flow Designer script steps',
      '  - Workflow run-script activities',
      '  - REST message scripts',
      '  - Transform map scripts',
      '',
      'A Script Include with zero references is likely dead code.',
      '',
      'NOTE: Some SIs are invoked dynamically (`GlideEvaluator`, `gs.include()`). Flag these',
      'as "possibly unused" rather than "confirmed unused".',
      '',
      '**Output:** List of unreferenced Script Includes with creation date and last update',
    ];

    // ─── Duplicate Artifacts ──────────────────────────────────────────────────

    const duplicateSection = [
      '## 3. Duplicate & Redundant Artifacts',
      '',
      'Use `query_records` to find duplicates across artifact types:',
      '',
      '- **Duplicate ACLs:** same table + operation + role combination',
      '- **Duplicate Business Rules:** same table + when + order with similar script bodies',
      '- **Overlapping Client Scripts:** same table + type (onChange/onLoad) on same field',
      '- **Redundant UI Policies:** same table with conflicting or identical conditions',
      '- **Duplicate Scheduled Jobs:** similar names and scripts running on overlapping schedules',
      '- **Overlapping Notifications:** same event + table + conditions',
      '',
      'For script-based duplicates, compare script content for > 80% similarity.',
      '',
      '**Output:** Duplicate pairs/groups with recommendation on which to keep',
    ];

    // ─── Stale Update Sets ────────────────────────────────────────────────────

    const staleUpdateSetsSection = [
      '## 4. Stale Update Sets',
      '',
      'Use `list_update_sets` and `query_records` on `sys_update_set` to find:',
      '',
      '- Update sets in "in progress" state for > 30 days',
      '- Update sets with 0 customer updates (empty)',
      '- Update sets created by users who have since left (inactive users)',
      '- Batch parent update sets with incomplete children',
      '- Update sets with naming that suggests they are test/temporary',
      '',
      '**Output:** Stale update set inventory with age, owner, and update count',
    ];

    // ─── Empty / Stub Scripts ─────────────────────────────────────────────────

    const emptyScriptSection = [
      '## 5. Empty & Stub Scripts',
      '',
      'Use `query_records` to find artifacts that were created but never properly implemented:',
      '',
      '- Business Rules with empty `script` field or only comments/placeholder text',
      '- Script Includes with only the class prototype boilerplate and no actual methods',
      '- Client Scripts with empty `script` field',
      '- UI Actions with no script and no URL',
      '- Scheduled Jobs with empty or trivial scripts (only `gs.log`)',
      '- Flow Actions with no steps defined',
      '',
      '**Output:** List of stub artifacts with creation date and creator',
    ];

    // ─── Orphaned Records ─────────────────────────────────────────────────────

    const orphanedSection = [
      '## 6. Orphaned Records & Broken References',
      '',
      'Use `query_records` to detect:',
      '',
      '- Business Rules referencing tables that no longer exist',
      '- Client Scripts on tables that have been removed',
      '- ACLs for deleted tables or fields',
      '- Notification references to deleted events',
      '- Workflow contexts for deleted workflow versions',
      '- Dictionary entries (`sys_dictionary`) for non-existent tables',
      '- Catalog variables referencing deleted catalog items',
      '- Group memberships for inactive users',
      '',
      '**Output:** Orphaned record inventory by type with broken reference details',
    ];

    // ─── Deprecated API Usage ─────────────────────────────────────────────────

    const deprecatedApiSection = [
      '## 7. Deprecated API Usage',
      '',
      'Scan ALL scriptable artifacts for deprecated API patterns:',
      '',
      '- **`Packages.java.*`** \u2014 Java package imports (removed in scoped apps, deprecated globally)',
      '- **`GlideRecord.getDisplayValue()`** without field parameter (ambiguous behavior)',
      '- **`current.getDisplayValue()`** without field in async Business Rules',
      '- **`gs.print()`** \u2014 deprecated, use `gs.info()` / `gs.debug()`',
      '- **`getReference()`** \u2014 synchronous, use `GlideRecord` query instead',
      '- **`GlideAjax` synchronous calls** \u2014 `getXMLWait()` is deprecated',
      '- **`g_form.getReference()`** without callback',
      '- **`GlideDialogWindow`** \u2014 replaced by `GlideModal`',
      '- **`gel()`** \u2014 use standard DOM APIs or `g_form`',
      '- **`$j()` / prototype.js`** patterns in UI scripts',
      '',
      '**Output:** Deprecated API usage inventory with file, line/context, and modern replacement',
    ];

    // ─── Debug / Test Artifacts ───────────────────────────────────────────────

    const debugSection = [
      '## 8. Debug & Test Artifacts in Production',
      '',
      'Scan ALL artifact types for debug/test patterns that should not be in production:',
      '',
      '- **Server-side debug logging:**',
      '  - `gs.log()` (should use `gs.debug()` with system property gating)',
      '  - `gs.print()` (deprecated and verbose)',
      '  - `gs.logWarning()` / `gs.logError()` with test/debug messages',
      '',
      '- **Client-side debug logging:**',
      '  - `console.log()`, `console.debug()`, `console.warn()`',
      '  - `jslog()` left in production scripts',
      '  - `alert()` calls used for debugging',
      '',
      '- **Test artifacts:**',
      '  - Scripts with "test", "debug", "temp", "TODO", "FIXME", "HACK" in name or script',
      '  - Business Rules with names like "test BR" or "debug rule"',
      '  - Hardcoded test data (test user sys_ids, test email addresses)',
      '',
      '- **Commented-out code blocks:**',
      '  - Large blocks of commented code (> 5 consecutive comment lines that look like code)',
      '  - Commented-out `addQuery` / `addEncodedQuery` lines',
      '  - Commented-out function calls',
      '',
      '**Output:** Debug/test artifact inventory with artifact type, name, pattern found, and evidence',
    ];

    // ─── Report Format ────────────────────────────────────────────────────────

    const reportFormat = [
      '## Technical Debt Report Format',
      '',
      'Compile all findings into this structure:',
      '',
      '```',
      'TECHNICAL DEBT REPORT',
      '=====================',
      `Scope: ${isFullInstance ? 'Full instance' : scope}`,
      'Date: [current date]',
      '',
      'DEBT SUMMARY',
      '------------',
      '| Category                    | Count | Est. Cleanup Effort |',
      '|-----------------------------|-------|---------------------|',
      '| Inactive artifacts          | X     | [hours/days]        |',
      '| Unreferenced Script Includes| X     | [hours/days]        |',
      '| Duplicate artifacts         | X     | [hours/days]        |',
      '| Stale update sets           | X     | [hours/days]        |',
      '| Empty/stub scripts          | X     | [hours/days]        |',
      '| Orphaned records            | X     | [hours/days]        |',
      '| Deprecated API usage        | X     | [hours/days]        |',
      '| Debug/test artifacts        | X     | [hours/days]        |',
      '| TOTAL                       | X     | [hours/days]        |',
      '',
      'EFFORT ESTIMATION GUIDE',
      '  Trivial:  < 5 min per item (delete inactive, remove debug logs)',
      '  Low:      5-15 min per item (update deprecated API calls)',
      '  Medium:   15-60 min per item (refactor duplicates, fix orphans)',
      '  High:     1-4 hours per item (rewrite scripts, consolidate logic)',
      '',
      'DETAILED FINDINGS',
      '[Organized by category, each item with name, type, evidence, effort estimate]',
      '',
      'CLEANUP PRIORITIES',
      '1. [Quick wins — high count, trivial effort]',
      '2. [Risk reduction — orphans and deprecated APIs]',
      '3. [Maintenance — duplicates and stale items]',
      '',
      'RECOMMENDED CLEANUP PROCESS',
      '1. Back up via update set before removing anything',
      '2. Start with inactive artifacts (lowest risk)',
      '3. Test deprecated API replacements in sub-prod first',
      '4. Schedule regular debt reviews (quarterly)',
      '```',
    ];

    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: [
            '# Capability: Technical Debt Analysis',
            '',
            `**Scope:** ${scopeLabel}`,
            '',
            'This capability performs an exhaustive scan for technical debt across ALL artifact types',
            'in the ServiceNow instance. It identifies dead code, unused scripts, duplicate logic,',
            'stale configurations, deprecated patterns, and debug artifacts that should be cleaned up.',
            '',
            'CRITICAL INSTRUCTION: Scan every artifact type, not just Business Rules and Script Includes.',
            'Technical debt hides in UI Policies, Notifications, Transform Maps, and many other places.',
            '',
            ...inactiveSection, '',
            ...unusedScriptsSection, '',
            ...duplicateSection, '',
            ...staleUpdateSetsSection, '',
            ...emptyScriptSection, '',
            ...orphanedSection, '',
            ...deprecatedApiSection, '',
            ...debugSection, '',
            ...reportFormat,
            '',
            '---',
            '',
            'Beginning technical debt analysis. Every finding must include artifact type, name,',
            'evidence, and estimated cleanup effort.',
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
            ? 'Run a full technical debt analysis on my ServiceNow instance. Scan every artifact type and give me a structured debt inventory with cleanup effort estimates.'
            : `Run a technical debt analysis on \`${scope}\`. Scan every relevant artifact type and give me a structured debt inventory with cleanup effort estimates.`,
        },
      },
    ];
  },
};

export default capability;
