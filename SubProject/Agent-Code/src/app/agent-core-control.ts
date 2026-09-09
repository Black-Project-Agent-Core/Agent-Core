import { invoke } from '@tauri-apps/api/core';

export type AgentCoreControlStatus = {
  overall: string;
  mcpServer: string;
  memory: string;
  execution: string;
  tunnel: string;
  autostart: boolean;
  desiredRunning: boolean;
  root: string;
};

export type AgentCoreActionResult = {
  ok: boolean;
  message: string;
  status: AgentCoreControlStatus;
};

export const getAgentCoreStatus = () =>
  invoke<AgentCoreControlStatus>('agent_core_control_status');

export const runAgentCoreAction = (command: string) =>
  invoke<AgentCoreActionResult>(command);

export const runAgentCoreUtility = (command: string) => invoke<void>(command);
