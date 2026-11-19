// NOWAIKIT_LOG_LEVEL: debug | info (default) | warn | error | silent. Logs go to stderr, which MCP clients
// keep out of the conversation; interactive CLI commands default to warn so their output stays readable.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type Level = keyof typeof LEVELS;
const enabled = (level: Level): boolean => {
  const configured = String(process.env.NOWAIKIT_LOG_LEVEL || 'info').toLowerCase() as Level;
  return LEVELS[level] >= (LEVELS[configured] ?? LEVELS.info);
};

export const logger = {
  debug(message: string, data?: unknown): void {
    if (enabled('debug')) console.error(`[DEBUG] ${message}`, data || '');
  },
  info(message: string, data?: unknown): void {
    if (enabled('info')) console.error(`[INFO] ${message}`, data || '');
  },
  warn(message: string, data?: unknown): void {
    if (enabled('warn')) console.error(`[WARN] ${message}`, data || '');
  },
  error(message: string, error?: unknown): void {
    if (enabled('error')) console.error(`[ERROR] ${message}`, error || '');
  },
};
