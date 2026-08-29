#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const RELAY_VERSION = '1.1.1';
const stateRoot = process.env.CODESPACE_WINDOWS_STATE_ROOT
  ? path.resolve(process.env.CODESPACE_WINDOWS_STATE_ROOT)
  : (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'CodespaceWindowsRelay')
      : path.join(os.homedir(), '.codespace-windows-relay'));
const npmCache = path.join(stateRoot, 'npm-cache');
const desktopCommanderRoot = path.join(stateRoot, 'desktop-commander');
const desktopCommanderEntry = path.join(desktopCommanderRoot, 'node_modules', '@wonderwhy-er', 'desktop-commander', 'dist', 'index.js');
const deviceFile = path.join(stateRoot, 'device.json');
const credentialFile = path.join(stateRoot, 'credentials.json');
const logFile = path.join(stateRoot, 'relay.log');
const pairOnly = process.argv.includes('--pair-only');
const gateway = (process.env.CODESPACE_WINDOWS_GATEWAY_URL || '').replace(/\/+$/, '');
const pairingCode = process.env.WINDOWS_PAIRING_CODE || '';
const allowedRoots = (process.env.WINDOWS_ALLOWED_ROOTS || '')
  .split(';').map(x => x.trim()).filter(Boolean).map(x => path.resolve(x));
const maxLogBytes = 2 * 1024 * 1024;

if (!gateway.startsWith('https://')) {
  console.error('CODESPACE_WINDOWS_GATEWAY_URL must be an https:// URL');
  process.exit(2);
}
if (!allowedRoots.length) {
  console.error('WINDOWS_ALLOWED_ROOTS must contain at least one absolute Windows directory');
  process.exit(2);
}

await fsp.mkdir(stateRoot, { recursive: true });
await fsp.mkdir(npmCache, { recursive: true });

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > maxLogBytes) {
      fs.renameSync(logFile, `${logFile}.1`);
    }
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {}
}

function safeJsonRead(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function savePrivateJson(file, value) {
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
  if (process.platform === 'win32') {
    const user = process.env.USERNAME;
    if (user) {
      spawnSync('icacls.exe', [file, '/inheritance:r', '/grant:r', `${user}:(R,W)`, '/C'], {
        windowsHide: true, stdio: 'ignore', shell: false,
      });
    }
  }
}

let device = safeJsonRead(deviceFile);
if (!device) {
  device = {
    machineId: `${os.hostname()}-${crypto.randomUUID()}`,
    machineName: os.hostname(),
    createdAt: new Date().toISOString(),
  };
  savePrivateJson(deviceFile, device);
}
let credentials = safeJsonRead(credentialFile);

async function httpJson(method, endpoint, body = undefined, authenticated = true, timeoutMs = 35000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { 'content-type': 'application/json', 'user-agent': `codespace-windows-relay/${RELAY_VERSION}` };
  if (authenticated) {
    if (!credentials?.deviceToken) throw new Error('Windows Relay is not paired');
    headers.authorization = `Bearer ${credentials.deviceToken}`;
  }
  try {
    const response = await fetch(`${gateway}${endpoint}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 4000) }; }
    }
    if (!response.ok) {
      const detail = data?.detail || data?.message || response.statusText;
      throw new Error(`HTTP ${response.status} ${endpoint}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function pairIfNeeded() {
  if (credentials?.deviceToken) return;
  if (!pairingCode) throw new Error('WINDOWS_PAIRING_CODE is required for first-time pairing');
  const result = await httpJson('POST', '/windows/relay/pair', {
    code: pairingCode,
    machineId: device.machineId,
    machineName: device.machineName,
    platform: `${os.type()} ${os.release()}`,
    relayVersion: RELAY_VERSION,
    allowedRoots,
  }, false, 15000);
  if (!result.deviceToken) throw new Error('Pairing succeeded without a device token');
  credentials = { deviceToken: result.deviceToken, pairedAt: result.pairedAt || new Date().toISOString() };
  savePrivateJson(credentialFile, credentials);
  log(`paired machineId=${device.machineId}`);
}

class McpClient {
  constructor() {
    this.proc = null;
    this.nextId = 1;
    this.pending = new Map();
    this.tools = new Map();
    this.version = null;
    this.stderrTail = '';
  }

  async start() {
    if (process.platform !== 'win32') throw new Error('This relay is intended to run on Windows');
    if (!fs.existsSync(desktopCommanderEntry)) {
      throw new Error(`Persistent Desktop Commander entry is missing: ${desktopCommanderEntry}`);
    }
    const dcEnv = {
      ...process.env,
      NO_COLOR: '1',
      ALLOWED_DIRECTORIES: allowedRoots.join(';'),
    };
    log(`desktop-commander direct entry=${desktopCommanderEntry}`);
    this.proc = spawn(process.execPath, [desktopCommanderEntry, '--no-onboarding'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false,
      env: dcEnv,
    });
    this.proc.stderr.on('data', chunk => {
      const text = String(chunk);
      this.stderrTail = (this.stderrTail + text).slice(-6000);
      log(`desktop-commander stderr: ${text.trim().slice(0, 2000)}`);
    });
    this.proc.on('exit', (code, signal) => {
      const suffix = this.stderrTail.trim() ? ` stderr=${this.stderrTail.trim().slice(-3500)}` : '';
      const error = new Error(`Desktop Commander exited code=${code} signal=${signal}${suffix}`);
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    });
    const lines = readline.createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let message;
      try { message = JSON.parse(trimmed); } catch { log(`desktop-commander non-json stdout: ${trimmed.slice(0, 1000)}`); return; }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    });

    const init = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'codespace-windows-relay', version: RELAY_VERSION },
    }, 120000);
    this.version = init?.serverInfo?.version || null;
    this.notify('notifications/initialized', {});
    const listed = await this.request('tools/list', {}, 60000);
    for (const tool of listed?.tools || []) this.tools.set(tool.name, tool);
    if (this.tools.has('set_config_value')) {
      await this.callTool('set_config_value', { key: 'allowedDirectories', value: allowedRoots });
    }
    if (this.tools.has('get_config')) {
      await this.callTool('get_config', {});
    } else {
      throw new Error('Desktop Commander get_config health tool is unavailable');
    }
    log(`desktop-commander ready version=${this.version || 'unknown'} tools=${this.tools.size} toolsCallHealth=OK`);
  }

  request(method, params, timeoutMs = 30000) {
    if (!this.proc || this.proc.exitCode !== null) return Promise.reject(new Error('Desktop Commander is not running'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method, params) {
    this.proc?.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  async callTool(name, args) {
    if (!this.tools.has(name)) throw new Error(`Desktop Commander tool unavailable: ${name}`);
    return this.request('tools/call', { name, arguments: args }, 120000);
  }

  stop() {
    if (!this.proc || this.proc.exitCode !== null || this.proc.signalCode !== null || this.proc.killed) return;
    try { this.proc.kill(); } catch {}
  }
}

function canonicalForPolicy(target) {
  const resolved = path.resolve(target);
  let probe = resolved;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const realProbe = fs.existsSync(probe) ? fs.realpathSync.native(probe) : probe;
  return path.resolve(realProbe, path.relative(probe, resolved));
}

function pathWithin(target, root) {
  const rel = path.relative(canonicalForPolicy(root), canonicalForPolicy(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function assertPathAllowed(target, roots) {
  const resolved = canonicalForPolicy(target);
  if (!roots.some(root => pathWithin(resolved, root))) throw new Error(`Path outside relay allowlist: ${target}`);
  return resolved;
}

function assertEffectiveRoots(job) {
  const roots = (job.effectiveRoots || []).map(x => path.resolve(x));
  if (!roots.length) throw new Error('Session has no effective Windows roots');
  for (const root of roots) {
    if (!allowedRoots.some(local => pathWithin(root, local))) throw new Error(`Server root exceeds local relay allowlist: ${root}`);
  }
  return roots;
}

function mcpArgs(mcp, toolName, values) {
  const schema = mcp.tools.get(toolName)?.inputSchema || {};
  const properties = schema.properties || {};
  const out = {};
  for (const [logical, candidates] of Object.entries(values)) {
    const [value, names] = candidates;
    if (value === undefined) continue;
    const key = names.find(name => Object.prototype.hasOwnProperty.call(properties, name));
    if (key) out[key] = value;
  }
  return out;
}

function mcpResult(result) {
  return { mcp: result };
}

function logicalToolsFor(mcp) {
  const set = new Set(['copyPath', 'searchFiles', 'runCommand']);
  if (mcp.tools.has('list_directory')) set.add('listDirectory');
  if (mcp.tools.has('read_file')) set.add('readFile');
  if (mcp.tools.has('write_file')) set.add('writeFile');
  if (mcp.tools.has('create_directory')) set.add('createDirectory');
  if (mcp.tools.has('move_file')) set.add('movePath');
  if (mcp.tools.has('list_processes')) set.add('listProcesses');
  set.add('deletePath');
  return [...set].sort();
}

const active = new Map();
let mcp = new McpClient();
let dcAvailable = false;

async function executeJob(job) {
  const roots = assertEffectiveRoots(job);
  const args = job.arguments || {};
  const maxOutput = Number(job.policy?.maximumOutputBytes || 1048576);
  const maxCommandSeconds = Number(job.policy?.maximumCommandSeconds || 900);
  const fail = error => ({ status: 'failed', error: { code: 'execution_error', message: String(error?.message || error) } });

  try {
    switch (job.tool) {
      case 'listDirectory': {
        const p = assertPathAllowed(args.path, roots);
        const callArgs = mcpArgs(mcp, 'list_directory', {
          path: [p, ['path']], depth: [args.depth, ['depth']],
        });
        return { status: 'completed', result: mcpResult(await mcp.callTool('list_directory', callArgs)) };
      }
      case 'readFile': {
        const p = assertPathAllowed(args.path, roots);
        const callArgs = mcpArgs(mcp, 'read_file', {
          path: [p, ['path', 'file_path']], offset: [args.offset, ['offset']], length: [args.length, ['length']],
        });
        return { status: 'completed', result: mcpResult(await mcp.callTool('read_file', callArgs)) };
      }
      case 'writeFile': {
        const p = assertPathAllowed(args.path, roots);
        if (typeof args.content !== 'string') throw new Error('writeFile requires content');
        const callArgs = mcpArgs(mcp, 'write_file', {
          path: [p, ['path', 'file_path']], content: [args.content, ['content']], mode: [args.mode || 'rewrite', ['mode']],
        });
        return { status: 'completed', result: mcpResult(await mcp.callTool('write_file', callArgs)) };
      }
      case 'createDirectory': {
        const p = assertPathAllowed(args.path, roots);
        const callArgs = mcpArgs(mcp, 'create_directory', { path: [p, ['path']] });
        return { status: 'completed', result: mcpResult(await mcp.callTool('create_directory', callArgs)) };
      }
      case 'movePath': {
        const src = assertPathAllowed(args.source, roots);
        const dst = assertPathAllowed(args.destination, roots);
        const callArgs = mcpArgs(mcp, 'move_file', {
          source: [src, ['source', 'source_path']], destination: [dst, ['destination', 'destination_path']],
        });
        return { status: 'completed', result: mcpResult(await mcp.callTool('move_file', callArgs)) };
      }
      case 'copyPath': {
        const src = assertPathAllowed(args.source, roots);
        const dst = assertPathAllowed(args.destination, roots);
        const stat = await fsp.stat(src);
        if (stat.isDirectory()) await fsp.cp(src, dst, { recursive: true, force: Boolean(args.overwrite) });
        else await fsp.copyFile(src, dst, args.overwrite ? 0 : fs.constants.COPYFILE_EXCL);
        return { status: 'completed', result: { source: src, destination: dst } };
      }
      case 'deletePath': {
        if (!job.policy?.destructiveDelete) return { status: 'denied', error: { code: 'delete_disabled', message: 'deletePath is disabled by server policy' } };
        const p = assertPathAllowed(args.path, roots);
        await fsp.rm(p, { recursive: Boolean(args.recursive), force: Boolean(args.force) });
        return { status: 'completed', result: { deleted: p } };
      }
      case 'searchFiles': {
        const base = assertPathAllowed(args.path, roots);
        const needle = String(args.pattern || '').toLowerCase();
        if (!needle) throw new Error('searchFiles requires pattern');
        const limit = Math.min(Number(args.limit || 100), 500);
        const matches = [];
        async function walk(dir) {
          if (matches.length >= limit) return;
          for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.name.toLowerCase().includes(needle)) matches.push(full);
            if (entry.isDirectory() && matches.length < limit) await walk(full);
            if (matches.length >= limit) break;
          }
        }
        await walk(base);
        return { status: 'completed', result: { matches, truncated: matches.length >= limit } };
      }
      case 'listProcesses': {
        return { status: 'completed', result: mcpResult(await mcp.callTool('list_processes', {})) };
      }
      case 'runCommand': {
        const argv = args.argv;
        if (!Array.isArray(argv) || !argv.length || argv.some(x => typeof x !== 'string')) throw new Error('runCommand requires argv');
        const cwd = assertPathAllowed(args.cwd, roots);
        const timeoutSeconds = Math.min(Number(args.timeoutSeconds || 60), maxCommandSeconds);
        const controller = { proc: null, cancelled: false };
        active.set(job.invocationId, controller);
        const result = await new Promise(resolve => {
          let stdout = '', stderr = '', truncated = false, finished = false;
          const proc = spawn(argv[0], argv.slice(1), { cwd, shell: false, windowsHide: true, env: process.env });
          controller.proc = proc;
          const append = (which, chunk) => {
            const text = String(chunk);
            if (which === 'stdout') stdout += text; else stderr += text;
            if (Buffer.byteLength(stdout) > maxOutput) { stdout = stdout.slice(-maxOutput); truncated = true; }
            if (Buffer.byteLength(stderr) > maxOutput) { stderr = stderr.slice(-maxOutput); truncated = true; }
          };
          proc.stdout?.on('data', c => append('stdout', c));
          proc.stderr?.on('data', c => append('stderr', c));
          const timer = setTimeout(() => {
            if (!finished) {
              try { spawnSync('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false }); } catch {}
            }
          }, timeoutSeconds * 1000);
          proc.on('error', error => { clearTimeout(timer); if (!finished) { finished = true; resolve({ status: 'failed', stdout, stderr, truncated, error: { code: 'spawn_error', message: error.message } }); } });
          proc.on('exit', (code, signal) => {
            clearTimeout(timer);
            if (finished) return;
            finished = true;
            const cancelled = controller.cancelled;
            resolve({
              status: cancelled ? 'cancelled' : (code === 0 ? 'completed' : 'failed'),
              exitCode: Number.isInteger(code) ? code : null, stdout, stderr, truncated,
              result: { signal, executable: path.basename(argv[0]), cwd },
              error: cancelled ? { code: 'cancelled', message: 'Command cancelled' } : (code === 0 ? null : { code: 'nonzero_exit', message: `Command exited with code ${code}` }),
            });
          });
        });
        active.delete(job.invocationId);
        return result;
      }
      default:
        return { status: 'denied', error: { code: 'unsupported_tool', message: `Unsupported logical tool: ${job.tool}` } };
    }
  } catch (error) {
    active.delete(job.invocationId);
    return fail(error);
  }
}

async function cancelInvocation(id) {
  const controller = active.get(id);
  if (!controller?.proc) return;
  controller.cancelled = true;
  try {
    spawnSync('taskkill.exe', ['/PID', String(controller.proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
  } catch {}
}

async function register() {
  let dcVersion = null;
  let dcTools = [];
  let dcError = null;
  try {
    await mcp.start();
    dcAvailable = true;
    dcVersion = mcp.version;
    dcTools = [...mcp.tools.keys()].sort();
  } catch (error) {
    dcAvailable = false;
    dcError = String(error?.stack || error?.message || error).slice(0, 4000);
    log(`desktop-commander unavailable: ${dcError}`);
  }
  const logicalTools = dcAvailable ? logicalToolsFor(mcp) : ['copyPath', 'searchFiles', 'runCommand', 'deletePath'];
  await httpJson('POST', '/windows/relay/register', {
    machineId: device.machineId,
    machineName: device.machineName,
    platform: `${os.type()} ${os.release()}`,
    relayVersion: RELAY_VERSION,
    desktopCommanderAvailable: dcAvailable,
    desktopCommanderVersion: dcVersion,
    desktopCommanderError: dcError,
    desktopCommanderTools: dcTools,
    logicalTools,
    allowedRoots,
  });
  return { dcAvailable, dcVersion, dcError, dcTools, logicalTools };
}

async function sendResult(job, result) {
  await httpJson('POST', '/windows/relay/result', {
    machineId: device.machineId,
    invocationId: job.invocationId,
    status: result.status || 'failed',
    exitCode: result.exitCode ?? null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    result: result.result || null,
    truncated: Boolean(result.truncated),
    error: result.error || null,
  });
}

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; mcp.stop(); });

try {
  await pairIfNeeded();
  const reg = await register();
  if (pairOnly) {
    console.log(`PAIR_OK machine=${device.machineName} desktopCommander=${reg.dcAvailable ? 'OK' : 'UNAVAILABLE'}`);
    if (!reg.dcAvailable && reg.dcError) console.log(`DESKTOP_COMMANDER_DIAGNOSTIC ${reg.dcError.replace(/\s+/g, ' ').slice(0, 1800)}`);
    mcp.stop();
    if (mcp.proc && mcp.proc.exitCode === null && mcp.proc.signalCode === null) {
      await new Promise(resolve => mcp.proc.once('exit', resolve));
    }
    process.exitCode = 0;
  } else {
    log(`relay started gateway=${gateway} machine=${device.machineId}`);
    let worker = null;
    while (!stopping) {
      try {
        const poll = await httpJson('POST', '/windows/relay/poll', {
          machineId: device.machineId,
          waitSeconds: 15,
          availableSlots: worker ? 0 : 1,
        }, true, 25000);
        for (const id of poll.cancelInvocationIds || []) await cancelInvocation(id);
        if (poll.job && !worker) {
          const job = poll.job;
          worker = executeJob(job)
            .then(result => sendResult(job, result))
            .catch(error => log(`job result error invocation=${job.invocationId}: ${error.message}`))
            .finally(() => { worker = null; });
        }
      } catch (error) {
        log(`poll error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
} catch (error) {
  log(`fatal: ${error.stack || error.message}`);
  console.error(`RELAY_ERROR: ${error.message}`);
  mcp.stop();
  process.exit(1);
}
