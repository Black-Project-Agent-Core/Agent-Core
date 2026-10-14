const status = document.getElementById('status');
const connect = document.getElementById('connect');
const disconnect = document.getElementById('disconnect');
const code = document.getElementById('code');
async function send(action) {
  connect.disabled = true; disconnect.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ action, ...(action === 'connect' ? { code: code.value.trim() } : {}) });
    status.textContent = result.error || result.status;
    if (result.connected) code.value = '';
    connect.disabled = !!result.connected; disconnect.disabled = !result.connected;
  } catch (error) { status.textContent = error.message; connect.disabled = false; }
}
connect.addEventListener('click', () => send('connect'));
disconnect.addEventListener('click', () => send('disconnect'));
void send('status');
