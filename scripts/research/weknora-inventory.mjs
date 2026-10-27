import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const donor=process.argv[2];
if(!donor)throw new Error('Provide the explicitly authorized donor root');
const out=path.join(root,'docs/research/weknora-donor');fs.mkdirSync(out,{recursive:true});
const commit=execFileSync('git',['-C',donor,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const status=execFileSync('git',['-C',donor,'status','--porcelain'],{encoding:'utf8'});
if(status.trim())throw new Error('Donor checkout differs from its pinned HEAD');
const raw=execFileSync('git',['-C',donor,'ls-tree','-r','--long','-z','HEAD'],{encoding:'utf8',maxBuffer:16*1024*1024});
function classify(p){
 if(/^(internal\/(agent|modelcontext|models|stream|event|runtime|mcp|mcpserver|browserskill|localsandbox|sandbox|container)\/|frontend\/|client\/|cli\/|packages\/)/.test(p))return {domain:'agent-tools-ui',owner:'native'};
 if(/^(internal\/(application\/(service|repository|attachment)\/|datasource\/|docreader\/|reranking\/|searchutil\/|embedpolicy\/|textconv\/|sourceloc\/)|docreader\/|migrations\/|dataset\/|testdata\/)/.test(p))return {domain:'knowledge-retrieval-ingestion',owner:'raka'};
 if(/^(docs\/|website-docs\/|examples\/|licenses\/|third_party\/)/.test(p)||/\.(png|jpg|jpeg|gif|webp|ico|svg|mp4|woff2?|ttf|pdf|docx|xlsx|zip)$/.test(p))return {domain:'docs-assets-third-party',owner:'main'};
 return {domain:'platform-storage-security-operations',owner:'main'};
}
const files=raw.split('\0').filter(Boolean).map(row=>{const m=row.match(/^(\d+) (\S+) ([a-f0-9]+)\s+(\d+|-)\t([\s\S]+)$/);if(!m)throw new Error('Unexpected git tree record');const [_,mode,type,blob,size,p]=m;return {path:p,mode,type,blob,bytes:size==='-'?null:Number(size),...classify(p),triageStatus:'pending',evidenceLevel:'inventory-only'};});
const groups={};for(const f of files){const k=f.domain;const g=groups[k]??={files:0,bytes:0,owner:f.owner};g.files++;g.bytes+=f.bytes??0;}
const tops={};for(const f of files){const k=f.path.split('/')[0];const g=tops[k]??={files:0,bytes:0};g.files++;g.bytes+=f.bytes??0;}
const inventory={schemaVersion:1,donorRepository:'https://github.com/tencent/weknora',commit,generatedAt:new Date().toISOString(),policy:'Every tracked file is mapped; mapping is not a claim of content review. Audit disposition and source anchors must be added per domain.',totalFiles:files.length,totalBytes:files.reduce((n,f)=>n+(f.bytes??0),0),groups,topLevel:tops,files};
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
fs.writeFileSync(path.join(out,'inventory.tsv'),['path\tbytes\tdomain\towner\ttriageStatus',...files.map(f=>`${f.path}\t${f.bytes}\t${f.domain}\t${f.owner}\t${f.triageStatus}`)].join('\n')+'\n');
console.log(JSON.stringify({commit,totalFiles:inventory.totalFiles,totalBytes:inventory.totalBytes,groups,topLevel:tops}));
