/**
 * Pre-flight secret masking for durable Memory writes.
 *
 * Masking is a best-effort sanitation pass that runs before the canonical write.
 * It never lowers protection: `scanMemorySafety` still rejects any credential-shaped
 * text that masking did not recognize. Instruction-poisoning and private-reasoning
 * content are not maskable and remain rejected by the existing safety owner.
 */

export interface SecretRedaction {
  kind: string;
  count: number;
}

export interface MaskResult {
  text: string;
  redactions: SecretRedaction[];
}

interface MaskRule {
  kind: string;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const placeholder = (kind: string): string => `[REDACTED:${kind}]`;
const whole = (kind: string) => (): string => placeholder(kind);

// Ordered most specific first so a generic assignment never splits a recognized token.
const RULES: MaskRule[] = [
  {
    kind: 'private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY[A-Z ]*-----|$)/g,
    replace: whole('private-key'),
  },
  // Same token family as src/security/redaction.ts, which redacts logs/responses lossily; this
  // masker keeps typed placeholders and adds provider formats that redactor does not know.
  { kind: 'agent-core-key', pattern: /\bagent_core_(?:live|oauth|secret|code|refresh)_[A-Za-z0-9_-]{16,}\b/g, replace: whole('agent-core-key') },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: whole('jwt') },
  { kind: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: whole('aws-access-key') },
  { kind: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g, replace: whole('github-token') },
  { kind: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replace: whole('slack-token') },
  { kind: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: whole('google-api-key') },
  { kind: 'provider-api-key', pattern: /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,})/g, replace: whole('provider-api-key') },
  {
    kind: 'bearer-token',
    pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
    replace: (_match, prefix) => `${prefix}${placeholder('bearer-token')}`,
  },
  {
    kind: 'url-credentials',
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)(?!\[REDACTED:)[^\s/:@]+:[^\s/@]+@/gi,
    replace: (_match, scheme) => `${scheme}${placeholder('url-credentials')}@`,
  },
  {
    // A digit is required so identifiers such as `process.env.API_KEY` are kept intact.
    kind: 'secret-assignment',
    pattern: /\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|secret|password|passphrase|token)(\s*[:=]\s*)(["']?)(?=[A-Za-z0-9._~+/=-]*\d)[A-Za-z0-9._~+/=-]{8,}\3/gi,
    replace: (_match, name, separator, quote) => `${name}${separator}${quote}${placeholder('secret')}${quote}`,
  },
];

export function maskSecrets(text: string): MaskResult {
  let output = text;
  const counts = new Map<string, number>();
  for (const rule of RULES) {
    output = output.replace(rule.pattern, (match: string, ...groups: unknown[]) => {
      counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + 1);
      return rule.replace(match, ...(groups.filter((group) => typeof group === 'string') as string[]));
    });
  }
  return {
    text: output,
    redactions: [...counts].map(([kind, count]) => ({ kind, count })),
  };
}

export interface MaskableMemoryInput {
  content?: string;
  title?: string;
  context?: string;
  keywords?: string[];
  tags?: string[];
  category?: string;
  source?: { type: string; ref?: string };
}

export interface MaskedInput<T> {
  value: T;
  redactions: SecretRedaction[];
}

function mergeRedactions(target: Map<string, number>, items: SecretRedaction[]): void {
  for (const item of items) target.set(item.kind, (target.get(item.kind) ?? 0) + item.count);
}

/** Returns the same object when nothing was masked, so callers can cheaply detect a no-op. */
export function maskMemoryInput<T extends MaskableMemoryInput>(input: T): MaskedInput<T> {
  const total = new Map<string, number>();
  const next: T = { ...input };
  const apply = (value: string | undefined): string | undefined => {
    if (value === undefined) return undefined;
    const result = maskSecrets(value);
    mergeRedactions(total, result.redactions);
    return result.text;
  };
  const applyList = (values: string[] | undefined): string[] | undefined =>
    values?.map((value) => apply(value) as string);

  if (input.content !== undefined) next.content = apply(input.content) as string;
  if (input.title !== undefined) next.title = apply(input.title) as string;
  if (input.context !== undefined) next.context = apply(input.context) as string;
  if (input.category !== undefined) next.category = apply(input.category) as string;
  if (input.keywords !== undefined) next.keywords = applyList(input.keywords) as string[];
  if (input.tags !== undefined) next.tags = applyList(input.tags) as string[];
  if (input.source?.ref !== undefined) next.source = { ...input.source, ref: apply(input.source.ref) as string };

  if (!total.size) return { value: input, redactions: [] };
  return { value: next, redactions: [...total].map(([kind, count]) => ({ kind, count })) };
}

/** Counts only: redacted values are never retained in history or diagnostics. */
export function summarizeRedactions(redactions: SecretRedaction[]): Record<string, number> {
  return Object.fromEntries(redactions.map((item) => [item.kind, item.count]));
}
