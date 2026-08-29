const DENSITY_STORAGE_KEY='msl.displayDensity';
const SIDEBAR_STORAGE_KEY='msl.sidebar';
const WORKSPACE_BREAKPOINT=1024;
let workspaceTableObserver=null;
let workspaceSectionObserver=null;
let workspaceNavigationLockUntil=0;

function workspaceTranslation(key,fallback){
  if(typeof t==='function'){
    const value=t(key);
    if(value!==key)return value;
  }
  return fallback||key;
}

function setDisplayDensity(value,{persist=true}={}){
  const normalized=value==='compact'?'compact':'comfortable';
  document.body.classList.toggle('density-compact',normalized==='compact');
  document.body.classList.toggle('density-comfortable',normalized!=='compact');
  const select=document.getElementById('densitySelect');
  if(select)select.value=normalized;
  if(persist){try{localStorage.setItem(DENSITY_STORAGE_KEY,normalized);}catch(_){}}
  return normalized;
}

function setSidebarCollapsed(collapsed,{persist=true}={}){
  const desktop=window.innerWidth>WORKSPACE_BREAKPOINT;
  document.body.classList.toggle('sidebar-collapsed',desktop&&Boolean(collapsed));
  const button=document.getElementById('sidebarCollapse');
  if(button){
    const current=document.body.classList.contains('sidebar-collapsed');
    button.setAttribute('aria-expanded',String(!current));
    button.textContent=current?'›':'‹';
    button.title=workspaceTranslation(current?'ui.expand_sidebar':'ui.collapse_sidebar',current?'Expand sidebar':'Collapse sidebar');
  }
  if(persist){try{localStorage.setItem(SIDEBAR_STORAGE_KEY,collapsed?'collapsed':'expanded');}catch(_){}}
}

function toggleSidebar(forceOpen){
  if(window.innerWidth<=WORKSPACE_BREAKPOINT){
    const shouldOpen=typeof forceOpen==='boolean'?forceOpen:!document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open',shouldOpen);
    const toggle=document.getElementById('sidebarToggle');
    if(toggle)toggle.setAttribute('aria-expanded',String(shouldOpen));
    return;
  }
  const collapsed=document.body.classList.contains('sidebar-collapsed');
  setSidebarCollapsed(!collapsed);
}

function closeMobileSidebar(){
  document.body.classList.remove('sidebar-open');
  const toggle=document.getElementById('sidebarToggle');
  if(toggle)toggle.setAttribute('aria-expanded','false');
}

function currentFilterToolbar(){
  const pane=document.querySelector('.explorer-pane.active');
  return pane?pane.querySelector('.filter-toolbar'):null;
}

function toggleFilterDrawer(forceOpen){
  const toolbar=currentFilterToolbar();
  if(!toolbar)return;
  const isOpen=toolbar.classList.contains('filter-open');
  const shouldOpen=typeof forceOpen==='boolean'?forceOpen:!isOpen;
  document.querySelectorAll('.filter-toolbar.filter-open').forEach(node=>node.classList.remove('filter-open'));
  if(shouldOpen)toolbar.classList.add('filter-open');
  document.body.classList.toggle('filter-drawer-open',shouldOpen);
  const button=document.getElementById('mobileFilterButton');
  if(button)button.setAttribute('aria-expanded',String(shouldOpen));
}

function setActiveWorkspaceSection(sectionID){
  if(!sectionID)return;
  const links=[...document.querySelectorAll('.sidebar-link[href^="#"]')];
  let active=null;
  links.forEach(link=>{
    const selected=link.getAttribute('href')==='#'+sectionID;
    link.classList.toggle('active',selected);
    if(selected)active=link;
  });
  if(active){
    const title=document.getElementById('activePageTitle');
    const key=active.dataset.sectionTitleKey;
    const label=key?workspaceTranslation(key,active.textContent.trim()):active.textContent.trim();
    if(title){
      title.textContent=label;
      if(key)title.dataset.i18n=key;
    }
  }
}

function initializeWorkspaceNavigation(){
  document.getElementById('sidebarToggle')?.addEventListener('click',()=>toggleSidebar());
  document.getElementById('sidebarCollapse')?.addEventListener('click',()=>toggleSidebar());
  document.getElementById('sidebarBackdrop')?.addEventListener('click',closeMobileSidebar);
  document.querySelectorAll('.sidebar-link[href^="#"]').forEach(link=>{
    link.addEventListener('click',event=>{
      const id=link.getAttribute('href').slice(1);
      const target=document.getElementById(id);
      if(target){
        event.preventDefault();
        workspaceNavigationLockUntil=Date.now()+1000;
        target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
        history.replaceState(null,'','#'+id);
        setActiveWorkspaceSection(id);
      }
      closeMobileSidebar();
    });
  });
  if('IntersectionObserver' in window){
    workspaceSectionObserver?.disconnect();
    workspaceSectionObserver=new IntersectionObserver(entries=>{
      const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible&&Date.now()>=workspaceNavigationLockUntil)setActiveWorkspaceSection(visible.target.id);
    },{root:null,rootMargin:'-82px 0px -65% 0px',threshold:[0,.05,.2,.5]});
    document.querySelectorAll('.workspace-section[id]').forEach(section=>workspaceSectionObserver.observe(section));
  }
}

function priorityForCell(header,index,total){
  const classes=[...header.classList].filter(name=>/^priority-[1-4]$/.test(name));
  if(classes.length)return classes[0];
  if(index===0||index===total-1)return'priority-1';
  if(index<=3)return'priority-2';
  if(index<=5)return'priority-3';
  return'priority-4';
}

function prepareResponsiveTable(table){
  if(!table)return;
  const headers=[...table.querySelectorAll('thead th')];
  const rows=[...table.querySelectorAll('tbody tr')];
  rows.forEach(row=>{
    row.classList.add('responsive-row-card');
    const cells=[...row.children].filter(node=>node.tagName==='TD');
    cells.forEach((cell,index)=>{
      if(cell.hasAttribute('colspan')){
        cell.dataset.label='';
        return;
      }
      const header=headers[index];
      const label=header?header.textContent.trim():'';
      cell.dataset.label=label;
      if(header)cell.classList.add(priorityForCell(header,index,headers.length));
    });
  });
  const wrap=table.closest('.table-wrap');
  if(wrap){wrap.classList.add('adaptive-table');wrap.dataset.responsiveTable='true';}
}

function refreshHistoryPreview(){
  document.querySelectorAll('.history-preview').forEach(wrap=>{
    const rowCount=wrap.querySelectorAll('tbody tr').length;
    wrap.classList.toggle('has-more',rowCount>Number(wrap.dataset.previewRows||3));
    const button=wrap.nextElementSibling;
    if(button?.matches('[data-view-all-target]'))button.hidden=rowCount<=Number(wrap.dataset.previewRows||3);
  });
}

function prepareResponsiveTables(root=document){
  root.querySelectorAll('.table-wrap table').forEach(prepareResponsiveTable);
  refreshHistoryPreview();
}

function initializeResponsiveTables(){
  prepareResponsiveTables();
  workspaceTableObserver?.disconnect();
  workspaceTableObserver=new MutationObserver(mutations=>{
    const roots=new Set();
    mutations.forEach(mutation=>{
      const table=mutation.target.closest?.('table');
      if(table)roots.add(table);
    });
    roots.forEach(prepareResponsiveTable);
    refreshHistoryPreview();
  });
  document.querySelectorAll('.table-wrap tbody').forEach(tbody=>workspaceTableObserver.observe(tbody,{childList:true,subtree:true}));
}

function initializeDisclosures(){
  document.querySelectorAll('[data-disclosure-target]').forEach(button=>{
    if(button.dataset.disclosureReady==='true')return;
    button.dataset.disclosureReady='true';
    button.addEventListener('click',()=>{
      const target=document.getElementById(button.dataset.disclosureTarget);
      if(!target)return;
      const expanded=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!expanded));
      target.hidden=expanded;
    });
  });
  document.querySelectorAll('[data-view-all-target]').forEach(button=>{
    if(button.dataset.viewAllReady==='true')return;
    button.dataset.viewAllReady='true';
    button.addEventListener('click',()=>{
      const target=document.getElementById(button.dataset.viewAllTarget);
      const wrap=target?.closest('.history-preview');
      if(!wrap)return;
      const expanded=wrap.classList.toggle('expanded');
      button.setAttribute('aria-expanded',String(expanded));
      const label=button.querySelector('span')||button;
      label.textContent=workspaceTranslation(expanded?'ui.show_less':'ui.view_all',expanded?'Show less':'View all');
    });
  });
}

function updateWorkspaceRunMeta(run,integrity){
  const lastScan=document.getElementById('workspaceLastScan');
  const quality=document.getElementById('workspaceDataQuality');
  if(lastScan&&run){
    const value=run.completedAt||run.startedAt||run.generatedAt;
    if(value){
      if(typeof formatTemporalDate==='function')lastScan.textContent=formatTemporalDate(value);
      else lastScan.textContent=new Date(value).toLocaleString();
    }
  }
  if(quality){
    const grade=integrity?.globalIndex?.dataQualityGrade||integrity?.dataQualityGrade||integrity?.grade||document.getElementById('data-quality-grade')?.textContent;
    if(grade&&grade!=='—')quality.textContent=String(grade);
  }
}

function refreshWorkspaceTranslations(){
  document.querySelectorAll('.sidebar-link[data-section-title-key]').forEach(link=>{
    const key=link.dataset.sectionTitleKey;
    const label=workspaceTranslation(key,link.querySelector('.nav-label')?.textContent.trim()||key);
    link.title=label;
    link.setAttribute('aria-label',label);
  });
  const active=document.querySelector('.sidebar-link.active');
  if(active){
    const id=(active.getAttribute('href')||'').replace(/^#/,'');
    setActiveWorkspaceSection(id);
  }
  const density=document.getElementById('densitySelect');
  if(density)density.setAttribute('aria-label',workspaceTranslation('ui.display_density','Display density'));
  const nav=document.getElementById('appSidebar');
  if(nav)nav.setAttribute('aria-label',workspaceTranslation('ui.main_navigation','Main navigation'));
  const collapse=document.getElementById('sidebarCollapse');
  if(collapse)setSidebarCollapsed(document.body.classList.contains('sidebar-collapsed'),{persist:false});
  document.querySelectorAll('[data-view-all-target]').forEach(button=>{
    const expanded=button.getAttribute('aria-expanded')==='true';
    const label=button.querySelector('span')||button;
    label.textContent=workspaceTranslation(expanded?'ui.show_less':'ui.view_all',expanded?'Show less':'View all');
  });
  document.querySelectorAll('.sidebar-link').forEach(link=>{
    const label=link.querySelector('.nav-label')?.textContent.trim();
    if(label)link.title=label;
  });
  prepareResponsiveTables();
}

function initializeWorkspace(){
  let density='comfortable';
  let sidebar='expanded';
  try{density=localStorage.getItem(DENSITY_STORAGE_KEY)||density;sidebar=localStorage.getItem(SIDEBAR_STORAGE_KEY)||sidebar;}catch(_){}
  setDisplayDensity(density,{persist:false});
  setSidebarCollapsed(sidebar==='collapsed',{persist:false});
  document.getElementById('densitySelect')?.addEventListener('change',event=>setDisplayDensity(event.target.value));
  initializeWorkspaceNavigation();
  initializeResponsiveTables();
  initializeDisclosures();
  document.querySelectorAll('[data-explorer-tab]').forEach(button=>button.addEventListener('click',()=>toggleFilterDrawer(false)));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      closeMobileSidebar();
      toggleFilterDrawer(false);
    }
  });
  window.addEventListener('resize',()=>{
    if(window.innerWidth>WORKSPACE_BREAKPOINT){closeMobileSidebar();toggleFilterDrawer(false);}
    setSidebarCollapsed(document.body.classList.contains('sidebar-collapsed'),{persist:false});
  },{passive:true});
  const hash=location.hash.replace(/^#/,'');
  setActiveWorkspaceSection(document.getElementById(hash)?hash:'autopilot');
}

function responsiveCheckReport(){
  const root=document.documentElement;
  const viewportWidth=window.innerWidth;
  const excluded=element=>{
    if(element.closest('.table-wrap'))return true;
    if(element.closest('.modal-backdrop[hidden]'))return true;
    if(window.innerWidth<=WORKSPACE_BREAKPOINT&&element.closest('.app-sidebar')&&!document.body.classList.contains('sidebar-open'))return true;
    if(window.innerWidth<=WORKSPACE_BREAKPOINT&&element.closest('.filter-toolbar')&&!element.closest('.filter-toolbar.filter-open'))return true;
    return false;
  };
  const clipped=[...document.querySelectorAll('button,a,input,select,textarea')].filter(element=>{
    if(excluded(element)||element.offsetParent===null)return false;
    const rect=element.getBoundingClientRect();
    return rect.width>0&&(rect.left<-1||rect.right>viewportWidth+1);
  }).map(element=>({tag:element.tagName,id:element.id||'',text:(element.textContent||element.getAttribute('aria-label')||'').trim().slice(0,80)}));
  return {
    viewportWidth,
    viewportHeight:window.innerHeight,
    scrollWidth:root.scrollWidth,
    bodyScrollWidth:document.body.scrollWidth,
    overflow:root.scrollWidth>viewportWidth+1||document.body.scrollWidth>viewportWidth+1,
    clipped,
    language:document.documentElement.lang,
    density:document.body.classList.contains('density-compact')?'compact':'comfortable'
  };
}

function publishResponsiveCheck(){
  if(new URLSearchParams(location.search).get('responsive-check')!=='1')return;
  let output=document.getElementById('responsiveCheckResult');
  if(!output){output=document.createElement('output');output.id='responsiveCheckResult';output.hidden=true;document.body.appendChild(output);}
  const report=responsiveCheckReport();
  output.dataset.overflow=String(report.overflow);
  output.dataset.clipped=String(report.clipped.length);
  output.textContent=JSON.stringify(report);
}

if(new URLSearchParams(location.search).get('responsive-check')==='1'){
  window.addEventListener('load',()=>setTimeout(publishResponsiveCheck,900),{once:true});
  window.addEventListener('resize',()=>setTimeout(publishResponsiveCheck,80),{passive:true});
}
