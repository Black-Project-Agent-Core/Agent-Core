import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerSkillsTools } from '../src/mcp/skills-tools.js';
import { taskSkillGuidance } from '../src/skills/external-guidance.js';
import { NativeSkillSettings } from '../src/native-skill-settings.js';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), captureFailure: vi.fn() } }));

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
beforeEach(() => { service.inspect.mockClear(); service.read.mockClear(); });
async function settingsWith(...off: string[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-skill-block-'));
  roots.push(root);
  const settings = new NativeSkillSettings(root);
  for (const name of off) settings.setEnabled(name, false);
  return settings;
}

const digest = 'sha256:' + 'a'.repeat(64);
const item = (name: string) => ({ name, description: name + ' description', digest });
const service = {
  list: async () => [item('source-review'), item('mind-control')],
  inspect: vi.fn(async (name: string) => ({ ...item(name), metadata: {} })),
  read: vi.fn(async (name: string) => ({ name, digest, content: '# body' })),
  discover: async () => ({ artifacts: [], search: { version: 1, hits: [item('source-review'), item('mind-control')], truncated: false } }),
};
function tool(nativeTaskId: string | undefined, settings: NativeSkillSettings | undefined) {
  let call: (args: any) => Promise<any> = async () => undefined;
  registerSkillsTools({ registerTool: (_name: string, _config: unknown, fn: typeof call) => { call = fn; } } as any,
    service as any, undefined, undefined, undefined, nativeTaskId, undefined, undefined, settings);
  return (args: any) => call(args);
}

describe('Native Skill hard block in the skills tool', () => {
  it('refuses inspect and read of a switched-off Skill on the Native instance, with the ask-the-owner message', async () => {
    const call = tool('task-1', await settingsWith('mind-control'));
    for (const args of [{ action: 'inspect', name: 'mind-control' }, { action: 'read', name: 'mind-control', expectedActiveDigest: digest }]) {
      const result = await call(args);
      expect(result.isError, JSON.stringify(args)).toBe(true);
      expect(result.content[0].text).toContain('SKILL_DISABLED_BY_USER');
      expect(result.content[0].text).toContain('ask them to switch it on');
    }
    expect(service.inspect).not.toHaveBeenCalledWith('mind-control');
    expect(service.read).not.toHaveBeenCalled();
  });

  it('still serves a Skill that is on', async () => {
    const call = tool('task-1', await settingsWith('mind-control'));
    const result = await call({ action: 'inspect', name: 'source-review' });
    expect(result.isError).toBeUndefined();
    expect(service.inspect).toHaveBeenCalledWith('source-review');
  });

  it('marks list and search entries for Native: off Skills keep only their name', async () => {
    const call = tool('task-1', await settingsWith('mind-control'));
    const listed = JSON.parse((await call({ action: 'list' })).content[0].text);
    expect(listed).toEqual([
      { ...item('source-review'), nativeEnabled: true },
      { name: 'mind-control', nativeEnabled: false, note: 'switched off by the user' },
    ]);
    const searched = JSON.parse((await call({ action: 'search', query: 'review' })).content[0].text);
    expect(searched.hits[1]).toEqual({ name: 'mind-control', nativeEnabled: false, note: 'switched off by the user' });
    expect(searched.hits[0].nativeEnabled).toBe(true);
    expect(searched.version).toBe(1);
  });

  it('does not affect an instance without a Native task (external controllers)', async () => {
    const call = tool(undefined, await settingsWith('mind-control'));
    const listed = JSON.parse((await call({ action: 'list' })).content[0].text);
    expect(listed).toEqual([item('source-review'), item('mind-control')]);
    const result = await call({ action: 'inspect', name: 'mind-control' });
    expect(result.isError).toBeUndefined();
  });
});

describe('Native Skill guidance with switched-off Skills', () => {
  const skills = { inspect: async () => ({ digest }) } as any;

  it('drops the descriptor of an off Skill and names it in one hard-block line', async () => {
    const guidance = await taskSkillGuidance(skills, 'native', ['mind-control']);
    expect(guidance.text).not.toContain('mind-control: available');
    expect(guidance.entries.map(entry => entry.name)).not.toContain('mind-control');
    expect(guidance.text).toContain('Skills switched off by the user (hard block');
    expect(guidance.text).toContain('a refusal is not permanent): mind-control');
  });

  it('is unchanged when nothing is off', async () => {
    const plain = await taskSkillGuidance(skills, 'native');
    const same = await taskSkillGuidance(skills, 'native', []);
    expect(same.text).toBe(plain.text);
    expect(plain.text).not.toContain('switched off by the user');
  });
});
