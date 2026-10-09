import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildVersionEdits, calculateReleasePlan, validateStableSemver } from '../scripts/release/release-lib.mjs';
import { enterPrerelease, readPrereleaseState } from '../scripts/release/prerelease-lib.mjs';
import * as artifacts from '../scripts/release/development-artifact.mjs';
import * as builds from '../scripts/release/development-build.mjs';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('canonical prerelease identity', () => {
  it('synchronizes prerelease display identity while keeping .NET numeric identity', async () => {
    const edits = await buildVersionEdits('0.15.0-beta.0');
    const file = (suffix: string) => edits.find((entry: {file: string}) => entry.file.replaceAll('\\', '/').endsWith(suffix))!.content;
    expect(JSON.parse(file('/package.json')).version).toBe('0.15.0-beta.0');
    expect(file('/src/version.ts')).toContain("'0.15.0-beta.0'");
    expect(file('/AgentCore.Launcher.csproj')).toContain('<InformationalVersion>0.15.0-beta.0</InformationalVersion>');
    expect(file('/AgentCore.Launcher.csproj')).toContain('<FileVersion>0.15.0.0</FileVersion>');
    expect(file('/AgentCore.Launcher.csproj')).toContain('<AssemblyVersion>0.15.0.0</AssemblyVersion>');
  });

  it('keeps pending intents on the prerelease target rather than bumping twice', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-pre-plan-')); roots.push(root);
    await mkdir(path.join(root, '.changeset'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({version: '0.15.0-beta.0'}));
    await writeFile(path.join(root, '.changeset', 'feature.md'), '---\n"agent-core": minor\n---\nNew feature.\n');
    await enterPrerelease('beta', {file: path.join(root, '.changeset', 'pre.json'), stableProductVersion: '0.14.0'});
    const before = await readFile(path.join(root, '.changeset', 'feature.md'), 'utf8');
    const plan = await calculateReleasePlan({root});
    expect(plan.currentVersion).toBe('0.15.0-beta.0');
    expect(plan.nextVersion).toBe('0.15.0');
    expect(plan.changesets).toHaveLength(1);
    expect(await readFile(path.join(root, '.changeset', 'feature.md'), 'utf8')).toBe(before);
    await writeFile(path.join(root, '.changeset', 'breaking.md'), '---\n"agent-core": major\n---\nBreaking contract.\n');
    await expect(calculateReleasePlan({root})).rejects.toThrow(/requires.*1\.0\.0/);
  });

  it('preserves the previous stable source identity in prerelease state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-pre-state-')); roots.push(root);
    const file = path.join(root, 'pre.json');
    await enterPrerelease('beta', {file, stableProductVersion: '0.14.0'});
    expect((await readPrereleaseState({file})).stableProductVersion).toBe('0.14.0');
  });

  it('keeps stable packaging validation strict and rejects malformed source versions', async () => {
    expect(() => validateStableSemver('0.15.0-beta.0')).toThrow();
    for (const version of ['0.15.0-beta.01', '01.15.0-beta.0', '0.15.0-', '0.15.0-beta..0']) {
      await expect(buildVersionEdits(version)).rejects.toThrow();
    }
  });

  it('stages the Memory engine, offline renderer, and inspectable source without private state', async () => {
    expect(typeof artifacts.copyDevelopmentSources).toBe('function');
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-pre-input-')); roots.push(root);
    const output = await mkdtemp(path.join(os.tmpdir(), 'agent-core-pre-output-')); roots.push(output);
    const inputs = ['src/index.ts', 'src/private/secrets/key.txt', 'src/.env',
      'SubProject/agent-core-memory/dist/index.js', 'SubProject/agent-core-memory/src/index.ts',
      'SubProject/agent-core-memory/NOTICE.md', 'vendor/archify/renderers/architecture/render-architecture.mjs',
      'vendor/archify/LICENSE', 'runtime/memory/private.md', 'THIRD_PARTY_NOTICES.md'];
    for (const input of inputs) {
      await mkdir(path.dirname(path.join(root, input)), {recursive: true});
      await writeFile(path.join(root, input), input);
    }
    await artifacts.copyDevelopmentSources(root, output);
    for (const file of ['source/src/index.ts', 'SubProject/agent-core-memory/dist/index.js',
      'source/SubProject/agent-core-memory/src/index.ts', 'vendor/archify/LICENSE', 'THIRD_PARTY_NOTICES.md']) {
      expect(await readFile(path.join(output, file), 'utf8')).toBeTruthy();
    }
    for (const file of ['source/src/.env', 'source/src/private/secrets/key.txt', 'runtime/memory/private.md']) {
      await expect(readFile(path.join(output, file))).rejects.toMatchObject({code: 'ENOENT'});
    }
  });

  it('builds Core, UI and a fresh native launcher before packaging', () => {
    const root = path.resolve('fixture');
    const launcherOut = path.join(root, 'runtime', 'tmp', 'launcher');
    const steps = builds.developmentBuildSteps(root, launcherOut, 'dotnet');
    expect(steps).toHaveLength(3);
    expect(steps[0].cwd).toBe(root);
    expect(steps[1].cwd).toBe(path.join(root, 'src', 'ui'));
    expect(steps[1].args.slice(-2)).toEqual(['run', 'build']);
    expect(steps[2].args).toContain(path.join(root, 'src', 'launcher', 'AgentCore.Launcher.csproj'));
    expect(steps[2].args.slice(-2)).toEqual(['-o', launcherOut]);
  });
});
