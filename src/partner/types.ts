export interface HermesPartnerConfig {
  enabled: boolean;
  projectRoot: string;
  runtimeDir: string;
  hermesHome: string;
  hermesSourceRoot: string;
  host: string;
  portStart: number;
  startupTimeoutMs: number;
  callTimeoutMs: number;
  discussionRounds: number;
}

export type HermesPartnerStatus = 'available' | 'degraded' | 'not-configured';

export interface HermesPartnerHealth {
  status: HermesPartnerStatus;
  enabled: boolean;
  provider: 'hermes';
  transport: 'loopback-runs-api';
  issueCount: number;
  issue?: string;
  hermesHome?: string;
  sourceRoot?: string;
  port?: number;
  version?: string;
}

export interface CollaborationContract {
  collaborationId: string;
  task: string;
  workspacePath: string;
  leadWorkstream: string;
  partnerWorkstream: string;
  constraints: string[];
  allowedPaths: string[];
  expectedDeliverable: string;
  leadShare: 50;
  partnerShare: 50;
  sessionKey: string;
  discussionRounds: number;
  proposal?: string;
  alignmentRunId?: string;
  alignmentPending: boolean;
  alignmentApproved: boolean;
  lastRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HermesRunStatus {
  object?: string;
  run_id?: string;
  status?: string;
  output?: unknown;
  error?: unknown;
  approval?: unknown;
  session_id?: string;
  [key: string]: unknown;
}
