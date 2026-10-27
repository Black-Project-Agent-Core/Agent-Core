import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/** The shipped bootstrap is product text, never a copy of a user's canonical memory. */
export const PACKAGED_FOUNDATION = '# Agent Core Foundational Memory\n\nRead AGENTS.md and canonical local memory before machine work. Exact current source and observed runtime evidence outrank documentation. Keep Memory, Learning, Code Intelligence and machine control as sibling capabilities. Record only verified durable facts.\n';
export const PACKAGED_CAPABILITY_SEEDS = Object.freeze([
  'agent-core-capability-index',
  'mind-control',
  'performance-oriented-software-engineering',
  'reverse-engineer-anything',
]);
export function isPackagePathAllowed(relative) {
  const rel = relative.replaceAll('\\', '/').toLowerCase();
  const segments = rel.split('/');
  if (segments.some(part => ['.git','.desktop-commander','.rdc-standalone','do not touch without instruction explicit'].includes(part))) return false;
  if (segments.some(part => part === '.env' || (part.startsWith('.env.') && part !== '.env.example'))) return false;
  if (rel === 'bundled-skills' || rel.startsWith('bundled-skills/')) return false;
  // Respect the original Skill home; copy maintained source only, never a live catalog or state.
  if (rel.startsWith('runtime/skills/') && rel !== 'runtime/skills/readme.md'
    && rel !== 'runtime/skills/capability-packs' && !rel.startsWith('runtime/skills/capability-packs/')) return false;
  // Memory v1/v2, candidate/restore roots, activation markers and migration temp are private operational state.
  if (/^(?:secrets|runtime\/(?:memory(?:-[^/]*)?|memory-v2-activation\.json|tmp|bridge-auth|tracker|webview2|backups|partner|learning|phone|rdc))(?:\/|$)/.test(rel)) return false;
  return true;
}
export async function packageCopyAllowed(root, source) {
  const rel = path.relative(root, source);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !isPackagePathAllowed(rel)) return false;
  return !(await fs.lstat(source)).isSymbolicLink();
}
export async function writePackagedFoundation(packageRoot) {
  const dir = path.join(packageRoot,'runtime','memory');
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'00-agent-core-memory.md'),PACKAGED_FOUNDATION,{encoding:'utf8',flag:'wx'});
}

/** Fresh stable installs use explicit offline activation, never a pre-created store. */
export async function writePackagedSetup(packageRoot) {
  await fs.mkdir(packageRoot,{recursive:true});
  await fs.writeFile(path.join(packageRoot,'MEMORY-BOOTSTRAP.md'),PACKAGED_FOUNDATION,{encoding:'utf8',flag:'wx'});
}

/** The release source snapshot has its own lifecycle, not a second authoring home. */
export async function finalizePackagedStructure(packageRoot) {
  const { synchronizeProjectStructure } = await import('../portability/project-structure.mjs');
  const mapFile = path.join(packageRoot, 'docs', 'PROJECT-STRUCTURE.md');
  let text = await fs.readFile(mapFile, 'utf8');
  if (await fs.stat(path.join(packageRoot, 'source')).then(info => info.isDirectory(), error => {
    if (error.code === 'ENOENT') return false; throw error;
  })) {
    const pattern = /(<!-- DIRECTORY-POLICY:START -->\s*```json\s*\n)([\s\S]*?)(\n```\s*<!-- DIRECTORY-POLICY:END -->)/;
    const match = pattern.exec(text);
    if (!match) throw new Error('PACKAGED_STRUCTURE_POLICY_MISSING');
    const policy = JSON.parse(match[2]);
    if (!policy.owners.some(owner => owner.path === 'source'))
      policy.owners.push({ purpose: 'packaged-source-snapshot', path: 'source' });
    text = text.replace(pattern, (_all, prefix, _json, suffix) => prefix + JSON.stringify(policy, null, 2) + suffix);
    await fs.writeFile(mapFile, text);
  }
  return synchronizeProjectStructure(packageRoot);
}

/** Reject ordinary source/HEAD drift; binary dependencies have separate integrity manifests. */
export async function assertReleaseSource(root, expectedCommit) {
  const git=async args=>(await promisify(execFile)('git',['-C',root,...args],
    {encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:2*1024*1024})).stdout.trim();
  const commit=await git(['rev-parse','HEAD']);
  if(expectedCommit&&commit!==expectedCommit)throw new Error('RELEASE_SOURCE_HEAD_CHANGED');
  const dirty=await git(['status','--porcelain','--untracked-files=all','--',
    'package.json','package-lock.json','.gitignore','AGENTS.md','README.md','SECURITY.md','THIRD_PARTY_NOTICES.md','CHANGELOG.md',
    'CONTRIBUTING.md','SUPPORT.md','.env.example','.grafelignore','Maintenance.md','Restart-Agent-Core.cmd','tsconfig.json','vitest.config.ts','tunnel-client/agent-core.example.yaml',
    'src','scripts','assets','vendor','runtime/skills/capability-packs','runtime/skills/README.md','extensions/agent-core-open-browser-use','docs','subagents','.changeset']);
  if(dirty)throw new Error('RELEASE_SOURCE_NOT_COMMITTED: commit the reviewed package inputs before packaging');
  return commit;
}

/** Static external-controller support only; never copy browser connections or profiles. */
export async function stageExternalReleaseSupport(root, packageRoot) {
  const copy=async relative=>{
    const source=path.join(root,relative),destination=path.join(packageRoot,relative);
    if(!await packageCopyAllowed(root,source))throw new Error('Release support path refused: '+relative);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.cp(source,destination,{recursive:true,filter:source=>packageCopyAllowed(root,source)});
  };
  for(const relative of ['README.md','Restart-Agent-Core.cmd','THIRD_PARTY_NOTICES.md','docs/proposals/README.md',
    'docs/proposals/REVIEW-GUIDE.md','docs/history-agent-core/Panduan-Arsip-Proposal-Selesai.md','subagents',
    'scripts/external/native-chat-bridge.mjs'])await copy(relative);
  for(const relative of ['docs/README.md','docs/CODEBASE.md','docs/PROJECT-STRUCTURE.md','docs/PATH-GOVERNANCE.md','docs/releases','docs/Browser-Control.md','docs/Open-Browser-Use.md','docs/Conversation-Reading.md',
    'docs/Agent-Core-Product-Direction.md','docs/External-Learning-Priorities-20261019.md','docs/External-Engineering-Skills.md','.changeset/README.md','CONTRIBUTING.md','SUPPORT.md']){
    try{await fs.access(path.join(root,relative));}catch(error){if(error.code==='ENOENT')continue;throw error;}
    await copy(relative);
  }
  const relative='runtime/browser-control/open-browser-use/win32-x64';
  const manifestFile=path.join(root,relative,'build.json');
  if(!await packageCopyAllowed(root,manifestFile)||(await fs.stat(manifestFile)).size>16384)throw new Error('Browser transport manifest integrity refused');
  const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
  if(manifest.version!==1||manifest.target!=='win32-x64'||!/^transport-[0-9a-f]{16}\.exe$/.test(manifest.binary??'')
    ||!/^[0-9a-f]{64}$/.test(manifest.binarySha256??'')||!/^[0-9a-f]{64}$/.test(manifest.sourceSha256??''))throw new Error('Browser transport manifest integrity refused');
  const sourceRelative='src/rdc/browser-control/open-browser-use-stdio.go';
  if(!await packageCopyAllowed(root,path.join(root,sourceRelative)))throw new Error('Browser transport source integrity refused');
  if(createHash('sha256').update(await fs.readFile(path.join(root,sourceRelative))).digest('hex')!==manifest.sourceSha256)
    throw new Error('Browser transport source integrity mismatch');
  const binary=path.join(root,relative,manifest.binary);
  if(!await packageCopyAllowed(root,binary)||!(await fs.stat(binary)).isFile())throw new Error('Browser transport binary integrity refused');
  const hash=createHash('sha256');for await(const chunk of createReadStream(binary))hash.update(chunk);
  if(hash.digest('hex')!==manifest.binarySha256)throw new Error('Browser transport binary integrity mismatch');
  await copy(relative+'/build.json');await copy(relative+'/'+manifest.binary);await copy(sourceRelative);
}
