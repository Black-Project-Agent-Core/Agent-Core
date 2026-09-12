import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { API, SymbolFlags, type Symbol as CompilerSymbol, type Project } from 'typescript/unstable/async';
import type { FileSystem } from 'typescript/unstable/fs';
import * as ast from 'typescript/unstable/ast';
import { WorkflowError } from './types.js';
import { engineeringInventoryRecord, type EngineeringInventory, type EngineeringImpactResult, type EngineeringSymbol } from './engineering-types.js';

const TSJS = /\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/i;
const OTHER_CODE = /\.(?:py|go|rs|java|kt|kts|c|h|cc|cpp|cxx|hpp|cs|swift|rb|php|lua|sh|bash|ps1|bat|cmd|pl|ex|exs|erl|hs|scala|dart|r|sql|vue|svelte|zig|nim|jl|clj|f|f90|pas|m|mm|sol)$/i;
const canonical = (file: string) => {
  const absolute = path.resolve(file).replaceAll('\\', '/');
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
/** All callbacks are supplied. In particular, undefined from readFile would allow real-FS fallback. */
export function engineeringVirtualFileSystem(documents: ReadonlyMap<string, string>): FileSystem {
  const files = new Map([...documents].map(([file, text]) => [canonical(file), text]));
  const directories = new Map<string, { files: Set<string>; directories: Set<string> }>();
  for (const file of files.keys()) {
    let current = file, isFile = true;
    while (true) {
      const parent = canonical(path.dirname(current));
      if (parent === current) break;
      const entry = directories.get(parent) ?? { files: new Set<string>(), directories: new Set<string>() };
      (isFile ? entry.files : entry.directories).add(path.basename(current)); directories.set(parent, entry);
      current = parent; isFile = false;
    }
  }
  return Object.freeze({
    readFile: (file: string) => files.get(canonical(file)) ?? null,
    fileExists: (file: string) => files.has(canonical(file)),
    directoryExists: (directory: string) => directories.has(canonical(directory)),
    getAccessibleEntries: (directory: string) => {
      const entry = directories.get(canonical(directory));
      return { files: [...entry?.files ?? []].sort(), directories: [...entry?.directories ?? []].sort() };
    },
    realpath: (file: string) => canonical(file),
    writeFile: () => { throw new WorkflowError('WORKFLOW_ENGINEERING_PARSER_READ_ONLY', 'Source analysis cannot write files'); },
    removeFile: () => { throw new WorkflowError('WORKFLOW_ENGINEERING_PARSER_READ_ONLY', 'Source analysis cannot remove files'); },
  });
}

export interface EngineeringParserOptions { maxIdentifiers?: number; maxNodes?: number; maxCallers?: number; timeoutMs?: number }
/** Static identities are compiler-backed for captured TS/JS only; this does not certify dynamic/external consumers. */
export async function analyzeEngineeringImpact(inventory: EngineeringInventory, targetPaths: string[], options: EngineeringParserOptions = {}): Promise<EngineeringImpactResult> {
  if (!targetPaths.length || targetPaths.length > 300) throw new WorkflowError('WORKFLOW_ENGINEERING_TARGETS_INVALID', 'Select between 1 and 300 target paths');
  const targets = [...new Set(targetPaths.map(file => path.resolve(inventory.root, file)))];
  const entryByPath = new Map(inventory.entries.map(entry => [canonical(entry.path), entry]));
  for (const target of targets) {
    const relative = path.relative(inventory.root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new WorkflowError('WORKFLOW_ENGINEERING_TARGET_OUTSIDE_SCOPE', 'Impact targets must stay inside the captured project');
  }
  const coverage = { ...inventory.coverage, gaps: [...inventory.coverage.gaps], exclusions: [...inventory.coverage.exclusions] };
  const result: EngineeringImpactResult = { inventory: engineeringInventoryRecord(inventory), targets, symbols: [], callers: [], coverage, analysisLevel: 'lexical', limitations: [] };
  const limitation = (file: string, reason: string) => { if (!result.limitations.some(item => item.path === file && item.reason === reason)) result.limitations.push({ path: file, reason }); };
  const gap = (file: string, reason: string, truncated = false) => { coverage.complete = false; coverage.truncated ||= truncated; coverage.gaps.push({ path: file, reason }); };
  const maxIdentifiers = options.maxIdentifiers ?? 50_000, maxNodes = options.maxNodes ?? 250_000, maxCallers = options.maxCallers ?? 20_000;
  for (const [name, value, ceiling] of [['maxIdentifiers', maxIdentifiers, 100_000], ['maxNodes', maxNodes, 500_000], ['maxCallers', maxCallers, 20_000], ['timeoutMs', options.timeoutMs ?? 120_000, 300_000]] as const) {
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new WorkflowError('WORKFLOW_ENGINEERING_BOUND_INVALID', `${name} is outside its supported bound`);
  }
  const targetSet = new Set(targets.map(canonical));
  for (const target of targets) if (!entryByPath.has(canonical(target))) {
    const excluded = inventory.coverage.exclusions.some(relative => containsPath(path.resolve(inventory.root, relative), target));
    const unreadable = inventory.coverage.gaps.some(item => containsPath(item.path, target));
    const nonCodeTarget = inventory.nonCodePaths?.has(process.platform === 'win32' ? path.resolve(target).toLowerCase() : path.resolve(target));
    if (nonCodeTarget && !unreadable && await safelyExistingDocument(inventory.root, target)) {
      limitation(target, 'NON_CODE_TARGET_SOURCE_READ_REQUIRED');
    } else if (!excluded && !unreadable && await safelyExistingDirectory(inventory.root, target)) {
      for (const entry of inventory.entries) if (containsPath(target, entry.path)) targetSet.add(canonical(entry.path));
      limitation(target, 'TARGET_DIRECTORY_SCOPE');
    } else if (!excluded && !unreadable && await safelyMissingTarget(inventory.root, target)) limitation(target, 'TARGET_MISSING_NEW_PATH');
    else gap(target, 'TARGET_NOT_CAPTURED');
  }
  const sourceEntries = inventory.entries.filter(entry => TSJS.test(entry.path));
  const otherEntries = inventory.entries.filter(entry => OTHER_CODE.test(entry.path));
  for (const entry of otherEntries) limitation(entry.path, 'UNSUPPORTED_LANGUAGE_LEXICAL_ONLY');
  const callerKeys = new Map<string, number>();
  const addCaller = (symbol: EngineeringSymbol, file: string, line: number, kind: 'call' | 'reference') => {
    const entry = entryByPath.get(canonical(file)); if (!entry) return;
    const key = `${symbol.id}\0${canonical(file)}\0${line}`, previous = callerKeys.get(key);
    if (previous !== undefined) { if (kind === 'call') result.callers[previous]!.kind = 'call'; return; }
    if (result.callers.length >= maxCallers) { if (!coverage.gaps.some(item => item.reason === 'CALLER_LIMIT')) gap(file, 'CALLER_LIMIT', true); return; }
    callerKeys.set(key, result.callers.length); result.callers.push({ symbolId: symbol.id, path: entry.path, line, kind, sourceHash: entry.hash });
  };

  // Unsupported source can provide lexical leads, never compiler identity or a complete caller claim.
  let lexicalBytes = 0;
  lexical: for (const entry of otherEntries.filter(entry => targetSet.has(canonical(entry.path)))) {
    const lines = inventory.documents.get(entry.path)!.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const match = /\b(?:def|func|fn|function|class|sub)\s+([A-Za-z_$][\w$]*)/.exec(lines[index]!); if (!match) continue;
      if (result.symbols.length >= 10_000) { gap(entry.path, 'SYMBOL_LIMIT', true); break lexical; }
      const symbol: EngineeringSymbol = { id: hash(`${canonical(entry.path)}\0${entry.hash}\0${index}\0${match[1]}`), name: match[1]!, path: entry.path, line: index + 1, sourceHash: entry.hash };
      result.symbols.push(symbol);
      const expression = new RegExp(`\\b${symbol.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      for (const candidate of [...sourceEntries, ...otherEntries]) {
        const candidateLines = inventory.documents.get(candidate.path)!.split(/\r?\n/);
        for (let cursor = 0; cursor < candidateLines.length; cursor++) {
          lexicalBytes += Buffer.byteLength(candidateLines[cursor]!, 'utf8');
          if (lexicalBytes > 64 * 1024 * 1024) { gap(candidate.path, 'LEXICAL_SCAN_LIMIT', true); break lexical; }
          if (!(candidate.path === entry.path && cursor === index) && expression.test(candidateLines[cursor]!)) addCaller(symbol, candidate.path, cursor + 1, 'reference');
        }
      }
    }
  }
  if (!sourceEntries.length) return result;
  result.analysisLevel = otherEntries.length ? 'mixed' : 'semantic_tsjs';
  limitation(inventory.root, 'STATIC_CAPTURE_ONLY_DYNAMIC_AND_EXTERNAL_CONSUMERS_NOT_PROVEN');
  const documents = new Map(inventory.documents);
  const configPath = path.join(inventory.root, '.agent-core-engineering.tsconfig.json');
  if (documents.has(configPath)) { gap(configPath, 'ANALYSIS_CONFIG_COLLISION'); return result; }
  const originalConfig = inventory.entries.find(entry => canonical(entry.path) === canonical(path.join(inventory.root, 'tsconfig.json')));
  documents.set(configPath, JSON.stringify({ ...(originalConfig ? { extends: './tsconfig.json' } : {}), compilerOptions: {
    module: 'nodenext', moduleResolution: 'nodenext', allowJs: true, checkJs: false, noEmit: true, noLib: true, types: [], skipLibCheck: true,
  }, files: sourceEntries.map(entry => entry.path.replaceAll('\\', '/')), include: [], exclude: [] }));
  const api = new API({ cwd: inventory.root, fs: engineeringVirtualFileSystem(documents), collectTiming: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const checkActive = () => { if (expired) throw new Error('PARSER_TIMEOUT'); };
  const operation = async () => {
    const snapshot = await api.updateSnapshot({ openProjects: [configPath] });
    const project = snapshot.getProject(configPath) ?? snapshot.getProjects()[0];
    if (!project) throw new Error('PARSER_PROJECT_UNAVAILABLE');
    const configDiagnostics = await project.program.getConfigFileParsingDiagnostics();
    if (configDiagnostics.some(diagnostic => diagnostic.category === 1)) gap(configPath, 'PARSER_CONFIG_DIAGNOSTICS');
    const syntax = await project.program.getSyntacticDiagnostics();
    if (syntax.some(diagnostic => diagnostic.category === 1)) gap(inventory.root, 'PARSER_SYNTAX_DIAGNOSTICS');
    const targetSymbols = new Map<number, EngineeringSymbol>();
    const signatureTargets = new Map<string, EngineeringSymbol>();
    const aliasCache = new Map<number, CompilerSymbol>();
    const resolveSymbol = async (symbol: CompilerSymbol | undefined) => {
      if (!symbol) return undefined;
      if (!(symbol.flags & SymbolFlags.Alias)) return symbol;
      let resolved = aliasCache.get(symbol.id);
      if (!resolved) { resolved = await project.checker.getAliasedSymbol(symbol); aliasCache.set(symbol.id, resolved); }
      return resolved;
    };
    const files: Array<{ file: ast.SourceFile; identifiers: ast.Identifier[]; calls: Array<ast.CallExpression | ast.NewExpression> }> = [];
    let nodes = 0, identifiers = 0;
    for (const entry of sourceEntries) {
      checkActive();
      const file = await project.program.getSourceFile(entry.path);
      if (!file) { gap(entry.path, 'PARSER_SOURCE_UNAVAILABLE'); continue; }
      const names: ast.Identifier[] = [], calls: Array<ast.CallExpression | ast.NewExpression> = [];
      const declarations: Array<{ node: ast.Node; name: ast.Identifier }> = [];
      const stack: ast.Node[] = [file];
      while (stack.length) {
        const node = stack.pop()!;
        if (++nodes > maxNodes) { gap(entry.path, 'AST_NODE_LIMIT', true); break; }
        if (ast.isIdentifier(node)) { if (++identifiers > maxIdentifiers) { gap(entry.path, 'IDENTIFIER_LIMIT', true); break; } names.push(node); }
        if (ast.isCallExpression(node) || ast.isNewExpression(node)) {
          calls.push(node);
          if (ast.isElementAccessExpression(node.expression) && !ast.isStringLiteral(node.expression.argumentExpression)) limitation(entry.path, 'DYNAMIC_MEMBER_CALL');
          if (ast.isIdentifier(node.expression) && ['eval', 'Function', 'require'].includes(node.expression.text)) limitation(entry.path, 'RUNTIME_CODE_OR_MODULE_RESOLUTION');
        }
        if (targetSet.has(canonical(entry.path)) && namedDeclaration(node)) declarations.push({ node, name: node.name });
        node.forEachChild(child => { stack.push(child); });
      }
      if (nodes > maxNodes || identifiers > maxIdentifiers) break;
      files.push({ file, identifiers: names, calls });
      for (let cursor = 0; cursor < declarations.length; cursor += 128) {
        const batch = declarations.slice(cursor, cursor + 128), symbols = await project.checker.getSymbolAtLocation(batch.map(item => item.name));
        for (let index = 0; index < batch.length; index++) {
          const declaration = batch[index]!, symbol = await resolveSymbol(symbols[index]); if (!symbol) { limitation(entry.path, 'UNRESOLVED_TARGET_SYMBOL'); continue; }
          if (targetSymbols.has(symbol.id)) continue;
          const position = declaration.name.getStart(file);
          const target: EngineeringSymbol = { id: hash(`${canonical(entry.path)}\0${entry.hash}\0${position}\0${symbol.name}`), name: symbol.name, path: entry.path, line: file.getLineAndCharacterOfPosition(position).line + 1, sourceHash: entry.hash };
          if (result.symbols.length >= 10_000) { gap(entry.path, 'SYMBOL_LIMIT', true); break; }
          result.symbols.push(target); targetSymbols.set(symbol.id, target);
          signatureTargets.set(`${canonical(entry.path)}\0${declaration.node.pos}`, target);
          if (ast.isVariableDeclaration(declaration.node) && declaration.node.initializer && (ast.isArrowFunction(declaration.node.initializer) || ast.isFunctionExpression(declaration.node.initializer))) signatureTargets.set(`${canonical(entry.path)}\0${declaration.node.initializer.pos}`, target);
        }
      }
    }
    for (const { file, identifiers: names, calls } of files) {
      checkActive();
      const entry = entryByPath.get(canonical(file.fileName))!;
      for (let cursor = 0; cursor < names.length; cursor += 128) {
        const batch = names.slice(cursor, cursor + 128), symbols = await project.checker.getSymbolAtLocation(batch);
        for (let index = 0; index < batch.length; index++) {
          const node = batch[index]!, symbol = await resolveSymbol(symbols[index]), target = symbol && targetSymbols.get(symbol.id); if (!target) continue;
          if (namedDeclaration(node.parent) && node.parent.name === node) continue;
          const expression = ast.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node;
          const call = (ast.isCallExpression(expression.parent) || ast.isNewExpression(expression.parent)) && expression.parent.expression === expression;
          addCaller(target, entry.path, file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, call ? 'call' : 'reference');
        }
      }
      for (const call of calls) {
        checkActive();
        const signature = await project.checker.getResolvedSignature(call);
        if (!signature?.declaration) { limitation(entry.path, 'UNRESOLVED_CALL_SIGNATURE'); continue; }
        const declaration = await signature.declaration.resolve(project);
        if (!declaration) { limitation(entry.path, 'UNRESOLVED_CALL_DECLARATION'); continue; }
        const target = signatureTargets.get(`${canonical(signature.declaration.path)}\0${declaration.pos}`);
        if (target) addCaller(target, entry.path, file.getLineAndCharacterOfPosition(call.expression.getStart(file)).line + 1, 'call');
      }
    }
  };
  try {
    await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('PARSER_TIMEOUT')); }, options.timeoutMs ?? 120_000); })]);
  } catch (error) {
    gap(inventory.root, error instanceof Error && error.message === 'PARSER_TIMEOUT' ? 'PARSER_TIMEOUT' : 'PARSER_UNAVAILABLE');
    limitation(inventory.root, 'SEMANTIC_ANALYSIS_INCOMPLETE');
  } finally { if (timer) clearTimeout(timer); await api.close(); }
  result.symbols.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.id.localeCompare(b.id));
  result.callers.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.symbolId.localeCompare(b.symbolId));
  result.limitations.sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason));
  return result;
}
function namedDeclaration(node: ast.Node): node is ast.Node & { name: ast.Identifier } {
  return (ast.isFunctionDeclaration(node) || ast.isClassDeclaration(node) || ast.isMethodDeclaration(node)
    || ast.isVariableDeclaration(node) || ast.isPropertyDeclaration(node) || ast.isInterfaceDeclaration(node)
    || ast.isTypeAliasDeclaration(node) || ast.isEnumDeclaration(node))
    && 'name' in node && !!node.name && ast.isIdentifier(node.name);
}
function containsPath(root: string, target: string): boolean {
  const relative = path.relative(canonical(root), canonical(target));
  return !relative || !relative.startsWith('..') && !path.isAbsolute(relative);
}
async function safelyMissingTarget(root: string, target: string): Promise<boolean> {
  try { await lstat(target); return false; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false; }
  let ancestor = path.dirname(target);
  while (containsPath(root, ancestor)) {
    try { return containsPath(root, await realpath(ancestor)) && (await lstat(ancestor)).isDirectory(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false; }
    const parent = path.dirname(ancestor); if (parent === ancestor) return false; ancestor = parent;
  }
  return false;
}
async function safelyExistingDirectory(root: string, target: string): Promise<boolean> {
  try { return (await lstat(target)).isDirectory() && containsPath(root, await realpath(target)); }
  catch { return false; }
}
async function safelyExistingDocument(root: string, target: string): Promise<boolean> {
  if (!/\.(?:md|mdx|txt|rst|adoc)$/i.test(target)) return false;
  try { return (await lstat(target)).isFile() && containsPath(root, await realpath(target)); }
  catch { return false; }
}
