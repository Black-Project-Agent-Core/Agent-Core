import fs from 'node:fs';
import path from 'node:path';
import { assertCredentialBearingUrl } from '../net/endpoint-policy.js';
import { resolvePortableProjectPath } from '../portability/paths.js';

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
  /** Process-scoped Android state root, never the user's global SDK/ADB home. */
  homeDir?: string;
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
 * Resolve ADB without installing or relocating the user's Android toolchain.
 * Prefer explicit/project-owned paths, then historical sibling/standard SDK locations,
 * and finally PATH. All project-derived candidates stay drive-agnostic.
 */
function resolveAdbBinary(env: NodeJS.ProcessEnv, baseDir: string): string {
  const siblingAdb = path.resolve(baseDir, '..', 'Android-Agent-Bridge', 'tools', 'platform-tools', 'adb.exe');
  const projectAdb = path.resolve(baseDir, 'runtime', 'android', 'platform-tools', 'adb.exe');
  const sdkRootAdb = env.ANDROID_SDK_ROOT?.trim()
    ? path.resolve(env.ANDROID_SDK_ROOT.trim(), 'platform-tools', 'adb.exe')
    : undefined;
  const androidHomeAdb = env.ANDROID_HOME?.trim()
    ? path.resolve(env.ANDROID_HOME.trim(), 'platform-tools', 'adb.exe')
    : undefined;
  const localAppDataAdb = env.LOCALAPPDATA?.trim()
    ? path.resolve(env.LOCALAPPDATA.trim(), 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    : undefined;
  const resolved = firstExisting([
    env.AGENT_CORE_ADB_PATH?.trim() || undefined,
    projectAdb,
    siblingAdb,
    sdkRootAdb,
    androidHomeAdb,
    localAppDataAdb,
  ]);
  return resolved ?? 'adb';
}

export function loadPhoneConfig(env: NodeJS.ProcessEnv, baseDir: string): PhoneConfig {
  // Default to auto: prefer project-local/attached ADB for low-latency Game Mode
  // and fall back to the existing gateway when USB/Wi-Fi ADB is unavailable. Agent Core
  // remains the only controller; neither transport owns gameplay decisions independently.
  // Set "gateway" or "adb" only when an operator wants to force one transport.
  const configuredTransport = env.AGENT_CORE_PHONE_TRANSPORT;
  const rawMode = (configuredTransport ?? 'auto').trim().toLowerCase();
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
      homeDir: path.resolve(baseDir, 'runtime', 'android', 'home'),
    },
    display: {
      width: positiveInt(env.AGENT_CORE_PHONE_WIDTH, DEFAULT_DISPLAY.width),
      height: positiveInt(env.AGENT_CORE_PHONE_HEIGHT, DEFAULT_DISPLAY.height),
    },
    dataDir: resolvePortableProjectPath(baseDir, env.AGENT_CORE_PHONE_DATA_DIR, path.join('runtime', 'phone')),
  };
}
