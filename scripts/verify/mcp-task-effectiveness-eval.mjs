import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { redactSensitiveValue } from '../../dist/security/redaction.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_EVIDENCE_ROOT = path.join(ROOT, 'runtime', 'tmp', 'mcp-task-effectiveness');
const MAX_TASKS = 100;
const MAX_STEPS = 16;
const MAX_CONTROLLER_STDOUT = 512 * 1024;
const MAX_TOOL_TEXT = 120 * 1024;

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function safeEndpoint(raw) {
  const url = new URL(raw);
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('MCP_EFFECTIVENESS_INSECURE_ENDPOINT');
  if (url.username || url.password) throw new Error('MCP_EFFECTIVENESS_CREDENTIAL_URL_REFUSED');
  return url;
}
function inside(candidate, root) {
  const child = path.resolve(candidate);
  const parent = path.resolve(root);
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const c = normalize(child), p = normalize(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}
function digest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');
}
async function hashFile(file) {
  return digest(await fs.readFile(file));
}
function boundedText(value, max = MAX_TOOL_TEXT) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? text.slice(0, max) + '\n[truncated]' : text;
}
function toolView(tools) {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    annotations: tool.annotations ?? {},
  })).sort((a, b) => a.name.localeCompare(b.name));
}
export function flattenToolResult(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const parts = [];
  for (const block of blocks) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block?.type === 'image') parts.push('[image result omitted]');
    else if (block?.type === 'resource' || block?.type === 'resource_link') parts.push('[resource result]');
  }
  if (result?.structuredContent !== undefined) parts.push(boundedText(result.structuredContent));
  return boundedText(parts.join('\n').trim() || result || '');
}
async function readFixture(file) {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.tasks) || !parsed.tasks.length || parsed.tasks.length > MAX_TASKS) {
    throw new Error('MCP_EFFECTIVENESS_FIXTURE_INVALID');
  }
  const ids = new Set();
  const tasks = parsed.tasks.map((task, index) => {
    const id = String(task.id ?? '').trim();
    const question = String(task.question ?? '').trim();
    const expected = String(task.expected ?? '');
    if (!id || id.length > 100 || ids.has(id) || !question || question.length > 8000 || expected.length > 8000) {
      throw new Error('MCP_EFFECTIVENESS_TASK_INVALID:' + index);
    }
    ids.add(id);
    return {
      id,
      question,
      expected,
      readOnly: task.readOnly !== false,
      maxSteps: Math.max(1, Math.min(MAX_STEPS, Number.isInteger(task.maxSteps) ? task.maxSteps : MAX_STEPS)),
    };
  });
  return { schemaVersion: 1, tasks };
}
async function runController(command, payload, timeoutMs) {
  const [exe, ...prefix] = command;
  if (!exe) throw new Error('MCP_EFFECTIVENESS_CONTROLLER_REQUIRED');
  return new Promise((resolve, reject) => {
    const child = spawn(exe, prefix, { cwd: ROOT, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    let outBytes = 0;
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error('MCP_EFFECTIVENESS_CONTROLLER_TIMEOUT'));
    }, timeoutMs);
    child.stdout.on('data', chunk => {
      const buffer = Buffer.from(chunk);
      outBytes += buffer.length;
      if (outBytes <= MAX_CONTROLLER_STDOUT) stdout.push(buffer);
    });
    child.stderr.on('data', chunk => {
      if (Buffer.concat(stderr).length < 64 * 1024) stderr.push(Buffer.from(chunk));
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('MCP_EFFECTIVENESS_CONTROLLER_EXIT_' + code));
      if (outBytes > MAX_CONTROLLER_STDOUT) return reject(new Error('MCP_EFFECTIVENESS_CONTROLLER_OUTPUT_TOO_LARGE'));
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad json');
        resolve(parsed);
      } catch {
        reject(new Error('MCP_EFFECTIVENESS_CONTROLLER_JSON_INVALID'));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
function parseCommand(raw) {
  if (!raw?.trim()) return [];
  if (raw.trim().startsWith('[')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some(x => typeof x !== 'string')) throw new Error('MCP_EFFECTIVENESS_CONTROLLER_COMMAND_INVALID');
    return parsed;
  }
  return [raw.trim()];
}
async function writePrivateJson(file, value) {
  const content = JSON.stringify(redactSensitiveValue(value), null, 2) + '\n';
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
}

export async function runMcpTaskEffectiveness(options = {}) {
  const fixturePath = path.resolve(options.fixture);
  const fixture = await readFixture(fixturePath);
  const controllerCommand = Array.isArray(options.controllerCommand) ? options.controllerCommand : parseCommand(options.controllerCommand);
  if (!controllerCommand.length) throw new Error('MCP_EFFECTIVENESS_CONTROLLER_REQUIRED');
  const controllerTimeoutMs = Math.max(1000, Math.min(10 * 60_000, options.controllerTimeoutMs ?? 120_000));
  const url = safeEndpoint(options.url ?? 'http://127.0.0.1:8765/mcp');
  const bearerEnv = options.bearerEnv ?? 'AGENT_CORE_ACCEPTANCE_BEARER_TOKEN';
  const bearer = process.env[bearerEnv]?.trim();
  const evidenceBase = path.resolve(options.evidenceRoot ?? DEFAULT_EVIDENCE_ROOT);
  if (!inside(evidenceBase, DEFAULT_EVIDENCE_ROOT)) throw new Error('MCP_EFFECTIVENESS_EVIDENCE_OUTSIDE_RUNTIME_TMP');
  const runDir = path.join(evidenceBase, new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(runDir, { recursive: true, mode: 0o700 });

  const guardFiles = [...new Set((options.guardFiles ?? []).map(file => path.resolve(file)))];
  const guardsBefore = Object.fromEntries(await Promise.all(guardFiles.map(async file => [file, await hashFile(file)])));
  const transport = new StreamableHTTPClientTransport(url, {
    ...(bearer ? { authProvider: { token: async () => bearer } } : {}),
    onInsufficientScope: 'throw',
    maxStepUpRetries: 0,
    reconnectionOptions: { initialReconnectionDelay: 200, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1.5, maxRetries: 0 },
  });
  const client = new Client({ name: 'agent-core-mcp-effectiveness-eval', version: '1.0.0' }, { listMaxPages: 8 });

  try {
    await client.connect(transport);
    const listed = await client.listTools(undefined, { cacheMode: 'refresh' });
    const tools = toolView(listed.tools ?? []);
    const manifestFingerprint = digest(JSON.stringify(tools));
    const results = [];

    for (const task of fixture.tasks) {
      const started = performance.now();
      const transcript = [];
      const toolMetrics = {};
      let answer = '';
      let feedback = '';
      let complete = false;
      let error;

      for (let step = 1; step <= task.maxSteps; step++) {
        let decision;
        try {
          decision = await runController(controllerCommand, {
            schemaVersion: 1,
            task: { id: task.id, question: task.question, readOnly: task.readOnly },
            step,
            tools,
            transcript,
          }, controllerTimeoutMs);
        } catch (failure) {
          error = failure instanceof Error ? failure.message : String(failure);
          break;
        }
        if (typeof decision.answer === 'string') {
          answer = decision.answer;
          feedback = typeof decision.feedback === 'string' ? decision.feedback.slice(0, 4000) : '';
          complete = true;
          break;
        }
        const calls = Array.isArray(decision.toolCalls) ? decision.toolCalls : [];
        if (!calls.length || calls.length > 8) {
          error = 'MCP_EFFECTIVENESS_CONTROLLER_DECISION_INVALID';
          break;
        }
        for (const call of calls) {
          const name = String(call?.name ?? '');
          const tool = tools.find(row => row.name === name);
          if (!tool) { error = 'MCP_EFFECTIVENESS_UNKNOWN_TOOL:' + name; break; }
          if (task.readOnly && tool.annotations?.readOnlyHint !== true) {
            error = 'MCP_EFFECTIVENESS_NON_READ_ONLY_TOOL_REFUSED:' + name;
            break;
          }
          const args = call?.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments) ? call.arguments : {};
          const toolStarted = performance.now();
          let result, isError = false;
          try {
            const raw = await client.callTool({ name, arguments: args });
            isError = raw.isError === true;
            result = flattenToolResult(raw);
          } catch (failure) {
            isError = true;
            result = failure instanceof Error ? failure.message : String(failure);
          }
          const durationMs = Math.round((performance.now() - toolStarted) * 1000) / 1000;
          const metric = toolMetrics[name] ?? { count: 0, durationsMs: [] };
          metric.count += 1; metric.durationsMs.push(durationMs); toolMetrics[name] = metric;
          transcript.push({ step, tool: name, arguments: args, result, isError, durationMs });
        }
        if (error) break;
      }

      const durationMs = Math.round((performance.now() - started) * 1000) / 1000;
      const correct = complete && answer === task.expected;
      results.push({
        id: task.id,
        question: task.question,
        expected: task.expected,
        actual: answer,
        correct,
        complete,
        durationMs,
        toolCalls: Object.values(toolMetrics).reduce((n, row) => n + row.count, 0),
        toolMetrics,
        feedback,
        ...(error ? { error } : {}),
        transcript,
      });
    }

    const guardsAfter = Object.fromEntries(await Promise.all(guardFiles.map(async file => [file, await hashFile(file)])));
    const changedGuards = guardFiles.filter(file => guardsBefore[file] !== guardsAfter[file]);
    const complete = results.every(row => row.complete && !row.error) && changedGuards.length === 0;
    const correct = results.filter(row => row.correct).length;
    const totalToolCalls = results.reduce((sum, row) => sum + row.toolCalls, 0);
    const report = {
      schemaVersion: 1,
      ok: complete,
      complete,
      endpoint: url.origin + url.pathname,
      authenticated: Boolean(bearer),
      manifestFingerprint,
      fixtureFingerprint: await hashFile(fixturePath),
      taskCount: results.length,
      correct,
      accuracy: results.length ? correct / results.length : 0,
      averageTaskDurationMs: results.length ? results.reduce((sum, row) => sum + row.durationMs, 0) / results.length : 0,
      averageToolCalls: results.length ? totalToolCalls / results.length : 0,
      totalToolCalls,
      changedGuards,
      generatedAt: new Date().toISOString(),
      results,
    };
    await writePrivateJson(path.join(runDir, 'report.json'), report);
    return { ...report, evidenceDir: runDir };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function integer(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('MCP_EFFECTIVENESS_INTEGER_INVALID');
  return parsed;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = arg('--fixture');
  const controller = arg('--controller');
  if (!fixture || !controller) {
    console.error('Usage: node scripts/verify/mcp-task-effectiveness-eval.mjs --fixture <json> --controller <exe|json-array> [--url <mcp>] [--guard <file>]');
    process.exitCode = 2;
  } else {
    const guards = [];
    for (let i = 0; i < process.argv.length; i += 1) if (process.argv[i] === '--guard' && process.argv[i + 1]) guards.push(process.argv[i + 1]);
    runMcpTaskEffectiveness({
      fixture,
      controllerCommand: controller,
      url: arg('--url') ?? 'http://127.0.0.1:8765/mcp',
      bearerEnv: arg('--bearer-env') ?? 'AGENT_CORE_ACCEPTANCE_BEARER_TOKEN',
      evidenceRoot: arg('--evidence-root'),
      controllerTimeoutMs: integer(arg('--controller-timeout-ms'), 120_000),
      guardFiles: guards,
    }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
      console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
      process.exitCode = 1;
    });
  }
}
