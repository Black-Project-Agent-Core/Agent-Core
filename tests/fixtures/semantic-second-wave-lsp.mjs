import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'basic';
const aux = process.argv[3];
let buffer = Buffer.alloc(0);
let contentModifiedCount = 0;
let unknownRequestOriginalId;
let spawnedChild;
let launchCount = 0;
if (mode === 'early-ready-once' && aux) {
  const countFile = `${aux}.count`;
  try { launchCount = Number.parseInt(readFileSync(countFile, 'utf8'), 10) || 0; } catch {}
  launchCount += 1;
  writeFileSync(countFile, String(launchCount));
}

function log(value) {
  if (!aux || mode === 'outside-location') return;
  try { appendFileSync(aux, JSON.stringify(value) + '\n'); } catch {}
}

function send(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  process.stdout.write(Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'),
    body,
  ]));
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function symbolRows(uri) {
  const common = {
    kind: 6,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 14 } },
    selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 13 } },
  };
  if (mode === 'rich') {
    return [
      { ...common, name: 'work(int) : int', detail: 'first overload' },
      { ...common, name: 'work(string) : string', detail: 'second overload',
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 20 } },
        selectionRange: { start: { line: 1, character: 9 }, end: { line: 1, character: 13 } } },
    ];
  }
  if (mode === 'invalid-range') {
    return [{
      ...common,
      name: 'broken',
      range: { start: { line: 999, character: 0 }, end: { line: 999, character: 1 } },
      selectionRange: { start: { line: 999, character: 0 }, end: { line: 999, character: 1 } },
    }];
  }
  return [{ ...common, name: 'sample' }];
}

function capabilities() {
  const value = {
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
    referencesProvider: true,
    definitionProvider: true,
    implementationProvider: true,
    hoverProvider: true,
    renameProvider: { prepareProvider: true },
    diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
  };
  if (mode === 'missing-capability') delete value.renameProvider;
  return value;
}

function dispatch(message) {
  log({ direction: 'in', message });

  if (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error')) {
    if (String(message.id) === '900' && unknownRequestOriginalId !== undefined) {
      result(unknownRequestOriginalId, message);
      unknownRequestOriginalId = undefined;
    }
    return;
  }

  if (message.method === 'initialize') {
    const earlyPowerShellReady = mode === 'early-powershell-ready'
      || mode === 'early-ready-init-error'
      || (mode === 'early-ready-once' && launchCount === 1);
    if (earlyPowerShellReady) {
      send({ jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3, message: 'PowerShell Editor Services ready' } });
    }
    if (mode === 'early-typescript-ready-then-progress') {
      send({ jsonrpc: '2.0', method: '$/typescriptVersion', params: { version: 'fixture' } });
    }
    if (mode === 'early-ready-init-error') {
      error(message.id, -32603, 'fixture initialize failure');
    } else if (mode === 'numeric-id') {
      send({ jsonrpc: '2.0', id: String(message.id), result: { capabilities: capabilities() } });
    } else {
      result(message.id, { capabilities: capabilities() });
    }
    return;
  }

  if (message.method === 'initialized') {
    if (mode === 'tree' && !spawnedChild) {
      spawnedChild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      log({ spawnedChildPid: spawnedChild.pid });
    }
    if (mode === 'early-typescript-ready-then-progress') {
      send({ jsonrpc: '2.0', method: '$/progress', params: { token: 'fixture-index', value: { kind: 'begin', title: 'index' } } });
    }
    if (['typescript-ready','fatal-typescript','dependency-definition','local-and-dependency-definition'].includes(mode)) {
      send({ jsonrpc: '2.0', method: '$/typescriptVersion', params: { version: 'fixture' } });
    }
    if (mode === 'rich' || mode === 'missing-capability') {
      send({ jsonrpc: '2.0', method: 'workspace/projectInitializationComplete', params: {} });
    }
    return;
  }

  if (message.method === 'finish-progress' && mode === 'early-typescript-ready-then-progress') {
    send({ jsonrpc: '2.0', method: '$/progress', params: { token: 'fixture-index', value: { kind: 'end', message: 'done' } } });
    result(message.id, { ended: true });
    return;
  }

  if (message.method === 'textDocument/didOpen') {
    if (mode === 'diagnostics') {
      const uri = message.params?.textDocument?.uri;
      if (uri) {
        let variant = uri;
        if (process.platform === 'win32') variant = uri.replace(/^file:\/\/\/[A-Z]:/i, match => match.toLowerCase());
        send({
          jsonrpc: '2.0',
          method: 'textDocument/publishDiagnostics',
          params: { uri: variant, diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: 2, message: 'fixture' }] },
        });
      }
    }
    return;
  }

  if (message.method === 'textDocument/documentSymbol') {
    if (mode === 'content-modified-once' && contentModifiedCount++ === 0) {
      error(message.id, -32801, 'Content modified');
      return;
    }
    if (mode === 'fatal-typescript') {
      send({ jsonrpc: '2.0', method: 'window/logMessage', params: { type: 1, message: 'tsserver exited abnormally with code 1' } });
    }
    result(message.id, symbolRows(message.params?.textDocument?.uri));
    return;
  }

  if (message.method === 'textDocument/hover') {
    result(message.id, { contents: { kind: 'markdown', value: '**fixture hover info**' } });
    return;
  }

  if (message.method === 'textDocument/references') {
    const uri = message.params?.textDocument?.uri;
    const rows = [{ uri, range: { start: { line: 0, character: 9 }, end: { line: 0, character: 13 } } }];
    if (mode === 'outside-location' && aux) {
      rows.push({ uri: pathToFileURL(path.resolve(aux)).href, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } });
    }
    result(message.id, rows);
    return;
  }

  if (message.method === 'textDocument/definition' || message.method === 'textDocument/implementation') {
    const uri = message.params?.textDocument?.uri;
    const own = { uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } };
    if (message.method === 'textDocument/definition' && mode === 'dependency-definition' && aux) {
      result(message.id, [{ ...own, uri: pathToFileURL(path.resolve(aux)).href }]);
      return;
    }
    if (message.method === 'textDocument/definition' && mode === 'local-and-dependency-definition' && aux) {
      result(message.id, [own, { ...own, uri: pathToFileURL(path.resolve(aux)).href }]);
      return;
    }
    result(message.id, [own]);
    return;
  }

  if (message.method === 'workspace/symbol') {
    result(message.id, []);
    return;
  }

  if (message.method === 'textDocument/prepareRename') {
    result(message.id, { range: { start: { line: 0, character: 9 }, end: { line: 0, character: 13 } }, placeholder: 'sample' });
    return;
  }

  if (message.method === 'textDocument/rename') {
    if (mode === 'rename-file') {
      const oldUri = message.params?.textDocument?.uri;
      const oldPath = fileURLToPath(oldUri);
      const newPath = path.join(path.dirname(oldPath), 'renamed.move');
      result(message.id, { documentChanges: [{ kind: 'rename', oldUri, newUri: pathToFileURL(newPath).href }] });
      return;
    }
    result(message.id, { changes: {} });
    return;
  }

  if (message.method === 'textDocument/diagnostic') {
    result(message.id, { kind: 'full', items: [] });
    return;
  }

  if (message.method === 'trigger-server-request') {
    unknownRequestOriginalId = message.id;
    send({ jsonrpc: '2.0', id: '900', method: 'server/unknown', params: { probe: true } });
    return;
  }

  if (message.method === 'child-pid') {
    result(message.id, spawnedChild?.pid ?? null);
    return;
  }

  if (message.method === 'shutdown') {
    log({ shutdownHasParams: Object.prototype.hasOwnProperty.call(message, 'params') });
    result(message.id, null);
    return;
  }

  if (message.method === 'exit') {
    log({ exitHasParams: Object.prototype.hasOwnProperty.call(message, 'params') });
    process.exit(0);
  }

  if (Object.prototype.hasOwnProperty.call(message, 'id')) result(message.id, null);
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
    Promise.resolve(dispatch(JSON.parse(raw))).catch(err => {
      try { error(JSON.parse(raw).id, -32603, String(err)); } catch {}
    });
  }
});
