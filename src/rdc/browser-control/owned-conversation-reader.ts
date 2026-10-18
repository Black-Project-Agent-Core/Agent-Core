import { randomUUID } from 'node:crypto';

export type OwnedConversationRead = { kind: 'index'; cursor?: string }
  | { kind: 'message'; messageRef: string; offset?: number };

type Scope = { url: string; document: string; order: string };
type MessageRef = Scope & { key: string; role: string; version: string; length: number };
type Cursor = Scope & { offset: number };
type DocumentRequest = { kind: 'index'; offset: number; expected?: Scope }
  | { kind: 'message'; offset: number; expected: MessageRef };

const PAGE_SIZE = 20, CHUNK_SIZE = 12_000, MAX_MESSAGE = 2 * 1024 * 1024;
const MAX_REFS = 4096, MAX_CURSORS = 64;

/**
 * Read-only semantic projection of the caller's already owned OBU document.
 * Only bounded metadata is retained here, never conversation bodies. The page
 * captures and hashes a whole bounded message before returning a small chunk;
 * a relay frame therefore never contains a multi-megabyte transcript.
 */
export class OwnedConversationReader {
  private readonly refs = new Map<string, MessageRef>();
  private readonly cursors = new Map<string, Cursor>();
  constructor(private readonly evaluate: (expression: string, awaitPromise?: boolean) => Promise<any>) {}

  async read(input: OwnedConversationRead = { kind: 'index' }): Promise<Record<string, any>> {
    if (!input || (input.kind !== 'index' && input.kind !== 'message'))
      throw new Error('BROWSER_CONVERSATION_INVALID_READ');
    if (input.kind === 'message') {
      const ref = typeof input.messageRef === 'string' ? this.refs.get(input.messageRef) : undefined;
      if (!ref) throw new Error('BROWSER_CONVERSATION_REF_STALE_OR_INVALID');
      const offset = input.offset ?? 0;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > ref.length)
        throw new Error('BROWSER_CONVERSATION_INVALID_OFFSET');
      const value = await this.run({ kind: 'message', offset, expected: ref });
      if (!this.sameScope(value, ref) || value.key !== ref.key || value.role !== ref.role
        || value.version !== ref.version || value.length !== ref.length)
        throw new Error('BROWSER_CONVERSATION_MESSAGE_CHANGED_OR_STALE');
      if (value.kind !== 'message' || typeof value.text !== 'string' || value.text.length > CHUNK_SIZE
        || value.offset !== offset || !Number.isSafeInteger(value.nextOffset)
        || value.nextOffset !== offset + value.text.length || value.nextOffset > ref.length
        || typeof value.eof !== 'boolean' || value.eof !== (value.nextOffset === ref.length)
        || (!value.eof && value.nextOffset <= offset))
        throw new Error('BROWSER_CONVERSATION_INVALID_BOUNDED_RESULT');
      this.touch(this.refs, input.messageRef, ref);
      return { kind: 'message', status: 'ready', url: ref.url, messageRef: input.messageRef,
        role: ref.role, authorKnown: ref.role !== 'unknown', version: ref.version, length: ref.length,
        format: 'rendered-text', formatVersion: 1, originalMarkdown: false,
        offsetUnit: 'utf-16', offset, nextOffset: value.nextOffset, eof: value.eof, text: value.text };
    }

    const cursor = input.cursor === undefined ? undefined : this.cursors.get(input.cursor);
    if (input.cursor !== undefined && !cursor) throw new Error('BROWSER_CONVERSATION_CURSOR_STALE_OR_INVALID');
    const offset = cursor?.offset ?? 0;
    const value = await this.run({ kind: 'index', offset, ...(cursor ? { expected: cursor } : {}) });
    if (cursor && (!this.sameScope(value, cursor) || value.order !== cursor.order))
      throw new Error('BROWSER_CONVERSATION_INDEX_CHANGED_OR_STALE');
    if (value.kind !== 'index' || !Array.isArray(value.messages) || value.messages.length > PAGE_SIZE
      || typeof value.url !== 'string' || value.url.length > 4000 || !value.coverage
      || value.coverage.completeHistory !== false)
      throw new Error('BROWSER_CONVERSATION_INVALID_BOUNDED_RESULT');
    if (value.status === 'no-conversation') {
      if (value.messages.length || value.nextOffset != null) throw new Error('BROWSER_CONVERSATION_INVALID_BOUNDED_RESULT');
      return { kind: 'index', status: value.status, url: value.url, messages: [], nextCursor: null, coverage: value.coverage };
    }
    if (typeof value.document !== 'string' || value.document.length > 128 || typeof value.order !== 'string'
      || value.order.length > 128 || value.offset !== offset || (value.nextOffset !== null
        && (!Number.isSafeInteger(value.nextOffset) || value.nextOffset !== offset + PAGE_SIZE || value.nextOffset > MAX_REFS)))
      throw new Error('BROWSER_CONVERSATION_INVALID_BOUNDED_RESULT');
    const scope: Scope = { url: value.url, document: value.document, order: value.order };
    const messages = value.messages.map((message: any) => {
      if (!message || !['user', 'assistant', 'unknown'].includes(message.role) || typeof message.key !== 'string'
        || message.key.length > 300 || typeof message.readable !== 'boolean'
        || (message.role === 'unknown' && (message.authority !== 'unassigned-app-turn' || message.identity !== 'document-local')))
        throw new Error('BROWSER_CONVERSATION_INVALID_BOUNDED_RESULT');
      if (!message.readable) return { role: message.role, authorKnown: message.role !== 'unknown', messageRef: null, readable: false,
        truncated: true, reason: String(message.reason ?? 'BODY_UNREADABLE').slice(0, 80) };
      if (typeof message.version !== 'string' || message.version.length > 128
        || !Number.isSafeInteger(message.length) || message.length < 1 || message.length > MAX_MESSAGE)
        throw new Error('BROWSER_CONVERSATION_INVALID_BOUNDED_RESULT');
      const entry: MessageRef = { ...scope, key: message.key, role: message.role, version: message.version, length: message.length };
      let messageRef: string | undefined;
      for (const [key, old] of this.refs) {
        if (this.sameScope(old, entry) && old.key === entry.key && old.role === entry.role && old.version === entry.version) {
          messageRef = key; break;
        }
      }
      messageRef ??= 'msg:' + randomUUID();
      this.touch(this.refs, messageRef, entry, MAX_REFS);
      return { messageRef, role: entry.role, authorKnown: entry.role !== 'unknown', version: entry.version, length: entry.length,
        identity: message.identity === 'message-id' ? 'message-id' : 'document-local',
        readable: true, truncated: false, format: 'rendered-text', formatVersion: 1, offsetUnit: 'utf-16',
        unsupportedContent: message.unsupportedContent ?? 0 };
    });
    let nextCursor: string | null = null;
    if (value.nextOffset !== null) {
      nextCursor = 'idx:' + randomUUID();
      this.touch(this.cursors, nextCursor, { ...scope, offset: value.nextOffset }, MAX_CURSORS);
    }
    return { kind: 'index', status: value.status, url: scope.url, revision: scope.order, messages,
      nextCursor, busy: value.busy === true, coverage: value.coverage,
      format: 'rendered-text', formatVersion: 1, originalMarkdown: false,
      limits: { indexPage: PAGE_SIZE, chunkUtf16: CHUNK_SIZE, messageUtf16: MAX_MESSAGE,
        retainedTextUtf16: 0, messageRefs: MAX_REFS, cursors: MAX_CURSORS } };
  }

  private async run(request: DocumentRequest): Promise<any> {
    const value = await this.evaluate(`(${readOwnedDocument.toString()})(${JSON.stringify(request)})`, true);
    if (!value || typeof value !== 'object') throw new Error('BROWSER_CONVERSATION_INVALID_BOUNDED_RESULT');
    if (typeof value.error === 'string') {
      const errors = new Set(['STALE_DOCUMENT', 'STALE_MESSAGE', 'STALE_INDEX', 'INVALID_OFFSET',
        'UNSUPPORTED_URL', 'WRONG_FRAME', 'HASH_UNAVAILABLE', 'MESSAGE_UNREADABLE']);
      throw new Error('BROWSER_CONVERSATION_' + (errors.has(value.error) ? value.error : 'READ_FAILED'));
    }
    return value;
  }

  private sameScope(value: any, expected: Scope): boolean {
    return value?.url === expected.url && value?.document === expected.document;
  }

  private touch<T>(map: Map<string, T>, key: string, value: T, max?: number): void {
    map.delete(key); map.set(key, value);
    if (max && map.size > max) map.delete(map.keys().next().value!);
  }
}

// This function is serialized as fixed internal JavaScript. Keep every page-side
// dependency inside it. Public callers supply only opaque refs and numeric offsets.
async function readOwnedDocument(request: DocumentRequest): Promise<any> {
  const PAGE = 20, CHUNK = 12_000, MESSAGE = 2 * 1024 * 1024;
  const SCAN_NODES = 100_000, CANDIDATES = 4096, BODY_NODES = 20_000, DEPTH = 80;
  const canonical = () => {
    if (location.origin !== 'https://chatgpt.com') return null;
    const path = location.pathname.replace(/\/$/, '') || '/';
    return /^\/(?:g\/[^/]+\/)?c\/[A-Za-z0-9-]+$/.test(path) ? location.origin + path : null;
  };
  const url = canonical();
  const emptyCoverage = { kind: 'loaded-dom-window', completeHistory: false,
    historyAvailability: 'unloaded-or-virtualized-history-unknown', loadedMessages: 0,
    truncated: false, observedAt: new Date().toISOString() };
  if (window !== window.top) return { error: 'WRONG_FRAME' };
  if (!url) {
    if (request.expected) return { error: 'STALE_DOCUMENT' };
    if (location.origin === 'https://chatgpt.com' && /^\/(?:g\/[^/]+\/?)?$/.test(location.pathname))
      return { kind: 'index', status: 'no-conversation', url: location.origin + location.pathname,
        messages: [], nextOffset: null, coverage: emptyCoverage };
    return { error: 'UNSUPPORTED_URL' };
  }
  if (!crypto.subtle) return { error: 'HASH_UNAVAILABLE' };
  const cacheName = '__agent_core_owned_conversation_reader_v1__';
  const host = globalThis as any;
  let state = host[cacheName];
  if (!state || state.owner !== document || state.root !== document.documentElement || !state.navigationEpoch) {
    if (state?.navigationTarget && state?.navigationListener)
      state.navigationTarget.removeEventListener('currententrychange', state.navigationListener);
    state = { owner: document, root: document.documentElement, document: crypto.randomUUID(), nodes: new WeakMap(), next: 0,
      url, navigationEpoch: 'current-url-only' };
    Object.defineProperty(host, cacheName, { value: state, configurable: true, writable: false, enumerable: false });
    // Track only URL identity, never transcript changes. One metadata-only
    // listener catches SPA away/back transitions without patching History APIs.
    const navigationTarget = host.navigation;
    if (navigationTarget?.addEventListener) {
      const bindEpoch = (target: any, metadata: any) => {
        const listener = () => {
          const current = location.origin + (location.pathname.replace(/\/$/, '') || '/');
          if (current !== metadata.url) {
            metadata.url = current; metadata.document = crypto.randomUUID();
            metadata.nodes = new WeakMap(); metadata.next = 0;
          }
        };
        target.addEventListener('currententrychange', listener);
        metadata.navigationTarget = target; metadata.navigationListener = listener;
        metadata.navigationEpoch = 'navigation-api';
      };
      bindEpoch(navigationTarget, state);
    }
  }
  if (state.url !== url) {
    state.url = url; state.document = crypto.randomUUID(); state.nodes = new WeakMap(); state.next = 0;
  }
  const documentId: string = state.document;
  if (request.expected && (request.expected.url !== url || request.expected.document !== documentId))
    return { error: 'STALE_DOCUMENT' };
  const localId = (element: Element): number => {
    let id = state.nodes.get(element);
    if (id === undefined) { id = ++state.next; state.nodes.set(element, id); }
    return id;
  };
  // Hash UTF-16 code units, including any unpaired surrogate. UTF-8 replacement
  // would otherwise merge distinct malformed strings into one content version.
  const hash = async (text: string): Promise<string> => {
    const bytes = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) { const n = text.charCodeAt(i); bytes[i * 2] = n & 255; bytes[i * 2 + 1] = n >>> 8; }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  };
  const excluded = '[hidden],[inert],[aria-hidden="true"],nav,aside,[role="dialog"],form,'
    + '[contenteditable]:not([contenteditable="false"]),#prompt-textarea,[role="textbox"],'
    + '[data-message-author-role="tool"],[data-testid="tool-output"],[data-testid="tool-result"],'
    + '[data-testid="tool-call"],[data-testid="tool-response"],[data-testid="reasoning-block"]';
  const roleSelector = '[data-message-author-role="user"],[data-message-author-role="assistant"],[data-turn="user"],[data-turn="assistant"]';
  const bubble = '[data-user-message-bubble]', markdown = '[data-markdown-text-style]';
  const selection = '[data-chatgpt-selection-message-id]';
  const candidateSelector = roleSelector + ',' + bubble + ',' + markdown
    + ',[data-testid^="conversation-turn-"],[data-turn-id],[data-testid="user-message"],[data-testid="assistant-message"],.markdown';
  const conversationId = url.split('/').pop();
  const blocked = (element: Element): boolean => {
    if (element.matches(excluded)) return true;
    const style = getComputedStyle(element);
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
      || style.contentVisibility === 'hidden' || Number(style.opacity) === 0;
  };
  const ancestor = (element: Element | null, selector: string): Element | null => {
    for (let depth = 0; element && depth < DEPTH; depth++, element = element.parentElement)
      if (element.matches(selector)) return element;
    return null;
  };
  // Iterative traversal bounds work before materializing large DOM NodeLists.
  const walkElements = (root: Element, limit: number, visit: (element: Element) => void) => {
    let node: Element | null = root, depth = 0, count = 0, limited = false;
    while (node && count < limit) {
      count++;
      const skip = depth >= DEPTH || blocked(node);
      if (depth >= DEPTH) limited = true;
      if (!skip) visit(node);
      if (!skip && node.firstElementChild) { node = node.firstElementChild; depth++; continue; }
      while (node && node !== root && !node.nextElementSibling) { node = node.parentElement; depth--; }
      if (!node || node === root) { node = null; break; }
      node = node.nextElementSibling;
    }
    return { nodes: count, limited: limited || node !== null };
  };
  const inspect = () => {
    const candidates: Element[] = [], allBubbles: Element[] = [];
    let candidateLimited = false, busy = false;
    const traversal = walkElements(document.documentElement, SCAN_NODES, element => {
      if (element.matches('[data-testid="stop-button"]')) busy = true;
      if (element.matches(bubble)) { if (allBubbles.length < CANDIDATES) allBubbles.push(element); else candidateLimited = true; }
      if (element.matches(candidateSelector)) {
        if (candidates.length < CANDIDATES) candidates.push(element); else candidateLimited = true;
      }
    });
    const bubbleCounts = new Map<Element, number>();
    for (const element of allBubbles) for (let n: Element | null = element, d = 0; n && d < DEPTH; n = n.parentElement, d++)
      bubbleCounts.set(n, (bubbleCounts.get(n) ?? 0) + 1);
    type Entry = { node: Element; key: string; role: string; local: number; identity: string;
      parts?: Element[]; membership?: string; authority?: string };
    const seen = new Set<Element>(), entries: Entry[] = [], unclaimed: Element[] = [];
    const gaps = { unreadableRole: 0, ambiguousRole: 0, missingStableIds: 0, duplicateIds: 0,
      unreadableBody: 0, captureOmitted: 0, unassignedGroups: 0, unassignedParts: 0 };
    const wrappers: Element[] = [];
    const identityAttrs = ['data-message-id', 'data-turn-id', 'data-chatgpt-selection-message-id', 'data-dil-source-message-id', 'data-dil-message-id'];
    const sourceId = (element: Element): string | null => {
      for (let node: Element | null = element, depth = 0; node && depth < 16; node = node.parentElement, depth++) {
        if (depth && (bubbleCounts.get(node) ?? 0) > 1) return null;
        for (const attr of identityAttrs) {
          const id = node.getAttribute(attr);
          if (id) return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(id) ? id : null;
        }
        const raw = node.getAttribute('data-chatgpt-search-message-ids');
        if (raw) {
          if (raw.length > 1024) return null;
          let values: any;
          try { values = JSON.parse(raw); } catch { values = raw.trim().split(/[\s,]+/); }
          if (typeof values === 'string') values = [values];
          return Array.isArray(values) && values.length === 1 && typeof values[0] === 'string'
            && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(values[0]) ? values[0] : null;
        }
        if (node.tagName === 'MAIN' || node.tagName === 'BODY') break;
      }
      return null;
    };
    for (let node of candidates) {
      if (ancestor(node.parentElement, roleSelector)) continue;
      const isBubble = node.matches(bubble), isMarkdown = node.matches(markdown);
      if (isMarkdown && (ancestor(node.parentElement, bubble) || ancestor(node.parentElement, markdown))) continue;
      let role = node.getAttribute('data-message-author-role') || node.getAttribute('data-turn');
      if (!['user', 'assistant'].includes(role ?? '')) role = null;
      if (!role && isBubble) role = 'user';
      if (!role && isMarkdown) {
        const owner = ancestor(node, selection), conversation = owner && ancestor(owner, '[data-chatgpt-selection-conversation-id]');
        if (!owner || !conversation || conversation.getAttribute('data-chatgpt-selection-conversation-id') !== conversationId
          || (bubbleCounts.get(owner) ?? 0) > 0) {
          gaps.ambiguousRole++;
          if (!owner) unclaimed.push(node);
          continue;
        }
        role = 'assistant'; node = owner;
      }
      if (!role && node.matches('[data-testid="user-message"]')) role = 'user';
      if (!role && node.matches('[data-testid="assistant-message"]')) role = 'assistant';
      if (!role) { wrappers.push(node); continue; }
      if (seen.has(node)) continue;
      seen.add(node);
      const scope = ancestor(node, '[data-chatgpt-selection-conversation-id]');
      if (scope && scope.getAttribute('data-chatgpt-selection-conversation-id') !== conversationId) { gaps.ambiguousRole++; continue; }
      const id = sourceId(node), local = localId(node);
      if (!id) gaps.missingStableIds++;
      entries.push({ node, key: id ? 'id:' + id : 'node:' + local, role: role!, local, identity: id ? 'message-id' : 'document-local' });
    }
    // Formatting alone has no author authority. A wrapper with a recognized inner
    // owner is structural; an otherwise unmatched wrapper is an explicit gap.
    const owners = new Set(entries.map(entry => entry.node));
    const insideOwner = (element: Element) => {
      for (let n: Element | null = element, d = 0; n && d < DEPTH; n = n.parentElement, d++) if (owners.has(n)) return true;
      return false;
    };
    const groups = new Map<Element, Element[]>();
    for (const part of unclaimed) {
      if (insideOwner(part) || ancestor(part, bubble)) continue;
      const wrapper = ancestor(part, '[data-content-search-turn-key]');
      const turnKey = wrapper?.getAttribute('data-content-search-turn-key');
      const conversation = wrapper && ancestor(wrapper, '[data-chatgpt-selection-conversation-id]');
      if (!wrapper || !turnKey || turnKey.length > 256 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(turnKey)
        || (conversation && conversation.getAttribute('data-chatgpt-selection-conversation-id') !== conversationId)) continue;
      const parts = groups.get(wrapper) ?? []; parts.push(part); groups.set(wrapper, parts);
    }
    for (const [wrapper, parts] of groups) {
      if (!parts.length) continue;
      gaps.unassignedGroups++; gaps.unassignedParts += parts.length;
      entries.push({ node: parts[0], key: 'unassigned:' + localId(wrapper), role: 'unknown',
        local: localId(parts[0]), identity: 'document-local', authority: 'unassigned-app-turn', parts,
        membership: parts.map(part => localId(part)).join(',') });
    }
    const knownAncestors = new Set<Element>();
    for (const entry of entries) for (let n: Element | null = entry.node, d = 0; n && d < DEPTH; n = n.parentElement, d++) knownAncestors.add(n);
    for (const wrapper of wrappers) {
      if (!knownAncestors.has(wrapper) && !insideOwner(wrapper)) gaps.unreadableRole++;
    }
    const counts = new Map<string, number>();
    for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
    for (const entry of entries) if ((counts.get(entry.key) ?? 0) > 1) {
      gaps.duplicateIds++; entry.key = 'node:' + entry.local; entry.identity = 'document-local';
    }
    // Grouped modern bodies may be encountered after their surrounding wrapper.
    entries.sort((a, b) => a.node === b.node ? 0 : a.node.compareDocumentPosition(b.node) & 4 ? -1 : 1);
    const orderSource = JSON.stringify(entries.map(e => [e.key, e.role, e.local, e.membership ?? '']));
    return { entries, gaps, busy, nodes: traversal.nodes, scanLimited: traversal.limited,
      candidateLimited, candidates: candidates.length, orderSource };
  };

  const capture = (entry: { node: Element; role: string; parts?: Element[] }, compare?: string) => {
    // A modern selection owner can contain several sibling styled body parts,
    // with .markdown present in just one. Select the complete group first.
    const assistantBodies = entry.node.matches(selection)
      ? [markdown, '.markdown', '[data-testid="assistant-message"]', '[data-message-text-content]']
      : ['.markdown', markdown, '[data-testid="assistant-message"]', '[data-message-text-content]'];
    const selectors = entry.role === 'assistant'
      ? assistantBodies
      : ['.whitespace-pre-wrap', markdown, '[data-testid="user-message"]', '[data-message-text-content]', bubble];
    let parts: Element[] = entry.parts ?? [];
    if (!entry.parts) {
      const matches: Element[][] = selectors.map(() => []);
      const scan = walkElements(entry.node, BODY_NODES, element => {
        for (let i = 0; i < selectors.length; i++) if (element.matches(selectors[i])) matches[i].push(element);
      });
      if (scan.limited) return { error: 'BODY_NODE_BUDGET' };
      for (const found of matches) {
        if (!found.length) continue;
        const selected = new Set(found);
        parts = found.filter(element => {
          for (let n = element.parentElement, depth = 0; n && depth < DEPTH; n = n.parentElement, depth++) {
            if (selected.has(n)) return false;
            if (n === entry.node) break;
          }
          return true;
        });
        break;
      }
    }
    if (!parts.length) return { error: 'BODY_UNRECOGNIZED' };
    if (parts.some(element => {
      const scope = ancestor(element, '[data-chatgpt-selection-conversation-id]');
      return scope && scope.getAttribute('data-chatgpt-selection-conversation-id') !== conversationId;
    })) return { error: 'BODY_CONVERSATION_MISMATCH' };
    const pieces: Array<{ text: string; structural: boolean }> = [];
    let length = 0, visited = 0, unsupportedContent = 0, error: string | undefined;
    const append = (text: string, structural = false) => {
      if (!text || error) return;
      if (structural && pieces.at(-1)?.structural) return;
      if (length + text.length > MESSAGE) { error = 'MESSAGE_CAPTURE_BUDGET'; return; }
      pieces.push({ text, structural }); length += text.length;
    };
    const textWalk = (node: Node, depth: number, preserve: boolean) => {
      if (error) return;
      if (++visited > BODY_NODES || depth > DEPTH) { error = 'BODY_NODE_BUDGET'; return; }
      if (node.nodeType === 3) {
        const value = node.nodeValue ?? '';
        // Refuse before whitespace normalization allocates a potentially huge
        // copy of a single source text node. It is an explicit capture gap.
        if (value.length > MESSAGE) { error = 'MESSAGE_CAPTURE_BUDGET'; return; }
        append(preserve ? value : value.replace(/[\t\n\r\f ]+/g, ' ')); return;
      }
      if (node.nodeType !== 1) return;
      const element = node as Element;
      if (blocked(element) || element.matches('button,input,textarea,select,script,style,[role="button"]')) return;
      if (element.matches('img,canvas,video,audio,iframe,object,embed,svg,math,[data-testid="attachment"],[data-testid="file-upload"]')) {
        unsupportedContent++; return;
      }
      if (element.tagName === 'BR') { append('\n'); return; }
      const block = /^(?:P|DIV|PRE|LI|UL|OL|H[1-6]|BLOCKQUOTE|TR|TABLE|SECTION|ARTICLE)$/.test(element.tagName);
      if (block) append('\n\n', true);
      const style = getComputedStyle(element);
      const raw = preserve || element.tagName === 'PRE' || element.tagName === 'CODE'
        || /^(?:pre|pre-wrap|break-spaces)$/.test(style.whiteSpace)
        || element.matches('[data-code-block-source]');
      for (let child = node.firstChild; child && !error; child = child.nextSibling) textWalk(child, depth + 1, raw);
      if (block) append('\n\n', true);
    };
    for (const part of parts) { append('\n\n', true); textWalk(part, 0, entry.role === 'user' && part.matches('.whitespace-pre-wrap,' + bubble)); }
    if (error) return { error };
    while (pieces[0]?.structural) pieces.shift();
    while (pieces.at(-1)?.structural) pieces.pop();
    if (compare !== undefined) {
      // Compare the canonical pieces directly instead of retaining a second
      // full joined body. At most one body plus one <=2Mi piece set is live.
      let offset = 0;
      for (const piece of pieces) {
        if (!compare.startsWith(piece.text, offset)) return { matches: false };
        offset += piece.text.length;
      }
      return { matches: offset === compare.length, unsupportedContent };
    }
    const text = pieces.map(piece => piece.text).join('');
    if (!text.trim()) return { error: unsupportedContent ? 'UNSUPPORTED_CONTENT_ONLY' : 'BODY_EMPTY', unsupportedContent };
    return { text, unsupportedContent };
  };

  const versionOf = async (entry: { membership?: string }, text: string) => {
    const content = await hash(text);
    // Unknown-role groups bind their exact loaded part membership as well as
    // full text, so moved/removed siblings cannot silently reuse a reference.
    return 'v1:sha256:' + (entry.membership === undefined ? content : await hash(content + ':' + entry.membership));
  };
  const snapshot = inspect();
  const order = await hash(snapshot.orderSource);
  const scope = { url, document: documentId, order };
  const scopeCurrent = () => canonical() === url && host[cacheName] === state && state.document === documentId
    && state.owner === document && state.root === document.documentElement;
  if (!scopeCurrent()) return { error: 'STALE_DOCUMENT' };
  if (request.kind === 'message') {
    const entry = snapshot.entries.find(entry => entry.key === request.expected.key && entry.role === request.expected.role);
    if (!entry) return { error: 'STALE_MESSAGE' };
    const body = capture(entry);
    if (body.error || body.text === undefined) return { error: 'MESSAGE_UNREADABLE' };
    const version = await versionOf(entry, body.text);
    if (!scopeCurrent()) return { error: 'STALE_DOCUMENT' };
    if (version !== request.expected.version || body.text.length !== request.expected.length) return { error: 'STALE_MESSAGE' };
    // Hashing yields to the page. Recheck its exact text and scope before sending
    // a chunk so a stream/branch edit during the hash cannot escape freshness.
    const current = capture(entry, body.text);
    const currentEntry = inspect().entries.find(candidate => candidate.key === entry.key && candidate.role === entry.role);
    if (!entry.node.isConnected || current.matches !== true || current.error || currentEntry?.node !== entry.node
      || currentEntry?.membership !== entry.membership)
      return { error: 'STALE_MESSAGE' };
    const offset = request.offset;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > body.text.length
      || (offset > 0 && /[\uDC00-\uDFFF]/.test(body.text.charAt(offset)) && /[\uD800-\uDBFF]/.test(body.text.charAt(offset - 1))))
      return { error: 'INVALID_OFFSET' };
    let end = Math.min(offset + CHUNK, body.text.length);
    if (end < body.text.length && /[\uD800-\uDBFF]/.test(body.text.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(body.text.charAt(end))) end--;
    return { kind: 'message', ...scope, key: entry.key, role: entry.role, version, length: body.text.length,
      offset, nextOffset: end, eof: end === body.text.length, text: body.text.slice(offset, end) };
  }
  if (request.expected && order !== request.expected.order) return { error: 'STALE_INDEX' };
  const messages: any[] = [];
  for (const entry of snapshot.entries.slice(request.offset, request.offset + PAGE)) {
    const body = capture(entry);
    if (body.error || body.text === undefined) {
      snapshot.gaps.unreadableBody++;
      if (body.error?.includes('BUDGET')) snapshot.gaps.captureOmitted++;
      messages.push({ key: entry.key, role: entry.role, identity: entry.identity, authority: entry.authority,
        readable: false, reason: body.error ?? 'BODY_UNREADABLE' });
      continue;
    }
    const version = await versionOf(entry, body.text);
    const current = capture(entry, body.text);
    if (!entry.node.isConnected || current.error || current.matches !== true) {
      snapshot.gaps.unreadableBody++;
      messages.push({ key: entry.key, role: entry.role, identity: entry.identity, authority: entry.authority,
        readable: false, reason: 'MESSAGE_CHANGED_DURING_READ' });
      continue;
    }
    messages.push({ key: entry.key, role: entry.role, version, length: body.text.length, readable: true,
      identity: entry.identity, authority: entry.authority, unsupportedContent: body.unsupportedContent ?? 0 });
  }
  if (!scopeCurrent()) return { error: 'STALE_DOCUMENT' };
  if (inspect().orderSource !== snapshot.orderSource) return { error: 'STALE_INDEX' };
  const gap = snapshot.gaps;
  const truncated = snapshot.scanLimited || snapshot.candidateLimited || gap.unreadableRole > 0 || gap.ambiguousRole > 0
    || gap.unreadableBody > 0 || messages.some(message => message.unsupportedContent > 0);
  return { kind: 'index', ...scope,
    status: !snapshot.entries.length ? document.readyState !== 'complete' ? 'loading' : 'unsupported-layout' : truncated ? 'partial' : 'ready',
    offset: request.offset, messages, nextOffset: request.offset + PAGE < snapshot.entries.length ? request.offset + PAGE : null,
    busy: snapshot.busy,
    coverage: { ...emptyCoverage, loadedMessages: snapshot.entries.length, truncated,
      scannedNodes: snapshot.nodes, scanLimited: snapshot.scanLimited, scanNodeLimit: SCAN_NODES,
      candidates: snapshot.candidates, candidateLimit: CANDIDATES, candidateLimited: snapshot.candidateLimited,
      gaps: gap, captureScope: 'current-index-page', branchScope: 'loaded-message-identities-and-order',
      navigationEpoch: state.navigationEpoch,
      unsupportedContent: messages.reduce((sum, message) => sum + (message.unsupportedContent ?? 0), 0),
      bodyNodeLimit: BODY_NODES, messageCaptureUtf16: MESSAGE,
      note: 'Only loaded recognized DOM bodies; unloaded history, attachments, original Markdown and file contents are not supplied.' } };
}
