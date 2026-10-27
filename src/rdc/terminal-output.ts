// Colors, cursor moves and window titles are noise to whatever reads the output.
const ANSI_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI_SEQUENCE, '');
}

// Windows reports a crash as a huge exit code; naming the NTSTATUS keeps it from looking like a random number.
const NTSTATUS_NAMES: Record<number, string> = {
  0xC0000005: 'STATUS_ACCESS_VIOLATION', 0xC000013A: 'STATUS_CONTROL_C_EXIT', 0xC0000135: 'STATUS_DLL_NOT_FOUND',
  0xC0000139: 'STATUS_ENTRYPOINT_NOT_FOUND', 0xC0000142: 'STATUS_DLL_INIT_FAILED', 0xC00000FD: 'STATUS_STACK_OVERFLOW',
  0xC0000409: 'STATUS_STACK_BUFFER_OVERRUN', 0xC0000374: 'STATUS_HEAP_CORRUPTION', 0xC0000094: 'STATUS_INTEGER_DIVIDE_BY_ZERO',
  0xC0000017: 'STATUS_NO_MEMORY', 0xC0000022: 'STATUS_ACCESS_DENIED', 0xC000001D: 'STATUS_ILLEGAL_INSTRUCTION',
};
export function describeExitCode(code: number | null | undefined): string {
  if (code === null || code === undefined) return '';
  const unsigned = code < 0 ? code + 0x100000000 : code;
  const name = NTSTATUS_NAMES[unsigned];
  return name ? ` (0x${unsigned.toString(16).toUpperCase()} ${name})` : '';
}
