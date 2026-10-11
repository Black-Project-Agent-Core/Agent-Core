import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserControlService } from '../src/rdc/browser-control/service.js';
import { handleBrowserControl } from '../src/rdc/handlers/browser-control-handlers.js';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';

const image = { type: 'image', mimeType: 'image/jpeg', data: Buffer.from('private fixture pixels').toString('base64') };
afterEach(() => vi.restoreAllMocks());

describe('browser screenshot result delivery', () => {
  it('delivers one typed image without copying pixels into JSON metadata', async () => {
    const metadata = { sessionId: 'session', capture: { captureId: 'capture', coordinateSpace: 'css-viewport' } };
    vi.spyOn(browserControlService, 'observe').mockResolvedValue({ ...metadata, image });
    const result = await handleBrowserControl({ action: 'observe', sessionId: 'session', screenshot: {} });
    expect(result.content.filter(block => block.type === 'image')).toEqual([image]);
    expect(result.content.filter(block => block.type === 'text').map(block => block.text).join('')).not.toContain(image.data);
    expect(JSON.stringify(result.structuredContent ?? {})).not.toContain(image.data);
    expect(JSON.stringify(result)).toContain('captureId');
    expect(JSON.stringify(result).split(image.data)).toHaveLength(2);
  });

  it('passes explicit screenshot options to the existing owner', async () => {
    const observe = vi.spyOn(browserControlService, 'observe').mockResolvedValue({ sessionId: 'session' });
    const screenshot = { maxWidth: 800, crop: { x: 0, y: 5, width: 400, height: 200 } };
    await handleBrowserControl({ action: 'observe', sessionId: 'session', screenshot });
    expect(observe.mock.calls[0]?.[1]).toMatchObject({ screenshot });
  });

  it('reports external image delivery honestly without asserting that the client sees images', async () => {
    vi.spyOn(browserControlService, 'status').mockReturnValue({ sessions: [] });
    const result = await handleBrowserControl({ action: 'status' });
    expect(result.structuredContent).toMatchObject({
      controllerImageInput: { transport: 'mcp-image-content', supported: 'client-dependent' },
    });
  });

  it('preserves typed images through the native MCP session and advertises its text-only adapter', async () => {
    vi.spyOn(browserControlService, 'observe').mockResolvedValue({ sessionId: 'session', capture: { captureId: 'capture' }, image });
    const session = await AgentRuntimeToolSession.open('browser-visual-fixture', ['browser_control'], {});
    try {
      const tools = await session.modelTools();
      expect(tools[0]?.function.description).toContain('NATIVE_PROVIDER_IMAGE_INPUT_UNSUPPORTED');
      const result = await session.call('browser_control', {
        action: 'observe', sessionId: '00000000-0000-4000-8000-000000000001', screenshot: {},
      });
      expect(result.isError, result.text).toBe(false);
      expect(result.content.filter(block => block.type === 'image')).toEqual([image]);
      expect(result.text).not.toContain(image.data);
      const status = await session.call('browser_control', { action: 'status' });
      expect(status.text).toContain('NATIVE_PROVIDER_IMAGE_INPUT_UNSUPPORTED');
      expect(status.text).toContain('"supported":false');
    } finally {
      await session.close();
    }
  });
});
