import type { SkillProposalCoordinator } from './skill-proposals.js';
import type { SkillNoticeScope, SkillProposalNotice, SkillNoticeDeliveryInput, SkillProposalRecord } from './skill-proposal-types.js';
const brief = (value: string, max = 180) => value.length > max ? value.slice(0, max - 1) + '…' : value;
export function skillNoticeText(item: SkillProposalRecord): string {
  return ['Usulan skill: ' + item.name + ' (' + item.action + ').',
    'Fungsi: ' + brief(item.input.purpose), 'Dipakai ketika: ' + brief(item.input.triggers.join('; '), 120),
    'Bukti: ' + item.supportTaskIds.length + ' task terverifikasi; ' + item.failureTaskIds.length + ' kegagalan; ' + item.qualification + '.',
    'Manfaat yang diharapkan, belum diukur: ' + brief(item.input.expectedBenefit, 140),
    'Batas: ' + brief(item.input.limitations.join('; '), 120), 'Proposal: ' + item.path,
    'Status: proposal/revisi belum aktif. Pilihan: setujui, revisi, tolak, atau nanti.',
    'Revisi: ' + item.revisionDigest,
  ].join('\n');
}
export async function pendingSkillNotices(coordinator: SkillProposalCoordinator, scope: SkillNoticeScope): Promise<SkillProposalNotice[]> {
  await coordinator.reconcileActiveArtifacts(scope.workspace);
  const result: SkillProposalNotice[] = [];
  for (const item of await coordinator.list(scope.workspace)) {
    if (!['proposed', 'notified'].includes(item.status) || item.artifactStatus === 'catalog-active') continue;
    if (item.notices.some(n => n.sessionId === scope.sessionId && n.revisionDigest === item.revisionDigest)) continue;
    if (scope.query && !item.sourceTaskIds.includes(scope.taskId ?? '')
      && !scope.query.toLowerCase().split(/[^a-z0-9]+/).filter(s => s.length > 2)
        .some(s => (item.name + ' ' + item.input.purpose).toLowerCase().includes(s))) continue;
    if (!await coordinator.matches(item)) continue;
    result.push({ proposalId: item.id, revisionDigest: item.revisionDigest, name: item.name, path: item.path,
      text: skillNoticeText(item), status: item.status, qualification: item.qualification });
    if (result.length >= 3) break;
  }
  return result;
}
export async function recordSkillNoticeDelivery(coordinator: SkillProposalCoordinator, input: SkillNoticeDeliveryInput): Promise<void> {
  if (input.status !== 'included-in-response' || !input.sessionId || input.sessionId.length > 200) throw new Error('SKILL_PROPOSAL_DELIVERY_UNSUPPORTED');
  await coordinator.update(input.workspace, input.proposalId, input.revisionDigest, item => {
    if (item.notices.some(n => n.sessionId === input.sessionId && n.revisionDigest === input.revisionDigest)) return;
    item.notices.push({ sessionId: input.sessionId, taskId: input.taskId, revisionDigest: input.revisionDigest,
      status: 'included-in-response', delivery: 'unconfirmed', at: new Date().toISOString() });
    if (item.status === 'proposed') item.status = 'notified';
  }, true);
}
export function appendSkillNotices(response: string, notices: SkillProposalNotice[]): string {
  return notices.length ? response + '\n\n' + notices.map(n => n.text).join('\n\n') : response;
}
