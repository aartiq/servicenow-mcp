/**
 * Loads `.env` and applies the documented config aliases. It must be the first import of every entry
 * point: ES modules evaluate imports before the importing file's body, and the instance manager reads
 * its configuration when it is first imported.
 */
import dotenv from 'dotenv';
import { applyCompatAliases } from './utils/compat.js';

// quiet: suppress dotenv v17+ startup banner (keeps MCP stdio + CLI output clean)
dotenv.config({ quiet: true });

/** Notes from alias handling (e.g. unknown persona), logged by the server once its logger is up. */
export const compatNotes = applyCompatAliases();
