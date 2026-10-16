import {describe,it,expect} from 'vitest';
import {verifyWorkflowAnswer} from '../../src/memory/workflow-verifier.js';
import {evaluateEngineeringArtifact} from '../../src/learning/outcome-safe-engineering.js';
describe('non-executing engineering artifact oracle',()=>{
 it('cannot access host constructors, process, modules or schedule microtasks',()=>{
  for(const code of ["() => this.constructor.constructor('return process')().version", "() => globalThis.process.platform", "() => import('node:fs')", "() => Promise.resolve().then(() => {while(true){}})", "() => { while (true) {} }"]){
   expect(verifyWorkflowAnswer({domain:'engineering',tests:[{input:2,expected:4}]},code).verdict).toBe('fail');
  }
 });
 it('supports bounded numeric arrows without eval',()=>{
  expect(evaluateEngineeringArtifact('n => n * 2;',2)).toBe(4);
  expect(evaluateEngineeringArtifact('(x) => (x + 3) * -2',2)).toBe(-10);
  expect(evaluateEngineeringArtifact('x => x * 3',2)).toBe(6);
 });
 it('rejects unknown JavaScript even when it would return an expected result',()=>{
  expect(()=>evaluateEngineeringArtifact('x => Math.imul(x,2)',2)).toThrow(/UNSUPPORTED_ENGINEERING_ARTIFACT/);
  expect(()=>evaluateEngineeringArtifact('x => {return x*2}',2)).toThrow(/UNSUPPORTED_ENGINEERING_ARTIFACT/);
 });
 it('never erases token boundaries or automatic-semicolon-insertion meaning',()=>{
  const code='rows => { const latest = new Map(); for (const row of rows) { const previous = latest.get(row.key); if (!previous || row.sequence > previous.sequence) latest.set(row.key, row); } return [...latest.values()].filter(row => !row.deleted).sort((a,b) => a.key.localeCompare(b.key)).map(row => ({key:row.key,value:row.value})); }';
  expect(()=>evaluateEngineeringArtifact(code.replace('return [...latest','return\n[...latest'),[])).toThrow(/UNSUPPORTED_ENGINEERING_ARTIFACT/);
  expect(()=>evaluateEngineeringArtifact(code.replace('rows =>','r o w s =>'),[])).toThrow(/UNSUPPORTED_ENGINEERING_ARTIFACT/);
 });
 it('rejects reserved parameters, legacy octal and invalid arrow line breaks',()=>{
  for(const code of ['return => 1','() => 010','n\n=> n * 2','x => x--1','x => 1++2'])expect(()=>evaluateEngineeringArtifact(code,2)).toThrow(/UNSUPPORTED_ENGINEERING_ARTIFACT/);
 });
 it('shares one Memory workflow oracle through the generic Learning facade',async()=>{
  const canonical=await import('../../src/memory/workflow-verifier.js');
  expect(canonical.verifyWorkflowAnswer).toBe(verifyWorkflowAnswer);
  expect(canonical.verifyWorkflowAnswer({domain:'engineering',tests:[{input:2,expected:4}]},'n => n*2').verdict).toBe('pass');
 });
 it('verifies both canonical event reducers against independent cases',()=>{
  const rows=[{key:'a',sequence:1,value:3},{key:'a',sequence:2,value:9,deleted:true},{key:'b',sequence:1,value:0}];
  const code='rows => [...new Set(rows.map(row => row.key))].sort().flatMap(key => { const latest = rows.filter(row => row.key === key).sort((a,b) => b.sequence-a.sequence)[0]; return latest.deleted ? [] : [{key,value:latest.value}]; })';
  expect(evaluateEngineeringArtifact(code,rows)).toEqual([{key:'b',value:0}]);
  expect(evaluateEngineeringArtifact(code,[])).toEqual([]);
 });
});
