import { describe, expect, it } from 'vitest';
import { classifyMeaningfulWork } from '../src/memory/meaningful-work.js';

describe('deterministic meaningful-work classifier', () => {
  it('classifies explicit workspace and execution mutations as meaningful', () => {
    for (const toolName of [
      'write_file', 'edit_file', 'create_directory', 'move_file', 'start_process',
      'execution_create', 'execution_start', 'execution_add_nodes', 'execution_retry',
    ]) {
      expect(classifyMeaningfulWork(toolName, {})).toMatchObject({ meaningful: true });
    }
  });

  it('keeps health and recovery available while substantive work is blocked', () => {
    for (const toolName of [
      'workspace_info', 'read_process_output', 'list_processes', 'stop_process',
      'execution_status', 'execution_wait', 'execution_logs', 'memory_status', 'agent_core_status',
      'execution_workflow_advice', 'execution_artifact_find', 'execution_cancel',
    ]) {
      expect(classifyMeaningfulWork(toolName, {})).toMatchObject({ meaningful: false });
    }
    expect(classifyMeaningfulWork('stop_process', {})).toMatchObject({
      meaningful: false,
      reasonCode: 'recovery_control_exempt',
    });
  });

  it('requires recall for analysis even when no workspace file is changed',()=>{
    for(const name of ['read_file','read_multiple_files','list_directory','get_file_info','search_files']){
      expect(classifyMeaningfulWork(name)).toMatchObject({meaningful:true,mutationClass:'read_only'});
    }
  });

  it('distinguishes read-only shell analysis from mutations while requiring recall for both', () => {
    for (const command of [
      'pwd',
      'ls',
      'ls -la src',
      'git status --short',
      'git rev-parse HEAD',
      'git branch --show-current',
    ]) {
      expect(classifyMeaningfulWork('execute_command', { command })).toMatchObject({
        meaningful: true,
        mutationClass: 'shell_read_only',
      });
    }

    for (const command of [
      'touch created.txt',
      'git diff --output=changed.txt',
      'git log --output=changed.txt',
      'git show --output=changed.txt',
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
    expect(classifyMeaningfulWork('github_repo', { operation: 'get' })).toMatchObject({meaningful:true,mutationClass:'github_read_only'});
    expect(classifyMeaningfulWork('github_repo', { operation: 'create' }).meaningful).toBe(true);
    expect(classifyMeaningfulWork('github_git', { operation: 'ls_remote' })).toMatchObject({meaningful:true,mutationClass:'github_read_only'});
    expect(classifyMeaningfulWork('github_git', { operation: 'push' }).meaningful).toBe(true);
    expect(classifyMeaningfulWork('github_api', { method: 'GET' })).toMatchObject({meaningful:true,mutationClass:'github_read_only'});
    expect(classifyMeaningfulWork('github_api', { method: 'PATCH' }).meaningful).toBe(true);
  });

  it('fails conservative for unknown tools', () => {
    expect(classifyMeaningfulWork('future_unknown_tool', {})).toMatchObject({
      meaningful: true,
      reasonCode: 'unknown_tool_conservative',
    });
  });
});
