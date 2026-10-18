import type { ArtifactFinding } from './contracts.js';
import { ARTIFACT_LIMITS } from './contracts.js';
import { inspectJavaScriptWithCoverage } from './javascript.js';
export interface AsarInspect {
  inventory: number; inspected: number; unavailable: number; notExamined: number;
  findings: ArtifactFinding[]; droppedFindings: number; limitations: string[];
}
interface AsarEntry { size?: number; offset?: string; unpacked?: boolean; link?: string; files?: Record<string, AsarEntry> }
export function inspectAsar(bytes: Uint8Array, selected: string[]): AsarInspect {
  const output: AsarInspect = { inventory: 0, inspected: 0, unavailable: 0, notExamined: 0,
    findings: [], droppedFindings: 0, limitations: ['ASAR companion .unpacked, symlinks and nested ASAR not examined'] };
  if (bytes.length < 16) throw new Error('ARTIFACT_ASAR_HEADER_INVALID');
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Electron ASAR starts with a Pickle of length four, then a Pickle containing JSON.
  const sizeField = buf.readUInt32LE(4);
  if (buf.readUInt32LE(0) !== 4 || sizeField < 4 || sizeField > ARTIFACT_LIMITS.maxAsarHeader
    || sizeField + 8 > buf.length) throw new Error('ARTIFACT_ASAR_HEADER_INVALID');
  const jsonSize = buf.readUInt32LE(8);
  if (jsonSize < 2 || jsonSize > sizeField - 4 || 12 + jsonSize > buf.length)
    throw new Error('ARTIFACT_ASAR_HEADER_INVALID');
  const header = JSON.parse(new TextDecoder('utf-8', { fatal: true })
    .decode(buf.subarray(12, 12 + jsonSize))) as { files?: Record<string, AsarEntry> };
  if (!header || typeof header !== 'object' || !header.files) throw new Error('ARTIFACT_ASAR_HEADER_INVALID');
  const inventory = new Map<string, AsarEntry>();
  function walk(parent: string, files: Record<string, AsarEntry>, depth: number) {
    if (depth > ARTIFACT_LIMITS.maxDepth) { output.unavailable++; return; }
    for (const [name, entry] of Object.entries(files)) {
      if (output.inventory >= ARTIFACT_LIMITS.maxInventory) { output.unavailable++; return; }
      if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')
        || name.includes('\0') || !entry || typeof entry !== 'object') { output.unavailable++; continue; }
      const relative = parent ? parent + '/' + name : name;
      output.inventory++;
      if (entry.files) walk(relative, entry.files, depth + 1);
      else inventory.set(relative, entry);
    }
  }
  walk('', header.files, 0);
  const dataStart = 8 + sizeField;
  let sourceBudget = 0;
  for (const rel of selected) {
    if (!rel || rel.includes('\\') || rel.split('/').some(p => !p || p === '..')) {
      output.unavailable++; continue;
    }
    const entry = inventory.get(rel);
    if (!entry) { output.unavailable++; continue; }
    if (entry.link || entry.unpacked || rel.endsWith('.asar')) { output.notExamined++; continue; }
    if (!Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > ARTIFACT_LIMITS.maxSourceBytes
      || !/^(?:0|[1-9]\d*)$/.test(entry.offset ?? '')) { output.unavailable++; continue; }
    const start = dataStart + Number(entry.offset);
    const end = start + entry.size!;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end > buf.length || start < dataStart) {
      output.unavailable++; continue;
    }
    sourceBudget += entry.size!;
    if (sourceBudget > ARTIFACT_LIMITS.maxTotalSourceBytes) { output.notExamined++; continue; }
    const data = buf.subarray(start, end);
    if (/\.(?:[cm]?js|jsx|tsx?|mts|cts)$/i.test(rel)) {
      try {
        const parsed = inspectJavaScriptWithCoverage(rel, data), remaining = ARTIFACT_LIMITS.maxFindings - output.findings.length;
        output.findings.push(...parsed.findings.slice(0, remaining));
        output.droppedFindings += parsed.droppedFindings + Math.max(0, parsed.findings.length - remaining);
        output.inspected++;
      }
      catch { output.unavailable++; }
    } else { output.notExamined++; }
  }
  // Inventory is not analysis: account for all unselected/opaque entries as not examined.
  output.notExamined = Math.max(output.notExamined,
    output.inventory - output.inspected - output.unavailable);
  if (output.droppedFindings > 0)
    output.limitations.push('Selected findings limited to the first 256 declarations');
  return output;
}
