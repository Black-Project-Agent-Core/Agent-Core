import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeDevelopmentFreeze } from '../../src/native-development-freeze.ts';

// No baseline-refresh switch: only an explicit human Native-development request can authorize rebasing.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try {
  const result = await new NativeDevelopmentFreeze(root).verify();
  console.log(`Native development frozen: ${result.files} files / ${result.sections} shared sections verified. All default development targets external AI.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
