import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';
import { OpenBrowserUseTransport } from '../src/rdc/browser-control/open-browser-use.js';
import { browserControl, externalBrowserControl } from '../src/mcp/rdc-schemas.js';

afterEach(() => vi.restoreAllMocks());

describe('default browser transport', () => {
  it('uses the existing OBU connection in background and fails without launching another engine', async () => {
    const connect = vi.spyOn(OpenBrowserUseTransport, 'connect')
      .mockRejectedValue(new Error('BROWSER_OBU_BACKGROUND_CONNECTION_REQUIRED'));
    const service = new BrowserControlService();
    await expect(service.open('https://example.test/')).rejects.toThrow('BACKGROUND_CONNECTION_REQUIRED');
    expect(connect).toHaveBeenCalledExactlyOnceWith(expect.any(String), expect.any(String), undefined, true);
    expect(service.status().sessions).toEqual([]);
  });

  it('rejects the retired isolated transport in both schemas and direct service calls', async () => {
    const args = { action: 'open', transport: 'isolated', url: 'https://example.test/' };
    expect(browserControl.safeParse(args).success).toBe(false);
    expect(externalBrowserControl.safeParse(args).success).toBe(false);
    const connect = vi.spyOn(OpenBrowserUseTransport, 'connect');
    await expect(new BrowserControlService().open(args.url, true, { transport: 'isolated' as never }))
      .rejects.toThrow('BROWSER_CONTROL_TRANSPORT_UNSUPPORTED');
    expect(connect).not.toHaveBeenCalled();
  });
});
