import { defineConfig } from 'vitest/config';

const windowsOnlyExcludes = process.platform === 'win32'
  ? [
      '**/plugin/codespace/tests/**',
      '**/tests/codespace-lifecycle-lock.test.ts',
      '**/tests/codespace-memory-hydration.test.ts',
      '**/tests/codespace-port-visibility-recovery.test.ts',
      '**/tests/codespace-public-readiness-recovery.test.ts',
      '**/tests/codespace-shared-memory-cross-session.acceptance.test.ts',
    ]
  : [];

export default defineConfig({
  test: {
    testTimeout: 15_000,
    maxWorkers: process.platform === 'win32' ? 2 : undefined,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/runtime/**',
      '**/.worktrees/**',
      '**/stable-release/**',
      '**/SubProject/**',
      '**/referensi/**',
      ...windowsOnlyExcludes,
    ],
  },
});
