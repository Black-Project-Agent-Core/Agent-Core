import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import PizZip from 'pizzip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHA256 = '341e323661d82e991616fe1551ed6c132774669967c77c2983aaa00f6818a590';
const sourceArg = process.argv.indexOf('--source');
if (sourceArg < 0 || !process.argv[sourceArg + 1]) throw new Error('--source must identify Browser Bridge v0.2.0 Source.zip');
const source = path.resolve(process.argv[sourceArg + 1]);
const bytes = await readFile(source);
const digest = createHash('sha256').update(bytes).digest('hex');
if (digest !== SHA256) throw new Error('Donor archive hash mismatch; do not substitute a different contract');
const output = path.join(ROOT, 'runtime', 'build', 'browser-bridge-v020');
const scratch = path.join(ROOT, 'runtime', 'browser-control');
await mkdir(output, { recursive: true });
await mkdir(scratch, { recursive: true });
const fixture = await mkdtemp(path.join(scratch, 'v020-fixture-'));
const entries = ['DELIVERY.md', 'INTEGRATION.md', 'README.md', 'conversation.js', 'manifest.json',
  'package.json', 'popup.html', 'popup.js', 'protocol.js', 'worker.js',
  'tests/conversation.test.js', 'tests/stale-session.test.js', 'tests/worker.test.js'];
const archive = new PizZip(bytes);
const results = [];
async function run(label, args, cwd = ROOT, env = {}) {
  let transcript = '';
  const child = spawn(process.execPath, args, {
    cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    transcript += chunk; process.stdout.write(chunk);
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', resolve);
  });
  await writeFile(path.join(output, label + '.log'), transcript);
  results.push({ label, exitCode });
  return exitCode;
}
try {
  for (const entry of entries) {
    const member = archive.file('agent-core-browser-bridge/' + entry);
    if (!member) throw new Error('Required donor member missing: ' + entry);
    const destination = path.join(fixture, entry);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, member.asNodeBuffer());
  }
  const donor = await run('donor-tests', ['--test', ...entries.filter(e => e.startsWith('tests/'))], fixture);
  const integration = await run('server-extension-tests', [
    'node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=1',
    'tests/browser-conversation-integration.test.ts',
    'tests/browser-extension-bridge.test.ts', 'tests/browser-extension-worker.test.ts',
    'tests/browser-extension-protocol.test.ts', 'tests/mcp-manifest-contract.test.ts',
  ], ROOT, { AGENT_CORE_BROWSER_BRIDGE_FIXTURE: fixture });
  const evidence = { donorVersion: '0.2.0', donorSha256: digest, at: new Date().toISOString(),
    fixtureOnly: true, realBrowserSendTested: false, results };
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n');
  process.exitCode = donor || integration ? 1 : 0;
} finally {
  // Only this invocation's freshly allocated fixture directory is removed.
  await rm(fixture, { recursive: true, force: true });
}
