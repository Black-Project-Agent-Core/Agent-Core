import { symlinkOrSkip } from '../helpers/optional-symlink.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import PizZip from 'pizzip';
import { afterEach, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(root, 'scripts/memory/outcome/package-memory-outcome.mjs');
const temporary: string[] = [];
const hash = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const traceDefinition = 'toolCalls counts scripted harness/owner operations, not model-issued tools; verification-only ranking operations included';
const traceFor = (row: any) => ({ runId: row.runId, definition: traceDefinition, operations: ['capture-persist', 'restart-recall', 'action-verification', 'receipt-review'].map(operation => ({ operation, status: 'success' })) });
const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
afterEach(async () => { for (const dir of temporary.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });
async function temp() { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'outcome-bundle-test-')); temporary.push(dir); return dir; }
async function load(): Promise<any> {
  const exists = await fs.stat(modulePath).then(() => true, () => false);
  expect(exists, 'Task 6 outcome packager is implemented').toBe(true);
  return import(/* @vite-ignore */ pathToFileURL(modulePath).href);
}
async function archive(zip: PizZip) {
  const dir = await temp(), file = path.join(dir, 'bundle.zip');
  const bytes = zip.generate({ type: 'nodebuffer', platform: 'UNIX' });
  await fs.writeFile(file, bytes); await fs.writeFile(file + '.sha256', hash(bytes) + '\n');
  return { dir, file, bytes };
}

it('rejects missing mandatory members before publishing a ZIP', async () => {
  const m = await load(), dir = await temp(), output = path.join(await temp(), 'outcome.zip');
  await expect(m.packageOutcomeBundle(dir, output)).rejects.toThrow('MISSING_OUTCOME_MEMBER');
  expect(await fs.stat(output).then(() => true, () => false)).toBe(false);
});
it('rejects a symlink report root without reading its contents', async context => {
  const m = await load(), dir = await temp(), report = path.join(dir, 'report');
  await symlinkOrSkip(context, dir, report, 'dir');
  await expect(m.packageOutcomeBundle(report, path.join(dir, 'outcome.zip'))).rejects.toThrow('INVALID_OUTCOME_DIRECTORY');
});
it('rejects prohibited source members rather than copying private files', async () => {
  const m = await load(), dir = await temp();
  await fs.writeFile(path.join(dir, '.env'), 'synthetic-placeholder');
  await expect(m.packageOutcomeBundle(dir, path.join(await temp(), 'outcome.zip'))).rejects.toThrow('UNSAFE_OUTCOME_MEMBER');
});
it('rejects source evidence symlinks without following them', async context => {
  const m = await load(), dir = await temp();
  await fs.mkdir(path.join(dir, 'evidence')); await fs.writeFile(path.join(dir, 'outside.txt'), 'synthetic');
  await symlinkOrSkip(context, path.join(dir, 'outside.txt'), path.join(dir, 'evidence/a.txt'), 'file');
  await fs.unlink(path.join(dir, 'outside.txt'));
  await expect(m.packageOutcomeBundle(dir, path.join(await temp(), 'outcome.zip'))).rejects.toThrow('NONREGULAR_OUTCOME_MEMBER');
});
it('rejects ZIP traversal before extraction', async () => {
  const m = await load(), zip = new PizZip(); zip.file('../../escape.txt', 'synthetic', { createFolders: false });
  const f = await archive(zip);
  await expect(m.verifyOutcomeBundle(f.file)).rejects.toThrow('UNSAFE_ZIP_MEMBER');
  expect(await fs.stat(path.join(f.dir, 'escape.txt')).then(() => true, () => false)).toBe(false);
});
it('rejects ZIP symlink entries even when their names are safe', async () => {
  const m = await load(), zip = new PizZip();
  zip.file('evidence/a.txt', '/outside', { createFolders: false, unixPermissions: 0o120777 });
  const f = await archive(zip);
  await expect(m.verifyOutcomeBundle(f.file)).rejects.toThrow('NONREGULAR_ZIP_MEMBER');
});
it('detects duplicate ZIP names before trusting the manifest', async () => {
  const m = await load(), zip = new PizZip();
  zip.file('evidence/a.txt', 'one', { createFolders: false }); zip.file('evidence/b.txt', 'two', { createFolders: false });
  const f = await archive(zip), bytes = Buffer.from(f.bytes);
  for (let at = bytes.indexOf('evidence/b.txt'); at !== -1; at = bytes.indexOf('evidence/b.txt', at + 1)) bytes.write('evidence/a.txt', at);
  await fs.writeFile(f.file, bytes); await fs.writeFile(f.file + '.sha256', hash(bytes) + '\n');
  await expect(m.verifyOutcomeBundle(f.file)).rejects.toThrow('DUPLICATE_ZIP_MEMBER');
});
it('rejects a truncated ZIP even with an updated ZIP checksum', async () => {
  const m = await load(), zip = new PizZip(); zip.file('report/report.json', '{}', { createFolders: false });
  const f = await archive(zip), bytes = f.bytes.subarray(0, f.bytes.length - 15);
  await fs.writeFile(f.file, bytes); await fs.writeFile(f.file + '.sha256', hash(bytes) + '\n');
  await expect(m.verifyOutcomeBundle(f.file)).rejects.toThrow('INVALID_OUTCOME_ZIP');
});
it('rejects a changed ZIP checksum', async () => {
  const m = await load(), zip = new PizZip(); zip.file('report/report.json', '{}', { createFolders: false });
  const f = await archive(zip); await fs.writeFile(f.file + '.sha256', 'sha256:' + '0'.repeat(64) + '\n');
  await expect(m.verifyOutcomeBundle(f.file)).rejects.toThrow('OUTCOME_ZIP_DIGEST_MISMATCH');
});

async function outcomeReport() {
  const m = await load(), dir = await temp(), reportDir = path.join(dir, 'report-source'), output = path.join(dir, 'outcome.zip');
  const scorer = await import('../../src/memory/outcome/evaluation.js').catch(() => ({}));
  expect(scorer, 'independent real outcome scorer is implemented').toHaveProperty('evaluateOutcome');
  const suite = JSON.parse(await fs.readFile(path.join(root, 'tests/memory/fixtures/memory-outcome-v2/suite.json'), 'utf8'));
  const valueHash = (value: unknown) => hash(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
  const rows: any[] = [];
  for (const c of suite.cases.filter((item: any) => item.partition === 'heldout')) for (const controller of ['native', 'external']) for (const arm of ['off', 'current']) {
    const runId = `${c.id}:${controller}:${arm}`, slug = runId.replaceAll(':', '-');
    const artifactText = c.domain === 'engineering'
      ? 'rows => [...new Set(rows.map(r=>r.key))].sort().flatMap(key=>{const r=rows.filter(r=>r.key===key).sort((a,b)=>b.sequence-a.sequence)[0];return r.deleted?[]:[{key,value:r.value}];})'
      : JSON.stringify(c.oracle.facts.map((fact: any) => ({ key: fact.key, value: fact.value, source: fact.source, contradictions: fact.supersedes ?? [] })));
    const verification = { taskId: runId, artifactDigest: valueHash(artifactText), oracleDigest: c.oracleDigest, verdict: 'pass', unsupportedClaims: 0 };
    const artifactRef = `artifact:evidence/${slug}.answer.txt#${valueHash(artifactText)}`;
    const verificationRef = `verification:evidence/${slug}.verification.json#${valueHash(verification)}`;
    rows.push({ runId, caseId: c.id, arm, controller, taskId: runId,
      hashes: { inputDigest: c.inputDigest, oracleDigest: c.oracleDigest, seedDigest: c.seedDigest, configDigest: c.configDigest,
        sourceRevision: suite.sourceRevisions.current, rootDistDigest: valueHash('root-dist'), memoryDistDigest: valueHash('memory-dist'), activationDigest: valueHash('activation') },
      adapter: { engineMode: 'experience-v2', activation: 'synthetic-v2', policy: 'baseline-v1', factoryRevision: 'scripted-fixture', selected: [] },
      artifactRef, verificationRef, receiptRefs: [], correct: true, violations: { scopeLeaks: 0, staleTrust: 0, unsupportedSuccess: 0 },
      lifecycle: { capture: true, persist: true, restart: true, recall: true, action: true, verification: true, receipt: true, review: true, compliant: true, harnessRecovered: false },
      latencyMs: { retrieval: 1, total: 2 }, counters: { toolCalls: 4, repeatedFailures: 0, injectedBytes: 0, injectedTokenEstimate: 0, inferenceCalls: 0 },
      usage: null, cost: null, evidence: { artifactText, verification, receipts: [] } });
  }
  const report = (scorer as any).evaluateOutcome(suite, rows);
  async function write(name: string, content: Uint8Array) { const file = path.join(reportDir, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content); }
  await write('fixtures/suite.json', json(suite));
  for (const c of suite.cases) await write(`fixtures/oracles/${c.id}.json`, json(c.oracle));
  if (suite.preregistration !== null) await write('fixtures/preregistration.json', json(suite.preregistration));
  await write('results/observations.json', json(rows)); await write('report/report.json', json(report));
  await write('logs/commands.json', json([{ command: 'synthetic-fixture-report', status: 'PASS', exitCode: 0 }])); await write('patch/changes.patch', Buffer.from('Synthetic test fixture; no source mutations.\n'));
  for (const row of rows) {
    await write(row.artifactRef.split(':').slice(1).join(':').split('#')[0], Buffer.from(row.evidence.artifactText));
    await write(row.verificationRef.split(':').slice(1).join(':').split('#')[0], json(row.evidence.verification));
    await write('evidence/' + row.runId.replaceAll(':', '-') + '-trace.json', json(traceFor(row)));
  }
  return { m, dir, reportDir, output, suite, rows, report, write };
}
async function changeArchive(file: string, change: (zip: PizZip) => void) {
  const zip = new PizZip(await fs.readFile(file)); change(zip);
  const content = zip.generate({ type: 'nodebuffer', platform: 'UNIX' });
  await fs.writeFile(file, content); await fs.writeFile(file + '.sha256', hash(content) + '\n');
}
it('packages all members, checks manifest bytes/digests and recomputes after fresh extraction', async () => {
  const f = await outcomeReport(), packaged = await f.m.packageOutcomeBundle(f.reportDir, f.output);
  expect(packaged).toMatchObject({ complete: true, sha256: hash(await fs.readFile(f.output)) });
  const replay = await f.m.verifyOutcomeBundle(f.output); expect(replay.complete).toBe(true);
  expect(replay.report).toEqual(f.report); expect(replay.report.benefitProven).toBe(false);
  const archive = new PizZip(await fs.readFile(f.output));
  for (const member of replay.manifest.members) {
    const content = archive.file(member.name)!.asNodeBuffer(); expect(content.length).toBe(member.bytes); expect(hash(content)).toBe(member.digest);
  }
  expect(replay.manifest.members.map((member: any) => member.name)).toContain('patch/changes.patch');
  expect(await fs.readFile(f.output + '.sha256', 'utf8')).toBe(packaged.sha256 + '\n');
});
it('does not impose an arbitrary evidence-file count limit', async () => {
  const f = await outcomeReport(), slug = f.rows[0].runId.replaceAll(':', '-');
  for (let i = 0; i < 300; i++) await f.write(`evidence/${slug}.log-${i}.txt`, Buffer.from(`Synthetic log ${i}.\n`));
  const result = await f.m.packageOutcomeBundle(f.reportDir, f.output); expect(result.complete).toBe(true);
  expect((await f.m.verifyOutcomeBundle(f.output)).memberCount).toBeGreaterThan(400);
});
it('rejects a missing declared artifact evidence file', async () => {
  const f = await outcomeReport(); await fs.unlink(path.join(f.reportDir, f.rows[0].artifactRef.slice('artifact:'.length).split('#')[0]));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('MISSING_OUTCOME_EVIDENCE');
});
it('rejects a missing sealed oracle file', async () => {
  const f = await outcomeReport(); await fs.unlink(path.join(f.reportDir, 'fixtures/oracles', f.suite.cases[0].id + '.json'));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('MISSING_OUTCOME_ORACLE');
});
it('rejects semantic evidence mismatch before packaging even though observations are valid', async () => {
  const f = await outcomeReport(); await f.write(f.rows[0].verificationRef.slice('verification:'.length).split('#')[0], json({ ...f.rows[0].evidence.verification, verdict: 'fail' }));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_EVIDENCE_DIGEST_MISMATCH');
});
it('rejects a missing command exit status', async () => {
  const f = await outcomeReport(); await f.write('logs/commands.json', json([{ command: 'synthetic-fixture-report' }]));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('INVALID_OUTCOME_COMMAND_LOG');
});
it('rejects unbound evidence members', async () => {
  const f = await outcomeReport(); await f.write('evidence/unrelated-private-note.txt', Buffer.from('Synthetic unrelated note.\n'));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('UNBOUND_OUTCOME_EVIDENCE');
});
it('rejects a tampered ZIP member even when the ZIP checksum is updated', async () => {
  const f = await outcomeReport(); await f.m.packageOutcomeBundle(f.reportDir, f.output);
  await changeArchive(f.output, zip => zip.file('patch/changes.patch', 'tampered', { createFolders: false }));
  await expect(f.m.verifyOutcomeBundle(f.output)).rejects.toThrow('OUTCOME_MEMBER_DIGEST_MISMATCH');
});
it('rejects a rehashed forged report through independent report recomputation', async () => {
  const f = await outcomeReport(); await f.m.packageOutcomeBundle(f.reportDir, f.output);
  await changeArchive(f.output, zip => {
    const report = JSON.parse(zip.file('report/report.json')!.asText()); report.benefitProven = true; const content = json(report);
    zip.file('report/report.json', content, { createFolders: false });
    const manifest = JSON.parse(zip.file('bundle-manifest.json')!.asText()), entry = manifest.members.find((member: any) => member.name === 'report/report.json');
    entry.bytes = content.length; entry.digest = hash(content); manifest.inputs.reportDigest = hash(content);
    zip.file('bundle-manifest.json', json(manifest), { createFolders: false });
  });
  await expect(f.m.verifyOutcomeBundle(f.output)).rejects.toThrow('OUTCOME_REPORT_DOES_NOT_REPRODUCE');
});
it('never overwrites an existing output or its checksum', async () => {
  const f = await outcomeReport(); await f.m.packageOutcomeBundle(f.reportDir, f.output);
  const before = hash(await fs.readFile(f.output)), checksum = await fs.readFile(f.output + '.sha256', 'utf8');
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_OUTPUT_EXISTS');
  expect(hash(await fs.readFile(f.output))).toBe(before); expect(await fs.readFile(f.output + '.sha256', 'utf8')).toBe(checksum);
});
for (const suffix of ['.zip', '.zip.sha256']) it(`ENOSPC while writing ${suffix} cannot publish a complete archive`, async () => {
  const f = await outcomeReport(), preload = path.join(f.dir, 'enospc.mjs');
  await fs.writeFile(preload, `import fs from 'node:fs/promises';const original=fs.open;fs.open=async function(file,...args){if(String(file).includes('.outcome-stage-')&&String(file).endsWith(${JSON.stringify(suffix)})&&args[0]==='wx'){const h=await original.call(this,file,...args);await h.writeFile('partial');await h.close();throw Object.assign(new Error('simulated disk full'),{code:'ENOSPC'});}return original.call(this,file,...args);};`);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [modulePath, '--report', f.reportDir, '--output', f.output], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--import=' + pathToFileURL(preload).href } });
  expect(result.status, result.stderr).toBe(2); expect(result.stderr).toContain('ENOSPC');
  expect(await fs.stat(f.output).then(() => true, () => false)).toBe(false);
  expect(await fs.stat(f.output + '.sha256').then(() => true, () => false)).toBe(false);
  expect((await fs.readdir(f.dir)).some(name => name.startsWith('.outcome-stage-'))).toBe(false);
});
it('rejects credential-named source artifacts without reading them', async () => {
  const m = await load(), dir = await temp(); await fs.mkdir(path.join(dir, 'report'));
  await fs.writeFile(path.join(dir, 'report/credentials.json'), '{}');
  await expect(m.packageOutcomeBundle(dir, path.join(await temp(), 'outcome.zip'))).rejects.toThrow('UNSAFE_OUTCOME_MEMBER');
});
it('rejects credential-shaped material in allowed evidence members', async () => {
  const m = await load(), dir = await temp(); await fs.mkdir(path.join(dir, 'report'));
  await fs.writeFile(path.join(dir, 'report/notes.json'), json({ note: 'Bearer ' + 'synthetic_fixture_credential_1234567890' }));
  await expect(m.packageOutcomeBundle(dir, path.join(await temp(), 'outcome.zip'))).rejects.toThrow('OUTCOME_CREDENTIAL_MATERIAL');
});
it('preserves explicit NOT RUN, BLOCKED and DEFERRED statuses in the sealed manifest', async () => {
  const f = await outcomeReport(); await f.m.packageOutcomeBundle(f.reportDir, f.output);
  const replay = await f.m.verifyOutcomeBundle(f.output);
  expect(replay.manifest.statuses).toEqual({ mode: 'offline', live: 'NOT RUN', candidate: 'BLOCKED', efficiencyBenchmark: 'DEFERRED' });
});
it('keeps a correctly recomputed hard-gate failure incomplete after ZIP replay', async () => {
  const f = await outcomeReport(); f.rows[0].violations.scopeLeaks = 1;
  const { evaluateOutcome } = await import('../../src/memory/outcome/evaluation.js');
  await f.write('results/observations.json', json(f.rows)); await f.write('report/report.json', json(evaluateOutcome(f.suite, f.rows)));
  expect((await f.m.packageOutcomeBundle(f.reportDir, f.output)).complete).toBe(false);
  const replay = await f.m.verifyOutcomeBundle(f.output); expect(replay.complete).toBe(false); expect(replay.report.hardGates.passed).toBe(false);
});
it('rejects a rehashed manifest that upgrades NOT RUN to recorded live execution', async () => {
  const f = await outcomeReport(); await f.m.packageOutcomeBundle(f.reportDir, f.output);
  await changeArchive(f.output, zip => { const manifest = JSON.parse(zip.file('bundle-manifest.json')!.asText()); manifest.statuses.live = 'RECORDED'; zip.file('bundle-manifest.json', json(manifest), { createFolders: false }); });
  await expect(f.m.verifyOutcomeBundle(f.output)).rejects.toThrow('OUTCOME_STATUS_BINDING_MISMATCH');
});
it('rejects manifest traversal even when the archive names are safe', async () => {
  const f = await outcomeReport(); await f.m.packageOutcomeBundle(f.reportDir, f.output);
  await changeArchive(f.output, zip => { const manifest = JSON.parse(zip.file('bundle-manifest.json')!.asText()); manifest.members[0].name = '../../outside.json'; zip.file('bundle-manifest.json', json(manifest), { createFolders: false }); });
  await expect(f.m.verifyOutcomeBundle(f.output)).rejects.toThrow('UNSAFE_OUTCOME_MEMBER');
});
it('detects tampering during fresh extraction before publishing outputs', async () => {
  const f = await outcomeReport(), preload = path.join(f.dir, 'extraction-tamper.mjs');
  await fs.writeFile(preload, `import fs from 'node:fs/promises';const original=fs.open;fs.open=async function(file,...args){const h=await original.call(this,file,...args);if(String(file).includes('agent-core-outcome-extract-')&&String(file).endsWith('changes.patch')&&args[0]==='wx'){const write=h.writeFile.bind(h);h.writeFile=async()=>write('synthetic extraction corruption');}return h;};`);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [modulePath, '--report', f.reportDir, '--output', f.output], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--import=' + pathToFileURL(preload).href } });
  expect(result.status, result.stderr).toBe(2); expect(result.stderr).toContain('OUTCOME_EXTRACTION_DIGEST_MISMATCH');
  expect(await fs.stat(f.output).then(() => true, () => false)).toBe(false);
});
it('rolls back only its published ZIP when checksum publication fails', async () => {
  const f = await outcomeReport(), preload = path.join(f.dir, 'publish-enospc.mjs');
  await fs.writeFile(preload, `import fs from 'node:fs/promises';const original=fs.link;fs.link=async function(source,target,...args){if(String(target).endsWith('outcome.zip.sha256'))throw Object.assign(new Error('synthetic publication disk full'),{code:'ENOSPC'});return original.call(this,source,target,...args);};`);
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [modulePath, '--report', f.reportDir, '--output', f.output], { cwd: root, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--import=' + pathToFileURL(preload).href } });
  expect(result.status, result.stderr).toBe(2); expect(result.stderr).toContain('ENOSPC');
  expect(await fs.stat(f.output).then(() => true, () => false)).toBe(false); expect(await fs.stat(f.output + '.sha256').then(() => true, () => false)).toBe(false);
});
it('CLI rejects unknown arguments and offers read-only help', async () => {
  await load(); const { spawnSync } = await import('node:child_process');
  const help = spawnSync(process.execPath, [modulePath, '--help'], { cwd: root, encoding: 'utf8' });
  expect(help.status, help.stderr).toBe(0); expect(help.stdout).toContain('Usage:');
  const unknown = spawnSync(process.execPath, [modulePath, '--continue'], { cwd: root, encoding: 'utf8' });
  expect(unknown.status).toBe(2); expect(unknown.stderr).toContain('INVALID_OR_DUPLICATE_ARGUMENT');
});
async function compareReport() {
  const f = await outcomeReport(), valueHash = (value: unknown) => hash(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
  const currentSnapshot = { schemaVersion: 1, sourceRevision: f.suite.sourceRevisions.current, rootDistDigest: f.rows[0].hashes.rootDistDigest, memoryDistDigest: f.rows[0].hashes.memoryDistDigest, policies: ['baseline-v1'] };
  const candidateSnapshot = { schemaVersion: 1, sourceRevision: f.suite.sourceRevisions.candidate, rootDistDigest: valueHash('candidate-root-dist'), memoryDistDigest: valueHash('candidate-memory-dist'), policies: ['baseline-v1', 'fusion-feedback-v1'] };
  const candidates = f.rows.filter(row => row.arm === 'current').map(row => {
    const candidate = structuredClone(row); candidate.arm = 'candidate'; candidate.runId = candidate.runId.replace(/:current$/, ':candidate'); candidate.taskId = candidate.runId;
    candidate.hashes.sourceRevision = candidateSnapshot.sourceRevision; candidate.hashes.rootDistDigest = candidateSnapshot.rootDistDigest; candidate.hashes.memoryDistDigest = candidateSnapshot.memoryDistDigest;
    candidate.adapter.policy = 'fusion-feedback-v1'; candidate.evidence.verification.taskId = candidate.runId;
    const slug = candidate.runId.replaceAll(':', '-'); candidate.artifactRef = `artifact:evidence/${slug}.answer.txt#${valueHash(candidate.evidence.artifactText)}`;
    candidate.verificationRef = `verification:evidence/${slug}.verification.json#${valueHash(candidate.evidence.verification)}`; return candidate;
  });
  f.rows.push(...candidates);
  for (const candidate of candidates) {
    await f.write(candidate.artifactRef.slice('artifact:'.length).split('#')[0], Buffer.from(candidate.evidence.artifactText));
    await f.write(candidate.verificationRef.slice('verification:'.length).split('#')[0], json(candidate.evidence.verification));
    await f.write('evidence/' + candidate.runId.replaceAll(':', '-') + '-trace.json', json(traceFor(candidate)));
  }
  const { evaluateOutcome } = await import('../../src/memory/outcome/evaluation.js');
  await f.write('results/observations.json', json(f.rows)); await f.write('report/report.json', json(evaluateOutcome(f.suite, f.rows)));
  await f.write('logs/baseline-commands.json', json([{ command: 'synthetic-baseline-report', status: 'PASS', exitCode: 0 }]));
  await f.write('evidence/snapshot.json', json(currentSnapshot)); await f.write('evidence/snapshot-candidate.json', json(candidateSnapshot));
  return { ...f, currentSnapshot, candidateSnapshot };
}
it('keeps separately bound baseline and candidate snapshots in comparative bundles', async () => {
  const f = await compareReport(); expect((await f.m.packageOutcomeBundle(f.reportDir, f.output)).complete).toBe(true);
  const replay = await f.m.verifyOutcomeBundle(f.output); expect(replay.report.runCount).toBe(72);
  expect(replay.manifest.members.map((member: any) => member.name)).toEqual(expect.arrayContaining(['evidence/snapshot.json', 'evidence/snapshot-candidate.json']));
});
it('rejects a candidate snapshot whose hashes only match baseline rows', async () => {
  const f = await compareReport(); await f.write('evidence/snapshot-candidate.json', json({ ...f.candidateSnapshot, rootDistDigest: f.currentSnapshot.rootDistDigest }));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_SNAPSHOT_BINDING_MISMATCH');
});
it('does not upgrade a BLOCKED runner command after report files already exist', async () => {
  const f = await outcomeReport(); await f.write('logs/commands.json', json([{ command: 'memory-outcome-eval --phase baseline', status: 'BLOCKED', exitCode: 2 }]));
  expect(f.report.complete).toBe(true); expect((await f.m.packageOutcomeBundle(f.reportDir, f.output)).complete).toBe(false);
  const replay = await f.m.verifyOutcomeBundle(f.output); expect(replay.complete).toBe(false); expect(replay.report.complete).toBe(true);
});

it('requires a bounded trace for every declared observation', async () => {
  const f = await outcomeReport(); await fs.unlink(path.join(f.reportDir, 'evidence/' + f.rows[0].runId.replaceAll(':', '-') + '-trace.json'));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('MISSING_OUTCOME_TRACE');
});
it('derives tool-call counters from trace operations rather than declared totals', async () => {
  const f = await outcomeReport(), trace = traceFor(f.rows[0]); trace.operations.push({ operation: 'extra-owner-check', status: 'success' });
  await f.write('evidence/' + f.rows[0].runId.replaceAll(':', '-') + '-trace.json', json(trace));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_TRACE_COUNTER_MISMATCH');
});
it('derives repeated failures from earlier failures of the same operation', async () => {
  const f = await outcomeReport(), trace = traceFor(f.rows[0]); trace.operations[0] = { operation: 'recall', status: 'failure' }; trace.operations[1] = { operation: 'recall', status: 'failure' };
  await f.write('evidence/' + f.rows[0].runId.replaceAll(':', '-') + '-trace.json', json(trace));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_TRACE_COUNTER_MISMATCH');
});
it('rejects trace identity drift and unknown trace fields', async () => {
  for (const alteration of ['identity', 'extra-field', 'definition']) {
    const f = await outcomeReport(), trace: any = traceFor(f.rows[0]);
    if (alteration === 'identity') trace.runId = 'foreign-run'; if (alteration === 'extra-field') trace.untrusted = true; if (alteration === 'definition') trace.definition = 'model-issued calls';
    await f.write('evidence/' + f.rows[0].runId.replaceAll(':', '-') + '-trace.json', json(trace));
    await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('INVALID_OUTCOME_TRACE');
  }
});
it('requires baseline command evidence when packaging comparative results', async () => {
  const f = await compareReport(); await fs.unlink(path.join(f.reportDir, 'logs/baseline-commands.json'));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('MISSING_BASELINE_COMMAND_LOG');
});

it('requires every command to have PASS status and zero exitCode before declaring completion', async () => {
  for (const command of [{ status: 'FAIL', exitCode: 7 }, { status: 'unexpected', exitCode: 0 }, { exitCode: 0 }]) {
    const f = await outcomeReport(); await f.write('logs/commands.json', json([{ command: 'synthetic-fixture-report', ...command }]));
    expect((await f.m.packageOutcomeBundle(f.reportDir, f.output)).complete).toBe(false);
  }
});
it('preserves a failed baseline command as incomplete in a comparative archive', async () => {
  const f = await compareReport(); await f.write('logs/baseline-commands.json', json([{ command: 'synthetic-baseline-report', status: 'FAIL', exitCode: 1 }]));
  expect((await f.m.packageOutcomeBundle(f.reportDir, f.output)).complete).toBe(false);
});
it('rejects quoted credential fields inside otherwise allowed JSON artifacts', async () => {
  const m = await load(), dir = await temp(); await fs.mkdir(path.join(dir, 'report'));
  await fs.writeFile(path.join(dir, 'report/notes.json'), json({ api_key: ['synthetic', 'credential', '1234567890'].join('_') }));
  await expect(m.packageOutcomeBundle(dir, path.join(await temp(), 'outcome.zip'))).rejects.toThrow('OUTCOME_CREDENTIAL_MATERIAL');
});
async function supplementalReport() {
  const f = await compareReport(), frozenSuite = structuredClone(f.suite), frozenBytes = json(frozenSuite);
  const valueHash = (value: unknown) => hash(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
  const observations: any[] = [];
  for (const c of f.suite.cases.filter((item: any) => item.partition === 'development')) for (const controller of ['native', 'external']) for (const arm of ['off', 'current']) {
    const template = f.rows.find(row => row.controller === controller && row.arm === arm && row.caseId.includes(c.domain));
    const row = structuredClone(template), runId = `${c.id}:${controller}:${arm}`, slug = runId.replaceAll(':', '-');
    Object.assign(row, { runId, caseId: c.id, taskId: runId });
    for (const key of ['inputDigest', 'oracleDigest', 'seedDigest', 'configDigest']) row.hashes[key] = c[key];
    if (c.domain === 'research') row.evidence.artifactText = JSON.stringify(c.oracle.facts.map((fact: any) => ({ key: fact.key, value: fact.value, source: fact.source, contradictions: fact.supersedes ?? [] })));
    row.artifactRef = `artifact:evidence/${slug}.answer.txt#${valueHash(row.evidence.artifactText)}`;
    row.evidence.verification = { taskId: runId, artifactDigest: valueHash(row.evidence.artifactText), oracleDigest: c.oracleDigest, verdict: 'pass', unsupportedClaims: 0 };
    row.verificationRef = `verification:evidence/${slug}.verification.json#${valueHash(row.evidence.verification)}`;
    observations.push(row);
  }
  const registration: any = { registeredAt: '2026-10-09T01:00:00Z', baselineDigest: valueHash(f.rows.filter(row => row.arm !== 'candidate')), developmentDigest: valueHash(observations), correctnessMinDelta: 0, usefulnessMinDelta: 0,
    latency: { status: 'DEFERRED', baselineP95: null, mad: null, limitMs: null, unit: 'ms', method: 'baseline-p95-plus-2-MAD' },
    cost: { status: 'DEFERRED', baselineAmount: null, ceiling: null, currency: null, method: 'measured-baseline-and-approved-ceiling' },
    developmentEvidence: { observedAt: '2026-10-09T00:00:00Z', observations } };
  const seal = { schemaVersion: 1, frozenSuiteDigest: hash(frozenBytes), baselineDigest: registration.baselineDigest, registration, registrationDigest: valueHash(registration) };
  f.suite.preregistration = { registeredAt: registration.registeredAt, candidateOpenedAt: '2026-10-10T00:00:00Z', ...registration };
  f.suite.preregistrationDigest = valueHash(f.suite.preregistration);
  const { evaluateOutcome } = await import('../../src/memory/outcome/evaluation.js');
  const report = evaluateOutcome(f.suite, f.rows);
  await f.write('fixtures/frozen-suite.json', frozenBytes); await f.write('fixtures/preregistration-seal.json', json(seal));
  await f.write('fixtures/preregistration.json', json(f.suite.preregistration)); await f.write('fixtures/suite.json', json(f.suite)); await f.write('report/report.json', json(report));
  return { ...f, report, frozenSuite, frozenBytes, seal, registration, valueHash };
}
it('packages a supplemental registration while keeping original frozen suite bytes', async () => {
  const f = await supplementalReport(); expect((await f.m.packageOutcomeBundle(f.reportDir, f.output)).complete).toBe(true);
  const replay = await f.m.verifyOutcomeBundle(f.output); expect(replay.report.preregistration.status).toBe('PASS'); expect(replay.report.benefitProven).toBe(false);
  const archive = new PizZip(await fs.readFile(f.output)); expect(archive.file('fixtures/frozen-suite.json')!.asNodeBuffer()).toEqual(f.frozenBytes);
  expect(replay.manifest.members.map((member: any) => member.name)).toContain('fixtures/preregistration-seal.json');
  expect(replay.manifest.members.some((member: any) => member.name.startsWith('evidence/dev-'))).toBe(false);
});
for (const member of ['fixtures/frozen-suite.json', 'fixtures/preregistration-seal.json']) it(`requires supplemental member ${member}`, async () => {
  const f = await supplementalReport(); await fs.unlink(path.join(f.reportDir, member));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('MISSING_OUTCOME_PREREGISTRATION_SEAL');
});
it('rejects removing both supplemental members from a derived comparative suite', async () => {
  const f = await supplementalReport(); await fs.unlink(path.join(f.reportDir, 'fixtures/frozen-suite.json')); await fs.unlink(path.join(f.reportDir, 'fixtures/preregistration-seal.json'));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('MISSING_OUTCOME_PREREGISTRATION_SEAL');
});
it('binds the supplemental seal to raw frozen bytes, including whitespace', async () => {
  const f = await supplementalReport(); await f.write('fixtures/frozen-suite.json', Buffer.concat([f.frozenBytes, Buffer.from(' ')]));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_PREREGISTRATION_SEAL_MISMATCH');
});
it('rejects rehashed changes to the frozen core fields', async () => {
  const f = await supplementalReport(); f.frozenSuite.limits.maxToolIterations++;
  const changed = json(f.frozenSuite); f.seal.frozenSuiteDigest = hash(changed);
  await f.write('fixtures/frozen-suite.json', changed); await f.write('fixtures/preregistration-seal.json', json(f.seal));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_FROZEN_SUITE_MISMATCH');
});
for (const defect of ['baseline-digest', 'registration-digest', 'registration-merge', 'extra-field', 'predeclared-opening']) it(`rejects supplemental seal ${defect}`, async () => {
  const f = await supplementalReport();
  if (defect === 'baseline-digest') f.seal.baselineDigest = 'sha256:' + '0'.repeat(64);
  if (defect === 'registration-digest') f.seal.registrationDigest = 'sha256:' + '0'.repeat(64);
  if (defect === 'registration-merge') { f.seal.registration.usefulnessMinDelta = 1; f.seal.registrationDigest = f.valueHash(f.seal.registration); }
  if (defect === 'extra-field') (f.seal as any).untrusted = true;
  if (defect === 'predeclared-opening') { f.seal.registration.candidateOpenedAt = '2026-10-10T00:00:00Z'; f.seal.registrationDigest = f.valueHash(f.seal.registration); }
  await f.write('fixtures/preregistration-seal.json', json(f.seal));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_PREREGISTRATION_SEAL_MISMATCH');
});
it('rejects registration timestamps at or after actual candidate opening', async () => {
  const f = await supplementalReport(); f.suite.preregistration.registeredAt = f.suite.preregistration.candidateOpenedAt;
  f.seal.registration.registeredAt = f.suite.preregistration.registeredAt; f.seal.registrationDigest = f.valueHash(f.seal.registration); f.suite.preregistrationDigest = f.valueHash(f.suite.preregistration);
  const { evaluateOutcome } = await import('../../src/memory/outcome/evaluation.js');
  await f.write('fixtures/preregistration-seal.json', json(f.seal)); await f.write('fixtures/preregistration.json', json(f.suite.preregistration)); await f.write('fixtures/suite.json', json(f.suite)); await f.write('report/report.json', json(evaluateOutcome(f.suite, f.rows)));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_PREREGISTRATION_OPENING_MISMATCH');
});
it('requires development evidence to predate supplemental registration and opening', async () => {
  const f = await supplementalReport(); f.suite.preregistration.developmentEvidence.observedAt = f.suite.preregistration.registeredAt;
  f.seal.registrationDigest = f.valueHash(f.seal.registration); f.suite.preregistrationDigest = f.valueHash(f.suite.preregistration);
  const { evaluateOutcome } = await import('../../src/memory/outcome/evaluation.js');
  await f.write('fixtures/preregistration-seal.json', json(f.seal)); await f.write('fixtures/preregistration.json', json(f.suite.preregistration)); await f.write('fixtures/suite.json', json(f.suite)); await f.write('report/report.json', json(evaluateOutcome(f.suite, f.rows)));
  await expect(f.m.packageOutcomeBundle(f.reportDir, f.output)).rejects.toThrow('OUTCOME_PREREGISTRATION_OPENING_MISMATCH');
});
