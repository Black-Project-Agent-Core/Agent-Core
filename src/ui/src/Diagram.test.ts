import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { renderWorkflowGraph } from '../../workflows/renderer';

it('renders visible relationships initially and lets users focus, inspect and restore the full diagram',async()=>{
  const nodes=['entry','learning','memory','isolated'].map(id=>({id,label:id,kind:id==='memory'?'memory' as const:'system' as const,paths:[`src/${id}.ts`]}));
  const edges=[['entry','learning'],['learning','memory'],['entry','memory']].map(([from,to],i)=>({id:`edge${i}`,from,to,kind:'imports' as const,evidence:[{path:`src/${from}.ts`,line:i+1}]}));
  const html=await renderWorkflowGraph({schemaVersion:1,fingerprint:'test',files:4,unknowns:0,limitations:[],nodes,edges});
  const dom=new JSDOM(html,{runScripts:'dangerously'}),doc=dom.window.document;
  try {
    const visible=()=>[...doc.querySelectorAll('[data-edge-key]')].filter(e=>!e.hasAttribute('hidden'));
    expect(visible()).toHaveLength(2);
    expect(doc.getElementById('count')?.textContent).toBe('2 / 3 links');
    (doc.getElementById('all-connections') as HTMLButtonElement).click();
    expect(visible()).toHaveLength(3);
    const focus=doc.getElementById('focus') as HTMLSelectElement;
    focus.value='memory';focus.dispatchEvent(new dom.window.Event('change'));
    expect(visible()).toHaveLength(2);
    expect(doc.getElementById('selection')?.textContent).toBe('memory');
    expect(doc.querySelector('[data-node-id="isolated"]')?.getAttribute('style')).toContain('opacity: 0.22');
    expect(doc.getElementById('inspection')?.textContent).toContain('entry → memory · src/entry.ts:3');
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));
    expect(visible()).toHaveLength(2);
    expect(focus.value).toBe('');
    (doc.getElementById('zoom-in') as HTMLButtonElement).click();
    expect(doc.getElementById('zoom-value')?.textContent).toBe('120%');
    (doc.getElementById('fit') as HTMLButtonElement).click();
    expect(doc.getElementById('zoom-value')?.textContent).toBe('100%');
  } finally {dom.window.close();}
});

it('opens the controller architecture cycle and switches to the detailed source graph without losing either view',async()=>{
  const paths=['src/http/app.ts','src/mcp/server.ts','src/mcp/controller-contract.ts','src/mcp/skills-tools.ts','src/mcp/learning-tools.ts','src/memory/mcp/tools.ts','src/rdc/handlers/index.ts','src/external-partner-capability.ts'];
  const graph={schemaVersion:1 as const,fingerprint:'cycle',files:paths.length,unknowns:0,limitations:[],edges:[],nodes:[{id:'system',label:'Services',kind:'system' as const,paths}]};
  const dom=new JSDOM(await renderWorkflowGraph(graph),{runScripts:'dangerously'}),doc=dom.window.document;
  try {
    expect(doc.getElementById('cycle-view')?.hasAttribute('hidden')).toBe(false);
    expect(doc.getElementById('source-view')?.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById('view-controller')?.getAttribute('aria-pressed')).toBe('true');
    expect(doc.querySelector('[data-cycle-edge="cycle-gateway-controller"] title')?.textContent).toContain('Result / error / context');
    const controller=doc.querySelector('[data-cycle-node="controller"]')!;
    controller.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
    expect(doc.getElementById('cycle-selection')?.textContent).toBe('External AI controller');
    expect(doc.getElementById('cycle-evidence')?.textContent).toContain('MCP request');
    (doc.getElementById('cycle-zoom-in') as HTMLButtonElement).click();
    expect(doc.getElementById('cycle-zoom-value')?.textContent).toBe('120%');
    (doc.getElementById('view-source') as HTMLButtonElement).click();
    expect(doc.getElementById('cycle-view')?.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById('source-view')?.hasAttribute('hidden')).toBe(false);
    (doc.getElementById('zoom-in') as HTMLButtonElement).click();
    expect(doc.querySelector('#source-view svg')?.getAttribute('style')).toContain('width: 120%');
    expect(doc.getElementById('controller-cycle-svg')?.getAttribute('style')).toContain('width: 120%');
    (doc.getElementById('view-controller') as HTMLButtonElement).click();
    expect(doc.getElementById('cycle-selection')?.textContent).toBe('External AI controller');
    (doc.getElementById('cycle-reset') as HTMLButtonElement).click();
    expect(doc.getElementById('cycle-selection')?.textContent).toBe('Controller cycle · input and output');
  }finally{dom.window.close();}
});
