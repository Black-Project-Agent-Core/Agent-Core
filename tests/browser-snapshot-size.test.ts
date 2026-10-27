import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';

it('bounds large OBU snapshots while preserving exact stale-state checks and acknowledged cleanup', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end('<body>' + Array.from({length:150}, (_,i) =>
      `<input style="width:20px;height:10px" aria-label="${'L'.repeat(550)}${i}" value="${'x'.repeat(600)}">`).join('') + '</body>');
  });
  await new Promise<void>(resolve => server.listen(Number(process.env.AGENT_CORE_BROWSER_TEST_PORT ?? 0), '127.0.0.1', resolve));
  const service = new BrowserControlService();
  let id: string | undefined;
  try {
    const opened = await service.open(`http://127.0.0.1:${(server.address() as any).port}`, true);
    id = String(opened.sessionId);
    const client = (service as any).sessions.get(id).client;
    const send = client.send.bind(client);
    const sizes: number[] = [];
    client.send = async (method: string, params: unknown) => {
      const result = await send(method, params);
      if (method === 'Runtime.evaluate') sizes.push(Buffer.byteLength(JSON.stringify(result)));
      return result;
    };
    const observed: any = await service.observe(id);
    expect(observed.omittedActions).toBeGreaterThan(0);
    expect(observed.actions.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThan(512 * 1024 + 1024);
    const click = observed.actions.find((action: any) => action.operation === 'CLICK');
    expect(click).toBeDefined();
    await send('Runtime.evaluate', {expression:`document.querySelector('input').value=${JSON.stringify('x'.repeat(599)+'y')}`,returnByValue:true});
    await expect(service.act(id, observed.observationId, click.id)).rejects.toThrow('BROWSER_CONTROL_STALE_OBSERVATION');
    const current: any = await service.observe(id);
    expect(current.observationId).not.toBe(observed.observationId);
    await send('Runtime.evaluate', {expression:"document.title='文'.repeat(200000);void 0",returnByValue:true});
    await expect(service.observe(id)).rejects.toThrow('BROWSER_CONTROL_SNAPSHOT_TOO_LARGE');
    await send('Runtime.evaluate', {expression:"document.title=''",returnByValue:true});
    expect((await service.observe(id)).observationId).toBeDefined();
    expect(await service.close(id)).toMatchObject({closed:true,cleanup:'acknowledged',browserRetained:true});
    id = undefined;
  } finally {
    if (id) await service.close(id);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 30_000);
