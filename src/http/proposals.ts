import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProposalDocumentReader } from '../learning/proposal-documents.js';
import { sendNoStoreJson as send } from './json-response.js';

/** Called only after the existing loopback/UI-token authorization. Markdown remains JSON text. */
export async function handleProposalDocuments(request: IncomingMessage, response: ServerResponse,
  documents: ProposalDocumentReader | undefined, url: URL): Promise<void> {
  if (request.method !== 'GET') { send(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' }); return; }
  if (!documents) { send(response, 503, { error: 'PROPOSAL_DOCUMENTS_UNAVAILABLE' }); return; }
  const allowed = url.pathname === '/agent/proposals' ? [] : ['id', 'revisionDigest', 'documentDigest'];
  if ([...url.searchParams.keys()].some(key => !allowed.includes(key) || url.searchParams.getAll(key).length !== 1)) {
    send(response, 400, { error: 'PROPOSAL_DOCUMENT_INPUT_INVALID' }); return;
  }
  try {
    if (url.pathname === '/agent/proposals') { send(response, 200, await documents.listForReview()); return; }
    const id = url.searchParams.get('id') ?? '', revisionDigest = url.searchParams.get('revisionDigest') ?? '', documentDigest = url.searchParams.get('documentDigest') ?? '';
    if (!/^(?:doc|skill-proposal):[a-f0-9]{32}$/.test(id) || !/^sha256:[a-f0-9]{64}$/.test(revisionDigest)
      || !/^sha256:[a-f0-9]{64}$/.test(documentDigest)) { send(response, 400, { error: 'PROPOSAL_DOCUMENT_INPUT_INVALID' }); return; }
    send(response, 200, await documents.read({ id, revisionDigest, documentDigest }));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = /^PROPOSAL_DOCUMENT_[A-Z_]+$/.test(message) ? message : 'PROPOSAL_DOCUMENT_UNAVAILABLE';
    send(response, code === 'PROPOSAL_DOCUMENT_NOT_FOUND' ? 404 : /CHANGED|DRIFT/.test(code) ? 409
      : code === 'PROPOSAL_DOCUMENT_INPUT_INVALID' ? 400 : 503, { error: code });
  }
}
