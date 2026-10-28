# Review calibration: certainty, threshold and false positives

Agent Core addition, not upstream text. Use it at "Categorize Findings": severity says how bad a finding would be, certainty says how sure you are that it is real. A review that lists every doubt buries the two findings that matter.

## Certainty score

Give each candidate finding a score before it reaches the report.

| Score | Meaning |
|---|---|
| 0 | Does not survive a second look, or the code already handles it. |
| 25 | Might be real; you could not confirm it. Or a style point the project has no rule for. |
| 50 | Real, but minor, rare, or unlikely to matter in practice. |
| 75 | Very likely real and it will be hit in normal use. You can name the input or state that triggers it. |
| 100 | Certain. You read the code path (or ran it) and the failure is concrete. |

Default reporting rule for a single reviewer (a starting calibration, not a measured one; adjust after you see what the author actually fixes):

- Report 75 and above as findings.
- Report 50 to 74 only as a one-line question, and only when the possible harm is data loss, security or a silent wrong result.
- Drop everything below 50. Do not park it in a "nits" list.

A finding without a failing scenario ("with this input, this line does that") cannot score above 50.

## Catalogue of false positives

Drop the candidate when it is one of these.

1. The problem existed before the change and the change does not touch or worsen it.
2. It looks like a bug, but tracing the call path shows the case cannot occur or is handled elsewhere.
3. A nitpick a senior reviewer would not raise.
4. The compiler, type checker, linter or CI already catches it. Do not duplicate tooling.
5. A general quality concern that no project rule requires.
6. The code carries an explicit lint or type ignore with a reason.
7. A deliberate functional change that matches the stated purpose of the change.
8. A line the change did not modify. It belongs to this review only if the change makes it newly wrong (a caller now passes a value the unchanged line cannot handle).

## Project rules

- Claim a rule violation only with the rule quoted from the instruction file (`AGENTS.md`, `CLAUDE.md`, a contributing guide). Check only instruction files whose folder contains the changed path or a parent of it.
- A rule written for authors of new code does not retroactively make old code a defect.

## Report format

One line per finding: location, the scenario, the fix, the score.

```text
src/jobs/retry.ts:48 [75] a 429 response with Retry-After: 0 loops without delay; clamp to a minimum of 1s
```

For a link into a hosted repository, use the full commit SHA, not a branch name or `HEAD`, so the link still points at the reviewed code later:
`https://github.com/<owner>/<repo>/blob/<full-sha>/<path>#L48-L52`.

If something is done well and specific (a test that pins an edge case, a boundary validated once), say so in one line. Do not pad.

## Windows commands

```powershell
# Only the changed lines of one file against the base
git diff --unified=0 main...HEAD -- src/jobs/retry.ts
# Who last touched the lines in question (to separate pre-existing from new)
git blame -L 40,60 -- src/jobs/retry.ts
# Full SHA for links
git rev-parse HEAD
```

## Do not repeat or publish on your own

- Do not report again a point the author already addressed or a previous review already raised.
- Posting review comments to a pull request is a publication. Draft them; post only after the user approves.
