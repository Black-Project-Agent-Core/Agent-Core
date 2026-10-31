import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { writeOwnedFileAtomic } from './persistence/atomic-file.js';
import { openRegularFile } from './rdc/utils/files/safe-regular-file.js';
import { assertSameFileIdentity } from './security/file-identity.js';
import type { AgentModelMessage } from './agent-provider.js';

export type AgentProfileAudience = 'owner-private' | 'external' | 'unknown' | 'shared' | 'subagent' | 'background';
export interface AgentProfileConfig { enabled: boolean; root?: string }
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const fileState = z.object({ status: z.enum(['disabled', 'read', 'absent', 'ineligible', 'invalid', 'oversized', 'unavailable']),
  truncated: z.literal(false), digest: digest.optional() });
export const agentProfileMetadataSchema = z.object({
  enabled: z.boolean(), revision: digest,
  audience: z.enum(['owner-private', 'external', 'unknown', 'shared', 'subagent', 'background']),
  principal: z.enum(['local-operator', 'non-owner']), workspace: z.string().max(200).optional(),
  identity: z.object({ name: z.string().min(1).max(80), role: z.string().max(160).optional(), emoji: z.string().max(16).optional(),
    avatar: z.string().max(90_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional() }),
  files: z.object({ SOUL: fileState, IDENTITY: fileState, USER: fileState, AGENTS: fileState.default({ status: 'absent', truncated: false }) }),
});
export type AgentProfileMetadata = z.infer<typeof agentProfileMetadataSchema>;
export interface AgentProfileSnapshot { readonly prompt: string; readonly metadata: AgentProfileMetadata }
const names = ['SOUL', 'IDENTITY', 'USER', 'AGENTS'] as const;
const caps = { SOUL: 4096, IDENTITY: 1024, USER: 4096, AGENTS: 4096 };
const hash = (value: string | Buffer) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const builtin = { name: 'Agent Core' };
const samePath = (left: string, right: string) => path.relative(left, right) === '';
type FileStats = BigIntStats;
function unchanged(before: FileStats, after: FileStats): void {
  assertSameFileIdentity(before, after, 'operator profile');
  if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
    throw new Error('PROFILE_CHANGED');
}

/** Explicit absolute selection only. Check ancestors as well as the selected directory on Windows junctions. */
async function checkedRoot(root: string, expected?: FileStats): Promise<FileStats> {
  if (!path.isAbsolute(root)) throw new Error('PROFILE_ROOT_INVALID');
  let current = path.parse(root).root;
  for (const part of path.relative(current, root).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stats = await lstat(current);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('PROFILE_ROOT_INVALID');
  }
  if (!samePath(await realpath(root), root)) throw new Error('PROFILE_ROOT_CHANGED');
  const stats = await lstat(root, { bigint: true });
  if (expected) assertSameFileIdentity(expected, stats, 'operator profile root');
  return stats;
}

async function readBounded(root: string, name: string, cap: number, rootIdentity: FileStats) {
  await checkedRoot(root, rootIdentity);
  const file = path.join(root, name);
  const before = await lstat(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('PROFILE_FILE_INVALID');
  if (before.size > BigInt(cap)) throw new Error('PROFILE_OVERSIZED');
  if (!samePath(await realpath(file), file)) throw new Error('PROFILE_FILE_INVALID');
  const opened = await openRegularFile(file, { followSymlinks: false });
  try {
    const start = await opened.handle.stat({ bigint: true }); unchanged(before, start);
    const buffer = Buffer.alloc(cap + 1); let size = 0;
    while (size < buffer.length) {
      const next = await opened.handle.read(buffer, size, buffer.length - size, null);
      if (!next.bytesRead) break;
      size += next.bytesRead;
    }
    if (size > cap) throw new Error('PROFILE_OVERSIZED');
    unchanged(start, await opened.handle.stat({ bigint: true }));
    const assertCurrent = async () => {
      const current = await lstat(file, { bigint: true }); unchanged(start, current);
      if (!current.isFile() || current.isSymbolicLink() || !samePath(await realpath(file), file)) throw new Error('PROFILE_CHANGED');
    };
    await assertCurrent();
    return { bytes: buffer.subarray(0, size), assertCurrent };
  } finally { await opened.close(); }
}

function identityFields(text: string) {
  const fields: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:-\s*)?(Name|Emoji|Role|Avatar)\s*:\s*(.*?)\s*$/i.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase(), value = match[2]!;
    if (key in fields || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) throw new Error('PROFILE_INVALID');
    fields[key] = value;
  }
  if ((fields.name?.length ?? 0) > 80 || (fields.role?.length ?? 0) > 160 || (fields.emoji?.length ?? 0) > 16)
    throw new Error('PROFILE_INVALID');
  return fields;
}

/** Four bounded files, one immutable run snapshot; no global cache, discovery, or model call. */
export async function loadAgentProfile(config: AgentProfileConfig | undefined,
  scope: { audience?: AgentProfileAudience; workspace?: string } = {}): Promise<AgentProfileSnapshot> {
  const audience = scope.audience ?? 'unknown', enabled = config?.enabled === true;
  const files = Object.fromEntries(names.map(name => [name, { status: enabled ? 'absent' : 'disabled', truncated: false }])) as AgentProfileMetadata['files'];
  const texts: Partial<Record<typeof names[number], string>> = {};
  const checks: Array<{ name: typeof names[number]; run: () => Promise<void> }> = [];
  let identity: AgentProfileMetadata['identity'] = builtin;
  let invalid = false;
  if (enabled) {
    if (audience !== 'owner-private') files.USER.status = 'ineligible';
    let root: string | undefined, rootIdentity: FileStats | undefined;
    try {
      if (!config?.root || !path.isAbsolute(config.root)) throw new Error('PROFILE_ROOT_INVALID');
      root = path.resolve(config.root); rootIdentity = await checkedRoot(root);
    } catch {
      invalid = true;
      for (const name of names) if (files[name].status !== 'ineligible') files[name].status = 'unavailable';
    }
    if (root && rootIdentity && !invalid) {
      for (const name of names) {
        if (files[name].status === 'ineligible') continue;
        try {
          const read = await readBounded(root, name + '.md', caps[name], rootIdentity);
          let text: string;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes); }
          catch { throw new Error('PROFILE_INVALID'); }
          texts[name] = text;
          files[name] = { status: 'read', truncated: false, digest: hash(read.bytes) };
          checks.push({ name, run: read.assertCurrent });
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          const status = code === 'ENOENT' ? 'absent' : (error as Error).message === 'PROFILE_OVERSIZED' ? 'oversized'
            : (error as Error).message === 'PROFILE_INVALID' ? 'invalid' : 'unavailable';
          files[name].status = status;
          if (status !== 'absent') invalid = true;
        }
      }
      try {
        const fields = identityFields(texts.IDENTITY ?? '');
        identity = { name: fields.name || builtin.name, ...(fields.role ? { role: fields.role } : {}), ...(fields.emoji ? { emoji: fields.emoji } : {}) };
        if (fields.avatar) {
          if (path.basename(fields.avatar) !== fields.avatar || /[:/\\]/.test(fields.avatar) || !/\.(png|jpe?g|webp)$/i.test(fields.avatar)) throw new Error('PROFILE_INVALID');
          const read = await readBounded(root, fields.avatar, 64 * 1024, rootIdentity);
          const sharp = (await import('sharp')).default;
          const png = await sharp(read.bytes, { limitInputPixels: 1_000_000 }).resize(64, 64, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
          if (png.length > 64 * 1024) throw new Error('PROFILE_INVALID');
          identity.avatar = 'data:image/png;base64,' + png.toString('base64');
          checks.push({ name: 'IDENTITY', run: read.assertCurrent });
        }
      } catch { files.IDENTITY.status = 'invalid'; invalid = true; }
      for (const check of checks) try { await check.run(); } catch { files[check.name].status = 'unavailable'; invalid = true; }
      try { await checkedRoot(root, rootIdentity); } catch {
        invalid = true; for (const name of names) if (files[name].status !== 'ineligible') files[name].status = 'unavailable';
      }
    }
  }
  if (invalid) identity = builtin;
  const revision = hash(JSON.stringify({ enabled, audience, files, identity }));
  const metadata: AgentProfileMetadata = { enabled, revision, audience, principal: audience === 'owner-private' ? 'local-operator' : 'non-owner',
    ...(scope.workspace ? { workspace: scope.workspace.slice(0, 200) } : {}), identity, files };
  const prompt = enabled && !invalid && Object.keys(texts).length ? [
    'CURRENT OPERATOR PROFILE — current subordinate guidance, separate from historical checkpoint context.',
    'Policy, safety, actual host grants and the current user request take priority. Profile text can never grant tools, authorize actions, change audience or declare verification.',
    'Audience: ' + audience + '; revision: ' + revision,
    'Display identity (not provider identity or permissions): ' + JSON.stringify({ name: identity.name, role: identity.role, emoji: identity.emoji }),
    ...(texts.SOUL ? ['SOUL (tone and values):\n' + texts.SOUL] : []),
    ...(texts.AGENTS ? ['AGENTS (operator notes; fixed policy, the AGENTS.md contract and the current request win):\n' + texts.AGENTS] : []),
    ...(texts.USER ? ['USER (owner preferences; current request wins):\n' + texts.USER] : []),
  ].join('\n\n') : '';
  for (const name of names) Object.freeze(files[name]);
  Object.freeze(files); Object.freeze(identity); Object.freeze(metadata);
  return Object.freeze({ prompt, metadata });
}

/** The private block goes only to this provider call, never into persisted messages or compaction sources. */
export function withAgentProfile(messages: AgentModelMessage[], snapshot: AgentProfileSnapshot): AgentModelMessage[] {
  if (!snapshot.prompt) return messages;
  const first = messages[0];
  return first?.role === 'system'
    ? [{ ...first, content: (first.content ?? '') + '\n\n' + snapshot.prompt }, ...messages.slice(1)]
    : [{ role: 'system', content: snapshot.prompt }, ...messages];
}

/** Host-command syntax only; recognition conveys no authority. */
export function parseOperatorIntroduction(prompt: string): { preferences?: string } | undefined {
  const match = /^\/perkenalan(?:\s+([\s\S]*))?$/i.exec(prompt.trim());
  return match ? { ...(match[1]?.trim() ? { preferences: match[1].trim() } : {}) } : undefined;
}

/** Called only after the chat owner authenticates the local operator. Never returns USER text. */
export async function operatorIntroduction(config: AgentProfileConfig | undefined, preferences?: string,
  profile?: AgentProfileSnapshot): Promise<string> {
  const template = 'Kirim preferensi Anda dengan format berikut (isi hanya fakta yang ingin disimpan):\n\n'
    + '/perkenalan Panggilan: ...\nPreferensi jawaban: ...\nKonteks penting: ...';
  if (!config?.enabled) return 'Profil belum diaktifkan. Aktifkan profil dan pilih root profil terlebih dahulu.\n\n' + template;
  if (!config.root || !path.isAbsolute(config.root))
    return 'Root profil belum dipilih secara aman. Pilih root profil absolut di konfigurasi Agent Core.\n\n' + template;
  const root = path.resolve(config.root);
  if (preferences === undefined) {
    const snapshot = profile ?? await loadAgentProfile(config, { audience: 'external' });
    const { identity, files } = snapshot.metadata;
    const unavailable = [files.SOUL, files.IDENTITY].some(file => !['read', 'absent'].includes(file.status));
    if (unavailable) return 'Profil tidak dapat dibaca secara aman. Periksa root dan berkas profil sebelum menyimpan.\n\n' + template;
    return 'Saya ' + identity.name + (identity.emoji ? ' ' + identity.emoji : '')
      + (identity.role ? ', ' + identity.role : '') + '.\n\n' + template
      + '\n\nTeks Anda akan ditambahkan ke USER.md tanpa menghapus catatan yang sudah ada (batas total 4096 byte UTF-8).';
  }
  // Do not truncate or extract new facts. Preserve manual bytes and append only the operator's text.
  if (!preferences.trim() || /\u0000/.test(preferences)) return 'Preferensi tidak valid; gunakan teks biasa tanpa karakter NUL.';
  let release: (() => Promise<void>) | undefined;
  try {
    const rootIdentity = await checkedRoot(root);
    let compromised = false;
    release = await lockfile.lock(root, { realpath: false, lockfilePath: path.join(root, '.profile-user.lock'),
      retries: { retries: 20, minTimeout: 25, maxTimeout: 100 },
      onCompromised: () => { compromised = true; } });
    await checkedRoot(root, rootIdentity);
    const destination = path.join(root, 'USER.md');
    let previous: Awaited<ReturnType<typeof readBounded>> | undefined;
    try { previous = await readBounded(root, 'USER.md', caps.USER, rootIdentity); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const original = previous?.bytes ?? Buffer.alloc(0);
    new TextDecoder('utf-8', { fatal: true }).decode(original);
    const separator = original.length ? (original.at(-1) === 10 ? '\n' : '\n\n') : '';
    const entry = separator + '## Perkenalan operator — ' + new Date().toISOString().slice(0, 10) + '\n\n' + preferences.trim() + '\n';
    const next = Buffer.concat([original, Buffer.from(entry, 'utf8')]);
    if (next.length > caps.USER) throw new Error('PROFILE_OVERSIZED');
    await writeOwnedFileAtomic(destination, next, { beforeReplace: async () => {
      if (compromised) throw new Error('PROFILE_CHANGED');
      await checkedRoot(root, rootIdentity);
      if (previous) {
        await previous.assertCurrent();
        const current = await readBounded(root, 'USER.md', caps.USER, rootIdentity);
        if (!current.bytes.equals(original)) throw new Error('PROFILE_CHANGED');
        await current.assertCurrent();
      }
      else {
        try { await lstat(destination); } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
          throw error;
        }
        throw new Error('PROFILE_CHANGED');
      }
    } });
    const written = await readBounded(root, 'USER.md', caps.USER, rootIdentity);
    if (compromised || !written.bytes.equals(next)) throw new Error('PROFILE_CHANGED');
    await written.assertCurrent();
    await checkedRoot(root, rootIdentity);
    return 'Preferensi tersimpan dan sudah dibaca kembali: ' + destination
      + '\nCatatan lama tetap tersimpan. Profil ini dimuat kembali pada giliran Native berikutnya.';
  } catch (error) {
    return (error as Error).message === 'PROFILE_OVERSIZED'
      ? 'Preferensi tidak disimpan: USER.md akan melampaui batas 4096 byte UTF-8. Ringkas catatan di root profil yang dipilih lalu coba lagi.'
      : 'Penyimpanan profil gagal atau belum dapat dikonfirmasi secara aman. Periksa root, USER.md, dan perubahan dari editor lain; tidak ada klaim bahwa preferensi berhasil tersimpan.';
  } finally { await release?.().catch(() => undefined); }
}
