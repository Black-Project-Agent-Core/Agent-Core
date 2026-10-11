const METHODS = new Set([
  'Page.enable', 'Runtime.enable', 'Runtime.evaluate', 'Page.getNavigationHistory',
  'Page.navigateToHistoryEntry', 'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent', 'Input.insertText',
  'Page.getLayoutMetrics', 'Page.captureScreenshot',
]);

const MAX_CAPTURE_BYTES = 128 * 1024;
function validateCapture(params) {
  const clip = params.clip;
  if (Object.keys(params).some(k => !['format', 'quality', 'fromSurface', 'captureBeyondViewport', 'clip'].includes(k))
    || params.format !== 'jpeg' || params.fromSurface !== true || params.captureBeyondViewport !== false
    || !Number.isInteger(params.quality) || params.quality < 55 || params.quality > 100
    || !clip || Object.keys(clip).some(k => !['x', 'y', 'width', 'height', 'scale'].includes(k))
    || !['x', 'y', 'width', 'height', 'scale'].every(k => typeof clip[k] === 'number' && Number.isFinite(clip[k]))
    || clip.x < 0 || clip.y < 0 || clip.width <= 0 || clip.width > 8192
    || clip.height <= 0 || clip.height > 8192 || clip.scale <= 0 || clip.scale > 1)
    throw new Error('BROWSER_BRIDGE_CAPTURE_ARGUMENTS_REFUSED');
}
function boundedCapture(result) {
  const data = result?.data;
  if (typeof data !== 'string' || !data.length) throw new Error('BROWSER_BRIDGE_CAPTURE_INVALID');
  if (data.length > Math.ceil(MAX_CAPTURE_BYTES / 3) * 4) throw new Error('BROWSER_CONTROL_CAPTURE_TOO_LARGE');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))
    throw new Error('BROWSER_BRIDGE_CAPTURE_INVALID');
  const bytes = atob(data);
  if (bytes.length > MAX_CAPTURE_BYTES) throw new Error('BROWSER_CONTROL_CAPTURE_TOO_LARGE');
  if (btoa(bytes) !== data) throw new Error('BROWSER_BRIDGE_CAPTURE_INVALID');
  return { data };
}

export async function executeCommand(debuggerApi, tabId, command, pressed, detach, control) {
  if (!command || !Number.isSafeInteger(command.id) || !command.params || typeof command.params !== 'object' || Array.isArray(command.params))
    throw new Error('Invalid bridge command');
  if (command.method === 'AgentCore.detach') {
    await detach(); return { id: command.id, result: { detached: true } };
  }
  if (command.method === 'AgentCore.pause' || command.method === 'AgentCore.resume') {
    if (!control) throw new Error('Bridge command refused');
    return { id: command.id, result: await control(command.method === 'AgentCore.pause') };
  }
  if (!METHODS.has(command.method)) throw new Error('Bridge command refused');
  if (command.method === 'Page.captureScreenshot') validateCapture(command.params);
  if (command.method === 'Page.getLayoutMetrics' && Object.keys(command.params).length) throw new Error('Bridge command refused');
  const target = { tabId };
  if (command.method === 'Input.dispatchKeyEvent' && command.params.type === 'keyDown')
    pressed.set(command.params.code, { method: 'Input.dispatchKeyEvent', params: {
      type: 'keyUp', key: command.params.key, code: command.params.code, modifiers: 0 } });
  if (command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mousePressed')
    pressed.set('mouse:' + command.params.button, { method: 'Input.dispatchMouseEvent', params: {
      ...command.params, type: 'mouseReleased', buttons: 0, modifiers: 0 } });
  if (command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mouseMoved')
    for (const [key, value] of pressed) if (key.startsWith('mouse:'))
      Object.assign(value.params, { x: command.params.x, y: command.params.y });
  const result = await debuggerApi.sendCommand(target, command.method, command.params);
  if (command.method === 'Input.dispatchKeyEvent' && command.params.type === 'keyUp') pressed.delete(command.params.code);
  if (command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mouseReleased') pressed.delete('mouse:' + command.params.button);
  if (command.method === 'Page.getLayoutMetrics' && new TextEncoder().encode(JSON.stringify(result ?? {})).byteLength > 16 * 1024)
    throw new Error('BROWSER_BRIDGE_METADATA_TOO_LARGE');
  return { id: command.id, result: command.method === 'Page.captureScreenshot' ? boundedCapture(result) : result ?? {} };
}

export async function releaseInput(debuggerApi, tabId, pressed) {
  const failures = [];
  for (const value of pressed.values()) {
    try { await debuggerApi.sendCommand({ tabId }, value.method, value.params); }
    catch { failures.push(value.params.code || value.params.button); }
  }
  pressed.clear();
  return failures.length === 0;
}
