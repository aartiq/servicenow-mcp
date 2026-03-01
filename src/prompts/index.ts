/**
 * MCP Prompts registry — exposes built-in and user-defined slash commands.
 */
import { itsmPrompts } from './itsm.js';
import { loadUserPrompts } from './user-prompts.js';

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

/** All prompts merged (built-in + user-defined). */
export function getPrompts(): McpPrompt[] {
  const userPrompts = loadUserPrompts();
  return [...itsmPrompts, ...userPrompts].map(p => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));
}

/** Resolve a prompt by name, substituting any provided arguments into the template. */
export function resolvePrompt(name: string, args?: Record<string, string>): GetPromptResult | null {
  const allPrompts = [...itsmPrompts, ...loadUserPrompts()];
  const prompt = allPrompts.find(p => p.name === name);
  if (!prompt) return null;

  let text = prompt.template;

  // Substitute {argName} placeholders with provided values
  if (args) {
    for (const [key, value] of Object.entries(args)) {
      text = text.replaceAll(`{${key}}`, value);
    }
  }

  return {
    description: prompt.description,
    messages: [
      {
        role: 'user',
        content: { type: 'text', text },
      },
    ],
  };
}
