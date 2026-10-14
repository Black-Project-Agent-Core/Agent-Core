import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15_000,
    maxWorkers: process.platform === 'win32' ? 2 : undefined,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/runtime/**',
      '**/reports/**',
      '**/.worktrees/**',
      '**/stable-release/**',
      '**/SubProject/**',
      '**/DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/**',
      '**/src/ui/**',
      '**/referensi/**',
    ],
  },
});
