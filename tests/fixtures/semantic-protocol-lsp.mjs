import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const mode = process.argv[2] || 'basic';
const marker = process.argv[3];
let buffer = Buffer.alloc(0);
let retryCount = 0;
let pendingUnknownRequestId;
let shutdownHasParams = null;

let spawnedChild;
if (mode === 'spawn-child' || mode === 'hang-initialize-child') {
  spawnedChild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
    detached: false,
  });
  if (marker) writeFileSync(marker, String(spawnedChild.pid));
}

function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write(Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'),
    body,
  ]));
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function dispatch(message) {
  if (message.method === 'initialize' && mode === 'hang-initialize-child') return;

  if (message.method === 'retry/test') {
    retryCount += 1;
    if (retryCount < 3) fail(message.id, -32801, 'Content modified');
    else respond(message.id, { attempts: retryCount });
    return;
  }

  if (message.method === 'no-retry/test') {
    fail(message.id, -32801, 'Content modified');
    return;
  }

  if (message.method === 'string-id/test') {
    send({ jsonrpc: '2.0', id: String(message.id), result: { stringId: true } });
    return;
  }

  if (message.method === 'trigger-unknown/test') {
    pendingUnknownRequestId = message.id;
    send({ jsonrpc: '2.0', id: '900', method: 'server/unknown', params: { hello: 'world' } });
    return;
  }

  if (String(message.id) === '900' && message.error) {
    respond(pendingUnknownRequestId, { code: message.error.code, message: message.error.message });
    pendingUnknownRequestId = undefined;
    return;
  }

  if (message.method === 'shutdown') {
    shutdownHasParams = Object.prototype.hasOwnProperty.call(message, 'params');
    respond(message.id, null);
    return;
  }

  if (message.method === 'exit') {
    if (marker && mode === 'wire') {
      writeFileSync(marker, JSON.stringify({
        shutdownHasParams,
        exitHasParams: Object.prototype.hasOwnProperty.call(message, 'params'),
      }));
    }
    process.exit(0);
  }

  if (Object.prototype.hasOwnProperty.call(message, 'id')) respond(message.id, null);
}

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) break;
    const header = buffer.subarray(0, headerEnd).toString('ascii');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) break;
    const raw = buffer.subarray(start, start + length).toString('utf8');
    buffer = buffer.subarray(start + length);
    dispatch(JSON.parse(raw));
  }
});
