const METHODS = new Set([
  'Page.enable', 'Runtime.enable', 'Runtime.evaluate', 'Page.getNavigationHistory',
  'Page.navigateToHistoryEntry', 'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent', 'Input.insertText',
]);

export async function executeCommand(debuggerApi, tabId, command, pressed, detach) {
  if (!command || !Number.isSafeInteger(command.id) || !command.params || typeof command.params !== 'object')
    throw new Error('Invalid bridge command');
  if (command.method === 'AgentCore.detach') {
    await detach(); return { id: command.id, result: { detached: true } };
  }
  if (!METHODS.has(command.method)) throw new Error('Bridge command refused');
  const target = { tabId };
  if (command.method === 'Input.dispatchKeyEvent' && command.params.type === 'keyDown')
    pressed.set(command.params.code, { method: 'Input.dispatchKeyEvent', params: {
      type: 'keyUp', key: command.params.key, code: command.params.code, modifiers: command.params.modifiers ?? 0 } });
  if (command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mousePressed')
    pressed.set('mouse:' + command.params.button, { method: 'Input.dispatchMouseEvent', params: {
      ...command.params, type: 'mouseReleased' } });
  const result = await debuggerApi.sendCommand(target, command.method, command.params);
  if (command.method === 'Input.dispatchKeyEvent' && command.params.type === 'keyUp') pressed.delete(command.params.code);
  if (command.method === 'Input.dispatchMouseEvent' && command.params.type === 'mouseReleased') pressed.delete('mouse:' + command.params.button);
  return { id: command.id, result: result ?? {} };
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
