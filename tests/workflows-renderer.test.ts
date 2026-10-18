import { describe, expect, it } from 'vitest';
import { architectureFromGraph, secureWorkflowHtml, renderWorkflowGraph } from '../src/workflows/renderer.js';

const graph = {schemaVersion:1 as const,fingerprint:'a'.repeat(64),files:2,unknowns:0,limitations:[],nodes:[{id:'system',label:'System',kind:'system' as const,paths:['src/index.ts']},{id:'memory',label:'Memory',kind:'memory' as const,paths:['src/memory/facade.ts']}],edges:[{id:'link',from:'system',to:'memory',kind:'imports' as const,evidence:[{path:'src/index.ts',line:1}]}]};
describe('Workflows source diagram',()=>{
 it('keeps system and Memory in one architecture with literal dependency evidence',()=>{
  const diagram=architectureFromGraph(graph);
  expect(diagram.components.map(n=>n.id)).toEqual(['system','memory']);
  expect(diagram.connections[0]).toMatchObject({from:'system',to:'memory'});
  expect(JSON.stringify(diagram)).not.toMatch(/https?:|brand|runtime telemetry/);
 });
 it('locks HTML networking, navigation, native bridging, and exports down',()=>{
  const html=secureWorkflowHtml('<html><head></head><body><svg></svg></body></html>',graph);
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("base-uri 'none'");
  expect(html).toContain('workflow-source-evidence');
  expect(html).toContain('src/index.ts:1');
  expect(html).not.toContain('postMessage(');
 });
 it('renders the interactive source diagram offline',async()=>{
  const html=await renderWorkflowGraph(graph);
  expect(html).toContain('agent-core-source-diagram 1');
  expect(html).toContain('data-node-id="memory"');
  expect(html).toContain('data-node-id="system"');
  expect(html).toContain("connect-src 'none'");
 },30000);
});
it('preserves endpoint and schema validation in dense embedding mode',async()=>{
 await expect(renderWorkflowGraph({...graph,edges:[{...graph.edges[0],to:'missing-node'}]})).rejects.toThrow();
 await expect(renderWorkflowGraph({...graph,nodes:[{...graph.nodes[0],label:''}]})).rejects.toThrow();
});
it('opens as a connected diagram with overview, full connections and accessible focus',async()=>{
 const html=await renderWorkflowGraph(graph);
 expect(html).toContain('data-edge-key="link"');
 expect(html).toContain('marker-end="url(#arrow)"');
 expect(html).toContain('id="overview"');
 expect(html).toContain('id="all-connections"');
 expect(html).toContain('aria-label="Focus Memory"');
 expect(html).not.toContain('opacity:0!important');
});
it('bounds serialized canvas bytes before the native JSON bridge',()=>{
 expect(()=>secureWorkflowHtml('<html><head></head><body>'+ '"'.repeat(2*1024*1024) + '</body></html>',graph)).toThrow(/bridge size/);
});
it('escapes hostile source labels and paths rather than making active HTML',async()=>{
 const hostile='<img src=x onerror=alert(1)>';
 const html=await renderWorkflowGraph({...graph,nodes:[{...graph.nodes[0],label:hostile,paths:['src/<script>alert(1)</script>.ts']},graph.nodes[1]]});
 expect(html).not.toContain(hostile);
 expect(html).not.toContain('<script>alert(1)</script>');
 expect(html).toContain('&lt;img');
});
