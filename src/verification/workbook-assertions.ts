// Independent native selected-artifact assertions inspired by AIOS's rule dispatch.
// No donor evaluator source copied; donor Python provenance remains unresolved.
import ExcelJS from 'exceljs';
import * as z from 'zod/v4';
import { admitWorkbookZip, parseWorkbookCell, workbookDigest, WORKBOOK_MAX_BYTES, SPEC_MAX_BYTES, REPORT_MAX_BYTES } from './workbook-input.js';
const id=z.string().min(1).max(120),sheet=z.string().min(1).max(31);
const cell=z.string().refine(v=>!!parseWorkbookCell(v),'invalid A1 cell');
const value=z.union([z.string().max(32767),z.number().finite(),z.boolean(),z.null()]);
const cellBase={id,sheet,cell};
const rule=z.discriminatedUnion('kind',[
  z.strictObject({id,kind:z.literal('sheet-names'),names:z.array(sheet).min(1).max(256).refine(v=>new Set(v).size===v.length)}),
  z.strictObject({...cellBase,kind:z.literal('cell-value'),expected:value}),
  z.strictObject({...cellBase,kind:z.literal('cell-formula'),expected:z.string().min(1).max(32767)}),
  z.strictObject({...cellBase,kind:z.literal('cached-result'),expected:value}),
  z.strictObject({id,sheet,kind:z.literal('freeze'),rows:z.number().int().min(0).max(1048576),columns:z.number().int().min(0).max(16384)}),
]);
const specSchema=z.strictObject({version:z.literal(1),workbookDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),
  rules:z.array(rule).min(1).max(256).refine(v=>new Set(v.map(r=>r.id)).size===v.length)});
export type WorkbookSpec=z.infer<typeof specSchema>;
type Status='pass'|'fail'|'unavailable';
export interface WorkbookRuleReport {
  id:string;kind:string;sheet?:string;cell?:string;status:Status;reason:string;
  observed?:{type:string;digest:string}; cacheFreshness?:'not-established'; recalculated?:false;
}
export interface WorkbookAssertionReport {
  schemaVersion:1;algorithmRevision:string;status:Status;inputDigest?:string;specDigest?:string;errorCode?:string;
  counts:{pass:number;fail:number;unavailable:number};rules:WorkbookRuleReport[];
  runsFormulas:false;mutatesWorkbook:false;automaticApproval:false;memoryPersisted:false;
}
export function parseWorkbookSpec(raw:unknown):WorkbookSpec {
  const parsed=specSchema.safeParse(raw);
  if(!parsed.success)throw new Error('WORKBOOK_SPEC_INVALID');
  if(Buffer.byteLength(JSON.stringify(parsed.data))>SPEC_MAX_BYTES)throw new Error('WORKBOOK_SPEC_LIMIT');
  return parsed.data;
}
export function unavailableWorkbookReport(code:string):WorkbookAssertionReport {
  return {schemaVersion:1,algorithmRevision:'agent-core-workbook-assertions-v1',status:'unavailable',errorCode:code,
    counts:{pass:0,fail:0,unavailable:0},rules:[],runsFormulas:false,mutatesWorkbook:false,automaticApproval:false,memoryPersisted:false};
}
function typeOf(value:unknown):string {
  if(value===null||value===undefined)return 'blank';
  if(value instanceof Date)return 'date';
  if(typeof value==='object')return 'unsupported-object';
  return typeof value;
}
function evidence(value:unknown,type=typeOf(value)) {
  return {type,digest:workbookDigest(Buffer.from(JSON.stringify({type,value:value??null})))};
}
function compareValue(observed:unknown,expected:unknown):{status:Status;reason:string;observed?:{type:string;digest:string}} {
  if(!['blank','string','number','boolean'].includes(typeOf(observed))
    ||(typeof observed==='number'&&!Number.isFinite(observed)))return {status:'unavailable',reason:'UNSUPPORTED_VALUE_TYPE'};
  const equal=(observed===null||observed===undefined)?expected===null:typeof observed===typeof expected&&observed===expected;
  return {status:equal?'pass':'fail',reason:equal?'STORED_VALUE_EQUAL':'STORED_VALUE_MISMATCH',observed:evidence(observed)};
}
function evaluateRule(workbook:ExcelJS.Workbook,rule:WorkbookSpec['rules'][number]):WorkbookRuleReport {
  const base={id:rule.id,kind:rule.kind,...('sheet'in rule?{sheet:rule.sheet}:{}),...('cell'in rule?{cell:rule.cell}:{})};
  if(rule.kind==='sheet-names') {
    const names=workbook.worksheets.map(s=>s.name),equal=JSON.stringify(names)===JSON.stringify(rule.names);
    return {...base,status:equal?'pass':'fail',reason:equal?'SHEET_ORDER_EQUAL':'SHEET_ORDER_MISMATCH',observed:evidence(names,'sheet-names')};
  }
  const sheet=workbook.getWorksheet(rule.sheet);
  if(!sheet)return {...base,status:'fail',reason:'SHEET_MISSING'};
  if(rule.kind==='freeze') {
    const views=sheet.views??[];
    if(views.length>1||views.some(v=>v.state==='split'))return {...base,status:'unavailable',reason:'UNSUPPORTED_VIEW_STATE'};
    const view=views[0],rows=view?.state==='frozen'?(view.ySplit??0):0,columns=view?.state==='frozen'?(view.xSplit??0):0;
    const equal=rows===rule.rows&&columns===rule.columns;
    return {...base,status:equal?'pass':'fail',reason:equal?'FROZEN_PANES_EQUAL':'FROZEN_PANES_MISMATCH',observed:evidence({rows,columns},'frozen-panes')};
  }
  const coords=parseWorkbookCell(rule.cell)!,stored=sheet.findCell(coords.row,coords.column);
  if(stored?.isMerged)return {...base,status:'unavailable',reason:'MERGED_CELL_NOT_SCALAR'};
  const value=stored?.value,object=value&&typeof value==='object'?value as unknown as Record<string,unknown>:null;
  const formula=!!object&&('formula'in object||'sharedFormula'in object);
  if(formula&&('sharedFormula'in object!||object!.shareType||object!.ref))return {...base,status:'unavailable',reason:'SHARED_OR_ARRAY_FORMULA'};
  if(rule.kind==='cell-value')return formula?{...base,status:'unavailable',reason:'FORMULA_NOT_RECALCULATED'}:{...base,...compareValue(value,rule.expected)};
  if(!formula)return {...base,status:'fail',reason:'FORMULA_MISSING'};
  if(rule.kind==='cell-formula') {
    if(typeof object!.formula!=='string')return {...base,status:'unavailable',reason:'FORMULA_UNRESOLVED'};
    const expected=rule.expected.startsWith('=')?rule.expected.slice(1):rule.expected;
    const equal=object!.formula===expected;
    return {...base,status:equal?'pass':'fail',reason:equal?'FORMULA_TEXT_EQUAL':'FORMULA_TEXT_MISMATCH',observed:evidence(object!.formula)};
  }
  // ExcelJS 4.4 FormulaValue.value omits falsy fields in _copyModel.
  // The dedicated result getter preserves the stored 0/false cache values.
  const cached = stored?.result;
  if(cached===undefined||cached===null)
    return {...base,status:'unavailable',reason:'FORMULA_CACHE_MISSING',cacheFreshness:'not-established',recalculated:false};
  return {...base,...compareValue(cached,rule.expected),cacheFreshness:'not-established',recalculated:false};
}
export async function evaluateWorkbookAssertions(input:Uint8Array,rawSpec:unknown):Promise<WorkbookAssertionReport> {
  let spec:WorkbookSpec|undefined; const report=unavailableWorkbookReport('WORKBOOK_INPUT_INVALID');
  try {
    spec=parseWorkbookSpec(rawSpec); report.specDigest=workbookDigest(Buffer.from(JSON.stringify(spec)));
    if(!(input instanceof Uint8Array)||!input.length||input.length>WORKBOOK_MAX_BYTES)throw new Error('WORKBOOK_INPUT_LIMIT');
    const bytes=Buffer.from(input); report.inputDigest=workbookDigest(bytes);
    if(report.inputDigest!==spec.workbookDigest)throw new Error('WORKBOOK_DIGEST_MISMATCH');
    const admitted=await admitWorkbookZip(bytes),workbook=new ExcelJS.Workbook();
    // Only admitted STORE entries reach ExcelJS; it cannot perform another attacker-controlled inflate.
    await workbook.xlsx.load(admitted as any);
    report.rules=spec.rules.map(rule=>evaluateRule(workbook,rule));
    report.counts={pass:0,fail:0,unavailable:0}; for(const rule of report.rules)report.counts[rule.status]++;
    report.status=report.counts.unavailable?'unavailable':report.counts.fail?'fail':'pass';
    delete report.errorCode;
    if(Buffer.byteLength(JSON.stringify(report))>REPORT_MAX_BYTES)throw new Error('WORKBOOK_REPORT_LIMIT');
    return report;
  } catch(error) {
    const message=error instanceof Error?error.message:'';
    const code=/^(WORKBOOK|DOCUMENT_PROJECTION)_[A-Z_]+$/.test(message)?message:'WORKBOOK_INPUT_UNAVAILABLE';
    report.status='unavailable';report.errorCode=code;
    report.rules=(spec?.rules??[]).map(rule=>({id:rule.id,kind:rule.kind,status:'unavailable',reason:code}));
    report.counts={pass:0,fail:0,unavailable:report.rules.length}; return report;
  }
}
