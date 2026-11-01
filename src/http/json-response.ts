import type { ServerResponse } from 'node:http';

/** JSON reply that must not be cached; used by the authenticated read-only UI endpoints. */
export function sendNoStoreJson(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
}
