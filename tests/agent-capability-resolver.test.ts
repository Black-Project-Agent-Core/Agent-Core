import { describe, expect, it } from 'vitest';
import { AgentCapabilityResolver } from '../src/agent-capability-resolver.js';

const available = [
  'get_config',
  'read_file',
  'read_multiple_files',
  'list_directory',
  'get_file_info',
  'get_usage_stats',
  'start_search',
  'get_more_search_results',
  'list_searches',
  'stop_search',
  'write_file',
  'edit_block',
  'file_checkpoint',
  'start_process',
  'read_process_output',
  'browser_control',
  'memory_search',
  'memory_read',
  'web_search',
  'web_open',
  'code_refactor',
  'code_workspace',
  'kill_process',
  'set_config_value',
  'phone_status',
  'phone_observe',
  'phone_tap',
];

describe('AgentCapabilityResolver', () => {
  it('keeps explicit mode backward-compatible with the current tool ceiling', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'explicit',
      allowedTools: ['get_config'],
      allowedCapabilities: [],
    });
    expect(resolver.initialGrant(available).tools).toEqual(['get_config']);
    const result = resolver.resolve({
      requestedFamilies: ['observe.local'],
      userPrompt: 'inspect the project',
      availableTools: available,
    });
    expect(result.approvedFamilies).toEqual([]);
    expect(result.denied).toContainEqual({
      family: 'observe.local',
      reason: 'policy-mode',
    });
  });
  it('approves read-only capability families in dynamic mode without mutation', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['observe.local', 'search.local', 'memory.read'],
    });
    const result = resolver.resolve({
      requestedFamilies: ['observe.local', 'search.local', 'memory.read'],
      userPrompt: 'inspect and search the local project for the relevant source',
      availableTools: available,
    });
    expect(result.approvedFamilies).toEqual([
      'observe.local',
      'search.local',
      'memory.read',
    ]);
    expect(result.tools).toEqual(expect.arrayContaining([
      'read_file',
      'list_directory',
      'start_search',
      'memory_search',
    ]));
    expect(result.tools).not.toContain('write_file');
    expect(result.riskCeiling).toBe(0);
  });

  it('denies file mutation when user intent is inspection-only', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['observe.local', 'files.mutate'],
    });
    const result = resolver.resolve({
      requestedFamilies: ['files.mutate'],
      userPrompt: 'inspect this file and explain what it does',
      availableTools: available,
    });
    expect(result.approvedFamilies).toEqual([]);
    expect(result.denied).toContainEqual({
      family: 'files.mutate',
      reason: 'user-intent',
    });
    expect(result.tools).not.toContain('write_file');
  });
  it('approves file mutation when the user explicitly requests an edit', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['observe.local', 'files.mutate'],
    });
    const result = resolver.resolve({
      requestedFamilies: ['observe.local', 'files.mutate'],
      userPrompt: 'inspect this source and fix the bug by editing the file',
      availableTools: available,
    });
    expect(result.approvedFamilies).toEqual([
      'observe.local',
      'files.mutate',
    ]);
    expect(result.tools).toEqual(expect.arrayContaining([
      'read_file',
      'file_checkpoint',
      'edit_block',
      'write_file',
    ]));
    expect(result.riskCeiling).toBe(2);
  });

  it('treats explicit creator delegation as R2 execution intent without widening R3/R4', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['files.mutate', 'process.execute', 'process.admin', 'admin.config'],
    });
    const result = resolver.resolve({
      requestedFamilies: ['files.mutate', 'process.execute', 'process.admin', 'admin.config'],
      userPrompt: 'kerjakan task ini sampai selesai dan laporkan hasilnya',
      availableTools: available,
    });
    expect(result.riskCeiling).toBe(2);
    expect(result.approvedFamilies).toEqual(['files.mutate', 'process.execute']);
    expect(result.denied).toEqual(expect.arrayContaining([
      { family: 'process.admin', reason: 'user-intent' },
      { family: 'admin.config', reason: 'user-intent' },
    ]));
  });

  it('merges browser URL-read permission with local observe restrictions only when browser access is requested', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['observe.local', 'browser.navigate'],
    });
    const result = resolver.resolve({
      requestedFamilies: ['observe.local', 'browser.navigate'],
      userPrompt: 'inspect the local project and research this URL on the web',
      availableTools: available,
    });
    expect(result.approvedFamilies).toEqual([
      'observe.local',
      'browser.navigate',
    ]);
    expect(result.restrictions.read_file?.forbidUrlRead).not.toBe(true);
    expect(result.tools).toContain('read_file');
    expect(result.tools).toContain('browser_control');
  });

  it('grants semantic code modification only when mutation intent is explicit', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['code.modify'],
    });
    const denied = resolver.resolve({
      requestedFamilies: ['code.modify'],
      userPrompt: 'inspect this symbol and explain it',
      availableTools: available,
    });
    expect(denied.approvedFamilies).toEqual([]);
    const approved = resolver.resolve({
      requestedFamilies: ['code.modify'],
      userPrompt: 'rename this symbol and update the source',
      availableTools: available,
    });
    expect(approved.approvedFamilies).toEqual(['code.modify']);
    expect(approved.tools).toEqual(expect.arrayContaining([
      'code_refactor',
      'code_workspace',
    ]));
    expect(approved.restrictions.code_workspace?.allowedActions)
      .toEqual(['status', 'index', 'refs']);
  });

  it('keeps high-impact process/admin capabilities deny-by-default and requires explicit user intent', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: [],
      allowedCapabilities: ['process.admin', 'admin.config'],
    });
    const denied = resolver.resolve({
      requestedFamilies: ['process.admin', 'admin.config'],
      userPrompt: 'inspect the runtime state',
      availableTools: available,
    });
    expect(denied.approvedFamilies).toEqual([]);

    const processApproved = resolver.resolve({
      requestedFamilies: ['process.admin'],
      userPrompt: 'terminate the process that I identified',
      availableTools: available,
    });
    expect(processApproved.approvedFamilies).toEqual(['process.admin']);
    expect(processApproved.tools).toContain('kill_process');

    const configApproved = resolver.resolve({
      requestedFamilies: ['admin.config'],
      userPrompt: 'change config for the local runtime setting',
      availableTools: available,
    });
    expect(configApproved.approvedFamilies).toEqual(['admin.config']);
    expect(configApproved.tools).toContain('set_config_value');
  });

  it('keeps a non-empty tool list as a hard operator ceiling', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic',
      allowedTools: ['get_config', 'read_file'],
      allowedCapabilities: ['observe.local', 'files.mutate'],
    });
    const result = resolver.resolve({
      requestedFamilies: ['observe.local', 'files.mutate'],
      userPrompt: 'inspect and edit this file',
      availableTools: available,
    });
    expect(result.tools).toEqual(['get_config', 'read_file']);
    expect(result.approvedFamilies).toContain('observe.local');
    expect(result.denied).toContainEqual({
      family: 'files.mutate',
      reason: 'tool-ceiling',
    });
  });
});
