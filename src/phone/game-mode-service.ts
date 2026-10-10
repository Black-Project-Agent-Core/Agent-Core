import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { classifyGameFrame, cropNormalizedRegion, templateSimilarity } from './game-perception.js';
import { GameModeStore } from './game-mode-store.js';
import type {
  GameAnchor,
  GameClassification,
  GameOutcome,
  GameProfile,
  GameRegion,
  GameSessionState,
} from './game-mode-types.js';

function clampRegion(region: GameRegion): GameRegion {
  const width = Math.max(0.005, Math.min(1, region.width));
  const height = Math.max(0.005, Math.min(1, region.height));
  return {
    x: Math.max(0, Math.min(1 - width, region.x)),
    y: Math.max(0, Math.min(1 - height, region.y)),
    width,
    height,
  };
}

export class GameModeService {
  readonly store: GameModeStore;

  constructor(private readonly dataDir: string) {
    this.store = new GameModeStore(dataDir);
  }
  async status() {
    const [profiles, sessions] = await Promise.all([
      this.store.listProfiles(),
      this.store.listSessions(),
    ]);
    return {
      status: 'available' as const,
      capability: 'game-mode',
      profiles,
      sessions,
      architecture: 'controller-independent; phone-control owned; Memory remains canonical',
      apiGuide: {
        inspect: ['status','profiles','profile','sessions','session','compare','observe','structured','frames'],
        manage: ['profile_upsert','session_start','session_update','outcome','anchor_capture','anchor_verify','frame_save','video_record','workflow'],
        profile: 'profile_upsert.profile={gameId,packageName,displayName?,version?,regions?:{name:{x,y,width,height}},stateRules?:[{state,conditions:[{region,metric,min?,max?}]}],actions?:{id:{id,category,reversible,cooldownMs?}}}',
        session: 'session_start={gameId,sessionId,objective?,controllerLabel?}; session_update={sessionId,patch:{party?,roster?,resources?,mode?,stage?,objective?,predictedEvents?},evidenceRef?}',
        workflow: 'workflow={gameId,sessionId,semanticActionId,expectedState?,expectedStateAfter?,steps:[phone_run_macro step format]}; max 12 steps, only known reversible actions',
        risk: 'Premium/currency, summons, economy, system and irreversible actions are not authorized by automated workflows.',
      },
    };
  }

  async getProfile(gameId: string) {
    return this.store.getProfile(gameId);
  }

  async putProfile(input: Omit<GameProfile, 'schemaVersion' | 'updatedAt'>) {
    const existing = await this.store.getProfile(input.gameId);
    const profile: GameProfile = {
      schemaVersion: 1,
      ...input,
      anchors: input.anchors ?? existing?.anchors ?? {},
      regions: input.regions ?? existing?.regions ?? {},
      stateRules: input.stateRules ?? existing?.stateRules ?? [],
      actions: input.actions ?? existing?.actions ?? {},
      resourceGuards: input.resourceGuards ?? existing?.resourceGuards ?? {},
      taskPolicies: input.taskPolicies ?? existing?.taskPolicies ?? {},
      updatedAt: new Date().toISOString(),
    };
    return this.store.putProfile(profile);
  }

  async startSession(input: {
    sessionId: string;
    gameId: string;
    packageName: string;
    gameVersion?: string;
    objective?: string;
    controllerLabel?: string;
  }): Promise<GameSessionState> {
    // A handoff must resume the same episode, never silently erase its history.
    if (await this.store.getSession(input.sessionId)) throw new Error('GAME_MODE_SESSION_ALREADY_EXISTS');
    const now = new Date().toISOString();
    return this.store.putSession({
      schemaVersion: 1,
      sessionId: input.sessionId,
      gameId: input.gameId,
      packageName: input.packageName,
      gameVersion: input.gameVersion,
      startedAt: now,
      updatedAt: now,
      objective: input.objective,
      controllerLabel: input.controllerLabel,
      recentObservations: [],
      recentOutcomes: [],
    });
  }
  async updateSession(
    sessionId: string,
    patch: Partial<Omit<GameSessionState, 'schemaVersion' | 'sessionId' | 'startedAt'>>,
  ): Promise<GameSessionState> {
    const current = await this.store.getSession(sessionId);
    if (!current) throw new Error('GAME_MODE_SESSION_NOT_FOUND');
    return this.store.putSession({
      ...current,
      ...patch,
      recentObservations: patch.recentObservations ?? current.recentObservations,
      recentOutcomes: patch.recentOutcomes ?? current.recentOutcomes,
    });
  }

  async compareSessions(gameId: string) {
    const ids = (await this.store.listSessions()).slice(-100);
    const sessions = (await Promise.all(ids.map(id => this.store.getSession(id))))
      .filter((item): item is GameSessionState => Boolean(item && item.gameId === gameId));
    return {
      gameId,
      evidenceClass: 'controller-reported game outcomes with optional references; not independently verified',
      sessions: sessions.map(state => {
        const battles = state.recentOutcomes.filter(item => item.scope === 'battle' && item.evidenceRef);
        const wins = battles.filter(item => item.kind === 'success').length;
        const losses = battles.filter(item => item.kind === 'failure').length;
        const played = wins + losses;
        const workflows = state.recentOutcomes.filter(item => item.scope === 'workflow');
        const workflowTimeMs = workflows.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);
        return {
          sessionId: state.sessionId,
          controllerLabel: state.controllerLabel ?? 'unattributed',
          objective: state.objective ?? null,
          gameVersion: state.gameVersion ?? null,
          mode: state.mode ?? null,
          stage: state.stage ?? null,
          party: state.party ?? null,
          comparabilityKey: [state.gameVersion ?? 'unknown', state.mode ?? 'unknown', state.stage ?? 'unknown'].join('|'),
          startedAt: state.startedAt,
          updatedAt: state.updatedAt,
          workflowCount: workflows.length,
          workflowTimeMs,
          wins, losses, played,
          winRate: played ? wins / played : null,
          outcomeEvidenceCount: battles.length,
          insufficientSample: played < 3,
        };
      }),
    };
  }

  async sessionSummary(sessionId: string) {
    const state = await this.store.getSession(sessionId);
    if (!state) throw new Error('GAME_MODE_SESSION_NOT_FOUND');
    const now = Date.now();
    const ageSeconds = Object.fromEntries(Object.entries(state.fieldObservations ?? {}).map(
      ([name, observation]) => [name, Math.max(0, Math.round((now - Date.parse(observation.at)) / 1000))],
    ));
    const nextEvent = (state.predictedEvents ?? [])
      .filter(event => Number.isFinite(Date.parse(event.at)) && Date.parse(event.at) > now)
      .sort((a,b) => Date.parse(a.at) - Date.parse(b.at))[0] ?? null;
    return { state, ageSeconds, nextEvent, provenance: 'operational-state, not canonical Memory' };
  }

  async recordProgress(sessionId: string, frameDigest: string, changed: boolean, expectedProgress: boolean) {
    const state = await this.store.getSession(sessionId);
    if (!state) throw new Error('GAME_MODE_SESSION_NOT_FOUND');
    const now = new Date().toISOString();
    const repeatedNoProgress = changed || !expectedProgress
      ? 0 : (state.progress?.repeatedNoProgress ?? 0) + 1;
    const progress = {
      lastFrameDigest: frameDigest,
      repeatedNoProgress,
      stuck: expectedProgress && repeatedNoProgress >= 3,
      lastChangeAt: changed ? now : state.progress?.lastChangeAt,
    };
    await this.updateSession(sessionId, { progress });
    return progress;
  }

  async recordOutcome(sessionId: string, outcome: GameOutcome): Promise<GameSessionState> {
    const current = await this.store.getSession(sessionId);
    if (!current) throw new Error('GAME_MODE_SESSION_NOT_FOUND');
    if (outcome.scope === 'battle' && outcome.evidenceRef && current.recentOutcomes.some(
      prior => prior.scope === 'battle' && prior.evidenceRef === outcome.evidenceRef,
    )) throw new Error('GAME_MODE_DUPLICATE_BATTLE_EVIDENCE');
    return this.store.putSession({
      ...current,
      recentOutcomes: [...current.recentOutcomes, outcome].slice(-40),
    });
  }

  async classify(gameId: string, image: Buffer): Promise<GameClassification> {
    const profile = await this.store.getProfile(gameId);
    if (!profile) throw new Error('GAME_MODE_PROFILE_NOT_FOUND');
    return classifyGameFrame(image, profile);
  }

  private framesDir(sessionId: string): string {
    return path.join(this.dataDir, 'sessions', 'frames', sessionId);
  }

  async rememberFrame(sessionId: string, image: Buffer, maxFrames = 12) {
    const directory = this.framesDir(sessionId);
    await mkdir(directory, { recursive: true });
    const stamp = Date.now();
    const destination = path.join(directory, String(stamp) + '-' + randomBytes(3).toString('hex') + '.jpg');
    const compact = await sharp(image, { failOn: 'none' })
      .resize({ width: 480, withoutEnlargement: true })
      .jpeg({ quality: 50 })
      .toBuffer();
    await writeOwnedFileAtomic(destination, compact);
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith('.jpg'))
      .map(entry => entry.name)
      .sort();
    const excess = Math.max(0, entries.length - Math.max(2, Math.min(30, maxFrames)));
    for (const name of entries.slice(0, excess)) {
      await rm(path.join(directory, name), { force: true });
    }
    return { frameRef: destination, bytes: compact.length, retained: entries.length - excess };
  }

  clipPath(sessionId: string): string {
    const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_');
    return path.join(this.dataDir, 'recordings', safe + '-' + Date.now() + '.mp4');
  }

  async recentFrames(sessionId: string) {
    const directory = this.framesDir(sessionId);
    try {
      const entries = (await readdir(directory, { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith('.jpg'))
        .map(entry => entry.name)
        .sort()
        .slice(-30);
      return entries.map(name => ({
        at: Number.parseInt(name.slice(0, -4), 10),
        ref: path.join(directory, name),
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async captureAnchor(gameId: string, anchorId: string, region: GameRegion, image: Buffer) {
    const profile = await this.store.getProfile(gameId);
    if (!profile) throw new Error('GAME_MODE_PROFILE_NOT_FOUND');
    const normalized = clampRegion(region);
    const crop = await cropNormalizedRegion(image, normalized);
    const stats = await sharp(crop).greyscale().stats();
    if ((stats.channels[0]?.stdev ?? 0) < 7) throw new Error('GAME_MODE_ANCHOR_LOW_INFORMATION');
    const filename = anchorId.replace(/[^A-Za-z0-9._-]/g, '_') + '.png';
    const destination = path.join(this.store.anchorsDir(gameId), filename);
    await writeOwnedFileAtomic(destination, crop);
    const anchor: GameAnchor = {
      id: anchorId,
      region: normalized,
      templateFile: 'anchors/' + filename,
      hits: 1,
      misses: 0,
      confidence: 1,
      lastVerifiedAt: new Date().toISOString(),
      gameVersion: profile.version,
    };
    profile.anchors[anchorId] = anchor;
    await this.store.putProfile(profile);
    return anchor;
  }

  async verifyAnchor(gameId: string, anchorId: string, image: Buffer) {
    const profile = await this.store.getProfile(gameId);
    if (!profile) throw new Error('GAME_MODE_PROFILE_NOT_FOUND');
    const anchor = profile.anchors[anchorId];
    if (!anchor?.templateFile) throw new Error('GAME_MODE_ANCHOR_NOT_FOUND');
    if (anchor.gameVersion && profile.version && anchor.gameVersion !== profile.version) {
      throw new Error('GAME_MODE_ANCHOR_PATCH_STALE');
    }
    // Resolve from our owned anchors directory, never from an untrusted stored absolute path.
    const safeName = anchorId.replace(/[^A-Za-z0-9._-]/g, '_') + '.png';
    const template = await readFile(path.join(this.store.anchorsDir(gameId), safeName));
    const offsets = [-0.015, 0, 0.015];
    // Do not drift a trusted anchor in response to insignificant similarity jitter.
    // A neighbor must be materially better than the currently stored position.
    const centerCrop = await cropNormalizedRegion(image, anchor.region);
    const centerSimilarity = await templateSimilarity(template, centerCrop);
    let bestSimilarity = centerSimilarity;
    let bestRegion = anchor.region;

    for (const dx of offsets) {
      for (const dy of offsets) {
        if (dx === 0 && dy === 0) continue;
        const candidate = clampRegion({ ...anchor.region, x: anchor.region.x + dx, y: anchor.region.y + dy });
        const crop = await cropNormalizedRegion(image, candidate);
        const similarity = await templateSimilarity(template, crop);
        if (similarity > bestSimilarity + 0.02) {
          bestSimilarity = similarity;
          bestRegion = candidate;
        }
      }
    }
    const similarity = bestSimilarity;
    const matched = similarity >= 0.82;
    anchor.region = matched ? bestRegion : anchor.region;
    anchor.hits += matched ? 1 : 0;
    anchor.misses += matched ? 0 : 1;
    anchor.confidence = anchor.hits / Math.max(1, anchor.hits + anchor.misses);
    if (matched) anchor.lastVerifiedAt = new Date().toISOString();
    profile.anchors[anchorId] = anchor;
    await this.store.putProfile(profile);
    return {
      matched,
      similarity,
      region: anchor.region,
      hits: anchor.hits,
      misses: anchor.misses,
      confidence: anchor.confidence,
    };
  }
}
