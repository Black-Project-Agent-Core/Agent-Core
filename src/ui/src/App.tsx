import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  postHost,
  subscribeHost,
  type ActivityEntry,
  type AgentChatUiState,
  type AgentRunState,
  type DesktopSnapshot,
} from './host';
import { ReferenceUi } from './pages';
import type { PageId } from './components';

const validPages = new Set<PageId>(['chat','dashboard','core','systems','activity','diagnostics','settings']);

function pageFromHash(): PageId {
  const value=window.location.hash.replace(/^#/,'').trim() as PageId;
  return validPages.has(value) ? value : 'dashboard';
}

export default function App() {
  const [page,setPageState]=useState<PageId>(()=>pageFromHash());
  const [snapshot,setSnapshot]=useState<DesktopSnapshot>();
  const [logs,setLogs]=useState<ActivityEntry[]>([]);
  const [agentRun,setAgentRun]=useState<AgentRunState>({status:'idle'});
  const [agentChat,setAgentChat]=useState<AgentChatUiState>({conversations:[]});
  const chatListLoadedRef=useRef(false);
  const chatListPendingRef=useRef(false);
  const chatOpenPendingRef=useRef(false);

  useEffect(()=>{
    const onHash=()=>setPageState(pageFromHash());
    window.addEventListener('hashchange',onHash);
    return()=>window.removeEventListener('hashchange',onHash);
  },[]);

  useEffect(()=>{
    const unsubscribe=subscribeHost(message=>{
      if(message.type==='snapshot'){
        setSnapshot(message.snapshot);
        const chatReady=message.snapshot.core.httpHealthy
          && (!message.snapshot.health.agentChat || message.snapshot.health.agentChat.status==='available');
        if(!chatReady){
          chatListLoadedRef.current=false;
          chatListPendingRef.current=false;
        }else if(!chatListLoadedRef.current&&!chatListPendingRef.current){
          chatListPendingRef.current=true;
          postHost({type:'agent-chat-list'});
        }
        return;
      }
      if(message.type==='logs'){setLogs(message.entries);return;}
      if(message.type==='log'){setLogs(prev=>[...prev,message.entry].slice(-200));return;}
      if(message.type==='agent-result'){
        setAgentRun(prev=>prev.requestId===message.requestId
          ? (message.error
            ? {requestId:message.requestId,status:'error',error:message.error}
            : {requestId:message.requestId,status:'done',result:message.result})
          : prev);
        return;
      }
      if(message.type==='agent-chat-list-result'){
        chatListPendingRef.current=false;
        chatListLoadedRef.current=true;
        setAgentChat(prev=>({
          ...prev,
          conversations:message.result.conversations??[],
          error:undefined,
        }));
        return;
      }
      if(message.type==='agent-chat-state'){
        const detail=message.result;
        chatListPendingRef.current=false;
        chatListLoadedRef.current=true;
        chatOpenPendingRef.current=false;
        setAgentChat(prev=>({
          ...prev,
          active:detail,
          runningRequestId:undefined,
          error:undefined,
          conversations:[
            detail.conversation,
            ...prev.conversations.filter(item=>item.id!==detail.conversation.id),
          ].sort((a,b)=>b.updatedAtMs-a.updatedAtMs),
        }));
        return;
      }
      if(message.type==='agent-chat-event'){
        if(message.envelope.type==='event'&&message.envelope.event){
          setAgentChat(prev=>({
            ...prev,
            lastEvent:message.envelope.event,
            error:undefined,
          }));
        }
        if(message.envelope.type==='error'){
          setAgentChat(prev=>({
            ...prev,
            runningRequestId:undefined,
            error:message.envelope.error??'Agent chat turn failed',
          }));
        }
        return;
      }
      if(message.type==='agent-chat-error'){
        if(!chatListLoadedRef.current) chatListPendingRef.current=false;
        chatOpenPendingRef.current=false;
        setAgentChat(prev=>({
          ...prev,
          runningRequestId:undefined,
          error:message.error,
        }));
        return;
      }
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

  useEffect(()=>{
    if(agentChat.active||!agentChat.conversations.length||chatOpenPendingRef.current)return;
    chatOpenPendingRef.current=true;
    postHost({type:'agent-chat-open',conversationId:agentChat.conversations[0].id});
  },[agentChat.active,agentChat.conversations]);

  const setPage=(next:PageId)=>{
    setPageState(next);
    window.location.hash=next;
  };

  const onAction=(action:string)=>{
    postHost({type:'action',action});
  };

  const onAgentRun=(prompt:string,workspace?:string)=>{
    const requestId=globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setAgentRun({requestId,status:'running'});
    postHost({type:'agent-run',requestId,prompt,workspace});
  };

  const onChatCreate=(workspace?:string)=>{
    postHost({type:'agent-chat-create',workspace});
  };

  const onChatOpen=(conversationId:string)=>{
    postHost({type:'agent-chat-open',conversationId});
  };

  const onChatSend=(conversationId:string,prompt:string)=>{
    const requestId=globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setAgentChat(prev=>({
      ...prev,
      runningRequestId:requestId,
      error:undefined,
    }));
    postHost({
      type:'agent-chat-send',
      requestId,
      clientRequestId:requestId,
      conversationId,
      prompt,
    });
  };

  const onChatCancel=(turnId:string)=>{
    postHost({type:'agent-chat-cancel',turnId});
  };

  const onChatArchive=(conversationId:string)=>{
    postHost({type:'agent-chat-archive',conversationId});
    setAgentChat(prev=>({
      ...prev,
      active:prev.active?.conversation.id===conversationId?undefined:prev.active,
    }));
  };

  const stableLogs=useMemo(()=>logs.slice(-200),[logs]);

  return <ReferenceUi
    page={page}
    setPage={setPage}
    snapshot={snapshot}
    logs={stableLogs}
    onAction={onAction}
    agentRun={agentRun}
    onAgentRun={onAgentRun}
    agentChat={agentChat}
    onChatCreate={onChatCreate}
    onChatOpen={onChatOpen}
    onChatSend={onChatSend}
    onChatCancel={onChatCancel}
    onChatArchive={onChatArchive}
  />;
}
