# windows-powershell-host

Nama: windows-powershell-host
Status: proposed
Aksi: create
Artifact: not-built
Workspace: agent-core
Artifact digest: unavailable
Target active digest: none
Proposal ID: skill-proposal:19487ee89fb79dee39f88d65ca0723b6
Revisi: sha256:3571326aeef21d47d438f64cf6037ccadccbae5552a70fd0b9a8df212ff2df0c
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
Task sumber: ext-3d1852634c8149468a39c6dbe21b140a
Dukungan terverifikasi: 
Kegagalan: 
Historical/unknown: ext-3d1852634c8149468a39c6dbe21b140a

## Keterbatasan
Describes Windows PowerShell 5.1 behavior; it is not a general shell tutorial and does not cover PowerShell 7 differences beyond the version note.
Exit-code meanings listed are examples, not a complete table; the tool's own documentation decides.
Does not grant execution authority; a Skill never widens tool grants.

## Kebutuhan implementasi
A new Skill pack at runtime/skills/capability-packs/windows-powershell-host/SKILL.md written through SkillService after an explicit user decision; body at most 8192 bytes with ## Triggers and ## Non-triggers; examples in PowerShell only.

## Acceptance yang direncanakan
SKILL.md passes the strict parser and node scripts/verify/skill-pack-lint.mjs reports no error and a Non-triggers text not shared with other packs.
npm run verify:skill-routing still routes the existing packs the same way after the Skill is added.
Activation happens only after a user decision recorded by the host for the exact revision.

## Keputusan pengguna
Belum ada keputusan atas revisi ini.

## Riwayat revisi
