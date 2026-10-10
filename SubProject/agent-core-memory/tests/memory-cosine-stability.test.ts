import {expect,test} from 'vitest';
import {cosineSimilarity} from '../src/memory/embedder.js';

test.each([1e308,1e-308])('finite extreme scale %s preserves aligned opposite and orthogonal cosine', scale=>{
 expect(cosineSimilarity([scale,0],[scale,0])).toBe(1);
 expect(cosineSimilarity([scale,0],[-scale,0])).toBe(-1);
 expect(cosineSimilarity([scale,0],[0,scale])).toBe(0);
 expect(cosineSimilarity([scale,scale],[scale,-scale])).toBe(0);
});
test('independent scales preserve direction and ordinary numeric behavior',()=>{
 expect(cosineSimilarity([1e308,1e308],[1e-308,1e-308])).toBeCloseTo(1,14);
 expect(cosineSimilarity([3,4],[4,3])).toBeCloseTo(0.96,14);
 expect(cosineSimilarity([1,2,3],[-1,4,2])).toBeCloseTo(13/Math.sqrt(294),14);
});
test('zero empty and mismatched dimensions retain neutral cosine',()=>{
 expect(cosineSimilarity([0,0],[1,2])).toBe(0);
 expect(cosineSimilarity([1,2],[0,0])).toBe(0);
 expect(cosineSimilarity([],[])).toBe(0);
 expect(cosineSimilarity([1],[1,2])).toBe(0);
});
