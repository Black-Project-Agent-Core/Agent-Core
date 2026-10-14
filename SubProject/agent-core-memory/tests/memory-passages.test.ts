import { describe, expect, it } from 'vitest';
import { buildMemoryPassages } from '../src/memory/passages.js';
import { memorySemanticRevision } from '../src/memory/disclosure.js';
import { cosineSimilarity } from '../src/memory/embedder.js';
import { LONG_ORACLES, BASELINE_VECTORS, record } from './fixtures/memory-passage/fixture.js';

describe('deterministic derived passages', () => {
  it('covers head, middle and tail with exact consecutive overlapping slices', () => {
    const parent = record('long-oracle', {content:LONG_ORACLES}); const points=Array.from(parent.content);
    const result=buildMemoryPassages(parent);
    expect(result).toMatchObject({version:1,coverage:'complete',totalCodePoints:points.length,coveredThrough:points.length});
    expect(result.passages.length).toBeGreaterThan(30);
    result.passages.forEach((child,i) => {
      expect(child.text).toBe(points.slice(child.start,child.end).join(''));
      expect(child.end-child.start).toBeLessThanOrEqual(600);
      expect(child.parentId).toBe(parent.id); expect(child.parentRevision).toBe(memorySemanticRevision(parent));
      if(i) expect(result.passages[i-1].end-child.start).toBe(80);
    });
    for(const oracle of ['HEAD_ORACLE','MIDDLE_ORACLE','TAIL_ORACLE']) expect(result.passages.some(p=>p.text.includes(oracle))).toBe(true);
    expect(buildMemoryPassages(parent)).toEqual(result);
  });
  it('freezes a functional mean-vector baseline that loses the middle signal', () => {
    const v=BASELINE_VECTORS; const mean=[0.25,0.75];
    expect(cosineSimilarity(v.query,mean)).toBeLessThan(cosineSimilarity(v.query,v.distractor));
    expect(Math.max(...v.oracleChildren.map(c=>cosineSimilarity(v.query,c)))).toBe(1);
  });
  it.each([0,1,600,601,1120,1121])('segments %i points with exact coverage', n => {
    const result=buildMemoryPassages(record('boundary',{content:'x'.repeat(n)}));
    expect(result.coveredThrough).toBe(n); expect(result.coverage).toBe('complete');
    expect(result.passages.length).toBe(n===0?0:n<=600?1:Math.ceil((n-600)/520)+1);
  });
  it('keeps emoji and CRLF source offsets without provider normalization', () => {
    const content=('😀\r\n').repeat(300);const result=buildMemoryPassages(record('unicode',{content}));
    const points=Array.from(content);
    result.passages.forEach(p=>expect(p.text).toBe(points.slice(p.start,p.end).join('')));
    expect(result.coveredThrough).toBe(900);expect(result.passages[0].text).toContain('\r\n');
  });
  it('marks the 128-child cost cap partial without claiming the omitted tail', () => {
    const result=buildMemoryPassages(record('capped',{content:'a'.repeat(80000)}));
    expect(result.passages).toHaveLength(128);expect(result.coverage).toBe('partial');
    expect(result.coveredThrough).toBe(66640);expect(result.totalCodePoints).toBe(80000);
  });
  it('ignores mutable access stats but invalidates IDs and fingerprints for canonical metadata', () => {
    const parent=record(); const before=buildMemoryPassages(parent);
    expect(buildMemoryPassages({...parent,retrievalCount:100,lastAccessedAt:'2026-10-10T00:00:00.000Z'})).toEqual(before);
    expect(buildMemoryPassages({...parent,title:'new title'}).passages[0].id).not.toBe(before.passages[0].id);
    expect(buildMemoryPassages({...parent,title:'new title'}).passages[0].fingerprint).not.toBe(before.passages[0].fingerprint);
  });
});
