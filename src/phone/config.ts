import fs from 'node:fs';
import path from 'node:path';
import { assertCredentialBearingUrl } from '../net/endpoint-policy.js';

export type PhoneTransportMode = 'auto' | 'gateway' | 'adb';

export interface PhoneGatewayConfig {
  /** Full Streamable-HTTP MCP endpoint of the Cloudflare gateway, e.g. https://host/mcp */
  url: string;
  /** Optional bearer token when the gateway sets MCP_SHARED_SECRET. */
  token: string | null;
}

export interface PhoneAdbConfig {
  /** Resolved adb executable path, or bare "adb" to use PATH. */
  binaryPath: string;
  /** Specific device serial to target, or null to use the single attached device. */
  serial: string | null;
}

export interface PhoneDisplayConfig {
  width: number;
  height: number;
}

export interface PhoneConfig {
  enabled: boolean;
  mode: PhoneTransportMode;
  deviceId: string;
  gateway: PhoneGatewayConfig;
  adb: PhoneAdbConfig;
  display: PhoneDisplayConfig;
  /** Directory for the local named-action store used by the ADB transport. */
  dataDir: string;
}

const DEFAULT_GATEWAY_URL = 'https://android-agent-bridge.joefreccejunior50-d7b.workers.dev/mcp';
const DEFAULT_DEVICE_ID = 'nubia-z2465n-main';
const DEFAULT_DISPLAY: PhoneDisplayConfig = { width: 1080, height: 2392 };

const bool = (value: string | undefined, fallback: boolean): boolean => value === undefined
  ? fallback
  : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

function firstExisting(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore inaccessible candidates and continue probing
    }
  }
  return null;
}

/**
 * Resolve the adb binary without changing the user's tool layout. Order:
 * explicit env override -> the sibling Android-Agent-Bridge platform-tools -> PATH.
 * The sibling path is derived from the Agent Core root so it stays drive-agnostic.
 */
function resolveAdbBinary(env: NodeJS.ProcessEnv, baseDir: string): string {
  const siblingAdb = path.resolve(baseDir, '..', 'Android-Agent-Bridge', 'tools', 'platform-tools', 'adb.exe');
  const resolved = firstExisting([
    env.AGENT_CORE_ADB_PATH?.trim() || undefined,
    siblingAdb,
  ]);
  return resolved ?? 'adb';
}

export function loadPhoneConfig(env: NodeJS.ProcessEnv, baseDir: string): PhoneConfig {
  // Default to the online gateway: control the phone over the internet through the
  // Cloudflare relay + on-device app — no ADB, no same-Wi-Fi requirement. Agent Core
  // is still the only controller (AI -> Agent Core -> relay -> phone); the relay is a
  // dumb pipe, so if Agent Core dies, no commands flow and Game Mode goes off.
  // Set "adb" for a local USB/Wi-Fi path, or "auto" to prefer local then fall back online.
  const configuredTransport = env.AGENT_CORE_PHONE_TRANSPORT;
  const rawMode = (configuredTransport ?? 'gateway').trim().toLowerCase();
  if (configuredTransport !== undefined && !['gateway', 'adb', 'auto'].includes(rawMode)) {
    throw new Error('AGENT_CORE_PHONE_TRANSPORT_INVALID');
  }
  const mode = rawMode as PhoneTransportMode;
  const gatewayUrl = env.AGENT_CORE_PHONE_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL;
  const gatewayToken = env.AGENT_CORE_PHONE_GATEWAY_TOKEN?.trim() || null;
  if (gatewayToken) assertCredentialBearingUrl(gatewayUrl, 'AGENT_CORE_PHONE_GATEWAY_URL');
  return {
    enabled: bool(env.AGENT_CORE_PHONE_ENABLED, true),
    mode,
    deviceId: env.AGENT_CORE_PHONE_DEVICE_ID?.trim() || DEFAULT_DEVICE_ID,
    gateway: {
      url: gatewayUrl,
      token: gatewayToken,
    },
    adb: {
      binaryPath: resolveAdbBinary(env, baseDir),
      serial: env.AGENT_CORE_ADB_SERIAL?.trim() || null,
    },
    display: {
      width: positiveInt(env.AGENT_CORE_PHONE_WIDTH, DEFAULT_DISPLAY.width),
      height: positiveInt(env.AGENT_CORE_PHONE_HEIGHT, DEFAULT_DISPLAY.height),
    },
    dataDir: path.resolve(env.AGENT_CORE_PHONE_DATA_DIR?.trim() || path.join(baseDir, 'runtime', 'phone')),
  };
}
