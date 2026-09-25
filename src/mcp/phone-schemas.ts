import * as z from 'zod/v4';

const transport = z.enum(['auto', 'gateway', 'adb']).optional()
  .meta({ description: 'Override the transport for this call. Defaults to the configured mode (auto).' });

const screenshotOptions = {
  maxWidth: z.number().int().min(0).max(4096).optional()
    .meta({ description: 'Downscale longest width for vision (default 720; 0 keeps native size).' }),
  format: z.enum(['jpeg', 'png', 'webp']).optional().meta({ description: 'Output image format (default jpeg).' }),
  quality: z.number().int().min(1).max(100).optional().meta({ description: 'Encoder quality for jpeg/webp (default 60).' }),
  raw: z.boolean().optional().meta({ description: 'Return the untouched device image (no downscale).' }),
};

export const phoneStatus = z.object({});

export const phoneObserve = z.object({ ...screenshotOptions, transport });

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

export const phoneRunMacro = z.object({
  actions: z.array(z.string().trim().min(1).max(80)).min(1).max(60),
  delayMs: z.number().int().min(0).max(5_000).optional().meta({ description: 'Delay between actions in ms (default 400).' }),
  transport,
});
