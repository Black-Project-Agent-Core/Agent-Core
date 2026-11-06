import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DesktopSnapshot } from './host';
import { buildSystems, systemCounts } from './systems';
import { SystemCard } from './components';

const addedIds = ['skills', 'external-learning', 'web-research', 'mutation-safety', 'credential-vault'];

function snapshot(health: Record<string, unknown> = {}): DesktopSnapshot {
  return {
    capturedAt: '2026-10-18T12:00:00Z', version: 'fixture',
    status: { overall: 'online', connection: 'on', memory: 'available', tunnel: 'on', execution: 'available', gameMode: 'off', autostart: false, root: 'fixture' },
    core: { port: 8765, httpHealthy: true }, tunnel: { port: 8787, ready: true },
    paths: { root: 'fixture', memory: 'fixture/memory', runtimeCache: 'fixture/cache', logs: 'fixture/logs' },
    health: {
      memory: { status: 'available', noteCount: 0, issueCount: 0 }, execution: { status: 'available' },
      phone: { status: 'offline', deviceOnline: false },
      codeIntelligence: { status: 'available', issueCount: 0, isolationOk: true },
      semanticIde: { status: 'available', issueCount: 0, configuredServers: [] },
      learning: { status: 'available', issueCount: 0, sinkStatus: [] }, ...health,
    },
  } as DesktopSnapshot;
}

describe('dashboard owner health projection', () => {
  it('shows the four existing health owners with their observed metadata', () => {
    const systems = buildSystems(snapshot({
      skills: { status: 'available', mode: 'artifact-only', skillCount: 0, discoveryMode: 'lexical', executionAuthority: false, instructionRead: true },
      externalControllerLearning: { status: 'available', mode: 'external-controller-derived-state', episodeCount: 12, pendingLearningEpisodes: 3, procedureCount: 4, readyProcedureCount: 1, semanticAuthority: 'memory-service' },
      webResearch: { status: 'available', searchConfigured: true, readerConfigured: true, searchProviders: ['brave'], openProviders: ['native'] },
      mcpMutationSafety: { status: 'available', issueCount: 0, draining: false, activeMutations: 0, journalEntries: 7 },
    }));
    expect(systems.map(system => system.id)).toEqual(expect.arrayContaining(addedIds));
    const skill = systems.find(system => system.id === 'skills')!;
    expect(skill.tone).toBe('healthy');
    expect(skill.meta).toEqual(expect.arrayContaining([['Skills', '0'], ['Discovery', 'lexical'], ['Source', '/health.skills']]));
    const external = systems.find(system => system.id === 'external-learning')!;
    expect(external.tone).toBe('healthy');
    expect(external.meta).toEqual(expect.arrayContaining([['Episodes', '12'], ['Pending reviews', '3'], ['Ready procedures', '1']]));
    expect(systems.find(system => system.id === 'web-research')?.meta).toEqual(expect.arrayContaining([['Search providers', 'brave'], ['Open providers', 'native']]));
    expect(systems.find(system => system.id === 'mutation-safety')?.meta).toEqual(expect.arrayContaining([['Active mutations', '0'], ['Journal entries', '7'], ['Draining', 'No']]));
  });

  it('keeps absent owner health unknown instead of reporting zero or healthy', () => {
    const systems = buildSystems(snapshot());
    expect(systems.map(system => system.id)).toEqual(expect.arrayContaining(addedIds));
    for (const id of addedIds) {
      const system = systems.find(item => item.id === id)!;
      expect(system).toMatchObject({ tone: 'unknown', label: 'Unknown' });
      expect(system.meta.some(([, value]) => value === '0')).toBe(false);
      expect(system.meta.some(([, value]) => value === 'Unknown')).toBe(true);
    }
    expect(systemCounts(systems).unknown).toBe(7);
  });

  it('shows the credential vault by state and never a key value', () => {
    const active = buildSystems(snapshot({ credentialVault: { status: 'active', entryCount: 3, importedCount: 1, deletedCount: 0, providers: { anthropic: 2, openrouter: 1 }, issueCount: 0 } })).find(item => item.id === 'credential-vault');
    expect(active).toMatchObject({ tone: 'healthy', label: 'Healthy' });
    expect(active?.meta).toEqual(expect.arrayContaining([['Keys', '3'], ['Imported at start', '1'], ['Providers', 'anthropic 2, openrouter 1'], ['Source', '/health.credentialVault']]));

    const locked = buildSystems(snapshot({ credentialVault: { status: 'locked', entryCount: 0, issueCount: 1, issue: 'VAULT_KEY_LOCKED' } })).find(item => item.id === 'credential-vault');
    expect(locked).toMatchObject({ tone: 'error', label: 'Locked', issue: 'VAULT_KEY_LOCKED' });

    const sourceOnly = buildSystems(snapshot({ credentialVault: { status: 'unavailable', entryCount: 0, issueCount: 0, issue: 'VAULT_HELPER_MISSING' } })).find(item => item.id === 'credential-vault');
    expect(sourceOnly).toMatchObject({ tone: 'offline', label: '.env only' });
  });

  it('does not invent missing metrics from an available but partial section', () => {
    const system = buildSystems(snapshot({ skills: { status: 'available' } })).find(item => item.id === 'skills');
    expect(system).toBeDefined();
    expect(system?.meta).toEqual(expect.arrayContaining([['Skills', 'Unknown'], ['Discovery', 'Unknown'], ['Execution authority', 'Unknown']]));
  });

  it('retains an owner degraded status and its issue', () => {
    const system = buildSystems(snapshot({ externalControllerLearning: { status: 'degraded', issue: 'STATE_DEGRADED', episodeCount: 5 } })).find(item => item.id === 'external-learning');
    expect(system).toMatchObject({ tone: 'degraded', label: 'Degraded', issue: 'STATE_DEGRADED' });
    expect(system?.meta).toContainEqual(['Status', 'degraded']);
  });

  it('reports an observed mutation drain separately from availability', () => {
    const system = buildSystems(snapshot({ mcpMutationSafety: { status: 'available', draining: true, activeMutations: 2, journalEntries: 4 } })).find(item => item.id === 'mutation-safety');
    expect(system).toMatchObject({ tone: 'warning', label: 'Draining' });
    expect(system?.meta).toContainEqual(['Status', 'available']);
    expect(system?.meta).toContainEqual(['Draining', 'Yes']);
  });

  it('reports disabled web research as offline without claiming provider connectivity', () => {
    const system = buildSystems(snapshot({ webResearch: { status: 'disabled', searchConfigured: false, readerConfigured: false, searchProviders: [], openProviders: [] } })).find(item => item.id === 'web-research');
    expect(system).toMatchObject({ tone: 'offline', label: 'Offline' });
    expect(system?.meta).toContainEqual(['Search providers', 'None configured']);
    expect(system?.meta).toContainEqual(['Reader configured', 'No']);
  });

  it('renders every newly exposed owner with an available system icon', () => {
    const systems = buildSystems(snapshot());
    expect(systems.map(system => system.id)).toEqual(expect.arrayContaining(addedIds));
    for (const id of addedIds) {
      const system = systems.find(item => item.id === id)!;
      render(createElement(SystemCard, { system }));
      expect(screen.getByRole('button', { name: new RegExp(system.name) })).toBeInTheDocument();
    }
  });
});
