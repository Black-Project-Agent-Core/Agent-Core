import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import type { SkillProposalRecord } from './skill-proposal-types.js';
export const proposalDigest = (text: string): string => 'sha256:' + createHash('sha256').update(text).digest('hex');
export function semanticSkillName(value: string): string {
  if (typeof value !== 'string' || value.length > 64 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
    || /-\d+$/.test(value) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value)
    || /^[a-f0-9]{32,64}$/.test(value)
    || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)) throw new Error('SKILL_PROPOSAL_NAME_INVALID');
  return value;
}
export function proposalWorkspaceSegment(value: string): string {
  // This is a display/path projection of an already verified registration, never workspace identity.
  const segment = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!segment || segment.length > 64 || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(segment)) throw new Error('SKILL_PROPOSAL_WORKSPACE_NAME_INVALID');
  return segment;
}
export function renderSkillProposal(item: SkillProposalRecord): string {
  const p = item.input;
  const section = (title: string, lines: string[]) => ['## ' + title, ...lines, ''].join('\n');
  return ['# ' + item.name, '', 'Nama: ' + item.name, 'Status: ' + item.status,
    'Aksi: ' + item.action, 'Artifact: ' + item.artifactStatus, 'Workspace: ' + item.workspace,
    'Artifact digest: ' + (item.artifactDigest ?? 'unavailable'), 'Target active digest: ' + (item.expectedActiveDigest ?? 'none'),
    'Proposal ID: ' + item.id, 'Revisi: ' + item.revisionDigest, 'Kualifikasi bukti: ' + item.qualification,
    item.status === 'implemented' && item.artifactStatus === 'catalog-active'
      ? 'Proposal ini telah dipenuhi oleh artifact aktif yang provenance-nya cocok; catatan ini bukan izin eksekusi tambahan.'
      : 'Berkas ini adalah proposal, bukan instruksi aktif atau izin eksekusi.', '',
    section('Tujuan', [p.purpose]), section('Trigger', p.triggers), section('Non-trigger', p.nonTriggers),
    section('Workflow', p.steps.map((s, i) => (i + 1) + '. ' + s)),
    section('Alat yang dideklarasikan (bukan izin)', p.allowedTools),
    section('Manfaat yang diharapkan; belum diukur', [p.expectedBenefit]),
    section('Bukti dan pengalaman asal', [
      'Task sumber: ' + item.sourceTaskIds.join(', '), 'Dukungan terverifikasi: ' + item.supportTaskIds.join(', '),
      'Kegagalan: ' + item.failureTaskIds.join(', '), 'Historical/unknown: ' + item.historicalTaskIds.join(', '), ...item.evidenceRefs]),
    ...(item.procedureContractDigest ? [section('Kontrak bukti prosedur', ['Version: 1', 'Digest: ' + item.procedureContractDigest, 'Hanya receipt contract-bound yang replayable menyumbang kualifikasi; bukti legacy tetap historical/unknown.'])] : []),
    section('Keterbatasan', p.limitations), section('Kebutuhan implementasi', [p.implementation]),
    section('Acceptance yang direncanakan', p.acceptance),
    section('Keputusan pengguna', item.decisions.filter(d => d.revisionDigest === item.revisionDigest)
      .map(d => d.decision + ' / ' + d.scope + ' / ' + d.userEvidenceRef).concat(
        item.decisions.some(d => d.revisionDigest === item.revisionDigest) || item.fulfillment
          ? [] : ['Belum ada keputusan atas revisi ini.'])),
    ...(item.fulfillment && item.fulfillment.revisionDigest === item.revisionDigest
      ? [section('Pemenuhan proposal', [item.fulfillment.kind + ' / ' + item.fulfillment.artifactDigest + ' / ' + item.fulfillment.evidenceRef + ' / ' + item.fulfillment.at])]
      : []),
    section('Riwayat revisi', item.history.map(h => h.revisionDigest + ' / ' + h.status + ' / ' + h.at)),
  ].join('\n');
}
export async function assertProposalPath(root: string, file: string, create = false): Promise<void> {
  const relative = path.relative(root, file), parts = relative.split(path.sep);
  if (parts.length !== 2 || parts.some(p => !p || p === '..') || path.isAbsolute(relative)) throw new Error('SKILL_PROPOSAL_PATH_INVALID');
  if (proposalWorkspaceSegment(parts[0]) !== parts[0]) throw new Error('SKILL_PROPOSAL_PATH_INVALID');
  semanticSkillName(parts[1].replace(/\.md$/, ''));
  if (!parts[1].endsWith('.md')) throw new Error('SKILL_PROPOSAL_PATH_INVALID');
  const parent = path.dirname(root);
  if (path.resolve(await realpath(parent)).toLowerCase() !== path.resolve(parent).toLowerCase()) throw new Error('SKILL_PROPOSAL_SYMLINK_REFUSED');
  for (const target of [root, path.join(root, parts[0]), file]) {
    try { if ((await lstat(target)).isSymbolicLink()) throw new Error('SKILL_PROPOSAL_SYMLINK_REFUSED'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  if (create) await mkdir(path.dirname(file), { recursive: true });
}
export async function proposalFileMatches(root: string, item: SkillProposalRecord): Promise<boolean> {
  try { await assertProposalPath(root, item.path); return await readFile(item.path, 'utf8') === renderSkillProposal(item); }
  catch { return false; }
}
export async function writeProposalProjection(root: string, item: SkillProposalRecord): Promise<void> {
  await assertProposalPath(root, item.path, true);
  const content = renderSkillProposal(item);
  try {
    const previous = await readFile(item.path, 'utf8');
    if (previous === content) return;
    if (!item.previousDocumentDigest || proposalDigest(previous) !== item.previousDocumentDigest) throw new Error('SKILL_PROPOSAL_FILE_DRIFT');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await writeOwnedFileAtomic(item.path, content, { mode: 0o600 });
  if (await readFile(item.path, 'utf8') !== content) throw new Error('SKILL_PROPOSAL_WRITE_READBACK_FAILED');
}
