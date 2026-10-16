// Synthetic process fault injection only. No production fault switches.
import fs from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {isEpisodeManifestPath} from './memory-ingestion-paths.mjs';
const [root,boundary,encoded,scopeEncoded]=process.argv.slice(2);
const {MemoryService}=await import('../../../../dist/memory/facade.js');
const session=(await MemoryService.initialize(root,root)).controller(JSON.parse(Buffer.from(scopeEncoded,'base64url').toString()));
const pause=async point=>{process.stdout.write(JSON.stringify({boundary:point})+'\n');setInterval(()=>{},1000);await new Promise(()=>{});};
const rename=fs.rename;
fs.rename=async(from,to)=>{await rename(from,to);if(String(to).endsWith('journal.json')){const journal=JSON.parse(await fs.readFile(to,'utf8'));if(journal.phase===boundary)await pause(boundary);}if(boundary==='episode'&&isEpisodeManifestPath(to))await pause('episode');};
syncBuiltinESMExports();
const result=await session.appendEvent(JSON.parse(Buffer.from(encoded,'base64url').toString()));
if(boundary==='response')await pause('response');
process.stdout.write(JSON.stringify({result})+'\n');
