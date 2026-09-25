import path from 'node:path';

export interface LearningPaths {
  root: string;
  state: string;
}

export function resolveLearningPaths(baseDir = process.cwd(), stateDir?: string): LearningPaths {
  const root = path.resolve(stateDir ?? path.join(baseDir, 'runtime', 'learning'));
  return {
    root,
    state: path.join(root, 'state.json'),
  };
}
