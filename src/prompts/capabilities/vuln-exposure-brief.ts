import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'vuln-exposure-brief',
  title: 'Vulnerability Exposure Brief',
  description:
    'One-page CISO brief: overall vulnerability and incident posture, KEV deadline position, the named threat (if given) with exposed hosts and services, remediation progress, open changes and exceptions, and the decisions needed',
  category: 'ops',
  arguments: [
    { name: 'cve', description: 'CVE IDs for the named threat, comma separated', required: false },
    { name: 'threat', description: 'Threat name (for example PHP2Shell)', required: false },
  ],
  recommendedTools: ['get_security_dashboard', 'get_kev_compliance', 'get_threat_status'],
  buildPrompt(args) {
    const threat = [args?.threat, args?.cve].filter(Boolean).join(' / ');
    return assessmentPrompt({
      title: 'Vulnerability exposure brief',
      context: threat ? [`**Named threat:** ${threat}`] : [],
      purpose: 'A one-page brief for the CISO and the executive team: where we stand, what is overdue, and the one or two decisions needed. Keep it short: no more than about 400 words plus the findings.',
      gather: [
        '`get_security_dashboard` for active security incidents by severity and active vulnerable items by risk, including KEV.',
        '`get_kev_compliance` for the KEV deadline position.',
        threat ? '`get_threat_status` for the named threat: exposure, remediation, changes, incident.' : 'If a named threat is in the news, rerun with --arg threat=<name> to add it.',
      ],
      directSections: ['security_dashboard', 'kev_compliance', 'threat_status'],
      analyse: [
        'Three headline numbers from the data: open critical vulnerabilities, KEV items past due, active high-severity incidents.',
        'The named threat in two or three sentences: exposure, what has been done, when it will be closed.',
        'Risk in business terms: which services are exposed, based on the services in the data.',
        'Decisions needed: for example approving an emergency change, accepting an exception, or adding resources.',
      ],
      scoring: [
        'Start from 100. Take off for KEV items past due (up to 40), open critical items (up to 30) and active high-severity incidents (up to 30), in proportion to the counts in the data.',
      ],
      sections: ['Headline (one paragraph with the score)', 'Three numbers that matter', 'Named threat', 'Exposure by service', 'Decisions needed', 'Findings register', 'Data coverage'],
      ask: threat ? `Give me a one-page vulnerability exposure brief, including ${threat}.` : 'Give me a one-page vulnerability exposure brief for the CISO.',
    });
  },
};

export default capability;
