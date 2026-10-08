# Continue Market Signal Lab Across Sessions

## Current source location

MSL is maintained at `<AGENT_CORE_ROOT>/SubProject/Market-Signal-Lab` in the Agent Core monorepo. Run MSL-specific commands from that directory. Git branch, upstream and worktree state belong to the containing Agent Core checkout; inspect them rather than assuming an old standalone integration branch still exists.

The Windows paths, release hashes and branch names in August 2026 reports describe their original environment. They are historical evidence, not proof that binaries, private datasets or that same runtime are present here.

## Read the right evidence

1. [README](../../README.md): current product purpose and module boundary.
2. [Source status and historical checkpoint](CURRENT_MSL_CHECKPOINT.md): latest imported development/release handoff, with its evidence dates preserved.
3. [Worktree policy](../project/WORKTREE_INTEGRATION_POLICY.md) and [repository policy](../project/REPOSITORY_CONTENT_POLICY.md): source/artifact boundaries.
4. [Purpose guardrail](PERMANENT_MSL_PURPOSE_GUARDRAIL.md) and [execution scope](PERMANENT_DEVELOPMENT_EXECUTION_SCOPE_GUARDRAIL.md).
5. Exact source and relevant QA report for the task being resumed.

## Implemented source and unresolved acceptance

- Go owns the host, persistence and security; Rust owns production analytics through `msl-analytics/2`.
- TypeScript/Bun frontend tooling and the offline Python C3.2 calibration lab are present.
- The imported handoff records C3.0–C3.2 integration. Its published preview is a distinct older release lineage; do not imply all current source was included in those release bytes.
- The last imported empirical audit found no approved C3.3 artifact. Private runtime datasets are not included here, so their present-day state is unknown. Do not fabricate outcomes or infer approval from old checkpoints.
- No native application, release artifact or runtime dataset was exercised during the source-only documentation refresh.

For accepted future work, preserve a durable source/evidence home and keep stable artifacts outside disposable worktrees. Merge, release, publish, installation, and cleanup still require the applicable task scope; this continuation file does not authorize them.
