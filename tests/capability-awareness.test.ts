import { describe, expect, it } from 'vitest';
import { buildKnowledgeSynthesisPacket } from '../src/agent-knowledge-synthesis.js';
import { rankSkillDescriptors } from '../src/skills/discovery.js';
const digest = 'sha256:' + 'a'.repeat(64);
const skills = [{ name: 'activation-audit', description: 'Audit activation hashes and deployment integrity', digest, allowedTools: ['read_file'] }, { name: 'invoice-review', description: 'Review invoice totals', digest: 'sha256:'+'b'.repeat(64), allowedTools: [] }];
function skillsOwner(artifacts: typeof skills) {
 return { list: async () => artifacts, discover: async ({ query }: { query: string }) => ({ artifacts, search: {
  version: 1, requestedMode: 'lexical', effectiveMode: 'lexical',
  hits: rankSkillDescriptors(artifacts.map(item => ({ ...item, triggers: [], nonTriggers: [], applicability: 'missing', descriptorTruncated: false })), query).slice(0, 5),
  catalog: { scanned: artifacts.length, valid: artifacts.length, invalid: 0, omitted: 0, complete: true },
  semantic: { providerAvailable: false, status: 'not-requested', embeddedDescriptors: 0, validDescriptors: artifacts.length, sentDescriptors: 0, queryTruncated: false, descriptorTruncated: 0 }, truncated: false,
 } }) };
}
async function packet(query: string, extra: any = {}) {
 return buildKnowledgeSynthesisPacket({ runtime: { skillsService: skillsOwner(skills) as any }, memoryItems: [], procedures: [], task: { goal: query, episodes: [] }, availableTools: ['read_file', 'code_graph', 'custom_helper'], ...extra } as any);
}
describe('capability awareness projection', () => {
 it('exposes all active identities separately from task-ranked selection', async () => {
  const p: any = await packet('Audit activation hashes');
  expect(p.capabilityExposure).toBeDefined();
  expect(p.capabilityExposure.inventory.filter((x:any)=>x.kind==='skill').map((x:any)=>x.capabilityId)).toEqual(['skill:activation-audit','skill:invoice-review']);
  expect(p.capabilityExposure.tools.unclassified).toEqual(['custom_helper']);
  expect(p.skillNames).toContain('activation-audit');
  expect(p.skillNames).not.toContain('invoice-review');
 });
 it('does not pretend a zero-match task has no active catalog', async () => {
  const p:any = await packet('hello');
  expect(p.capabilityExposure?.counts.skill).toBe(2);
  expect(p.text).not.toContain('- no active skills');
  expect(p.skillNames).toEqual([]);
 });
 it('marks absent discovery and host plugins unknown, not available', async () => {
  const p:any = await packet('hello',{availableTools:undefined});
  expect(p.capabilityExposure?.tools.status).toBe('unknown');
  expect(p.capabilityExposure?.external.status).toBe('unknown');
 });
 it('refreshes skill revisions and reports owner failure without claiming empty inventory', async () => {
  const a:any = await packet('hello');
  const b:any = await packet('hello',{runtime:{skillsService:skillsOwner([{...skills[0],digest:'sha256:'+'c'.repeat(64)}])}});
  expect(a.capabilityExposure?.revision).not.toBe(b.capabilityExposure?.revision);
  const c:any = await packet('hello',{runtime:{skillsService:{discover:async()=>{throw Error('offline')}}}});
  expect(c.capabilityExposure?.owners.skills).toBe('unavailable');
 });
 it('keeps prompts bounded without hiding catalog omissions', async () => {
  const many=Array.from({length:500},(_,i)=>({...skills[0],name:'skill-'+i,description:'audit '.repeat(200)}));
  const p:any=await packet('audit',{runtime:{skillsService:skillsOwner(many)}});
  expect(p.text.length).toBeLessThanOrEqual(16000);
  expect(p.capabilityExposure?.counts.skill).toBe(500);
  expect(p.capabilityExposure?.text.length).toBeLessThanOrEqual(5000);
  expect(p.capabilityExposure?.omittedFromText).toBeGreaterThan(0);
 });
});

it('keeps all accepted Pattern identities discoverable beyond ranked detail limit',async()=>{
 const nodes=Array.from({length:12},(_,i)=>({id:'pattern:p'+i,type:'pattern',label:'dependency recipe '+i}));
 const p:any=await packet('dependency',{workspace:'agent-core',runtime:{learningService:{journey:async()=>({nodes,edges:[]})}}});
 expect(p.capabilityExposure.counts.pattern).toBe(12);
});
