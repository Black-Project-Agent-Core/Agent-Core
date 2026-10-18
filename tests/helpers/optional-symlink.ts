import { lstat, symlink } from 'node:fs/promises';
import type { TestContext } from 'vitest';

/** Run the real assertion where supported; privilege limitations are explicit skips. */
export async function symlinkOrSkip(context: TestContext, ...args: Parameters<typeof symlink>) {
  try { await symlink(...args); }
  catch (error) {
    const code=(error as NodeJS.ErrnoException).code;
    let kindUnsupported=false;
    if(code==='EISDIR'&&process.platform==='win32'){
      const source=await lstat(args[0]);let destinationAbsent=false;
      try { await lstat(args[1]); } catch(probe) { destinationAbsent=(probe as NodeJS.ErrnoException).code==='ENOENT'; }
      kindUnsupported=destinationAbsent&&(args[2]==='file'?source.isFile():args[2]==='dir'&&source.isDirectory());
    }
    if(process.platform==='win32'&&(['EPERM','ENOTSUP','ENOSYS'].includes(code??'')||kindUnsupported))
      context.skip('Real symlink unavailable on this Windows filesystem/token: '+code);
    throw error;
  }
}
