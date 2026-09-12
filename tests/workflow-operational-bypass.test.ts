import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkflowService, type WorkflowScope } from '../src/workflow/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { workflowOperationInput } from '../src/mcp/workflow-guard.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ac-operational-bypass-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'referensi'), { recursive: true });
  await writeFile(path.join(root, 'src', 'target.ts'), 'export const value = 1;\n');
  const options = {
    workspace: new WorkspacePolicy([root]),
    projectRoot: root,
    stateRoot: path.join(root, 'runtime', 'state'),
    cacheRoot: path.join(root, 'runtime', 'cache'),
  };
  const service = new WorkflowService(options);
  const scope = (taskId: string): WorkflowScope => ({ principalId: 'fixture', projectId: 'agent-core://self', taskId });
  return { root, service, scope };
}

describe('non-engineering operational workflow bypass', () => {
  it('keeps clone, download, and reference-folder setup outside workflow plans and assessments', async () => {
    const f = await fixture();
    const briefs = [
      'Clone GitHub repository Tencent/YOLO-Master into referensi',
      'Download a file from GitHub into referensi',
      'Buat folder referensi/tools lalu clone repository GitHub ke sana',
      'Ambil repository dari GitHub dan simpan di folder referensi',
    ];
    for (const [index, brief] of briefs.entries()) {
      const record = await f.service.bind(f.scope(`brief-${index}`), { brief, workflow: 'direct' });
      expect(record).toMatchObject({ planRequired: false, craftRequired: false, dagRequired: false });
      expect(record.engineering).toBeUndefined();
    }
    const engineering = await f.service.bind(f.scope('engineering'), {
      brief: 'Build a TypeScript tool that clones GitHub repositories', workflow: 'direct',
    });
    expect(engineering.planRequired).toBe(true);
    expect(engineering.engineering?.required).toBe(true);
  });

  it('allows native GitHub clone into referensi without activating engineering assessment', async () => {
    const f = await fixture(), scope = f.scope('github-clone');
    await f.service.bind(scope, { brief: 'Clone a GitHub repository into referensi', workflow: 'direct' });
    const destination = path.join(f.root, 'referensi', 'sample-repo');
    const input = workflowOperationInput('github_git', { operation: 'clone', destination });
    await expect(f.service.authorize(scope, input)).resolves.toMatchObject({ planRequired: false });
    expect((await f.service.status(scope))!.engineering).toBeUndefined();
  });

  it('allows direct reference-folder and download commands but keeps unknown commands conservative', async () => {
    const f = await fixture(), scope = f.scope('operational-command');
    await f.service.bind(scope, { brief: 'Collect external references for later analysis', workflow: 'direct' });
    const directory = path.join(f.root, 'referensi', 'downloads');
    await expect(f.service.authorize(scope, workflowOperationInput('create_directory', { path: directory })))
      .resolves.toMatchObject({ planRequired: false });
    for (const command of [
      `git clone https://github.com/example/project.git "${path.join(f.root, 'referensi', 'project')}"`,
      `curl.exe -L https://raw.githubusercontent.com/example/project/main/README.md -o "${path.join(f.root, 'referensi', 'README.md')}"`,
      `node -e "console.log('diagnostic-only')"`,
    ]) {
      await expect(f.service.authorize(scope, workflowOperationInput('execute_command', { command })))
        .resolves.toMatchObject({ planRequired: false });
    }
    expect((await f.service.status(scope))!.engineering).toBeUndefined();

    const risky = f.scope('unknown-command');
    await f.service.bind(risky, { brief: 'Inspect repository state', workflow: 'direct' });
    await expect(f.service.authorize(risky, workflowOperationInput('execute_command', {
      command: 'node scripts/rewrite-source.mjs',
    }))).rejects.toMatchObject({ code: 'WORKFLOW_PLAN_REQUIRED' });
    expect((await f.service.status(risky))!.engineering?.required).toBe(true);
  });

  it('allows ordinary move operations without promoting them to coding work', async () => {
    const f = await fixture(), scope = f.scope('move-reference');
    await f.service.bind(scope, { brief: 'Move the downloaded source file into the reference archive', workflow: 'direct' });
    const source = path.join(f.root, 'src', 'target.ts');
    const destination = path.join(f.root, 'referensi', 'target.ts');
    await expect(f.service.authorize(scope, workflowOperationInput('move_file', { source, destination })))
      .resolves.toMatchObject({ planRequired: false });
    expect((await f.service.status(scope))!.engineering).toBeUndefined();
  });

  it('still requires engineering assessment for direct source-code mutation', async () => {
    const f = await fixture(), scope = f.scope('source-write');
    await f.service.bind(scope, { brief: 'Store a downloaded reference', workflow: 'direct' });
    await expect(f.service.authorize(scope, workflowOperationInput('write_file', {
      path: path.join(f.root, 'src', 'target.ts'), content: 'export const value = 2;\n',
    }))).rejects.toMatchObject({ code: 'WORKFLOW_PLAN_REQUIRED' });
    expect((await f.service.status(scope))!.engineering?.required).toBe(true);
  });
});
