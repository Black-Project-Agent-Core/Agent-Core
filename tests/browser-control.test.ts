import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';

const servers: Server[] = [];
const sessions: Array<{ service: BrowserControlService; id: string }> = [];

afterEach(async () => {
  while (sessions.length) {
    const current = sessions.pop()!;
    await current.service.close(current.id).catch(() => undefined);
  }
  while (servers.length) {
    const server = servers.pop()!;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

async function listen(html: (url: string) => string): Promise<string> {
  const server = createServer((request, response) => {
    response.statusCode = 200;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(html(request.url ?? '/'));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(process.env.AGENT_CORE_BROWSER_TEST_PORT ?? 0), '127.0.0.1', () => resolve());
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture listen failed');
  return `http://127.0.0.1:${address.port}`;
}

async function open(service: BrowserControlService, url: string) {
  const result = await service.open(url, true);
  const id = String(result.sessionId);
  sessions.push({ service, id });
  return id;
}

function action(observation: any, predicate: (value: any) => boolean) {
  const found = observation.actions.find(predicate);
  if (!found) throw new Error('expected browser action not found');
  return found;
}

describe('BrowserControlService', () => {
  it('exposes only observed safe actions and verifies final state independently after fill/select/click', async () => {
    const base = await listen(url => url.startsWith('/done') ? '<p>DONE</p>' : `<!doctype html><html><body>
      <form action="/done">
        <label>City <input id="city" role="combobox" aria-controls="suggestions"></label>
        <div id="suggestions" role="listbox"><div role="option">Lisbon, Portugal</div></div>
        <label>Category <select id="category" aria-label="Category"><option>All</option><option>Design</option></select></label>
        <label><input id="check" type="checkbox"> Free cancellation</label>
        <input aria-label="Secret" type="password" value="never-expose">
        <input aria-label="Upload" type="file">
        <input aria-label="Hidden" type="hidden" value="hidden-secret">
        <button id="go" type="submit">Continue</button>
      </form>
      <p id="status">READY</p>
    </body></html>`);
    const service = new BrowserControlService();
    const sessionId = await open(service, base);
    let observed: any = await service.observe(sessionId);
    expect(JSON.stringify(observed)).not.toContain('never-expose');
    expect(JSON.stringify(observed)).not.toContain('hidden-secret');
    expect(observed.actions.some((item: any) => item.label === 'Upload')).toBe(false);
    const checkboxOps = observed.actions.filter((item: any) => item.role === 'checkbox').map((item: any) => item.operation);
    expect(checkboxOps).toEqual(['CLICK']);

    const fill = action(observed, (item: any) => item.operation === 'TYPE_TEXT' && item.label === 'City');
    await service.act(sessionId, observed.observationId, fill.id, 'Lisbon');
    observed = await service.observe(sessionId);
    expect(observed.actions.some((item: any) => item.role === 'option' && item.label.includes('Lisbon'))).toBe(true);
    expect(action(observed, (item: any) => item.operation === 'TYPE_TEXT' && item.label === 'City').currentValue).toBe('Lisbon');

    const select = action(observed, (item: any) => item.operation === 'SELECT' && item.label.includes('Design'));
    await service.act(sessionId, observed.observationId, select.id);
    observed = await service.observe(sessionId);
    expect(observed.actions.some((item: any) => item.operation === 'SELECT' && item.currentValue === 'Design')).toBe(true);

    const click = action(observed, (item: any) => item.operation === 'CLICK' && item.label === 'Continue');
    await service.act(sessionId, observed.observationId, click.id);
    const verified: any = await service.observe(sessionId);
    expect(verified.text).toContain('DONE');
  }, 30_000);

  it('uses current geometry but rejects covered, replaced, changed-context, and navigated observations', async () => {
    const base = await listen(url => {
      const scenario = new URL(url, 'http://fixture').searchParams.get('scenario');
      if (scenario === 'next') return '<p>NEXT</p>';
      return `<!doctype html><body><form><p id="context">Total $10</p>
        <button id="target" type="button" >Continue</button>
        <span id="status">READY</span></form>
        </body>`;
    });

    for (const scenario of ['move', 'cover', 'replace', 'context', 'navigate']) {
      const service = new BrowserControlService();
      const sessionId = await open(service, `${base}/?scenario=${scenario}`);
      const observed: any = await service.observe(sessionId);
      const click = action(observed, (item: any) => item.operation === 'CLICK' && item.label === 'Continue');
      const mutations: Record<string,string> = {move: "target.style.transform='translateX(120px)'",cover: "const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;z-index:9999;background:white';document.body.append(d)",replace: 'target.outerHTML=target.outerHTML',context: "context.textContent='Total $100'",navigate: "location.href='/?scenario=next'"};
      await (service as any).sessions.get(sessionId).client.send('Runtime.evaluate',{expression:mutations[scenario],returnByValue:true});
      if(scenario==='navigate') await new Promise(resolve=>setTimeout(resolve,150));
      if (scenario === 'move') {
        await service.act(sessionId, observed.observationId, click.id);
        const verified: any = await service.observe(sessionId);
        expect(verified.text).toContain('READY');
      } else {
        await expect(service.act(sessionId, observed.observationId, click.id)).rejects.toThrow(
          /BROWSER_CONTROL_STALE_OBSERVATION|BROWSER_CONTROL_TARGET_CHANGED_OR_COVERED/,
        );
      }
      await service.close(sessionId);
      sessions.splice(sessions.findIndex(item => item.id === sessionId), 1);
    }
  }, 90_000);

  it('consumes mutation observations once and enforces action/observation budgets', async () => {
    const base = await listen(() => '<button type="button">One</button>');
    const service = new BrowserControlService({ maxActions: 1, maxObservations: 3 });
    const sessionId = await open(service, base);
    let observed: any = await service.observe(sessionId);
    const wait = action(observed, (item: any) => item.operation === 'WAIT');
    await service.act(sessionId, observed.observationId, wait.id);
    await expect(service.act(sessionId, observed.observationId, wait.id)).rejects.toThrow(
      /BROWSER_CONTROL_ACTION_BUDGET_EXCEEDED|BROWSER_CONTROL_OBSERVATION_NOT_CURRENT/,
    );
    observed = await service.observe(sessionId);
    await expect(service.act(sessionId, observed.observationId, action(observed, (item: any) => item.operation === 'WAIT').id))
      .rejects.toThrow('BROWSER_CONTROL_ACTION_BUDGET_EXCEEDED');
    await service.observe(sessionId);
    await expect(service.observe(sessionId)).rejects.toThrow('BROWSER_CONTROL_OBSERVATION_BUDGET_EXCEEDED');
  }, 30_000);
});
