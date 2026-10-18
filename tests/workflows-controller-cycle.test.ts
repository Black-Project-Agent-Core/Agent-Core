import { expect, it } from 'vitest';
import { buildControllerCycle } from '../src/workflows/controller-cycle.js';
import type { WorkflowGraph } from '../src/workflows/types.js';

const graph:WorkflowGraph={schemaVersion:1,fingerprint:'cycle-fixture',files:8,unknowns:0,limitations:[],edges:[],nodes:[
  {id:'system/http',label:'HTTP',kind:'system',paths:['src/http/app.ts']},
  {id:'system/mcp',label:'MCP',kind:'system',paths:['src/mcp/server.ts','src/mcp/controller-contract.ts','src/mcp/skills-tools.ts','src/mcp/learning-tools.ts']},
  {id:'memory/mcp',label:'Memory',kind:'memory',paths:['src/memory/mcp/tools.ts']},
  {id:'system/rdc',label:'Tools',kind:'system',paths:['src/rdc/handlers/index.ts']},
  {id:'system/core',label:'Core',kind:'system',paths:['src/external-partner-capability.ts']},
]};

it('makes request and response routes a closed controller cycle with branched services',()=>{
  const cycle=buildControllerCycle(graph);
  expect(cycle.available).toBe(true);
  const edge=(from:string,to:string)=>cycle.connections.find(e=>e.from===from&&e.to===to);
  expect(edge('controller','gateway')?.label).toBe('MCP request');
  expect(edge('gateway','controller')?.label).toBe('Result / error / context');
  expect(edge('gateway','dispatch')).toBeDefined();
  expect(edge('dispatch','gateway')).toBeDefined();
  for(const service of ['memory','learning','skills','tools']){
    expect(edge('dispatch',service)).toBeDefined();
    expect(edge(service,'dispatch')).toBeDefined();
  }
  expect(cycle.components.find(n=>n.id==='controller')!.pos[1]).toBeLessThan(cycle.components.find(n=>n.id==='dispatch')!.pos[1]);
  expect(new Set(cycle.components.filter(n=>['memory','learning','skills','tools'].includes(n.id)).map(n=>n.pos[0])).size).toBe(4);
  expect(edge('dispatch','learning')?.label).toContain('Explicit');
  expect(edge('dispatch','skills')?.label).toContain('instructions');
  expect(cycle.connections.some(e=>e.from==='skills'&&e.to==='tools')).toBe(false);
});

it('uses actual included source anchors and removes a missing branch instead of asserting its availability',()=>{
  const partial={...graph,nodes:graph.nodes.map(n=>({...n,paths:n.paths.filter(p=>p!=='src/mcp/skills-tools.ts')}))};
  const cycle=buildControllerCycle(partial);
  expect(cycle.components.some(n=>n.id==='skills')).toBe(false);
  expect(cycle.connections.some(e=>e.from==='skills'||e.to==='skills')).toBe(false);
  expect(cycle.components.find(n=>n.id==='controller')?.owner).toBe('host');
  expect(cycle.components.find(n=>n.id==='raka')?.owner).toBe('host');
  expect(buildControllerCycle({...graph,nodes:[]}).available).toBe(false);
});
