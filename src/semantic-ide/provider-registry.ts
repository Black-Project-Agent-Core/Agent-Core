import { access, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type {
  SemanticIdeConfig,
  SemanticIdeIssue,
  SemanticLanguageServerDefinition,
} from './types.js';
import { computeLanguageComposition } from './workspace-policy.js';
import { buildOwnedChildEnv } from '../security/environment.js';

export interface ProviderCapabilityRequirement {
  capability: string;
  method?: string;
}

export type ProviderReadiness = 'stopped' | 'process-running' | 'initialized' | 'indexing' | 'ready' | 'degraded';

export interface ProviderRuntimeControl {
  markReady(message?: string): void;
  markIndexing(message?: string): void;
  markDegraded(message: string): void;
  markFatal(message: string): void;
  registerCapability(method: string): void;
  unregisterCapability(method: string): void;
}

export interface ProviderServerRequestResult {
  handled: boolean;
  result?: unknown;
}

export interface SemanticProviderAdapter {
  readonly kind: string;
  readonly initialReadiness: 'ready' | 'indexing';
  readonly readinessTimeoutMs: number;
  readonly retryOnContentModified: string[];
  readonly requiredCapabilities: ProviderCapabilityRequirement[];
  readonly optionalCapabilities: ProviderCapabilityRequirement[];
  readonly ignoredDirectories: string[];
  initializationOptions(definition: SemanticLanguageServerDefinition): Record<string, unknown>;
  clientCapabilities(base: Record<string, unknown>): Record<string, unknown>;
  configurationResponse(params: unknown): unknown[];
  handleNotification(method: string, params: unknown, control: ProviderRuntimeControl): void;
  handleServerRequest(method: string, params: unknown, control: ProviderRuntimeControl): ProviderServerRequestResult;
  normalizeSymbol(name: string, kind: number | string, detail?: string): { name: string; detail?: string };
}

const SAFE_RETRY_METHODS = [
  'textDocument/documentSymbol',
  'textDocument/references',
  'textDocument/definition',
  'textDocument/declaration',
  'textDocument/implementation',
  'textDocument/hover',
  'textDocument/diagnostic',
  'workspace/symbol',
];

function genericConfiguration(params: unknown): unknown[] {
  if (!params || typeof params !== 'object') return [];
  const items = (params as { items?: unknown[] }).items;
  return Array.isArray(items) ? items.map(() => null) : [];
}

function baseAdapter(kind: string): SemanticProviderAdapter {
  return {
    kind,
    initialReadiness: 'ready',
    readinessTimeoutMs: 0,
    retryOnContentModified: [...SAFE_RETRY_METHODS],
    requiredCapabilities: [],
    optionalCapabilities: [],
    ignoredDirectories: [],
    initializationOptions: definition => ({ ...(definition.initializationOptions ?? {}) }),
    clientCapabilities: base => base,
    configurationResponse: genericConfiguration,
    handleNotification: () => undefined,
    handleServerRequest: () => ({ handled: false }),
    normalizeSymbol: (name, _kind, detail) => ({ name, ...(detail ? { detail } : {}) }),
  };
}

function csharpConfiguration(params: unknown): unknown[] {
  const items = params && typeof params === 'object' ? (params as { items?: unknown[] }).items : undefined;
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    const section = item && typeof item === 'object' ? String((item as { section?: unknown }).section ?? '') : '';
    if (section === 'tab_width' || section === 'indent_size') return 4;
    if (section === 'insert_final_newline') return true;
    if (section.startsWith('dotnet') || section.startsWith('csharp')) {
      if (/enable|show|suppress|navigate/i.test(section)) return false;
      if (/scope/i.test(section)) return 'openFiles';
      if (section === 'dotnet_member_insertion_location') return 'with_other_members_of_the_same_kind';
      if (section === 'dotnet_property_generation_behavior') return 'prefer_throwing_properties';
    }
    return null;
  });
}

export function createProviderAdapter(definition: SemanticLanguageServerDefinition): SemanticProviderAdapter {
  const adapterKind = definition.adapter ?? (['typescript', 'csharp', 'powershell', 'python'].includes(definition.id)
    ? definition.id
    : 'generic');

  if (adapterKind === 'typescript') {
    const activeProgress = new Set<string>();
    return {
      ...baseAdapter('typescript'),
      kind: 'typescript',
      initialReadiness: 'indexing',
      readinessTimeoutMs: definition.readinessTimeoutMs ?? 10_000,
      requiredCapabilities: definition.requiredCapabilities ?? [
        { capability: 'documentSymbolProvider', method: 'textDocument/documentSymbol' },
        { capability: 'referencesProvider', method: 'textDocument/references' },
        { capability: 'renameProvider', method: 'textDocument/rename' },
      ],
      optionalCapabilities: [
        { capability: 'definitionProvider', method: 'textDocument/definition' },
        { capability: 'declarationProvider', method: 'textDocument/declaration' },
        { capability: 'implementationProvider', method: 'textDocument/implementation' },
        { capability: 'workspaceSymbolProvider', method: 'workspace/symbol' },
      ],
      ignoredDirectories: ['dist', 'build', 'out'],
      retryOnContentModified: [],
      initializationOptions: current => ({
        ...(current.initializationOptions ?? {}),
        disableAutomaticTypingAcquisition: true,
      }),
      clientCapabilities() {
        return {
          workspace: {
            workspaceFolders: true,
            symbol: {},
            configuration: true,
          },
          textDocument: {
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            declaration: {},
            implementation: {},
            references: {},
            typeHierarchy: { dynamicRegistration: false },
            rename: { prepareSupport: true },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: { valueSet: [1, 2] },
            },
          },
        };
      },
      handleNotification(method, params, control) {
        if (method === '$/typescriptVersion') {
          control.markReady('typescript-version');
          return;
        }
        if (method === '$/progress' && params && typeof params === 'object') {
          const record = params as { token?: unknown; value?: { kind?: unknown } };
          const token = String(record.token ?? '');
          const kind = String(record.value?.kind ?? '');
          if (kind === 'begin') {
            activeProgress.add(token);
            control.markIndexing('typescript-progress');
          } else if (kind === 'end') {
            activeProgress.delete(token);
            if (!activeProgress.size) control.markReady('typescript-progress-complete');
          }
          return;
        }
        if (method === 'window/logMessage' && params && typeof params === 'object') {
          const message = String((params as { message?: unknown }).message ?? '');
          if (/tsserver.*(?:exited|terminated|crash)|(?:exited|terminated|crash).*tsserver/i.test(message)) {
            control.markFatal(`tsserver child reported fatal exit: ${message.slice(0, 500)}`);
          }
        }
      },
    };
  }

  if (adapterKind === 'csharp') {
    return {
      ...baseAdapter('csharp'),
      kind: 'csharp',
      initialReadiness: 'indexing',
      readinessTimeoutMs: definition.readinessTimeoutMs ?? 15_000,
      requiredCapabilities: definition.requiredCapabilities ?? [
        { capability: 'documentSymbolProvider', method: 'textDocument/documentSymbol' },
        { capability: 'referencesProvider', method: 'textDocument/references' },
        { capability: 'renameProvider', method: 'textDocument/rename' },
      ],
      optionalCapabilities: [
        { capability: 'definitionProvider', method: 'textDocument/definition' },
        { capability: 'implementationProvider', method: 'textDocument/implementation' },
      ],
      ignoredDirectories: ['bin', 'obj', 'packages', '.vs'],
      configurationResponse: csharpConfiguration,
      handleNotification(method, params, control) {
        if (method === 'workspace/projectInitializationComplete') {
          control.markReady('csharp-project-initialized');
          return;
        }
        if (method === '$/progress' && params && typeof params === 'object') {
          const kind = String(((params as { value?: { kind?: unknown } }).value?.kind) ?? '');
          if (kind === 'begin') control.markIndexing('csharp-progress');
          if (kind === 'end') control.markReady('csharp-progress-complete');
        }
      },
      handleServerRequest(method) {
        if (method === 'workspace/_roslyn_projectNeedsRestore') return { handled: true, result: null };
        return { handled: false };
      },
      normalizeSymbol(name, _kind, detail) {
        if (/\s:\s/.test(name) && !name.includes('(')) {
          const [base, ...rest] = name.split(/\s:\s/);
          return { name: base!.trim(), detail: detail ?? `: ${rest.join(' : ').trim()}` };
        }
        const paren = name.indexOf('(');
        if (paren > 0) return { name: name.slice(0, paren).trim(), detail: detail ?? name.slice(paren).trim() };
        return { name, ...(detail ? { detail } : {}) };
      },
    };
  }

  if (adapterKind === 'powershell') {
    return {
      ...baseAdapter('powershell'),
      kind: 'powershell',
      initialReadiness: 'indexing',
      readinessTimeoutMs: definition.readinessTimeoutMs ?? 10_000,
      requiredCapabilities: definition.requiredCapabilities ?? [
        { capability: 'documentSymbolProvider', method: 'textDocument/documentSymbol' },
      ],
      optionalCapabilities: [
        { capability: 'referencesProvider', method: 'textDocument/references' },
        { capability: 'renameProvider', method: 'textDocument/rename' },
      ],
      ignoredDirectories: ['bin', 'obj', 'TestResults', 'Output'],
      handleNotification(method, params, control) {
        if (method !== 'window/logMessage' || !params || typeof params !== 'object') return;
        const message = String((params as { message?: unknown }).message ?? '');
        if (/\b(?:ready|started)\b/i.test(message)) control.markReady('powershell-ready-log');
      },
      handleServerRequest(method, params, control) {
        if (method === 'client/registerCapability' && params && typeof params === 'object') {
          const registrations = (params as { registrations?: Array<{ method?: unknown }> }).registrations;
          if (Array.isArray(registrations) && registrations.some(item => item.method === 'textDocument/documentSymbol')) {
            control.markReady('powershell-document-symbol-registered');
          }
        }
        return { handled: false };
      },
      normalizeSymbol(name, kind, detail) {
        if (kind === 5 || kind === 'Class') {
          return { name: name.replace(/^class\s+/i, '').split('{', 1)[0]!.trim(), ...(detail ? { detail } : {}) };
        }
        if (kind === 6 || kind === 'Method') {
          return { name: name.split('(', 1)[0]!.trim().split(/\s+/).at(-1) ?? name, ...(detail ? { detail } : {}) };
        }
        if (kind === 12 || kind === 'Function') {
          return { name: name.replace(/^function\s+/i, '').split('(', 1)[0]!.trim(), ...(detail ? { detail } : {}) };
        }
        return { name, ...(detail ? { detail } : {}) };
      },
    };
  }

  if (adapterKind === 'python') {
    return {
      ...baseAdapter('python'),
      kind: 'python',
      initialReadiness: 'indexing',
      readinessTimeoutMs: definition.readinessTimeoutMs ?? 15_000,
      retryOnContentModified: [],
      requiredCapabilities: definition.requiredCapabilities ?? [
        { capability: 'documentSymbolProvider', method: 'textDocument/documentSymbol' },
        { capability: 'referencesProvider', method: 'textDocument/references' },
        { capability: 'renameProvider', method: 'textDocument/rename' },
      ],
      optionalCapabilities: [
        { capability: 'definitionProvider', method: 'textDocument/definition' },
        { capability: 'workspaceSymbolProvider', method: 'workspace/symbol' },
      ],
      ignoredDirectories: ['venv', '__pycache__', '.venv'],
      initializationOptions: current => ({
        exclude: [
          '**/__pycache__',
          '**/.venv',
          '**/.env',
          '**/build',
          '**/dist',
          '**/.pixi',
        ],
        reportMissingImports: 'error',
        ...(current.initializationOptions ?? {}),
      }),
      clientCapabilities() {
        const symbolKinds = Array.from({ length: 26 }, (_value, index) => index + 1);
        return {
          workspace: {
            workspaceEdit: { documentChanges: true },
            didChangeConfiguration: { dynamicRegistration: true },
            didChangeWatchedFiles: { dynamicRegistration: true },
            symbol: {
              dynamicRegistration: true,
              symbolKind: { valueSet: symbolKinds },
            },
            executeCommand: { dynamicRegistration: true },
          },
          textDocument: {
            synchronization: {
              dynamicRegistration: true,
              willSave: true,
              willSaveWaitUntil: true,
              didSave: true,
            },
            hover: { dynamicRegistration: true, contentFormat: ['markdown', 'plaintext'] },
            signatureHelp: {
              dynamicRegistration: true,
              signatureInformation: {
                documentationFormat: ['markdown', 'plaintext'],
                parameterInformation: { labelOffsetSupport: true },
              },
            },
            definition: { dynamicRegistration: true },
            references: { dynamicRegistration: true },
            typeHierarchy: { dynamicRegistration: true },
            documentSymbol: {
              dynamicRegistration: true,
              symbolKind: { valueSet: symbolKinds },
              hierarchicalDocumentSymbolSupport: true,
            },
            publishDiagnostics: { relatedInformation: true },
          },
        };
      },
      handleNotification(method, params, control) {
        if (method === 'pyright/beginProgress') control.markIndexing('pyright-progress');
        if (method === 'pyright/endProgress') control.markReady('pyright-progress-complete');
        if (method === 'experimental/serverStatus' && params && typeof params === 'object'
          && (params as { quiescent?: unknown }).quiescent === true) control.markReady('pyright-quiescent');
        if (method === 'window/logMessage' && params && typeof params === 'object') {
          const message = String((params as { message?: unknown }).message ?? '');
          if (/Found \d+ source files?/i.test(message)) control.markReady('pyright-source-scan-complete');
        }
      },
    };
  }

  return baseAdapter('generic');
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

function executableNames(name: string): string[] {
  if (process.platform !== 'win32') return [name];
  const extensions = (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean);
  return extensions.map(extension => name.toLowerCase().endsWith(extension.toLowerCase()) ? name : name + extension.toLowerCase());
}

async function findExecutable(name: string): Promise<string | undefined> {
  if (path.isAbsolute(name)) return (await exists(name)) ? name : undefined;
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const directory of pathEntries) {
    for (const candidateName of executableNames(name)) {
      const candidate = path.join(directory, candidateName);
      if (await exists(candidate)) return candidate;
    }
  }
  return undefined;
}

function windowsShim(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) return { command, args };
  const comspec = process.env.ComSpec || 'cmd.exe';
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return { command: comspec, args: ['/d', '/s', '/c', [quote(command), ...args.map(quote)].join(' ')] };
}

function tsDefinition(config: SemanticIdeConfig): SemanticLanguageServerDefinition {
  return {
    id: 'typescript',
    adapter: 'typescript',
    priority: 20,
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'],
    languageIds: {
      '.ts': 'typescript', '.tsx': 'typescriptreact', '.mts': 'typescript', '.cts': 'typescript',
      '.js': 'javascript', '.jsx': 'javascriptreact', '.mjs': 'javascript', '.cjs': 'javascript',
    },
    command: process.execPath,
    args: [config.typescriptServerPath, '--stdio'],
    versionProbe: {
      command: process.execPath,
      args: [config.typescriptServerPath, '--version'],
      pattern: '(\\d+\\.\\d+\\.\\d+)',
      timeoutMs: 5_000,
    },
    initializationOptions: config.typescriptTsserverPath
      ? { tsserver: { path: path.resolve(config.typescriptTsserverPath) } }
      : {},
  };
}

async function pythonDefinition(config: SemanticIdeConfig): Promise<SemanticLanguageServerDefinition | undefined> {
  const localEntry = path.join(config.runtimeDir, 'providers', 'python', 'node_modules', 'pyright', 'langserver.index.js');
  if (await exists(localEntry)) {
    const cliEntry = path.join(config.runtimeDir, 'providers', 'python', 'node_modules', 'pyright', 'index.js');
    return {
      id: 'python',
      adapter: 'python',
      priority: 20,
      extensions: ['.py', '.pyi'],
      languageIds: { '.py': 'python', '.pyi': 'python' },
      command: process.execPath,
      args: [localEntry, '--stdio'],
      ...(await exists(cliEntry) ? {
        versionProbe: {
          command: process.execPath,
          args: [cliEntry, '--version'],
          pattern: 'pyright\\s+(\\d+\\.\\d+\\.\\d+)',
          minVersion: '1.1.403',
          maxVersionExclusive: '1.1.404',
          timeoutMs: 5_000,
        },
      } : {}),
    };
  }

  const explicit = process.env.AGENT_CORE_SEMANTIC_IDE_PYTHON_SERVER?.trim();
  const command = (explicit && await exists(path.resolve(explicit)) ? path.resolve(explicit) : undefined)
    ?? await findExecutable('pyright-langserver');
  if (!command) return undefined;
  const launch = windowsShim(command, ['--stdio']);
  return {
    id: 'python',
    adapter: 'python',
    priority: 20,
    extensions: ['.py', '.pyi'],
    languageIds: { '.py': 'python', '.pyi': 'python' },
    command: launch.command,
    args: launch.args,
  };
}

async function csharpDefinition(config: SemanticIdeConfig): Promise<SemanticLanguageServerDefinition | undefined> {
  const explicitServer = process.env.AGENT_CORE_SEMANTIC_IDE_CSHARP_SERVER?.trim();
  const localServer = path.join(config.runtimeDir, 'providers', 'csharp', 'roslyn', 'Microsoft.CodeAnalysis.LanguageServer.dll');
  const serverPath = (explicitServer && await exists(path.resolve(explicitServer)) ? path.resolve(explicitServer) : undefined)
    ?? (await exists(localServer) ? localServer : undefined);
  if (!serverPath) return undefined;

  const explicitDotnet = process.env.AGENT_CORE_SEMANTIC_IDE_DOTNET?.trim();
  const provisionedDotnet = path.join(config.runtimeDir, 'providers', 'csharp', 'dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
  const legacyDotnet = path.join(config.runtimeDir, 'providers', 'dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
  const dotnet = (explicitDotnet && await exists(path.resolve(explicitDotnet)) ? path.resolve(explicitDotnet) : undefined)
    ?? (await exists(provisionedDotnet) ? provisionedDotnet : undefined)
    ?? (await exists(legacyDotnet) ? legacyDotnet : undefined)
    ?? await findExecutable('dotnet');
  if (!dotnet) return undefined;

  const logDir = path.join(config.runtimeDir, 'state', 'csharp', 'logs');
  await mkdir(logDir, { recursive: true });
  return {
    id: 'csharp',
    adapter: 'csharp',
    priority: 20,
    extensions: ['.cs'],
    languageIds: { '.cs': 'csharp' },
    command: dotnet,
    args: [serverPath, '--logLevel=Information', `--extensionLogDirectory=${logDir}`, '--stdio'],
    versionProbe: {
      command: dotnet,
      args: [serverPath, '--version'],
      pattern: '(\\d+\\.\\d+\\.\\d+)',
      minVersion: '5.5.0',
      maxVersionExclusive: '5.6.0',
      timeoutMs: 5_000,
    },
  };
}

async function powershellDefinition(config: SemanticIdeConfig): Promise<SemanticLanguageServerDefinition | undefined> {
  const explicit = process.env.AGENT_CORE_SEMANTIC_IDE_POWERSHELL_EDITOR_SERVICES?.trim();
  const local = path.join(config.runtimeDir, 'providers', 'powershell', 'PowerShellEditorServices', 'Start-EditorServices.ps1');
  const script = (explicit && await exists(path.resolve(explicit)) ? path.resolve(explicit) : undefined)
    ?? (await exists(local) ? local : undefined);
  if (!script) return undefined;
  const localPwsh = path.join(config.runtimeDir, 'providers', 'powershell', 'pwsh', process.platform === 'win32' ? 'pwsh.exe' : 'pwsh');
  const pwsh = (await exists(localPwsh) ? localPwsh : undefined) ?? await findExecutable('pwsh');
  if (!pwsh) return undefined;

  const stateDir = path.join(config.runtimeDir, 'state', 'powershell', 'session');
  await mkdir(stateDir, { recursive: true });
  const bundledModulesPath = path.dirname(script);
  const q = (value: string) => value.replace(/'/g, "''");
  const commandText = [
    `& '${q(script)}'`,
    "-HostName 'AgentCore'",
    "-HostProfileId 'agent-core'",
    "-HostVersion '1.0.0'",
    `-BundledModulesPath '${q(bundledModulesPath)}'`,
    `-LogPath '${q(path.join(stateDir, 'pses.log'))}'`,
    "-LogLevel 'Information'",
    `-SessionDetailsPath '${q(path.join(stateDir, 'session.json'))}'`,
    '-Stdio',
  ].join(' ');
  return {
    id: 'powershell',
    adapter: 'powershell',
    priority: 20,
    extensions: ['.ps1', '.psm1', '.psd1'],
    languageIds: { '.ps1': 'powershell', '.psm1': 'powershell', '.psd1': 'powershell' },
    command: pwsh,
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', commandText],
    versionProbe: {
      command: pwsh,
      args: ['--version'],
      pattern: '(\\d+\\.\\d+\\.\\d+)',
      minVersion: '7.6.6',
      maxVersionExclusive: '7.6.7',
      timeoutMs: 5_000,
    },
  };
}

const SENSITIVE_PROVIDER_ENV = /(token|secret|password|credential|authorization|cookie|api[_-]?key|private[_-]?key)/i;
const PROVIDER_ENV_INTERPOLATION = /\$\{|\$env:|%[A-Za-z_][A-Za-z0-9_]*%/i;

function validProviderEnv(value: unknown): value is Record<string, string> {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([key, item]) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    && !SENSITIVE_PROVIDER_ENV.test(key)
    && typeof item === 'string'
    && item.length <= 4000
    && !PROVIDER_ENV_INTERPOLATION.test(item)
    && !/[\r\n]/.test(item));
}

function validTransport(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const transport = value as { kind?: unknown; host?: unknown; port?: unknown; connectTimeoutMs?: unknown; retryDelayMs?: unknown };
  if (transport.kind === 'stdio-owned') return true;
  if (transport.kind !== 'tcp-external') return false;
  const host = String(transport.host ?? '').trim().toLowerCase();
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) return false;
  if (!Number.isInteger(transport.port) || Number(transport.port) < 1 || Number(transport.port) > 65535) return false;
  if (transport.connectTimeoutMs !== undefined && (!Number.isInteger(transport.connectTimeoutMs) || Number(transport.connectTimeoutMs) < 100)) return false;
  if (transport.retryDelayMs !== undefined && (!Number.isInteger(transport.retryDelayMs) || Number(transport.retryDelayMs) < 25)) return false;
  return true;
}

function validVersionProbe(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const probe = value as { command?: unknown; args?: unknown; pattern?: unknown; minVersion?: unknown; maxVersionExclusive?: unknown; timeoutMs?: unknown; env?: unknown };
  return typeof probe.command === 'string'
    && probe.command.length > 0
    && (probe.args === undefined || (Array.isArray(probe.args) && probe.args.every(arg => typeof arg === 'string')))
    && (probe.pattern === undefined || typeof probe.pattern === 'string')
    && (probe.minVersion === undefined || typeof probe.minVersion === 'string')
    && (probe.maxVersionExclusive === undefined || typeof probe.maxVersionExclusive === 'string')
    && (probe.timeoutMs === undefined || (Number.isInteger(probe.timeoutMs) && Number(probe.timeoutMs) >= 100))
    && validProviderEnv(probe.env);
}

export function validServerDefinition(value: unknown): value is SemanticLanguageServerDefinition {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SemanticLanguageServerDefinition>;
  const transportKind = item.transport?.kind ?? 'stdio-owned';
  const stdioValid = transportKind !== 'stdio-owned'
    || (typeof item.command === 'string' && item.command.length > 0);
  return typeof item.id === 'string'
    && item.id.length > 0
    && Array.isArray(item.extensions)
    && item.extensions.length > 0
    && item.extensions.every(extension => typeof extension === 'string' && extension.startsWith('.'))
    && Boolean(item.languageIds && typeof item.languageIds === 'object')
    && stdioValid
    && (item.args === undefined || (Array.isArray(item.args) && item.args.every(arg => typeof arg === 'string')))
    && validTransport(item.transport)
    && validProviderEnv(item.env)
    && validVersionProbe(item.versionProbe);
}

export async function discoverBuiltInProviders(
  config: SemanticIdeConfig,
): Promise<{ definitions: SemanticLanguageServerDefinition[]; issues: SemanticIdeIssue[] }> {
  const definitions: SemanticLanguageServerDefinition[] = [tsDefinition(config)];
  const issues: SemanticIdeIssue[] = [];
  if (!(await exists(config.typescriptServerPath))) {
    issues.push({
      code: 'SEMANTIC_LANGUAGE_NOT_CONFIGURED',
      message: `TypeScript language server missing: ${config.typescriptServerPath}`,
      server: 'typescript',
    });
  }
  if (config.typescriptTsserverPath && !(await exists(config.typescriptTsserverPath))) {
    issues.push({
      code: 'SEMANTIC_LANGUAGE_NOT_CONFIGURED',
      message: `Compatible TypeScript tsserver missing: ${config.typescriptTsserverPath}`,
      server: 'typescript',
    });
  }

  for (const candidate of [
    await csharpDefinition(config),
    await powershellDefinition(config),
    await pythonDefinition(config),
  ]) {
    if (candidate) definitions.push(candidate);
  }
  return { definitions, issues };
}

export function mergeProviderDefinitions(
  builtIns: SemanticLanguageServerDefinition[],
  configDefinitions: SemanticLanguageServerDefinition[] = [],
  fileDefinitions: SemanticLanguageServerDefinition[] = [],
): SemanticLanguageServerDefinition[] {
  const merged = new Map<string, SemanticLanguageServerDefinition>();
  for (const definition of builtIns) merged.set(definition.id, { ...definition });
  for (const definition of configDefinitions) {
    merged.set(definition.id, { ...definition, priority: Math.max(1000, definition.priority ?? 0) });
  }
  for (const definition of fileDefinitions) {
    merged.set(definition.id, { ...definition, priority: Math.max(2000, definition.priority ?? 0) });
  }
  return [...merged.values()];
}

export async function providerComposition(
  root: string,
  definitions: SemanticLanguageServerDefinition[],
): Promise<Map<string, number>> {
  return computeLanguageComposition(root, definitions);
}

export function selectProviderDefinition(
  root: string,
  filePath: string,
  requestedLanguage: string | undefined,
  definitions: SemanticLanguageServerDefinition[],
  composition: Map<string, number> | undefined,
): { definition: SemanticLanguageServerDefinition; languageId: string } {
  const extension = path.extname(filePath).toLowerCase();
  const candidates = definitions.filter(definition =>
    definition.extensions.some(item => item.toLowerCase() === extension));
  const filtered = requestedLanguage
    ? candidates.filter(item => item.id === requestedLanguage || Object.values(item.languageIds).includes(requestedLanguage))
    : candidates;
  const ranked = [...filtered].sort((left, right) => {
    const priority = (right.priority ?? 0) - (left.priority ?? 0);
    if (priority) return priority;
    const suitability = (composition?.get(right.id) ?? 0) - (composition?.get(left.id) ?? 0);
    if (suitability) return suitability;
    return left.id.localeCompare(right.id);
  });
  const definition = ranked[0];
  if (!definition) throw new Error(`SEMANTIC_LANGUAGE_NOT_CONFIGURED: ${(requestedLanguage ?? extension) || '<none>'}`);
  return { definition, languageId: definition.languageIds[extension] ?? requestedLanguage ?? definition.id };
}


export interface SemanticProviderVersionInfo {
  observedVersion?: string;
  compatibility: 'compatible' | 'out-of-range' | 'unknown';
  issue?: string;
}

function numericVersionParts(value: string): number[] | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return match.slice(1).map(part => Number(part ?? 0));
}

function compareVersions(left: string, right: string): number | null {
  const a = numericVersionParts(left);
  const b = numericVersionParts(right);
  if (!a || !b) return null;
  const width = Math.max(a.length, b.length);
  for (let index = 0; index < width; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta) return delta < 0 ? -1 : 1;
  }
  return 0;
}

export async function probeProviderVersion(
  definition: SemanticLanguageServerDefinition,
  defaultTimeoutMs = 5_000,
): Promise<SemanticProviderVersionInfo> {
  const probe = definition.versionProbe;
  if (!probe) return { compatibility: 'unknown' };

  const launch = windowsShim(probe.command, probe.args ?? []);
  const timeoutMs = Math.max(100, Math.min(30_000, probe.timeoutMs ?? defaultTimeoutMs));
  const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(launch.command, launch.args, {
      cwd: process.cwd(),
      env: buildOwnedChildEnv(probe.env ?? {}),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', chunk => { stdout = (stdout + String(chunk)).slice(-8_000); });
    child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-8_000); });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* bounded version probe cleanup */ }
      reject(new Error('SEMANTIC_PROVIDER_VERSION_PROBE_TIMEOUT'));
    }, timeoutMs);
    timer.unref();
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', code => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });
  }).catch(error => ({ exitCode: null, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));

  if (result.exitCode !== 0) {
    return { compatibility: 'unknown', issue: 'SEMANTIC_PROVIDER_VERSION_PROBE_FAILED' };
  }

  const text = `${result.stdout}\n${result.stderr}`.trim();
  let observedVersion: string | undefined;
  try {
    const pattern = probe.pattern ? new RegExp(probe.pattern) : /(\d+(?:\.\d+){1,3})/;
    const match = pattern.exec(text);
    observedVersion = match?.[1] ?? match?.[0];
  } catch {
    return { compatibility: 'unknown', issue: 'SEMANTIC_PROVIDER_VERSION_PATTERN_INVALID' };
  }
  if (!observedVersion) {
    return { compatibility: 'unknown', issue: 'SEMANTIC_PROVIDER_VERSION_NOT_DETECTED' };
  }

  let compatibility: SemanticProviderVersionInfo['compatibility'] = 'compatible';
  if (probe.minVersion) {
    const compared = compareVersions(observedVersion, probe.minVersion);
    if (compared === null) compatibility = 'unknown';
    else if (compared < 0) compatibility = 'out-of-range';
  }
  if (compatibility !== 'out-of-range' && probe.maxVersionExclusive) {
    const compared = compareVersions(observedVersion, probe.maxVersionExclusive);
    if (compared === null) compatibility = 'unknown';
    else if (compared >= 0) compatibility = 'out-of-range';
  }

  return {
    observedVersion,
    compatibility,
    ...(compatibility === 'out-of-range' ? { issue: 'SEMANTIC_PROVIDER_VERSION_OUT_OF_RANGE' } : {}),
  };
}
