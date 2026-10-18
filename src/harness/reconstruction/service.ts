import {harnessAction,parseManifest,type HarnessAction,type HostScope,
  type ReceiptResolver} from './contracts.js';
import {evaluateObligations} from './obligations.js';
import {createHarnessReport} from './readiness.js';
import {liveReceiptResolver} from './receipt-adapter.js';

export async function evaluateReconstructionHarness(
  actionInput:unknown,manifestInput:unknown,scope:HostScope,
  options:{resolver?:ReceiptResolver;signal?:AbortSignal}={},
){
  const parsed=harnessAction.safeParse(actionInput);
  if(!parsed.success)throw new Error('HARNESS_ACTION_INVALID');
  const action:HarnessAction=parsed.data;
  if(!scope.taskId||!scope.workspace
    ||(scope.origin==='external'&&(!scope.ownerId||!scope.workspaceIdentityKey))
    ||(scope.origin==='native'&&!scope.processSessionId))
    throw new Error('HARNESS_HOST_SCOPE_UNAVAILABLE');
  if(options.signal?.aborted)throw new Error('HARNESS_CANCELLED');
  const manifest=parseManifest(manifestInput);
  const refs=manifest.selections.map(s=>s.receiptRef);
  const resolved=action==='preview'?new Map():(options.resolver??liveReceiptResolver)(refs,scope);
  if(options.signal?.aborted)throw new Error('HARNESS_CANCELLED');
  const results=evaluateObligations(manifest,resolved,action==='preview');
  if(options.signal?.aborted)throw new Error('HARNESS_CANCELLED');
  return createHarnessReport(action,manifest,results,scope);
}