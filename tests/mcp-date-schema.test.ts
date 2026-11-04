import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { memoryBatch, memoryRemember, memorySearch, memoryUpdate } from '../src/memory/mcp/schemas.js';
import { getRecentToolCalls } from '../src/mcp/rdc-schemas.js';

const instant = '2028-02-29T12:34:56.123456Z';
const invalid = ['not-a-date', '2026-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-01-01', '2026-01-01T25:00:00Z', '2026-01-01T00:00:00+02:00'];

describe('MCP ISO date transport and parser contract', () => {
  it('advertises date-time without repeating its generated regex', () => {
    for (const schema of [memorySearch, memoryRemember, getRecentToolCalls]) {
      const properties = schema.toJSONSchema().properties as Record<string, any>;
      const field = properties.asOf ?? properties.expiresAt ?? properties.since;
      expect(field).toMatchObject({ type: 'string', format: 'date-time' });
      expect(field.pattern).toBeUndefined();
    }
    const schema = memoryRemember.toJSONSchema() as any;
    expect(schema.properties.links.items.properties.createdAt).toMatchObject({ format: 'date-time' });
    expect(schema.properties.links.items.properties.createdAt.pattern).toBeUndefined();
  });

  it('keeps nested batch and nullable update date advertisements compact and explicit', () => {
    let dates = 0;
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const value = node as Record<string, unknown>;
      if (value.format === 'date-time') {
        dates++;
        expect(value.pattern).toBeUndefined();
        expect(value.description).toContain('UTC');
        expect(value.description).toContain('ending in Z');
      }
      for (const child of Object.values(value)) visit(child);
    };
    visit(memoryBatch.toJSONSchema());
    visit(memoryUpdate.toJSONSchema());
    expect(dates).toBeGreaterThanOrEqual(10);
  });

  it('preserves the exact accepted value and the original Zod date acceptance', () => {
    for (const value of [instant, '2026-01-01T00:00:00Z', ...invalid]) {
      const accepted = z.iso.datetime().safeParse(value).success;
      expect(memorySearch.safeParse({ query: 'fixture', asOf: value }).success).toBe(accepted);
      expect(memoryRemember.safeParse({ content: 'fixture', expiresAt: value }).success).toBe(accepted);
      expect(getRecentToolCalls.safeParse({ since: value }).success).toBe(accepted);
    }
    expect(memorySearch.parse({ query: 'fixture', asOf: instant }).asOf).toBe(instant);
    expect(memoryRemember.parse({ content: 'fixture', expiresAt: instant }).expiresAt).toBe(instant);
  });

  it('keeps optional and nullable fields distinct and rejects empty updates', () => {
    expect(memorySearch.safeParse({ query: 'fixture' }).success).toBe(true);
    expect(memorySearch.safeParse({ query: 'fixture', asOf: null }).success).toBe(false);
    expect(memoryRemember.safeParse({ content: 'fixture', expiresAt: null }).success).toBe(false);
    expect(memoryUpdate.parse({ id: 'fixture', expiresAt: null }).expiresAt).toBeNull();
    expect(memoryUpdate.safeParse({ id: 'fixture' }).success).toBe(false);
  });

  it('preserves validation in nested batch links and update patches', () => {
    const link = { targetId: 'target', type: 'related', strength: 0.5, createdAt: instant };
    expect(memoryBatch.parse({ operations: [{ op: 'remember', value: { content: 'fixture', links: [link], expiresAt: instant } }] }).operations).toHaveLength(1);
    for (const value of invalid) {
      expect(memoryBatch.safeParse({ operations: [{ op: 'remember', value: { content: 'fixture', links: [{ ...link, createdAt: value }] } }] }).success).toBe(false);
      expect(memoryBatch.safeParse({ operations: [{ op: 'update', id: 'fixture', patch: { expiresAt: value } }] }).success).toBe(false);
    }
    expect(memoryBatch.safeParse({ operations: [{ op: 'link', id: 'fixture', link: { ...link, validFrom: '2026-02-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z' } }] }).success).toBe(false);
    expect(memoryBatch.parse({ operations: [{ op: 'update', id: 'fixture', patch: { expiresAt: null } }] }).operations).toHaveLength(1);
  });
});
