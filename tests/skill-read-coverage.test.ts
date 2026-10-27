import { expect, it } from 'vitest';
import { inspectedSkillArtifacts, normalizeSkillReadCoverage, observeSkillRead, skillReferenceRead, skillInstructionsRead, skillReadCoverageFromMessages } from '../src/capability-awareness.js';
import { normalizeSkillReadResource } from '../src/skills/resource-path.js';
import type { AgentModelMessage } from '../src/agent-provider.js';

const name='source-review', digest='sha256:'+'a'.repeat(64), other='sha256:'+'b'.repeat(64);
const args=(offset=0,expectedActiveDigest=digest)=>({action:'read',name,expectedActiveDigest,offset});
function fragment(content:string,offset:number,total:number,revision=digest){
 const end=offset+Buffer.byteLength(content,'utf8');
 return JSON.stringify({name,digest:revision,source:'SKILL.md',delivery:'instruction-fragment',executionAuthority:false,
  content,offset,nextOffset:end===total?null:end,totalContentBytes:total,truncated:end<total});
}
it('requires contiguous UTF8 bytes from zero and ignores gaps, mismatched requests and metadata',()=>{
 const reads=normalizeSkillReadCoverage(undefined);
 observeSkillRead(reads,JSON.stringify({name,digest}),{action:'inspect',name});
 observeSkillRead(reads,fragment('a😀',0,8),args());
 expect(skillInstructionsRead(reads,name,digest)).toBe(false);
 observeSkillRead(reads,fragment('z',7,8),args(7));
 observeSkillRead(reads,fragment('βz',5,8),args(4));
 expect(reads[name]?.readBytes).toBe(5);
 observeSkillRead(reads,fragment('βz',5,8),args(5));
 expect(skillInstructionsRead(reads,name,digest)).toBe(true);
 observeSkillRead(reads,fragment('a😀',0,8),args());
 expect(skillInstructionsRead(reads,name,digest)).toBe(true);
 expect(skillInstructionsRead(reads,name,other)).toBe(false);
});
it('never joins fragments across revisions or accepts an end-only read',()=>{
 const reads=normalizeSkillReadCoverage(undefined);
 observeSkillRead(reads,fragment('b',1,2),args(1));
 expect(skillInstructionsRead(reads,name,digest)).toBe(false);
 observeSkillRead(reads,fragment('a',0,2),args());
 observeSkillRead(reads,fragment('b',1,2,other),args(1,other));
 expect(skillInstructionsRead(reads,name,other)).toBe(false);
 expect(skillInstructionsRead(reads,name,digest)).toBe(false);
});
it('reconstructs complete reads only from paired successful durable Skill calls and results',()=>{
 const call=(id:string,offset:number):AgentModelMessage=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:'skills',arguments:JSON.stringify(args(offset))}}]});
 const result=(id:string,text:string):AgentModelMessage=>({role:'tool',name:'skills',tool_call_id:id,content:text});
 const first=[call('first',0),result('first',fragment('a',0,2)+'\n\nAGENT_CORE_EVIDENCE_REF=tool:first')];
 const failed=[...first,call('last',1),result('last','TOOL_ERROR\n'+fragment('b',1,2))];
 expect(skillInstructionsRead(skillReadCoverageFromMessages(failed),name,digest)).toBe(false);
 expect(skillInstructionsRead(skillReadCoverageFromMessages([...first,result('unmatched',fragment('b',1,2))]),name,digest)).toBe(false);
 expect(skillInstructionsRead(skillReadCoverageFromMessages([...first,call('last',1),result('last',fragment('b',1,2))]),name,digest)).toBe(true);
});
it('keeps old episode metadata compatible and rejects malformed completed coverage',()=>{
 expect(normalizeSkillReadCoverage(undefined)).toEqual({});
 expect(normalizeSkillReadCoverage({[name]:{digest,readBytes:1,totalBytes:2,complete:true}})).toEqual({});
 expect(normalizeSkillReadCoverage({[name]:{digest,readBytes:2,totalBytes:2,complete:true}})[name]?.complete).toBe(true);
});

it('accepts only selected packaged references, never arbitrary paths', () => {
 expect(normalizeSkillReadResource()).toBe('SKILL.md');
 expect(normalizeSkillReadResource('references/evidence_hierarchy.md')).toBe('references/evidence_hierarchy.md');
 for (const invalid of ['../secrets', 'references/../SKILL.md', '/references/method.md',
   'C:/tmp/method.md', 'references\\method.md', 'scripts/run.js', 'references//dup.md', 'references/.']) {
   expect(() => normalizeSkillReadResource(invalid)).toThrow('SKILL_READ_RESOURCE_INVALID');
 }
});

it('keeps reference read receipts isolated from SKILL.md and from other references', () => {
 const reads = normalizeSkillReadCoverage(undefined);
 const reference = 'references/evidence_hierarchy.md';
 const req = (offset: number, resourcePath = reference) => ({ ...args(offset), resourcePath });
 const refFragment = (content: string, offset: number, source = reference) => {
  const end=offset+Buffer.byteLength(content,'utf8');
  return JSON.stringify({name,digest,source,delivery:'instruction-fragment',executionAuthority:false,
   content,offset,nextOffset:end===4?null:end,totalContentBytes:4,truncated:end<4});
 };
 observeSkillRead(reads,refFragment('ab',0),req(0));
 expect(skillReferenceRead(reads,name,reference,digest)).toBe(false);
 observeSkillRead(reads,refFragment('cd',2),req(2));
 expect(skillReferenceRead(reads,name,reference,digest)).toBe(true);
 expect(skillInstructionsRead(reads,name,digest)).toBe(false);
 expect(skillReferenceRead(reads,name,'references/other.md',digest)).toBe(false);
 observeSkillRead(reads,refFragment('abcd',0),req(0,'references/other.md'));
 expect(skillReferenceRead(reads,name,'references/other.md',digest)).toBe(false);
 expect(normalizeSkillReadCoverage(reads)[name+'#'+reference]?.complete).toBe(true);
});

it('passes packaged reference fragments through the production Native filter and matches resume coverage', () => {
 const resource='references/evidence_hierarchy.md', normal=normalizeSkillReadCoverage(undefined);
 const request=(offset:number)=>({...args(offset),resourcePath:resource});
 const response=(content:string,offset:number)=>{
  const end=offset+Buffer.byteLength(content,'utf8');
  return JSON.stringify({name,digest,source:resource,delivery:'instruction-fragment',executionAuthority:false,
   content,offset,nextOffset:end===4?null:end,totalContentBytes:4,truncated:end<4});
 };
 const deliveries: Array<[number,string]>=[[0,response('ab',0)],[2,response('cd',2)]];
 const transcript:AgentModelMessage[]=[];
 for(const [offset,result] of deliveries){
  // The old SKILL.md-only inspectedSkillArtifacts filter would fail this assertion.
  expect(inspectedSkillArtifacts(result)).toEqual([{name,digest}]);
  for(const item of inspectedSkillArtifacts(result))if(item.name===name&&item.digest===digest)
   observeSkillRead(normal,result,request(offset));
  const id='ref-'+offset;
  transcript.push({role:'assistant',content:null,tool_calls:[{id,type:'function',
   function:{name:'skills',arguments:JSON.stringify(request(offset))}}]});
  transcript.push({role:'tool',name:'skills',tool_call_id:id,content:result});
 }
 expect(skillReferenceRead(normal,name,resource,digest)).toBe(true);
 expect(skillInstructionsRead(normal,name,digest)).toBe(false);
 expect(skillReadCoverageFromMessages(transcript)).toEqual(normal);
});

it('rejects invalid reference descriptors, wrong requests, digest drift and incomplete fragments', () => {
 const resource='references/evidence_hierarchy.md', reads=normalizeSkillReadCoverage(undefined);
 const request=(offset:number,resourcePath=resource,expectedActiveDigest=digest)=>
  ({action:'read',name,expectedActiveDigest,offset,resourcePath});
 const make=(source:string,content:string,offset=0,revision=digest)=>{
  const end=offset+Buffer.byteLength(content,'utf8');
  return JSON.stringify({name,digest:revision,source,delivery:'instruction-fragment',
   executionAuthority:false,content,offset,nextOffset:end===4?null:end,
   totalContentBytes:4,truncated:end<4});
 };
 for(const source of ['../secret','references/../SKILL.md','/references/file.md','C:/tmp/file.md',
  'references\\file.md','scripts/run.js']){
  expect(inspectedSkillArtifacts(make(source,'abcd'))).toEqual([]);
 }
 expect(inspectedSkillArtifacts('TOOL_ERROR\n'+make(resource,'abcd'))).toEqual([]);
 expect(observeSkillRead(reads,make(resource,'abcd'),request(0,'references/other.md'))).toBe(false);
 expect(observeSkillRead(reads,make(resource,'abcd',0,other),request(0))).toBe(false);
 expect(inspectedSkillArtifacts(make(resource,'cd',2))).toEqual([{name,digest}]);
 observeSkillRead(reads,make(resource,'cd',2),request(2));
 expect(skillReferenceRead(reads,name,resource,digest)).toBe(false);
 expect(skillInstructionsRead(reads,name,digest)).toBe(false);
});

it('preserves completed main instructions while separate references progress independently', () => {
 const reads=normalizeSkillReadCoverage(undefined);
 const first='references/one.md',second='references/two.md';
 const make=(source:string,content:string,offset:number)=>{
  const end=offset+Buffer.byteLength(content,'utf8');
  return JSON.stringify({name,digest,source,delivery:'instruction-fragment',executionAuthority:false,
   content,offset,nextOffset:end===4?null:end,totalContentBytes:4,truncated:end<4});
 };
 observeSkillRead(reads,fragment('main',0,4),args());
 expect(skillInstructionsRead(reads,name,digest)).toBe(true);
 observeSkillRead(reads,make(first,'ab',0),{...args(),resourcePath:first});
 observeSkillRead(reads,make(second,'abcd',0),{...args(),resourcePath:second});
 expect(skillReferenceRead(reads,name,first,digest)).toBe(false);
 expect(skillReferenceRead(reads,name,second,digest)).toBe(true);
 observeSkillRead(reads,make(first,'cd',2),{...args(2),resourcePath:first});
 expect(skillReferenceRead(reads,name,first,digest)).toBe(true);
 expect(skillInstructionsRead(reads,name,digest)).toBe(true);
});
