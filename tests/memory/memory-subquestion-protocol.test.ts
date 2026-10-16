import {readFile} from 'node:fs/promises';
import {afterEach,describe,expect,it} from 'vitest';
import {z} from 'zod';
import {registerMemoryTools} from '../../src/memory/mcp/tools.js';
import {cleanupFixtures,createFixture} from './fixtures/memory-subquestion/replay.js';
afterEach(cleanupFixtures);
describe('documented controller protocol against actual host schemas and mapping',()=>{
 it('parses and dispatches every documented tool example with the existing host registration',async()=>{
  const document=await readFile(new URL('../../docs/Memory-Subquestion-Retrieval-Protocol.md',import.meta.url),'utf8');
  const examples=[...document.matchAll(/<!-- tool-example -->\s*```json\s*([\s\S]*?)```/g)].map(match=>JSON.parse(match[1]));
  expect(examples).toHaveLength(5);
  const f=await createFixture();
  registerMemoryTools({registerTool:(name:string,meta:any,call:any)=>f.tools.set(name,{schema:meta.inputSchema instanceof z.ZodType?meta.inputSchema:z.strictObject(meta.inputSchema),call})} as any,f.memory as any);
  const actions:string[]=[];
  for(const example of examples){
   const tool=f.tools.get(example.name);expect(tool,example.name).toBeDefined();
   if(example.arguments.action==='expand')example.arguments.payload.source={kind:'memory',id:f.oracle.first.id,revision:f.oracle.first.revision};
   const args=tool!.schema.parse(example.arguments);const output=await tool!.call(args);expect(output.isError,JSON.stringify(output)).not.toBe(true);
   if(example.name==='memory_v2_read'){
    actions.push(args.action);expect(args.scope.taskId).toBe(f.binding.taskId);expect(args.payload?.taskId).toBeUndefined();
    const envelope=JSON.parse(output.content[0].text);expect(envelope.advisory).toBe(true);
    if(args.payload?.budget)expect(Buffer.byteLength(output.content[0].text)).toBeLessThanOrEqual(args.payload.budget.maxBytes);
   }
  }
  expect(actions).toEqual(['capabilities','recall','recall','expand']);
 });
 it('documents enforcement boundaries, live limitations and coverage without private reasoning',async()=>{
  const document=await readFile(new URL('../../docs/Memory-Subquestion-Retrieval-Protocol.md',import.meta.url),'utf8');
  for(const phrase of ['32,768','4,096','15,000','512','round-robin','insufficient-budget','revision-conflict','unsearched','retrieved','evidence-reviewed','gap','blocked','NOT RUN','ChatGPT','Claude','monotonic','late settlement','one retry','no recursion','memory-first','Learning','source data','never authority'])expect(document).toContain(phrase);
  expect(document).not.toMatch(/name"\s*:\s*"memory_recall"/);
  const agents=await readFile(new URL('../../AGENTS.md',import.meta.url),'utf8');expect(agents).toContain('Memory-Subquestion-Retrieval-Protocol.md');expect(agents).toContain('continuity-sensitive');
 });
});
