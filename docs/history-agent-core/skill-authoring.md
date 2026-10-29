# skill-authoring

Nama: skill-authoring
Status: COMPLETED
Aksi: revise
Artifact: catalog-active
Workspace: agent-core
Artifact digest: sha256:20fca6f619dee5b52f5996aae45c310518b92b41aeafeb4f4a5e9d827a293c1b
Target active digest: sha256:01ffebbec6bfe8e359180da66f73a50380fb69e2aa8756782331dceb99121640
Proposal ID: skill-proposal:ab8a33dc82c46145598a3bfdebf05609
Revisi: sha256:077dd1a3de86e73df9e4c13059a8a9a3124331b5964c0d3f2d7d2b9b80e5aea2
Kualifikasi bukti: awaiting-verification
Berkas ini adalah proposal, bukan instruksi aktif atau izin eksekusi.

## Tujuan
Write or import a Skill for Agent Core so that it passes the strict parser, routes to the right tasks, stays inside the size and disclosure rules, and never claims authority it does not have.

## Trigger
Writing a new Skill or revising an existing one through skills propose or stage_revision.
Reviewing a Skill that was imported from another ecosystem before it is staged.
A Skill is loaded in the wrong tasks or is skipped in the right ones and its text must be fixed.

## Non-trigger
Using an existing Skill to do a task.
Writing ordinary documentation that is not read by an agent as instructions.
Packaging or exporting an already active Skill: use the existing render_export action.

## Workflow
1. Name and description: the name equals the folder, lowercase with hyphens; the description is one line without angle brackets that says when to use the Skill and when not to.
2. Size: keep SKILL.md at or under 8192 bytes. Put long material in references/*.md, each at or under 8192 bytes, and add one pointer line per reference in SKILL.md. Only references/ is readable through skills(read); a file placed beside SKILL.md or under scripts/ cannot be delivered to a model.
3. Routing: write ## Triggers and ## Non-triggers so that a sibling Skill is named where two overlap, in the form choose <sibling> when <signal>. Boilerplate Non-triggers shared with other Skills hide the difference the router needs.
4. Body: purpose, then numbered steps with one imperative action each, then a Tools used table (tool, why it is used, tier: read-only, writes local files, runs a process, or network) and a verification step that says how to know the work succeeded.
5. Windows: give command examples in PowerShell, not only in bash, and say when a step needs a tool that may be absent.
6. Authority: allowed-tools is a declaration, never a grant. Do not write steps that run scripts, send messages or install anything automatically; a Skill installation never widens a tool grant.
7. Imports: before staging an imported Skill, run the intake review in references/intake-review.md: license and attribution kept, no executable or network use that the task does not need, no instruction that contradicts Agent Core rules, no dangling links, no description that collides with a sibling. Keep upstream text untouched and put local changes in the adapter or reference layer.
8. Validate and submit: run node scripts/verify/skill-pack-lint.mjs and skills(validate), then submit through skills(propose) or stage_revision. Never write the catalog directly; activation needs the user's recorded decision for the exact revision.

## Alat yang dideklarasikan (bukan izin)

## Manfaat yang diharapkan; belum diukur
Skills that pass validation the first time, route to the right tasks and can be read in full by the model. Not measured; an expectation until Skills written with it are compared with earlier ones.

## Bukti dan pengalaman asal
Task sumber: ext-3d1852634c8149468a39c6dbe21b140a, ext-aa70e0f96b594d38814d24222f66b0af
Dukungan terverifikasi: 
Kegagalan: 
Historical/unknown: ext-3d1852634c8149468a39c6dbe21b140a, ext-aa70e0f96b594d38814d24222f66b0af

## Keterbatasan
Reflects the current strict-subset parser and the 8192-byte page size; if those change the Skill must be revised.
Does not judge whether a Skill is worth having; that remains the owner's decision.
Does not grant execution authority.

## Kebutuhan implementasi
A new Skill pack at runtime/skills/capability-packs/skill-authoring/SKILL.md plus references/intake-review.md, written through SkillService after an explicit user decision. Reconcile the existing active pack as an exact revision through SkillService, preserving packaged references and rollback history.

## Acceptance yang direncanakan
SKILL.md and its reference pass the strict parser and node scripts/verify/skill-pack-lint.mjs reports no error and no shared Non-triggers text.
A Skill drafted by following it passes skills(validate) without correction.
Activation happens only after a user decision recorded by the host for the exact revision.

## Keputusan dan asal otorisasi
approve / build-and-activate / controller-decision:ee2f780ef5cba8bbf05357befac01021345b04a4dffbd540ba2809a68386b496 / trusted-controller: 59a9447b-06fc-4961-a533-1bdc03213222

## Penyelesaian scope yang disetujui
Tanggal selesai: 2026-10-28
State canonical tetap: approved / catalog-active. Status COMPLETED di dokumen ini hanya status penyelesaian proyeksi manusia-baca.
Revisi final: sha256:077dd1a3de86e73df9e4c13059a8a9a3124331b5964c0d3f2d7d2b9b80e5aea2
Artifact aktif terverifikasi: sha256:20fca6f619dee5b52f5996aae45c310518b92b41aeafeb4f4a5e9d827a293c1b

Revisi create menjadi revise direkonsiliasi terhadap baseline 01ffebbe…; history/rollback dan seluruh 2555 byte references/intake-review.md dipertahankan. Setelah membaca instruksi aktif, draft inactive reasoning-transport-fixture (1270 byte) lulus skills(validate) pertama tanpa koreksi; draft tidak diaktifkan. allowedTools=[]; pencarian positif menempatkannya di peringkat 1.

Ketiga paket lulus validasi strict; 48 tes regresi gabungan lulus. Lint katalog 46 paket melaporkan 0 galat parse/nama. Renderer memakai Trigger/Non-trigger singular yang sah menurut discovery owner; catatan linter plural dan metadata lokal dipertahankan sebagai keterbatasan, bukan disembunyikan. Tidak ada grant baru. Manfaat belum diukur; rollback produksi tidak dijalankan.

Bukti: [laporan implementasi, keputusan, validasi dan review Native](../verification/native-chat-reasoning-effort.md).
Path asal: docs/proposals/skills/agent-core/skill-authoring.md
Path arsip: docs/history-agent-core/skill-authoring.md
Proyeksi ini diarsip setelah finalisasi Learning. Record canonical, keputusan dan katalog aktif tidak dipindahkan.

## Riwayat revisi
sha256:913088e3838463ecc57e8f6f7b1dbff425cd80fa4fd4b9e2079dc4f96cb15583 / notified / 2026-10-28T13:18:40.552Z
