import path from 'node:path';

export interface LearningPaths {
  root: string;
  state: string;
}

export function resolveLearningPaths(stateDir: string): LearningPaths {
  const root = path.resolve(stateDir);
  return {
    root,
    state: path.join(root, 'state.json'),
  };
}
