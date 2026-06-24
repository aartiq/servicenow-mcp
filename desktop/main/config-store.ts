import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type { InstanceConfig } from './index';

interface AppConfig {
  instances: InstanceConfig[];
  activeInstance?: string;
  theme: 'light' | 'dark' | 'system';
  telemetry: boolean;
  autoUpdate: boolean;
  windowBounds?: { width: number; height: number; x?: number; y?: number };
}

const DEFAULT_CONFIG: AppConfig = {
  instances: [],
  theme: 'system',
  telemetry: false,
  autoUpdate: true,
};

// Fields that contain sensitive data and should be encrypted
const SENSITIVE_INSTANCE_FIELDS: (keyof InstanceConfig)[] = [
  'password', 'clientSecret',
];

const SENSITIVE_SETTINGS_PATH = 'settings.providers'; // nested path in config

// Encryption prefix to identify encrypted values
const ENC_PREFIX = 'enc:';
const ALGORITHM = 'aes-256-gcm';

export class ConfigStore {
  private configPath: string;
  private auditPath: string;
  private config: AppConfig;
  private encKey: Buffer | null = null;

  constructor() {
    const userDataPath = app?.getPath?.('userData') || join(process.env.HOME || process.env.USERPROFILE || '.', '.config', 'nowaikit');
    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true });

    this.configPath = join(userDataPath, 'config.json');
    this.auditPath = join(userDataPath, 'audit.jsonl');

    // Derive encryption key using Electron's safeStorage (OS keychain)
    this.initEncryptionKey();

    this.config = this.load();
  }

  /**
   * Initialize the encryption key.
   * Uses Electron's safeStorage API to store a master key in the OS keychain.
   * Falls back to a randomly generated key file with restrictive permissions.
   */
  private initEncryptionKey(): void {
    const keyDir = join(this.configPath, '..');

    try {
      if (safeStorage.isEncryptionAvailable()) {
        // Use safeStorage to encrypt/decrypt a stable seed in OS keychain
        const keyPath = join(keyDir, '.keyring');
        // Per-installation salt (generated once, stored alongside keyring)
        const saltPath = join(keyDir, '.salt');
        let seed: Buffer;
        let salt: Buffer;

        // Load or generate salt
        // IMPORTANT: existing installations used hardcoded 'nowaikit-salt'.
        // Preserve backward compatibility by using that salt for existing keyring files.
        const isExisting = existsSync(keyPath);
        if (existsSync(saltPath)) {
          salt = readFileSync(saltPath);
        } else if (isExisting) {
          // Existing installation — use old hardcoded salt for backward compatibility
          salt = Buffer.from('nowaikit-salt');
          writeFileSync(saltPath, salt, { mode: 0o600 });
        } else {
          // Fresh installation — use random salt
          salt = randomBytes(16);
          writeFileSync(saltPath, salt, { mode: 0o600 });
        }

        if (isExisting) {
          const encrypted = readFileSync(keyPath);
          const decrypted = safeStorage.decryptString(encrypted);
          seed = decrypted ? Buffer.from(decrypted, 'hex') : randomBytes(32);
        } else {
          seed = randomBytes(32);
          const encrypted = safeStorage.encryptString(seed.toString('hex'));
          writeFileSync(keyPath, encrypted, { mode: 0o600 });
        }

        this.encKey = scryptSync(seed, salt, 32);
      }
    } catch {
      // safeStorage not available (e.g., in tests or very early init)
    }

    // Fallback: use a randomly generated key file (not deterministic from env)
    if (!this.encKey) {
      const fallbackKeyPath = join(keyDir, '.enc_key');
      try {
        if (existsSync(fallbackKeyPath)) {
          this.encKey = readFileSync(fallbackKeyPath);
          if (this.encKey.length !== 32) {
            this.encKey = randomBytes(32);
            writeFileSync(fallbackKeyPath, this.encKey, { mode: 0o600 });
          }
        } else {
          this.encKey = randomBytes(32);
          writeFileSync(fallbackKeyPath, this.encKey, { mode: 0o600 });
        }
      } catch {
        // Last resort: derive from machine identifiers (better than nothing)
        const fallbackSeed = `nowaikit-${process.env.USER || 'default'}-${process.pid}-${Date.now()}`;
        this.encKey = scryptSync(fallbackSeed, randomBytes(16), 32);
        console.warn('[NowAIKit] WARNING: Using ephemeral encryption key. Credentials will not persist across restarts.');
      }
    }
  }

  private encrypt(plaintext: string): string {
    if (!this.encKey || !plaintext) return plaintext;
    try {
      const iv = randomBytes(16);
      const cipher = createCipheriv(ALGORITHM, this.encKey, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const tag = cipher.getAuthTag().toString('hex');
      return `${ENC_PREFIX}${iv.toString('hex')}:${tag}:${encrypted}`;
    } catch (err) {
      console.warn('[NowAIKit] WARNING: Encryption failed, storing value in plaintext:', err instanceof Error ? err.message : 'unknown error');
      return plaintext;
    }
  }

  private decrypt(value: string): string {
    if (!this.encKey || !value || !value.startsWith(ENC_PREFIX)) return value;
    try {
      const data = value.slice(ENC_PREFIX.length);
      const [ivHex, tagHex, encrypted] = data.split(':');
      if (!ivHex || !tagHex || !encrypted) {
        console.warn('[NowAIKit] WARNING: Malformed encrypted value, returning as-is');
        return value;
      }
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = createDecipheriv(ALGORITHM, this.encKey, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.warn('[NowAIKit] WARNING: Decryption failed (key may have changed or value is plaintext):', err instanceof Error ? err.message : 'unknown error');
      return value;
    }
  }

  /**
   * Encrypt sensitive fields in an instance config before saving.
   */
  private encryptInstance(instance: InstanceConfig): InstanceConfig {
    const copy = { ...instance };
    for (const field of SENSITIVE_INSTANCE_FIELDS) {
      const val = copy[field];
      if (typeof val === 'string' && val && !val.startsWith(ENC_PREFIX)) {
        (copy as Record<string, unknown>)[field] = this.encrypt(val);
      }
    }
    return copy;
  }

  /**
   * Decrypt sensitive fields in an instance config after loading.
   */
  private decryptInstance(instance: InstanceConfig): InstanceConfig {
    const copy = { ...instance };
    for (const field of SENSITIVE_INSTANCE_FIELDS) {
      const val = copy[field];
      if (typeof val === 'string' && val?.startsWith(ENC_PREFIX)) {
        (copy as Record<string, unknown>)[field] = this.decrypt(val);
      }
    }
    return copy;
  }

  /**
   * Encrypt API keys in settings.providers before saving.
   */
  private encryptSettings(config: Record<string, unknown>): Record<string, unknown> {
    const settings = config.settings as Record<string, unknown> | undefined;
    if (!settings?.providers) return config;

    const providers = { ...(settings.providers as Record<string, Record<string, unknown>>) };
    for (const [id, provider] of Object.entries(providers)) {
      if (provider.apiKey && typeof provider.apiKey === 'string' && !provider.apiKey.startsWith(ENC_PREFIX)) {
        providers[id] = { ...provider, apiKey: this.encrypt(provider.apiKey) };
      }
    }
    return { ...config, settings: { ...settings, providers } };
  }

  /**
   * Decrypt API keys in settings.providers after loading.
   */
  private decryptSettings(config: Record<string, unknown>): Record<string, unknown> {
    const settings = config.settings as Record<string, unknown> | undefined;
    if (!settings?.providers) return config;

    const providers = { ...(settings.providers as Record<string, Record<string, unknown>>) };
    for (const [id, provider] of Object.entries(providers)) {
      if (provider.apiKey && typeof provider.apiKey === 'string' && provider.apiKey.startsWith(ENC_PREFIX)) {
        providers[id] = { ...provider, apiKey: this.decrypt(provider.apiKey) };
      }
    }
    return { ...config, settings: { ...settings, providers } };
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf8');
        let parsed = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        // Decrypt instances
        if (parsed.instances) {
          parsed.instances = parsed.instances.map((i: InstanceConfig) => this.decryptInstance(i));
        }
        // Decrypt settings (API keys)
        parsed = this.decryptSettings(parsed) as unknown as AppConfig;
        return parsed;
      }
    } catch {
      // Corrupted config, reset
    }
    return { ...DEFAULT_CONFIG };
  }

  private save(): void {
    // Encrypt before writing to disk
    let toSave: Record<string, unknown> = { ...this.config };

    // Encrypt instance passwords
    toSave.instances = (this.config.instances || []).map(i => this.encryptInstance(i));

    // Encrypt settings API keys
    toSave = this.encryptSettings(toSave);

    // Write config with a header note about editing
    const json = JSON.stringify(toSave, null, 2);
    writeFileSync(this.configPath, json, 'utf8');
  }

  get(key: string): unknown {
    return (this.config as unknown as Record<string, unknown>)[key];
  }

  set(key: string, value: unknown): void {
    (this.config as unknown as Record<string, unknown>)[key] = value;
    this.save();
    if (key === 'activeInstance') this.syncToMcpConfig();
  }

  getAll(): AppConfig {
    return { ...this.config };
  }

  // ── Instances ──

  getInstances(): InstanceConfig[] {
    return [...this.config.instances];
  }

  addInstance(instance: InstanceConfig): { success: boolean; error?: string } {
    const existing = this.config.instances.findIndex(i => i.name === instance.name);
    if (existing >= 0) {
      this.config.instances[existing] = instance;
    } else {
      this.config.instances.push(instance);
    }
    if (!this.config.activeInstance) {
      this.config.activeInstance = instance.name;
    }
    this.save();
    this.syncToMcpConfig();
    return { success: true };
  }

  removeInstance(name: string): { success: boolean; error?: string } {
    const idx = this.config.instances.findIndex(i => i.name === name);
    if (idx < 0) return { success: false, error: `Instance "${name}" not found` };
    this.config.instances.splice(idx, 1);
    if (this.config.activeInstance === name) {
      this.config.activeInstance = this.config.instances[0]?.name;
    }
    this.save();
    this.syncToMcpConfig();
    return { success: true };
  }

  // ── MCP Config Sync ──
  // The MCP server reads ~/.config/nowaikit/instances.json (with `defaultInstance` key).
  // The desktop app uses its own config.json (with `activeInstance` key).
  // This method syncs desktop state → instances.json so the MCP server stays in sync.

  private syncToMcpConfig(): void {
    try {
      const mcpPath = join(this.configPath, '..', 'instances.json');
      const instances: Record<string, Record<string, unknown>> = {};
      for (const inst of this.config.instances) {
        const raw = inst as unknown as Record<string, unknown>;
        const pwd = typeof inst.password === 'string' ? this.decrypt(inst.password) : undefined;
        const secret = typeof inst.clientSecret === 'string' ? this.decrypt(inst.clientSecret) : undefined;
        instances[inst.name] = {
          name: inst.name,
          instanceUrl: inst.instanceUrl,
          authMethod: inst.authMethod || 'basic',
          username: inst.username,
          password: pwd,
          clientId: inst.clientId,
          clientSecret: secret,
          writeEnabled: inst.writeEnabled ?? true,
          addedAt: raw.addedAt || new Date().toISOString(),
        };
      }
      const mcpConfig = {
        version: 1,
        defaultInstance: this.config.activeInstance || this.config.instances[0]?.name || '',
        instances,
      };
      writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf8');
    } catch {
      // Non-critical — MCP config sync is best-effort
    }
  }

  // ── Audit Log ──

  private static readonly MAX_AUDIT_SIZE = 5 * 1024 * 1024; // 5MB

  appendAuditLog(entry: Record<string, unknown>): void {
    try {
      // Sanitize error messages before writing to audit log
      if (typeof entry.error === 'string') {
        entry.error = entry.error
          .replace(/sk-ant-[a-zA-Z0-9_-]+/g, 'sk-ant-***')
          .replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***')
          .replace(/AIza[a-zA-Z0-9_-]+/g, 'AIza***')
          .replace(/gsk_[a-zA-Z0-9_-]+/g, 'gsk_***')
          .replace(/sk-or-[a-zA-Z0-9_-]+/g, 'sk-or-***')
          .replace(/key=[^&\s]+/g, 'key=***');
      }
      appendFileSync(this.auditPath, JSON.stringify(entry) + '\n', 'utf8');

      // Rotate log if it exceeds max size
      this.rotateAuditLogIfNeeded();
    } catch {
      // Ignore write errors
    }
  }

  private rotateAuditLogIfNeeded(): void {
    try {
      const { statSync } = require('fs');
      const stats = statSync(this.auditPath);
      if (stats.size > ConfigStore.MAX_AUDIT_SIZE) {
        // Keep the most recent half of the file
        const content = readFileSync(this.auditPath, 'utf8');
        const lines = content.trim().split('\n');
        const keepFrom = Math.floor(lines.length / 2);
        writeFileSync(this.auditPath, lines.slice(keepFrom).join('\n') + '\n', 'utf8');
      }
    } catch {
      // Ignore rotation errors
    }
  }

  getAuditLogs(limit: number): Array<Record<string, unknown>> {
    try {
      if (!existsSync(this.auditPath)) return [];
      const lines = readFileSync(this.auditPath, 'utf8').trim().split('\n').filter(Boolean);
      return lines
        .slice(-limit)
        .reverse()
        .map(line => {
          try { return JSON.parse(line); }
          catch { return { raw: line }; }
        });
    } catch {
      return [];
    }
  }
}
