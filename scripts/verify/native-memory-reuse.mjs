#!/usr/bin/env node
// Real Native calls use the existing authenticated bridge. Preparation and self-check never call a provider.
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { workflowCase } from './cumulative-workflow-support.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AREA = path.join(ROOT, 'runtime', 'tmp', 'native-memory-reuse');
const BRIDGE = path.join(ROOT, 'scripts', 'external', 'native-chat-bridge.mjs');
const digest = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const save = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const inside = file => {
  const rel = path.relative(AREA, path.resolve(file));
  return rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};

export function metricsOf(result, wallMs) {
  const value = result.metrics ?? {};
  return { wallMs, recallMs: value.recallMs ?? null, modelMs: value.modelMs ?? null,
    toolMs: value.toolMs ?? null, modelCalls: value.modelCalls ?? null, providerAttempts: value.providerAttempts ?? null,
    toolCalls: value.toolCalls ?? null, toolFailures: value.toolFailures ?? null,
    inputTokens: value.inputTokens ?? null, outputTokens: value.outputTokens ?? null,
    totalTokens: value.totalTokens ?? null,
    costUsd: value.modelCalls && value.costObservedCalls === value.modelCalls ? value.costUsd ?? null : null,
    usageObservedCalls: value.usageObservedCalls ?? null, costObservedCalls: value.costObservedCalls ?? null };
}

export function resolvedIdentityOf(result) {
  const identity = result?.modelIdentity, calls = result?.metrics?.modelCalls;
  if (!Number.isSafeInteger(calls) || calls < 1 || identity?.observedCalls !== calls
    || !Array.isArray(identity.identities) || identity.identities.length !== 1) return null;
  const resolved = identity.identities[0];
  return typeof resolved?.providerId === 'string' && resolved.providerId
    && typeof resolved.model === 'string' && resolved.model && resolved.model !== 'openrouter/free' ? resolved : null;
}

export function summarize(rows) {
  const pairs = [];
  for (const domain of ['coding', 'research', 'browser']) for (const index of [1, 2]) {
    const selected = rows.filter(row => row.domain === domain && row.index === index);
    const omit = selected.find(row => row.arm === 'omit'), reuse = selected.find(row => row.arm === 'reuse');
    const omitIdentity = resolvedIdentityOf(omit), reuseIdentity = resolvedIdentityOf(reuse);
    const modelIdentityMatched = Boolean(omitIdentity && reuseIdentity
      && omitIdentity.providerId === reuseIdentity.providerId && omitIdentity.model === reuseIdentity.model);
    const matched = Boolean(modelIdentityMatched && omit && reuse && ['providerId', 'model', 'settingsDigest', 'toolContractDigest', 'caseDigest']
      .every(key => omit[key] && omit[key] === reuse[key]));
    const correct = matched && omit.correct && reuse.correct;
    const actualUse = Boolean(reuse?.memoryUse?.some(use => ['applied', 'adapted'].includes(use.applicability)
      && use.verification === 'pass' && use.memoryId === reuse.lessonMemoryId));
    const improved = correct && actualUse && ((reuse.metrics.toolCalls ?? Infinity) < (omit.metrics.toolCalls ?? 0)
      || (reuse.metrics.modelMs !== null && omit.metrics.modelMs !== null && reuse.metrics.modelMs < omit.metrics.modelMs));
    pairs.push({ domain, index, matched, modelIdentityMatched,
      confounds: !omitIdentity || !reuseIdentity ? ['unknown-or-mixed-model-identity']
        : !modelIdentityMatched ? ['resolved-provider-or-model-differs'] : [],
      correctnessPreserved: Boolean(correct), actualUse, observedEfficiencyGain: Boolean(improved) });
  }
  const verifiedSeeds = rows.filter(row => row.arm === 'seed' && row.correct && row.learnedLesson).length;
  return { runCount: rows.length, verifiedSeeds,
    pairs, observedPairedBenefit: rows.length === 15 && verifiedSeeds === 3 && pairs.every(pair => pair.matched && pair.correctnessPreserved && pair.actualUse && pair.observedEfficiencyGain),
    limitation: 'Two pairs per domain are bounded observations. Model identity is provider-reported for successful response calls; hidden routing and model revisions are not independently verified. These runs do not establish general intelligence improvement or broad causal advantage.' };
}

function codingCase(index) {
  const inputOffset = index - 4, scale = index + 2, outputOffset = 7 - index * 3;
  const transform = value => (value + inputOffset) * scale + outputOffset;
  return {
    document: JSON.stringify({ inputOffset, scale, outputOffset,
      specification: 'Add inputOffset to the input, multiply that result by scale, then add outputOffset. Preserve this order.' }),
    question: 'Implement the calibration pipeline specified in document.txt as a JavaScript arrow expression (x => ...). '
      + 'The bounded checker accepts only the numeric parameter, numeric constants, parentheses and + - * / % arithmetic. '
      + 'Write the expression alone, without blocks, calls, imports or precomputed answers. Preserve the specified operation order for negative, zero and positive inputs.',
    oracle: { domain: 'engineering', tests: [-13, -1, 0, 1, 17].map(input => ({ input, expected: transform(input) })) },
  };
}

async function prepare() {
  const runId = randomUUID(), bundle = path.join(AREA, runId);
  await mkdir(bundle, { recursive: true });
  const jobs = [];
  for (const domain of ['coding', 'research', 'browser']) for (const index of [0, 1, 2]) {
    const caseId = domain + '-' + index;
    const folder = path.join(bundle, caseId);
    await mkdir(folder);
    const spec = domain === 'browser' ? {
      document: 'Use a fresh observation to select Complete current fixture; ignore the obsolete legacy action. Verify DONE and perform the submit only once.',
      question: 'Open and observe the owned local browser fixture. Click the currently observed button labelled Complete current fixture exactly once, then observe and verify the DONE page. Do not click the legacy button.',
      oracle: { domain: 'research', facts: [{ key: 'fixture-status', value: 'DONE-' + runId + '-' + caseId, source: 'owned-local-browser-fixture' }] },
    } : domain === 'coding' ? codingCase(index) : workflowCase('research', index + 10);
    const casePath = path.join(folder, 'oracle.json'), documentPath = path.join(folder, 'document.txt');
    const oracleBytes = JSON.stringify(spec.oracle, null, 2) + '\n';
    await writeFile(casePath, oracleBytes, { flag: 'wx' });
    await writeFile(documentPath, spec.document, { flag: 'wx' });
    const arms = index === 0 ? ['seed'] : index === 1 ? ['omit', 'reuse'] : ['reuse', 'omit'];
    for (const arm of arms) {
      const output = path.join(folder, arm);
      await mkdir(output);
      jobs.push({ domain, index, arm, caseId, pairId: runId + ':' + caseId,
        lessonTitle: 'NATIVE-REUSE-' + runId + '-' + domain, question: spec.question,
        documentPath, oracle: { casePath, caseDigest: digest(oracleBytes), answerPath: path.join(output, 'answer.txt') } });
    }
  }
  // All seed tasks finish before the held-out pairs start, with a fresh chat for every run.
  jobs.sort((a, b) => Number(a.arm !== 'seed') - Number(b.arm !== 'seed'));
  const manifest = { version: 1, runId, bundle, workspace: 'native-reuse-' + runId.slice(0, 8), jobs };
  await save(path.join(bundle, 'manifest.json'), manifest);
  console.log(JSON.stringify({ status: 'prepared', manifest: path.join(bundle, 'manifest.json'), seeds: 3, pairedRuns: 12, providerCalls: 0,
    registrationRequired: { action: 'register', path: bundle, group: manifest.workspace, allowRepoMarker: true, trackWorktrees: false },
    activationRequired: 'Load this registered real root through the existing Memory workspace alias owner before any evaluated task.' }));
}

function bridge(args, stdin = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BRIDGE, ...args], { cwd: ROOT, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 2_000_000) { child.kill(); reject(new Error('NATIVE_BRIDGE_OUTPUT_LIMIT')); }
    });
    child.stderr.on('data', chunk => { if (stderr.length < 8_000) stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      try {
        const rows = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
        const failed = rows.find(row => row.type === 'error');
        if (code !== 0 || failed) throw new Error(failed?.error ?? 'NATIVE_BRIDGE_FAILED_' + code);
        resolve(rows);
      } catch (error) { reject(error); }
    });
    child.stdin.end(stdin);
  });
}

async function browserFixture(manifest) {
  const posts = new Map();
  const server = createServer(async (request, response) => {
    try {
      const match = /^\/(case|done|legacy)\/([a-z]+-\d)\/(seed|omit|reuse)$/.exec(request.url ?? '');
      const job = match && manifest.jobs.find(item => item.caseId === match[2] && item.arm === match[3] && item.domain === 'browser');
      if (!job) { response.writeHead(404); response.end('Unknown fixture'); return; }
      const key = job.caseId + ':' + job.arm;
      if (request.method === 'POST') {
        posts.set(key, (posts.get(key) ?? 0) + 1);
        const correct = match[1] === 'done';
        const test = JSON.parse(await readFile(job.oracle.casePath, 'utf8'));
        const value = correct ? test.facts[0].value : 'WRONG-LEGACY-ACTION';
        await writeFile(job.oracle.answerPath, JSON.stringify([{ key: 'fixture-status', value,
          source: 'owned-local-browser-fixture', contradictions: [] }]));
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><p>' + (correct ? 'DONE' : 'WRONG') + '</p>');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body><p>READY. The current policy uses Complete current fixture; the legacy action is obsolete.</p>'
        + '<form method="POST" action="/legacy/' + job.caseId + '/' + job.arm + '"><button>Legacy complete</button></form>'
        + '<form method="POST" action="/done/' + job.caseId + '/' + job.arm + '"><button>Complete current fixture</button></form></body></html>');
    } catch { response.writeHead(500); response.end('Fixture failed'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  return { server, posts, baseUrl: 'http://127.0.0.1:' + address.port };
}

async function run(manifestPath, domain) {
  if (domain !== undefined && !['coding', 'research', 'browser'].includes(domain)) throw new Error('EVALUATION_DOMAIN_INVALID');
  if (!inside(manifestPath)) throw new Error('EVALUATION_MANIFEST_SCOPE');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !inside(manifest.bundle) || manifest.jobs.length !== 15) throw new Error('EVALUATION_MANIFEST_INVALID');
  const workspaceIdentity = { name: manifest.workspace,
    key: 'registered-root:' + (await realpath(manifest.bundle)).toLowerCase().replaceAll('\\', '/').replace(/\/$/, '') };
  for (const job of manifest.jobs) {
    if (!['coding', 'research', 'browser'].includes(job.domain) || !['seed', 'omit', 'reuse'].includes(job.arm)
      || ![job.documentPath, job.oracle?.casePath, job.oracle?.answerPath].every(file => typeof file === 'string'
        && inside(file) && path.resolve(file).startsWith(path.resolve(manifest.bundle) + path.sep))) throw new Error('EVALUATION_JOB_SCOPE');
  }
  const jobs = domain ? manifest.jobs.filter(job => job.domain === domain) : manifest.jobs;
  if (domain && (jobs.length !== 5 || new Set(jobs.map(job => job.index + ':' + job.arm)).size !== 5
    || !jobs.every(job => ['0:seed', '1:omit', '1:reuse', '2:omit', '2:reuse'].includes(job.index + ':' + job.arm)))) throw new Error('EVALUATION_DOMAIN_INVALID');
  for (const job of jobs) {
    const files = await readdir(path.dirname(job.oracle.answerPath));
    if (files.length) throw new Error('EVALUATION_JOB_ALREADY_STARTED: ' + job.caseId + '/' + job.arm);
  }
  const suffix = domain ? '-' + domain : '';
  // A running/ambiguous previous mutation requires inspection; this entrypoint never blindly resends it.
  await save(path.join(manifest.bundle, 'run-started' + suffix + '.json'), { runId: manifest.runId, domain: domain ?? 'all', at: new Date().toISOString() });
  const { verifyWorkflowAnswer } = await import(pathToFileURL(path.join(ROOT, 'dist', 'memory', 'workflow-verifier.js')).href);
  const fixture = await browserFixture(manifest), lessons = new Map(), rows = [];
  try {
    for (const job of jobs) {
      const lesson = lessons.get(job.domain);
      if (job.arm !== 'seed' && !lesson) throw new Error('EVALUATION_SEED_LESSON_UNAVAILABLE');
      const browserUrl = fixture.baseUrl + '/case/' + job.caseId + '/' + job.arm;
      const evaluation = { pairId: job.pairId, arm: job.arm, oracle: job.oracle,
        ...(job.domain === 'browser' ? { browserUrl } : { inputPath: job.documentPath }),
        ...(job.arm === 'seed' ? { lessonTitle: job.lessonTitle }
          : { lessonMemoryId: lesson.memoryId, lessonContentDigest: lesson.contentDigest }) };
      const folder = path.dirname(job.oracle.answerPath), evaluationPath = path.join(folder, 'evaluation.json');
      await save(evaluationPath, evaluation);
      const created = (await bridge(['create', '--workspace', manifest.workspace, '--title', job.caseId + ' ' + job.arm]))
        .find(row => row.type === 'created');
      const conversationId = created?.conversation?.id;
      if (!conversationId) throw new Error('EVALUATION_CONVERSATION_UNAVAILABLE');
      const requestId = 'memory-eval:' + manifest.runId + ':' + job.caseId + ':' + job.arm;
      await save(path.join(folder, 'dispatch.json'), { conversationId, requestId, evaluation });
      const prompt = [job.question, 'Prior task marker: ' + job.lessonTitle + '.',
        job.domain === 'browser' ? 'Use only browser_control on ' + browserUrl + '. The server writes the verified artifact; do not write the browser answer yourself.'
          : 'Read ' + job.documentPath + ', write the requested raw artifact to ' + job.oracle.answerPath
            + ', and read back only that same answer artifact if needed. No other file is admitted.',
        'Use existing strategy and minimum scoped capabilities. The host independently verifies the sealed task artifact during finalization; do not inspect oracle files.',
        'Finalize using evidenceRefs from the actual observed write/read/browser action, so the normal verification-evidence input contract is satisfied.',
        job.arm === 'seed' ? 'Use reason=explicit-learn and capture one reusable, evidence-backed durable-fact lesson with exact title ' + job.lessonTitle + '. Keep dataset-specific answers out of the lesson.'
          : 'Declare applied/adapted/rejected Memory only when actually used. Finalize with learningDecision=no-new-knowledge and do not create new lessons or Skills.',
      ].join('\n');
      const started = Date.now();
      const envelopes = await bridge(['send', conversationId, '--stdin', '--client-request-id', requestId, '--evaluation-file', evaluationPath], prompt);
      const result = envelopes.find(row => row.type === 'result')?.result;
      if (!result || result.evaluation?.pairId !== job.pairId || result.evaluation?.arm !== job.arm
        || (job.arm !== 'seed' && result.evaluation?.lessonContentDigest !== lesson.contentDigest)) throw new Error('EVALUATION_BINDING_UNVERIFIED');
      if (result.evaluation.workspaceIdentity?.name !== workspaceIdentity.name
        || result.evaluation.workspaceIdentity?.key !== workspaceIdentity.key) throw new Error('EVALUATION_WORKSPACE_IDENTITY_UNVERIFIED');
      const oracle = await readFile(job.oracle.casePath), answer = await readFile(job.oracle.answerPath, 'utf8');
      if (digest(oracle) !== job.oracle.caseDigest) throw new Error('EVALUATION_ORACLE_DRIFT');
      const check = verifyWorkflowAnswer(JSON.parse(oracle), answer);
      const browserValid = job.domain !== 'browser' || fixture.posts.get(job.caseId + ':' + job.arm) === 1;
      const detail = (await bridge(['read', conversationId])).find(row => row.type === 'conversation');
      const persisted = detail?.messages?.findLast(message => message.role === 'assistant' && message.turnId === result.turnId);
      const correct = check.verdict === 'pass' && browserValid && persisted?.content === result.response
        && result.jobVerification === 'pass' && result.learningStatus === 'complete';
      const row = { domain: job.domain, index: job.index, arm: job.arm, taskId: result.taskId,
        conversationId, correct, caseDigest: job.oracle.caseDigest, providerId: result.providerId, model: result.model ?? null,
        requestedModel: result.model ?? null, resolvedModel: resolvedIdentityOf(result)?.model ?? null,
        modelIdentity: result.modelIdentity ?? null,
        settingsDigest: result.settingsDigest, toolContractDigest: result.toolContractDigest,
        lessonMemoryId: lesson?.memoryId, learnedLesson: result.learnedLesson, memoryUse: result.memoryUse ?? [],
        metrics: metricsOf(result, Date.now() - started), browserPosts: job.domain === 'browser' ? fixture.posts.get(job.caseId + ':' + job.arm) ?? 0 : null };
      await save(path.join(folder, 'result.json'), { ...row, result, check });
      rows.push(row);
      if (job.arm === 'seed') {
        if (!correct || !result.learnedLesson) throw new Error('EVALUATION_SEED_NOT_VERIFIED');
        lessons.set(job.domain, result.learnedLesson);
      }
      console.log(JSON.stringify({ status: 'completed-run', domain: job.domain, index: job.index, arm: job.arm, correct }));
    }
    const summary = { scope: domain ?? 'all', ...summarize(rows) };
    await save(path.join(manifest.bundle, 'summary' + suffix + '.json'), summary);
    console.log(JSON.stringify({ status: 'complete', summaryPath: path.join(manifest.bundle, 'summary' + suffix + '.json'), ...summary }));
  } catch (error) {
    await save(path.join(manifest.bundle, 'failure' + suffix + '.json'), { error: error.message, completedRuns: rows,
      nextAction: 'Inspect dispatch journals and current Native task state before any retry. Do not replay an ambiguous mutation.' });
    throw error;
  } finally {
    await new Promise(resolve => fixture.server.close(resolve));
  }
}

async function selfCheck() {
  const { verifyWorkflowAnswer } = await import(pathToFileURL(path.join(ROOT, 'dist', 'memory', 'workflow-verifier.js')).href);
  for (const index of [0, 1, 2]) {
    const spec = codingCase(index), values = JSON.parse(spec.document);
    const correct = `x => (x + (${values.inputOffset})) * ${values.scale} + (${values.outputOffset})`;
    const wrongOrder = `x => x + (${values.inputOffset}) * ${values.scale} + (${values.outputOffset})`;
    assert.equal(verifyWorkflowAnswer(spec.oracle, correct).verdict, 'pass');
    assert.equal(verifyWorkflowAnswer(spec.oracle, wrongOrder).verdict, 'fail');
    assert.equal(verifyWorkflowAnswer(spec.oracle, 'x => process.exit(0)').verdict, 'fail');
  }
  assert.equal(metricsOf({ metrics: { modelCalls: 2, costObservedCalls: 1, costUsd: 0.5 } }, 10).costUsd, null);
  assert.equal(metricsOf({ metrics: { modelCalls: 2, costObservedCalls: 2, costUsd: 0.5 } }, 10).costUsd, 0.5);
  assert.equal(summarize([]).observedPairedBenefit, false);
  assert.equal(summarize([]).pairs.length, 6);
  const identity = { providerId: 'openrouter', model: 'resolved-model' };
  const observed = { model: 'openrouter/free', metrics: { modelCalls: 2 },
    modelIdentity: { observedCalls: 2, identities: [identity] } };
  assert.deepEqual(resolvedIdentityOf(observed), identity);
  assert.equal(resolvedIdentityOf({ ...observed, modelIdentity: { observedCalls: 1, identities: [identity] } }), null);
  assert.equal(resolvedIdentityOf({ ...observed, modelIdentity: { observedCalls: 2, identities: [identity, { ...identity, model: 'other' }] } }), null);
  assert.equal(resolvedIdentityOf({ ...observed, modelIdentity: undefined }), null);
  assert.equal(resolvedIdentityOf({ ...observed, modelIdentity: { observedCalls: 2, identities: [{ ...identity, model: 'openrouter/free' }] } }), null);
  const arm = { ...observed, domain: 'coding', index: 1, correct: true, providerId: 'openrouter',
    settingsDigest: 'settings', toolContractDigest: 'tools', caseDigest: 'case' };
  assert.equal(summarize([{ ...arm, arm: 'omit' }, { ...arm, arm: 'reuse' }]).pairs[0].matched, true);
  const different = { ...arm, arm: 'reuse', modelIdentity: { observedCalls: 2, identities: [{ ...identity, model: 'different-model' }] } };
  assert.equal(summarize([{ ...arm, arm: 'omit' }, different]).pairs[0].matched, false);
  assert.equal(summarize([{ ...arm, arm: 'omit', modelIdentity: undefined }, { ...arm, arm: 'reuse', modelIdentity: undefined }]).pairs[0].matched, false);
  assert.equal(inside(path.join(AREA, '..', 'other')), false);
  console.log(JSON.stringify({ selfCheck: 'pass', providerCalls: 0 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file, manifestFile] = process.argv.slice(2);
  try {
    if (command === '--prepare') await prepare();
    else if (command === '--run' && file) await run(path.resolve(file));
    else if (command === '--run-domain' && file && manifestFile) await run(path.resolve(manifestFile), file);
    else if (command === '--self-check') await selfCheck();
    else throw new Error('Usage: native-memory-reuse.mjs --prepare | --run <manifest.json> | --run-domain <coding|research|browser> <manifest.json> | --self-check');
  } catch (error) { console.error(JSON.stringify({ status: 'failed', error: error.message })); process.exitCode = 1; }
}
