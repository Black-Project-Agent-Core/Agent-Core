export const RELEASE_FORMAT = 'agent-core-stable-release-v3';
export const PRERELEASE_FORMAT = 'agent-core-prerelease-v1';

export function releaseChannelMetadata(channel = 'stable') {
  if (channel !== 'stable' && channel !== 'prerelease') {
    throw new Error(`Unknown release channel: ${channel}; expected stable or prerelease`);
  }
  return {
    channel,
    format: channel === 'stable' ? RELEASE_FORMAT : PRERELEASE_FORMAT,
    packageDistTag: channel === 'stable' ? 'stable' : 'next',
  };
}
export const PRESENTATION_BRIDGE_ROOT = 'SubProject/Presentation-Bridge/';

export const GENERATED_RUNTIME_RELEASE_ITEMS = Object.freeze(['dist']);

export const RUNTIME_RELEASE_ITEMS = Object.freeze([
  '.env.example',
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'src',
  'dist',
  'scripts',
  'plugin/agent-core/README.md',
  'plugin/agent-core/skills',
  'docs/README.md',
  'docs/deterministic-memory.md',
  'docs/local-agent-continuity.md',
  'docs/deterministic-execution-fabric.md',
  'docs/multi-command-wake-workflow.md',
  'docs/source-grounded-workflow.md',
  'docs/supabase-direct-memory.md',
  'supabase/migrations',
  'docs/github.md',
  'docs/stability.md',
  'docs/stability-verification-2026-09-09.md',
  'docs/memory-lifecycle-audit-2026-09-09.md',
  'docs/memory-lifecycle-remediation-plan.md',
  'docs/agent-core-connection-troubleshooting.md',
  'docs/windows-installation-cutover.md',
  'docs/roadmap',
  'tunnel-client/agent-core.example.yaml',
]);

const PRESENTATION_BRIDGE_EXCLUDED_PREFIXES = Object.freeze([
  'runtime/',
  'secrets/',
  'node_modules/',
  'dist/',
  'release/',
  'corpus/generated/',
]);

export function normalizeArchivePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isPresentationBridgeSourcePath(value) {
  const normalized = normalizeArchivePath(value);
  if (!normalized.startsWith(PRESENTATION_BRIDGE_ROOT)) return false;
  const relative = normalized.slice(PRESENTATION_BRIDGE_ROOT.length);
  if (!relative || relative === '.env') return false;
  return !PRESENTATION_BRIDGE_EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix));
}

export function releaseAssetNames(version, presentationBridgeVersion, channel = 'stable') {
  releaseChannelMetadata(channel);
  return {
    freshZip: `agent-core-fresh-v${version}-${channel}.zip`,
    runtimeZip: `agent-core-windows-v${version}-${channel}.zip`,
    pluginZip: `agent-core-plugin-v${version}-${channel}.zip`,
    presentationBridgeZip: `presentation-bridge-v${presentationBridgeVersion}-source.zip`,
    npmTarball: `black-project-agent-core-agent-core-plugin-${version}.tgz`,
    manifest: 'release-manifest.json',
    checksums: 'SHA256SUMS.txt',
  };
}

export const RELEASE_EXCLUSIONS = Object.freeze([
  'secrets',
  'runtime',
  'data',
  'logs',
  'capabilities',
  'node_modules',
  '.env',
  'local tunnel credentials',
  'raw execution evidence',
  'Presentation Bridge runtime jobs',
  'Presentation Bridge generated corpus',
]);
