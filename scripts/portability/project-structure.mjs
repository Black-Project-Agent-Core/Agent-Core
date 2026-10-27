import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(script), '..', '..');
// Source-first for engineering; packaged installs use the same compiled owner.
const source = path.join(projectRoot, 'src/portability/project-structure.ts');
const implementation = existsSync(source) ? source : path.join(projectRoot, 'dist/portability/project-structure.js');
const owner = await import(pathToFileURL(implementation).href);
export const inspectProjectStructure = owner.inspectProjectStructure;
export const synchronizeProjectStructure = owner.synchronizeProjectStructure;
export const PARALLEL_SKILL_HOMES = owner.PARALLEL_SKILL_HOMES;

if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  let root = projectRoot, update = false;
  for (let index = 2; index < process.argv.length; index++) {
    const arg = process.argv[index];
    if (arg === '--root' && process.argv[index + 1]) root = path.resolve(process.argv[++index]);
    else if (arg === '--write') update = true;
    else throw new Error('Unknown project-structure option: ' + arg);
  }
  if (update) console.log('PROJECT STRUCTURE SYNC ' + JSON.stringify(await synchronizeProjectStructure(root)));
  else {
    const result = await inspectProjectStructure(root);
    console.log('PROJECT STRUCTURE ' + (result.issues.length ? 'FAIL' : 'PASS') + ' — ' + result.directoryCount + ' directories');
    for (const issue of result.issues) console.error('  - ' + issue);
    if (result.issues.length) process.exitCode = 1;
  }
}
