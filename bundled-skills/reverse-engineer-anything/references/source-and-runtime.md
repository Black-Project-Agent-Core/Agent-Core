# Source and runtime

Requested checkout: `G:/Temp/rea`, origin `https://github.com/morluto/rea`,
commit `2c4338db1fdb7773e05376301c558cff2a0b4b80`. It declares development
version 6.6.0, absent from npm when checked on 2026-10-18. Its workflow was
reviewed; retained operational guides come from the matching published 6.5.0
package rather than implying that all development features are installed.

Installed dependency: `rea-agents@6.5.0` in `tooling/rea`, exact direct pin and
transitive lockfile. Tarball:
`https://registry.npmjs.org/rea-agents/-/rea-agents-6.5.0.tgz`.
Integrity:
`sha512-C6BG7LyrAdR74mSjertM6PrxJkcNZ2bfQNOJornPo9erDEp2tyPRVYPnV5Yodr+1RqewCQla68WulXlVnveD+A==`.
Bundled upstream skill revision: 42. MIT attribution is retained in `../LICENSE`;
dependencies retain their licenses in `tooling/rea`.

## Invocation and restoration

Agent Core catalog imports omit `node_modules`. The launcher first uses its
own local pinned runtime, then existing personal skill locations under
`CODEX_HOME/skills`, `~/.codex/skills` and `~/.agents/skills`. The optional
`AGENT_CORE_REA_SKILL_ROOT` selects one explicit owning skill folder and
disables fallback if that selection is missing or mismatched. Both the
dependency manifest and installed package must declare exactly `6.5.0`.
This reuses one environment; it does not turn the static Agent Core
`artifact_inspect` or proof-only `reconstruction_harness` into a REA provider.

Use existing Node 22.x >=22.19, 24.x >=24.11, or 26+. Initial installation
reused Node 24.18.0 and npm 11.16.0. No global installation, PATH edit, MCP
registration or permission change is needed for CLI use. The checkout is not
a runtime dependency and remains a separate project.

```text
node "<skill-folder>/scripts/rea.mjs" --version
node "<skill-folder>/scripts/rea.mjs" analyze-javascript-application "<absolute-app-path>" --format json
```

Save a nontrivial analysis's output in the project workspace. A summary request
file has `source: {kind: "inline", evidence: <saved-record>}` and
`view: {kind: "summary"}`. Pass that file to `inspect-analysis-view`; see the
JavaScript guide for module pages/items. Do not repeat the producer for a view.

If the runtime is missing or mismatched, restore the existing lock:

```text
npm ci --prefix "<skill-folder>/tooling/rea" --ignore-scripts --no-audit --no-fund
```

Use `npm.cmd` in Windows PowerShell when npm.ps1 is blocked. Installation
scripts were disabled; the package supplies compiled runtime and Windows
native support. Do not automatically replace the pin with `@latest` or use
global `rea update`. Update the runtime and matching guides together.

## Provider and host boundaries

- Static JavaScript/Electron, managed assemblies, PE resources and embedded
  Go/Rust metadata have inspection routes without a native decompiler.
- Native pseudocode requires an existing compatible Hopper, Ghidra or IDA.
  Windows Ghidra is an experimental read-only route with separate prerequisites.
- Android requires appropriate JADX/JDK; WASM requires WABT. Firmware, packet
  and signal workflows have additional tool and host requirements.
- Browser/Electron and process observation need supported runtimes and requested
  access. Linux-only capture is not established on this Windows host. SQLite
  inspection needs Node 24.15+ or 26+.
- CLI works immediately. A separately connected MCP server can differ in
  version or capabilities; follow its actual schemas. Only plan MCP setup
  when needed. Setup may replace this adapted skill, so include that change
  in the reviewed scope and preserve local additions.

Read only the guides needed for the task. The local entrypoint overrides
upstream package-runner examples with the installed launcher; it does not
register MCP, install analysis engines, or change the host's model choice.
