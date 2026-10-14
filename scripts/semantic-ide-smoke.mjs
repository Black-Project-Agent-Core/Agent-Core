import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SemanticIdeService } from '../dist/semantic-ide/service.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = {
  enabled: true,
  projectRoot: repoRoot,
  runtimeDir: path.join(repoRoot, 'runtime', 'semantic-ide-smoke'),
  startupTimeoutMs: 30_000,
  callTimeoutMs: 15_000,
  typescriptServerPath: path.join(repoRoot, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
  typescriptTsserverPath: path.join(repoRoot, 'node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'),
  serversFile: path.join(repoRoot, 'runtime', 'semantic-ide', 'servers.json'),
};

const service = await SemanticIdeService.initialize(config);
try {
  const healthBefore = await service.health();
  const result = await service.symbol('overview', {
    relativePath: 'src/mcp/server.ts',
    depth: 1,
    includeBody: false,
    maxResults: 20,
    maxAnswerChars: 20_000,
  });
  const healthAfter = await service.health();
  console.log(JSON.stringify({
    healthBefore,
    symbolCount: result.results?.total ?? 0,
    sample: result.results?.items?.slice(0, 5).map(item => item.name) ?? [],
    healthAfter,
  }, null, 2));
} finally {
  await service.close();
}
