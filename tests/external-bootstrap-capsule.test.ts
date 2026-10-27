import { expect, it } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';

// Every line the capsule emits after the static contract text, at its bounded length; a cut line fails its pattern.
const WHOLE_LINES = [
  /^- current authority: [0-9a-f-]{36} \| .{180} \| .{650}$/,
  /^- pending Learning reviews: \d+$/,
  /^- prior external episodes with unresolved Learning: \d+$/,
  /^ {2}- episode ext-[0-9a-f]{32} updated \S+ workspace=agent-core$/,
  /^For complex\/continuity-sensitive work, .+ Memory\/Patterns\/Skills\.$/,
];
const DYNAMIC_LINE = /^(- current authority|- pending Learning|- prior external|  - episode|For complex)/;
const prose = (word: string, length: number) => (word + ' ').repeat(Math.ceil(length / (word.length + 1))).trim();

async function setup() {
  const f = await fixture();
  const stateDir = path.join(f.root, 'external');
  const service = await ExternalControllerLearningService.initialize({ stateDir, memory: f.memory, learning: f.learning, skills: f.skills });
  const stateFile = path.join(stateDir, 'external-controller.json');
  const note = (index: number, title: string, context: string, extra: { category?: string; tags: string[] }) =>
    f.memory.remember({ content: 'Fixture record ' + index, title, context, provenance: { workspace: 'agent-core' }, ...extra });
  // Any pending count above the five listed episodes yields the same capsule.
  const pending = async (count: number) => {
    for (let i = 0; i < count; i++) await service.startEpisode('pending-' + i, { taskKey: 'pending-' + i });
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    for (const episode of state.episodes) Object.assign(episode, { meaningful: true, pendingLearning: true, workspace: 'agent-core' });
    await writeFile(stateFile, JSON.stringify(state));
  };
  return { service, note, pending };
}

it('keeps both Learning count lines and only whole lines when dynamic context exceeds the capsule cap', async () => {
  const f = await setup();
  for (let i = 0; i < 2; i++)
    await f.note(i, prose('title' + i, 400), prose('context', 1_200), { category: 'product-direction', tags: ['primary-roadmap'] });
  await f.pending(6);

  const text = await f.service.bootstrapInstructions('capsule-worst-case');
  const lines = text.split('\n');
  expect(text.length).toBeLessThanOrEqual(7_600);
  expect(text).toContain('- pending Learning reviews: 0');
  expect(text).toContain('- prior external episodes with unresolved Learning: 6');
  expect(text).toContain('- current authority: ');
  expect(text.indexOf('- prior external episodes')).toBeLessThan(text.indexOf('- current authority: '));
  for (const line of lines.filter(item => DYNAMIC_LINE.test(item)))
    expect(WHOLE_LINES.some(whole => whole.test(line)), line).toBe(true);
  expect(WHOLE_LINES.some(whole => whole.test(lines.at(-1)!)), lines.at(-1)).toBe(true);
}, 30_000);

it('orders the dynamic lines so the cap drops pending-episode lines before authority and the counts', async () => {
  const f = await setup();
  await f.note(0, 'title', 'context', { category: 'product-direction', tags: ['primary-roadmap'] });
  await f.note(1, 'title', 'context', { tags: ['user-correction'] });
  await f.note(2, 'title', 'context', { category: 'operational-reflection', tags: ['agent-core'] });
  await f.pending(6);

  const text = await f.service.bootstrapInstructions('capsule-order');
  const at = ['- pending Learning reviews', '- prior external episodes', '- current authority: ', '- material correction: ',
    '- reusable lesson: ', '  - episode ', 'For complex/continuity-sensitive work'].map(marker => text.indexOf(marker));
  expect(at).not.toContain(-1);
  expect(at).toEqual([...at].sort((a, b) => a - b));
  // The count covers every pending episode; only the five newest are listed.
  expect(text).toContain('- prior external episodes with unresolved Learning: 6');
  expect(text.split('\n').filter(line => line.startsWith('  - episode '))).toHaveLength(5);
}, 30_000);

it('keeps the capsule shape when there is no dynamic context', async () => {
  const f = await setup();
  const text = await f.service.bootstrapInstructions('capsule-empty');
  expect(text.length).toBeLessThan(7_000);
  expect(text.split('\n').slice(-3)).toEqual(['- pending Learning reviews: 0',
    '- prior external episodes with unresolved Learning: 0', expect.stringMatching(/^For complex\/continuity-sensitive work/)]);
});
