---
name: windows-powershell-host
description: "Use before running or writing a shell command or script on this Windows PowerShell 5.1 host, and when a command result looks wrong: a non-zero exit code that may be a success, garbled text, a hang that waits for input, or a path that exists but cannot be opened."
compatibility: "Agent Core adapter: existing grants and available tools; Windows PowerShell 5.1 examples only."
---
# Windows PowerShell host

A short checklist of host hazards that make a command look failed or wrong when it is not, or look fine when it is not. Read the relevant step before you trust a command result or write a script for this machine. It is a checklist, not a shell tutorial.

## Triggers

- Running or writing a shell command or script on this Windows host through `start_process` or a terminal.
- A command result looks wrong: a non-zero exit code from a tool that reports differences, garbled text, a command that hangs waiting for input, or a path that exists but cannot be opened.
- Reading or rewriting a text file whose encoding is not known.

## Non-triggers

- Choose `debugging-and-error-recovery` when the question is why code misbehaves, not why a command or its output looks odd.
- Choose `ci-cd-and-automation` when the command runs inside a pipeline on another runner.
- Choose `git-workflow-and-versioning` when the problem is history, branches or commits.
- Linux, macOS or container shell questions where no Windows host is involved.

## Workflow

1. **Exit codes carry meaning.** A native command's exit code is its answer, not always a failure: `robocopy` 0 to 7 is success and 8 or more is failure, `fc.exe` and `git diff --exit-code` return 1 for "different", `findstr` returns 1 for "no match". PowerShell does not stop on a non-zero native exit code, so read `$LASTEXITCODE` straight after the command; the next native command overwrites it. Read the tool's own meaning before you retry.
   ```powershell
   robocopy .\src .\dst /E
   if ($LASTEXITCODE -ge 8) { throw "robocopy failed with $LASTEXITCODE" }
   ```
2. **Encoding.** In Windows PowerShell 5.1, `>` and `Out-File` write UTF-16 LE by default, `-Encoding utf8` writes UTF-8 **with** a byte order mark, and `Get-Content` reads a file without a mark as the ANSI code page. Check the first bytes of a file you did not create before rewriting it, and never rewrite a file whose encoding you did not detect. To write UTF-8 without a mark, use .NET.
   ```powershell
   [IO.File]::ReadAllBytes($path)[0..3]                       # EF BB BF = UTF-8 mark, FF FE = UTF-16 LE
   Get-Content -LiteralPath $path -Encoding utf8              # read UTF-8 explicitly
   [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding($false)))   # UTF-8, no mark
   ```
   Keep the file's existing line endings (LF or CRLF) unless asked to change them.
3. **Quoting.** A single-quoted string is literal; a double-quoted string expands `$name` and the backtick. Call a program whose path has spaces with `&`, and pass each argument as its own token, not one long string.
   ```powershell
   & 'C:\Program Files\Tool\tool.exe' --name 'My Folder' --flag
   ```
4. **Stdin and prompts.** A command that prompts waits forever when nothing can answer. Add the tool's non-interactive flag (`-y`, `--yes`, `-Confirm:$false`, `git --no-pager`) and put a limit on the wait.
   ```powershell
   $p = Start-Process -FilePath $exe -ArgumentList $argList -PassThru -NoNewWindow
   if (-not $p.WaitForExit(60000)) { 'timed out after 60 s; the process is still running' }
   ```
5. **Paths.** Expect paths over 260 characters, OneDrive online-only placeholders that are not local yet, read-only attributes, files locked by another process, and names that differ only in case. Use `-LiteralPath` for names that contain `[` or `]`, and test before you assume a file is absent.
   ```powershell
   Test-Path -LiteralPath 'C:\data\report[1].txt'
   ```
6. **Finding a program.** A tool installed a moment ago may be missing from `PATH` in a process that is already running. One failed lookup is not proof it is missing.
   ```powershell
   (Get-Command tool -ErrorAction SilentlyContinue).Source
   $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
   ```
7. **Version limits.** Windows PowerShell 5.1 has no `&&` or `||`, no ternary `?:`, no `??`, and no `-AsHashtable` on `ConvertFrom-Json`. Use separate statements with a `$LASTEXITCODE` check, or say that PowerShell 7 (`pwsh`) is required.
8. **Evidence.** Report the exact command, its exit code and the shortest decisive line of output. A summary of the output is not evidence of what the command did.

## Tools used

| Tool | Why | Tier |
|---|---|---|
| `start_process` | run the command | runs a process |
| `read_process_output` | read the output of a long command | read-only |
| `read_file` | check a file's bytes and encoding before editing | read-only |
| `write_file` | rewrite a file once its encoding is known | writes local files |

Declaring a tool here is not a grant. The user's grants and confirmations still decide what may run.

## Verification

After a fix, repeat the check that exposed the wrong conclusion and quote the result: the exit code with its meaning, the first bytes of the file (`EF BB BF` or `FF FE` or neither), or the command finishing inside its limit. If you cannot repeat the check, say the fix is unverified.
