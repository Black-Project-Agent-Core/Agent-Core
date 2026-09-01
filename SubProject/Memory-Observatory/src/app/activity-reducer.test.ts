import { describe, expect, it } from 'vitest';
import { activityReducer, initialActivityState } from './activity-reducer';
import type { ObservatoryActivity } from './types';

function record(sequence: number): ObservatoryActivity {
  return { sequence, timestamp: new Date(sequence).toISOString(), category: 'memory', event: `memory.${sequence}` };
}

describe('activityReducer scaffold', () => {
  it('deduplicates by audit sequence and preserves ordering', () => {
    let state = activityReducer(initialActivityState, { type: 'append', record: record(2) });
    state = activityReducer(state, { type: 'append', record: record(1) });
    state = activityReducer(state, { type: 'append', record: record(2) });
    expect(state.records.map((item) => item.sequence)).toEqual([1, 2]);
  });

  it('tracks a history gap explicitly', () => {
    expect(activityReducer(initialActivityState, { type: 'gap' }).gap).toBe(true);
  });
});
