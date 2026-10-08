import * as z from 'zod/v4';

const transport = z.enum(['auto', 'gateway', 'adb']).optional()
  .meta({ description: 'Override the transport for this call. Defaults to the configured mode (auto).' });

const crop = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
  normalized: z.boolean().optional().meta({ description: 'Treat crop values as 0..1 fractions of the native screen.' }),
});

const screenshotOptions = {
  maxWidth: z.number().int().min(0).max(4096).optional()
    .meta({ description: 'Downscale longest width for vision (default 720; 0 keeps native size).' }),
  format: z.enum(['jpeg', 'png', 'webp']).optional().meta({ description: 'Output image format (default jpeg).' }),
  quality: z.number().int().min(1).max(100).optional().meta({ description: 'Encoder quality for jpeg/webp (default 60).' }),
  raw: z.boolean().optional().meta({ description: 'Return the untouched device image (no downscale); cannot be combined with crop.' }),
  crop: crop.optional().meta({ description: 'Optional screen region to zoom/crop before returning the image.' }),
};

export const phoneStatus = z.object({});

export const phoneObserve = z.object({
  ...screenshotOptions,
  samples: z.number().int().min(1).max(6).optional()
    .meta({ description: 'Capture a short burst and return the last frame plus motion statistics (default 1).' }),
  intervalMs: z.number().int().min(50).max(2_000).optional()
    .meta({ description: 'Delay between burst frames in ms (default 250).' }),
  motionThreshold: z.number().min(0.001).max(0.25).optional()
    .meta({ description: 'Difference threshold used to label the burst stable (default 0.02).' }),
  transport,
});

export const phoneTap = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  normalized: z.boolean().optional().meta({ description: 'Treat x/y as 0..1 fractions of the device screen.' }),
  transport,
});

export const phoneSwipe = z.object({
  x1: z.number().min(0), y1: z.number().min(0),
  x2: z.number().min(0), y2: z.number().min(0),
  durationMs: z.number().int().min(20).max(10_000).optional().meta({ description: 'Swipe duration in ms (default 300).' }),
  normalized: z.boolean().optional().meta({ description: 'Treat coordinates as 0..1 fractions of the device screen.' }),
  transport,
});

export const phoneLongPress = z.object({
  x: z.number().min(0), y: z.number().min(0),
  durationMs: z.number().int().min(100).max(10_000).optional().meta({ description: 'Hold duration in ms (default 700).' }),
  normalized: z.boolean().optional(),
  transport,
});

export const phoneInputText = z.object({
  text: z.string().max(4000),
  transport,
});

export const phoneKey = z.object({
  keycode: z.union([z.string(), z.number()])
    .meta({ description: 'Android keycode name (e.g. KEYCODE_ENTER) or number. Gateway supports only BACK/HOME.' }),
  transport,
});

export const phoneNav = z.object({ transport });

export const phoneLaunchApp = z.object({
  packageName: z.string().min(1),
  activity: z.string().min(1).optional().meta({ description: 'Optional explicit component/activity to start.' }),
  transport,
});

export const phoneListNamedActions = z.object({ transport });

export const phoneSaveVerifiedAction = z.object({
  name: z.string().trim().min(1).max(80),
  x: z.number().min(0), y: z.number().min(0),
  normalized: z.boolean().optional(),
  transport,
});

export const phoneRunNamedAction = z.object({
  name: z.string().trim().min(1).max(80),
  transport,
});

export const phoneSequenceStep = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tap'), x: z.number().min(0), y: z.number().min(0), normalized: z.boolean().optional() }),
  z.object({
    action: z.literal('swipe'),
    x1: z.number().min(0), y1: z.number().min(0),
    x2: z.number().min(0), y2: z.number().min(0),
    durationMs: z.number().int().min(20).max(10_000).optional(),
    normalized: z.boolean().optional(),
  }),
  z.object({ action: z.literal('longPress'), x: z.number().min(0), y: z.number().min(0), durationMs: z.number().int().min(100).max(10_000).optional(), normalized: z.boolean().optional() }),
  z.object({ action: z.literal('inputText'), text: z.string().max(4_000) }),
  z.object({ action: z.literal('key'), keycode: z.string().min(1).max(80) }),
  z.object({ action: z.literal('back') }),
  z.object({ action: z.literal('home') }),
  z.object({ action: z.literal('launchApp'), packageName: z.string().min(1).max(300), activity: z.string().min(1).max(500).optional() }),
  z.object({ action: z.literal('namedAction'), name: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal('wait'), durationMs: z.number().int().min(0).max(30_000) }),
  z.object({
    action: z.literal('waitStable'),
    timeoutMs: z.number().int().min(500).max(30_000).optional(),
    intervalMs: z.number().int().min(100).max(2_000).optional(),
    threshold: z.number().min(0.001).max(0.25).optional(),
    stableSamples: z.number().int().min(1).max(6).optional(),
  }),
  z.object({
    action: z.literal('waitRegionStable'),
    region: crop,
    timeoutMs: z.number().int().min(500).max(30_000).optional(),
    intervalMs: z.number().int().min(100).max(2_000).optional(),
    threshold: z.number().min(0.001).max(0.25).optional(),
    stableSamples: z.number().int().min(1).max(6).optional(),
  }),
  z.object({
    action: z.literal('waitRegionChange'),
    region: crop,
    timeoutMs: z.number().int().min(500).max(30_000).optional(),
    intervalMs: z.number().int().min(100).max(2_000).optional(),
    threshold: z.number().min(0.001).max(0.25).optional(),
  }),
  z.object({
    action: z.literal('waitForeground'),
    packageName: z.string().min(1).max(300),
    timeoutMs: z.number().int().min(500).max(30_000).optional(),
    intervalMs: z.number().int().min(100).max(2_000).optional(),
  }),
  z.object({ action: z.literal('observeCheckpoint'), label: z.string().max(120).optional(), maxWidth: z.number().int().min(240).max(2_048).optional() }),
  z.object({ action: z.literal('setOverlay'), enabled: z.boolean() }),
  z.object({ action: z.literal('clearMarkers') }),
]);

export const phoneRunMacro = z.object({
  actions: z.array(z.string().trim().min(1).max(80)).min(1).max(60).optional(),
  steps: z.array(phoneSequenceStep).min(1).max(80).optional()
    .meta({ description: 'Mixed action sequence with screen/region/foreground verification primitives.' }),
  expectedPackage: z.string().min(1).max(300).optional()
    .meta({ description: 'App guard: mutating steps fail closed if another package owns the foreground.' }),
  delayMs: z.number().int().min(0).max(5_000).optional().meta({ description: 'Delay between legacy named actions in ms (default 400).' }),
  observeAfter: z.boolean().optional().meta({ description: 'Return a final screenshot after execution; defaults true for steps and false for legacy actions.' }),
  settleMs: z.number().int().min(0).max(10_000).optional().meta({ description: 'Optional fixed settle delay before the final observation.' }),
  observeMaxWidth: z.number().int().min(240).max(2_048).optional().meta({ description: 'Final observation width when observeAfter is enabled (default 960).' }),
  transport,
}).refine((value) => Boolean(value.actions?.length || value.steps?.length), {
  message: 'Provide actions or steps',
});
