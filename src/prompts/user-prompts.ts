/**
 * User-defined custom slash commands loaded from nowaikit.commands.json
 * in the current working directory.
 *
 * File format:
 * [
 *   {
 *     "name": "my-p1-runbook",
 *     "description": "P1 runbook for my team",
 *     "template": "List all P1 incidents in the Network category..."
 *   }
 * ]
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PromptDefinition } from './itsm.js';

export function loadUserPrompts(): PromptDefinition[] {
  const commandsFile = join(process.cwd(), 'nowaikit.commands.json');
  if (!existsSync(commandsFile)) return [];

  try {
    const raw = JSON.parse(readFileSync(commandsFile, 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];

    return (raw as unknown[]).filter((item): item is PromptDefinition => {
      if (typeof item !== 'object' || item === null) return false;
      const obj = item as Record<string, unknown>;
      return typeof obj['name'] === 'string' && typeof obj['template'] === 'string';
    });
  } catch {
    return [];
  }
}
