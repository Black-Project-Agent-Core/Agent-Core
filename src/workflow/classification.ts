import type { WorkflowBindInput, WorkflowClassificationEvent, WorkflowClassificationProvenance } from './types.js';
import { workflowHash } from './store.js';

export const WORKFLOW_CLASSIFICATION_VERSION = 'workflow-intent-v2';
const ACTION = '(?:build|implement|develop|create|refactor|fix|debug|integrate|transplant|adapt|reuse|port|write|code|buat|membuat|bikin|tambah|menambahkan|ubah|bangun|membangun|perbaiki|integrasikan|adaptasi|ambil|mengambil|terapkan|craft|steal)';
const LEAD = '(?:(?:please|tolong|silakan|silahkan|now|sekarang|then|lalu|kemudian|and|dan|also|juga)\\s+)*(?:(?:can|could|would|will)\\s+you\\s+|(?:i|we)\\s+(?:want|need|would like)\\s+(?:you\\s+)?to\\s+|(?:aku|saya|kami)\\s+(?:ingin|mau|minta|perlu)\\s+(?:(?:kamu|anda)\\s+)?(?:untuk\\s+)?|you\\s+(?:must|should|need to)\\s+)?';
const directive = new RegExp('^\\s*' + LEAD + '(' + ACTION + ')\\b', 'i');
const nextAction = new RegExp('\\b(?:then|lalu|kemudian|and then|dan kemudian)\\s+(?=' + LEAD + ACTION + '\\b)|\\b(?:and|dan)\\s+(?=' + LEAD + ACTION.replace('|code', '').replace('|craft', '') + '\\b)', 'i');
const retrospective = /\b(?:(?:has|have|was|were|is|are)\s+(?:already\s+)?(?:been\s+)?(?:tested|implemented|completed|verified)|(?:sudah|telah|selesai)\s+(?:diuji|diimplementasikan|diverifikasi))\b/i;
const sourcePattern = /https:\/\/[^\s"'<>]+|(?:[A-Za-z]:[\\/]|(?:\.{1,2}|[\w.-]+)[\\/])[\w./\\-]+|\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|swift|rb|php|lua|sh|bash|ps1|pl|ex|exs|erl|hs|scala|dart|r|sql|html|css|scss|vue|svelte|zig|nim|jl|clj|f|f90|pas|m|mm|sol)\b/gi;
const codeExtension = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|swift|rb|php|lua|sh|bash|ps1|pl|ex|exs|erl|hs|scala|dart|r|sql|html|css|scss|vue|svelte|zig|nim|jl|clj|f|f90|pas|m|mm|sol|git)(?:[?#].*)?$/i;
const multiStage = /\b(?:and|then|after|before|integration|integrate|integrasi|dengan|kemudian|lalu|dan)\b/i;

function withoutReferences(value: string): string { return value.replace(sourcePattern, ' '); }
function units(value: string): string[] {
  // Fenced examples and quoted Markdown are evidence, not new requested operations.
  return value.replace(/```[\s\S]*?(?:```|$)/g, ' ').split(/\r?\n|;|[.!?](?=\s|$)/)
    .map(s => s.trim()).filter(s => s && !/^>|^(?:background|history|previous result|hasil sebelumnya|catatan historis)\s*:/i.test(s))
    .map(s => s.replace(/^(?:[-*+]|\d+[.)])\s+/, ''));
}
function activeParts(unit: string): string[] {
  if (/^\s*(?:(?:please|tolong)\s+)?(?:do not|don't|jangan|tidak perlu)\b/i.test(unit)) return [];
  return unit.split(nextAction).map(s => s.trim().split(/\b(?:and|dan|then|lalu|kemudian)\s+(?=(?:explain|describe|review|audit|verify|check|test|jelaskan|periksa|uji|verifikasi)\b)/i)[0]!).filter(part => {
    const match = directive.exec(withoutReferences(part));
    if (!match) return false;
    // These words can be nouns in a status sentence; other imperative verbs remain
    // instructions even when their donor is described as previously tested.
    const instruction = part.replace(/\b(?:that|which|yang)\s+(?:was|were|is|are|has|have|sudah|telah)\b[\s\S]*$/i, '');
    return !/^(?:craft|code)$/i.test(match[1]!) || !retrospective.test(instruction);
  });
}
function linkedSource(unit: string): boolean {
  const sources: string[] = [];
  const marked = unit.replace(sourcePattern, ref => ` SOURCE_REFERENCE_${sources.push(ref) - 1} `);
  const links = marked.matchAll(/\b(?:from|dari|using|menggunakan|berdasarkan|donor|adapt|adaptasi|reuse|port|porting|transplant|steal)\s+(?:(?:the|a|an|this|existing|repo|repository|file|folder|source|code|donor)\s+)*["'`]?\s*SOURCE_REFERENCE_(\d+)\b/gi);
  for (const link of links) {
    const source = sources[Number(link[1])]!;
    const nonCodeFile = /\.[a-z0-9]{1,10}(?:[?#].*)?$/i.test(source) && !codeExtension.test(source);
    if (!nonCodeFile || /\b(?:donor|transplant|reuse|port|porting|steal|adapt|adaptasi)\b/i.test(withoutReferences(unit))) return true;
  }
  return false;
}
function hasFeature(part: string): boolean {
  const object = withoutReferences(part).replace(directive, ' ').replace(/\b(?:a|an|the|this|that|it|from|dari|using|menggunakan|berdasarkan|donor|repo|repository|source|file|folder|into|to|in|ke|di|and|then|lalu|kemudian|dan)\b/gi, ' ');
  return /[\p{L}\p{N}]{2}/u.test(object);
}
function externalObject(part: string): boolean {
  return /^(?:create|open|update|delete|configure|buat|membuat|buka|ubah|hapus)\s+(?:(?:a|an|the|new|sebuah|baru)\s+)*(?:(?:github|gitlab)\s+)?(?:issue|pull\s+request|pr|release)\b/i.test(part.replace(new RegExp('^\\s*' + LEAD, 'i'), ''))
    || /\blangflow\s+(?:flow|nodes?)\b/i.test(part);
}

export function classifyWorkflowInput(input: WorkflowBindInput, now: number): WorkflowClassificationEvent {
  const inspected = (['brief', 'context'] as const).flatMap(field => units(input[field] ?? '').map(text => ({ field, text, active: activeParts(text) })));
  const active = inspected.filter(unit => unit.active.length);
  const craftUnits = active.filter(unit => unit.active.some(part => linkedSource(part) && hasFeature(part))
    || /^(?:review|inspect|audit|periksa|tinjau)\b/i.test(unit.text) && nextAction.test(unit.text)
      && linkedSource(unit.text.split(nextAction)[0]!) && unit.active.some(hasFeature));
  const craftRequired = Boolean(input.craft) || craftUnits.length > 0;
  const coding = active.some(unit => unit.active.some(part => !externalObject(part)
    || /\b(?:implement|develop|refactor|transplant|integrasikan|bangun|membangun|perbaiki)\b|\b(?:write|create|build|buat)\s+(?:(?:a|an|the|new|native)\s+)*(?:code|source|typescript|javascript|python|module|function|class|package)\b/i.test(part)));
  const dagRequired = input.workflow === 'dag' || craftRequired || coding && (active.length > 1 || active.some(unit => multiStage.test(unit.text)));
  const atomic = !dagRequired && active.length === 1 && active[0]!.active.length === 1
    && /\b(?:typo|spelling|ejaan|whitespace|salah ketik|label|comment|komentar|rename)\b/i.test(active[0]!.text);
  const planRequired = craftRequired || dagRequired || coding && !atomic;
  const reasons: string[] = [];
  if (input.craft) reasons.push('STRUCTURED_CRAFT_REQUEST');
  if (craftUnits.length) reasons.push('REQUESTED_SOURCE_ADAPTATION');
  if (input.workflow === 'dag') reasons.push('EXPLICIT_DAG_REQUEST');
  if (coding) reasons.push(atomic ? 'ATOMIC_EDIT_REQUEST' : 'IMPLEMENTATION_REQUEST');
  if (!reasons.length) reasons.push('NO_IMPLEMENTATION_REQUEST');
  return {
    at: now, inputHash: workflowHash(JSON.stringify(input)), brief: input.brief,
    ...(input.context !== undefined ? { context: input.context } : {}), workflow: input.workflow ?? 'auto',
    ...(input.craft ? { structuredCraftHash: workflowHash(JSON.stringify(input.craft)) } : {}),
    result: { craftRequired, dagRequired, planRequired }, reasons,
    clauses: active.map(({ field, text }) => ({ field, text })),
  };
}

export function classificationProvenance(previous: WorkflowClassificationProvenance | undefined,
  flags: { craftRequired: boolean; dagRequired: boolean; planRequired: boolean; version: number; stateHash: string } | null,
  event: WorkflowClassificationEvent): WorkflowClassificationProvenance {
  const obligations = { ...previous?.obligations };
  for (const key of ['craftRequired', 'dagRequired', 'planRequired'] as const) {
    if (event.result[key] && !obligations[key]) obligations[key] = event;
  }
  return {
    policyVersion: WORKFLOW_CLASSIFICATION_VERSION, latest: event, obligations,
    ...(previous?.legacy ? { legacy: previous.legacy } : !previous && flags ? { legacy: flags } : {}),
  };
}
