import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { McpServer } from '@modelcontextprotocol/server';
import type { PhoneController } from '../phone/controller.js';
import { assessGameFrameProgress, cropNormalizedRegion } from '../phone/game-perception.js';
import type { GameProfile, GameSessionState } from '../phone/game-mode-types.js';
import type { PhoneSequenceStep, PhoneObservation } from '../phone/types.js';
import * as schemas from './phone-game-schemas.js';
import { jsonTextResult as compactText } from './text-result.js';

type RunText = (name: string, action: () => Promise<unknown>) => Promise<any>;
type RunResult = (name: string, action: () => Promise<any>) => Promise<any>;
type ObserveResult = (observation: PhoneObservation, extra?: Record<string, unknown>) => any;

function required<T>(value: T | null | undefined, name: string): T {
  if (value == null || value === '') throw new Error('GAME_MODE_' + name.toUpperCase() + '_REQUIRED');
  return value;
}
function sha(bytes: Buffer): string {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}

export function registerPhoneGameTools(
  server: McpServer,
  controller: PhoneController,
  run: RunText,
  runResult: RunResult,
  observationResult: ObserveResult,
): void {
  server.registerTool('phone_game_inspect', {
    title: 'Inspect Game Mode',
    description: 'Read game state, profiles, screen regions and comparisons.',
    inputSchema: schemas.phoneGameInspect.shape,
    annotations: { title: 'Inspect Game Mode', readOnlyHint: true, openWorldHint: false },
  }, async (args: any) => runResult('phone_game_inspect', async () => {
    const input = schemas.phoneGameInspect.parse(args);
    const game = controller.gameMode;
    if (input.action === 'status') {
      const phone = await controller.status();
      return compactText({
        phone, game: await game.status(),
        transportGuidance: phone.adb.online
          ? { preferred: 'adb', reason: 'USB ADB supplies OS-verified foreground for guarded game navigation; companion gateway may report its own package rather than the game.' }
          : { preferred: 'gateway', limitation: 'Gateway foreground metadata is companion-reported; guarded actions fail closed unless the expected game package is confirmed.' },
      });
    }
    if (input.action === 'profiles') return compactText({ profiles: await game.store.listProfiles() });
    if (input.action === 'sessions') return compactText({ sessions: await game.store.listSessions() });
    if (input.action === 'compare') return compactText(await game.compareSessions(required(input.gameId, 'gameId')));
    if (input.action === 'profile') return compactText({ profile: await game.getProfile(required(input.gameId, 'gameId')) });
    if (input.action === 'session') return compactText(await game.sessionSummary(required(input.sessionId, 'sessionId')));
    if (input.action === 'frames') return compactText({ frames: await game.recentFrames(required(input.sessionId, 'sessionId')) });
    if (input.action === 'structured') {
      const profile = await game.getProfile(required(input.gameId, 'gameId'));
      if (!profile) throw new Error('GAME_MODE_PROFILE_NOT_FOUND');
      const transport = await controller.resolve(input.transport);
      const foreground = await transport.foregroundApp();
      if (foreground.packageName !== profile.packageName) {
        return compactText({ available: false, reason: 'game-not-foreground', foreground, expectedPackage: profile.packageName });
      }
      return compactText(await controller.structuredContext(profile.packageName, input.transport));
    }

    const session = input.sessionId ? await game.store.getSession(input.sessionId) : null;
    const gameId = required(input.gameId ?? session?.gameId, 'gameId');
    const profile = await game.getProfile(gameId);
    if (!profile) throw new Error('GAME_MODE_PROFILE_NOT_FOUND');
    const observation = await controller.observe({ maxWidth: 0, format: 'png' }, input.transport);
    if (observation.foreground.packageName !== profile.packageName) {
      return compactText({ state: 'game-not-foreground', expectedPackage: profile.packageName, foreground: observation.foreground });
    }
    const source = Buffer.from(observation.screenshot.base64, 'base64');
    const classification = await game.classify(gameId, source);
    const names = input.regions ?? [];
    const imageBlocks: Array<Record<string, unknown>> = [];
    const regionEvidence: Array<Record<string, unknown>> = [];
    if (!names.length || input.includeFullImage) {
      const full = await sharp(source, { failOn: 'none' })
        .resize({ width: input.imageMaxWidth ?? 960, withoutEnlargement: true })
        .jpeg({ quality: 65 }).toBuffer();
      imageBlocks.push({ type: 'image', data: full.toString('base64'), mimeType: 'image/jpeg' });
      regionEvidence.push({ name: 'full-screen', bytes: full.length });
    }
    for (const name of names) {
      const region = profile.regions[name];
      if (!region) throw new Error('GAME_MODE_REGION_NOT_FOUND:' + name);
      const crop = await cropNormalizedRegion(source, region);
      const encoded = await sharp(crop, { failOn: 'none' })
        .resize({ width: Math.min(input.imageMaxWidth ?? 720, 960), withoutEnlargement: true })
        .jpeg({ quality: 75 }).toBuffer();
      imageBlocks.push({ type: 'image', data: encoded.toString('base64'), mimeType: 'image/jpeg' });
      regionEvidence.push({ name, region, bytes: encoded.length, digest: sha(encoded) });
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          gameId, sessionId: input.sessionId ?? null,
          foreground: observation.foreground,
          device: { width: observation.screenshot.deviceWidth, height: observation.screenshot.deviceHeight },
          sourceDigest: sha(source),
          classification,
          regionEvidence,
          hint: 'Classifications are profile-rule observations, not proof of battle success; crops use normalized full-screen coordinates.',
        }, null, 2),
      }, ...imageBlocks],
    };
  }));

  server.registerTool('phone_game_manage', {
    title: 'Manage Game Mode',
    description: 'Update game state, anchors, evidence, or execute guarded workflows.',
    inputSchema: schemas.phoneGameManage.shape,
    annotations: { title: 'Manage Game Mode', readOnlyHint: false, openWorldHint: false },
  }, async (args: any) => run('phone_game_manage', async () => {
    const input = schemas.phoneGameManage.parse(args);
    const game = controller.gameMode;
    if (input.action === 'profile_upsert') {
      const incoming = schemas.parseGameProfile(required(input.profile, 'profile'));
      const previous = await game.getProfile(incoming.gameId);
      return game.putProfile({
        gameId: incoming.gameId,
        displayName: incoming.displayName ?? previous?.displayName,
        packageName: incoming.packageName,
        version: incoming.version ?? previous?.version,
        regions: incoming.regions ?? previous?.regions ?? {},
        stateRules: incoming.stateRules ?? previous?.stateRules ?? [],
        actions: incoming.actions ?? previous?.actions ?? {},
        anchors: previous?.anchors ?? {},
        resourceGuards: previous?.resourceGuards ?? {},
        taskPolicies: previous?.taskPolicies ?? {},
      });
    }
    if (input.action === 'session_start') {
      const gameId = required(input.gameId, 'gameId');
      const profile = await game.getProfile(gameId);
      if (!profile) throw new Error('GAME_MODE_PROFILE_NOT_FOUND');
      if (input.packageName && input.packageName !== profile.packageName) throw new Error('GAME_MODE_PACKAGE_MISMATCH');
      return game.startSession({
        sessionId: required(input.sessionId, 'sessionId'),
        gameId,
        packageName: profile.packageName,
        gameVersion: profile.version,
        objective: input.objective,
        controllerLabel: input.controllerLabel,
      });
    }
    if (input.action === 'session_update') {
      const sessionId = required(input.sessionId, 'sessionId');
      const current = await game.store.getSession(sessionId);
      if (!current) throw new Error('GAME_MODE_SESSION_NOT_FOUND');
      const patch = schemas.parseSessionPatch(required(input.patch, 'patch'));
      const at = new Date().toISOString();
      const observed = { ...current.fieldObservations };
      for (const key of Object.keys(patch)) {
        observed[key] = { at, ...(input.evidenceRef ? { evidenceRef: input.evidenceRef } : {}) };
      }
      return game.updateSession(sessionId, { ...patch, fieldObservations: observed });
    }
    if (input.action === 'outcome') {
      const outcome = schemas.parseOutcome(required(input.outcome, 'outcome'));
      if (outcome.scope === 'battle' && !outcome.evidenceRef) {
        throw new Error('GAME_MODE_BATTLE_EVIDENCE_REQUIRED');
      }
      return game.recordOutcome(required(input.sessionId, 'sessionId'), {
        ...outcome, at: new Date().toISOString(),
      });
    }

    const sessionId = input.sessionId;
    const session = sessionId ? await game.store.getSession(sessionId) : null;
    const gameId = required(input.gameId ?? session?.gameId, 'gameId');
    const profile = await game.getProfile(gameId);
    if (!profile) throw new Error('GAME_MODE_PROFILE_NOT_FOUND');
    const observation = await controller.observe({ maxWidth: 0, format: 'png' }, input.transport);
    if (observation.foreground.packageName !== profile.packageName) {
      throw new Error('GAME_MODE_APP_GUARD_MISMATCH:expected=' + profile.packageName
        + ':actual=' + (observation.foreground.packageName ?? 'unknown'));
    }
    const before = Buffer.from(observation.screenshot.base64, 'base64');
    if (input.action === 'anchor_capture') {
      if (input.verified !== true) throw new Error('GAME_MODE_ANCHOR_VERIFICATION_REQUIRED');
      return game.captureAnchor(gameId, required(input.anchorId, 'anchorId'), required(input.region, 'region'), before);
    }
    if (input.action === 'anchor_verify') {
      return game.verifyAnchor(gameId, required(input.anchorId, 'anchorId'), before);
    }
    if (input.action === 'frame_save') {
      return game.rememberFrame(required(sessionId, 'sessionId'), before);
    }
    if (input.action === 'video_record') {
      const destination = game.clipPath(required(sessionId, 'sessionId'));
      await mkdir(path.dirname(destination), { recursive: true });
      return controller.recordScreen(input.durationSeconds ?? 15, destination, input.transport);
    }
    if (input.action !== 'workflow') throw new Error('GAME_MODE_ACTION_INVALID');
    const state = required(session, 'existing_session');
    if (state.gameId !== gameId || state.packageName !== profile.packageName) {
      throw new Error('GAME_MODE_SESSION_PROFILE_MISMATCH');
    }
    // A game workflow must declare a known, reversible semantic action before any taps.
    if (!input.semanticActionId) throw new Error('GAME_MODE_SEMANTIC_ACTION_REQUIRED');
    const semantic = profile.actions[input.semanticActionId];
    if (!semantic) throw new Error('GAME_MODE_SEMANTIC_ACTION_NOT_FOUND');
    if (semantic.reversible !== true) throw new Error('GAME_MODE_REVERSIBILITY_NOT_CONFIRMED');
    if (semantic.premiumSensitive ||
      ['premium','summon','system','economy'].includes(semantic.category)
    ) throw new Error('GAME_MODE_HIGH_VALUE_ACTION_NOT_AUTHORIZED');
    const cooldownUntil = input.semanticActionId ? state.actionCooldowns?.[input.semanticActionId] : undefined;
    if (cooldownUntil && Date.now() < Date.parse(cooldownUntil)) {
      throw new Error('GAME_MODE_ACTION_COOLDOWN_ACTIVE');
    }
    const classificationBefore = await game.classify(gameId, before);
    if (input.expectedState && classificationBefore.state !== input.expectedState) {
      throw new Error('GAME_MODE_PRECONDITION_FAILED:observed=' + (classificationBefore.state ?? 'ambiguous'));
    }
    const steps = schemas.parseGameSteps(required(input.steps, 'steps')) as PhoneSequenceStep[];
    if (steps.length > 12) throw new Error('GAME_MODE_WORKFLOW_STEP_LIMIT');
    if (steps.some(step => ['launchApp', 'home', 'inputText', 'key'].includes(step.action))) {
      throw new Error('GAME_MODE_WORKFLOW_ACTION_UNSAFE');
    }
    const started = Date.now();
    let result: Record<string, unknown>;
    try {
      result = await controller.runSequence(steps, input.transport, profile.packageName);
    } catch (error) {
      await game.recordOutcome(state.sessionId, {
        at: new Date().toISOString(), kind: 'failure',
        summary: 'Workflow interrupted: ' + (error instanceof Error ? error.message : String(error)).slice(0, 500),
        evidenceRef: sha(before),
      });
      throw error;
    }
    // A screenshot immediately after a tap can still contain the prior frame.
    // Poll read-only observations against the pre-action frame for a bounded time.
    const postActionStarted = Date.now();
    const expectsVisualChange = steps.some(step =>
      ['tap', 'swipe', 'longPress', 'namedAction', 'back'].includes(step.action));
    let afterObservation = await controller.observe({ maxWidth: 0, format: 'png' }, input.transport);
    let after = Buffer.from(afterObservation.screenshot.base64, 'base64');
    let classificationAfter = await game.classify(gameId, after);
    let frameChange = await assessGameFrameProgress(before, after, profile);
    let observationSamples = 1;
    while (afterObservation.foreground.packageName === profile.packageName
      && Date.now() - postActionStarted < 3_500
      && (input.expectedStateAfter
        ? classificationAfter.state !== input.expectedStateAfter
        : expectsVisualChange && !frameChange.changed)) {
      await new Promise(resolve => setTimeout(resolve, 250));
      afterObservation = await controller.observe({ maxWidth: 0, format: 'png' }, input.transport);
      after = Buffer.from(afterObservation.screenshot.base64, 'base64');
      classificationAfter = await game.classify(gameId, after);
      frameChange = await assessGameFrameProgress(before, after, profile);
      observationSamples += 1;
    }
    const matchedPackage = afterObservation.foreground.packageName === profile.packageName;
    const expectedReached = input.expectedStateAfter
      ? classificationAfter.state === input.expectedStateAfter
      : null;
    const verified = matchedPackage && expectedReached === true;
    const at = new Date().toISOString();
    const evidence = await game.rememberFrame(state.sessionId, after);
    const visualDelta = frameChange.globalDifference;
    const progress = await game.recordProgress(
      state.sessionId, sha(after), frameChange.changed,
      steps.some(step => ['tap','swipe','longPress','namedAction'].includes(step.action)),
    );
    await game.updateSession(state.sessionId, {
      currentState: classificationAfter.state ?? 'unknown',
      stateConfidence: classificationAfter.confidence,
      actionCooldowns: semantic && input.semanticActionId && semantic.cooldownMs
        ? { ...state.actionCooldowns, [input.semanticActionId]: new Date(Date.now() + semantic.cooldownMs).toISOString() }
        : state.actionCooldowns,
      fieldObservations: {
        ...state.fieldObservations,
        currentState: { at, confidence: classificationAfter.confidence, evidenceRef: evidence.frameRef },
      },
      recentObservations: [...state.recentObservations, {
        at, state: classificationAfter.state ?? undefined,
        confidence: classificationAfter.confidence,
        foregroundPackage: afterObservation.foreground.packageName,
        evidenceRef: evidence.frameRef,
      }],
    });
    await game.recordOutcome(state.sessionId, {
      at,
      kind: expectedReached === true ? 'success' : expectedReached === false || !matchedPackage ? 'failure' : 'neutral',
      summary: 'Action sequence executed; expected-screen ' + String(expectedReached)
        + '; foreground-match ' + String(matchedPackage)
        + '; this is not a claim about stage victory.',
      evidenceRef: evidence.frameRef,
    });
    if (!matchedPackage || expectedReached === false) {
      throw new Error('GAME_MODE_POSTCONDITION_FAILED:observed=' + (classificationAfter.state ?? 'ambiguous'));
    }
    return {
      action: 'workflow', sessionId: state.sessionId, gameId,
      verified, verificationScope: verified ? 'expected-screen-state-only' : 'not-requested',
      before: classificationBefore, after: classificationAfter,
      evidence, progress, visualDelta, regionDeltas: frameChange.regionDifferences,
      postAction: { observationSamples, waitedMs: Date.now() - postActionStarted, visualChangeObserved: frameChange.changed },
      execution: result, durationMs: Date.now() - started,
    };
  }));
}
