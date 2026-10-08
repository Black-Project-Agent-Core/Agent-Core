import * as z from 'zod/v4';
import { phoneSequenceStep } from './phone-schemas.js';

const id = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const pkg = z.string().trim().min(3).max(300).regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/);
const fraction = z.number().min(0).max(1);
export const region = z.object({
  x: fraction, y: fraction,
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
}).refine(v => v.x + v.width <= 1.000001 && v.y + v.height <= 1.000001, 'Region exceeds frame');

const condition = z.object({
  region: id,
  metric: z.enum(['brightness', 'contrast', 'red', 'green', 'blue', 'darkness']),
  min: fraction.optional(),
  max: fraction.optional(),
});
const stateRule = z.object({
  state: id,
  conditions: z.array(condition).min(1).max(16),
  minConfidence: fraction.optional(),
});
const action = z.object({
  id,
  category: z.enum(['navigation','battle','skill','party','character','inventory','economy','summon','premium','system']),
  cooldownMs: z.number().int().min(0).max(60_000).optional(),
  reversible: z.boolean().optional(),
  premiumSensitive: z.boolean().optional(),
});

export const gameProfile = z.object({
  gameId: id,
  packageName: pkg,
  displayName: z.string().max(150).optional(),
  version: z.string().max(120).optional(),
  regions: z.record(id, region).optional(),
  stateRules: z.array(stateRule).max(50).optional(),
  actions: z.record(id, action).optional(),
});

const common = {
  gameId: id.optional(),
  sessionId: id.optional(),
  transport: z.enum(['auto','adb','gateway']).optional(),
};

export const phoneGameInspect = z.object({
  action: z.enum(['status','profiles','profile','sessions','session','compare','observe','structured','frames']),
  ...common,
  regions: z.array(id).max(6).optional(),
  imageMaxWidth: z.number().int().min(240).max(2048).optional(),
  includeFullImage: z.boolean().optional(),
});

const event = z.object({
  at: z.string().datetime({offset:true}),
  kind: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
});
const patch = z.object({
  objective: z.string().max(1000).optional(),
  currentState: z.string().max(120).optional(),
  stateConfidence: fraction.optional(),
  mode: z.string().max(120).optional(),
  stage: z.string().max(120).optional(),
  party: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  resources: z.record(id,z.union([z.number().finite(),z.string().max(100)])).optional(),
  roster: z.record(id,z.record(z.string().max(64),z.union([z.string().max(500),z.number().finite(),z.boolean()]))).optional(),
  hypothesis: z.string().max(2000).optional(),
  predictedEvents: z.array(event).max(40).optional(),
});
const outcome = z.object({
  kind: z.enum(['success','failure','neutral']),
  scope: z.enum(['battle','workflow','navigation','experiment','other']).optional(),
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  summary: z.string().trim().min(1).max(2000),
  evidenceRef: z.string().max(500).optional(),
});

export const phoneGameManage = z.object({
  action: z.enum(['profile_upsert','session_start','session_update','outcome','anchor_capture','anchor_verify','frame_save','video_record','workflow']),
  ...common,
  profile: z.record(z.string(), z.unknown()).optional()
    .meta({ description: 'Game profile; validated on receipt.' }),
  packageName: pkg.optional(),
  objective: z.string().max(1000).optional(),
  controllerLabel: z.string().max(120).optional(),
  patch: z.record(z.string(), z.unknown()).optional(),
  outcome: z.record(z.string(), z.unknown()).optional()
    .meta({ description: 'Game outcome; validated on receipt.' }),
  anchorId: id.optional(),
  region: region.optional(),
  verified: z.boolean().optional(),
  durationSeconds: z.number().int().min(1).max(30).optional(),
  steps: z.array(z.unknown()).min(1).max(12).optional()
    .meta({ description: 'Steps use the validated phone_run_macro.steps action format; runtime checks every step.' }),
  expectedState: id.optional(),
  expectedStateAfter: id.optional(),
  semanticActionId: id.optional(),
  evidenceRef: z.string().max(500).optional(),
});

/** Keep rich action validation without duplicating its entire public MCP JSON schema. */
export function parseOutcome(value: unknown): z.infer<typeof outcome> {
  return outcome.parse(value);
}

export function parseSessionPatch(value: unknown): z.infer<typeof patch> {
  return patch.parse(value);
}

export function parseGameProfile(profile: unknown): z.infer<typeof gameProfile> {
  const parsed = gameProfile.parse(profile);
  const regions = parsed.regions ?? {};
  for (const rule of parsed.stateRules ?? []) {
    for (const condition of rule.conditions) {
      if (!(condition.region in regions)) throw new Error('GAME_MODE_UNDEFINED_REGION:' + condition.region);
      if (condition.min !== undefined && condition.max !== undefined && condition.min > condition.max) {
        throw new Error('GAME_MODE_INVALID_METRIC_RANGE');
      }
    }
  }
  for (const [key, action] of Object.entries(parsed.actions ?? {})) {
    if (action.id !== key) throw new Error('GAME_MODE_ACTION_ID_MISMATCH:' + key);
  }
  return parsed;
}

export function parseGameSteps(steps: unknown[]): z.infer<typeof phoneSequenceStep>[] {
  return z.array(phoneSequenceStep).min(1).max(12).parse(steps);
}
