import { mkdtemp, mkdir, readFile, rm, writeFile, access, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ root: '', parent: '' }));
vi.mock('../src/portability/paths.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/portability/paths.js')>(),
  resolveModuleProjectRoot: () => fixture.root,
  resolveProjectRoot: () => fixture.root,
}));
vi.mock('../src/rdc/config-manager.js', () => ({
  configManager: { getConfig: async () => ({ allowedDirectories: [fixture.parent], fileReadLineLimit: 1000 }) },
}));

let filesystem: typeof import('../src/rdc/tools/filesystem.js');
let synchronize: typeof import('../src/portability/project-structure.js')['synchronizeProjectStructure'];
const mapPath = () => path.join(fixture.root, 'docs/PROJECT-STRUCTURE.md');
async function snapshot() {
  return (await readFile(mapPath(), 'utf8')).split('<!-- DIRECTORY-SNAPSHOT:START -->')[1]!.split('<!-- DIRECTORY-SNAPSHOT:END -->')[0]!;
}
beforeAll(async () => {
  fixture.parent = await mkdtemp(path.join(os.tmpdir(), 'agent-core-project-structure-filesystem-'));
  fixture.root = path.join(fixture.parent, 'project');
  filesystem = await import('../src/rdc/tools/filesystem.js');
  synchronize = (await import('../src/portability/project-structure.js')).synchronizeProjectStructure;
});
afterAll(async () => {
  if (!fixture.parent) return;
  if (!path.resolve(fixture.parent).startsWith(path.resolve(os.tmpdir()) + path.sep)
    || !path.basename(fixture.parent).startsWith('agent-core-project-structure-filesystem-')) throw new Error('Unsafe fixture cleanup');
  await rm(fixture.parent, { recursive: true, force: true });
});
beforeEach(async () => {
  await rm(fixture.root, { recursive: true, force: true });
  for (const relative of ['docs', 'src', 'runtime/skills/capability-packs', 'runtime/build', 'runtime/checkpoints', 'runtime/tracker'])
    await mkdir(path.join(fixture.root, relative), { recursive: true });
  const policy = {
    version: 1,
    owners: [
      { purpose: 'implementation', path: 'src' },
      { purpose: 'skill-storage', path: 'runtime/skills', aliases: ['bundled-skills', 'skills', 'capability-packs', 'runtime/capability-packs', 'runtime/skill-catalog', 'runtime/skills-v2'] },
      { purpose: 'skill-source', path: 'runtime/skills/capability-packs' },
      { purpose: 'build-output', path: 'runtime/build' },
    ],
    directoryIntents: [{ path: 'src/approved-feature', purpose: 'feature:approved-feature', owner: 'src' }],
  };
  await writeFile(path.join(fixture.root, 'docs/PROJECT-STRUCTURE.md'), [
    '# Fixture project structure', '<!-- DIRECTORY-POLICY:START -->', '```json', JSON.stringify(policy),
    '```', '<!-- DIRECTORY-POLICY:END -->', '<!-- DIRECTORY-SNAPSHOT:START -->',
    '```text', '<PROJECT_ROOT>/', '|-- docs/', '|-- runtime/', '|   |-- build/', '|   |-- checkpoints/',
    '|   |-- skills/', '|   |   `-- capability-packs/', '|   `-- tracker/', '`-- src/', '```',
    '<!-- DIRECTORY-SNAPSHOT:END -->', '',
  ].join('\n'));
  await synchronize(fixture.root);
});

it('denies a duplicate Skill home through the existing createDirectory entrypoint before mkdir', async () => {
  const target = path.join(fixture.root, 'skills');
  await expect(filesystem.createDirectory('skills')).rejects.toThrow(/PROJECT_STRUCTURE/);
  await expect(access(target)).rejects.toThrow();
});

it('denies relocating the canonical Skill source through the existing moveFile entrypoint', async () => {
  const source = path.join(fixture.root, 'runtime/skills/capability-packs');
  const target = path.join(fixture.root, 'source-copy');
  const beforeMove = vi.fn(async () => undefined);
  await expect(filesystem.moveFile(source, target, beforeMove)).rejects.toThrow(/PROJECT_STRUCTURE/);
  expect(beforeMove).not.toHaveBeenCalled();
  await expect(access(source)).resolves.toBeUndefined();
  await expect(access(target)).rejects.toThrow();
});

it('denies undeclared authored directories before creating any parent', async () => {
  const target = path.join(fixture.root, 'src/unknown-feature/child');
  await expect(filesystem.createDirectory(target)).rejects.toThrow(/PROJECT_STRUCTURE/);
  await expect(access(path.join(fixture.root, 'src/unknown-feature'))).rejects.toThrow();
});

it('creates an admitted intent subtree and synchronizes the actual map snapshot', async () => {
  expect(await snapshot()).not.toContain('approved-feature');
  const target = path.join(fixture.root, 'src/approved-feature/child');
  await filesystem.createDirectory(target);
  await expect(access(target)).resolves.toBeUndefined();
  const after = await snapshot();
  expect(after).toContain('approved-feature/');
  expect(after).toContain('child/');
});

it('repairs a stale map even when ensuring an existing directory returns early', async () => {
  const text = await readFile(mapPath(), 'utf8');
  // Keep the admitted baseline; stale rendering must not erase ownership evidence.
  await writeFile(mapPath(), text.replace('<!-- DIRECTORY-SNAPSHOT:START -->',
    '<!-- DIRECTORY-SNAPSHOT:START -->\nstale-fixture-snapshot'));
  await filesystem.createDirectory(path.join(fixture.root, 'src'));
  expect(await snapshot()).not.toContain('stale-fixture-snapshot');
  expect(await snapshot()).toContain('src/');
});

it('allows nested output in the existing opaque build owner without traversing it', async () => {
  const target = path.join(fixture.root, 'runtime/build/fixture-run/output');
  await filesystem.createDirectory(target);
  await expect(access(target)).resolves.toBeUndefined();
  expect(await snapshot()).toContain('build/');
  expect(await snapshot()).not.toContain('fixture-run');
});

it('updates directory move locations and preserves the directory checkpoint reason', async () => {
  const source = path.join(fixture.root, 'src/approved-feature/alpha');
  const destination = path.join(fixture.root, 'src/approved-feature/beta');
  await filesystem.createDirectory(source);
  const beforeMove = vi.fn(async () => undefined);
  await filesystem.moveFile(source, destination, beforeMove);
  expect(beforeMove).toHaveBeenCalledWith(source, destination, 'unsupported-operation');
  await expect(access(source)).rejects.toThrow();
  await expect(access(destination)).resolves.toBeUndefined();
  expect(await snapshot()).not.toContain('alpha/');
  expect(await snapshot()).toContain('beta/');
});

it('keeps regular file checkpoint admission immediately before the rename', async () => {
  const source = path.join(fixture.root, 'src/input.txt'), destination = path.join(fixture.root, 'src/output.txt');
  await writeFile(source, 'literal-file');
  const beforeMove = vi.fn(async (from: string, to: string, reason?: string) => {
    expect(reason).toBeUndefined();
    expect(await readFile(from, 'utf8')).toBe('literal-file');
    await expect(access(to)).rejects.toThrow();
  });
  await filesystem.moveFile(source, destination, beforeMove);
  expect(beforeMove).toHaveBeenCalledWith(source, destination, undefined);
  expect(await readFile(destination, 'utf8')).toBe('literal-file');
});

it('retains no-change file moves and calls the checkpoint hook with its existing reason', async () => {
  const source = path.join(fixture.root, 'src/input.txt');
  await writeFile(source, 'unchanged');
  const beforeMove = vi.fn(async () => undefined);
  await filesystem.moveFile(source, source, beforeMove);
  expect(beforeMove).toHaveBeenCalledWith(source, source, 'no-change');
  expect(await readFile(source, 'utf8')).toBe('unchanged');
});

it('never renames after a checkpoint callback rejects', async () => {
  const source = path.join(fixture.root, 'src/input.txt'), destination = path.join(fixture.root, 'src/output.txt');
  await writeFile(source, 'retained');
  await expect(filesystem.moveFile(source, destination, async () => { throw new Error('fixture checkpoint rejected'); }))
    .rejects.toThrow('fixture checkpoint rejected');
  expect(await readFile(source, 'utf8')).toBe('retained');
  await expect(access(destination)).rejects.toThrow();
});

it('preserves outside-root create and move behavior without modifying the project map', async () => {
  const external = path.join(fixture.parent, 'external');
  const destination = path.join(fixture.parent, 'external-moved');
  await rm(external, { recursive: true, force: true });
  await rm(destination, { recursive: true, force: true });
  const before = await readFile(mapPath(), 'utf8');
  await filesystem.createDirectory(path.join(external, 'skills'));
  await filesystem.moveFile(external, destination);
  await expect(access(path.join(destination, 'skills'))).resolves.toBeUndefined();
  expect(await readFile(mapPath(), 'utf8')).toBe(before);
});

it('does not gate ordinary reads or create missing parents during writeFile', async () => {
  const source = path.join(fixture.root, 'src/readable.txt');
  await writeFile(source, 'ordinary read');
  await rm(mapPath());
  expect(await filesystem.readFileInternal(source, 0, Number.MAX_SAFE_INTEGER)).toBe('ordinary read');
  const missing = path.join(fixture.root, 'src/undeclared-parent/file.txt');
  await expect(filesystem.writeFile(missing, 'body')).rejects.toThrow();
  await expect(access(path.dirname(missing))).rejects.toThrow();
});

it('surfaces a completed mutation when map synchronization fails after the checkpoint callback', async () => {
  const source = path.join(fixture.root, 'src/approved-feature/alpha');
  const destination = path.join(fixture.root, 'src/approved-feature/beta');
  await filesystem.createDirectory(source);
  await expect(filesystem.moveFile(source, destination, async () => { await writeFile(mapPath(), '# fixture invalid map'); }))
    .rejects.toThrow('PROJECT_STRUCTURE_UPDATE_FAILED_AFTER_MUTATION');
  await expect(access(source)).rejects.toThrow();
  await expect(access(destination)).resolves.toBeUndefined();
});

it('rejects a duplicate ancestor before recursive mkdir even when its child intent is declared', async () => {
  await filesystem.createDirectory(path.join(fixture.root, 'src/approved-feature'));
  const text = await readFile(mapPath(), 'utf8');
  const block = /```json\n([\s\S]*?)\n```/.exec(text)!;
  const policy = JSON.parse(block[1]!);
  policy.directoryIntents.push({ path: 'src/approved-feature-copy/child', purpose: 'feature:distinct-child', owner: 'src' });
  await writeFile(mapPath(), text.replace(block[1]!, JSON.stringify(policy)));
  await expect(filesystem.createDirectory(path.join(fixture.root, 'src/approved-feature-copy/child'))).rejects.toThrow(/PROJECT_STRUCTURE/);
  await expect(access(path.join(fixture.root, 'src/approved-feature-copy'))).rejects.toThrow();
});

it('rejects duplicate siblings in an incoming directory before moving any bytes into the project', async () => {
  const source = path.join(fixture.parent, 'incoming-duplicates');
  await mkdir(path.join(source, 'alpha'), { recursive: true });
  await mkdir(path.join(source, 'alpha-copy'), { recursive: true });
  await writeFile(path.join(source, 'alpha/source.txt'), 'must stay outside');
  const destination = path.join(fixture.root, 'src/approved-feature');
  await expect(filesystem.moveFile(source, destination)).rejects.toThrow(/PROJECT_STRUCTURE/);
  expect(await readFile(path.join(source, 'alpha/source.txt'), 'utf8')).toBe('must stay outside');
  await expect(access(destination)).rejects.toThrow();
});

it('does not let a requested project junction turn mkdir into an unguarded outside mutation', async () => {
  const outside = path.join(fixture.parent, 'external-create-target');
  await mkdir(outside, { recursive: true });
  const link = path.join(fixture.root, 'src/external-link');
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(filesystem.createDirectory(path.join(link, 'new-child'))).rejects.toThrow(/PROJECT_STRUCTURE/);
  await expect(access(path.join(outside, 'new-child'))).rejects.toThrow();
});

it('does not let a requested project junction relocate its resolved external directory', async () => {
  const outside = path.join(fixture.parent, 'external-move-target');
  const destination = path.join(fixture.parent, 'external-link-moved');
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, 'source.txt'), 'retain external target');
  const link = path.join(fixture.root, 'src/external-link');
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(filesystem.moveFile(link, destination)).rejects.toThrow(/PROJECT_STRUCTURE/);
  expect(await readFile(path.join(outside, 'source.txt'), 'utf8')).toBe('retain external target');
  await expect(access(destination)).rejects.toThrow();
});

it('keeps explicit outside-project junction file moves unchanged', async () => {
  const outside = path.join(fixture.parent, 'external-explicit-target');
  const link = path.join(fixture.parent, 'external-explicit-link');
  await mkdir(outside, { recursive: true });
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(path.join(outside, 'input.txt'), 'outside workspace');
  const before = await readFile(mapPath(), 'utf8');
  await filesystem.moveFile(path.join(link, 'input.txt'), path.join(outside, 'output.txt'));
  expect(await readFile(path.join(outside, 'output.txt'), 'utf8')).toBe('outside workspace');
  expect(await readFile(mapPath(), 'utf8')).toBe(before);
});

it('keeps checkpoint preview path admission from recreating a missing historical directory', async () => {
  const { FileCheckpointService } = await import('../src/rdc/checkpoints/service.js');
  const service = new FileCheckpointService(fixture.root, path.join(fixture.root, 'runtime/checkpoints'));
  const directory = path.join(fixture.root, 'skills'), file = path.join(directory, 'historical.txt');
  await mkdir(directory);
  await writeFile(file, 'historical captured bytes');
  const checkpoint = await service.create([file], 'historical directory');
  await rm(directory, { recursive: true, force: true });
  await expect(service.previewRestore(checkpoint.id)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(access(directory)).rejects.toThrow();
});

it('checks declarations of incoming child directories before replacing an absent baselined location', async () => {
  const destination = path.join(fixture.root, 'src/approved-feature');
  await filesystem.createDirectory(destination);
  const text = await readFile(mapPath(), 'utf8');
  const block = /```json\n([\s\S]*?)\n```/.exec(text)!;
  const policy = JSON.parse(block[1]!);
  policy.directoryIntents = [];
  await writeFile(mapPath(), text.replace(block[1]!, JSON.stringify(policy)));
  await rm(destination, { recursive: true, force: true });
  const source = path.join(fixture.parent, 'incoming-undeclared');
  await mkdir(path.join(source, 'unknown-child'), { recursive: true });
  await writeFile(path.join(source, 'unknown-child/source.txt'), 'retain incoming bytes');
  await expect(filesystem.moveFile(source, destination)).rejects.toThrow(/PROJECT_STRUCTURE/);
  expect(await readFile(path.join(source, 'unknown-child/source.txt'), 'utf8')).toBe('retain incoming bytes');
  await expect(access(destination)).rejects.toThrow();
});

it('enforces the same directory policy through the Native Agent MCP session', async () => {
  // The MCP host starts these registered runtime owners before dispatching tools.
  const map = await readFile(mapPath(), 'utf8'), block = /```json\n([\s\S]*?)\n```/.exec(map)!;
  const policy = JSON.parse(block[1]!);
  policy.owners.push({ purpose: 'runtime-role:rdc', path: 'runtime/rdc' },
    { purpose: 'runtime-role:terminal-output', path: 'runtime/terminal-output' });
  await writeFile(mapPath(), map.replace(block[1]!, JSON.stringify(policy)));
  const { AgentRuntimeToolSession } = await import('../src/agent-tool-session.js');
  const session = await AgentRuntimeToolSession.open('structure-native-fixture', ['create_directory', 'move_file'],
    { nativeTaskId: 'structure-native-fixture', nativeWorkspace: 'agent-core' });
  try {
    const forbidden = path.join(fixture.root, 'skills');
    const denied = await session.call('create_directory', { path: forbidden });
    expect(denied.isError).toBe(true);
    expect(denied.text).toContain('PROJECT_STRUCTURE');
    await expect(access(forbidden)).rejects.toThrow();
    const accepted = await session.call('create_directory', { path: path.join(fixture.root, 'src/approved-feature/native-child') });
    expect(accepted.isError, accepted.text).toBe(false);
    expect(await snapshot()).toContain('native-child/');
    const outside = path.join(fixture.parent, 'native-move-outside'), source = path.join(outside, 'source-dir');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'retained.txt'), 'must remain at source');
    const link = path.join(fixture.root, 'src/approved-feature/native-export-link');
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const moved = await session.call('move_file', { source: path.join(link, 'source-dir'),
      destination: path.join(fixture.parent, 'native-move-destination') });
    expect(moved.isError, moved.text).toBe(true);
    expect(moved.text).toContain('PROJECT_STRUCTURE');
    expect(await readFile(path.join(source, 'retained.txt'), 'utf8')).toBe('must remain at source');
  } finally { await session.close(); }
});
