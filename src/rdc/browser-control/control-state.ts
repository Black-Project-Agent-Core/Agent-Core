import { redactSensitiveString } from '../../security/redaction.js';
export interface ControlState {
  id: string; role: string; label: string; value?: string; selectedLabels?: string[]; selectedValues?: string[];
  checked?: string; selected?: string; expanded?: string; readOnly: boolean; disabled: boolean; truncated: boolean;
}
/** Independent read-only evidence. Control IDs are never mutation action IDs. */
export function projectControlStates(raw: {items?: any[]; total?: number}, observationId: string) {
  const items: ControlState[] = [];
  const total = Number.isSafeInteger(raw?.total) && raw.total! >= 0 ? raw.total! : (raw?.items?.length ?? 0);
  let truncated = false;
  for (const record of (raw?.items ?? []).slice(0,128)) {
    if (!Number.isSafeInteger(record.node) || record.node < 1) continue;
    let clipped = record.truncated === true;
    const text = (v: unknown) => { const s=redactSensitiveString(String(v ?? '')); if(s.length>500)clipped=true;return s.slice(0,500); };
    const item: ControlState = {id:observationId+':c'+record.node,role:text(record.role),label:text(record.label),
      readOnly:record.readOnly===true,disabled:record.disabled===true,truncated:false};
    for (const key of ['value','checked','selected','expanded'] as const) if(record[key]!==undefined)item[key]=text(record[key]);
    for (const key of ['selectedLabels','selectedValues'] as const) if(Array.isArray(record[key])) {
      if(record[key].length>16)clipped=true; item[key]=record[key].slice(0,16).map(text);
    }
    item.truncated=clipped;
    if(JSON.stringify({items:[...items,item],total,omitted:total-items.length-1,truncated:true}).length>8000)break;
    items.push(item);truncated ||= clipped;
  }
  return {items,total,omitted:Math.max(0,total-items.length),truncated:truncated||total>items.length};
}
