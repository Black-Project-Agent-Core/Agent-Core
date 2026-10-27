import { activityTracker } from './activity-tracker.js';
import { isSensitiveKey, redactSensitiveString } from '../security/redaction.js';
import type { EvidenceCaptureDisposition } from '../security/evidence-capture-policy.js';

export type DetailPhase = 'request' | 'response';
export const DETAIL_CHUNK_CHARS = 1_400;
export const DETAIL_REQUEST_LIMIT = 12_000;
export const DETAIL_RESPONSE_LIMIT = 24_000;
const MAX_INPUT_STRING = 64_000;
const MAX_DEPTH = 8;

function redactText(text: string): string {
  return redactSensitiveString(text)
    .replace(/\b((?:set-)?cookie|authorization|proxy-authorization)\s*:\s*[^\r\n]+/gi, '$1: [REDACTED]')
    .replace(/\b(?:sk-(?:proj-)?|gh[pousr]_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\b((?:(?:set-)?cookie|proxy-authorization|x-api-key|session(?:_?secret)?|client_secret)\s*[=:]\s*['\"]?)([^\s;&\r\n,'\"}]+)/gi, '$1[REDACTED]');
}

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[OMITTED: nesting limit]';
  if (typeof value === 'string') {
    if (value.length > MAX_INPUT_STRING) return '[OMITTED: oversized text; bytes not stored]';
    return redactText(value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === undefined) return '[UNAVAILABLE]';
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return '[OMITTED: binary data]';
  if (Array.isArray(value)) {
    const items = value.slice(0, 256).map(item => safeValue(item, depth + 1));
    if (value.length > 256) items.push('[OMITTED: remaining array items]');
    return items;
  }
  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    if (input.type === 'image' || input.type === 'audio') return '[OMITTED: binary media]';
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input).slice(0, 128)) {
      // Sanitize both object property names and values before serialization.
      const safeKey = redactText(key);
      output[safeKey] = isSensitiveKey(key) || /^(?:contractSession|confirmation|authorizationCode|secretValue)$/i.test(key)
        ? '[REDACTED]' : safeValue(item, depth + 1);
    }
    if (Object.keys(input).length > 128) output['__omitted'] = 'Remaining object properties omitted';
    return output;
  }
  return '[OMITTED: unsupported value]';
}

function renderDetail(phase: DetailPhase, value: unknown): string {
  if (phase === 'response' && value && typeof value === 'object') {
    const result = value as Record<string, unknown>;
    if (Array.isArray(result.content)) {
      const blocks = result.content.map((item: unknown) => {
        if (!item || typeof item !== 'object') return '[UNAVAILABLE]';
        const block = item as Record<string, unknown>;
        return block.type === 'text' && typeof block.text === 'string'
          ? safeValue(block.text) : JSON.stringify(safeValue(block));
      });
      return `${result.isError === true ? 'Tool error\n' : ''}${blocks.join('\n')}`;
    }
  }
  return JSON.stringify(safeValue(value), null, 2) ?? '[UNAVAILABLE]';
}

/** External MCP observation only. No raw payload or alternate log store is created. */
export function recordExternalToolDetail(input: {
  tool: string; invocationId: string; phase: DetailPhase; value: unknown;
  disposition?: EvidenceCaptureDisposition;
}): void {
  const { tool, invocationId, phase, disposition = 'full' } = input;
  if (!/^[a-f0-9]{32}$/i.test(invocationId)) return;
  const limit = phase === 'request' ? DETAIL_REQUEST_LIMIT : DETAIL_RESPONSE_LIMIT;
  let text = '';
  let state: 'complete' | 'truncated' | 'omitted' | 'unavailable' = 'complete';
  let redacted = false;
  try {
    if (disposition !== 'full') state = 'omitted';
    else {
      text = renderDetail(phase, input.value);
      // renderDetail already sanitizes each raw string and property name. A second
      // regex pass over JSON would mistake escaped \n for literal line breaks and
      // swallow unrelated command lines after an Authorization header.
      redacted = text.includes('[REDACTED]');
      if (text.length > limit) { text = text.slice(0, limit); state = 'truncated'; }
    }
  } catch { state = 'unavailable'; text = ''; }
  const parts = text ? Array.from({ length: Math.ceil(text.length / DETAIL_CHUNK_CHARS) },
    (_, index) => text.slice(index * DETAIL_CHUNK_CHARS, (index + 1) * DETAIL_CHUNK_CHARS)) : [''];
  for (const [index, content] of parts.entries()) {
    activityTracker.record('MCP', 'info', `${tool} ${phase} detail (${state})`, 'tool-detail', {
      invocationId, tool, detailPhase: phase, detailSegment: index, detailSegments: parts.length,
      detailText: content, detailState: state, detailRedacted: redacted,
    });
  }
}
