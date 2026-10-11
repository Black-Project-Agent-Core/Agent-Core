const status = document.getElementById('status');
const connect = document.getElementById('connect');
const disconnect = document.getElementById('disconnect');
const pause = document.getElementById('pause');
const takeover = document.getElementById('takeover');
const code = document.getElementById('code');
let paused = false;
async function send(action) {
  for (const button of [connect, disconnect, pause, takeover]) button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ action, ...(action === 'connect' ? { code: code.value.trim() } : {}) });
    status.textContent = result.error || result.status;
    if (result.connected) code.value = '';
    paused = result.paused === true;
    pause.textContent = paused ? 'Resume' : 'Pause';
    connect.disabled = !!result.connected || !!result.connecting;
    disconnect.disabled = !result.connected && !result.connecting;
    pause.disabled = takeover.disabled = !result.connected;
  } catch (error) { status.textContent = error.message; connect.disabled = false; }
}
connect.addEventListener('click', () => send('connect'));
disconnect.addEventListener('click', () => send('disconnect'));
takeover.addEventListener('click', () => send('takeover'));
pause.addEventListener('click', () => send(paused ? 'resume' : 'pause'));
void send('status');
