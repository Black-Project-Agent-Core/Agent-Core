import { requestPrereleaseExit } from "./prerelease-lib.mjs";
import path from "node:path";
import { ROOT, readJson } from "./release-lib.mjs";

const args=process.argv.slice(2);
if(args.includes('--help')){console.log('Usage: release:pre-exit [--from-source] — explicitly authorize stable promotion; --from-source requires source-only prerelease metadata with no channel state');process.exit(0);}
if(args.some(arg=>arg!=='--from-source')||args.length>1)throw new Error('Unknown release:pre-exit argument');
const state = await requestPrereleaseExit(args.includes('--from-source')
  ?{sourceVersion:String((await readJson(path.join(ROOT,'package.json'))).version)}:{});
console.log(JSON.stringify(state, null, 2));
