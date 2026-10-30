import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider, keepRecentImages, withoutImages, type AgentModelMessage } from '../src/agent-provider.js';
import { toolImages } from '../src/agent-tool-session.js';

// A tool that returns a picture (read_file on an image, image_inspect, a phone screenshot) must let the model see it.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
const image = (data = PNG, mimeType = 'image/png') => ({ type: 'image', data, mimeType });

describe('toolImages', () => {
  it('keeps supported pictures from a tool result and drops everything else', () => {
    const raw = { content: [{ type: 'text', text: 'meta' }, image(), image(PNG, 'image/jpeg'), image(PNG, 'image/tiff'), { type: 'image', mimeType: 'image/png' }] };
    expect(toolImages(raw)).toEqual([{ mediaType: 'image/png', dataBase64: PNG }, { mediaType: 'image/jpeg', dataBase64: PNG }]);
    expect(toolImages({ content: [{ type: 'text', text: 'only text' }] })).toEqual([]);
    expect(toolImages('not an object')).toEqual([]);
  });

  it('caps the number and the size of what is passed on', () => {
    expect(toolImages({ content: Array.from({ length: 6 }, () => image()) })).toHaveLength(3);
    const huge = Buffer.alloc(5 * 1024 * 1024 + 10, 1).toString('base64');
    expect(toolImages({ content: [image(huge), image()] })).toEqual([{ mediaType: 'image/png', dataBase64: PNG }]);
  });
});

describe('pictures in the message list', () => {
  const withPicture = (id: string): AgentModelMessage => ({ role: 'tool', name: 'image_inspect', tool_call_id: id, content: 'text ' + id,
    images: [{ mediaType: 'image/png', dataBase64: PNG }] });

  it('keeps only the newest pictures attached and leaves the text of the older ones', () => {
    const list = [withPicture('a'), withPicture('b'), withPicture('c'), { role: 'user', content: 'next' } as AgentModelMessage];
    keepRecentImages(list, 2);
    expect(list.map(message => message.images?.length ?? 0)).toEqual([0, 1, 1, 0]);
    expect(list[0]!.content).toContain('text a');
    expect(list[0]!.content).toContain('no longer attached');
    keepRecentImages(list, 2);
    expect(list[0]!.content!.match(/no longer attached/g)).toHaveLength(1);
  });

  it('never puts picture bytes into the copy that a checkpoint stores', () => {
    const stored = withoutImages(withPicture('a'));
    expect(stored).not.toHaveProperty('images');
    expect(JSON.stringify(stored)).not.toContain(PNG);
    expect(stored.content).toContain('text a');
    const plain: AgentModelMessage = { role: 'user', content: 'hi' };
    expect(withoutImages(plain)).toBe(plain);
  });
});

describe('Anthropic request with a picture in a tool result', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const provider = () => new OpenAICompatibleProvider({ enabled: true, baseUrl: 'https://api.anthropic.com/v1/', model: 'claude-sonnet-5-5',
    apiKey: 'fixture-secret', requestTimeoutMs: 5_000, maxToolIterations: 4 } as any, undefined, 'anthropic');

  it('sends the picture inside the tool_result, and sends no image field to another route', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
    }));
    const messages: AgentModelMessage[] = [
      { role: 'user', content: 'look at it' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'image_inspect', arguments: '{}' } }] },
      { role: 'tool', name: 'image_inspect', tool_call_id: 'call-1', content: 'ok', images: [{ mediaType: 'image/png', dataBase64: PNG }] },
    ];
    await provider().complete(messages, []);
    const result = bodies[0].messages.at(-1).content[0];
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'call-1' });
    expect(result.content).toEqual([{ type: 'text', text: 'ok' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }]);

    const plain = await new OpenAICompatibleProvider({ enabled: true, baseUrl: 'https://example.test/v1/', model: 'm', apiKey: 'k',
      requestTimeoutMs: 5_000, maxToolIterations: 4 } as any).complete(messages, []).catch(() => undefined);
    void plain;
    const other = bodies.find(body => Array.isArray(body.messages) && body.messages.some((m: any) => m.role === 'tool' && !Array.isArray(m.content)));
    expect(other?.messages.find((m: any) => m.role === 'tool')).not.toHaveProperty('images');
  });
});
