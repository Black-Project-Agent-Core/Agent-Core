type FileIdentityStats = {
  dev: number | bigint;
  ino: number | bigint;
};

export function stableFileIdentity(stats: FileIdentityStats): string | null {
  const dev = typeof stats.dev === 'bigint' ? stats.dev.toString() : Number.isSafeInteger(stats.dev) ? String(stats.dev) : null;
  const ino = typeof stats.ino === 'bigint' ? stats.ino.toString() : Number.isSafeInteger(stats.ino) ? String(stats.ino) : null;
  if (dev === null || ino === null) return null;
  if (dev === '0' && ino === '0') return null;
  return `${dev}:${ino}`;
}

export function assertSameFileIdentity(
  expected: FileIdentityStats,
  actual: FileIdentityStats,
  label: string,
): void {
  const left = stableFileIdentity(expected);
  const right = stableFileIdentity(actual);
  if (!left || !right) throw new Error(`REGULAR_FILE_IDENTITY_UNAVAILABLE: ${label}`);
  if (left !== right) throw new Error(`REGULAR_FILE_IDENTITY_CHANGED: ${label}`);
}
