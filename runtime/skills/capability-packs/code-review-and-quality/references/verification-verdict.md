# Verification verdict: PROVEN, PARTLY PROVEN, NOT PROVEN

Agent Core addition, not upstream text. Use it at "Verify the Verification" and whenever you are about to write "tests pass". The verdict follows from counted evidence. It is not an impression, and it is never raised by wording.

## Rules

1. **Executed counts, not claims.** A number typed into a note is not evidence. Evidence, best first: a result file the runner wrote (JSON report, JUnit XML); the runner's own log containing its summary line; numbers pasted by hand, which never suffice alone.
2. **Zero executed is not a pass.** If nothing ran, nothing is proven.
3. **All skipped is not a pass.** A skipped check is reported as skipped, never counted as green.
4. **A log without a summary line is no evidence.** A truncated or interrupted run proves nothing about the tests that did not finish.
5. **Stale results are not evidence.** If a result file is older than the code it covers, it describes a previous state. Run again.
6. **A comparison that cannot run is a failure,** not a skip. If the oracle, fixture or tool is missing, say so and count it as failed.
7. **Never carry an old verdict forward.** Each verification starts from the evidence of this run.
8. **Fresh edits reset the claim.** A verdict applies to the revision it was computed on; state that revision.

## Definitions

- **fail:** the evidence contradicts the claim, or a required check could not run.
- **gap:** the evidence is absent or too weak to decide; nothing contradicts the claim.

## Computing it

```text
any fail          -> NOT PROVEN
no fail, any gap  -> PARTLY PROVEN
no fail, no gap   -> PROVEN
```

The script `scripts/verify/test-run-evidence.mjs` does this for test runs, so you do not decide it by reading output:

```powershell
npx vitest run --reporter=json --outputFile=runtime/tmp/last-run.json
node scripts/verify/test-run-evidence.mjs runtime/tmp/last-run.json --code src/skills
```

It exits non-zero for NOT PROVEN (nothing executed, everything skipped, a failure, or a result older than the code). Use `--self-check` to confirm the script itself still refuses a bad input. The same reasoning applies to claims the script does not cover (a manual check, a build): decide fail and gap from what was observed.

## What this does not prove

End every verification report with a short block that names what the verdict does not cover. Examples:

- Only the listed test files ran; other suites were not run.
- The tests ran against the working tree, not against a clean checkout.
- Behavior on Windows paths or in the packaged app was not exercised.
- A passing test shows the code does what the test says, not that the test says the right thing.

```text
Verdict: PARTLY PROVEN (revision a1b2c3d)
Executed: 41   Passed: 41   Failed: 0   Skipped: 0   Result age: 3 min
Gap: no test exercises the retry path.
Not proven: behavior under a real network failure; the Windows installer.
```

A report that lists no limits is a report that did not look for any.
