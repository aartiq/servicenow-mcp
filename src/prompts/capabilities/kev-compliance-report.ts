import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'kev-compliance-report',
  title: 'KEV Compliance Report',
  description:
    'CISA KEV (BOD 22-01) compliance: KEV vulnerable items against their due dates, fixed on time, fixed late, open and overdue, by group and CVE, weekly closures and KEV against non-KEV time to fix, with links',
  category: 'scan',
  arguments: [{ name: 'days', description: 'Window for closures and the trend (default 90)', required: false }],
  recommendedTools: ['get_kev_compliance', 'list_vulnerabilities', 'get_security_dashboard'],
  buildPrompt(args) {
    return assessmentPrompt({
      title: 'KEV compliance report',
      context: [`**Window:** ${args?.days || 90} days`],
      purpose: 'This weekly report shows how well the organisation meets the CISA Known Exploited Vulnerabilities deadlines, which groups are behind, and what to chase this week. It is for the vulnerability manager and the CISO.',
      gather: [
        '`get_kev_compliance` for KEV items against their CISA due dates, by group and CVE, weekly closures and average days to close.',
        '`list_vulnerabilities` with kev true and state open for the open KEV items, with links.',
        '`get_security_dashboard` for the wider vulnerability and incident counts.',
      ],
      directSections: ['kev_compliance', 'open_kev_items', 'security_dashboard'],
      analyse: [
        'Compliance rate (items fixed on time or still within the deadline) and the on-time rate of closed items.',
        'Overdue KEV items: how many days past due, by group and CVE, with the worst first.',
        'Trend: weekly closures in the window. Say when there were no closures.',
        'KEV against non-KEV average days to close, when the data has both.',
        'Groups to chase, with the items and links.',
      ],
      scoring: [
        'Use the compliance rate from the data as the base score, then take off up to 20 points for items more than 30 days past their due date.',
      ],
      sections: ['Executive summary with the score', 'Compliance at a glance', 'Overdue KEV items', 'By group', 'By CVE', 'Trend', 'Findings register', 'Actions for this week', 'Data coverage'],
      ask: 'Give me the KEV compliance report for my ServiceNow instance.',
    });
  },
};

export default capability;
