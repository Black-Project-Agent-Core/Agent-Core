> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Memory 01 and Workflows Windows functional acceptance

Reviewed 2026-10-10 UTC from the user-supplied Windows report. This is an evidence audit, not a new Windows execution from the Linux checkout.

- Report ZIP SHA-256: `c6edf28a196d7ca8b321e7b4be837667bb2e4758df9cc7ecfbcd6f12bf6c624f`; 1,985,300 bytes; exact 187 payload entries plus manifest verified.
- Daily installation: directed Memory01 and Workflows integration preserving existing local changes; not an exact clone of the release tag.
- Launcher provenance: independent production rebuild matches the active executable. The old stage mismatch remains historical; its cause is unknown.
- Memory01: seven scoped source paths and seven compiled artifacts verified; 801 unrelated source files and 562 previous Core/UI/launcher artifacts preserved. Fresh process/import-chain hashes, health and MCP capabilities establish resident activation.
- Offline semantics: 522 applicable Windows test cases passed cumulatively, comprising 491 initial passes and 31 platform-harness recoveries. Assertions and production code were not weakened. The original full verify command remains FAIL; Windows harness portability fixes were not integrated into this source by that report. Two Linux case-sensitive fixtures were not run on Windows.
- Real synthetic MCP: compiled production handler and SDK transport recall an eligible synonym, exclude a foreign-workspace exact-term distractor, use one fake query embedding and reject scope spoofing. No production provider-quality claim.
- Workflows: production current System + Memory canvas verified after cutover. Existing accepted behavior was not needlessly retested.
- Benchmark collection failed at a sealed corpus digest check before benchmark cases; benchmarks and real provider evaluations remain deferred. Actual rollback and second-session portable launcher GUI acceptance were not run.

## Separate release evidence

Clean `23fdca411e152c42fe1a5b81f526b18d6d57bd3b` builds and Windows release tests passed cumulatively (19 initial + 4 recovered). Portable ZIP extraction checked 20,519 files; packaged Core health/Memory/Workflows smoke and shutdown passed. This is not full fresh-machine GUI acceptance.

Portable ZIP: 192,161,595 bytes; SHA-256 `e54f590f9b260c5ffbd817054ca827117904ca222c8081a11f1a2073e92b13ee`. Four uploaded [beta.0 release assets](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/tag/v0.15.0-beta.0) have independently matching remote metadata/digests. Tag target remained unchanged. The release is still a prerelease.

Memory01 and Workflows functional acceptance is closed within this scope. Subsequent Plans02–05 require their own evidence; these results must not be relabelled as tests of later code.
