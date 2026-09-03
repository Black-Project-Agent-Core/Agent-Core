export type ImplementationMutationClass =
  | 'none'
  | 'source_mutation'
  | 'verification_command';

export interface ImplementationWorkClassification {
  required: boolean;
  mutationClass: ImplementationMutationClass;
  reasonCode:
    | 'READ_ONLY_OPERATION'
    | 'DOCUMENTATION_ONLY'
    | 'IMPLEMENTATION_PATH_MUTATION'
    | 'IMPLEMENTATION_VERIFICATION_COMMAND'
    | 'NON_IMPLEMENTATION_OPERATION';
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

function implementationPath(value: string): boolean {
  const normalized = normalizedPath(value);
  if (documentationPath(value)) return false;
  if (/(?:^|\/)(?:src|source|lib|app|apps|packages|plugin|plugins|test|tests|__tests__|config)(?:\/|$)/.test(normalized)) return true;
  if (SOURCE_EXTENSIONS.has(extension(value))) return true;
  return CONFIG_BASENAMES.has(basename(value));
}

function affectedPaths(input: Record<string, unknown>): string[] {
  const values = [input.path, input.source, input.destination]
    .filter((value): value is string => typeof value === 'string');
  if (Array.isArray(input.paths)) {
    values.push(...input.paths.filter((value): value is string => typeof value === 'string'));
  }
  return values;
}
export function classifyImplementationWork(
  toolName: string,
  input: Record<string, unknown> = {},
): ImplementationWorkClassification {
  if (toolName === 'read_file' || toolName === 'read_multiple_files'
    || toolName === 'list_directory' || toolName === 'get_file_info' || toolName === 'search_files') {
    return { required: false, mutationClass: 'none', reasonCode: 'READ_ONLY_OPERATION' };
  }

  if (toolName === 'execute_command' || toolName === 'start_process') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (VERIFICATION_COMMAND.test(command)) {
      return { required: true, mutationClass: 'verification_command', reasonCode: 'IMPLEMENTATION_VERIFICATION_COMMAND' };
    }
    return { required: false, mutationClass: 'none', reasonCode: 'NON_IMPLEMENTATION_OPERATION' };
  }

  if (toolName === 'write_file' || toolName === 'edit_file'
    || toolName === 'create_directory' || toolName === 'move_file') {
    const paths = affectedPaths(input);
    if (paths.length > 0 && paths.every(documentationPath)) {
      return { required: false, mutationClass: 'none', reasonCode: 'DOCUMENTATION_ONLY' };
    }
    if (paths.some(implementationPath)) {
      return { required: true, mutationClass: 'source_mutation', reasonCode: 'IMPLEMENTATION_PATH_MUTATION' };
    }
  }

  return { required: false, mutationClass: 'none', reasonCode: 'NON_IMPLEMENTATION_OPERATION' };
}