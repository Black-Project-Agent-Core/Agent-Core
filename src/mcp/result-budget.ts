import { randomUUID } from 'node:crypto';
import { readVerifiedResultBytes, resultArtifactIntegrity } from '../security/verified-result-artifact.js';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { resolveProjectRoot } from '../portability/paths.js';
import { redactSensitiveString, redactSensitiveValue } from '../security/redaction.js';
import { finalizePdfEvidence, PDF_EVIDENCE_BLOCK, type PdfEvidence } from '../rdc/tools/pdf/lib/evidence.js';

const DEFAULT_BUDGET = 256 * 1024;
const DEFAULT_PREVIEW = 24 * 1024;
const IMAGE_RESULT_BUDGET = 3 * 1024 * 1024;
const IMAGE_ENCODED_BUDGET = 2 * 1024 * 1024;
const MAX_ARTIFACTS = 128;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;
const NON_PERSISTABLE = new Set(['read_file', 'read_multiple_files', 'get_config', 'get_prompts', 'artifact_inspect']);
const MODULE_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT_ROOT = resolveProjectRoot(process.env, MODULE_PROJECT_ROOT);

type ResultContent = Record<string, unknown> & { text?: string };
export interface BudgetableToolResult {
  content: ResultContent[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

function textProjection(result: BudgetableToolResult): string {
  return result.content
    .map(item => typeof item.text === 'string' ? redactSensitiveString(item.text) : '')
    .filter(Boolean)
    .join('\n');
}

const PREVIEW_OMISSION = '\n\n[... oversized output omitted ...]\n\n';

function retainSmallNonTextContent(result: BudgetableToolResult, budgetBytes: number): ResultContent[] {
  const blocks = result.content.filter(item => typeof item.text !== 'string');
  if (!blocks.length) return [];
  const bytes = Buffer.byteLength(JSON.stringify(blocks), 'utf8');
  return bytes <= Math.min(64 * 1024, Math.floor(budgetBytes / 4)) ? blocks : [];
}

function boundedPreview(text: string, maxBytes = DEFAULT_PREVIEW): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) return text;
  const markerBytes = Buffer.byteLength(PREVIEW_OMISSION, 'utf8');
  if (maxBytes <= markerBytes + 16) {
    let end = Math.min(maxBytes, buffer.length);
    if (end < buffer.length && (buffer[end]! & 0xc0) === 0x80) {
      while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end -= 1;
    }
    return buffer.subarray(0, end).toString('utf8');
  }

  const retained = maxBytes - markerBytes;
  const headBytes = Math.ceil(retained * 0.65);
  const tailBytes = Math.floor(retained * 0.35);
  let headEnd = Math.min(headBytes, buffer.length);
  if (headEnd < buffer.length && (buffer[headEnd]! & 0xc0) === 0x80) {
    while (headEnd > 0 && (buffer[headEnd]! & 0xc0) === 0x80) headEnd -= 1;
  }
  let tailStart = Math.max(0, buffer.length - tailBytes);
  while (tailStart < buffer.length && (buffer[tailStart]! & 0xc0) === 0x80) tailStart += 1;
  return buffer.subarray(0, headEnd).toString('utf8')
    + PREVIEW_OMISSION
    + buffer.subarray(tailStart).toString('utf8');
}

interface PdfDelivery {
  index: number;
  evidence: PdfEvidence;
}

// Only an owner-marked block is evidence. Arbitrary JSON read from a file cannot
// opt into this path; the symbol is invocation-local and never serialized.
function pdfDelivery(toolName: string, result: BudgetableToolResult): PdfDelivery | undefined {
  if (toolName !== 'read_file') return undefined;
  const index = result.content.findIndex(item => PDF_EVIDENCE_BLOCK in item);
  if (index < 0) return undefined;
  const block = result.content[index] as ResultContent & { [PDF_EVIDENCE_BLOCK]: PdfEvidence };
  const evidence = finalizePdfEvidence(block[PDF_EVIDENCE_BLOCK]);
  if (!evidence) return undefined;
  return { index, evidence };
}

function pdfBlock(evidence: PdfEvidence): ResultContent {
  return { type: 'text', text: JSON.stringify({ pdfEvidence: evidence }) };
}

function preservePdfDelivery<T extends BudgetableToolResult>(
  output: T, delivery: PdfDelivery | undefined, budgetBytes: number, previewBytes: number,
): T {
  if (!delivery) return output;
  let evidenceBytes = Math.min(32_768, Math.floor(budgetBytes / 4));
  let textBytes = Math.min(previewBytes, Math.floor(budgetBytes / 4));
  for (;;) {
    const evidence = finalizePdfEvidence(delivery.evidence, { maxBytes: evidenceBytes, outputTruncated: true });
    if (!evidence) break;
    const content = [...output.content.map(item => typeof item.text === 'string'
      ? { ...item, text: boundedPreview(item.text, textBytes) } : item), pdfBlock(evidence)];
    const delivered = { ...output, content, structuredContent: undefined } as T;
    if (Buffer.byteLength(JSON.stringify(delivered), 'utf8') <= budgetBytes) return delivered;
    if (textBytes > 256) textBytes = Math.max(256, Math.floor(textBytes / 2));
    else if (evidenceBytes > 2048) evidenceBytes = Math.max(2048, Math.floor(evidenceBytes / 2));
    else break;
  }
  // Never send malformed/cut evidence or pretend omitted metadata was delivered.
  return {
    isError: true,
    content: [{ type: 'text', text: 'PDF_RESULT_BUDGET_EXCEEDED: PDF evidence could not fit the response. Request fewer pages.' }],
    _meta: { resultBudget: { spilled: false, reason: 'pdf-evidence-budget' } },
  } as unknown as T;
}

async function cleanupArtifacts(directory: string): Promise<void> {
  try {
    const now = Date.now();
    const entries = [];
    for (const name of await readdir(directory)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(directory, name);
      try {
        const info = await stat(file);
        if (!info.isFile()) continue;
        if (now - info.mtimeMs > ARTIFACT_TTL_MS) {
          await rm(file, { force: true });
          continue;
        }
        entries.push({ file, mtimeMs: info.mtimeMs, size: info.size });
      } catch {
        // Best-effort cleanup must never fail the tool response.
      }
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    let bytes = 0;
    for (let index = 0; index < entries.length; index += 1) {
      bytes += entries[index].size;
      if (index >= MAX_ARTIFACTS || bytes > MAX_ARTIFACT_BYTES) {
        await rm(entries[index].file, { force: true }).catch(() => undefined);
      }
    }
  } catch {
    // Fail-soft cleanup.
  }
}

export async function applyResultBudget<T extends BudgetableToolResult>(
  toolName: string,
  result: T,
  options: { budgetChars?: number; previewChars?: number; storageDir?: string } = {},
): Promise<T> {
  // Images are transport-only. Count the actual response (including base64),
  // never a redacted projection, and never enter the artifact spill path.
  if (toolName === 'image_inspect') {
    const serializedBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    const oversizedImage = result.content.some(item => item.type === 'image'
      && typeof item.data === 'string'
      && Buffer.byteLength(item.data, 'base64') > IMAGE_ENCODED_BUDGET);
    if (serializedBytes <= IMAGE_RESULT_BUDGET && !oversizedImage) return result;
    return {
      isError: true,
      content: [{ type: 'text', text: 'IMAGE_RESULT_BUDGET_EXCEEDED: image inspection exceeds the 2 MiB encoded image or 3 MiB total response limit. Request a smaller crop or explicitly select JPEG. No image result was persisted.' }],
      _meta: { resultBudget: { spilled: false, reason: 'image-result-budget', originalBytes: serializedBytes } },
    } as unknown as T;
  }
  const budgetBytes = Math.max(16 * 1024, options.budgetChars ?? DEFAULT_BUDGET);
  const previewBytes = Math.max(2 * 1024, Math.min(options.previewChars ?? DEFAULT_PREVIEW, budgetBytes));
  const delivery = pdfDelivery(toolName, result);
  const safeResult = redactSensitiveValue(result) as BudgetableToolResult;
  if (delivery) safeResult.content[delivery.index] = pdfBlock(delivery.evidence);
  const serialized = JSON.stringify(safeResult);
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes <= budgetBytes) return delivery ? safeResult as T : result;
  if (delivery) {
    const withoutEvidence = { ...safeResult,
      content: safeResult.content.filter((_, index) => index !== delivery.index) };
    const originalBytes = Buffer.byteLength(JSON.stringify(withoutEvidence), 'utf8');
    if (originalBytes <= budgetBytes) {
      // Metadata must not evict previously admissible text or images. Count the
      // actual envelope, since the evidence JSON is escaped inside a text block.
      let available = Math.min(32_768, budgetBytes - originalBytes);
      while (available > 0) {
        const evidence = finalizePdfEvidence(delivery.evidence, { maxBytes: available });
        if (!evidence) break;
        const content = [...safeResult.content];
        content[delivery.index] = pdfBlock(evidence);
        const candidate = { ...safeResult, content };
        const overflow = Buffer.byteLength(JSON.stringify(candidate), 'utf8') - budgetBytes;
        if (overflow <= 0) return candidate as T;
        available -= Math.max(1, overflow);
      }
      return {
        isError: true,
        content: [{ type: 'text', text: 'PDF_RESULT_BUDGET_EXCEEDED: PDF evidence could not fit the response. Request fewer pages.' }],
        _meta: { resultBudget: { spilled: false, reason: 'pdf-evidence-budget' } },
      } as unknown as T;
    }
  }

  const projection = textProjection(delivery
    ? { ...safeResult, content: safeResult.content.filter((_, index) => index !== delivery.index) } : safeResult);
  const retainedNonText = retainSmallNonTextContent(safeResult, budgetBytes);
  const retainedNonTextBytes = Buffer.byteLength(JSON.stringify(retainedNonText), 'utf8');
  const storageDir = options.storageDir ?? path.join(PROJECT_ROOT, 'runtime', 'tool-results');

  if (NON_PERSISTABLE.has(toolName)) {
    const suffix = '\n\n[Truncated: oversized sensitive-capable tool result was not persisted. Use the tool pagination/range controls.]';
    const preview = boundedPreview(
      projection,
      Math.max(0, Math.min(
        previewBytes,
        budgetBytes - retainedNonTextBytes - Buffer.byteLength(suffix, 'utf8') - 512,
      )),
    );
    return preservePdfDelivery({
      ...result,
      content: [...retainedNonText, { type: 'text', text: preview + suffix }],
      structuredContent: undefined,
      _meta: {
        ...(result._meta ?? {}),
        resultBudget: {
          spilled: false,
          reason: 'non-persistable-tool',
          originalChars: serialized.length,
          originalBytes: serializedBytes,
        },
      },
    } as T, delivery, budgetBytes, previewBytes);
  }

  try {
    await mkdir(storageDir, { recursive: true });
    await cleanupArtifacts(storageDir);
    const safeTool = toolName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || 'tool';
    const filePath = path.join(storageDir, Date.now() + '-' + safeTool + '-' + randomUUID() + '.json');
    const artifactBytes = Buffer.from(JSON.stringify(safeResult, null, 2), 'utf8');
    const artifactIntegrity = resultArtifactIntegrity(artifactBytes);
    await writeOwnedFileAtomic(filePath, artifactBytes);
    const expectedIntegrity = { digest: artifactIntegrity.digest, storedBytes: artifactIntegrity.storedBytes };
    await readVerifiedResultBytes(filePath, expectedIntegrity, storageDir);
    const header = [
      '<persisted-output>',
      'Oversized tool result was redacted and persisted locally.',
      'Tool: ' + toolName,
      'Original serialized bytes: ' + serializedBytes,
      'Artifact: ' + filePath,
      'Use read_file with offset/length and options.expectedIntegrity=' + JSON.stringify(expectedIntegrity) + ' to inspect verified bytes.',
      '',
      'Preview:',
    ].join('\n') + '\n';
    const footer = '\n</persisted-output>';
    const preview = boundedPreview(
      projection,
      Math.max(0, Math.min(
        previewBytes,
        budgetBytes - retainedNonTextBytes - Buffer.byteLength(header + footer, 'utf8') - 512,
      )),
    );
    return preservePdfDelivery({
      ...result,
      content: [...retainedNonText, { type: 'text', text: header + preview + footer }],
      structuredContent: undefined,
      _meta: {
        ...(result._meta ?? {}),
        resultBudget: {
          spilled: true,
          artifact: filePath,
          artifactIntegrity,
          originalChars: serialized.length,
          originalBytes: serializedBytes,
        },
      },
    } as T, delivery, budgetBytes, previewBytes);
  } catch (error) {
    const suffix = '\n\n[Truncated: oversized tool result could not be persisted: '
      + (error instanceof Error ? redactSensitiveString(error.message) : 'unknown error') + ']';
    const preview = boundedPreview(
      projection,
      Math.max(0, Math.min(
        previewBytes,
        budgetBytes - retainedNonTextBytes - Buffer.byteLength(suffix, 'utf8') - 512,
      )),
    );
    return preservePdfDelivery({
      ...result,
      content: [...retainedNonText, { type: 'text', text: preview + suffix }],
      structuredContent: undefined,
      _meta: {
        ...(result._meta ?? {}),
        resultBudget: {
          spilled: false,
          reason: 'spill-failed',
          originalChars: serialized.length,
          originalBytes: serializedBytes,
        },
      },
    } as T, delivery, budgetBytes, previewBytes);
  }
}
