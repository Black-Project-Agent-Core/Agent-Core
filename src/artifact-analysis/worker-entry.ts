import { parentPort, workerData } from 'node:worker_threads';
import { inspectJavaScript } from './javascript.js';
import { inspectAsar } from './asar.js';
import { inspectManaged } from './managed.js';
import type { StaticInput } from './contracts.js';

const input = workerData as { captured: StaticInput; selected: string[] };
const source = input.captured;
try {
  if (source.format === 'managed-pe' && source.archive) {
    const result = inspectManaged(source.archive);
    // Metadata declarations are only one facet of this artifact; CIL and members remain outside scope.
    parentPort?.postMessage({ ...result, inspected: 1, unavailable: 0, notExamined: 1, inventory: 1 });
  } else if (source.format === 'asar' && source.archive) {
    parentPort?.postMessage(inspectAsar(source.archive, input.selected));
  } else if (source.format === 'directory-js') {
    const findings = [];
    let inspected = 0;
    let unavailable = 0;
    for (const file of source.files) {
      if (!file.bytes) continue;
      try {
        if (!/\.(?:[cm]?js|jsx|tsx?|mts|cts)$/i.test(file.relative)) continue;
        const items = inspectJavaScript(file.relative, file.bytes);
        findings.push(...items.slice(0, 256 - findings.length));
        inspected++;
      } catch { unavailable++; }
    }
    parentPort?.postMessage({ findings, inspected, unavailable, inventory: source.files.length,
      notExamined: source.files.length - inspected - unavailable,
      limitations: ['Selected JS source only; unresolved imports/dynamic code and inactive members remain unknown'] });
  } else throw new Error('ARTIFACT_FORMAT_UNSUPPORTED');
} catch {
  parentPort?.postMessage({ error: 'ARTIFACT_STATIC_PARSER_UNAVAILABLE' });
}