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

const validPages = new Set<PageId>(['chat','dashboard','core','systems','workflows','activity','diagnostics','settings']);

function pageFromHash(): PageId {
  const value=window.location.hash.replace(/^#/,'').trim() as PageId;
  return validPages.has(value) ? value : 'chat';
}

const PROVIDER_CHOICE_KEY='agentcore.chat.provider';
function readProviderChoice():string{
  try{return window.localStorage.getItem(PROVIDER_CHOICE_KEY)||'auto';}catch{return 'auto';}
}

export default function App() {
  const [page,setPageState]=useState<PageId>(()=>pageFromHash());
  const [snapshot,setSnapshot]=useState<DesktopSnapshot>();
  const [logs,setLogs]=useState<ActivityEntry[]>([]);
  const [agentRun,setAgentRun]=useState<AgentRunState>({status:'idle'});
  const [agentChat,setAgentChat]=useState<AgentChatUiState>(()=>({conversations:[],providerChoice:readProviderChoice()}));
  const chatListLoadedRef=useRef(false);
  const chatListPendingRef=useRef(false);
  const chatOpenPendingRef=useRef(false);
  const desiredChatIdRef=useRef<string | undefined>(undefined);

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
          postHost({type:'agent-chat-providers'});
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
      if(message.type==='agent-chat-providers-result'){
        setAgentChat(prev=>({...prev,providers:message.result.providers??[]}));
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

  // External chat turns do not notify WebView2. Refresh the existing host-owned list
  // while Chat is visible; a list update never changes the selected conversation.
  useEffect(()=>{
    if(page!=='chat'||!snapshot?.core.httpHealthy
      ||(snapshot.health.agentChat&&snapshot.health.agentChat.status!=='available'))return;
    const poll=()=>{
      if(document.visibilityState==='hidden'||chatListPendingRef.current)return;
      chatListPendingRef.current=true;
      postHost({type:'agent-chat-list'});
      postHost({type:'agent-chat-providers'});
    };
    poll();
    const timer=window.setInterval(poll,4000);
    document.addEventListener('visibilitychange',poll);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',poll);
    };
  },[page,snapshot?.core.httpHealthy,snapshot?.health.agentChat?.status]);

  useEffect(()=>{
    if(agentChat.error){
      chatListPendingRef.current=false;
      chatOpenPendingRef.current=false;
    }
  },[agentChat.error]);

  // Fetch only changed active threads, never overwrite an in-flight local send.
  // A manual selection takes priority over a delayed automatic read response.
  useEffect(()=>{
    const active=agentChat.active;
    if(!active)return;
    if(!desiredChatIdRef.current)desiredChatIdRef.current=active.conversation.id;
    if(page!=='chat')return;
    const desired=desiredChatIdRef.current;
    if(desired!==active.conversation.id){
      if(!chatOpenPendingRef.current){
        chatOpenPendingRef.current=true;
        postHost({type:'agent-chat-open',conversationId:desired});
      }
      return;
    }
    const latest=agentChat.conversations.find(item=>item.id===desired);
    if(!latest||latest.updatedAtMs<=active.conversation.updatedAtMs
      ||agentChat.runningRequestId||chatOpenPendingRef.current)return;
    chatOpenPendingRef.current=true;
    postHost({type:'agent-chat-open',conversationId:desired});
  },[page,agentChat.active,agentChat.conversations,agentChat.runningRequestId]);

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
    setAgentChat(prev=>({...prev,error:undefined}));
    postHost({type:'agent-chat-create',workspace});
  };

  // The launcher opens on a draft: no conversation is selected or created until the first send.
  const onChatDraft=()=>{
    desiredChatIdRef.current=undefined;
    chatOpenPendingRef.current=false;
    setAgentChat(prev=>({...prev,active:undefined,error:undefined}));
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
    const choice=agentChat.providerChoice;
    const providerId=choice&&choice!=='auto'&&agentChat.providers?.some(item=>item.id===choice&&item.configured)?choice:undefined;
    postHost({
      type:'agent-chat-send',
      requestId,
      clientRequestId:requestId,
      conversationId,
      prompt,
      ...(providerId?{providerId}:{}),
    });
  };

  const onChatProvider=(choice:string)=>{
    setAgentChat(prev=>({...prev,providerChoice:choice}));
    try{window.localStorage.setItem(PROVIDER_CHOICE_KEY,choice);}catch{/* storage is optional */}
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

  const openTrackedChat=(conversationId:string)=>{
    desiredChatIdRef.current=conversationId;
    chatOpenPendingRef.current=true;
    onChatOpen(conversationId);
  };
  const createTrackedChat=(workspace?:string)=>{
    desiredChatIdRef.current=undefined;
    onChatCreate(workspace);
  };
  const archiveTrackedChat=(conversationId:string)=>{
    desiredChatIdRef.current=undefined;
    onChatArchive(conversationId);
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
    onChatCreate={createTrackedChat}
    onChatOpen={openTrackedChat}
    onChatSend={onChatSend}
    onChatCancel={onChatCancel}
    onChatArchive={archiveTrackedChat}
    onChatProvider={onChatProvider}
    onChatDraft={onChatDraft}
  />;
}
