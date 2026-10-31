export function stableFileIdentity(stats: { dev: number | bigint; ino: number | bigint }) {
    const dev = typeof stats.dev === 'bigint' ? stats.dev.toString() : Number.isSafeInteger(stats.dev) ? String(stats.dev) : null;
    const ino = typeof stats.ino === 'bigint' ? stats.ino.toString() : Number.isSafeInteger(stats.ino) ? String(stats.ino) : null;
    if (dev === null || ino === null)
        return null;
    if (dev === '0' && ino === '0')
        return null;
    return `${dev}:${ino}`;
}
/** Cache identity includes change time: restoring mtime must not hide an edit or replacement. */
export function stableFileRevision(stats: import('node:fs').BigIntStats): string | null {
    const identity = stableFileIdentity(stats);
    // FAT-like timestamps cannot detect a same-size edit in the same second.
    return identity && stats.ctimeNs >= stats.birthtimeNs && stats.ctimeNs % 1_000_000_000n !== 0n
        ? `${identity}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}` : null;
}
export function assertSameFileIdentity(expected: { dev: number | bigint; ino: number | bigint }, actual: { dev: number | bigint; ino: number | bigint }, label: string) {
    const left = stableFileIdentity(expected);
    const right = stableFileIdentity(actual);
    if (!left || !right)
        throw new Error(`REGULAR_FILE_IDENTITY_UNAVAILABLE: ${label}`);
    if (left !== right)
        throw new Error(`REGULAR_FILE_IDENTITY_CHANGED: ${label}`);
}
