/**
 * Secret masking for every text this owner stores or returns: durable Memory writes and the snippets
 * of code_orient action=context. There is one set of secret shapes here; callers do not add their own.
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

export interface MaskOptions {
  /**
   * Keep the line count of the input. A key block then keeps one line per source line (the first one
   * holds the placeholder), so line numbers in the masked text still match the source file.
   */
  preserveLines?: boolean;
}

/** Tells whether a basic-auth flag at a position is a login. One gate serves one masking call. */
type BasicAuthGate = (input: string, position: number) => boolean;

interface MaskRule {
  kind: string;
  pattern: RegExp;
  replace?: (match: string, ...groups: Array<string | undefined>) => string;
  /** Used instead of `replace` when MaskOptions.preserveLines is set. */
  keepLines?: (match: string, ...groups: Array<string | undefined>) => string;
  /** Used instead of `replace` and `keepLines`, in both modes. Also gets the input, the match offset and the HTTP-client gate. */
  contextual?: (match: string, groups: Array<string | undefined>, input: string, offset: number, isBasicAuthCommand: BasicAuthGate) => string;
}

const placeholder = (kind: string): string => `[REDACTED:${kind}]`;
const whole = (kind: string) => (): string => placeholder(kind);
// Text that is nothing but placeholders is masked already, so a second pass finds nothing to count.
const isPlaceholderOnly = (text: string): boolean => /^(?:\[REDACTED:[a-z-]+\])+$/.test(text);

// Bare values that name a type or a literal, not a secret: `password: string` stays readable.
const NON_SECRET_VALUES = new Set([
  'string', 'number', 'boolean', 'unknown', 'any', 'object', 'void', 'never', 'bigint', 'symbol',
  'null', 'undefined', 'true', 'false', 'none', 'nil', 'str', 'int', 'float', 'bool', 'bytes',
]);

// Code references, not values: `api_key = process.env.API_KEY` stays readable.
const CODE_REFERENCE = /^(?:process\.env|import\.meta\.env|Deno\.env|os\.environ|System\.getenv|this|self|config|settings)(?:\.[\w$]+)*$/;

// Key words of key-value secrets. A compound name matches (`dbPassword`, `SECRET_KEY_BASE`).
const SECRET_KEY_NAME = /(?:api[_ -]?keys?|access[_ -]?key(?:[_ -]?id)?|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|secret[_ -]?key(?:[_ -]?base)?|signing[_ -]?key|encryption[_ -]?key|master[_ -]?key|private[_ -]?key|db[_ -]?pass(?:word)?|passwords?|passwd|passphrase|secrets?|credentials?|pwd|token)/.source;
// Key word, then an optional quote or escaped quote (`\"password\":` in JSON text) and subscript, an optional type
// annotation, then the separator. Separators: `:=`, `:`, `=`, `==`, `===`, `!=`, `!==`, `=>` (PHP and Ruby hashes).
// The line form has no bare `:`: a colon there is a field separator, judged by the colon rule.
const keyHead = (separators: string): string =>
  `(?<!\\[REDACTED:)${SECRET_KEY_NAME}\\\\?["'\`]?\\]?(?:\\s*:[ \\t]*[A-Za-z_][A-Za-z_.<>[\\]|]*(?=[ \\t]*=(?!=)))?\\s*(?:${separators})\\s*`;
const SECRET_KEY_HEAD = keyHead('!==?|===?|=>|:=|:|=');
const SECRET_KEY_LINE = keyHead('!==?|===?|=>|:=|=');
// A string literal keeps its b/r/u/f/@/$ prefix outside the quotes. Escaped quotes (JSON text) and Python triple quotes
// count as literals too. A plain quote is never an escaped one (`(?<!\\)`), so a run of `\"` is scanned in linear time.
// A double quote left open at the end of the line is a literal as well. Backslash escapes apply to " and ' only.
const STRING_VALUE = /[bBrRuUfF@$]{0,2}(?:"""[^\r\n]+?"""|'''[^\r\n]+?'''|\\"(?:(?!\\")[^\r\n])+\\"|\\'(?:(?!\\')[^\r\n])+\\'|(?<!\\)"(?:\\.|[^"\\\r\n])+(?:"|(?=[\r\n]|$))|(?<!\\)'(?:\\.|[^'\\\r\n])+'|`[^`\r\n]+`)/.source;
const STRING_LITERAL = new RegExp(STRING_VALUE, 'g');
// One quoted operand, split into its opening quote, body and closing quote. The backslash tells an escaped quote
// (`\"value\"`, JSON text) from a plain one, so `"abc\\"` closes on its own quote.
const ESCAPED_OPERAND = /^([bBrRuUfF@$]{0,2}\\(?:"|'))([\s\S]*)(\\(?:"|'))$/;
const PLAIN_OPERAND = /^([bBrRuUfF@$]{0,2}(?:"""|'''|["'`]))([\s\S]*?)((?:"""|'''|["'`])?)$/;
// A bare value stops at whitespace, `,`, brackets, quotes, `|`, `&` and `?`. `;()` may sit inside it but not start it.
// It also stops before `;key=`, so the next setting of a connection string stays readable.
const BARE_VALUE = /[^\s,[\]{}<>"'`|&?:;()](?:(?!;[A-Za-z_][\w.-]*=)[^\s,[\]{}<>|&?])*/.source;
// A call such as `getpass()`, `readToken(req)` or `os.environ.get("X", "default")`: its callee and plain arguments are code
// and stay readable, and the string literals inside it are masked. A dotted callee, an empty argument list, or arguments
// with a letter or a quote make a call; digits alone (`Summer(2024)`) are a password. A call ends at its closing parenthesis.
const CALL_VALUE = /(?:[A-Za-z_$]+(?:\.[A-Za-z_$]+)+|[A-Za-z_$]+(?=\(\)|\([^()\r\n]*[A-Za-z"'`]))\((?:[^()\r\n]|\([^()\r\n]*\))*\)(?![\w$(.[])/.source;
const CALL_ONLY = new RegExp(`^${CALL_VALUE}$`);
// A value is a string literal, a call or a bare token. A value chain is `value (operator value)*`, so `a || "b"` and
// `a ? "b" : "c"` have every operand masked.
const VALUE = `(?:${STRING_VALUE}|${CALL_VALUE}|${BARE_VALUE})`;
const VALUE_CHAIN = `${VALUE}(?:[ \\t]*(?:\\|\\||\\?\\?|&&|\\?|:)[ \\t]*${VALUE})*`;
const VALUE_TOKEN = new RegExp(VALUE, 'g');

// Trailing `;` belongs to the surrounding code, and so does a `)` that has no `(` before it (a closing parenthesis belongs to
// the value only when it closes one inside the value, as in `Summer(2024)`). A bare operand also gives up a trailing quote or
// backtick: `log("password: x")` closes its quote after the value. The counts are taken once per call, so a long run of `)`
// costs linear time.
function trimTail(text: string, quotes: boolean): string {
  let opens = 0;
  let closes = 0;
  for (const char of text) {
    if (char === '(') opens += 1;
    else if (char === ')') closes += 1;
  }
  let end = text.length;
  while (end > 0) {
    const last = text[end - 1];
    if (last === ';' || (quotes && (last === '"' || last === "'" || last === '`'))) {
      end -= 1;
    } else if (last === ')' && closes > opens) {
      closes -= 1;
      end -= 1;
    } else {
      break;
    }
  }
  return text.slice(0, end);
}
const trimTerminators = (text: string): string => trimTail(text, false);
const trimOperandEnd = (text: string): string => trimTail(text, true);

// Colon form `key: value`: a bare value is masked only when it is credential-shaped or ends its field.
const COLON_SEPARATOR = /:\s*$/;
// The text right after a value ends its field: end of line or text, or one of `;`, `,`, `)`, `}`, `]`, `>`, `<`, `&`, `#`,
// `|`, `?`, `[`, `{`, or a quote. Those close a value in code and markup as well.
const FIELD_END = /[ \t]*(?:$|[\r\n;,)}\]>&#|"'`?[{<])/y;
const endsFieldAt = (input: string, position: number): boolean => {
  FIELD_END.lastIndex = position;
  return FIELD_END.test(input);
};
const isCredentialShaped = (core: string): boolean => core.length >= 8 && /[^A-Za-z]/.test(core);

// A `-u user:pass` pair is a login on a command that names an HTTP client, and on any command that is not a known non-HTTP
// tool: `git push -u origin:main` and `docker run -u 1000:1000` keep their text, while an unknown tool or a variable holding
// the flags is masked. A command spans the lines joined by a trailing `\` (sh), `^` (cmd) or backtick (PowerShell).
const HTTP_CLIENT_LINE = /curl|wget|httpie|\bxh\b|\bhurl\b|curlie|invoke-(?:web|rest)request|\bhttps?\b|\bftp\b/i;
const NON_HTTP_COMMAND = /^(?:git|docker|podman|kubectl|helm|npm|npx|pnpm|yarn|ssh|scp|sftp|tar|chown|chmod|useradd|usermod|groupadd|make|cargo|go|python3?|pip3?|dotnet|gradle|mvn)\b/i;
const CONTINUED_LINE = /[\\^`][ \t\r]*$/;
// [start, end) of the physical line that holds a position.
function lineBounds(input: string, position: number): [number, number] {
  const start = input.lastIndexOf('\n', position - 1) + 1;
  const newline = input.indexOf('\n', position);
  return [start, newline === -1 ? input.length : newline];
}
// [start, end) of the command a position belongs to: the lines above and below joined by line continuations.
function commandBounds(input: string, position: number): [number, number] {
  let [start, end] = lineBounds(input, position);
  while (start > 0) {
    const [previousStart, previousEnd] = lineBounds(input, start - 1);
    if (!CONTINUED_LINE.test(input.slice(previousStart, previousEnd))) break;
    start = previousStart;
  }
  while (end < input.length && CONTINUED_LINE.test(input.slice(lineBounds(input, end)[0], end))) {
    end = lineBounds(input, end + 1)[1];
  }
  return [start, end];
}
// The verdict stays for the span of one command, so a long line with many `-u` pairs costs one scan, not one per pair.
// The gate is built per masking call and holds the text only while that call runs.
function basicAuthGate(): BasicAuthGate {
  let cachedInput = '';
  let cachedStart = 0;
  let cachedEnd = -1;
  let cachedAnswer = false;
  return (input, position) => {
    if (input !== cachedInput || position < cachedStart || position > cachedEnd) {
      [cachedStart, cachedEnd] = commandBounds(input, position);
      cachedInput = input;
      const command = input.slice(cachedStart, cachedEnd);
      cachedAnswer = HTTP_CLIENT_LINE.test(command) || !NON_HTTP_COMMAND.test(command.trimStart());
    }
    return cachedAnswer;
  };
}

// What follows the colon of a credential: a placeholder-only text stays; a quoted password keeps its quotes.
function maskSecretRest(rest: string): string {
  if (!rest || isPlaceholderOnly(rest)) return rest;
  const quoted = /^(["'])((?:(?!\1)[^\r\n])*)\1$/.exec(rest);
  if (quoted) return `${quoted[1]}${isPlaceholderOnly(quoted[2] ?? '') ? quoted[2] : placeholder('secret')}${quoted[1]}`;
  return placeholder('secret');
}
// The password of one credential word: `user:pass`, `user:"pass"`, `'user:pass'`, `"$USER":"pass"`. The first colon outside
// quotes separates user and password; only the password is replaced.
function maskCredentialWord(word: string): string {
  const wholeQuoted = /^(["'])((?:(?!\1)[^\r\n])*)\1$/.exec(word);
  if (wholeQuoted) return `${wholeQuoted[1]}${maskCredentialWord(wholeQuoted[2] ?? '')}${wholeQuoted[1]}`;
  let quote = '';
  for (let index = 0; index < word.length; index += 1) {
    const char = word[index] ?? '';
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ':') {
      return `${word.slice(0, index + 1)}${maskSecretRest(word.slice(index + 1))}`;
    }
  }
  return word;
}

// Masks one operand of a value chain; operators and spaces never match VALUE_TOKEN, so they pass through.
// `maskBare` decides bare operands only; quoted operands are always masked. A call keeps its code and has its literals masked.
function maskValue(value: string, maskBare: (core: string) => boolean): string {
  const quoted = ESCAPED_OPERAND.exec(value) ?? PLAIN_OPERAND.exec(value);
  if (quoted) {
    const [, open = '', body = '', close = ''] = quoted;
    return isPlaceholderOnly(body) ? value : `${open}${placeholder('secret')}${close}`;
  }
  if (CALL_ONLY.test(value)) return value.replace(STRING_LITERAL, (literal) => maskValue(literal, () => true));
  const core = trimOperandEnd(value);
  // A lone `=` is a separator left over from `:=` or `=>` on a second pass; it holds no value.
  if (/^=+$/.test(core)) return value;
  if (NON_SECRET_VALUES.has(core.toLowerCase()) || CODE_REFERENCE.test(core) || !maskBare(core)) return value;
  return `${placeholder('secret')}${value.slice(core.length)}`;
}

// Ordered most specific first so a generic assignment never splits a recognized token.
const RULES: MaskRule[] = [
  {
    kind: 'private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY[A-Z ]*-----|$)/g,
    replace: whole('private-key'),
    keepLines: block => block
      .split(/\r?\n/)
      .map((_line, index) => (index === 0 ? placeholder('private-key') : ''))
      .join('\n'),
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
    // `Authorization: Basic <base64>`, `"authorization": "Bearer ..."`, `Bearer "<token>"`, or a bare credential after the header
    // name. Runs before bearer-token so the scheme is kept and only the credential is replaced.
    kind: 'authorization-credential',
    pattern: /(authorization["']?\s*[:=]\s*["']?)((?:basic|bearer|digest|negotiate|ntlm|token|apikey|aws4-hmac-sha256)[ \t]+["']?)?([^\s"'`,;()[\]{}<>]{1,})(?![^\s"'`,;()[\]{}<>])(?!\s*["']?\[REDACTED:)/gi,
    replace: (_match, prefix, scheme) => `${prefix}${scheme ?? ''}${placeholder('secret')}`,
  },
  {
    kind: 'bearer-token',
    pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
    replace: (_match, prefix) => `${prefix}${placeholder('bearer-token')}`,
  },
  {
    // A scheme is at most 32 letters, digits, `+` or `-`, and none of them may precede it: a dot before it does not stop the
    // match, and the bounded scheme keeps the scan linear (`\b` here was quadratic on long dotted lines). The user may be empty
    // (`redis://:password@host`). The password runs to the last @ before a space, and may hold `?`, `#` and a single `/`
    // (`pa/ss@host`); `//` starts the next scheme, which keeps the scan short. A query with an @ after a port is over-masked.
    kind: 'url-credentials',
    pattern: /(?<![a-z0-9+-])([a-z][a-z0-9+-]{0,31}:\/\/)(?!\[REDACTED:)[^\s/:@]*:(?:[^\s/]|\/(?!\/))+@/gi,
    replace: (_match, scheme) => `${scheme}${placeholder('url-credentials')}@`,
  },
  {
    // curl, wget and httpie basic auth: `-u user:pass`, `-u=user:pass`, `-uuser:pass`, a combined flag such as `-sSu`, `-U`,
    // `--user`, `--proxy-user`, `--auth`, and httpie's `-a`. The credential is one shell word; only its password is masked, and
    // only on a command that names an HTTP client. Group 1 = flag and separator, group 2 = the credential word.
    kind: 'basic-auth',
    pattern: /((?:^|[\s"'=])(?:--user|--proxy-user|--auth)(?:=|[ \t]+)|(?:^|[\s"'=])-[A-Za-z]*[uUa](?:=|[ \t]*))((?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s"'`<>;|&(),])+)/gm,
    contextual: (match, groups, input, offset, isBasicAuthCommand) => {
      const [flag = '', word = ''] = groups;
      if (!isBasicAuthCommand(input, offset + match.length - match.trimStart().length)) return match;
      const masked = maskCredentialWord(word);
      return masked === word ? match : `${flag}${masked}`;
    },
  },
  {
    // Command-line secrets: `--token value`, `--token=value`, `--password "two words"`. A quoted value runs to its
    // closing quote; a bare value that starts with `-` is the next flag and is kept.
    // Groups: 1 = flag and separator, 2 = quote of a quoted value, 3 = its body, 4 = bare value.
    kind: 'secret-flag',
    pattern: /((?:^|\s)--?(?:[a-z0-9]+[-_])*(?:api[-_]?key|access[-_]?key(?:[-_]?id)?|access[-_]?token|refresh[-_]?token|client[-_]?secret|secret[-_]?key|signing[-_]?key|encryption[-_]?key|master[-_]?key|private[-_]?key|db[-_]?pass(?:word)?|passwords?|passwd|passphrase|secrets?|credentials?|pwd|token)(?:=|[ \t]+))(?:(["'])((?:\\.|(?!\2)[^\\\r\n])+)\2|([^\s"'`<>;|&(),]+))/gim,
    replace: (match, prefix, quote, _body, bare) => {
      if (quote) return `${prefix}${quote}${placeholder('secret')}${quote}`;
      return bare === undefined || bare.startsWith('-') ? match : `${prefix}${placeholder('secret')}`;
    },
  },
  {
    // Key-value secrets for any identifier that contains a secret word: dbPassword, DB_PASSWORD, access_token,
    // x-api-key in a subscript, "token": "...". No word boundary before the key, so compound names match.
    // A type annotation may sit before the separator (password: string = "..."); Go's := and env-style = both count.
    // Group 1 is the key and separator, group 2 the whole value chain, masked operand by operand.
    // A colon-only separator (`key: value`) also looks at the text after the chain, so prose after a secret word stays readable.
    kind: 'secret-assignment',
    pattern: new RegExp(`(${SECRET_KEY_HEAD})(${VALUE_CHAIN})`, 'gi'),
    contextual: (_match, groups, input, offset) => {
      const [head = '', chain = ''] = groups;
      const colonField = COLON_SEPARATOR.test(head);
      const endsField = colonField && endsFieldAt(input, offset + head.length + trimTerminators(chain).length);
      const maskBare = colonField ? (core: string) => endsField || isCredentialShaped(core) : () => true;
      return `${head}${chain.replace(VALUE_TOKEN, (operand) => maskValue(operand, maskBare))}`;
    },
  },
  {
    // On a line that assigns a secret word with `=`-type separators, every string literal after the key is masked: the
    // arguments of a call (`os.environ.get("X", "changeme")`) and the fallback of an `or` (`getenv("X") or "hunter2"`).
    kind: 'secret-assignment',
    pattern: new RegExp(`(${SECRET_KEY_LINE})([^\\r\\n]*)`, 'gi'),
    replace: (_match, head = '', rest = '') => `${head}${rest.replace(STRING_LITERAL, (literal) => maskValue(literal, () => true))}`,
  },
];

// Contextual rules see the text around the match; the others use their replacer, or keep the match when they have none.
function replaceMatch(
  rule: MaskRule,
  options: MaskOptions,
  match: string,
  groups: Array<string | undefined>,
  input: string,
  offset: number,
  isBasicAuthCommand: BasicAuthGate,
): string {
  if (rule.contextual) return rule.contextual(match, groups, input, offset, isBasicAuthCommand);
  const replacer = options.preserveLines && rule.keepLines ? rule.keepLines : rule.replace;
  return replacer ? replacer(match, ...groups) : match;
}

export function maskSecrets(text: string, options: MaskOptions = {}): MaskResult {
  let output = text;
  const counts = new Map<string, number>();
  const isBasicAuthCommand = basicAuthGate();
  for (const rule of RULES) {
    output = output.replace(rule.pattern, (match: string, ...args: unknown[]) => {
      // Capture groups come first; the match offset and the input string follow them. Unmatched groups stay undefined.
      const groups: Array<string | undefined> = [];
      for (const arg of args) {
        if (typeof arg === 'number') break;
        groups.push(typeof arg === 'string' ? arg : undefined);
      }
      const offset = args[groups.length] as number;
      const input = args[groups.length + 1] as string;
      const replaced = replaceMatch(rule, options, match, groups, input, offset, isBasicAuthCommand);
      // Only text that actually changed is counted, so ordinary code references are not reported as redactions.
      if (replaced !== match) counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + 1);
      return replaced;
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
