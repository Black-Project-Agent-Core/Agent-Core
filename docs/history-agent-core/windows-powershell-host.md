# windows-powershell-host

Nama: windows-powershell-host
Status: COMPLETED
Aksi: revise
Artifact: catalog-active
Workspace: agent-core
Artifact digest: sha256:2643be829c6590d5cd704742c07aa68ead6b3fd898bab68309de11a1515e0288
Target active digest: sha256:e29336f818de17f65bf968a54eaf2211165feae47677e346ca37ec856babdadb
Proposal ID: skill-proposal:19487ee89fb79dee39f88d65ca0723b6
Revisi: sha256:507605b6cad774b2ff846af9dbd6e6b4a9ac10af6132326a3c803bfc4bf587bc
Kualifikasi bukti: awaiting-verification
Berkas ini adalah proposal, bukan instruksi aktif atau izin eksekusi.

## Tujuan
Give an agent a short checklist of the Windows PowerShell 5.1 host hazards that make commands look failed or wrong when they are not, before it reads a command result or writes a script for this machine.

## Trigger
Running or writing a shell command or script on the Windows host through Agent Core start_process or a terminal.
A command result looks wrong: a non-zero exit code on a tool that reports differences, garbled text, a hang that waits for input, or a path that exists but cannot be opened.
Reading or rewriting a text file whose encoding is not known.

## Non-trigger
Work that never runs a command on the host, such as editing source through the file tools.
Linux, macOS or container shell questions where no Windows host is involved.
A shared keyword such as PowerShell in a document that is only being summarized.

## Workflow
1. Exit codes: treat a non-zero exit code as information, not failure, for tools that use it to report a result (robocopy 0-7 are success, fc.exe and git diff --exit-code return 1 for differences, findstr returns 1 for no match). Read the tool's own meaning before retrying.
2. Encoding: Windows PowerShell 5.1 writes UTF-16LE for redirection (>) and Out-File by default and reads BOM-less files as the ANSI code page. Use Set-Content/Out-File -Encoding utf8 explicitly, check the first bytes of an unknown file, and never rewrite a file whose encoding you did not detect.
3. Quoting: in PowerShell a single-quoted string is literal and a double-quoted string expands $ and backtick. Pass an argument that contains spaces or quotes as its own array element or with the call operator &, and put a native command's arguments after --% only when nothing needs expanding.
4. Stdin: a command that prompts waits forever on a closed or non-interactive stdin. Add the tool's non-interactive flag (-y, --yes, -Confirm:$false, --no-pager) or close stdin, and set a timeout instead of waiting.
5. Paths: expect long paths over 260 characters, OneDrive placeholder files that are not local yet, read-only attributes, files locked by another process, and names that differ only by case. Use -LiteralPath for names that contain [ ] and test with Test-Path before assuming absence.
6. Executable lookup: a freshly installed tool may not be on PATH in an already running process. Check (Get-Command name).Source, and call the full path when the lookup fails; do not conclude the tool is missing from one failed lookup.
7. Version limits: Windows PowerShell 5.1 has no && or || chaining, no ternary or null-coalescing operators and no -AsHashtable on ConvertFrom-Json. Use separate statements with $LASTEXITCODE checks, or state that PowerShell 7 is required.
8. Evidence: report the exact command, the exit code and the shortest decisive output line; a summary of the output is not evidence of what the command did.

## Alat yang dideklarasikan (bukan izin)

## Manfaat yang diharapkan; belum diukur
Fewer wrong conclusions from commands on this host: agents stop retrying commands whose non-zero exit code was a success and stop corrupting files by rewriting them in the wrong encoding. Not measured; the benefit is an expectation until tasks that used the Skill are reviewed.

## Bukti dan pengalaman asal
Task sumber: ext-3d1852634c8149468a39c6dbe21b140a, ext-aa70e0f96b594d38814d24222f66b0af
Dukungan terverifikasi: 
Kegagalan: 
Historical/unknown: ext-3d1852634c8149468a39c6dbe21b140a, ext-aa70e0f96b594d38814d24222f66b0af

## Keterbatasan
Describes Windows PowerShell 5.1 behavior; it is not a general shell tutorial and does not cover PowerShell 7 differences beyond the version note.
Exit-code meanings listed are examples, not a complete table; the tool's own documentation decides.
Does not grant execution authority; a Skill never widens tool grants.

## Kebutuhan implementasi
A new Skill pack at runtime/skills/capability-packs/windows-powershell-host/SKILL.md written through SkillService after an explicit user decision; body at most 8192 bytes with ## Triggers and ## Non-triggers; examples in PowerShell only. Reconcile the existing active pack as an exact revision through SkillService, preserving packaged references and rollback history.

## Acceptance yang direncanakan
SKILL.md passes the strict parser and node scripts/verify/skill-pack-lint.mjs reports no error and a Non-triggers text not shared with other packs.
npm run verify:skill-routing still routes the existing packs the same way after the Skill is added.
Activation happens only after a user decision recorded by the host for the exact revision.

## Keputusan dan asal otorisasi
approve / build-and-activate / controller-decision:20d300edc47d2a01bbf390e1402ecfdaad5785fcc4ab6303d924a1de6ca38e8e / trusted-controller: 59a9447b-06fc-4961-a533-1bdc03213222

## Penyelesaian scope yang disetujui
Tanggal selesai: 2026-10-28
State canonical tetap: approved / catalog-active. Status COMPLETED di dokumen ini hanya status penyelesaian proyeksi manusia-baca.
Revisi final: sha256:507605b6cad774b2ff846af9dbd6e6b4a9ac10af6132326a3c803bfc4bf587bc
Artifact aktif terverifikasi: sha256:2643be829c6590d5cd704742c07aa68ead6b3fd898bab68309de11a1515e0288

Revisi create menjadi revise direkonsiliasi terhadap baseline e29336f8…; keputusan revisi lama tetap historis, keputusan controller baru terikat revisi di atas. Baseline dan rollback tersedia; allowedTools=[]. Discovery membaca 3 trigger/3 non-trigger berbeda dan pencarian positif menempatkannya di peringkat 1.

Ketiga paket lulus validasi strict; 48 tes regresi gabungan lulus. Lint katalog 46 paket melaporkan 0 galat parse/nama. Renderer memakai Trigger/Non-trigger singular yang sah menurut discovery owner; catatan linter plural dan metadata lokal dipertahankan sebagai keterbatasan, bukan disembunyikan. Tidak ada grant baru. Manfaat belum diukur; rollback produksi tidak dijalankan.

Bukti: [laporan implementasi, keputusan, validasi dan review Native](../verification/native-chat-reasoning-effort.md).
Path asal: docs/proposals/skills/agent-core/windows-powershell-host.md
Path arsip: docs/history-agent-core/windows-powershell-host.md
Proyeksi ini diarsip setelah finalisasi Learning. Record canonical, keputusan dan katalog aktif tidak dipindahkan.

## Riwayat revisi
sha256:3571326aeef21d47d438f64cf6037ccadccbae5552a70fd0b9a8df212ff2df0c / approved / 2026-10-28T14:12:13.148Z
