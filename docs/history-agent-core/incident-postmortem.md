# incident-postmortem

## Completion record — 2026-10-29

Status: COMPLETED — approved/build-and-activated artifact; scoped acceptance verified.

The user's 2026-10-29 proposal-completion request authorizes this scope. SkillService accepted the exact proposal revision below through the authenticated allowlisted controller. Resident inspect/read/validate confirmed artifact `sha256:479334c2c90b1bbb16c6be2ef81af60ada010c3e52768fecc315e561c245dc74`, one3,308-byte file and empty allowedTools. Discovery ranked the incident query first; parser/lint and focused regressions passed. [Incident-Postmortem.md](../verification/Incident-Postmortem.md) applies the workflow to the historical HTTP authorizer incident, with sourced/unknown chronology, contributing conditions, impact, actions and runbook. Its later authorship is not credited with causing the earlier recovery. Benefit remains unmeasured.

Main's Learning checkpoint `complete-all-proposals-20261029-final-recovery` is reviewed complete/no-new-knowledge. [Completion evidence](../verification/Proposal-Completion.md) retains the initial task-scope authorization failure/recovery and exact activation evidence. The canonical proposal ID/revision/decision and active artifact remain managed by their original owners. Only this readable projection is archived; no rebuild/republish or catalog mutation is performed by moving it.

Original path: `docs/proposals/skills/agent-core/incident-postmortem.md`. Archive: `docs/history-agent-core/incident-postmortem.md`. Original generated projection is preserved below as historical evidence.

## Original projection

Nama: incident-postmortem
Status: approved
Aksi: create
Artifact: catalog-active
Workspace: agent-core
Artifact digest: sha256:479334c2c90b1bbb16c6be2ef81af60ada010c3e52768fecc315e561c245dc74
Target active digest: none
Proposal ID: skill-proposal:66f03991dc32f37714f8088d98a5a4f6
Revisi: sha256:e64a9f46c3598399625d71cba2acdc23db7611470eecfc1e007e4565651e4ef7
Kualifikasi bukti: awaiting-verification
Berkas ini adalah proposal, bukan instruksi aktif atau izin eksekusi.

## Tujuan
Handle a runtime regression, data corruption or failed release as an incident: stabilize, record a factual timeline, find contributing system conditions without blaming a person, and leave a verified fix and a short runbook.

## Trigger
A shipped change broke behavior that worked, and the cause is not yet known.
Data was lost, corrupted or exposed, or a release failed or had to be rolled back.
Asked to write a postmortem or a runbook after an incident.

## Non-trigger
An ordinary bug found before release: choose debugging-and-error-recovery.
Planning a feature or a refactor.
A purely cosmetic defect with no lasting effect.

## Workflow
1. Declare: one line saying what is wrong, its severity, its status (investigating, mitigated, resolved), who owns it and the start time as an absolute date and time.
2. Stabilize first: take the smallest reversible action that stops the damage and record each action with its time and result. Do not start a root-cause hunt while the damage continues.
3. Timeline: list events with timestamps and a source for each (log line, commit, file time). Mark every inferred entry as inferred.
4. Cause: name several contributing factors, not one: the trigger, the condition that let it matter, and what failed to detect it. Ask why until you reach a system condition that can be changed, usually within five questions; stop there. Describe conditions, never people.
5. Impact: say what data, time or users were affected, whether data was lost or corrupted, and what is still unknown.
6. Actions: each with an owner, a verification, and whether it prevents, detects or mitigates. Mark which are already done and point to the commit or check that shows it.
7. Runbook: if it can recur, write symptom, check, fix, rollback and how to verify, adapted to the kind of incident (runtime regression, data corruption or release failure).
8. Verify: close only with a test or repeatable check that failed before the fix and passes after. Seems fixed is not closed.
9. Keep reusable lessons in Memory and Learning through their normal lifecycle, not by editing this Skill.

## Alat yang dideklarasikan (bukan izin)

## Manfaat yang diharapkan; belum diukur
Incidents end with a verified fix, an honest timeline and a runbook instead of a vague note. Not measured; an expectation until incidents handled with it are reviewed.

## Bukti dan pengalaman asal
Task sumber: ext-3d1852634c8149468a39c6dbe21b140a
Dukungan terverifikasi: 
Kegagalan: 
Historical/unknown: ext-3d1852634c8149468a39c6dbe21b140a

## Keterbatasan
Written for a single-owner local engineering setting; it does not cover on-call rotations or customer communication.
Cannot recover facts that were not logged; unknowns must stay marked as unknown.
Does not grant execution authority.

## Kebutuhan implementasi
A new Skill pack at runtime/skills/capability-packs/incident-postmortem/SKILL.md written through SkillService after an explicit user decision; a short reference with a postmortem template may be added under references/.

## Acceptance yang direncanakan
SKILL.md passes the strict parser and node scripts/verify/skill-pack-lint.mjs reports no error and a Non-triggers text not shared with other packs.
A postmortem drafted from a past incident contains the timeline, several contributing factors, impact and verified actions.
Activation happens only after a user decision recorded by the host for the exact revision.

## Keputusan dan asal otorisasi
approve / build-and-activate / controller-decision:799325f69573d68d774d6978d20770fc2cbaf0e701262ec24b1134581eb86b36 / trusted-controller: 59a9447b-06fc-4961-a533-1bdc03213222

## Riwayat revisi
