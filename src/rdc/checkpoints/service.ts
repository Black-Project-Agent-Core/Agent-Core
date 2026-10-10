import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm } from 'node:fs/promises';
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

export class FileCheckpointService {
  private state: FileCheckpointState | null = null;
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
      id, { ...node, files: rebaseMap(node.files) },
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

  private async snapshotCanonical(canonicalPath: string, persistBlob = true): Promise<FileCheckpointSnapshot> {
    try {
      const stats = await lstat(canonicalPath);
      if (stats.isSymbolicLink()) throw new Error('CHECKPOINT_SYMLINK_REFUSED');
      if (!stats.isFile()) throw new Error('CHECKPOINT_REGULAR_FILE_REQUIRED');
      if (stats.size > MAX_FILE_BYTES) throw new Error('CHECKPOINT_FILE_TOO_LARGE');
      const bytes = await readFile(canonicalPath);
      const hash = persistBlob ? await this.putBlob(bytes) : digest(bytes);
      return { path: canonicalPath, exists: true, sha256: hash, size: bytes.length };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: canonicalPath, exists: false, sha256: null, size: 0 };
      throw error;
    }
  }

  async create(paths: string[], title = 'Checkpoint'): Promise<FileCheckpointNode> {
    if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_FILES) throw new Error('CHECKPOINT_PATH_COUNT_INVALID');
    const state = await this.load();
    const canonical = await Promise.all(paths.map(value => this.resolveCandidate(value)));
    const unique = [...new Map(canonical.map(value => [this.key(value), value])).values()];
    if (unique.length !== paths.length) throw new Error('CHECKPOINT_DUPLICATE_PATH');
    const snapshots = await Promise.all(unique.map(value => this.snapshotCanonical(value)));
    for (const snapshot of snapshots) {
      const key = this.key(snapshot.path);
      if (!state.baseline[key]) state.baseline[key] = cloneSnapshot(snapshot);
    }
    const parent = state.nodes[state.head];
    const files: Record<string, FileCheckpointSnapshot> = Object.fromEntries(
      Object.entries(parent.files).map(([key, value]) => [key, cloneSnapshot(value)]),
    );
    for (const snapshot of snapshots) files[this.key(snapshot.path)] = cloneSnapshot(snapshot);
    const id = randomUUID();
    const node: FileCheckpointNode = {
      id, parent: parent.id, children: [], title: title.trim().slice(0, 200) || 'Checkpoint',
      createdAt: new Date().toISOString(), files,
    };
    state.nodes[id] = node;
    parent.children.push(id);
    state.head = id;
    await this.save();
    return node;
  }

  async list(): Promise<Array<Record<string, unknown>>> {
    const state = await this.load();
    return Object.values(state.nodes)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(node => ({ id: node.id, parent: node.parent, children: [...node.children], title: node.title,
        createdAt: node.createdAt, fileCount: Object.keys(node.files).length, isHead: node.id === state.head }));
  }

  async show(checkpointId: string): Promise<Record<string, unknown>> {
    const state = await this.load();
    const node = state.nodes[checkpointId];
    if (!node) throw new Error('CHECKPOINT_NOT_FOUND');
    return { ...node, isHead: node.id === state.head, baselineCount: Object.keys(state.baseline).length };
  }

  private targetFiles(state: FileCheckpointState, node: FileCheckpointNode): Record<string, FileCheckpointSnapshot> {
    const merged: Record<string, FileCheckpointSnapshot> = {};
    for (const [key, value] of Object.entries(state.baseline)) merged[key] = cloneSnapshot(value);
    for (const [key, value] of Object.entries(node.files)) merged[key] = cloneSnapshot(value);
    return merged;
  }

  async previewRestore(checkpointId: string): Promise<RestorePreview> {
    const state = await this.load();
    const node = state.nodes[checkpointId];
    if (!node) throw new Error('CHECKPOINT_NOT_FOUND');
    const target = this.targetFiles(state, node);
    const changes: RestorePreview['changes'] = [];
    const currentFingerprint: Array<[string, boolean, string | null, number]> = [];
    for (const key of Object.keys(target).sort()) {
      const current = await this.snapshotCanonical(target[key].path, false);
      currentFingerprint.push([key, current.exists, current.sha256, current.size]);
      const wanted = target[key];
      if (current.exists !== wanted.exists || current.sha256 !== wanted.sha256) {
        changes.push({ path: wanted.path, current, target: cloneSnapshot(wanted) });
      }
    }
    return { checkpointId, title: node.title, previewDigest: stateDigest({ checkpointId, currentFingerprint }), changes };
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
    const preview = await this.previewRestore(checkpointId);
    if (preview.previewDigest !== previewDigest) throw new Error('CHECKPOINT_RESTORE_PREVIEW_STALE');
    const state = await this.load();
    const node = state.nodes[checkpointId];
    const target = this.targetFiles(state, node);
    const rollback = new Map<string, FileCheckpointSnapshot>();
    try {
      for (const item of preview.changes) rollback.set(this.key(item.path), await this.snapshotCanonical(item.path));
      for (const item of preview.changes) await this.applySnapshot(target[this.key(item.path)]);
    } catch (error) {
      for (const snapshot of [...rollback.values()].reverse()) await this.applySnapshot(snapshot).catch(() => undefined);
      throw error;
    }
    state.head = checkpointId;
    await this.save();
    return { checkpointId, restored: preview.changes.length, head: state.head };
  }

  async drop(checkpointId: string): Promise<Record<string, unknown>> {
    const state = await this.load();
    if (checkpointId === 'origin') throw new Error('CHECKPOINT_ORIGIN_PROTECTED');
    const node = state.nodes[checkpointId];
    if (!node) throw new Error('CHECKPOINT_NOT_FOUND');
    if (node.children.length) throw new Error('CHECKPOINT_DROP_REQUIRES_LEAF');
    const parent = node.parent ? state.nodes[node.parent] : undefined;
    if (parent) parent.children = parent.children.filter(id => id !== checkpointId);
    if (state.head === checkpointId) state.head = parent?.id ?? 'origin';
    delete state.nodes[checkpointId];
    await this.save();
    return { dropped: checkpointId, head: state.head };
  }
}

export const fileCheckpointService = new FileCheckpointService();
