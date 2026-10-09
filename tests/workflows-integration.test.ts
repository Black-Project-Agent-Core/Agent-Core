import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { analyzeSources } from '../src/workflows/analyzer.js';
import { renderWorkflowGraph } from '../src/workflows/renderer.js';
it('renders the actual allowlisted project as one bounded System + Memory canvas',async()=>{
 const graph=await analyzeSources(process.cwd());
 expect(graph.nodes.some(n=>n.kind==='system')).toBe(true);
 expect(graph.nodes.some(n=>n.kind==='memory')).toBe(true);
 expect(graph.nodes.length).toBeLessThanOrEqual(60);
 const kinds=new Map(graph.nodes.map(n=>[n.id,n.kind]));
 expect(graph.edges.some(e=>kinds.get(e.from)!==kinds.get(e.to))).toBe(true);
 const html=await renderWorkflowGraph(graph);
 expect(html).toContain('Agent Core · System + Memory');
 expect(html).toContain('data-node-id=');
 expect(html).toContain("connect-src 'none'");
 expect(Buffer.byteLength(html)).toBeLessThan(4*1024*1024);
 if(process.env.WORKFLOW_TEST_ARTIFACT)await writeFile(process.env.WORKFLOW_TEST_ARTIFACT,html,{mode:0o600});
 console.log(JSON.stringify({files:graph.files,nodes:graph.nodes.length,edges:graph.edges.length,unknowns:graph.unknowns,htmlBytes:Buffer.byteLength(html)}));
},40000);
