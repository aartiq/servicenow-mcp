#!/usr/bin/env node
/**
 * Generate docs/TOOLS.md from the built tool manifest.
 *
 * Usage (after `npm run build`):
 *   node scripts/gen-tool-docs.mjs            write docs/TOOLS.md
 *   node scripts/gen-tool-docs.mjs --check    exit 1 if docs/TOOLS.md is out of date
 *   node scripts/gen-tool-docs.mjs --json     print { module: [tool names] } and exit
 *
 * Source of truth: dist/tools-manifest.json (names, descriptions, input schemas).
 * Grouping: each dist/tools/<module>.js is imported and its get*ToolDefinitions() exports are
 * called, so every tool lands under the module that defines it. Tools no module claims (the
 * search_tools meta-tool) go under "Discovery".
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distTools = join(root, 'dist', 'tools');
const manifest = JSON.parse(readFileSync(join(root, 'dist', 'tools-manifest.json'), 'utf8'));

/** Display order and titles. Modules not listed here are appended alphabetically. */
const MODULES = [
  ['core', 'Core records, CMDB and instance'],
  ['discovery', 'Schema discovery'],
  ['governance', 'Governance and health'],
  ['incident', 'Incident management'],
  ['problem', 'Problem management'],
  ['change', 'Change management'],
  ['task', 'Tasks and approvals'],
  ['approvals-extra', 'Approval routing and quotes'],
  ['sla', 'SLA and OLA'],
  ['oncall', 'On-call scheduling'],
  ['bundles', 'Bundled investigations'],
  ['impact-analysis', 'Impact analysis (blast radius)'],
  ['knowledge', 'Knowledge management'],
  ['catalog', 'Service catalog'],
  ['catalog-fulfillment', 'Catalog fulfillment'],
  ['apps', 'Interactive forms (MCP Apps)'],
  ['user', 'Users and groups'],
  ['access-admin', 'Access administration'],
  ['reporting', 'Reporting and analytics'],
  ['visualization', 'Charts and visualization'],
  ['performance', 'Performance Analytics and data quality'],
  ['atf', 'Automated Test Framework'],
  ['script', 'Scripting (business rules, script includes, ACLs)'],
  ['updateset', 'Update sets'],
  ['local-sync', 'Local Sync (pull and push artifacts)'],
  ['deployment', 'Deployment and artifacts'],
  ['app-studio', 'Scoped applications'],
  ['fluent', 'Fluent, ServiceNow SDK and batch'],
  ['flow', 'Flow Designer and subflows'],
  ['decision', 'Decision tables'],
  ['orchestration', 'Playbooks and orchestration'],
  ['integration', 'Integration (REST, import sets, transforms, events)'],
  ['notification', 'Notifications, email and attachments'],
  ['sys-properties', 'System properties'],
  ['platform-ops', 'Platform operations'],
  ['cmdb-reconciliation', 'CMDB reconciliation'],
  ['service-mapping', 'Service Mapping'],
  ['service-portfolio', 'Service portfolio'],
  ['now-assist', 'Now Assist (Otto) and generative AI'],
  ['now-assist-skills', 'Now Assist skills'],
  ['ai-agents', 'AI agents and agentic workflows'],
  ['ai-agent-exec', 'AI agent executions'],
  ['agent-studio', 'AI Agent Studio'],
  ['ai-governance', 'AI Control Tower, Knowledge Graph and Otto status'],
  ['action-fabric', 'ServiceNow Action Fabric (instance MCP servers and A2A agents)'],
  ['ml', 'Machine learning and Predictive Intelligence'],
  ['va', 'Virtual Agent'],
  ['sn-parity', 'ServiceNow MCP parity (summaries, sentiment, HR, CSM)'],
  ['hrsd', 'HR Service Delivery'],
  ['csm', 'Customer Service Management'],
  ['security', 'Security Operations and GRC'],
  ['grc-extra', 'GRC (risks, controls, issues)'],
  ['itam', 'IT Asset Management'],
  ['agile', 'Agile development'],
  ['spm', 'Strategic Portfolio Management'],
  ['devops', 'DevOps'],
  ['portal', 'Service Portal and UI Builder'],
  ['workspace', 'Workspaces and UX'],
  ['mobile', 'Mobile'],
  ['survey', 'Surveys and assessments'],
  ['docs', 'ServiceNow documentation'],
];

async function moduleMap() {
  const owner = new Map();
  const files = readdirSync(distTools).filter((f) => f.endsWith('.js') && f !== 'index.js');
  for (const file of files) {
    const mod = await import(pathToFileURL(join(distTools, file)).href);
    const name = file.replace(/\.js$/, '');
    for (const [key, fn] of Object.entries(mod)) {
      if (typeof fn !== 'function' || !/^get\w*ToolDefinitions$/.test(key)) continue;
      if (/AppOnly/.test(key)) continue; // app-only helpers the MCP App views call, not listed tools
      let defs;
      try { defs = fn(); } catch { continue; }
      if (!Array.isArray(defs)) continue;
      for (const d of defs) if (d?.name && !owner.has(d.name)) owner.set(d.name, name);
    }
  }
  return owner;
}

function tier(name, description) {
  const d = description || '';
  if (/FLUENT_ENABLED/.test(d)) return 'Fluent';
  if (/ATF_ENABLED/.test(d)) return 'ATF';
  if (/NOW_ASSIST_ENABLED/.test(d)) return 'Now Assist';
  if (/SCRIPTING_ENABLED/.test(d)) return 'Scripting';
  if (/CMDB_WRITE_ENABLED/.test(d)) return 'CMDB write';
  if (/WRITE_ENABLED/.test(d)) return 'Write';
  return '';
}

function oneLine(text) {
  const t = String(text || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  const firstSentence = t.match(/^(.{20,}?[.!?])(\s|$)/);
  const s = firstSentence ? firstSentence[1] : t;
  return s.length > 220 ? `${s.slice(0, 217).trimEnd()}...` : s;
}

function params(schema) {
  const props = schema?.properties || {};
  const req = new Set(schema?.required || []);
  const names = Object.keys(props);
  if (!names.length) return '';
  return names.map((n) => (req.has(n) ? `\`${n}\`*` : `\`${n}\``)).join(', ');
}

function anchor(title) {
  return title.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-');
}

const owner = await moduleMap();
const groups = new Map();
for (const tool of manifest) {
  const mod = owner.get(tool.name) || 'meta';
  if (!groups.has(mod)) groups.set(mod, []);
  groups.get(mod).push(tool);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(Object.fromEntries([...groups].map(([k, v]) => [k, v.map((t) => t.name)])), null, 2));
  process.exit(0);
}

const titles = new Map(MODULES);
titles.set('meta', 'Tool discovery');
const order = ['meta', ...MODULES.map(([m]) => m).filter((m) => groups.has(m))];
for (const m of [...groups.keys()].sort()) if (!order.includes(m)) order.push(m);

const out = [];
out.push(`# Tool reference`);
out.push('');
out.push(`<!-- Generated by scripts/gen-tool-docs.mjs from dist/tools-manifest.json. Do not edit by hand: run \`npm run build && node scripts/gen-tool-docs.mjs\`. -->`);
out.push('');
out.push(`NowAIKit ships **${manifest.length} tools** in ${order.length} groups. This page is generated from the built tool manifest, so it always matches the code.`);
out.push('');
out.push('In lean discovery mode (`MCP_TOOL_DISCOVERY=lean`) the server also exposes `run_tool`, which runs any tool below by name after `search_tools` finds it. Role packages (`MCP_TOOL_PACKAGE`) expose a subset, see [TOOL_PACKAGES.md](TOOL_PACKAGES.md).');
out.push('');
out.push('## Permission tiers');
out.push('');
out.push('Everything is read-only until you turn a tier on. The **Tier** column below shows which switch a tool needs (blank means read-only, always available).');
out.push('');
out.push('| Tier | Turn it on with | Launch flag |');
out.push('|------|-----------------|-------------|');
out.push('| Read | nothing, always on | |');
out.push('| Write | `WRITE_ENABLED=true` | `--allow-write` |');
out.push('| CMDB write | `WRITE_ENABLED=true` + `CMDB_WRITE_ENABLED=true` | `--allow-cmdb` |');
out.push('| Scripting | `WRITE_ENABLED=true` + `SCRIPTING_ENABLED=true` (script changes only, script reads are Tier 0) | `--allow-scripting` |');
out.push('| Now Assist | `NOW_ASSIST_ENABLED=true` | `--allow-agentic` |');
out.push('| ATF | `ATF_ENABLED=true` | `--allow-atf` |');
out.push('| Fluent | `FLUENT_ENABLED=true` (local ServiceNow SDK commands) | `--allow-fluent` |');
out.push('');
out.push('Tiers are detected from each tool description, so a tool that checks its tier at run time (for example a tool with both read and write actions) may show blank here. Parameters marked `*` are required.');
out.push('');
out.push('## Groups');
out.push('');
out.push('| Group | Tools |');
out.push('|-------|------:|');
for (const m of order) out.push(`| [${titles.get(m) || m}](#${anchor(titles.get(m) || m)}) | ${groups.get(m).length} |`);
out.push(`| **Total** | **${manifest.length}** |`);
out.push('');

for (const m of order) {
  const title = titles.get(m) || m;
  const tools = groups.get(m);
  out.push(`## ${title}`);
  out.push('');
  out.push(`${tools.length} tool${tools.length === 1 ? '' : 's'}${m === 'meta' ? '' : `, defined in \`src/tools/${m}.ts\``}.`);
  out.push('');
  out.push('| Tool | Tier | What it does | Parameters |');
  out.push('|------|------|--------------|------------|');
  for (const t of tools) {
    out.push(`| \`${t.name}\` | ${tier(t.name, t.description)} | ${oneLine(t.description)} | ${params(t.inputSchema)} |`);
  }
  out.push('');
}

// House style: no em or en dashes, no arrows.
const text = `${out.join('\n').replace(/\s*[\u2013\u2014]\s*/g, ', ').replace(/\s*\u2192\s*/g, ' to ').trimEnd()}\n`;
const target = join(root, 'docs', 'TOOLS.md');
if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== text) {
    console.error('docs/TOOLS.md is out of date. Run: node scripts/gen-tool-docs.mjs');
    process.exit(1);
  }
  console.log('docs/TOOLS.md is up to date.');
} else {
  writeFileSync(target, text);
  console.log(`Wrote docs/TOOLS.md: ${manifest.length} tools in ${order.length} groups.`);
}
