import { describe, expect, it } from 'vitest';
import { normalizeMemorySemanticProfile } from '../src/memory/semantic-profile.js';

describe('bounded memory semantic profile', () => {
  it('redacts before hashing and canonicalizes key/array order deterministically', () => {
    const first = normalizeMemorySemanticProfile({
      title: 'PPT Font Unit Regression',
      concepts: ['font size', 'EMU', 'EMU', '  '],
      constraints: ['Authorization: Bearer secret-token'],
      futureRelevance: ['layout regression', 'pptx conversion'],
    });
    const second = normalizeMemorySemanticProfile({
      futureRelevance: ['pptx conversion', 'layout regression', 'layout regression'],
      constraints: ['Authorization: Bearer another-token'],
      concepts: ['EMU', 'font size'],
      title: 'PPT Font Unit Regression',
    });

    expect(first.profile).toEqual({
      concepts: ['EMU', 'font size'],
      constraints: ['[REDACTED:BEARER]'],
      futureRelevance: ['layout regression', 'pptx conversion'],
      title: 'PPT Font Unit Regression',
    });
    expect(first.canonicalJson).toBe(second.canonicalJson);
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.canonicalJson).not.toContain('secret-token');
  });

  it('removes empty optional values and rejects unknown keys', () => {
    const normalized = normalizeMemorySemanticProfile({
      title: '   ',
      concepts: ['', '  '],
      intent: 'preserve source-native geometry',
    });
    expect(normalized.profile).toEqual({ intent: 'preserve source-native geometry' });

    expect(() => normalizeMemorySemanticProfile({
      title: 'Valid',
      surprise: 'not part of the approved profile shape',
    } as never)).toThrow('MEMORY_SEMANTIC_PROFILE_INVALID');
  });

  it('enforces string, array item, array count, and total UTF-8 byte ceilings', () => {
    expect(() => normalizeMemorySemanticProfile({ title: 'x'.repeat(2001) }))
      .toThrow('MEMORY_SEMANTIC_PROFILE_TOO_LARGE');
    expect(() => normalizeMemorySemanticProfile({ concepts: ['x'.repeat(501)] }))
      .toThrow('MEMORY_SEMANTIC_PROFILE_TOO_LARGE');
    expect(() => normalizeMemorySemanticProfile({ concepts: Array.from({ length: 33 }, (_, index) => `concept-${index}`) }))
      .toThrow('MEMORY_SEMANTIC_PROFILE_TOO_LARGE');
    expect(() => normalizeMemorySemanticProfile({
      title: 't'.repeat(2000),
      summary: 's'.repeat(2000),
      intent: 'i'.repeat(2000),
      outcome: 'o'.repeat(2000),
      failureMode: 'f'.repeat(2000),
      solution: 'u'.repeat(2000),
      concepts: Array.from({ length: 8 }, (_, index) => `${index}-${'c'.repeat(498)}`),
      entities: Array.from({ length: 8 }, (_, index) => `${index}-${'e'.repeat(498)}`),
    })).toThrow('MEMORY_SEMANTIC_PROFILE_TOO_LARGE');
  });
});
