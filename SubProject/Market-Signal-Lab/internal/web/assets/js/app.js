
let envatoConnectionReady=false;
let envatoConnectionStatus=null;
let autopilotProductDirections=[];
let latestIntegrityRunID='';
let latestIntegritySummary=null;
const LANGUAGE_STORAGE_KEY='msl.language';
const FALLBACK_LANGUAGE='en';
let activeLanguage=FALLBACK_LANGUAGE;
let activeMessages={};
let fallbackMessages={};

function interpolate(message,vars={}){
  return String(message).replace(/\{([a-zA-Z0-9_]+)\}/g,(match,key)=>Object.prototype.hasOwnProperty.call(vars,key)?String(vars[key]):match);
}

function t(key,vars={}){
  const message=activeMessages[key]??fallbackMessages[key]??key;
  return interpolate(message,vars);
}

async function fetchLocale(code){
  const response=await fetch('/api/locales/'+encodeURIComponent(code));
  if(!response.ok)throw new Error('Unable to load locale '+code);
  return response.json();
}

async function loadSupportedLocales(){
  try{
    const response=await fetch('/api/locales');
    if(!response.ok)return FALLBACK_LANGUAGE;
    const payload=await response.json();
    const select=document.getElementById('languageSelect');
    if(select&&Array.isArray(payload.locales)&&payload.locales.length){
      select.innerHTML='';
      payload.locales.forEach(locale=>{
        const option=document.createElement('option');
        option.value=locale.code;
        option.textContent=locale.label;
        select.appendChild(option);
      });
    }
    return payload.default||FALLBACK_LANGUAGE;
  }catch(_){
    return FALLBACK_LANGUAGE;
  }
}

async function loadLocale(code){
  const requested=String(code||'').toLowerCase().split('-')[0];
  const normalized=requested==='id'?'id':FALLBACK_LANGUAGE;
  if(!Object.keys(fallbackMessages).length){
    const base=await fetchLocale(FALLBACK_LANGUAGE);
    fallbackMessages=base.messages||{};
  }
  if(normalized===FALLBACK_LANGUAGE){
    activeLanguage=FALLBACK_LANGUAGE;
    activeMessages=fallbackMessages;
    return activeLanguage;
  }
  try{
    const payload=await fetchLocale(normalized);
    activeLanguage=payload.code||normalized;
    activeMessages=payload.messages||{};
  }catch(_){
    activeLanguage=FALLBACK_LANGUAGE;
    activeMessages=fallbackMessages;
  }
  return activeLanguage;
}

function applyTranslations(root=document){
  root.querySelectorAll('[data-i18n]').forEach(element=>{element.textContent=t(element.dataset.i18n);});
  root.querySelectorAll('[data-i18n-placeholder]').forEach(element=>{element.placeholder=t(element.dataset.i18nPlaceholder);});
  root.querySelectorAll('[data-i18n-title]').forEach(element=>{element.title=t(element.dataset.i18nTitle);});
  root.querySelectorAll('[data-i18n-aria-label]').forEach(element=>{element.setAttribute('aria-label',t(element.dataset.i18nAriaLabel));});
  document.title=t('ui.document_title');
  document.documentElement.lang=activeLanguage;
  if(typeof refreshWorkspaceTranslations==='function')refreshWorkspaceTranslations();
}

function languageLocale(){return activeLanguage==='id'?'id-ID':'en-US';}
function formatNumber(value,options={}){const number=Number(value);return Number.isFinite(number)?new Intl.NumberFormat(languageLocale(),options).format(number):'—';}
function formatPercent(value,digits=1){const number=Number(value);return Number.isFinite(number)?new Intl.NumberFormat(languageLocale(),{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(number)+'%':'—';}
function formatDate(value,options={dateStyle:'medium',timeStyle:'short'}){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat(languageLocale(),options).format(date);}

function clearTransientResults(){
  ['scannerResult','rankingResult','catalogResult','sessionResult','observeResult','analysisResult','evidenceResult','envatoResult','compareResult'].forEach(id=>{
    const element=document.getElementById(id);
    if(element){element.classList.remove('show');element.innerHTML='';}
  });
}

async function setLanguage(code,{persist=true,refresh=true}={}){
  await loadLocale(code);
  if(persist){
    try{localStorage.setItem(LANGUAGE_STORAGE_KEY,activeLanguage);}catch(_){}
  }
  const select=document.getElementById('languageSelect');
  if(select)select.value=activeLanguage;
  applyTranslations();
  if(refresh&&typeof refreshAll==='function'){
    clearTransientResults();
    await refreshAll();
    const evidenceSelect=document.getElementById('evidenceIdentity');
    if(evidenceSelect&&evidenceSelect.value)await loadEvidence();
    const historySelect=document.getElementById('historyIdentity');
    if(historySelect&&historySelect.value)await loadHistory();
  }
  return activeLanguage;
}

async function initializeLocalization(){
  const serverDefault=await loadSupportedLocales();
  const requestedLanguage=new URLSearchParams(location.search).get('lang');
  let saved=requestedLanguage||serverDefault||FALLBACK_LANGUAGE;
  if(!requestedLanguage){try{saved=localStorage.getItem(LANGUAGE_STORAGE_KEY)||saved;}catch(_){}}
  await setLanguage(saved,{persist:false,refresh:false});
  const select=document.getElementById('languageSelect');
  if(select)select.addEventListener('change',event=>setLanguage(event.target.value).catch(error=>console.error(error)));
}

const $=selector=>document.querySelector(selector);
let identities=[];
let catalogs=[];
let queries=[];
let selectedCatalog='';
let selectedCatalogName='';

async function api(url,opts={}){
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  const response=await fetch(url,{...opts,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data.error||('HTTP '+response.status));
    error.code=data.code||'';
    error.status=response.status;
    error.view=data.view||null;
    error.details=data.details||null;
    throw error;
  }
  return data;
}

function showError(error){
  const message=error&&error.message?error.message:String(error||'');
  alert(t('dynamic.request_failed',{message}));
}

function n(value){if(value===''||value===null||value===undefined)return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function esc(value){return String(value||'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
const SEMANTIC_CONTRACT_V2='msl-semantic-contract/2';
function semanticValue(row,key,legacyValue){
  const s=row&&row.semantics;
  if(s&&s.contract&&s.contract.version===SEMANTIC_CONTRACT_V2&&Number.isFinite(Number(s[key])))return Number(s[key]);
  return legacyValue;
}
function translatedEnum(prefix,value,fallbackKey='dynamic.unknown'){
  const normalized=String(value||'').toLowerCase();
  if(!normalized)return t(fallbackKey);
  const key=prefix+'.'+normalized;
  const translated=t(key);
  return translated===key?String(value):translated;
}
function directionLabel(value){return translatedEnum('direction',value,'direction.unknown');}
function autopilotInsightLabel(value){return translatedEnum('autopilot_insight',value);}
function recommendationLabel(value){return translatedEnum('recommendation',value);}
function saturationLabel(value){return translatedEnum('saturation',value);}
function severityLabel(value){return translatedEnum('severity',value);}
function comparisonLabel(value){return translatedEnum('comparison',value,'comparison.unavailable');}
function sessionStatusLabel(value){return translatedEnum('session',value,'dynamic.unknown');}
function catalogLevelLabel(value){return translatedEnum('catalog_level',value,'dynamic.unknown');}
function freshnessLabel(value){
  const keys={LIVE:'status.live',FRESH:'status.fresh','STALE — REFRESH REQUIRED':'status.stale_refresh','IMPORTED SNAPSHOT':'status.imported_snapshot'};
  const key=keys[String(value||'')];
  return key?t(key):(value||t('dynamic.unknown'));
}
function translateWarning(value){
  if(!value)return '';
  return String(value)
    .replace('Proxy-only Elements analysis: Confidence is capped at 60 until direct Elements evidence is added.',t('warning.proxy_only'))
    .replace('Some scoring evidence is older than 72 hours; confidence is freshness-capped.',t('warning.stale_evidence'));
}
function freshnessBadge(value){
  const raw=String(value||'');
  const cls=raw==='LIVE'||raw==='FRESH'?'good':raw.indexOf('STALE')===0?'bad':'warn';
  return '<span class="pill '+cls+'">'+esc(freshnessLabel(raw))+'</span>';
}

function identitySelects(){
  const html=identities.length
    ?identities.map(identity=>'<option value="'+esc(identity.id)+'">'+esc(identity.subNiche)+' · '+esc(identity.productType)+'</option>').join('')
    :'<option value="">'+esc(t('dynamic.create_identity_first'))+'</option>';
  ['analysisIdentity','evidenceIdentity','envatoIdentity','benchmarkIdentity','historyIdentity'].forEach(id=>{$('#'+id).innerHTML=html;});
}

function catalogSelects(){
  const html=catalogs.length
    ?catalogs.map(row=>'<option value="'+esc(row.catalog.id)+'">'+esc(row.catalog.name)+' · '+esc(catalogLevelLabel(row.catalog.level))+'</option>').join('')
    :'<option value="">'+esc(t('dynamic.create_catalog_first'))+'</option>';
  $('#queryCatalogScope').innerHTML=html;
  $('#sessionCatalogScope').innerHTML=html;
  $('#rankingCatalogScope').innerHTML='<option value="">'+esc(t('dynamic.all_observed_catalogs'))+'</option>'+html;
}

async function loadIdentities(){
  identities=await api('/api/identities');
  identitySelects();
  $('#statIdentities').textContent=formatNumber(identities.length);
}

async function loadOverview(){
  const rows=await api('/api/overview');
  $('#overviewRows').innerHTML=rows.length?rows.map(row=>{
    const evidenceLabel=row.analysis.warning?t('dynamic.proxy_capped'):t('dynamic.mixed_direct');
    const evidenceClass=row.analysis.warning?'pill':'pill good';
    return '<tr><td><b>'+esc(row.identity.subNiche)+'</b><div class="muted">'+esc(row.identity.theme)+'</div></td><td>'+esc(row.identity.productType)+'</td><td><b class="accent">'+formatPercent(row.analysis.opportunity)+'</b></td><td>'+formatPercent(row.analysis.confidence)+'</td><td>'+esc(directionLabel(row.analysis.direction))+'</td><td><span class="'+evidenceClass+'">'+esc(evidenceLabel)+'</span></td></tr>';
  }).join(''):'<tr><td colspan="6" class="muted">'+esc(t('dynamic.no_analyses'))+'</td></tr>';
}

async function refreshUniverse(){
  catalogs=await api('/api/universe/catalogs');
  catalogSelects();
  $('#statCatalogs').textContent=formatNumber(catalogs.length);
  let coverage=0;
  let coverageCount=0;
  catalogs.forEach(row=>{if(row.researchSessions){coverage+=Number(row.coverage||0);coverageCount++;}});
  const leafCatalogs=catalogs.filter(row=>!catalogs.some(candidate=>candidate.catalog.parentId===row.catalog.id));
  $('#statProducts').textContent=formatNumber(leafCatalogs.reduce((sum,row)=>sum+row.observedProducts,0));
  $('#statAuthors').textContent=formatNumber(leafCatalogs.reduce((sum,row)=>sum+row.observedAuthors,0));
  $('#statCoverage').textContent=coverageCount?formatPercent(coverage/coverageCount):'—';
  $('#catalogRows').innerHTML=catalogs.length?catalogs.map(row=>{
    const catalog=row.catalog;
    return '<tr data-catalog="'+esc(catalog.id)+'" onclick="selectCatalog(\''+esc(catalog.id).replace(/'/g,'&#39;')+'\',\''+esc(catalog.name).replace(/'/g,'&#39;')+'\')"><td><span class="pill">'+esc(catalogLevelLabel(catalog.level))+'</span></td><td><b>'+esc(catalog.name)+'</b><div class="muted">'+esc(catalog.canonicalKey)+'</div></td><td>'+formatNumber(row.observedProducts)+'</td><td>'+formatNumber(row.observedAuthors)+'</td><td>'+formatNumber(row.researchQueries)+'</td><td>'+formatNumber(row.researchSessions)+'</td><td>'+formatPercent(row.coverage||0)+'</td><td>'+formatDate(row.lastObservedAt)+'</td></tr>';
  }).join(''):'<tr><td colspan="8" class="muted">'+esc(t('dynamic.create_catalog_path_begin'))+'</td></tr>';
  await loadQueries();
  if(selectedCatalog)await selectCatalog(selectedCatalog,selectedCatalogName||t('dynamic.selected_catalog'));
}

async function loadQueries(){
  queries=await api('/api/research/queries');
  $('#statQueries').textContent=formatNumber(queries.length);
  $('#queryRows').innerHTML=queries.length?queries.map(query=>'<tr><td>'+esc(query.name)+'</td><td>'+esc(query.sourceType)+'</td><td>'+esc(query.queryText)+'</td><td>'+esc(query.catalogScopeId)+'</td><td><button class="ghost" onclick="useQuery(\''+esc(query.id)+'\')">'+esc(t('dynamic.use'))+'</button> '+esc(query.id)+'</td></tr>').join(''):'<tr><td colspan="5" class="muted">'+esc(t('dynamic.no_queries'))+'</td></tr>';
}

function useQuery(id){
  const query=queries.find(item=>item.id===id);
  if(!query)return;
  $('#sessionQueryIds').value=id;
  $('#sessionCatalogScope').value=query.catalogScopeId;
  $('#observeQueryId').value=id;
}

async function selectCatalog(id,name){
  selectedCatalog=id;
  selectedCatalogName=name;
  $('#selectedCatalogLabel').style.display='block';
  $('#selectedCatalogLabel').innerHTML='<b>'+esc(t('dynamic.selected_catalog'))+'</b> '+esc(name)+' <span class="muted">'+esc(id)+'</span>';
  const products=await api('/api/universe/products?catalogId='+encodeURIComponent(id));
  const authors=await api('/api/universe/authors?catalogId='+encodeURIComponent(id));
  $('#productRows').innerHTML=products.length?products.map(row=>{
    const title=row.metadata?row.metadata.title:row.product.externalItemId;
    const author=row.author?row.author.displayName:t('dynamic.unknown');
    return '<tr><td><b>'+esc(title)+'</b><div class="muted">'+esc(row.product.externalItemId)+'</div></td><td>'+esc(author)+'</td><td>'+esc(row.product.sourceType)+'</td><td>'+freshnessBadge(row.metadataFreshness)+'</td><td>'+formatNumber(row.observationCount)+'</td><td>'+formatNumber(row.queryAppearances)+'</td><td>'+formatDate(row.lastObservedAt)+'</td></tr>';
  }).join(''):'<tr><td colspan="7" class="muted">'+esc(t('dynamic.no_products_scope'))+'</td></tr>';
  $('#authorRows').innerHTML=authors.length?authors.map(row=>'<tr><td><b>'+esc(row.author.displayName||row.author.externalAuthorKey)+'</b></td><td>'+esc(row.author.sourceType)+'</td><td>'+formatNumber(row.observedProducts)+'</td><td>'+formatNumber(row.catalogCount)+'</td><td>'+formatNumber(row.observationCount)+'</td></tr>').join(''):'<tr><td colspan="5" class="muted">'+esc(t('dynamic.no_authors_scope'))+'</td></tr>';
}

function rankingRFC3339(){const raw=$('#rankingAsOf').value;return raw?new Date(raw).toISOString():'';}
function percent(value){return formatPercent(value);}
function isCatalogWithin(scope,id){if(!scope)return true;let current=id;const byId=Object.fromEntries(catalogs.map(row=>[row.catalog.id,row.catalog]));while(current){if(current===scope)return true;current=byId[current]?byId[current].parentId:'';}return false;}

async function loadRankings(){
  const days=Number($('#rankingWindow').value||30);
  const asOf=rankingRFC3339();
  const scope=$('#rankingCatalogScope').value;
  let query='?windowDays='+days+(asOf?'&asOf='+encodeURIComponent(asOf):'');
  if(scope)query+='&parentId='+encodeURIComponent(scope);
  const catalogRows=await api('/api/ranking/catalogs'+query);
  let productRows=await api('/api/ranking/products?windowDays='+days+(asOf?'&asOf='+encodeURIComponent(asOf):''));
  if(scope)productRows=productRows.filter(row=>isCatalogWithin(scope,row.product.canonicalCatalogId));
  $('#catalogRankingRows').innerHTML=catalogRows.length?catalogRows.map(row=>'<tr data-catalog="'+esc(row.catalog.id)+'" onclick="useRankingCatalog(\''+esc(row.catalog.id)+'\')"><td><b>'+formatNumber(row.rank)+'</b></td><td><b>'+esc(row.catalog.name)+'</b><div class="muted">'+esc(row.catalog.canonicalKey)+'</div></td><td><b class="accent">'+percent(row.snapshot.trendScore)+'</b></td><td>'+esc(directionLabel(row.snapshot.direction))+'</td><td>'+percent(semanticValue(row,'catalogInsightScore',row.snapshot.opportunityScore))+'</td><td>'+(row.snapshot.comparableProducts===0?esc(t('semantic.legacy_no_comparable_direction')):percent(semanticValue(row,'directionalBreadth',row.snapshot.exposureBreadth)))+'</td><td>'+percent(semanticValue(row,'peerRelativeRank',row.snapshot.relativeStrength))+'</td><td>'+percent(semanticValue(row,'observedNewSupplyMomentumIndex',row.snapshot.newSupplyVelocityIndex))+'</td><td>'+percent(semanticValue(row,'competitionMomentumPercent',row.snapshot.competitionAcceleration))+'</td><td>'+formatNumber(row.snapshot.observedProducts)+'</td><td>'+formatNumber(row.snapshot.observedAuthors)+'</td><td>'+percent(row.snapshot.confidence)+'</td><td>'+percent(row.snapshot.coverage)+'</td></tr>').join(''):'<tr><td colspan="13" class="muted">'+esc(t('dynamic.no_catalog_ranking'))+'</td></tr>';
  $('#productRankingRows').innerHTML=productRows.length?productRows.map(row=>{
    const title=row.metadata?row.metadata.title:row.product.externalItemId;
    const author=row.author?row.author.displayName:t('dynamic.unknown_unavailable');
    return '<tr><td><b>'+formatNumber(row.rank)+'</b></td><td><b>'+esc(title)+'</b><div class="muted">'+esc(row.product.canonicalCatalogId)+'</div></td><td>'+esc(author)+'</td><td><b class="blue">'+percent(row.snapshot.exposureScore)+'</b></td><td>'+formatNumber(row.snapshot.rankVelocity||0,{minimumFractionDigits:1,maximumFractionDigits:1})+'</td><td>'+percent(row.snapshot.freshnessScore)+'</td><td>'+percent(semanticValue(row,'peerRelativeRank',row.snapshot.relativeStrength))+'</td><td>'+percent(semanticValue(row,'productInsightScore',row.snapshot.opportunityScore))+'</td><td>'+esc(directionLabel(row.snapshot.direction))+'</td><td>'+percent(row.snapshot.confidence)+'</td></tr>';
  }).join(''):'<tr><td colspan="10" class="muted">'+esc(t('dynamic.no_product_ranking'))+'</td></tr>';
}

function useRankingCatalog(id){$('#rankingCatalogScope').value=id;loadRankings().catch(showError);}

async function buildCurrentRankings(){
  const days=Number($('#rankingWindow').value||30);
  const asOf=rankingRFC3339();
  const scope=$('#rankingCatalogScope').value;
  const request={windowDays:days};
  if(asOf)request.asOf=asOf;
  if(scope)request.catalogScopeId=scope;
  try{
    const data=await api('/api/ranking/build',{method:'POST',body:JSON.stringify(request)});
    const element=$('#rankingResult');
    element.classList.add('show');
    element.innerHTML='<b>'+esc(t('dynamic.ranking_built'))+'</b><div class="muted">'+esc(t('dynamic.ranking_summary',{catalogs:formatNumber(data.catalogsPersisted),products:formatNumber(data.productsPersisted),days:formatNumber(data.window.days,{maximumFractionDigits:0})}))+'</div>';
    await loadRankings();
  }catch(error){showError(error);}
}

function clearCatalogSelection(){
  selectedCatalog='';
  selectedCatalogName='';
  $('#selectedCatalogLabel').style.display='none';
  $('#productRows').innerHTML='<tr><td colspan="7" class="muted">'+esc(t('dynamic.select_catalog'))+'</td></tr>';
  $('#authorRows').innerHTML='<tr><td colspan="5" class="muted">'+esc(t('dynamic.select_catalog'))+'</td></tr>';
}

const explorerOffsets={catalogs:0,products:0,authors:0,sessions:0};
const compareEndpoints={catalogs:'/api/compare/catalogs',products:'/api/compare/products'};
let activeExplorerTab='catalogs';
let savedViewsCache=[];

const explorerFieldMaps={
  catalogs:{text:'catalogExplorerText',parentId:'catalogExplorerParent',direction:'catalogExplorerDirection',windowDays:'catalogExplorerWindow',minTrend:'catalogExplorerMinTrend',minOpportunity:'catalogExplorerMinOpportunity',minConfidence:'catalogExplorerMinConfidence',minCoverage:'catalogExplorerMinCoverage',sortBy:'catalogExplorerSort',desc:'catalogExplorerDesc',limit:'catalogExplorerLimit'},
  products:{text:'productExplorerText',catalogId:'productExplorerCatalog',freshness:'productExplorerFreshness',windowDays:'productExplorerWindow',minExposure:'productExplorerMinExposure',minOpportunity:'productExplorerMinOpportunity',minConfidence:'productExplorerMinConfidence',minCoverage:'productExplorerMinCoverage',sortBy:'productExplorerSort',desc:'productExplorerDesc',limit:'productExplorerLimit'},
  authors:{text:'authorExplorerText',catalogId:'authorExplorerCatalog',minObservedProducts:'authorExplorerMinProducts',minObservationCount:'authorExplorerMinObservations',sortBy:'authorExplorerSort',desc:'authorExplorerDesc',limit:'authorExplorerLimit'},
  sessions:{text:'sessionExplorerText',catalogId:'sessionExplorerCatalog',status:'sessionExplorerStatus',minCoverage:'sessionExplorerMinCoverage',startedFrom:'sessionExplorerFrom',startedTo:'sessionExplorerTo',sortBy:'sessionExplorerSort',desc:'sessionExplorerDesc',limit:'sessionExplorerLimit'}
};

function switchExplorerTab(tab){
  activeExplorerTab=tab;
  document.querySelectorAll('[data-explorer-tab]').forEach(button=>button.classList.toggle('active',button.dataset.explorerTab===tab));
  document.querySelectorAll('[data-explorer-pane]').forEach(pane=>pane.classList.toggle('active',pane.dataset.explorerPane===tab));
  if(tab==='catalogs')loadCatalogExplorer();
  else if(tab==='products')loadProductExplorer();
  else if(tab==='authors')loadAuthorExplorer();
  else if(tab==='sessions')loadSessionExplorer();
  else if(tab==='watchlist')loadWatchlist();
  else if(tab==='savedViews')loadSavedViews();
}

function refreshExplorerCatalogOptions(){
  const options='<option value="">'+esc(t('static.all_catalogs'))+'</option>'+catalogs.map(row=>'<option value="'+esc(row.catalog.id)+'">'+esc(row.catalog.name)+' · '+esc(catalogLevelLabel(row.catalog.level))+'</option>').join('');
  ['catalogExplorerParent','productExplorerCatalog','authorExplorerCatalog','sessionExplorerCatalog'].forEach(id=>{
    const element=$('#'+id);if(!element)return;const value=element.value;element.innerHTML=options;if([...element.options].some(option=>option.value===value))element.value=value;
  });
}

function collectExplorerFilters(target){
  const map=explorerFieldMaps[target]||{};const filters={};
  Object.entries(map).forEach(([key,id])=>{const element=$('#'+id);if(element&&String(element.value).trim()!=='')filters[key]=String(element.value).trim();});
  return filters;
}

function applyExplorerFilters(target,filters){
  const map=explorerFieldMaps[target]||{};
  Object.entries(map).forEach(([key,id])=>{const element=$('#'+id);if(element&&Object.prototype.hasOwnProperty.call(filters,key))element.value=filters[key];});
}

function explorerURL(path,target){
  const params=new URLSearchParams(collectExplorerFilters(target));
  params.set('offset',String(explorerOffsets[target]||0));
  return path+'?'+params.toString();
}

function resetExplorerOffset(target){explorerOffsets[target]=0;}

function resetExplorerFilters(target){
  const map=explorerFieldMaps[target]||{};
  Object.values(map).forEach(id=>{const element=$('#'+id);if(!element)return;if(element.tagName==='SELECT')element.selectedIndex=0;else element.value='';});
  if(target==='catalogs'){ $('#catalogExplorerWindow').value='30';$('#catalogExplorerSort').value='trend';$('#catalogExplorerDesc').value='true';$('#catalogExplorerLimit').value='50'; }
  if(target==='products'){ $('#productExplorerWindow').value='30';$('#productExplorerSort').value='exposure';$('#productExplorerDesc').value='true';$('#productExplorerLimit').value='50'; }
  if(target==='authors'){ $('#authorExplorerSort').value='observations';$('#authorExplorerDesc').value='true';$('#authorExplorerLimit').value='50'; }
  if(target==='sessions'){ $('#sessionExplorerSort').value='started';$('#sessionExplorerDesc').value='true';$('#sessionExplorerLimit').value='50'; }
  explorerOffsets[target]=0;
  ({catalogs:loadCatalogExplorer,products:loadProductExplorer,authors:loadAuthorExplorer,sessions:loadSessionExplorer}[target])();
}

function updateExplorerPager(target,data){
  const summary=$('#'+target+'ExplorerSummary');if(summary)summary.textContent=t('dynamic.explorer_count',{shown:formatNumber(data.items.length),total:formatNumber(data.total)});
  const prev=$('#'+target+'Prev'),next=$('#'+target+'Next');if(prev)prev.disabled=data.offset<=0;if(next)next.disabled=data.offset+data.limit>=data.total;
}

function changeExplorerPage(target,direction){
  const limit=Number($('#'+target.replace(/s$/,'')+'ExplorerLimit')?.value||50);
  explorerOffsets[target]=Math.max(0,(explorerOffsets[target]||0)+(direction*limit));
  ({catalogs:loadCatalogExplorer,products:loadProductExplorer,authors:loadAuthorExplorer,sessions:loadSessionExplorer}[target])();
}

function actionButtons(type,id){
  const safe=esc(id).replace(/'/g,'&#39;');
  return '<button class="ghost" onclick="addToWatchlist(\''+type+'\',\''+safe+'\')">'+esc(t('static.add_to_watchlist'))+'</button> <button class="ghost" onclick="addCompareId(\''+type+'\',\''+safe+'\')">'+esc(t('static.add_to_compare'))+'</button>';
}

async function loadCatalogExplorer(){
  try{refreshExplorerCatalogOptions();const data=await api(explorerURL('/api/explorer/catalogs','catalogs'));
    $('#catalogExplorerRows').innerHTML=data.items.length?data.items.map(row=>{const s=row.snapshot;return '<tr><td><b>'+esc(row.catalog.name)+'</b><div class="muted">'+esc(row.catalog.canonicalKey)+'</div></td><td>'+esc(catalogLevelLabel(row.catalog.level))+'</td><td>'+formatNumber(row.observedProducts)+'</td><td>'+(s?formatPercent(s.trendScore):'—')+'</td><td>'+(s?formatPercent(semanticValue(row,'catalogInsightScore',s.opportunityScore)):'—')+'</td><td>'+(s?esc(directionLabel(s.direction)):'—')+'</td><td>'+(s?formatPercent(s.confidence):'—')+'</td><td>'+(s?formatPercent(s.coverage):formatPercent(row.coverage||0))+'</td><td>'+actionButtons('catalog',row.catalog.id)+'</td></tr>';}).join(''):'<tr><td colspan="9" class="muted">'+esc(t('dynamic.no_catalog_results'))+'</td></tr>';updateExplorerPager('catalogs',data);
  }catch(error){showError(error);}
}

async function loadProductExplorer(){
  try{refreshExplorerCatalogOptions();const data=await api(explorerURL('/api/explorer/products','products'));
    $('#productExplorerRows').innerHTML=data.items.length?data.items.map(row=>{const title=row.metadata?.title||row.product.externalItemId;const author=row.author?.displayName||row.metadata?.authorDisplayName||'—';const s=row.snapshot;return '<tr><td><b>'+esc(title)+'</b><div class="muted">'+esc(row.product.externalItemId)+'</div></td><td>'+esc(author)+'</td><td>'+freshnessBadge(row.metadataFreshness)+'</td><td>'+formatNumber(row.observationCount)+'</td><td>'+(s?formatPercent(s.exposureScore):'—')+'</td><td>'+(s?formatPercent(semanticValue(row,'productInsightScore',s.opportunityScore)):'—')+'</td><td>'+(s?esc(directionLabel(s.direction)):'—')+'</td><td>'+(s?formatPercent(s.confidence):'—')+'</td><td>'+actionButtons('product',row.product.id)+'</td></tr>';}).join(''):'<tr><td colspan="9" class="muted">'+esc(t('dynamic.no_product_results'))+'</td></tr>';updateExplorerPager('products',data);
  }catch(error){showError(error);}
}

async function loadAuthorExplorer(){
  try{refreshExplorerCatalogOptions();const data=await api(explorerURL('/api/explorer/authors','authors'));
    $('#authorExplorerRows').innerHTML=data.items.length?data.items.map(row=>'<tr><td><b>'+esc(row.author.displayName)+'</b><div class="muted">'+esc(row.author.externalAuthorKey)+'</div></td><td>'+formatNumber(row.observedProducts)+'</td><td>'+formatNumber(row.catalogCount)+'</td><td>'+formatNumber(row.observationCount)+'</td><td>'+formatDate(row.author.firstSeenAt)+'</td><td>'+formatDate(row.author.lastSeenAt)+'</td><td><button class="ghost" onclick="addToWatchlist(\'author\',\''+esc(row.author.id).replace(/'/g,'&#39;')+'\')">'+esc(t('static.add_to_watchlist'))+'</button></td></tr>').join(''):'<tr><td colspan="7" class="muted">'+esc(t('dynamic.no_author_results'))+'</td></tr>';updateExplorerPager('authors',data);
  }catch(error){showError(error);}
}

function localDateRFC3339(value){if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toISOString();}
async function loadSessionExplorer(){
  try{refreshExplorerCatalogOptions();const filters=collectExplorerFilters('sessions');if(filters.startedFrom)filters.startedFrom=localDateRFC3339(filters.startedFrom);if(filters.startedTo)filters.startedTo=localDateRFC3339(filters.startedTo);const params=new URLSearchParams(filters);params.set('offset',String(explorerOffsets.sessions||0));const data=await api('/api/explorer/sessions?'+params.toString());
    $('#sessionExplorerRows').innerHTML=data.items.length?data.items.map(row=>'<tr><td>'+formatDate(row.session.startedAt)+'</td><td>'+esc(row.session.scope)+'</td><td>'+esc(row.session.sourceType)+'</td><td>'+esc(sessionStatusLabel(row.session.status))+'</td><td>'+formatPercent(row.session.coverageEstimate)+'</td><td>'+formatNumber(row.session.requestsUsed)+' / '+formatNumber(row.session.requestBudget)+'</td><td>'+formatNumber(row.observedProducts)+'</td><td>'+formatNumber(row.observedAuthors)+'</td><td>'+formatNumber(row.observationRows)+'</td></tr>').join(''):'<tr><td colspan="9" class="muted">'+esc(t('dynamic.no_session_results'))+'</td></tr>';updateExplorerPager('sessions',data);
  }catch(error){showError(error);}
}

function prepareSavedView(target){
  $('#savedViewTarget').value=target;switchExplorerTab('savedViews');$('#savedViewName').focus();
}

async function saveCurrentView(){
  const name=$('#savedViewName').value.trim(),target=$('#savedViewTarget').value;if(!name){alert(t('dynamic.view_name_required'));return;}
  try{await api('/api/saved-views',{method:'POST',body:JSON.stringify({name,target,filters:collectExplorerFilters(target)})});$('#savedViewName').value='';await loadSavedViews();alert(t('dynamic.saved_view_saved'));}catch(error){showError(error);}
}

async function loadSavedViews(){
  try{savedViewsCache=await api('/api/saved-views');$('#savedViewRows').innerHTML=savedViewsCache.length?savedViewsCache.map(view=>'<tr><td><b>'+esc(view.name)+'</b></td><td>'+esc(t('static.'+view.target))+'</td><td><code>'+esc(JSON.stringify(view.filters))+'</code></td><td>'+formatDate(view.updatedAt)+'</td><td><button class="ghost" onclick="applySavedView(\''+esc(view.id)+'\')">'+esc(t('static.apply_view'))+'</button> <button class="ghost" onclick="deleteSavedView(\''+esc(view.id)+'\')">'+esc(t('static.delete'))+'</button></td></tr>').join(''):'<tr><td colspan="5" class="muted">'+esc(t('dynamic.no_saved_views'))+'</td></tr>';}catch(error){showError(error);}
}

async function applySavedView(id){const view=savedViewsCache.find(row=>row.id===id);if(!view)return;applyExplorerFilters(view.target,view.filters||{});resetExplorerOffset(view.target);switchExplorerTab(view.target);alert(t('dynamic.saved_view_applied'));}
async function deleteSavedView(id){try{await api('/api/saved-views?id='+encodeURIComponent(id),{method:'DELETE'});await loadSavedViews();alert(t('dynamic.saved_view_deleted'));}catch(error){showError(error);}}

async function addToWatchlist(entityType,entityId){try{await api('/api/watchlist',{method:'POST',body:JSON.stringify({entityType,entityId})});await loadWatchlist();alert(t('dynamic.watchlist_added'));}catch(error){showError(error);}}
function watchMetrics(row){if(row.catalogSnapshot)return t('dynamic.catalog_watch_metrics',{trend:formatPercent(row.catalogSnapshot.trendScore),opportunity:formatPercent(semanticValue(row,'catalogInsightScore',row.catalogSnapshot.opportunityScore))});if(row.productSnapshot)return t('dynamic.product_watch_metrics',{exposure:formatPercent(row.productSnapshot.exposureScore),opportunity:formatPercent(semanticValue(row,'productInsightScore',row.productSnapshot.opportunityScore))});return '—';}
async function loadWatchlist(){try{const days=Number($('#compareWindow')?.value||30);const rows=await api('/api/watchlist?windowDays='+days);$('#watchlistRows').innerHTML=rows.length?rows.map(row=>'<tr><td>'+esc(t('static.'+(row.entry.entityType==='catalog'?'catalog':row.entry.entityType==='product'?'product':'author')))+'</td><td><b>'+esc(row.label)+'</b><div class="muted">'+esc(row.entry.entityId)+'</div></td><td>'+esc(watchMetrics(row))+'</td><td>'+esc(row.entry.notes||'—')+'</td><td>'+formatDate(row.entry.updatedAt)+'</td><td><button class="ghost" onclick="deleteWatchlist(\''+esc(row.entry.id)+'\')">'+esc(t('static.delete'))+'</button></td></tr>').join(''):'<tr><td colspan="6" class="muted">'+esc(t('dynamic.no_watchlist_entries'))+'</td></tr>';}catch(error){showError(error);}}
async function deleteWatchlist(id){try{await api('/api/watchlist?id='+encodeURIComponent(id),{method:'DELETE'});await loadWatchlist();alert(t('dynamic.watchlist_deleted'));}catch(error){showError(error);}}

function addCompareId(type,id){const target=type==='catalog'?'catalogs':'products';$('#compareEntityType').value=target;const ids=$('#compareIds').value.split(',').map(value=>value.trim()).filter(Boolean);if(!ids.includes(id))ids.push(id);$('#compareIds').value=ids.slice(0,4).join(', ');switchExplorerTab('compare');}
async function runComparison(){const type=$('#compareEntityType').value;const ids=$('#compareIds').value.split(',').map(value=>value.trim()).filter(Boolean);if(ids.length<2||ids.length>4){alert(t('dynamic.comparison_requires_two'));return;}try{const rows=await api(compareEndpoints[type]+'?ids='+encodeURIComponent(ids.join(','))+'&windowDays='+encodeURIComponent($('#compareWindow').value));$('#compareRows').innerHTML=rows.map(row=>{if(type==='catalogs'){const s=row.snapshot;return '<div class="compare-card"><div class="section-label">'+esc(catalogLevelLabel(row.catalog.level))+'</div><h3 data-market-data="true">'+esc(row.catalog.name)+'</h3><div class="metric-list"><div class="metric"><span>'+esc(t('static.trend'))+'</span><b>'+(s?formatPercent(s.trendScore):'—')+'</b></div><div class="metric"><span>'+esc(t('semantic.catalog_insight_score'))+'</span><b>'+(s?formatPercent(semanticValue(row,'catalogInsightScore',s.opportunityScore)):'—')+'</b></div><div class="metric"><span>'+esc(t('static.products'))+'</span><b>'+formatNumber(row.observedProducts)+'</b></div><div class="metric"><span>'+esc(t('static.coverage'))+'</span><b>'+(s?formatPercent(s.coverage):formatPercent(row.coverage||0))+'</b></div></div></div>';}const s=row.snapshot,title=row.metadata?.title||row.product.externalItemId;return '<div class="compare-card"><div class="section-label">'+esc(row.author?.displayName||'—')+'</div><h3 data-market-data="true">'+esc(title)+'</h3><div class="metric-list"><div class="metric"><span>'+esc(t('static.exposure'))+'</span><b>'+(s?formatPercent(s.exposureScore):'—')+'</b></div><div class="metric"><span>'+esc(t('semantic.product_insight_score'))+'</span><b>'+(s?formatPercent(semanticValue(row,'productInsightScore',s.opportunityScore)):'—')+'</b></div><div class="metric"><span>'+esc(t('static.observations'))+'</span><b>'+formatNumber(row.observationCount)+'</b></div><div class="metric"><span>'+esc(t('static.coverage'))+'</span><b>'+(s?formatPercent(s.coverage):'—')+'</b></div></div></div>';}).join('');}catch(error){showError(error);}}

function evidenceNarrative(record){
  const assessment=record&&record.assessment?record.assessment:{};
  const eligibility=String(assessment.eligibility||'');
  if(eligibility==='SUPPRESSED')return t('evidence.narrative_suppressed');
  const evidenceStage=String(assessment.evidenceStage||'');
  if(evidenceStage==='MOVEMENT_INDICATION'&&eligibility==='DEGRADED')return t('evidence.narrative_movement_degraded');
  return t('evidence.narrative_composition');
}

function evidenceConfidence(record){
  const assessment=record&&record.assessment?record.assessment:{};
  const confidence=assessment.confidence||{};
  if(confidence.band==='UNCALIBRATED'||confidence.score===null||confidence.score===undefined)return t('evidence.uncalibrated');
  return confidence.band?String(confidence.band):t('evidence.uncalibrated');
}

function evidenceSignalLabel(row){
  const signalId=String(row&&row.signalId||'');
  const labels={
    'catalog.competition_acceleration.v0.2':'evidence.signal_competition_acceleration_v02',
    'catalog.odmi.v0.2':'evidence.signal_odmi_v02',
    'catalog.momentum_magnitude.v0.2':'evidence.signal_momentum_magnitude_v02',
    'catalog.peer_relative_rank_odmi.v0.2':'evidence.signal_peer_relative_rank_odmi_v02',
    'catalog.author_concentration_change.v0.2':'evidence.signal_author_concentration_change_v02',
    'structural.product_mass_weighted_movement.v0.2':'evidence.signal_product_mass_weighted_movement_v02',
    'structural.equal_segment_movement.v0.2':'evidence.signal_equal_segment_movement_v02',
    'structural.signed_movement_divergence.v0.2':'evidence.signal_signed_movement_divergence_v02',
    'structural.divergence_magnitude.v0.2':'evidence.signal_divergence_magnitude_v02'
  };
  const key=labels[signalId];
  return key?t(key):(signalId||'—');
}

function renderEvidenceAssessmentRow(row){
  const assessment=row&&row.assessment?row.assessment:{};
  const entity=[row.entityType,row.entityId].filter(Boolean).join(' · ')||'—';
  const signal=[evidenceSignalLabel(row),row.signalModelVersion].filter(Boolean).join(' · ')||'—';
  const reasons=Array.isArray(assessment.reasonCodes)&&assessment.reasonCodes.length?assessment.reasonCodes.join(', '):'—';
  return '<tr><td><b>'+esc(entity)+'</b></td><td><b>'+esc(signal)+'</b><div class="muted">'+esc(evidenceNarrative(row))+'</div></td><td>'+esc(assessment.evidenceStage||'—')+'</td><td>'+esc(assessment.eligibility||'—')+'</td><td>'+esc(evidenceConfidence(row))+'</td><td><code>'+esc(reasons)+'</code></td></tr>';
}

function renderEvidenceAssessments(rows){
  const body=$('#evidenceAssessmentRows');
  if(!body)return;
  const assessments=Array.isArray(rows)?rows:[];
  body.innerHTML=assessments.length?assessments.map(renderEvidenceAssessmentRow).join(''):'<tr><td colspan="6" class="muted">'+esc(t('evidence.no_assessments'))+'</td></tr>';
}

async function loadEvidenceAssessments(){
  const input=$('#evidenceRunId');
  const runId=String(input?input.value:'').trim();
  const versionInput=$('#evidenceRequirementsVersion');
  const requirementsVersion=String(versionInput?versionInput.value:'msl-evidence-requirements/1').trim()||'msl-evidence-requirements/1';
  const params=new URLSearchParams();
  if(runId)params.set('runId',runId);
  params.set('requirementsVersion',requirementsVersion);
  const query='?'+params.toString();
  try{
    const payload=await api('/api/evidence/assessments'+query);
    renderEvidenceAssessments(payload&&Array.isArray(payload.assessments)?payload.assessments:[]);
    return payload;
  }catch(error){showError(error);return null;}
}

async function buildEvidenceAssessments(){
  const input=$('#evidenceRunId');
  const runId=String(input?input.value:'').trim();
  if(!runId){alert(t('evidence.run_id_required'));return;}
  const versionInput=$('#evidenceRequirementsVersion');
  const requirementsVersion=String(versionInput?versionInput.value:'msl-evidence-requirements/1').trim()||'msl-evidence-requirements/1';
  const button=$('#evidenceBuildButton');
  if(button)button.disabled=true;
  try{
    await api('/api/evidence/assessments',{method:'POST',body:JSON.stringify({runId,requirementsVersion})});
    await loadEvidenceAssessments();
  }catch(error){showError(error);}
  finally{if(button)button.disabled=false;}
}

async function refreshAll(){
  await Promise.all([loadIdentities(),loadOverview(),refreshUniverse(),loadScannerSessions(),loadLegacyDemoIntegrity()]);
  await loadRankings();
  await Promise.all([loadEvidenceAssessments(),loadCatalogExplorer(),loadProductExplorer(),loadAuthorExplorer(),loadSessionExplorer(),loadWatchlist(),loadSavedViews()]);
}

$('#catalogForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const request=Object.fromEntries(new FormData(event.target).entries());
  Object.keys(request).forEach(key=>{if(!request[key])delete request[key];});
  try{
    const path=await api('/api/universe/catalog-path',{method:'POST',body:JSON.stringify(request)});
    const leaf=path[path.length-1];
    $('#catalogResult').classList.add('show');
    $('#catalogResult').innerHTML='<b>'+esc(t('dynamic.catalog_path_saved'))+'</b><div class="muted">'+esc(leaf.canonicalKey)+'</div>';
    await refreshUniverse();
  }catch(error){showError(error);}
});

$('#queryForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=new FormData(event.target);
  const filters={};
  ['site','category','page','page_size','sort_by'].forEach(key=>{if(form.get(key))filters[key]=String(form.get(key));});
  const request={name:form.get('name'),platform:form.get('platform'),sourceType:form.get('sourceType'),queryText:form.get('queryText'),catalogScopeId:form.get('catalogScopeId'),purpose:form.get('purpose'),filters,enabled:true};
  try{
    const query=await api('/api/research/queries',{method:'POST',body:JSON.stringify(request)});
    $('#sessionQueryIds').value=query.id;
    await loadQueries();
  }catch(error){showError(error);}
});

$('#sessionForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=new FormData(event.target);
  const request={sourceType:form.get('sourceType'),scope:form.get('scope'),queryIds:String(form.get('queryIds')).split(',').map(value=>value.trim()).filter(Boolean),requestBudget:Number(form.get('requestBudget')||0)};
  try{
    const session=await api('/api/research/sessions/start',{method:'POST',body:JSON.stringify(request)});
    $('#sessionResult').classList.add('show');
    $('#sessionResult').innerHTML='<b>'+esc(t('dynamic.research_session',{status:sessionStatusLabel(session.status)}))+'</b><div class="muted">'+esc(t('dynamic.session_summary',{id:session.id,coverage:formatPercent(session.coverageEstimate)}))+'</div>';
    $('#observeSessionId').value=session.id;
    await refreshUniverse();
  }catch(error){showError(error);}
});

$('#universeEnvatoForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=new FormData(event.target);
  const request={sessionId:form.get('sessionId'),queryId:form.get('queryId')};
  try{
    const data=await api('/api/research/envato/observe',{method:'POST',body:JSON.stringify(request)});
    $('#observeResult').classList.add('show');
    $('#observeResult').innerHTML='<b>'+esc(t('dynamic.observations_recorded',{count:formatNumber(data.observations)}))+'</b><div class="muted">'+esc(t('dynamic.observation_summary',{products:formatNumber(data.products),authors:formatNumber(data.authors),coverage:formatPercent(data.session.coverageEstimate)}))+'</div>';
    await refreshUniverse();
  }catch(error){showError(error);}
});

async function importUniverseCSV(){
  const file=$('#universeCsvFile').files[0];
  if(!file){alert(t('dynamic.choose_csv'));return;}
  try{
    const text=await file.text();
    const data=await api('/api/research/import-products-csv',{method:'POST',headers:{'Content-Type':'text/csv'},body:text});
    alert(t('dynamic.imported_product_observations',{count:formatNumber(data.imported)}));
    await refreshUniverse();
  }catch(error){showError(error);}
}

function scannerSummaryLabel(code){
  const keys={SCAN_COMPLETE:'scanner_summary.complete',SCAN_PARTIAL_BUDGET:'scanner_summary.partial_budget',SCAN_PARTIAL_ERROR:'scanner_summary.partial_error',SCAN_CANCELLED:'scanner_summary.cancelled',SCAN_FAILED:'scanner_summary.failed',SCAN_RUNNING:'scanner_summary.running'};
  return t(keys[code]||'scanner_summary.unknown');
}
function scanInsightLabel(code){
  const keys={RANKING_READY:'scan_insight.ranking_ready',INSUFFICIENT_HISTORY:'scan_insight.insufficient_history',LOW_COVERAGE:'scan_insight.low_coverage',PARTIAL_SCOPE:'scan_insight.partial_scope',SCAN_FAILED:'scan_insight.failed',SCAN_CANCELLED:'scan_insight.cancelled',SCAN_RUNNING:'scan_insight.running'};
  return t(keys[code]||'scan_insight.unknown');
}
function catalogNameByID(id){const row=catalogs.find(item=>item.catalog.id===id);return row?row.catalog.name:id;}

async function testScannerConnection(){return testEnvatoConnection();}

async function loadScannerSessions(){
  const body=$('#scannerSessionRows');
  if(!body)return;
  try{
    const rows=await api('/api/scanner/sessions');
    body.innerHTML=rows.length?rows.map(session=>'<tr><td>'+formatDate(session.startedAt)+'</td><td><span class="pill '+(session.status==='completed'?'good':session.status==='partial'?'warn':session.status==='failed'||session.status==='cancelled'?'bad':'')+'">'+esc(sessionStatusLabel(session.status))+'</span></td><td>'+esc(catalogNameByID(session.scope))+'</td><td>'+formatNumber(session.queriesCompleted)+' / '+formatNumber(session.queriesPlanned)+'</td><td>'+formatNumber(session.pagesCompleted)+' / '+formatNumber(session.pagesPlanned)+'</td><td>'+formatNumber(session.requestsUsed)+' / '+formatNumber(session.requestBudget)+'</td><td>'+formatNumber(session.observationsCollected||0)+'</td><td>'+formatNumber(session.productsObserved||0)+'</td><td>'+formatNumber(session.authorsObserved||0)+'</td><td>'+formatPercent(session.coverageEstimate||0)+'</td></tr>').join(''):'<tr><td colspan="10" class="muted">'+esc(t('dynamic.no_real_scan_sessions'))+'</td></tr>';
  }catch(error){body.innerHTML='<tr><td colspan="10" class="muted">'+esc(t('dynamic.sessions_unavailable'))+'</td></tr>';}
}

$('#scannerForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const keywords=$('#scannerKeywords').value.split(/[\n,]+/).map(value=>value.trim()).filter(Boolean);
  const request={
    catalog:{platform:'Envato Market',contentType:$('#scannerContentType').value,catalog:$('#scannerCatalog').value,subcatalog:$('#scannerSubcatalog').value,niche:$('#scannerNiche').value},
    keywords,
    site:$('#scannerSite').value,
    category:$('#scannerCategory').value,
    sortBy:$('#scannerSortBy').value==='default'?'':$('#scannerSortBy').value,
    maxPages:Number($('#scannerMaxPages').value||3),
    pageSize:Number($('#scannerPageSize').value||20),
    requestBudget:Number($('#scannerRequestBudget').value||20),
    autoBuildRanking:$('#scannerAutoRanking').checked
  };
  Object.keys(request.catalog).forEach(key=>{if(!request.catalog[key])delete request.catalog[key];});
  if(!keywords.length){alert(t('dynamic.enter_scan_keywords'));return;}
  const element=$('#scannerResult');
  try{
    element.classList.add('show');
    element.innerHTML='<b>'+esc(t('dynamic.scan_running'))+'</b><div class="muted">'+esc(t('dynamic.scan_running_note'))+'</div>';
    const data=await api('/api/scanner/envato/run',{method:'POST',body:JSON.stringify(request)});
    const rankingNote=data.rankingBuilt?t('dynamic.ranking_built_after_scan'):(data.rankingMessage?t('dynamic.ranking_not_built',{message:data.rankingMessage}):'');
    element.innerHTML='<b>'+esc(scannerSummaryLabel(data.summaryCode))+'</b><div class="callout blue-line">'+esc(scanInsightLabel(data.insightCode))+'</div><div class="metric-list" style="margin-top:10px"><div class="metric"><b>'+formatNumber(data.observations)+'</b><span>'+esc(t('static.observations'))+'</span></div><div class="metric"><b>'+formatNumber(data.products)+'</b><span>'+esc(t('static.products'))+'</span></div><div class="metric"><b>'+formatNumber(data.authors)+'</b><span>'+esc(t('static.authors'))+'</span></div><div class="metric"><b>'+formatPercent(data.session.coverageEstimate)+'</b><span>'+esc(t('static.coverage'))+'</span></div></div><div class="muted" style="margin-top:9px">'+esc(t('dynamic.scan_session_summary',{queries:formatNumber(data.session.queriesCompleted)+'/'+formatNumber(data.session.queriesPlanned),pages:formatNumber(data.session.pagesCompleted)+'/'+formatNumber(data.session.pagesPlanned),requests:formatNumber(data.session.requestsUsed)+'/'+formatNumber(data.session.requestBudget)}))+'</div>'+(rankingNote?'<div class="callout">'+esc(rankingNote)+'</div>':'');
    await refreshUniverse();
    await loadScannerSessions();
    if(data.rankingBuilt)await loadRankings();
  }catch(error){showError(error);}
});

function renderEnvatoConnection(status){
  envatoConnectionStatus=status||{provider:'envato',configured:false,status:'not_configured'};
  envatoConnectionReady=Boolean(envatoConnectionStatus.configured);
  const element=$('#sourceConnectionStatus');
  const state=String(envatoConnectionStatus.status||'not_configured');
  const source=String(envatoConnectionStatus.effectiveSource||'');
  const cls=state==='connected'?'good':envatoConnectionReady?'warn':'bad';
  let label=state==='connected'?t('autopilot.connected'):envatoConnectionReady?t('autopilot.configured'):t('autopilot.not_configured');
  if(source==='environment')label=t('autopilot.runtime_override');
  const details=[];
  if(envatoConnectionStatus.credentialFingerprint)details.push(t('autopilot.credential_id',{id:envatoConnectionStatus.credentialFingerprint}));
  if(envatoConnectionStatus.lastVerifiedAt)details.push(t('autopilot.last_verified',{at:formatDate(envatoConnectionStatus.lastVerifiedAt)}));
  if(element)element.innerHTML='<span class="pill '+cls+'">'+esc(label)+'</span>'+(details.length?'<div class="muted">'+details.map(esc).join('<br>')+'</div>':'');
  updateEnvatoDependentActions();
  const dialog=$('#envatoSetupDialog');
  if(dialog&&!envatoConnectionReady&&!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
  if(dialog&&envatoConnectionReady&&dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
  return envatoConnectionStatus;
}

function updateEnvatoDependentActions(){
  const selectors=['#mapMarketButton','#scannerForm button[type="submit"]','#envatoSearchForm button[type="submit"]'];
  selectors.forEach(selector=>{const element=$(selector);if(element)element.disabled=!envatoConnectionReady;});
  const totalButton=$('#envatoTotalItemsButton');if(totalButton)totalButton.disabled=!envatoConnectionReady;
}

async function loadEnvatoConnectionStatus(){
  try{return renderEnvatoConnection(await api('/api/connections/envato'));}
  catch(error){envatoConnectionReady=false;envatoConnectionStatus=null;updateEnvatoDependentActions();renderSourceConnectionFailure(error);return null;}
}

async function saveEnvatoCredentialFromInput(inputId){
  const input=$('#'+inputId);
  let token=String(input?.value||'').trim();
  if(!token){renderSourceConnectionFailure({code:'envato_token_missing',message:t('autopilot.configure_token_first')});return;}
  try{
    const data=await api('/api/connections/envato',{method:'POST',body:JSON.stringify({token})});
    renderEnvatoConnection(data);
  }catch(error){renderSourceConnectionFailure(error);}
  finally{if(input)input.value='';token='';}
}

async function testEnvatoConnection(){
  try{renderEnvatoConnection(await api('/api/connections/envato/test',{method:'POST',body:'{}'}));}
  catch(error){renderSourceConnectionFailure(error);}
}

async function removeEnvatoCredential(){
  try{renderEnvatoConnection(await api('/api/connections/envato',{method:'DELETE'}));}
  catch(error){renderSourceConnectionFailure(error);}
}

function envatoFailureCopy(code){
  if(code==='envato_token_missing'||code==='envato_not_configured')return {title:t('autopilot.token_missing_title'),message:t('autopilot.configure_token_first')};
  if(code==='envato_authentication_failed'||code==='envato_token_invalid')return {title:t('autopilot.invalid_token_title'),message:t('autopilot.invalid_token_desc')};
  if(code==='envato_token_missing_catalog_permission')return {title:t('autopilot.token_permission_title'),message:t('autopilot.token_permission_desc')};
  if(code==='envato_access_forbidden')return {title:t('autopilot.access_forbidden_title'),message:t('autopilot.access_forbidden_desc')};
  if(code==='envato_rate_limited')return {title:t('autopilot.rate_limited_title'),message:t('autopilot.rate_limited_desc')};
  if(code==='envato_service_unavailable'||code==='envato_provider_error')return {title:t('autopilot.service_unavailable_title'),message:t('autopilot.service_unavailable_desc')};
  if(code==='envato_network_unavailable')return {title:t('autopilot.connection_failed'),message:t('autopilot.network_unavailable_desc')};
  if(code==='credential_store_error')return {title:t('autopilot.connection_failed'),message:t('autopilot.credential_store_desc')};
  if(code==='envato_provider_response_error')return {title:t('autopilot.connection_failed'),message:t('autopilot.provider_response_desc')};
  if(code==='envato_catalog_surfaces_denied')return {title:t('autopilot.surface_denied_title'),message:t('autopilot.surface_denied_desc')};
  return {title:t('autopilot.map_failed'),message:t('autopilot.generic_failure')};
}
function safeConnectorDetails(error){
  const details=error&&error.details?error.details:{};
  const rows=[];
  if(details.upstreamStatus)rows.push(t('autopilot.upstream_status',{status:details.upstreamStatus}));
  if(details.endpoint)rows.push(t('autopilot.endpoint_used',{endpoint:details.endpoint}));
  return rows;
}
function renderSourceConnectionFailure(error){
  const code=error&&error.code?error.code:'envato_api_request_failed';
  const copy=envatoFailureCopy(code);
  const details=safeConnectorDetails(error);
  const technical=error&&error.message?error.message:String(error||'');
  const element=$('#sourceConnectionStatus');
  if(element)element.innerHTML='<span class="pill bad">'+esc(copy.title)+'</span><div class="muted">'+esc(copy.message)+'</div>'+(details.length?'<div class="muted">'+details.map(esc).join('<br>')+'</div>':'')+(technical?'<details><summary>'+esc(t('autopilot.technical_details'))+'</summary><code>'+esc(technical)+'</code></details>':'');
}
function autopilotDirectionLabel(value){if(value==='composition_only')return t('autopilot.composition_only');return directionLabel(value||'neutral');}
const ENVATO_PRODUCT_HOSTS=new Set(['themeforest.net','codecanyon.net','graphicriver.net','videohive.net','audiojungle.net','photodune.net','3docean.net','elements.envato.com']);
function safeProductSourceURL(raw){
  try{
    const value=String(raw||'').trim();
    if(!value)return '';
    const url=new URL(value);
    const host=url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
    if(url.protocol!=='https:'||url.username||url.password||url.port||!ENVATO_PRODUCT_HOSTS.has(host))return '';
    const path=(url.pathname||'').toLowerCase();
    if(host==='elements.envato.com'){if(!path||path==='/')return '';}else if(!path.includes('/item/'))return '';
    url.hostname=host;url.search='';url.hash='';
    return url.toString();
  }catch(_){return '';}
}
function productSourceURL(product){
  if(!product||!product.linkAvailable)return '';
  return safeProductSourceURL(product.sourceUrl);
}
function sourceProductLink(product,labelKey,className='ghost button-link'){
  const url=productSourceURL(product);
  if(!url)return '';
  return '<a class="'+className+'" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(t('autopilot.opens_original_new_tab'))+'">'+esc(t(labelKey))+' ↗</a>';
}
function productDisplayTitle(product,fallback){return (product&&(product.title||product.externalItemId||product.productId))||fallback||t('autopilot.untitled_product');}
function productTitleLink(product,fallback){
  const title=productDisplayTitle(product,fallback);const url=productSourceURL(product);
  return url?'<a class="product-title-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(t('autopilot.opens_original_new_tab'))+'">'+esc(title)+' ↗</a>':esc(title);
}
function formatTemporalDate(value,precision='datetime'){
  if(!value)return t('temporal.not_available');
  if(precision==='date'){
    const parts=String(value).slice(0,10).split('-');
    if(parts.length===3)return parts[2]+'/'+parts[1]+'/'+parts[0];
    return String(value);
  }
  const date=new Date(value);if(Number.isNaN(date.getTime()))return String(value);
  const pad=value=>String(value).padStart(2,'0');
  return pad(date.getDate())+'/'+pad(date.getMonth()+1)+'/'+date.getFullYear()+' '+pad(date.getHours())+':'+pad(date.getMinutes());
}
function renderProductTemporal(product){
  const temporal=product&&product.temporal?product.temporal:{};
  let releaseValue=t('temporal.release_unavailable');
  if(temporal.releaseConflict)releaseValue=t('temporal.release_conflict');
  else if(temporal.releaseAvailable)releaseValue=formatTemporalDate(temporal.releasedAt,temporal.releasePrecision||'datetime');
  const trendValue=temporal.lastTrendSeenAt?formatTemporalDate(temporal.lastTrendSeenAt,'datetime'):t('temporal.never_seen_in_trend');
  const active=new Set(Array.isArray(temporal.activeWindows)?temporal.activeWindows.map(Number):[]);
  const badges=[7,30,90].map(days=>'<span class="trend-window-badge '+(active.has(days)?'active':'')+'">'+days+'D</span>').join('');
  return '<div class="temporal-grid"><div class="temporal-item"><b>'+esc(t('temporal.first_release'))+'</b><span>'+esc(releaseValue)+'</span></div><div class="temporal-item"><b>'+esc(t('temporal.last_seen_in_trend'))+'</b><span>'+esc(trendValue)+'</span><div class="trend-window-badges">'+badges+'</div></div></div>';
}
function scanModeLabel(value){return translatedEnum('autopilot',value,'dynamic.unknown');}
async function loadAutopilotHistory(){
  try{
    const rows=await api('/api/autopilot/history');
    const byID=new Map((rows||[]).map(row=>[row.runId,row]));
    $('#marketMapHistoryRows').innerHTML=rows.length?rows.map(row=>{
      const prior=row.priorRunId?byID.get(row.priorRunId):null;
      const compared=row.priorRunId?(prior&&prior.completedAt?formatTemporalDate(prior.completedAt):row.priorRunId):t('temporal.current_composition');
      return '<tr><td>'+esc(formatTemporalDate(row.completedAt||row.startedAt))+'</td><td>'+esc(scanModeLabel(row.mode))+'</td><td>'+esc(sessionStatusLabel(row.status))+'</td><td>'+formatNumber(row.productsObserved||0)+'</td><td>'+formatPercent(row.coverage||0)+'</td><td>'+formatPercent(row.confidence||0)+'</td><td>'+esc(compared)+'</td></tr>';
    }).join(''):'<tr><td colspan="7" class="muted">'+esc(t('temporal.no_history'))+'</td></tr>';
  }catch(_){$('#marketMapHistoryRows').innerHTML='<tr><td colspan="7" class="muted">'+esc(t('temporal.no_history'))+'</td></tr>';}
}
function renderProductDirectionCard(row){
  const products=Array.isArray(row.sourceProducts)?row.sourceProducts:[];
  const primary=row.primaryProduct||(products.length===1?products[0]:null);
  const productCount=Math.max(Number(row.productCount||0),products.length);
  const title=primary?productTitleLink(primary,row.label):esc(row.label);
  let sourceAction='';
  if(productCount>1||(!primary&&productCount>0)){
    sourceAction='<button class="ghost" type="button" data-direction-id="'+esc(row.id)+'" onclick="openProductSourceModal(this.dataset.directionId)">'+esc(t('autopilot.view_products',{count:formatNumber(productCount)}))+'</button>';
  }else if(primary&&productSourceURL(primary)){
    sourceAction=sourceProductLink(primary,'autopilot.open_on_envato');
  }else{
    sourceAction='<button class="ghost" type="button" disabled title="'+esc(t('autopilot.product_link_unavailable'))+'">'+esc(t('autopilot.product_link_unavailable'))+'</button>';
  }
  const temporal=primary?renderProductTemporal(primary):'';
  return '<div class="compare-card"><h3>'+title+'</h3><div class="metric-list"><div class="metric"><b>'+formatPercent(row.opportunity)+'</b><span>'+esc(t('static.opportunity'))+'</span></div><div class="metric"><b>'+formatPercent(row.confidence)+'</b><span>'+esc(t('static.confidence'))+'</span></div></div>'+temporal+'<div class="actions">'+sourceAction+integrityScoreButton(row.provenanceId)+'<button class="ghost" onclick="investigateAutopilot(\'product_direction\',\''+esc(row.id).replace(/'/g,'&#39;')+'\')">'+esc(t('autopilot.investigate'))+'</button></div></div>';
}
function renderSourceProductRow(product){
  const author=product.authorDisplayName?'<span>'+esc(t('static.author'))+': '+esc(product.authorDisplayName)+'</span>':'';
  const metrics=[
    esc(t('semantic.product_insight_score'))+': '+formatPercent(product.opportunityScore||0),
    esc(t('static.exposure'))+': '+formatPercent(product.exposureScore||0),
    esc(t('static.freshness'))+': '+formatPercent(product.freshnessScore||0),
    esc(t('static.confidence'))+': '+formatPercent(product.confidence||0)
  ];
  const action=productSourceURL(product)?sourceProductLink(product,'autopilot.open_on_envato'):'<button class="ghost" type="button" disabled>'+esc(t('autopilot.product_link_unavailable'))+'</button>';
  return '<div class="source-product-row"><div><h3>'+productTitleLink(product,t('autopilot.untitled_product'))+'</h3><div class="source-product-meta">'+author+'<span>'+metrics.join(' · ')+'</span></div>'+renderProductTemporal(product)+'</div><div class="source-product-actions">'+action+'</div></div>';
}
function showProductSourceModal(label,products,availableCount){
  const list=Array.isArray(products)?products:[];
  $('#productSourceModalTitle').textContent=label||t('autopilot.observed_source_products');
  $('#productSourceModalSummary').textContent=t('autopilot.product_links_summary',{available:formatNumber(availableCount||0),count:formatNumber(list.length)});
  $('#productSourceModalList').innerHTML=list.length?list.map(renderSourceProductRow).join(''):'<div class="muted">'+esc(t('autopilot.no_evidence_products'))+'</div>';
  const modal=$('#productSourceModal');modal.hidden=false;document.body.style.overflow='hidden';
  const close=$('#productSourceModalClose');if(close)close.focus();
}
async function openProductSourceModal(directionID){
  const row=autopilotProductDirections.find(value=>value.id===directionID)||{};
  const fallback=Array.isArray(row.sourceProducts)?row.sourceProducts:[];
  showProductSourceModal(row.label||t('autopilot.observed_source_products'),[],0);
  $('#productSourceModalSummary').textContent='';
  $('#productSourceModalList').innerHTML='<div class="muted">'+esc(t('autopilot.loading_products'))+'</div>';
  try{
    const payload=await api('/api/autopilot/direction-products?id='+encodeURIComponent(directionID));
    showProductSourceModal(payload.label||row.label,payload.products||[],payload.availableCount||0);
  }catch(error){
    if(fallback.length){showProductSourceModal(row.label,fallback,fallback.filter(product=>productSourceURL(product)).length);}
    else{$('#productSourceModalList').innerHTML='<div class="muted">'+esc(t('autopilot.product_list_failed'))+'</div>';}
  }
}
function closeProductSourceModal(){const modal=$('#productSourceModal');if(modal)modal.hidden=true;document.body.style.overflow='';}
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeProductSourceModal();closeScoreProvenance();}});

function integrityStageLabel(value){
  const keys={composition:'integrity_ui.current_composition_index',movement:'integrity_ui.movement_indication',preliminary:'integrity_ui.preliminary_trend',established:'integrity_ui.established_trend'};
  return t(keys[String(value||'composition')]||keys.composition);
}
function integrityStageDescription(value){
  const keys={composition:'integrity_ui.composition_desc',movement:'integrity_ui.movement_desc',preliminary:'integrity_ui.preliminary_desc',established:'integrity_ui.established_desc'};
  return t(keys[String(value||'composition')]||keys.composition);
}
function integrityLevelLabel(value){const key='integrity_ui.level_'+String(value||'').replace(/[^a-z0-9]+/gi,'_').toLowerCase();const translated=t(key);return translated===key?String(value||'—'):translated;}
function integritySurfaceLabel(value){const key='integrity_ui.surface_'+String(value||'').replace(/[^a-z0-9]+/gi,'_').toLowerCase();const translated=t(key);return translated===key?String(value||'—'):translated;}
function integrityDivergenceLabel(value){const key='integrity_ui.divergence_'+String(value||'aligned');const translated=t(key);return translated===key?String(value||'—'):translated;}
function integrityQualityBadge(grade){const value=String(grade||'—');const cls=/^[A-D]$/.test(value)?'grade-'+value.toLowerCase():'';return '<span class="quality-grade '+cls+'">'+esc(value)+'</span>';}
function integrityScoreButton(provenanceId){if(!provenanceId)return '<button class="ghost score-action" data-action="why-this-score" disabled>'+esc(t('integrity_ui.why_this_score'))+'</button>';return '<button class="ghost score-action" data-action="why-this-score" data-provenance-id="'+esc(provenanceId)+'" onclick="openScoreProvenance(this.dataset.provenanceId)">'+esc(t('integrity_ui.why_this_score'))+'</button>';}
function resetSignalIntegrity(){
  $('#integrityStageTitle').textContent=t('integrity_ui.current_composition_index');$('#integrityStageDescription').textContent=t('integrity_ui.integrity_desc');$('#integrityStatusPill').textContent='—';
  $('#integrityVolumeIndex').textContent='—';$('#integrityEqualIndex').textContent='—';$('#integrityDivergence').textContent='—';$('#data-quality-grade').textContent='—';$('#data-quality-grade').className='quality-grade';$('#integrityCoverage').textContent='—';$('#integrityConfidence').textContent='—';$('#integrityComparableRuns').textContent='—';$('#integritySampleBalance').textContent='—';
  $('#signalQualitySummary').textContent=t('integrity_ui.no_integrity_data');$('#signalQualityReasons').innerHTML='';$('#sampleAuditSummary').textContent='—';$('#legacyReviewSummary').textContent='—';
  $('#segmentExplorerRows').innerHTML='<tr><td colspan="10" class="muted">'+esc(t('integrity_ui.no_integrity_data'))+'</td></tr>';
  $('#surfaceBreakdownRows').innerHTML='<tr><td colspan="8" class="muted">'+esc(t('integrity_ui.no_integrity_data'))+'</td></tr>';
  const button=$('#globalWhyScoreButton');button.disabled=true;button.dataset.provenanceId='';
}
function renderSignalIntegrity(audit,indices,qualities,surfaces,legacyReviews){
  const rows=Array.isArray(indices)?indices:[];
  const global=rows.find(row=>row.level==='global'&&row.entityId==='global')||rows[0];
  if(!global){resetSignalIntegrity();return;}
  const stage=String(global.directionStage||'composition');
  $('#integrityStageTitle').textContent=integrityStageLabel(stage);$('#integrityStageDescription').textContent=integrityStageDescription(stage);$('#integrityStatusPill').textContent=stage==='composition'?t('integrity_ui.current_composition_index'):integrityStageLabel(stage);
  $('#integrityVolumeIndex').textContent=formatPercent(semanticValue(global,'cappedCompositionConcentration',global.volumeWeightedValue||0));$('#integrityEqualIndex').textContent=formatPercent(semanticValue(global,'meanEligibleSegmentComposition',global.equalSectorValue||0));$('#integrityDivergence').textContent=formatPercent(semanticValue(global,'compositionWeightingGap',global.divergenceValue||0))+' · '+integrityDivergenceLabel(global.divergenceState);$('#data-quality-grade').outerHTML=integrityQualityBadge(global.dataQualityGrade).replace('<span','<b id="data-quality-grade"').replace('</span>','</b>');
  $('#integrityCoverage').textContent=formatPercent(global.coverage||0);$('#integrityConfidence').textContent=formatPercent(global.confidence||0);$('#integrityComparableRuns').textContent=formatNumber(global.comparableRuns||0);$('#integritySampleBalance').textContent=formatPercent(audit.sampleBalanceScore||0);
  const auditButton=$('#globalWhyScoreButton');auditButton.disabled=!global.provenanceId;auditButton.dataset.provenanceId=global.provenanceId||'';
  const q=(qualities||[]).find(row=>row.entityType==='global')||(qualities||[])[0]||{};
  $('#signalQualitySummary').textContent=t('integrity_ui.quality_summary',{grade:global.dataQualityGrade||'—',coverage:formatPercent(global.coverage||0),confidence:formatPercent(global.confidence||0)});
  const reasons=[...(audit.reasonCodes||[]),...(q.reasonCodes||[])];const caps=q.capsApplied||[];
  $('#signalQualityReasons').innerHTML=[...reasons.map(value=>'<span class="pill warn">'+esc(value)+'</span>'),...caps.map(value=>'<span class="pill">'+esc(value)+'</span>')].join('');
  $('#sampleAuditSummary').textContent=t('integrity_ui.audit_summary',{observations:formatNumber(audit.totalObservations||0),products:formatNumber(audit.uniqueProducts||0),completed:formatNumber(audit.completedStrata||0),target:formatNumber(audit.targetStrata||0),duplicate:formatPercent(audit.duplicateRate||0)});
  $('#legacyReviewSummary').textContent=t('integrity_ui.legacy_review_summary',{count:formatNumber((legacyReviews||[]).length)});
  $('#segmentExplorerRows').innerHTML=rows.length?rows.map(row=>'<tr><td><b>'+esc(row.label||row.entityId)+'</b><div class="muted">'+esc(row.entityId||'')+'</div></td><td>'+esc(integrityLevelLabel(row.level))+'</td><td>'+esc(integrityStageLabel(row.directionStage))+'</td><td>'+formatPercent(semanticValue(row,'observedSegmentComposition',row.compositionIndex||0))+'</td><td>'+formatPercent(semanticValue(row,'cappedCompositionConcentration',row.volumeWeightedValue||0))+'</td><td>'+formatNumber(row.sampleSize||0)+'</td><td>'+formatPercent(row.coverage||0)+'</td><td>'+formatPercent(row.confidence||0)+'</td><td>'+integrityQualityBadge(row.dataQualityGrade)+'</td><td>'+integrityScoreButton(row.provenanceId)+'</td></tr>').join(''):'<tr><td colspan="10" class="muted">'+esc(t('integrity_ui.no_integrity_data'))+'</td></tr>';
  $('#surfaceBreakdownRows').innerHTML=(surfaces||[]).length?surfaces.map(row=>'<tr><td><b>'+esc(integritySurfaceLabel(row.surface))+'</b></td><td>'+formatNumber(row.observations||0)+'</td><td>'+formatNumber(row.uniqueProducts||0)+'</td><td>'+formatPercent(row.duplicateRate||0)+'</td><td>'+formatNumber(row.targetsCompleted||0)+'</td><td>'+formatNumber(row.targetsFailed||0)+'</td><td>'+formatPercent(row.reliability||0)+'</td><td>'+formatPercent(row.contribution||0)+'</td></tr>').join(''):'<tr><td colspan="8" class="muted">'+esc(t('integrity_ui.no_integrity_data'))+'</td></tr>';
}
async function loadSignalIntegrity(runId){
  if(!runId){resetSignalIntegrity();return;}
  try{const encoded=encodeURIComponent(runId);const [audit,indices,qualities,surfaces,legacyReviews]=await Promise.all([api('/api/integrity/sample-audit?runId='+encoded),api('/api/integrity/indices?runId='+encoded),api('/api/integrity/quality?runId='+encoded),api('/api/integrity/surfaces?runId='+encoded),api('/api/integrity/legacy-reviews?status=open')]);renderSignalIntegrity(audit,indices,qualities,surfaces,legacyReviews);}catch(error){resetSignalIntegrity();console.error(error);}
}
function provenanceList(values){return (values||[]).length?'<ul class="integrity-list">'+values.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>':'<div class="muted">—</div>';}
function provenanceDistribution(values){return (values||[]).length?'<ul class="integrity-list">'+values.map(row=>'<li>'+esc(row.label||row.key)+' · '+formatNumber(row.count||0)+' · '+formatPercent(row.share||0)+'</li>').join('')+'</ul>':'<div class="muted">—</div>';}
function provenanceComponents(values){return (values||[]).length?'<div class="table-wrap"><table><thead><tr><th>'+esc(t('integrity_ui.component'))+'</th><th>'+esc(t('integrity_ui.raw_value'))+'</th><th>'+esc(t('integrity_ui.original_weight'))+'</th><th>'+esc(t('integrity_ui.effective_weight'))+'</th><th>'+esc(t('integrity_ui.contribution'))+'</th></tr></thead><tbody>'+values.map(row=>'<tr><td>'+esc(row.name)+'</td><td>'+formatPercent(row.rawValue||0)+'</td><td>'+formatPercent((row.originalWeight||0)*100)+'</td><td>'+formatPercent((row.effectiveWeight||0)*100)+'</td><td>'+formatPercent(row.contribution||0)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="muted">—</div>';}
async function openScoreProvenance(id){if(!id)return;const modal=$('#score-provenance-modal');modal.hidden=false;document.body.style.overflow='hidden';$('#scoreProvenanceModalBody').innerHTML='<div class="muted">'+esc(t('integrity_ui.loading_provenance'))+'</div>';try{const row=await api('/api/integrity/provenance?id='+encodeURIComponent(id));$('#scoreProvenanceModalBody').innerHTML='<div class="provenance-grid"><div class="provenance-block"><b>'+esc(t('integrity_ui.identity'))+'</b><span>'+esc(row.entityType)+' · '+esc(row.entityId)+'</span></div><div class="provenance-block"><b>'+esc(t('integrity_ui.final_score'))+'</b><span>'+formatPercent(row.finalScore||0)+' · '+esc(row.scoreType||'')+'</span></div><div class="provenance-block"><b>'+esc(t('integrity_ui.runs'))+'</b><span>'+esc(row.runId||'—')+'<br>'+esc(row.priorRunId||'—')+'</span></div><div class="provenance-block"><b>'+esc(t('integrity_ui.versions'))+'</b><span>'+esc(row.plannerVersion||'—')+'<br>'+esc(row.samplingSchemaVersion||'—')+'<br>'+esc(row.taxonomyVersion||'—')+'<br>'+esc(row.weightSetVersion||'—')+'<br>'+esc(row.modelVersion||'—')+'</span></div><div class="provenance-block"><b>'+esc(t('integrity_ui.evidence_quality'))+'</b><span>'+esc(t('integrity_ui.sample_size'))+': '+formatNumber(row.sampleSize||0)+'<br>'+esc(t('static.coverage'))+': '+formatPercent(row.coverage||0)+'<br>'+esc(t('static.confidence'))+': '+formatPercent(row.confidence||0)+'<br>'+esc(t('integrity_ui.data_quality'))+': '+esc(row.dataQualityGrade||'—')+'</span></div><div class="provenance-block"><b>'+esc(t('integrity_ui.generated_at'))+'</b><span>'+esc(formatDate(row.generatedAt))+'</span></div></div><h3>'+esc(t('integrity_ui.distributions'))+'</h3>'+provenanceDistribution(row.siteDistribution)+provenanceDistribution(row.catalogDistribution)+provenanceDistribution(row.surfaceDistribution)+'<h3>'+esc(t('integrity_ui.weights_contributions'))+'</h3>'+provenanceComponents(row.components)+'<div class="provenance-grid"><div class="provenance-block"><b>'+esc(t('integrity_ui.missing_components'))+'</b>'+provenanceList(row.missingComponents)+'</div><div class="provenance-block"><b>'+esc(t('integrity_ui.fallback_rules'))+'</b>'+provenanceList(row.fallbackRules)+'</div><div class="provenance-block"><b>'+esc(t('integrity_ui.reason_codes'))+'</b>'+provenanceList(row.reasonCodes)+'</div></div>';}catch(error){$('#scoreProvenanceModalBody').innerHTML='<div class="warning">'+esc(error.message||String(error))+'</div>';}}
function closeScoreProvenanceModal(){const modal=$('#score-provenance-modal');if(modal)modal.hidden=true;document.body.style.overflow='';}
function closeScoreProvenance(){closeScoreProvenanceModal();}

function renderAutopilot(view){
  if(!view||!view.run)return;
  const run=view.run;const direction=view.direction;
  $('#autopilotCoverage').textContent=formatPercent(run.coverage||0);$('#autopilotConfidence').textContent=formatPercent(run.confidence||0);$('#autopilotObservedProducts').textContent=formatNumber(run.productsObserved||0);$('#autopilotTemperature').textContent=direction?formatPercent(direction.temperature||0):'—';const directionLabel=direction&&direction.compositionOnly?t('integrity_ui.current_composition_index'):t('autopilot.market_direction');$('#autopilotTemperatureLabel').textContent=directionLabel;$('#marketDirectionHeading').textContent=directionLabel;
  $('#marketDirectionCard').innerHTML=direction?'<b>'+esc(autopilotDirectionLabel(direction.direction))+'</b><div class="muted">'+esc(direction.compositionOnly?t('autopilot.composition_only_desc'):t('autopilot.comparable_history_desc'))+'</div>':'—';
  loadAutopilotHistory();
  const catalogs=view.catalogs||[];$('#autopilotCatalogRows').innerHTML=catalogs.length?catalogs.slice().sort((a,b)=>Number(b.trendScore||0)-Number(a.trendScore||0)).slice(0,20).map(row=>{const stage=row.directionStage||'composition';const trend=stage==='composition'||row.trendScore==null?'—':formatPercent(row.trendScore);const opportunity=stage==='composition'||row.opportunityScore==null?'—':formatPercent(row.opportunityScore);return '<tr><td><b>'+esc(catalogNameByID(row.catalogId))+'</b></td><td>'+trend+'</td><td>'+opportunity+'</td><td>'+esc(integrityStageLabel(stage))+'</td><td>'+formatPercent(row.coverage)+'</td><td><div class="actions" style="margin-top:0">'+integrityScoreButton(row.provenanceId)+'<button class="ghost" onclick="investigateAutopilot(\'catalog\',\''+esc(row.catalogId).replace(/'/g,'&#39;')+'\')">'+esc(t('autopilot.investigate'))+'</button></div></td></tr>';}).join(''):'<tr><td colspan="6" class="muted">'+esc(t('autopilot.no_catalog_results'))+'</td></tr>';
  const dirs=view.productDirections||[];autopilotProductDirections=dirs;$('#productDirectionCards').innerHTML=dirs.length?dirs.map(renderProductDirectionCard).join(''):'<div class="muted">'+esc(t('autopilot.no_product_directions'))+'</div>';
  const insights=view.productionInsights||[];$('#productionInsightCards').innerHTML=insights.length?insights.slice(0,12).map(row=>'<div class="compare-card"><h3>'+esc(autopilotInsightLabel(row.code))+'</h3><div class="score">'+formatPercent(row.priority)+'</div><div class="muted">'+esc(recommendationLabel(row.recommendation))+'</div><div class="actions">'+integrityScoreButton(row.provenanceId)+'</div></div>').join(''):'<div class="muted">'+esc(t('autopilot.no_insights'))+'</div>';
  const alerts=view.saturationAlerts||[];$('#saturationWarningCards').innerHTML=alerts.length?alerts.map(row=>'<div class="compare-card"><span class="pill warn">'+esc(severityLabel(row.severity))+'</span><h3>'+esc(saturationLabel(row.code))+'</h3><div class="muted">'+esc(catalogNameByID(row.catalogId))+'</div><div class="actions">'+integrityScoreButton(row.provenanceId)+'</div></div>').join(''):'<div class="muted">'+esc(t('autopilot.no_saturation_warnings'))+'</div>';
  $('#autopilotState').innerHTML='<b>'+esc(t('autopilot.map_complete'))+'</b><div class="muted">'+esc(t('autopilot.map_summary',{products:formatNumber(run.productsObserved||0),authors:formatNumber(run.authorsObserved||0),coverage:formatPercent(run.coverage||0)}))+'</div>';
  const diagnostics=$('#autopilotDiagnostics');
  const errors=run.errors||[];
  if(errors.length){diagnostics.classList.add('show');diagnostics.innerHTML='<b>'+esc(t('autopilot.surface_diagnostics'))+'</b><div class="muted">'+errors.map(value=>'• '+esc(value)).join('<br>')+'</div>';}
  else{diagnostics.classList.remove('show');diagnostics.innerHTML='';}
  loadSignalIntegrity(run.id,view.integrity||null);
  if(typeof updateWorkspaceRunMeta==='function')updateWorkspaceRunMeta(run,view.integrity||null);
}
function renderAutopilotFailure(error){
  const code=error&&error.code?error.code:'autopilot_run_failed';
  const copy=envatoFailureCopy(code);
  $('#autopilotState').innerHTML='<b>'+esc(copy.title)+'</b><div class="muted">'+esc(copy.message)+'</div>';
  const diagnostics=$('#autopilotDiagnostics');
  diagnostics.classList.add('show');
  const createToken=['envato_token_missing_catalog_permission','envato_token_invalid','envato_authentication_failed','envato_access_forbidden'].includes(code)?'<div class="actions"><a class="secondary" style="display:inline-block;text-decoration:none;padding:9px 13px;border-radius:10px" href="https://build.envato.com/create-token/" target="_blank" rel="noopener">'+esc(t('autopilot.open_token_page'))+'</a></div>':'';
  const details=safeConnectorDetails(error);
  diagnostics.innerHTML='<b>'+esc(t('autopilot.diagnostics'))+'</b><div class="muted">'+esc(t('autopilot.error_code',{code}))+'</div>'+(details.length?'<div class="muted">'+details.map(value=>'• '+esc(value)).join('<br>')+'</div>':'')+'<details><summary>'+esc(t('autopilot.technical_details'))+'</summary><div class="callout">'+esc(error&&error.message?error.message:String(error||''))+'</div></details>'+createToken;
}
async function runMarketAutopilot(){return startAutopilotLiveRun(document.getElementById('autopilotMode').value);}
async function loadAutopilotLatest(){try{const data=await api('/api/autopilot/latest');if(data.available)renderAutopilot(data.view);}catch(error){showError(error);}}
async function investigateAutopilot(sourceType,sourceId){try{const seed=await api('/api/autopilot/investigate',{method:'POST',body:JSON.stringify({sourceType,sourceId})});$('#scannerContentType').value=seed.catalog?.contentType||'';$('#scannerCatalog').value=seed.catalog?.catalog||'';$('#scannerSubcatalog').value=seed.catalog?.subcatalog||'';$('#scannerNiche').value=seed.catalog?.niche||'';$('#scannerSite').value=seed.site||'graphicriver.net';$('#scannerCategory').value=seed.category||'';$('#scannerMaxPages').value=seed.maxPages||3;$('#scannerPageSize').value=seed.pageSize||20;$('#scannerRequestBudget').value=seed.requestBudget||12;$('#scannerKeywords').value=(seed.keywords||[]).join('\n');location.hash='advancedResearch';$('#advancedResearch').scrollIntoView({behavior:'smooth'});}catch(error){showError(error);}}

async function exportLocal(){
  try{
    const data=await api('/api/export');
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const anchor=document.createElement('a');
    anchor.href=URL.createObjectURL(blob);
    anchor.download='market-signal-lab-v0.3-alpha6.5.3-preview.1-export.json';
    anchor.click();
    setTimeout(()=>URL.revokeObjectURL(anchor.href),1000);
  }catch(error){showError(error);}
}

$('#identityForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=new FormData(event.target);
  try{
    await api('/api/identities',{method:'POST',body:JSON.stringify(Object.fromEntries(form.entries()))});
    event.target.reset();
    await loadIdentities();
  }catch(error){showError(error);}
});

$('#analysisForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=new FormData(event.target);
  const names=['demandProxy','supplyGap','marketMomentum','competitiveGap','freshnessGap','externalTrend','seasonality'];
  const features={};
  names.forEach(key=>{const value=n(form.get(key));if(value!==null)features[key]=value;});
  const request={identityId:$('#analysisIdentity').value,features,confidence:{evidenceVolume:85,relevantCoverage:80,independentSources:60,historyDepth:Math.min(100,Number(form.get('historySnapshots')||0)*8),featureCompleteness:Object.keys(features).length/7*100,crossSourceConsistency:70,recency:95,targetPlatform:'elements',directElementsEvidence:false,sourceClassCount:Number(form.get('sourceClassCount')||1),historySnapshots:Number(form.get('historySnapshots')||0),criticalEvidenceAgeHours:0}};
  try{
    const analysis=await api('/api/analyze',{method:'POST',body:JSON.stringify(request)});
    showAnalysis(analysis,$('#analysisResult'));
    await loadOverview();
  }catch(error){showError(error);}
});

function showAnalysis(analysis,element){
  element.classList.add('show');
  const warning=translateWarning(analysis.warning);
  element.innerHTML='<div class="score">'+formatPercent(analysis.opportunity)+'</div><div>'+esc(t('dynamic.analysis_summary',{confidence:formatPercent(analysis.confidence)}))+'</div>'+(warning?'<div class="warning">'+esc(warning)+'</div>':'')+'<div class="muted" style="margin-top:8px">'+esc(t('dynamic.model_coverage',{model:analysis.modelVersion,coverage:formatPercent(Number(analysis.coverageWeight||0)*100)}))+'</div>';
}

$('#evidenceForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=new FormData(event.target);
  let observed=form.get('observedAt');
  if(observed)observed=new Date(observed).toISOString();else observed=new Date().toISOString();
  const request={identityId:$('#evidenceIdentity').value,observedAt:observed,sourceType:form.get('sourceType'),sourceLabel:form.get('sourceLabel'),metric:form.get('metric'),value:Number(form.get('value')),unit:form.get('unit'),query:form.get('query'),sampleSize:Number(form.get('sampleSize')||0),reliability:form.get('reliability'),method:form.get('method'),notes:form.get('notes')};
  try{await api('/api/evidence',{method:'POST',body:JSON.stringify(request)});await loadEvidence();}catch(error){showError(error);}
});

async function loadEvidence(){
  const id=$('#evidenceIdentity').value;
  if(!id)return;
  try{
    const rows=await api('/api/evidence?id='+encodeURIComponent(id));
    $('#evidenceRows').innerHTML=rows.length?rows.slice().reverse().map(evidence=>'<tr><td>'+formatDate(evidence.observedAt)+'</td><td>'+esc(evidence.sourceLabel)+'<div class="muted">'+esc(evidence.sourceType)+'</div></td><td>'+esc(evidence.metric)+'</td><td><b>'+formatNumber(evidence.value)+'</b> '+esc(evidence.unit)+'</td><td>'+esc(evidence.query)+'</td><td>'+formatNumber(evidence.sampleSize||0)+'</td><td>'+esc(evidence.method)+'</td></tr>').join(''):'<tr><td colspan="7" class="muted">'+esc(t('dynamic.no_evidence'))+'</td></tr>';
  }catch(error){showError(error);}
}

async function analyzeFromEvidence(){
  const id=$('#evidenceIdentity').value;
  if(!id)return;
  try{
    const analysis=await api('/api/analyze-from-evidence?id='+encodeURIComponent(id),{method:'POST',body:'{}'});
    showAnalysis(analysis,$('#evidenceResult'));
    await loadOverview();
  }catch(error){showError(error);}
}

async function importEvidenceCSV(){
  const file=$('#evidenceCsvFile').files[0];
  if(!file){alert(t('dynamic.choose_csv'));return;}
  try{
    const text=await file.text();
    const data=await api('/api/evidence/import-csv',{method:'POST',headers:{'Content-Type':'text/csv'},body:text});
    alert(t('dynamic.imported_evidence_rows',{count:formatNumber(data.imported)}));
    await loadEvidence();
  }catch(error){showError(error);}
}

$('#envatoSearchForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const request={identityId:$('#envatoIdentity').value,term:$('#envatoTerm').value,site:$('#envatoSite').value,category:$('#envatoCategory').value,pageSize:Number($('#envatoPageSize').value||20)};
  try{
    const data=await api('/api/envato/search',{method:'POST',body:JSON.stringify(request)});
    const element=$('#envatoResult');
    element.classList.add('show');
    const exact=data.aggregate.totalHitsExact?t('dynamic.exact_total_reported'):t('dynamic.inexact_fallback');
    element.innerHTML='<b>'+esc(t('dynamic.search_matches',{count:formatNumber(data.aggregate.totalHits)}))+'</b><div class="muted">'+esc(exact)+' · '+esc(t('dynamic.aggregate_saved'))+'</div>';
    await loadEvidence();
  }catch(error){showError(error);}
});

async function fetchEnvatoTotal(){
  const request={identityId:$('#envatoIdentity').value};
  try{
    const data=await api('/api/envato/total-items',{method:'POST',body:JSON.stringify(request)});
    const element=$('#envatoResult');
    element.classList.add('show');
    element.innerHTML='<b>'+esc(t('dynamic.total_market_items',{count:formatNumber(data.aggregate.totalItems)}))+'</b><div class="muted">'+esc(t('dynamic.global_aggregate_saved'))+'</div>';
    await loadEvidence();
  }catch(error){showError(error);}
}

$('#benchmarkForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=new FormData(event.target);
  const request={identityId:$('#benchmarkIdentity').value,sourceLabel:'Envato Trends & Insights manual'};
  ['demand','growth','supply','searchToDownload','resultsCount'].forEach(key=>{const value=n(form.get(key));if(value!==null)request[key]=value;});
  request.direction=form.get('direction')||'';
  try{await api('/api/benchmark',{method:'POST',body:JSON.stringify(request)});alert(t('dynamic.benchmark_saved'));}catch(error){showError(error);}
});

async function runCompare(){
  const id=$('#benchmarkIdentity').value;
  if(!id)return;
  try{
    const comparison=await api('/api/compare?id='+encodeURIComponent(id));
    $('#agreement').textContent=formatPercent(comparison.agreement);
    $('#divergence').textContent=formatPercent(comparison.divergence);
    $('#dirAgreement').textContent=comparisonLabel(comparison.directionAgreement);
    $('#envComposite').textContent=comparison.benchmarkComposite==null?'—':formatPercent(comparison.benchmarkComposite);
    const element=$('#compareResult');
    element.classList.add('show');
    element.innerHTML='<b>'+esc(t('dynamic.comparison_complete'))+'</b><div class="muted">'+esc(t('dynamic.comparison_summary',{agreement:formatPercent(comparison.agreement),divergence:formatPercent(comparison.divergence)}))+'</div>';
  }catch(error){showError(error);}
}

async function loadHistory(){
  const id=$('#historyIdentity').value;
  if(!id)return;
  try{
    const rows=await api('/api/history?id='+encodeURIComponent(id));
    $('#historyRows').innerHTML=rows.length?rows.map(analysis=>'<tr><td>'+formatDate(analysis.asOf,{dateStyle:'medium'})+'</td><td><b>'+formatPercent(analysis.opportunity)+'</b></td><td>'+formatPercent(analysis.confidence)+'</td><td>'+esc(directionLabel(analysis.direction))+'</td><td>'+esc(analysis.modelVersion)+'</td><td>'+formatPercent(Number(analysis.coverageWeight||0)*100,0)+'</td></tr>').join(''):'<tr><td colspan="6" class="muted">'+esc(t('dynamic.no_history'))+'</td></tr>';
  }catch(error){showError(error);}
}

if(typeof initializeWorkspace==='function')initializeWorkspace();
initializeLocalization().then(async()=>{await loadEnvatoConnectionStatus();await refreshAll();await loadAutopilotLatest();await loadAutopilotHistory();if(typeof initializeConsensusWorkspace==='function')initializeConsensusWorkspace();if(typeof refreshWorkspaceTranslations==='function')refreshWorkspaceTranslations();}).catch(error=>console.error(error));
