import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { deriveProviderCapabilities, GRAFEL_CORE_TOOLS } from '../src/code-intelligence/provider-capabilities.js';
import { GrafelRuntime, validateGrafelIsolationEnvironment } from '../src/code-intelligence/grafel-runtime.js';
import * as schemas from '../src/mcp/code-intelligence-schemas.js';

describe('Grafel post-v0.3.3 Agent Core contracts', () => {
  it('derives the approved extended capability set without changing the core provider requirement', () => {
    const tools = [
      ...GRAFEL_CORE_TOOLS,
      'grafel_docgen_apply',
      'grafel_patterns',
    ];
    const caps = deriveProviderCapabilities(tools, {
      groupAdd: true,
      trackWorktrees: true,
      branches: true,
      fitness: true,
      quarantine: true,
    });
    expect(caps.coreNavigation).toBe(true);
    expect(caps.messaging).toBe(true);
    expect(caps.graphPatterns).toBe(true);
    expect(caps.crossLinkCandidates).toBe(true);
    expect(caps.enrichmentCandidates).toBe(true);
    expect(caps.dynamicToolRefresh).toBe(true);
  });

  it('maps typed resource policy to the exact Grafel environment knobs', () => {
    const runtimeDir = path.resolve('runtime/test-grafel-policy');
    const runtime = new GrafelRuntime({
      enabled: true,
      projectRoot: path.resolve('.'),
      runtimeDir,
      binaryPath: path.join(runtimeDir, 'bin', 'grafel.exe'),
      group: 'test',
      repoSlug: 'test',
      startupTimeoutMs: 1000,
      callTimeoutMs: 1000,
      resourcePolicy: {
        maxRssBudgetMb: 1024,
        reloadDebounceMs: 2500,
        bm25IdleMs: 360000,
        groupIdleMs: 600000,
        groupKeepReader: false,
        groupRssBudgetMb: 2048,
        groupAlgoDebounce: '240s',
      },
    });
    const env = runtime.environment();
    expect(env.GRAFEL_MAX_RSS_BUDGET_MB).toBe('1024');
    expect(env.GRAFEL_MCP_RELOAD_DEBOUNCE_MS).toBe('2500');
    expect(env.GRAFEL_MCP_BM25_IDLE_MS).toBe('360000');
    expect(env.GRAFEL_MCP_GROUP_IDLE_MS).toBe('600000');
    expect(env.GRAFEL_MCP_GROUP_KEEP_READER).toBe('false');
    expect(env.GRAFEL_MCP_GROUP_RSS_BUDGET_MB).toBe('2048');
    expect(env.GRAFEL_GROUP_ALGO_DEBOUNCE).toBe('240s');
    expect(runtime.isolationStatus()).toEqual({ ok: true, missingOrInvalid: [] });
  });

  it('detects incomplete or escaped Grafel isolation planes', () => {
    const runtimeDir = path.resolve('runtime/test-grafel-isolation');
    const inside = path.join(runtimeDir, 'home');
    const issues = validateGrafelIsolationEnvironment(runtimeDir, {
      HOME: inside,
      USERPROFILE: inside,
      XDG_CONFIG_HOME: path.join(inside, '.config'),
      APPDATA: path.join(inside, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(inside, 'AppData', 'Local'),
      GRAFEL_HOME: path.join(inside, '.grafel'),
      GRAFEL_DAEMON_ROOT: path.resolve('outside-daemon'),
    });
    expect(issues).toContain('GRAFEL_DAEMON_ROOT:outside-runtime');

    const missing = validateGrafelIsolationEnvironment(runtimeDir, {});
    expect(missing).toContain('HOME:missing');
    expect(missing).toContain('GRAFEL_HOME:missing');
    expect(missing).toContain('GRAFEL_DAEMON_ROOT:missing');
  });

  it('accepts typed confidence, messaging, topology, graph/template patterns and repair candidate families', () => {
    expect(schemas.codeOrient.parse({ action: 'topology', minConfidence: 0.6 }).action).toBe('topology');
    expect(schemas.codeGraph.parse({ action: 'related', entityId: 'x', direction: 'messaging' }).direction).toBe('messaging');
    expect(schemas.codeAnalysis.parse({ kind: 'security', minConfidence: 0.8 }).minConfidence).toBe(0.8);
    expect(schemas.codePatterns.parse({ action: 'list', kind: 'graph' }).kind).toBe('graph');
    expect(schemas.codePatterns.parse({ action: 'list', kind: 'template', literalKind: 'sql', repoFilter: ['r'] }).literalKind).toBe('sql');
    expect(schemas.codeRepair.parse({ action: 'accept', candidateType: 'cross_link', candidateId: 'c1' }).candidateType).toBe('cross_link');
    expect(schemas.codeRepair.parse({ action: 'submit', candidateType: 'enrichment', candidateId: 'e1', value: 'purpose' }).candidateType).toBe('enrichment');
  });
});
