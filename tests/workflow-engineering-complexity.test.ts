import { describe, expect, it } from 'vitest';
import { analyzeEngineeringComplexity, engineeringFindingSchema, engineeringIdentity } from '../src/workflow/engineering-policy.js';

function review(after: Record<string, string>, before: Record<string, string> = {}, options: { changedPaths?: string[]; impactPaths?: string[]; wholeProject?: boolean } = {}) {
  return analyzeEngineeringComplexity({ before: new Map(Object.entries(before)), after: new Map(Object.entries(after)), changedPaths: options.changedPaths ?? Object.keys(after), impactPaths: options.impactPaths ?? [], wholeProject: options.wholeProject });
}
const body = 'const normalized = value.trim(); const result = normalize(normalized); return result;';

describe('engineering structural complexity candidates', () => {
  it('finds duplicated function bodies in different files with unrelated surrounding code', () => {
    const after = { 'src/new.ts': `export function newFeature(value: string) { ${body} }\nexport const version = 2;`, 'src/existing.ts': `function established(value: string) { ${body} }\nexport const label = 'existing';` };
    const result = review(after, { 'src/existing.ts': after['src/existing.ts'] }, { changedPaths: ['src/new.ts'], impactPaths: ['src/existing.ts'] });
    const finding = result.findings.find(item => item.kind === 'duplicate_structure');
    expect(finding).toMatchObject({ path: 'src/new.ts', line: 1, evidencePaths: ['src/existing.ts', 'src/new.ts'], analysisLevel: 'structural_candidate' });
    expect(finding?.message).toContain('function body');
    expect(finding?.evidenceHash).toBe(engineeringIdentity(['src/existing.ts', 'src/new.ts'].map(file => [file, after[file as keyof typeof after]])));
    expect(result.findings.every(item => engineeringFindingSchema.safeParse(item).success)).toBe(true);
  });

  it('finds a newly copied control block within a file without reflagging its earlier occurrence', () => {
    const before = `function run(value: string) { if (value) { ${body} } }`;
    const after = `function run(value: string) { if (value) { ${body} }\nelse { ${body} } }`;
    const findings = review({ 'src/run.ts': after }, { 'src/run.ts': before }).findings.filter(item => item.kind === 'duplicate_structure');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ line: 2, evidencePaths: ['src/run.ts'] });
    expect(findings[0]?.message).toContain('control block');
  });

  it('preserves identifiers and literal values when comparing structures', () => {
    const result = review({
      'a.ts': `function one(value: string) { const marker = 'https://one/path'; ${body} }`,
      'b.ts': `function two(value: string) { const marker = 'https://two/path'; ${body.replaceAll('normalized', 'other')} }`,
    });
    expect(result.findings.filter(item => item.kind === 'duplicate_structure')).toEqual([]);
  });

  it('ignores comments and keeps regex/template literals opaque', () => {
    const source = [
      '// interface Fake {} process.env.FAKE function shim(x) { return hidden(x); }',
      'const text = "interface Hidden {} process.env.HIDDEN";',
      'const template = `function invented(x) { return hidden(x); }`;',
      'const expression = /function fake(x) { return hidden(x); }/;',
      'const url = "https://example.invalid/*literal*/";',
    ].join('\n');
    expect(review({ 'source.ts': source }).findings).toEqual([]);
  });

  it('recognizes direct forwarding functions, arrow functions and methods as review candidates', () => {
    const source = [
      'export async function restore(value: string) { return await safeRestore(value); }',
      'export const forward = (value: string) => implementation(value);',
      'class Adapter { send(value: string) { return native.send(value); } }',
      'export const rest = (...args: string[]) => native.apply(...args);',
    ].join('\n');
    const findings = review({ 'adapter.ts': source }).findings.filter(item => item.kind === 'delegation_wrapper');
    expect(findings).toHaveLength(4);
    expect(findings.every(item => item.message.includes('security, recovery') && item.analysisLevel === 'structural_candidate')).toBe(true);
  });

  it('does not label validation, recovery, transformed arguments, defaults or recursion as forwarding wrappers', () => {
    const source = [
      'function validation(value) { if (!value) throw Error(); return native(value); }',
      'function recover(value) { try { return native(value); } catch { return fallback(value); } }',
      'function transformed(value) { return native(value.trim()); }',
      'function defaults(value = 2) { return native(value); }',
      'function recursive(value) { return recursive(value); }',
      'function extra(value) { return native(value, true); }',
    ].join('\n');
    expect(review({ 'behavior.ts': source }).findings.filter(item => item.kind === 'delegation_wrapper')).toEqual([]);
  });

  it('does not treat whitespace and comment edits as new wrappers, options or abstractions', () => {
    const before = 'interface Option { value: string }\nfunction forward(value: string) { return native(value); }\nconst option = process.env.OPTION;';
    const after = 'interface /*note*/ Option { value : string }\nfunction forward (value : string) { /*same*/ return native ( value ) ; }\nconst option = process . env ["OPTION"];';
    expect(review({ 'existing.ts': after }, { 'existing.ts': before }).findings).toEqual([]);
  });

  it('reports only limited lexical abstraction usage and includes the inspected consumer as evidence', () => {
    const result = review({ 'new.ts': 'interface Port { run(): void }\nabstract class Base {}\ntype Choice = string;', 'consumer.ts': 'const port: Port = source; // Port Port Port' }, {}, { changedPaths: ['new.ts'], impactPaths: ['consumer.ts'] });
    const port = result.findings.find(item => item.kind === 'limited_abstraction' && item.message.includes('Port'));
    expect(port?.evidencePaths).toEqual(['consumer.ts', 'new.ts']);
    expect(port?.message).toContain('2 lexical occurrences');
    expect(port?.message).toContain('external consumers are not resolved');
    expect(result.findings.filter(item => item.kind === 'limited_abstraction')).toHaveLength(3);
  });

  it('detects literal environment keys and new JSON configuration keys without exposing values', () => {
    const result = review({ 'config.ts': 'const a = process.env["OLD"]; const b = process.env.NEW; const c = import.meta.env.VITE_NEW; const d = process.env[dynamic];', 'app.config.json': '{"limits":{"retry":3},"mode":"private-value"}' }, { 'config.ts': 'const a = process.env.OLD;', 'app.config.json': '{"limits":{"retry":2}}' });
    const findings = result.findings.filter(item => item.kind === 'new_configuration');
    expect(findings).toHaveLength(3);
    expect(findings.map(item => item.message).join('\n')).not.toContain('private-value');
    expect(findings.map(item => item.message).join('\n')).not.toContain('option OLD');
  });

  it('assigns distinct stable IDs to multiple same-line dependency findings', () => {
    const after = { 'package.json': '{"dependencies":{"alpha":"1","beta":"2"},"peerDependencies":{"gamma":"3"}}' };
    const one = review(after), two = review(after);
    expect(one.findings).toHaveLength(3);
    expect(new Set(one.findings.map(item => item.id)).size).toBe(3);
    expect(one).toEqual(two);
    expect(review(after, after).findings).toEqual([]);
  });

  it('keeps peers within the declared impact scope and supports explicit whole-project review', () => {
    const source = `function one(value) { ${body} }`, after = { 'a.ts': source, 'b.ts': source.replace('one', 'two') };
    expect(review(after, {}, { changedPaths: ['a.ts'] }).findings.filter(item => item.kind === 'duplicate_structure')).toEqual([]);
    expect(review(after, after, { changedPaths: [], wholeProject: true }).findings.some(item => item.kind === 'duplicate_structure')).toBe(true);
  });

  it('bounds findings without ID collisions and reports truncation', () => {
    const dependencies = Object.fromEntries(Array.from({ length: 105 }, (_, index) => [`dependency-${String(index).padStart(3, '0')}`, '1']));
    const result = review({ 'package.json': JSON.stringify({ dependencies }) });
    expect(result.findings).toHaveLength(100); expect(result.truncated).toBe(true);
    expect(new Set(result.findings.map(item => item.id)).size).toBe(100);
  });
});
