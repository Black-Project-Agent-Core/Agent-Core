import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function runBash(script: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('Codespaces public readiness self-healing', () => {
  it('retries transient OAuth metadata and MCP auth-front-door failures until both contracts are verified', async () => {
    let oauthAttempts = 0;
    let mcpAttempts = 0;
    let server: Server | undefined;
    try {
      server = createServer((req, res) => {
        if (req.url === '/.well-known/oauth-authorization-server') {
          oauthAttempts += 1;
          if (oauthAttempts === 1) {
            res.writeHead(503).end('warming');
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          const host = `http://127.0.0.1:${(server?.address() as { port: number }).port}`;
          res.end(JSON.stringify({ issuer: oauthAttempts === 2 ? 'https://wrong.example' : host }));
          return;
        }
        if (req.url === '/mcp') {
          mcpAttempts += 1;
          res.writeHead(mcpAttempts === 1 ? 503 : 401).end();
          return;
        }
        res.writeHead(404).end();
      });
      await new Promise<void>((resolve, reject) => {
        server?.once('error', reject);
        server?.listen(0, '127.0.0.1', () => resolve());
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server did not bind');
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const result = await runBash(`
        source scripts/codespace/common.sh
        wait_for_public_oauth_issuer ${JSON.stringify(baseUrl)} 5 0
        wait_for_public_mcp_auth_gate ${JSON.stringify(baseUrl)} 5 0
        printf 'ready\\n'
      `);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('ready');
      expect(oauthAttempts).toBe(3);
      expect(mcpAttempts).toBe(2);
    } finally {
      if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });
});
