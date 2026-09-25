import React, { useEffect, useMemo, useState } from 'react';
import { postHost, subscribeHost, type ActivityEntry, type DesktopSnapshot } from './host';
import { ReferenceUi } from './pages';
import type { PageId } from './components';

const validPages = new Set<PageId>(['dashboard','core','systems','activity','diagnostics','settings']);

function pageFromHash(): PageId {
  const value=window.location.hash.replace(/^#/,'').trim() as PageId;
  return validPages.has(value) ? value : 'dashboard';
}

export default function App() {
  const [page,setPageState]=useState<PageId>(()=>pageFromHash());
  const [snapshot,setSnapshot]=useState<DesktopSnapshot>();
  const [logs,setLogs]=useState<ActivityEntry[]>([]);

  useEffect(()=>{
    const onHash=()=>setPageState(pageFromHash());
    window.addEventListener('hashchange',onHash);
    return()=>window.removeEventListener('hashchange',onHash);
  },[]);

  useEffect(()=>{
    const unsubscribe=subscribeHost(message=>{
      if(message.type==='snapshot'){setSnapshot(message.snapshot);return;}
      if(message.type==='logs'){setLogs(message.entries);return;}
      if(message.type==='log'){setLogs(prev=>[...prev,message.entry].slice(-200));return;}
      if(message.type==='status'){
        setSnapshot(prev=>prev?{...prev,status:message.status}:prev);
        return;
      }
      if(message.type==='error'){
        const entry:ActivityEntry={id:`ui-error-${Date.now()}`,time:new Date().toLocaleTimeString('en-GB',{hour12:false}),module:'UI',level:'warn',message:message.message};
        setLogs(prev=>[...prev,entry].slice(-200));
      }
    });
    postHost({type:'ready'});
    return unsubscribe;
  },[]);

  const setPage=(next:PageId)=>{
    setPageState(next);
    window.location.hash=next;
  };

  const onAction=(action:string)=>{
    postHost({type:'action',action});
  };

  const stableLogs=useMemo(()=>logs.slice(-200),[logs]);

  return <ReferenceUi page={page} setPage={setPage} snapshot={snapshot} logs={stableLogs} onAction={onAction}/>;
}
