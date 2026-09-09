export interface MeaningfulWorkClassification {
  meaningful: boolean;
  reasonCode: string;
  mutationClass: string;
}

const EXPLICIT_MUTATIONS = new Set([
  'write_file', 'edit_file', 'create_directory', 'move_file', 'start_process',
  'execution_create', 'execution_start', 'execution_add_nodes', 'execution_retry', 'execution_cancel',
]);

const EXPLICIT_READ_ONLY = new Set([
  'craft_source',
  'workspace_info', 'list_directory', 'read_file', 'read_multiple_files', 'get_file_info', 'search_files',
  'read_process_output', 'list_processes',
  'execution_status', 'execution_wait', 'execution_logs', 'execution_artifact_find', 'execution_workflow_advice',
  'github_status', 'langflow_status', 'langflow_projects', 'langflow_flows', 'langflow_components',
]);

// Diagnostics and recovery must remain available even while the work gate is closed.
const RECOVERY_TOOLS = new Set([
  'execution_cancel',
  'workflow_status',
  'workspace_info', 'read_process_output', 'list_processes', 'stop_process',
  'execution_status', 'execution_wait', 'execution_logs', 'github_status', 'langflow_status',
  'execution_workflow_advice', 'execution_artifact_find',
  'agent_core_status', 'memory_status', 'capability_status',
]);

const GITHUB_MUTATIONS: Record<string, ReadonlySet<string>> = {
  github_repo: new Set(['create', 'update', 'archive', 'transfer', 'delete']),
  github_git: new Set(['clone', 'fetch', 'pull', 'push', 'remote_set_url']),
  github_issue: new Set(['create', 'update', 'close', 'comment']),
  github_pr: new Set(['create', 'update', 'review', 'merge', 'comment']),
  github_actions: new Set(['dispatch', 'cancel', 'rerun', 'rerun_failed']),
  github_release: new Set(['create', 'edit', 'delete', 'upload_asset']),
  github_packages: new Set(['delete_version', 'restore_version', 'npm_publish', 'npm_install']),
};

const SHELL_META = /[|&;><`$()\r\n]/;

function readOnlyShell(command: string): boolean {
  const normalized = command.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!normalized || SHELL_META.test(normalized)) return false;
  if (normalized === 'pwd') return true;
  if (/^ls(?:\s+(?!--(?:color|hyperlink)=always\b)[^;&|><`$()\r\n]+)?$/.test(normalized)) return true;
  if (/^git status(?: --short| --porcelain(?:=v[12])?| --branch)*$/.test(normalized)) return true;
  if (/^git rev-parse (?:--show-toplevel|--is-inside-work-tree|--git-dir|HEAD)$/.test(normalized)) return true;
  if (/^git\s+branch\s+--show-current$/.test(normalized)) return true;
  // Git diff/show/log can write --output files or invoke external diff/textconv
  // helpers. They are commands, not a read-only escape from a required plan.
  return false;
}

function githubClassification(toolName: string, input: Record<string, unknown>): MeaningfulWorkClassification | null {
  if (toolName === 'github_api') {
    const method = String(input.method ?? 'GET').toUpperCase();
    const meaningful = true;
    return {
      meaningful,
      reasonCode: method !== 'GET' ? 'github_api_mutation' : 'github_api_analysis',
      mutationClass: method !== 'GET' ? 'github_mutation' : 'github_read_only',
    };
  }
  const mutations = GITHUB_MUTATIONS[toolName];
  if (!mutations) return null;
  const operation = typeof input.operation === 'string' ? input.operation : '';
  const meaningful = mutations.has(operation);
  return {
    meaningful: true,
    reasonCode: meaningful ? 'github_operation_mutation' : 'github_operation_read_only',
    mutationClass: meaningful ? 'github_mutation' : 'github_read_only',
  };
}

export function classifyMeaningfulWork(
  toolName: string,
  input: Record<string, unknown> = {},
): MeaningfulWorkClassification {
  if (RECOVERY_TOOLS.has(toolName)) {
    return { meaningful: false, reasonCode: 'recovery_control_exempt', mutationClass: 'recovery_control' };
  }
  if (toolName === 'execute_command') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (readOnlyShell(command)) {
      return { meaningful: true, reasonCode: 'shell_read_only_analysis', mutationClass: 'shell_read_only' };
    }
    return { meaningful: true, reasonCode: 'shell_mutation_or_unknown', mutationClass: 'shell_mutation_or_unknown' };
  }
  if (EXPLICIT_MUTATIONS.has(toolName)) {
    return { meaningful: true, reasonCode: 'explicit_mutation_tool', mutationClass: 'agent_core_mutation' };
  }
  if (EXPLICIT_READ_ONLY.has(toolName)) {
    return { meaningful: true, reasonCode: 'read_only_analysis', mutationClass: 'read_only' };
  }
  const github = githubClassification(toolName, input);
  if (github) return github;
  return { meaningful: true, reasonCode: 'unknown_tool_conservative', mutationClass: 'unknown_conservative' };
}
