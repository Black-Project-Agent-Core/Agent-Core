import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPage } from './pages';
import { LauncherInspector } from './LauncherInspector';
import type { AgentChatAttachment, AgentChatUiState, DesktopSnapshot } from './host';

vi.mock('./useTaskChanges', () => ({ useTaskChanges: () => ({ data: undefined, state: 'idle', error: undefined, reload: () => {} }) }));

const note: AgentChatAttachment = { attachmentId: 'att-1', name: 'note.txt', mimeType: 'text/plain', kind: 'text', sizeBytes: 2048, relPath: 'chat/turn-1/0-note.txt' };

function props(attachments?: AgentChatAttachment[]): ComponentProps<typeof ChatPage> {
  const conversation = { id: 'chat-1', runtimeSessionId: 'session-1', workspace: 'fixture', title: 'Fixture',
    status: 'active' as const, createdAtMs: 1, updatedAtMs: 2 };
  return {
    snapshot: { health: { agentRuntime: { status: 'available', configuredProviderCount: 1, providerCount: 1 } } } as DesktopSnapshot,
    logs: [], onAction: vi.fn(), setPage: vi.fn(), agentRun: { status: 'idle' }, onAgentRun: vi.fn(),
    agentChat: { conversations: [conversation], modelChoice: '', active: { conversation,
      turns: [{ id: 'turn-1', conversationId: 'chat-1', clientRequestId: 'request-1', runtimeTaskId: 'task-1',
        status: 'finalized', createdAtMs: 1, startedAtMs: 1, ...(attachments ? { attachments } : {}) }],
      messages: [{ id: 'm1', conversationId: 'chat-1', turnId: 'turn-1', role: 'user', content: 'Baca catatan ini', createdAtMs: 1 }] } },
    onChatCreate: vi.fn(), onChatOpen: vi.fn(), onChatSend: vi.fn(), onChatCancel: vi.fn(), onChatArchive: vi.fn(),
  };
}

const pick = (name: string, content: string) => {
  const input = screen.getByLabelText('Pilih lampiran') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([content], name, { type: 'text/plain' })] } });
};
const send = (text: string) => {
  const box = screen.getByLabelText('Message Agent Core');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter' });
};

describe('composer attachments', () => {
  it('shows a picked file as a chip, sends it with the message, then clears it', async () => {
    const input = props();
    render(<ChatPage {...input}/>);
    pick('note.txt', 'hi');
    const chips = await screen.findByLabelText('Lampiran yang akan dikirim');
    expect(within(chips).getByText('note.txt')).toBeInTheDocument();

    send('Baca catatan ini');
    expect(input.onChatSend).toHaveBeenCalledTimes(1);
    expect(input.onChatSend).toHaveBeenCalledWith('chat-1', 'Baca catatan ini', false,
      [{ name: 'note.txt', mimeType: 'text/plain', dataBase64: 'aGk=', sizeBytes: 2 }]);
    expect(screen.queryByLabelText('Lampiran yang akan dikirim')).not.toBeInTheDocument();
  });

  it('removes a chip before sending, and a message without files keeps the old call shape', async () => {
    const input = props();
    render(<ChatPage {...input}/>);
    pick('note.txt', 'hi');
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus lampiran note.txt' }));
    expect(screen.queryByLabelText('Lampiran yang akan dikirim')).not.toBeInTheDocument();

    send('tanpa file');
    expect(input.onChatSend).toHaveBeenCalledWith('chat-1', 'tanpa file');
  });

  it('opens the file picker from the composer menu', () => {
    render(<ChatPage {...props()}/>);
    const picker = screen.getByLabelText('Pilih lampiran') as HTMLInputElement;
    const click = vi.spyOn(picker, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Composer actions' }));
    fireEvent.click(screen.getByRole('button', { name: /Add files or photos/ }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('lists the files of a sent message under it, from the turn metadata', async () => {
    render(<ChatPage {...props([note])}/>);
    const list = await waitFor(() => screen.getByLabelText('Lampiran'));
    expect(within(list).getByText('note.txt')).toBeInTheDocument();
    expect(within(list).getByText('2 KB')).toBeInTheDocument();
  });
});

describe('Inspector Imported Files', () => {
  const chat = (attachments?: AgentChatAttachment[]) => props(attachments).agentChat as AgentChatUiState;
  const card = () => within(screen.getByText(/^Imported Files/).closest('details') as HTMLElement);

  it('lists every file sent in the conversation, with kind and size', () => {
    render(<LauncherInspector chat={chat([note, { ...note, attachmentId: 'att-2', name: 'blob.bin', kind: 'binary', sizeBytes: 4 }])} logs={[]} open onToggle={vi.fn()}/>);
    expect(screen.getByText('Imported Files (2)')).toBeInTheDocument();
    expect(card().getByText('note.txt')).toBeInTheDocument();
    expect(card().getByText('text · 2 KB')).toBeInTheDocument();
    expect(card().getByText('binary · 4 B')).toBeInTheDocument();
  });

  it('says so plainly when no file was sent', () => {
    render(<LauncherInspector chat={chat()} logs={[]} open onToggle={vi.fn()}/>);
    expect(screen.getByText('Imported Files (0)')).toBeInTheDocument();
    expect(card().getByText('Belum ada file yang dikirim di percakapan ini')).toBeInTheDocument();
  });
});
