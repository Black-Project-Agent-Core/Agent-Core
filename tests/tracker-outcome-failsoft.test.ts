import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActivityTracker } from '../src/tracker/activity-tracker.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tracker(): Promise<{ tracker: ActivityTracker; root: string }> {
  const parent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'tracker-outcome-'));
  roots.push(root);
  return { tracker: new ActivityTracker(root), root };
}

describe('tracker feature outcomes never throw into a caller', () => {
  it('records the feature id a Skill outcome uses', async () => {
    const { tracker: t } = await tracker();
    // skill-outcome-review.ts builds this id from the Skill name.
    t.recordOutcome('LEARNING', 'success', 'Verified task outcome', { featureId: 'skill.windows-powershell-host', outcome: 'success', properties: { kind: 'skill' } },
      'skill-proposal-use-outcome', { workspace: 'w' });
    const events = t.readFeatureOutcomes({ workspace: 'w' });
    expect(events).toHaveLength(1);
    expect(events[0]!.featureOutcome).toMatchObject({ featureId: 'skill.windows-powershell-host', outcome: 'success' });
  });

  it('keeps an outcome that fails validation as a plain event that says why, and does not throw', async () => {
    const { tracker: t } = await tracker();
    const event = t.recordOutcome('LEARNING', 'warn', 'Bad id', { featureId: 'skill:has a colon', outcome: 'success' }, 'skill-proposal-use-outcome', { workspace: 'w' });
    expect(event.featureOutcome).toBeUndefined();
    expect(event.kind).toBe('feature-outcome-rejected');
    expect(String(event.context?.trackerIssue)).toContain('TRACKER_FEATURE_ID_INVALID');
    expect(t.readFeatureOutcomes({ workspace: 'w' })).toHaveLength(0);
  });

  it('validates property keys before applying the cap of sixteen', async () => {
    const { tracker: t } = await tracker();
    const properties: Record<string, string> = {};
    for (let index = 0; index < 20; index += 1) properties[`bad key ${index}`] = 'x';
    properties.kind = 'skill';
    const event = t.recordOutcome('LEARNING', 'success', 'Many keys', { featureId: 'feature.alpha', outcome: 'success', properties });
    expect(event.featureOutcome?.properties).toEqual({ kind: 'skill' });
  });

  it('shows an unreadable journal as an issue instead of silently reading as empty', async () => {
    const { tracker: t } = await tracker();
    t.recordOutcome('LEARNING', 'success', 'One', { featureId: 'feature.alpha', outcome: 'success' });
    expect(t.getJournalIssue()).toBeNull();
    // The journal reader throws only on a real I/O error, which a test cannot cause portably; inject it.
    (t as any).journal.replaySync = () => { throw new Error('EIO: i/o error'); };
    expect(t.readFeatureOutcomes()).toEqual([]);
    expect(t.getJournalIssue()).toContain('Tracker journal unreadable: EIO');
    expect(t.readToolInvocationEvents()).toEqual([]);
  });
});
