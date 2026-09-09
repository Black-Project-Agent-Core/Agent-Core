export const EXECUTION_RUN_STATES = ['planned', 'running', 'completed', 'failed', 'blocked', 'interrupted', 'cancelled'] as const;
export const EXECUTION_NODE_STATES = ['queued', 'ready', 'running', 'succeeded', 'failed', 'blocked', 'interrupted', 'cancelled'] as const;
export const EXECUTION_ATTEMPT_STATES = ['running', 'succeeded', 'failed', 'interrupted', 'cancelled'] as const;

/** Layout version of the file-native execution state root. */
export const EXECUTION_STATE_VERSION = 1;

export type ExecutionRunState = (typeof EXECUTION_RUN_STATES)[number];
export type ExecutionNodeState = (typeof EXECUTION_NODE_STATES)[number];
export type ExecutionAttemptState = (typeof EXECUTION_ATTEMPT_STATES)[number];

export interface ExecutionScope {
  principalId: string;
  projectId?: string;
}
