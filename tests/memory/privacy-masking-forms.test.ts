import { describe, expect, it } from 'vitest';
import { maskMemoryInput, maskSecrets } from '../../src/memory/privacy-masking.js';
import { scanMemorySafety } from '../../src/memory/safety.js';

// Forms the code_orient review found leaking. Each must lose its value on the Memory path as well,
// because Memory and code snippets share one masker.
const LEAKING_FORMS: Array<[string, string]> = [
  ['node app.js --token abc123tokenvalue', 'abc123tokenvalue'],
  ['Authorization: Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA=='],
  ['headers["x-api-key"] = "keyvalue1234567890"', 'keyvalue1234567890'],
  ['const dbPassword = "hunter2hunter2";', 'hunter2hunter2'],
  ['DB_PASSWORD=correcthorsebattery', 'correcthorsebattery'],
  ["const session = { access_token: 'abcdefghijklmnop' };", 'abcdefghijklmnop'],
  ['{"refresh_token": "rtok_abcdefghijkl"}', 'rtok_abcdefghijkl'],
  ['password := "gopherSecretValue"', 'gopherSecretValue'],
  ['const apiToken = `tickValueOnly`;', 'tickValueOnly'],
  ['const password: string = "correcthorsebattery";', 'correcthorsebattery'],
  ['Server=db;Password=secret;', '=secret;'],
  ['const privateKey = "MIIEvQabcdefghijk";', 'MIIEvQabcdefghijk'],
  ['Authorization: Bearer abc', 'abc'],
  ['node app.js --password "two words here"', 'two words here'],
  ["node app.js --api-key 'abc123def456'", 'abc123def456'],
  ["node app.js --token 'abc123def456'", 'abc123def456'],
  ['token = this.token || "hardcodedtoken1234"', 'hardcodedtoken1234'],
  ['password = pw ? "aaaa1111bbbb" : "x"', 'aaaa1111bbbb'],
  ['const password = "pa\\"ssword12345";', 'ssword12345'],
  ['const password = b"hunter2hunter2";', 'hunter2hunter2'],
  ['DB_PASSWORD=abc;def12345', 'def12345'],
  ['password=Pa(ss)word123', 'Pa(ss)word123'],
  ['if (password === "hunter2hunter2") {}', 'hunter2hunter2'],
  ['secrets = "shh-very-secret-value"', 'shh-very-secret-value'],
  ['credentials: "userpass12345"', 'userpass12345'],
  ['curl -u admin:SuperSecret123 https://a.test', 'SuperSecret123'],
  ['password: hunter2', 'hunter2'],
  ['curl \\\n  -u admin:SuperSecret123 \\\n  https://a.test', 'SuperSecret123'],
  ['curl -uadmin:SuperSecret123 https://a.test', 'SuperSecret123'],
  ['curl --proxy-user admin:SuperSecret123 https://a.test', 'SuperSecret123'],
  ['http -a admin:SuperSecret123 https://a.test', 'SuperSecret123'],
  ['REDIS_URL=redis://:hunter2hunter2@localhost:6379/0', 'hunter2hunter2'],
  ['DATABASE_URL=mongodb://user:pa@ss@host/db', 'pa@ss'],
  ["'password' => 'hunter2hunter2',", 'hunter2hunter2'],
  ['{\\"password\\":\\"hunter2hunter2\\"}', 'hunter2hunter2'],
  ['password = getenv("X") or "hunter2hunter2"', 'hunter2hunter2'],
  ['$password = ConvertTo-SecureString "hunter2hunter2" -AsPlainText', 'hunter2hunter2'],
  ['secret = """hunter2hunter2"""', 'hunter2hunter2'],
  ['api_keys: abc123def456', 'abc123def456'],
  ['<td>password: hunter2hunter2</td>', 'hunter2hunter2'],
  ['SECRET_KEY_BASE=abcdef0123456789', 'abcdef0123456789'],
  ['log("password: hunter2hunter2")', 'hunter2hunter2'],
  ['curl -sSu admin:SuperSecret123 https://a.test', 'SuperSecret123'],
  ['curl -u admin:"SuperSecret123" https://a.test', 'SuperSecret123'],
  ["curl -u 'admin:Sup\"er12345' https://a.test", 'Sup"er12345'],
  ['password = "abc123', 'abc123'],
  ['postgres://user:pa/ss1234@host/db', 'ss1234'],
  ['password = Summer(2024)', 'Summer(2024)'],
  ['Authorization: Bearer "abc123tokenvalue"', 'abc123tokenvalue'],
  ['password:=hunter2hunter2', 'hunter2hunter2'],
  ['password=Winter2024(Fall)', 'Winter2024'],
  ['password = Pa.ss1234.word(x)', 'Pa.ss1234'],
  ['secret: abcdefgh1234:xyz', 'abcdefgh1234'],
  ['Authorization: Bearer abc123!def456', 'def456'],
  ['token: Hunt3r2024xYZ==', 'Hunt3r2024xYZ'],
  ['password: Hunt3r2024x===', 'Hunt3r2024x'],
  ['password: Hunt3r2024x = foo', 'Hunt3r2024x'],
];

describe('secret masking for Memory writes', () => {
  it.each(LEAKING_FORMS)('removes the value of %s', (form, leaked) => {
    const result = maskSecrets(form);
    expect(result.text).not.toContain(leaked);
    expect(result.text).toContain('[REDACTED:');
    // Masking is idempotent: a second pass finds nothing left to mask.
    expect(maskSecrets(result.text).redactions).toEqual([]);
  });

  it.each(LEAKING_FORMS)('passes the fail-closed backstop once masked: %s', (form) => {
    expect(scanMemorySafety(maskSecrets(form).text)).toEqual([]);
  });

  it('keeps type annotations and code references readable', () => {
    const text = [
      'interface Creds { password: string; }',
      'api_key = process.env.API_KEY',
      'const token = config.token',
      'if (token === undefined)',
    ].join('\n');
    expect(maskSecrets(text)).toEqual({ text, redactions: [] });
  });

  it('reports only text that changed, by kind', () => {
    const result = maskSecrets('run --token abc123tokenvalue, password: s3cretvalue99');
    expect(result.redactions).toEqual(expect.arrayContaining([
      { kind: 'secret-flag', count: 1 },
      { kind: 'secret-assignment', count: 1 },
    ]));
    expect(result.text).toContain('run --token [REDACTED:secret], password: [REDACTED:secret]');
  });

  it('masks every textual Memory field that carries one of these forms', () => {
    const masked = maskMemoryInput({
      content: 'node app.js --token abc123tokenvalue',
      tags: ['Authorization: Basic dXNlcjpwYXNzd29yZA=='],
    });
    const serialized = JSON.stringify(masked.value);
    expect(serialized).not.toContain('abc123tokenvalue');
    expect(serialized).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(masked.redactions).toEqual(expect.arrayContaining([
      { kind: 'secret-flag', count: 1 },
      { kind: 'authorization-credential', count: 1 },
    ]));
  });

  it('keeps the line count of a key block when asked to, so line numbers still match the source', () => {
    const pem = [
      'before',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAxyz',
      'MIIEowIBAAKCAQEAabc',
      '-----END RSA PRIVATE KEY-----',
      'after',
    ].join('\n');

    const kept = maskSecrets(pem, { preserveLines: true }).text.split('\n');
    expect(kept).toHaveLength(6);
    expect(kept[0]).toBe('before');
    expect(kept[5]).toBe('after');
    expect(kept.join('\n')).not.toContain('MIIEowIBAAKCAQEAxyz');

    expect(maskSecrets(pem).text).toBe('before\n[REDACTED:private-key]\nafter');
  });

  it('keeps masking fast on one long line', () => {
    // 'a.' (200 KB) is the input that made the old `\b` URL rule quadratic (about 20 s); '://' is the fragment the review named.
    for (const input of ['a'.repeat(200000), '://'.repeat(70000), 'a.'.repeat(100000)]) {
      const started = Date.now();
      maskSecrets(input);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  });

  it('keeps the trailing ; of a bare value outside the placeholder', () => {
    expect(maskSecrets('Server=db;Password=secret;').text).toBe('Server=db;Password=[REDACTED:secret];');
  });

  it('masks the fallback literal after a code reference and keeps the reference', () => {
    // scanMemorySafety still refuses this form: the kept reference looks credential-shaped, so Memory fails closed.
    const result = maskSecrets('const password = process.env.PASSWORD || "devsecret123";');
    expect(result.text).toBe('const password = process.env.PASSWORD || "[REDACTED:secret]";');
    expect(maskSecrets(result.text).redactions).toEqual([]);
  });

  it('keeps prose that uses a secret word intact, on both Memory entry points', () => {
    for (const sentence of [
      'Agent Core stores a token: see docs for the refresh flow.',
      'secret: rotate it before release',
      'credentials: read from the keychain',
    ]) {
      expect(maskSecrets(sentence)).toEqual({ text: sentence, redactions: [] });
      const input = { content: sentence };
      expect(maskMemoryInput(input).value).toBe(input);
    }
  });

  it('masks a colon-form bare value only when credential-shaped or when it ends the field', () => {
    expect(maskSecrets('credentials: keychain').text).toBe('credentials: [REDACTED:secret]');
    expect(maskSecrets('credentials: read from the keychain').text).toBe('credentials: read from the keychain');
    expect(maskSecrets('password: hunter2').text).toBe('password: [REDACTED:secret]');
    expect(maskSecrets('token: abc123def456 is the key').text).toBe('token: [REDACTED:secret] is the key');
    expect(maskSecrets('credentials: keychain; next').text).toBe('credentials: [REDACTED:secret]; next');
  });

  it('masks chain operands by the same rule: quoted always, bare by the colon test', () => {
    // The chain does not end the field here, so a bare word stays and a quoted operand is still masked.
    expect(maskSecrets('token: see || "quotedvalue1" for the refresh flow.').text)
      .toBe('token: see || "[REDACTED:secret]" for the refresh flow.');
    expect(maskSecrets('token: abc123def456 || "quotedvalue1" for the refresh flow.').text)
      .toBe('token: [REDACTED:secret] || "[REDACTED:secret]" for the refresh flow.');
    // When the chain does end the field, its bare operands follow the field-end test too.
    expect(maskSecrets('password: pw || abc123def456').text).toBe('password: [REDACTED:secret] || [REDACTED:secret]');
  });

  it('masks only the password of a curl-style basic-auth pair', () => {
    expect(maskSecrets('curl -u admin:SuperSecret123 https://a.test')).toEqual({
      text: 'curl -u admin:[REDACTED:secret] https://a.test',
      redactions: [{ kind: 'basic-auth', count: 1 }],
    });
    expect(maskSecrets('curl -u=admin:SuperSecret123 https://a.test').text)
      .toBe('curl -u=admin:[REDACTED:secret] https://a.test');
    expect(maskSecrets('curl --user admin:SuperSecret123 https://a.test').text)
      .toBe('curl --user admin:[REDACTED:secret] https://a.test');
    expect(maskSecrets("curl -u 'admin:SuperSecret123' https://a.test").text)
      .toBe("curl -u 'admin:[REDACTED:secret]' https://a.test");
    expect(maskSecrets('curl -u admin https://a.test')).toEqual({ text: 'curl -u admin https://a.test', redactions: [] });
  });

  it('treats -u as basic auth only on an HTTP client line, so git and docker flags keep their text', () => {
    expect(maskSecrets('git push -u origin:main').text).toBe('git push -u origin:main');
    expect(maskSecrets('docker run -u 1000:1000 app').text).toBe('docker run -u 1000:1000 app');
    expect(maskSecrets('curl -u admin:SuperSecret123 https://a.test').text)
      .toBe('curl -u admin:[REDACTED:secret] https://a.test');
  });

  it('stops a bare connection-string value before the next setting', () => {
    expect(maskSecrets('Server=db;Password=secret;Database=x').text)
      .toBe('Server=db;Password=[REDACTED:secret];Database=x');
    expect(maskSecrets('DB_PASSWORD=abc;def12345').text).toBe('DB_PASSWORD=[REDACTED:secret]');
  });

  it('keeps calls, code and lines without a secret readable', () => {
    for (const code of [
      'const token = readToken(req);',
      'password = getpass()',
      'const secret = crypto.randomBytes(32);',
      'git remote add origin ssh://git@github.com:22/repo.git',
      'redis://localhost:6379/0',
    ]) {
      expect(maskSecrets(code)).toEqual({ text: code, redactions: [] });
    }
  });

  it('masks the curl and httpie basic-auth password wherever the flag sits in the command', () => {
    expect(maskSecrets('curl \\\n  -u admin:SuperSecret123 \\\n  https://a.test').text)
      .toBe('curl \\\n  -u admin:[REDACTED:secret] \\\n  https://a.test');
    expect(maskSecrets('curl -uadmin:SuperSecret123 https://a.test').text)
      .toBe('curl -uadmin:[REDACTED:secret] https://a.test');
    expect(maskSecrets('curl --proxy-user admin:SuperSecret123 https://a.test').text)
      .toBe('curl --proxy-user admin:[REDACTED:secret] https://a.test');
    expect(maskSecrets('http -a admin:SuperSecret123 https://a.test').text)
      .toBe('http -a admin:[REDACTED:secret] https://a.test');
  });

  it('masks a URL password without a user name, and every part of a password that holds an @', () => {
    expect(maskSecrets('REDIS_URL=redis://:hunter2hunter2@localhost:6379/0').text)
      .toBe('REDIS_URL=redis://[REDACTED:url-credentials]@localhost:6379/0');
    expect(maskSecrets('mongodb://user:pa@ss@host/db').text).toBe('mongodb://[REDACTED:url-credentials]@host/db');
  });

  it('masks PHP and Ruby hash values, JSON text with escaped quotes, and Python triple-quoted values', () => {
    expect(maskSecrets("'password' => 'hunter2hunter2',").text).toBe("'password' => '[REDACTED:secret]',");
    expect(maskSecrets('{\\"password\\":\\"hunter2hunter2\\"}').text).toBe('{\\"password\\":\\"[REDACTED:secret]\\"}');
    expect(maskSecrets('secret = """hunter2hunter2"""').text).toBe('secret = """[REDACTED:secret]"""');
  });

  it('masks the string literals a secret is assigned from, and keeps the call that makes them', () => {
    // The kept reference still looks credential-shaped to the backstop, so Memory refuses this text: fail-closed by design.
    const call = maskSecrets('password = os.environ.get("DB_PASSWORD", "changeme123")').text;
    expect(call).toBe('password = os.environ.get("[REDACTED:secret]", "[REDACTED:secret]")');
    expect(scanMemorySafety(call).map((finding) => finding.code)).toEqual(['credential']);
    expect(maskSecrets('password = getenv("X") or "hunter2hunter2"').text)
      .toBe('password = getenv("[REDACTED:secret]") or "[REDACTED:secret]"');
    expect(maskSecrets('$password = ConvertTo-SecureString "hunter2hunter2" -AsPlainText').text)
      .toBe('$password = [REDACTED:secret] "[REDACTED:secret]" -AsPlainText');
  });

  it('masks a colon value that closes at a tag, a bracket or a quote', () => {
    expect(maskSecrets('<td>password: hunter2hunter2</td>').text).toBe('<td>password: [REDACTED:secret]</td>');
    expect(maskSecrets('log("password: hunter2hunter2")').text).toBe('log("password: [REDACTED:secret]")');
  });

  it('masks a long line of basic-auth pairs in one pass', () => {
    const started = Date.now();
    maskSecrets(`curl ${' -u a:b'.repeat(40000)}`);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('keeps long lines of escaped quotes linear', () => {
    for (const text of [`password=${'\\"'.repeat(60000)}`, `token=1 ${'\\"\\"\\"'.repeat(30000)}`]) {
      const started = Date.now();
      maskSecrets(text);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  });

  it('masks the password of a combined short flag such as -sSu', () => {
    expect(maskSecrets('curl -sSu admin:SuperSecret123 https://a.test').text)
      .toBe('curl -sSu admin:[REDACTED:secret] https://a.test');
  });

  it('masks a quoted password after a bare user, and one quoted with the other quote type', () => {
    expect(maskSecrets('curl -u admin:"SuperSecret123" https://a.test').text)
      .toBe('curl -u admin:"[REDACTED:secret]" https://a.test');
    expect(maskSecrets("curl -u admin:'SuperSecret123' https://a.test").text)
      .toBe("curl -u admin:'[REDACTED:secret]' https://a.test");
    expect(maskSecrets('curl -u "$USER":"SuperSecret123" https://a.test').text)
      .toBe('curl -u "$USER":"[REDACTED:secret]" https://a.test');
    expect(maskSecrets("curl -u 'admin:Sup\"er12345' https://a.test").text)
      .toBe("curl -u 'admin:[REDACTED:secret]' https://a.test");
  });

  it('reads cmd (^) and PowerShell (`) line ends as continuations, and names more HTTP clients', () => {
    expect(maskSecrets('curl.exe ^\n  -u admin:SuperSecret123 ^\n  https://a.test').text)
      .toBe('curl.exe ^\n  -u admin:[REDACTED:secret] ^\n  https://a.test');
    expect(maskSecrets('xh -a admin:SuperSecret123 a.test').text).toBe('xh -a admin:[REDACTED:secret] a.test');
    expect(maskSecrets('export CURL_OPTS="-u admin:SuperSecret123"').text)
      .toBe('export CURL_OPTS="-u admin:[REDACTED:secret]"');
  });

  it('does not let a placeholder-looking text protect the password around it', () => {
    for (const text of [
      'password = "[REDACTED:x] hunter2hunter2"',
      'curl -u admin:[REDACTED:x]SuperSecret123 https://a.test',
    ]) {
      const masked = maskSecrets(text).text;
      expect(masked).not.toContain('hunter2hunter2');
      expect(masked).not.toContain('SuperSecret123');
    }
  });

  it('masks a call-shaped password unless its arguments are code', () => {
    expect(maskSecrets('password = Passw0rd(1)').text).toBe('password = [REDACTED:secret]');
    expect(maskSecrets('password = Summer(2024)').text).toBe('password = [REDACTED:secret]');
  });

  it('masks an unterminated quoted value and a URL password that holds a slash', () => {
    expect(maskSecrets('password = "abc123').text).not.toContain('abc123');
    expect(maskSecrets('postgres://user:pa/ss1234@host/db').text).toBe('postgres://[REDACTED:url-credentials]@host/db');
  });

  it('masks a quoted value that ends in an escaped backslash, and the literal after it', () => {
    expect(maskSecrets('password = "abc\\\\" + "zzz12345"').text).not.toContain('zzz12345');
  });

  it('masks a quoted Bearer token in a header', () => {
    expect(maskSecrets('Authorization: Bearer "abc123tokenvalue"').text)
      .toBe('Authorization: Bearer "[REDACTED:secret]"');
  });

  it('masks a login flag in a variable or an unknown tool, and keeps the non-HTTP tools that use -u', () => {
    expect(maskSecrets('auth="-u admin:SuperSecret123"').text).toBe('auth="-u admin:[REDACTED:secret]"');
    expect(maskSecrets('git push -u origin:main').text).toBe('git push -u origin:main');
    expect(maskSecrets('docker run -u 1000:1000 app').text).toBe('docker run -u 1000:1000 app');
  });

  it('masks a colon-equals value that starts with =, and a password glued to a dotted scheme', () => {
    expect(maskSecrets('Secret : =ji8V8fIL').text).toBe('Secret : [REDACTED:secret]');
    expect(maskSecrets('.https://user:SuperSecret123@host').text).toBe('.https://[REDACTED:url-credentials]@host');
  });

  it('masks a password that holds parentheses after digits', () => {
    expect(maskSecrets('password=Summer(2024)').text).toBe('password=[REDACTED:secret]');
  });

  it('masks a URL password that holds a hash or a question mark', () => {
    expect(maskSecrets('https://user:abc#def456@host/x').text).toBe('https://[REDACTED:url-credentials]@host/x');
    expect(maskSecrets('https://user:abc?def456@host/x').text).toBe('https://[REDACTED:url-credentials]@host/x');
  });

  it('stays linear on a long run of closing parentheses', () => {
    for (const text of [`password=a${')'.repeat(40000)}`, `password: a${')'.repeat(40000)}`]) {
      const started = Date.now();
      maskSecrets(text);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  });

  it('masks a colon value that holds a second colon, and keeps the whole value out of the text', () => {
    expect(maskSecrets('secret: abcdefgh1234:xyz').text).toBe('secret: [REDACTED:secret]');
    expect(maskSecrets('password: Winter2024:x').text).not.toContain('Winter2024');
  });

  it('masks a bare value that holds a call-like shape with digits, and a dotted name with digits', () => {
    expect(maskSecrets('password=Winter2024(Fall)').text).toBe('password=[REDACTED:secret]');
    expect(maskSecrets('password = Pa.ss1234.word(x)').text).toBe('password = [REDACTED:secret]');
  });

  it('masks the whole Bearer token, including characters that end a bare word', () => {
    expect(maskSecrets('Authorization: Bearer abc123!def456').text).toBe('Authorization: Bearer [REDACTED:secret]');
  });
});
