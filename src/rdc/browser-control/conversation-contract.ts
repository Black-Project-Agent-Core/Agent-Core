import * as z from 'zod/v4';

// Wire contract inspected from Browser Bridge 0.2.0, not a second browser owner.
export const CONVERSATION_METHODS = {
  conversation_read: 'AgentCore.conversationRead',
  conversation_draft: 'AgentCore.conversationDraft',
  conversation_status: 'AgentCore.conversationStatus',
} as const;
export type ConversationAction = keyof typeof CONVERSATION_METHODS;
export type BrowserBridgeMode = 'browser' | 'conversation';
export const conversationRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export function conversationUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('BROWSER_CONVERSATION_URL_REFUSED'); }
  if (url.origin !== 'https://chatgpt.com' || url.username || url.password
    || !/^\/(?:g\/[^/]+\/)?c\/[a-zA-Z0-9-]+\/?$/.test(url.pathname))
    throw new Error('BROWSER_CONVERSATION_URL_REFUSED');
  return url.origin + url.pathname.replace(/\/$/, '');
}
export const conversationDraftParams = z.object({
  url: z.string().max(4000), revision: conversationRevision,
  text: z.string().min(1).max(6000).refine(value => Boolean(value.trim())),
}).strict();
export const conversationReadParams = z.object({ sinceRevision: conversationRevision }).strict();
export const conversationEmptyParams = z.object({}).strict();

const id = z.string().min(1).max(256);
const coverage = z.object({
  kind: z.literal('loaded-visible-DOM-window'), completeHistory: z.literal(false),
  truncated: z.boolean(), observedAt: z.string().min(1).max(64),
}).strict();
const message = z.object({
  id, role: z.enum(['user', 'assistant']), text: z.string().max(6000), truncated: z.boolean(),
}).strict();
// Fixed metadata returned by the same scoped reader on an extraction error; no caller JS.
const dc = z.number().int().min(0).max(10_000_000);
const dt = z.string().regex(/^[A-Z][A-Z0-9-]{0,40}$/);
const marker = z.string().max(80).regex(/^(?:\[redacted\]|\[other\]|[A-Za-z][A-Za-z0-9_-]{0,79})$/);
const nr = z.string().regex(/^n[1-9][0-9]{0,2}$/);
const why = { reason: z.enum(['hidden','inert','aria-hidden','navigation','sidebar','dialog','tool-role','tool-output','reasoning','inspection-budget','display-none','visibility-hidden','content-visibility-hidden','empty-opacity','opacity-zero','ancestor-limit','accepted']), ancestor: dt.optional(), depth: dc.optional() };
const diagnosticNode = z.object({
  ref: nr, tag: dt, attributeNames: z.array(z.string().max(80)).max(24),
  attributes: z.record(z.string().max(80), z.union([marker,z.object({ref:z.string().regex(/^id[1-9][0-9]{0,2}$/),shape:z.enum(['uuid','numeric','opaque'])}).strict()])),
  classTokens:z.array(marker).max(8),attributesTruncated:z.boolean(),classesTruncated:z.boolean(),
}).strict();
const conversationDiagnostic = z.object({
  schema:z.literal(1),diagnosticRevision:z.literal('userbody-structure-v1'),targetMatches:z.literal(true),mainFrame:z.boolean(),
  readyState:z.enum(['loading','interactive','complete']),visibility:z.enum(['visible','hidden','prerender','unloaded']),
  counts:z.object({role:dc,candidate:dc,markdown:dc,userBody:dc,turnRole:dc,iframes:dc}).strict(),
  userBodyStructure:z.object({selector:z.literal('.whitespace-pre-wrap'),matched:dc,sampled:dc.max(16),complete:z.boolean(),roleInferred:z.literal(false),idsRedacted:z.literal(true),
    nodes:z.array(diagnosticNode).max(96),paths:z.array(z.object({index:dc.max(15),nodes:z.array(nr).max(12),stop:z.enum(['root','inspection-budget','ancestor-limit']),box:z.boolean(),inForm:z.boolean(),editableAttributeAncestor:z.boolean(),...why}).strict()).max(16),
    limits:z.object({matches:z.literal(16),ancestors:z.literal(12),nodes:z.literal(96),structureChars:z.literal(16000)}).strict(),referenceScope:z.literal('this-report-only-not-message-identity'),
  }).strict(),
  samples:z.array(z.object({tag:dt,role:z.enum(['user','assistant','other']),box:z.boolean(),hasMessageId:z.boolean(),hasTurnId:z.boolean(),...why}).strict()).max(8),
  shadowSample:z.object({visited:dc.max(2000),openShadowRoots:dc.max(2000),tags:z.array(dt).max(8),complete:z.literal(false)}).strict(),
  elapsedMs:dc,budgetReached:z.boolean(),contentIncluded:z.literal(false),
}).strict().refine(value=>JSON.stringify(value).length<=24576);
const base = {
  diagnostics: conversationDiagnostic.optional(),
  url: z.string().max(4000), revision: conversationRevision,
  busy: z.boolean(), paused: z.boolean(), error: z.string().max(500).nullable(), coverage,
};
export const conversationReadResult = z.object({
  ...base, changed: z.boolean(), reset: z.boolean(),
  messages: z.array(message).max(80),
  windowExits: z.array(id).max(80),
}).strict().refine(value => value.messages.reduce((sum, item) => sum + item.text.length, 0) <= 48000
  && new Set(value.messages.map(item => item.id)).size === value.messages.length
  && new Set(value.windowExits).size === value.windowExits.length
  && !value.messages.some(item => value.windowExits.includes(item.id)));
const draft = z.object({
  id, url: z.string().max(4000), revision: conversationRevision,
  text: z.string().min(1).max(6000),
  state: z.enum(['review', 'sending', 'submitted', 'confirmed', 'unknown']),
  createdAt: z.number().finite().nonnegative(),
}).strict();
const receipt = z.discriminatedUnion('state', [
  z.object({ draftId: id, state: z.literal('confirmed'), url: z.string().max(4000),
    messageId: id, at: z.string().min(1).max(64) }).strict(),
  z.object({ draftId: id, state: z.literal('unknown'), error: z.string().max(300) }).strict(),
]);
export const conversationStatusResult = z.object({
  ...base, draft: draft.nullable(), receipt: receipt.nullable(),
}).strict();
export const conversationDraftResult = z.object({
  id, state: z.literal('review'), url: z.string().max(4000),
}).strict();
export type ConversationRead = z.infer<typeof conversationReadResult>;
export type ConversationStatus = z.infer<typeof conversationStatusResult>;
