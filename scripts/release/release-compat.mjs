import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { CURRENT_LINE_BASELINE_REF, ROOT } from './release-lib.mjs';
import { compareMcpContracts } from './mcp-contract.mjs';

function git(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', `safe.directory=${ROOT.replaceAll('\\', '/')}`, '-C', ROOT, ...args], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(' ')} failed (${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

async function current(file) {
  try { return await fs.readFile(path.join(ROOT, file), 'utf8'); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function baseline(file) {
  try { return await git(['show', `${CURRENT_LINE_BASELINE_REF}:${file.replaceAll('\\', '/')}`]); }
  catch { return null; }
}

function toolNames(text) {
  if (!text) return [];
  const names = new Set();
  for (const match of text.matchAll(/\bregisterTool\(\s*['"]([^'"]+)['"]/g)) names.add(match[1]);
  for (const match of text.matchAll(/\btool\(\s*server\s*,\s*['"]([^'"]+)['"]/g)) names.add(match[1]);
  return [...names].sort();
}

function publicRoutes(text) {
  if (!text) return [];
  const routes = new Set();
  for (const match of text.matchAll(/(?:route|pathname)\s*===?\s*['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/')) routes.add(match[1]);
  }
  for (const match of text.matchAll(/request\.url[^\n]*['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/')) routes.add(match[1]);
  }
  return [...routes].sort();
}

function diff(left, right) {
  const b = new Set(right);
  return left.filter(item => !b.has(item));
}

async function builtManifestBudget() {
  const serverPath = path.join(ROOT, 'dist', 'mcp', 'server.js');
  try {
    const stat = await fs.stat(serverPath);
    const sourceStats = await Promise.all([...mcpFiles, ...schemaFiles].map(async file => {
      try { return (await fs.stat(path.join(ROOT, file))).mtimeMs; } catch { return 0; }
    }));
    const stale = Math.max(...sourceStats) > stat.mtimeMs;
    const mod = await import(`${pathToFileURL(serverPath).href}?compat=${stat.mtimeMs}`);
    const runtime = {
      memoryService: {}, learningService: {}, hermesPartner: {}, semanticIde: {},
      phoneController: { enabled: true }, codeIntelligence: {},
    };
    const server = mod.createAgentCoreMcpServer(undefined, runtime);
    const registrations = server._registeredTools ?? server.registeredTools;
    const entries = registrations instanceof Map ? [...registrations.entries()] : Object.entries(registrations ?? {});
    const tools = entries.map(([name, tool]) => ({
      name, title: tool.title, description: tool.description,
      inputSchema: tool.inputSchema?.toJSONSchema ? tool.inputSchema.toJSONSchema() : {},
      annotations: tool.annotations ?? {},
    })).sort((a, b) => a.name.localeCompare(b.name));
    const bytes = Buffer.byteLength(JSON.stringify({ tools }), 'utf8');
    const approximateTokens = Math.ceil(bytes / 4);
    return { available: true, stale, toolCount: tools.length, bytes, approximateTokens, byteBudget: 120000, tokenBudget: 30000, exceeded: bytes > 120000 || approximateTokens > 30000 };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const mcpFiles = [
  'src/mcp/server.ts',
  'src/mcp/memory-tools.ts',
  'src/mcp/learning-tools.ts',
  'src/mcp/partner-tools.ts',
  'src/mcp/semantic-ide-tools.ts',
  'src/mcp/phone-tools.ts',
  'src/mcp/code-intelligence-tools.ts',
];
const routeFiles = ['src/http/app.ts', 'src/oauth/service.ts'];
const schemaFiles = [
  'src/mcp/rdc-schemas.ts',
  'src/mcp/memory-schemas.ts',
  'src/mcp/learning-schemas.ts',
  'src/mcp/partner-schemas.ts',
  'src/mcp/semantic-ide-schemas.ts',
  'src/mcp/phone-schemas.ts',
  'src/mcp/code-intelligence-schemas.ts',
];

const currentTools = new Set();
const baselineTools = new Set();
for (const file of mcpFiles) {
  for (const name of toolNames(await current(file))) currentTools.add(name);
  for (const name of toolNames(await baseline(file))) baselineTools.add(name);
}

const currentRoutes = new Set();
const baselineRoutes = new Set();
for (const file of routeFiles) {
  for (const route of publicRoutes(await current(file))) currentRoutes.add(route);
  for (const route of publicRoutes(await baseline(file))) baselineRoutes.add(route);
}

const changedSchemas = [];
for (const file of schemaFiles) {
  const [before, after] = await Promise.all([baseline(file), current(file)]);
  if (before !== after) changedSchemas.push(file);
}

const [mcpContract, manifestBudget] = await Promise.all([
  compareMcpContracts(current, baseline),
  builtManifestBudget(),
]);

const result = {
  baselineRef: CURRENT_LINE_BASELINE_REF,
  tools: {
    baselineCount: baselineTools.size,
    currentCount: currentTools.size,
    removed: diff([...baselineTools], [...currentTools]),
    added: diff([...currentTools], [...baselineTools]),
  },
  routes: {
    baseline: [...baselineRoutes].sort(),
    current: [...currentRoutes].sort(),
    removed: diff([...baselineRoutes], [...currentRoutes]),
    added: diff([...currentRoutes], [...baselineRoutes]),
  },
  schemaReviewRequired: changedSchemas.sort(),
  mcpContract,
  manifestBudget,
};
result.breakingEvidence = result.tools.removed.length > 0
  || result.routes.removed.length > 0
  || mcpContract.breakingEvidence;
result.verificationIssues = [
  ...(manifestBudget.available && manifestBudget.stale ? ['built MCP manifest is stale relative to source'] : []),
  ...(!manifestBudget.available ? ['built MCP manifest unavailable'] : []),
  ...(manifestBudget.available && manifestBudget.exceeded ? ['MCP handshake budget exceeded'] : []),
];
result.ok = !result.breakingEvidence && !(manifestBudget.available && manifestBudget.exceeded);

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 2;
