# Test strategy by kind of component

Agent Core addition, not upstream text. The main Skill describes the red, green, refactor loop. This file answers a different question: for this kind of code, which tests are worth writing, and which are not. Use it when planning tests for a new area, or when asked for a testing strategy.

## Strategy table

| Component | Test first | Typical gaps |
|---|---|---|
| Pure function | Input and output table: normal, boundary, empty, invalid | Floating point, locale, very large inputs |
| Data pipeline or batch job | Same input twice gives the same result (idempotence); partial failure leaves no half-written output; schema drift is rejected loudly | Re-run after a crash, duplicate input, ordering, empty input |
| Stateful service | State transitions, including illegal ones; restart with existing state | Concurrent calls, stale cache, corrupted state file |
| API handler | Contract: status, shape, error body; authorization both ways (allowed and denied) | Missing field, wrong type, oversized body, replay |
| UI component | Behavior as the user sees it (role, label, text), not the DOM structure | Keyboard use, empty and error states, narrow screens |
| Command-line tool or script | Exit code per outcome, output to the right stream, closed stdin, paths with spaces | Windows quoting, long paths, no write permission |
| Infrastructure or configuration | Dry-run or plan output reviewed; validation of the config against its schema | Rollback path, partial apply, secrets absent |
| Integration with a third party | Contract test against recorded real responses; failure and timeout paths | Rate limit, changed response shape, expired credential |

## What to leave out

- Trivial getters and setters, and code with no logic.
- Framework boilerplate and generated code.
- Behavior owned by a third-party library (test your use of it, not the library).
- A second test that asserts the same behavior through a different door.

Leaving something out is a decision; say it in one line so a reviewer does not read it as an oversight.

## Choose by risk

Order the work by the harm of being wrong: data loss and security first, then wrong results, then availability, then cosmetics. A small number of tests on the dangerous paths beats uniform coverage.

## Check that the test can fail

A test you have never seen fail has not shown it can. After it passes, break the production line it targets in a scratch copy and confirm it turns red, then restore. For behavior-preserving work on code without tests, write tests that pin current behavior first; the `deprecation-and-migration` Skill describes characterization tests in its `characterization-and-equivalence.md` reference.

## Output

When the user asks for a strategy, give a short plan, not a wall of cases:

```text
Component: batch importer (reads CSV, writes DB)
Test first: idempotence (run twice, same rows); half-written output after a mid-run failure; malformed row rejected with line number
Skip: the CSV library's own parsing
Gaps accepted: very large files (not tested here)
```
