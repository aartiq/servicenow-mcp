export const logger = {
  debug(message: string, data?: unknown): void {
    console.error(`[DEBUG] ${message}`, data || '');
  },
  info(message: string, data?: unknown): void {
    console.error(`[INFO] ${message}`, data || '');
  },
  warn(message: string, data?: unknown): void {
    console.error(`[WARN] ${message}`, data || '');
  },
  error(message: string, error?: unknown): void {
    console.error(`[ERROR] ${message}`, error || '');
  },
};
