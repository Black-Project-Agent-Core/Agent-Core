import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  postHost,
  reduceAgentActivity,
  subscribeHost,
  type ActivityEntry,
  type AgentChatUiState,
  type AgentRunState,
  type DesktopSnapshot,
  type ReasoningChoice,
} from './host';
import { ReferenceUi } from './pages';
import type { PageId } from './components';

const validPages = new Set<PageId>(['chat','dashboard','goals','artifacts','models','memory','learning','core','systems','workflows','activity','diagnostics','settings','wizard']);

function pageFromHash(): PageId {
  const hash=window.location.hash.replace(/^#/,'').trim();
  const aliases:Record<string,PageId>={workspace:'chat',runtime:'core',integrations:'systems',dreaming:'learning'};
  const value=(aliases[hash]??hash) as PageId;
  return validPages.has(value) ? value : 'chat';
}

const PROVIDER_CHOICE_KEY='agentcore.chat.provider';
const REASONING_CHOICE_KEY='agentcore.chat.reasoning';
function readReasoningChoice():ReasoningChoice{
  try{return (window.localStorage.getItem(REASONING_CHOICE_KEY)||'auto') as ReasoningChoice;}catch{return 'auto';}
}
function readProviderChoice():string{
  try{return window.localStorage.getItem(PROVIDER_CHOICE_KEY)||'auto';}catch{return 'auto';}
}

export default function App() {
  const [page,setPageState]=useState<PageId>(()=>pageFromHash());
  const [snapshot,setSnapshot]=useState<DesktopSnapshot>();
  const [logs,setLogs]=useState<ActivityEntry[]>([]);
  const [agentRun,setAgentRun]=useState<AgentRunState>({status:'idle'});
  const [agentChat,setAgentChat]=useState<AgentChatUiState>(()=>({conversations:[],providerChoice:readProviderChoice(),modelChoice:'',reasoningChoice:readReasoningChoice()}));
  const chatListLoadedRef=useRef(false);
  const chatListPendingRef=useRef(false);
  const chatOpenPendingRef=useRef(false);
  const desiredChatIdRef=useRef<string | null | undefined>(undefined);
  const pendingChatRequestsRef=useRef(new Map<string,string>());
  const creatingRequestIdRef=useRef<string | undefined>(undefined);
  const anthropicProvider=agentChat.providers?.find(item=>item.id==='anthropic');
  const reasoningLevels=agentChat.modelChoice
    ? anthropicProvider?.models?.find(item=>item.id===agentChat.modelChoice)?.reasoningEfforts??[]
    : anthropicProvider?.reasoningEfforts??[];

  useEffect(()=>{
    if(agentChat.modelChoice&&agentChat.providers&&!anthropicProvider?.models?.some(item=>item.id===agentChat.modelChoice)){
      setAgentChat(prev=>({...prev,modelChoice:''}));
    }
  },[agentChat.modelChoice,agentChat.providers]);

  useEffect(()=>{
    const choice=agentChat.reasoningChoice??'auto';
    if(choice!=='auto'&&(!['low','medium','high','xhigh','max'].includes(choice)
      ||(agentChat.providerChoice==='anthropic'&&anthropicProvider&&!reasoningLevels.includes(choice)))){
      setAgentChat(prev=>({...prev,reasoningChoice:'auto',reasoningNotice:'Reasoning reset to Auto: saved level is not supported by this model.'}));
      try{window.localStorage.setItem(REASONING_CHOICE_KEY,'auto');}catch{/* storage is optional */}
    }
  },[agentChat.reasoningChoice,agentChat.providerChoice,agentChat.modelChoice,agentChat.providers]);

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
        const id=detail.conversation.id;
        const created=Boolean(creatingRequestIdRef.current&&message.requestId===creatingRequestIdRef.current);
        if(message.requestId&&pendingChatRequestsRef.current.get(id)===message.requestId)pendingChatRequestsRef.current.delete(id);
        const selected=desiredChatIdRef.current!==null&&(!desiredChatIdRef.current||desiredChatIdRef.current===id)
          &&(!creatingRequestIdRef.current||created);
        if(created)creatingRequestIdRef.current=undefined;
        if(selected)desiredChatIdRef.current=id;
        chatListPendingRef.current=false;
        chatListLoadedRef.current=true;
        if(selected)chatOpenPendingRef.current=false;
        setAgentChat(prev=>({
          ...prev,
          ...(selected?{active:detail,runningRequestId:pendingChatRequestsRef.current.get(id),error:undefined}:{}),
          ...(created?{creating:false}:{}),
          conversations:[
            detail.conversation,
            ...prev.conversations.filter(item=>item.id!==detail.conversation.id),
          ].sort((a,b)=>b.updatedAtMs-a.updatedAtMs),
        }));
        return;
      }
      if(message.type==='agent-chat-event'){
        if(message.envelope.type==='event'&&message.envelope.event){
          const event=message.envelope.event;
          if(event.type==='turn.accepted'&&desiredChatIdRef.current===event.conversationId&&!chatOpenPendingRef.current){
            chatOpenPendingRef.current=true;
            postHost({type:'agent-chat-open',conversationId:event.conversationId});
          }
          setAgentChat(prev=>prev.active?.conversation.id!==message.envelope.event!.conversationId?prev:({
            ...prev,
            lastEvent:message.envelope.event,
            activity:reduceAgentActivity(prev.activity??[],message.envelope.event!),
            error:undefined,
          }));
        }
        if(message.envelope.type==='error'){
          const owner=message.conversationId??[...pendingChatRequestsRef.current].find(([,request])=>request===message.requestId)?.[0];
          if(owner&&pendingChatRequestsRef.current.get(owner)===message.requestId)pendingChatRequestsRef.current.delete(owner);
          setAgentChat(prev=>owner&&prev.active?.conversation.id!==owner?prev:({
            ...prev,
            runningRequestId:prev.active?pendingChatRequestsRef.current.get(prev.active.conversation.id):undefined,
            error:message.envelope.error??'Agent chat turn failed',
          }));
        }
        return;
      }
      if(message.type==='agent-chat-error'){
        const createFailed=Boolean(creatingRequestIdRef.current&&message.requestId===creatingRequestIdRef.current);
        if(createFailed){creatingRequestIdRef.current=undefined;desiredChatIdRef.current=null;}
        const owner=message.conversationId??[...pendingChatRequestsRef.current].find(([,request])=>request===message.requestId)?.[0];
        if(owner&&message.requestId&&pendingChatRequestsRef.current.get(owner)===message.requestId)pendingChatRequestsRef.current.delete(owner);
        if(!chatListLoadedRef.current) chatListPendingRef.current=false;
        if(!owner||desiredChatIdRef.current===owner)chatOpenPendingRef.current=false;
        setAgentChat(prev=>owner&&prev.active?.conversation.id!==owner?prev:({
          ...prev,
          runningRequestId:prev.active?pendingChatRequestsRef.current.get(prev.active.conversation.id):undefined,
          ...(createFailed?{creating:false}:{}),
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
    if(desiredChatIdRef.current===null)return;
    if(desiredChatIdRef.current===undefined)desiredChatIdRef.current=active.conversation.id;
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
    const requestId=globalThis.crypto?.randomUUID?.() ?? `create-${Date.now()}`;
    creatingRequestIdRef.current=requestId;
    setAgentChat(prev=>({...prev,creating:true,error:undefined}));
    postHost({type:'agent-chat-create',requestId,workspace});
  };

  // The launcher opens on a draft: no conversation is selected or created until the first send.
  const onChatDraft=()=>{
    if(agentChat.creating)return;
    desiredChatIdRef.current=null;
    chatOpenPendingRef.current=false;
    setAgentChat(prev=>({...prev,active:undefined,runningRequestId:undefined,lastEvent:undefined,activity:undefined,error:undefined}));
  };

  const onChatOpen=(conversationId:string)=>{
    postHost({type:'agent-chat-open',conversationId});
  };

  const onChatSend=(conversationId:string,prompt:string,goalMode=false)=>{
    const requestId=globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pendingChatRequestsRef.current.set(conversationId,requestId);
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
      ...(goalMode?{goalMode:true}:{}),
      ...(providerId?{providerId}:{}),
      ...(providerId==='anthropic'&&agentChat.modelChoice&&anthropicProvider?.models?.some(item=>item.id===agentChat.modelChoice)
        ?{model:agentChat.modelChoice}:{}),
      ...(providerId==='anthropic'&&agentChat.reasoningChoice&&agentChat.reasoningChoice!=='auto'
        &&reasoningLevels.includes(agentChat.reasoningChoice)
        ?{reasoningEffort:agentChat.reasoningChoice}:{}),
    });
  };

  const onChatProvider=(choice:string)=>{
    setAgentChat(prev=>({...prev,providerChoice:choice,modelChoice:''}));
    try{window.localStorage.setItem(PROVIDER_CHOICE_KEY,choice);}catch{/* storage is optional */}
  };

  const onChatModel=(choice:string)=>{
    setAgentChat(prev=>({...prev,modelChoice:choice}));
  };

  const onChatReasoning=(choice:ReasoningChoice)=>{
    setAgentChat(prev=>({...prev,reasoningChoice:choice,reasoningNotice:undefined}));
    try{window.localStorage.setItem(REASONING_CHOICE_KEY,choice);}catch{/* storage is optional */}
  };

  const onChatCancel=(turnId:string)=>{
    postHost({type:'agent-chat-cancel',turnId,conversationId:agentChat.active?.conversation.id});
  };

  const onChatPause=(conversationId:string,turnId:string)=>{
    const requestId=globalThis.crypto?.randomUUID?.() ?? `pause-${Date.now()}`;
    postHost({type:'agent-chat-pause',requestId,conversationId,turnId});
  };

  const onChatResume=(conversationId:string,turnId:string)=>{
    if(pendingChatRequestsRef.current.has(conversationId))return;
    const requestId=globalThis.crypto?.randomUUID?.() ?? `resume-${Date.now()}`;
    pendingChatRequestsRef.current.set(conversationId,requestId);
    setAgentChat(prev=>({...prev,runningRequestId:requestId,error:undefined}));
    postHost({type:'agent-chat-resume',requestId,conversationId,turnId});
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
    desiredChatIdRef.current=null;
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
    onChatResume={onChatResume}
    onChatPause={onChatPause}
    onChatArchive={archiveTrackedChat}
    onChatProvider={onChatProvider}
    onChatModel={onChatModel}
    onChatReasoning={onChatReasoning}
    onChatDraft={onChatDraft}
  />;
}
