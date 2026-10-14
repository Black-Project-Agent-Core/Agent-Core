import net from 'node:net';
import path from 'node:path';
import {resolveModuleProjectRoot,resolvePortableProjectPath} from '../../dist/portability/paths.js';
import {activateCanonicalMemory} from '../../dist/memory/host-activation.js';
import {MEMORY_ROOT_RELATIVE} from '../../dist/memory/host-runtime.js';

const args=process.argv.slice(2);
if(args.includes('--help')) {
 console.log('Usage: node scripts/memory/activate-canonical.mjs --fresh|--relocate-historical [--dry-run]\nStop Agent Core and all other Memory writers first. Fresh activation requires both roots absent. Relocation preserves the verified legacy root under backups; interrupted operations remain blocked for inspection.');
} else {
 if(args.some(arg=>!['--fresh','--relocate-historical','--dry-run'].includes(arg))
   ||args.filter(arg=>arg==='--fresh'||arg==='--relocate-historical').length!==1)throw Error('SELECT_EXACTLY_ONE_ACTIVATION_OPERATION');
 const root=resolveModuleProjectRoot(import.meta.url);
 try {process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const canonical=path.join(root,MEMORY_ROOT_RELATIVE);
 if(resolvePortableProjectPath(root,process.env.AGENT_CORE_MEMORY_DIR,MEMORY_ROOT_RELATIVE)!==canonical)throw Error('CONFIGURED_ROOT_CONFLICT');
 const port=Number(process.env.AGENT_CORE_PORT||8765);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_LOCAL_PORT');
 if(!args.includes('--dry-run')) {
  const host=process.env.AGENT_CORE_HOST?.trim()||'127.0.0.1';
  const open=await new Promise((resolve,reject)=>{
   const socket=net.createConnection({host:host==='0.0.0.0'?'127.0.0.1':host==='::'?'::1':host,port});
   socket.once('connect',()=>{socket.destroy();resolve(true);});
   socket.once('error',error=>{socket.destroy();if(error.code==='ECONNREFUSED')resolve(false);else reject(error);});
   socket.setTimeout(1500,()=>{socket.destroy();reject(Error('MEMORY_WRITER_STATUS_UNKNOWN'));});
  });
  if(open)throw Error('STOP_AGENT_CORE_BEFORE_MEMORY_ACTIVATION');
 }
 const result=await activateCanonicalMemory(root,{operation:args.includes('--fresh')?'fresh':'relocate',dryRun:args.includes('--dry-run')});
 console.log(JSON.stringify({...result,manualRestartRequired:!result.dryRun}));
}
