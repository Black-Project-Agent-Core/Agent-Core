# Runbooks and onboarding guides

Agent Core addition, not upstream text. The main Skill covers README, ADRs, changelogs and docs for agents. Two more document types are often needed and often written badly: the runbook (what to do when something breaks) and the onboarding guide (how a new person gets productive). Both are used under pressure or by someone with no context, so they are written for that reader.

## Runbook

One runbook per situation, not one per system. Each page answers, in order:

1. **Trigger.** The symptom or alert that sends the reader here, in the words they will see.
2. **Impact.** Who or what is affected, and how to tell how bad it is.
3. **First checks.** Three or fewer quick checks that separate the common causes, each with the exact command and the output that means "yes" or "no".
4. **Decision steps.** If A then do X; if B then do Y. A short branch list, not prose.
5. **Fix commands.** Exact commands, in the shell the reader uses (PowerShell on Windows), with the expected result after each.
6. **Rollback.** How to undo the fix if it makes things worse.
7. **Escalation.** Who or what to try next, and what to hand over (logs, times, what was already tried).
8. **Last verified.** The date someone actually followed the steps, and on which version.

Rules:

- Write commands so they can be pasted. A command that needs editing says what to replace, in angle brackets.
- Do not put secrets in a runbook. Say where the credential lives and how to request access.
- A runbook that was never run is a draft. Say so at the top until someone has followed it.
- After an incident, update the runbook that failed the reader. A postmortem that changes nothing in the runbooks changes nothing.

```text
Runbook: the background service is not answering on port 8765
Trigger: health check fails; the client reports connection refused
First checks:
  1. Is the process running?   Get-Process -Name node -ErrorAction SilentlyContinue
  2. Is the port open?         Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue
Rollback: restart the previous release build
Last verified: <date> on <version>   (draft until someone has followed the steps)
```

(`-ErrorAction SilentlyContinue` is acceptable here because "no output" is the answer being tested. Say so beside the command.)

## Onboarding guide

For someone who has never seen the project. The goal is a working change on their machine on the first day.

1. **Prerequisites.** Tools and versions, with the command that shows the installed version.
2. **Setup in order.** Numbered steps; after each, a **verify** line that shows what success looks like. A step without a verify line is a guess.
3. **First task.** A small real change to make, so the reader exercises build, test and review once.
4. **Where things live.** A short map of directories and what each owns. Link to the maintained structure document rather than copying it.
5. **How to get help.** The single place to ask.
6. **Known failures.** The three setup errors that people actually hit, and their fixes.

## Link, do not duplicate

If the information has a home (an ADR, a spec, the code), link to it and say in one line why the reader should open it. Duplicated text drifts apart, and the reader cannot tell which copy is right. Keep one source and point to it.
