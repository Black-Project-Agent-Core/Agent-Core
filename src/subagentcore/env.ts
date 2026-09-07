import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ProviderKeySlot, SubAgentCoreConfig, SubAgentCoreProviderConfig, SubAgentCoreProviderId, WorkerProviderBinding, SubAgentCoreWorker } from './types.js';

type Env = Record<string, string | undefined>;

const PROVIDERS: Record<SubAgentCoreProviderId, { baseUrl: string }> = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1' },
  nvidia: { baseUrl: 'https://integrate.api.nvidia.com/v1' },
  openhands: { baseUrl: 'https://app.all-hands.dev/api/v1' },
};

function parseDotEnv(text: string): Env {
  const env: Env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

function fileEnv(projectRoot: string): Env {
  try { return parseDotEnv(readFileSync(path.join(projectRoot, '.env'), 'utf8')); } catch { return {}; }
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid SubAgentCore boolean: ${value}`);
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseBaseUrl(value: string | undefined, fallback: string, name: string): string {
  const raw = value?.trim() || fallback;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error(`${name} must be a valid URL`); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(`${name} must use http or https`);
  if (parsed.username || parsed.password) throw new Error(`${name} must not contain credentials`);
  return raw.replace(/\/+$/g, '');
}

function providerConfig(id: SubAgentCoreProviderId, env: Env): SubAgentCoreProviderConfig {
  const prefix = `SUBAGENTCORE_${id.toUpperCase()}`;
  const slots: ProviderKeySlot[] = [];
  const pattern = new RegExp(`^${prefix}_API_KEY_(\\d+)$`);
  for (const [name, raw] of Object.entries(env)) {
    const match = pattern.exec(name);
    const value = raw?.trim();
    if (!match || !value) continue;
    const index = Number.parseInt(match[1]!, 10);
    if (!Number.isSafeInteger(index) || index < 1) continue;
    slots.push({ index, envName: name, value });
  }
  slots.sort((left, right) => left.index - right.index);
  return {
    id,
    baseUrl: parseBaseUrl(env[`${prefix}_BASE_URL`], PROVIDERS[id].baseUrl, `${prefix}_BASE_URL`),
    defaultModel: env[`${prefix}_DEFAULT_MODEL`]?.trim() || null,
    keySlots: slots,
  };
}

function providerId(value: string | undefined, fallback: SubAgentCoreProviderId): SubAgentCoreProviderId {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'openrouter' || normalized === 'nvidia' || normalized === 'openhands') return normalized;
  throw new Error(`Unsupported SubAgentCore provider: ${value}`);
}

function binding(env: Env, worker: SubAgentCoreWorker['id'], fallbackProvider: SubAgentCoreProviderId): WorkerProviderBinding {
  const prefix = `SUBAGENTCORE_${worker.toUpperCase()}`;
  const provider = providerId(env[`${prefix}_PROVIDER`], fallbackProvider);
  const slotRaw = env[`${prefix}_KEY_SLOT`]?.trim().toLowerCase();
  let keySlot: 'auto' | number = 'auto';
  if (slotRaw && slotRaw !== 'auto') {
    const parsed = Number.parseInt(slotRaw, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${prefix}_KEY_SLOT must be auto or a positive integer`);
    keySlot = parsed;
  }
  return { provider, model: env[`${prefix}_MODEL`]?.trim() || null, keySlot };
}

export function loadSubAgentCoreConfig(env: Env = process.env, projectRoot = process.cwd()): SubAgentCoreConfig {
  const merged = { ...fileEnv(projectRoot), ...env };
  return {
    enabled: bool(merged.SUBAGENTCORE_ENABLED, true),
    sharedMemoryRequired: true,
    requestTimeoutMs: positiveInt(merged.SUBAGENTCORE_REQUEST_TIMEOUT_MS, 180_000, 'SUBAGENTCORE_REQUEST_TIMEOUT_MS'),
    providers: {
      openrouter: providerConfig('openrouter', merged),
      nvidia: providerConfig('nvidia', merged),
      openhands: providerConfig('openhands', merged),
    },
    workers: {
      astra: binding(merged, 'astra', 'openrouter'),
      forge: binding(merged, 'forge', 'openhands'),
      sentinel: binding(merged, 'sentinel', 'nvidia'),
      scribe: binding(merged, 'scribe', 'openrouter'),
    },
  };
}
