import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { resolveShellInvocation } from '../runtime/platform-shell.js';
import type { ValidatedExecutionNode } from './dag.js';
import { canonicalExecutionPath } from './resource-claims.js';

export type ExecutionApplicability = 'current' | 'inputs_changed' | 'outputs_changed' | 'legacy_unbound' | 'identity_mismatch';
export interface ContentEntry { path: string; kind: 'file' | 'directory' | 'missing'; sha256?: string }
export interface DependencyIdentity { nodeId: string; attemptId: string; attemptNo: number; resultHash: string }
export interface ExecutionWorkflowBinding {
  policyVersion?: string;
  planRevision?: string;
  planHash?: string;
  requiredStepIds?: string[];
}
export interface ExecutionProvenance {
  version: 1;
  runId: string;
  nodeId: string;
  attemptId: string;
  attemptNo: number;
  nodeSpecHash: string;
  inputPaths: string[];
  inputManifest: ContentEntry[];
  inputManifestHash: string;
  currentInputManifestHash?: string;
  outputManifest: ContentEntry[];
  outputManifestHash: string;
  toolchainHash: string;
  sourceBound: boolean;
  inputsStableDuringAttempt: boolean;
  dependencies: DependencyIdentity[];
  workflowBinding?: ExecutionWorkflowBinding;
}

export function executionIdentityHash(value: unknown): string {
  const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable)
    : item && typeof item === 'object' ? Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : item;
  return createHash('sha256').update(JSON.stringify(stable(value)) ?? 'null').digest('hex');
}

async function fileHash(target: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(target)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Includes directory membership and content, never mtime as proof. Fails rather than truncate. */
export async function executionContentManifest(workspace: WorkspacePolicy, paths: readonly string[]): Promise<ContentEntry[]> {
  const entries = new Map<string, ContentEntry>();
  const visiting = new Set<string>();
  let bytes = 0;
  const visit = async (target: string): Promise<void> => {
    const safe = await workspace.resolveTarget(target);
    const canonical = await canonicalExecutionPath(safe);
    if (visiting.has(canonical)) throw new Error('EXECUTION_INPUT_CYCLE');
    if (entries.has(canonical)) return;
    if (entries.size >= 20_000) throw new Error('EXECUTION_INPUT_MANIFEST_LIMIT');
    let info;
    try { info = await stat(safe); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      entries.set(canonical, { path: canonical, kind: 'missing' });
      return;
    }
    await workspace.resolveExisting(safe);
    if (info.isDirectory()) {
      entries.set(canonical, { path: canonical, kind: 'directory' });
      visiting.add(canonical);
      try { for (const name of (await readdir(safe)).sort()) await visit(path.join(safe, name)); }
      finally { visiting.delete(canonical); }
    } else if (info.isFile()) {
      bytes += info.size;
      if (bytes > 512 * 1024 * 1024) throw new Error('EXECUTION_INPUT_BYTE_LIMIT');
      entries.set(canonical, { path: canonical, kind: 'file', sha256: await fileHash(safe) });
    } else throw new Error('EXECUTION_INPUT_KIND_UNSUPPORTED');
  };
  for (const target of [...paths].sort()) await visit(target);
  return [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function resolvedExecutable(executable: string): Promise<string | null> {
  const envPath = Object.entries(process.env).find(([name]) => name.toLowerCase() === 'path')?.[1] ?? '';
  const extensions = process.platform === 'win32' && !path.extname(executable) ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  const roots = path.isAbsolute(executable) ? [''] : envPath.split(path.delimiter);
  for (const root of roots) for (const ext of extensions) {
    const candidate = path.isAbsolute(executable) ? executable : path.join(root, executable + ext.toLowerCase());
    try { await access(candidate); if ((await stat(candidate)).isFile()) return candidate; } catch { /* try the next PATH entry */ }
  }
  return null;
}

export async function executionToolchainHash(node: ValidatedExecutionNode, hashes?: Map<string, Promise<string>>): Promise<string> {
  const shell = resolveShellInvocation(node.command);
  const first = node.command.trim().match(/^(?:&\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;|]+))/);
  const names = [shell.executable, first?.[1] ?? first?.[2] ?? first?.[3] ?? ''];
  const entries: Array<{ name: string; path?: string; sha256?: string }> = [];
  const hashFile = (target: string) => {
    if (!hashes) return fileHash(target);
    let hash = hashes.get(target);
    if (!hash) { hash = fileHash(target); hashes.set(target, hash); }
    return hash;
  };
  for (const name of [...new Set(names)].filter(Boolean)) {
    const target = await resolvedExecutable(name);
    entries.push(target ? { name, path: await canonicalExecutionPath(target), sha256: await hashFile(target) } : { name });
  }
  for (const target of node.toolchain ?? []) entries.push({ name: target, path: await canonicalExecutionPath(target), sha256: await hashFile(target) });
  return executionIdentityHash({ platform: process.platform, arch: process.arch, nodeVersion: process.version, entries });
}

export function executionNodeSpecHash(node: ValidatedExecutionNode): string {
  return executionIdentityHash({ command: node.command, cwd: node.cwd, purpose: node.purpose, dependsOn: node.dependsOn,
    timeoutMs: node.timeoutMs, expectedArtifacts: node.expectedArtifacts, stepIds: node.stepIds ?? [],
    resources: node.resources, inputs: node.inputs, toolchain: node.toolchain });
}

/** Configuration absence is also evidence: adding a lockfile/config invalidates prior checks. */
export function executionInputPaths(workspace: WorkspacePolicy, node: ValidatedExecutionNode): string[] {
  const manifests = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'yarn.lock', 'bun.lock', 'bun.lockb', 'tsconfig.json', 'jsconfig.json', '.nvmrc', '.node-version',
    'pyproject.toml', 'requirements.txt', 'uv.lock', 'poetry.lock', 'Pipfile', 'Pipfile.lock',
    'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'global.json', 'Directory.Build.props', 'Directory.Packages.props'];
  const automatic: string[] = [];
  if (node.inputs !== undefined) {
    const root = workspace.resolveProjectRoot({ candidatePaths: [node.cwd] });
    let directory = node.cwd;
    while (directory === root || directory.startsWith(`${root}${path.sep}`)) {
      automatic.push(...manifests.map(name => path.join(directory, name)));
      if (directory === root) break;
      directory = path.dirname(directory);
    }
  }
  return [...new Set([...(node.inputs ?? []), ...(node.toolchain ?? []), ...automatic])].sort();
}

export async function beginExecutionProvenance(workspace: WorkspacePolicy, node: ValidatedExecutionNode,
  identity: { runId: string; attemptId: string; attemptNo: number; dependencies?: DependencyIdentity[]; workflowBinding?: ExecutionWorkflowBinding },
): Promise<ExecutionProvenance> {
  const inputPaths = executionInputPaths(workspace, node);
  const inputManifest = await executionContentManifest(workspace, inputPaths);
  return { version: 1, runId: identity.runId, nodeId: node.id, attemptId: identity.attemptId, attemptNo: identity.attemptNo,
    nodeSpecHash: executionNodeSpecHash(node), inputPaths, inputManifest, inputManifestHash: executionIdentityHash(inputManifest),
    outputManifest: [], outputManifestHash: executionIdentityHash([]), toolchainHash: await executionToolchainHash(node),
    sourceBound: node.inputs !== undefined, inputsStableDuringAttempt: true,
    dependencies: identity.dependencies ?? [], ...(identity.workflowBinding ? { workflowBinding: identity.workflowBinding } : {}) };
}

export async function finishExecutionProvenance(workspace: WorkspacePolicy, node: ValidatedExecutionNode, initial: ExecutionProvenance): Promise<ExecutionProvenance> {
  const inputManifest = await executionContentManifest(workspace, initial.inputPaths);
  const outputManifest = await executionContentManifest(workspace, node.expectedArtifacts.map((item) => item.path));
  const writes = await Promise.all((node.resources?.writes ?? []).map(canonicalExecutionPath));
  const immutable = (manifest: ContentEntry[]) => manifest.filter((entry) => !writes.some((target) => entry.path === target || entry.path.startsWith(`${target}${path.sep}`)));
  return { ...initial, currentInputManifestHash: executionIdentityHash(inputManifest),
    inputsStableDuringAttempt: executionIdentityHash(immutable(inputManifest)) === executionIdentityHash(immutable(initial.inputManifest))
    && await executionToolchainHash(node) === initial.toolchainHash,
    outputManifest, outputManifestHash: executionIdentityHash(outputManifest) };
}

export async function executionApplicability(workspace: WorkspacePolicy, node: ValidatedExecutionNode,
  provenance: ExecutionProvenance | undefined, identity: { runId: string; attemptId: string; attemptNo: number },
  dependencies?: DependencyIdentity[], workflowBinding?: ExecutionWorkflowBinding,
  toolchainHashes?: Map<string, Promise<string>>,
): Promise<ExecutionApplicability> {
  if (!provenance || !provenance.sourceBound) return 'legacy_unbound';
  if (provenance.runId !== identity.runId || provenance.nodeId !== node.id || provenance.attemptId !== identity.attemptId || provenance.attemptNo !== identity.attemptNo) return 'identity_mismatch';
  if (executionIdentityHash(provenance.inputManifest) !== provenance.inputManifestHash
    || executionIdentityHash(provenance.outputManifest) !== provenance.outputManifestHash
    || executionIdentityHash(provenance.inputPaths) !== executionIdentityHash(executionInputPaths(workspace, node))) return 'identity_mismatch';
  if (!provenance.inputsStableDuringAttempt || provenance.nodeSpecHash !== executionNodeSpecHash(node)
    || (dependencies && executionIdentityHash(dependencies) !== executionIdentityHash(provenance.dependencies))
    || executionIdentityHash(workflowBinding) !== executionIdentityHash(provenance.workflowBinding)) return 'inputs_changed';
  try {
    if (executionIdentityHash(await executionContentManifest(workspace, provenance.inputPaths)) !== (provenance.currentInputManifestHash ?? provenance.inputManifestHash)
      || await executionToolchainHash(node, toolchainHashes) !== provenance.toolchainHash) return 'inputs_changed';
  } catch { return 'inputs_changed'; }
  try {
    if (executionIdentityHash(await executionContentManifest(workspace, node.expectedArtifacts.map((item) => item.path))) !== provenance.outputManifestHash) return 'outputs_changed';
  } catch { return 'outputs_changed'; }
  return 'current';
}
