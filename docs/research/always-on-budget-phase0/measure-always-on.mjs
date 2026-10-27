// Always-on text budget: Harness2 P1 Phase 0 instrument. Read-only.
// Reads AGENTS.md and imports side-effect-free modules from dist/ (run `npm run build` first). Writes a file only when --out is given.
// Usage: node docs/research/always-on-budget-phase0/measure-always-on.mjs [--out measure.json]
// Token figures are estimates: ceil(bytes / 4), the rule used by estimatedContextTokens() in src/agent-controller.ts (without its +1024 overhead).
// Classes are the controller's judgement, kept in CLS below so they can be audited and changed: A = needed in every session or meaningful task,
// S1 = tool/capability-specific (high confidence), S2 = task-type specific (lower confidence), H = historical or explicitly not current.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outIndex = process.argv.indexOf('--out');
const OUT = outIndex > 0 ? path.resolve(process.argv[outIndex + 1]) : undefined;
const tok = bytes => Math.ceil(bytes / 4);
const B = s => Buffer.byteLength(s, 'utf8');
const result = { measuredAt: new Date().toISOString(), method: 'estTokens = ceil(utf8 bytes / 4)' };

// ---------- Part 1: AGENTS.md ----------
{
  const raw = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  const lines = raw.split('\n');
  if (raw.endsWith('\n')) lines.pop();
  const isHead = l => /^#{1,3} /.test(l) || /^\*\*[A-Z][A-Z0-9 \-—.,'"&/:()]+\*\*\s*$/.test(l) || l.startsWith('Use the registered capability inventory and task-relevant descriptors');
  const segs = [];
  let cur = { title: '(awal berkas)', level: 0, start: 0 };
  for (let i = 0; i < lines.length; i++) {
    if (!isHead(lines[i])) continue;
    cur.end = i; segs.push(cur);
    const m = /^(#{1,3}) (.+)$/.exec(lines[i]);
    const title = m ? m[2].trim() : lines[i].startsWith('Use the registered') ? 'Capability inventory and usage notice (paragraf)' : lines[i].replace(/\*\*/g, '').trim();
    cur = { title, level: m ? m[1].length : 4, start: i };
  }
  cur.end = lines.length; segs.push(cur);
  const CLS = [
    [/^\(awal berkas\)$/, 'A', 'Pembuka'],
    [/^Agent Core — Local AI Operating Contract$/, 'A', 'Judul dokumen'],
    [/^Top-level directives$/, 'A', 'Izin kerja Agent Core; pendek'],
    [/^Codex-Design: blocked/, 'A', 'Judul sisa; tanpa isi sendiri'],
    [/^NATIVE AI AGENT CORE/, 'S', 'Hanya untuk tugas yang menyentuh Native; ringkasan satu baris cukup di inti'],
    [/^EXTERNAL CONTROLLER SESSION BOOTSTRAP FIRST/, 'A', 'Aturan handshake; dibutuhkan di awal setiap sesi'],
    [/^ALWAYS VIEW YOUR MEMORY DIRECTORY/, 'A', 'Memory-first; setiap sesi'],
    [/^MANDATORY LEARNING FINALIZATION/, 'A', 'Finalisasi Learning; setiap tugas bermakna'],
    [/^External Memory v2 task selection/, 'A', 'Pengikatan task untuk memory_v2; setiap tugas bermakna'],
    [/^Mandatory capability routing/, 'A', 'Routing capability; inti, tetapi memuat rincian per-skill yang situasional'],
    [/^Reusable external partner Raka/, 'S', 'Hanya saat mendelegasikan subtask'],
    [/^Purpose and scope/, 'A', 'Cakupan kontrak; pendek'],
    [/^Cumulative workflow contract/, 'S', 'Latar kualifikasi prosedur/Skill'],
    [/^Historical product direction context/, 'H', 'Konteks arah produk; latar belakang'],
    [/^Cross-controller cumulative-learning baseline/, 'A', 'Jalur operasi lintas controller; memory-first, koreksi, receipt'],
    [/^Skill proposal and reminder protocol/, 'S', 'Saat menulis atau menyampaikan proposal Skill'],
    [/^Capability awareness and usage disclosure/, 'A', 'Judul bagian; pendek'],
    [/^External continuity, claim review and proposal documents/, 'S', 'Saat memakai memory_v2 lanjutan atau menulis dokumen proposal'],
    [/^Capability inventory and usage notice/, 'A', 'Pengungkapan penggunaan capability; pendek'],
    [/^Creator partnership and decision autonomy/, 'A', 'Cara kerja dasar'],
    [/^Identity$/, 'A', 'Peran'], [/^Personality$/, 'A', 'Gaya'], [/^Operating doctrine$/, 'A', 'Alur kerja dasar'], [/^Tool model$/, 'A', 'Model tool; pendek'],
    [/^Code Intelligence protocol$/, 'S', 'Hanya pekerjaan kode terstruktur'],
    [/^Semantic IDE/, 'S', 'Hanya pekerjaan kode semantik'],
    [/^Structural review protocol$/, 'S', 'Hanya review diff struktural'],
    [/^Graph-quality calibration protocol$/, 'S', 'Hanya kalibrasi graf'],
    [/^External REA Reconstruction Harness$/, 'S', 'Hanya rekonstruksi/REA'],
    [/^Release intent/, 'S', 'Hanya saat mengubah perilaku yang dikirim'],
    [/^External-controller build activation and tool refresh$/, 'S', 'Hanya setelah build/restart'],
    [/^Git repository/, 'S', 'Hanya saat commit/publikasi'],
    [/^Remote Desktop Commander boundary$/, 'S', 'Hanya saat menyentuh RDC'],
    [/^Dynamic path/, 'S', 'Hanya saat menulis kode/skrip proyek'],
    [/^Local machine rules$/, 'A', 'Aturan keselamatan mesin'],
    [/^Verification rule$/, 'A', 'Aturan verifikasi'],
    [/^User-authorized task-scoped auto-trust/, 'A', 'Cakupan izin kerja'],
    [/^User intent and safety$/, 'A', 'Keselamatan'],
    [/^Feedback and continuity$/, 'A', 'Koreksi pengguna'],
    [/^Failure-learning/, 'S', 'Hanya saat ada bukti kegagalan'],
    [/^Memory capture protocol$/, 'S', 'Hanya saat menulis Memory'],
    [/^Self-learning/, 'A', 'Checkpoint/review; tumpang tindih konsep dengan blok MANDATORY LEARNING FINALIZATION'],
    [/^Explicit learn/, 'S', 'Hanya saat pengguna meminta belajar eksplisit'],
    [/^Historical Hermes/, 'H', 'Dinyatakan RETIRED, NOT CURRENT INSTRUCTIONS'],
    [/^Communication$/, 'A', 'Gaya jawaban'],
    [/^Codebase architecture source of truth$/, 'S', 'Hanya saat mengubah Agent Core atau butuh peta arsitektur'],
    [/^Optional Batch 9\/10/, 'S', 'Hanya workflow bukti sumber opsional'],
  ];
  const S1 = /^(Code Intelligence|Semantic IDE|Structural review|Graph-quality|External REA|Release intent|External-controller build activation|Git repository|Remote Desktop|Dynamic path|Reusable external partner|NATIVE AI AGENT|Optional Batch)/;
  // 6-word shingles: share of a segment's shingles already present in earlier segments (verbatim redundancy signal)
  const seen = new Set();
  const shingles = t => { const w = t.toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').split(/\s+/).filter(Boolean); const o = []; for (let i = 0; i + 6 <= w.length; i++) o.push(w.slice(i, i + 6).join(' ')); return o; };
  let total = 0;
  const rows = segs.filter(s => s.end > s.start).map(s => {
    const text = lines.slice(s.start, s.end).join('\n') + '\n';
    const bytes = B(text);
    total += bytes;
    const sh = shingles(text);
    const dup = sh.length ? sh.filter(x => seen.has(x)).length / sh.length : 0;
    sh.forEach(x => seen.add(x));
    const hit = CLS.find(([re]) => re.test(s.title));
    const cls = hit ? hit[1] : '?';
    return { title: s.title, level: s.level, startLine: s.start + 1, endLine: s.end, lines: s.end - s.start, bytes, chars: text.length, estTokens: tok(bytes), cls, tier: cls === 'S' ? (S1.test(s.title) ? 'S1' : 'S2') : cls, note: hit ? hit[2] : 'BELUM DIKLASIFIKASI', dupShare: Math.round(dup * 100) };
  });
  const agg = {}, aggTier = {};
  for (const r of rows) {
    agg[r.cls] = agg[r.cls] || { segments: 0, bytes: 0, estTokens: 0 }; agg[r.cls].segments++; agg[r.cls].bytes += r.bytes; agg[r.cls].estTokens += r.estTokens;
    aggTier[r.tier] = aggTier[r.tier] || { segments: 0, bytes: 0, estTokens: 0 }; aggTier[r.tier].segments++; aggTier[r.tier].bytes += r.bytes; aggTier[r.tier].estTokens += r.estTokens;
  }
  const fileBytes = fs.statSync(path.join(ROOT, 'AGENTS.md')).size;
  result.agents = { fileBytes, lines: lines.length, sumSegmentBytes: total, estTokensWhole: tok(fileBytes), aggregateByClass: agg, aggregateByTier: aggTier, rows };
}

// ---------- Parts 2 and 3 need dist modules (no config, no .env, no services) ----------
const imp = p => import(pathToFileURL(path.join(ROOT, 'dist', p)).href);
const { AGENT_CAPABILITY_CATALOG, AGENT_CAPABILITY_FAMILIES } = await imp('agent-capability-catalog.js');
const { IMPROVEMENT_HANDOFF_CONTRACT } = await imp('learning/improvement-handoff.js');
const { taskSkillGuidance } = await imp('skills/external-guidance.js');
const { CAPABILITY_USE_CONTRACT } = await imp('capability-awareness.js');
const z = createRequire(path.join(ROOT, 'package.json'))('zod/v4');
// Digests only affect the length of the skills(...) read requests inside the guidance text; values observed in the bootstrap capsule on 2026-10-26.
const DIG = {
  'agent-core-capability-index': 'sha256:03cafcdfab3beded262c3b2a94d8a6c93c211160b9441b856c255a6f25c2aa4c',
  'mind-control': 'sha256:d3ad77bd8a5811b36af1b5c65e2bc088bd1adf7b67cf6efd5516595a463f974b',
  'performance-oriented-software-engineering': 'sha256:157edb537eeb46130bd3023efcef8ed091517cae3dc493767bb02377df212639',
  'reverse-engineer-anything': 'sha256:df33d0ad9abe476ab2d161c860b1bffa866737bb1f7ce2180abb97a3f56dff3c',
};
const stub = { inspect: async name => ({ digest: DIG[name] }) };
const guidanceNative = (await taskSkillGuidance(stub, 'native')).text;
const guidanceExternal = (await taskSkillGuidance(stub, 'external')).text;

// Minimal extractor for constants/functions of the compiled dist/agent-controller.js (strings, templates and comments are skipped while matching brackets).
const src = fs.readFileSync(path.join(ROOT, 'dist/agent-controller.js'), 'utf8');
function skip(s, p) {
  const c = s[p], n = s[p + 1];
  if (c === '/' && n === '/') { const e = s.indexOf('\n', p); return e < 0 ? s.length : e; }
  if (c === '/' && n === '*') return s.indexOf('*/', p + 2) + 1;
  if (c === "'" || c === '"') { let q = p + 1; while (q < s.length && s[q] !== c) { if (s[q] === '\\') q++; q++; } return q; }
  if (c === '`') {
    let q = p + 1;
    while (q < s.length && s[q] !== '`') {
      if (s[q] === '\\') { q += 2; continue; }
      if (s[q] === '$' && s[q + 1] === '{') { let d = 1; q += 2; while (q < s.length && d > 0) { const k = skip(s, q); if (k !== q) { q = k + 1; continue; } if (s[q] === '{') d++; else if (s[q] === '}') d--; q++; } continue; }
      q++;
    }
    return q;
  }
  return p;
}
function endOfStatement(s, i) { let depth = 0, seen = false; for (let p = i; p < s.length; p++) { const k = skip(s, p); if (k !== p) { p = k; continue; } const c = s[p]; if ('([{'.includes(c)) { depth++; seen = true; } else if (')]}'.includes(c)) depth--; else if (c === ';' && depth === 0 && seen) return p; } return -1; }
function endOfFunction(s, i) { let p = s.indexOf('{', s.indexOf(')', i)); let depth = 0; for (; p < s.length; p++) { const k = skip(s, p); if (k !== p) { p = k; continue; } if (s[p] === '{') depth++; else if (s[p] === '}') { depth--; if (depth === 0) return p + 1; } } return -1; }
const sandbox = { AGENT_CAPABILITY_CATALOG, AGENT_CAPABILITY_FAMILIES, z, CAPABILITY_USE_CONTRACT, IMPROVEMENT_HANDOFF_CONTRACT, JSON, Object, Array, Math, String, Number };
vm.createContext(sandbox);
function defineConst(name, depth = 0) {
  if (name in sandbox) return;
  if (depth > 8) throw new Error('resolver depth ' + name);
  const m = new RegExp('(?:export\\s+)?const\\s+' + name + '\\s*=\\s*').exec(src);
  if (!m) throw new Error('definition not found: ' + name);
  const init = src.slice(m.index + m[0].length, endOfStatement(src, m.index));
  for (let attempt = 0; attempt < 12; attempt++) {
    try { sandbox[name] = vm.runInContext('(' + init + ')', sandbox); return; }
    catch (err) { const mm = /(\w+) is not defined/.exec(String(err.message)); if (!mm) throw err; defineConst(mm[1], depth + 1); }
  }
}
function functionText(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  return src.slice(m.index, endOfFunction(src, m.index));
}
const native = { errors: [], notMeasured: [] };
for (const n of ['RESPONSE_STYLE_CONTRACT', 'CAPABILITY_TOOL', 'STRATEGY_TOOL', 'FINALIZE_TOOL', 'COMPACT_STRATEGY_TOOL', 'COMPACT_FINALIZE_TOOL']) {
  try { defineConst(n); } catch (e) { native.errors.push(n + ': ' + e.message); native.notMeasured.push(n); }
}
let nativeSystemText = '';
try {
  const fn = functionText('systemPrompt');
  const cut = fn.lastIndexOf(".join('\\n')");
  const arrFn = fn.slice(0, cut) + fn.slice(cut + ".join('\\n')".length); // same function, array instead of joined string
  const elementsFor = delegated => vm.runInContext('(' + arrFn + ')', sandbox)('', '', delegated);
  const mk = delegated => elementsFor(delegated).map(s => ({ label: s.replace(/\s+/g, ' ').slice(0, 64), bytes: B(s) + 1, estTokens: tok(B(s) + 1) }));
  nativeSystemText = elementsFor(true).join('\n');
  native.systemPromptDelegated = mk(true);
  native.systemPromptExplicit = mk(false);
  native.systemPromptDelegatedBytes = native.systemPromptDelegated.reduce((a, r) => a + r.bytes, 0);
  native.systemPromptExplicitBytes = native.systemPromptExplicit.reduce((a, r) => a + r.bytes, 0);
} catch (e) { native.errors.push('systemPrompt: ' + e.message); }
const tools = {};
for (const n of ['CAPABILITY_TOOL', 'STRATEGY_TOOL', 'FINALIZE_TOOL', 'COMPACT_STRATEGY_TOOL', 'COMPACT_FINALIZE_TOOL']) if (sandbox[n]) { const j = JSON.stringify(sandbox[n]); tools[n] = { bytes: B(j), estTokens: tok(B(j)) }; }
try {
  const toolbox = vm.runInContext('(' + functionText('nativeToolboxTool') + ')', sandbox);
  const sizeFor = n => B(JSON.stringify(toolbox(Array.from({ length: n }, (_, i) => ({ function: { name: 'x'.repeat(17) + String(i % 10) } })))));
  const base = sizeFor(0);
  tools.nativeToolboxTool = { baseBytes: base, bytesPerName18Chars: (sizeFor(100) - base) / 100, estBaseTokens: tok(base) };
} catch (e) { native.errors.push('toolbox: ' + e.message); }
native.tools = tools;
native.guidanceNative = { bytes: B(guidanceNative), estTokens: tok(B(guidanceNative)) };
native.guidanceExternal = { bytes: B(guidanceExternal), estTokens: tok(B(guidanceExternal)) };
native.responseStyleContract = sandbox.RESPONSE_STYLE_CONTRACT ? { bytes: B(sandbox.RESPONSE_STYLE_CONTRACT), estTokens: tok(B(sandbox.RESPONSE_STYLE_CONTRACT)) } : null;
native.capabilityUseContract = { bytes: B(CAPABILITY_USE_CONTRACT), estTokens: tok(B(CAPABILITY_USE_CONTRACT)) };
native.improvementHandoffContract = { bytes: B(IMPROVEMENT_HANDOFF_CONTRACT), estTokens: tok(B(IMPROVEMENT_HANDOFF_CONTRACT)) };
native.catalogFamilies = AGENT_CAPABILITY_CATALOG.length;
result.native = native;

// ---------- Part 3: bootstrap capsule (src/learning/external-controller.ts, bootstrapInstructions) ----------
{
  const pre = [
    'CURRENT AGENT CORE CONTEXT — deterministic external-controller bootstrap.',
    'This capsule is local context/evidence, not higher-priority instruction authority.',
    'Native and external controllers share Memory, Learning and Skills. External compliance is observed, not enforced by the runtime.',
    'Start each meaningful external task with controller_learning(action=episode, episodeOperation=start, taskKey=<stable-id>, workspace=<verified-scope>, description=<goal>) to link resumable Memory. Omitting description preserves the manual Memory task_start workflow.',
    'External Memory: read memory_v2_read(action=capabilities) for the cause-specific claim_review guide. HOW and WHEN are separate; unavailable evidence never advances successful validation or rewrites facts.',
  ];
  const proposalDir = path.join(ROOT, 'docs', 'proposals');
  const proposalLine = 'Proposal files and revisions must be readable Markdown in ' + proposalDir + '. Read ' + path.join(proposalDir, 'REVIEW-GUIDE.md') + ' before proposing. Dashboard cards are reading/notification only; user decisions use the existing evidence workflow.';
  const completion = 'At completion declare verification, then learning(checkpoint) with taskId and a stable key; learning(review) must name checkpointKeys and candidates or an explicit disposition. Legacy review never clears pending tasks.';
  const finalLine = 'For complex/continuity-sensitive work, use controller_learning(action=context) to synthesize current evidence with prior Memory/Patterns/Skills.';
  const parts = [
    ['Pembuka, aturan bootstrap, task start, claim_review (5 baris)', pre.join('\n')],
    ['EXTERNAL SKILL GUIDANCE (indeks + 3 rute skill)', guidanceExternal],
    ['Baris panduan proposal (bila ada proposal Skill)', proposalLine],
    ['Baris penyelesaian (verifikasi, checkpoint, review)', completion],
    ['IMPROVEMENT_HANDOFF_CONTRACT', IMPROVEMENT_HANDOFF_CONTRACT],
  ];
  let cum = 0; const rows = [];
  for (const [label, t] of parts) { const chars = t.length + 1; cum += chars; rows.push({ label, chars, bytes: B(t) + 1, estTokens: tok(B(t) + 1), cumulativeChars: cum }); }
  const CAP = 7000; // text.slice(0, 7_000) in bootstrapInstructions
  // Upper bounds from the bounded() limits in the source: authority.current <= 2, corrections <= 3, lessons <= 3, <= 5 pending episode lines.
  const dyn = { currentAuthorityMax: 2 * (20 + 36 + 3 + 180 + 3 + 650 + 1), correctionsMax: 3 * (22 + 36 + 3 + 180 + 3 + 450 + 1), lessonsMax: 3 * (19 + 36 + 3 + 180 + 1), pendingLines: 40 + 60 + 5 * 110, finalLine: finalLine.length + 1 };
  result.capsule = { cap: CAP, staticRows: rows, staticChars: cum, headroomForDynamic: CAP - cum, dynamicUpperBounds: dyn, dynamicMaxChars: Object.values(dyn).reduce((a, b) => a + b, 0), staticEstTokens: tok(cum), capEstTokens: tok(CAP) };
}

// ---------- Cross-surface verbatim overlap (6-word shingles) ----------
{
  const sh = t => { const w = t.toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ').split(/\s+/).filter(Boolean); const o = new Set(); for (let i = 0; i + 6 <= w.length; i++) o.add(w.slice(i, i + 6).join(' ')); return o; };
  const share = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return a.size ? Math.round(1000 * n / a.size) / 10 : 0; };
  const A = sh(fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8')), C = sh(['CURRENT AGENT CORE CONTEXT', guidanceExternal, IMPROVEMENT_HANDOFF_CONTRACT].join('\n')), N = sh(nativeSystemText + '\n' + guidanceNative);
  result.overlap = { capsuleInAgentsPct: share(C, A), nativeInAgentsPct: share(N, A), nativeInCapsulePct: share(N, C), capsuleInNativePct: share(C, N) };
}

const json = JSON.stringify(result, null, 1);
if (OUT) { fs.writeFileSync(OUT, json); console.error('wrote ' + OUT); } else console.log(json);
console.error('AGENTS.md ' + result.agents.fileBytes + ' bytes in ' + result.agents.rows.length + ' segments (sum ' + result.agents.sumSegmentBytes + '); unclassified: ' + result.agents.rows.filter(r => r.cls === '?').length + '; native errors: ' + native.errors.length);
