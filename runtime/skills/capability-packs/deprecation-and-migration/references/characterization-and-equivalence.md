# Characterization and equivalence tests

Agent Core addition, not upstream text. Use it when behavior must stay the same while the code changes: migration, rewrite, refactor of untested code, replacing a library. The old code is the oracle. The question is "does the new code do what the old code does", not "does it match the spec".

## Rules

1. **Pin what the code does, not what it should do.** If the old code returns 19.27 where the spec says 19.28, the characterization test expects 19.27. Record the discrepancy separately; do not quietly fix it inside the migration.
2. **Concrete inputs and literal outputs.** A test states the input and the exact expected output, not a computed expression that repeats the implementation.
3. **Name the rule each test pins.** An id or a one-line description in the test name, so a failure says which behavior broke.
4. **A comparison that cannot run is a failure.** If the old implementation, fixture or tool is unavailable, the test fails with that reason. It never skips and never passes.
5. **Report the executed count.** "41 cases executed" tells more than "all green". Zero executed is a failure.
6. **Show the tests can fail (canary).** Break one line of the new code in a scratch copy, run, and see red. Restore. A suite that stays green after a deliberate break proves nothing.
7. **Mask only what legitimately varies.** Timestamps, generated ids, temp paths. Use a narrow pattern per field, not a blanket mask that hides real differences.
8. **Tolerances need a written reason.** A numeric tolerance (for example 1e-6 absolute) is allowed for floating point; write why, keep it small, and list it in the report.
9. **Accepted differences are a human decision.** A difference is accepted only when the user approves it with a reason, and the accepted list stays in the report.
10. **Fresh inputs.** After the suite is green, run at least ten inputs that were not used to design the tests. Add malformed input only when the old code's handling of bad input is part of the behavior you must keep.

## Comparing outputs on Windows

```powershell
# Byte comparison of two output files
fc.exe /b old.out new.out
# Same via hash
(Get-FileHash old.out -Algorithm SHA256).Hash -eq (Get-FileHash new.out -Algorithm SHA256).Hash
# Line-level diff
Compare-Object (Get-Content old.out) (Get-Content new.out)
```

`Compare-Object` prints nothing when the two are equal. Check that both files exist and are non-empty first: an empty comparison of two empty or missing outputs is not evidence of equality. Mind encoding: PowerShell 5.1 writes UTF-16 with `>`; use `Out-File -Encoding utf8` or `Set-Content -Encoding utf8` so both sides use the same bytes.

## Flow

1. Run the old code over a set of inputs; save inputs and outputs (the golden files).
2. Write tests that load the golden files and assert the new code produces the same output.
3. Run them against the **old** code first. They must pass there, or the harness is wrong.
4. Migrate. Run again. Executed count must equal the case count.
5. Run the canary and the fresh inputs.
6. Write the verdict the way the `code-review-and-quality` Skill's `verification-verdict.md` reference describes: counted evidence, listed gaps, "what this does not prove".

## Output

```text
Cases executed: 41 of 41   Failed: 0   Skipped: 0
Canary: broke src/price.ts:30, 6 tests failed, restored
Fresh inputs: 12 run, 0 differences
Accepted differences: 1 (rounding at .005, approved by user)
Not proven: behavior for inputs outside the recorded set; performance.
```
