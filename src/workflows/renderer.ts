import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { WorkflowGraph } from './types.js';

const execFileAsync = promisify(execFile);
const vendorRoot = fileURLToPath(new URL('../../vendor/archify', import.meta.url));
const diagramId=(value:string)=>/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)?value:`n-${createHash('sha256').update(value).digest('hex').slice(0,24)}`;
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** One architecture, including Memory. Edges mean static imports, never runtime execution. */
export function architectureFromGraph(graph: WorkflowGraph) {
  const id=diagramId;
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { output: 'canvas.html', title: 'Agent Core · System + Memory', subtitle: 'Source dependency map · select a node to focus its neighborhood' },
    components: graph.nodes.map((node, i) => ({
      id: id(node.id), type: node.kind === 'memory' ? 'database' : 'backend', label: node.label,
      sublabel: `${node.paths.length} source files`, tag: node.kind === 'memory' ? 'Memory' : 'System',
      pos: [70 + (i % 5) * 280, 70 + Math.floor(i / 5) * 180], size: [220, 85],
    })),
    connections: graph.edges.map(edge => ({id:id(edge.id),from:id(edge.from),to:id(edge.to),route:'straight'})),
    cards: [{dot:'cyan',title:'What this map proves',items:[
      `${graph.files} allowlisted source files; ${graph.unknowns} unresolved or external references.`,
      'Arrows show static imports. They do not prove calls, state transitions, or live execution.',
      `Working-tree fingerprint: ${graph.fingerprint}`,
    ]}],
  };
}

export function secureWorkflowHtml(html: string, graph: WorkflowGraph): string {
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  // This viewer is display-only inside an opaque-origin sandbox. No host messages,
  // network, forms, navigation or export surface is exposed by this integration.
  const initial=diagramId(graph.nodes.find(n=>n.id==='system/memory')?.id??graph.nodes[0]?.id??'');
  const focusScript=`<script>(function(){var focus=function(){if(window.Archify&&Archify.focus)Archify.focus.set(${JSON.stringify(initial)},{toggle:false,updateUrl:false});};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',focus);else focus();})();</script>`;
  const guard = `<meta http-equiv="Content-Security-Policy" content="${csp}"><style>[data-action="export"],#export-menu,#export-btn,#btn-export,.export-menu,.export-dropdown{display:none!important}svg [data-edge-key]{opacity:0!important;pointer-events:none!important}svg [data-edge-key][data-focus-match]{opacity:1!important;pointer-events:auto!important}svg [data-node-id]{opacity:1!important}#workflow-source-evidence{padding:16px;font:12px monospace;overflow-wrap:anywhere}#workflow-source-evidence summary{cursor:pointer}</style><script>document.addEventListener('click',function(e){if(e.target.closest('a,[download],[data-action="export"],[data-action="copy"]')){e.preventDefault();e.stopImmediatePropagation();}},true);</script>`;
  const nodes = graph.nodes.map(n=>`<details><summary>${escape(n.label)} · ${n.paths.length} files</summary>${n.paths.map(p=>escape(p)).join('<br>')}</details>`).join('');
  const edges = graph.edges.map(e=>`<details><summary>${escape(e.from)} → ${escape(e.to)} · imports</summary>${e.evidence.map(p=>escape(`${p.path}:${p.line}`)).join('<br>')}</details>`).join('');
  const secured = html.replace(/<head>/i,`<head>${guard}`).replace(/<\/body>/i,`<section id="workflow-source-evidence"><p>One subsystem canvas. Select or search a node to reveal its dependency neighborhood. Dense import edges may cross unrelated nodes; this is not a clean-routed execution flow.</p><details><summary>Source evidence · paths and import line references</summary>${nodes}${edges}</details></section>${focusScript}</body>`);
  if (Buffer.byteLength(JSON.stringify({html:secured})) > 3.5 * 1024 * 1024) throw new Error('Workflow canvas exceeds bridge size limit');
  return secured;
}

export async function renderWorkflowGraph(graph: WorkflowGraph): Promise<string> {
  if (!graph.nodes.length) throw new Error('No supported source files found');
  const temp = await mkdtemp(path.join(os.tmpdir(), 'agent-core-workflows-'));
  try {
    const vendor = await realpath(vendorRoot);
    const input = path.join(temp, 'architecture.json');
    const output = path.join(temp, 'canvas.html');
    await writeFile(input, JSON.stringify(architectureFromGraph(graph)), {mode:0o600});
    // Do not run Archify's CLI (updates/brand capture). Its pinned architecture
    // renderer receives only generated metadata and can read only vendor + temp.
    await execFileAsync(process.execPath, [
      '--permission', `--allow-fs-read=${vendor}`, `--allow-fs-read=${temp}`, `--allow-fs-write=${temp}`,
      path.join(vendor, 'renderers/architecture/render-architecture.mjs'), input, output,
    ], {cwd:temp,env:{AGENT_CORE_WORKFLOWS:'1',SystemRoot:process.env.SystemRoot ?? '',TEMP:temp,TMP:temp},timeout:30_000,maxBuffer:512*1024,windowsHide:true});
    const html = await readFile(output, 'utf8');
    if (Buffer.byteLength(html) > 4 * 1024 * 1024) throw new Error('Workflow canvas exceeds 4 MiB limit');
    return secureWorkflowHtml(html, graph);
  } finally {
    await rm(temp, {recursive:true,force:true});
  }
}
