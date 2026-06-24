import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildAgentCard } from '../../src/a2a/agent-card.js';
import { VERSION } from '../../src/utils/version.js';

describe('buildAgentCard', () => {
  const savedApiKey = process.env.NOWAIKIT_API_KEY;
  const savedHost = process.env.HOST;
  const savedPort = process.env.PORT;

  beforeEach(() => {
    delete process.env.NOWAIKIT_API_KEY;
    delete process.env.HOST;
    delete process.env.PORT;
  });

  afterEach(() => {
    // Restore original env
    if (savedApiKey !== undefined) process.env.NOWAIKIT_API_KEY = savedApiKey;
    else delete process.env.NOWAIKIT_API_KEY;
    if (savedHost !== undefined) process.env.HOST = savedHost;
    else delete process.env.HOST;
    if (savedPort !== undefined) process.env.PORT = savedPort;
    else delete process.env.PORT;
  });

  it('returns a valid agent card structure', () => {
    const card = buildAgentCard();

    expect(card).toBeDefined();
    expect(typeof card).toBe('object');
    expect(card.name).toBe('NowAIKit');
    // Version is single-sourced from package.json — assert it matches, not a literal.
    expect(card.version).toBe(VERSION);
    expect(card.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('includes all required fields', () => {
    const card = buildAgentCard();

    expect(card.name).toBeTruthy();
    expect(card.description).toBeTruthy();
    expect(card.url).toBeTruthy();
    expect(card.version).toBeTruthy();
    expect(card.capabilities).toBeDefined();
    expect(card.skills).toBeDefined();
    expect(Array.isArray(card.skills)).toBe(true);
  });

  it('has capabilities with correct shape', () => {
    const card = buildAgentCard();

    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.capabilities.stateTransitionHistory).toBe(true);
  });

  it('has skills count > 0', () => {
    const card = buildAgentCard();

    expect(card.skills.length).toBeGreaterThan(0);
  });

  it('each skill has required fields', () => {
    const card = buildAgentCard();

    for (const skill of card.skills) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(Array.isArray(skill.tags)).toBe(true);
      expect(skill.tags.length).toBeGreaterThan(0);
    }
  });

  it('uses default localhost URL when HOST/PORT not set', () => {
    const card = buildAgentCard();

    expect(card.url).toBe('http://localhost:3000');
  });

  it('uses custom HOST and PORT when set', () => {
    process.env.HOST = '0.0.0.0';
    process.env.PORT = '8080';

    const card = buildAgentCard();

    expect(card.url).toBe('http://0.0.0.0:8080');
  });

  it('authentication shows empty schemes when no API key is set', () => {
    delete process.env.NOWAIKIT_API_KEY;

    const card = buildAgentCard();

    expect(card.authentication.schemes).toEqual([]);
  });

  it('authentication shows bearer scheme when API key is set', () => {
    process.env.NOWAIKIT_API_KEY = 'test-key';

    const card = buildAgentCard();

    expect(card.authentication.schemes).toEqual(['bearer']);
  });

  it('includes default input and output modes', () => {
    const card = buildAgentCard();

    expect(card.defaultInputModes).toContain('text');
    expect(card.defaultOutputModes).toContain('text');
    expect(card.defaultOutputModes).toContain('data');
  });

  it('description mentions ServiceNow', () => {
    const card = buildAgentCard();

    expect(card.description.toLowerCase()).toContain('servicenow');
  });
});
