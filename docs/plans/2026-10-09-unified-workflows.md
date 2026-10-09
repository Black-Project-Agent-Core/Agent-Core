# Unified Workflows: implementation design and acceptance

## Approved intent

Add Workflows to the existing desktop sidebar. Show Agent Core system and Memory together in one interactive Archify canvas. Derive dependencies automatically from source changes without requiring an AI model. The map describes source evidence, not observed runtime execution. Memory 01 external acceptance remains independent; Memory 02 is out of scope.

## Architecture

- A bounded deterministic analyzer reads only supported project source roots, excludes private/runtime/generated data and symlinks, extracts TypeScript imports/re-exports using the existing TypeScript runtime, groups source files into subsystem nodes, and records relative path/line evidence.
- An in-process service performs initial analysis, then bounded serialized polling with a quiet-period debounce. It fingerprints actual source bytes, not generated JSON or commit IDs alone. Unchanged inputs avoid rendering. Rebuild errors retain the last good canvas and mark it stale. Disposal stops polling. Git revision is supplemental and may be unknown.
- A minimal pinned Archify 3.0.1 architecture renderer and classic HTML viewer are vendored from upstream commit 7f483b61e8f68d0d5c3219d2c943c5381c8db0b1. It runs in a separate Node process with strict time/output limits, stripped environment, and Node filesystem permissions limited to vendor files plus a fresh temporary directory. A small documented offline adapter avoids upstream root-to-leaf output path probes, uses fixed exclusive temporary filenames, and disables brand capture. No general Archify CLI, update checks, model calls, or external assets are used.
- GET /agent/workflows uses the existing loopback + UI-token authorization. It returns cached source status and HTML only. Native host forwards bounded, correlated requests from the exact launcher origin/path. The React page polls only while mounted.
- The iframe is sandboxed with allow-scripts only. HTML CSP denies network, external assets, forms and child frames. No native commands, host messages, downloads, or external navigation are exposed. Node focus/search/pan/zoom operate on the same canvas; evidence is available as read-only relative paths and line references.

## Scope and limitations

This is a dependency architecture map. Static imports are supported evidence; conditional execution, dynamic nonliteral calls, data transitions and native process behavior are unknown, not invented. Unsupported source types and unresolved imports are disclosed. Runtime Memory contents and secrets are never inputs. Files outside the allowlist remain outside source coverage; the UI must not claim complete dynamic system coverage.

## Implementation sequence

1. Verify and isolate the published Memory 01 source baseline; preserve all tracked source and leave existing workspaces untouched.
2. Add analyzer fixture tests before source analysis implementation.
3. Add renderer adapter tests before integration; validate real pinned Archify HTML offline.
4. Add service lifecycle/debounce/stale/disposal tests before service implementation and authenticated route integration.
5. Add sidebar, one sandboxed canvas, correlation/polling/error tests and native trusted-origin checks.
6. Run scoped tests, root build, UI typecheck/build/tests, final aggregate tests; inspect real rendered output when a browser is available. Preserve exact failure names and unsupported Windows checks.
7. Produce a sanitized acceptance report and source-change manifest. Stop before publication pending independent review.

## Windows acceptance performed later by the user/controller

- Open Workflows in the real launcher; verify System and Memory are in the same canvas and focus/search/zoom work.
- Change a harmless supported source fixture or comment; verify fingerprint changes automatically after a quiet period with no manual JSON rebuild. Revert and verify automatic recovery.
- Verify rapid changes debounce, navigation away/back and repeated opening do not duplicate polling, and a core outage shows honest stale/offline status while preserving the last good canvas.
- Verify the iframe cannot trigger native commands, navigate the launcher, open new windows or download content.
- Record controller-owned observed results and screenshots separately from automated Linux evidence. Do not claim Windows native acceptance from Linux unit tests.

## Integration decisions established during verification

- Actual 41-node / 174-edge source graphs exceed Archify's authored-diagram clean-flow assumptions. An embedding-only exception permits the specific edge-through-unrelated-node aesthetic diagnostic; all other schema/endpoint/layout checks stay active. All subsystem nodes remain in one canvas, with only the selected neighborhood's edges shown, initially Memory host. The page states that crossings may exist and makes no clean-route claim.
- The existing production dependency typescript-lsp-runtime supplies the AST parser. Hash-keyed extraction caching preserves content-based freshness (including same-size, same-mtime edits) while reducing warm source scans to roughly 119–137 ms in the Linux fixture.
- Packaged releases keep source under source/src; this snapshot is used only when root/src is absent, with an explicit snapshot/not-live-binary limitation. The release packaging script includes the renderer and licenses without any release being run by this task.
- Real browser verification is blocked in this cloud environment: Chromium process socket creation is denied, the separate cloud browser cannot reach this executor's localhost, and file URLs are rejected. No restrictions were bypassed. Real Windows/WebView2 visual and navigation acceptance remains pending with the user/controller.
