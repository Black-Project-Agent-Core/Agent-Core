import type { SlashCommand } from './host';

export const SLASH_MENU_LIMIT = 8;

/** Text after "/" when the whole draft is a single slash token (no whitespace); null for any other draft. */
export function slashQuery(draft: string): string | null {
  return /^\/[^\s]*$/.test(draft) ? draft.slice(1) : null;
}

/** Case-insensitive match: names starting with the query first, then names merely containing it; at most 8.
 *  While a turn runs only the 'compact' command is offered because Skills cannot be sent then. */
export function filterSlashCommands(commands: SlashCommand[], query: string, runningOnlyCompact = false): SlashCommand[] {
  const needle = query.toLowerCase();
  const pool = runningOnlyCompact ? commands.filter(item => item.kind === 'command' && item.name === 'compact') : commands;
  const starts = pool.filter(item => item.name.toLowerCase().startsWith(needle));
  const includes = pool.filter(item => !item.name.toLowerCase().startsWith(needle) && item.name.toLowerCase().includes(needle));
  return [...starts, ...includes].slice(0, SLASH_MENU_LIMIT);
}

export const slashOptionId = (name: string) => 'slash-option-' + name.replace(/[^a-zA-Z0-9_-]/g, '_');

type SlashMenuProps = {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover?: (index: number) => void;
};

/** Presentational "/" popup: the textarea keeps focus and drives the highlight through aria-activedescendant. */
export function SlashMenu({ commands, activeIndex, onSelect, onHover }: SlashMenuProps) {
  return <div className="slash-menu" role="listbox" aria-label="Perintah dan skill">
    {commands.map((command, index) => <div
      key={command.kind + ':' + command.name}
      id={slashOptionId(command.name)}
      role="option"
      aria-selected={index === activeIndex}
      className={'slash-menu-item' + (index === activeIndex ? ' active' : '')}
      title={command.description}
      onMouseDown={e => e.preventDefault()}
      onMouseEnter={() => onHover?.(index)}
      onClick={() => onSelect(command)}
    >
      <span className="slash-menu-badge">{command.kind === 'command' ? 'Perintah' : 'Skill'}</span>
      <b>{'/' + command.name}</b>
      <span className="slash-menu-description">{command.description}</span>
    </div>)}
  </div>;
}
