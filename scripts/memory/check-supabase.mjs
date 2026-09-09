import { fileURLToPath } from 'node:url';
import { loadRuntimeConfig } from '../../dist/config.js';
import { SupabaseDirectError, SupabaseDirectHttpTransport } from '../../dist/memory/file-native/supabase-direct.js';

// Read-only RPC health check. No memory content or credentials are printed.
try {
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const config=loadRuntimeConfig(process.env,root).memory.supabaseDirect;
  if(!config.enabled){
    console.log(JSON.stringify({enabled:false,healthy:false,code:'MEMORY_SUPABASE_DIRECT_DISABLED',next:'Fill the three direct Supabase settings in .env after applying the SQL migration.'},null,2));
    process.exitCode=2;
  }else{
    const reply=await new SupabaseDirectHttpTransport(config).call('health',{});
    if(reply?.schemaVersion!==1)throw new SupabaseDirectError('MEMORY_SUPABASE_SCHEMA_INVALID');
    console.log(JSON.stringify({enabled:true,healthy:true,schemaVersion:reply.schemaVersion,checkedAt:new Date().toISOString()},null,2));
  }
}catch(error){
  const code=error instanceof SupabaseDirectError?error.code:'MEMORY_SUPABASE_CONFIG_OR_CHECK_FAILED';
  console.error(JSON.stringify({healthy:false,code},null,2));process.exitCode=1;
}
