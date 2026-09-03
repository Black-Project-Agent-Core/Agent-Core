import type { IncomingMessage } from 'node:http';
import type { HttpSecurityConfig } from '../config.js';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim() || undefined;
}

function directProtocol(request: IncomingMessage): 'http' | 'https' {
  const socket = request.socket as typeof request.socket & { encrypted?: boolean };
  return socket.encrypted ? 'https' : 'http';
}

function validatedBaseUrl(protocol: string, host: string, label: string): string {
  const normalizedProtocol = protocol.trim().toLowerCase();
  if (normalizedProtocol !== 'http' && normalizedProtocol !== 'https') {
    throw new Error(`${label} protocol must be http or https`);
  }
  const normalizedHost = host.trim();
  if (!normalizedHost || /[\s\/\?#]/.test(normalizedHost)) {
    throw new Error(`${label} host is invalid`);
  }
  let parsed: URL;
  try {
    parsed = new URL(`${normalizedProtocol}://${normalizedHost}`);
  } catch {
    throw new Error(`${label} host is invalid`);
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${label} host is invalid`);
  }
  return parsed.origin;
}

function normalizedRemoteAddress(address: string | undefined): string | null {
  if (!address) return null;
  const normalized = address.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('::ffff:')) return normalized.slice('::ffff:'.length);
  return normalized;
}

export class HttpSecurityPolicy {
  readonly config: HttpSecurityConfig;

  constructor(config: HttpSecurityConfig) {
    this.config = {
      publicBaseUrl: config.publicBaseUrl,
      protectedResourceUrl: config.protectedResourceUrl ?? null,
      trustProxy: config.trustProxy,
      allowedOrigins: [...config.allowedOrigins],
    };
  }

  externalBaseUrl(request: IncomingMessage): string {
    if (this.config.publicBaseUrl) return this.config.publicBaseUrl;

    if (this.config.trustProxy) {
      const forwardedProtocol = firstHeaderValue(request.headers['x-forwarded-proto']);
      const forwardedHost = firstHeaderValue(request.headers['x-forwarded-host']);
      if (forwardedProtocol || forwardedHost) {
        return validatedBaseUrl(
          forwardedProtocol ?? directProtocol(request),
          forwardedHost ?? request.headers.host ?? '127.0.0.1',
          'Forwarded',
        );
      }
    }

    return validatedBaseUrl(directProtocol(request), request.headers.host ?? '127.0.0.1', 'Direct request');
  }

  protectedResource(request: IncomingMessage): string {
    return this.config.protectedResourceUrl ?? `${this.externalBaseUrl(request)}/mcp`;
  }

  validateMcpOrigin(request: IncomingMessage):
    | { ok: true }
    | { ok: false; code: 'invalid_origin' | 'origin_not_allowed' } {
    const header = request.headers.origin;
    if (header === undefined) return { ok: true };
    if (Array.isArray(header) || !header.trim() || header.includes(',')) {
      return { ok: false, code: 'invalid_origin' };
    }
    const raw = header.trim();
    if (raw.toLowerCase() === 'null') return { ok: false, code: 'invalid_origin' };

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false, code: 'invalid_origin' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, code: 'invalid_origin' };
    }
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return { ok: false, code: 'invalid_origin' };
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return this.allowedOriginHostnames().includes(hostname)
      ? { ok: true }
      : { ok: false, code: 'origin_not_allowed' };
  }

  isLoopbackRequest(request: IncomingMessage): boolean {
    let address = request.socket?.remoteAddress;
    if (this.config.trustProxy) {
      const forwardedFor = firstHeaderValue(request.headers['x-forwarded-for']);
      const hasProxyIdentity = Boolean(
        forwardedFor
        || firstHeaderValue(request.headers['x-forwarded-proto'])
        || firstHeaderValue(request.headers['x-forwarded-host']),
      );
      if (forwardedFor) address = forwardedFor;
      else if (hasProxyIdentity) return false;
    }

    const remoteAddress = normalizedRemoteAddress(address);
    if (!remoteAddress) return false;
    if (remoteAddress === '::1' || remoteAddress === '0:0:0:0:0:0:0:1') return true;
    return remoteAddress.startsWith('127.');
  }

  allowedOriginHostnames(): string[] {
    const allowed = new Set<string>([...LOOPBACK_HOSTNAMES, ...this.config.allowedOrigins]);
    if (this.config.publicBaseUrl) {
      allowed.add(new URL(this.config.publicBaseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase());
    }
    return [...allowed];
  }
}
