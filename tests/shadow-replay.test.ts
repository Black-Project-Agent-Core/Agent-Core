import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// Stage 1, V2 of docs/proposals/Biaya-Efektif-dan-Replay-Tugas-Macet-Native.md: the shadow replay only measures.
// Synthetic tasks only: the real state.json is never read and dist is never loaded (the cost source is injected).
const script = fileURLToPath(new URL('../scripts/inspect/shadow-replay.mjs', import.meta.url));
const scriptUrl = pathToFileURL(script).href;
const { replayShadow, renderReport, main } = await import(scriptUrl);

const folder = mkdtempSync(path.join(os.tmpdir(), 'shadow-replay-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

// Episodes from a token string: a = action, f:CODE = failure with that summary, f:CODE@tool = the same failure recorded by that tool,
// ok = granted-tool success, o = other observation, h = hypothesis.
let serial = 0;
const episode = (kind: string, summary: string, toolName?: string) =>
  ({ id: `e${++serial}`, kind, at: '2026-11-02T00:00:00.000Z', summary, evidenceRefs: [] as string[], ...(toolName ? { toolName } : {}) });
const episodes = (tokens: string) => tokens.split(/\s+/).filter(Boolean).map(token => {
  if (token === 'a') return episode('action', 'Executing granted tool: t.');
  if (token === 'ok') return episode('observation', 'Granted tool succeeded: t.');
  if (token === 'o') return episode('observation', 'Observed output.');
  if (token === 'h') return episode('hypothesis', 'Try another way.');
  if (token.startsWith('f:')) { const [summary, toolName] = token.slice(2).split('@'); return episode('failure', summary, toolName); }
  throw new Error(`unknown token ${token}`);
});
const actions = (count: number) => Array.from({ length: count }, () => 'a').join(' ');
const task = (id: string, workspace: string, status: string, outcome: string | undefined, tokens: string) =>
  ({ id, workspace, status, terminalOutcome: outcome, metrics: {}, episodes: episodes(tokens) });
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
};
// One failed task built from tokens; its R1 firings, and the firing a run of three produces.
const r1Firings = (tokens: string) => replayShadow({ tasks: [task('T', 'w', 'finalized', 'failed', tokens)] }, { costOf: () => 10 })
  .firings.filter((firing: { rule: string }) => firing.rule === 'R1');
const firedR1 = (firedAtAction: number, totalActions: number) => [{ taskId: 'T', rule: 'R1', firedAtAction, totalActions, outcome: 'failed' }];

// ws-r1: A fires R1 at action 3 of 5; B must not (a success resets its streak). ws-r2: five baseline tasks plus C, which fires R2.
// D is still running, so it is skipped and never part of a baseline.
const COSTS: Record<string, number> = { A: 100, B: 100, w4: 50, w6: 50, w8: 50, w10: 50, w10b: 50, C: 200 };
const costOf = (item: { id: string }) => COSTS[item.id] ?? null;
const baseline: Array<[string, number]> = [['w4', 4], ['w6', 6], ['w8', 8], ['w10', 10], ['w10b', 10]];
const fixtureState = () => ({ tasks: [
  task('A', 'ws-r1', 'finalized', 'failed', 'a f:E_X a f:E_X a f:E_X a a'),
  task('B', 'ws-r1', 'finalized', 'verified', 'a f:E_X a f:E_X ok a f:E_X'),
  ...baseline.map(([id, count]) => task(id, 'ws-r2', 'finalized', 'verified', actions(count))),
  task('C', 'ws-r2', 'finalized', 'verified', actions(20)),
  task('D', 'ws-r2', 'running', undefined, actions(30)),
] });

describe('shadow replay', () => {
  it('measures the fixture exactly as computed by hand', () => {
    const result = replayShadow(fixtureState(), { costOf });
    expect(result.tasks).toStrictEqual({ total: 9, evaluated: 8, skippedNotFinalized: 1, verified: 7, failed: 1 });
    expect(result.totalEffectiveCost).toBe(650);
    expect(result.rules.R1).toStrictEqual({
      fired: 1, firedVerified: 0, firedFailed: 1, firedWithoutCost: 0,
      costAfterFiringFailed: 40, costAfterFiringVerified: 0, costAfterFiringFailedShare: 40 / 650, verifiedShare: 0,
    });
    expect(result.rules.R2).toStrictEqual({
      fired: 1, firedVerified: 1, firedFailed: 0, firedWithoutCost: 0,
      costAfterFiringFailed: 0, costAfterFiringVerified: 70, costAfterFiringFailedShare: 0, verifiedShare: 1 / 7, unrated: 2,
    });
    expect(result.rules.R3).toStrictEqual({ status: 'tidak tersedia', reason: expect.any(String) });
    expect(result.firings).toStrictEqual([
      { taskId: 'A', rule: 'R1', firedAtAction: 3, totalActions: 5, outcome: 'failed' },
      { taskId: 'C', rule: 'R2', firedAtAction: 13, totalActions: 20, outcome: 'verified' },
    ]);
  });

  it('returns exactly the specified fields and states every required caveat', () => {
    const result = replayShadow(fixtureState(), { costOf });
    expect(Object.keys(result).sort()).toEqual(['firings', 'notes', 'rules', 'tasks', 'totalEffectiveCost']);
    expect(Object.keys(result.rules).sort()).toEqual(['R1', 'R2', 'R3']);
    expect(Object.keys(result.rules.R2).sort()).toEqual([...Object.keys(result.rules.R1), 'unrated'].sort());
    const notes: string = result.notes.join('\n');
    for (const caveat of [
      /proxy for iterations/, /proportional to the share of actions/, /'failed' is not the same as stuck/, /finalization label/,
      /not independent verification/, /argument variation cannot be required/, /leave-one-out baseline/, /R3 .* is unavailable/,
      /No speed was measured/, /8 of 8 evaluated tasks have a cost/,
    ]) expect(notes).toMatch(caveat);
  });

  it('R1 restarts the streak on another family, resets on a granted-tool success, and ignores other episodes', () => {
    const r1 = (tokens: string, familyRun?: number) => replayShadow({ tasks: [task('T', 'w', 'finalized', 'failed', tokens)] },
      { costOf: () => 10, ...(familyRun ? { familyRun } : {}) }).firings.filter((firing: { rule: string }) => firing.rule === 'R1');
    const fired = (firedAtAction: number, totalActions: number) => [{ taskId: 'T', rule: 'R1', firedAtAction, totalActions, outcome: 'failed' }];
    expect(r1('a f:E_X a f:E_Y a f:E_X a f:E_X')).toEqual([]); // runs 1, 1, 1, 2
    expect(r1('a f:E_X a f:E_X a f:E_Y a f:E_Y a f:E_Y a')).toEqual(fired(5, 6)); // the third E_Y comes after five actions
    expect(r1('a f:E_X a f:E_X ok a f:E_X')).toEqual([]); // the success resets the run
    expect(r1('a f:E_X h a f:E_X o a f:E_X')).toEqual(fired(3, 3)); // a hypothesis and a non-success observation neither reset nor count
    expect(r1('a f:E_X a f:E_X', 2)).toEqual(fired(2, 2)); // familyRun is a parameter
    const noActions = replayShadow({ tasks: [task('T', 'w', 'finalized', 'failed', 'f:E_X f:E_X f:E_X')] }, { costOf: () => 10 });
    expect(noActions.firings[0]).toMatchObject({ rule: 'R1', firedAtAction: 0, totalActions: 0 });
    expect(noActions.rules.R1.costAfterFiringFailed).toBe(0); // no division by zero
  });

  it('R1 keys the streak by tool and summary: the same summary from different tools never builds a run', () => {
    expect(r1Firings('a f:E_X@t1 a f:E_X@t2 a f:E_X@t3')).toEqual([]); // runs 1, 1, 1
    expect(r1Firings('a f:E_X@t1 a f:E_X@t2 a f:E_X@t1 a f:E_X@t2 a f:E_X@t1')).toEqual([]); // alternating tools
    expect(r1Firings('a f:E_X@t1 a f:E_Y@t1 a f:E_X@t1')).toEqual([]); // the same tool with another summary starts a new streak
  });

  it('R1 fires at the right action when the tool and the summary both repeat', () => {
    expect(r1Firings('a f:E_X@t1 a f:E_X@t1 a f:E_X@t1 a')).toEqual(firedR1(3, 4));
    expect(r1Firings('a f:E_X@t2 a f:E_X@t1 a f:E_X@t1 a f:E_X@t1')).toEqual(firedR1(4, 4)); // the streak starts at the tool change
    expect(r1Firings('a f:E_X@t1 a f:E_X@t1 ok a f:E_X@t1')).toEqual([]); // a granted-tool success still resets it
  });

  it('R1 treats a failure without a tool and a failure with one as different keys', () => {
    expect(r1Firings('a f:E_X@t1 a f:E_X a f:E_X@t1')).toEqual([]); // runs 1, 1, 1
    expect(r1Firings('a f:E_X a f:E_X a f:E_X@t1')).toEqual([]); // runs 1, 2, 1
    expect(r1Firings('a f:E_X a f:E_X a f:E_X')).toEqual(firedR1(3, 3)); // two episodes without a tool share the empty name
  });

  it('R1 does not use the coarse failureFamily field', () => {
    const firingsWith = (tokens: string, families: string[]) => {
      const item = task('T', 'w', 'finalized', 'failed', tokens);
      item.episodes.filter(entry => entry.kind === 'failure').forEach((entry, index) => Object.assign(entry, { failureFamily: families[index] }));
      return replayShadow({ tasks: [item] }, { costOf: () => 10 }).firings;
    };
    // The same tool and summary with three different coarse classes is still one streak.
    expect(firingsWith('a f:E_X@t1 a f:E_X@t1 a f:E_X@t1', ['tool-runtime', 'verification', 'provider-transport'])).toHaveLength(1);
    // One coarse class with three different summaries is no streak.
    expect(firingsWith('a f:E_X@t1 a f:E_Y@t1 a f:E_Z@t1', ['tool-runtime', 'tool-runtime', 'tool-runtime'])).toEqual([]);
  });

  it('the R1 note states how the key is built and what is not applied', () => {
    const note: string = replayShadow({ tasks: [] }, { costOf }).notes.find((line: string) => line.startsWith('R1 '));
    expect(note).toMatch(/the same \(tool, failure summary\) 3 times in a row/);
    expect(note).toMatch(/The tool is part of the key when the episode records it/);
    expect(note).toMatch(/failureFamily field is not used/);
    expect(note).toMatch(/argument variation cannot be required/);
    expect(note).toMatch(/time window is not applied/);
  });

  it('R2 fires only above the threshold, at floor(threshold) + 1, and honors its parameters', () => {
    // Five tasks of 8 actions give every probe a baseline with p90 = 8, so the threshold is 8 x 1.25 = 10.
    const withProbe = (probeActions: number) => ({ tasks: [
      ...[1, 2, 3, 4, 5].map(index => task(`base${index}`, 'ws', 'finalized', 'verified', actions(8))),
      task('probe', 'ws', 'finalized', 'verified', actions(probeActions)),
    ] });
    expect(replayShadow(withProbe(10), { costOf: () => 30 }).rules.R2).toMatchObject({ fired: 0, unrated: 0 });
    const above = replayShadow(withProbe(11), { costOf: () => 30 });
    expect(above.firings).toStrictEqual([{ taskId: 'probe', rule: 'R2', firedAtAction: 11, totalActions: 11, outcome: 'verified' }]);
    expect(above.rules.R2).toMatchObject({ fired: 1, costAfterFiringVerified: 0 });
    expect(replayShadow(withProbe(11), { costOf: () => 30, minBaseline: 6 }).rules.R2).toMatchObject({ fired: 0, unrated: 6 });
    expect(replayShadow(withProbe(11), { costOf: () => 30, p90Factor: 2 }).rules.R2.fired).toBe(0);
  });

  it('leaves the input untouched', () => {
    const input = deepFreeze(fixtureState()); // any write to a frozen object throws in a strict module
    const before = structuredClone(input);
    replayShadow(input, { costOf });
    expect(input).toEqual(before);
  });

  it('counts a task without a cost in firedWithoutCost and leaves it out of every sum', () => {
    const lacksCost = (item: { id: string }) => (item.id === 'A' ? null : item.id === 'C' ? Number.NaN : costOf(item));
    const result = replayShadow(fixtureState(), { costOf: lacksCost });
    expect(result.totalEffectiveCost).toBe(350); // 650 minus A (100) and C (200)
    expect(result.rules.R1).toMatchObject({
      fired: 1, firedFailed: 1, firedWithoutCost: 1, costAfterFiringFailed: 0, costAfterFiringFailedShare: 0,
    });
    expect(result.rules.R2).toMatchObject({
      fired: 1, firedVerified: 1, firedWithoutCost: 1, costAfterFiringVerified: 0, verifiedShare: 1 / 7,
    });
    expect(result.tasks).toStrictEqual({ total: 9, evaluated: 8, skippedNotFinalized: 1, verified: 7, failed: 1 });
    expect(result.firings).toHaveLength(2);
    expect(result.notes.join('\n')).toContain('6 of 8 evaluated tasks have a cost');
  });

  it('touches no file: not when the module is imported, not when replayShadow runs', () => {
    const traced = ['readFile', 'readFileSync', 'open', 'openSync', 'createReadStream', 'stat', 'statSync', 'lstat', 'lstatSync', 'access',
      'accessSync', 'existsSync', 'readdir', 'readdirSync', 'opendir', 'opendirSync', 'writeFile', 'writeFileSync', 'appendFile',
      'appendFileSync', 'mkdir', 'mkdirSync', 'rm', 'rmSync', 'unlink', 'unlinkSync', 'rename', 'renameSync', 'copyFile', 'copyFileSync',
      'createWriteStream'];
    // A fresh process wraps the fs entry points (and refreshes the ESM named exports) before it imports the module.
    const probe = [
      "import fs from 'node:fs';", "import { syncBuiltinESMExports } from 'node:module';", 'const calls = [];',
      `const trace = (target, prefix) => { for (const name of ${JSON.stringify(traced)}) { const original = target[name]; if (typeof original === 'function') target[name] = function (...args) { calls.push(prefix + name + ' ' + String(args[0])); return original.apply(this, args); }; } };`,
      "trace(fs, 'fs.'); trace(fs.promises, 'fsp.'); syncBuiltinESMExports();",
      `const mod = await import(${JSON.stringify(scriptUrl)}); const atImport = calls.splice(0);`,
      `const result = mod.replayShadow(${JSON.stringify({ tasks: [task('T', 'w', 'finalized', 'failed', 'a f:E_X a f:E_X a f:E_X')] })}, { costOf: () => 1 });`,
      'const atCall = calls.splice(0);',
      // Positive control: the module's own reader must show up in the trace, or an empty trace would prove nothing.
      `await mod.readState(${JSON.stringify(path.join(folder, 'control', 'state.json'))});`,
      'process.stdout.write(JSON.stringify({ atImport, atCall, control: calls.splice(0), fired: result.rules.R1.fired }));',
    ].join(' ');
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' });
    expect({ status: run.status, stderr: run.stderr }).toMatchObject({ status: 0 });
    const seen = JSON.parse(run.stdout);
    expect(seen.fired).toBe(1);
    expect(seen.control.some((call: string) => call.includes('control'))).toBe(true);
    expect(seen.atCall).toEqual([]);
    expect(seen.atImport.filter((call: string) => /state\.json/i.test(call))).toEqual([]);
  }, 30_000);
});

describe('shadow replay report and CLI', () => {
  it('renders one table per rule, the notes and at most 20 firings, with ? where nothing can be computed', () => {
    const result = replayShadow(fixtureState(), { costOf });
    const text: string = renderReport(result, { source: path.join('somewhere', 'state.json'), costSource: 'test cost source' });
    expect(text).toContain('Source: `state.json`');
    expect(text).not.toContain('somewhere');
    expect(text).toContain('Cost: test cost source');
    expect(text).toContain('| Total effective cost (weighted tokens, tasks with a cost) | 650 |');
    expect(text).toContain('## R1: repeated failure family');
    expect(text).toContain('## R2: long task');
    expect(text).toContain('## R3: edit churn per file');
    expect(text).toMatch(/\| that cost as a share of total effective cost \| 6\.2% \|/);
    expect(text).toMatch(/\| Verified tasks touched, as a share of all verified tasks \| 14\.3% \|/);
    expect(text).toMatch(/\| Unrated \(baseline too small, never fired\) \| 2 \|/);
    expect(text).toContain('| Status | tidak tersedia |');
    expect(text).toContain('- No speed was measured.');
    expect(text).toContain('| A | R1 | 3 | 5 | failed |');
    expect(text).toContain('| C | R2 | 13 | 20 | verified |');
    const empty: string = renderReport(replayShadow({ tasks: [] }, { costOf }));
    expect(empty).toMatch(/\| Verified tasks touched, as a share of all verified tasks \| \? \|/);
    expect(empty).toContain('No rule fired on any evaluated task.');
    const firings = Array.from({ length: 25 }, (_, index) => ({ taskId: `t${index}`, rule: 'R1', firedAtAction: 3, totalActions: 5, outcome: 'failed' }));
    const many: string = renderReport({ ...result, firings });
    expect(many).toContain('showing 20 of 25');
    expect(many).toContain('| t19 |');
    expect(many).not.toContain('| t20 |');
  });

  it('main reads the state file read-only and prints the report', async () => {
    const file = path.join(folder, 'state.json');
    writeFileSync(file, JSON.stringify(fixtureState()));
    const before = readFileSync(file);
    let out = '';
    await main(['--state', file], { loadCost: async () => costOf, write: (chunk: string) => { out += chunk; } });
    expect(out).toContain('| Total effective cost (weighted tokens, tasks with a cost) | 650 |');
    expect(out).toContain('effectiveTaskCost (V1, dist/effective-cost.js)');
    expect(out).not.toMatch(/ActivityTracker|runtime\/tracker/); // the cost module is a leaf, so the report claims no side effect
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('main shows ? and loads no cost source when the state cannot be read', async () => {
    writeFileSync(path.join(folder, 'broken.json'), '{ not json');
    writeFileSync(path.join(folder, 'no-tasks.json'), '{"version":1}');
    for (const [name, reason] of [['missing.json', 'ENOENT'], ['broken.json', 'invalid JSON'], ['no-tasks.json', 'no tasks array']]) {
      let loads = 0;
      let out = '';
      await main(['--state', path.join(folder, name)], {
        loadCost: async () => { loads += 1; return costOf; },
        write: (chunk: string) => { out += chunk; },
      });
      expect(loads).toBe(0); // nothing to replay, so the cost module is never loaded
      expect(out).toContain(`could not be read (${reason})`);
      expect(out).toMatch(/\| Tasks in the state \| \? \|/);
      expect(out).not.toMatch(/\| Tasks in the state \| 0 \|/);
    }
  });

  it('the CLI prints ? for an unreadable state and refuses a bad option, without loading dist', () => {
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    const missing = run('--state', path.join(folder, 'missing.json'));
    expect(missing.status).toBe(0);
    expect(missing.stdout).toContain('every value is ?');
    const unknown = run('--bogus');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('unknown option --bogus');
    const noFile = run('--state');
    expect(noFile.status).toBe(1);
    expect(noFile.stderr).toContain('--state needs a file');
  }, 30_000);

  it('the cost module the CLI loads has no runtime dependency, so loading it cannot reach the activity tracker', () => {
    const text = readFileSync(fileURLToPath(new URL('../src/effective-cost.ts', import.meta.url)), 'utf8');
    const references = text.split(/\r?\n/).filter(line => /^\s*import\b|^\s*export\b.*\bfrom\b|\bimport\(|\brequire\(/.test(line));
    expect(references).toEqual(["import type { AgentTaskMetrics } from './agent-learning-loop.js';"]); // a type-only reference is erased at build
  });
});
