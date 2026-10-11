import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ToolHistory } from '../src/rdc/utils/toolHistory.js';

it('keeps browser screenshots out of both in-memory and persisted tool history', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'browser-history-fixture-'));
  const history = new ToolHistory(root);
  const pixels = Buffer.from('private screenshot fixture').toString('base64');
  try {
    history.addCall('browser_control', { action: 'observe', screenshot: {} }, {
      content: [{ type: 'text', text: '{"capture":{"captureId":"fixture"}}' },
        { type: 'image', mimeType: 'image/jpeg', data: pixels }],
    });
    const records = history.getRecentCalls({ toolName: 'browser_control' });
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain(pixels);
    expect(records[0]?.capture?.disposition).toBe('metadata-only');
    await history.cleanup();
    const files = await readdir(root);
    for (const name of files) expect(await readFile(path.join(root, name), 'utf8')).not.toContain(pixels);
  } finally {
    await history.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});
