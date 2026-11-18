import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InstanceManager } from '../../src/servicenow/instances.js';

/** Restore env in place. Reassigning process.env detaches it from the real environment (os.homedir() etc.). */
function restoreEnv(saved: NodeJS.ProcessEnv) {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
}


/**
 * SN_DEFAULT_INSTANCE must pick the starting instance no matter where the instances came from.
 * Regression: both config-file loaders returned before the env var was checked, so a query meant
 * for one instance silently ran against the file's default (e.g. demo2).
 */
const SCRUB = /^(SN_|SERVICENOW_|WRITE_ENABLED|SCRIPTING_ENABLED|CMDB_WRITE_ENABLED|ATF_ENABLED|NOW_ASSIST_ENABLED|HOME$)/;

const wizardFile = {
  defaultInstance: 'demo2',
  instances: {
    demo2: { instanceUrl: 'https://demo2.example.service-now.com', authMethod: 'basic', username: 'u', password: 'p', writeEnabled: true, scriptingEnabled: true },
    MRE: { instanceUrl: 'https://mre.example.service-now.com', authMethod: 'basic', username: 'u', password: 'p', writeEnabled: false, scriptingEnabled: false },
  },
};

describe('SN_DEFAULT_INSTANCE', () => {
  const saved = { ...process.env };
  let home: string;

  beforeEach(async () => {
    for (const k of Object.keys(process.env)) if (SCRUB.test(k)) delete process.env[k];
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'nwk-home-'));
    process.env.HOME = home;
    process.env.USERPROFILE = home; // Windows homedir()
  });
  afterEach(async () => {
    restoreEnv(saved);
    vi.restoreAllMocks();
    await fs.rm(home, { recursive: true, force: true });
  });

  const writeWizard = (data: object) => {
    const dir = path.join(home, '.config', 'nowaikit');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'instances.json'), JSON.stringify(data));
  };

  describe('global ~/.config/nowaikit/instances.json', () => {
    it('uses the file default when SN_DEFAULT_INSTANCE is not set', () => {
      writeWizard(wizardFile);
      expect(new InstanceManager().getCurrentName()).toBe('demo2');
    });

    it('SN_DEFAULT_INSTANCE overrides the file default (case-insensitive)', () => {
      writeWizard(wizardFile);
      process.env.SN_DEFAULT_INSTANCE = 'mre';
      expect(new InstanceManager().getCurrentName()).toBe('MRE');
    });

    it('permission flags follow the chosen instance, not the file default', () => {
      writeWizard(wizardFile);
      process.env.SN_DEFAULT_INSTANCE = 'MRE';
      new InstanceManager();
      expect(process.env.WRITE_ENABLED).toBe('false');
      expect(process.env.SCRIPTING_ENABLED).toBe('false');
    });

    it('an unknown SN_DEFAULT_INSTANCE warns and falls back to the file default', () => {
      writeWizard(wizardFile);
      process.env.SN_DEFAULT_INSTANCE = 'nope';
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      expect(new InstanceManager().getCurrentName()).toBe('demo2');
      expect(String(err.mock.calls[0]?.[0])).toMatch(/SN_DEFAULT_INSTANCE="nope" does not match/);
    });
  });

  describe('SN_INSTANCES_CONFIG file', () => {
    it('SN_DEFAULT_INSTANCE overrides the file default here too', async () => {
      const f = path.join(home, 'project-instances.json');
      writeFileSync(f, JSON.stringify({
        default_instance: 'demo2',
        instances: {
          demo2: { instance_url: 'https://demo2.example.service-now.com', auth_method: 'basic', username: 'u', password: 'p' },
          mre: { instance_url: 'https://mre.example.service-now.com', auth_method: 'basic', username: 'u', password: 'p' },
        },
      }));
      process.env.SN_INSTANCES_CONFIG = f;
      expect(new InstanceManager().getCurrentName()).toBe('demo2');
      process.env.SN_DEFAULT_INSTANCE = 'MRE';
      expect(new InstanceManager().getCurrentName()).toBe('mre');
    });
  });

  describe('SN_INSTANCE_<NAME>_URL env groups', () => {
    it('still honours SN_DEFAULT_INSTANCE', () => {
      process.env.SN_INSTANCE_DEMO2_URL = 'https://demo2.example.service-now.com';
      process.env.SN_INSTANCE_MRE_URL = 'https://mre.example.service-now.com';
      process.env.SN_DEFAULT_INSTANCE = 'mre';
      expect(new InstanceManager().getCurrentName()).toBe('mre');
    });
  });
});
