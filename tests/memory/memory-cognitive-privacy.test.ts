import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { maskMemoryInput, maskSecrets } from '../../src/memory/privacy-masking.js';
import { scanMemorySafety } from '../../src/memory/safety.js';
import { createCognitiveFixtures } from './memory-cognitive-test-utils.js';

const SECRETS: Array<[string, string, string]> = [
  ['private-key', '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAxyz\n-----END RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEAxyz'],
  ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r', 'dBjftJeZ4CVPmB92K27uhbUJU1p1r'],
  ['aws-access-key', 'AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7EXAMPLE'],
  ['github-token', `ghp_${'a1B2'.repeat(9)}`, 'a1B2a1B2'],
  ['slack-token', 'xoxb-1234567890-abcdefghijkl', '1234567890-abcdefghijkl'],
  ['google-api-key', `AIza${'Sy'.repeat(17)}A`, 'SySySySy'],
  ['provider-api-key', 'sk-proj-abcdefghijklmnopqrstuvwx1234', 'abcdefghijklmnopqrstuvwx1234'],
  ['bearer-token', 'Bearer abcdefghijklmnop1234567890', 'abcdefghijklmnop1234567890'],
  ['url-credentials', 'postgres://admin:s3cr3tpass@db.local:5432/app', 's3cr3tpass'],
  ['secret-assignment', 'password = hunter2hunter2', 'hunter2hunter2'],
  ['secret-assignment', 'api_key: "abc123def456"', 'abc123def456'],
];

describe('secret masking', () => {
  it.each(SECRETS)('masks %s without leaking the value', (kind, text, leaked) => {
    const result = maskSecrets(`before ${text} after`);
    expect(result.text).not.toContain(leaked);
    expect(result.text).toContain('[REDACTED:');
    expect(result.text.startsWith('before ')).toBe(true);
    expect(result.text.endsWith(' after')).toBe(true);
    expect(result.redactions.map((item) => item.kind)).toContain(kind);
    expect(JSON.stringify(result.redactions)).not.toContain(leaked);
    // The masked text must pass the fail-closed backstop that rejects credential-shaped content.
    expect(scanMemorySafety(result.text)).toEqual([]);
  });

  it('is idempotent', () => {
    const once = maskSecrets(SECRETS.map(([, text]) => text).join('\n'));
    const twice = maskSecrets(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.redactions).toEqual([]);
  });

  it('keeps ordinary technical text intact', () => {
    const text = [
      'api_key = process.env.API_KEY',
      'commit 3f2a9c1d8b7e6a5f4c3b2a1d0e9f8a7b6c5d4e3f',
      'the token budget is 8000 tokens',
      'tokens: 12',
      'see https://example.com/docs/path and src/memory/service.ts',
    ].join('\n');
    expect(maskSecrets(text)).toEqual({ text, redactions: [] });
  });

  it('returns the same object when nothing is masked and masks every textual field otherwise', () => {
    const clean = { content: 'plain', tags: ['a'] };
    expect(maskMemoryInput(clean).value).toBe(clean);
    const secret = 'Bearer abcdefghijklmnop1234567890';
    const masked = maskMemoryInput({
      content: secret, title: secret, context: secret, category: secret,
      keywords: [secret], tags: [secret], source: { type: 'note', ref: secret },
    });
    expect(JSON.stringify(masked.value)).not.toContain('abcdefghijklmnop');
    expect(masked.redactions).toEqual([{ kind: 'bearer-token', count: 7 }]);
  });
});

describe('secret masking in MemoryService', () => {
  const fixtures = createCognitiveFixtures();
  afterEach(() => fixtures.cleanup());

  it('keeps rejecting credential-shaped content while the feature is off', async () => {
    const { service } = await fixtures.service();
    await expect(service.remember({ content: 'deploy with password: s3cretvalue99 today' }))
      .rejects.toThrow(/MEMORY_SAFETY_REJECTED/);
  });

  it('masks before the canonical write and records only redaction counts', async () => {
    const { root, service } = await fixtures.service({ features: { secretMasking: true } });
    const saved = await service.remember({ content: 'deploy with password: s3cretvalue99 today', tags: ['ops'] });
    expect(saved.content).toBe('deploy with password: [REDACTED:secret] today');
    expect(saved.evolutionHistory[0]?.details).toEqual({ redactions: { 'secret-assignment': 1 } });
    const onDisk = await readFile(path.join(root, 'notes', `${saved.id}.md`), 'utf8');
    expect(onDisk).not.toContain('s3cretvalue99');

    const updated = await service.update(saved.id, { content: 'rotated Bearer abcdefghijklmnop1234567890 now' });
    expect(updated.content).toBe('rotated Bearer [REDACTED:bearer-token] now');

    const batch = await service.batch([{ op: 'remember', value: { content: 'db at postgres://root:pa55w0rd99@host/x' } }]);
    const created = await service.read(batch.operations[0]!.id, false);
    expect(created?.content).toBe('db at postgres://[REDACTED:url-credentials]@host/x');
    expect(created?.evolutionHistory[0]?.details).toEqual({ redactions: { 'url-credentials': 1 } });
  });

  it('still rejects credential-shaped text that masking does not recognize', async () => {
    const { service } = await fixtures.service({ features: { secretMasking: true } });
    await expect(service.remember({ content: 'passphrase: correct-horse-battery-staple' }))
      .rejects.toThrow(/MEMORY_SAFETY_REJECTED/);
  });
});
