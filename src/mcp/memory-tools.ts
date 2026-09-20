import { McpServer } from '@modelcontextprotocol/server';
import type { MemoryService } from '../memory/service.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { appendFailureLoopAdvisory, type FailureLoopAdvisor } from './failure-loop-advisor.js';
import * as schemas from './memory-schemas.js';

function text(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] } as any;
}

function failure(name: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  activityTracker.record('MEMORY', 'info', `${name} operation failed`, 'handled-memory-failure', { tool: name, message });
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true } as any;
}

async function run<T>(
  name: string,
  args: unknown,
  action: () => Promise<T>,
  advisor?: FailureLoopAdvisor,
) {
  const started = Date.now();
  try {
    const result = await action();
    advisor?.observeSuccess(name, args);
    activityTracker.record('MEMORY', 'success', `${name} completed`, 'memory-tool', {
      tool: name,
      durationMs: Date.now() - started,
    });
    return text(result);
  } catch (error) {
    const result = failure(name, error);
    const advisory = advisor?.observeFailure(name, args, result);
    if (advisory) {
      activityTracker.record(
        'REFLEXION',
        advisory.strength === 'no-progress' ? 'warn' : 'info',
        advisory.message,
        'failure-loop-advisory',
        { tool: name, repeatCount: advisory.repeatCount, failureFamily: advisory.failureFamily },
      );
      return appendFailureLoopAdvisory(result, advisory);
    }
    return result;
  }
}

export function registerMemoryTools(server: McpServer, memory: MemoryService, advisor?: FailureLoopAdvisor): void {
  server.registerTool('memory_list', {
    title: 'List Memories',
    description: 'List canonical Agent Core memories without routing normal machine-control tools through memory.',
    inputSchema: schemas.memoryList,
    annotations: { title: 'List Memories', readOnlyHint: true },
  }, async () => run('memory_list', {}, async () => (await memory.list()).map((record) => ({
    id: record.id, title: record.title, category: record.category, tags: record.tags,
    pinned: record.pinned, updatedAt: record.updatedAt, retrievalCount: record.retrievalCount,
  })), advisor));

  server.registerTool('memory_read', {
    title: 'Read Memory',
    description: 'Read one memory by id with advisory source-staleness evidence and optional bounded prior revisions. Non-pinned memories update durable recall usage metadata.',
    inputSchema: schemas.memoryRead,
    annotations: { title: 'Read Memory', readOnlyHint: false },
  }, async (args: any) => run('memory_read', args, async () => {
    const input = schemas.memoryRead.parse(args);
    const record = await memory.read(input.id, true);
    if (!record) throw new Error(`Memory not found: ${input.id}`);
    const staleness = await memory.staleness(input.id);
    const revisionHistory = input.revisionLimit && input.revisionLimit > 0
      ? await memory.revisions(input.id, input.revisionLimit)
      : undefined;
    return {
      ...record,
      staleness,
      ...(revisionHistory ? { revisionHistory } : {}),
    };
  }, advisor));

  server.registerTool('memory_search', {
    title: 'Search Memories',
    description: 'Search Agent Core memory using hybrid lexical/metadata + semantic ranking, optional bounded source-file context boost, linked-neighbor expansion, and deterministic fallback.',
    inputSchema: schemas.memorySearch,
    annotations: { title: 'Search Memories', readOnlyHint: false },
  }, async (args: any) => run('memory_search', args, async () => {
    const input = schemas.memorySearch.parse(args);
    const results = await memory.search(input.query, input);
    return results.map((item) => ({
      id: item.record.id,
      title: item.record.title,
      content: item.record.content,
      context: item.record.context,
      keywords: item.record.keywords,
      tags: item.record.tags,
      category: item.record.category,
      pinned: item.record.pinned,
      score: item.score,
      components: item.components,
      matchType: item.matchType,
      viaMemoryId: item.viaMemoryId,
      viaLinkType: item.viaLinkType,
    }));
  }, advisor));

  server.registerTool('memory_remember', {
    title: 'Remember Memory',
    description: 'Persist a new durable Agent Core memory in the canonical file-native store. Controllers should normally supply concise semantic metadata (keywords, context, tags, category) derived from the durable content; omitted fields are enriched deterministically by MemoryService.',
    inputSchema: schemas.memoryRemember,
    annotations: { title: 'Remember Memory', readOnlyHint: false, destructiveHint: false },
  }, async (args: any) => run(
    'memory_remember',
    args,
    async () => memory.remember(schemas.memoryRemember.parse(args)),
    advisor,
  ));

  server.registerTool('memory_update', {
    title: 'Update Memory',
    description: 'Update a non-pinned canonical memory and append durable mutation history. When substantive content is replaced, callers should refresh semantic metadata in the same call if the previous keywords/context/tags/category would become stale.',
    inputSchema: schemas.memoryUpdate,
    annotations: { title: 'Update Memory', readOnlyHint: false, destructiveHint: true },
  }, async (args: any) => run('memory_update', args, async () => {
    const input = schemas.memoryUpdate.parse(args);
    const { id, ...patch } = input;
    return memory.update(id, patch);
  }, advisor));

  server.registerTool('memory_delete', {
    title: 'Delete Memory',
    description: 'Explicitly delete a non-pinned memory and repair incoming links. Pinned foundational memory is protected.',
    inputSchema: schemas.memoryDelete,
    annotations: { title: 'Delete Memory', readOnlyHint: false, destructiveHint: true },
  }, async (args: any) => run('memory_delete', args, async () => {
    const input = schemas.memoryDelete.parse(args);
    return { deleted: await memory.delete(input.id), id: input.id };
  }, advisor));

  server.registerTool('memory_batch', {
    title: 'Batch Memory Transaction',
    description: 'Explicit controller-authorized all-or-nothing transaction for multiple memory create/update/delete/link operations. The batch validates all operations before commit, protects pinned memory, rejects unsafe durable content, and refreshes the derived index once after a successful commit.',
    inputSchema: schemas.memoryBatch,
    annotations: { title: 'Batch Memory Transaction', readOnlyHint: false, destructiveHint: true },
  }, async (args: any) => run('memory_batch', args, async () => {
    const input = schemas.memoryBatch.parse(args);
    return memory.batch(input.operations);
  }, advisor));

  server.registerTool('memory_status', {
    title: 'Memory Status',
    description: 'Inspect canonical memory, derived index, embedding, intelligence readiness, and current memory issues.',
    inputSchema: schemas.memoryStatus,
    annotations: { title: 'Memory Status', readOnlyHint: true },
  }, async () => run('memory_status', {}, async () => {
    const health = await memory.refreshHealth();
    const records = await memory.list();
    return {
      health,
      issues: memory.getIssues(),
      provenance: {
        anchored: records.filter((record) => Boolean(record.provenance?.files.length)).length,
        unanchored: records.filter((record) => !record.provenance?.files.length).length,
      },
    };
  }, advisor));

  server.registerTool('memory_reindex', {
    title: 'Reindex Memory',
    description: 'Deterministically rebuild derived lexical and semantic index state from canonical memory files.',
    inputSchema: schemas.memoryReindex,
    annotations: { title: 'Reindex Memory', readOnlyHint: false, destructiveHint: false },
  }, async () => run('memory_reindex', {}, async () => memory.reindex(), advisor));

  server.registerTool('memory_evolve', {
    title: 'Evolve Memory',
    description: 'Conservatively evolve one non-pinned memory. mode=apply preserves the existing mutation path; mode=preview returns the exact deterministic evolution proposal plus bounded current neighbor metadata without changing canonical memory, reciprocal links, or the derived index. Any neighbor metadata change requires a separate explicit memory_batch/update call.',
    inputSchema: schemas.memoryEvolve,
    annotations: { title: 'Evolve Memory', readOnlyHint: false, destructiveHint: false },
  }, async (args: any) => run('memory_evolve', args, async () => {
    const input = schemas.memoryEvolve.parse(args);
    if (input.mode === 'preview') {
      return memory.previewEvolution(input.id, input.neighborLimit);
    }
    return memory.evolve(input.id);
  }, advisor));

  server.registerTool('memory_consolidate', {
    title: 'Consolidate Memory',
    description: 'Find duplicate or overlapping memory candidates. This operation proposes review actions and never deletes or merges memories automatically.',
    inputSchema: schemas.memoryConsolidate,
    annotations: { title: 'Consolidate Memory', readOnlyHint: true, destructiveHint: false },
  }, async (args: any) => run(
    'memory_consolidate',
    args,
    async () => memory.consolidate(schemas.memoryConsolidate.parse(args)),
    advisor,
  ));
}
