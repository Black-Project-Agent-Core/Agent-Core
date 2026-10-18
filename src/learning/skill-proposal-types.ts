export interface SkillProposalInput {
  workspace: string; name: string; taskId: string; sessionId?: string;
  purpose: string; triggers: string[]; nonTriggers: string[]; steps: string[];
  allowedTools: string[]; expectedBenefit: string; limitations: string[];
  implementation: string; acceptance: string[]; evidenceRefs: string[];
  procedureFingerprint?: string; expectedProposalDigest?: string; targetSkillName?: string;
}
export interface SkillWorkspaceIdentity { name: string; key: string; }
export type ProposalStatus = 'proposed' | 'notified' | 'approved' | 'implemented' | 'changes-requested' | 'deferred' | 'rejected';
export interface SkillProposalNoticeReceipt {
  sessionId: string; taskId?: string; revisionDigest: string;
  status: 'included-in-response'; at: string; delivery: 'unconfirmed';
}
export interface SkillProposalDecision {
  revisionDigest: string; decision: 'approve' | 'revise' | 'reject' | 'defer';
  scope: 'build' | 'build-and-activate'; userEvidenceRef: string;
  sessionId: string; taskId: string; at: string;
}
export interface SkillProposalFulfillment {
  revisionDigest: string;
  kind: 'active-artifact-reconciliation';
  artifactDigest: string;
  evidenceRef: string;
  at: string;
}
export interface SkillProposalRecord {
  version: 1; id: string; workspace: string; workspaceIdentity: string; name: string; path: string;
  procedureContractDigest?: string;
  procedureEvidenceAttribution?: 'contract-bound' | 'legacy-unattributed';
  input: SkillProposalInput; revisionDigest: string; contentKey: string;
  status: ProposalStatus; artifactStatus: 'not-built' | 'staged' | 'validated' | 'catalog-active';
  qualification: 'awaiting-verification' | 'qualified' | 'needs-review';
  sourceTaskIds: string[]; supportTaskIds: string[]; failureTaskIds: string[]; historicalTaskIds: string[];
  evidenceRefs: string[]; sourceSessionIds: string[];
  action: 'create' | 'revise'; targetSkillName: string; expectedActiveDigest?: string;
  artifactDigest?: string; artifactPath?: string;
  createdAt: string; updatedAt: string; notices: SkillProposalNoticeReceipt[];
  decisions: SkillProposalDecision[];
  fulfillment?: SkillProposalFulfillment;
  history: Array<{ revisionDigest: string; at: string; status: ProposalStatus; evidenceRefs: string[] }>;
  previousDocumentDigest?: string;
  /** External-only readable projection; canonical/native path and decision identity stay unchanged. */
  externalDocument?: { revisionDigest: string; documentDigest: string; publishedAt: string };
}
export interface SkillNoticeScope { workspace: string; sessionId: string; taskId?: string; query?: string; }
export interface SkillProposalNotice {
  proposalId: string; revisionDigest: string; name: string; path: string; text: string;
  status: ProposalStatus; qualification: SkillProposalRecord['qualification'];
}
export interface SkillNoticeDeliveryInput extends SkillNoticeScope {
  proposalId: string; revisionDigest: string; status: 'included-in-response';
}
