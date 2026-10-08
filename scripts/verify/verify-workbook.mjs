// Explicit offline consumer; never edits/recalculates a workbook or calls a model/tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const digest=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const failure=code=>({schemaVersion:1,algorithmRevision:'agent-core-workbook-assertions-v1',status:'unavailable',errorCode:code,
  counts:{pass:0,fail:0,unavailable:0},rules:[],runsFormulas:false,mutatesWorkbook:false,automaticApproval:false,memoryPersisted:false});
const safeError=e=>/^(WORKBOOK|DOCUMENT_PROJECTION)_[A-Z_]+$/.test(e?.message??'')?e.message:'WORKBOOK_INPUT_UNAVAILABLE';
if(!isMainThread) {
  let report;
  try {
    const {readWorkbookSnapshot,WORKBOOK_MAX_BYTES,SPEC_MAX_BYTES}=await import('../../dist/verification/workbook-input.js');
    const {evaluateWorkbookAssertions}=await import('../../dist/verification/workbook-assertions.js');
    const source=await readWorkbookSnapshot(workerData.workbook,WORKBOOK_MAX_BYTES,'.xlsx');
    const specification=await readWorkbookSnapshot(workerData.spec,SPEC_MAX_BYTES,'.json');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(specification.bytes); let spec;
    try {spec=JSON.parse(text);}catch{throw new Error('WORKBOOK_SPEC_INVALID');}
    report=await evaluateWorkbookAssertions(source.bytes,spec);
    const after=await readWorkbookSnapshot(workerData.workbook,WORKBOOK_MAX_BYTES,'.xlsx');
    const specAfter=await readWorkbookSnapshot(workerData.spec,SPEC_MAX_BYTES,'.json');
    if(after.digest!==source.digest||specAfter.digest!==specification.digest)throw new Error('WORKBOOK_INPUT_CHANGED');
    Object.assign(report,{specFileDigest:specification.digest,workbookBytes:source.size,specificationBytes:specification.size});
  } catch(error) {report=failure(safeError(error));}
  parentPort.postMessage(report);
} else {
  async function evaluateInWorker(files) {
    const worker=new Worker(new URL(import.meta.url),{workerData:files,execArgv:[],
      resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
    return new Promise(resolve=>{
      let settled=false;
      const finish=report=>{
        if(settled)return;settled=true;clearTimeout(timer);
        worker.terminate().catch(()=>undefined).finally(()=>resolve(report));
      };
      const timer=setTimeout(()=>finish(failure('WORKBOOK_WORKER_DEADLINE')),30000);
      worker.once('message',finish);worker.once('error',()=>finish(failure('WORKBOOK_WORKER_UNAVAILABLE')));
      worker.once('exit',()=>{if(!settled)finish(failure('WORKBOOK_WORKER_INCOMPLETE'));});
    });
  }
  async function run() {
    const args=process.argv.slice(2),files={};
    if(args.length!==6)throw new Error('WORKBOOK_ARGUMENTS_INVALID');
    for(let i=0;i<args.length;i+=2) {
      const key=args[i].slice(2);
      if(!['--workbook','--spec','--output'].includes(args[i])||Object.hasOwn(files,key)||!args[i+1])throw new Error('WORKBOOK_ARGUMENTS_INVALID');
      files[key]=path.resolve(args[i+1]);
    }
    if(!files.workbook||!files.spec||!files.output||path.extname(files.output).toLowerCase()!=='.json')throw new Error('WORKBOOK_ARGUMENTS_INVALID');
    let current=path.parse(files.output).root;
    if(files.output.startsWith('\\\\')||files.output.startsWith('//'))throw new Error('WORKBOOK_OUTPUT_LOCAL_REQUIRED');
    for(const segment of path.dirname(files.output).slice(current.length).split(path.sep).filter(Boolean)) {
      current=path.join(current,segment);const stat=await fs.lstat(current);
      if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('WORKBOOK_OUTPUT_PARENT_REFUSED');
    }
    try {await fs.lstat(files.output);throw new Error('WORKBOOK_OUTPUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
    const report=await evaluateInWorker({workbook:files.workbook,spec:files.spec});
    report.createdAt=new Date().toISOString();report.workerLimits={deadlineMs:30000,maxOldGenerationSizeMb:256};
    const encoded=Buffer.from(JSON.stringify(report,null,2)+'\n');
    if(encoded.length>1024*1024)throw new Error('WORKBOOK_REPORT_LIMIT');
    if(files.output.slice(path.parse(files.output).root.length).includes(':'))throw new Error('WORKBOOK_OUTPUT_PATH_REFUSED');
    const output=await fs.open(files.output,'wx+',0o600);
    try {
      await output.writeFile(encoded);await output.sync();
      const readback=Buffer.alloc(encoded.length);let offset=0;
      while(offset<readback.length) {
        const r=await output.read(readback,offset,readback.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;
      }
      const a=await output.stat({bigint:true}),b=await fs.lstat(files.output,{bigint:true});
      if(offset!==encoded.length||!readback.equals(encoded)||a.size!==BigInt(encoded.length)
        ||b.isSymbolicLink()||a.dev!==b.dev||a.ino!==b.ino||a.size!==b.size)throw new Error('WORKBOOK_OUTPUT_VERIFICATION_FAILED');
    } finally {await output.close();}
    console.log(JSON.stringify({status:report.status,counts:report.counts,output:files.output,reportDigest:digest(encoded)}));
    process.exitCode=report.status==='pass'?0:report.status==='fail'?1:2;
  }
  run().catch(error=>{console.error(JSON.stringify({status:'unavailable',errorCode:safeError(error)}));process.exitCode=2;});
}
