/**
 * Feature flags and bounds for the optional Memory cognitive upgrades.
 *
 * Every upgrade is a composable extension over the existing Memory owners and is
 * disabled unless explicitly enabled. Disabling a flag restores the previous
 * behavior without touching the canonical store format (rollback path).
 */

export const COGNITIVE_FEATURES = [
  'adaptiveFusion',
  'contradictionResolution',
  'remConsolidation',
  'epistemicConfidence',
  'forgettingCurve',
  'tiering',
  'multiHop',
  'selfRepair',
  'secretMasking',
] as const;

export type CognitiveFeature = (typeof COGNITIVE_FEATURES)[number];

/** Host environment variable: `all`, `none` or a comma separated feature list. */
export const COGNITIVE_ENV_FLAG = 'AGENT_CORE_MEMORY_COGNITIVE';

export interface MemoryCognitiveOptions {
  features?: Partial<Record<CognitiveFeature, boolean>>;
  /** Graph traversal depth when `multiHop` is enabled; clamped to 1..3. */
  maxHops?: number;
  tier?: { l1WindowMs?: number; l2WindowMs?: number };
  rem?: { intervalMs?: number; windowMs?: number; minClusterSize?: number; maxClusterSize?: number };
  contradiction?: { confidenceMargin?: number; recencyGapMs?: number };
}

export interface MemoryCognitiveConfig {
  readonly features: Readonly<Record<CognitiveFeature, boolean>>;
  readonly maxHops: number;
  readonly tier: Readonly<{ l1WindowMs: number; l2WindowMs: number }>;
  readonly rem: Readonly<{ intervalMs: number; windowMs: number; minClusterSize: number; maxClusterSize: number }>;
  readonly contradiction: Readonly<{ confidenceMargin: number; recencyGapMs: number }>;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  return Math.round(bounded(value, fallback, min, max));
}

export function resolveMemoryCognitiveConfig(options: MemoryCognitiveOptions = {}): MemoryCognitiveConfig {
  const features = Object.fromEntries(
    COGNITIVE_FEATURES.map((feature) => [feature, options.features?.[feature] === true]),
  ) as Record<CognitiveFeature, boolean>;
  const l1WindowMs = bounded(options.tier?.l1WindowMs, 6 * HOUR_MS, HOUR_MS / 4, 7 * DAY_MS);
  const l2WindowMs = bounded(options.tier?.l2WindowMs, 30 * DAY_MS, l1WindowMs, 365 * DAY_MS);
  const minClusterSize = boundedInt(options.rem?.minClusterSize, 3, 2, 12);
  return Object.freeze({
    features: Object.freeze(features),
    maxHops: boundedInt(options.maxHops, 2, 1, 3),
    tier: Object.freeze({ l1WindowMs, l2WindowMs }),
    rem: Object.freeze({
      intervalMs: bounded(options.rem?.intervalMs, 30 * 60 * 1000, 60 * 1000, DAY_MS),
      windowMs: bounded(options.rem?.windowMs, 14 * DAY_MS, DAY_MS, 365 * DAY_MS),
      minClusterSize,
      maxClusterSize: boundedInt(options.rem?.maxClusterSize, 12, minClusterSize, 24),
    }),
    contradiction: Object.freeze({
      confidenceMargin: bounded(options.contradiction?.confidenceMargin, 0.15, 0.05, 0.9),
      recencyGapMs: bounded(options.contradiction?.recencyGapMs, 7 * DAY_MS, DAY_MS, 365 * DAY_MS),
    }),
  });
}

/** Host parsing is fail-soft: an unknown name is reported and ignored, never fatal for activation. */
export function cognitiveOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): { options: MemoryCognitiveOptions; unknown: string[] } {
  const raw = (env[COGNITIVE_ENV_FLAG] ?? '').trim();
  const features: Partial<Record<CognitiveFeature, boolean>> = {};
  const unknown: string[] = [];
  if (raw.toLowerCase() === 'all') {
    for (const feature of COGNITIVE_FEATURES) features[feature] = true;
  } else if (raw && raw.toLowerCase() !== 'none') {
    const known = new Map(COGNITIVE_FEATURES.map((feature) => [feature.toLowerCase(), feature]));
    for (const part of raw.split(',')) {
      const name = part.trim();
      if (!name) continue;
      const feature = known.get(name.toLowerCase());
      if (feature) features[feature] = true;
      else unknown.push(name);
    }
  }
  return { options: { features }, unknown };
}

export function enabledCognitiveFeatures(config: MemoryCognitiveConfig): CognitiveFeature[] {
  return COGNITIVE_FEATURES.filter((feature) => config.features[feature]);
}
