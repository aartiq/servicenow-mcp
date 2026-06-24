import type { CapabilityDefinition } from '../types.js';

const capability: CapabilityDefinition = {
  name: 'scan-cmdb',
  title: 'CMDB Health Scan',
  description:
    'CMDB health assessment — stale CIs, broken relationships, data quality, orphan detection, class compliance',
  category: 'scan',

  arguments: [
    {
      name: 'scope',
      description:
        'Scan scope: "full" (default), "relationships", "data-quality", or "stale"',
      required: false,
    },
    {
      name: 'ci_class',
      description:
        'Limit scan to a specific CI class (e.g. "cmdb_ci_server", "cmdb_ci_linux_server"). Default: all classes',
      required: false,
    },
  ],

  recommendedTools: [
    'query_records',
    'search_cmdb_ci',
    'get_cmdb_ci',
    'list_relationships',
    'cmdb_health_dashboard',
    'run_aggregate_query',
    'get_table_record_count',
    'check_table_completeness',
  ],

  buildPrompt(args) {
    const scope = args?.scope ?? 'full';
    const ciClass = args?.ci_class ?? '';

    const scopeLabel: Record<string, string> = {
      full: 'Full CMDB health scan',
      relationships: 'Relationship integrity scan',
      'data-quality': 'Data quality assessment',
      stale: 'Stale CI detection',
    };

    const scopeDescription = scopeLabel[scope] ?? `Custom scope: ${scope}`;
    const classFilter = ciClass
      ? `Filtered to CI class: \`${ciClass}\``
      : 'All CI classes';

    // ─── Section 1: CI Inventory ─────────────────────────────────────────────

    const inventorySection = [
      '## 1. CI Inventory',
      '',
      'Use `run_aggregate_query`, `get_table_record_count`, and `query_records` to build a comprehensive inventory:',
      '',
      '### Record Counts by Class',
      'Query the CMDB class hierarchy and aggregate record counts:',
      '',
      '**Core CMDB Class Hierarchy:**',
      '```',
      'cmdb_ci (base)',
      '  ├── cmdb_ci_hardware',
      '  │     ├── cmdb_ci_computer',
      '  │     │     ├── cmdb_ci_server (physical servers)',
      '  │     │     │     ├── cmdb_ci_win_server',
      '  │     │     │     ├── cmdb_ci_linux_server',
      '  │     │     │     └── cmdb_ci_unix_server',
      '  │     │     ├── cmdb_ci_pc_hardware (desktops/laptops)',
      '  │     │     └── cmdb_ci_mainframe',
      '  │     ├── cmdb_ci_netgear (network devices)',
      '  │     │     ├── cmdb_ci_ip_router',
      '  │     │     ├── cmdb_ci_ip_switch',
      '  │     │     └── cmdb_ci_ip_firewall',
      '  │     └── cmdb_ci_storage_device',
      '  ├── cmdb_ci_service (services)',
      '  │     ├── cmdb_ci_service_auto (discovered services)',
      '  │     ├── cmdb_ci_service_technical',
      '  │     └── cmdb_ci_service_business (business services)',
      '  ├── cmdb_ci_appl (applications)',
      '  │     ├── cmdb_ci_app_server (app servers: Tomcat, JBoss, WebSphere)',
      '  │     ├── cmdb_ci_db_instance (database instances)',
      '  │     │     ├── cmdb_ci_db_mssql_instance',
      '  │     │     ├── cmdb_ci_db_ora_instance',
      '  │     │     └── cmdb_ci_db_mysql_instance',
      '  │     └── cmdb_ci_web_server (web servers: Apache, IIS, Nginx)',
      '  ├── cmdb_ci_vm_instance (virtual machines)',
      '  │     └── cmdb_ci_vmware_instance',
      '  └── cmdb_ci_cloud_service_account (cloud resources)',
      '```',
      '',
      ciClass
        ? `Focus on \`${ciClass}\` and its child classes.`
        : 'Aggregate counts across all major class branches.',
      '',
      '### Status Distribution',
      '- **Operational status:** count by Operational (1), Non-Operational (2), Repair in Progress (3),',
      '  DR Standby (4), Ready (5), Retired (7), Absent (8)',
      '- **Install status:** count by Installed (1), In Stock (6), Retired (7), Stolen (100), Absent (8)',
      '- Flag CIs with conflicting status combinations (e.g., Retired operational status but Installed install status)',
      '',
      '### Discovery Source Distribution',
      '- Count CIs by `discovery_source` field: ServiceNow Discovery, SCCM, AWS, Azure, manual, import, etc.',
      '- Flag CIs with no discovery source (manually created, no validation)',
      '- Flag CIs with discovery source "Manual" in production (should be discovered)',
      '',
      '**Output:**',
      '| CI Class | Total | Operational | Retired | No Discovery Source | Last Updated (avg) |',
      '|----------|-------|-------------|---------|---------------------|---------------------|',
    ];

    // ─── Section 2: Stale CI Detection ───────────────────────────────────────

    const staleSection = [
      '## 2. Stale CI Detection',
      '',
      'Use `query_records` and `run_aggregate_query` with date-based filters to find stale CIs:',
      '',
      '### Staleness Thresholds',
      '- **Critical (>180 days):** CIs not updated (sys_updated_on) in 180+ days — likely decommissioned',
      '  but not retired. Hardware decomposes, software is unpatched, yet CMDB shows "operational".',
      '- **High (90-180 days):** CIs not updated in 90-180 days — discovery may have lost track',
      '- **Medium (60-90 days):** CIs not updated in 60-90 days — monitor for continued staleness',
      '',
      '### Stale CI Categories',
      '- **Never discovered:** CIs where `last_discovered` is empty AND `discovery_source` is empty',
      '  — manually created, never validated by any automated source',
      '- **Discovery lost:** CIs where `last_discovered` is > 90 days ago but `discovery_source` is set',
      '  — discovery stopped finding this CI (decommissioned? network change? credential issue?)',
      '- **No recent changes:** CIs where `sys_updated_on` is > 90 days and `operational_status` is',
      '  still "Operational" — if truly operational, something should be updating it',
      '- **Zombie CIs:** CIs that are Retired in CMDB but still have active incidents, change requests,',
      '  or relationships pointing to them',
      '',
      '### Impact of Stale CIs',
      '- Stale CIs inflate CMDB metrics and licensing counts',
      '- Stale CIs with active relationships corrupt service mapping and impact analysis',
      '- Incident routing to stale CIs leads to SLA breaches and misdirected work',
      '',
      '**Output:**',
      '| CI Name | Class | Operational Status | Last Updated | Last Discovered | Days Stale | Severity | Recommendation |',
      '|---------|-------|-------------------|--------------|-----------------|------------|----------|----------------|',
    ];

    // ─── Section 3: Relationship Integrity ───────────────────────────────────

    const relationshipSection = [
      '## 3. Relationship Integrity',
      '',
      'Use `list_relationships`, `query_records` on `cmdb_rel_ci`, and `run_aggregate_query` to analyze:',
      '',
      '### Relationship Type Distribution',
      'Query `cmdb_rel_type` and `cmdb_rel_ci` for counts by type:',
      '',
      '**Core Relationship Types:**',
      '| Relationship | Description | Expected Pattern |',
      '|-------------|-------------|------------------|',
      '| Depends on::Used by | Service → Infrastructure dependency | Services depend on servers/apps |',
      '| Runs on::Runs | Application → Server hosting | Apps run on servers/VMs |',
      '| Hosted on::Hosts | VM → Hypervisor hosting | VMs hosted on ESXi hosts |',
      '| Members of::Contains | Cluster → Nodes | Cluster contains servers |',
      '| Provides::Provided by | Service → Offering | Business service provides IT service |',
      '| Housed in::Houses | Hardware → Location | Servers housed in data center |',
      '| Connects to::Connected by | Network connectivity | Switch connects to router |',
      '| Managed by::Manages | CI → Management tool | Server managed by monitoring tool |',
      '',
      '### Orphaned CIs',
      '- CIs with ZERO relationships (no parent, no child, no dependency)',
      '  — an isolated CI is likely missing connections or is stale',
      '- Servers with no "Runs on" children (nothing running on them?)',
      '- Applications with no "Runs on" parent (where does this app run?)',
      '- Business services with no "Depends on" relationships (service with no infrastructure?)',
      '',
      '### Broken Relationships',
      '- Relationships where the parent CI (`parent`) sys_id points to a deleted/non-existent record',
      '- Relationships where the child CI (`child`) sys_id points to a deleted/non-existent record',
      '- Relationships where parent or child CI has `install_status = Retired` but relationship is active',
      '',
      '### Circular Dependencies',
      '- A depends on B, B depends on C, C depends on A — circular dependency chain',
      '- Self-referencing relationships (CI related to itself)',
      '- Bidirectional "Depends on" between same CIs (A depends on B AND B depends on A)',
      '',
      '### Relationship Anomalies',
      '- CIs with > 100 relationships — possible data quality issue or misconfigured discovery',
      '- Duplicate relationships (same parent, child, and type appearing multiple times)',
      '- Wrong relationship type (e.g., a server "Depends on" a desktop — unlikely)',
      '- Cross-class relationship violations (e.g., "Runs on" between two services instead of app→server)',
      '',
      '**Output:**',
      '| Parent CI | Child CI | Rel Type | Issue | Severity | Recommendation |',
      '|-----------|----------|----------|-------|----------|----------------|',
    ];

    // ─── Section 4: Data Quality ─────────────────────────────────────────────

    const dataQualitySection = [
      '## 4. Data Quality Assessment',
      '',
      'Use `check_table_completeness`, `query_records`, and `run_aggregate_query` to evaluate:',
      '',
      '### Mandatory Field Completeness',
      'For each major CI class, check completeness of key fields:',
      '',
      '**Server CIs (cmdb_ci_server and children):**',
      '- `name` — must be populated (flag empty)',
      '- `ip_address` — critical for discovery and network mapping',
      '- `os` — operating system must be set',
      '- `os_version` — needed for patch management and vulnerability scanning',
      '- `serial_number` — hardware tracking and asset management',
      '- `cpu_count`, `ram`, `disk_space` — capacity planning',
      '- `location` — physical or logical location',
      '- `assigned_to` or `managed_by` — ownership accountability',
      '- `operational_status` — must reflect reality',
      '- `environment` — dev/test/staging/production classification',
      '',
      '**Application CIs (cmdb_ci_appl and children):**',
      '- `name`, `version` — identification',
      '- `install_directory` — where it lives',
      '- `running_process` — how to identify it',
      '- `tcp_port` — network footprint',
      '',
      '**Service CIs (cmdb_ci_service and children):**',
      '- `name`, `owned_by`, `managed_by` — accountability',
      '- `operational_status`, `busines_criticality` — importance rating',
      '',
      '### Duplicate Detection',
      '- CIs with the same `name` AND `sys_class_name` — potential duplicates',
      '- CIs with the same `serial_number` — same hardware registered twice',
      '- CIs with the same `ip_address` within the same class — IP conflict or duplicate',
      '- CIs with the same `mac_address` — same NIC registered on multiple CIs',
      '- CIs with the same FQDN (`fqdn` field) — DNS name collision',
      '',
      '### Invalid Data Patterns',
      '- IP addresses that are obviously wrong: `0.0.0.0`, `127.0.0.1` (for non-localhost CIs),',
      '  `255.255.255.255`, empty string, non-IP text',
      '- Serial numbers that are placeholder text: "N/A", "Unknown", "TBD", "Not Available", "None"',
      '- OS values that are generic or outdated: "Windows" (no version), "Linux" (no distro)',
      '- Names with special characters, trailing spaces, or encoding issues',
      '- MAC addresses in incorrect format',
      '',
      '### Classification Accuracy',
      '- CIs in the base `cmdb_ci` class that should be in a specific subclass',
      '  (e.g., a server sitting in `cmdb_ci` instead of `cmdb_ci_server`)',
      '- CIs in `cmdb_ci_hardware` that should be classified further (server, network gear, storage)',
      '- CIs whose `sys_class_name` does not match their attributes (e.g., has `cpu_count` and `ram`',
      '  but is classified as a generic CI, not a server)',
      '',
      '**Output:**',
      '| CI Class | Field | Completeness % | Empty Count | Invalid Count | Severity |',
      '|----------|-------|----------------|-------------|---------------|----------|',
    ];

    // ─── Section 5: Class Compliance ─────────────────────────────────────────

    const classComplianceSection = [
      '## 5. Class Compliance',
      '',
      'Analyze CI classification accuracy:',
      '',
      '### Misclassified CIs',
      '- CIs in generic `cmdb_ci` that have enough attributes to be classified in a specific subclass',
      '- CIs in `cmdb_ci_computer` that should be in `cmdb_ci_server` (has server-like attributes:',
      '  high CPU count, server OS, data center location)',
      '- CIs in `cmdb_ci_server` that should be in a more specific child class (`cmdb_ci_win_server`,',
      '  `cmdb_ci_linux_server`) based on their OS field',
      '- Network devices classified as servers or vice versa',
      '',
      '### Missing Extended Attributes',
      '- CIs in extended classes that have not populated the extended attributes',
      '  (e.g., `cmdb_ci_linux_server` with no Linux-specific fields populated)',
      '- CIs where the extended class was set but the additional fields from the child table are all empty',
      '',
      '### Class Hierarchy Anomalies',
      '- Custom CI classes that extend `cmdb_ci` directly instead of an appropriate intermediate class',
      '- Custom CI classes with no records (created but never used)',
      '- Deep class hierarchies (> 5 levels) that may cause performance issues in queries',
      '',
      '**Output:**',
      '| CI Name | Current Class | Suggested Class | Evidence | Severity |',
      '|---------|---------------|-----------------|----------|----------|',
    ];

    // ─── Section 6: Discovery & Reconciliation ──────────────────────────────

    const discoverySection = [
      '## 6. Discovery & Reconciliation',
      '',
      'Use `query_records` and `run_aggregate_query` to assess discovery health:',
      '',
      '### Discovery Coverage',
      '- Percentage of CIs with a discovery source vs. manually created',
      '- CIs discovered in the last 30/60/90 days vs. total CI count',
      '- IP ranges or subnets with low discovery coverage (gaps in network scanning)',
      '- CI classes with low discovery rates (e.g., most servers discovered, but applications are manual)',
      '',
      '### Reconciliation Health',
      '**Identification and Reconciliation Engine (IRE) rules:**',
      '- Query `cmdb_identifier` for reconciliation rules',
      '- Check for CI classes without identification rules — these CIs cannot be reconciled, leading to duplicates',
      '- Check for overly broad identification rules (matching on `name` alone creates false merges)',
      '- Check for overly narrow rules (matching on multiple fields that are often empty creates duplicates)',
      '',
      '### Unreconciled CIs',
      '- CIs in `cmdb_ci` with `duplicate_of` populated — known duplicates awaiting merge',
      '- CIs flagged by reconciliation as "possible duplicate" but not yet resolved',
      '- CIs from import sets that failed reconciliation and created duplicates',
      '',
      '### Discovery Schedule Health',
      '- Active discovery schedules and their frequency',
      '- Discovery schedules that have not run successfully in the expected window',
      '- MID Server connectivity for each discovery schedule',
      '',
      '**Output:**',
      '| Metric | Value | Threshold | Status | Recommendation |',
      '|--------|-------|-----------|--------|----------------|',
    ];

    // ─── Section 7: Impact Analysis ──────────────────────────────────────────

    const impactSection = [
      '## 7. Impact Analysis Readiness',
      '',
      'Assess whether the CMDB can support accurate impact analysis and service mapping:',
      '',
      '### Business Service Coverage',
      '- Business services (`cmdb_ci_service_business`) with no "Depends on" relationships',
      '  — these services have no mapped infrastructure, making impact analysis useless',
      '- Business services with relationships only to other services (no infrastructure depth)',
      '- Business services with > 500 dependency relationships (too broad, noisy impact)',
      '',
      '### Dependency Map Completeness',
      '- For each business service, trace the dependency chain:',
      '  Business Service → Technical Service → Application → Server → VM Host',
      '- Flag chains that stop prematurely (e.g., application has no "Runs on" server)',
      '- Flag chains with missing intermediate levels (business service directly depends on server,',
      '  skipping the application layer)',
      '',
      '### Impact Calculation Risks',
      '- CIs that appear in many service dependency chains (single points of failure)',
      '- CIs with "Critical" business_criticality but no relationship to any business service',
      '- Retired CIs still in active dependency chains (ghost dependencies)',
      '',
      '**Output:**',
      '| Business Service | Dependency Depth | Missing Layers | Orphaned Infra | Risk Level |',
      '|-----------------|------------------|----------------|----------------|------------|',
    ];

    // ─── Build sections based on scope ───────────────────────────────────────

    let sections: string[][];
    switch (scope) {
      case 'relationships':
        sections = [inventorySection, relationshipSection, impactSection];
        break;
      case 'data-quality':
        sections = [inventorySection, dataQualitySection, classComplianceSection];
        break;
      case 'stale':
        sections = [inventorySection, staleSection, discoverySection];
        break;
      default:
        sections = [
          inventorySection,
          staleSection,
          relationshipSection,
          dataQualitySection,
          classComplianceSection,
          discoverySection,
          impactSection,
        ];
    }

    // ─── Report Format ───────────────────────────────────────────────────────

    const reportFormat = [
      '## CMDB Health Report Format',
      '',
      'Compile ALL findings into this structure:',
      '',
      '```',
      'CMDB HEALTH REPORT',
      '==================',
      `Scan Scope: ${scopeDescription}`,
      `CI Class Filter: ${classFilter}`,
      'Date: [current date]',
      '',
      'EXECUTIVE SUMMARY',
      '- Total CIs scanned: X',
      '- Total relationships scanned: X',
      '- Critical findings: X',
      '- High findings: X',
      '- Medium findings: X',
      '- Low findings: X',
      '- Overall CMDB health: [Healthy / Needs Attention / Degraded / Critical]',
      '',
      'HEALTH METRICS DASHBOARD',
      '  Completeness Score:    XX% (mandatory fields populated)',
      '  Freshness Score:       XX% (CIs updated within expected window)',
      '  Relationship Score:    XX% (CIs with valid relationships)',
      '  Classification Score:  XX% (CIs in correct class)',
      '  Duplicate Rate:        XX% (suspected duplicate CIs)',
      '  Discovery Coverage:    XX% (CIs with automated discovery)',
      '',
      'DETAILED FINDINGS',
      '-----------------',
      'Each finding MUST include:',
      '  Finding ID:      CMDB-XXXX',
      '  Severity:        Critical / High / Medium / Low',
      '  Category:        Stale / Relationship / Data Quality / Classification / Discovery / Impact',
      '  Affected CIs:    Count and class of affected CIs',
      '  Evidence:        [specific data showing the issue]',
      '  Impact:          [business impact if not remediated]',
      '  Recommendation:  [specific fix — bulk update, re-discovery, class change, etc.]',
      '',
      'SEVERITY DEFINITIONS',
      '  CRITICAL — CMDB data actively causing wrong decisions (impact analysis, routing, licensing)',
      '  HIGH     — Significant data gaps that undermine CMDB reliability',
      '  MEDIUM   — Data quality issues that should be addressed proactively',
      '  LOW      — Housekeeping items; address during regular CMDB maintenance',
      '',
      'REMEDIATION ROADMAP',
      '1. [Critical items — fix within 1 week]',
      '2. [High items — fix within 2 weeks]',
      '3. [Medium items — plan for next maintenance cycle]',
      '4. [Low items — address opportunistically]',
      '```',
    ];

    return [
      {
        role: 'assistant' as const,
        content: {
          type: 'text' as const,
          text: [
            '# Capability: CMDB Health Scan',
            '',
            `**Scope:** ${scopeDescription}`,
            `**CI Class Filter:** ${classFilter}`,
            '',
            'This capability performs a comprehensive health assessment of the Configuration',
            'Management Database (CMDB). The CMDB is the foundation of ITSM — incident routing,',
            'change impact analysis, service mapping, and asset management all depend on accurate',
            'CI data and relationships.',
            '',
            '**Platform Knowledge:**',
            '- The CMDB uses a hierarchical class structure rooted at `cmdb_ci`',
            '- Relationships are stored in `cmdb_rel_ci` with types from `cmdb_rel_type`',
            '- The Identification and Reconciliation Engine (IRE) prevents duplicates using rules in `cmdb_identifier`',
            '- Discovery populates CIs automatically; manual CIs should be minimized in production',
            '- Service Mapping builds dependency maps from the CMDB for impact analysis',
            '- CMDB Health Dashboard (`cmdb_health_dashboard`) provides OOB health metrics',
            '',
            ...sections.flatMap(s => [...s, '']),
            ...reportFormat,
            '',
            '---',
            '',
            'Beginning CMDB health scan. Every finding must include its Finding ID, severity,',
            'category, affected CI count, concrete evidence, and a specific recommendation.',
            '',
            'After presenting your analysis, offer to generate a branded PDF or PPTX report by calling the `generate_report` tool with your full analysis.',
          ].join('\n'),
        },
      },
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: ciClass
            ? `Run a ${scope} CMDB health scan focused on the \`${ciClass}\` class. Give me a structured report with health metrics and severity ratings.`
            : `Run a ${scope} CMDB health scan across all CI classes. Give me a structured report with health metrics and severity ratings.`,
        },
      },
    ];
  },
};

export default capability;
