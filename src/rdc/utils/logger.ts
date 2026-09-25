export type LogLevel = 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';

export function log(level: LogLevel, message: string, data?: any): void {
  const suffix = data === undefined ? '' : ` ${JSON.stringify(data)}`;
  process.stderr.write(`[${level}] ${message}${suffix}\n`);
}

export const logger = {
  emergency: (message: string, data?: any) => log('emergency', message, data),
  alert: (message: string, data?: any) => log('alert', message, data),
  critical: (message: string, data?: any) => log('critical', message, data),
  error: (message: string, data?: any) => log('error', message, data),
  warning: (message: string, data?: any) => log('warning', message, data),
  notice: (message: string, data?: any) => log('notice', message, data),
  info: (message: string, data?: any) => log('info', message, data),
  debug: (message: string, data?: any) => log('debug', message, data),
};

export function logToStderr(level: LogLevel, message: string): void {
  log(level, message);
}
