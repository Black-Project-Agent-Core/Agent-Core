export const CORE_CERTIFICATION_SCHEMA = 'agent-core-core-certification-contract/1';

export const CORE_CERTIFICATION_MATRIX = Object.freeze([
  Object.freeze({
    id: 'authentication_oauth',
    label: 'Authentication / OAuth',
    evidence: Object.freeze(['tests/oauth.test.ts', 'tests/http-auth.test.ts', 'tests/http-security.test.ts']),
  }),
  Object.freeze({
    id: 'mcp_legacy_compatibility',
    label: 'MCP legacy compatibility',
    evidence: Object.freeze(['tests/mcp-dual-era.test.ts', 'tests/mcp-integration.test.ts']),
  }),
  Object.freeze({
    id: 'mcp_modern_compatibility',
    label: 'MCP modern compatibility',
    evidence: Object.freeze(['tests/mcp-dual-era.test.ts', 'tests/mcp-sdk-v2-contract.test.ts']),
  }),
  Object.freeze({
    id: 'principal_isolation',
    label: 'Principal isolation',
    evidence: Object.freeze(['tests/mcp-route-enforcement.test.ts', 'tests/route-context-store.test.ts', 'tests/memory-quality.test.ts']),
  }),
  Object.freeze({
    id: 'project_isolation',
    label: 'Project isolation',
    evidence: Object.freeze(['tests/project-scope-routing.test.ts', 'tests/memory-operational-audit.test.ts']),
  }),
  Object.freeze({
    id: 'operational_audit_isolation',
    label: 'Operational audit isolation',
    evidence: Object.freeze(['tests/memory-operational-audit.test.ts', 'tests/routing-audit.test.ts']),
  }),
  Object.freeze({
    id: 'dmf_integrity_quality',
    label: 'DMF integrity + quality',
    evidence: Object.freeze(['tests/memory-quality.test.ts', 'tests/memory-recovery.test.ts', 'tests/quality-gate.test.ts']),
  }),
  Object.freeze({
    id: 'continuity',
    label: 'Continuity',
    evidence: Object.freeze(['tests/continuity-resume.acceptance.test.ts', 'tests/continuity-checkpoint.test.ts']),
  }),
  Object.freeze({
    id: 'execution_durability',
    label: 'Execution durability',
    evidence: Object.freeze(['tests/execution-recovery.test.ts', 'tests/execution-runner.test.ts', 'tests/execution-restart-artifact.acceptance.test.ts']),
  }),
  Object.freeze({
    id: 'execution_policy_resource_control',
    label: 'Execution policy/resource control',
    evidence: Object.freeze(['tests/execution-policy.test.ts', 'tests/resource-governance.acceptance.test.ts', 'tests/resource-governance-matrix.test.ts']),
  }),
  Object.freeze({
    id: 'backup_restore',
    label: 'Backup/restore',
    evidence: Object.freeze(['tests/execution-backup-restore.test.ts', 'tests/memory-recovery.test.ts']),
  }),
  Object.freeze({
    id: 'evidence_retention',
    label: 'Evidence retention',
    evidence: Object.freeze(['tests/execution-retention.test.ts']),
  }),
  Object.freeze({
    id: 'audit_integrity',
    label: 'Audit integrity',
    evidence: Object.freeze(['tests/audit-journal.test.ts', 'tests/audit-rotation.test.ts']),
  }),
  Object.freeze({
    id: 'observability',
    label: 'Observability',
    evidence: Object.freeze(['tests/health-metrics.test.ts', 'tests/observability-correlation.integration.test.ts', 'tests/otlp-exporter.test.ts']),
  }),
  Object.freeze({
    id: 'github_fabric_regression',
    label: 'GitHub Fabric regression',
    evidence: Object.freeze(['tests/github-mcp.test.ts', 'tests/github-api.test.ts', 'tests/github-git.test.ts', 'tests/github-secret-leakage.test.ts']),
  }),
  Object.freeze({
    id: 'release_parity',
    label: 'Release parity',
    evidence: Object.freeze(['tests/release-package.test.ts', 'scripts/release/check-release.mjs', 'scripts/release/check-stable-parity.mjs']),
  }),
  Object.freeze({
    id: 'performance',
    label: 'Performance',
    evidence: Object.freeze(['scripts/benchmark-memory.mjs', 'scripts/benchmark-execution.mjs', 'tests/memory-performance.test.ts', 'tests/execution-performance.test.ts']),
  }),
  Object.freeze({
    id: 'no_external_ai_model_api_dependency',
    label: 'No external AI model/API dependency',
    evidence: Object.freeze(['package.json', 'plugin/codespace/package.json']),
  }),
]);

export const REQUIRED_PACKAGE_SCRIPTS = Object.freeze([
  'verify:release',
  'benchmark:memory',
  'benchmark:execution',
  'verify:stable-parity',
  'certify:core',
]);

export const CORE_SOURCE_PREFIXES = Object.freeze([
  'src/',
  'scripts/',
  'plugin/codespace/src/',
  'plugin/codespace/scripts/',
]);

export const CORE_SOURCE_EXCLUDES = Object.freeze([
  'scripts/release/core-certification-contract.mjs',
  'scripts/release/check-core-certification.mjs',
]);

export const FORBIDDEN_DEPENDENCY_PATTERNS = Object.freeze([
  Object.freeze({ id: 'openai-sdk', pattern: '^(openai|@openai/)' }),
  Object.freeze({ id: 'anthropic-sdk', pattern: '^(anthropic|@anthropic-ai/)' }),
  Object.freeze({ id: 'google-model-sdk', pattern: '^@google/(generative-ai|genai)$' }),
  Object.freeze({ id: 'cohere-sdk', pattern: '^(cohere-ai|@cohere-ai/)' }),
  Object.freeze({ id: 'langchain-sdk', pattern: '^(langchain|@langchain/)' }),
  Object.freeze({ id: 'llamaindex-sdk', pattern: '^(llamaindex|@llamaindex/)' }),
  Object.freeze({ id: 'ollama-sdk', pattern: '^ollama$' }),
  Object.freeze({ id: 'huggingface-transformers-sdk', pattern: '^(@huggingface/|@xenova/transformers$)' }),
  Object.freeze({ id: 'pinecone-sdk', pattern: '^@pinecone-database/' }),
  Object.freeze({ id: 'qdrant-sdk', pattern: '^@qdrant/' }),
  Object.freeze({ id: 'chroma-sdk', pattern: '^chromadb$' }),
  Object.freeze({ id: 'weaviate-sdk', pattern: '^weaviate-' }),
]);

export const FORBIDDEN_SOURCE_MARKERS = Object.freeze([
  Object.freeze({ id: 'openai-model-endpoint', pattern: 'api\\.openai\\.com(?:/v1)?' }),
  Object.freeze({ id: 'anthropic-model-endpoint', pattern: 'api\\.anthropic\\.com' }),
  Object.freeze({ id: 'google-model-endpoint', pattern: 'generativelanguage\\.googleapis\\.com' }),
  Object.freeze({ id: 'cohere-model-endpoint', pattern: 'api\\.cohere\\.(?:ai|com)' }),
  Object.freeze({ id: 'pinecone-endpoint', pattern: 'api\\.pinecone\\.io' }),
  Object.freeze({ id: 'openai-model-key', pattern: '\\bOPENAI_API_KEY\\b' }),
  Object.freeze({ id: 'anthropic-model-key', pattern: '\\bANTHROPIC_API_KEY\\b' }),
  Object.freeze({ id: 'gemini-model-key', pattern: '\\bGEMINI_API_KEY\\b' }),
  Object.freeze({ id: 'google-generative-model-key', pattern: '\\bGOOGLE_GENERATIVE_AI_API_KEY\\b' }),
  Object.freeze({ id: 'cohere-model-key', pattern: '\\bCOHERE_API_KEY\\b' }),
  Object.freeze({ id: 'pinecone-key', pattern: '\\bPINECONE_API_KEY\\b' }),
  Object.freeze({ id: 'huggingface-model-token', pattern: '\\bHUGGINGFACEHUB_API_TOKEN\\b' }),
  Object.freeze({ id: 'ollama-model-worker', pattern: '\\bOLLAMA_HOST\\b' }),
]);
