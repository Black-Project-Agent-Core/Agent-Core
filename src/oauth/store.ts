import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { persistOAuthSnapshot } from './atomic-file.js';
import { withOAuthProcessLock } from './file-lock.js';

const CLIENT_ID_PREFIX = 'agent_core_client_';
const CLIENT_SECRET_PREFIX = 'agent_core_secret_';
const CODE_PREFIX = 'agent_core_code_';
export const ACCESS_TOKEN_PREFIX = 'agent_core_oauth_';
const REFRESH_TOKEN_PREFIX = 'agent_core_refresh_';

export interface OAuthPrincipal {
  clientId: string;
  resource: string;
  scopes: string[];
  keyId: string;
  keyName: string;
}

interface ClientRecord {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  secretHash: string;
  createdAt: string;
}

interface CodeRecord extends OAuthPrincipal {
  hash: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: string;
  usedAt: string | null;
}
interface AccessTokenRecord extends OAuthPrincipal {
  hash: string;
  expiresAt: string;
}

interface RefreshTokenRecord extends OAuthPrincipal {
  hash: string;
  expiresAt: string;
  revokedAt: string | null;
}

interface OAuthFile {
  version: 1;
  clients: ClientRecord[];
  codes: CodeRecord[];
  accessTokens: AccessTokenRecord[];
  refreshTokens: RefreshTokenRecord[];
}

export interface RegisteredClient {
  client_id: string;
  client_secret: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
  client_secret_expires_at: 0;
}

export interface PublicClient {
  clientId: string;
  redirectUris: string[];
}

export interface OAuthResetOptions {
  importClientStores?: FileOAuthStore[];
}

export interface OAuthResetResult {
  backupPath: string | null;
  clientsPreserved: number;
  clientsImported: number;
  grantsCleared: true;
}
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('base64');
}

function safeHashEqual(secret: string, expectedBase64: string): boolean {
  const actual = Buffer.from(hashSecret(secret), 'base64');
  const expected = Buffer.from(expectedBase64, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function freshSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

function emptyFile(): OAuthFile {
  return { version: 1, clients: [], codes: [], accessTokens: [], refreshTokens: [] };
}

function expiry(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export interface OAuthTokens { accessToken: string; refreshToken: string; expiresIn: number; }
export interface OAuthExchange { principal: OAuthPrincipal; tokens: OAuthTokens; }
interface CodeExchangeInput { clientId: string; redirectUri: string; codeVerifier: string; resource: string; }
interface RefreshExchangeInput { clientId: string; resource: string; }

// One queue per resolved file, shared by all instances in this Node process.
// The outer queue avoids same-process contention; the atomic lock file coordinates other processes.
const oauthFileQueues = new Map<string, Promise<void>>();
function withOAuthFile<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const resolved = path.resolve(filePath);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const previous = oauthFileQueues.get(key) ?? Promise.resolve();
  const result = previous.then(() => withOAuthProcessLock(resolved, operation));
  const settled = result.then(() => undefined, () => undefined);
  oauthFileQueues.set(key, settled);
  void settled.then(() => { if (oauthFileQueues.get(key) === settled) oauthFileQueues.delete(key); });
  return result;
}

export class FileOAuthStore {
  readonly filePath: string;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, 'oauth.json');
  }

  private async load(): Promise<OAuthFile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as OAuthFile;
      if (parsed.version !== 1) throw new Error('Unsupported OAuth store format');
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyFile();
      throw error;
    }
  }

  private async save(file: OAuthFile): Promise<void> {
    await persistOAuthSnapshot(this.filePath, `${JSON.stringify(file, null, 2)}\n`);
  }

  async registerClient(input: {
    clientName: string;
    redirectUris: string[];
    grantTypes: string[];
    responseTypes: string[];
    tokenEndpointAuthMethod: string;
  }): Promise<RegisteredClient> {
    return withOAuthFile(this.filePath, async () => {
      const secret = freshSecret(CLIENT_SECRET_PREFIX);
      const now = new Date();
      const record: ClientRecord = {
        clientId: `${CLIENT_ID_PREFIX}${randomUUID()}`,
        clientName: input.clientName,
        redirectUris: [...input.redirectUris],
        grantTypes: [...input.grantTypes],
        responseTypes: [...input.responseTypes],
        tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
        secretHash: hashSecret(secret),
        createdAt: now.toISOString(),
      };
      const file = await this.load();
      file.clients.push(record);
      await this.save(file);
      return {
        client_id: record.clientId,
        client_secret: secret,
        client_name: record.clientName,
        redirect_uris: record.redirectUris,
        grant_types: record.grantTypes,
        response_types: record.responseTypes,
        token_endpoint_auth_method: record.tokenEndpointAuthMethod,
        client_id_issued_at: Math.floor(now.getTime() / 1000),
        client_secret_expires_at: 0,
      };
    });
  }

  async getClient(clientId: string): Promise<PublicClient | null> {
    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const client = file.clients.find((item) => item.clientId === clientId);
      return client ? { clientId, redirectUris: [...client.redirectUris] } : null;
    });
  }

  async verifyClient(clientId: string, secret: string): Promise<boolean> {
    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const client = file.clients.find((item) => item.clientId === clientId);
      return client ? safeHashEqual(secret, client.secretHash) : false;
    });
  }

  async issueCode(input: OAuthPrincipal & {
    redirectUri: string;
    codeChallenge: string;
  }): Promise<string> {
    return withOAuthFile(this.filePath, async () => {
      const raw = freshSecret(CODE_PREFIX);
      const file = await this.load();
      file.codes.push({
        ...input,
        hash: hashSecret(raw),
        expiresAt: expiry(300),
        usedAt: null,
      });
      await this.save(file);
      return raw;
    });
  }

  async consumeCode(raw: string, input: {
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    resource: string;
  }): Promise<OAuthPrincipal | null> {
    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const principal = this.consumeCodeRecord(file, raw, input);
      if (principal) await this.save(file);
      return principal;
    });
  }

  async issueTokens(principal: OAuthPrincipal): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const tokens = this.mintTokens(file, principal);
      await this.save(file);
      return tokens;
    });
  }

  async verifyAccessToken(raw: string): Promise<OAuthPrincipal | null> {
    return withOAuthFile(this.filePath, async () => {
      if (!raw.startsWith(ACCESS_TOKEN_PREFIX)) return null;
      const file = await this.load();
      const record = file.accessTokens.find((item) => safeHashEqual(raw, item.hash));
      if (!record || Date.parse(record.expiresAt) <= Date.now()) return null;
      return {
        clientId: record.clientId,
        resource: record.resource,
        scopes: [...record.scopes],
        keyId: record.keyId,
        keyName: record.keyName,
      };
    });
  }
  async consumeRefreshToken(raw: string, input: {
    clientId: string;
    resource: string;
  }): Promise<OAuthPrincipal | null> {
    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const principal = this.consumeRefreshRecord(file, raw, input);
      if (principal) await this.save(file);
      return principal;
    });
  }

  async resetAuthorizationState(options: OAuthResetOptions = {}): Promise<OAuthResetResult> {
    return withOAuthFile(this.filePath, async () => {
      const current = await this.load();
      let backupPath: string | null = null;
      try {
        await mkdir(this.dataDir, { recursive: true });
        backupPath = path.join(this.dataDir, `oauth.backup-${Date.now()}-${randomUUID()}.json`);
        await copyFile(this.filePath, backupPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        backupPath = null;
      }

      const clients = new Map(current.clients.map((client) => [client.clientId, client]));
      let clientsImported = 0;
      for (const source of options.importClientStores ?? []) {
        if (path.resolve(source.filePath) === path.resolve(this.filePath)) continue;
        const sourceFile = await source.load();
        for (const client of sourceFile.clients) {
          if (clients.has(client.clientId)) continue;
          clients.set(client.clientId, {
            ...client,
            redirectUris: [...client.redirectUris],
            grantTypes: [...client.grantTypes],
            responseTypes: [...client.responseTypes],
          });
          clientsImported += 1;
        }
      }

      const resetFile: OAuthFile = {
        version: 1,
        clients: [...clients.values()],
        codes: [],
        accessTokens: [],
        refreshTokens: [],
      };
      await this.save(resetFile);
      return {
        backupPath,
        clientsPreserved: current.clients.length,
        clientsImported,
        grantsCleared: true,
      };
    });
  }

  private consumeCodeRecord(file: OAuthFile, raw: string, input: CodeExchangeInput): OAuthPrincipal | null {
    if (!raw.startsWith(CODE_PREFIX)) return null;
    const record = file.codes.find((item) => safeHashEqual(raw, item.hash));
    if (!record || record.usedAt || Date.parse(record.expiresAt) <= Date.now()) return null;
    if (record.clientId !== input.clientId || record.redirectUri !== input.redirectUri || record.resource !== input.resource) return null;
    const challenge = createHash('sha256').update(input.codeVerifier).digest('base64url');
    if (challenge !== record.codeChallenge) return null;
    record.usedAt = new Date().toISOString();
    return this.principalOf(record);
  }

  private consumeRefreshRecord(file: OAuthFile, raw: string, input: RefreshExchangeInput): OAuthPrincipal | null {
    if (!raw.startsWith(REFRESH_TOKEN_PREFIX)) return null;
    const record = file.refreshTokens.find((item) => safeHashEqual(raw, item.hash));
    if (!record || record.revokedAt || Date.parse(record.expiresAt) <= Date.now()) return null;
    if (record.clientId !== input.clientId || record.resource !== input.resource) return null;
    record.revokedAt = new Date().toISOString();
    return this.principalOf(record);
  }

  private principalOf(record: OAuthPrincipal): OAuthPrincipal {
    return {clientId: record.clientId, resource: record.resource, scopes: [...record.scopes], keyId: record.keyId, keyName: record.keyName};
  }

  private mintTokens(file: OAuthFile, principal: OAuthPrincipal): OAuthTokens {
    const accessToken = freshSecret(ACCESS_TOKEN_PREFIX);
    const refreshToken = freshSecret(REFRESH_TOKEN_PREFIX);
    const expiresIn = 3600;
    file.accessTokens.push({...this.principalOf(principal), hash: hashSecret(accessToken), expiresAt: expiry(expiresIn)});
    file.refreshTokens.push({...this.principalOf(principal), hash: hashSecret(refreshToken), expiresAt: expiry(30 * 24 * 3600), revokedAt: null});
    return {accessToken, refreshToken, expiresIn};
  }

  /** Consume the grant and publish its replacement in one persisted snapshot. */
  async exchangeRefreshToken(raw: string, input: RefreshExchangeInput): Promise<OAuthExchange | null> {
    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const principal = this.consumeRefreshRecord(file, raw, input);
      if (!principal) return null;
      const tokens = this.mintTokens(file, principal);
      await this.save(file);
      return {principal, tokens};
    });
  }

  async exchangeAuthorizationCode(raw: string, input: CodeExchangeInput): Promise<OAuthExchange | null> {
    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const principal = this.consumeCodeRecord(file, raw, input);
      if (!principal) return null;
      const tokens = this.mintTokens(file, principal);
      await this.save(file);
      return {principal, tokens};
    });
  }

}
