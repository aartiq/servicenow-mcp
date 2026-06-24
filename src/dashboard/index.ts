/**
 * Dashboard — serves a dark-theme web UI at GET / when HTTP transport is active.
 * Self-contained HTML with embedded CSS/JS, no build step required.
 */
import type { NowAIKitHttpServer } from '../transport/http-server.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VERSION } from '../utils/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function mountDashboard(httpServer: NowAIKitHttpServer): void {
  httpServer.get('/', async (_req, res) => {
    try {
      const html = readFileSync(join(__dirname, 'dashboard.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch {
      // Fallback if dashboard.html is missing (e.g. in dist)
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getDashboardHtml());
    }
  }, false);

  httpServer.get('/dashboard', async (_req, res) => {
    res.writeHead(302, { Location: '/' });
    res.end();
  }, false);
}

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NowAIKit Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
.header{background:#1e293b;border-bottom:1px solid #334155;padding:1rem 2rem;display:flex;align-items:center;gap:1rem}
.header h1{font-size:1.5rem;font-weight:600;color:#38bdf8}
.header .version{color:#64748b;font-size:.875rem}
.container{max-width:1200px;margin:2rem auto;padding:0 2rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.5rem;margin-bottom:2rem}
.card{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.5rem}
.card h2{font-size:1.125rem;color:#38bdf8;margin-bottom:1rem}
.stat{font-size:2rem;font-weight:700;color:#f8fafc}
.stat-label{color:#94a3b8;font-size:.875rem}
.tool-search{width:100%;padding:.75rem 1rem;background:#0f172a;border:1px solid #334155;border-radius:.5rem;color:#e2e8f0;font-size:1rem;margin-bottom:1rem}
.tool-search:focus{outline:none;border-color:#38bdf8}
.tool-list{max-height:400px;overflow-y:auto}
.tool-item{padding:.75rem;border-bottom:1px solid #1e293b;cursor:pointer}
.tool-item:hover{background:#334155;border-radius:.25rem}
.tool-name{color:#38bdf8;font-family:monospace;font-size:.875rem}
.tool-desc{color:#94a3b8;font-size:.8rem;margin-top:.25rem}
#result{background:#0f172a;border:1px solid #334155;border-radius:.5rem;padding:1rem;font-family:monospace;font-size:.8rem;white-space:pre-wrap;max-height:300px;overflow-y:auto;display:none}
.btn{background:#38bdf8;color:#0f172a;border:none;padding:.5rem 1rem;border-radius:.375rem;cursor:pointer;font-weight:600}
.btn:hover{background:#7dd3fc}
.status-ok{color:#4ade80}.status-err{color:#f87171}
</style>
</head>
<body>
<div class="header">
  <h1>NowAIKit</h1>
  <span class="version">v${VERSION}</span>
  <span class="version" id="transport"></span>
</div>
<div class="container">
  <div class="grid">
    <div class="card"><div class="stat" id="tool-count">—</div><div class="stat-label">Available Tools</div></div>
    <div class="card"><div class="stat" id="resource-count">—</div><div class="stat-label">Resources</div></div>
    <div class="card"><div class="stat" id="prompt-count">—</div><div class="stat-label">Prompts</div></div>
    <div class="card"><div class="stat" id="health-status">—</div><div class="stat-label">Server Status</div></div>
  </div>
  <div class="card" style="margin-bottom:1.5rem">
    <h2>Tool Explorer</h2>
    <input class="tool-search" id="search" placeholder="Search tools..." oninput="filterTools()">
    <div class="tool-list" id="tools"></div>
  </div>
  <div class="card"><h2>Output</h2><pre id="result"></pre></div>
</div>
<script>
let allTools=[];
async function init(){
  try{
    const[h,t,r,p]=await Promise.all([
      fetch('/health').then(r=>r.json()),
      fetch('/api/tools').then(r=>r.json()),
      fetch('/api/resources').then(r=>r.json()),
      fetch('/api/prompts').then(r=>r.json()),
    ]);
    document.getElementById('health-status').innerHTML='<span class="status-ok">Online</span>';
    document.getElementById('transport').textContent='Transport: '+h.transport;
    document.getElementById('tool-count').textContent=t.count;
    document.getElementById('resource-count').textContent=r.count;
    document.getElementById('prompt-count').textContent=p.count;
    allTools=t.tools;renderTools(allTools);
  }catch(e){document.getElementById('health-status').innerHTML='<span class="status-err">Error</span>';}
}
function renderTools(tools){
  const el=document.getElementById('tools');
  el.innerHTML=tools.map(t=>'<div class="tool-item" onclick="showTool(\\''+t.name+'\\')"><div class="tool-name">'+t.name+'</div><div class="tool-desc">'+t.description.slice(0,120)+'</div></div>').join('');
}
function filterTools(){
  const q=document.getElementById('search').value.toLowerCase();
  renderTools(allTools.filter(t=>t.name.includes(q)||t.description.toLowerCase().includes(q)));
}
function showTool(name){
  const tool=allTools.find(t=>t.name===name);
  const el=document.getElementById('result');
  el.style.display='block';
  el.textContent=JSON.stringify(tool,null,2);
}
init();
</script>
</body>
</html>`;
}
