import type { CapabilityDefinition } from '../types.js';
import { assessmentPrompt } from '../skill-template.js';

const capability: CapabilityDefinition = {
  name: 'atf-coverage',
  title: 'ATF Coverage Report',
  description:
    'ATF coverage report: line coverage per business rule and script include from ATF code coverage, recently changed scripts with no tests, suites and recent results, and the tests to add first',
  category: 'review',
  arguments: [{ name: 'days', description: 'Window for recently changed scripts (default 90)', required: false }],
  recommendedTools: ['get_atf_code_coverage', 'list_atf_suites', 'list_atf_tests', 'query_records'],
  buildPrompt(args) {
    return assessmentPrompt({
      title: 'ATF coverage report',
      context: [`**Changed-script window:** ${args?.days || 90} days`],
      purpose: 'This report shows which server-side code has automated tests and which does not, so the team knows where to add ATF tests before the next release. It is for the development lead and release manager.',
      gather: [
        '`get_atf_code_coverage` for coverage per script (covered and executable lines merged across runs), coverage by script table, and recently changed scripts with no coverage.',
        '`list_atf_suites` and `list_atf_tests` for the suites that exist.',
        '`query_records` on `sys_atf_test_result` for recent results.',
      ],
      directSections: ['atf_code_coverage', 'atf_suites', 'recent_test_results', 'tests_by_table'],
      analyse: [
        'Overall line coverage by script table and the scripts with the lowest coverage that still have many executable lines.',
        'Recently changed custom scripts with no coverage at all: these are the riskiest.',
        'Suites and results: failing tests, suites that have not run recently.',
        'Whether code coverage data exists at all (it needs Australia and ATF runs with coverage on). Say so plainly if it is empty.',
        'The ten tests to write first, each tied to a script with a link, and a hand-off to the build-atf-suite skill.',
      ],
      scoring: [
        'Line coverage of custom scripts 50 points, share of recently changed scripts with any coverage 30, test health (pass rate, recent runs) 20.',
      ],
      sections: ['Executive summary with the score', 'Coverage by script type', 'Lowest coverage scripts', 'Recent changes with no tests', 'Suites and recent results', 'Findings register', 'Tests to add first', 'Data coverage'],
      ask: 'Show me ATF test coverage on my ServiceNow instance and what to test first.',
    });
  },
};

export default capability;
