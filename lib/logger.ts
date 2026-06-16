export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
  durationMs?: number;
}

const MAX_ENTRIES = 300;
// Module-level store: shared within a single serverless instance
const store: LogEntry[] = [];

let _idCounter = 0;

export function addLog(
  level: LogLevel,
  category: string,
  message: string,
  details?: Record<string, unknown>,
  durationMs?: number
): void {
  const entry: LogEntry = {
    id: `${Date.now()}-${++_idCounter}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...(details ? { details } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };

  store.push(entry);
  if (store.length > MAX_ENTRIES) store.shift();

  const prefix = `[${category.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, message, details ?? '');
  else if (level === 'warn') console.warn(prefix, message, details ?? '');
  else console.log(prefix, message);
}

export function getLogs(limit = 100, level?: LogLevel): LogEntry[] {
  const filtered = level ? store.filter((e) => e.level === level) : store;
  return filtered.slice(-limit).reverse();
}

export function clearLogs(): void {
  store.length = 0;
  _idCounter = 0;
}

export function getStats(): { total: number; info: number; warn: number; error: number } {
  return {
    total: store.length,
    info: store.filter((e) => e.level === 'info').length,
    warn: store.filter((e) => e.level === 'warn').length,
    error: store.filter((e) => e.level === 'error').length,
  };
}

// Shorthand
export const log = {
  info: (cat: string, msg: string, d?: Record<string, unknown>, ms?: number) =>
    addLog('info', cat, msg, d, ms),
  warn: (cat: string, msg: string, d?: Record<string, unknown>, ms?: number) =>
    addLog('warn', cat, msg, d, ms),
  error: (cat: string, msg: string, d?: Record<string, unknown>, ms?: number) =>
    addLog('error', cat, msg, d, ms),
};
