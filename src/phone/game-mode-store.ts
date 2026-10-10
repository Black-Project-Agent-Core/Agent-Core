import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import type { GameProfile, GameSessionState } from './game-mode-types.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!SAFE_ID.test(trimmed)) throw new Error(`GAME_MODE_INVALID_${label.toUpperCase()}`);
  return trimmed;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export class GameModeStore {
  readonly gamesDir: string;
  readonly sessionsDir: string;

  constructor(private readonly dataDir: string) {
    this.gamesDir = path.join(dataDir, 'games');
    this.sessionsDir = path.join(dataDir, 'sessions');
  }
  profilePath(gameId: string): string {
    return path.join(this.gamesDir, assertId(gameId, 'game_id'), 'profile.json');
  }

  anchorsDir(gameId: string): string {
    return path.join(this.gamesDir, assertId(gameId, 'game_id'), 'anchors');
  }

  sessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, assertId(sessionId, 'session_id') + '.json');
  }

  async getProfile(gameId: string): Promise<GameProfile | null> {
    return readJson<GameProfile>(this.profilePath(gameId));
  }

  async putProfile(profile: GameProfile): Promise<GameProfile> {
    const now = new Date().toISOString();
    const normalized: GameProfile = {
      ...profile,
      schemaVersion: 1,
      gameId: assertId(profile.gameId, 'game_id'),
      updatedAt: now,
    };
    await writeOwnedFileAtomic(
      this.profilePath(normalized.gameId),
      JSON.stringify(normalized, null, 2) + '\n',
    );
    return normalized;
  }

  async listProfiles(): Promise<string[]> {
    try {
      const entries = await readdir(this.gamesDir, { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  async getSession(sessionId: string): Promise<GameSessionState | null> {
    return readJson<GameSessionState>(this.sessionPath(sessionId));
  }

  async putSession(session: GameSessionState): Promise<GameSessionState> {
    const normalized: GameSessionState = {
      ...session,
      schemaVersion: 1,
      sessionId: assertId(session.sessionId, 'session_id'),
      gameId: assertId(session.gameId, 'game_id'),
      updatedAt: new Date().toISOString(),
      recentObservations: session.recentObservations.slice(-40),
      recentOutcomes: session.recentOutcomes.slice(-40),
      predictedEvents: session.predictedEvents?.slice(-40),
      actionCooldowns: session.actionCooldowns ? Object.fromEntries(Object.entries(session.actionCooldowns).slice(-80)) : undefined,
      fieldObservations: session.fieldObservations ? Object.fromEntries(Object.entries(session.fieldObservations).slice(-80)) : undefined,
    };
    await writeOwnedFileAtomic(
      this.sessionPath(normalized.sessionId),
      JSON.stringify(normalized, null, 2) + '\n',
    );
    return normalized;
  }

  async listSessions(): Promise<string[]> {
    try {
      const entries = await readdir(this.sessionsDir, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => entry.name.slice(0, -5))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
