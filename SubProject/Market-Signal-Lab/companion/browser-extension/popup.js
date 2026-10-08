const statusEl=document.getElementById('status');
const setStatus=(text,error=false)=>{statusEl.textContent=text;statusEl.style.color=error?'#ff8f8f':'#b8c4ce'};
function accessFor(exp){return exp==='subscriber_app'?'active_subscriber':'anonymous'}
document.getElementById('capture').addEventListener('click',async()=>{
  setStatus('Reading visible cards…');
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id) throw new Error('No active tab.');
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extractors/envato.js']});
    if(!result?.ok) throw new Error(result?.error==='no_visible_items'?'No recognized visible item cards.':'Unsupported Envato page.');
    const exp=document.getElementById('context').value;
    const sort=document.getElementById('sort').value;
    const label=document.getElementById('label').value.trim() || (exp==='subscriber_app'?'Subscriber':'Public');
    const topK=Math.min(200,Math.max(1,result.items.length));
    const payload={context:{platform:'envato_subscription',experience:exp,accessState:accessFor(exp),sourceMethod:'user_initiated_page_capture',sourceSite:result.host,catalogPath:result.catalogPath,contentType:result.catalogPath.split('/').filter(Boolean)[0]||'unknown',sortMode:sort,filters:[],locale:(navigator.language||'en').split('-')[0].toLowerCase(),countryOrRegion:'',currency:'',pageSizeOrTopK:topK,contextLabel:label,contextVersion:'observation-context-v0.1'},pageUrl:result.pageUrl,topKRequested:topK,captureStatus:'complete',extractorVersion:'visible-ranking-v0.1',items:result.items};
    const response=await fetch('http://127.0.0.1:17771/api/consensus/capture-preview',{method:'POST',headers:{'Content-Type':'application/json','X-MSL-Explicit-Capture':'1'},body:JSON.stringify(payload)});
    const body=await response.json(); if(!response.ok) throw new Error(body.error||`MSL HTTP ${response.status}`);
    setStatus(`Preview ready: ${result.items.length} visible items.`);
    await chrome.tabs.create({url:`http://127.0.0.1:17771/?consensusPreview=${encodeURIComponent(body.previewId)}`});
  }catch(e){setStatus(e?.message||String(e),true)}
});
