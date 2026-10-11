import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { MemoryService } from '../../src/memory/service.js';
import { LearningService } from '../../src/learning/service.js';
import type { LearningCandidate } from '../../src/learning/types.js';
const roots: string[] = [];
export async function cleanupCuration() { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); }
export async function curationFixture() {
 const root=await mkdtemp(path.join(os.tmpdir(),'learning-delta-'));roots.push(root);
 const memoryDir=path.join(root,'memory');await mkdir(path.join(memoryDir,'notes'),{recursive:true});
 await writeFile(path.join(memoryDir,'00-agent-core-memory.md'),'# Agent Core Foundational Memory\n\nSynthetic fixture only.\n');
 const memory=await MemoryService.initialize(root,memoryDir);
 const config={enabled:true,stateDir:path.join(root,'learning'),reviewInterval:10,curatorIntervalHours:168};
 const learning=await LearningService.initialize(config,memory);
 const bytes='Repeatable synthetic source: observation 1.25 on local fixture.';
 const source=path.join(root,'source.txt');await writeFile(source,bytes);
 const ref='source:'+source+'#sha256:'+createHash('sha256').update(bytes).digest('hex');
 const binding={taskId:'task-delta',workspace:'agent-core'};
 const candidate:LearningCandidate={kind:'operational-reflection',purpose:'reusable-procedure',content:'Check exact revisions before reusing local fixture evidence.',verified:true,evidenceRefs:[ref],reuseCondition:'Local fixture evidence inspection',steps:['Inspect revision','Recheck source'],workspace:binding.workspace};
 const delta={operationId:'delta-one',checkpointKey:'checkpoint-delta',...binding,entries:[{kind:'add-lesson' as const,candidate}]};
 await learning.checkpoint({idempotencyKey:delta.checkpointKey,...binding,reason:'explicit-learn',evidenceRefs:[ref]});
 return{root,memory,learning,config,source,ref,binding,candidate,delta};
}
