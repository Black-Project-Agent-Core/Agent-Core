# Semantic IDE

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

### Semantic IDE / LSP protocol

Agent Core also exposes `code_symbol` and `code_refactor` as a sibling Semantic IDE/LSP capability. Use it for compiler/language-server-backed symbol structure, references, definition/declaration, implementations, diagnostics, semantic rename, safe delete, and symbol-body edits. It complements Grafel: LSP is local semantic truth for a concrete workspace/worktree, while Grafel remains structural/cross-repo evidence for impact, paths, graph repair, and code patterns.

- `code_symbol` is read-only except explicit provider-runtime maintenance (`restart_server`, `reload_providers`). Prefer it when exact symbol/name-path semantics, references, definitions/declarations, implementations, bounded type hierarchy, or diagnostics materially improve correctness. `reload_providers` is an explicit config reload; incompatible out-of-range provider versions must be rejected before activation.
- `code_refactor` is the only semantic source-mutation surface. Rename must come from the language server; never fall back to textual/global replacement. Safe delete must refuse when live references remain. `verifyDiagnostics=true` is an explicit evidence request that compares diagnostics before/after the applied refactor; it never authorizes builds/tests or turns warnings into an automatic rollback gate.
- Ref-scoped semantic calls require a concrete `worktreePath`; never serve a different ref from the default workspace tree. Ref/worktree contexts are always single-root. Default registered workspaces may expose multiple `CodeWorkspaceRecord.repos` as LSP workspace folders only to Agent Core-owned stdio providers. Externally managed TCP providers are loopback-only and always single-root; Agent Core disconnects but never shuts down or kills the external server. Protected paths remain forbidden.
- Refactor dry-runs must remain non-mutating and report affected files/ranges. Applied edits use source fingerprints, atomic writes, rollback on partial failure, and preserve source line-ending style.
- After a successful semantic mutation, request Grafel reindex/dirty synchronization for the same workspace/ref/worktree. Grafel sync failure is reported truthfully but does not undo an already successful semantic edit.
- Semantic IDE provider failure degrades only this sibling capability. It must never block machine control, Memory, Learning, Partner, or Grafel.
- Additional language servers are explicit project-local configuration; do not silently download/install language toolchains. Provider definitions may contain literal non-secret environment overrides and optional bounded version probes/compatibility ranges. Secret-like env keys, interpolation syntax, and env-value exposure in health/log output are forbidden. Version probes never auto-upgrade providers. Exact current source remains final authority.
- Do not introduce Serena runtime, Serena memory, Serena REPL/dashboard, Python Serena dependencies, or Serena generic shell/filesystem tools into Agent Core.

