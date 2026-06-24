/**
 * MCP Prompts registry — exposes built-in ITSM prompts, user-defined prompts,
 * and 26 Apex capability prompts (scan/review/build/ops/docs).
 *
 * Performance: Capability modules are lazy-loaded — only imported when a
 * capability prompt is actually resolved. The prompt listing uses a lightweight
 * metadata array so MCP clients never pay the cost of loading 26 capability
 * files + knowledge base just to list available prompts.
 */
import { itsmPrompts } from './itsm.js';
import { loadUserPrompts } from './user-prompts.js';
import type { CapabilityDefinition, CapabilityCategory } from './types.js';
import { loadConfig } from '../cli/config-store.js';

export type { CapabilityDefinition, CapabilityCategory } from './types.js';

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

export interface GetPromptResult {
  description: string;
  messages: McpPromptMessage[];
}

// ─── Capability metadata (lightweight — no module imports) ──────────────────

interface CapabilityMeta {
  name: string;
  title: string;
  description: string;
  category: CapabilityCategory;
  file: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
}

const capabilityMeta: CapabilityMeta[] = [
  // Scan
  { name: 'scan-health', title: 'Instance Health Scan', description: 'Complete instance health assessment — plugins, scheduled jobs, logs, quotas, system diagnostics', category: 'scan', file: 'scan-health' },
  { name: 'scan-security', title: 'Security Audit', description: 'Comprehensive security scan — ACLs, roles, scripts, APIs, compliance across ALL artifact types', category: 'scan', file: 'scan-security', arguments: [{ name: 'scope', description: 'Audit scope: "instance" for full audit, or a specific table/app name', required: true }, { name: 'focus', description: 'Narrow focus: "acls", "roles", "scripts", "api", or "all"', required: false }] },
  { name: 'scan-debt', title: 'Technical Debt Analysis', description: 'Find dead code, unused scripts, duplicate logic, stale configurations across ALL artifact types', category: 'scan', file: 'scan-debt' },
  { name: 'scan-upgrade', title: 'Upgrade Readiness Check', description: 'Check deprecated APIs, incompatible patterns, and plugin conflicts before upgrading', category: 'scan', file: 'scan-upgrade' },
  { name: 'scan-cmdb', title: 'CMDB Health Scan', description: 'CMDB health — stale CIs, broken relationships, data quality, orphan detection, class compliance', category: 'scan', file: 'scan-cmdb' },
  { name: 'scan-automation', title: 'Automation Conflict Scan', description: 'Automation conflict detection — overlapping business rules and flows, circular triggers, execution order', category: 'scan', file: 'scan-automation' },
  // Review
  { name: 'review-code', title: 'Deep Code Review', description: 'Deep code review — security, performance, best practices, upgrade safety across all artifact types', category: 'review', file: 'review-code' },
  { name: 'review-acls', title: 'ACL Coverage Analysis', description: 'ACL coverage analysis — missing ACLs, field-level gaps, overly permissive rules, conflicts', category: 'review', file: 'review-acls' },
  { name: 'review-scripts', title: 'Bulk Script Scan', description: 'Bulk script scan — injection, performance antipatterns, deprecated APIs, hardcoded sys_ids', category: 'review', file: 'review-scripts' },
  { name: 'review-flows', title: 'Flow Designer Audit', description: 'Flow Designer audit — error handling, performance, dead paths, async issues, security, compliance', category: 'review', file: 'review-flows' },
  // Build
  { name: 'build-business-rule', title: 'Build Business Rule', description: 'Guided business rule creation — understand, check existing, generate, review, create, test', category: 'build', file: 'build-business-rule', arguments: [{ name: 'description', description: 'what the business rule should do', required: true }, { name: 'table', description: 'target table', required: true }, { name: 'when', description: 'before, after, async, display', required: false }] },
  { name: 'build-client-script', title: 'Build Client Script', description: 'Guided client script creation — onChange, onLoad, onSubmit, onCellEdit with best practices', category: 'build', file: 'build-client-script', arguments: [{ name: 'description', description: 'what the client script should do', required: true }, { name: 'table', description: 'target table', required: true }, { name: 'type', description: 'onChange, onLoad, onSubmit, onCellEdit', required: false }] },
  { name: 'build-test-plan', title: 'Build Test Plan', description: 'Generate ATF test plan for any artifact type — BRs, SIs, Client Scripts, Flows, ACLs, Catalog', category: 'build', file: 'build-test-plan', arguments: [{ name: 'artifact_type', description: 'artifact type to test', required: true }, { name: 'description', description: 'what the artifact does', required: true }] },
  { name: 'build-app', title: 'Build Application', description: 'Complete 7-phase scoped application builder — from data model to packaging', category: 'build', file: 'build-app', arguments: [{ name: 'description', description: 'what the application should do', required: true }, { name: 'app_name', description: 'application name', required: true }, { name: 'scope_prefix', description: 'scope prefix e.g. x_myco', required: false }] },
  { name: 'build-flow', title: 'Build Flow', description: 'Flow Designer creation — triggers, actions, error handling, subflows, testing', category: 'build', file: 'build-flow', arguments: [{ name: 'description', description: 'what the flow should do', required: true }, { name: 'trigger_type', description: 'record, scheduled, application, email', required: false }] },
  { name: 'build-portal', title: 'Build Portal Widget', description: 'Service Portal widget builder — server, client, HTML, CSS with architectural guidance', category: 'build', file: 'build-portal', arguments: [{ name: 'description', description: 'what the widget should do', required: true }, { name: 'widget_name', description: 'widget name', required: false }, { name: 'table', description: 'data table', required: false }] },
  { name: 'build-uib', title: 'Build UIB Component', description: 'UI Builder / Next Experience component builder — Seismic, NEDS, macroponents', category: 'build', file: 'build-uib', arguments: [{ name: 'description', description: 'what the component should do', required: true }, { name: 'component_type', description: 'page, macroponent, data_resource', required: false }] },
  { name: 'build-catalog', title: 'Build Catalog Item', description: 'End-to-end catalog item builder — variables, approval, fulfillment, client scripts', category: 'build', file: 'build-catalog', arguments: [{ name: 'description', description: 'what the catalog item provides', required: true }, { name: 'item_name', description: 'catalog item name', required: false }, { name: 'category', description: 'catalog category', required: false }] },
  { name: 'build-rest-api', title: 'Build REST API', description: 'Scripted REST API builder — resources, auth, error handling, versioning, documentation', category: 'build', file: 'build-rest-api', arguments: [{ name: 'description', description: 'what the API should do', required: true }, { name: 'api_name', description: 'API name', required: false }, { name: 'http_methods', description: 'GET, POST, PUT, DELETE', required: false }] },
  // Ops
  { name: 'ops-triage', title: 'Incident Triage', description: 'P1/P2 incident triage — fetch details, assess CMDB impact, check SLAs, search KB, suggest resolution', category: 'ops', file: 'ops-triage', arguments: [{ name: 'incident', description: 'incident number or situation description', required: true }, { name: 'action', description: 'triage, escalate, communicate, review', required: false }] },
  { name: 'ops-deploy', title: 'Deploy to Production', description: 'Safe deployment pipeline — validate, preview, create change, ATF, commit, rollback plan', category: 'ops', file: 'ops-deploy', arguments: [{ name: 'updateset', description: 'update set name or sys_id', required: true }, { name: 'target', description: 'target instance', required: false }] },
  { name: 'ops-risk', title: 'Change Risk Assessment', description: 'Change risk scoring, conflict detection, CAB preparation, and rollback planning', category: 'ops', file: 'ops-risk', arguments: [{ name: 'change', description: 'change number or description', required: true }, { name: 'action', description: 'assess, prepare-cab, check-conflicts, plan-rollback', required: false }] },
  // Docs
  { name: 'docs-app', title: 'Document Application', description: 'Auto-generate comprehensive application documentation — tables, scripts, flows, ACLs, catalog', category: 'docs', file: 'docs-app', arguments: [{ name: 'app', description: 'scoped app name or scope prefix', required: true }] },
  { name: 'docs-release', title: 'Generate Release Notes', description: 'Generate release notes from update set — categorize changes, highlight breaking changes', category: 'docs', file: 'docs-release', arguments: [{ name: 'updateset', description: 'update set name or sys_id', required: true }, { name: 'version', description: 'version number', required: false }] },
  { name: 'docs-runbook', title: 'Generate Runbook', description: 'Operational runbook — incident response, health checks, escalation, recovery procedures', category: 'docs', file: 'docs-runbook', arguments: [{ name: 'service', description: 'service, CI, or application name', required: true }] },
  { name: 'docs-script', title: 'Document Script', description: 'Detailed script documentation — JSDoc, explanation, usage examples, dependencies, security', category: 'docs', file: 'docs-script', arguments: [{ name: 'script', description: 'script name or pasted code', required: true }] },
  // v4.0 addition
  { name: 'build-atf-suite', title: 'Generate ATF Test Suite', description: 'AI-generates runnable ATF test suites from business rules, script includes, flows, or any artifact', category: 'build', file: 'build-atf-suite', arguments: [{ name: 'target', description: 'artifact name/sys_id or feature description', required: true }, { name: 'coverage', description: 'basic, standard, comprehensive. Default: standard', required: false }] },
];

// Cache for loaded capability modules (lazy-load on first resolve)
const capabilityCache = new Map<string, CapabilityDefinition>();

/** Lazy-load a capability module by file name. */
async function loadCapability(fileName: string): Promise<CapabilityDefinition> {
  const cached = capabilityCache.get(fileName);
  if (cached) return cached;

  const mod = await import(`./capabilities/${fileName}.js`);
  const cap: CapabilityDefinition = mod.default;
  capabilityCache.set(fileName, cap);
  return cap;
}

// ─── Pro extension support ──────────────────────────────────────────────────

let proLoaded = false;

async function loadProExtensions(): Promise<void> {
  if (proLoaded) return;
  proLoaded = true;

  const proPath = process.env.NOWAIKIT_PRO_PATH;
  if (!proPath) return;

  try {
    const { join } = await import('path');
    const proModule = await import(join(proPath, 'capabilities/index.js'));
    if (typeof proModule.getProCapabilities === 'function') {
      const proCaps: CapabilityDefinition[] = proModule.getProCapabilities();
      for (const cap of proCaps) {
        capabilityCache.set(cap.name, cap);
        // Add to metadata if not already present
        if (!capabilityMeta.find(m => m.name === cap.name)) {
          capabilityMeta.push({
            name: cap.name,
            title: cap.title,
            description: cap.description,
            category: cap.category,
            file: cap.name,
            arguments: cap.arguments,
          });
        }
      }
    }
  } catch {
    // Pro extensions not available
  }
}

// ─── Apex feature flag ──────────────────────────────────────────────────────

/**
 * Check if Apex AI Skills are enabled.
 * Disabled via NOWAIKIT_APEX_ENABLED=false env var or apexEnabled=false on the
 * active instance in the config store. Defaults to enabled.
 */
function isApexEnabled(): boolean {
  // Env var override (fastest check)
  const envFlag = process.env.NOWAIKIT_APEX_ENABLED;
  if (envFlag !== undefined) {
    return envFlag !== 'false' && envFlag !== '0';
  }

  // Check config store — if *any* instance has apexEnabled explicitly false, respect it.
  // Typically the default instance is the one that matters.
  try {
    const config = loadConfig();
    const defaultInst = config.instances[config.defaultInstance];
    if (defaultInst && defaultInst.apexEnabled === false) {
      return false;
    }
  } catch {
    // Config not available — default to enabled
  }

  return true;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** All prompts merged (ITSM + user-defined + capabilities). Lightweight — no capability module loading. */
export function getPrompts(): McpPrompt[] {
  const userPrompts = loadUserPrompts();

  const itsmMapped = itsmPrompts.map(p => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));

  // Only include Apex capabilities if enabled
  if (!isApexEnabled()) {
    return [...itsmMapped, ...userPrompts];
  }

  const capMapped = capabilityMeta.map(c => ({
    name: c.name,
    description: c.description,
    arguments: c.arguments,
  }));

  return [...itsmMapped, ...userPrompts, ...capMapped];
}

/** Resolve a prompt by name. Lazy-loads capability modules only when needed. */
export async function resolvePromptAsync(name: string, args?: Record<string, string>): Promise<GetPromptResult | null> {
  // 1. Check ITSM prompts
  const allTemplated = [...itsmPrompts, ...loadUserPrompts()];
  const prompt = allTemplated.find(p => p.name === name);
  if (prompt) {
    let text = prompt.template;
    if (args) {
      for (const [key, value] of Object.entries(args)) {
        text = text.replaceAll(`{${key}}`, value);
      }
    }
    return {
      description: prompt.description,
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }

  // 2. Check capabilities (lazy-load) — only if Apex is enabled
  if (isApexEnabled()) {
    const capMeta = capabilityMeta.find(c => c.name === name);
    if (capMeta) {
      await loadProExtensions();
      const cap = await loadCapability(capMeta.file);
      const messages = cap.buildPrompt(args);
      return { description: cap.description, messages };
    }
  }

  return null;
}

/** Synchronous resolve — for backward compatibility. Only resolves ITSM/user prompts. */
export function resolvePrompt(name: string, args?: Record<string, string>): GetPromptResult | null {
  const allTemplated = [...itsmPrompts, ...loadUserPrompts()];
  const prompt = allTemplated.find(p => p.name === name);
  if (!prompt) {
    // Check if it's a capability — return a minimal prompt directing to use async
    const capMeta = isApexEnabled() ? capabilityMeta.find(c => c.name === name) : undefined;
    if (capMeta) {
      // Synchronous fallback: build a lightweight redirect prompt
      return {
        description: capMeta.description,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Execute the "${capMeta.name}" capability: ${capMeta.description}. ${args ? `Arguments: ${JSON.stringify(args)}` : ''}`,
          },
        }],
      };
    }
    return null;
  }

  let text = prompt.template;
  if (args) {
    for (const [key, value] of Object.entries(args)) {
      text = text.replaceAll(`{${key}}`, value);
    }
  }

  return {
    description: prompt.description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  };
}

/** Get capability metadata for CLI listing. Lightweight — no module loading. */
export function getCapabilityMeta(): CapabilityMeta[] {
  if (!isApexEnabled()) return [];
  return [...capabilityMeta];
}

/** Get full capability definitions (loads all modules). For direct execution. */
export async function getCapabilities(): Promise<CapabilityDefinition[]> {
  if (!isApexEnabled()) return [];
  await loadProExtensions();
  const loaded: CapabilityDefinition[] = [];
  for (const meta of capabilityMeta) {
    loaded.push(await loadCapability(meta.file));
  }
  return loaded;
}

/** Initialize registry — loads pro extensions if configured. */
export async function initializeRegistry(): Promise<void> {
  await loadProExtensions();
}
