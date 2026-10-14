import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const serverId = process.argv[2] || 'fake';
const marker = process.argv[3];
let buffer = Buffer.alloc(0);
let contentModifiedCount = 0;

function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write(Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'),
    body,
  ]));
}

function response(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function errorResponse(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

function symbol(name) {
  return [{
    name,
    kind: 12,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
    selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 12 } },
  }];
}

function capabilities() {
  const caps = {
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
    referencesProvider: serverId === 'no-refs' ? undefined : true,
    definitionProvider: true,
    declarationProvider: true,
    implementationProvider: true,
    renameProvider: { prepareProvider: true },
  };
  if (serverId === 'hover' || serverId === 'overload-hover') caps.hoverProvider = true;
  return Object.fromEntries(Object.entries(caps).filter(([, value]) => value !== undefined));
}

function alternateWindowsFileUri(uri) {
  return uri.replace(/^file:\/\/\/([A-Z]):/i, (_match, drive) => `file:///${drive.toLowerCase()}%3A`);
}

function dispatch(message) {
  if (message.method === 'initialize') {
    if (serverId === 'count-initialize' && marker) appendFileSync(marker, 'initialize\n');
    response(message.id, { capabilities: capabilities() });
    return;
  }

  if (message.method === 'initialized') {
    if (serverId !== 'no-readiness') notify('$/typescriptVersion', { version: 'fake-1.0' });
    return;
  }

  if (message.method === 'textDocument/didOpen') {
    if (serverId === 'diagnostics-publish') {
      const uri = message.params?.textDocument?.uri;
      setTimeout(() => {
        notify('textDocument/publishDiagnostics', {
          uri: alternateWindowsFileUri(uri),
          diagnostics: [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
            message: 'fresh diagnostic',
            severity: 2,
            source: 'fake',
          }],
        });
      }, 25);
    }
    return;
  }

  if (message.method === 'textDocument/didSave') {
    if (serverId === 'diagnostics-publish') {
      const uri = message.params?.textDocument?.uri;
      setTimeout(() => {
        notify('textDocument/publishDiagnostics', { uri: alternateWindowsFileUri(uri), diagnostics: [] });
      }, 25);
    }
    return;
  }

  if (message.method === 'textDocument/documentSymbol') {
    if (serverId === 'crash') process.exit(42);
    if (serverId === 'restart-once' && marker && !existsSync(marker)) {
      writeFileSync(marker, 'crashed-once');
      process.exit(43);
    }
    if (serverId === 'content-modified-once' && contentModifiedCount++ === 0) {
      errorResponse(message.id, -32801, 'Content modified');
      return;
    }
    if (serverId === 'nested-fatal-once' && marker && !existsSync(marker)) {
      writeFileSync(marker, 'nested-fatal-reported');
      notify('window/logMessage', { type: 1, message: 'tsserver exited abnormally: synthetic crash' });
    }
    if (serverId === 'overload' || serverId === 'overload-hover') {
      response(message.id, [
        {
          name: 'same',
          kind: 12,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } },
          selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
        },
        {
          name: 'same',
          kind: 12,
          range: { start: { line: 0, character: 9 }, end: { line: 0, character: 17 } },
          selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 13 } },
        },
      ]);
      return;
    }
    response(message.id, symbol(`${serverId}Symbol`));
    return;
  }

  if (message.method === 'textDocument/hover') {
    response(message.id, { contents: { kind: 'markdown', value: '**hover-info**' } });
    return;
  }

  if (message.method === 'textDocument/references') {
    if (serverId === 'outside-refs' && marker) {
      response(message.id, [{
        uri: pathToFileURL(marker).href,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      }]);
      return;
    }
    response(message.id, []);
    return;
  }

  if (message.method === 'textDocument/diagnostic') {
    if (serverId === 'diagnostics-publish') {
      response(message.id, null);
      return;
    }
    response(message.id, { items: [] });
    return;
  }

  if (message.method === 'workspace/symbol') {
    response(message.id, []);
    return;
  }

  if (message.method === 'textDocument/prepareRename') {
    response(message.id, { range: { start: { line: 0, character: 9 }, end: { line: 0, character: 12 } }, placeholder: 'old' });
    return;
  }

  if (message.method === 'shutdown') {
    response(message.id, null);
    return;
  }

  if (message.method === 'exit') {
    process.exit(0);
  }

  if (Object.prototype.hasOwnProperty.call(message, 'id')) {
    response(message.id, null);
  }
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
