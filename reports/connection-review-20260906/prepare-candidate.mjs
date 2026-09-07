import {readFile,writeFile} from 'node:fs/promises';
const root='.worktrees/connection-review-20260906';
const file=root+'/src/oauth/store.ts';
let s=(await readFile(file,'utf8')).replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
function once(text,from,to){if(text.split(from).length!==2)throw new Error('Unexpected match count: '+from.slice(0,100));return text.replace(from,to);}
s=once(s,'export class FileOAuthStore {',`export interface OAuthTokens { accessToken: string; refreshToken: string; expiresIn: number; }
export interface OAuthExchange { principal: OAuthPrincipal; tokens: OAuthTokens; }
interface CodeExchangeInput { clientId: string; redirectUri: string; codeVerifier: string; resource: string; }
interface RefreshExchangeInput { clientId: string; resource: string; }

// One queue per resolved file, shared by all instances in this Node process.
// This is NOT an inter-process lock; offline reset/CLI ownership still applies.
const oauthFileQueues = new Map<string, Promise<void>>();
function withOAuthFile<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const resolved = path.resolve(filePath);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const previous = oauthFileQueues.get(key) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(() => undefined, () => undefined);
  oauthFileQueues.set(key, settled);
  void settled.then(() => { if (oauthFileQueues.get(key) === settled) oauthFileQueues.delete(key); });
  return result;
}

export class FileOAuthStore {`);
// Preserve method signatures and existing behavior while serializing the complete operation.
const publicMethods=['registerClient','getClient','verifyClient','issueCode','verifyAccessToken','resetAuthorizationState'];
for(const name of publicMethods){
 const start=s.indexOf('  async '+name+'(');if(start<0)throw new Error('Missing '+name);
 const next=s.indexOf('\n  async ',start+1);const end=next<0?s.lastIndexOf('\n}') : next;
 const segment=s.slice(start,end);const opener=/\)\s*:\s*Promise<[\s\S]*?>\s*\{\n/.exec(segment);
 if(!opener)throw new Error('Missing opener '+name);
 const bodyStart=opener.index+opener[0].length;const bodyEnd=segment.lastIndexOf('\n  }');
 const header=segment.slice(0,bodyStart);const body=segment.slice(bodyStart,bodyEnd);
 const tail=segment.slice(bodyEnd+4);
 const replacement=header+'    return withOAuthFile(this.filePath, async () => {\n'+body.split('\n').map(l=>'  '+l).join('\n')+'\n    });\n  }'+tail;
 s=s.slice(0,start)+replacement+s.slice(end);
}
function replaceMethod(name,body){const start=s.indexOf('  async '+name+'(');const next=s.indexOf('\n  async ',start+1);const end=next<0?s.lastIndexOf('\n}'):next;const segment=s.slice(start,end);const opener=/\)\s*:\s*Promise<[\s\S]*?>\s*\{\n/.exec(segment);if(!opener)throw new Error(name);const bodyStart=opener.index+opener[0].length;const close=segment.lastIndexOf('\n  }');s=s.slice(0,start)+segment.slice(0,bodyStart)+body+'\n  }'+segment.slice(close+4)+s.slice(end);}
replaceMethod('consumeCode',`    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const principal = this.consumeCodeRecord(file, raw, input);
      if (principal) await this.save(file);
      return principal;
    });`);
replaceMethod('consumeRefreshToken',`    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const principal = this.consumeRefreshRecord(file, raw, input);
      if (principal) await this.save(file);
      return principal;
    });`);
replaceMethod('issueTokens',`    return withOAuthFile(this.filePath, async () => {
      const file = await this.load();
      const tokens = this.mintTokens(file, principal);
      await this.save(file);
      return tokens;
    });`);
// Existing reset used an in-place write; keep it on the same persistence path.
s=once(s,"      await writeFile(this.filePath, `${JSON.stringify(resetFile, null, 2)}\\n`, {\n        encoding: 'utf8', mode: 0o600,\n      });","      await this.save(resetFile);");
const insert=`
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
`;
s=s.slice(0,s.lastIndexOf('\n}'))+insert+'\n}\n';
// Strip trailing whitespace introduced while indenting blank lines.
s=s.split('\n').map(l=>l.trimEnd()).join('\n');
await writeFile(file,s);
const serviceFile=root+'/src/oauth/service.ts';let service=(await readFile(serviceFile,'utf8')).replaceAll('\r\n','\n');
service=once(service,"import { ACCESS_TOKEN_PREFIX, FileOAuthStore } from './store.js';","import { ACCESS_TOKEN_PREFIX, FileOAuthStore, type OAuthTokens } from './store.js';");
service=once(service,'const principal = await this.store.consumeRefreshToken(', 'const exchange = await this.store.exchangeRefreshToken(');
service=once(service,"      if (!principal) {\n        sendJson(response, 400, { error: 'invalid_grant' });\n        return;\n      }\n      await this.sendTokens(response, principal);", "      if (!exchange) {\n        sendJson(response, 400, { error: 'invalid_grant' });\n        return;\n      }\n      await this.sendTokens(response, exchange.principal, exchange.tokens);");
service=once(service,"const principal = await this.store.consumeCode(params.get('code') ?? '', {", "const exchange = await this.store.exchangeAuthorizationCode(params.get('code') ?? '', {");
service=once(service,"    if (!principal) {\n      sendJson(response, 400, { error: 'invalid_grant' });\n      return;\n    }\n    await this.sendTokens(response, principal);", "    if (!exchange) {\n      sendJson(response, 400, { error: 'invalid_grant' });\n      return;\n    }\n    await this.sendTokens(response, exchange.principal, exchange.tokens);");
service=once(service,"  }): Promise<void> {\n    const tokens = await this.store.issueTokens(principal);", "  }, tokens: OAuthTokens): Promise<void> {");
await writeFile(serviceFile,service);
console.log('Candidate-only patch written: store serialization and single-snapshot OAuth exchange. Live source/dist unchanged.');