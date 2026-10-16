import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export const jsonBytes=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
export function parseArguments(required,optional=[]) {
  const values={};const allowed=new Set([...required,...optional]);
  for(let i=2;i<process.argv.length;i+=2){
    const key=process.argv[i],value=process.argv[i+1];
    if(!allowed.has(key)||!value||value.startsWith('--')||Object.hasOwn(values,key))throw new Error('INVALID_OR_DUPLICATE_ARGUMENT');
    values[key]=path.resolve(value);
  }
  if(required.some(key=>!values[key]))throw new Error('MISSING_REQUIRED_ARGUMENT');
  return values;
}
export async function readArtifact(file,max=8*1024*1024) {
  if(!Number.isSafeInteger(max)||max<1||max>8*1024*1024)throw new Error('INVALID_ARTIFACT_LIMIT');
  const {assertSameFileIdentity}=await import('../../../dist/security/file-identity.js');
  const pre=await fs.lstat(file,{bigint:true});
  if(!pre.isFile()||pre.isSymbolicLink()||pre.size>BigInt(max))throw new Error('INVALID_ARTIFACT_FILE');
  const handle=await fs.open(file,'r');
  try {
    const opened=await handle.stat({bigint:true});assertSameFileIdentity(pre,opened,'retrieval report input');
    const chunks=[];let total=0;
    for(;;){const buffer=Buffer.allocUnsafe(64*1024);const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;
      total+=bytesRead;if(total>max)throw new Error('ARTIFACT_TOO_LARGE');chunks.push(buffer.subarray(0,bytesRead));}
    const after=await handle.stat({bigint:true}),current=await fs.lstat(file,{bigint:true});
    assertSameFileIdentity(after,current,'retrieval report input');
    if(pre.size!==after.size||pre.mtimeNs!==after.mtimeNs||current.isSymbolicLink())throw new Error('INPUT_CHANGED_DURING_READ');
    return Buffer.concat(chunks,total);
  } finally {await handle.close();}
}
export async function writeExclusive(file,bytes) {
  const handle=await fs.open(file,'wx',0o600);
  try {await handle.writeFile(bytes);await handle.sync();} finally {await handle.close();}
}
export async function createReportDirectory(dir) {
  await fs.mkdir(path.dirname(dir),{recursive:true});
  await fs.mkdir(dir,{mode:0o700});
}
export function failure(error) {
  const message=error?.code||error?.message||'REPORT_FAILED';
  console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(message)?message:'REPORT_FAILED'}));
  process.exitCode=2;
}
