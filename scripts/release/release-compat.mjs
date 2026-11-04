import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import * as ts from 'typescript-lsp-runtime';
import { CURRENT_LINE_BASELINE_REF, ROOT } from './release-lib.mjs';
import { compareMcpContracts, MCP_REGISTRATION_FILES } from './mcp-contract.mjs';

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
  const relative = file.replaceAll('\\', '/');
  const listed = await git(['ls-tree', '--name-only', CURRENT_LINE_BASELINE_REF, '--', relative]);
  return listed.trim() ? git(['show', `${CURRENT_LINE_BASELINE_REF}:${relative}`]) : null;
}

function toolNames(text) {
  if (!text) return [];
  const names = new Set();
  for (const match of text.matchAll(/\bregisterTool\(\s*['"]([^'"]+)['"]/g)) names.add(match[1]);
  for (const match of text.matchAll(/\btool\(\s*server\s*,\s*['"]([^'"]+)['"]/g)) names.add(match[1]);
  return [...names].sort();
}

export function publicRoutes(text) {
  if (!text) return [];
  const routes = new Set();
  for (const match of text.matchAll(/(?:route|pathname)\s*===?\s*['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/')) routes.add(match[1]);
  }
  for (const match of text.matchAll(/request\.url[^\n]*['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('/')) routes.add(match[1]);
  }
  const source = ts.createSourceFile('routes.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'match' && ts.isIdentifier(node.expression.expression)
      && ['route', 'pathname'].includes(node.expression.expression.text)
      && node.arguments[0] && ts.isRegularExpressionLiteral(node.arguments[0])) {
      routes.add(`regex:${node.arguments[0].getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...routes].sort();
}

function diff(left, right) {
  const b = new Set(right);
  return left.filter(item => !b.has(item));
}

function registeredManifest(server) {
  const registrations = server._registeredTools ?? server.registeredTools;
  const entries = registrations instanceof Map ? [...registrations.entries()] : Object.entries(registrations ?? {});
  return { tools: entries.map(([name, tool]) => ({
    name, title: tool.title, description: tool.description,
    inputSchema: tool.inputSchema?.toJSONSchema ? tool.inputSchema.toJSONSchema() : {},
    annotations: tool.annotations ?? {},
  })).sort((a, b) => a.name.localeCompare(b.name)) };
}
const serializedBytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const MANIFEST_BYTE_BUDGET = 128 * 1024;
const MANIFEST_TOKEN_BUDGET = 32_768;
function manifestMetrics(manifest) {
  const bytes = serializedBytes(manifest), approximateTokens = Math.ceil(bytes / 4);
  return { toolCount: manifest.tools.length, bytes, approximateTokens,
    byteBudget: MANIFEST_BYTE_BUDGET, tokenBudget: MANIFEST_TOKEN_BUDGET,
    exceeded: bytes > MANIFEST_BYTE_BUDGET || approximateTokens > MANIFEST_TOKEN_BUDGET };
}

async function imageBaseline(ref, image) {
  if (!/^[a-f0-9]{40}$/i.test(ref)) throw new Error('Manifest image baseline requires an exact commit SHA');
  const z = await import('zod/v4');
  const variables = text => {
    const sf = ts.createSourceFile('schema.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const values = new Map();
    for (const statement of sf.statements) if (ts.isVariableStatement(statement))
      for (const item of statement.declarationList.declarations)
        if (ts.isIdentifier(item.name) && item.initializer) values.set(item.name.text, item.initializer);
    return { sf, values };
  };
  // Evaluate only the pinned schema producer, not an inspector, file reader or tool handler.
  const schemaSource = variables(await git(['show', ref + ':src/rdc/tools/image-inspect.ts']));
  const declarations = ['OUTPUT_EDGE', 'base', 'imageInspectSchema'].map(name => {
    const node = schemaSource.values.get(name);
    if (!node) throw new Error('Pinned image schema shape is unsupported: ' + name);
    return 'const ' + name + ' = ' + node.getText(schemaSource.sf) + ';';
  }).join('\n');
  const schema = new Function('z', declarations + '\nreturn imageInspectSchema;')(z);
  const metadataSource = variables(await git(['show', ref + ':src/mcp/rdc-tool-metadata.ts']));
  let metadataObject = metadataSource.values.get('RDC_TOOL_METADATA');
  while (metadataObject && (ts.isAsExpression(metadataObject) || ts.isSatisfiesExpression(metadataObject)
    || ts.isParenthesizedExpression(metadataObject))) metadataObject = metadataObject.expression;
  if (!metadataObject || !ts.isObjectLiteralExpression(metadataObject)) throw new Error('Pinned metadata is not an object literal');
  const item = metadataObject.properties.find(prop => prop.name?.getText(metadataSource.sf) === 'image_inspect');
  const guidance = metadataSource.values.get('PATH_GUIDANCE');
  if (!item?.initializer || !guidance) throw new Error('Pinned image metadata unavailable');
  const system = await import(pathToFileURL(path.join(ROOT, 'dist/rdc/utils/system-info.js')).href);
  const pathGuidance = new Function('getPathGuidance', 'SYSTEM_INFO', 'return ' + guidance.getText(metadataSource.sf))
    (system.getPathGuidance, system.getSystemInfo());
  const metadata = new Function('PATH_GUIDANCE', 'return (' + item.initializer.getText(metadataSource.sf) + ');')(pathGuidance);
  const { title, ...hints } = metadata.annotations;
  const baselineNode = { name: 'image_inspect', title: metadata.title,
    description: metadata.description.replace(/^[ \t]{24}/gm, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
    inputSchema: schema.toJSONSchema(), annotations: title === metadata.title ? hints : metadata.annotations };
  return { ref, basis: 'pinned source schema/metadata; same installed Zod, Windows path guidance and serializer',
    baselineNodeBytes: serializedBytes(baselineNode), currentNodeBytes: serializedBytes(image),
    deltaBytes: serializedBytes(image) - serializedBytes(baselineNode), allowedDeltaBytes: 256,
    withinDelta: serializedBytes(image) - serializedBytes(baselineNode) <= 256 };
}

export async function builtManifestBudget(options = {}) {
  const serverPath = path.join(ROOT, 'dist', 'mcp', 'server.js');
  try {
    const stat = await fs.stat(serverPath);
    const sourceStats = await Promise.all([...mcpFiles, ...schemaFiles].map(async file =>
      (await fs.stat(path.join(ROOT, file))).mtimeMs));
    const stale = Math.max(...sourceStats) > stat.mtimeMs;
    const mod = await import(`${pathToFileURL(serverPath).href}?compat=${stat.mtimeMs}`);
    // This is the exact reviewed cohort, not a claim about all optional runtime tools.
    const runtime = { memoryService: {}, learningService: {}, semanticIde: {}, skillsService: {},
      phoneController: { enabled: true }, codeIntelligence: {}, webResearch: {}, artifactAuthorization: {} };
    const manifest = registeredManifest(mod.createAgentCoreMcpServer(undefined, runtime));
    const image = manifest.tools.find(tool => tool.name === 'image_inspect');
    const result = { available: true, stale, cohort: 'reviewed-registration-without-memory-v2-and-controller-learning',
      ...manifestMetrics(manifest),
      imageNodeBytes: serializedBytes(image), imageDescriptionBytes: Buffer.byteLength(image.description, 'utf8') };
    if (options.imageBaseline) result.imageBaseline = await imageBaseline(options.imageBaseline, image);
    if (options.output) {
      // Use the same compiled registrations, never a manually maintained schema copy.
      const expanded = mod.createAgentCoreMcpServer(undefined, { ...runtime, memoryExperience: {} });
      const memoryManifest = registeredManifest(expanded);
      const { registerControllerLearningTools } = await import(pathToFileURL(path.join(ROOT, 'dist/mcp/controller-learning-tools.js')).href);
      // Schema generation only: no authenticated owner, task binding or tool invocation is fabricated.
      registerControllerLearningTools(expanded, undefined, undefined);
      const full = registeredManifest(expanded);
      const raw = JSON.stringify(full), output = path.resolve(ROOT, options.output);
      if (stale) throw new Error('Refusing schema artifact from a stale build');
      if (path.dirname(output) !== path.join(ROOT, 'docs', 'memory') || !output.endsWith('.json'))
        throw new Error('Schema artifact output must be a JSON file in docs/memory');
      result.optionalCohorts = { memoryV2: manifestMetrics(memoryManifest), withController: manifestMetrics(full) };
      result.optionalCohorts.withController.budgetVerdict = result.optionalCohorts.withController.exceeded ? 'exceeded' : 'within-budget';
      result.exceeded ||= Object.values(result.optionalCohorts).some(cohort => cohort.exceeded);
      if (result.exceeded) throw new Error('Optional MCP cohort handshake budget exceeded; artifact was not written');
      await fs.writeFile(output, raw, { encoding: 'utf8', flag: 'wx' });
      const { createHash } = await import('node:crypto');
      result.artifact = { path: output, bytes: Buffer.byteLength(raw, 'utf8'), sha256: createHash('sha256').update(raw).digest('hex'),
        kind: 'compiled-MCP-schema-snapshot-not-plugin-ZIP', source: 'existing native registration and Zod schemas',
        retrievalPlan: Boolean(full.tools.find(tool => tool.name === 'controller_learning')?.inputSchema?.properties?.retrievalPlan),
        review: image.inputSchema?.properties?.action?.enum?.includes('review') === true };
    }
    return result;
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const mcpFiles = MCP_REGISTRATION_FILES;
const routeFiles = ['src/http/app.ts', 'src/oauth/service.ts'];
export const schemaFiles = [
  'src/mcp/rdc-schemas.ts',
  'src/mcp/rdc-tool-metadata.ts',
  'src/memory/mcp/schemas.ts',
  'src/mcp/learning-schemas.ts',
  'src/mcp/semantic-ide-schemas.ts',
  'src/mcp/skills-schemas.ts',
  'src/mcp/phone-schemas.ts',
  'src/mcp/phone-game-schemas.ts',
  'src/mcp/code-intelligence-schemas.ts',
  'src/mcp/web-research-schemas.ts',
  'src/mcp/controller-learning-schemas.ts',
  'src/mcp/controller-learning-tools.ts',
  'src/memory/subquestion-retrieval.ts',
  'src/rdc/tools/image-inspect.ts',
  'src/rdc/tools/image-review.ts',
];

export function manifestBudgetExitCode(result) {
  // Surface cardinality is pinned per cohort by contract tests, not a different cohort's count.
  return result?.available === true && result.stale === false && result.exceeded === false
    && Object.values(result.optionalCohorts ?? {}).every(cohort => cohort.exceeded === false)
    && (result.imageBaseline === undefined || result.imageBaseline?.withinDelta === true) ? 0 : 2;
}

export async function main(args = process.argv.slice(2)) {
  // Explicit export uses this existing registration serializer, not another generator.
  if (args.includes('--manifest-only')) {
    const option = name => {
      const index = args.indexOf(name);
      if (index < 0) return undefined;
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
      return value;
    };
    const result = await builtManifestBudget({ output: option('--output'), imageBaseline: option('--image-baseline') });
    console.log(JSON.stringify(result, null, 2));
    return manifestBudgetExitCode(result);
  }
  await git(['rev-parse', '--verify', `${CURRENT_LINE_BASELINE_REF}^{commit}`]);
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
  result.ok = !result.breakingEvidence && manifestBudgetExitCode(manifestBudget) === 0;

  console.log(JSON.stringify(result, null, 2));
  return result.ok ? 0 : 2;
}

export function isMainModule(moduleUrl, entry = process.argv[1]) {
  if (!entry) return false;
  try { return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entry); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main();
}
