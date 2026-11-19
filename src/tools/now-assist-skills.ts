/**
 * Now Assist Skills management tools — create, list, get, and test Now Assist skills.
 * All tools require NOW_ASSIST_ENABLED=true (Tier AI).
 * Write tools additionally require WRITE_ENABLED=true (Tier 1).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { isScriptingEnabled, requireNowAssist, requireWrite } from '../utils/permissions.js';

export function getNowAssistSkillsToolDefinitions() {
  return [
    {
      name: 'create_now_assist_skill',
      description: 'Create a draft Now Assist skill: a OneExtend capability (type skill, holding the input/output schema and prompt template in its metadata) plus its sn_nowassist_skill_config registration. Finish the prompt/provider in Now Assist Skill Kit before activating (requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' },
          description: { type: 'string', description: 'Skill description' },
          input_schema: { type: 'string', description: 'JSON schema string defining the skill input' },
          output_schema: { type: 'string', description: 'JSON schema string defining the skill output' },
          prompt_template: { type: 'string', description: 'Prompt template for the skill' },
          model: { type: 'string', description: 'Optional model identifier to use for this skill' },
          skill_family: { type: 'string', description: 'Optional Now Assist skill family (sys_id or name, default "Platform")' },
          active: { type: 'boolean', description: 'Activate the skill config right away (default false: finish the prompt and provider in Now Assist Skill Kit first)' },
        },
        required: ['name', 'description', 'input_schema', 'output_schema', 'prompt_template'],
      },
    },
    {
      name: 'list_now_assist_skills',
      description: 'List Now Assist skill definitions (requires NOW_ASSIST_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active status' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'get_now_assist_skill',
      description: 'Get a single Now Assist skill definition by sys_id (requires NOW_ASSIST_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the skill' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'test_now_assist_skill',
      description: 'Invoke a Now Assist skill with test input to verify behavior (requires NOW_ASSIST_ENABLED)',
      inputSchema: {
        type: 'object',
        properties: {
          skill_sys_id: { type: 'string', description: 'System ID of the skill to test' },
          test_input: { type: 'object', description: 'Test input payload to send to the skill' },
        },
        required: ['skill_sys_id', 'test_input'],
      },
    },
  ];
}

const SKILL_TOOL_NAMES = new Set([
  'create_now_assist_skill', 'list_now_assist_skills', 'get_now_assist_skill', 'test_now_assist_skill',
]);

const SKILL_TABLE = 'sn_nowassist_skill_config';
const CAPABILITY_TABLE = 'sys_one_extend_capability';

/** Resolve a skill family sys_id or name to a sys_id (skill_family is mandatory on sn_nowassist_skill_config). */
async function resolveSkillFamily(client: ServiceNowClient, family?: string): Promise<string> {
  if (family && /^[0-9a-f]{32}$/i.test(family)) return family;
  const wanted = family || 'Platform';
  const found = await withSkillPlugin(() => client.queryRecords({ table: 'sn_nowassist_skill_family', query: `name=${wanted}`, limit: 1, fields: 'sys_id' }));
  if (found.count) return (found.records[0] as any).sys_id;
  if (family) throw new ServiceNowError(`Now Assist skill family not found: ${family}`, 'NOT_FOUND');
  const any = await client.queryRecords({ table: 'sn_nowassist_skill_family', limit: 1, fields: 'sys_id' });
  if (!any.count) throw new ServiceNowError('No Now Assist skill family exists on this instance; pass skill_family.', 'NOT_FOUND');
  return (any.records[0] as any).sys_id;
}

async function withSkillPlugin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceNowError && /Invalid table/i.test(e.message)) {
      throw new ServiceNowError("This needs the Now Assist (sn_nowassist) plugin, which isn't active on this instance.", 'PLUGIN_NOT_ACTIVE');
    }
    throw e;
  }
}

function refValue(v: any): string {
  return v && typeof v === 'object' ? String(v.value ?? '') : String(v ?? '');
}

/** Resolve a skill config sys_id (or a OneExtend capability sys_id) to the ids OneExtend needs. */
async function resolveSkillIds(client: ServiceNowClient, id: string): Promise<{ name: string; capabilityId: string; skillConfigId?: string }> {
  const byConfig = await withSkillPlugin(() => client.queryRecords({
    table: SKILL_TABLE,
    query: `sys_id=${id}^ORskill_id=${id}`,
    limit: 1,
    fields: 'sys_id,name,skill_table,skill_id',
  }));
  if (byConfig.count) {
    const cfg = byConfig.records[0] as any;
    if (cfg.skill_table && cfg.skill_table !== 'sys_one_extend_capability') {
      throw new ServiceNowError(
        `Skill "${cfg.name}" is backed by ${cfg.skill_table}, not a OneExtend capability, so it can't be run directly. Test it from where it's used (Now Assist panel, Virtual Agent or AI Agent Studio).`,
        'NOT_SUPPORTED',
      );
    }
    return { name: cfg.name, capabilityId: refValue(cfg.skill_id), skillConfigId: cfg.sys_id };
  }
  const cap = await client.queryRecords({ table: 'sys_one_extend_capability', query: `sys_id=${id}`, limit: 1, fields: 'sys_id,name' });
  if (!cap.count) throw new ServiceNowError(`Now Assist skill not found: ${id}`, 'NOT_FOUND');
  return { name: (cap.records[0] as any).name, capabilityId: id };
}

/**
 * Run a Now Assist skill (skill config or OneExtend capability sys_id) with the given input.
 * ServiceNow has no REST endpoint for this: the supported path is the server-side
 * sn_one_extend.OneExtendUtil.execute() API, so it runs as a one-time server script.
 */
export async function invokeNowAssistSkill(
  client: ServiceNowClient,
  skillId: string,
  input: Record<string, any>,
): Promise<{ skill_name: string; capability_id: string; skill_config_id?: string; result: any; raw: any }> {
  const ids = await resolveSkillIds(client, skillId);
  if (!isScriptingEnabled()) {
    throw new ServiceNowError(
      'ServiceNow has no REST endpoint for running a Now Assist skill. Skills run through the server-side ' +
      'sn_one_extend.OneExtendUtil API, so testing one needs WRITE_ENABLED=true and SCRIPTING_ENABLED=true ' +
      `(NowAIKit then runs it as a one-time server script). Skill "${ids.name}": capability ${ids.capabilityId}, skill config ${ids.skillConfigId ?? 'none'}.`,
      'SCRIPTING_NOT_ENABLED',
    );
  }
  const request = {
    executionRequests: [{
      payload: input,
      capabilityId: ids.capabilityId,
      ...(ids.skillConfigId ? { meta: { skillConfigId: ids.skillConfigId } } : {}),
    }],
    mode: 'sync',
  };
  const script =
    `var res = sn_one_extend.OneExtendUtil.execute(${JSON.stringify(request)});\n` +
    `return JSON.parse(JSON.stringify(res));`;
  const exec = await client.executeScript(script);
  if (exec && exec.ok === false) {
    throw new ServiceNowError(`Skill execution failed: ${exec.error}`, 'NOW_ASSIST_ERROR');
  }
  const raw = exec?.result ?? exec?.output ?? exec;
  const response = raw?.capabilities?.[ids.capabilityId]?.response;
  let output: any = response;
  if (typeof response?.result === 'string') {
    try { output = JSON.parse(response.result); } catch { output = response.result; }
  }
  return {
    skill_name: ids.name,
    capability_id: ids.capabilityId,
    skill_config_id: ids.skillConfigId,
    result: output?.model_output ?? output?.modelOutput ?? output ?? raw,
    raw,
  };
}

export async function executeNowAssistSkillsToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  if (!SKILL_TOOL_NAMES.has(name)) return null;
  requireNowAssist();

  switch (name) {
    case 'create_now_assist_skill': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      if (!args.description) throw new ServiceNowError('description is required', 'INVALID_REQUEST');
      if (!args.input_schema) throw new ServiceNowError('input_schema is required', 'INVALID_REQUEST');
      if (!args.output_schema) throw new ServiceNowError('output_schema is required', 'INVALID_REQUEST');
      if (!args.prompt_template) throw new ServiceNowError('prompt_template is required', 'INVALID_REQUEST');

      const family = await resolveSkillFamily(client, args.skill_family);
      const metadata: Record<string, any> = {
        createdBy: 'nowaikit',
        input_schema: args.input_schema,
        output_schema: args.output_schema,
        prompt_template: args.prompt_template,
      };
      if (args.model) metadata.model = args.model;

      // A Now Assist skill is a OneExtend capability (type "skill") registered in sn_nowassist_skill_config.
      const capability = await withSkillPlugin(() => client.createRecord(CAPABILITY_TABLE, {
        name: args.name,
        description: args.description,
        short_description: args.description,
        type: 'skill',
        active: true,
        metadata: JSON.stringify(metadata),
      }));
      const data: Record<string, any> = {
        name: args.name,
        description: args.description,
        skill_family: family,
        skill_table: CAPABILITY_TABLE,
        skill_id: capability.sys_id,
        active: args.active === true,
      };
      let record;
      try {
        record = await withSkillPlugin(() => client.createRecord(SKILL_TABLE, data));
      } catch (e) {
        // Don't leave an orphan capability behind when the skill config can't be created.
        await client.deleteRecord(CAPABILITY_TABLE, String(capability.sys_id)).catch(() => undefined);
        throw e;
      }
      return {
        message: 'Now Assist skill created (draft)',
        skill: record,
        capability: { sys_id: capability.sys_id, name: capability.name },
        next_steps: 'The prompt template, input and output schema are stored on the capability metadata. Open the skill in Now Assist Skill Kit to attach the prompt and LLM provider, then activate it. test_now_assist_skill runs it once it has a provider.',
      };
    }

    case 'list_now_assist_skills': {
      // Now Assist skills (OOB and Now Assist Skill Kit) are registered in sn_nowassist_skill_config;
      // skill_table/skill_id point at the backing OneExtend capability.
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      if (args.query) parts.push(args.query);
      const query = parts.length > 0 ? parts.join('^') : undefined;

      const resp = await withSkillPlugin(() => client.queryRecords({
        table: SKILL_TABLE,
        query,
        limit: args.limit || 25,
        fields: 'sys_id,name,description,active,state,skill_family,skill_table,skill_id,edited_in_nask,sys_updated_on',
      }));
      return { count: resp.count, skills: resp.records };
    }

    case 'get_now_assist_skill': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const record = await withSkillPlugin(() => client.getRecord(SKILL_TABLE, args.sys_id));
      return { skill: record };
    }

    case 'test_now_assist_skill': {
      if (!args.skill_sys_id) throw new ServiceNowError('skill_sys_id is required', 'INVALID_REQUEST');
      if (!args.test_input) throw new ServiceNowError('test_input is required', 'INVALID_REQUEST');

      const run = await invokeNowAssistSkill(client, args.skill_sys_id, args.test_input);
      return {
        skill_sys_id: args.skill_sys_id,
        skill_name: run.skill_name,
        capability_id: run.capability_id,
        skill_config_id: run.skill_config_id,
        test_input: args.test_input,
        result: run.result,
        raw: run.raw,
      };
    }

    default:
      return null;
  }
}
