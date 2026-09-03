import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { GitHubGitService } from '../github/git-service.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import type { CodeEvidence, NativeCodeIntelligenceSource } from './code-intelligence.js';

type WorkingTreeGitReader = Pick<GitHubGitService, 'listWorkingTreeFiles'>;

export interface GitWorkingTreeSourceOptions {
  maxFiles?: number;
  maxSearchFileBytes?: number;
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  return hash.digest('hex');
}

export class GitWorkingTreeCodeIntelligenceSource implements NativeCodeIntelligenceSource {
  private readonly maxFiles: number;
  private readonly maxSearchFileBytes: number;

  constructor(
    private readonly workspace: WorkspacePolicy,
    private readonly git: WorkingTreeGitReader,
    options: GitWorkingTreeSourceOptions = {},
  ) {
    this.maxFiles = Math.max(1, Math.min(options.maxFiles ?? 50_000, 250_000));
    this.maxSearchFileBytes = Math.max(1024, Math.min(options.maxSearchFileBytes ?? 2 * 1024 * 1024, 16 * 1024 * 1024));
  }
  async fingerprint(projectRoot: string): Promise<string | null> {
    const root = await this.workspace.resolveExisting(projectRoot);
    const files = [...new Set(await this.git.listWorkingTreeFiles({ cwd: root }))]
      .map(normalizeRelative)
      .filter(Boolean)
      .sort();
    if (files.length > this.maxFiles) return null;

    const aggregate = createHash('sha256');
    aggregate.update('agent-core-working-tree-v1\0', 'utf8');
    for (const relative of files) {
      aggregate.update(relative, 'utf8');
      aggregate.update('\0', 'utf8');
      const candidate = path.resolve(root, relative);
      let resolved: string;
      try {
        resolved = await this.workspace.resolveExisting(candidate);
      } catch {
        aggregate.update('state:unavailable', 'utf8');
        aggregate.update('\0', 'utf8');
        continue;
      }
      let info;
      try {
        info = await stat(resolved);
      } catch {
        aggregate.update('state:missing', 'utf8');
        aggregate.update('\0', 'utf8');
        continue;
      }
      if (!info.isFile()) {
        aggregate.update('state:not-file', 'utf8');
        aggregate.update('\0', 'utf8');
        continue;
      }
      try {
        aggregate.update(await hashFile(resolved), 'utf8');
      } catch {
        aggregate.update('state:unreadable', 'utf8');
      }
      aggregate.update('\0', 'utf8');
    }
    return aggregate.digest('hex');
  }

  async searchContent(request: {
    projectRoot: string;
    query: string;
    maxResults: number;
  }): Promise<CodeEvidence[]> {
    const root = await this.workspace.resolveExisting(request.projectRoot);
    const needle = request.query.trim().toLocaleLowerCase();
    if (!needle) return [];
    const maxResults = Math.max(1, Math.min(request.maxResults, 200));
    const files = [...new Set(await this.git.listWorkingTreeFiles({ cwd: root }))]
      .map(normalizeRelative)
      .filter(Boolean)
      .sort();
    if (files.length > this.maxFiles) return [];

    const hits: CodeEvidence[] = [];
    for (const relative of files) {
      if (hits.length >= maxResults) break;
      const candidate = path.resolve(root, relative);
      let resolved: string;
      try { resolved = await this.workspace.resolveExisting(candidate); }
      catch { continue; }
      let info;
      try { info = await stat(resolved); }
      catch { continue; }
      if (!info.isFile() || info.size > this.maxSearchFileBytes) continue;
      const buffer = await readFile(resolved);
      if (buffer.includes(0)) continue;
      const lines = buffer.toString('utf8').split(/\r?\n/);
      for (let index = 0; index < lines.length && hits.length < maxResults; index += 1) {
        const line = lines[index] ?? '';
        if (!line.toLocaleLowerCase().includes(needle)) continue;
        hits.push({
          path: relative,
          line: index + 1,
          evidenceType: 'search_hit',
          summary: line.slice(0, 500),
        });
      }
    }
    return hits;
  }
}