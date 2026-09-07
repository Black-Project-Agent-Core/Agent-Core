import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vitest discovery boundaries', () => {
  it('excludes root-level stable release artifacts and allows bounded headroom for parallel integration tests', async () => {
    const config = await readFile(path.resolve('vitest.config.ts'), 'utf8');
    expect(config).toContain("'**/stable-release/**'");
    expect(config).toContain("'**/SubProject/**'");
    expect(config).toContain("'**/referensi/**'");
    expect(config).toContain('testTimeout: 15_000');
    expect(config).toContain("process.platform === 'win32'");
    expect(config).toContain("'**/plugin/codespace/tests/**'");
    expect(config).toContain("'**/tests/codespace-lifecycle-lock.test.ts'");
    expect(config).toContain("'**/tests/codespace-memory-hydration.test.ts'");
    expect(config).toContain("'**/tests/codespace-port-visibility-recovery.test.ts'");
    expect(config).toContain("'**/tests/codespace-public-readiness-recovery.test.ts'");
    expect(config).toContain("'**/tests/codespace-shared-memory-cross-session.acceptance.test.ts'");
    expect(config).toContain('maxWorkers: process.platform === \'win32\' ? 2 : undefined');
  });
});
