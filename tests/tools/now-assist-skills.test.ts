import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeNowAssistSkillsToolCall,
  getNowAssistSkillsToolDefinitions,
} from '../../src/tools/now-assist-skills.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  callNowAssist: vi.fn(),
  batchRequest: vi.fn(),
  executeScript: vi.fn(),
} as unknown as ServiceNowClient;

describe('getNowAssistSkillsToolDefinitions', () => {
  it('returns 4 Now Assist skill tool definitions', () => {
    const tools = getNowAssistSkillsToolDefinitions();
    expect(tools).toHaveLength(4);
    const names = tools.map(t => t.name);
    expect(names).toContain('create_now_assist_skill');
    expect(names).toContain('list_now_assist_skills');
    expect(names).toContain('get_now_assist_skill');
    expect(names).toContain('test_now_assist_skill');
  });
});

describe('executeNowAssistSkillsToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOW_ASSIST_ENABLED = 'true';
    process.env.WRITE_ENABLED = 'true';
  });

  it('returns null for unmatched tool names', async () => {
    const result = await executeNowAssistSkillsToolCall(mockClient, 'unknown_tool', {});
    expect(result).toBeNull();
  });

  it('throws when NOW_ASSIST_ENABLED is not set', async () => {
    delete process.env.NOW_ASSIST_ENABLED;

    await expect(
      executeNowAssistSkillsToolCall(mockClient, 'list_now_assist_skills', {})
    ).rejects.toThrow('Now Assist');
  });

  describe('list_now_assist_skills', () => {
    it('queries the sn_now_assist_skill table', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 2,
        records: [
          { sys_id: 'sk1', name: 'Summarizer', active: true },
          { sys_id: 'sk2', name: 'Classifier', active: true },
        ],
      });

      const result = await executeNowAssistSkillsToolCall(mockClient, 'list_now_assist_skills', {});

      expect(result.count).toBe(2);
      expect(result.skills).toHaveLength(2);
      expect(mockClient.queryRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'sn_now_assist_skill',
          limit: 25,
        })
      );
    });

    it('applies active filter', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });

      await executeNowAssistSkillsToolCall(mockClient, 'list_now_assist_skills', { active: true });

      expect(mockClient.queryRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('active=true'),
        })
      );
    });

    it('applies custom limit', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });

      await executeNowAssistSkillsToolCall(mockClient, 'list_now_assist_skills', { limit: 50 });

      expect(mockClient.queryRecords).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });
  });

  describe('get_now_assist_skill', () => {
    it('fetches a skill by sys_id', async () => {
      (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
        sys_id: 'sk1',
        name: 'Summarizer',
        description: 'Summarizes text',
      });

      const result = await executeNowAssistSkillsToolCall(mockClient, 'get_now_assist_skill', {
        sys_id: 'sk1',
      });

      expect(result.skill.sys_id).toBe('sk1');
      expect(result.skill.name).toBe('Summarizer');
      expect(mockClient.getRecord).toHaveBeenCalledWith('sn_now_assist_skill', 'sk1');
    });

    it('throws when sys_id is missing', async () => {
      await expect(
        executeNowAssistSkillsToolCall(mockClient, 'get_now_assist_skill', {})
      ).rejects.toThrow('sys_id is required');
    });
  });

  describe('create_now_assist_skill', () => {
    const validArgs = {
      name: 'Test Skill',
      description: 'A test skill',
      input_schema: '{"type": "object"}',
      output_schema: '{"type": "object"}',
      prompt_template: 'Summarize: {{input}}',
    };

    it('creates a skill with correct data', async () => {
      (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({
        sys_id: 'new-skill',
        name: 'Test Skill',
      });

      const result = await executeNowAssistSkillsToolCall(mockClient, 'create_now_assist_skill', validArgs);

      expect(result.message).toContain('created');
      expect(result.skill.sys_id).toBe('new-skill');
      expect(mockClient.createRecord).toHaveBeenCalledWith(
        'sn_now_assist_skill',
        expect.objectContaining({
          name: 'Test Skill',
          active: true,
          prompt_template: 'Summarize: {{input}}',
        })
      );
    });

    it('requires NOW_ASSIST_ENABLED + WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;

      await expect(
        executeNowAssistSkillsToolCall(mockClient, 'create_now_assist_skill', validArgs)
      ).rejects.toThrow('Write operations are disabled');
    });

    it('throws when NOW_ASSIST_ENABLED is not set even with WRITE_ENABLED', async () => {
      delete process.env.NOW_ASSIST_ENABLED;

      await expect(
        executeNowAssistSkillsToolCall(mockClient, 'create_now_assist_skill', validArgs)
      ).rejects.toThrow('Now Assist');
    });

    it('throws when required fields are missing', async () => {
      await expect(
        executeNowAssistSkillsToolCall(mockClient, 'create_now_assist_skill', { name: 'Only name' })
      ).rejects.toThrow('description is required');
    });

    it('includes optional model field when provided', async () => {
      (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'new' });

      await executeNowAssistSkillsToolCall(mockClient, 'create_now_assist_skill', {
        ...validArgs,
        model: 'gpt-5.4',
      });

      expect(mockClient.createRecord).toHaveBeenCalledWith(
        'sn_now_assist_skill',
        expect.objectContaining({ model: 'gpt-5.4' })
      );
    });
  });

  describe('test_now_assist_skill', () => {
    it('calls callNowAssist with correct parameters', async () => {
      (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({
        output: 'Summarized text here',
      });

      const result = await executeNowAssistSkillsToolCall(mockClient, 'test_now_assist_skill', {
        skill_sys_id: 'sk1',
        test_input: { text: 'Long article...' },
      });

      expect(result.skill_sys_id).toBe('sk1');
      expect(result.test_input).toEqual({ text: 'Long article...' });
      expect(result.result.output).toBe('Summarized text here');
      expect(mockClient.callNowAssist).toHaveBeenCalledWith('/api/sn_assist/skill/invoke', {
        skill: 'sk1',
        input: { text: 'Long article...' },
      });
    });

    it('throws when skill_sys_id is missing', async () => {
      await expect(
        executeNowAssistSkillsToolCall(mockClient, 'test_now_assist_skill', {
          test_input: { text: 'test' },
        })
      ).rejects.toThrow('skill_sys_id is required');
    });

    it('throws when test_input is missing', async () => {
      await expect(
        executeNowAssistSkillsToolCall(mockClient, 'test_now_assist_skill', {
          skill_sys_id: 'sk1',
        })
      ).rejects.toThrow('test_input is required');
    });
  });
});
