// Reconstructed from surviving local dist; emitted runtime parity checked.
const SENSITIVE_KEY = /(token|secret|password|passphrase|authorization|api.?key|credential|private.?key|client.?secret|access.?token|refresh.?token|code.?verifier|cookie|session.?id)/i;
export function isSensitiveKey(key: string) {
    return SENSITIVE_KEY.test(key);
}
// Credential shapes that identify themselves without a `key=` label. Each pattern is anchored by a literal prefix
// and uses bounded or single-class quantifiers, so a long hostile string cannot make any of them superlinear.
const KNOWN_CREDENTIAL_SHAPES: Array<[RegExp, string]> = [
    [/-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----[A-Za-z0-9+/=\s]{0,8192}/g, '[REDACTED PRIVATE KEY]'],
    [/\bsk-(?:or-v1-|ant-|proj-)?(?=[A-Za-z0-9_-]{0,200}\d)[A-Za-z0-9_-]{24,200}/g, '[REDACTED]'],
    [/\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g, '[REDACTED]'],
    [/\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g, '[REDACTED]'],
    [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED]'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED]'],
    [/\bxox[abprs]-[A-Za-z0-9-]{10,200}/g, '[REDACTED]'],
    [/\beyJ[A-Za-z0-9_-]{10,2000}\.[A-Za-z0-9_-]{10,2000}\.[A-Za-z0-9_-]{10,2000}/g, '[REDACTED JWT]'],
    [/(:\/\/)[^\s/:@]{1,64}:[^\s/@]{1,128}@/g, '$1[REDACTED]@'],
];
function redactKnownCredentialShapes(value: string): string {
    let output = value;
    for (const [pattern, replacement] of KNOWN_CREDENTIAL_SHAPES) output = output.replace(pattern, replacement);
    return output;
}
export function redactSensitiveString(value: string) {
    let output = value;
    output = output.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
    output = output.replace(/\bagent_core_(?:live|oauth|secret|code|refresh)_[A-Za-z0-9_-]+\b/gi, '[REDACTED]');
    output = redactKnownCredentialShapes(output);
    output = output.replace(/((?:["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|passphrase|secret|token|code[_-]?verifier)["']?)\s*[:=]\s*)(["'])(.*?)\2/gi, '$1$2[REDACTED]$2');
    output = output.replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|passphrase|secret|token|code[_-]?verifier)\s*=\s*)([^\s&;,}\]"']+)/gi, '$1[REDACTED]');
    output = output.replace(/((?:--?)(?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|authorization|password|passphrase|secret|token|code[-_]?verifier)\s+)(["']?)([^\s"']+)\2/gi, '$1[REDACTED]');
    return output;
}
export function redactSensitiveValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (depth > 10)
        return '[TRUNCATED]';
    if (typeof value === 'string')
        return redactSensitiveString(value);
    if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined')
        return value;
    if (typeof value !== 'object')
        return redactSensitiveString(String(value));
    if (seen.has(value))
        return '[CIRCULAR]';
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((item) => redactSensitiveValue(item, depth + 1, seen));
        }
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            output[key] = isSensitiveKey(key)
                ? '[REDACTED]'
                : redactSensitiveValue(item, depth + 1, seen);
        }
        return output;
    }
    finally {
        seen.delete(value);
    }
}
