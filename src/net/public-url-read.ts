// AGiXT resolve-and-pin principle, independently implemented for a strict opt-in native lane.
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity, type TLSSocket } from 'node:tls';
import { isPublicAddress, normalizeAddress, sameAddress } from './public-address.js';
const MAX_BYTES = 10 * 1024 * 1024, MAX_HEADERS = 16 * 1024, DEADLINE_MS = 30_000;
const REDIRECTS = new Set([301,302,303,307,308]);
export interface PublicUrlBytes { bytes: Buffer; contentType: string; finalUrl: string; redirects: number }
export interface PublicReadOptions { signal?: AbortSignal; maxBytes?: number }
interface Address { address: string; family: number }
export interface PublicReadDependencies {
  resolve?: (host: string) => Promise<Address[]>;
  request?: (secure: boolean, options: https.RequestOptions, listener: (response: http.IncomingMessage)=>void) => http.ClientRequest;
  timeoutMs?: number;
}
const error = (code: string) => new Error('PUBLIC_URL_'+code);
const abortError = (signal: AbortSignal) => error(signal.reason?.message === 'PUBLIC_URL_DEADLINE' ? 'DEADLINE' : 'ABORTED');
function assertLive(signal: AbortSignal): void { if (signal.aborted) throw abortError(signal); }
function admittedUrl(raw: string): URL {
  if (typeof raw !== 'string' || raw.length>4096 || /[\u0000-\u0020\u007f\\]/.test(raw)) throw error('INVALID');
  let url: URL; try { url = new URL(raw); } catch { throw error('INVALID'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw error('INVALID');
  const match = /^https?:\/\/(\[[^\]]+\]|[^/?#:]+)(?::([0-9]+))?(?:[/?#]|$)/i.exec(raw);
  if (!match || match[1].includes('%') || match[1].includes('@')) throw error('INVALID');
  if (match[2] && match[2] !== (url.protocol==='https:' ? '443':'80')) throw error('PORT');
  const host = url.hostname.replace(/^\[|\]$/g,'');
  if (isIP(host) === 4 && host !== match[1]) throw error('AMBIGUOUS_HOST');
  if (!isIP(host) && (host.length>253 || !host.includes('.') || host.split('.').some(label=>
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))) throw error('HOST');
  url.hash = ''; return url;
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  assertLive(signal);
  return new Promise((resolve,reject)=>{
    const abort = ()=>reject(abortError(signal)); signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
export function publicContentKind(contentType: string): 'text' | 'image' | 'pdf' {
  const mime = contentType.split(';',1)[0].trim().toLowerCase();
  if (['image/png','image/jpeg','image/gif','image/webp'].includes(mime)) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (['text/plain','text/html','text/csv','text/markdown','text/xml','application/xml','application/json'].includes(mime)
    || /^application\/[a-z0-9.+-]+\+json$/.test(mime)) return 'text';
  throw error('CONTENT_TYPE');
}
interface Hop { bytes: Buffer; contentType: string; location?: string }
function requestHop(url: URL, address: Address, maxBytes: number, signal: AbortSignal,
  send: NonNullable<PublicReadDependencies['request']>): Promise<Hop> {
  assertLive(signal);
  return new Promise((resolve,reject)=>{
    let req: http.ClientRequest | undefined, response: http.IncomingMessage | undefined;
    let settled = false, sent = false;
    const cleanup = () => { signal.removeEventListener('abort',abort); response?.destroy(); req?.destroy(); };
    const fail = (reason: Error) => { if (settled) return; settled=true; cleanup(); reject(reason); };
    const done = (value: Hop) => { if (settled) return; settled=true; cleanup(); resolve(value); };
    const abort = () => fail(abortError(signal));
    signal.addEventListener('abort',abort,{once:true});
    const secure = url.protocol==='https:', host = url.hostname.replace(/^\[|\]$/g,'');
    try {
      req = send(secure, {
        protocol:url.protocol, hostname:address.address, family:address.family, port:secure?443:80,
        method:'GET', path:url.pathname+url.search, agent:false, maxHeaderSize:MAX_HEADERS,
        rejectUnauthorized:true, servername:isIP(host)?'':host,
        lookup:(_name,_options,callback)=>callback(error('UNEXPECTED_DNS_LOOKUP'),'',0),
        checkServerIdentity:(_hostname,cert)=>checkServerIdentity(host,cert),
        headers:{Host:url.host,'Accept-Encoding':'identity',Connection:'close'},
      }, res => {
        response=res;
        void (async () => {
          assertLive(signal); if (settled || !sent) throw error('PEER');
          if (Buffer.byteLength(res.rawHeaders.join('\r\n'))>MAX_HEADERS) throw error('HEADER_LIMIT');
          const status=res.statusCode ?? 0;
          if (REDIRECTS.has(status)) {
            const location=res.headers.location;
            if (!location || location.length>4096) throw error('REDIRECT_LOCATION');
            done({bytes:Buffer.alloc(0),contentType:'',location}); return;
          }
          if (status<200 || status>=300) throw error('HTTP_STATUS');
          if (res.headers['content-encoding'] && res.headers['content-encoding']!=='identity') throw error('ENCODING');
          const contentType=res.headers['content-type'] ?? 'text/plain';
          if (contentType.length>256) throw error('CONTENT_TYPE'); publicContentKind(contentType);
          const length=res.headers['content-length'];
          if (length!==undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length)>maxBytes)) throw error('LENGTH');
          const parts: Buffer[]=[]; let total=0;
          for await (const raw of res) {
            assertLive(signal); const part=Buffer.from(raw); total+=part.length;
            if (total>maxBytes) throw error('BODY_LIMIT'); parts.push(part);
          }
          assertLive(signal);
          if (length!==undefined && Number(length)!==total) throw error('LENGTH');
          done({bytes:Buffer.concat(parts,total),contentType});
        })().catch(reason=>fail(reason instanceof Error && /^PUBLIC_URL_[A-Z_]+$/.test(reason.message) ? reason:error('RESPONSE')));
      });
      req.once('error',reason=>fail(signal.aborted?abortError(signal):error((reason as NodeJS.ErrnoException).code==='HPE_HEADER_OVERFLOW'?'HEADER_LIMIT':'NETWORK')));
      req.once('socket',socket=>{
        socket.once(secure?'secureConnect':'connect',()=>{
          if (settled) { socket.destroy(); return; }
          if (signal.aborted) { abort(); return; }
          if (!socket.remoteAddress || !sameAddress(socket.remoteAddress,address.address)) { fail(error('PEER')); return; }
          if (secure && !(socket as TLSSocket).authorized) { fail(error('TLS')); return; }
          sent=true; try { req!.end(); } catch { fail(error('NETWORK')); }
        });
      });
      if (signal.aborted) abort();
    } catch { fail(error('NETWORK')); }
  });
}
/** Dependency seams are code-only: not accepted from read_file/MCP arguments. */
export function createPublicUrlReader(deps: PublicReadDependencies = {}) {
  const resolve = deps.resolve ?? (host=>dns.lookup(host,{all:true,verbatim:true}));
  const send = deps.request ?? ((secure,options,listener)=>(secure?https:http).request(options,listener));
  const timeoutMs = Math.max(1,Math.min(DEADLINE_MS,deps.timeoutMs ?? DEADLINE_MS));
  return async (raw: string, options: PublicReadOptions = {}): Promise<PublicUrlBytes> => {
    const requested=options.maxBytes ?? MAX_BYTES;
    if (!Number.isSafeInteger(requested) || requested<1) throw error('BYTE_LIMIT');
    const maxBytes=Math.min(requested,MAX_BYTES), deadline=new AbortController();
    const timer=setTimeout(()=>deadline.abort(error('DEADLINE')),timeoutMs);
    const signal=options.signal?AbortSignal.any([options.signal,deadline.signal]):deadline.signal;
    try {
      let url=admittedUrl(raw);
      for (let redirects=0;redirects<=5;redirects++) {
        assertLive(signal); const host=url.hostname.replace(/^\[|\]$/g,'');
        const answers=isIP(host)?[{address:host,family:isIP(host)}]:await abortable(resolve(host),signal);
        assertLive(signal);
        if (!Array.isArray(answers) || !answers.length || answers.length>64) throw error('DNS');
        if (answers.some(a=>!a || isIP(a.address)!==a.family || !isPublicAddress(a.address))) throw error('ADDRESS');
        const selected=normalizeAddress(answers[0].address)!;
        const result=await requestHop(url,selected,maxBytes,signal,send);
        if (!result.location) return {bytes:result.bytes,contentType:result.contentType,finalUrl:url.origin+url.pathname,redirects};
        if (redirects===5) throw error('REDIRECT_LIMIT');
        if (/[\u0000-\u0020\u007f\\]/.test(result.location)) throw error('REDIRECT_LOCATION');
        try {
          const location = result.location;
          // Preserve raw authority until admission; WHATWG normalization can hide
          // hexadecimal/octal IPv4 spellings in absolute or scheme-relative redirects.
          url = /^[a-z][a-z0-9+.-]*:/i.test(location) ? admittedUrl(location)
            : location.startsWith('//') ? admittedUrl(url.protocol + location)
            : admittedUrl(new URL(location,url).href);
        } catch { throw error('REDIRECT_LOCATION'); }
      }
      throw error('REDIRECT_LIMIT');
    } catch (reason) {
      if (signal.aborted) throw abortError(signal);
      if (reason instanceof Error && /^PUBLIC_URL_[A-Z_]+$/.test(reason.message)) throw reason;
      throw error('NETWORK');
    } finally { clearTimeout(timer); }
  };
}
export const readPublicUrlBytes = (url: string, options?: PublicReadOptions) => createPublicUrlReader()(url,options);
