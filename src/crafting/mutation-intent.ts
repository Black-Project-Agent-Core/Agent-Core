export type CraftingMutationClass = 'none' | 'source_mutation' | 'verification_command';

export interface CraftingMutationClassification {
  required: boolean;
  mutationClass: CraftingMutationClass;
  reasonCode:
    | 'READ_ONLY_OPERATION'
    | 'DOCUMENTATION_ONLY'
    | 'CODING_PATH_MUTATION'
    | 'CODING_VERIFICATION_COMMAND'
    | 'NON_CODING_OPERATION';
}

export type CraftingMutationOrigin =
  | 'host_original'
  | 'donor_derived'
  | 'compatibility'
  | 'verification';

export interface CraftingMutationIntent {
  origin: CraftingMutationOrigin;
  sparepartId?: string;
  compatibilityBoundary?: string;
}

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts',
  '.py', '.go', '.rs', '.java', '.kt', '.kts', '.c', '.cc', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.swift', '.scala', '.ex', '.exs', '.clj', '.cljs', '.lua',
  '.dart', '.sol', '.nix', '.sh', '.ps1', '.bat', '.cmd',
]);
const CONFIG_BASENAMES = new Set([
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
  'tsconfig.json', 'vitest.config.ts', 'vite.config.ts', 'eslint.config.js',
  'pyproject.toml', 'cargo.toml', 'cargo.lock', 'go.mod', 'go.sum',
  'dockerfile', 'makefile', 'pom.xml', 'build.gradle', 'build.gradle.kts',
]);

const VERIFICATION_COMMAND = /\b(?:npm|pnpm|yarn|bun)\s+(?:test|run\s+(?:test|build|lint|typecheck|verify))\b|\b(?:vitest|jest|pytest|tsc|cargo\s+test|go\s+test|mvn\s+test|gradle\s+test)\b/i;

function normalizedPath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}
function basename(value: string): string {
  const normalized = normalizedPath(value);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}
function extension(value: string): string {
  const name = basename(value);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index) : '';
}
function documentationPath(value: string): boolean {
  const normalized = normalizedPath(value);
  return /(?:^|\/)docs?\//.test(normalized) && /\.(?:md|mdx|txt)$/.test(normalized);
}
function codingPath(value: string): boolean {
  const normalized = normalizedPath(value);
  if (documentationPath(value)) return false;
  if (/(?:^|\/)(?:src|source|lib|app|apps|packages|plugin|plugins|test|tests|__tests__|config)(?:\/|$)/.test(normalized)) return true;
  if (SOURCE_EXTENSIONS.has(extension(value))) return true;
  return CONFIG_BASENAMES.has(basename(value));
}
function affectedPaths(input: Record<string, unknown>): string[] {
  const values = [input.path, input.source, input.destination]
    .filter((value): value is string => typeof value === 'string');
  if (Array.isArray(input.paths)) values.push(...input.paths.filter((value): value is string => typeof value === 'string'));
  return values;
}

export function classifyCraftingMutation(
  toolName: string,
  input: Record<string, unknown> = {},
): CraftingMutationClassification {
  if (toolName === 'read_file' || toolName === 'read_multiple_files'
    || toolName === 'list_directory' || toolName === 'get_file_info' || toolName === 'search_files') {
    return { required: false, mutationClass: 'none', reasonCode: 'READ_ONLY_OPERATION' };
  }
  if (toolName === 'execute_command' || toolName === 'start_process') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (VERIFICATION_COMMAND.test(command)) {
      return { required: true, mutationClass: 'verification_command', reasonCode: 'CODING_VERIFICATION_COMMAND' };
    }
    return { required: false, mutationClass: 'none', reasonCode: 'NON_CODING_OPERATION' };
  }
  if (toolName === 'write_file' || toolName === 'edit_file'
    || toolName === 'create_directory' || toolName === 'move_file') {
    const paths = affectedPaths(input);
    if (paths.length > 0 && paths.every(documentationPath)) {
      return { required: false, mutationClass: 'none', reasonCode: 'DOCUMENTATION_ONLY' };
    }
    if (paths.some(codingPath)) {
      return { required: true, mutationClass: 'source_mutation', reasonCode: 'CODING_PATH_MUTATION' };
    }
  }
  return { required: false, mutationClass: 'none', reasonCode: 'NON_CODING_OPERATION' };
}
export function parseCraftingMutationIntent(input: Record<string, unknown>): CraftingMutationIntent | undefined {
  const raw = input.craftingIntent;
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('craftingIntent must be an object');
  const value = raw as Record<string, unknown>;
  const origin = value.origin;
  if (origin !== 'host_original' && origin !== 'donor_derived'
    && origin !== 'compatibility' && origin !== 'verification') {
    throw new Error('craftingIntent.origin is invalid');
  }
  const sparepartId = typeof value.sparepartId === 'string' ? value.sparepartId.trim() : '';
  const compatibilityBoundary = typeof value.compatibilityBoundary === 'string'
    ? value.compatibilityBoundary.trim()
    : '';
  return {
    origin,
    ...(sparepartId ? { sparepartId } : {}),
    ...(compatibilityBoundary ? { compatibilityBoundary } : {}),
  };
}
