import type { ObservatoryActivity } from './types';

export interface ActivityState {
  records: ObservatoryActivity[];
  gap: boolean;
}

export type ActivityAction =
  | { type: 'replace'; records: ObservatoryActivity[] }
  | { type: 'append'; record: ObservatoryActivity }
  | { type: 'gap' }
  | { type: 'clear-gap' };

export const initialActivityState: ActivityState = { records: [], gap: false };

export function activityReducer(state: ActivityState, action: ActivityAction): ActivityState {
  if (action.type === 'gap') return { ...state, gap: true };
  if (action.type === 'clear-gap') return { ...state, gap: false };
  const incoming = action.type === 'replace' ? action.records : [...state.records, action.record];
  const records = [...new Map(incoming.map((record) => [record.sequence, record])).values()]
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-2_000);
  return { records, gap: state.gap };
}
