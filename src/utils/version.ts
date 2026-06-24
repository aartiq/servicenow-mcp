/**
 * Single source of truth for the package version.
 * Reads version from package.json at runtime so server.ts, transport,
 * a2a agent card, and dashboard never drift from package.json again.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const SERVER_NAME = 'nowaikit';

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/utils/version.js -> ../../package.json  (project root)
    const pkgPath = resolve(here, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // fall through to default
  }
  return '0.0.0';
}

export const VERSION = readVersion();
