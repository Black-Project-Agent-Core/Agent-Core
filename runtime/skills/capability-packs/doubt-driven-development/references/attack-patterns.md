# Attack patterns for adversarial review

Agent Core addition, not upstream text. Use it in the DOUBT step, when a fresh-context reviewer (a separate prompt, a separate pass, or the user) tries to break a claim about code. Each pattern is a way a plausible claim fails while looking correct.

## Patterns

1. **Re-derive the cited requirement.** The claim quotes an API rule, a spec clause or a documentation sentence. Do not trust the quote. Read the source again from the start, and check that the quoted words say what the claim needs, including the conditions around them.
2. **The first interesting case is never reached.** A test passes, but every input it uses is degenerate (empty list, single element, zero, the default). Find the first non-degenerate case and check that the test actually goes there.
3. **Circular fix.** The fix works only if the thing it should establish is already true, or it moves the failure elsewhere and the original symptom disappears from the test, not from the system. Ask what would happen if the premise were false.
4. **Proxy object.** The bottleneck, the bug or the lock is blamed on the object in view, but that object is a wrapper, a mock, a cached copy or a view. Check the object it stands for.
5. **Silent generalization.** The evidence covers one case (one platform, one input size, one locale, one tenant) and the claim is written for all. Find the sentence where "this case" became "every case" and cut it back to what was shown.
6. **Evidence of absence from a slice.** "No callers found" from a search with a result cap, a stale index or a pattern that cannot match the real spelling. Ask how the search could have missed.
7. **Passing for the wrong reason.** The test would pass with the feature removed. Remove or break the feature in a scratch copy and look.
8. **Environment coincidence.** It works because of something local: an environment variable, a file left by an earlier run, the current directory, the machine's locale, admin rights.

## Blind reviewers

- A reviewer receives only the **artifact** (code, diff, claim) and the **contract** (what it must satisfy), not the author's reasoning, not the history of attempts.
- When more than one reviewer looks at the same thing, each is blind to the others' verdicts. Compare after all are in. A reviewer who has seen another verdict tends to agree with it.
- A single Controller cannot be a truly independent second reviewer. State that limit in the result. Use a fresh prompt built from artifact and contract only, ask the user, or call a partner explicitly where the contract allows it. Do not claim independent review for a self-review.
- Do not build voting or early-exit machinery for this. It is a practice, not a runtime.

## Mark gaps inline

Where a step is asserted but not shown, mark it in the text, for example:

```text
The cache is invalidated on write [GAP: no test or read of the write path was done].
```

A conclusion with unmarked gaps reads as stronger than it is. Count the markers in the result.

## Abstain when you must

If the evidence does not support a confident answer, say so in a fixed form instead of guessing:

```text
NO CONFIDENT RESULT
Checked: <what was examined, with paths>
Missing: <what would be needed to decide>
Best current guess: <one line, labelled as a guess> (optional)
```

An honest abstention costs a few minutes. A confident wrong answer costs the next three tasks built on it.
