/**
 * Token-efficient tool output for the model.
 *
 * Tool handlers return the raw ServiceNow shapes (programmatic callers and the views rely on them).
 * What goes to the model is compacted here, because every token in a tool result is paid for on every
 * later turn of the conversation:
 * - compact JSON, no indentation
 * - `{display_value, value}` pairs collapse to one value when they are the same, and `link` URLs go
 *   (a reference link is just the instance URL plus the sys_id that is still there)
 * Nothing is removed: every field and value the tool returned is still in the text.
 * Set NOWAIKIT_COMPACT_OUTPUT=false to get the previous pretty-printed output.
 */

type Json = unknown;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A ServiceNow field as returned with sysparm_display_value=all, or a reference with a link. */
function collapseField(v: Record<string, unknown>): Json | undefined {
  const keys = Object.keys(v);
  if (!keys.length || keys.some((k) => k !== 'display_value' && k !== 'value' && k !== 'link')) return undefined;
  if (!('value' in v) && !('display_value' in v)) return undefined;
  const value = v.value ?? '';
  const display = v.display_value ?? '';
  if (display === '' || display === null || display === value) return value;
  if (value === '' || value === null) return display;
  return { value, display };
}

export function compactValue(v: Json): Json {
  if (Array.isArray(v)) return v.map((x) => compactValue(x));
  if (!isPlainObject(v)) return v;
  const collapsed = collapseField(v);
  if (collapsed !== undefined) return collapsed;
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(v)) out[k] = compactValue(raw);
  return out;
}

export function compactOutputEnabled(): boolean {
  return !/^(false|0|off|no)$/i.test(process.env.NOWAIKIT_COMPACT_OUTPUT || '');
}

/** The text the model reads for a tool result. */
export function modelText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (!compactOutputEnabled()) return JSON.stringify(result, null, 2);
  return JSON.stringify(compactValue(result));
}
