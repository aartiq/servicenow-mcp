/**
 * NowAIKit — Capability type definitions.
 *
 * Capabilities are user-facing commands (/scan-health, /review-code, etc.)
 * backed by domain expertise. Exposed as MCP prompts.
 */

/** Capability category — determines command grouping. */
export type CapabilityCategory = 'scan' | 'review' | 'build' | 'ops' | 'docs';

/** A single message in an MCP prompt conversation. */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

/** A capability definition. Each file in capabilities/ exports one. */
export interface CapabilityDefinition {
  /** MCP prompt name (e.g. "scan-health", "review-code", "build-app"). */
  name: string;
  /** Human-readable title. */
  title: string;
  /** One-line description for prompt listings. */
  description: string;
  /** Category for grouping in CLI list. */
  category: CapabilityCategory;
  /** Optional user-supplied arguments. */
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  /** Tool names this capability commonly uses. */
  recommendedTools?: string[];
  /** Build the multi-message prompt. */
  buildPrompt: (args?: Record<string, string>) => AgentMessage[];
}
