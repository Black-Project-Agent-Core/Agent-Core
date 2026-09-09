import { access } from 'node:fs/promises';
import path from 'node:path';
import type { FileNativeMemoryPaths } from './paths.js';

export type PrivateMemoryTool = 'rg' | 'python' | 'graphify';

function candidates(paths: FileNativeMemoryPaths, tool: PrivateMemoryTool): string[] {
  if (tool === 'rg') return [path.join(paths.ripgrepRoot, process.platform === 'win32' ? 'rg.exe' : 'rg')];
  if (tool === 'python') return [
    path.join(paths.pythonRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python3'),
    path.join(paths.pythonRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python'),
  ];
  return [
    path.join(paths.graphifyToolRoot, process.platform === 'win32' ? 'graphify.exe' : 'bin/graphify'),
    path.join(paths.graphifyToolRoot, process.platform === 'win32' ? 'graphify.cmd' : 'graphify'),
  ];
}

export async function resolvePrivateMemoryTool(
  paths: FileNativeMemoryPaths,
  tool: PrivateMemoryTool,
  override?: string,
): Promise<string> {
  const values = override ? [path.resolve(override)] : candidates(paths, tool);
  for (const candidate of values) {
    const relative = path.relative(paths.projectRoot, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next project-local candidate only. System PATH is never certification.
    }
  }
  throw new Error(`MEMORY_PRIVATE_TOOL_MISSING:${tool}`);
}
