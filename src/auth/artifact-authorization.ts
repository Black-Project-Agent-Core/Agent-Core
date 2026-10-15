import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { ArtifactFormat } from '../artifact-analysis/contracts.js';
import { captureArtifact } from '../artifact-analysis/snapshot.js';

type Action = 'prepare' | 'status' | 'inspect';
interface FrozenRequest {
  id: string; revision: string; ownerId: string; taskId: string; workspace: string;
  target: string; format: ArtifactFormat; selected: string[];
  rightsRef: string; audience: string; created: number; expiry: number;
  boundSha?: string; boundScopeDigest?: string; boundSize?: number;
  decisionMessageId?: string;
  state: 'pending' | 'permitting' | 'permitted' | 'denied' | 'revoked';
}
export interface ArtifactIdentity { ownerId: string; taskId: string; workspace: string }
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const REQUEST_TTL_MS = 10 * 60_000;
const LEASE_TTL_MS = 15 * 60_000;
const MAX_REQUESTS = 64;
const reject = () => { throw new Error('ARTIFACT_SCOPE_NOT_AUTHORIZED'); };
export class ArtifactAuthorization {
  private requests = new Map<string, FrozenRequest>();
  private prune(now = Date.now()) {
    for (const [id, row] of this.requests) if (row.expiry <= now) this.requests.delete(id);
  }
  prepare(identity: ArtifactIdentity, input: {
    target: string; format: ArtifactFormat; selected: string[]; rightsRef: string; audience: string;
  }) {
    this.prune();
    if (!identity.ownerId || !identity.taskId || !identity.workspace || this.requests.size >= MAX_REQUESTS) return reject();
    if (!path.isAbsolute(input.target) || input.target.includes('\0') || input.target.startsWith('\\\\')
      || input.selected.length > 64 || !input.rightsRef.trim() || !input.audience.trim()) return reject();
    const target = path.resolve(input.target);
    const selected = [...new Set(input.selected)];
    if (selected.some(v => !v || path.isAbsolute(v) || v.split(/[\\/]/).includes('..') || v.includes('\0'))) return reject();
    const id = randomUUID();
    const revision = 'sha256:' + hash({ ...identity, target, format: input.format, selected, rightsRef: input.rightsRef, audience: input.audience });
    const row: FrozenRequest = { id, revision, ...identity, target, format: input.format,
      selected, rightsRef: input.rightsRef.slice(0, 300), audience: input.audience.slice(0, 120),
      created: Date.now(), expiry: Date.now() + REQUEST_TTL_MS, state: 'pending' };
    this.requests.set(id, row);
    return { requestId: id, revisionDigest: revision, status: 'pending',
      instruction: 'In the Agent Core local user chat, inspect this exact request with /artifact show <requestId> <revisionDigest>; only the authenticated operator may permit it.' };
  }
  private own(identity: ArtifactIdentity, id: string, revision: string) {
    this.prune();
    const item = this.requests.get(id);
    if (!item || item.revision !== revision || item.ownerId !== identity.ownerId
      || item.taskId !== identity.taskId || item.workspace !== identity.workspace) return reject();
    return item;
  }
  status(identity: ArtifactIdentity, id: string, revision: string) {
    const row = this.own(identity, id, revision);
    return { requestId: row.id, revisionDigest: row.revision, status: row.state,
      expiresAt: new Date(row.expiry).toISOString() };
  }
  inspect(identity: ArtifactIdentity, id: string, revision: string) {
    const row = this.own(identity, id, revision);
    if (row.state !== 'permitted' || !row.boundSha || !row.boundScopeDigest) return reject();
    return Object.freeze({ ...row, selected: [...row.selected] });
  }
  /** Pure command classification: only used to bypass model/provider session admission. */
  isOperatorCommand(message: string): boolean {
    return /^\/artifact (show|permit|deny|revoke) [0-9a-f-]{36} sha256:[0-9a-f]{64}$/.test(message.trim());
  }
  /** The caller is the trusted, persisted local chat ingress; MCP args never reach here. */
  async operatorCommand(message: string, host: Readonly<{
    workspace: string; conversationId: string; userMessageId: string;
    persistedUserMessage: true;
  }>): Promise<string | undefined> {
    if (host.persistedUserMessage !== true || !host.workspace.trim()
      || !host.conversationId || !host.userMessageId) return undefined;
    const match = /^\/artifact (show|permit|deny|revoke) ([0-9a-f-]{36}) (sha256:[0-9a-f]{64})$/.exec(message.trim());
    if (!match) return undefined;
    this.prune();
    const row = this.requests.get(match[2]!);
    if (!row || row.revision !== match[3] || row.workspace !== host.workspace)
      return 'Artifact request unavailable for this workspace or revision.';
    switch (match[1]) {
      case 'show': return JSON.stringify({ requestId: row.id, revisionDigest: row.revision, format: row.format,
        target: row.target, selected: row.selected, rightsReference: row.rightsRef, audience: row.audience,
        workspace: row.workspace, action: 'inspect-static', status: row.state, expiresAt: new Date(row.expiry).toISOString() });
      case 'permit': {
        if (row.state !== 'pending' || !row.rightsRef || !row.audience)
          return 'Artifact request cannot be permitted in current state.';
        // Only the real persisted operator decision permits an identity read.
        // Do not confuse this attestation with legal proof, tool grants, or an analysis result.
        row.state = 'permitting';
        try {
          const snapshot = await captureArtifact(row.target, row.format, row.selected);
          if (snapshot.omissions > 0) throw new Error('ARTIFACT_SNAPSHOT_INCOMPLETE');
          if (this.requests.get(row.id) !== row || row.state !== 'permitting'
            || row.expiry <= Date.now()) return 'Artifact request changed or expired.';
          row.boundSha = snapshot.sha256;
          row.boundScopeDigest = snapshot.scopeDigest;
          row.boundSize = snapshot.archive?.byteLength
            ?? snapshot.files.reduce((total, item) => total + item.size, 0);
          row.decisionMessageId = host.userMessageId;
          row.state = 'permitted';
          row.expiry = Date.now() + LEASE_TTL_MS;
          return 'Operator approval bound to the exact observed artifact scope; rights remain operator-attested, not independently adjudicated. Normal grants and current task binding are still required.';
        } catch {
          if (row.state === 'permitting') row.state = 'denied';
          return 'Artifact permission could not verify the selected target identity. No lease was issued.';
        }
      }
      case 'deny':
        if (row.state === 'pending' || row.state === 'permitting') row.state = 'denied';
        return 'Artifact request denied.';
      case 'revoke':
        row.state = 'revoked';
        return 'Artifact request revoked.';
    }
    return undefined;
  }
  shutdown() { this.requests.clear(); }
}