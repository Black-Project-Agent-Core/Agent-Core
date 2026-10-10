export const PRESS_KEYS=['Enter','Escape','Tab','Backspace','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'] as const;
export const HOLD_KEYS=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Shift'] as const;
export const HOLD_DURATIONS=[150,400,800] as const;
export type InteractionCapability='keyboard'|'held-key'|'history';
export function validateCapabilities(value:unknown):InteractionCapability[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>3||new Set(value).size!==value.length||value.some(v=>!['keyboard','held-key','history'].includes(v)))throw new Error('BROWSER_CONTROL_CAPABILITIES_INVALID');
  return [...value];
}
interface Sender {send(method:string,params?:Record<string,unknown>):Promise<any>}
const codes:Record<string,number>={Enter:13,Escape:27,Tab:9,Backspace:8,Space:32,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,PageUp:33,PageDown:34,Home:36,End:35,Shift:16};
/** One in-flight key per owned session; release is idempotent across act/close. */
export class KeyboardActions {
  private active?:{cancel:AbortController;release:()=>Promise<void>};
  async execute(client:Sender,key:string,durationMs=0){
    if(durationMs===0 ? !(PRESS_KEYS as readonly string[]).includes(key) : !(HOLD_KEYS as readonly string[]).includes(key)||!(HOLD_DURATIONS as readonly number[]).includes(durationMs))throw new Error('BROWSER_CONTROL_KEY_INVALID');
    if(this.active)throw new Error('BROWSER_CONTROL_KEY_IN_FLIGHT');
    const cancel=new AbortController();let released:Promise<void>|undefined;
    const base={key:key==='Space'?' ':key,code:key==='Shift'?'ShiftLeft':key,windowsVirtualKeyCode:codes[key],nativeVirtualKeyCode:codes[key]};
    const release=()=>released??(released=client.send('Input.dispatchKeyEvent',{type:'keyUp',...base,modifiers:0}).then(()=>undefined));
    const active={cancel,release};this.active=active;let failure=false;
    let downSettled:Promise<void>=Promise.resolve();
    try {
      // Start the hold deadline at dispatch, not after a potentially slow CDP acknowledgement.
      downSettled=client.send('Input.dispatchKeyEvent',{type:'keyDown',...base,modifiers:key==='Shift'?8:0})
        .then(()=>undefined,()=>{failure=true;cancel.abort();});
      if(durationMs&&!cancel.signal.aborted)await new Promise<void>(resolve=>{
        const stop=()=>{clearTimeout(timer);cancel.signal.removeEventListener('abort',stop);resolve();};
        const timer=setTimeout(stop,durationMs);cancel.signal.addEventListener('abort',stop,{once:true});
      });
    }catch{failure=true;}
    finally {
      try{await release();}catch{failure=true;}
      await downSettled;
      if(this.active===active)this.active=undefined;
    }
    if(failure)throw new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN');
    if(cancel.signal.aborted)throw new Error('BROWSER_CONTROL_INPUT_CANCELLED');
  }
  async close(){
    const active=this.active;if(!active)return;
    active.cancel.abort();
    try{await active.release();}catch{throw new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN');}
  }
}
