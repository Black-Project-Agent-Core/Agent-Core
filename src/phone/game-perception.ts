import sharp from 'sharp';
import { screenDifference } from './image.js';
import type {
  GameClassification,
  GameProfile,
  GameRegion,
  GameRegionMetrics,
  GameMetricName,
} from './game-mode-types.js';

function resolveRegion(region: GameRegion, width: number, height: number) {
  const left = Math.max(0, Math.min(width - 1, Math.round(region.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(region.y * height)));
  const right = Math.max(left + 1, Math.min(width, Math.round((region.x + region.width) * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.round((region.y + region.height) * height)));
  return { left, top, width: right - left, height: bottom - top };
}

export async function cropNormalizedRegion(
  input: Buffer,
  region: GameRegion,
): Promise<Buffer> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('GAME_MODE_IMAGE_DIMENSIONS_UNAVAILABLE');
  return sharp(input, { failOn: 'none' })
    .extract(resolveRegion(region, width, height))
    .png()
    .toBuffer();
}
export async function measureRegion(
  input: Buffer,
  name: string,
  region: GameRegion,
): Promise<GameRegionMetrics> {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('GAME_MODE_IMAGE_DIMENSIONS_UNAVAILABLE');
  // Cheap local pixel features derived from 64x64 samples; no LLM/OCR dependency.
  const { data, info } = await sharp(input, { failOn: 'none' })
    .extract(resolveRegion(region, width, height))
    .resize(64, 64, { fit: 'fill' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const count = Math.max(1, info.width * info.height);
  let red = 0, green = 0, blue = 0, luminance = 0, squares = 0, dark = 0;
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] ?? 0;
    const g = data[i + (channels > 1 ? 1 : 0)] ?? r;
    const b = data[i + (channels > 2 ? 2 : 0)] ?? r;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    red += r; green += g; blue += b;
    luminance += y; squares += y * y;
    if (y < 60) dark += 1;
  }
  const mean = luminance / count;
  const variance = Math.max(0, squares / count - mean * mean);
  return {
    region: name,
    brightness: mean / 255,
    contrast: Math.min(1, Math.sqrt(variance) / 128),
    red: red / (count * 255),
    green: green / (count * 255),
    blue: blue / (count * 255),
    darkness: dark / count,
  };
}

function conditionScore(
  metrics: GameRegionMetrics,
  metric: GameMetricName,
  min?: number,
  max?: number,
): number {
  const value = metrics[metric];
  if (min !== undefined && value < min) return 0;
  if (max !== undefined && value > max) return 0;
  return 1;
}
export async function classifyGameFrame(
  input: Buffer,
  profile: GameProfile,
): Promise<GameClassification> {
  const needed = new Set<string>();
  for (const rule of profile.stateRules) {
    for (const condition of rule.conditions) needed.add(condition.region);
  }
  const metrics = await Promise.all(
    [...needed].filter(name => profile.regions[name]).map(
      name => measureRegion(input, name, profile.regions[name]!),
    ),
  );
  const byName = new Map(metrics.map(item => [item.region, item]));
  let bestState: string | null = null;
  let bestScore = 0;
  let tied = false;

  for (const rule of profile.stateRules) {
    if (!rule.conditions.length) continue;
    let matched = 0;
    for (const condition of rule.conditions) {
      const region = byName.get(condition.region);
      if (!region) continue;
      matched += conditionScore(region, condition.metric, condition.min, condition.max);
    }
    const score = matched / rule.conditions.length;
    const threshold = rule.minConfidence ?? 1;
    if (score >= threshold && score > 0) {
      if (score > bestScore + 1e-9) {
        bestState = rule.state;
        bestScore = score;
        tied = false;
      } else if (Math.abs(score - bestScore) <= 1e-9 && rule.state !== bestState) {
        tied = true;
      }
    }
  }
  return {
    state: tied ? null : bestState,
    confidence: tied ? 0 : bestScore,
    ambiguous: tied || bestState === null,
    metrics,
  };
}

/** Local correlation-like score for verified visual anchors; cheap and model-free. */
export async function templateSimilarity(left: Buffer, right: Buffer): Promise<number> {
  const [a, b] = await Promise.all([left, right].map(image =>
    sharp(image, { failOn: 'none' })
      .resize(48, 48, { fit: 'fill' })
      .greyscale().raw().toBuffer(),
  ));
  let appearanceError = 0;
  let edgeError = 0;
  for (let i = 0; i < a.length; i += 1) {
    appearanceError += Math.abs(a[i]! - b[i]!);
    if (i % 48 !== 0) {
      const gradA = a[i]! - a[i - 1]!;
      const gradB = b[i]! - b[i - 1]!;
      edgeError += Math.abs(gradA - gradB);
    }
  }
  const colorDifference = appearanceError / (255 * a.length);
  const gradientDifference = edgeError / (255 * a.length);
  return Math.max(0, Math.min(1, 1 - (0.65 * colorDifference + 0.35 * gradientDifference)));
}

/** Changes in a small semantic game panel should count as progress even when the
 * full-frame average barely changes (e.g. selecting another hero in a roster). */
export async function assessGameFrameProgress(
  before: Buffer,
  after: Buffer,
  profile: Pick<GameProfile, 'regions'>,
): Promise<{ changed: boolean; globalDifference: number; regionDifferences: Record<string, number> }> {
  const globalDifference = await screenDifference(before, after);
  const entries = Object.entries(profile.regions).slice(0, 8);
  const comparisons = await Promise.all(entries.map(async ([name, region]) => {
    const [initial, current] = await Promise.all([
      cropNormalizedRegion(before, region),
      cropNormalizedRegion(after, region),
    ]);
    const value = await screenDifference(initial, current);
    return [name, value] as const;
  }));
  const regionDifferences = Object.fromEntries(comparisons);
  return {
    changed: globalDifference >= 0.015 || comparisons.some(([, value]) => value >= 0.035),
    globalDifference,
    regionDifferences,
  };
}