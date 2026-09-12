import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { WorkflowError, type WorkflowRecord, type WorkflowSourceInput, type WorkflowSnapshot, type WorkflowReceipt } from './types.js';
import { workflowHash } from './store.js';

export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 500;
/** Historical receipts remain stored, but only this configured donor identity can authorize current work. */
export function snapshotMatchesDonor(snapshot: WorkflowSnapshot, donor: WorkflowRecord['donors'][number]): boolean {
  return snapshot.role === 'donor' && snapshot.donorId === donor.id && snapshot.source === donor.source && (snapshot.ref ?? 'HEAD') === (donor.ref ?? 'HEAD');
}
function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
export function sourceClass(file: string): WorkflowSnapshot['contentClass'] {
  if (/^(readme|license|copying|changelog)(\.|$)/i.test(path.basename(file)) || /\.(md|mdx|rst|txt|adoc)$/i.test(file)) return 'documentation';
  if (/\.(json|yaml|yml|toml|ini|xml|lock)$/i.test(file)) return 'configuration';
  if (/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|swift|rb|php|lua|sh|bash|ps1|pl|ex|exs|erl|hs|scala|dart|r|sql|html|css|scss|vue|svelte|zig|nim|jl|clj|f|f90|pas|m|mm|sol)$/i.test(file)) return 'code';
  return 'other';
}
function sourceAnalysis(file:string):Pick<WorkflowSnapshot,'language'|'analysisLevel'> {
  const languages:Record<string,string>={ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',py:'python',go:'go',rs:'rust',java:'java',kt:'kotlin',kts:'kotlin',c:'c',h:'c',cc:'cpp',cpp:'cpp',hpp:'cpp',cs:'csharp',swift:'swift',rb:'ruby',php:'php',lua:'lua',sh:'shell',bash:'shell',ps1:'powershell',pl:'perl',ex:'elixir',exs:'elixir',erl:'erlang',hs:'haskell',scala:'scala',dart:'dart',r:'r',sql:'sql',html:'html',css:'css',scss:'scss',vue:'vue',svelte:'svelte',zig:'zig',nim:'nim',jl:'julia',clj:'clojure',f:'fortran',f90:'fortran',pas:'pascal',m:'objective-c-or-matlab',mm:'objective-cpp',sol:'solidity',md:'markdown',json:'json',yaml:'yaml',yml:'yaml',toml:'toml'};
  const language=languages[path.extname(file).slice(1).toLowerCase()]??'unknown-text';
  // These levels describe acquisition only. No parser, semantic understanding or equivalence is claimed.
  return{language,analysisLevel:language==='unknown-text'?'structural_only':'source_read'};
}
function textBytes(bytes: Buffer): string {
  const text = bytes.toString('utf8');
  if (text.includes('\0') || !Buffer.from(text, 'utf8').equals(bytes)) throw new WorkflowError('WORKFLOW_SOURCE_ENCODING_UNSUPPORTED', 'Source must be UTF-8 text; binary or undecodable files cannot establish source grounding');
  return text;
}
async function readBounded(file: string): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_SOURCE_BYTES) throw new WorkflowError('WORKFLOW_SOURCE_LIMIT', 'Source must be a file no larger than 2 MiB');
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const after = await handle.stat();
    if (bytesRead > MAX_SOURCE_BYTES || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytesRead !== before.size) throw new WorkflowError('WORKFLOW_SOURCE_CHANGED', 'Source changed during capture; read it again');
    return buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}
/** Runs only fixed Git plumbing, never a donor command, checkout, hook, filter or install script. */
async function git(args: string[], cwd: string, limit = MAX_SOURCE_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_ATTR_NOSYSTEM: '1', GIT_NO_REPLACE_OBJECTS: '1' };
    for (const key of Object.keys(env)) if (/^GIT_(?:CONFIG_(?:COUNT|KEY_|VALUE_)|DIR$|WORK_TREE$|INDEX_FILE$|OBJECT_DIRECTORY$|ALTERNATE_OBJECT_DIRECTORIES$|EXEC_PATH$|SSH|ASKPASS)/.test(key)) delete env[key];
    const child = spawn(process.platform === 'win32' ? 'git.exe' : 'git', ['-c', 'core.hooksPath=', '-c', 'credential.helper=', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'http.followRedirects=false', ...args], { cwd, env, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let size = 0, failed = false;
    const stop = (code: string, message: string) => { if (failed) return; failed = true; child.kill(); reject(new WorkflowError(code, message)); };
    const timer = setTimeout(() => stop('WORKFLOW_SOURCE_TIMEOUT', 'Git source capture timed out'), 30_000);
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limit) stop('WORKFLOW_SOURCE_LIMIT', 'Git source exceeds the capture bound'); else chunks.push(chunk); });
    child.stderr.on('data', () => {});
    child.once('error', () => { clearTimeout(timer); stop('WORKFLOW_SOURCE_UNAVAILABLE', 'Git source acquisition could not start'); });
    child.once('close', code => { clearTimeout(timer); if (!failed) { if (code !== 0) reject(new WorkflowError('WORKFLOW_SOURCE_UNAVAILABLE', 'Git source acquisition failed; verify the URL/ref or use a local source path')); else resolve(Buffer.concat(chunks)); } });
  });
}
export class WorkflowSources {
  constructor(private readonly workspace: WorkspacePolicy, readonly cacheRoot: string) {}
  async cache(bytes: Buffer): Promise<string> {
    const hash = workflowHash(bytes), root = path.join(this.cacheRoot, 'blobs'); await mkdir(root, { recursive: true });
    const file = path.join(root, `${hash}.txt`);
    const temporary = path.join(root, `.${hash}.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      // Publishing a complete file via a hard link is atomic and cannot overwrite an existing hash.
      try { await link(temporary, file); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; if (workflowHash(await readFile(file)) !== hash) throw new WorkflowError('WORKFLOW_SOURCE_CACHE_CORRUPT', 'Immutable source cache content changed'); }
    } finally { await rm(temporary, { force: true }); }
    return hash;
  }
  async receiptContent(snapshot: WorkflowSnapshot, receipt: WorkflowReceipt): Promise<string> {
    const bytes = await readFile(path.join(this.cacheRoot, 'blobs', `${snapshot.contentHash}.txt`));
    if (workflowHash(bytes) !== snapshot.contentHash || receipt.contentHash !== snapshot.contentHash) throw new WorkflowError('WORKFLOW_SOURCE_CACHE_CORRUPT', 'Source receipt no longer matches its immutable snapshot');
    const lines = textBytes(bytes).split(/\r?\n/);
    if (!receipt.complete || receipt.startLine < 1 || receipt.endLine < receipt.startLine || receipt.endLine > lines.length) throw new WorkflowError('WORKFLOW_RECEIPT_INVALID', 'Source receipt range is not valid for its snapshot');
    const delivered = lines.slice(receipt.startLine - 1, receipt.endLine).join('\n');
    if (workflowHash(delivered) !== receipt.deliveredHash) throw new WorkflowError('WORKFLOW_RECEIPT_INVALID', 'Source receipt does not prove the delivered range');
    return delivered;
  }
  async cachedContent(hash: string): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new WorkflowError('WORKFLOW_SOURCE_CACHE_CORRUPT', 'Invalid source content identity');
    const bytes = await readBounded(path.join(this.cacheRoot, 'blobs', `${hash}.txt`));
    if (workflowHash(bytes) !== hash) throw new WorkflowError('WORKFLOW_SOURCE_CACHE_CORRUPT', 'Source cache does not match its immutable identity');
    return textBytes(bytes);
  }
  async capture(record: WorkflowRecord, input: WorkflowSourceInput): Promise<{ entries?: string[]; bytes?: Buffer; source: string; path: string; commit?: string; ref?: string; contentClass?: WorkflowSnapshot['contentClass'];language?:string;analysisLevel?:WorkflowSnapshot['analysisLevel'] }> {
    let source: string;
    if (input.role === 'target') source = record.targetRoot;
    else { const donor = record.donors.find(d => d.id === input.donorId); if (!donor) throw new WorkflowError('WORKFLOW_DONOR_NOT_FOUND', 'Source must refer to a donor registered in this task'); source = donor.source; }
    if (/^https:\/\//i.test(source)) return this.remote(record, input, source);
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(source)) throw new WorkflowError('WORKFLOW_SOURCE_PROTOCOL_UNSUPPORTED', 'Use a local source path or token-free HTTPS Git repository URL');
    if (input.role === 'donor' && record.donors.find(d => d.id === input.donorId)?.ref !== undefined) throw new WorkflowError('WORKFLOW_SOURCE_REF_UNSUPPORTED', 'Git ref is supported only for HTTPS Git donors; local sources are pinned by their captured content');
    const registered = await this.workspace.resolveExisting(source);
    const root = await realpath(registered), info = await stat(root);
    const target = input.path ? (path.isAbsolute(input.path) ? input.path : path.resolve(info.isDirectory() ? root : path.dirname(root), input.path)) : root;
    const real = await realpath(target);
    if ((info.isFile() && real !== root) || (info.isDirectory() && !contained(root, real))) throw new WorkflowError('WORKFLOW_SOURCE_PATH_ESCAPE', 'Source path leaves its registered root');
    if (input.role === 'target') await this.workspace.resolveExistingInProject(record.targetRoot, real);
    if (input.operation === 'list') {
      const files: string[] = []; const entries = await readdir(real, { withFileTypes: true });
      for (const item of entries.sort((a,b) => a.name.localeCompare(b.name))) { if (files.length >= MAX_ENTRIES) throw new WorkflowError('WORKFLOW_SOURCE_LIMIT', 'Directory listing exceeds 500 entries; select a narrower source path'); if (!item.isSymbolicLink()) files.push(item.name + (item.isDirectory() ? '/' : '')); }
      return { entries: files, source, path: real };
    }
    const bytes = await readBounded(real); textBytes(bytes);
    return { bytes, source, path: real, contentClass: sourceClass(real),...sourceAnalysis(real) };
  }
  async current(snapshot: WorkflowSnapshot): Promise<boolean> {
    try {
      const cached = await readFile(path.join(this.cacheRoot, 'blobs', `${snapshot.contentHash}.txt`));
      if (workflowHash(cached) !== snapshot.contentHash) return false;
      if (snapshot.commit) return true; // The accepted source is an immutable commit, not a moving branch.
      const real = await realpath(snapshot.path);
      return real === snapshot.path && workflowHash(await readBounded(real)) === snapshot.contentHash;
    } catch { return false; }
  }
  private async remote(record: WorkflowRecord, input: WorkflowSourceInput, source: string) {
    const donor = record.donors.find(d => d.id === input.donorId)!;
    let url: URL; try { url = new URL(source); } catch { throw new WorkflowError('WORKFLOW_SOURCE_URL_INVALID', 'Invalid repository URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.hostname === 'localhost' || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw new WorkflowError('WORKFLOW_SOURCE_URL_INVALID', 'Use a token-free public HTTPS repository URL');
    if (/\/(?:blob|tree)\//.test(url.pathname)) throw new WorkflowError('WORKFLOW_SOURCE_URL_INVALID', 'Use the repository root URL, with ref and path provided separately');
    const revision = donor.ref ?? 'HEAD';
    if (revision.startsWith('-') || /[\s\x00-\x1f]/.test(revision)) throw new WorkflowError('WORKFLOW_SOURCE_REF_INVALID', 'Invalid Git ref');
    const relative = (input.path ?? '').replaceAll('\\', '/');
    if (relative.startsWith('/') || relative.split('/').some(p => p === '..') || relative.includes('\0') || /^[A-Za-z]:/.test(relative)) throw new WorkflowError('WORKFLOW_SOURCE_PATH_ESCAPE', 'Git source path must stay inside its tree');
    if (input.operation === 'read' && !relative) throw new WorkflowError('WORKFLOW_SOURCE_PATH_REQUIRED', 'Select a source file inside the pinned repository');
    const root = path.join(this.cacheRoot, 'git', workflowHash(source + '\0' + revision)); await mkdir(root, { recursive: true });
    try { await stat(path.join(root, 'HEAD')); } catch { await git(['init', '--bare', '.'], root); }
    const prior = record.snapshots.find(s => snapshotMatchesDonor(s, donor) && s.commit);
    let commit = prior?.commit;
    if (!commit) {
      await git(['fetch', '--depth=1', '--no-tags', '--no-recurse-submodules', source, revision], root);
      commit = (await git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], root)).toString('utf8').trim();
      if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new WorkflowError('WORKFLOW_SOURCE_REF_INVALID', 'Git did not resolve a commit');
    }
    const object = relative ? `${commit}:${relative}` : commit;
    if (input.operation === 'list') {
      const raw = (await git(['ls-tree', '-z', object], root)).toString('utf8');
      const entries = raw.split('\0').filter(Boolean).map(line => line.split('\t')[1]!).filter(Boolean);
      if (entries.length > MAX_ENTRIES) throw new WorkflowError('WORKFLOW_SOURCE_LIMIT', 'Select a narrower Git source directory');
      return { entries, source, path: relative, commit, ref: revision };
    }
    if (!relative) throw new WorkflowError('WORKFLOW_SOURCE_PATH_REQUIRED', 'Select a source file inside the pinned repository');
    const bytes = await git(['cat-file', 'blob', object], root); textBytes(bytes);
    return { bytes, source, path: relative, commit, ref: revision, contentClass: sourceClass(relative),...sourceAnalysis(relative) };
  }
}
