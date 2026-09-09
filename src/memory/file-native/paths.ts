import { createHash } from 'node:crypto';
import path from 'node:path';

export interface FileNativeMemoryPaths {
  projectRoot: string;
  memoryRoot: string;
  vaultRoot: string;
  graphRoot: string;
  transactionRoot: string;
  syncRoot: string;
  toolsRoot: string;
  ripgrepRoot: string;
  pythonRoot: string;
  graphifyToolRoot: string;
}

export function resolveFileNativeMemoryPaths(projectRoot: string): FileNativeMemoryPaths {
  const root = path.resolve(projectRoot);
  const memoryRoot = path.join(root, 'runtime', 'memory');
  const toolsRoot = path.join(root, '.tools');
  return {
    projectRoot: root,
    memoryRoot,
    vaultRoot: path.join(memoryRoot, 'vault'),
    graphRoot: path.join(memoryRoot, 'graph'),
    transactionRoot: path.join(memoryRoot, 'transactions'),
    syncRoot: path.join(memoryRoot, 'sync'),
    toolsRoot,
    ripgrepRoot: path.join(toolsRoot, 'ripgrep'),
    pythonRoot: path.join(toolsRoot, 'python'),
    graphifyToolRoot: path.join(toolsRoot, 'graphify'),
  };
}

export function resolvePathInsideProject(projectRoot: string, value: string, variableName: string): string {
  const root = path.resolve(projectRoot);
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${variableName} must stay inside the Agent Core root`);
  }
  return resolved;
}



export const FILE_NATIVE_SELF_PROJECT_ID = 'agent-core://self';

function samePath(left:string,right:string):boolean {
  const a=path.resolve(left),b=path.resolve(right);
  return process.platform==='win32' ? a.toLowerCase()===b.toLowerCase() : a===b;
}

export function canonicalFileNativeProjectId(paths:Pick<FileNativeMemoryPaths,'projectRoot'>,projectId:string|undefined):string {
  const raw=projectId?.trim()??'';
  if(!raw)return '';
  if(raw===FILE_NATIVE_SELF_PROJECT_ID)return raw;
  if(!raw.includes('://')){
    try{if(samePath(paths.projectRoot,raw))return FILE_NATIVE_SELF_PROJECT_ID;}catch{}
  }
  return raw;
}

export function fileNativeProjectNamespace(projectId:string):string {
  if(projectId===FILE_NATIVE_SELF_PROJECT_ID)return 'self';
  if(!projectId)return 'global';
  return `p-${createHash('sha256').update(projectId,'utf8').digest('hex').slice(0,10)}`;
}

export function fileNativePrincipalNamespace(principalId: string): string {
  const raw = principalId.trim();
  if (!raw) return 'anonymous';
  return /^[A-Za-z0-9._-]{1,32}$/.test(raw) ? raw : `k-${createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 10)}`;
}
