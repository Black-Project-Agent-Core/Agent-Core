(() => {
  const allowed = new Set([
    'elements.envato.com','app.envato.com','themeforest.net','codecanyon.net','graphicriver.net',
    'videohive.net','audiojungle.net','photodune.net','3docean.net'
  ]);
  const host = location.hostname.replace(/^www\./,'').toLowerCase();
  if (!allowed.has(host)) return {ok:false,error:'unsupported_page'};
  const visible = el => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 24 && r.height > 24 && r.bottom > 0 && r.top < innerHeight && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const itemLink = href => {
    try {
      const u = new URL(href, location.href);
      const h = u.hostname.replace(/^www\./,'').toLowerCase();
      if (!allowed.has(h) || u.protocol !== 'https:') return null;
      if (h === 'elements.envato.com' || h === 'app.envato.com') {
        if (u.pathname.split('/').filter(Boolean).length < 1) return null;
      }
      return u;
    } catch { return null; }
  };
  const anchors = [...document.querySelectorAll('a[href]')].filter(visible);
  const seen = new Set();
  const items = [];
  for (const a of anchors) {
    const u = itemLink(a.href); if (!u) continue;
    const key = u.origin + u.pathname.replace(/\/$/,''); if (seen.has(key)) continue;
    const card = a.closest('article,[data-testid*="item"],[class*="card"],[class*="Card"],li') || a;
    if (!visible(card)) continue;
    const img = card.querySelector('img[alt]');
    let title = (a.getAttribute('aria-label') || a.getAttribute('title') || (img && img.alt) || a.textContent || '').trim().replace(/\s+/g,' ');
    if (!title || title.length > 180) title = (img && img.alt ? img.alt : '').trim();
    if (!title) continue;
    let externalItemId = '';
    const m = u.pathname.match(/-([A-Z0-9]{5,})$/i); if (m) externalItemId = m[1];
    seen.add(key);
    items.push({rank:items.length+1,externalItemId,sourceUrl:key,title:title.slice(0,180),authorPublicName:'',sourceCategory:'',taxonomyConfidence:0});
    if (items.length >= 200) break;
  }
  if (!items.length) return {ok:false,error:'no_visible_items'};
  return {ok:true,pageUrl:location.href,host,catalogPath:location.pathname,items};
})();
