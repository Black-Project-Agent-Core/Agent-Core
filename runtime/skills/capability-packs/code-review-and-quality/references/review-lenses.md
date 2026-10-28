# Specialist review lenses

Agent Core addition, not upstream text. A general pass finds general problems. Pick the lens that matches what changed, then apply it to the changed code only.

| The change contains | Apply |
|---|---|
| `catch`, `try`, `.catch`, retries, fallbacks, defaults on error | Silent failure |
| New or edited comments, docs inside code | Comment accuracy |
| New or edited tests | Test quality |
| A new type, schema, class, enum or config shape | Type invariants |

## 1. Silent failure

For every error handler in the change, answer three questions: who learns that it failed, what does the user or caller see, and what is lost.

Patterns that hide failure:

- An empty `catch`, or one that logs and carries on when the caller needs to know.
- A default returned on error (`return []`, `?? 0`, `|| ''`) that is indistinguishable from a real empty result.
- Optional chaining or a null guard that turns a missing required value into "nothing happened".
- A fallback to a mock, cache or stub on a production path with no visible signal that it was used.
- A `catch` wide enough to swallow programmer errors along with the expected one.
- A retry loop that ends without surfacing the last error. A promise created and never awaited, or `.catch(() => {})`.
- PowerShell: `-ErrorAction SilentlyContinue` on a command whose failure matters, an empty `catch {}`, an unchecked `$LASTEXITCODE` after a native command.

Intentional best-effort handling is acceptable when a comment says why and the cost of the miss is bounded (closing a temp file, optional telemetry). Verdict per handler: visible, or hidden. A hidden failure in a path that writes data, moves money, grants access or reports success is a finding.

A fallback is acceptable only when it is explicit, visible to the caller or user, and keeps the original cause available.

## 2. Comment accuracy

Check each comment the change adds or sits next to.

- Does it say what the code does now? A comment that contradicts the code is worse than none.
- Does it explain why, or only restate the line? Restating comments rot first; suggest deleting them.
- Does it name a function, file or behavior that no longer exists?
- Is there commented-out code, or a TODO with no owner and no condition?
- Does it promise a guarantee (thread-safe, idempotent, never null) the code does not enforce?

## 3. Test quality

Judge tests by regression value, not line coverage.

- Would this test fail if the behavior regressed? Try it: break one line of the production code in a scratch copy and see whether anything turns red. If nothing does, the test is decoration.
- Does it assert the outcome, or only that a mock was called a certain number of times? Tests tied to implementation fail on refactors and miss real bugs.
- Is each of these covered where it matters: the empty case, the boundary, the error path, the permission-denied path?
- Can it pass with zero assertions, or be skipped without anyone noticing?
- Does it depend on order, shared mutable state, the clock, locale or the machine's paths?

Rank gaps by the harm of the untested behavior: data loss and security first, then wrong results, then cosmetics.

## 4. Type invariants

Only when the change introduces or reshapes a type.

- Which states must be impossible? Does the type allow them (two optional fields that must be set together should be a union)?
- Is the invariant enforced in one place (constructor, parse function) or re-checked by every caller?
- Can a caller mutate internals and break the invariant after construction?
- Are free strings used where a closed set of values exists?

Judge on three axes: how well the type expresses the rule, how well it hides what callers should not touch, and where the rule is enforced.
