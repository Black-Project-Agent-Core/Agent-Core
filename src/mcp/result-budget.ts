import { randomUUID } from 'node:crypto';
import { readVerifiedResultBytes, resultArtifactIntegrity } from '../security/verified-result-artifact.js';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { resolveProjectRoot } from '../portability/paths.js';
import { redactSensitiveString, redactSensitiveValue } from '../security/redaction.js';

const DEFAULT_BUDGET = 256 * 1024;
const DEFAULT_PREVIEW = 24 * 1024;
const IMAGE_RESULT_BUDGET = 3 * 1024 * 1024;
const IMAGE_ENCODED_BUDGET = 2 * 1024 * 1024;
const BROWSER_SCREENSHOT_IMAGE_BUDGET = 128 * 1024;
const BROWSER_SCREENSHOT_METADATA_BUDGET = 16 * 1024;
const BROWSER_SCREENSHOT_ENVELOPE_BUDGET = 240 * 1024;
const MAX_ARTIFACTS = 128;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;
const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;
const NON_PERSISTABLE = new Set(['read_file', 'read_multiple_files', 'get_config', 'get_prompts']);
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
  // Browser pixels are transient, even when a caller asks for a smaller text
  // budget. Reject malformed/oversized screenshots before the generic spill path.
  if (toolName === 'browser_control' && result.content.some(item => item.type === 'image')) {
    const images = result.content.filter(item => item.type === 'image');
    const image = images[0]!;
    const { content, ...otherMetadata } = result;
    const metadata = content.filter(item => item.type !== 'image');
    const metadataJson = JSON.stringify({ ...otherMetadata, content: metadata });
    // Count text as UTF-8 metadata, not JSON escaping, and count all extra fields.
    const metadataBytes = metadata.reduce((bytes, item) => bytes + Buffer.byteLength(
      typeof item.text === 'string' ? item.text : JSON.stringify(item), 'utf8'), 0)
      + (Object.keys(otherMetadata).length ? Buffer.byteLength(JSON.stringify(otherMetadata), 'utf8') : 0);
    const serializedBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    const data = image.data;
    const validImage = images.length === 1 && image.mimeType === 'image/jpeg'
      && Object.keys(image).every(key => ['type', 'mimeType', 'data'].includes(key))
      && typeof data === 'string' && data.length > 0
      && data.length <= 4 * Math.ceil(BROWSER_SCREENSHOT_IMAGE_BUDGET / 3)
      && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
      && Buffer.byteLength(data, 'base64') <= BROWSER_SCREENSHOT_IMAGE_BUDGET
      && !metadataJson.includes(data);
    const validMetadata = metadata.every(item => item.type === 'text' && typeof item.text === 'string'
      && Object.keys(item).every(key => ['type', 'text'].includes(key)));
    if (validImage && validMetadata && metadataBytes <= BROWSER_SCREENSHOT_METADATA_BUDGET
      && serializedBytes <= BROWSER_SCREENSHOT_ENVELOPE_BUDGET) return result;
    return {
      isError: true,
      content: [{ type: 'text', text: 'BROWSER_SCREENSHOT_RESULT_INVALID: expected one JPEG image within 128 KiB, metadata within 16 KiB, and a total envelope within 240 KiB. Pixels must not be duplicated in text or metadata. No screenshot was persisted. Request a smaller screenshot, or use DOM/actionId observation.' }],
      _meta: { resultBudget: { spilled: false, reason: 'browser-screenshot-budget', originalBytes: serializedBytes } },
    } as unknown as T;
  }
  const budgetBytes = Math.max(16 * 1024, options.budgetChars ?? DEFAULT_BUDGET);
  const previewBytes = Math.max(2 * 1024, Math.min(options.previewChars ?? DEFAULT_PREVIEW, budgetBytes));
  const safeResult = redactSensitiveValue(result) as BudgetableToolResult;
  const serialized = JSON.stringify(safeResult);
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes <= budgetBytes) return result;

  const projection = textProjection(safeResult);
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
    return {
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
    } as T;
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
    return {
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
    } as T;
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
    return {
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
    } as T;
  }
}
