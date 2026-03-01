#!/usr/bin/env node
/**
 * Extract all tool definitions to a static JSON manifest.
 * Run after `npm run build` in root: node scripts/extract-tools.mjs
 * Output: dist/tools-manifest.json
 */
import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distTools = join(__dirname, '..', 'dist', 'tools', 'index.js');

const { getTools } = await import(pathToFileURL(distTools).href);
const tools = getTools();

const manifest = tools.map(t => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
}));

const outPath = join(__dirname, '..', 'dist', 'tools-manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`Extracted ${manifest.length} tools → dist/tools-manifest.json`);
