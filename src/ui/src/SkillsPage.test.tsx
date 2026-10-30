import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsPage } from './LauncherPages';
import { postHost, type AgentChatUiState, type NativeSkillInfo } from './host';

// The page owns no host traffic (App sends every request), so postHost is mocked to prove it stays untouched.
vi.mock('./host', async importOriginal => ({ ...(await importOriginal<typeof import('./host')>()), postHost: vi.fn() }));

const skills: NativeSkillInfo[] = [
  { name: 'code-review', description: 'Review code for quality and safety', digest: 'sha256:0123456789abcdef', enabled: true },
  { name: 'web-research', description: 'Search the web and cite sources', digest: 'sha256:fedcba9876543210', enabled: true },
  { name: 'deploy-guard', description: 'Block risky deployments', digest: 'sha256:aabbccddeeff0011', enabled: false },
];
type SkillsState = NonNullable<AgentChatUiState['skills']>;
const chatWith = (state?: SkillsState): AgentChatUiState => ({ conversations: [], modelChoice: '', ...(state ? { skills: state } : {}) });
const ready = (pending: Record<string, boolean> = {}) => chatWith({ items: skills, state: 'ready', pending });
const props = { setPage: vi.fn(), onAction: vi.fn(), onSkillSet: vi.fn(), onSkillsReload: vi.fn() };
const switchFor = (name: string) => screen.getByRole('button', { name: `Skill ${name} untuk Native` });

beforeEach(() => { vi.clearAllMocks(); });

describe('SkillsPage', () => {
  it('lists the installed skills with summary, short digest and one labelled switch each', () => {
    render(<SkillsPage {...props} agentChat={ready()}/>);
    expect(screen.getByRole('heading', { name: 'Skill' })).toBeInTheDocument();
    expect(screen.getByText('Native hard block')).toBeInTheDocument();
    expect(screen.getByText(/OFF = Native dilarang membaca atau memakainya/)).toBeInTheDocument();
    expect(screen.getByText('2 aktif · 1 nonaktif')).toBeInTheDocument();
    for (const item of skills) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
      expect(screen.getByText(item.description)).toBeInTheDocument();
      expect(screen.getByText(item.digest.slice(7, 15))).toBeInTheDocument();
    }
    expect(switchFor('code-review')).toHaveAttribute('aria-pressed', 'true');
    expect(switchFor('deploy-guard')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/planned/i)).toBeNull();
  });

  it('calls onSkillSet(name, false) for an enabled skill and (name, true) for a disabled one', () => {
    render(<SkillsPage {...props} agentChat={ready()}/>);
    fireEvent.click(switchFor('code-review'));
    expect(props.onSkillSet).toHaveBeenLastCalledWith('code-review', false);
    fireEvent.click(switchFor('deploy-guard'));
    expect(props.onSkillSet).toHaveBeenLastCalledWith('deploy-guard', true);
    expect(props.onSkillSet).toHaveBeenCalledTimes(2);
    expect(postHost).not.toHaveBeenCalled();
  });

  it('filters by name and by description, ignoring case, and says when nothing matches', () => {
    render(<SkillsPage {...props} agentChat={ready()}/>);
    const search = screen.getByRole('textbox', { name: 'Cari skill' });
    fireEvent.change(search, { target: { value: 'REVIEW' } });
    expect(screen.getByText('code-review')).toBeInTheDocument();
    expect(screen.queryByText('web-research')).toBeNull();
    fireEvent.change(search, { target: { value: 'cite sources' } });
    expect(screen.getByText('web-research')).toBeInTheDocument();
    expect(screen.queryByText('code-review')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('Tidak ada skill yang cocok')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /untuk Native/ })).toBeNull();
  });

  it('shows loading, error with reload, empty and pending states', () => {
    const { rerender } = render(<SkillsPage {...props} agentChat={chatWith()}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Memuat daftar skill');
    rerender(<SkillsPage {...props} agentChat={chatWith({ items: [], state: 'error', error: 'Core tidak menjawab', pending: {} })}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('Core tidak menjawab');
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang' }));
    expect(props.onSkillsReload).toHaveBeenCalledTimes(1);
    rerender(<SkillsPage {...props} agentChat={chatWith({ items: [], state: 'ready', pending: {} })}/>);
    expect(screen.getByText('Belum ada skill terpasang')).toBeInTheDocument();
    rerender(<SkillsPage {...props} agentChat={ready({ 'code-review': true })}/>);
    expect(switchFor('code-review')).toBeDisabled();
    expect(switchFor('web-research')).toBeEnabled();
  });
});
