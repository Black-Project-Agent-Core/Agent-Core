/** Bounded declarative artifact checker. Never evaluates JavaScript or creates a
 * VM. Unsupported syntax fails closed. This deliberately replaces the previous
 * unsafe claim that node:vm was a security boundary for arbitrary artifacts. */
function unsupported(): never { throw new Error('UNSUPPORTED_ENGINEERING_ARTIFACT'); }
const reserved=new Set('await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield'.split(' '));
const compact = (text: string) => text.trim().replace(/;+\s*$/, '').replace(/\r\n?/g, '\n');
const eventTemplates = [
 'rows => [...new Set(rows.map(row => row.key))].sort().flatMap(key => { const latest = rows.filter(row => row.key === key).sort((a,b) => b.sequence-a.sequence)[0]; return latest.deleted ? [] : [{key,value:latest.value}]; })',
 'rows => [...new Set(rows.map(r=>r.key))].sort().flatMap(key=>{const r=rows.filter(r=>r.key===key).sort((a,b)=>b.sequence-a.sequence)[0];return r.deleted?[]:[{key,value:r.value}];})',
 'rows => { const latest = new Map(); for (const row of rows) { const previous = latest.get(row.key); if (!previous || row.sequence > previous.sequence) latest.set(row.key, row); } return [...latest.values()].filter(row => !row.deleted).sort((a,b) => a.key.localeCompare(b.key)).map(row => ({key:row.key,value:row.value})); }',
].map(compact);
function dataValue(value: unknown, depth = 0, budget = { remaining: 20_000 }): void {
 if (--budget.remaining < 0 || depth > 32) unsupported();
 if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
 if (typeof value === 'number') { if (!Number.isFinite(value)) unsupported(); return; }
 if (typeof value !== 'object') unsupported();
 const proto=Object.getPrototypeOf(value);
 if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)unsupported();
 for(const [name,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))){
  if(!('value' in descriptor)||['__proto__','constructor','prototype'].includes(name))unsupported();
  dataValue(descriptor.value,depth+1,budget);
 }
}
function eventReduction(input: unknown, locale: boolean): unknown {
 dataValue(input);if(!Array.isArray(input)||input.length>10_000)unsupported();
 const latest=new Map<string,{key:string;sequence:number;value:unknown;deleted?:boolean}>();
 for(const item of input){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.key!=='string'||item.key.length>256||typeof item.sequence!=='number'||!Number.isFinite(item.sequence)||!Object.hasOwn(item,'value')||item.deleted!==undefined&&typeof item.deleted!=='boolean')unsupported();
  const previous=latest.get(item.key);if(!previous||item.sequence>previous.sequence)latest.set(item.key,item);
 }
 const keys=[...latest.keys()].sort(locale?(a,b)=>a.localeCompare(b):undefined);
 return keys.flatMap(key=>{const item=latest.get(key)!;return item.deleted?[]:[{key,value:item.value}];});
}
function numericExpression(expression:string,parameter:string|undefined,input:unknown):number{
 if(/\+\+|--/.test(expression))unsupported();
 const tokens:string[]=[];let offset=0;
 while(offset<expression.length){const match=/^(?:\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_$][\w$]*|[()+\-*/%])/.exec(expression.slice(offset));if(!match)unsupported();offset+=match[0].length;if(match[0].trim())tokens.push(match[0]);if(tokens.length>1024)unsupported();}
 let position=0,operations=0;const tick=()=>{if(++operations>4096)unsupported();};
 const primary=(depth:number):number=>{tick();if(depth>32)unsupported();const token=tokens[position++];if(!token)unsupported();
  if(token==='+'||token==='-'){const value=primary(depth+1);return token==='-'?-value:value;}
  if(token==='('){const value=sum(depth+1);if(tokens[position++]!==')')unsupported();return value;}
  if(token===parameter){if(typeof input!=='number'||!Number.isFinite(input))unsupported();return input;}
  if(!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token))unsupported();if(/^0\d/.test(token))unsupported();return Number(token);
 };
 const product=(depth:number):number=>{let value=primary(depth);while(['*','/','%'].includes(tokens[position]??'')){tick();const op=tokens[position++],right=primary(depth);value=op==='*'?value*right:op==='/'?value/right:value%right;}return value;};
 const sum=(depth:number):number=>{let value=product(depth);while(['+','-'].includes(tokens[position]??'')){tick();const op=tokens[position++],right=product(depth);value=op==='+'?value+right:value-right;}return value;};
 const result=sum(0);if(position!==tokens.length||!Number.isFinite(result))unsupported();return result;
}
export function evaluateEngineeringArtifact(answer:string,input:unknown):unknown{
 if(typeof answer!=='string'||answer.length>8192)unsupported();
 const normalized=compact(answer);const template=eventTemplates.indexOf(normalized);
 if(template>=0)return eventReduction(input,template===2);
 const arrow=/^\s*(?:\(\s*([A-Za-z_$][\w$]*)?\s*\)|([A-Za-z_$][\w$]*))[ \t]*=>\s*([\s\S]+?)\s*;?\s*$/.exec(answer);
 if(!arrow)unsupported();const parameter=arrow[1]??arrow[2];if(parameter&&reserved.has(parameter))unsupported();const expression=arrow[3]!.trim().replace(/;+\s*$/,'');
 if(expression==='[]')return [];
 return numericExpression(expression,parameter,input);
}
