import * as z from 'zod/v4';

const params = z.record(z.string(), z.unknown()).optional()
  .meta({ description: 'Optional provider-specific parameters for read/analysis calls. Mutating repair operations do not expose raw provider arguments.' });

const repoFilter = z.array(z.string().min(1)).max(32).optional();
const workspace = z.string().min(1).max(200).optional();
const ref = z.string().min(1).max(500).optional();
const worktreePath = z.string().min(1).max(4000).optional();

export const codeOrient = z.object({
  action: z.enum(['status', 'overview', 'clusters', 'topology', 'modules', 'stats', 'find', 'inspect', 'diagnostics', 'quarantine', 'metrics']),
  query: z.string().min(1).max(1000).optional(),
  entityId: z.string().min(1).max(2000).optional(),
  kind: z.string().min(1).max(120).optional(),
  search: z.enum(['bm25', 'substring']).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  fields: z.array(z.string().min(1).max(120)).max(32).optional(),
  contextFilter: z.array(z.string().min(1).max(500)).max(32).optional(),
  crossRepo: z.boolean().optional(),
  includeUnresolved: z.boolean().optional(),
  includeFacet: z.enum(['call_contexts']).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  depth: z.number().int().min(0).max(8).optional(),
  tokenBudget: z.number().int().min(100).max(32_000).optional(),
  metricsDays: z.number().int().min(1).max(30).optional(),
  metricsLimit: z.number().int().min(1).max(50).optional(),
  repoFilter,
  workspace,
  ref,
  worktreePath,
  params,
});

export const codeGraph = z.object({
  action: z.enum(['related', 'paths', 'subgraph', 'trace']),
  entityId: z.string().min(1).max(2000).optional(),
  from: z.string().min(1).max(2000).optional(),
  to: z.string().min(1).max(2000).optional(),
  source: z.string().min(1).max(2000).optional(),
  target: z.string().min(1).max(2000).optional(),
  direction: z.enum(['callers', 'callees', 'neighbors', 'uses', 'used_by', 'messaging']).optional(),
  kind: z.enum(['path', 'data', 'control', 'def_use', 'effects', 'flows', 'process']).optional(),
  depth: z.number().int().min(0).max(10).optional(),
  maxHops: z.number().int().min(1).max(20).optional(),
  maxNodes: z.number().int().min(1).max(5000).optional(),
  tokenBudget: z.number().int().min(100).max(32_000).optional(),
  repoFilter,
  workspace,
  ref,
  worktreePath,
  params,
});

export const codeSurface = z.object({
  action: z.enum(['endpoints', 'cross_links', 'impact', 'diff']),
  endpointAction: z.enum(['definitions', 'calls', 'stats']).optional(),
  entityId: z.string().min(1).max(2000).optional(),
  scope: z.enum(['entity', 'changeset']).optional(),
  repo: z.string().min(1).max(1000).optional(),
  base: z.string().min(1).max(500).optional(),
  head: z.string().min(1).max(500).optional(),
  refA: z.string().min(1).max(500).optional(),
  refB: z.string().min(1).max(500).optional(),
  groupOracle: z.string().min(1).max(500).optional(),
  groupV3: z.string().min(1).max(500).optional(),
  set: z.string().min(1).max(500).optional(),
  aspect: z.enum(['refs', 'response_shape', 'payload', 'auth', 'literals']).optional(),
  detail: z.enum(['list', 'contract', 'posture']).optional(),
  repoFilter,
  workspace,
  ref,
  worktreePath,
  params,
});

export const codeAnalysis = z.object({
  kind: z.enum(['debt', 'security', 'tests', 'fitness']),
  analysis: z.string().min(1).max(120).optional()
    .meta({ description: 'Legacy/provider-forward analysis discriminator. Prefer analysisPreset for known canonical values.' }),
  analysisPreset: z.enum([
    'dead_code', 'find_dead_code', 'cycles', 'import_cycles', 'stubs', 'impure', 'license',
    'findings', 'secrets', 'auth_coverage', 'changed_source',
    'coverage', 'reachability', 'contract_effectiveness', 'coverage_effectiveness',
  ]).optional().meta({ description: 'Typed canonical analysis discriminator; valid values depend on kind.' }),
  repo: z.string().min(1).max(500).optional(),
  strict: z.boolean().optional(),
  detail: z.enum(['summary', 'full']).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  changedFiles: z.array(z.string().min(1).max(1000)).max(128).optional(),
  securityRules: z.array(z.object({
    id: z.string().min(3).max(80),
    pattern: z.string().min(1).max(256),
    message: z.string().min(1).max(500),
    severity: z.enum(['info', 'low', 'medium', 'high']).optional(),
    include: z.array(z.string().min(1).max(160)).max(16).optional(),
    exclude: z.array(z.string().min(1).max(160)).max(16).optional(),
  })).max(32).optional(),
  repoFilter,
  workspace,
  ref,
  worktreePath,
  params,
});

export const codePatterns = z.object({
  action: z.enum(['query', 'list', 'record', 'get', 'refine', 'apply', 'reject', 'promote']),
  kind: z.enum(['code', 'graph', 'template']).optional(),
  literalKind: z.enum(['i18n', 'log_format', 'sql']).optional(),
  text: z.string().min(1).max(4000).optional()
    .meta({ description: 'Query text. For record, retained as a backward-compatible shorthand for trigger.naturalLanguage.' }),
  trigger: z.object({
    naturalLanguage: z.string().min(1).max(4000),
    keywords: z.array(z.string().min(1).max(200)).max(64).optional(),
    targetEntityKinds: z.array(z.string().min(1).max(200)).max(64).optional(),
  }).optional().meta({ description: 'Grafel code-pattern trigger. record requires trigger.naturalLanguage or legacy text.' }),
  patternId: z.string().min(1).max(500).optional(),
  candidateId: z.string().min(1).max(500).optional(),
  category: z.enum(['code', 'process', 'team', 'tooling', 'architecture']).optional(),
  steps: z.array(z.string().min(1).max(2000)).max(50).optional(),
  exemplars: z.array(z.string().min(1).max(2000)).max(100).optional(),
  changes: z.record(z.string(), z.unknown()).optional(),
  success: z.boolean().optional(),
  createdEntities: z.array(z.string().min(1).max(2000)).max(100).optional(),
  reason: z.string().min(1).max(2000).optional(),
  setToZero: z.boolean().optional(),
  approvalNote: z.string().max(2000).optional(),
  includePrivate: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  repoFilter,
  workspace,
  ref,
  worktreePath,
  params,
});

export const codeWorkspace = z.object({
  action: z.enum(['list', 'resolve', 'register', 'unregister', 'prune_workspaces', 'status', 'index', 'refs', 'pin_ref', 'unpin_ref', 'prune_refs']),
  path: z.string().min(1).max(4000).optional(),
  workspace,
  group: z.string().min(1).max(200).optional(),
  repos: z.array(z.object({
    slug: z.string().min(1).max(200).optional(),
    path: z.string().min(1).max(4000),
  })).max(32).optional(),
  trackWorktrees: z.boolean().optional(),
  allowRepoMarker: z.boolean().optional(),
  allowProtectedPath: z.boolean().optional(),
  repo: z.string().min(1).max(200).optional(),
  targetRef: z.string().min(1).max(500).optional(),
  ttl: z.string().min(1).max(64).regex(/^\d+(?:ms|s|m|h|d)$/).optional(),
  apply: z.boolean().optional(),
  confirmation: z.string().min(1).max(100).optional(),
  repoFilter,
  ref,
  worktreePath,
});

export const codeRepair = z.object({
  action: z.enum(['list', 'inspect', 'submit', 'abandon', 'accept', 'reject', 'quarantine_remove', 'quarantine_pin', 'quarantine_unpin']),
  candidateType: z.enum(['residual', 'cross_link', 'enrichment']).optional(),
  workspace,
  ref,
  worktreePath,
  repoFilter,
  repo: z.string().min(1).max(500).optional(),
  candidateId: z.string().min(1).max(1000).optional(),
  resolution: z.enum([
    'bind_to_entity',
    'reclassify_as_external',
    'reclassify_as_dynamic',
    'reclassify_as_resolved',
  ]).optional(),
  targetEntityId: z.string().min(1).max(2000).optional(),
  overrideTarget: z.string().min(1).max(2000).optional(),
  value: z.string().min(1).max(8000).optional(),
  candidateKind: z.string().min(1).max(200).optional(),
  newTarget: z.string().min(1).max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  sourceVerified: z.boolean().optional(),
  targetVerified: z.boolean().optional(),
  module: z.string().min(1).max(1000).optional(),
  reasoning: z.string().min(1).max(4000).optional(),
  reason: z.string().min(1).max(2000).optional(),
  quarantinePath: z.string().min(1).max(4000).optional(),
  confirmation: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
});
