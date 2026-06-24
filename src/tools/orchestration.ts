/**
 * Orchestration tools — create, list, and execute multi-step playbooks.
 * Playbooks chain tool calls with conditional logic and error handling.
 * Requires NOW_ASSIST_ENABLED (Tier AI). Write tools also require WRITE_ENABLED.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireNowAssist, requireWrite } from '../utils/permissions.js';

interface PlaybookStep {
  tool_name: string;
  args_template: Record<string, any>;
  condition?: string;
  on_error?: 'stop' | 'skip' | 'continue';
}

interface StepResult {
  step_index: number;
  tool_name: string;
  status: 'executed' | 'skipped' | 'error' | 'dry_run';
  result?: any;
  error?: string;
  duration_ms?: number;
}

export function getOrchestrationToolDefinitions() {
  return [
    {
      name: 'create_playbook',
      description: 'Create a playbook definition with ordered steps that chain tool calls (requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Playbook name' },
          description: { type: 'string', description: 'Playbook description' },
          steps: {
            type: 'array',
            description: 'Ordered list of playbook steps',
            items: {
              type: 'object',
              properties: {
                tool_name: { type: 'string', description: 'Name of the tool to invoke' },
                args_template: { type: 'object', description: 'Arguments template — can reference {{context.key}} or {{steps[N].result.key}}' },
                condition: { type: 'string', description: 'Optional JS-like condition expression. Step runs only when truthy.' },
                on_error: { type: 'string', enum: ['stop', 'skip', 'continue'], description: 'Error handling: stop (default), skip this step, or continue to next' },
              },
              required: ['tool_name', 'args_template'],
            },
          },
        },
        required: ['name', 'description', 'steps'],
      },
    },
    {
      name: 'execute_playbook',
      description: 'Execute a playbook step by step, passing results forward through context (requires NOW_ASSIST_ENABLED). Supports dry_run.',
      inputSchema: {
        type: 'object',
        properties: {
          playbook: {
            type: 'object',
            description: 'Playbook object with name, description, and steps array',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tool_name: { type: 'string' },
                    args_template: { type: 'object' },
                    condition: { type: 'string' },
                    on_error: { type: 'string', enum: ['stop', 'skip', 'continue'] },
                  },
                  required: ['tool_name', 'args_template'],
                },
              },
            },
            required: ['steps'],
          },
          context: { type: 'object', description: 'Initial context key-value pairs available to all steps' },
          dry_run: { type: 'boolean', description: 'Preview execution plan without invoking tools (default true)' },
        },
        required: ['playbook'],
      },
    },
    {
      name: 'list_playbooks',
      description: 'List stored playbook definitions from sys_hub_action_type_definition',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
  ];
}

const ORCHESTRATION_TOOL_NAMES = new Set([
  'create_playbook', 'execute_playbook', 'list_playbooks',
]);

/**
 * Resolve template references like {{context.foo}} and {{steps[0].result.bar}}
 * in argument values against the current execution state.
 */
function resolveTemplate(value: any, context: Record<string, any>, stepResults: StepResult[]): any {
  if (typeof value === 'string') {
    return value.replace(/\{\{(.*?)\}\}/g, (_match: string, expr: string) => {
      const trimmed = expr.trim();

      // Handle context.key references
      if (trimmed.startsWith('context.')) {
        const path = trimmed.slice('context.'.length);
        return resolvePathValue(context, path) ?? '';
      }

      // Handle steps[N].result.key references
      const stepMatch = trimmed.match(/^steps\[(\d+)\]\.result\.(.+)$/);
      if (stepMatch) {
        const stepIdx = parseInt(stepMatch[1], 10);
        const path = stepMatch[2];
        const stepResult = stepResults[stepIdx];
        if (stepResult?.result) {
          return resolvePathValue(stepResult.result, path) ?? '';
        }
        return '';
      }

      return '';
    });
  }

  if (Array.isArray(value)) {
    return value.map(item => resolveTemplate(item, context, stepResults));
  }

  if (value !== null && typeof value === 'object') {
    const resolved: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveTemplate(v, context, stepResults);
    }
    return resolved;
  }

  return value;
}

/** Resolve a dot-separated path against an object */
function resolvePathValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Evaluate a simple condition string against context and step results.
 * Supports basic expressions like "context.count > 0" or "steps[0].result.success == true".
 */
function evaluateCondition(condition: string, context: Record<string, any>, stepResults: StepResult[]): boolean {
  if (!condition || condition.trim() === '') return true;

  // Resolve all template references in the condition first
  const resolved = resolveTemplate(condition, context, stepResults);

  // Simple truthy evaluation after template resolution
  // Support basic comparisons: ==, !=, >, <, >=, <=
  const comparisonMatch = String(resolved).match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (comparisonMatch) {
    const [, leftStr, op, rightStr] = comparisonMatch;
    const left = parseConditionValue(leftStr.trim());
    const right = parseConditionValue(rightStr.trim());

    switch (op) {
      case '==': return left == right;
      case '!=': return left != right;
      case '>': return Number(left) > Number(right);
      case '<': return Number(left) < Number(right);
      case '>=': return Number(left) >= Number(right);
      case '<=': return Number(left) <= Number(right);
    }
  }

  // Default: truthy check on the resolved string
  const val = String(resolved).trim().toLowerCase();
  return val !== '' && val !== 'false' && val !== '0' && val !== 'null' && val !== 'undefined';
}

function parseConditionValue(val: string): string | number | boolean {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === 'undefined') return '';
  // Remove surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  return val;
}

export async function executeOrchestrationToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (!ORCHESTRATION_TOOL_NAMES.has(name)) return null;

  switch (name) {
    case 'create_playbook': {
      requireNowAssist();
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      if (!args.description) throw new ServiceNowError('description is required', 'INVALID_REQUEST');
      if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
        throw new ServiceNowError('steps must be a non-empty array', 'INVALID_REQUEST');
      }

      // Validate each step has required fields
      for (let i = 0; i < args.steps.length; i++) {
        const step = args.steps[i];
        if (!step.tool_name) throw new ServiceNowError(`steps[${i}].tool_name is required`, 'INVALID_REQUEST');
        if (!step.args_template || typeof step.args_template !== 'object') {
          throw new ServiceNowError(`steps[${i}].args_template must be an object`, 'INVALID_REQUEST');
        }
      }

      // Attempt to store as a record; fall back to returning the definition
      try {
        const record = await client.createRecord('sys_hub_action_type_definition', {
          name: args.name,
          description: args.description,
          definition: JSON.stringify({
            steps: args.steps,
            version: '1.0',
            created_by: 'nowaikit',
          }),
          active: true,
        });
        return { message: 'Playbook created', playbook: record };
      } catch {
        // Table may not exist — return the definition for manual creation
        return {
          message: 'Playbook definition generated (table sys_hub_action_type_definition may not be available). Use this definition for manual creation.',
          definition: {
            name: args.name,
            description: args.description,
            steps: args.steps,
            version: '1.0',
          },
        };
      }
    }

    case 'execute_playbook': {
      requireNowAssist();
      if (!args.playbook || !args.playbook.steps || !Array.isArray(args.playbook.steps)) {
        throw new ServiceNowError('playbook with steps array is required', 'INVALID_REQUEST');
      }

      const steps: PlaybookStep[] = args.playbook.steps;
      const context: Record<string, any> = args.context || {};
      const dryRun = args.dry_run !== false;
      const stepResults: StepResult[] = [];

      // Dynamically import executeTool for live execution
      let executeTool: ((client: ServiceNowClient, name: string, args: Record<string, any>) => Promise<any>) | undefined;
      if (!dryRun) {
        const toolIndex = await import('./index.js');
        executeTool = toolIndex.executeTool;
      }

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const onError = step.on_error || 'stop';

        // Evaluate condition
        if (step.condition) {
          const conditionMet = evaluateCondition(step.condition, context, stepResults);
          if (!conditionMet) {
            stepResults.push({
              step_index: i,
              tool_name: step.tool_name,
              status: 'skipped',
              result: null,
              error: `Condition not met: ${step.condition}`,
            });
            continue;
          }
        }

        // Resolve args template
        const resolvedArgs = resolveTemplate(step.args_template, context, stepResults);

        if (dryRun) {
          stepResults.push({
            step_index: i,
            tool_name: step.tool_name,
            status: 'dry_run',
            result: { resolved_args: resolvedArgs },
          });
          continue;
        }

        // Execute the step
        const startTime = Date.now();
        try {
          const result = await executeTool!(client, step.tool_name, resolvedArgs);
          stepResults.push({
            step_index: i,
            tool_name: step.tool_name,
            status: 'executed',
            result,
            duration_ms: Date.now() - startTime,
          });
        } catch (err: any) {
          const errorMsg = err instanceof ServiceNowError ? err.message : String(err);
          stepResults.push({
            step_index: i,
            tool_name: step.tool_name,
            status: 'error',
            error: errorMsg,
            duration_ms: Date.now() - startTime,
          });

          if (onError === 'stop') {
            break;
          }
          // 'skip' and 'continue' both move to the next step
        }
      }

      return {
        playbook_name: args.playbook.name || 'unnamed',
        dry_run: dryRun,
        total_steps: steps.length,
        executed: stepResults.filter(s => s.status === 'executed').length,
        skipped: stepResults.filter(s => s.status === 'skipped').length,
        errors: stepResults.filter(s => s.status === 'error').length,
        steps: stepResults,
      };
    }

    case 'list_playbooks': {
      const limit = args.limit || 25;

      const resp = await client.queryRecords({
        table: 'sys_hub_action_type_definition',
        query: 'active=true',
        limit,
        fields: 'sys_id,name,description,active,sys_updated_on',
      });
      return { count: resp.count, playbooks: resp.records };
    }

    default:
      return null;
  }
}
