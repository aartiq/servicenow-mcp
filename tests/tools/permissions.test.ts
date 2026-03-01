import { describe, it, expect, beforeEach } from 'vitest';
import {
  requireWrite,
  requireCmdbWrite,
  requireScripting,
  requireNowAssist,
  requireAtf,
  isWriteEnabled,
  isCmdbWriteEnabled,
  isScriptingEnabled,
  isNowAssistEnabled,
  isAtfEnabled,
} from '../../src/utils/permissions.js';

describe('requireWrite', () => {
  beforeEach(() => { delete process.env.WRITE_ENABLED; });

  it('throws when WRITE_ENABLED is not set', () => {
    expect(() => requireWrite()).toThrow('Write operations are disabled');
  });

  it('passes when WRITE_ENABLED=true', () => {
    process.env.WRITE_ENABLED = 'true';
    expect(() => requireWrite()).not.toThrow();
  });

  it('throws when WRITE_ENABLED=false', () => {
    process.env.WRITE_ENABLED = 'false';
    expect(() => requireWrite()).toThrow();
  });
});

describe('requireCmdbWrite', () => {
  beforeEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.CMDB_WRITE_ENABLED;
  });

  it('throws when only WRITE_ENABLED=true but CMDB_WRITE_ENABLED not set', () => {
    process.env.WRITE_ENABLED = 'true';
    expect(() => requireCmdbWrite()).toThrow('CMDB write operations are disabled');
  });

  it('passes when both are true', () => {
    process.env.WRITE_ENABLED = 'true';
    process.env.CMDB_WRITE_ENABLED = 'true';
    expect(() => requireCmdbWrite()).not.toThrow();
  });
});

describe('requireScripting', () => {
  beforeEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('throws when SCRIPTING_ENABLED not set', () => {
    process.env.WRITE_ENABLED = 'true';
    expect(() => requireScripting()).toThrow('Scripting operations are disabled');
  });

  it('passes when both are true', () => {
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
    expect(() => requireScripting()).not.toThrow();
  });
});

describe('requireNowAssist', () => {
  beforeEach(() => { delete process.env.NOW_ASSIST_ENABLED; });

  it('throws when NOW_ASSIST_ENABLED not set', () => {
    expect(() => requireNowAssist()).toThrow('Now Assist / AI features are disabled');
  });

  it('passes when NOW_ASSIST_ENABLED=true', () => {
    process.env.NOW_ASSIST_ENABLED = 'true';
    expect(() => requireNowAssist()).not.toThrow();
  });
});

describe('requireAtf', () => {
  beforeEach(() => { delete process.env.ATF_ENABLED; });

  it('throws when ATF_ENABLED not set', () => {
    expect(() => requireAtf()).toThrow('ATF test execution is disabled');
  });

  it('passes when ATF_ENABLED=true', () => {
    process.env.ATF_ENABLED = 'true';
    expect(() => requireAtf()).not.toThrow();
  });
});

describe('flag helpers', () => {
  beforeEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.CMDB_WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
    delete process.env.NOW_ASSIST_ENABLED;
    delete process.env.ATF_ENABLED;
  });

  it('isWriteEnabled returns false by default', () => {
    expect(isWriteEnabled()).toBe(false);
  });

  it('isCmdbWriteEnabled requires both flags', () => {
    process.env.WRITE_ENABLED = 'true';
    expect(isCmdbWriteEnabled()).toBe(false);
    process.env.CMDB_WRITE_ENABLED = 'true';
    expect(isCmdbWriteEnabled()).toBe(true);
  });

  it('isScriptingEnabled requires both flags', () => {
    process.env.WRITE_ENABLED = 'true';
    expect(isScriptingEnabled()).toBe(false);
    process.env.SCRIPTING_ENABLED = 'true';
    expect(isScriptingEnabled()).toBe(true);
  });

  it('isNowAssistEnabled returns correct value', () => {
    expect(isNowAssistEnabled()).toBe(false);
    process.env.NOW_ASSIST_ENABLED = 'true';
    expect(isNowAssistEnabled()).toBe(true);
  });

  it('isAtfEnabled returns correct value', () => {
    expect(isAtfEnabled()).toBe(false);
    process.env.ATF_ENABLED = 'true';
    expect(isAtfEnabled()).toBe(true);
  });
});
