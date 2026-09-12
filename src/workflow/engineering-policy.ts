import * as z from 'zod/v4';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { engineeringDiscoveryResultSchema, engineeringImpactResultSchema, engineeringInventorySchema, engineeringFacilitiesSchema } from './engineering-types.js';

export const ENGINEERING_POLICY_VERSION = 'engineering-v1' as const;
const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(8000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const ENGINEERING_CHOICES = ['existing', 'native', 'installed', 'donor', 'custom'] as const;
const choice = z.enum(ENGINEERING_CHOICES);
const justification = z.strictObject({ reason: text, evidenceReceiptIds: z.array(id).min(1).max(50) });
export const engineeringAssessmentSchema = z.strictObject({
  discoveryReceiptId: id,
  impactReceiptId: id,
  decisions: z.array(justification.extend({
    requirement: text, choice, facility: text.optional(),
    alternatives: z.array(justification.extend({ choice, conclusion: z.enum(['insufficient', 'not_applicable']) })).max(4),
  })).min(1).max(100),
  targets: z.array(justification.extend({ path: text, requirementIndexes: z.array(z.number().int().nonnegative()).min(1).max(100) })).max(100),
  callerDispositions: z.array(justification.extend({ callerId: id, disposition: z.enum(['unchanged', 'planned_change']) })).max(500),
  limitations: z.array(justification.extend({ limitationId: id, checkIds: z.array(id).min(1).max(30) })).max(200),
});
export type EngineeringAssessment = z.infer<typeof engineeringAssessmentSchema>;

export const engineeringFindingSchema = z.strictObject({
  id, kind: z.enum(['duplicate_structure', 'delegation_wrapper', 'limited_abstraction', 'new_configuration', 'new_dependency']),
  path: text, line: z.number().int().positive(), message: text,
  evidencePaths: z.array(text).min(1).max(100), evidenceHash: hash,
  analysisLevel: z.literal('structural_candidate'),
});
export type EngineeringFinding = z.infer<typeof engineeringFindingSchema>;
const reviewDataSchema = z.strictObject({
  planHash: hash, planRevision: z.number().int().positive(), inventory: engineeringInventorySchema,
  changedPaths: z.array(text).max(5000), impactPaths: z.array(text).max(5000),
  findings: z.array(engineeringFindingSchema).max(100), truncated: z.boolean(),
  impactReceiptId: id.optional(),
});
export const engineeringEvidenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ id, kind: z.literal('discovery'), issuedAt: z.number(), data: engineeringDiscoveryResultSchema }),
  z.strictObject({ id, kind: z.literal('impact'), issuedAt: z.number(), data: engineeringImpactResultSchema }),
  z.strictObject({ id, kind: z.literal('review'), issuedAt: z.number(), data: reviewDataSchema }),
]);
export type EngineeringEvidence = z.infer<typeof engineeringEvidenceSchema>;
export const engineeringReviewInputSchema = z.strictObject({
  expectedVersion: z.number().int().positive(), reviewReceiptId: id,
  dispositions: z.array(justification.extend({ findingId: id, disposition: z.enum(['fixed', 'retained']), checkIds: z.array(id).max(30) })).max(100),
  limitations: z.array(justification.extend({ limitationId: id, checkIds: z.array(id).min(1).max(30) })).max(200).optional(),
});
export type EngineeringReviewInput = z.infer<typeof engineeringReviewInputSchema>;
export const engineeringStateSchema = z.strictObject({
  policyVersion: z.literal(ENGINEERING_POLICY_VERSION), required: z.literal(true), reason: text, activatedAt: z.number(),
  evidence: z.array(engineeringEvidenceSchema).max(40),
  outputs: z.array(z.strictObject({ path: text, hash: hash.nullable() })).max(10000).optional(),
  facilitiesHash: hash.optional(),
  acknowledgedFacilities: engineeringFacilitiesSchema.optional(),
  assessment: engineeringAssessmentSchema.extend({ planHash: hash, planRevision: z.number().int().positive() }).optional(),
  review: engineeringReviewInputSchema.extend({ planHash: hash, planRevision: z.number().int().positive(), inventoryHash: hash, acceptedAt: z.number() }).optional(),
});
export type EngineeringState = z.infer<typeof engineeringStateSchema>;

export function engineeringIdentity(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function engineeringCallerId(caller: { symbolId: string; path: string; line: number }): string {
  return engineeringIdentity([caller.symbolId, caller.path, caller.line]);
}
export function engineeringLimitationId(limitation: { path: string; reason: string }): string {
  return engineeringIdentity([limitation.path, limitation.reason]);
}
export function isEngineeringPath(value: string): boolean {
  return /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|swift|rb|php|lua|sh|bash|ps1|sql|html|css|scss|vue|svelte|zig|json|yaml|yml|toml|lock)$/i.test(value)
    || /^(?:Dockerfile|Makefile|CMakeLists\.txt)$/i.test(path.basename(value));
}

interface ComplexityToken { value: string; line: number; kind: 'word' | 'literal' | 'punctuation' }
interface ComplexityUnit { line: number; signature: string; label: string }
interface ComplexityFunction { name: string; line: number; parameters: ComplexityToken[]; body: ComplexityToken[]; expression: boolean }

/** Deliberately lexical: literals stay opaque and retain their values; identifiers are not renamed. */
function complexityTokens(source: string): ComplexityToken[] | null {
  const tokens: ComplexityToken[] = []; let cursor = 0, line = 1;
  while (cursor < source.length) {
    const start = cursor, first = source[cursor]!;
    if (/\s/.test(first)) { if (first === '\n') line++; cursor++; continue; }
    if (source.startsWith('//', cursor)) { while (cursor < source.length && source[cursor] !== '\n') cursor++; continue; }
    if (source.startsWith('/*', cursor)) {
      const end = source.indexOf('*/', cursor + 2); if (end < 0) return null;
      line += (source.slice(cursor, end + 2).match(/\n/g) ?? []).length; cursor = end + 2; continue;
    }
    const tokenLine = line;
    const regex = first === '/' && (!tokens.length || /^(?:[=(:,\[!&|?;{]|return|case|=>)$/.test(tokens.at(-1)!.value));
    if (first === '"' || first === "'" || first === '`' || regex) {
      const quote = first; let closed = false, characterClass = false; cursor++;
      while (cursor < source.length) {
        const current = source[cursor++]!;
        if (current === '\n') line++;
        if (current === '\\') { if (source[cursor] === '\n') line++; cursor++; continue; }
        if (regex && current === '[') characterClass = true;
        if (regex && current === ']') characterClass = false;
        if (current === quote && !characterClass) { closed = true; break; }
      }
      if (!closed) return null;
      if (regex) while (/[a-z]/i.test(source[cursor] ?? '') && cursor < source.length) cursor++;
      tokens.push({ value: source.slice(start, cursor), line: tokenLine, kind: 'literal' }); continue;
    }
    const word = /^[A-Za-z_$][\w$]*|^\d+(?:\.\d+)?/.exec(source.slice(cursor));
    if (word) { cursor += word[0].length; tokens.push({ value: word[0], line, kind: 'word' }); continue; }
    const punctuation = ['===', '!==', '...', '=>', '?.', '==', '!=', '&&', '||', '??', '++', '--', '+=', '-=', '**', '<=', '>='].find(value => source.startsWith(value, cursor)) ?? first;
    cursor += punctuation.length; tokens.push({ value: punctuation, line, kind: 'punctuation' });
  }
  return tokens;
}
function complexityPairs(tokens: ComplexityToken[]): Map<number, number> | null {
  const pairs = new Map<number, number>(), stack: number[] = [], opens = new Map([[')', '('], [']', '['], ['}', '{']]);
  for (let index = 0; index < tokens.length; index++) {
    const value = tokens[index]!.value;
    if (['(', '[', '{'].includes(value)) stack.push(index);
    else if (opens.has(value)) {
      const start = stack.pop(); if (start === undefined || tokens[start]!.value !== opens.get(value)) return null;
      pairs.set(start, index); pairs.set(index, start);
    }
  }
  return stack.length ? null : pairs;
}
const complexitySignature = (tokens: ComplexityToken[]) => JSON.stringify(tokens.map(token => [token.kind, token.value]));
const complexityControls = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
function complexityFunctions(tokens: ComplexityToken[], pairs: Map<number, number>): { functions: ComplexityFunction[]; functionBodies: Set<number> } {
  const functions: ComplexityFunction[] = [], functionBodies = new Set<number>();
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.value !== '(') continue;
    const close = pairs.get(index); if (close === undefined) continue;
    const name = tokens[index - 1];
    // Named functions and ordinary methods only. Complex generic/type-literal headers are omitted.
    if (name?.kind !== 'word' || complexityControls.has(name.value) || ['function', 'new'].includes(name.value)) continue;
    let body = close + 1;
    if (tokens[body]?.value === ':') {
      body++;
      while (body < tokens.length && !['{', ';', '=', '=>', '}'].includes(tokens[body]!.value)) body++;
    }
    if (tokens[body]?.value !== '{' || functionBodies.has(body)) continue;
    const end = pairs.get(body); if (end === undefined) continue;
    functionBodies.add(body);
    functions.push({ name: name.value, line: name.line, parameters: tokens.slice(index + 1, close), body: tokens.slice(body + 1, end), expression: false });
  }
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.value !== '=>') continue;
    let parameters: ComplexityToken[], start = index - 1;
    if (tokens[start]?.value === ')') { const open = pairs.get(start); if (open === undefined) continue; parameters = tokens.slice(open + 1, start); start = open; }
    else if (tokens[start]?.kind === 'word') parameters = [tokens[start]!];
    else continue;
    const name = tokens[start - 1]?.value === '=' && tokens[start - 2]?.kind === 'word' ? tokens[start - 2]!.value : `arrow at line ${tokens[index]!.line}`;
    const body = index + 1; let end: number;
    if (tokens[body]?.value === '{') { const close = pairs.get(body); if (close === undefined) continue; end = close; functionBodies.add(body); }
    else {
      end = body;
      while (end < tokens.length && ![';', ',', '}'].includes(tokens[end]!.value)) {
        if (['(', '[', '{'].includes(tokens[end]!.value)) { const close = pairs.get(end); if (close === undefined) break; end = close + 1; }
        else if (end > body && tokens[end]!.line > tokens[end - 1]!.line && tokens[end]!.value !== '.') break;
        else end++;
      }
    }
    functions.push({ name, line: tokens[index]!.line, parameters, body: tokens.slice(body + (tokens[body]?.value === '{' ? 1 : 0), end), expression: tokens[body]?.value !== '{' });
  }
  return { functions, functionBodies };
}
function complexityForwarder(fn: ComplexityFunction): string | null {
  // Defaults, destructuring, conversions and extra arguments may implement behavior: do not guess.
  const parameters: string[][] = []; let parameter: ComplexityToken[] = [], depth = 0;
  for (const token of [...fn.parameters, { value: ',', kind: 'punctuation', line: fn.line } as ComplexityToken]) {
    if (['(', '[', '{', '<'].includes(token.value)) depth++;
    if ([')', ']', '}', '>'].includes(token.value)) depth--;
    if (token.value !== ',' || depth !== 0) { parameter.push(token); continue; }
    if (!parameter.length) continue;
    const rest = parameter[0]?.value === '...', name = parameter[rest ? 1 : 0];
    if (name?.kind !== 'word' || parameter.some(item => item.value === '=') || ![undefined, ':', '?'].includes(parameter[rest ? 2 : 1]?.value)) return null;
    parameters.push(rest ? ['...', name.value] : [name.value]); parameter = [];
  }
  const body = fn.body.map(token => token.value); if (body.at(-1) === ';') body.pop();
  if (!fn.expression && body.shift() !== 'return') return null;
  if (body[0] === 'await') body.shift();
  const opening = body.indexOf('('); if (opening < 1 || body.at(-1) !== ')') return null;
  const callee = body.slice(0, opening);
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callee.join(''))) return null;
  if (callee.join('.') === fn.name) return null;
  const expected = parameters.flatMap((names, index) => index ? [',', ...names] : names);
  if (JSON.stringify(body.slice(opening + 1, -1)) !== JSON.stringify(expected)) return null;
  return callee.join('.');
}
function complexityUnits(tokens: ComplexityToken[], pairs: Map<number, number>, functionBodies: Set<number>): ComplexityUnit[] {
  const units: ComplexityUnit[] = [];
  for (let start = 0; start < tokens.length; start++) {
    if (tokens[start]!.value !== '{') continue;
    const previous = tokens[start - 1]?.value, open = previous === ')' ? pairs.get(start - 1) : undefined;
    const control = open === undefined ? false : complexityControls.has(tokens[open - 1]?.value ?? '');
    if (!functionBodies.has(start) && !control && !['else', 'try', 'finally', 'do'].includes(previous ?? '')) continue;
    const end = pairs.get(start); if (end === undefined) continue;
    const body = tokens.slice(start + 1, end);
    // A structural evidence floor excludes punctuation-only/trivial bodies; it is never a LOC gate.
    if (body.length < 16 || body.filter(token => token.kind === 'word').length < 6) continue;
    units.push({ line: tokens[start]!.line, signature: complexitySignature(body), label: functionBodies.has(start) ? 'function body' : 'control block' });
  }
  if (tokens.length >= 24) units.push({ line: 1, signature: `file:${complexitySignature(tokens)}`, label: 'source file' });
  return units;
}
function complexityEnvKeys(tokens: ComplexityToken[]): Array<{ name: string; line: number }> {
  const keys: Array<{ name: string; line: number }> = [];
  for (let index = 0; index < tokens.length; index++) {
    const prefix = tokens.slice(index, index + 3).map(token => token.value).join('');
    const offset = prefix === 'process.env' ? index + 3 : tokens.slice(index, index + 5).map(token => token.value).join('') === 'import.meta.env' ? index + 5 : -1;
    if (offset < 0) continue;
    const access = tokens[offset]?.value, key = tokens[offset + 1];
    const name = access === '.' && key?.kind === 'word' ? key.value : access === '[' && key?.kind === 'literal' && tokens[offset + 2]?.value === ']' ? /^['"]([A-Z][A-Z0-9_]*)['"]$/.exec(key.value)?.[1] : undefined;
    if (name && /^[A-Z][A-Z0-9_]*$/.test(name)) keys.push({ name, line: tokens[index]!.line });
  }
  return keys;
}
function complexityConfigurationKeys(value: unknown, prefix = '', depth = 0): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 12) return [];
  return Object.entries(value).flatMap(([name, child]) => {
    const key = prefix ? `${prefix}.${name}` : name;
    const nested = complexityConfigurationKeys(child, key, depth + 1);
    return nested.length ? nested : [key];
  }).sort();
}

/** Findings are structural candidates, not semantic equivalence or instructions to remove safety layers. */
export function analyzeEngineeringComplexity(input: {
  before: Map<string, string>; after: Map<string, string>; changedPaths: string[]; impactPaths: string[]; wholeProject?: boolean;
}): { findings: EngineeringFinding[]; truncated: boolean } {
  const findings: EngineeringFinding[] = []; let truncated = false;
  const scope = new Set(input.wholeProject ? input.after.keys() : [...input.changedPaths, ...input.impactPaths]);
  const changed = new Set(input.changedPaths), observed = new Map<string, ComplexityToken[]>();
  const units = new Map<string, Array<ComplexityUnit & { path: string; added: boolean }>>();
  const add = (kind: EngineeringFinding['kind'], file: string, line: number, message: string, evidencePaths = [file]) => {
    evidencePaths = [...new Set(evidencePaths)].sort();
    if (evidencePaths.length > 100) { truncated = true; evidencePaths = [file, ...evidencePaths.filter(item => item !== file).slice(0, 99)].sort(); }
    const evidenceHash = engineeringIdentity(evidencePaths.map(p => [p, input.after.get(p) ?? null]));
    const findingId = engineeringIdentity([kind, file, line, message, evidenceHash]);
    if (findings.some(finding => finding.id === findingId)) return;
    if (findings.length === 100) { truncated = true; return; }
    findings.push({ id: findingId, kind, path: file, line, message, evidencePaths, evidenceHash, analysisLevel: 'structural_candidate' });
  };
  for (const file of [...scope].sort()) {
    if (!/\.[cm]?[jt]sx?$/i.test(file)) continue;
    const source = input.after.get(file); if (source === undefined) continue;
    const tokens = complexityTokens(source); if (tokens && complexityPairs(tokens)) observed.set(file, tokens);
  }
  for (const file of [...scope].sort()) {
    const after = input.after.get(file); if (after === undefined) continue;
    const before = input.before.get(file) ?? '';
    const subject = Boolean(input.wholeProject || changed.has(file));
    if (subject && path.basename(file) === 'package.json') {
      try {
        const oldPackage = before ? JSON.parse(before) : {}, newPackage = JSON.parse(after);
        for (const group of ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies']) {
          if (!newPackage[group] || typeof newPackage[group] !== 'object' || Array.isArray(newPackage[group])) continue;
          for (const name of Object.keys(newPackage[group]).sort()) if (!Object.hasOwn(oldPackage[group] ?? {}, name)) {
            add('new_dependency', file, 1, `Added ${group} dependency ${name}; justify why existing or native facilities do not meet the requirement.`);
          }
        }
      } catch { /* Parsing/coverage diagnostics belong to the source analysis, not deletion suggestions. */ }
    }
    if (subject && /^(?:tsconfig|jsconfig)(?:\.[^.]+)?\.json$|(?:^|[.-])(?:config|settings)\.json$/i.test(path.basename(file))) {
      try {
        const oldKeys = new Set(complexityConfigurationKeys(before ? JSON.parse(before) : {}));
        for (const name of complexityConfigurationKeys(JSON.parse(after))) if (!oldKeys.has(name)) {
          add('new_configuration', file, 1, `New configuration key ${name}; justify its requirement, validation and default behavior.`);
        }
      } catch { /* JSONC and unsupported configuration syntax remain outside this lexical check. */ }
    }
    const tokens = observed.get(file); if (!tokens) continue;
    const pairs = complexityPairs(tokens)!, oldTokens = complexityTokens(before) ?? [], oldPairs = complexityPairs(oldTokens);
    const parsed = complexityFunctions(tokens, pairs), oldParsed = oldPairs ? complexityFunctions(oldTokens, oldPairs) : { functions: [], functionBodies: new Set<number>() };
    if (subject) {
      const oldFunctions = new Set(oldParsed.functions.map(fn => engineeringIdentity([fn.name, complexitySignature(fn.parameters), complexitySignature(fn.body)])));
      for (const fn of parsed.functions) {
        if (!input.wholeProject && oldFunctions.has(engineeringIdentity([fn.name, complexitySignature(fn.parameters), complexitySignature(fn.body)]))) continue;
        const callee = complexityForwarder(fn); if (!callee || fn.name === 'constructor') continue;
        add('delegation_wrapper', file, fn.line, `Function ${fn.name} structurally forwards its arguments to ${callee}; inspect API, security, recovery and compatibility obligations before deciding whether to retain it.`);
      }
      for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index]!, isAbstract = token.value === 'abstract' && tokens[index + 1]?.value === 'class';
        if (token.value !== 'interface' && token.value !== 'type' && !isAbstract) continue;
        const name = tokens[index + (isAbstract ? 2 : 1)]; if (name?.kind !== 'word') continue;
        if (token.value === 'type' && tokens[index + 2]?.value !== '=') continue;
        if (!input.wholeProject && oldTokens.some((item, oldIndex) => item.value === token.value && oldTokens[oldIndex + (isAbstract ? 2 : 1)]?.value === name.value)) continue;
        const evidencePaths = [...observed].filter(([, body]) => body.some(item => item.kind === 'word' && item.value === name.value)).map(([file]) => file);
        const uses = evidencePaths.reduce((count, file) => count + observed.get(file)!.filter(item => item.kind === 'word' && item.value === name.value).length, 0);
        if (uses <= 2) add('limited_abstraction', file, token.line, `Abstraction ${name.value} has ${uses} lexical occurrences in the inspected scope; same-name symbols and external consumers are not resolved by this structural check.`, evidencePaths);
      }
      const oldKeys = new Set(complexityEnvKeys(oldTokens).map(item => item.name)), seenKeys = new Set<string>();
      for (const key of complexityEnvKeys(tokens)) if (!oldKeys.has(key.name) && !seenKeys.has(key.name)) {
        seenKeys.add(key.name); add('new_configuration', file, key.line, `New environment option ${key.name}; justify its requirement, validation and default behavior.`);
      }
    }
    const oldUnits = new Map<string, number>();
    for (const unit of oldPairs ? complexityUnits(oldTokens, oldPairs, oldParsed.functionBodies) : []) oldUnits.set(unit.signature, (oldUnits.get(unit.signature) ?? 0) + 1);
    for (const unit of complexityUnits(tokens, pairs, parsed.functionBodies)) {
      const previous = oldUnits.get(unit.signature) ?? 0; if (previous) oldUnits.set(unit.signature, previous - 1);
      const group = units.get(unit.signature) ?? []; group.push({ ...unit, path: file, added: subject && (Boolean(input.wholeProject) || previous === 0) }); units.set(unit.signature, group);
    }
  }
  for (const group of units.values()) {
    if (group.length < 2) continue;
    for (const unit of group.filter(item => item.added)) {
      const peers = group.filter(item => item !== unit), peer = peers[0]!;
      add('duplicate_structure', unit.path, unit.line, `Repeated ${unit.label} token structure also occurs at ${peer.path}:${peer.line}; literals and identifiers match, but behavioral interchangeability is not established.`, group.map(item => item.path));
    }
  }
  return { findings, truncated };
}
