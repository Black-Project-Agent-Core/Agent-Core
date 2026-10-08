import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';

interface PortabilityState {
  schemaVersion: 1 | 2;
  projectRoot: string;
  machineId: string;
  updatedAt: string;
  lastRelocatedAt?: string;
  previousRoot?: string;
  previousMachineId?: string;
}

export interface PortabilityPreparation {
  relocated: boolean;
  rootChanged: boolean;
  machineChanged: boolean;
  firstAnchor: boolean;
  transientReset: boolean;
  previousRoot?: string;
  backupDir?: string;
}

const normalize = (value: string) => {
  const resolved = path.resolve(value).replaceAll('\\', '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

export function currentMachineId(): string {
  return `${process.platform}:${process.arch}:${os.hostname().toLowerCase()}`;
}

export interface PortabilityReindexRequest {
  schemaVersion: 1;
  projectRoot: string;
  reason: 'first-anchor' | 'schema-upgrade' | 'root-change' | 'machine-change';
  createdAt: string;
}

const portabilityDirFor = (projectRoot: string) => path.join(path.resolve(projectRoot), 'runtime', 'portability');
const reindexMarkerFor = (projectRoot: string) => path.join(portabilityDirFor(projectRoot), 'grafel-reindex-required.json');

export async function readPortabilityReindexRequest(projectRoot: string): Promise<PortabilityReindexRequest | null> {
  try {
    const parsed = JSON.parse(await readFile(reindexMarkerFor(projectRoot), 'utf8')) as PortabilityReindexRequest;
    return parsed?.schemaVersion === 1 ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function clearPortabilityReindexRequest(projectRoot: string): Promise<void> {
  await rm(reindexMarkerFor(projectRoot), { force: true });
}

async function moveIfPresent(source: string, destination: string): Promise<boolean> {
  try {
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(source, destination);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function archiveGrafelMachineState(root: string, backupRoot: string): Promise<boolean> {
  const daemonRoot = path.join(root, 'runtime', 'grafel', 'daemon');
  const entries = [
    'daemon.pid',
    'engine.pid',
    'sockets',
    'watchers.json',
    'worktrees.json',
    'repo-rss-history.json',
  ] as const;
  let moved = false;
  for (const entry of entries) {
    moved = await moveIfPresent(
      path.join(daemonRoot, entry),
      path.join(backupRoot, entry),
    ) || moved;
  }
  return moved;
}

async function readState(statePath: string): Promise<PortabilityState | null> {
  try {
    const parsed = JSON.parse(await readFile(statePath, 'utf8')) as PortabilityState;
    return parsed && (parsed.schemaVersion === 1 || parsed.schemaVersion === 2) ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function preparePortableRuntime(
  projectRoot: string,
  machineId = currentMachineId(),
): Promise<PortabilityPreparation> {
  const root = path.resolve(projectRoot);
  const portabilityDir = portabilityDirFor(root);
  const statePath = path.join(portabilityDir, 'root-state.json');
  await mkdir(portabilityDir, { recursive: true });

  const previous = await readState(statePath);
  const firstAnchor = !previous;
  const rootChanged = Boolean(previous && normalize(previous.projectRoot) !== normalize(root));
  const machineChanged = Boolean(previous && previous.machineId !== machineId);
  const schemaUpgrade = Boolean(previous && previous.schemaVersion < 2);
  const relocated = rootChanged || machineChanged;
  const resetRequested = firstAnchor || schemaUpgrade || relocated;
  let backupDir: string | undefined;
  let transientReset = false;

  if (resetRequested) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const candidateBackup = path.join(root, 'runtime', 'backups', `portability-relocation-${stamp}`);
    // Grafel graph state is project-root scoped, not machine scoped. A pure
    // machine change should discard only process/watcher ownership; preserving
    // daemon/state avoids an unnecessary full graph rebuild on slower hosts.
    // Root/schema/first-anchor transitions still archive the whole daemon tree.
    const fullGrafelReset = rootChanged || schemaUpgrade || firstAnchor;
    const movedGrafel = fullGrafelReset
      ? await moveIfPresent(
        path.join(root, 'runtime', 'grafel', 'daemon'),
        path.join(candidateBackup, 'grafel-daemon'),
      )
      : machineChanged
        ? await archiveGrafelMachineState(root, path.join(candidateBackup, 'grafel-machine-state'))
        : false;
    const movedSemantic = await moveIfPresent(
      path.join(root, 'runtime', 'semantic-ide', 'state'),
      path.join(candidateBackup, 'semantic-ide-state'),
    );
    const movedBrowser = await moveIfPresent(
      path.join(root, 'runtime', 'rdc', 'browser-control'),
      path.join(candidateBackup, 'browser-control-sessions'),
    );
    transientReset = movedGrafel || movedSemantic || movedBrowser;
    if (transientReset) backupDir = candidateBackup;

    if (movedGrafel && fullGrafelReset) {
      const reason: PortabilityReindexRequest['reason'] = rootChanged
        ? 'root-change'
        : schemaUpgrade
          ? 'schema-upgrade'
          : 'first-anchor';
      await writeOwnedFileAtomic(reindexMarkerFor(root), JSON.stringify({
        schemaVersion: 1,
        projectRoot: root,
        reason,
        createdAt: new Date().toISOString(),
      } satisfies PortabilityReindexRequest, null, 2));
    }
  }

  const now = new Date().toISOString();
  const next: PortabilityState = {
    schemaVersion: 2,
    projectRoot: root,
    machineId,
    updatedAt: now,
    ...(relocated && previous ? {
      lastRelocatedAt: now,
      previousRoot: previous.projectRoot,
      previousMachineId: previous.machineId,
    } : {}),
  };
  await writeOwnedFileAtomic(statePath, JSON.stringify(next, null, 2));
  return {
    relocated,
    rootChanged,
    machineChanged,
    firstAnchor,
    transientReset,
    ...(previous?.projectRoot ? { previousRoot: previous.projectRoot } : {}),
    ...(backupDir ? { backupDir } : {}),
  };
}