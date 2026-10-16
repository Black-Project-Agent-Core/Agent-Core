import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { constants as bufferConstants } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { crc32 } from 'node:zlib';
import PizZip from 'pizzip';
import yauzl from 'yauzl';
import * as z from 'zod/v4';
import { digest, jsonBytes, readArtifact, writeExclusive, parseArguments, failure } from '../evaluation/report-io.mjs';

const MANIFEST = 'bundle-manifest.json';
const REQUIRED = ['report/report.json', 'results/observations.json', 'fixtures/suite.json', 'logs/commands.json', 'patch/changes.patch'];
const MAX_MEMBER_BYTES = 8 * 1024 * 1024;
const TRACE_DEFINITION = 'toolCalls counts scripted harness/owner operations, not model-issued tools; verification-only ranking operations included';
const traceSchema = z.strictObject({ runId: z.string().min(1), definition: z.literal(TRACE_DEFINITION), operations: z.array(z.strictObject({ operation: z.string().min(1).max(240), status: z.enum(['success', 'failure']), reason: z.string().min(1).optional() })) });
const sha = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const registrationSealSchema = z.strictObject({ schemaVersion: z.literal(1), frozenSuiteDigest: sha, baselineDigest: sha, registration: z.record(z.string(), z.unknown()), registrationDigest: sha });
const manifestSchema = z.strictObject({
  version: z.literal('memory-outcome-bundle/v1'),
  kind: z.literal('agent-core-memory-outcome'),
  members: z.array(z.strictObject({ name: z.string(), bytes: z.number().int().min(0).max(MAX_MEMBER_BYTES), digest: sha })).min(REQUIRED.length),
  inputs: z.strictObject({ suiteDigest: sha, observationsDigest: sha, reportDigest: sha }),
  verification: z.strictObject({ method: z.literal('independent-recomputation'), verdict: z.literal('pass') }),
  statuses: z.strictObject({ mode: z.enum(['offline', 'live']), live: z.enum(['NOT RUN', 'RECORDED']), candidate: z.enum(['BLOCKED', 'PASS', 'FAIL']), efficiencyBenchmark: z.literal('DEFERRED') }),
});
const reportStatuses = report => ({ mode: report.mode, live: report.mode === 'offline' ? 'NOT RUN' : 'RECORDED', candidate: report.candidateStatus, efficiencyBenchmark: report.efficiencyBenchmark });
const invalid = code => { throw new Error(code); };
async function rejectCredentialContent(bytes, name) {
  const { scanMemorySafety } = await import('../../../dist/memory/safety.js');
  const text = bytes.toString('utf8');
  if (scanMemorySafety(text).some(finding => finding.code === 'credential')) invalid('OUTCOME_CREDENTIAL_MATERIAL');
  if (name?.endsWith('.json')) {
    let value; try { value = JSON.parse(text); } catch { return; }
    const { isSensitiveKey } = await import('../../../dist/security/redaction.js');
    const pending = [value];
    while (pending.length) {
      const current = pending.pop(); if (!current || typeof current !== 'object') continue;
      for (const [key, child] of Object.entries(current)) {
        if (isSensitiveKey(key) && typeof child === 'string' && child && child !== '[REDACTED]') invalid('OUTCOME_CREDENTIAL_MATERIAL');
        if (child && typeof child === 'object') pending.push(child);
      }
    }
  }
}
const parseJSON = (bytes, code) => { try { return JSON.parse(bytes.toString('utf8')); } catch { invalid(code); } };
function safeName(name, allowManifest = false) {
  if (typeof name !== 'string' || !name || name.length > 4096 || !/^[A-Za-z0-9._/-]+$/.test(name)) return false;
  const segments = name.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.length > 255 || segment.endsWith('.') ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment) || segment.startsWith('.') ||
    /^(?:secrets?|credentials?|memory(?:-v2)?|runtime|backups?|private|protected)(?:\.|$)/i.test(segment))) return false;
  if (allowManifest && name === MANIFEST) return true;
  return /^(?:report\/[^/]+\.json|results\/observations\.json|logs\/[^/]+\.(?:json|txt)|fixtures\/[^/]+\.json|fixtures\/oracles\/[^/]+\.json|evidence\/(?:[A-Za-z0-9_-]+\/)*[^/]+\.(?:json|txt)|patch\/changes\.patch)$/.test(name);
}
async function noSymlinkAncestors(target) {
  let current = path.resolve(target);
  for (;;) {
    const stats = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stats?.isSymbolicLink()) invalid('SYMLINK_OUTCOME_PATH');
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
async function sourceMembers(directory) {
  const before = await fs.lstat(directory, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) invalid('INVALID_OUTCOME_DIRECTORY');
  await noSymlinkAncestors(directory);
  const files = new Map(), directoryStates = [];
  async function visit(dir, prefix) {
    const pre = await fs.lstat(dir, { bigint: true });
    if (!pre.isDirectory() || pre.isSymbolicLink()) invalid('NONREGULAR_OUTCOME_MEMBER');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    directoryStates.push({ dir, stats: pre, entries: entries.map(e => e.name).sort() });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix + entry.name, file = path.join(dir, entry.name), stats = await fs.lstat(file, { bigint: true });
      if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) invalid('NONREGULAR_OUTCOME_MEMBER');
      if (stats.isDirectory()) {
        // Runner-owned isolated stores are never read or copied into deliverable evidence.
        if (name === 'runs') continue;
        if (!/^(?:report|results|logs|fixtures|fixtures\/oracles|evidence(?:\/[A-Za-z0-9_-]+)*|patch)$/.test(name)) invalid('UNSAFE_OUTCOME_MEMBER');
        await visit(file, name + '/');
      } else {
        if (!safeName(name)) invalid('UNSAFE_OUTCOME_MEMBER');
        const content = await readArtifact(file); await rejectCredentialContent(content, name); files.set(name, content);
      }
    }
  }
  await visit(directory, '');
  for (const item of directoryStates) {
    const after = await fs.lstat(item.dir, { bigint: true });
    if (after.isSymbolicLink() || after.dev !== item.stats.dev || after.ino !== item.stats.ino || after.mtimeNs !== item.stats.mtimeNs ||
      JSON.stringify((await fs.readdir(item.dir)).sort()) !== JSON.stringify(item.entries)) invalid('OUTCOME_DIRECTORY_CHANGED');
  }
  return files;
}
function requireCore(files) {
  for (const name of REQUIRED) if (!files.has(name)) invalid('MISSING_OUTCOME_MEMBER');
}
async function validateOutcomeFiles(files) {
  requireCore(files);
  const suiteBytes = files.get('fixtures/suite.json'), rowBytes = files.get('results/observations.json');
  const report = parseJSON(files.get('report/report.json'), 'INVALID_OUTCOME_REPORT');
  const { executionComplete } = validateEvidence(files, parseJSON(suiteBytes, 'INVALID_OUTCOME_SUITE'), parseJSON(rowBytes, 'INVALID_OUTCOME_OBSERVATIONS'));
  const { verifyOutcome } = await import('../../../dist/memory/outcome/verifier.js');
  const checked = verifyOutcome(suiteBytes, rowBytes, report);
  if (checked.verdict !== 'pass') invalid('OUTCOME_REPORT_DOES_NOT_REPRODUCE');
  return { report, checked, executionComplete };
}
const valueDigest = value => digest(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
function validateSupplementalRegistration(files, suite, rows, bound) {
  const frozenName = 'fixtures/frozen-suite.json', sealName = 'fixtures/preregistration-seal.json';
  const supplemental = files.has(frozenName) || files.has(sealName) || suite.preregistration !== null && rows.some(row => row.arm === 'candidate');
  if (!supplemental) return;
  if (!files.has(frozenName) || !files.has(sealName)) invalid('MISSING_OUTCOME_PREREGISTRATION_SEAL');
  let seal; try { seal = registrationSealSchema.parse(parseJSON(files.get(sealName), 'OUTCOME_PREREGISTRATION_SEAL_MISMATCH')); } catch { invalid('OUTCOME_PREREGISTRATION_SEAL_MISMATCH'); }
  const frozenBytes = files.get(frozenName), frozen = parseJSON(frozenBytes, 'OUTCOME_FROZEN_SUITE_MISMATCH');
  const registrationKeys = ['registeredAt', 'baselineDigest', 'developmentDigest', 'correctnessMinDelta', 'usefulnessMinDelta', 'latency', 'cost', 'developmentEvidence'];
  if (JSON.stringify(Object.keys(seal.registration).sort()) !== JSON.stringify(registrationKeys.sort()) || seal.frozenSuiteDigest !== digest(frozenBytes) ||
    seal.baselineDigest !== valueDigest(rows.filter(row => row.arm !== 'candidate')) || seal.registration.baselineDigest !== seal.baselineDigest ||
    seal.registrationDigest !== valueDigest(seal.registration)) invalid('OUTCOME_PREREGISTRATION_SEAL_MISMATCH');
  const core = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['preregistration', 'preregistrationDigest'].includes(key)));
  if (frozen.preregistration !== null || frozen.preregistrationDigest !== null || !isDeepStrictEqual(core(frozen), core(suite))) invalid('OUTCOME_FROZEN_SUITE_MISMATCH');
  const registration = suite.preregistration;
  if (!registration || !isDeepStrictEqual(registration, { registeredAt: seal.registration.registeredAt, candidateOpenedAt: registration.candidateOpenedAt, ...seal.registration })) invalid('OUTCOME_PREREGISTRATION_SEAL_MISMATCH');
  const registeredAt = Date.parse(registration.registeredAt), candidateOpenedAt = Date.parse(registration.candidateOpenedAt), observedAt = Date.parse(registration.developmentEvidence?.observedAt);
  if (!Number.isFinite(registeredAt) || !Number.isFinite(candidateOpenedAt) || !Number.isFinite(observedAt) || observedAt >= registeredAt || registeredAt >= candidateOpenedAt) invalid('OUTCOME_PREREGISTRATION_OPENING_MISMATCH');
  // Development observations are canonical inline evidence in registration.
  // Their artifacts/receipts are replayed by verifyOutcome, not physical member declarations.
  bound.add(frozenName); bound.add(sealName);
}
function validateEvidence(files, suite, rows) {
  if (!Array.isArray(suite.cases) || !Array.isArray(rows)) invalid('INVALID_OUTCOME_INPUT');
  const bound = new Set(REQUIRED), runSlugs = new Set(rows.map(row => typeof row.runId === 'string' ? row.runId.replaceAll(':', '-') : ''));
  for (const item of suite.cases) {
    const name = `fixtures/oracles/${item.id}.json`, content = files.get(name);
    if (!content) invalid('MISSING_OUTCOME_ORACLE');
    const oracle = parseJSON(content, 'INVALID_OUTCOME_ORACLE');
    if (!isDeepStrictEqual(oracle, item.oracle) || valueDigest(oracle) !== item.oracleDigest) invalid('OUTCOME_ORACLE_DIGEST_MISMATCH');
    bound.add(name);
  }
  if (suite.preregistration !== null) {
    const name = 'fixtures/preregistration.json', content = files.get(name);
    if (!content) invalid('MISSING_OUTCOME_PREREGISTRATION');
    const registration = parseJSON(content, 'INVALID_OUTCOME_PREREGISTRATION');
    if (!isDeepStrictEqual(registration, suite.preregistration) || valueDigest(registration) !== suite.preregistrationDigest) invalid('OUTCOME_PREREGISTRATION_DIGEST_MISMATCH');
    bound.add(name);
  }
  validateSupplementalRegistration(files, suite, rows, bound);
  function checkRef(ref, kind, expected) {
    const match = typeof ref === 'string' && /^(artifact|verification|receipt):([^#]+)#(sha256:[a-f0-9]{64})$/.exec(ref);
    if (!match || match[1] !== kind || !safeName(match[2]) || !match[2].startsWith('evidence/')) invalid('UNSAFE_OUTCOME_EVIDENCE_REF');
    const content = files.get(match[2]); if (!content) invalid('MISSING_OUTCOME_EVIDENCE');
    const actual = kind === 'artifact' ? content.toString('utf8') : parseJSON(content, 'INVALID_OUTCOME_EVIDENCE');
    if (!isDeepStrictEqual(actual, expected) || valueDigest(actual) !== match[3]) invalid('OUTCOME_EVIDENCE_DIGEST_MISMATCH');
    bound.add(match[2]);
  }
  for (const row of rows) {
    if (!row.evidence || !Array.isArray(row.receiptRefs) || !Array.isArray(row.evidence.receipts) || row.receiptRefs.length !== row.evidence.receipts.length) invalid('INVALID_OUTCOME_EVIDENCE');
    checkRef(row.artifactRef, 'artifact', row.evidence.artifactText);
    checkRef(row.verificationRef, 'verification', row.evidence.verification);
    row.receiptRefs.forEach((ref, index) => checkRef(ref, 'receipt', row.evidence.receipts[index]));
    const traceName = 'evidence/' + row.runId.replaceAll(':', '-') + '-trace.json', traceBytes = files.get(traceName);
    if (!traceBytes) invalid('MISSING_OUTCOME_TRACE');
    let trace; try { trace = traceSchema.parse(parseJSON(traceBytes, 'INVALID_OUTCOME_TRACE')); } catch { invalid('INVALID_OUTCOME_TRACE'); }
    if (trace.runId !== row.runId) invalid('INVALID_OUTCOME_TRACE');
    const failed = new Set(); let repeatedFailures = 0;
    for (const operation of trace.operations) if (operation.status === 'failure') { if (failed.has(operation.operation)) repeatedFailures++; failed.add(operation.operation); }
    if (row.counters.toolCalls !== trace.operations.length || row.counters.repeatedFailures !== repeatedFailures) invalid('OUTCOME_TRACE_COUNTER_MISMATCH');
    bound.add(traceName);
  }
  const commandFiles = ['logs/commands.json'];
  if (rows.some(row => row.arm === 'candidate')) { if (!files.has('logs/baseline-commands.json')) invalid('MISSING_BASELINE_COMMAND_LOG'); commandFiles.push('logs/baseline-commands.json'); }
  const commands = [];
  for (const name of commandFiles) {
    const entries = parseJSON(files.get(name), 'INVALID_OUTCOME_COMMAND_LOG');
    if (!Array.isArray(entries) || !entries.length || entries.some(command => typeof command.command !== 'string' || !command.command ||
      (!Number.isInteger(command.exitCode) && !(command.exitCode === null && ['NOT RUN', 'BLOCKED', 'RUNNING'].includes(command.status))))) invalid('INVALID_OUTCOME_COMMAND_LOG');
    commands.push(...entries); bound.add(name);
  }
  if (rows.some(row => row.arm === 'candidate') && files.has('evidence/snapshot.json') && !files.has('evidence/snapshot-candidate.json')) invalid('MISSING_OUTCOME_SNAPSHOT');
  for (const [name, candidate] of [['evidence/snapshot.json', false], ['evidence/snapshot-candidate.json', true]]) {
    if (!files.has(name)) continue;
    const snapshot = parseJSON(files.get(name), 'INVALID_OUTCOME_SNAPSHOT');
    const group = rows.filter(row => candidate ? row.arm === 'candidate' : row.arm !== 'candidate');
    const revision = candidate ? suite.sourceRevisions.candidate : suite.sourceRevisions.current;
    if (!group.length || snapshot.schemaVersion !== 1 || !revision || snapshot.sourceRevision !== revision ||
      !sha.safeParse(snapshot.rootDistDigest).success || !sha.safeParse(snapshot.memoryDistDigest).success || !Array.isArray(snapshot.policies) ||
      Object.keys(snapshot).some(key => !['schemaVersion', 'sourceRevision', 'rootDistDigest', 'memoryDistDigest', 'policies'].includes(key))) invalid('INVALID_OUTCOME_SNAPSHOT');
    if (group.some(row => row.hashes.sourceRevision !== snapshot.sourceRevision || row.hashes.rootDistDigest !== snapshot.rootDistDigest || row.hashes.memoryDistDigest !== snapshot.memoryDistDigest || !snapshot.policies.includes(row.adapter.policy))) invalid('OUTCOME_SNAPSHOT_BINDING_MISMATCH');
    bound.add(name);
  }
  for (const name of files.keys()) {
    if (name.startsWith('fixtures/') && !bound.has(name)) invalid('UNBOUND_OUTCOME_FIXTURE');
    if (name.startsWith('evidence/') && !bound.has(name) && ![...runSlugs].some(slug => slug && (name.startsWith('evidence/' + slug + '.') || name.startsWith('evidence/' + slug + '-')))) invalid('UNBOUND_OUTCOME_EVIDENCE');
  }
  return { executionComplete: commands.every(command => command.status === 'PASS' && command.exitCode === 0) };
}
async function readArchive(file) {
  const stats = await fs.lstat(file, { bigint: true });
  if (!stats.isFile() || stats.isSymbolicLink()) invalid('INVALID_OUTCOME_ZIP');
  await noSymlinkAncestors(file);
  if (stats.size <= BigInt(MAX_MEMBER_BYTES)) return readArtifact(file);
  if (stats.size > BigInt(bufferConstants.MAX_LENGTH)) invalid('OUTCOME_ZIP_TOO_LARGE');
  const { assertSameFileIdentity } = await import('../../../dist/security/file-identity.js');
  const handle = await fs.open(file, 'r');
  try {
    assertSameFileIdentity(stats, await handle.stat({ bigint: true }), 'outcome ZIP');
    const bytes = await handle.readFile(), after = await handle.stat({ bigint: true }), current = await fs.lstat(file, { bigint: true });
    assertSameFileIdentity(stats, after, 'outcome ZIP'); assertSameFileIdentity(after, current, 'outcome ZIP');
    if (current.isSymbolicLink() || after.size !== stats.size || after.mtimeNs !== stats.mtimeNs || BigInt(bytes.length) !== stats.size) invalid('OUTCOME_ZIP_CHANGED_DURING_READ');
    return bytes;
  } finally { await handle.close(); }
}
async function zipEntries(bytes) {
  let archive;
  try { archive = await yauzl.fromBufferPromise(bytes, { lazyEntries: true, decodeStrings: false, validateEntrySizes: true }); }
  catch { invalid('INVALID_OUTCOME_ZIP'); }
  const files = new Map(), names = new Set();
  try {
    for await (const entry of archive.eachEntry()) {
      const name = entry.fileName.toString('utf8');
      if (!safeName(name, true) || !Buffer.from(name).equals(entry.fileName)) invalid('UNSAFE_ZIP_MEMBER');
      const folded = name.toLowerCase(); if (names.has(folded)) invalid('DUPLICATE_ZIP_MEMBER'); names.add(folded);
      const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
      if ((unixType && unixType !== 0o100000) || (entry.externalFileAttributes & 0x10) || entry.isEncrypted()) invalid('NONREGULAR_ZIP_MEMBER');
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize > MAX_MEMBER_BYTES) invalid('OUTCOME_MEMBER_TOO_LARGE');
      const header = await archive.readLocalFileHeaderPromise(entry, { minimal: false });
      if (!header.fileName.equals(entry.fileName)) invalid('ZIP_LOCAL_NAME_MISMATCH');
      const stream = await archive.openReadStreamPromise(entry); const chunks = []; let length = 0;
      for await (const chunk of stream) { length += chunk.length; if (length > MAX_MEMBER_BYTES) invalid('OUTCOME_MEMBER_TOO_LARGE'); chunks.push(chunk); }
      const content = Buffer.concat(chunks, length);
      if (length !== entry.uncompressedSize || crc32(content) !== entry.crc32) invalid('OUTCOME_ZIP_MEMBER_CRC_MISMATCH');
      await rejectCredentialContent(content, name); files.set(name, content);
    }
  } catch (error) {
    if (/^[A-Z0-9_]+$/.test(error.message)) throw error;
    invalid('INVALID_OUTCOME_ZIP');
  } finally { archive.close(); }
  return files;
}
function validateManifest(files) {
  if (!files.has(MANIFEST)) invalid('MISSING_OUTCOME_MANIFEST');
  let manifest;
  try { manifest = manifestSchema.parse(parseJSON(files.get(MANIFEST), 'INVALID_OUTCOME_MANIFEST')); }
  catch { invalid('INVALID_OUTCOME_MANIFEST'); }
  const declared = new Set();
  for (const member of manifest.members) {
    if (!safeName(member.name)) invalid('UNSAFE_OUTCOME_MEMBER');
    const folded = member.name.toLowerCase(); if (declared.has(folded)) invalid('DUPLICATE_OUTCOME_MEMBER'); declared.add(folded);
    const bytes = files.get(member.name); if (!bytes) invalid('MISSING_OUTCOME_MEMBER');
    if (bytes.length !== member.bytes || digest(bytes) !== member.digest) invalid('OUTCOME_MEMBER_DIGEST_MISMATCH');
  }
  if (files.size !== manifest.members.length + 1) invalid('UNEXPECTED_OUTCOME_MEMBER');
  requireCore(files);
  if (manifest.inputs.suiteDigest !== digest(files.get('fixtures/suite.json')) || manifest.inputs.observationsDigest !== digest(files.get('results/observations.json')) ||
    manifest.inputs.reportDigest !== digest(files.get('report/report.json'))) invalid('OUTCOME_INPUT_DIGEST_MISMATCH');
  return manifest;
}

/** Read-only ZIP replay. Every verification extracts into a new private temporary directory. */
export async function verifyOutcomeBundle(zipPath, checksumPath = zipPath + '.sha256') {
  const bytes = await readArchive(zipPath), checksum = (await readArtifact(checksumPath, 128)).toString('utf8');
  if (checksum !== digest(bytes) + '\n') invalid('OUTCOME_ZIP_DIGEST_MISMATCH');
  const files = await zipEntries(bytes), manifest = validateManifest(files);
  const extraction = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-core-outcome-extract-'));
  try {
    for (const [name, content] of files) { const file = path.join(extraction, ...name.split('/')); await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); await writeExclusive(file, content); }
    if (digest(await readArtifact(path.join(extraction, MANIFEST))) !== digest(files.get(MANIFEST))) invalid('OUTCOME_EXTRACTION_DIGEST_MISMATCH');
    const extracted = new Map();
    for (const member of manifest.members) {
      const content = await readArtifact(path.join(extraction, ...member.name.split('/')));
      if (content.length !== member.bytes || digest(content) !== member.digest) invalid('OUTCOME_EXTRACTION_DIGEST_MISMATCH'); extracted.set(member.name, content);
    }
    const { report, executionComplete } = await validateOutcomeFiles(extracted);
    if (!isDeepStrictEqual(manifest.statuses, reportStatuses(report))) invalid('OUTCOME_STATUS_BINDING_MISMATCH');
    if (digest(await readArchive(zipPath)) !== digest(bytes) || (await readArtifact(checksumPath, 128)).toString('utf8') !== checksum) invalid('OUTCOME_ZIP_CHANGED_DURING_REPLAY');
    return { complete: report.complete === true && executionComplete, sha256: digest(bytes), memberCount: manifest.members.length, manifest, report };
  } finally { await fs.rm(extraction, { recursive: true, force: true }); }
}

/** Packages synthetic outcome evidence exclusively; existing outputs are never replaced. */
export async function packageOutcomeBundle(directory, zipPath) {
  const source = path.resolve(directory), output = path.resolve(zipPath), checksum = output + '.sha256';
  const relative = path.relative(source, output); if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) invalid('OUTPUT_INSIDE_OUTCOME_DIRECTORY');
  await noSymlinkAncestors(output); await noSymlinkAncestors(checksum);
  for (const file of [output, checksum]) if (await fs.lstat(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) invalid('OUTCOME_OUTPUT_EXISTS');
  const files = await sourceMembers(source); requireCore(files);
  const { report } = await validateOutcomeFiles(files);
  const members = [...files].map(([name, bytes]) => ({ name, bytes: bytes.length, digest: digest(bytes) })).sort((a, b) => a.name.localeCompare(b.name));
  const manifest = manifestSchema.parse({ version: 'memory-outcome-bundle/v1', kind: 'agent-core-memory-outcome', members,
    inputs: { suiteDigest: digest(files.get('fixtures/suite.json')), observationsDigest: digest(files.get('results/observations.json')), reportDigest: digest(files.get('report/report.json')) },
    verification: { method: 'independent-recomputation', verdict: 'pass' }, statuses: reportStatuses(report) });
  const archive = new PizZip(); for (const [name, content] of [...files, [MANIFEST, jsonBytes(manifest)]]) archive.file(name, content, { createFolders: false, unixPermissions: 0o100600, date: new Date('2000-01-01T00:00:00Z') });
  const bytes = archive.generate({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE' });
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 }); await noSymlinkAncestors(output);
  const staging = path.join(path.dirname(output), '.outcome-stage-' + randomUUID() + '.zip'), stagingChecksum = staging + '.sha256';
  const published = [];
  try {
    await writeExclusive(staging, bytes); await writeExclusive(stagingChecksum, Buffer.from(digest(bytes) + '\n'));
    const replay = await verifyOutcomeBundle(staging, stagingChecksum);
    const current = await sourceMembers(source);
    if (current.size !== files.size || [...files].some(([name, content]) => !current.has(name) || digest(current.get(name)) !== digest(content))) invalid('OUTCOME_CHANGED_DURING_PACKAGING');
    await fs.link(staging, output); published.push([output, staging]);
    await fs.link(stagingChecksum, checksum); published.push([checksum, stagingChecksum]);
    const verified = await verifyOutcomeBundle(output, checksum);
    return { complete: replay.complete && verified.complete, sha256: verified.sha256 };
  } catch (error) {
    for (const [file, owned] of published.reverse()) {
      const left = await fs.lstat(file, { bigint: true }).catch(() => null), right = await fs.lstat(owned, { bigint: true }).catch(() => null);
      if (left && right && !left.isSymbolicLink() && left.dev === right.dev && left.ino === right.ino) await fs.unlink(file);
    }
    throw error;
  } finally { await fs.rm(staging, { force: true }); await fs.rm(stagingChecksum, { force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help')) console.log('Usage: package-memory-outcome --report DIRECTORY --output NEW_ZIP\nOffline synthetic evidence only. Exclusive output plus SHA-256 companion; fresh extraction and independent recomputation required.');
  else try { const args = parseArguments(['--report', '--output']); const result = await packageOutcomeBundle(args['--report'], args['--output']); console.log(JSON.stringify(result)); if (!result.complete) process.exitCode = 1; } catch (error) { failure(error); }
}
