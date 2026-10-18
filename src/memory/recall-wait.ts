import {MemoryControllerError} from './disclosure.js';

/** A local external-read waiter. It cannot cancel provider work or a committed write. */
export class ExternalRecallWait {
 private readonly abort=new AbortController();
 private readonly timer:ReturnType<typeof setTimeout>;
 private accepted=false;
 private acceptedResponse:unknown;
 private readonly onAbort=()=>this.abort.abort(new MemoryControllerError('MEMORY_DISCLOSURE_CANCELLED'));
 readonly signal=this.abort.signal;
 constructor(private readonly deadlineMs:number,private readonly parent?:AbortSignal){
  this.timer=setTimeout(()=>this.abort.abort(new MemoryControllerError('MEMORY_RECALL_DEADLINE')),Math.max(0,deadlineMs-Date.now()));
  parent?.addEventListener('abort',this.onAbort,{once:true});
  if(parent?.aborted)this.onAbort();
 }
 assertCurrent():void{
  if(this.accepted)return;
  if(!this.signal.aborted&&Date.now()>=this.deadlineMs)this.abort.abort(new MemoryControllerError('MEMORY_RECALL_DEADLINE'));
  if(this.signal.aborted)throw this.signal.reason;
 }
 /** Called synchronously after the admitted durable append. Remaining optional
  * work may finish within the budget; expiry returns this accepted response. */
 accept(value:unknown):void{this.accepted=true;this.acceptedResponse=value;}
 run<T>(operation:()=>Promise<T>):Promise<T>{
  this.assertCurrent();
  return new Promise<T>((resolve,reject)=>{
   const onAbort=()=>{cleanup();if(this.accepted)resolve(this.acceptedResponse as T);else reject(this.signal.reason);};
   const cleanup=()=>this.signal.removeEventListener('abort',onAbort);
   this.signal.addEventListener('abort',onAbort,{once:true});
   // Both continuations remain attached after abandonment: no unhandled late rejection.
   void Promise.resolve().then(()=>{this.assertCurrent();return operation();}).then(value=>{
    cleanup();try{this.assertCurrent();resolve(value);}catch(error){reject(error);}
   },error=>{cleanup();if(this.accepted)resolve(this.acceptedResponse as T);else reject(error);});
   if(this.signal.aborted)onAbort();
  });
 }
 dispose():void{clearTimeout(this.timer);this.parent?.removeEventListener('abort',this.onAbort);}
}
