export type ExecutionIntentSource = 'operational' | 'execution';
export type ExecutionRiskClass = 'bounded' | 'open_world' | 'blocked';
export type ExecutionInterpreterClass = 'none' | 'cmd' | 'powershell' | 'posix_shell';

export interface ExecutionIntent {
  command: string;
  source: ExecutionIntentSource;
}

export interface ExecutionPolicyDecision {
  allowed: boolean;
  code:
    | 'EXECUTION_POLICY_ALLOWED_BOUNDED'
    | 'EXECUTION_POLICY_ALLOWED_OPEN_WORLD'
    | 'EXECUTION_POLICY_BLOCKED_COMMAND'
    | 'EXECUTION_POLICY_BLOCKED_NESTED_COMMAND';
  riskClass: ExecutionRiskClass;
  executable: string;
  interpreterClass: ExecutionInterpreterClass;
  characteristics: string[];
}

const BLOCKED = new Set([
  'mkfs', 'format', 'mount', 'umount', 'fdisk', 'dd', 'parted', 'diskpart',
  'sudo', 'su', 'passwd', 'adduser', 'useradd', 'usermod', 'groupadd', 'chsh', 'visudo',
  'shutdown', 'reboot', 'halt', 'poweroff', 'init', 'iptables', 'firewall', 'netsh',
  'sfc', 'bcdedit', 'reg', 'net', 'sc', 'runas', 'cipher', 'takeown',
]);

const DISK_ADMIN = new Set(['mkfs', 'format', 'mount', 'umount', 'fdisk', 'dd', 'parted', 'diskpart', 'cipher']);
const PRIVILEGE = new Set(['sudo', 'su', 'passwd', 'adduser', 'useradd', 'usermod', 'groupadd', 'chsh', 'visudo', 'runas', 'takeown']);
const SERVICE_ADMIN = new Set(['shutdown', 'reboot', 'halt', 'poweroff', 'init', 'sfc', 'bcdedit', 'reg', 'net', 'sc']);
const NETWORK_ADMIN = new Set(['iptables', 'firewall', 'netsh']);
const NETWORK = new Set(['curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'git', 'gh', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'pip', 'pip3']);
const REPOSITORY = new Set(['git', 'gh']);
const PACKAGE_MANAGER = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun', 'pip', 'pip3']);

function commandName(segment: string): string {
  return (segment.trim().replace(/^&\s*/, '').match(/^([A-Za-z0-9_.-]+)/)?.[1] ?? '')
    .replace(/\.exe$/i, '')
    .toLowerCase();
}

function interpreterClass(executable: string): ExecutionInterpreterClass {
  if (executable === 'cmd') return 'cmd';
  if (executable === 'powershell' || executable === 'pwsh') return 'powershell';
  if (executable === 'sh' || executable === 'bash' || executable === 'zsh' || executable === 'dash') return 'posix_shell';
  return 'none';
}

function nestedCommand(segment: string): { executable: string; interpreterClass: ExecutionInterpreterClass } | null {
  const patterns: Array<[RegExp, ExecutionInterpreterClass]> = [
    [/(?:^|\s)cmd(?:\.exe)?\s+\/c\s+["']?([A-Za-z0-9_.-]+)/i, 'cmd'],
    [/(?:^|\s)(?:powershell|pwsh)(?:\.exe)?[^\r\n]*?-(?:command|c)\s+["']?([A-Za-z0-9_.-]+)/i, 'powershell'],
    [/(?:^|\s)start-process\s+["']?([A-Za-z0-9_.-]+)/i, 'powershell'],
    [/(?:^|\s)(?:sh|bash|zsh|dash)\s+-c\s+["']?([A-Za-z0-9_.-]+)/i, 'posix_shell'],
  ];
  for (const [pattern, kind] of patterns) {
    const match = segment.match(pattern)?.[1];
    if (match) return { executable: match.replace(/\.exe$/i, '').toLowerCase(), interpreterClass: kind };
  }
  return null;
}

function characteristicsFor(executable: string): string[] {
  const values = new Set<string>();
  if (DISK_ADMIN.has(executable)) values.add('disk_admin');
  if (PRIVILEGE.has(executable)) values.add('privilege_boundary');
  if (SERVICE_ADMIN.has(executable)) values.add('service_admin');
  if (NETWORK_ADMIN.has(executable)) values.add('network_admin');
  if (NETWORK.has(executable)) values.add('network');
  if (REPOSITORY.has(executable)) values.add('repository');
  if (PACKAGE_MANAGER.has(executable)) values.add('package_manager');
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function evaluateExecutionIntent(intent: ExecutionIntent): ExecutionPolicyDecision {
  const command = typeof intent?.command === 'string' ? intent.command : '';
  const segments = command.split(/(?:;|&&|\|\|?|\r?\n)+/);
  let firstExecutable = '';
  let firstInterpreter: ExecutionInterpreterClass = 'none';
  const aggregate = new Set<string>();

  for (const segment of segments) {
    const executable = commandName(segment);
    if (!firstExecutable && executable) {
      firstExecutable = executable;
      firstInterpreter = interpreterClass(executable);
    }
    for (const item of characteristicsFor(executable)) aggregate.add(item);
    if (BLOCKED.has(executable)) {
      return {
        allowed: false,
        code: 'EXECUTION_POLICY_BLOCKED_COMMAND',
        riskClass: 'blocked',
        executable,
        interpreterClass: interpreterClass(executable),
        characteristics: characteristicsFor(executable),
      };
    }

    const nested = nestedCommand(segment);
    if (nested) {
      aggregate.add('nested_interpreter');
      for (const item of characteristicsFor(nested.executable)) aggregate.add(item);
      if (BLOCKED.has(nested.executable)) {
        return {
          allowed: false,
          code: 'EXECUTION_POLICY_BLOCKED_NESTED_COMMAND',
          riskClass: 'blocked',
          executable: nested.executable,
          interpreterClass: nested.interpreterClass,
          characteristics: [...aggregate].sort((a, b) => a.localeCompare(b)),
        };
      }
    }
  }

  const characteristics = [...aggregate].sort((a, b) => a.localeCompare(b));
  const openWorld = characteristics.some((item) => item === 'network' || item === 'repository' || item === 'package_manager');
  return {
    allowed: true,
    code: openWorld ? 'EXECUTION_POLICY_ALLOWED_OPEN_WORLD' : 'EXECUTION_POLICY_ALLOWED_BOUNDED',
    riskClass: openWorld ? 'open_world' : 'bounded',
    executable: firstExecutable,
    interpreterClass: firstInterpreter,
    characteristics,
  };
}

export class ExecutionPolicyError extends Error {
  constructor(
    public readonly code: ExecutionPolicyDecision['code'],
    public readonly decision: ExecutionPolicyDecision,
  ) {
    super(`Blocked command: ${decision.executable || 'unknown'}`);
    this.name = 'ExecutionPolicyError';
  }
}

export function assertExecutionIntentAllowed(intent: ExecutionIntent): ExecutionPolicyDecision {
  const decision = evaluateExecutionIntent(intent);
  if (!decision.allowed) throw new ExecutionPolicyError(decision.code, decision);
  return decision;
}
