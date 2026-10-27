# mind-control-upgrade

> **COMPLETED — 2026-10-27 (Asia/Bangkok).** Permintaan pengguna dalam chat Codex ini: tuntaskan upgrade proposal ini dan periksa/perbaiki error Learning bila bug. Scope A/B/C/D selesai sebagai adapter 10. Bagian facade di bawah dipertahankan sebagai snapshot owner; status `implemented/catalog-active` bukan bukti keputusan Native yang direkayasa.

## Penyelesaian dan acceptance final

| Persyaratan | Bukti aktual |
| --- | --- |
| A/B: body ringkas, satu gate dan referensi ilmiah terpisah | Entrypoint 7.689 byte; delapan bagian lama byte-identik di scientific_appraisal; 13 referensi dan LICENSE tetap. |
| Satu fragment default-budget | Read resident digest final, respons 8.106 byte dalam budget 8.192; offset 0, nextOffset null, truncated false. |
| C: proporsionalitas dan catatan | T0/T1/T2, enam field berurutan, contoh debugging dan tujuh langkah rekonstruksi tetap; Raka audit semantik. |
| D: tiga kasus dan perbandingan lama | Baseline r8 versus kandidat r9 dipertahankan; raw diperiksa ulang. Regresi kandidat r10: 12/12 substansi dan 3/3 format. Token provider unavailable; estimasi byte dan waktu dilaporkan terpisah. |
| Discovery dan dua tes existing | String trigger/non-trigger identik, applicability declared; dua file tes existing tidak diedit dalam task ini dan lulus bersama regresi baru. |
| Aktivasi dan registry | SkillService validate/stage/promote, fresh descriptor dan read resident cocok; registry implemented/catalog-active terikat origin-proposal metadata. |
| Learning error | Clone call menghilangkan workspace; penolakan benar. Bug pesan generik diperbaiki dengan bounded cause/recovery, tanpa melemahkan scope. Live workspace-required mempertahankan episode aktif. |
| Verifikasi dan aktivasi kode | 56/56 tes terarah, build lulus, satu restart resmi exit 0, health ok, build tidak stale. |
| Learning | Checkpoint task ini diterima dan review selesai no-new-knowledge pada 2026-10-26T20:19:25.876Z. |

Digest aktif: `sha256:4c4649bf58044de3d3ccabd1ed6906afa8cd61612b400d7667a7487c5f19af04` (16 file, 184.747 byte). Proposal revision: `sha256:1859227f7f555daa339994b583c3e25567e4225cd1d766f5e116ab930c6be900`. Rollback langsung: `sha256:15553bddf5b1bad3fee25d0655bb2217ed678dc135d8f897f7b90f39ef33346a` melalui skills rollback lifecycle, bukan edit catalog.

[Bukti resident dan Learning](mind-control-upgrade-evidence.json), [audit byte/rujukan](../../runtime/build/mind-control-cd-20261026/completion-measurements.json), [56 tes](../../runtime/build/mind-control-cd-20261026/completion-targeted-tests.json), [evaluasi](../../runtime/skills/capability-packs/mind-control/evals/report.md), [diagnosis Learning](../Learning-External-Scope-Recovery.md), [riwayat dampak](Mind-Control-Upgrade-Dampak.md).

Keterbatasan: benchmark lama dan regresi reused-agent r10 dibedakan; hasil tidak membuktikan manfaat reasoning umum, causal, Native-provider atau latency. Tidak ada dependency baru, commit/push atau release apply. Sumber Skill tetap di rumah canonical runtime/skills/capability-packs. Source runtime yang diubah hanya diagnostik episode/start; perubahan lokal lain dipertahankan.

Path asal: `docs/proposals/skills/agent-core/mind-control-upgrade.md`. Path arsip: `docs/history-agent-core/mind-control-upgrade.md`. Publikasi dan review Learning diselesaikan sebelum arsip; canonical proposal/revision/catalog tetap milik owner existing. Episode: `ext-92fc11fb47044a58905e11bdb48c82e0`.

## Snapshot facade setelah rekonsiliasi

Nama: mind-control-upgrade
Status: implemented
Aksi: revise
Artifact: catalog-active
Workspace: agent-core
Artifact digest: sha256:4c4649bf58044de3d3ccabd1ed6906afa8cd61612b400d7667a7487c5f19af04
Target active digest: sha256:15553bddf5b1bad3fee25d0655bb2217ed678dc135d8f897f7b90f39ef33346a
Proposal ID: skill-proposal:a9a893d32b83c0aa4fc8130cb378ae42
Revisi: sha256:1859227f7f555daa339994b583c3e25567e4225cd1d766f5e116ab930c6be900
Kualifikasi bukti: awaiting-verification
Proposal ini telah dipenuhi oleh artifact aktif yang provenance-nya cocok; catatan ini bukan izin eksekusi tambahan.

## Tujuan
Revise the active mind-control Skill (adapter revision 7) so its SKILL.md body carries only the Agent Core reasoning procedure for coding and judgment tasks, moves the upstream scientific-paper appraisal text to a reference file, removes contradictory and non-applicable sections, and adds proportionality tiers plus a compact reasoning-record format. The body is read in full on every coding task by both controllers, so its size and consistency are the main levers.

## Trigger
Every coding task
Any other task that needs reasoning, judgment, inference, tradeoffs, planning, debugging, evidence assessment or uncertainty handling

## Non-trigger
Only non-coding work that is routine, mechanical, deterministic and requires no reasoning or judgment

## Workflow
1. Package A: move Overview, When to Use, Appraisal Workflow, Core Capabilities, Application Guidelines, Remember, Visual Aids and Citing sections from SKILL.md to references/scientific_appraisal.md with the K-Dense attribution kept; body target under 8 KB so one skills(read) fragment of 8192 bytes delivers it
2. Package B: keep one trigger definition (frontmatter description plus Triggers and Non-triggers headings), delete the upstream sentences that restrict the skill to scientific claims, drop the scientific-schematics/OpenRouter command and the arXiv citation instruction from the body
3. Package C: add proportionality tiers T0 quick check, T1 written claim-evidence-flip record, T2 full argument reconstruction chosen by stakes and reversibility, and a six-line reasoning record format usable in Native strategy/hypothesis and external learning(decision)
4. Package D: add evals with three coding prompts and graders, run with-skill versus old-skill through subagents, and report pass rate, tokens and time before promotion
5. Stage with skills(action=stage_revision) from runtime/skills/capability-packs/mind-control, verify tests/capability-pack-indexing.test.ts and tests/external-skill-guidance.test.ts, promote, confirm the new digest in a fresh handshake descriptor, update CODEBASE.md, Capability-Index.md and External-Engineering-Skills.md

## Alat yang dideklarasikan (bukan izin)

## Manfaat yang diharapkan; belum diukur
Entrypoint reduced from original revision 7 (21,993 bytes) and revision 9 (10,220 bytes) to a complete single-response guide under the default 8,192-byte serialized read budget, retaining packages A/B/C/D. Three-case historical baseline/candidate results distinguish substance from record compliance; general reasoning-quality, Native-provider and latency benefits are not established.

## Bukti dan pengalaman asal
Task sumber: ext-400d88fe13f1479fb4bdde7ccbb9ea19, ext-92fc11fb47044a58905e11bdb48c82e0
Dukungan terverifikasi: 
Kegagalan: 
Historical/unknown: ext-400d88fe13f1479fb4bdde7ccbb9ea19, ext-92fc11fb47044a58905e11bdb48c82e0
file:bundled-skills/capability-packs/mind-control/SKILL.md
file:docs/research/Always-On-Text-Budget-Phase0-20261026.md
file:runtime/skills/capability-packs/mind-control/SKILL.md
file:runtime/skills/capability-packs/mind-control/evals/report.md
file:src/skills/discovery.ts
file:tests/capability-pack-indexing.test.ts
file:tests/mind-control-upgrade.test.ts
source:codex-thread:01a179cf-3fc3-71b3-87ca-2dc29f1517ce:user-complete-upgrade

## Keterbatasan
Token figures use ceil(bytes/4), not a provider tokenizer
Evals measure Claude subagent behavior, not Native provider behavior
Upstream K-Dense newer versions were not checked (no network in this task)
Moving text changes the active digest; every cached descriptor must be re-read
Provider tokens are unavailable; UTF-8 byte/4 estimates exclude host/system/wrapper/tool overhead. Revision-10 reused-agent acceptance is a regression check, not a fresh blinded causal comparison.
Original proposal locator bundled-skills is historical; canonical source remains runtime/skills/capability-packs.

## Kebutuhan implementasi
Complete the same user-authorized A/B/C/D scope as adapter revision 10 at runtime/skills/capability-packs/mind-control, preserving all 13 references, LICENSE and discovery boundaries; retain the three-case evaluation evidence, enforce full default-budget delivery with SkillService, stage/promote through the existing owner with proposal provenance, verify resident digest/readback and reconcile the existing proposal. Revision 9 remains rollback history; no new tool grants or claimed Native quality benefit.

## Acceptance yang direncanakan
SKILL.md body under 8,192 bytes and delivered in one read fragment at the new active digest
Both existing tests pass unchanged
Discovery applicability remains declared with the same trigger and non-trigger strings
No upstream reference file changed; the moved text is byte-identical in the new reference
Eval benchmark exists for three cases with with-skill versus old-skill results recorded

## Keputusan pengguna

## Pemenuhan proposal
active-artifact-reconciliation / sha256:4c4649bf58044de3d3ccabd1ed6906afa8cd61612b400d7667a7487c5f19af04 / source:active-skill-provenance:mind-control:sha256:4c4649bf58044de3d3ccabd1ed6906afa8cd61612b400d7667a7487c5f19af04 / 2026-10-26T20:15:23.922Z

## Riwayat revisi
sha256:1f797909c08ca3af7d77e70c7449d27baf91a864c0d58ecc6d8ff404e064087f / notified / 2026-10-26T15:26:53.420Z
