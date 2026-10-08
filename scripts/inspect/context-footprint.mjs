import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readArtifact, writeExclusive, failure } from '../learning/report-io.mjs';

const MAX_FILES=16;
const MAX_FILE_BYTES=1024*1024;
const MAX_BLOCKS=5000;
const MAX_RESULT_BYTES=2*1024*1024;

const sha256=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const stripEol=line=>line.replace(/(?:\r\n|\r|\n)$/,'');
const lineParts=text=>{
  const rows=text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)??[];
  if(rows.at(-1)==='')rows.pop();
  return rows;
};
const fenceInfo=line=>{
  const match=/^ {0,3}(`{3,}|~{3,})/.exec(stripEol(line));
  return match?{char:match[1][0],length:match[1].length}:null;
};
const fenceClose=(line,fence)=>new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(stripEol(line));
const heading=line=>/^ {0,3}#{1,6}(?:\s|$)/.test(stripEol(line));
const bullet=line=>/^ {0,3}(?:[-+*]|\d+[.)])(?:[ \t]+|$)/.test(stripEol(line));
const blank=line=>stripEol(line).trim()==='';
export function parseInstructionBlocks(text){
  const lines=lineParts(text),blocks=[];
  let index=0;
  const push=(kind,start,end)=>{
    const raw=lines.slice(start,end+1).join('');
    const bytes=Buffer.from(raw,'utf8');
    blocks.push({kind,startLine:start+1,endLine:end+1,sha256:sha256(bytes),rawBytes:bytes.length,unicodeScalars:[...raw].length,raw});
  };
  while(index<lines.length){
    if(blank(lines[index])){index+=1;continue;}
    const fence=fenceInfo(lines[index]);
    if(fence){
      const start=index;let closed=false;index+=1;
      while(index<lines.length){if(fenceClose(lines[index],fence)){closed=true;index+=1;break;}index+=1;}
      push(closed?'fence':'opaque-fence',start,index-1);continue;
    }
    if(heading(lines[index])){push('heading',index,index);index+=1;continue;}
    if(bullet(lines[index])){
      const start=index;index+=1;
      while(index<lines.length&&!blank(lines[index])&&!heading(lines[index])&&!fenceInfo(lines[index]))index+=1;
      push('bullet',start,index-1);continue;
    }
    const start=index;index+=1;
    while(index<lines.length&&!blank(lines[index])&&!heading(lines[index])&&!fenceInfo(lines[index])&&!bullet(lines[index]))index+=1;
    push('paragraph',start,index-1);
  }
  return blocks;
}
export function inspectInstructionBytes(bytes,sourcePath='<memory>'){
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('INVALID_UTF8_INSTRUCTION_FILE');}
  const parsed=parseInstructionBlocks(text),omittedBlocks=Math.max(0,parsed.length-MAX_BLOCKS);
  const blocks=parsed.slice(0,MAX_BLOCKS);
  const exact=new Map();
  for(const block of blocks){const rows=exact.get(block.raw)??[];rows.push([block.startLine,block.endLine]);exact.set(block.raw,rows);}
  const duplicates=[];
  for(const [raw,locations] of exact){if(locations.length>1)duplicates.push({sha256:sha256(Buffer.from(raw,'utf8')),locations});}
  const visibleBlocks=blocks.map(({raw,...block})=>block);
  return {
    sourcePath,sha256:sha256(bytes),bytes:bytes.length,unicodeScalars:[...text].length,
    lineCount:lineParts(text).length,tokenCount:'not-measured',scope:'file-only',
    blocks:visibleBlocks,omittedBlocks,truncated:omittedBlocks>0,duplicates,sourceMutated:false,
  };
}

export async function inspectInstructionFile(file){
  const resolved=path.resolve(file);
  const bytes=await readArtifact(resolved,MAX_FILE_BYTES);
  return inspectInstructionBytes(bytes,resolved);
}

function parseCli(argv){
  const inputs=[];let output;
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if(!value||value.startsWith('--'))throw new Error('INVALID_ARGUMENT');
    if(key==='--input')inputs.push(path.resolve(value));else if(key==='--output'&&!output)output=path.resolve(value);else throw new Error('INVALID_ARGUMENT');
  }
  if(inputs.length>MAX_FILES)throw new Error('INPUT_FILE_LIMIT');
  return {inputs:inputs.length?inputs:[path.resolve('AGENTS.md')],output};
}
export async function inspectContextFiles(files){
  if(!Array.isArray(files)||files.length<1||files.length>MAX_FILES)throw new Error('INPUT_FILE_LIMIT');
  const reports=[];
  for(const file of files)reports.push(await inspectInstructionFile(file));
  return {
    schemaVersion:1,kind:'instruction-context-footprint',files:reports,
    scope:reports.length===1?'file-only':'explicit-composition-inputs',
    unmeasuredContributions:['provider/system instructions','client conversation/context','PHONE_SKILL_INSTRUCTIONS unless explicitly supplied'],
    sourceMutated:false,
  };
}

async function main(){
  const {inputs,output}=parseCli(process.argv.slice(2));
  if(output&&inputs.some(input=>path.resolve(input)===output))throw new Error('OUTPUT_INPUT_COLLISION');
  const result=await inspectContextFiles(inputs);
  const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n','utf8');
  if(bytes.length>MAX_RESULT_BYTES)throw new Error('RESULT_TOO_LARGE');
  if(output)await writeExclusive(output,bytes);
  else process.stdout.write(bytes);
}

const isMain=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(isMain)main().catch(failure);
