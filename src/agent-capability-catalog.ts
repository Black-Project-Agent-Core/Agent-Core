export type AgentCapabilityRisk = 0 | 1 | 2 | 3 | 4;

export type AgentCapabilityFamily =
  | 'observe.local'
  | 'search.local'
  | 'files.mutate'
  | 'process.execute'
  | 'process.admin'
  | 'browser.navigate'
  | 'browser.act'
  | 'code.intelligence'
  | 'code.modify'
  | 'semantic.ide'
  | 'phone.observe'
  | 'phone.act'
  | 'skills.inspect'
  | 'memory.read'
  | 'memory.write'
  | 'admin.config'
  | 'web.research'
  | 'artifact.inspect'
  | 'reconstruction.harness';

export interface AgentToolRestriction {
  allowedActions?: string[];
  forbidUrlRead?: boolean;
}

export interface AgentCapabilityTool {
  name: string;
  restriction?: AgentToolRestriction;
}

export interface AgentCapabilityDescriptor {
  family: AgentCapabilityFamily;
  risk: AgentCapabilityRisk;
  description: string;
  tools: AgentCapabilityTool[];
}
const t = (name: string, restriction?: AgentToolRestriction): AgentCapabilityTool => ({
  name,
  ...(restriction ? { restriction } : {}),
});

export const AGENT_CAPABILITY_CATALOG: readonly AgentCapabilityDescriptor[] = [
  { family: 'reconstruction.harness', risk: 0,
    description: 'Native task-bound proof obligations, evidence authority, dependency closure and readiness; observational only.',
    tools: [t('reconstruction_harness', { allowedActions: ['preview','assess','readiness'] })] },
  { family: 'artifact.inspect', risk: 2,
    description: 'Static bounded artifact inspection of operator-approved exact targets only; no execution or implicit authorization.',
    tools: [t('artifact_inspect', { allowedActions: ['prepare','status','inspect'] })] },
  {
    family: 'observe.local',
    risk: 0,
    description: 'Read-only local configuration, files, directories, process/session state, usage and history.',
    tools: [
      t('get_config'),
      t('read_file', { forbidUrlRead: true }),
      t('read_multiple_files'),
      t('list_directory'),
      t('get_file_info'),
      t('list_sessions'),
      t('list_processes'),
      t('get_usage_stats'),
      t('get_recent_tool_calls'),
      t('get_prompts'),
    ],
  },
  {
    family: 'search.local',
    risk: 0,
    description: 'Progressive local filesystem/content search and bounded search-session cleanup.',
    tools: [
      t('start_search'),
      t('get_more_search_results'),
      t('list_searches'),
      t('stop_search'),
    ],
  },
  {
    family: 'files.mutate',
    risk: 2,
    description: 'Scoped filesystem/document creation and mutation through existing Agent Core safety owners.',
    tools: [
      t('file_checkpoint'),
      t('write_file'),
      t('write_pdf'),
      t('create_directory'),
      t('edit_block'),
      t('move_file'),
    ],
  },
  {
    family: 'process.execute',
    risk: 2,
    description: 'Start and interact with bounded local processes, and inspect owned sessions/processes.',
    tools: [
      t('start_process'),
      t('read_process_output'),
      t('interact_with_process'),
      t('list_sessions'),
      t('list_processes'),
    ],
  },
  {
    family: 'process.admin',
    risk: 3,
    description: 'Explicit process/session termination controls.',
    tools: [t('force_terminate'), t('kill_process')],
  },
  {
    family: 'browser.navigate',
    risk: 1,
    description: 'Open/observe/status/close isolated browser sessions and read public URLs.',
    tools: [
      t('browser_control', { allowedActions: ['open', 'observe', 'status', 'close'] }),
      t('read_file', { forbidUrlRead: false }),
    ],
  },
  {
    family: 'browser.act',
    risk: 3,
    description: 'Act on an already observed isolated browser session.',
    tools: [
      t('browser_control', {
        allowedActions: ['open', 'observe', 'status', 'close', 'act'],
      }),
    ],
  },
  {
    family: 'code.intelligence',
    risk: 0,
    description: 'Read-only Grafel structural analysis and safe workspace inspection.',
    tools: [
      t('code_orient'),
      t('code_graph'),
      t('code_surface'),
      t('code_analysis'),
      t('code_workspace', { allowedActions: ['list', 'resolve', 'status', 'refs'] }),
      t('code_patterns', { allowedActions: ['query', 'list', 'get'] }),
    ],
  },
  {
    family: 'code.modify',
    risk: 2,
    description: 'Transactional semantic source refactoring and explicit Grafel reindex for user-authorized code changes.',
    tools: [
      t('code_refactor'),
      t('code_workspace', { allowedActions: ['status', 'index', 'refs'] }),
    ],
  },
  {
    family: 'semantic.ide',
    risk: 0,
    description: 'Read-only Semantic IDE/LSP symbol, reference and diagnostic queries.',
    tools: [
      t('code_symbol', {
        allowedActions: [
          'status', 'overview', 'find', 'references', 'declaration',
          'implementations', 'diagnostics', 'type_hierarchy',
        ],
      }),
    ],
  },
  {
    family: 'phone.observe',
    risk: 0,
    description: 'Read-only phone/device status, screen observation and named-action inventory.',
    tools: [
      t('phone_status'),
      t('phone_observe'),
      t('phone_list_named_actions'),
      t('phone_game_inspect'),
    ],
  },
  {
    family: 'phone.act',
    risk: 3,
    description: 'Explicit phone/device interaction using the existing phone controller.',
    tools: [
      t('phone_status'),
      t('phone_observe'),
      t('phone_list_named_actions'),
      t('phone_tap'),
      t('phone_swipe'),
      t('phone_long_press'),
      t('phone_input_text'),
      t('phone_key'),
      t('phone_back'),
      t('phone_home'),
      t('phone_launch_app'),
      t('phone_save_verified_action'),
      t('phone_run_named_action'),
      t('phone_run_macro'),
      t('phone_game_inspect'),
      t('phone_game_manage'),
    ],
  },
  {
    family: 'skills.inspect',
    risk: 0,
    description: 'Read-only Skill discovery, revision-bound instruction fragments and validation.',
    tools: [
      t('skills', { allowedActions: ['status', 'list', 'inspect', 'search', 'read', 'validate', 'proposals', 'self_awareness', 'explain_improvement'] }),
    ],
  },
  {
    family: 'memory.read',
    risk: 0,
    description: 'Targeted read-only canonical Memory retrieval beyond controller-managed Memory-first recall.',
    tools: [
      t('memory_list'),
      t('memory_page'),
      t('memory_read'),
      t('memory_search'),
      t('memory_retrieval_diagnostics'),
      t('memory_retirement_review'),
      t('memory_status'),
      t('memory_consolidate'),
      t('memory_v2_read'),
    ],
  },
  {
    family: 'memory.write',
    risk: 3,
    description: 'Host-scoped task episodes and reviewed Memory v2 mutations.',
    tools: [t('memory_v2_write')],
  },
  {
    family: 'admin.config',
    risk: 4,
    description: 'Administrative mutation of local machine-control configuration.',
    tools: [t('set_config_value')],
  },
  {
    family: 'web.research',
    risk: 1,
    description: 'Agent Core-native public web, academic and asset search plus bounded reader extraction.',
    tools: [t('web_search'), t('web_open')],
  },
];
export const AGENT_CAPABILITY_FAMILIES = AGENT_CAPABILITY_CATALOG
  .map(item => item.family) as AgentCapabilityFamily[];

const BY_FAMILY = new Map(
  AGENT_CAPABILITY_CATALOG.map(item => [item.family, item] as const),
);

export function capabilityDescriptor(
  family: AgentCapabilityFamily,
): AgentCapabilityDescriptor {
  const value = BY_FAMILY.get(family);
  if (!value) throw new Error('AGENT_CAPABILITY_UNKNOWN_FAMILY');
  return value;
}

export function capabilityRisk(family: AgentCapabilityFamily): AgentCapabilityRisk {
  return capabilityDescriptor(family).risk;
}

export function isAgentCapabilityFamily(value: unknown): value is AgentCapabilityFamily {
  return typeof value === 'string' && BY_FAMILY.has(value as AgentCapabilityFamily);
}
