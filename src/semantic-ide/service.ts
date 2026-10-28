import { validateDiagnosticItems, decodeTsServerDiagnostics } from './diagnostic-payload.js';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { WorkspaceFreshnessCoordinator } from './freshness.js';
import { canonicalFileUri, LanguageServerSession } from './language-server.js';
import { authorizedExistingPath, comparable, isProtectedPath } from './path-safety.js';
import {
  discoverBuiltInProviders,
  mergeProviderDefinitions,
  probeProviderVersion,
  providerComposition,
  selectProviderDefinition,
  validServerDefinition,
  type SemanticProviderVersionInfo,
} from './provider-registry.js';
import {
  managedProviderHealthIssues,
  providerRecipeSummary,
  SemanticProviderProvisioner,
  type ProvisionProviderId,
} from './provider-provisioning.js';
import { applyWorkspacePlans, planWorkspaceEdit } from './transaction.js';
import type { MutationExecutionContext } from '../rdc/mutation-coordinator.js';
import type {
  LspPosition,
  LspRange,
  SemanticIdeConfig,
  SemanticIdeHealth,
  SemanticIdeIssue,
  SemanticLanguageServerDefinition,
  SemanticMutationResult,
  SemanticSymbol,
  SemanticSymbolQuery,
  SemanticWorkspaceContext,
  SemanticWorkspaceFolder,
  SemanticWorkspaceInput,
  WorkspaceEdit,
  SemanticDiagnosticsDelta,
} from './types.js';
import { isSemanticallyIgnored } from './workspace-policy.js';
import { isTextPosition, offsetForPosition } from './text-position.js';

export function isRecoverableSemanticTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SERVER_EXITED')
    || message.includes('SERVER_NOT_RUNNING')
    || message.includes('SERVER_PIPE_ERROR')
    || message.includes('PROVIDER_FATAL')
    || message.includes('TCP_CLOSED')
    || message.includes('TCP_ERROR');
}

function rangesEqual(left: LspRange, right: LspRange): boolean {
  return left.start.line === right.start.line
    && left.start.character === right.start.character
    && left.end.line === right.end.line
    && left.end.character === right.end.character;
}

function rangesOverlap(left: LspRange, right: LspRange): boolean {
  const before = (a: LspPosition, b: LspPosition) => a.line < b.line
    || (a.line === b.line && a.character < b.character);
  return before(left.start, right.end) && before(right.start, left.end);
}

function strictOffsetAt(text: string, position: LspPosition): number {
  try { return offsetForPosition(text, position, { allowEndOfFileLine: true }); }
  catch { throw new Error('SEMANTIC_PROVIDER_RANGE_INVALID'); }
}

function textForRange(text: string, range: LspRange): string {
  const start = strictOffsetAt(text, range.start);
  const end = strictOffsetAt(text, range.end);
  if (end < start) throw new Error('SEMANTIC_PROVIDER_RANGE_INVALID');
  return text.slice(start, end);
}

function asRange(value: unknown): LspRange | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const start = record.start as Record<string, unknown> | undefined;
  const end = record.end as Record<string, unknown> | undefined;
  if (!isTextPosition(start) || !isTextPosition(end)) return undefined;
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}

function normalizeDocumentSymbols(
  raw: unknown,
  relativePath: string,
  language: string,
  source: string,
  session: LanguageServerSession,
  parent = '',
  depth = 8,
): SemanticSymbol[] {
  if (!Array.isArray(raw)) return [];
  const prepared = raw.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const rawName = typeof record.name === 'string' ? record.name : '';
    const location = record.location as Record<string, unknown> | undefined;
    const range = asRange(record.range ?? location?.range);
    if (!rawName || !range) return [];
    const kind = typeof record.kind === 'number' ? record.kind : String(record.kind ?? '');
    const rawDetail = typeof record.detail === 'string' ? record.detail : undefined;
    const normalized = session.normalizeSymbol(rawName, kind, rawDetail);
    return [{ record, range, kind, normalized }];
  });

  const totalByName = new Map<string, number>();
  for (const item of prepared) {
    totalByName.set(item.normalized.name, (totalByName.get(item.normalized.name) ?? 0) + 1);
  }
  const seenByName = new Map<string, number>();
  const output: SemanticSymbol[] = [];

  for (const item of prepared) {
    const total = totalByName.get(item.normalized.name) ?? 1;
    const overloadIndex = seenByName.get(item.normalized.name) ?? 0;
    seenByName.set(item.normalized.name, overloadIndex + 1);
    const component = total > 1 ? `${item.normalized.name}[${overloadIndex}]` : item.normalized.name;
    const namePath = parent ? `${parent}/${component}` : component;
    const nested = depth > 0
      ? normalizeDocumentSymbols(item.record.children, relativePath, language, source, session, namePath, depth - 1)
      : [];
    let body: string;
    try { body = textForRange(source, item.range); }
    catch {
      throw new Error(`SEMANTIC_PROVIDER_RANGE_INVALID: ${relativePath}:${namePath}`);
    }
    const selectionRange = asRange(item.record.selectionRange);
    output.push({
      name: item.normalized.name,
      namePath,
      ...(total > 1 ? { overloadIndex } : {}),
      kind: item.kind,
      relativePath,
      range: item.range,
      ...(selectionRange ? { selectionRange } : {}),
      ...(item.normalized.detail ? { detail: item.normalized.detail } : {}),
      ...(nested.length ? { members: nested } : {}),
      language,
      provider: session.id,
      body,
    });
  }
  return output;
}

function projectSymbol(symbol: SemanticSymbol, includeBody: boolean): SemanticSymbol {
  return {
    ...symbol,
    ...(includeBody ? {} : { body: undefined }),
    ...(symbol.members ? { members: symbol.members.map(member => projectSymbol(member, includeBody)) } : {}),
  };
}

function flattenSymbols(symbols: SemanticSymbol[]): SemanticSymbol[] {
  const result: SemanticSymbol[] = [];
  const stack = [...symbols];
  while (stack.length) {
    const symbol = stack.shift()!;
    result.push(symbol);
    if (symbol.members) stack.unshift(...symbol.members);
  }
  return result;
}

interface DroppedLocationSummary {
  total: number;
  outside: number;
  protected: number;
  ignored: number;
  missing: number;
  invalid: number;
}

function droppedSummary(): DroppedLocationSummary {
  return { total: 0, outside: 0, protected: 0, ignored: 0, missing: 0, invalid: 0 };
}

async function normalizeLocations(
  raw: unknown,
  folders: SemanticWorkspaceFolder[],
  ignoredDirectories: readonly string[],
): Promise<{
  items: Array<{ workspaceFolder: string; relativePath: string; uri: string; range: LspRange }>;
  dropped: DroppedLocationSummary;
}> {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const output: Array<{ workspaceFolder: string; relativePath: string; uri: string; range: LspRange }> = [];
  const dropped = droppedSummary();

  for (const item of values) {
    if (!item || typeof item !== 'object') {
      dropped.invalid += 1;
      dropped.total += 1;
      continue;
    }
    const value = item as Record<string, unknown>;
    const uri = typeof value.uri === 'string'
      ? value.uri
      : typeof value.targetUri === 'string'
        ? value.targetUri
        : '';
    const range = asRange(value.range ?? value.targetSelectionRange ?? value.targetRange);
    if (!uri || !range) {
      dropped.invalid += 1;
      dropped.total += 1;
      continue;
    }

    let absolute: string;
    try { absolute = fileURLToPath(uri); }
    catch {
      dropped.invalid += 1;
      dropped.total += 1;
      continue;
    }

    let selected: { folder: SemanticWorkspaceFolder; lexicalPath: string } | undefined;
    let protectedHit = false;
    let missingHit = false;
    for (const folder of [...folders].sort((left, right) => comparable(right.root).length - comparable(left.root).length)) {
      try {
        const authorized = await authorizedExistingPath(folder.root, absolute);
        selected = { folder, lexicalPath: authorized.lexicalPath };
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('PROTECTED')) protectedHit = true;
        if (code === 'ENOENT') missingHit = true;
      }
    }
    if (!selected) {
      if (protectedHit) dropped.protected += 1;
      else if (missingHit) dropped.missing += 1;
      else dropped.outside += 1;
      dropped.total += 1;
      continue;
    }

    if (await isSemanticallyIgnored(selected.folder.root, selected.lexicalPath, ignoredDirectories)) {
      dropped.ignored += 1;
      dropped.total += 1;
      continue;
    }

    output.push({
      workspaceFolder: selected.folder.name,
      relativePath: path.relative(selected.folder.root, selected.lexicalPath),
      uri: canonicalFileUri(pathToFileURL(selected.lexicalPath).href),
      range,
    });
  }
  return { items: output, dropped };
}

async function isSafeDependencyDefinition(root: string, candidate: string, ignoredDirectories: readonly string[]): Promise<boolean> {
  const authorized = await authorizedExistingPath(root, candidate);
  const relative = path.relative(root, authorized.lexicalPath);
  const segments = relative.split(/[\\/]+/).map(segment => segment.toLowerCase());
  if (!segments.includes('node_modules')) return false;
  const extraIgnored = new Set(ignoredDirectories.map(value => value.toLowerCase()));
  if (segments.some(segment => segment !== 'node_modules' && extraIgnored.has(segment))) return false;
  await readFile(authorized.realPath);
  return true;
}

async function normalizeDependencyDefinitions(raw: unknown, folders: SemanticWorkspaceFolder[], ignoredDirectories: readonly string[]) {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const output: Array<{ workspaceFolder: string; relativePath: string; uri: string; range: LspRange; sourceClass: 'dependency'; dependencyFallback: true }> = [];
  for (const item of values.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    const uri = typeof value.uri === 'string' ? value.uri : typeof value.targetUri === 'string' ? value.targetUri : '';
    const itemRange = asRange(value.range ?? value.targetSelectionRange ?? value.targetRange);
    if (!uri || !itemRange) continue;
    let absolute: string;
    try { absolute = fileURLToPath(uri); } catch { continue; }
    for (const folder of [...folders].sort((left, right) => comparable(right.root).length - comparable(left.root).length)) {
      try {
        if (!await isSafeDependencyDefinition(folder.root, absolute, ignoredDirectories)) continue;
        const authorized = await authorizedExistingPath(folder.root, absolute);
        output.push({ workspaceFolder: folder.name, relativePath: path.relative(folder.root, authorized.lexicalPath),
          uri: canonicalFileUri(pathToFileURL(authorized.lexicalPath).href), range: itemRange, sourceClass: 'dependency', dependencyFallback: true });
        break;
      } catch { /* read-only fallback ignores unsafe or unavailable provider locations */ }
    }
  }
  return output;
}

function bounded<T>(items: T[], maxResults = 50, maxAnswerChars = 24000) {
  const limited = items.slice(0, Math.max(1, maxResults));
  const output: T[] = [];
  let size = 0;
  for (const item of limited) {
    const next = JSON.stringify(item).length;
    if (size + next > maxAnswerChars) break;
    output.push(item);
    size += next;
  }
  return { items: output, total: items.length, truncated: output.length < items.length };
}

function boundedSymbols(items: SemanticSymbol[], includeBody: boolean, maxResults?: number, maxAnswerChars?: number) {
  const projected = items.map(item => projectSymbol(item, includeBody));
  let result = bounded(projected, maxResults, maxAnswerChars);
  if (includeBody && result.truncated) {
    result = bounded(items.map(item => projectSymbol(item, false)), maxResults, maxAnswerChars);
  }
  if (result.truncated && (!result.items.length || JSON.stringify(result.items).length >= (maxAnswerChars ?? 24000))) {
    const compact = flattenSymbols(items).map(({ members: _members, body: _body, ...symbol }) => symbol);
    result = bounded(compact as SemanticSymbol[], maxResults, maxAnswerChars);
  }
  return result;
}

function hoverText(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const contents = (raw as { contents?: unknown }).contents;
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
    else if (value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string') {
      const text = String((value as { value?: unknown }).value).trim();
      if (text) parts.push(text);
    }
  };
  if (Array.isArray(contents)) contents.forEach(add);
  else add(contents);
  if (!parts.length) return undefined;
  return parts.join('\n').slice(0, 4000);
}

function diagnosticIdentity(item: unknown): string {
  if (!item || typeof item !== 'object') return JSON.stringify(item);
  const value = item as Record<string, unknown>;
  return JSON.stringify({
    range: value.range,
    severity: value.severity,
    code: value.code,
    source: value.source,
    message: value.message,
  });
}

function exactNamePathMatch(symbol: SemanticSymbol, pattern: string): boolean {
  const query = pattern.trim();
  if (!query) return false;
  if (query.startsWith('/')) return symbol.namePath === query.slice(1);
  if (query.includes('/')) return symbol.namePath === query || symbol.namePath.endsWith('/' + query);
  return symbol.name === query || symbol.namePath === query || symbol.namePath.endsWith('/' + query);
}

function providerDefinitionFingerprint(definition: SemanticLanguageServerDefinition): string {
  return JSON.stringify({
    ...definition,
    env: definition.env ? Object.fromEntries(Object.entries(definition.env).sort(([a], [b]) => a.localeCompare(b))) : undefined,
  });
}

async function loadSemanticProviderSet(config: SemanticIdeConfig): Promise<{
  definitions: SemanticLanguageServerDefinition[];
  issues: SemanticIdeIssue[];
  versions: Map<string, SemanticProviderVersionInfo>;
}> {
  const discovered = config.enabled
    ? await discoverBuiltInProviders(config)
    : { definitions: [] as SemanticLanguageServerDefinition[], issues: [] as SemanticIdeIssue[] };
  const configDefinitions = (config.servers ?? []).filter(validServerDefinition);
  const issues = [...discovered.issues];
  if ((config.servers ?? []).length !== configDefinitions.length) {
    issues.push({ code: 'SEMANTIC_SERVER_CONFIG_INVALID', message: 'One or more inline semantic provider definitions are invalid.' });
  }

  let fileDefinitions: SemanticLanguageServerDefinition[] = [];
  if (config.serversFile) {
    try {
      const parsed = JSON.parse(await readFile(config.serversFile, 'utf8')) as unknown;
      if (!Array.isArray(parsed)) throw new Error('SEMANTIC_SERVER_CONFIG_INVALID');
      // One bad entry must not discard the valid ones (the inline list above already works this way).
      fileDefinitions = parsed.filter(validServerDefinition);
      if (fileDefinitions.length !== parsed.length) {
        issues.push({
          code: 'SEMANTIC_SERVER_CONFIG_INVALID',
          message: `${parsed.length - fileDefinitions.length} of ${parsed.length} entries in the servers file are invalid and were skipped.`,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        issues.push({
          code: 'SEMANTIC_SERVER_CONFIG_INVALID',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const definitions = mergeProviderDefinitions(discovered.definitions, configDefinitions, fileDefinitions);
  const versions = new Map<string, SemanticProviderVersionInfo>();
  for (const definition of definitions) {
    const version: SemanticProviderVersionInfo = await probeProviderVersion(definition, 5_000, config.projectRoot).catch(error => ({
      compatibility: 'unknown',
      issue: error instanceof Error ? error.message : String(error),
    }));
    versions.set(definition.id, version);
    if (version.issue === 'SEMANTIC_PROVIDER_VERSION_OUT_OF_RANGE') {
      issues.push({
        code: 'SEMANTIC_PROVIDER_VERSION_OUT_OF_RANGE',
        message: `Provider ${definition.id} version ${version.observedVersion ?? '<unknown>'} is outside the configured compatibility range.`,
        server: definition.id,
      });
    } else if (version.issue && definition.versionProbe) {
      issues.push({
        code: version.issue,
        message: `Provider ${definition.id} version probe did not produce trusted compatibility evidence.`,
        server: definition.id,
      });
    }
  }

  return { definitions, issues, versions };
}

export class SemanticIdeService {
  private readonly sessions = new Map<string, LanguageServerSession>();
  private readonly issues: SemanticIdeIssue[] = [];
  private readonly serverDefinitions: SemanticLanguageServerDefinition[] = [];
  private readonly providerVersions = new Map<string, SemanticProviderVersionInfo>();
  private readonly freshness = new WorkspaceFreshnessCoordinator();
  private readonly compositions = new Map<string, Map<string, number>>();
  private readonly compositionInFlight = new Map<string, Promise<Map<string, number>>>();
  private readonly provisioner: SemanticProviderProvisioner;

  private constructor(
    readonly config: SemanticIdeConfig,
    definitions: SemanticLanguageServerDefinition[],
    issues: SemanticIdeIssue[],
    versions: Map<string, SemanticProviderVersionInfo>,
    private readonly codeIntelligence?: CodeIntelligenceService,
  ) {
    this.serverDefinitions.push(...definitions);
    this.issues.push(...issues);
    for (const [id, info] of versions) this.providerVersions.set(id, info);
    this.provisioner = new SemanticProviderProvisioner(config.runtimeDir);
  }

  static async initialize(config: SemanticIdeConfig, codeIntelligence?: CodeIntelligenceService): Promise<SemanticIdeService> {
    await mkdir(config.runtimeDir, { recursive: true });
    const loaded = await loadSemanticProviderSet(config);
    return new SemanticIdeService(config, loaded.definitions, loaded.issues, loaded.versions, codeIntelligence);
  }

  get enabled(): boolean { return this.config.enabled; }

  async health(): Promise<SemanticIdeHealth> {
    const activeServers = [...this.sessions.values()].map(session => ({
      id: session.id,
      root: session.root,
      ...(session.pid ? { pid: session.pid } : {}),
      state: session.state,
      readiness: session.readiness,
      ...(session.readinessMessage ? { readinessMessage: session.readinessMessage } : {}),
      capabilities: session.serverCapabilities,
      ...(session.capabilityIssues.length ? { capabilityIssues: session.capabilityIssues } : {}),
      ...(session.freshness ? { freshness: session.freshness } : {}),
      ...(session.postInitializeEvidence ? { postInitialize: session.postInitializeEvidence } : {}),
    }));
    if (!this.config.enabled) {
      return {
        status: 'not-configured',
        enabled: false,
        backend: 'lsp',
        workspace: this.config.projectRoot,
        activeServers,
        configuredServers: [],
        issueCount: 0,
      };
    }

    const liveIssues = [...this.issues];
    for (const issue of await managedProviderHealthIssues(this.config.runtimeDir)) {
      liveIssues.push({
        code: issue.code,
        message: issue.message,
        server: issue.providerId,
      });
    }
    for (const session of this.sessions.values()) {
      if (session.state === 'exited') {
        liveIssues.push({
          code: 'SEMANTIC_IDE_SERVER_EXITED',
          message: 'Language server exited',
          server: session.id,
          workspace: session.root,
        });
      }
      if (session.readiness === 'degraded') {
        liveIssues.push({
          code: 'SEMANTIC_PROVIDER_DEGRADED',
          message: session.readinessMessage ?? 'Provider readiness degraded',
          server: session.id,
          workspace: session.root,
        });
      }
      if (session.freshness?.state === 'degraded') {
        liveIssues.push({
          code: 'SEMANTIC_FRESHNESS_DEGRADED',
          message: session.freshness.reason ?? 'Workspace freshness degraded',
          server: session.id,
          workspace: session.root,
        });
      }
    }

    return {
      status: liveIssues.length ? 'degraded' : 'available',
      enabled: true,
      backend: 'lsp',
      workspace: this.config.projectRoot,
      activeServers,
      configuredServers: this.serverDefinitions.map(definition => {
        const version = this.providerVersions.get(definition.id);
        return {
          id: definition.id,
          adapter: definition.adapter ?? 'generic',
          priority: definition.priority ?? 0,
          extensions: [...definition.extensions],
          ...(definition.command ? { command: definition.command } : {}),
          transport: definition.transport?.kind ?? 'stdio-owned',
          ...(version?.observedVersion ? { observedVersion: version.observedVersion } : {}),
          ...(version ? { compatibility: version.compatibility } : { compatibility: 'unknown' as const }),
        };
      }),
      issueCount: liveIssues.length,
      ...(liveIssues.length ? { issues: liveIssues } : {}),
    };
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions.values()].map(session => session.close().catch(() => undefined)));
    this.sessions.clear();
    this.freshness.clear();
    this.compositions.clear();
  }

  async reloadProviders(): Promise<unknown> {
    if (this.compositionInFlight.size) {
      await Promise.allSettled([...this.compositionInFlight.values()]);
    }
    const loaded = await loadSemanticProviderSet(this.config);
    const incompatible = loaded.issues.filter(issue => issue.code === 'SEMANTIC_PROVIDER_VERSION_OUT_OF_RANGE');
    if (incompatible.length) {
      throw new Error(`SEMANTIC_PROVIDER_RELOAD_REJECTED_VERSION: ${incompatible.map(issue => `${issue.server ?? '<provider>'}=${issue.message}`).join('; ')}`);
    }
    const before = new Map(this.serverDefinitions.map(definition => [definition.id, providerDefinitionFingerprint(definition)]));
    const after = new Map(loaded.definitions.map(definition => [definition.id, providerDefinitionFingerprint(definition)]));
    const changed = new Set<string>();

    for (const [id, fingerprint] of before) {
      if (after.get(id) !== fingerprint) changed.add(id);
    }
    for (const [id, fingerprint] of after) {
      if (before.get(id) !== fingerprint) changed.add(id);
    }

    let retiredSessions = 0;
    for (const [key, session] of [...this.sessions.entries()]) {
      if (!changed.has(session.id)) continue;
      await session.close().catch(() => undefined);
      this.sessions.delete(key);
      retiredSessions += 1;
    }

    this.serverDefinitions.splice(0, this.serverDefinitions.length, ...loaded.definitions);
    this.issues.splice(0, this.issues.length, ...loaded.issues);
    this.providerVersions.clear();
    for (const [id, info] of loaded.versions) this.providerVersions.set(id, info);
    this.freshness.clear();
    this.compositions.clear();
    this.compositionInFlight.clear();

    activityTracker.record(
      'SEMANTIC_IDE',
      'success',
      'Semantic provider configuration reloaded',
      'semantic-provider-reload',
      {
        changedProviders: [...changed].sort(),
        retiredSessions,
        providerCount: this.serverDefinitions.length,
      },
    );
    return {
      reloaded: true,
      changedProviders: [...changed].sort(),
      retiredSessions,
      providerCount: this.serverDefinitions.length,
      configuredServers: (await this.health()).configuredServers ?? [],
    };
  }

  private async provisionProvider(
    providerId: ProvisionProviderId,
    repair: boolean,
  ): Promise<unknown> {
    let retiredSessions = 0;
    for (const [key, session] of [...this.sessions.entries()]) {
      if (session.id !== providerId) continue;
      await session.close().catch(() => undefined);
      this.sessions.delete(key);
      retiredSessions += 1;
    }

    activityTracker.record(
      'SEMANTIC_IDE',
      'info',
      'Explicit managed provider provisioning started',
      'semantic-provider-provision',
      { provider: providerId, repair, retiredSessions },
    );

    try {
      const result = await this.provisioner.provision(providerId, { repair });
      const reload = result.changed ? await this.reloadProviders() : undefined;
      activityTracker.record(
        'SEMANTIC_IDE',
        'success',
        'Managed provider provisioning completed',
        'semantic-provider-provision',
        { provider: providerId, changed: result.changed, repaired: result.repaired },
      );
      return { ...result, recipe: providerRecipeSummary(providerId), retiredSessions, ...(reload ? { reload } : {}) };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const code = raw.match(/^[A-Z][A-Z0-9_]+/)?.[0] ?? 'SEMANTIC_PROVIDER_PROVISION_FAILED';
      activityTracker.record(
        'SEMANTIC_IDE',
        'error',
        'Managed provider provisioning failed',
        'semantic-provider-provision',
        { provider: providerId, repair, code },
      );
      throw error;
    }
  }

  private async resolveWorkspaceFolders(
    workspace: string,
    root: string,
    worktreePath?: string,
  ): Promise<SemanticWorkspaceFolder[]> {
    const primaryRoot = await realpath(root);
    if (isProtectedPath(primaryRoot)) throw new Error('SEMANTIC_PROTECTED_PATH');
    const folders: SemanticWorkspaceFolder[] = [{
      name: path.basename(primaryRoot) || workspace,
      root: primaryRoot,
    }];

    // A ref/worktree session is intentionally single-root to avoid mixing the
    // checked-out ref with sibling repos on a different revision surface.
    if (!this.codeIntelligence || worktreePath) return folders;

    let records;
    try { records = await this.codeIntelligence.listWorkspaces(); }
    catch { return folders; }
    const record = records.find(item => item.name === workspace);
    if (!record) return folders;

    const seen = new Set([comparable(primaryRoot)]);
    for (const repo of record.repos) {
      const repoRoot = await realpath(repo.path).catch(error => {
        throw new Error(`SEMANTIC_WORKSPACE_FOLDER_INVALID: ${repo.slug}: ${error instanceof Error ? error.message : String(error)}`);
      });
      if (isProtectedPath(repoRoot)) throw new Error(`SEMANTIC_PROTECTED_PATH: ${repo.slug}`);
      const key = comparable(repoRoot);
      if (seen.has(key)) continue;
      seen.add(key);
      folders.push({ name: repo.slug, root: repoRoot });
    }
    return folders;
  }

  private async resolveContext(input: SemanticWorkspaceInput = {}, _mutation = false): Promise<SemanticWorkspaceContext> {
    if (input.ref && !input.worktreePath) throw new Error('SEMANTIC_REF_REQUIRES_WORKTREE');
    if (this.codeIntelligence) {
      const context = await this.codeIntelligence.resolveWorkspace(input);
      const root = await realpath(context.worktreePath ?? context.cwd);
      if (isProtectedPath(root)) throw new Error('SEMANTIC_PROTECTED_PATH');
      const folders = await this.resolveWorkspaceFolders(context.workspace, root, context.worktreePath);
      return {
        workspace: context.workspace,
        root,
        folders,
        ...(context.ref ? { ref: context.ref } : {}),
        ...(context.worktreePath ? { worktreePath: root } : {}),
      };
    }
    if (input.workspace || input.ref || input.worktreePath) throw new Error('SEMANTIC_WORKSPACE_ROUTING_UNAVAILABLE');
    const root = await realpath(this.config.projectRoot);
    if (isProtectedPath(root)) throw new Error('SEMANTIC_PROTECTED_PATH');
    return {
      workspace: 'agent-core',
      root,
      folders: [{ name: path.basename(root) || 'agent-core', root }],
    };
  }

  private async resolveFile(context: SemanticWorkspaceContext, relativePath: string): Promise<string> {
    const absolute = path.resolve(context.root, relativePath);
    const authorized = await authorizedExistingPath(context.root, absolute);
    return authorized.lexicalPath;
  }

  private async ensureComposition(root: string): Promise<Map<string, number>> {
    const key = comparable(root);
    const current = this.compositions.get(key);
    if (current) return current;
    const running = this.compositionInFlight.get(key);
    if (running) return running;

    const task = providerComposition(root, this.serverDefinitions)
      .catch(() => new Map<string, number>())
      .then(value => {
        this.compositions.set(key, value);
        return value;
      })
      .finally(() => this.compositionInFlight.delete(key));
    this.compositionInFlight.set(key, task);
    return task;
  }

  private definitionForFile(
    root: string,
    filePath: string,
    requestedLanguage?: string,
  ): { definition: SemanticLanguageServerDefinition; languageId: string } {
    return selectProviderDefinition(
      root,
      filePath,
      requestedLanguage,
      this.serverDefinitions,
      this.compositions.get(comparable(root)),
    );
  }

  private sessionKey(root: string, serverId: string, folders: SemanticWorkspaceFolder[]): string {
    const folderKey = folders.map(folder => comparable(folder.root)).sort().join(';');
    return `${serverId}|${comparable(root)}|${folderKey}`;
  }

  private async getSessionForDefinition(
    root: string,
    definition: SemanticLanguageServerDefinition,
    folders: SemanticWorkspaceFolder[],
  ): Promise<LanguageServerSession> {
    const effectiveFolders = definition.transport?.kind === 'tcp-external' ? folders.slice(0, 1) : folders;
    const version = this.providerVersions.get(definition.id);
    if (version?.compatibility === 'out-of-range') {
      throw new Error(`SEMANTIC_PROVIDER_VERSION_OUT_OF_RANGE: ${definition.id}: ${version.observedVersion ?? '<unknown>'}`);
    }
    const key = this.sessionKey(root, definition.id, effectiveFolders);
    let session = this.sessions.get(key);
    if (!session) {
      for (const [existingKey, existing] of [...this.sessions.entries()]) {
        if (existingKey === key || existing.id !== definition.id || comparable(existing.root) !== comparable(root)) continue;
        await existing.close().catch(() => undefined);
        this.sessions.delete(existingKey);
      }
      session = new LanguageServerSession(
        definition,
        root,
        Math.max(this.config.startupTimeoutMs, this.config.callTimeoutMs),
        effectiveFolders,
      );
      this.sessions.set(key, session);
    }
    await session.start();
    return session;
  }

  private async getSession(
    root: string,
    filePath: string,
    requestedLanguage: string | undefined,
    folders: SemanticWorkspaceFolder[],
  ): Promise<LanguageServerSession> {
    const { definition } = this.definitionForFile(root, filePath, requestedLanguage);
    return this.getSessionForDefinition(root, definition, folders);
  }

  private async reconcile(
    session: LanguageServerSession,
    root: string,
    definition: SemanticLanguageServerDefinition,
  ): Promise<void> {
    const folderResults = [];
    for (const folder of session.workspaceFolders) {
      folderResults.push(await this.freshness.reconcile(
        session,
        folder.root,
        definition,
        session.ignoredDirectories,
      ));
    }
    const degraded = folderResults.find(result => result.state === 'degraded');
    const aggregate = {
      state: degraded ? 'degraded' as const : folderResults.every(result => result.state === 'baseline') ? 'baseline' as const : 'fresh' as const,
      scannedFiles: folderResults.reduce((sum, result) => sum + result.scannedFiles, 0),
      eventCount: folderResults.reduce((sum, result) => sum + result.eventCount, 0),
      created: folderResults.reduce((sum, result) => sum + result.created, 0),
      changed: folderResults.reduce((sum, result) => sum + result.changed, 0),
      deleted: folderResults.reduce((sum, result) => sum + result.deleted, 0),
      truncated: folderResults.some(result => result.truncated),
      durationMs: folderResults.reduce((sum, result) => sum + result.durationMs, 0),
      ...(degraded?.reason ? { reason: degraded.reason } : {}),
    };
    session.noteFreshness(aggregate);
    if (aggregate.state === 'degraded') {
      activityTracker.record(
        'SEMANTIC_IDE',
        'warn',
        'Semantic workspace freshness degraded',
        'semantic-freshness',
        { server: definition.id, workspace: root, reason: aggregate.reason ?? '', eventCount: aggregate.eventCount },
      );
    }
  }

  private async withRecovery<T>(
    context: SemanticWorkspaceContext,
    filePath: string,
    operation: (session: LanguageServerSession) => Promise<T>,
    requestedLanguage?: string,
  ): Promise<T> {
    const { definition } = this.definitionForFile(context.root, filePath, requestedLanguage);
    const sessionFolders = definition.transport?.kind === 'tcp-external' ? context.folders.slice(0, 1) : context.folders;
    const key = this.sessionKey(context.root, definition.id, sessionFolders);
    const session = await this.getSessionForDefinition(context.root, definition, context.folders);
    await this.reconcile(session, context.root, definition);

    try {
      return await operation(session);
    } catch (error) {
      if (!isRecoverableSemanticTransportError(error)) throw error;

      await session.close().catch(() => undefined);
      this.sessions.delete(key);
      activityTracker.record(
        'SEMANTIC_IDE',
        'warn',
        'Language server restarted after confirmed termination',
        'provider-restart',
        { workspace: context.workspace, server: definition.id },
      );
      const replacement = await this.getSessionForDefinition(context.root, definition, context.folders);
      await this.reconcile(replacement, context.root, definition);
      return operation(replacement);
    }
  }

  private async symbolsForFile(
    context: SemanticWorkspaceContext,
    relativePath: string,
    depth = 8,
    requestedLanguage?: string,
  ) {
    const filePath = await this.resolveFile(context, relativePath);
    const { languageId } = this.definitionForFile(context.root, filePath, requestedLanguage);
    return this.withRecovery(context, filePath, async session => {
      session.assertCapability('documentSymbolProvider', 'textDocument/documentSymbol');
      const opened = await session.ensureDocument(filePath, languageId);
      const raw = await session.request('textDocument/documentSymbol', { textDocument: { uri: opened.uri } });
      return {
        filePath,
        uri: opened.uri,
        source: opened.text,
        language: languageId,
        session,
        symbols: normalizeDocumentSymbols(raw, relativePath, languageId, opened.text, session, '', depth),
      };
    }, requestedLanguage);
  }

  private async exactSymbol(
    context: SemanticWorkspaceContext,
    relativePath: string,
    namePath: string,
    requestedLanguage?: string,
  ) {
    const result = await this.symbolsForFile(context, relativePath, 12, requestedLanguage);
    const all = flattenSymbols(result.symbols);
    const matches = all.filter(symbol => exactNamePathMatch(symbol, namePath));
    if (!matches.length) throw new Error('SEMANTIC_SYMBOL_NOT_FOUND: ' + namePath);
    if (matches.length > 1) throw new Error('SEMANTIC_SYMBOL_AMBIGUOUS: ' + namePath);
    return { ...result, symbol: matches[0]! };
  }

  private async enrichInfo(
    context: SemanticWorkspaceContext,
    symbols: SemanticSymbol[],
    maxResults = 50,
  ): Promise<{ requested: true; enriched: number; skipped: number; partial: boolean }> {
    const items = flattenSymbols(symbols).slice(0, Math.max(1, maxResults));
    const deadline = Date.now() + Math.min(5000, this.config.callTimeoutMs);
    let enriched = 0;
    let skipped = 0;

    for (const symbol of items) {
      if (Date.now() >= deadline) break;
      try {
        const filePath = await this.resolveFile(context, symbol.relativePath);
        const { languageId } = this.definitionForFile(context.root, filePath, symbol.language);
        const session = await this.getSession(context.root, filePath, symbol.language, context.folders);
        if (!session.supportsCapability('hoverProvider', 'textDocument/hover')) {
          skipped += 1;
          continue;
        }
        const opened = await session.ensureDocument(filePath, languageId);
        const position = symbol.selectionRange?.start ?? symbol.range.start;
        const raw = await session.request('textDocument/hover', { textDocument: { uri: opened.uri }, position });
        const info = hoverText(raw);
        if (info) {
          symbol.info = info;
          enriched += 1;
        } else {
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
    }

    const processed = enriched + skipped;
    return { requested: true, enriched, skipped, partial: processed < items.length || Date.now() >= deadline };
  }

  private async diagnosticsForRelativePath(
    context: SemanticWorkspaceContext,
    relativePath: string,
    requestedLanguage?: string,
  ): Promise<{ items: unknown[]; freshness: 'pull' | 'published' | 'typescript-direct' | 'stale' }> {
    const filePath = await this.resolveFile(context, relativePath);
    const { languageId } = this.definitionForFile(context.root, filePath, requestedLanguage);
    return this.withRecovery(context, filePath, async session => {
      const expectedUri = canonicalFileUri(pathToFileURL(filePath).href);
      const generationBefore = session.diagnosticsGenerationFor(expectedUri);
      const opened = await session.ensureDocument(filePath, languageId);
      let items = session.diagnosticsFor(opened.uri);
      let freshness: 'pull' | 'published' | 'typescript-direct' | 'stale' = 'stale';

      let pullAvailable = false;
      try {
        const pulled = await session.request('textDocument/diagnostic', { textDocument: { uri: opened.uri } });
        const value = pulled as { items?: unknown } | null;
        const decoded = validateDiagnosticItems(value?.items);
        if (decoded.valid) {
          items = decoded.items;
          freshness = 'pull';
          pullAvailable = true;
        } else {
          session.noteDiagnosticPayloadInvalid();
        }
      } catch {}

      if (!pullAvailable) {
        const published = await session.waitForDiagnosticsAfter(
          opened.uri,
          generationBefore,
          Math.min(1200, this.config.callTimeoutMs),
        );
        if (published.fresh) {
          items = published.items;
          freshness = 'published';
        } else if (session.id === 'typescript') {
          try {
            const direct = await session.request('workspace/executeCommand', {
              command: 'typescript.tsserverRequest',
              arguments: ['semanticDiagnosticsSync', { file: opened.uri }],
            });
            const decoded = decodeTsServerDiagnostics(direct);
            if (decoded.valid) {
              items = decoded.items;
              freshness = 'typescript-direct';
            } else {
              session.noteDiagnosticPayloadInvalid();
            }
          } catch {}
        }
      }
      return { items, freshness };
    }, requestedLanguage);
  }

  private async collectDiagnosticsDelta(
    context: SemanticWorkspaceContext,
    pairs: Array<{ before: string; after: string }>,
    before: Map<string, { items: unknown[]; freshness: string }>,
    initialIssues: Array<{ relativePath: string; message: string }> = [],
  ): Promise<SemanticDiagnosticsDelta> {
    const files: SemanticDiagnosticsDelta['files'] = [];
    const issues: Array<{ relativePath: string; message: string }> = [...initialIssues];

    for (const pair of pairs) {
      try {
        const after = await this.diagnosticsForRelativePath(context, pair.after);
        const previous = before.get(pair.before) ?? { items: [], freshness: 'stale' };
        const beforeKeys = new Set(previous.items.map(diagnosticIdentity));
        const afterKeys = new Set(after.items.map(diagnosticIdentity));
        const comparable = previous.freshness !== 'stale' && after.freshness !== 'stale';
        const introduced = comparable ? after.items.filter(item => !beforeKeys.has(diagnosticIdentity(item))).slice(0, 100) : [];
        const resolvedCount = comparable ? previous.items.filter(item => !afterKeys.has(diagnosticIdentity(item))).length : 0;
        if (previous.freshness === 'stale') {
          issues.push({ relativePath: pair.before, message: 'SEMANTIC_DIAGNOSTICS_BASELINE_STALE' });
        }
        files.push({
          relativePath: pair.after,
          beforeCount: previous.items.length,
          afterCount: after.items.length,
          introduced,
          resolvedCount,
          freshness: after.freshness,
        });
        if (after.freshness === 'stale') {
          issues.push({ relativePath: pair.after, message: 'SEMANTIC_DIAGNOSTICS_STALE' });
        }
      } catch (error) {
        issues.push({
          relativePath: pair.after,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      requested: true,
      complete: issues.length === 0,
      files,
      ...(issues.length ? { issues } : {}),
    };
  }

  private async typeHierarchy(
    context: SemanticWorkspaceContext,
    input: SemanticSymbolQuery,
  ): Promise<unknown> {
    if (!input.relativePath || !input.namePath) throw new Error('SEMANTIC_SYMBOL_TARGET_REQUIRED');
    const hit = await this.exactSymbol(context, input.relativePath, input.namePath, input.language);
    const position = hit.symbol.selectionRange?.start ?? hit.symbol.range.start;
    const direction = input.hierarchyDirection ?? 'both';
    const depth = Math.max(0, Math.min(6, input.hierarchyDepth ?? 2));
    const maxResults = Math.max(1, input.maxResults ?? 50);
    const session = hit.session;
    session.assertCapability('typeHierarchyProvider', 'textDocument/prepareTypeHierarchy');

    const prepared = await session.request('textDocument/prepareTypeHierarchy', {
      textDocument: { uri: hit.uri },
      position,
    });
    const roots = Array.isArray(prepared) ? prepared : prepared ? [prepared] : [];
    const seen = new Set<string>();
    let emitted = 0;

    const expand = async (raw: unknown, remainingDepth: number): Promise<unknown | null> => {
      if (emitted >= maxResults || !raw || typeof raw !== 'object') return null;
      const item = raw as Record<string, unknown>;
      const uri = typeof item.uri === 'string' ? item.uri : '';
      const range = asRange(item.selectionRange ?? item.range);
      const name = typeof item.name === 'string' ? item.name : '';
      if (!uri || !range || !name) return null;

      const normalized = await normalizeLocations([{ uri, range }], context.folders, session.ignoredDirectories);
      const location = normalized.items[0];
      if (!location) return null;
      const key = `${uri}:${range.start.line}:${range.start.character}:${name}`;
      if (seen.has(key)) return null;
      seen.add(key);
      emitted += 1;

      const node: Record<string, unknown> = {
        name,
        kind: item.kind ?? '',
        ...(typeof item.detail === 'string' ? { detail: item.detail } : {}),
        workspaceFolder: location.workspaceFolder,
        relativePath: location.relativePath,
        range: location.range,
      };
      if (remainingDepth <= 0 || emitted >= maxResults) return node;

      if (direction === 'supertypes' || direction === 'both') {
        try {
          const rawParents = await session.request('typeHierarchy/supertypes', { item });
          const parents = [];
          for (const parent of Array.isArray(rawParents) ? rawParents : []) {
            const projected = await expand(parent, remainingDepth - 1);
            if (projected) parents.push(projected);
            if (emitted >= maxResults) break;
          }
          if (parents.length) node.supertypes = parents;
        } catch (error) {
          node.supertypesIssue = error instanceof Error ? error.message : String(error);
        }
      }
      if ((direction === 'subtypes' || direction === 'both') && emitted < maxResults) {
        try {
          const rawChildren = await session.request('typeHierarchy/subtypes', { item });
          const children = [];
          for (const child of Array.isArray(rawChildren) ? rawChildren : []) {
            const projected = await expand(child, remainingDepth - 1);
            if (projected) children.push(projected);
            if (emitted >= maxResults) break;
          }
          if (children.length) node.subtypes = children;
        } catch (error) {
          node.subtypesIssue = error instanceof Error ? error.message : String(error);
        }
      }
      return node;
    };

    const trees = [];
    for (const root of roots) {
      const projected = await expand(root, depth);
      if (projected) trees.push(projected);
      if (emitted >= maxResults) break;
    }
    return {
      context,
      target: hit.symbol.namePath,
      direction,
      depth,
      results: bounded(trees, maxResults, input.maxAnswerChars),
    };
  }

  async symbol(action: string, input: SemanticSymbolQuery = {}): Promise<unknown> {
    if (action === 'reloadProviders') return this.reloadProviders();
    if (action === 'provisionProvider') {
      if (!input.providerId) throw new Error('SEMANTIC_PROVIDER_ID_REQUIRED');
      if (input.confirmation !== 'PROVISION_PROVIDER') {
        throw new Error('SEMANTIC_PROVIDER_PROVISION_CONFIRMATION_REQUIRED: confirmation=PROVISION_PROVIDER');
      }
      return this.provisionProvider(input.providerId, input.repair === true);
    }
    if (action === 'status') {
      const context = await this.resolveContext(input);
      await this.ensureComposition(context.root);
      return { context, health: await this.health(), composition: Object.fromEntries(this.compositions.get(comparable(context.root)) ?? []) };
    }

    const context = await this.resolveContext(input);
    await this.ensureComposition(context.root);

    if (action === 'restart') {
      let restarted = 0;
      for (const [key, session] of [...this.sessions.entries()]) {
        if (comparable(session.root) !== comparable(context.root)) continue;
        if (input.language && session.id !== input.language) continue;
        await session.close().catch(() => undefined);
        this.sessions.delete(key);
        restarted += 1;
      }
      for (const folder of context.folders) this.freshness.clear(folder.root);
      return { restarted: true, restartedServers: restarted, context };
    }

    if (action === 'typeHierarchy') return this.typeHierarchy(context, input);

    if (action === 'overview') {
      if (!input.relativePath) throw new Error('SEMANTIC_RELATIVE_PATH_REQUIRED');
      const result = await this.symbolsForFile(context, input.relativePath, input.depth ?? 2, input.language);
      const info = input.includeInfo
        ? await this.enrichInfo(context, result.symbols, input.maxResults)
        : undefined;
      return {
        context,
        relativePath: input.relativePath,
        results: boundedSymbols(result.symbols, input.includeBody === true, input.maxResults, input.maxAnswerChars),
        ...(info ? { info } : {}),
      };
    }

    if (action === 'find') {
      if (input.relativePath) {
        const data = await this.symbolsForFile(context, input.relativePath, input.depth ?? 8, input.language);
        const all = flattenSymbols(data.symbols);
        const query = input.namePath ?? input.query ?? '';
        const matches = query
          ? all.filter(item => exactNamePathMatch(item, query) || item.namePath.includes(query) || item.name.includes(query))
          : all;
        const info = input.includeInfo
          ? await this.enrichInfo(context, matches, input.maxResults)
          : undefined;
        return {
          context,
          results: boundedSymbols(matches, input.includeBody === true, input.maxResults, input.maxAnswerChars),
          ...(info ? { info } : {}),
        };
      }

      if (!input.query) throw new Error('SEMANTIC_QUERY_REQUIRED');
      const definitions = input.language
        ? this.serverDefinitions.filter(item => item.id === input.language || Object.values(item.languageIds).includes(input.language!))
        : this.serverDefinitions;
      if (!definitions.length) throw new Error(`SEMANTIC_LANGUAGE_NOT_CONFIGURED: ${input.language ?? '<none>'}`);

      const items: Array<{
        name: string;
        kind: unknown;
        workspaceFolder: string;
        relativePath: string;
        range: LspRange;
        provider: string;
        server: string;
        info?: string;
      }> = [];
      const providerIssues: Array<{ server: string; message: string }> = [];
      const dropped = droppedSummary();
      const infoDeadline = Date.now() + Math.min(5000, this.config.callTimeoutMs);

      for (const definition of definitions) {
        try {
          const session = await this.getSessionForDefinition(context.root, definition, context.folders);
          await this.reconcile(session, context.root, definition);
          session.assertCapability('workspaceSymbolProvider', 'workspace/symbol');
          const raw = await session.request('workspace/symbol', { query: input.query });
          const rows = Array.isArray(raw) ? raw : [];
          for (const item of rows) {
            if (!item || typeof item !== 'object') continue;
            const value = item as Record<string, unknown>;
            const location = value.location as Record<string, unknown> | undefined;
            const normalized = await normalizeLocations(location ? [location] : [], context.folders, session.ignoredDirectories);
            for (const [key, count] of Object.entries(normalized.dropped)) {
              if (key !== 'total') (dropped as unknown as Record<string, number>)[key] += count as number;
            }
            dropped.total += normalized.dropped.total;
            const hit = normalized.items[0];
            if (!hit) continue;
            const kind = value.kind ?? '';
            const symbolName = session.normalizeSymbol(String(value.name ?? ''), typeof kind === 'number' ? kind : String(kind), typeof value.detail === 'string' ? value.detail : undefined);
            const row: {
              name: string;
              kind: unknown;
              workspaceFolder: string;
              relativePath: string;
              range: LspRange;
              provider: string;
              server: string;
              info?: string;
            } = {
              name: symbolName.name,
              kind,
              workspaceFolder: hit.workspaceFolder,
              relativePath: hit.relativePath,
              range: hit.range,
              provider: session.id,
              server: definition.id,
            };
            if (input.includeInfo && Date.now() < infoDeadline && session.supportsCapability('hoverProvider', 'textDocument/hover')) {
              try {
                const filePath = fileURLToPath(hit.uri);
                const { languageId } = this.definitionForFile(context.root, filePath, definition.id);
                const opened = await session.ensureDocument(filePath, languageId);
                const rawHover = await session.request('textDocument/hover', {
                  textDocument: { uri: opened.uri },
                  position: hit.range.start,
                });
                const info = hoverText(rawHover);
                if (info) row.info = info;
              } catch {}
            }
            items.push(row);
          }
        } catch (error) {
          providerIssues.push({ server: definition.id, message: error instanceof Error ? error.message : String(error) });
        }
      }

      if (!items.length && providerIssues.length === definitions.length) {
        throw new Error(`SEMANTIC_IDE_UNAVAILABLE: ${providerIssues.map(item => `${item.server}=${item.message}`).join('; ')}`);
      }
      return {
        context,
        results: bounded(items, input.maxResults, input.maxAnswerChars),
        ...(providerIssues.length ? { providerIssues } : {}),
        ...(dropped.total ? { droppedLocations: dropped } : {}),
      };
    }

    if (action === 'refs' || action === 'decl' || action === 'impl') {
      if (!input.relativePath || !input.namePath) throw new Error('SEMANTIC_SYMBOL_TARGET_REQUIRED');
      const hit = await this.exactSymbol(context, input.relativePath, input.namePath, input.language);
      const position = hit.symbol.selectionRange?.start ?? hit.symbol.range.start;
      const params: Record<string, unknown> = { textDocument: { uri: hit.uri }, position };
      if (action === 'refs') params.context = { includeDeclaration: true };
      const raw = await this.withRecovery(context, hit.filePath, session => {
        if (action === 'refs') {
          session.assertCapability('referencesProvider', 'textDocument/references');
          return session.request('textDocument/references', params);
        }
        if (action === 'impl') {
          session.assertCapability('implementationProvider', 'textDocument/implementation');
          return session.request('textDocument/implementation', params);
        }
        if (session.supportsCapability('declarationProvider', 'textDocument/declaration')) {
          return session.request('textDocument/declaration', params);
        }
        session.assertCapability('definitionProvider', 'textDocument/definition');
        return session.request('textDocument/definition', params);
      }, input.language);
      const locations = await normalizeLocations(raw, context.folders, hit.session.ignoredDirectories);
      const dependencyDefinitions = action === 'decl' && hit.session.providerKind === 'typescript' && !locations.items.length
        ? await normalizeDependencyDefinitions(raw, context.folders, hit.session.ignoredDirectories)
        : [];
      const resultItems = dependencyDefinitions.length ? dependencyDefinitions : locations.items;
      return {
        context,
        target: hit.symbol.namePath,
        results: bounded(resultItems, input.maxResults, input.maxAnswerChars),
        ...(dependencyDefinitions.length ? { dependencyFallback: true } : {}),
        ...(!dependencyDefinitions.length && locations.dropped.total ? { droppedLocations: locations.dropped } : {}),
      };
    }

    if (action === 'diag') {
      if (!input.relativePath) throw new Error('SEMANTIC_RELATIVE_PATH_REQUIRED');
      const target = input.namePath
        ? await this.exactSymbol(context, input.relativePath, input.namePath, input.language)
        : undefined;
      const result = await this.diagnosticsForRelativePath(context, input.relativePath, input.language);

      const filtered = result.items.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const value = item as Record<string, unknown>;
        if (input.severity !== undefined && value.severity !== input.severity) return false;
        if (target) {
          const diagnosticRange = asRange(value.range);
          if (!diagnosticRange || !rangesOverlap(diagnosticRange, target.symbol.range)) return false;
        }
        return true;
      });
      return {
        context,
        relativePath: input.relativePath,
        ...(target ? { target: target.symbol.namePath } : {}),
        diagnosticsFreshness: result.freshness,
        results: bounded(filtered, input.maxResults, input.maxAnswerChars),
      };
    }

    throw new Error('SEMANTIC_ACTION_UNSUPPORTED: ' + action);
  }

  private async commitEdit(
    context: SemanticWorkspaceContext,
    edit: WorkspaceEdit,
    dryRun: boolean,
    verifyDiagnostics = false,
    autoCheckpoint = false,
    execution?: MutationExecutionContext,
  ): Promise<SemanticMutationResult> {
    const preview = await planWorkspaceEdit(context.root, edit);
    const diagnosticPairs = preview.flatMap(plan =>
      plan.kind === 'text'
        ? [{ before: plan.relativePath, after: plan.relativePath }]
        : plan.skip ? [] : [{ before: plan.oldRelativePath, after: plan.newRelativePath }]);
    const beforeDiagnostics = new Map<string, { items: unknown[]; freshness: string }>();
    const beforeIssues: Array<{ relativePath: string; message: string }> = [];

    if (verifyDiagnostics && !dryRun) {
      for (const relativePath of [...new Set(diagnosticPairs.map(pair => pair.before))]) {
        try {
          beforeDiagnostics.set(relativePath, await this.diagnosticsForRelativePath(context, relativePath));
        } catch (error) {
          beforeIssues.push({
            relativePath,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const mutation = await applyWorkspacePlans(preview, { dryRun, autoCheckpoint, execution });
    if (dryRun) {
      return {
        mutation,
        semanticIde: { synced: false },
        grafel: { markedDirty: false, reindexRequested: false },
        ...(verifyDiagnostics ? {
          diagnosticsDelta: {
            requested: true,
            complete: false,
            files: [],
            issues: [{ relativePath: '<dry-run>', message: 'SEMANTIC_DIAGNOSTICS_DELTA_REQUIRES_APPLY' }],
          },
        } : {}),
      };
    }

    let synced = true;
    for (const file of mutation.files) {
      const absolute = path.resolve(context.root, file.relativePath);
      try {
        const { languageId } = this.definitionForFile(context.root, absolute);
        const session = await this.getSession(context.root, absolute, undefined, context.folders);
        await session.resync(absolute, languageId);
      } catch {
        synced = false;
      }
    }

    for (const renamed of mutation.renamedFiles ?? []) {
      const oldAbsolute = path.resolve(context.root, renamed.from);
      const newAbsolute = path.resolve(context.root, renamed.to);
      for (const session of this.sessions.values()) {
        if (comparable(session.root) !== comparable(context.root)) continue;
        await session.closeDocument(oldAbsolute).catch(() => undefined);
      }
      try {
        const { languageId } = this.definitionForFile(context.root, newAbsolute);
        const session = await this.getSession(context.root, newAbsolute, undefined, context.folders);
        await session.resync(newAbsolute, languageId);
      } catch {
        synced = false;
      }
    }

    for (const folder of context.folders) this.freshness.clear(folder.root);
    this.compositions.delete(comparable(context.root));

    const diagnosticsDelta = verifyDiagnostics
      ? await this.collectDiagnosticsDelta(context, diagnosticPairs, beforeDiagnostics, beforeIssues)
      : undefined;

    if (!this.codeIntelligence) {
      return {
        mutation,
        semanticIde: { synced },
        grafel: { markedDirty: false, reindexRequested: false, unavailable: 'code-intelligence unavailable' },
        ...(diagnosticsDelta ? { diagnosticsDelta } : {}),
      };
    }
    try {
      await this.codeIntelligence.indexWorkspace({
        workspace: context.workspace,
        ...(context.ref ? { ref: context.ref } : {}),
        ...(context.worktreePath ? { worktreePath: context.worktreePath } : {}),
      });
      return {
        mutation,
        semanticIde: { synced },
        grafel: { markedDirty: true, reindexRequested: true },
        ...(diagnosticsDelta ? { diagnosticsDelta } : {}),
      };
    } catch (error) {
      return {
        mutation,
        semanticIde: { synced },
        grafel: {
          markedDirty: false,
          reindexRequested: false,
          unavailable: error instanceof Error ? error.message : String(error),
        },
        ...(diagnosticsDelta ? { diagnosticsDelta } : {}),
      };
    }
  }

  async refactor(
    action: string,
    input: SemanticSymbolQuery & { newName?: string; body?: string; dryRun?: boolean; verifyDiagnostics?: boolean; autoCheckpoint?: boolean },
    execution?: MutationExecutionContext,
  ): Promise<unknown> {
    const context = await this.resolveContext(input, true);
    await this.ensureComposition(context.root);
    if (!input.relativePath || !input.namePath) throw new Error('SEMANTIC_SYMBOL_TARGET_REQUIRED');
    const hit = await this.exactSymbol(context, input.relativePath, input.namePath, input.language);
    const dryRun = input.dryRun === true;

    if (action === 'replaceBody' || action === 'before' || action === 'after') {
      if (input.body === undefined) throw new Error('SEMANTIC_BODY_REQUIRED');
      let range = hit.symbol.range;
      if (action === 'before') range = { start: hit.symbol.range.start, end: hit.symbol.range.start };
      if (action === 'after') range = { start: hit.symbol.range.end, end: hit.symbol.range.end };
      const edit: WorkspaceEdit = { changes: { [hit.uri]: [{ range, newText: input.body }] } };
      return this.commitEdit(context, edit, dryRun, input.verifyDiagnostics === true, input.autoCheckpoint === true, execution);
    }

    if (action === 'rename') {
      if (!input.newName) throw new Error('SEMANTIC_NEW_NAME_REQUIRED');
      const position = hit.symbol.selectionRange?.start ?? hit.symbol.range.start;
      const edit = await this.withRecovery(context, hit.filePath, async session => {
        session.assertCapability('renameProvider', 'textDocument/rename');
        const params = { textDocument: { uri: hit.uri }, position };
        try { await session.request('textDocument/prepareRename', params); } catch {}
        return session.request('textDocument/rename', { ...params, newName: input.newName });
      }, input.language);
      if (!edit || typeof edit !== 'object') throw new Error('SEMANTIC_RENAME_NOT_AVAILABLE');
      return this.commitEdit(context, edit as WorkspaceEdit, dryRun, input.verifyDiagnostics === true, input.autoCheckpoint === true, execution);
    }

    if (action === 'safeRemove') {
      const position = hit.symbol.selectionRange?.start ?? hit.symbol.range.start;
      const raw = await this.withRecovery(context, hit.filePath, session => {
        session.assertCapability('referencesProvider', 'textDocument/references');
        return session.request('textDocument/references', {
          textDocument: { uri: hit.uri },
          position,
          context: { includeDeclaration: true },
        });
      }, input.language);
      const locations = await normalizeLocations(raw, context.folders, hit.session.ignoredDirectories);
      if (locations.dropped.total) {
        return {
          refused: true,
          reason: 'SEMANTIC_REFERENCES_OUTSIDE_AUTHORIZED_SCOPE',
          droppedLocations: locations.dropped,
        };
      }
      const declarationRange = hit.symbol.selectionRange ?? hit.symbol.range;
      const live = locations.items.filter(item => {
        const folder = context.folders.find(value => value.name === item.workspaceFolder) ?? context.folders[0]!;
        const sameFile = comparable(path.resolve(folder.root, item.relativePath)) === comparable(hit.filePath);
        if (!sameFile) return true;
        const isDeclaration = hit.symbol.selectionRange
          ? rangesOverlap(item.range, declarationRange)
          : rangesEqual(item.range, declarationRange);
        return !isDeclaration;
      });
      if (live.length) {
        return {
          refused: true,
          reason: 'SEMANTIC_SYMBOL_REFERENCED',
          results: bounded(live, input.maxResults, input.maxAnswerChars),
        };
      }
      const edit: WorkspaceEdit = { changes: { [hit.uri]: [{ range: hit.symbol.range, newText: '' }] } };
      return this.commitEdit(context, edit, dryRun, input.verifyDiagnostics === true, input.autoCheckpoint === true, execution);
    }

    throw new Error('SEMANTIC_REFACTOR_ACTION_UNSUPPORTED: ' + action);
  }
}
