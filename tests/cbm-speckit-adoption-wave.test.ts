import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GrafelRuntime } from '../src/code-intelligence/grafel-runtime.js';
import { SkillService } from '../src/skills/service.js';
import { skills as skillsSchema } from '../src/mcp/skills-schemas.js';

const roots: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}
describe('CBM-P1 exact-build Grafel provider attestation', () => {
  it('distinguishes current, executable mismatch, resident mismatch, and unverifiable evidence', async () => {
    const root = await tempRoot('agent-core-cbm-attestation-');
    const runtimeDir = path.join(root, 'runtime', 'grafel');
    const binaryPath = path.join(runtimeDir, 'bin', 'grafel.exe');
    await mkdir(path.dirname(binaryPath), { recursive: true });
    const original = Buffer.from('qualified-grafel-binary-v1');
    await writeFile(binaryPath, original);
    const sourceCommit = '45f9745d02f3662a8516fb35cd2d0624acf82cbf';
    await writeFile(path.join(runtimeDir, 'provider.json'), JSON.stringify({
      provider: 'grafel',
      version: 'v0.3.3-agentcore-test',
      sourceCommit,
      executableSha256: sha256(original),
    }));

    const runtime = new GrafelRuntime({
      enabled: true,
      projectRoot: root,
      runtimeDir,
      binaryPath,
      group: 'agent-core',
      repoSlug: 'agent-core',
      startupTimeoutMs: 1000,
      callTimeoutMs: 1000,
    });
    const current = await runtime.providerAttestation({
      status: 'ok',
      engine_pid: 321,
      version: 'v0.3.3-agentcore-test (commit 45f9745d0, built 2026-09-27)',
    });
    expect(current).toMatchObject({
      state: 'current',
      enginePid: 321,
      expectedExecutableSha256: sha256(original),
      observedExecutableSha256: sha256(original),
      expectedSourceCommit: sourceCommit,
      observedSourceCommit: '45f9745d0',
    });

    await writeFile(binaryPath, 'tampered-provider-binary-longer-than-qualified');
    const metadataMismatch = await runtime.providerAttestation({
      status: 'ok',
      engine_pid: 321,
      version: 'v0.3.3-agentcore-test (commit 45f9745d0)',
    });
    expect(metadataMismatch.state).toBe('metadata-mismatch');
    await expect(runtime.assertMutationAttested({
      status: 'ok',
      engine_pid: 321,
      version: 'v0.3.3-agentcore-test (commit 45f9745d0)',
    })).rejects.toThrow(/ATTESTATION_MISMATCH/);
    await writeFile(binaryPath, original);
    const residentMismatch = await runtime.providerAttestation({
      status: 'ok',
      engine_pid: 654,
      version: 'v9.9.9-other-build (commit deadbee)',
    });
    expect(residentMismatch).toMatchObject({
      state: 'resident-mismatch',
      enginePid: 654,
      issue: 'GRAFEL_PROVIDER_RESIDENT_VERSION_MISMATCH',
    });

    const unverifiable = await runtime.assertMutationAttested({
      status: 'ok',
      version: 'v0.3.3-agentcore-test (commit 45f9745d0)',
    });
    expect(unverifiable.state).toBe('unverifiable');
    expect(unverifiable.issue).toBe('GRAFEL_PROVIDER_RESIDENT_ATTESTATION_UNAVAILABLE');
  });
});

describe('SPK-P3 deterministic external-agent Skill export', () => {
  it('renders Claude and Codex previews without mutating external host config or active Skill state', async () => {
    const project = await tempRoot('agent-core-speckit-export-');
    const source = path.join(project, 'source');
    await mkdir(source, { recursive: true });
    await writeFile(path.join(source, 'SKILL.md'), [
      '---',
      'name: export-skill',
      'description: Deterministic export skill',
      'license: MIT',
      'allowed-tools:',
      '  - read_file',
      '---',
      '',
      '# Export Skill',
      '',
      'Use the bounded source evidence.',
      '',
    ].join('\n'));
    await writeFile(path.join(source, 'guide.txt'), 'guide-content\n');

    const service = await SkillService.initialize(project, async value => path.resolve(value));
    const imported = await service.import(source);
    const before = await service.listRevisions('export-skill');

    const claude = await service.renderExport('export-skill', 'claude');
    const firstManifest = await readFile(claude.manifestPath);
    const firstManifestJson = JSON.parse(firstManifest.toString('utf8'));
    expect(claude.targetRelativeRoot).toBe('.claude/skills/export-skill');
    expect(claude.exportPath).toContain(path.join('runtime', 'skills', 'exports', 'claude', 'export-skill'));
    expect(firstManifestJson).toMatchObject({
      version: 1,
      profile: 'claude',
      targetRelativeRoot: '.claude/skills/export-skill',
      source: { name: 'export-skill', digest: imported.digest },
    });
    const exportedSkill = path.join(
      claude.exportPath,
      '.claude', 'skills', 'export-skill', 'SKILL.md',
    );
    expect(await readFile(exportedSkill, 'utf8')).toContain('# Export Skill');
    await expect(stat(path.join(project, '.claude'))).rejects.toThrow();

    const claudeAgain = await service.renderExport('export-skill', 'claude');
    const secondManifest = await readFile(claudeAgain.manifestPath);
    expect(secondManifest.equals(firstManifest)).toBe(true);
    expect(claudeAgain.manifestDigest).toBe(claude.manifestDigest);

    const codex = await service.renderExport('export-skill', 'codex');
    expect(codex.targetRelativeRoot).toBe('.agents/skills/export-skill');
    expect(codex.manifestDigest).not.toBe('');
    await expect(stat(path.join(project, '.agents'))).rejects.toThrow();

    const active = await service.inspect('export-skill');
    const after = await service.listRevisions('export-skill');
    expect(active.digest).toBe(imported.digest);
    expect(after.active.digest).toBe(before.active.digest);
    expect(after.staged).toEqual(before.staged);
    expect(after.history).toEqual(before.history);
  });

  it('requires an explicit reviewed export profile in the existing Skills schema', () => {
    expect(skillsSchema.parse({
      action: 'render_export',
      name: 'export-skill',
      profile: 'claude',
    })).toMatchObject({ action: 'render_export', profile: 'claude' });

    expect(() => skillsSchema.parse({
      action: 'render_export',
      name: 'export-skill',
    })).toThrow();

    expect(() => skillsSchema.parse({
      action: 'inspect',
      name: 'export-skill',
      profile: 'codex',
    })).toThrow();
  });
});
