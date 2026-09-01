import { describe, expect, it } from 'vitest';
import { classifyMeaningfulWork } from '../src/memory/meaningful-work.js';

describe('deterministic meaningful-work classifier', () => {
  it('classifies explicit workspace and execution mutations as meaningful', () => {
    for (const toolName of [
      'write_file', 'edit_file', 'create_directory', 'move_file', 'start_process',
      'execution_create', 'execution_start', 'execution_add_nodes', 'execution_retry', 'execution_cancel',
    ]) {
      expect(classifyMeaningfulWork(toolName, {})).toMatchObject({ meaningful: true });
    }
  });

  it('keeps direct recovery and ordinary read-only tools outside hard lifecycle mutation enforcement', () => {
    for (const toolName of [
      'workspace_info', 'list_directory', 'read_file', 'read_multiple_files', 'get_file_info',
      'search_files', 'read_process_output', 'list_processes', 'stop_process',
      'execution_status', 'execution_wait', 'execution_logs', 'execution_artifact_find', 'execution_workflow_advice',
    ]) {
      expect(classifyMeaningfulWork(toolName, {})).toMatchObject({ meaningful: false });
    }
    expect(classifyMeaningfulWork('stop_process', {})).toMatchObject({
      meaningful: false,
      reasonCode: 'recovery_control_exempt',
    });
  });

  it('allows only a deliberately small shell read-only allowlist and treats metacharacters or unknown commands as meaningful', () => {
    for (const command of [
      'pwd',
      'ls',
      'ls -la src',
      'git status --short',
      'git rev-parse HEAD',
      'git branch --show-current',
      'git log --oneline -8',
      'git show --stat HEAD',
      'git diff --check',
    ]) {
      expect(classifyMeaningfulWork('execute_command', { command })).toMatchObject({
        meaningful: false,
        mutationClass: 'shell_read_only',
      });
    }

    for (const command of [
      'touch created.txt',
      'git commit -m test',
      'git push origin main',
      'npm test',
      'cat file > copy',
      'git status && rm -rf build',
      'pwd | tee output.txt',
      'echo $(date)',
      'unknown-command --flag',
    ]) {
      expect(classifyMeaningfulWork('execute_command', { command })).toMatchObject({
        meaningful: true,
        mutationClass: 'shell_mutation_or_unknown',
      });
    }
  });

  it('reuses exact GitHub operation semantics instead of treating all mixed read/write GitHub tools as mutations', () => {
    expect(classifyMeaningfulWork('github_repo', { operation: 'get' }).meaningful).toBe(false);
    expect(classifyMeaningfulWork('github_repo', { operation: 'create' }).meaningful).toBe(true);
    expect(classifyMeaningfulWork('github_git', { operation: 'ls_remote' }).meaningful).toBe(false);
    expect(classifyMeaningfulWork('github_git', { operation: 'push' }).meaningful).toBe(true);
    expect(classifyMeaningfulWork('github_api', { method: 'GET' }).meaningful).toBe(false);
    expect(classifyMeaningfulWork('github_api', { method: 'PATCH' }).meaningful).toBe(true);
  });

  it('fails conservative for unknown tools', () => {
    expect(classifyMeaningfulWork('future_unknown_tool', {})).toMatchObject({
      meaningful: true,
      reasonCode: 'unknown_tool_conservative',
    });
  });
});
