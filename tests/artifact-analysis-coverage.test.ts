import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript-lsp-runtime';

let compiled: string, runWorker: any;
beforeAll(async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(path.join(root, 'runtime/tmp'), { recursive: true });
  compiled = await mkdtemp(path.join(root, 'runtime/tmp/artifact-worker-'));
  // Transpile only the current worker dependency closure into a disposable tree.
  // This starts the real worker without consuming possibly stale root dist output.
  for (const relative of ['artifact-analysis/contracts', 'artifact-analysis/javascript', 'artifact-analysis/asar',
    'artifact-analysis/managed', 'artifact-analysis/worker-entry', 'artifact-analysis/worker', 'rdc/utils/withTimeout']) {
    const source = await readFile(path.join(root, 'src', relative + '.ts'), 'utf8');
    const destination = path.join(compiled, relative + '.js'); await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022, esModuleInterop: true } }).outputText);
  }
  ({ runArtifactWorker: runWorker } = await import(pathToFileURL(path.join(compiled, 'artifact-analysis/worker.js')).href));
});
afterAll(async () => { if (compiled) await rm(compiled, { recursive: true, force: true }); });
const source = (count: number) => Buffer.from(Array.from({ length: count }, (_, i) => `import m${i} from 'module-${i}';`).join('\n'));
function asar(files: Record<string, Buffer>) {
  let offset = 0; const entries: Record<string, any> = {}, payloads: Buffer[] = [];
  for (const [name, data] of Object.entries(files)) { entries[name] = { size: data.length, offset: String(offset) }; offset += data.length; payloads.push(data); }
  const json = Buffer.from(JSON.stringify({ files: entries })), header = Buffer.alloc(12);
  header.writeUInt32LE(4, 0); header.writeUInt32LE(json.length + 4, 4); header.writeUInt32LE(json.length, 8);
  return Buffer.concat([header, json, ...payloads]);
}
function managedModuleRefs(count: number) {
  // Minimal PE/CLI metadata fixture, parsed statically and never loaded by CLR.
  const bytes = Buffer.alloc(4096), pe = 64, optional = pe + 24, section = optional + 224;
  bytes.writeUInt16LE(0x5a4d, 0); bytes.writeUInt32LE(pe, 0x3c); bytes.writeUInt32LE(0x4550, pe);
  bytes.writeUInt16LE(1, pe + 6); bytes.writeUInt16LE(224, pe + 20); bytes.writeUInt16LE(0x10b, optional);
  bytes.writeUInt32LE(4096, optional + 96 + 14 * 8);
  bytes.writeUInt32LE(3584, section + 8); bytes.writeUInt32LE(4096, section + 12);
  bytes.writeUInt32LE(3584, section + 16); bytes.writeUInt32LE(512, section + 20);
  const cli = 512, metadata = cli + 72;
  bytes.writeUInt32LE(4096 + 72, cli + 8); bytes.writeUInt32LE(1800, cli + 12); bytes.writeUInt32LE(1, cli + 16);
  bytes.writeUInt32LE(0x424a5342, metadata); bytes.writeUInt32LE(4, metadata + 12); bytes.writeUInt16LE(4, metadata + 22);
  let header = metadata + 24;
  for (const [name, offset, size] of [['#~', 128, 28 + count * 2], ['#Strings', 1200, 20], ['#GUID', 1300, 16], ['#Blob', 1400, 4]] as const) {
    bytes.writeUInt32LE(offset, header); bytes.writeUInt32LE(size, header + 4); bytes.write(name, header + 8);
    header += 8 + Math.ceil((name.length + 1) / 4) * 4;
  }
  const table = metadata + 128; bytes.writeBigUInt64LE(1n << 26n, table + 8); bytes.writeUInt32LE(count, table + 24);
  for (let i = 0; i < count; i++) bytes.writeUInt16LE(1, table + 28 + i * 2);
  bytes.write('module\0', metadata + 1201); return bytes;
}

describe('real artifact worker finding coverage', () => {
  it.each([['one-file', [source(300)], 44], ['cross-file', [source(200), source(100)], 44]] as const)(
    'accounts for declaration clipping in %s inspection', async (_name, sources, droppedFindings) => {
      const files = sources.map((bytes, i) => ({ relative: `entry-${i}.js`, bytes, size: bytes.length }));
      const result = await runWorker({ format: 'directory-js', files, sha256: 'fixture', scopeDigest: 'fixture', omissions: 0 }, files.map(file => file.relative));
      expect(result.inspected).toBe(files.length); expect(result.findings).toHaveLength(256);
      expect(result.droppedFindings).toBe(droppedFindings);
    });
  it('accounts for clipped ASAR declarations across all selected members', async () => {
    const archive = asar({ 'a.js': source(200), 'b.js': source(100) });
    const result = await runWorker({ format: 'asar', files: [], archive, sha256: 'fixture', scopeDigest: 'fixture', omissions: 0 }, ['a.js', 'b.js']);
    expect(result.inspected).toBe(2); expect(result.findings).toHaveLength(256); expect(result.droppedFindings).toBe(44);
  });
  it('reports zero dropped findings when selected declarations fit', async () => {
    const bytes = source(2), files = [{ relative: 'entry.js', bytes, size: bytes.length }];
    const result = await runWorker({ format: 'directory-js', files, sha256: 'fixture', scopeDigest: 'fixture', omissions: 0 }, ['entry.js']);
    expect(result.findings).toHaveLength(2); expect(result.droppedFindings).toBe(0);
  });
  it('accounts for managed metadata row caps without loading the assembly', async () => {
    const archive = managedModuleRefs(300);
    const result = await runWorker({ format: 'managed-pe', files: [], archive, sha256: 'fixture', scopeDigest: 'fixture', omissions: 0 }, []);
    expect(result.findings).toHaveLength(81); expect(result.droppedFindings).toBe(220);
    expect(result.notExamined).toBe(1);
  });
});
