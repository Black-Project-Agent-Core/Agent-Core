import type { MemoryRecord } from './types.js';

export interface MemorySafetyFinding {
  code: 'credential' | 'instruction-poisoning' | 'private-reasoning';
  message: string;
}

const CREDENTIAL_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  /\bagent_core_live_[A-Za-z0-9_-]{16,}\b/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passphrase)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/i,
];

const INJECTION_PATTERNS: RegExp[] = [
  /\b(?:ignore|disregard|override)\b[\s\S]{0,100}\b(?:previous|system|developer|instructions?|rules?|policy)\b/i,
  /\breveal\b[\s\S]{0,80}\b(?:system prompt|secrets?|tokens?|credentials?)\b/i,
  /\b(?:execute|run|call)\b[\s\S]{0,60}\b(?:tool|command)\b[\s\S]{0,80}\b(?:without permission|ignore policy|bypass)\b/i,
];

const PRIVATE_REASONING_PATTERNS: RegExp[] = [
  /\b(?:hidden|private)\s+(?:chain[- ]of[- ]thought|reasoning|scratchpad)\b/i,
  /\braw\s+(?:chain[- ]of[- ]thought|reasoning trace)\b/i,
];

export function scanMemorySafety(text: string): MemorySafetyFinding[] {
  const value = text.trim();
  if (!value) return [];
  const findings: MemorySafetyFinding[] = [];
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value))) {
    findings.push({ code: 'credential', message: 'credential-shaped secret material is not allowed in durable memory' });
  }
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(value))) {
    findings.push({ code: 'instruction-poisoning', message: 'instruction-poisoning shaped content is not allowed in durable memory' });
  }
  if (PRIVATE_REASONING_PATTERNS.some((pattern) => pattern.test(value))) {
    findings.push({ code: 'private-reasoning', message: 'raw/private reasoning is not allowed in durable memory' });
  }
  return findings;
}
export function assertMemoryRecordSafe(record: MemoryRecord): void {
  const material = [
    record.title ?? '',
    record.content,
    record.context,
    record.keywords.join(' '),
    record.tags.join(' '),
    record.category,
    record.source?.ref ?? '',
    ...(record.version === 2 ? [JSON.stringify(record.experience)] : []),
  ].join('\n');

  const findings = scanMemorySafety(material);
  if (!findings.length) return;
  throw new Error(`MEMORY_SAFETY_REJECTED: ${findings.map((item) => item.code).join(', ')}`);
}

export function assertLearningTextSafe(text: string): void {
  const findings = scanMemorySafety(text);
  if (!findings.length) return;
  throw new Error(`LEARNING_SAFETY_REJECTED: ${findings.map((item) => item.code).join(', ')}`);
}

/** Rescan decoded allowlisted values; JSON escaping must not hide a dangerous source string. */
export function assertMemoryDisclosureSafe(value:unknown):void {
  const strings:string[]=[];
  const visit=(item:unknown):void=>{if(typeof item==='string')strings.push(item);else if(Array.isArray(item))item.forEach(visit);else if(item&&typeof item==='object')for(const [key,child]of Object.entries(item)){strings.push(key);visit(child);}};
  visit(value);
  if(scanMemorySafety(strings.join('\n')).length)throw new Error('MEMORY_SOURCE_UNAVAILABLE');
}
