// Independent bounded artifact input; no donor Python/VM runtime or source copied.
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import { crc32 } from 'node:zlib';
import PizZip from 'pizzip';
import { openRegularFile } from '../rdc/utils/files/safe-regular-file.js';
import { assertSameFileIdentity } from '../security/file-identity.js';
import { preflightZipBuffer } from '../rdc/document-projection/archive-converter.js';
import { parseXml, childElements, sanitizeArchivePath, isZipSymlink } from '../rdc/document-projection/helpers.js';
export const WORKBOOK_MAX_BYTES=10*1024*1024, SPEC_MAX_BYTES=2*1024*1024, REPORT_MAX_BYTES=1024*1024;
const MEMBER_MAX=16*1024*1024, EXPANDED_MAX=64*1024*1024, ENTRY_MAX=4096;
const refuse=(code:string)=>new Error('WORKBOOK_'+code);
export const workbookDigest=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
function normalized(file:string) { return process.platform==='win32'?file.toLowerCase():file; }
async function noLinks(file:string):Promise<void> {
  let current=path.parse(file).root;
  for(const part of file.slice(current.length).split(path.sep)) {
    if(!part || part.includes(':')) throw refuse('PATH_INVALID'); current=path.join(current,part);
    const s=await lstat(current); if(s.isSymbolicLink())throw refuse('LINK_REFUSED');
    if(current!==file && !s.isDirectory())throw refuse('PATH_INVALID');
  }
  if(normalized(await realpath(file))!==normalized(file)) throw refuse('REALPATH_REFUSED');
}
export async function readWorkbookSnapshot(file:string,maxBytes:number,extension:'.xlsx'|'.json') {
  if(!path.isAbsolute(file)||file.startsWith('\\\\')||file.startsWith('//')||path.extname(file).toLowerCase()!==extension)
    throw refuse('LOCAL_INPUT_REQUIRED');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>WORKBOOK_MAX_BYTES)throw refuse('INPUT_LIMIT');
  file=path.resolve(file); await noLinks(file); const before=await lstat(file,{bigint:true});
  const opened=await openRegularFile(file,{followSymlinks:false});
  try {
    const start=await opened.handle.stat({bigint:true}); assertSameFileIdentity(before,start,'workbook input');
    if(start.size<1n||start.size>BigInt(maxBytes))throw refuse('INPUT_LIMIT');
    const parts:Buffer[]=[]; let total=0;
    for(;;) {
      const part=Buffer.allocUnsafe(Math.min(65536,maxBytes-total+1));
      const {bytesRead}=await opened.handle.read(part,0,part.length,null); if(!bytesRead)break;
      total+=bytesRead; if(total>maxBytes)throw refuse('INPUT_GREW'); parts.push(part.subarray(0,bytesRead));
    }
    const end=await opened.handle.stat({bigint:true}),current=await lstat(file,{bigint:true});
    assertSameFileIdentity(start,end,'workbook input'); assertSameFileIdentity(end,current,'workbook input');
    if(start.size!==BigInt(total)||before.size!==end.size||start.size!==end.size||current.size!==end.size
      ||before.mtimeNs!==end.mtimeNs||start.mtimeNs!==end.mtimeNs||current.mtimeNs!==end.mtimeNs
      ||start.ctimeNs!==end.ctimeNs||current.isSymbolicLink())throw refuse('INPUT_CHANGED');
    await noLinks(file); const bytes=Buffer.concat(parts,total);
    return {bytes,digest:workbookDigest(bytes),size:bytes.length};
  } finally { await opened.close(); }
}
interface XmlBudget { nodes:number;rows:number;cells:number;merged:number }
function inspectXml(name:string,bytes:Buffer,budget:XmlBudget):void {
  if(!/\.(xml|rels)$/i.test(name))return;
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  let tags=0;
  for(let at=text.indexOf('<');at>=0;at=text.indexOf('<',at+1))if(++tags>300000)throw refuse('XML_NODE_LIMIT');
  budget.nodes+=tags;if(budget.nodes>500000)throw refuse('XML_NODE_LIMIT');
  if(text.includes('\0')||/<!\s*(DOCTYPE|ENTITY)/i.test(text))throw refuse('XML_DECLARATION_REFUSED');
  // Relationships and content types are parsed, not trusted through raw string matching.
  if(name.endsWith('.rels')||name==='[Content_Types].xml') {
    const document=parseXml(text),nodes=document.getElementsByTagName('*');
    for(let i=0;i<nodes.length;i++) {
      const node=nodes.item(i)!;
      if((node.getAttribute('TargetMode')??'').toLowerCase()==='external')throw refuse('EXTERNAL_REFERENCE_REFUSED');
      if(/macroenabled|vbaproject|activex|oleobject/i.test(node.getAttribute('ContentType')??''))throw refuse('MACRO_REFUSED');
    }
  }
  if(/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
    const document=parseXml(text),nodes=document.getElementsByTagName('*');
    if(nodes.length>300000)throw refuse('XML_NODE_LIMIT'); let mergedArea=0,maxRow=0;
    const cells=new Set<string>(),rows=new Set<number>(),widths=new Map<number,number>();
    for(let i=0;i<nodes.length;i++) {
      const node=nodes.item(i)!,tag=node.localName??node.nodeName;
      if(tag==='c') {
        const address=node.getAttribute('r')??'',coord=parseWorkbookCell(address);
        if(!coord||cells.has(address))throw refuse('CELL_ADDRESS_INVALID');cells.add(address);
        const parent=node.parentNode as typeof node;
        if(parent.localName!=='row'||Number(parent.getAttribute('r'))!==coord.row)throw refuse('CELL_ROW_MISMATCH');
        maxRow=Math.max(maxRow,coord.row);widths.set(coord.row,Math.max(widths.get(coord.row)??0,coord.column));
        const children=childElements(node),values=children.filter(n=>n.localName==='v'),formulas=children.filter(n=>n.localName==='f');
        if(values.length>1||formulas.length>1)throw refuse('CELL_VALUE_AMBIGUOUS');
        const type=node.getAttribute('t')||'n',value=values[0]?.textContent??'';
        if(!['n','b','s','str','inlineStr','e'].includes(type))throw refuse('CELL_TYPE_UNSUPPORTED');
        if(values.length) {
          if(type==='n'&&(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())||!Number.isFinite(Number(value))))throw refuse('NUMBER_INVALID');
          if(type==='b'&&!/^[01]$/.test(value.trim()))throw refuse('BOOLEAN_INVALID');
          if(type==='s'&&(!/^\d+$/.test(value.trim())||!Number.isSafeInteger(Number(value))))throw refuse('SHARED_STRING_INDEX_INVALID');
        } else if(!formulas.length&&['b','s'].includes(type))throw refuse('CELL_VALUE_MISSING');
      }
      if(tag==='row') {
        const raw=node.getAttribute('r')??'',row=Number(raw);
        if(!/^[1-9][0-9]*$/.test(raw)||!Number.isInteger(row)||row>1048576||rows.has(row))throw refuse('ROW_INVALID');
        rows.add(row);maxRow=Math.max(maxRow,row);
      }
      if(tag==='col') {
        const min=Number(node.getAttribute('min')),max=Number(node.getAttribute('max'));
        if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>16384)throw refuse('COLUMN_INVALID');
      }
      if(tag==='pane') {
        const state=node.getAttribute('state')||'split';
        if(!['split','frozen'].includes(state))throw refuse('VIEW_UNSUPPORTED');
        for(const field of ['xSplit','ySplit']) {
          const raw=node.getAttribute(field);if(raw===null||raw==='')continue;const value=Number(raw);
          if(!Number.isFinite(value)||value<0||(state==='frozen'&&(!Number.isInteger(value)||value>(field==='xSplit'?16384:1048576))))throw refuse('VIEW_INVALID');
        }
      }
      if(tag==='mergeCell') {
        const ends=(node.getAttribute('ref')??'').split(':'),a=parseWorkbookCell(ends[0]),b=parseWorkbookCell(ends[1]??ends[0]);
        if(!a||!b||b.row<a.row||b.column<a.column)throw refuse('MERGE_INVALID');
        mergedArea+=(b.row-a.row+1)*(b.column-a.column+1);
        if(mergedArea>262144)throw refuse('MERGE_EXPANSION_LIMIT');
      }
    }
    budget.rows+=maxRow;budget.cells+=[...widths.values()].reduce((a,b)=>a+b,0);budget.merged+=mergedArea;
    if(budget.rows>2097152||budget.cells>2097152||budget.merged>262144)throw refuse('WORKSHEET_ALLOCATION_LIMIT');
  }
}
export function parseWorkbookCell(value:string):{row:number;column:number}|null {
  const match=/^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(value??''); if(!match)return null;
  let column=0; for(const letter of match[1])column=column*26+letter.charCodeAt(0)-64;
  const row=Number(match[2]); return column<=16384&&row<=1048576?{row,column}:null;
}
/** Expand attacker-controlled compression ONCE, then hand ExcelJS a STORE-only archive. */
export async function admitWorkbookZip(bytes:Buffer):Promise<Buffer> {
  await preflightZipBuffer(bytes,{maxArchiveBytes:WORKBOOK_MAX_BYTES,maxFiles:ENTRY_MAX,maxMemberBytes:MEMBER_MAX,maxExpandedBytes:EXPANDED_MAX});
  const zip=await new Promise<yauzl.ZipFile>((resolve,reject)=>yauzl.fromBuffer(bytes,
    {lazyEntries:true,autoClose:false,validateEntrySizes:true,strictFileNames:true},(e,z)=>e||!z?reject(refuse('ZIP_INVALID')):resolve(z)));
  const output=new PizZip(),seen=new Set<string>(); let entries=0,actualTotal=0;
  const xmlBudget:XmlBudget={nodes:0,rows:0,cells:0,merged:0};
  try {
    await new Promise<void>((resolve,reject)=>{
      let stopped=false; let active:import('node:stream').Readable|undefined;
      const fail=(e:unknown)=>{if(stopped)return;stopped=true;active?.destroy();reject(e);};
      zip.once('error',fail); zip.once('end',()=>{if(!stopped){stopped=true;resolve();}});
      zip.on('entry',(entry:yauzl.Entry)=>{void (async()=>{
        if(stopped)return;
        const name=sanitizeArchivePath(entry.fileName),lower=name.toLowerCase();
        if(++entries>ENTRY_MAX||name!==entry.fileName||name.includes(':')||seen.has(lower))throw refuse('ZIP_NAMES_INVALID');
        seen.add(lower);
        if((entry.generalPurposeBitFlag&1)||![0,8].includes(entry.compressionMethod)||isZipSymlink(entry.externalFileAttributes))throw refuse('ZIP_TYPE_REFUSED');
        if(/(?:^|\/)(?:vbaproject|macrosheets|dialogsheets|activex|embeddings|externallinks)(?:\/|\.|$)/i.test(name))throw refuse('MACRO_OR_EXTERNAL_REFUSED');
        if(name.endsWith('/')) { zip.readEntry(); return; }
        if(entry.uncompressedSize>MEMBER_MAX)throw refuse('ZIP_MEMBER_LIMIT');
        const stream=await new Promise<import('node:stream').Readable>((yes,no)=>zip.openReadStream(entry,(e,s)=>e||!s?no(refuse('ZIP_STREAM_INVALID')):yes(s)));
        active=stream; const parts:Buffer[]=[]; let size=0,checksum=0;
        for await(const raw of stream) {
          if(stopped)throw refuse('ZIP_CLOSED'); const part=Buffer.from(raw); size+=part.length; actualTotal+=part.length;
          if(size>MEMBER_MAX||actualTotal>EXPANDED_MAX)throw refuse('ZIP_ACTUAL_EXPANSION_LIMIT');
          checksum=crc32(part,checksum); parts.push(part);
        }
        active=undefined;
        if(size!==entry.uncompressedSize||checksum!==entry.crc32)throw refuse('ZIP_ENTRY_INTEGRITY');
        const content=Buffer.concat(parts,size); inspectXml(name,content,xmlBudget); output.file(name,content,{createFolders:false});
        zip.readEntry();
      })().catch(fail);});
      zip.readEntry();
    });
  } finally { zip.close(); }
  if(!seen.has('[content_types].xml')||!seen.has('xl/workbook.xml'))throw refuse('PACKAGE_INVALID');
  const admitted=output.generate({type:'nodebuffer',compression:'STORE'});
  if(admitted.length>EXPANDED_MAX+2*WORKBOOK_MAX_BYTES)throw refuse('ZIP_REPACK_LIMIT');
  return admitted;
}
