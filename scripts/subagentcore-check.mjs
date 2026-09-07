#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Inspection only: no provider calls, key-state writes, or memory DB access.
try {
  const args = process.argv.slice(2);
  if (args.length !== 0 && !(args.length === 2 && args[0] === '--project-root')) {
    throw new Error('Invalid arguments');
  }
  const projectRoot = args.length === 2 ? path.resolve(args[1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { loadSubAgentCoreConfig } = await import('../dist/subagentcore/env.js');
  const { inspectSubAgentCoreReadiness } = await import('../dist/subagentcore/readiness.js');
  const report = inspectSubAgentCoreReadiness(loadSubAgentCoreConfig(process.env, projectRoot), projectRoot);
  console.log(JSON.stringify({
    ...report,
    envFileExists: existsSync(report.envPath),
    source: 'repository .env, with process-environment overrides',
    runtimeReloadVerified: false,
    note: 'This checks configuration only. Restart Agent Core after saving .env; verify live inference separately.',
  }, null, 2));
  process.exitCode = report.configurationReady ? 0 : 2;
} catch {
  // Loader errors can include invalid values: deliberately do not echo them.
  console.log(JSON.stringify({ error: 'SUBAGENTCORE_CHECK_FAILED',
    nextStep: 'Run npm run build, then check the documented .env variable names and values locally.' }));
  process.exitCode = 1;
}
