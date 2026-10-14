import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { GameModeService } from '../src/phone/game-mode-service.js';
import { assessGameFrameProgress, classifyGameFrame } from '../src/phone/game-perception.js';
import { parseGameProfile, parseGameSteps, parseSessionPatch } from '../src/mcp/phone-game-schemas.js';

const TMP = path.resolve(process.cwd(), 'runtime/tmp');
async function fixture() {
  await mkdir(TMP, { recursive: true });
  const dir = await mkdtemp(path.join(TMP, 'game-mode-acceptance-'));
  return { dir, game: new GameModeService(dir) };
}
function profile(gameVersion = '1.0') {
  return {
    gameId: 'fixture-game', packageName: 'org.example.fixture',
    displayName: 'Fixture', version: gameVersion,
    regions: { upper: { x: 0, y: 0, width: 0.5, height: 0.5 } },
    stateRules: [{ state: 'bright', conditions: [{ region: 'upper', metric: 'brightness' as const, min: 0.7 }] }],
    anchors: {},
    actions: { navigate: { id: 'navigate', category: 'navigation' as const, reversible: true, cooldownMs: 200 } },
    resourceGuards: {}, taskPolicies: {},
  };
}
async function gridImage() {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path fill="white" d="M0 0h80v80H0z"/><path fill="black" d="M0 0h40v40H0zM40 40h40v40H40z"/></svg>');
  return sharp({ create: { width: 400, height: 400, channels: 3, background: '#ffffff' } })
    .composite([{ input: svg, left: 40, top: 40 }]).png().toBuffer();
}

describe('Advanced Agent Core Game Mode acceptance', () => {
  it('validates game profiles, referenced regions and action IDs before storing', () => {
    const good = parseGameProfile({ ...profile(), anchors: undefined, resourceGuards: undefined, taskPolicies: undefined });
    expect(good.gameId).toBe('fixture-game');
    expect(() => parseGameProfile({ ...good, stateRules: [{ state: 'bad', conditions: [{ region: 'missing', metric: 'brightness' }] }] })).toThrow('GAME_MODE_UNDEFINED_REGION');
    expect(() => parseGameProfile({ ...good, actions: { navigate: { id: 'different', category: 'navigation' } } })).toThrow('GAME_MODE_ACTION_ID_MISMATCH');
    expect(() => parseSessionPatch({ party: ['one'], objective: 'stage-1' })).not.toThrow();
    expect(() => parseGameSteps([{ action: 'tap', x: 0.1, y: 0.2, normalized: true }])).not.toThrow();
    expect(() => parseGameSteps([{ action: 'root-device' }])).toThrow();
  });

  it('abstains rather than guessing when two screen rules tie', async () => {
    const image = await sharp({ create: { width: 160, height: 160, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const p = { ...profile(), schemaVersion: 1 as const, updatedAt: new Date().toISOString() };
    const single = await classifyGameFrame(image, p);
    expect(single.state).toBe('bright');
    const ambiguous = await classifyGameFrame(image, { ...p, stateRules: [p.stateRules[0]!, { ...p.stateRules[0]!, state: 'also-bright' }] });
    expect(ambiguous.state).toBeNull();
    expect(ambiguous.ambiguous).toBe(true);
  });

  it('preserves session IDs, operational progress and comparable evidence only', async () => {
    const { dir, game } = await fixture();
    try {
      await game.putProfile(profile());
      const session = { sessionId: 'controller-A', gameId: 'fixture-game', packageName: 'org.example.fixture', gameVersion: '1.0', controllerLabel: 'controller-a' };
      await game.startSession(session);
      await expect(game.startSession(session)).rejects.toThrow('GAME_MODE_SESSION_ALREADY_EXISTS');
      await game.updateSession(session.sessionId, { mode: 'story', stage: '1', party: ['one', 'two'] });
      await game.recordOutcome(session.sessionId, { at: new Date().toISOString(), kind: 'success', scope: 'battle', summary: 'fixture', evidenceRef: 'fixture:one' });
      await expect(game.recordOutcome(session.sessionId, { at: new Date().toISOString(), kind: 'success', scope: 'battle', summary: 'duplicate', evidenceRef: 'fixture:one' })).rejects.toThrow('GAME_MODE_DUPLICATE_BATTLE_EVIDENCE');
      const comparison = await game.compareSessions('fixture-game');
      expect(comparison.sessions[0]).toMatchObject({ wins: 1, losses: 0, played: 1, insufficientSample: true, gameVersion: '1.0', stage: '1', controllerLabel: 'controller-a' });
      const progress = await game.recordProgress(session.sessionId, 'sha256:fixture', false, true);
      expect(progress.repeatedNoProgress).toBe(1);
      const summary = await game.sessionSummary(session.sessionId);
      expect(summary.state.party).toEqual(['one', 'two']);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('captures an informative anchor, verifies the template and rejects stale versions', async () => {
    const { dir, game } = await fixture();
    try {
      await game.putProfile(profile());
      const image = await gridImage();
      const anchor = await game.captureAnchor('fixture-game', 'menu-button', { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, image);
      expect(anchor.templateFile).toBe('anchors/menu-button.png');
      expect((await game.verifyAnchor('fixture-game', 'menu-button', image)).matched).toBe(true);
      await game.putProfile({ ...profile('2.0'), anchors: (await game.getProfile('fixture-game'))!.anchors });
      await expect(game.verifyAnchor('fixture-game', 'menu-button', image)).rejects.toThrow('GAME_MODE_ANCHOR_PATCH_STALE');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

it('passes expectedPackage through phone_run_macro and refuses an unguarded legacy macro', async () => {
  const { vi } = await import('vitest');
  const { registerPhoneTools } = await import('../src/mcp/phone-tools.js');
  const registered = new Map<string, (args: any) => Promise<any>>();
  const fakeServer = { registerTool: (name: string, _descriptor: unknown, callback: (args: any) => Promise<any>) => { registered.set(name, callback); } };
  const runSequence = vi.fn(async (_steps: unknown, _transport: unknown, expectedPackage: unknown) =>
    ({ ok: true, expectedPackage }));
  registerPhoneTools(fakeServer as any, { enabled: true, runSequence } as any);
  const macro = registered.get('phone_run_macro');
  expect(macro).toBeDefined();
  const good = await macro!({ steps: [{ action: 'wait', durationMs: 0 }], expectedPackage: 'org.example.fixture', transport: 'adb', observeAfter: false });
  expect(good.isError).not.toBe(true);
  expect(runSequence).toHaveBeenCalledWith([{ action: 'wait', durationMs: 0 }], 'adb', 'org.example.fixture');
  const legacy = await macro!({ actions: ['one'], expectedPackage: 'org.example.fixture', observeAfter: false });
  expect(legacy.isError).toBe(true);
  expect(legacy.content[0].text).toContain('PHONE_APP_GUARD_REQUIRES_SEQUENCE_STEPS');
});
it('detects meaningful small-region navigation despite nearly unchanged full screen', async () => {
  const before = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const block = await sharp({ create: { width: 18, height: 18, channels: 3, background: '#000000' } }).png().toBuffer();
  const after = await sharp(before).composite([{ input: block, left: 20, top: 20 }]).png().toBuffer();
  const change = await assessGameFrameProgress(before, after, { regions: {
    hero_name: { x: 0.04, y: 0.05, width: 0.16, height: 0.2 },
  } });
  expect(change.globalDifference).toBeLessThan(0.015);
  expect(change.regionDifferences.hero_name).toBeGreaterThan(0.035);
  expect(change.changed).toBe(true);
});
it('does not let a verified visual anchor drift across repeated identical frames', async () => {
  const { dir, game } = await fixture();
  try {
    await game.putProfile(profile());
    const image = await gridImage();
    const region = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    await game.captureAnchor('fixture-game', 'stable-button', region, image);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const verified = await game.verifyAnchor('fixture-game', 'stable-button', image);
      expect(verified.matched).toBe(true);
      expect(verified.region).toEqual(region);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('advises OS-grounded USB transport when the companion reports its own foreground', async () => {
  const { registerPhoneGameTools } = await import('../src/mcp/phone-game-tools.js');
  const callbacks = new Map<string, (args: unknown) => Promise<any>>();
  const server = { registerTool: (name: string, _meta: unknown, callback: (args: unknown) => Promise<any>) => { callbacks.set(name, callback); } };
  const controller = {
    status: async () => ({ adb: { online: true }, configuredMode: 'gateway' }),
    gameMode: { status: async () => ({ status: 'available' }) },
  };
  registerPhoneGameTools(server as any, controller as any, (async () => ({})) as any, async (_name: string, fn: () => Promise<unknown>) => fn(), (() => ({})) as any);
  const result = await callbacks.get('phone_game_inspect')!({ action: 'status' });
  const payload = JSON.parse(result.content[0].text);
  expect(payload.transportGuidance.preferred).toBe('adb');
  expect(payload.phone.configuredMode).toBe('gateway');
});
it('refuses a premium semantic workflow without ever executing a touch', async () => {
  const { vi } = await import('vitest');
  const { registerPhoneGameTools } = await import('../src/mcp/phone-game-tools.js');
  const callbacks = new Map<string, (args: unknown) => Promise<any>>();
  const server = { registerTool: (name: string, _meta: unknown, callback: (args: unknown) => Promise<any>) => { callbacks.set(name, callback); } };
  const runSequence = vi.fn(async () => ({ ok: true }));
  const profile = { gameId: 'fixture-game', packageName: 'org.example.fixture', actions: { premium_summon: { id: 'premium_summon', category: 'summon', reversible: true, premiumSensitive: true } } };
  const session = { sessionId: 'safe-s', gameId: 'fixture-game', packageName: 'org.example.fixture', recentOutcomes: [], recentObservations: [] };
  const controller = {
    gameMode: { getProfile: async () => profile, store: { getSession: async () => session } },
    observe: async () => ({ foreground: { packageName: 'org.example.fixture' }, screenshot: { base64: '' } }),
    runSequence,
  };
  registerPhoneGameTools(server as any, controller as any, (async (_name: string, fn: () => Promise<unknown>) => fn()) as any,
    (async (_name: string, fn: () => Promise<unknown>) => fn()) as any, (() => ({})) as any);
  await expect(callbacks.get('phone_game_manage')!({
    action: 'workflow', gameId: 'fixture-game', sessionId: 'safe-s',
    semanticActionId: 'premium_summon', steps: [{ action: 'tap', x: 0.4, y: 0.5, normalized: true }], transport: 'adb',
  })).rejects.toThrow('GAME_MODE_HIGH_VALUE_ACTION_NOT_AUTHORIZED');
  expect(runSequence).not.toHaveBeenCalled();
});
