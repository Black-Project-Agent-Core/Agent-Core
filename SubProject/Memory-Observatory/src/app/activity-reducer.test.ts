import { describe, expect, it } from 'vitest';
import { activityReducer, initialActivityState } from './activity-reducer';
import type { ObservatoryActivity } from './types';

function record(sequence: number, event = `memory.${sequence}`): ObservatoryActivity {
  return { sequence, timestamp: new Date(sequence).toISOString(), category: 'memory', event };
}

describe('activityReducer', () => {
  it('orders strictly by persisted sequence and suppresses duplicate delivery', () => {
    let state = activityReducer(initialActivityState, { type: 'append', record: record(3) });
    state = activityReducer(state, { type: 'append', record: record(1) });
    state = activityReducer(state, { type: 'append', record: record(2) });
    state = activityReducer(state, { type: 'append', record: record(2, 'duplicate-should-replace') });
    expect(state.records.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(state.records.find((item) => item.sequence === 2)?.event).toBe('duplicate-should-replace');
  });

  it('bounds the client buffer to the latest 2,000 persisted sequences', () => {
    const records = Array.from({ length: 2_050 }, (_, index) => record(index + 1));
    const state = activityReducer(initialActivityState, { type: 'replace', records });
    expect(state.records).toHaveLength(2_000);
    expect(state.records[0]?.sequence).toBe(51);
    expect(state.records.at(-1)?.sequence).toBe(2050);
  });

  it('tracks explicit history gap state until a successful recovery clears it', () => {
    const gap = activityReducer(initialActivityState, { type: 'gap' });
    expect(gap.gap).toBe(true);
    expect(activityReducer(gap, { type: 'clear-gap' }).gap).toBe(false);
  });
});
