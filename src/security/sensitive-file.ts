import { lstat, open } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { assertSameFileIdentity } from './file-identity.js';
const MAX_SENSITIVE_FILE_BYTES = 16 * 1024 * 1024;
function assertSensitiveStats(stats: Stats, filePath: string): void {
    if (stats.isSymbolicLink())
        throw new Error(`SENSITIVE_FILE_SYMLINK_REFUSED: ${filePath}`);
    if (!stats.isFile())
        throw new Error(`SENSITIVE_FILE_NOT_REGULAR: ${filePath}`);
    if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
        throw new Error(`SENSITIVE_FILE_PERMISSIONS_TOO_OPEN: ${filePath}`);
    }
}
export async function assertSensitiveRegularFile(filePath: string): Promise<void> {
    assertSensitiveStats(await lstat(filePath), filePath);
}
export async function readSensitiveTextFile(filePath: string): Promise<string> {
    const pre = await lstat(filePath);
    const preIdentity = await lstat(filePath, { bigint: true });
    assertSensitiveStats(pre, filePath);
    const handle = await open(filePath, 'r');
    try {
        const opened = await handle.stat();
        const openedIdentity = await handle.stat({ bigint: true });
        assertSensitiveStats(opened, filePath);
        const post = await lstat(filePath);
        const postIdentity = await lstat(filePath, { bigint: true });
        assertSensitiveStats(post, filePath);
        assertSameFileIdentity(preIdentity, openedIdentity, filePath);
        assertSameFileIdentity(openedIdentity, postIdentity, filePath);
        if (opened.size > MAX_SENSITIVE_FILE_BYTES) {
            throw new Error(`SENSITIVE_FILE_TOO_LARGE: ${filePath}`);
        }
        return await handle.readFile('utf8');
    }
    finally {
        await handle.close().catch(() => undefined);
    }
}
export async function readSensitiveJsonFile<T>(filePath: string): Promise<T> {
    return JSON.parse(await readSensitiveTextFile(filePath));
}
