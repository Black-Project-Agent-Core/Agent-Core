import { McpServer } from '@modelcontextprotocol/server';
import type { PhoneController } from '../phone/controller.js';
import type { PhoneObservation } from '../phone/types.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import * as schemas from './phone-schemas.js';

function text(value: unknown): any {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function failure(name: string, error: unknown): any {
  const message = error instanceof Error ? error.message : String(error);
  activityTracker.record('MCP', 'info', `${name} operation failed`, 'handled-phone-failure', { tool: name, message });
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

async function run(name: string, action: () => Promise<unknown>): Promise<any> {
  const started = Date.now();
  try {
    const result = await action();
    activityTracker.record('MCP', 'success', `${name} completed`, 'phone-tool', { tool: name, durationMs: Date.now() - started });
    return text(result);
  } catch (error) {
    return failure(name, error);
  }
}

async function runResult(name: string, action: () => Promise<any>): Promise<any> {
  const started = Date.now();
  try {
    const result = await action();
    activityTracker.record('MCP', 'success', `${name} completed`, 'phone-tool', { tool: name, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    return failure(name, error);
  }
}

function observationResult(observation: PhoneObservation): any {
  const { screenshot, foreground, transport, deviceId } = observation;
  const meta = {
    transport,
    deviceId,
    foreground,
    image: {
      mimeType: screenshot.mimeType,
      imageWidth: screenshot.imageWidth,
      imageHeight: screenshot.imageHeight,
      deviceWidth: screenshot.deviceWidth,
      deviceHeight: screenshot.deviceHeight,
      bytes: screenshot.bytes,
    },
    hint: 'Tap/swipe coordinates are in device pixels (deviceWidth x deviceHeight), or pass normalized:true with 0..1 fractions.',
  };
  return {
    content: [
      { type: 'text', text: JSON.stringify(meta, null, 2) },
      { type: 'image', data: screenshot.base64, mimeType: screenshot.mimeType },
    ],
  };
}

export function registerPhoneTools(server: McpServer, controller: PhoneController): void {
  if (!controller.enabled) return;

  server.registerTool('phone_status', {
    title: 'Phone Status',
    description: 'Report control status for the authorized Android phone: configured mode, active transport, gateway (remote app) online state, and local ADB device state.',
    inputSchema: schemas.phoneStatus.shape,
    annotations: { title: 'Phone Status', readOnlyHint: true, openWorldHint: true },
  }, async () => run('phone_status', () => controller.status()));

  server.registerTool('phone_observe', {
    title: 'Observe Phone Screen',
    description: 'Capture the current phone screen (downscaled JPEG for vision by default) plus the foreground app. Use this to see the game/UI before acting.',
    inputSchema: schemas.phoneObserve.shape,
    annotations: { title: 'Observe Phone Screen', readOnlyHint: true, openWorldHint: true },
  }, async (args: any) => runResult('phone_observe', async () => {
    const input = schemas.phoneObserve.parse(args);
    const observation = await controller.observe(
      { maxWidth: input.maxWidth, format: input.format, quality: input.quality, raw: input.raw },
      input.transport,
    );
    return observationResult(observation);
  }));

  server.registerTool('phone_tap', {
    title: 'Tap Phone Screen',
    description: 'Tap an on-screen coordinate. Coordinates are device pixels unless normalized:true (0..1 fractions).',
    inputSchema: schemas.phoneTap.shape,
    annotations: { title: 'Tap Phone Screen', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_tap', () => {
    const input = schemas.phoneTap.parse(args);
    return controller.tap({ x: input.x, y: input.y, normalized: input.normalized }, input.transport);
  }));

  server.registerTool('phone_swipe', {
    title: 'Swipe Phone Screen',
    description: 'Swipe/drag between two coordinates. Coordinates are device pixels unless normalized:true.',
    inputSchema: schemas.phoneSwipe.shape,
    annotations: { title: 'Swipe Phone Screen', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_swipe', () => {
    const input = schemas.phoneSwipe.parse(args);
    return controller.swipe(
      { x: input.x1, y: input.y1, normalized: input.normalized },
      { x: input.x2, y: input.y2, normalized: input.normalized },
      input.durationMs ?? 300,
      input.transport,
    );
  }));

  server.registerTool('phone_long_press', {
    title: 'Long Press Phone Screen',
    description: 'Press and hold a coordinate for a duration (default 700ms).',
    inputSchema: schemas.phoneLongPress.shape,
    annotations: { title: 'Long Press Phone Screen', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_long_press', () => {
    const input = schemas.phoneLongPress.parse(args);
    return controller.longPress({ x: input.x, y: input.y, normalized: input.normalized }, input.durationMs ?? 700, input.transport);
  }));

  server.registerTool('phone_input_text', {
    title: 'Type Text On Phone',
    description: 'Type text into the focused field. ASCII is reliable via ADB; use the gateway/device app for complex Unicode.',
    inputSchema: schemas.phoneInputText.shape,
    annotations: { title: 'Type Text On Phone', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_input_text', () => {
    const input = schemas.phoneInputText.parse(args);
    return controller.inputText(input.text, input.transport);
  }));

  server.registerTool('phone_key', {
    title: 'Press Phone Key',
    description: 'Send an Android keyevent (name like KEYCODE_ENTER or a number). Gateway transport supports only BACK/HOME.',
    inputSchema: schemas.phoneKey.shape,
    annotations: { title: 'Press Phone Key', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_key', () => {
    const input = schemas.phoneKey.parse(args);
    return controller.key(String(input.keycode), input.transport);
  }));

  server.registerTool('phone_back', {
    title: 'Phone Back',
    description: 'Press the Android Back button.',
    inputSchema: schemas.phoneNav.shape,
    annotations: { title: 'Phone Back', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_back', () => controller.back(schemas.phoneNav.parse(args).transport)));

  server.registerTool('phone_home', {
    title: 'Phone Home',
    description: 'Press the Android Home button.',
    inputSchema: schemas.phoneNav.shape,
    annotations: { title: 'Phone Home', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_home', () => controller.home(schemas.phoneNav.parse(args).transport)));

  server.registerTool('phone_launch_app', {
    title: 'Launch Phone App',
    description: 'Launch an app by package name (optionally an explicit activity/component).',
    inputSchema: schemas.phoneLaunchApp.shape,
    annotations: { title: 'Launch Phone App', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_launch_app', () => {
    const input = schemas.phoneLaunchApp.parse(args);
    return controller.launchApp(input.packageName, input.activity, input.transport);
  }));

  server.registerTool('phone_list_named_actions', {
    title: 'List Named Phone Actions',
    description: 'List reusable calibrated tap actions and whether each coordinate is verified.',
    inputSchema: schemas.phoneListNamedActions.shape,
    annotations: { title: 'List Named Phone Actions', readOnlyHint: true, openWorldHint: true },
  }, async (args: any) => run('phone_list_named_actions', () => controller.listNamedActions(schemas.phoneListNamedActions.parse(args).transport)));

  server.registerTool('phone_save_verified_action', {
    title: 'Save Verified Phone Action',
    description: 'Persist a reusable named tap after its coordinate is visually verified on this device.',
    inputSchema: schemas.phoneSaveVerifiedAction.shape,
    annotations: { title: 'Save Verified Phone Action', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_save_verified_action', () => {
    const input = schemas.phoneSaveVerifiedAction.parse(args);
    return controller.saveVerifiedAction(input.name, { x: input.x, y: input.y, normalized: input.normalized }, input.transport);
  }));

  server.registerTool('phone_run_named_action', {
    title: 'Run Named Phone Action',
    description: 'Run a previously verified named tap using its saved calibrated coordinate.',
    inputSchema: schemas.phoneRunNamedAction.shape,
    annotations: { title: 'Run Named Phone Action', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_run_named_action', () => {
    const input = schemas.phoneRunNamedAction.parse(args);
    return controller.runNamedAction(input.name, input.transport);
  }));

  server.registerTool('phone_run_macro', {
    title: 'Run Phone Macro',
    description: 'Run a sequence of verified named actions as one macro — useful for repetitive game steps while you play.',
    inputSchema: schemas.phoneRunMacro.shape,
    annotations: { title: 'Run Phone Macro', readOnlyHint: false, openWorldHint: true },
  }, async (args: any) => run('phone_run_macro', () => {
    const input = schemas.phoneRunMacro.parse(args);
    return controller.runMacro(input.actions, input.delayMs ?? 400, input.transport);
  }));
}
