import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecallView } from './RecallView';

const nodes = [
  { memoryId:'current', title:'Current Solution', kind:'decision' },
  { memoryId:'expanded', title:'Older Decision', kind:'decision' },
  { memoryId:'failure', title:'Prior Failure', kind:'failure' },
  { memoryId:'not-loaded', title:'Unloaded Memory', kind:'decision' },
  { memoryId:'old-context', title:'Old Context Memory', kind:'decision' },
];
const records = [
  { sequence:1, timestamp:'2026-09-01T00:00:00Z', category:'memory', event:'memory.recalled', contextId:'old', memoryIds:['old-context'] },
  { sequence:10, timestamp:'2026-09-01T00:01:00Z', category:'memory', event:'memory.recalled', contextId:'ctx-current', memoryIds:['current'] },
  { sequence:11, timestamp:'2026-09-01T00:01:01Z', category:'memory', event:'memory.remember_more_expanded', contextId:'ctx-current', memoryIds:['expanded','failure'] },
];

describe('RecallView', () => {
  it('distinguishes current recall, expansion, prior failure, and not-loaded nodes for only the latest context', () => {
    render(<RecallView snapshot={{ nodes } as any} records={records as any} />);
    const row = (title:string) => screen.getByText(title).closest<HTMLElement>('[data-recall-row]')!;
    expect(within(row('Current Solution')).getByText('RECALLED CURRENT')).toBeInTheDocument();
    expect(within(row('Older Decision')).getByText('EXPANDED')).toBeInTheDocument();
    expect(within(row('Prior Failure')).getByText('PRIOR FAILURE')).toBeInTheDocument();
    expect(within(row('Unloaded Memory')).getByText('NOT LOADED')).toBeInTheDocument();
    expect(within(row('Old Context Memory')).getByText('NOT LOADED')).toBeInTheDocument();
    expect(screen.getByText('ctx-current')).toBeInTheDocument();
  });
});
