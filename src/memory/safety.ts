import type { MemoryRecord } from './types.js';

export interface MemorySafetyFinding {
  code: 'credential' | 'instruction-poisoning' | 'private-reasoning' | 'personal-identifier';
  message: string;
}

// Narrow on purpose: a number alone proves nothing, so each shape also needs its own keyword nearby.
const CARD_KEYWORD = /\b(?:card|credit|debit|visa|mastercard|amex|cvv|cvc|kartu)\b/i;
const CARD_CANDIDATE = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const NATIONAL_ID_PATTERNS: RegExp[] = [
  /\b(?:nik|ktp)\b[^\d]{0,20}\d{16}(?!\d)/i,
  /\b(?:ssn|social security(?: number)?)\b[^\d]{0,20}\d{3}-?\d{2}-?\d{4}(?!\d)/i,
  /\bpassport(?:\s{0,3}(?:no\.?|number|num\.?|#))?[^A-Za-z0-9]{0,15}(?=[A-Z0-9]{0,8}\d)[A-Z0-9]{6,9}\b/i,
];
// Published test numbers of payment providers are fixtures, not people.
const PROVIDER_TEST_CARDS = new Set([
  '4111111111111111', '4242424242424242', '4012888888881881', '5555555555554444', '5105105105105100',
  '378282246310005', '371449635398431', '6011111111111117', '6011000990139424', '30569309025904',
  '38520000023237', '3530111333300000', '3566002020360505', '4000056655665556', '5200828282828210',
  '2223003122003222', '4000000000000002', '4000000000009995',
]);

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = digits.charCodeAt(digits.length - 1 - index) - 48;
    if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}

function containsPersonalIdentifier(value: string): boolean {
  if (NATIONAL_ID_PATTERNS.some(pattern => pattern.test(value))) return true;
  for (const match of value.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19 || PROVIDER_TEST_CARDS.has(digits) || !luhnValid(digits)) continue;
    const start = match.index ?? 0;
    if (CARD_KEYWORD.test(value.slice(Math.max(0, start - 40), start + match[0].length + 40))) return true;
  }
  return false;
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
  if (containsPersonalIdentifier(value)) {
    findings.push({ code: 'personal-identifier', message: 'card, national id or passport numbers are not allowed in durable memory' });
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
