# Tool output trust: what a result actually says

A tool result is evidence about what the tool did, not a fact about the world. Most confident wrong conclusions in tool work have no error message behind them: the result was limited, partial, summarized, empty for the wrong reason, or for a different question than the one asked. Run these checks before writing "none", "zero", "clean", "complete" or "all".

## Slices and completeness

1. **A limited call describes its slice.** A result cap (`limit`, `maxResults`, `head_limit`, page size), a time window or a byte cap makes the result a sample. When the count equals the cap, assume there is more. Say "in the first N results", or fetch the rest.
2. **Exhaust pagination before totals or "none".** The page you have is not the register. Follow every cursor or offset to the end, or label the number as partial.
3. **Truncation is a result.** If the output was cut ("[+N chars]", a clipped log, a trimmed list), the part you did not see can contain the answer. Read the end, or request the rest.
4. **A summary is a convenience, not the source.** Sum the rows and compare with the summary figure. If they differ, the rows win and the difference is a finding.

## Zero, absent and empty

5. **Zero and absent are different.** A missing field, an empty list and a literal 0 mean three things. If zero is implausible (no callers for a public function, no tests in a test folder), read it as "unknown" until checked.
6. **Opt-in fields.** Some tools return a field only when a parameter asks for it. Then "absent" means "not requested", not "none". Check the tool's contract before reading absence.
7. **Empty can mean the query failed.** A wrong pattern, a wrong path, the wrong working directory or a case-sensitive match all return an empty result that looks like "nothing exists". Cross-check before reporting "not found": run a query that must succeed (a known item), count by another route, or search for a shorter pattern.
8. **Empty is not clean.** A scan that found nothing is evidence only if you know the scan looked at the right set.

## Does the answer match the question?

9. **Ignored parameters.** A tool may accept a parameter and drop it. The only sign is often an echo in the response (the period, filter or path it actually used). Compare the echo with what you sent, and label figures with what came back, not with what you asked.
10. **Coverage ratio.** Before reasoning from a breakdown, add it up and compare with an independent total for the same scope. If it covers 4% of the total, say that first.
11. **Sibling tools that disagree.** One tool says "not ready" or "no items", another returns rows. Read both and report both in one line. Do not proceed with an action that has side effects while a readiness flag says no. Raise the contradiction; do not route around it.
12. **Numbers that are too perfect.** Exactly 100%, a zero cost against real revenue, a negative value where none is possible: assume a trap fired and recompute from the rows.
13. **Wrong denominator.** A ratio over a wider universe than its numerator misleads. Carry a figure that crosses a boundary as labelled context ("from the unfiltered total"), not as input to new arithmetic.
14. **Two counts of different magnitude.** If two sources give counts an order of magnitude apart, that is the finding. State which one you used and why.
15. **Future dates and impossible values** mean the data is broken or mislabeled. Do not average them in.

## Assumed and derived numbers

16. **Label the origin.** A number taken from the user's assumption, an estimate or a default is marked as such, and shown beside the measured one when both exist.
17. **Minimum data.** Do not compute a derived statistic (a rate, a trend, an average) below the amount of data that makes it meaningful; say what is missing.
18. **Say which check did not run.** If an input was degraded and a check could not run, put that in the report. Silence reads as "checked and fine".
19. **Repetition is evidence about the category,** not approval. That something happened before does not mean it was authorised.

## Agent Core examples

- A file search with a result cap returns exactly the cap. Writing "only two files use this" is the slice error. Raise the cap or search narrower until the count falls below it.
- A search returns 0 hits for a symbol that should exist. Before concluding it is unused, search for a known neighbour in the same file. If that also returns nothing, the path or pattern is wrong.
- A recall or list call returns its default number of items. "No other memory exists" does not follow; narrow the query or page.
- A health tool says everything is fine while a list tool shows a failed item. Report both lines and treat health as unproven.
- A test log shows a pass line for the first suite but is cut off. The remaining suites are unknown.
