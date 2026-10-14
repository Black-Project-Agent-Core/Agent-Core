import { describe, expect, it } from 'vitest';
import * as module from '../src/capability-awareness.js';
const m:any=module;
const digest='sha256:'+'a'.repeat(64);
describe('actual-use disclosure',()=>{
 it('keeps primitives and failed tool calls quiet',()=>{
  expect(m.toolCapabilityUse).toBeTypeOf('function');
  for(const name of ['read_file','memory_read','get_config','skills','list_processes','learning']) expect(m.toolCapabilityUse(name,{},true,'tool:1')).toBeNull();
  expect(m.toolCapabilityUse('code_graph',{},false,'tool:2')).toBeNull();
 });
 it('maps semantic tools deterministically without ambiguous browser/file membership',()=>{
  expect(m.toolCapabilityUse).toBeTypeOf('function');
  expect(m.toolCapabilityUse('code_graph',{},true,'tool:1').displayName).toBe('Code Intelligence');
  expect(m.toolCapabilityUse('code_refactor',{},true,'tool:2').capabilityId).toBe('family:code.intelligence');
  expect(m.toolCapabilityUse('read_file',{isUrl:true},true,'tool:3').displayName).toBe('Browser Control');
 });
 it('rejects unsurfaced/rejected/revision-mismatched artifact use',()=>{
  expect(m.artifactCapabilityUse).toBeTypeOf('function');
  const a={kind:'skill',artifactId:'activation-audit',contentDigest:digest,applicability:'applied'};
  expect(m.artifactCapabilityUse(a,{})).toBeNull();
  expect(m.artifactCapabilityUse({...a,applicability:'rejected'},{'skill:activation-audit':digest})).toBeNull();
  expect(m.artifactCapabilityUse({...a,contentDigest:'sha256:'+'b'.repeat(64)},{'skill:activation-audit':digest})).toBeNull();
 });
 it('groups real Skill and tool use once, with no success or benefit claim',()=>{
  expect(m.renderCapabilityNotice).toBeTypeOf('function');
  const skill=m.artifactCapabilityUse({kind:'skill',artifactId:'activation-audit',contentDigest:digest,applicability:'applied'},{'skill:activation-audit':digest});
  const code=m.toolCapabilityUse('code_graph',{},true,'tool:1');
  const text=m.renderCapabilityNotice([skill,code,code]);
  expect(text).toContain('Skill activation-audit');expect(text).toContain('Code Intelligence');
  expect(text.match(/Code Intelligence/g)).toHaveLength(1);
  expect(m.renderCapabilityNotice([])).toBe('');
  expect(m.appendCapabilityNotice(text+'\n\nResult',[skill,code])).toBe(text+'\n\nResult');
 });
 it('normalizes bounded persisted usage, never accepts foreign kind or missing evidence',()=>{
  expect(m.normalizeCapabilityUses).toBeTypeOf('function');
  expect(m.normalizeCapabilityUses([{capabilityId:'evil',displayName:'fake',kind:'external'}])).toEqual([]);
  const x=m.toolCapabilityUse('code_graph',{},true,'tool:1');
  expect(m.normalizeCapabilityUses([x,x])).toHaveLength(1);
 });
});
