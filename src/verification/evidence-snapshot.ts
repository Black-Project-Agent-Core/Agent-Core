// Native bounded text snapshots for the explicit CORAL-P1 evidence verifier.
import { createHash } from 'node:crypto';
import { lstat, realpath, open, unlink } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import path from 'node:path';
import { openRegularFile } from '../rdc/utils/files/safe-regular-file.js';
import { assertSameFileIdentity, stableFileIdentity } from '../security/file-identity.js';

export const EVIDENCE_DOCUMENT_MAX = 2 * 1024 * 1024;
export const EVIDENCE_TOTAL_MAX = 32 * 1024 * 1024;
export const EVIDENCE_REPORT_MAX = 1024 * 1024;
export const evidenceDigest = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
export const evidencePathKey = (file: string) => process.platform === 'win32' ? file.toLowerCase() : file;
export const evidenceError = (code: string) => new Error('EVIDENCE_' + code);
export interface EvidenceFileIdentity {
  dev: string; ino: string; bytes: number; mtimeNs: string; ctimeNs: string; birthtimeNs: string;
}
export function evidenceIdentity(s: BigIntStats): EvidenceFileIdentity {
  if (!stableFileIdentity(s) || s.size > BigInt(Number.MAX_SAFE_INTEGER)) throw evidenceError('IDENTITY_UNAVAILABLE');
  return {dev:String(s.dev),ino:String(s.ino),bytes:Number(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs),birthtimeNs:String(s.birthtimeNs)};
}
export function sameEvidenceIdentity(a: EvidenceFileIdentity, b: EvidenceFileIdentity): boolean {
  return a.dev===b.dev && a.ino===b.ino && a.bytes===b.bytes && a.mtimeNs===b.mtimeNs && a.ctimeNs===b.ctimeNs && a.birthtimeNs===b.birthtimeNs;
}
/** Reject reparse/alias ancestors as well as the leaf before following any file. */
export async function assertEvidenceLocalPath(file: string): Promise<void> {
  if (!path.isAbsolute(file) || file.startsWith('\\\\') || file.startsWith('//') || file.includes('\0')) throw evidenceError('LOCAL_PATH_REQUIRED');
  const absolute=path.resolve(file), root=path.parse(absolute).root;
  let current=root;
  const parts=absolute.slice(root.length).split(path.sep).filter(Boolean);
  for(let i=0;i<parts.length;i++) {
    const part=parts[i];
    if(part.includes(':') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw evidenceError('PATH_INVALID');
    current=path.join(current,part);const s=await lstat(current);
    if(s.isSymbolicLink()) throw evidenceError('LINK_REFUSED');
    if(i<parts.length-1 && !s.isDirectory()) throw evidenceError('PATH_INVALID');
  }
  if(evidencePathKey(await realpath(absolute))!==evidencePathKey(absolute)) throw evidenceError('PATH_ALIAS_REFUSED');
}
export async function evidenceDirectoryIdentity(directory: string): Promise<EvidenceFileIdentity> {
  await assertEvidenceLocalPath(directory);const s=await lstat(directory,{bigint:true});
  if(!s.isDirectory()) throw evidenceError('ROOT_NOT_DIRECTORY');return evidenceIdentity(s);
}
export interface EvidenceSnapshot { bytes: Buffer; digest: string; identity: EvidenceFileIdentity; text: string }
export async function readEvidenceSnapshot(file: string, maxBytes=EVIDENCE_DOCUMENT_MAX): Promise<EvidenceSnapshot> {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>EVIDENCE_DOCUMENT_MAX) throw evidenceError('INPUT_LIMIT');
  await assertEvidenceLocalPath(file);const before=await lstat(file,{bigint:true});
  if(!before.isFile()) throw evidenceError('REGULAR_FILE_REQUIRED');
  if(before.size>BigInt(maxBytes)) throw evidenceError('INPUT_LIMIT');
  const opened=await openRegularFile(file,{followSymlinks:false}).catch((e:unknown)=>{
    if((e as NodeJS.ErrnoException).code==='ENOENT')throw evidenceError('INPUT_CHANGED');
    throw e;
  });
  try {
    const start=await opened.handle.stat({bigint:true});assertSameFileIdentity(before,start,'evidence snapshot');
    if(!sameEvidenceIdentity(evidenceIdentity(before),evidenceIdentity(start))) throw evidenceError('INPUT_CHANGED');
    const chunks:Buffer[]=[];let total=0;
    for(;;) {
      const buffer=Buffer.allocUnsafe(Math.min(65536,maxBytes-total+1));
      const {bytesRead}=await opened.handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;
      total+=bytesRead;if(total>maxBytes)throw evidenceError('INPUT_LIMIT');chunks.push(buffer.subarray(0,bytesRead));
    }
    const after=await opened.handle.stat({bigint:true}),current=await lstat(file,{bigint:true});
    const identity=evidenceIdentity(start);
    if(!sameEvidenceIdentity(identity,evidenceIdentity(after))||!sameEvidenceIdentity(identity,evidenceIdentity(current))||current.isSymbolicLink()||total!==identity.bytes) throw evidenceError('INPUT_CHANGED');
    await assertEvidenceLocalPath(file);
    const bytes=Buffer.concat(chunks,total);let text:string;
    try {text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);} catch {throw evidenceError('UTF8_REQUIRED');}
    if(text.includes('\0'))throw evidenceError('TEXT_REQUIRED');
    return {bytes,text,digest:evidenceDigest(bytes),identity};
  } catch(e) {
    if((e as NodeJS.ErrnoException).code==='ENOENT')throw evidenceError('INPUT_CHANGED');
    throw e;
  } finally {await opened.close();}
}
export async function revalidateEvidenceSnapshot(file: string, identity: EvidenceFileIdentity, digest: string): Promise<void> {
  await assertEvidenceLocalPath(file);const s=await lstat(file,{bigint:true});
  if(!s.isFile()||!sameEvidenceIdentity(identity,evidenceIdentity(s)))throw evidenceError('INPUT_CHANGED');
  // Coarse filesystem timestamps can retain identical values for same-size writes.
  // The frozen initial snapshot remains the line-check source; reread only to validate its digest.
  const current=await readEvidenceSnapshot(file,EVIDENCE_DOCUMENT_MAX);
  if(!sameEvidenceIdentity(identity,current.identity)||current.digest!==digest)throw evidenceError('INPUT_CHANGED');
}
/** Exclusive output, never an overwrite; cleanup is limited to the file we created. */
export async function writeEvidenceReport(file: string, bytes: Buffer, validateInputs: () => Promise<void>): Promise<void> {
  if(bytes.length>EVIDENCE_REPORT_MAX)throw evidenceError('REPORT_LIMIT');
  file=path.resolve(file);const parent=path.dirname(file);
  await assertEvidenceLocalPath(parent);await validateInputs();
  const handle=await open(file,'wx+',0o600);let owned:EvidenceFileIdentity|undefined;
  try {
    const first=await handle.stat({bigint:true});if(!first.isFile())throw evidenceError('OUTPUT_NOT_REGULAR');owned=evidenceIdentity(first);
    await handle.writeFile(bytes);await handle.sync();
    const after=await handle.stat({bigint:true});assertSameFileIdentity(first,after,'evidence report');
    if(after.size!==BigInt(bytes.length))throw evidenceError('OUTPUT_READBACK');
    const readback=Buffer.alloc(bytes.length);let at=0;
    while(at<readback.length){const {bytesRead}=await handle.read(readback,at,readback.length-at,at);if(!bytesRead)throw evidenceError('OUTPUT_READBACK');at+=bytesRead;}
    if(evidenceDigest(readback)!==evidenceDigest(bytes))throw evidenceError('OUTPUT_READBACK');
    await assertEvidenceLocalPath(file);const current=await lstat(file,{bigint:true});assertSameFileIdentity(after,current,'evidence report');
    if(!sameEvidenceIdentity(evidenceIdentity(after),evidenceIdentity(current)))throw evidenceError('OUTPUT_CHANGED');
    await validateInputs();
  } catch(error) {
    await handle.close();
    if(owned) {
      const now=await lstat(file,{bigint:true}).catch(()=>null);
      if(now&&!now.isSymbolicLink()&&String(now.dev)===owned.dev&&String(now.ino)===owned.ino)await unlink(file).catch(()=>undefined);
    }
    throw error;
  } finally {await handle.close().catch(()=>undefined);}
}
