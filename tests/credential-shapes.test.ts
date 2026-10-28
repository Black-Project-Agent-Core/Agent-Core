import { describe, expect, it } from 'vitest';
import { redactSensitiveString } from '../src/security/redaction.js';
import { isCredentialFileName } from '../src/security/credential-names.js';

// Fake values, assembled from pieces so no real-looking key sits in the source.
const hex = '0123456789abcdef0123456789abcdef0123456789';
const shapes: Array<[string, string]> = [
  ['OpenRouter style key', 'sk-' + 'or-v1-' + hex],
  ['Anthropic style key', 'sk-' + 'ant-api03-' + hex],
  ['plain sk key with a digit', 'sk-' + 'Abcdefghijklmnopqrstuvwx1'],
  ['GitHub token', 'gh' + 'p_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'],
  ['GitHub fine-grained token', 'github' + '_pat_' + '11ABCDEFG0abcdefghij_klmnopqrstuvwxyz'],
  ['AWS access key id', 'AK' + 'IA' + 'IOSFODNN7EXAMPLE'],
  ['Google API key', 'AI' + 'za' + 'SyA1234567890abcdefghijklmnopqrstuv'],
  ['Slack token', 'xo' + 'xb-' + '1234567890-abcdefghij'],
  ['JWT', 'ey' + 'JhbGciOiJIUzI1NiJ9.' + 'eyJzdWIiOiIxMjM0NTY3ODkwIn0.' + 'abcdefghijklmnop'],
];

describe('known credential shapes are redacted without a label', () => {
  it.each(shapes)('%s', (_name, secret) => {
    const redacted = redactSensitiveString(`please use ${secret} for the call`);
    expect(redacted).not.toContain(secret);
    expect(redacted).toContain('[REDACTED');
    expect(redacted.startsWith('please use ')).toBe(true);
    expect(redacted.endsWith(' for the call')).toBe(true);
  });

  it('removes a private key block and keeps the text around it', () => {
    const block = '-----BEGIN ' + 'RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0123456789+/abcdef==\n-----END RSA PRIVATE KEY-----';
    const redacted = redactSensitiveString('before\n' + block + '\nafter');
    expect(redacted).not.toContain('MIIEowIBAAKCAQEA');
    expect(redacted).toContain('[REDACTED PRIVATE KEY]');
    expect(redacted).toContain('before');
    expect(redacted).toContain('after');
  });

  it('removes credentials embedded in a URL but not a plain host and port', () => {
    expect(redactSensitiveString('clone https://user:hunter2@git.example/repo.git')).toBe('clone https://[REDACTED]@git.example/repo.git');
    expect(redactSensitiveString('http://localhost:8765/health ssh://git@github.com/org/repo')).toBe('http://localhost:8765/health ssh://git@github.com/org/repo');
  });

  it('leaves ordinary words and short prefixes alone', () => {
    const text = 'the task-force-with-a-very-long-name-and-no-digits stays, sk-learn too, AKIA is a prefix, ghp_short';
    expect(redactSensitiveString(text)).toBe(text);
  });

  it('terminates on hostile input of every shape', () => {
    const hostile = [
      'sk-'.repeat(20_000),
      '-----BEGIN PRIVATE KEY-----'.repeat(3_000),
      'eyJ' + 'a'.repeat(200_000),
      '://' + 'a'.repeat(100_000),
      'A'.repeat(300_000),
    ];
    for (const text of hostile) expect(typeof redactSensitiveString(text)).toBe('string');
  });
});

describe('credential file names include the copies editors and Windows leave behind', () => {
  it.each([
    '.env', '.env.local', '.env~', '.env.bak', '.env.swp', '.ENV.', '.env:Zone.Identifier', '.env ',
    'id_rsa', 'id_rsa.bak', 'id_rsa~', '.id_rsa.swp', 'id_ed25519.old', '.npmrc', '.npmrc.orig', '.netrc',
    'server.pem', 'server.pem.bak', 'server.pem~', 'tls.key', 'store.p12.old', '.aws', '.ssh',
  ])('treats %s as a credential file', name => {
    expect(isCredentialFileName(name)).toBe(true);
  });

  it.each(['README.md', 'index.ts', 'environment.ts', 'envelope.json', 'key.txt', 'monkey.png', 'id_rsa_notes.md', 'bak', '~'])(
    'does not treat %s as a credential file', name => {
      expect(isCredentialFileName(name)).toBe(false);
    });
});
