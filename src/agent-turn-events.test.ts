import { describe, expect, it } from 'vitest';
import { summarizeToolArgs } from './agent-turn-events.js';

describe('summarizeToolArgs', () => {
  it('renders a one-line key=value summary', () => {
    expect(summarizeToolArgs({ path: 'src/a.ts', offset: 5 })).toBe('path="src/a.ts" offset=5');
  });

  it('truncates to 80 characters', () => {
    const summary = summarizeToolArgs({ command: 'x'.repeat(300) });
    expect(summary).toHaveLength(80);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('masks values whose key names a secret, including nested keys', () => {
    const summary = summarizeToolArgs({ path: 'ok', apiKey: 'sk-live-123', token: 'abc', Password: 'p', cookie: 'c' });
    expect(summary).toBe('path="ok" apiKey=*** token=*** Password=*** cookie=***');
    expect(summarizeToolArgs({ client_secret: 's', authorization: 'Bearer z' })).toBe('client_secret=*** authorization=***');
    const nested = summarizeToolArgs({ headers: { Authorization: 'Bearer nested', accept: 'json' } });
    expect(nested).toBe('headers={"Authorization":"***","accept":"json"}');
  });

  it('collapses newlines and tolerates non-object input', () => {
    expect(summarizeToolArgs({ text: 'a\nb\tc' })).not.toMatch(/[\n\t]/);
    expect(summarizeToolArgs(undefined)).toBe('');
    expect(summarizeToolArgs('plain')).toBe('"plain"');
  });
});
