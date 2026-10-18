import { parentPort, workerData } from 'node:worker_threads';
import { inspectJavaScriptWithCoverage } from './javascript.js';
import { inspectAsar } from './asar.js';
import { inspectManaged } from './managed.js';
import type { ArtifactFinding, StaticInput } from './contracts.js';

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
    const findings: ArtifactFinding[] = [];
    let inspected = 0;
    let unavailable = 0;
    let droppedFindings = 0;
    for (const file of source.files) {
      if (!file.bytes) continue;
      try {
        if (!/\.(?:[cm]?js|jsx|tsx?|mts|cts)$/i.test(file.relative)) continue;
        const parsed = inspectJavaScriptWithCoverage(file.relative, file.bytes);
        const remaining: number = 256 - findings.length;
        findings.push(...parsed.findings.slice(0, remaining));
        droppedFindings += parsed.droppedFindings + Math.max(0, parsed.findings.length - remaining);
        inspected++;
      } catch { unavailable++; }
    }
    parentPort?.postMessage({ findings, droppedFindings, inspected, unavailable, inventory: source.files.length,
      notExamined: source.files.length - inspected - unavailable,
      limitations: ['Selected JS source only; unresolved imports/dynamic code and inactive members remain unknown'] });
  } else throw new Error('ARTIFACT_FORMAT_UNSUPPORTED');
} catch {
  parentPort?.postMessage({ error: 'ARTIFACT_STATIC_PARSER_UNAVAILABLE' });
}
