import { createServer, type Server } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

async function fixture(extra = '') {
  const server: Server = createServer((req, res) => {
    res.setHeader('content-type','text/html; charset=utf-8');
    res.end(req.url === '/refreshed' ? '<p>Refreshed</p>' : `<!doctype html><style>
    body{margin:0;overflow:hidden}main{position:fixed;left:12%;top:12%;width:76%;height:260px;overflow:auto}
    .space{height:1350px}button{height:36px}
    </style><main aria-label="Plugin settings"><p>Development settings</p>${extra}
    <div class="space"></div><form action="/refreshed" method="POST"><button>Refresh tools</button></form></main>`);
  });
  await new Promise<void>(resolve => server.listen(Number(process.env.AGENT_CORE_BROWSER_TEST_PORT ?? 0), '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const service = new BrowserControlService();
  const opened = await service.open(`http://127.0.0.1:${(server.address() as any).port}`, true);
  const id = String(opened.sessionId);
  const session = (service as any).sessions.get(id);
  cleanup.push(() => service.close(id));
  const commands: string[] = [];
  const send = session.client.send.bind(session.client);
  session.client.send = (method: string, params: any) => { commands.push(method); return send(method, params); };
  const evaluate = async (expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  return { service, id, evaluate, commands };
}

it('scrolls an observed clipped panel in background and reveals an actionable Refresh tools', async () => {
  const { service, id, evaluate, commands } = await fixture('<style>.space{height:420px}</style>');
  let observed: any = await service.observe(id);
  expect(observed.actions.some((a: any) => a.label === 'Refresh tools')).toBe(false);
  expect(observed.text).not.toContain('Refresh tools');
  let steps = 0;
  while (!observed.actions.some((a: any) => a.label === 'Refresh tools') && steps++ < 12) {
    const down = observed.actions.find((a: any) => a.operation === 'SCROLL' && a.label.includes('down') && a.label.includes('Plugin settings'));
    expect(down).toBeDefined();
    await service.act(id, observed.observationId, down.id);
    observed = await service.observe(id);
  }
  const refresh = observed.actions.find((a: any) => a.label === 'Refresh tools');
  expect(refresh).toBeDefined();
  expect(await evaluate('scrollY')).toBe(0);
  expect(await evaluate('document.querySelector("main").scrollTop')).toBeGreaterThan(100);
  await service.act(id, observed.observationId, refresh.id);
  await expect.poll(async () => (await service.observe(id) as any).text, {timeout:3000}).toContain('Refreshed');
  expect(commands).not.toContain('Page.bringToFront');
  expect(commands.some(m => m.startsWith('Input.'))).toBe(false);
}, 30_000);

it('refuses a stale scroll position or replaced panel before moving it', async () => {
  const { service, id, evaluate } = await fixture();
  for (const mutation of ['document.querySelector("main").scrollTop=80', 'document.querySelector("main").outerHTML=document.querySelector("main").outerHTML', 'document.querySelector("main").style.overflow="hidden"']) {
    const observed: any = await service.observe(id);
    const down = observed.actions.find((a: any) => a.operation === 'SCROLL' && a.label.includes('down'));
    expect(down).toBeDefined();
    await evaluate(mutation);
    const before = await evaluate('document.querySelector("main").scrollTop');
    await expect(service.act(id, observed.observationId, down.id)).rejects.toThrow('BROWSER_CONTROL_STALE_OBSERVATION');
    expect(await evaluate('document.querySelector("main").scrollTop')).toBe(before);
  }
}, 30_000);

it('keeps scroll actions within the candidate budget when many visible controls exist', async () => {
  const controls = '<style>.pressure{display:grid;grid-template-columns:repeat(32,12px);grid-auto-rows:12px}.pressure button{width:12px;height:12px;padding:0;font-size:1px}</style><div class="pressure">'
    + Array.from({ length: 320 }, (_, i) => `<button>Control ${i}</button>`).join('') + '</div>';
  const { service, id } = await fixture(controls);
  const observed: any = await service.observe(id);
  expect(observed.actions.length).toBeLessThanOrEqual(250);
  expect(observed.actions.length).toBeGreaterThan(240);
  expect(observed.omittedActions).toBeGreaterThan(0);
  expect(observed.actions.some((a: any) => a.operation === 'SCROLL')).toBe(true);
}, 30_000);

it('preserves overlap in short panels so intermediate small controls are observable', async () => {
  const { service, id } = await fixture('<style>main{height:60px}button{height:18px}</style><div style="height:60px"></div><button>Intermediate action</button>');
  let observed: any = await service.observe(id);
  for(let i=0;i<6&&!observed.actions.some((a: any)=>a.label==='Intermediate action');i++) {
    const down=observed.actions.find((a: any)=>a.operation==='SCROLL'&&a.label.includes('down'));
    expect(down).toBeDefined();await service.act(id,observed.observationId,down.id);
    observed=await service.observe(id);
  }
  expect(observed.actions.some((a: any)=>a.label==='Intermediate action')).toBe(true);
}, 30_000);
