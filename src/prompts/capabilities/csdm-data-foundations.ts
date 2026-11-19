import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'csdm-data-foundations',
  title: 'CSDM and Data Foundations Assessment',
  description:
    'CSDM 5 assessment: ServiceNow Data Foundations scores (CMDB tabs and CSDM Foundation to Fly stages, with KB playbooks), CSDM domains and services, product models, service offerings, relationships, life cycle stage adoption and AI CIs, with domain scores, links and a migration backlog',
  category: 'scan',
  arguments: [],
  recommendedTools: ['get_cmdb_data_foundations', 'get_csdm_health', 'cmdb_find_stale', 'list_ai_inventory_cis', 'run_aggregate_query'],
  buildPrompt() {
    return assessmentPrompt({
      title: 'CSDM and Data Foundations assessment',
      purpose: 'This assessment measures how well the CMDB follows CSDM 5, using ServiceNow\'s own Data Foundations results where the instance has them and NowAIKit\'s domain checks for the rest. It is for the CMDB owner, the ITOM lead and the platform owner.',
      gather: [
        '`get_cmdb_data_foundations` for ServiceNow\'s Data Foundations metrics: result percent, failing records, priority, CMDB tab or CSDM stage, the KB playbook link, and the drill-down lists.',
        '`get_csdm_health` for CSDM 5 domain scores (Design, Service delivery, Service consumption, Foundation and build, Life cycle, Data management) and the gap lists.',
        '`run_aggregate_query` on `cmdb_ci` grouped by `life_cycle_stage` and by `install_status`, to compare life cycle stage adoption with the legacy status.',
        '`cmdb_find_stale` (lifecycle_model either) and `list_ai_inventory_cis` (mode gaps).',
      ],
      directSections: ['data_foundations', 'csdm_health', 'life_cycle_by_stage', 'install_status_mix', 'stale_operational', 'ai_inventory_cis'],
      analyse: [
        'Data Foundations by CSDM stage (Foundation, Crawl, Walk, Run, Fly): which stage the instance has really reached, and the metrics holding it back. Always link the KB playbook for each failing metric.',
        'CMDB tabs: completeness, data management practices, ITSM processes and customisations, with the worst metrics.',
        'CSDM 5 domains: business applications without application services or owners, service instances without offerings or relationships, missing business services and product models.',
        'Life cycle: how many CIs use life_cycle_stage, whether csdm.lifecycle.migration.activated is on, and the CIs where status and stage disagree.',
        'Relationships and data management: relationship types in use, data management and certification policies.',
        'AI and MCP CIs: inventory gaps.',
        'A migration backlog toward CSDM 5: life cycle fields, renamed classes (application service is now service instance), and the reports that read the legacy fields.',
      ],
      scoring: [
        'Use ServiceNow\'s Data Foundations averages where present: CMDB 40 points (average CMDB result percent), CSDM 40 (average CSDM result percent, weighted toward Foundation and Crawl), life cycle adoption 20.',
        'When Data Foundations is not available, use the get_csdm_health domain scores and say so.',
        'Show ServiceNow\'s own numbers next to the NowAIKit score and say which is which.',
      ],
      sections: ['Executive summary with the score and the CSDM stage reached', 'Data Foundations: CSDM stages', 'Data Foundations: CMDB tabs', 'CSDM 5 domains', 'Life cycle stage and status', 'Relationships and data management', 'Findings register', 'Migration backlog and 30, 60, 90 day plan', 'Data coverage'],
      ask: 'Assess CSDM and CMDB Data Foundations on my ServiceNow instance.',
    });
  },
};

export default capability;
