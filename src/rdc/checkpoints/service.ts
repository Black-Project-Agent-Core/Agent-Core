import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, open, opendir } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { assertSameFileIdentity } from '../../security/file-identity.js';
import { assertEvidenceLocalPath } from '../../verification/evidence-snapshot.js';
import { decideToolEvidenceCapture } from '../../security/evidence-capture-policy.js';
import { isSensitiveKey, redactSensitiveString } from '../../security/redaction.js';
import { fileMutationCoordinator, type AutoCheckpointReceipt, type AutoCheckpointReason, type MutationExecutionContext } from '../mutation-coordinator.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeOwnedFileAtomic } from '../../persistence/atomic-file.js';
import { resolveProjectRoot } from '../../portability/paths.js';
import { authorizedDestinationPath, authorizedExistingPath, inside, isProtectedPath } from '../../semantic-ide/path-safety.js';

const MAX_FILES = 32;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const STATE_VERSION = 1 as const;

export interface FileCheckpointSnapshot {
  path: string;
  exists: boolean;
  sha256: string | null;
  size: number;
}
interface FileCheckpointNode {
  origin?: 'automatic';
  invocationId?: string;
  taskId?: string;
  capturedPaths?: string[];
  capturedBytes?: number;
  id: string;
  parent: string | null;
  children: string[];
  title: string;
  createdAt: string;
  files: Record<string, FileCheckpointSnapshot>;
}
interface FileCheckpointState {
  version: typeof STATE_VERSION;
  root: string;
  head: string;
  baseline: Record<string, FileCheckpointSnapshot>;
  nodes: Record<string, FileCheckpointNode>;
}
/** Pre-mutation snapshots of one automatic checkpoint, for the read-only task-changes view. */
export interface AutomaticCheckpointRecord {
  id: string;
  invocationId: string;
  taskId?: string;
  createdAt: string;
  captured: FileCheckpointSnapshot[];
}
export interface RestorePreview {
  checkpointId: string;
  title: string;
  previewDigest: string;
  changes: Array<{ path: string; current: FileCheckpointSnapshot; target: FileCheckpointSnapshot }>;
}

const digest = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const stateDigest = (value: unknown) => 'sha256:' + digest(JSON.stringify(value));
const cloneSnapshot = (value: FileCheckpointSnapshot): FileCheckpointSnapshot => ({ ...value });
const MODULE_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROJECT_ROOT = resolveProjectRoot(process.env, MODULE_PROJECT_ROOT);

const AUTO = Object.freeze({ paths: 16, fileBytes: 8 * 1024 * 1024, captureBytes: 32 * 1024 * 1024,
  nodes: 64, totalNodes: 128, trackedPaths: 256, stateBytes: 4 * 1024 * 1024,
  blobBytes: 256 * 1024 * 1024, inventoryEntries: 4096, milliseconds: 2000 });
class AutoCaptureRefusal extends Error {
  constructor(readonly reason: AutoCheckpointReason) { super('CHECKPOINT_AUTO_' + reason); }
}
const refuseAuto = (reason: AutoCheckpointReason): never => { throw new AutoCaptureRefusal(reason); };
interface SnapshotBudget { maxBytes: number; check(): void; staged?: Map<string, Buffer> }

export class FileCheckpointService {
  private state: FileCheckpointState | null = null;
  private stateTail: Promise<void> = Promise.resolve();
  /** State serialization never waits for a path lock. Mutators hold canonical paths first. */
  private async withState<T>(action: () => Promise<T>): Promise<T> {
    const prior = this.stateTail;
    let release!: () => void;
    this.stateTail = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try { return await action(); } finally { release(); }
  }
  private async publish(next: FileCheckpointState): Promise<void> {
    await writeOwnedFileAtomic(this.statePath, JSON.stringify(next, null, 2));
    this.state = next;
  }

  private readonly statePath: string;
  private readonly blobsDir: string;

  constructor(
    private readonly root = PROJECT_ROOT,
    private readonly storageDir = path.join(root, 'runtime', 'checkpoints'),
  ) {
    this.statePath = path.join(storageDir, 'state.json');
    this.blobsDir = path.join(storageDir, 'blobs');
  }

  private rebaseState(parsed: FileCheckpointState, nextRoot: string): FileCheckpointState {
    const previousRoot = path.resolve(parsed.root);
    const rebaseSnapshot = (snapshot: FileCheckpointSnapshot): FileCheckpointSnapshot => {
      const previousPath = path.resolve(snapshot.path);
      const relative = path.relative(previousRoot, previousPath);
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
        return { ...snapshot, path: path.resolve(nextRoot, relative) };
      }
      throw new Error('CHECKPOINT_ROOT_MISMATCH');
    };
    const rebaseMap = (values: Record<string, FileCheckpointSnapshot>) => {
      const result: Record<string, FileCheckpointSnapshot> = {};
      for (const snapshot of Object.values(values)) {
        const rebased = rebaseSnapshot(snapshot);
        result[this.key(rebased.path)] = rebased;
      }
      return result;
    };
    const nodes = Object.fromEntries(Object.entries(parsed.nodes).map(([id, node]) => [
      id, { ...node, files: rebaseMap(node.files), ...(node.capturedPaths ? { capturedPaths: node.capturedPaths.map(file => rebaseSnapshot({ path: file, exists: false, sha256: null, size: 0 }).path) } : {}) },
    ]));
    return { ...parsed, root: nextRoot, baseline: rebaseMap(parsed.baseline), nodes };
  }

  private async load(): Promise<FileCheckpointState> {
    if (this.state) return this.state;
    await mkdir(this.blobsDir, { recursive: true });
    try {
      let parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as FileCheckpointState;
      if (parsed.version !== STATE_VERSION) throw new Error('CHECKPOINT_STATE_VERSION_UNSUPPORTED');
      const rootReal = await realpath(this.root);
      if (path.resolve(parsed.root) !== path.resolve(rootReal)) {
        parsed = this.rebaseState(parsed, rootReal);
        this.state = parsed;
        await this.save();
      }
      if (!parsed.nodes[parsed.head]) throw new Error('CHECKPOINT_HEAD_INVALID');
      for (const node of Object.values(parsed.nodes)) {
        // Older manual nodes have none of these optional fields and remain valid.
        if (node.origin !== undefined && (node.origin !== 'automatic' || typeof node.invocationId !== 'string'
          || !/^[A-Za-z0-9._:-]{1,128}$/.test(node.invocationId)
          || node.taskId !== undefined && (typeof node.taskId !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(node.taskId))
          || !Array.isArray(node.capturedPaths) || node.capturedPaths.length > AUTO.paths
          || node.capturedPaths.some(file => typeof file !== 'string' || !inside(file, this.root))
          || !Number.isSafeInteger(node.capturedBytes) || node.capturedBytes! < 0)) throw new Error('CHECKPOINT_AUTOMATIC_METADATA_INVALID');
      }
      this.state = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const rootReal = await realpath(this.root);
      const origin: FileCheckpointNode = {
        id: 'origin', parent: null, children: [], title: 'Session origin',
        createdAt: new Date().toISOString(), files: {},
      };
      this.state = { version: STATE_VERSION, root: rootReal, head: origin.id, baseline: {}, nodes: { origin } };
      await this.save();
    }
    return this.state!;
  }

  private async save(): Promise<void> {
    if (!this.state) return;
    await writeOwnedFileAtomic(this.statePath, JSON.stringify(this.state, null, 2));
  }

  private key(filePath: string): string {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  private async resolveCandidate(input: string): Promise<string> {
    const lexical = path.resolve(this.root, input);
    if (!inside(lexical, this.root) || isProtectedPath(lexical)) throw new Error('CHECKPOINT_PATH_NOT_AUTHORIZED');
    try {
      const authorized = await authorizedExistingPath(this.root, lexical);
      return authorized.realPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const authorized = await authorizedDestinationPath(this.root, lexical);
      return path.resolve(authorized.lexicalPath);
    }
  }

  private blobPath(hash: string): string {
    return path.join(this.blobsDir, hash.slice(0, 2), hash);
  }

  private async putBlob(bytes: Uint8Array): Promise<string> {
    const hash = digest(bytes);
    const target = this.blobPath(hash);
    try {
      await lstat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(path.dirname(target), { recursive: true });
      await writeOwnedFileAtomic(target, bytes);
    }
    return hash;
  }

  private async snapshotCanonical(canonicalPath: string, persistBlob = true, budget?: SnapshotBudget): Promise<FileCheckpointSnapshot> {
    const check = budget?.check ?? (() => undefined), maximum = budget?.maxBytes ?? MAX_FILE_BYTES;
    check();
    let before;
    try { before = await lstat(canonicalPath, { bigint: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: canonicalPath, exists: false, sha256: null, size: 0 };
      throw error;
    }
    if (before.isSymbolicLink()) throw new Error('CHECKPOINT_SYMLINK_REFUSED');
    if (!before.isFile()) throw new Error('CHECKPOINT_REGULAR_FILE_REQUIRED');
    if (before.size > BigInt(maximum)) throw new Error('CHECKPOINT_FILE_TOO_LARGE');
    check();
    // Await the actual descriptor lifecycle; never abandon a racing capture before mutation.
    const handle = await open(canonicalPath, fsConstants.O_RDONLY | (fsConstants.O_NONBLOCK ?? 0));
    try {
      const opened = await handle.stat({ bigint: true });
      if (!opened.isFile()) throw new Error('CHECKPOINT_REGULAR_FILE_REQUIRED');
      assertSameFileIdentity(before, opened, 'checkpoint');
      const chunks: Buffer[] = []; let total = 0;
      for (;;) {
        check();
        const buffer = Buffer.allocUnsafe(Math.min(65536, maximum - total + 1));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        total += bytesRead;
        if (total > maximum) throw new Error('CHECKPOINT_FILE_TOO_LARGE');
        chunks.push(buffer.subarray(0, bytesRead));
      }
      const after = await handle.stat({ bigint: true }), current = await lstat(canonicalPath, { bigint: true });
      assertSameFileIdentity(opened, after, 'checkpoint'); assertSameFileIdentity(after, current, 'checkpoint');
      if (current.isSymbolicLink() || before.size !== opened.size || opened.size !== after.size || after.size !== current.size
        || BigInt(total) !== after.size || before.mtimeNs !== opened.mtimeNs || opened.mtimeNs !== after.mtimeNs
        || after.mtimeNs !== current.mtimeNs || before.ctimeNs !== opened.ctimeNs || opened.ctimeNs !== after.ctimeNs
        || after.ctimeNs !== current.ctimeNs) throw new Error('CHECKPOINT_SOURCE_CHANGED');
      check();
      const bytes = Buffer.concat(chunks, total);
      const hash = persistBlob ? await this.putBlob(bytes) : digest(bytes);
      budget?.staged?.set(hash, bytes);
      return { path: canonicalPath, exists: true, sha256: hash, size: total };
    } finally { await handle.close(); }
  }

  private prepareNode(state: FileCheckpointState, snapshots: FileCheckpointSnapshot[], title: string,
    automatic?: Pick<FileCheckpointNode, 'origin' | 'invocationId' | 'taskId' | 'capturedPaths' | 'capturedBytes'>) {
    const next = structuredClone(state), parent = next.nodes[next.head];
    const files = { ...parent.files };
    for (const snapshot of snapshots) {
      const key = this.key(snapshot.path);
      next.baseline[key] ??= cloneSnapshot(snapshot);
      files[key] = cloneSnapshot(snapshot);
    }
    const node: FileCheckpointNode = { id: randomUUID(), parent: parent.id, children: [],
      title: title.trim().slice(0, 200) || 'Checkpoint', createdAt: new Date().toISOString(), files, ...automatic };
    next.nodes[node.id] = node; parent.children.push(node.id); next.head = node.id;
    return { next, node };
  }

  /** Caller must already own every canonical target path lock. Not a public MCP entry point. */
  async createAutomatic(paths: string[], context?: MutationExecutionContext): Promise<AutoCheckpointReceipt> {
    const report = (receipt: AutoCheckpointReceipt): AutoCheckpointReceipt => {
      const frozen = Object.freeze(receipt);
      try { context?.reportAutoCheckpoint(frozen); } catch { /* presentation must not change mutation outcome */ }
      return frozen;
    };
    if (!context?.checkpointGranted) return report({ status: 'not-captured', reason: 'grant-unavailable' });
    const deadline = performance.now() + AUTO.milliseconds;
    const check = () => { if (context.signal?.aborted || performance.now() >= deadline) refuseAuto('budget-exceeded'); };
    try {
      if (!Array.isArray(paths) || !paths.length) return report({ status: 'not-captured', reason: 'no-change' });
      if (paths.length > AUTO.paths) refuseAuto('budget-exceeded');
      const canonical: string[] = [];
      const { validatePath } = await import('../tools/filesystem.js');
      for (const file of paths) {
        check();
        const lexical = path.resolve(this.root, file);
        if (!inside(lexical, this.root) || isProtectedPath(lexical) || inside(lexical, this.storageDir)) refuseAuto('path-not-eligible');
        const parts = path.relative(this.root, lexical).split(/[\\/]+/);
        if (parts.some(part => isSensitiveKey(part) || /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|\.npmrc|\.pypirc|id_rsa|id_ed25519)$/i.test(part))
          || /\.(?:pem|key|pfx|p12|jks|keystore)$/i.test(lexical)) refuseAuto('path-not-eligible');
        try { await assertEvidenceLocalPath(lexical); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') refuseAuto('path-not-eligible');
          await assertEvidenceLocalPath(path.dirname(lexical));
        }
        const candidate = await this.resolveCandidate(lexical);
        if (this.key(candidate) !== this.key(await validatePath(candidate))) refuseAuto('path-not-eligible');
        const stats = await lstat(candidate).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
        if (stats && !stats.isFile()) refuseAuto('unsupported-operation');
        if (stats && stats.size > AUTO.fileBytes) refuseAuto('budget-exceeded');
        canonical.push(candidate);
      }
      const unique = [...new Map(canonical.map(file => [this.key(file), file])).values()];
      if (decideToolEvidenceCapture('file_checkpoint', { paths: unique }).disposition !== 'full') refuseAuto('path-not-eligible');
      return await this.withState(async () => {
        check();
        // Missing store is a complete empty inventory, not a new checkpoint owner.
        let blobBytes = 0, entries = 0;
        const knownBlobs = new Set<string>();
        const storeExists = await lstat(this.storageDir).then(() => true, error => {
          if (error.code === 'ENOENT') return false;
          return refuseAuto('quota-unavailable');
        });
        if (!storeExists) await assertEvidenceLocalPath(path.dirname(this.storageDir));
        else try {
          await assertEvidenceLocalPath(this.storageDir);
          const stateStat = await lstat(this.statePath).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
          if (stateStat && (stateStat.isSymbolicLink() || !stateStat.isFile())) refuseAuto('quota-unavailable');
          if (stateStat && stateStat.size > AUTO.stateBytes) refuseAuto('quota-reached');
          const stack = [this.blobsDir];
          while (stack.length) {
            check(); const directory = stack.pop()!;
            const stats = await lstat(directory).catch(error => { if (error.code === 'ENOENT' && directory === this.blobsDir) return undefined; return refuseAuto('quota-unavailable'); });
            if (!stats) continue;
            if (stats.isSymbolicLink() || !stats.isDirectory()) refuseAuto('quota-unavailable');
            const iterator = await opendir(directory);
            for await (const entry of iterator) {
              if (++entries > AUTO.inventoryEntries || performance.now() >= deadline) refuseAuto('quota-unavailable');
              check(); const file = path.join(directory, entry.name), info = await lstat(file);
              if (info.isSymbolicLink()) refuseAuto('quota-unavailable');
              if (info.isDirectory()) stack.push(file);
              else if (info.isFile()) { blobBytes += info.size; knownBlobs.add(this.key(file)); }
              else refuseAuto('quota-unavailable');
              if (blobBytes > AUTO.blobBytes) refuseAuto('quota-reached');
            }
          }
        } catch (error) {
          if (error instanceof AutoCaptureRefusal && error.reason !== 'budget-exceeded') throw error;
          refuseAuto('quota-unavailable');
        }
        check(); const state = await this.load(), nodes = Object.values(state.nodes);
        if (nodes.length >= AUTO.totalNodes || nodes.filter(node => node.origin === 'automatic').length >= AUTO.nodes
          || Buffer.byteLength(JSON.stringify(state, null, 2)) > AUTO.stateBytes) refuseAuto('quota-reached');
        const tracked = new Set(Object.keys(state.baseline));
        for (const node of nodes) for (const key of Object.keys(node.files)) tracked.add(key);
        for (const file of unique) tracked.add(this.key(file));
        if (tracked.size > AUTO.trackedPaths) refuseAuto('quota-reached');
        const staged = new Map<string, Buffer>(), snapshots: FileCheckpointSnapshot[] = [];
        let total = 0;
        for (const file of unique) {
          check();
          const snapshot = await this.snapshotCanonical(file, false, { maxBytes: Math.min(AUTO.fileBytes, AUTO.captureBytes - total), check, staged });
          total += snapshot.size;
          if (total > AUTO.captureBytes) refuseAuto('budget-exceeded');
          snapshots.push(snapshot);
        }
        // Reject recognizable secret material; never redact backup bytes and claim exact restoration.
        for (const bytes of staged.values()) {
          check(); const text = bytes.toString('utf8');
          if (redactSensitiveString(text) !== text || /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/.test(text)) refuseAuto('path-not-eligible');
        }
        let addedBytes = 0;
        for (const [sha, bytes] of staged) if (!knownBlobs.has(this.key(this.blobPath(sha)))) addedBytes += bytes.length;
        if (blobBytes + addedBytes > AUTO.blobBytes) refuseAuto('quota-reached');
        const prepared = this.prepareNode(state, snapshots, 'Automatic pre-mutation checkpoint', {
          origin: 'automatic', invocationId: context.invocationId,
          ...(context.taskId ? { taskId: context.taskId } : {}), capturedPaths: unique, capturedBytes: total });
        if (Buffer.byteLength(JSON.stringify(prepared.next, null, 2)) > AUTO.stateBytes) refuseAuto('quota-reached');
        check();
        for (const [sha, bytes] of staged) {
          check(); const target = this.blobPath(sha);
          if (knownBlobs.has(this.key(target))) {
            const info = await lstat(target);
            if (!info.isFile() || info.isSymbolicLink() || info.size !== bytes.length) refuseAuto('capture-failed');
            const existing = await this.snapshotCanonical(target, false, { maxBytes: bytes.length, check });
            if (existing.sha256 !== sha) refuseAuto('capture-failed');
          } else await this.putBlob(bytes);
        }
        check();
        // Once atomic publication begins, await it fully even if the soft deadline expires.
        await this.publish(prepared.next);
        return report({ status: 'captured', checkpointId: prepared.node.id, pathCount: unique.length, capturedBytes: total });
      });
    } catch (error) {
      const reason = error instanceof AutoCaptureRefusal ? error.reason
        : error instanceof Error && error.message === 'CHECKPOINT_FILE_TOO_LARGE' ? 'budget-exceeded'
          : error instanceof Error && /(?:PATH_|PROTECTED|SYMLINK|LINK_REFUSED)/.test(error.message) ? 'path-not-eligible' : 'capture-failed';
      return report({ status: 'not-captured', reason });
    }
  }

  async create(paths: string[], title = 'Checkpoint'): Promise<FileCheckpointNode> {
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_FILES) throw new Error('CHECKPOINT_PATH_COUNT_INVALID');
    const canonical = await Promise.all(paths.map(value => this.resolveCandidate(value)));
    const unique = [...new Map(canonical.map(value => [this.key(value), value])).values()];
    if (unique.length !== paths.length) throw new Error('CHECKPOINT_DUPLICATE_PATH');
    return fileMutationCoordinator.run(unique, () => this.withState(async () => {
      for (const file of unique) if (this.key(await this.resolveCandidate(file)) !== this.key(file)) throw new Error('CHECKPOINT_PATH_CHANGED');
      const state = await this.load();
      const snapshots = await Promise.all(unique.map(file => this.snapshotCanonical(file)));
      const { next, node } = this.prepareNode(state, snapshots, title);
      await this.publish(next);
      return structuredClone(node);
    }));
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    return this.withState(async () => {
      const state = await this.load();
      return Object.values(state.nodes).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(node => ({ id: node.id, parent: node.parent, children: [...node.children], title: node.title,
          createdAt: node.createdAt, fileCount: Object.keys(node.files).length, isHead: node.id === state.head,
          ...(node.origin === 'automatic' ? { origin: node.origin, invocationId: node.invocationId, taskId: node.taskId,
            capturedPaths: [...(node.capturedPaths ?? [])], capturedBytes: node.capturedBytes } : {}) }));
    });
  }

  async show(checkpointId: string): Promise<Record<string, unknown>> {
    return this.withState(async () => {
      const state = await this.load(), node = state.nodes[checkpointId];
      if (!node) throw new Error('CHECKPOINT_NOT_FOUND');
      return { ...structuredClone(node), isHead: node.id === state.head, baselineCount: Object.keys(state.baseline).length };
    });
  }

  /** Root every checkpointed path is confined to. */
  get workspaceRoot(): string { return this.root; }

  /**
   * Read-only projection for presentation. Never creates, rebases on disk or publishes state;
   * a missing store is an empty list, not a new checkpoint owner.
   */
  async readAutomaticCheckpoints(): Promise<AutomaticCheckpointRecord[]> {
    return this.withState(async () => {
      let state = this.state;
      if (!state) {
        let parsed: FileCheckpointState;
        try { parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as FileCheckpointState; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw error;
        }
        if (parsed.version !== STATE_VERSION) throw new Error('CHECKPOINT_STATE_VERSION_UNSUPPORTED');
        const rootReal = await realpath(this.root);
        state = path.resolve(parsed.root) === path.resolve(rootReal) ? parsed : this.rebaseState(parsed, rootReal);
      }
      return Object.values(state.nodes)
        .filter(node => node.origin === 'automatic' && typeof node.invocationId === 'string' && Array.isArray(node.capturedPaths))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(node => ({
          id: node.id, invocationId: node.invocationId!, createdAt: node.createdAt,
          ...(node.taskId ? { taskId: node.taskId } : {}),
          captured: node.capturedPaths!.flatMap(file => {
            const snapshot = node.files[this.key(file)];
            return snapshot ? [cloneSnapshot(snapshot)] : [];
          }),
        }));
    });
  }

  /** Read-only blob access: only a regular file whose bytes still match the requested digest. */
  async readBlob(sha256: string, maxBytes: number): Promise<Buffer | null> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
    try {
      const target = this.blobPath(sha256), info = await lstat(target);
      if (!info.isFile() || info.size > maxBytes) return null;
      const bytes = await readFile(target);
      return digest(bytes) === sha256 ? bytes : null;
    } catch { return null; }
  }

  /** Path of a stored blob for read-only consumers; callers must verify content with readBlob first. */
  blobFilePath(sha256: string): string { return this.blobPath(sha256); }

  private targetFiles(state: FileCheckpointState, node: FileCheckpointNode): Record<string, FileCheckpointSnapshot> {
    const merged: Record<string, FileCheckpointSnapshot> = {};
    for (const [key, value] of Object.entries(state.baseline)) merged[key] = cloneSnapshot(value);
    for (const [key, value] of Object.entries(node.files)) merged[key] = cloneSnapshot(value);
    return merged;
  }

  async previewRestore(checkpointId: string): Promise<RestorePreview> {
    return this.withState(async () => this.previewLocked(await this.load(), checkpointId));
  }

  private async previewLocked(state: FileCheckpointState, checkpointId: string): Promise<RestorePreview> {
    const node = state.nodes[checkpointId];
    if (!node) throw new Error('CHECKPOINT_NOT_FOUND');
    const target = this.targetFiles(state, node);
    const changes: RestorePreview['changes'] = [];
    const currentFingerprint: Array<[string, boolean, string | null, number]> = [];
    for (const key of Object.keys(target).sort()) {
      if (this.key(await this.resolveCandidate(target[key].path)) !== this.key(target[key].path)) throw new Error('CHECKPOINT_PATH_CHANGED');
      const current = await this.snapshotCanonical(target[key].path, false);
      currentFingerprint.push([key, current.exists, current.sha256, current.size]);
      const wanted = target[key];
      if (current.exists !== wanted.exists || current.sha256 !== wanted.sha256) {
        changes.push({ path: wanted.path, current, target: cloneSnapshot(wanted) });
      }
    }
    return { checkpointId, title: node.title, previewDigest: stateDigest({ checkpointId, state: stateDigest(state), currentFingerprint }), changes };
  }

  private async applySnapshot(snapshot: FileCheckpointSnapshot): Promise<void> {
    if (!snapshot.exists) {
      await rm(snapshot.path, { force: true });
      return;
    }
    if (!snapshot.sha256) throw new Error('CHECKPOINT_BLOB_HASH_MISSING');
    const bytes = await readFile(this.blobPath(snapshot.sha256));
    if (digest(bytes) !== snapshot.sha256) throw new Error('CHECKPOINT_BLOB_CORRUPT');
    await mkdir(path.dirname(snapshot.path), { recursive: true });
    await writeOwnedFileAtomic(snapshot.path, bytes);
  }

  async restore(checkpointId: string, previewDigest: string): Promise<Record<string, unknown>> {
    // Read target paths first without holding state while waiting on a path lock.
    const initial = await this.withState(async () => {
      const state = await this.load(), node = state.nodes[checkpointId];
      if (!node) throw new Error('CHECKPOINT_NOT_FOUND');
      return { fingerprint: stateDigest(state), paths: Object.values(this.targetFiles(state, node)).map(item => item.path) };
    });
    return fileMutationCoordinator.run(initial.paths, () => this.withState(async () => {
      const state = await this.load();
      if (stateDigest(state) !== initial.fingerprint) throw new Error('CHECKPOINT_RESTORE_PREVIEW_STALE');
      const preview = await this.previewLocked(state, checkpointId);
      if (preview.previewDigest !== previewDigest) throw new Error('CHECKPOINT_RESTORE_PREVIEW_STALE');
      const target = this.targetFiles(state, state.nodes[checkpointId]);
      const rollback = new Map<string, FileCheckpointSnapshot>();
      try {
        for (const item of preview.changes) rollback.set(this.key(item.path), await this.snapshotCanonical(item.path));
        for (const item of preview.changes) {
          if (this.key(await this.resolveCandidate(item.path)) !== this.key(item.path)) throw new Error('CHECKPOINT_PATH_CHANGED');
          await this.applySnapshot(target[this.key(item.path)]);
        }
        // Success is reported only after every restored file reads back as the checkpoint says; otherwise roll back.
        for (const item of preview.changes) {
          const wanted = target[this.key(item.path)], now = await this.snapshotCanonical(item.path, false);
          if (now.exists !== wanted.exists || now.sha256 !== wanted.sha256) throw new Error('CHECKPOINT_RESTORE_VERIFICATION_FAILED');
        }
        const next = structuredClone(state); next.head = checkpointId;
        await this.publish(next);
      } catch (error) {
        for (const snapshot of [...rollback.values()].reverse()) await this.applySnapshot(snapshot).catch(() => undefined);
        throw error;
      }
      return { checkpointId, restored: preview.changes.length, head: checkpointId };
    }));
  }

  async drop(checkpointId: string): Promise<Record<string, unknown>> {
    return this.withState(async () => {
      const state = structuredClone(await this.load());
      if (checkpointId === 'origin') throw new Error('CHECKPOINT_ORIGIN_PROTECTED');
      const node = state.nodes[checkpointId];
      if (!node) throw new Error('CHECKPOINT_NOT_FOUND');
      if (node.children.length) throw new Error('CHECKPOINT_DROP_REQUIRES_LEAF');
      const parent = node.parent ? state.nodes[node.parent] : undefined;
      if (parent) parent.children = parent.children.filter(id => id !== checkpointId);
      if (state.head === checkpointId) state.head = parent?.id ?? 'origin';
      delete state.nodes[checkpointId];
      await this.publish(state);
      return { dropped: checkpointId, head: state.head };
    });
  }

}

export const fileCheckpointService = new FileCheckpointService();
