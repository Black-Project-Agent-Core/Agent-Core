---
name: debugging-and-observability
description: "Finds root causes and makes production behavior visible: systematic debugging when tests fail, builds break or behavior differs from expectations (including environment differences and incident handling), plus instrumentation with logging, metrics, tracing and alerting so failures can be diagnosed from evidence. Use when something broke and the cause is unknown, when a failure only happens in one environment, when handling an incident, or when adding logs, metrics, traces or alerts to code that runs in production. Not for writing the first failing test of new behavior or for profiling-driven optimization."
license: MIT
compatibility: "Agent Core adapter: existing grants and available tools; Windows-safe equivalent commands; load references only when relevant."
metadata:
  upstream-repository: "https://github.com/addyosmani/agent-skills"
  upstream-commit: aeac41d4d005999432bb7312f7ff06383a91d59d
  upstream-path: merged
  adapter-revision: "1"
---
## Triggers
- Tests fail, a build breaks, or something that worked yesterday broke and the cause is unknown.
- A failure appears in one environment only; an incident needs a structured response.
- Adding logging, metrics, tracing or alerting to code that runs in production.
- A production issue is reported but the available data does not show what happened.

## Non-triggers
- Writing a failing test for new behavior first; choose `test-driven-development`.
- Measuring and optimizing latency, CPU or memory; choose `performance-oriented-software-engineering`.
- Release gating and rollback planning; choose `delivery-and-release`.

## Agent Core integration
Read the compact `agent-core-capability-index` first, then this Skill through every returned fragment. Open a stage reference only when that stage is selected. Record actual use and evidence; reading is not use. Current user instructions, host rules and task scope win over stage defaults. Map Claude-specific tool names to available equivalents, adapt shell examples to Windows PowerShell, and report an unavailable operation instead of claiming it ran. A stage is a workflow, not permission to install dependencies, publish, send messages or change credentials.

## Debugging and observability
Diagnosing and instrumenting are two sides of the same loop: debugging needs evidence, and instrumentation exists to supply it. Debug from the evidence you have; when it is missing, add the smallest instrumentation that would have shown the cause.

### Stages
| Stage | Use for |
|---|---|
| [debugging-and-error-recovery](references/debugging-and-error-recovery.md) | Reproduce, localize, find the root cause, fix and guard; includes `references/environment-differences.md` and `references/incident-handling.md`. Also: [environment-differences](references/environment-differences.md), [incident-handling](references/incident-handling.md). |
| [observability-and-instrumentation](references/observability-and-instrumentation.md) | Structured logs, metrics, traces and alerts that make behavior diagnosable. |

### Order
1. Reproduce and read the evidence before changing code.
2. If the evidence cannot answer the question, add the instrumentation described in `references/observability-and-instrumentation.md`.
3. Fix the cause, add a guard (test or alert), and record what was learned.

### Origin
Each stage is the full text of a former Skill, retired into this pack. Provenance, upstream pins and the restore path: [merged-from](references/merged-from.md).
