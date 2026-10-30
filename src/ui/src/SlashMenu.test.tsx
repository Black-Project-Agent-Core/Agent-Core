import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SlashMenu, filterSlashCommands, slashQuery } from './SlashMenu';
import type { SlashCommand } from './host';

const commands: SlashCommand[] = [
  { name: 'compact', kind: 'command', description: 'Padatkan konteks giliran yang berjalan' },
  { name: 'code-review', kind: 'skill', description: 'Tinjau kode' },
  { name: 'mind-control', kind: 'skill', description: 'Gerbang penalaran' },
  { name: 'replica-test', kind: 'skill', description: 'Uji clone' },
];

describe('slashQuery', () => {
  it('returns the text after "/" only for a single slash token', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/com')).toBe('com');
    expect(slashQuery('/compact')).toBe('compact');
    expect(slashQuery('')).toBeNull();
    expect(slashQuery('hello')).toBeNull();
    expect(slashQuery('/code-review text')).toBeNull();
    expect(slashQuery(' /x')).toBeNull();
    expect(slashQuery('/a\nb')).toBeNull();
  });
});

describe('filterSlashCommands', () => {
  it('lists everything for an empty query, keeping compact first', () => {
    expect(filterSlashCommands(commands, '').map(item => item.name)).toEqual(['compact', 'code-review', 'mind-control', 'replica-test']);
  });
  it('ranks startsWith matches before includes matches, case-insensitively', () => {
    expect(filterSlashCommands(commands, 'CO').map(item => item.name)).toEqual(['compact', 'code-review', 'mind-control']);
    expect(filterSlashCommands(commands, 'test').map(item => item.name)).toEqual(['replica-test']);
    expect(filterSlashCommands(commands, 'zzz')).toEqual([]);
  });
  it('caps the list at 8 entries', () => {
    const many: SlashCommand[] = Array.from({ length: 12 }, (_, i) => ({ name: 'skill-' + i, kind: 'skill', description: '' }));
    expect(filterSlashCommands(many, 'skill')).toHaveLength(8);
  });
  it('offers only the compact command while a turn runs', () => {
    expect(filterSlashCommands(commands, '', true).map(item => item.name)).toEqual(['compact']);
    expect(filterSlashCommands(commands, 'code', true)).toEqual([]);
  });
});

describe('SlashMenu', () => {
  it('renders a listbox with badges, names and descriptions, and reports clicks', () => {
    const onSelect = vi.fn();
    render(<SlashMenu commands={commands.slice(0, 2)} activeIndex={1} onSelect={onSelect}/>);
    const list = screen.getByRole('listbox', { name: 'Perintah dan skill' });
    const options = screen.getAllByRole('option');
    expect(list).toBeInTheDocument();
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[1]!.id).toBe('slash-option-code-review');
    expect(options[1]).toHaveClass('active');
    expect(options[0]).toHaveTextContent('Perintah');
    expect(options[0]).toHaveTextContent('/compact');
    expect(options[0]).toHaveTextContent('Padatkan konteks giliran yang berjalan');
    expect(options[1]).toHaveTextContent('Skill');
    fireEvent.click(options[1]!);
    expect(onSelect).toHaveBeenCalledWith(commands[1]);
  });
});
