import { createHash } from 'node:crypto';
import path from 'node:path';
import { validateDiagnosticItems } from './diagnostic-payload.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { WorkspaceFreshnessResult } from './freshness.js';
import { createProviderAdapter, type ProviderPostInitializeEvidence, type ProviderRuntimeControl } from './provider-registry.js';
import { LspConnection, LspServerRequestError } from './protocol.js';
import { readSemanticSource } from './source-io.js';
import { buildOwnedChildEnv } from '../security/environment.js';
import type {
  SemanticLanguageServerDefinition,
  SemanticProviderReadiness,
  SemanticWorkspaceFolder,
} from './types.js';

interface OpenDocument {
  version: number;
  text: string;
  hash: string;
  languageId: string;
}

interface DiagnosticState {
  generation: number;
  items: unknown[];
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function canonicalFileUri(uri: string): string {
  if (!uri.startsWith('file:')) return uri;
  try {
    let filePath = path.resolve(fileURLToPath(uri));
    if (process.platform === 'win32' && /^[a-zA-Z]:/.test(filePath)) {
      filePath = filePath[0]!.toUpperCase() + filePath.slice(1);
    }
    return pathToFileURL(filePath).href;
  } catch {
    return uri;
  }
}

function capabilityPresent(capabilities: Record<string, unknown>, key: string): boolean {
  const value = capabilities[key];
  return value !== undefined && value !== null && value !== false;
}

export class LanguageServerSession {
  private readonly connection: LspConnection;
  private readonly documents = new Map<string, OpenDocument>();
  private readonly diagnostics = new Map<string, DiagnosticState>();
  private readonly dynamicCapabilities = new Set<string>();
  private readonly adapter;
  private capabilities: Record<string, unknown> = {};
  private initialized = false;
  private startPromise?: Promise<void>;
  private diagnosticsGeneration = 0;
  private readinessValue: SemanticProviderReadiness = 'stopped';
  private readinessMessageValue?: string;
  private fatalMessage?: string;
  private capabilityIssuesValue: string[] = [];
  private freshnessValue?: WorkspaceFreshnessResult;
  private postInitializeValue?: ProviderPostInitializeEvidence;

  constructor(
    readonly definition: SemanticLanguageServerDefinition,
    readonly root: string,
    private readonly timeoutMs: number,
    readonly workspaceFolders: SemanticWorkspaceFolder[] = [{ name: path.basename(root) || 'workspace', root }],
  ) {
    this.adapter = createProviderAdapter(definition);
    const providerEnv = definition.transport?.kind === 'tcp-external'
      ? undefined
      : buildOwnedChildEnv(definition.env ?? {});
    this.connection = new LspConnection(
      definition.command,
      definition.args ?? [],
      root,
      timeoutMs,
      (method, params) => this.handleNotification(method, params),
      (method, params) => this.handleServerRequest(method, params),
      providerEnv,
      definition.transport ?? { kind: 'stdio-owned' },
    );
    this.connection.setContentModifiedRetryMethods(this.adapter.retryOnContentModified);
  }

  get id(): string { return this.definition.id; }
  get pid(): number | undefined { return this.connection.pid; }
  get state(): string { return this.connection.state; }
  get readiness(): SemanticProviderReadiness { return this.readinessValue; }
  get readinessMessage(): string | undefined { return this.readinessMessageValue; }
  get serverCapabilities(): Record<string, unknown> { return { ...this.capabilities }; }
  get capabilityIssues(): string[] { return [...this.capabilityIssuesValue]; }
  get freshness(): WorkspaceFreshnessResult | undefined { return this.freshnessValue ? { ...this.freshnessValue } : undefined; }
  get postInitializeEvidence(): ProviderPostInitializeEvidence | undefined { return this.postInitializeValue ? { ...this.postInitializeValue } : undefined; }
  get providerKind(): string { return this.adapter.kind; }
  get ignoredDirectories(): string[] {
    return [...new Set([...(this.definition.ignoredDirectories ?? []), ...this.adapter.ignoredDirectories])];
  }

  private control(): ProviderRuntimeControl {
    return {
      markReady: message => {
        if (this.fatalMessage) return;
        this.readinessValue = 'ready';
        this.readinessMessageValue = message;
      },
      markIndexing: message => {
        if (this.fatalMessage) return;
        this.readinessValue = 'indexing';
        this.readinessMessageValue = message;
      },
      markDegraded: message => {
        if (this.fatalMessage) return;
        this.readinessValue = 'degraded';
        this.readinessMessageValue = message;
      },
      markFatal: message => {
        this.fatalMessage = message;
        this.readinessValue = 'degraded';
        this.readinessMessageValue = message;
      },
      registerCapability: method => this.dynamicCapabilities.add(method),
      unregisterCapability: method => this.dynamicCapabilities.delete(method),
    };
  }

  private handleNotification(method: string, params: unknown): void {
    if (method === 'textDocument/publishDiagnostics' && params && typeof params === 'object') {
      const value = params as { uri?: unknown; diagnostics?: unknown };
      const decoded = validateDiagnosticItems(value.diagnostics);
      if (typeof value.uri !== 'string' || !value.uri.trim() || !decoded.valid) {
        this.noteDiagnosticPayloadInvalid();
        return;
      }
      const key = canonicalFileUri(value.uri);
      this.diagnosticsGeneration += 1;
      this.diagnostics.set(key, { generation: this.diagnosticsGeneration, items: decoded.items });
      this.capabilityIssuesValue = this.capabilityIssuesValue.filter(issue => issue !== 'SEMANTIC_DIAGNOSTIC_PAYLOAD_INVALID');
    }
    this.adapter.handleNotification(method, params, this.control());
  }

  private updateDynamicRegistrations(params: unknown, remove = false): void {
    if (!params || typeof params !== 'object') return;
    const values = remove
      ? (params as { unregisterations?: Array<{ method?: unknown }>; unregistrations?: Array<{ method?: unknown }> }).unregistrations
        ?? (params as { unregisterations?: Array<{ method?: unknown }> }).unregisterations
      : (params as { registrations?: Array<{ method?: unknown }> }).registrations;
    if (!Array.isArray(values)) return;
    for (const item of values) {
      const method = typeof item?.method === 'string' ? item.method : '';
      if (!method) continue;
      if (remove) this.dynamicCapabilities.delete(method);
      else this.dynamicCapabilities.add(method);
    }
  }

  private handleServerRequest(method: string, params: unknown): unknown {
    if (method === 'client/registerCapability') {
      this.updateDynamicRegistrations(params, false);
      const adapterResult = this.adapter.handleServerRequest(method, params, this.control());
      return adapterResult.handled ? adapterResult.result : null;
    }
    if (method === 'client/unregisterCapability') {
      this.updateDynamicRegistrations(params, true);
      const adapterResult = this.adapter.handleServerRequest(method, params, this.control());
      return adapterResult.handled ? adapterResult.result : null;
    }

    const adapterResult = this.adapter.handleServerRequest(method, params, this.control());
    if (adapterResult.handled) return adapterResult.result;

    if (method === 'workspace/configuration') return this.adapter.configurationResponse(params);
    if (method === 'workspace/applyEdit') {
      return { applied: false, failureReason: 'Agent Core applies refactors through its own transaction boundary.' };
    }
    if (method === 'workspace/executeClientCommand') return [];
    if (method === 'workspace/workspaceFolders') {
      return this.workspaceFolders.map(folder => ({ uri: pathToFileURL(folder.root).href, name: folder.name }));
    }
    if (method === 'window/workDoneProgress/create'
      || method === 'window/showMessageRequest'
      || method === 'workspace/diagnostic/refresh'
      || method === 'workspace/inlayHint/refresh'
      || method === 'workspace/inlineValue/refresh'
      || method === 'workspace/semanticTokens/refresh'
      || method === 'workspace/codeLens/refresh') return null;

    throw new LspServerRequestError(-32601, `Method not found: ${method}`);
  }

  private initializeCapabilities(): Record<string, unknown> {
    return {
      workspace: {
        workspaceFolders: true,
        configuration: true,
        didChangeConfiguration: { dynamicRegistration: false },
        didChangeWatchedFiles: { dynamicRegistration: false },
        symbol: { dynamicRegistration: false },
      },
      window: { workDoneProgress: true },
      general: {
        staleRequestSupport: {
          cancel: false,
          retryOnContentModified: [...this.adapter.retryOnContentModified],
        },
      },
      textDocument: {
        synchronization: { dynamicRegistration: false, didSave: true },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true, dynamicRegistration: false },
        hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
        declaration: { dynamicRegistration: false },
        definition: { dynamicRegistration: false },
        implementation: { dynamicRegistration: false },
        references: { dynamicRegistration: false },
        typeHierarchy: { dynamicRegistration: false },
        rename: { dynamicRegistration: false, prepareSupport: true },
        publishDiagnostics: { relatedInformation: true, tagSupport: { valueSet: [1, 2] } },
      },
    };
  }

  async start(): Promise<void> {
    if (this.initialized && this.connection.state === 'running') return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = undefined;
    });
    return this.startPromise;
  }

  private async startInternal(): Promise<void> {
    this.fatalMessage = undefined;
    this.capabilityIssuesValue = [];
    this.readinessValue = 'process-running';
    this.readinessMessageValue = undefined;
    this.postInitializeValue = undefined;

    try {
      await this.connection.start();
      const rootUri = pathToFileURL(this.root).href;
      const result = await this.connection.request('initialize', {
        processId: this.definition.transport?.kind === 'tcp-external' ? null : process.pid,
        rootPath: this.root,
        rootUri,
        workspaceFolders: this.workspaceFolders.map(folder => ({ uri: pathToFileURL(folder.root).href, name: folder.name })),
        clientInfo: { name: 'Agent Core' },
        initializationOptions: this.adapter.initializationOptions(this.definition),
        capabilities: this.adapter.clientCapabilities(this.initializeCapabilities()),
      }) as { capabilities?: Record<string, unknown> };

      this.capabilities = result?.capabilities ?? {};
      if (this.readinessValue === 'process-running') this.readinessValue = 'initialized';
      this.connection.notify('initialized', {});
      this.initialized = true;
      if (this.adapter.postInitialize) {
        const plan = await this.adapter.postInitialize(this.root, this.ignoredDirectories);
        for (const notification of plan.notifications) {
          this.connection.notify(notification.method, notification.params);
        }
        this.postInitializeValue = { ...plan.evidence };
      }

      if (this.adapter.initialReadiness === 'ready') {
        if (this.readinessValue === 'initialized') {
          this.readinessValue = 'ready';
          this.readinessMessageValue = 'initialized';
        }
      } else {
        if (this.readinessValue === 'initialized') {
          this.readinessValue = 'indexing';
          this.readinessMessageValue = 'awaiting-provider-readiness';
        }
        if (this.readinessValue === 'indexing') {
          const deadline = Date.now() + this.adapter.readinessTimeoutMs;
          while (this.readinessValue === 'indexing' && Date.now() < deadline && !this.fatalMessage) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          if (this.readinessValue === 'indexing') {
            this.readinessValue = 'degraded';
            this.readinessMessageValue = 'SEMANTIC_PROVIDER_READINESS_TIMEOUT';
          }
        }
      }

      this.capabilityIssuesValue = this.adapter.requiredCapabilities
        .filter(requirement => !this.hasCapability(requirement.capability, requirement.method))
        .map(requirement => `${requirement.capability}${requirement.method ? ` (${requirement.method})` : ''}`);
      if (this.capabilityIssuesValue.length && !this.fatalMessage) {
        this.readinessValue = 'degraded';
        this.readinessMessageValue = `SEMANTIC_PROVIDER_CAPABILITY_UNAVAILABLE: ${this.capabilityIssuesValue.join(', ')}`;
      }

      await this.connection.refreshOwnedProcessTree().catch(() => []);
    } catch (error) {
      this.initialized = false;
      this.readinessValue = 'degraded';
      this.readinessMessageValue = error instanceof Error ? error.message : String(error);
      await this.connection.close().catch(() => undefined);
      throw error;
    }
  }

  private hasCapability(capability: string, dynamicMethod?: string): boolean {
    return capabilityPresent(this.capabilities, capability)
      || Boolean(dynamicMethod && this.dynamicCapabilities.has(dynamicMethod));
  }

  supportsCapability(capability: string, dynamicMethod?: string): boolean {
    return this.hasCapability(capability, dynamicMethod);
  }

  assertCapability(capability: string, dynamicMethod?: string): void {
    if (this.supportsCapability(capability, dynamicMethod)) return;
    throw new Error(`SEMANTIC_PROVIDER_CAPABILITY_UNAVAILABLE: ${this.id}: ${capability}${dynamicMethod ? `/${dynamicMethod}` : ''}`);
  }

  private assertUsable(): void {
    if (this.fatalMessage) throw new Error(`SEMANTIC_IDE_PROVIDER_FATAL: ${this.id}: ${this.fatalMessage}`);
  }

  normalizeSymbol(name: string, kind: number | string, detail?: string): { name: string; detail?: string } {
    return this.adapter.normalizeSymbol(name, kind, detail);
  }

  noteFreshness(result: WorkspaceFreshnessResult): void {
    this.freshnessValue = { ...result };
  }

  notify(method: string, params?: unknown): void {
    this.connection.notify(method, params);
  }

  async ensureDocument(filePath: string, languageId: string): Promise<{ uri: string; text: string }> {
    await this.start();
    this.assertUsable();
    const uri = canonicalFileUri(pathToFileURL(filePath).href);
    const source = await readSemanticSource(this.root, filePath, this.definition.encoding);
    const text = source.text;
    const hash = digest(text);
    const current = this.documents.get(uri);
    if (!current) {
      const doc = { version: 1, text, hash, languageId };
      this.documents.set(uri, doc);
      this.connection.notify('textDocument/didOpen', {
        textDocument: { uri, languageId, version: doc.version, text },
      });
    } else if (current.hash !== hash) {
      current.version += 1;
      current.text = text;
      current.hash = hash;
      current.languageId = languageId;
      this.connection.notify('textDocument/didChange', {
        textDocument: { uri, version: current.version },
        contentChanges: [{ text }],
      });
    }
    return { uri, text };
  }

  async bindCreatedFile(filePath: string, languageId: string): Promise<void> {
    await this.start();
    this.assertUsable();
    const uri = canonicalFileUri(pathToFileURL(filePath).href);
    if (this.documents.has(uri)) return;
    const source = await readSemanticSource(this.root, filePath, this.definition.encoding);
    this.connection.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text: source.text },
    });
    this.connection.notify('textDocument/didClose', { textDocument: { uri } });
  }

  async closeDocument(filePath: string): Promise<void> {
    const uri = canonicalFileUri(pathToFileURL(filePath).href);
    if (!this.documents.has(uri)) return;
    this.connection.notify('textDocument/didClose', { textDocument: { uri } });
    this.documents.delete(uri);
  }

  async closeDeletedFile(filePath: string): Promise<void> {
    await this.closeDocument(filePath);
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.start();
    this.assertUsable();
    return this.connection.request(method, params);
  }

  noteDiagnosticPayloadInvalid(): void {
    const code = 'SEMANTIC_DIAGNOSTIC_PAYLOAD_INVALID';
    if (!this.capabilityIssuesValue.includes(code)) this.capabilityIssuesValue.push(code);
  }

  diagnosticsFor(uri: string): unknown[] {
    return [...(this.diagnostics.get(canonicalFileUri(uri))?.items ?? [])];
  }

  diagnosticsGenerationFor(uri: string): number {
    return this.diagnostics.get(canonicalFileUri(uri))?.generation ?? -1;
  }

  async waitForDiagnosticsAfter(
    uri: string,
    generation: number,
    timeoutMs: number,
  ): Promise<{ items: unknown[]; fresh: boolean; generation: number }> {
    const key = canonicalFileUri(uri);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const current = this.diagnostics.get(key);
      if (current && current.generation > generation) {
        return { items: [...current.items], fresh: true, generation: current.generation };
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const current = this.diagnostics.get(key);
    return {
      items: [...(current?.items ?? [])],
      fresh: false,
      generation: current?.generation ?? -1,
    };
  }

  async resync(filePath: string, languageId: string): Promise<void> {
    const { uri, text } = await this.ensureDocument(filePath, languageId);
    this.connection.notify('textDocument/didSave', { textDocument: { uri }, text });
  }

  async close(): Promise<void> {
    for (const uri of this.documents.keys()) {
      this.connection.notify('textDocument/didClose', { textDocument: { uri } });
    }
    this.documents.clear();
    await this.connection.close();
    this.initialized = false;
    this.readinessValue = 'stopped';
    this.readinessMessageValue = undefined;
    this.fatalMessage = undefined;
  }
}
