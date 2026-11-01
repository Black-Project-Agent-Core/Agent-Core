import { sourceDiagram, layoutDiagram } from './diagram.js';
import { escapeHtml as escape } from './text.js';
import type { WorkflowGraph } from './types.js';

export { diagramId } from './text.js';
export const architectureFromGraph=layoutDiagram;

export function secureWorkflowHtml(html:string,graph:WorkflowGraph):string {
  const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const nodes=graph.nodes.map(n=>`<details><summary>${escape(n.label)} · ${n.paths.length} files</summary>${n.paths.map(escape).join('<br>')}</details>`).join('');
  const edges=graph.edges.map(e=>`<details><summary>${escape(e.from)} → ${escape(e.to)} · imports</summary>${e.evidence.map(p=>escape(`${p.path}:${p.line}`)).join('<br>')}</details>`).join('');
  const result=html.replace(/<head>/i,`<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="source-fingerprint" content="${escape(graph.fingerprint)}">`).replace(/<\/body>/i,`<section id="workflow-source-evidence"><details><summary>Source evidence · paths and import line references</summary>${nodes}${edges}</details><p>Source dependencies show static imports. Controller cycle is a source-backed interaction reference, not a live trace. The host chooses each request; service calls and Learning finalization are explicit. Crossing lines are not junctions.</p></section></body>`);
  if(Buffer.byteLength(JSON.stringify({html:result}))>3.5*1024*1024)throw new Error('Workflow canvas exceeds bridge size limit');
  return result;
}
export async function renderWorkflowGraph(graph:WorkflowGraph):Promise<string>{
  if(!graph.nodes.length||graph.nodes.length>60||graph.edges.length>3600)throw new Error('Unsupported workflow graph size');
  const ids=new Set(graph.nodes.map(n=>n.id));
  if(ids.size!==graph.nodes.length||graph.nodes.some(n=>!n.label.trim())||graph.edges.some(e=>!ids.has(e.from)||!ids.has(e.to)))throw new Error('Invalid workflow node or endpoint');
  return secureWorkflowHtml(sourceDiagram(graph),graph);
}
