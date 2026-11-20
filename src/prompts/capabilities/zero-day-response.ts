import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'zero-day-response',
  title: 'Zero-Day Response Report',
  description:
    'One named threat from intel to closure: the CVEs and their CISA KEV deadline, every vulnerable item and affected service, remediation tasks, emergency and normal changes, exceptions, the security incident and its notes, with status, links and next actions',
  category: 'ops',
  arguments: [
    { name: 'cve', description: 'CVE IDs, comma separated (for example CVE-2026-109618,CVE-2026-109619)', required: false },
    { name: 'threat', description: 'Threat name to match in remediation tasks and security incidents (for example PHP2Shell)', required: false },
  ],
  recommendedTools: ['get_threat_status', 'get_vulnerability', 'get_security_incident', 'get_kev_compliance', 'cmdb_impact_analysis', 'create_change_from_remediation_task'],
  buildPrompt(args) {
    const threat = [args?.threat, args?.cve].filter(Boolean).join(' / ') || 'the named threat';
    return assessmentPrompt({
      title: 'Zero-day response report',
      context: [`**Threat:** ${threat}`],
      purpose: 'This report tracks one named threat across Vulnerability Response, Change and Security Incident Response, so the security lead, the platform owner and the CISO see the same picture: how exposed we are, what has been done, what is late and what happens next.',
      gather: [
        '`get_threat_status` with the CVE IDs and the threat name: the CVE library entries (KEV flag, CISA due date, EPSS, scores), every vulnerable item, the affected CIs and services, remediation tasks, changes, exception requests and security incidents, each with a link.',
        '`get_vulnerability` on the remediation task (VUL...) for its items and linked changes.',
        '`get_security_incident` on the security incident for its state and work notes.',
        '`get_kev_compliance` for the KEV position across the estate.',
        'In an MCP session you may then offer the next actions: `create_change_from_remediation_task` for an emergency change (it needs WRITE_ENABLED and is never run from a report), or `update_vulnerability` with defer_until for hosts that can\'t be patched in time.',
      ],
      directSections: ['threat_status', 'remediation_task', 'security_incident', 'kev_compliance', 'security_dashboard'],
      analyse: [
        'Timeline from the dates in the data: KEV due date, first found, incident opened, change windows. Say plainly when the CISA due date has passed.',
        'Exposure: open items by CI and service, which are internet-facing or business critical if the data says so, and which hosts have a confirmed incident.',
        'Remediation: task state, each change with its type, state and window, and the hosts each change covers. Flag hosts with no change and items past their target date.',
        'Incident: state, severity and the latest work notes (containment and eradication steps).',
        'Exceptions: open deferrals and their expiry.',
        'Next actions with an owner each, ordered by risk.',
      ],
      scoring: [
        'Remediation progress 40 points (share of items closed), deadline 25 (items past the CISA due date take this down), change coverage 20 (open items covered by an approved or scheduled change), incident handling 15 (incident contained or closed).',
      ],
      sections: ['Executive summary with the score and the deadline', 'Threat and KEV status', 'Exposure by host and service', 'Remediation tasks and changes', 'Security incident', 'Exceptions', 'Findings register', 'Next actions (owner, date)', 'Data coverage'],
      ask: `Give me the zero-day response report for ${threat}.`,
    });
  },
};

export default capability;
