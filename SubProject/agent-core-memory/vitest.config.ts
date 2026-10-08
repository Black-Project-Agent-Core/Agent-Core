import { defineConfig } from 'vitest/config';

// Filesystem transaction/recovery suites fsync many small files. Nine default
// workers on the Linux verifier caused existing 5s tests to time out under I/O
// contention; bound scheduling without weakening any test's timeout/assertions.
export default defineConfig({ test: { maxWorkers: 2 } });
