# skill-authoring

Nama: skill-authoring
Status: proposed
Aksi: create
Artifact: not-built
Workspace: agent-core
Artifact digest: unavailable
Target active digest: none
Proposal ID: skill-proposal:ab8a33dc82c46145598a3bfdebf05609
Revisi: sha256:913088e3838463ecc57e8f6f7b1dbff425cd80fa4fd4b9e2079dc4f96cb15583
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
Task sumber: ext-3d1852634c8149468a39c6dbe21b140a
Dukungan terverifikasi: 
Kegagalan: 
Historical/unknown: ext-3d1852634c8149468a39c6dbe21b140a

## Keterbatasan
Reflects the current strict-subset parser and the 8192-byte page size; if those change the Skill must be revised.
Does not judge whether a Skill is worth having; that remains the owner's decision.
Does not grant execution authority.

## Kebutuhan implementasi
A new Skill pack at runtime/skills/capability-packs/skill-authoring/SKILL.md plus references/intake-review.md, written through SkillService after an explicit user decision.

## Acceptance yang direncanakan
SKILL.md and its reference pass the strict parser and node scripts/verify/skill-pack-lint.mjs reports no error and no shared Non-triggers text.
A Skill drafted by following it passes skills(validate) without correction.
Activation happens only after a user decision recorded by the host for the exact revision.

## Keputusan pengguna
Belum ada keputusan atas revisi ini.

## Riwayat revisi
