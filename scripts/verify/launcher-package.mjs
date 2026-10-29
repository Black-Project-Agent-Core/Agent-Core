import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

assert.equal(process.platform, 'win32', 'Launcher package verification requires Windows.');
const executable = path.resolve(process.argv[2] ?? 'runtime/build/launcher/Agent Core.exe');
assert.ok(statSync(executable).isFile(), 'Expected a published launcher executable.');

// Exercise the existing rejected-helper path before GUI/Core startup, without a shared runtime.
const missingRuntime = path.join(path.dirname(executable), '.no-runtime-for-package-check');
const result = spawnSync(executable, ['--browser-use-transport'], {
  cwd: path.dirname(executable),
  windowsHide: true,
  encoding: 'utf8',
  timeout: 15000,
  maxBuffer: 64 * 1024,
  env: {
    ...process.env,
    DOTNET_ROOT: missingRuntime,
    DOTNET_ROOT_X64: missingRuntime,
    DOTNET_DISABLE_GUI_ERRORS: '1',
    COREHOST_TRACE: '0',
  },
});
assert.ifError(result.error);
assert.equal(result.status, 1, `Launcher did not reach its managed helper: ${result.stderr}`);
assert.equal(result.stderr.trim(), 'BROWSER_OBU_TRANSPORT_FAILED');
assert.equal(result.stdout, '');
console.log(`Launcher package PASS: managed entry point works without a shared .NET runtime (${executable}).`);
