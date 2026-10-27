import { describe, expect, it } from 'vitest';
import { AgentCapabilityResolver } from '../src/agent-capability-resolver.js';

const available = [
  'get_config',
  'read_file',
  'image_inspect',
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
  it('exposes the registered surface in dynamic mode while leaving action admission to each tool', () => {
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
    expect(result.approvedFamilies).toEqual(expect.arrayContaining([
      'observe.local', 'search.local', 'memory.read',
    ]));
    expect(result.tools).toEqual(available);
    expect(result.tools).toContain('write_file'); // visible does not mean an action was executed
    expect(result.restrictions).toEqual({});
    expect(result.riskCeiling).toBe(4);
  });

  it('does not hide a registered file mutation tool merely because the task starts as inspection', () => {
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
    expect(result.approvedFamilies).toContain('files.mutate');
    expect(result.denied).toEqual([]);
    expect(result.tools).toContain('write_file');
    // The action's own input, task scope, and authority still govern execution.
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
    expect(result.approvedFamilies).toEqual(expect.arrayContaining([
      'observe.local', 'files.mutate',
    ]));
    expect(result.tools).toEqual(expect.arrayContaining([
      'read_file',
      'file_checkpoint',
      'edit_block',
      'write_file',
    ]));
    expect(result.riskCeiling).toBe(4);
  });

  it('exposes the registered surface even when catalog family names are only a subset', () => {
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
    expect(result.riskCeiling).toBe(4);
    expect(result.approvedFamilies).toEqual(expect.arrayContaining([
      'files.mutate', 'process.execute', 'process.admin', 'admin.config',
    ]));
    expect(result.denied).toEqual([]);
    expect(result.tools).toContain('kill_process');
    expect(result.tools).toContain('set_config_value');
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
    expect(result.approvedFamilies).toEqual(expect.arrayContaining([
      'observe.local', 'browser.navigate',
    ]));
    expect(result.restrictions.read_file?.forbidUrlRead).not.toBe(true);
    expect(result.tools).toContain('read_file');
    expect(result.tools).toContain('browser_control');
  });

  it('exposes semantic tools without implying mutation action permission', () => {
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
    expect(denied.approvedFamilies).toContain('code.modify');
    expect(denied.tools).toContain('code_refactor');
    const approved = resolver.resolve({
      requestedFamilies: ['code.modify'],
      userPrompt: 'rename this symbol and update the source',
      availableTools: available,
    });
    expect(approved.approvedFamilies).toContain('code.modify');
    expect(approved.tools).toEqual(expect.arrayContaining([
      'code_refactor', 'code_workspace',
    ]));
    expect(approved.restrictions).toEqual({}); // dispatch validates each action/task independently
  });

  it('leaves high-impact action authorization to the tool contract rather than discovery', () => {
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
    expect(denied.approvedFamilies).toEqual(expect.arrayContaining(['process.admin', 'admin.config']));
    expect(denied.tools).toEqual(expect.arrayContaining(['kill_process', 'set_config_value']));

    const processApproved = resolver.resolve({
      requestedFamilies: ['process.admin'],
      userPrompt: 'terminate the process that I identified',
      availableTools: available,
    });
    expect(processApproved.approvedFamilies).toContain('process.admin');
    expect(processApproved.tools).toContain('kill_process');

    const configApproved = resolver.resolve({
      requestedFamilies: ['admin.config'],
      userPrompt: 'change config for the local runtime setting',
      availableTools: available,
    });
    expect(configApproved.approvedFamilies).toContain('admin.config');
    expect(configApproved.tools).toContain('set_config_value');
  });

  it('makes source inspection, Memory reads and Skill discovery available at Native task start', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic', allowedTools: [],
      allowedCapabilities: ['observe.local', 'search.local', 'memory.read', 'skills.inspect', 'files.mutate'],
    });
    const grant = resolver.initialGrant([...available, 'skills'], 'inspect this local source');
    expect(grant.approvedFamilies).toEqual(expect.arrayContaining(['observe.local', 'search.local', 'memory.read', 'skills.inspect']));
    expect(grant.tools).toEqual(expect.arrayContaining(['read_file', 'image_inspect', 'start_search', 'memory_search', 'skills']));
    expect(grant.tools).toContain('write_file'); // discovery is not approval for a specific action
  });

  it('exposes Memory write in dynamic mode while the tool still checks authority', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic', allowedTools: [], allowedCapabilities: ['memory.write'],
    });
    const toolList = [...available, 'memory_v2_write'];
    const approved = resolver.resolve({ requestedFamilies: ['memory.write'],
      userPrompt: 'ingat dan simpan pelajaran ini dalam Memory Agent Core', availableTools: toolList });
    expect(approved.approvedFamilies).toContain('memory.write');
    expect(approved.tools).toContain('memory_v2_write');
    const inspected = resolver.resolve({ requestedFamilies: ['memory.write'],
      userPrompt: 'jelaskan kode ini', availableTools: toolList });
    expect(inspected.approvedFamilies).toContain('memory.write');
    expect(inspected.tools).toContain('memory_v2_write');
    expect(inspected.denied).toEqual([]); // discovery is not write-action authorization
  });

  it('exposes artifact inspection without authorizing source mutation', () => {
    const resolver = new AgentCapabilityResolver({
      mode: 'dynamic', allowedTools: [], allowedCapabilities: ['artifact.inspect', 'files.mutate'],
    });
    const grant = resolver.resolve({ requestedFamilies: ['artifact.inspect', 'files.mutate'],
      userPrompt: 'analisis artefak kode ini', availableTools: [...available, 'artifact_inspect'] });
    expect(grant.approvedFamilies).toContain('artifact.inspect');
    expect(grant.tools).toContain('artifact_inspect');
    expect(grant.tools).toContain('write_file'); // separate action guards remain mandatory
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
    expect(result.denied).toEqual([]);
    expect(result.tools).not.toContain('write_file');
  });
});
