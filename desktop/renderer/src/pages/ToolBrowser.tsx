import { useEffect, useState } from 'react';
import { api } from '../api';

const TOOL_CATEGORIES: Record<string, string> = {
  query_records: 'Core', get_record: 'Core', get_table_schema: 'Core', get_user: 'Core', get_group: 'Core',
  create_incident: 'Incident', get_incident: 'Incident', update_incident: 'Incident', resolve_incident: 'Incident',
  close_incident: 'Incident', add_work_note: 'Incident', add_comment: 'Incident',
  create_change_request: 'Change', get_change_request: 'Change', update_change_request: 'Change',
  get_problem: 'Problem', create_problem: 'Problem', update_problem: 'Problem',
  search_knowledge: 'Knowledge', create_knowledge_article: 'Knowledge', get_knowledge_article: 'Knowledge',
  nlq_query: 'Now Assist', ai_search: 'Now Assist', generate_summary: 'Now Assist',
  suggest_resolution: 'Now Assist', trigger_agentic_playbook: 'Now Assist',
  search_cmdb_ci: 'CMDB', get_cmdb_ci: 'CMDB', list_relationships: 'CMDB',
  list_business_rules: 'Scripting', create_business_rule: 'Scripting',
  list_atf_suites: 'ATF', run_atf_suite: 'ATF', run_atf_test: 'ATF',
};

function categorize(name: string): string {
  if (TOOL_CATEGORIES[name]) return TOOL_CATEGORIES[name];
  if (name.includes('incident')) return 'Incident';
  if (name.includes('change')) return 'Change';
  if (name.includes('problem')) return 'Problem';
  if (name.includes('knowledge') || name.includes('kb')) return 'Knowledge';
  if (name.includes('cmdb') || name.includes('ci_')) return 'CMDB';
  if (name.includes('catalog')) return 'Catalog';
  if (name.includes('user') || name.includes('group')) return 'User/Group';
  if (name.includes('script') || name.includes('rule') || name.includes('acl')) return 'Scripting';
  if (name.includes('atf') || name.includes('test')) return 'ATF';
  if (name.includes('flow') || name.includes('playbook')) return 'Flow';
  if (name.includes('report') || name.includes('aggregate') || name.includes('trend')) return 'Reporting';
  if (name.includes('portal') || name.includes('widget')) return 'Portal';
  if (name.includes('devops') || name.includes('pipeline')) return 'DevOps';
  if (name.includes('asset') || name.includes('license')) return 'ITAM';
  if (name.includes('nlq') || name.includes('ai_') || name.includes('copilot') || name.includes('assist')) return 'Now Assist';
  if (name.includes('notification') || name.includes('email')) return 'Notifications';
  if (name.includes('update_set') || name.includes('changeset')) return 'Update Sets';
  return 'Other';
}

export function ToolBrowser() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    api.listTools().then(setTools);
  }, []);

  const filtered = tools.filter(t => {
    if (search && !t.name.includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedCategory && categorize(t.name) !== selectedCategory) return false;
    return true;
  });

  const categories = Array.from(new Set(tools.map(t => categorize(t.name)))).sort();

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Tool Browser</h1>
        <p className="page-subtitle">{tools.length} tools available across all ServiceNow modules</p>
      </div>

      <input
        className="search-input"
        placeholder="Search tools by name or description..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <button
          className={`btn btn-sm ${!selectedCategory ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSelectedCategory(null)}
        >
          All ({tools.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
          >
            {cat} ({tools.filter(t => categorize(t.name) === cat).length})
          </button>
        ))}
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tool Name</th>
              <th>Category</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(tool => (
              <tr key={tool.name}>
                <td><span className="code">{tool.name}</span></td>
                <td><span className="badge badge-accent">{categorize(tool.name)}</span></td>
                <td style={{ color: 'var(--text-muted)' }}>{tool.description}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)' }}>
                  {tools.length === 0 ? 'Start the server to load tools' : 'No tools match your search'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
