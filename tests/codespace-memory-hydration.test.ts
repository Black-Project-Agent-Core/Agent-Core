import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { loadConfig } from '../src/config.js';

const root = process.cwd();
const roots: string[] = [];
const hydrationScript = path.join(root, 'scripts', 'codespace', 'memory-hydration-gate.sh');

async function tempRoot(label: string): Promise<string> {
  const value = await mkdtemp(path.join(os.tmpdir(), `agent-core-codespace-memory-gate-${label}-`));
  roots.push(value);
  return value;
}

async function fakeRepo(label: string) {
  const repo = await tempRoot(`${label}-repo`);
  const home = await tempRoot(`${label}-home`);
  await mkdir(path.join(repo, 'dist'), { recursive: true });
  await writeFile(path.join(repo, 'dist', 'cli.js'), `
    const fs = require('node:fs');
    const path = require('node:path');
    const state = process.env.FAKE_MEMORY_HYDRATION_STATE || 'REMOTE_HYDRATED';
    const capture = process.env.FAKE_MEMORY_HYDRATION_CAPTURE;
    if (capture) {
      fs.writeFileSync(capture, JSON.stringify({
        argv: process.argv.slice(2),
        dbPath: process.env.AGENT_CORE_MEMORY_DB_PATH,
        keyFile: process.env.AGENT_CORE_MEMORY_REMOTE_KEY_FILE,
        workRoot: process.env.AGENT_CORE_MEMORY_REMOTE_WORK_ROOT,
        hasKeyHex: Boolean(process.env.AGENT_CORE_MEMORY_REMOTE_KEY_HEX),
      }));
    }
    if (state === 'FAIL_AUTH') {
      console.error('MEMORY_REMOTE_AUTH_FAILED');
      process.exit(1);
    }
    if (state === 'FAIL_INTEGRITY') {
      console.error('MEMORY_REMOTE_INTEGRITY_FAILED');
      process.exit(1);
    }
    if (state === 'REMOTE_HYDRATED') {
      fs.mkdirSync(path.dirname(process.env.AGENT_CORE_MEMORY_DB_PATH), { recursive: true });
      fs.writeFileSync(process.env.AGENT_CORE_MEMORY_DB_PATH, 'FAKE_SQLITE_BYTES');
      console.log(JSON.stringify({ state, generationId: 'a'.repeat(64), logicalStateHash: 'b'.repeat(64), remoteHead: 'c'.repeat(40) }));
    } else {
      console.log(JSON.stringify({ state: 'REMOTE_EMPTY_CONFIRMED', remoteHead: 'c'.repeat(40) }));
    }
  `, 'utf8');
  return { repo, home };
}

function baseEnv(repo: string, home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AGENT_CORE_REPO_ROOT: repo,
    AGENT_CORE_CODESPACE_HOME: home,
    AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
    AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
    AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote',
    AGENT_CORE_MEMORY_REMOTE_BRANCH: 'main',
    AGENT_CORE_MEMORY_REMOTE_PRINCIPAL_ID: 'principal-stable',
    AGENT_CORE_MEMORY_REMOTE_PROJECT_ID: '/workspaces/Agent-Core',
    AGENT_CORE_MEMORY_REMOTE_KEY_HEX: 'ab'.repeat(32),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe('Codespace Memory Remote hydration gate', () => {
  it('does nothing when the Memory Remote is disabled', async () => {
    const { repo, home } = await fakeRepo('disabled');
    const capture = path.join(home, 'capture.json');
    execFileSync('bash', [hydrationScript], {
      cwd: root,
      env: { ...baseEnv(repo, home), AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false', FAKE_MEMORY_HYDRATION_CAPTURE: capture },
    });
    await expect(readFile(capture, 'utf8')).rejects.toThrow();
  });

  it('restores the dedicated hex key to a local file, invokes CLI hydration without forwarding the secret, and writes a verified marker', async () => {
    const { repo, home } = await fakeRepo('hydrate');
    const capture = path.join(home, 'capture.json');
    execFileSync('bash', [hydrationScript], {
      cwd: root,
      env: { ...baseEnv(repo, home), FAKE_MEMORY_HYDRATION_STATE: 'REMOTE_HYDRATED', FAKE_MEMORY_HYDRATION_CAPTURE: capture },
    });

    const captured = JSON.parse(await readFile(capture, 'utf8')) as Record<string, any>;
    expect(captured.argv).toEqual(['memory-hydrate', 'principal-stable', '/workspaces/Agent-Core']);
    expect(captured.dbPath).toBe(path.join(home, 'memory', 'agent-core-memory.sqlite'));
    expect(captured.keyFile).toBe(path.join(home, 'secrets', 'memory-remote.key'));
    expect(captured.workRoot).toBe(path.join(repo, 'runtime', 'memory', 'remote'));
    expect(captured.hasKeyHex).toBe(false);
    expect((await readFile(captured.keyFile, 'utf8')).trim()).toBe('ab'.repeat(32));

    const marker = JSON.parse(await readFile(path.join(home, 'memory', 'remote-hydration.json'), 'utf8')) as Record<string, unknown>;
    expect(marker).toMatchObject({
      state: 'REMOTE_HYDRATED',
      principalId: 'principal-stable',
      projectId: '/workspaces/Agent-Core',
      owner: 'Black-Project-Agent-Core',
      repo: 'Agent-Core-Memory-Remote',
      branch: 'main',
      verified: true,
    });
    expect(JSON.stringify(marker)).not.toContain('ab'.repeat(32));
  });

  it('accepts REMOTE_EMPTY_CONFIRMED only on a fresh local memory destination', async () => {
    const { repo, home } = await fakeRepo('empty');
    execFileSync('bash', [hydrationScript], {
      cwd: root,
      env: { ...baseEnv(repo, home), FAKE_MEMORY_HYDRATION_STATE: 'REMOTE_EMPTY_CONFIRMED' },
    });
    const marker = JSON.parse(await readFile(path.join(home, 'memory', 'remote-hydration.json'), 'utf8')) as Record<string, unknown>;
    expect(marker).toMatchObject({ state: 'REMOTE_EMPTY_CONFIRMED', verified: true });
    await expect(readFile(path.join(home, 'memory', 'agent-core-memory.sqlite'))).rejects.toThrow();
  });

  it('fails closed before hydration when an uncertified local DB already exists', async () => {
    const { repo, home } = await fakeRepo('uncertified');
    await mkdir(path.join(home, 'memory'), { recursive: true });
    await writeFile(path.join(home, 'memory', 'agent-core-memory.sqlite'), 'EXISTING_LOCAL_DB');
    const result = spawnSync('bash', [hydrationScript], { cwd: root, env: baseEnv(repo, home), encoding: 'utf8' });
    expect(result.status).toBe(55);
    expect(result.stderr).toContain('uncertified local memory database');
    expect(await readFile(path.join(home, 'memory', 'agent-core-memory.sqlite'), 'utf8')).toBe('EXISTING_LOCAL_DB');
  });

  it('fails closed on auth/integrity CLI failures and never writes a success marker', async () => {
    for (const state of ['FAIL_AUTH', 'FAIL_INTEGRITY']) {
      const { repo, home } = await fakeRepo(state.toLowerCase());
      const result = spawnSync('bash', [hydrationScript], {
        cwd: root,
        env: { ...baseEnv(repo, home), FAKE_MEMORY_HYDRATION_STATE: state },
        encoding: 'utf8',
      });
      expect(result.status).toBe(55);
      expect(result.stderr).toMatch(/Memory Remote hydration failed/i);
      await expect(readFile(path.join(home, 'memory', 'remote-hydration.json'), 'utf8')).rejects.toThrow();
    }
  });

  it('keeps hydration before runtime startup in both bootstrap and repair paths', async () => {
    const [bootstrap, ensure, launcher, common] = await Promise.all([
      readFile(path.join(root, 'scripts/codespace/bootstrap.sh'), 'utf8'),
      readFile(path.join(root, 'scripts/codespace/ensure-running.sh'), 'utf8'),
      readFile(path.join(root, 'scripts/codespace/start-agent-core.sh'), 'utf8'),
      readFile(path.join(root, 'scripts/codespace/common.sh'), 'utf8'),
    ]);
    const bootstrapHydration = bootstrap.indexOf('memory-hydration-gate.sh');
    const bootstrapEnsure = bootstrap.indexOf('ensure-running.sh');
    expect(bootstrapHydration).toBeGreaterThan(bootstrap.indexOf('gh-token.txt'));
    expect(bootstrapHydration).toBeLessThan(bootstrapEnsure);

    const ensureHydration = ensure.indexOf('memory-hydration-gate.sh');
    expect(ensureHydration).toBeGreaterThan(ensure.indexOf('build_required'));
    expect(ensureHydration).toBeLessThan(ensure.indexOf('start_service_supervisor'));
    expect(launcher).toContain('AGENT_CORE_MEMORY_REMOTE_KEY_FILE');
    expect(launcher).toContain('AGENT_CORE_MEMORY_REMOTE_WORK_ROOT');
    expect(common).toContain('AGENT_CORE_MEMORY_REMOTE_HYDRATION_MARKER');
  });

  it('provides a bounded memory-hydrate CLI surface without requiring live GitHub in unit tests', async () => {
    const baseDir = await tempRoot('cli');
    const config = loadConfig({
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
      AGENT_CORE_MEMORY_REMOTE_OWNER: 'octo',
      AGENT_CORE_MEMORY_REMOTE_REPO: 'memory-remote',
      AGENT_CORE_MEMORY_REMOTE_KEY_FILE: path.join(baseDir, 'memory.key'),
      AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(baseDir, 'runtime', 'memory', 'remote'),
      AGENT_CORE_MEMORY_DB_PATH: path.join(baseDir, 'memory.sqlite'),
      AGENT_CORE_ALLOWED_ROOTS: baseDir,
    }, baseDir);
    const output: string[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const exit = await runCli(['memory-hydrate', 'principal-cli', 'project-cli'], {
      config,
      stdout: (line) => output.push(line),
      memoryHydrate: async (scope, destinationDbPath) => {
        calls.push({ scope, destinationDbPath });
        return { state: 'REMOTE_EMPTY_CONFIRMED', remoteHead: null } as const;
      },
    });
    expect(exit).toBe(0);
    expect(calls).toEqual([{ scope: { principalId: 'principal-cli', projectId: 'project-cli' }, destinationDbPath: config.memory.dbPath }]);
    expect(JSON.parse(output.join('\n'))).toEqual({ state: 'REMOTE_EMPTY_CONFIRMED', remoteHead: null });
  });
});
