import { afterEach, expect, it, vi } from 'vitest';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { handleReadFile } from '../src/rdc/handlers/filesystem-handlers.js';
import { fileURLToPath } from 'node:url';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const load = () => import('../src/net/public-url-read.js');
it('does not silently discard networkPolicy on a local read', async () => {
  const r: any = await handleReadFile({ path: fileURLToPath(new URL('../package.json', import.meta.url)), options: { networkPolicy: 'public-only' } });
  expect(r.isError).toBe(true); expect(JSON.stringify(r)).toContain('PUBLIC_URL_MODE');
});
it('rejects an unknown network policy before unrestricted fetch', async () => {
  const fetch = vi.fn(async () => new Response('unrestricted')); vi.stubGlobal('fetch', fetch);
  const r: any = await handleReadFile({ path: 'https://example.org', isUrl: true, options: { networkPolicy: 'typo' } });
  expect(r.isError).toBe(true); expect(fetch).not.toHaveBeenCalled();
});
it('implements conservative normalized special-address admission', async () => {
  const mod = await import('../src/net/public-address.js').catch(() => null);
  expect(mod?.isPublicAddress).toBeTypeOf('function');
  for (const address of ['0.0.0.1','10.0.0.1','127.0.0.1','100.64.1.1','169.254.1.1','192.0.2.1','198.18.0.1','224.0.0.1','255.255.255.255','::1','::','fe80::1','fc00::1','2001:db8::1','3fff::1','2002::1','::ffff:127.0.0.1','64:ff9b::808:808']) expect(mod!.isPublicAddress(address)).toBe(false);
  for (const address of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','::ffff:8.8.8.8']) expect(mod!.isPublicAddress(address)).toBe(true);
});
function transportFixture(responses: Array<{ body?: string | Buffer; status?: number; headers?: Record<string,string>; peer?: string; stall?: boolean }> = [{}]) {
  const optionsSeen: any[] = [], sockets: any[] = [], responsesSeen: any[] = [];
  const request = vi.fn((secure: boolean, options: any, listener: (r:any)=>void) => {
    const setup = responses[Math.min(optionsSeen.length, responses.length-1)]; optionsSeen.push(options);
    const req: any = new EventEmitter(), socket: any = new EventEmitter();
    socket.remoteAddress = setup.peer ?? options.hostname; socket.authorized = true; socket.encrypted = secure;
    socket.destroy = vi.fn(); sockets.push(socket);
    req.destroy = vi.fn((error?: Error) => { socket.destroy(); if (error) queueMicrotask(()=>req.emit('error', error)); });
    req.end = vi.fn(() => {
      const res: any = new PassThrough(); res.statusCode = setup.status ?? 200;
      res.headers = { 'content-type':'text/plain', ...setup.headers }; res.rawHeaders = Object.entries(res.headers).flat();
      responsesSeen.push(res); listener(res); if (!setup.stall) res.end(setup.body ?? 'safe fixture');
    });
    queueMicrotask(() => { req.emit('socket', socket); socket.emit(secure ? 'secureConnect' : 'connect'); });
    return req;
  });
  const resolve = vi.fn(async () => [{address:'8.8.8.8',family:4}]);
  return { request, resolve, optionsSeen, sockets, responsesSeen };
}
it('rejects mixed DNS results before creating any socket', async () => {
  const m = await load(), f = transportFixture(); f.resolve.mockResolvedValue([{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]);
  await expect(m.createPublicUrlReader(f)('https://example.org')).rejects.toThrow(/ADDRESS/); expect(f.request).not.toHaveBeenCalled();
});
it('pins the validated IP with original Host and TLS identity; sends no secrets or retries', async () => {
  const m = await load(), f = transportFixture(); const r = await m.createPublicUrlReader(f)('https://example.org/path?private=value');
  expect(r.bytes.toString()).toBe('safe fixture'); expect(f.resolve).toHaveBeenCalledTimes(1); expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.optionsSeen[0]).toMatchObject({hostname:'8.8.8.8',servername:'example.org',agent:false,rejectUnauthorized:true,maxHeaderSize:16384,headers:{Host:'example.org','Accept-Encoding':'identity'}});
  expect(f.optionsSeen[0].headers.Authorization).toBeUndefined(); expect(f.optionsSeen[0].headers.Cookie).toBeUndefined();
  expect(r.finalUrl).not.toContain('private=value');
});
it('checks peer identity before request bytes can be sent', async () => {
  const m = await load(), f = transportFixture([{peer:'127.0.0.1'}]);
  await expect(m.createPublicUrlReader(f)('http://example.org')).rejects.toThrow(/PEER/); expect(f.responsesSeen).toHaveLength(0);
});
it.each(['http://127.1','http://0177.0.0.1','http://0x08080808','https://u:p@example.org','https://example.org:444','ftp://example.org','https://example.org\\evil','https://[fe80::1%25eth0]'])('refuses ambiguous or unsupported URL %s', async url => {
  const m = await load(), f = transportFixture(); await expect(m.createPublicUrlReader(f)(url)).rejects.toThrow(/PUBLIC_URL/); expect(f.request).not.toHaveBeenCalled();
});
it('revalidates relative and absolute redirect destinations and limits sends', async () => {
  const m = await load(), f = transportFixture([{status:302,headers:{location:'/next'}},{body:'next'}]);
  const r = await m.createPublicUrlReader(f)('https://example.org'); expect(r.redirects).toBe(1); expect(f.resolve).toHaveBeenCalledTimes(2);
  const bad = transportFixture([{status:302,headers:{location:'http://127.0.0.1'}}]);
  await expect(m.createPublicUrlReader(bad)('https://example.org')).rejects.toThrow(/ADDRESS/); expect(bad.request).toHaveBeenCalledTimes(1);
  const loop = transportFixture([{status:302,headers:{location:'/again'}}]);
  await expect(m.createPublicUrlReader(loop)('https://example.org')).rejects.toThrow(/REDIRECT/); expect(loop.request).toHaveBeenCalledTimes(6);
});
it.each([{headers:{'content-encoding':'gzip'}},{body:'x'.repeat(100)},{headers:{padding:'x'.repeat(16384)}},{status:302},{status:500}])('fails closed and closes response on unsupported response case %#', async setup => {
  const m = await load(), f = transportFixture([setup]); await expect(m.createPublicUrlReader(f)('https://example.org',{maxBytes:32})).rejects.toThrow(/PUBLIC_URL/);
  expect(f.request).toHaveBeenCalledTimes(1); expect(f.responsesSeen.every(s=>s.destroyed)).toBe(true);
});
it('bounds DNS wait and prevents late completion from opening a socket', async () => {
  const m = await load(), f = transportFixture(); let release!: (v:any)=>void; f.resolve.mockImplementation(()=>new Promise(r=>{release=r;}));
  await expect(m.createPublicUrlReader({...f,timeoutMs:30})('https://example.org')).rejects.toThrow(/DEADLINE/);
  release([{address:'8.8.8.8',family:4}]); await new Promise(r=>setTimeout(r,10)); expect(f.request).not.toHaveBeenCalled();
});
it('deadline also covers a stalled response body', async () => {
  const m = await load(), f = transportFixture([{stall:true}]);
  await expect(m.createPublicUrlReader({...f,timeoutMs:30})('https://example.org')).rejects.toThrow(/DEADLINE/); expect(f.responsesSeen[0].destroyed).toBe(true);
});
it('rejects noncanonical public-IP redirect authorities before normalization', async () => {
  const m = await load(), f = transportFixture([{status:302,headers:{location:'http://0x08080808/next'}},{body:'bad'}]);
  await expect(m.createPublicUrlReader(f)('https://example.org')).rejects.toThrow(/REDIRECT|AMBIGUOUS/);
  expect(f.request).toHaveBeenCalledTimes(1);
});
it('honors caller cancellation without opening late sockets', async () => {
  const m = await load(), f = transportFixture(), controller = new AbortController(); controller.abort();
  await expect(m.createPublicUrlReader(f)('https://example.org',{signal:controller.signal})).rejects.toThrow(/ABORTED/);
  expect(f.request).not.toHaveBeenCalled(); expect(f.resolve).not.toHaveBeenCalled();
});
it('actual handler consumes the pinned connector and refuses loopback before connect', async () => {
  const f = transportFixture(); const spy = vi.spyOn(http,'request').mockImplementation(((options:any,cb:any)=>f.request(false,options,cb)) as any);
  const forbiddenFetch = vi.fn(); vi.stubGlobal('fetch',forbiddenFetch);
  const result:any = await handleReadFile({path:'http://8.8.8.8/test?private=do-not-display',isUrl:true,options:{networkPolicy:'public-only'}});
  expect(result.isError).not.toBe(true); expect(JSON.stringify(result)).toContain('safe fixture');
  expect(JSON.stringify(result)).toContain('networkPolicy=public-only'); expect(JSON.stringify(result)).not.toContain('do-not-display');
  const denied:any = await handleReadFile({path:'http://127.0.0.1/',isUrl:true,options:{networkPolicy:'public-only'}});
  expect(denied.isError).toBe(true); expect(spy).toHaveBeenCalledTimes(1); expect(forbiddenFetch).not.toHaveBeenCalled();
});
it('keeps ordinary URL fetch unchanged and rejects unsupported auto restricted projection', async () => {
  const fetch = vi.fn(async()=>new Response('ordinary-local')); vi.stubGlobal('fetch',fetch);
  const ordinary:any=await handleReadFile({path:'http://127.0.0.1/example',isUrl:true});
  expect(ordinary.isError).not.toBe(true); expect(JSON.stringify(ordinary)).toContain('ordinary-local');
  for (const projection of ['auto']) {
    const result:any=await handleReadFile({path:'http://8.8.8.8/',isUrl:true,options:{networkPolicy:'public-only',projection}});
    expect(result.isError).toBe(true);
  }
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('parses an actual PDF snapshot exactly once without any second unrestricted URL fetch',async()=>{
  const {PDFDocument}=await import('pdf-lib'),pdf=await import('../src/rdc/tools/pdf/lib/pdf2md.js');
  const doc=await PDFDocument.create();doc.addPage([180,90]).drawText('Pinned PDF fixture',{x:5,y:30,size:10});
  const bytes=Buffer.from(await doc.save()),f=transportFixture([{body:bytes,headers:{'content-type':'application/pdf'}}]);
  const request=vi.spyOn(http,'request').mockImplementation(((options:any,cb:any)=>f.request(false,options,cb)) as any);
  const byteParser=vi.spyOn(pdf,'pdf2md'),urlParser=vi.spyOn(await import('../src/rdc/tools/pdf/index.js'),'parsePdfToMarkdown');
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const r:any=await handleReadFile({path:'http://8.8.8.8/document.pdf?secret=hidden',isUrl:true,options:{networkPolicy:'public-only'}});
  expect(r.isError).not.toBe(true);expect(JSON.stringify(r)).toContain('Pinned PDF fixture');
  expect(byteParser).toHaveBeenCalledTimes(1);expect(urlParser).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(1);expect(JSON.stringify(r)).not.toContain('secret=hidden');
},20000);
it('keeps certificate hostname checks on the original host and rejects unsupported content',async()=>{
  const m=await load(),f=transportFixture();await m.createPublicUrlReader(f)('https://example.org');
  const verify=f.optionsSeen[0].checkServerIdentity;
  expect(verify('8.8.8.8',{subjectaltname:'DNS:example.org'})).toBeUndefined();
  expect(verify('8.8.8.8',{subjectaltname:'DNS:attacker.example'})).toBeInstanceOf(Error);
  const bad=transportFixture([{headers:{'content-type':'application/zip'}}]);
  await expect(m.createPublicUrlReader(bad)('https://example.org')).rejects.toThrow('PUBLIC_URL_CONTENT_TYPE');
  expect(bad.responsesSeen[0].destroyed).toBe(true);
});

it('returns public PDF markdown as text-only page projection in the real file handler', async () => {
  const {PDFDocument}=await import('pdf-lib');
  const doc=await PDFDocument.create();doc.addPage([180,90]).drawText('Markdown snapshot',{x:5,y:30,size:10});
  const f=transportFixture([{body:Buffer.from(await doc.save()),headers:{'content-type':'application/pdf'}}]);
  vi.spyOn(http,'request').mockImplementation(((options:any,cb:any)=>f.request(false,options,cb)) as any);
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  const result:any=await handleReadFile({path:'http://8.8.8.8/document.pdf?secret=hidden',isUrl:true,options:{networkPolicy:'public-only',projection:'markdown'}});
  expect(result.isError).not.toBe(true);
  expect(result.content.every((part:any)=>part.type==='text')).toBe(true);
  expect(JSON.stringify(result)).toContain('## Page 1');expect(JSON.stringify(result)).toContain('Markdown snapshot');
  expect(JSON.stringify(result)).not.toContain('secret=hidden');expect(fetch).not.toHaveBeenCalled();
  expect(f.request).toHaveBeenCalledTimes(1);
},20000);
