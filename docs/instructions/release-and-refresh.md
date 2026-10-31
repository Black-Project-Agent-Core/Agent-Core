# Release and activation

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Release intent / version integrity protocol

### External-controller build activation and tool refresh

- After a successful ordinary build that needs resident activation, call `restart_agent_core(capabilitiesChanged=false)` once. This runs the existing `<PROJECT_ROOT>\Restart-Agent-Core.cmd`; do not also run the CMD, start a second launcher, or use another restart path.
- For additions or changes to exposed tool calls, schemas, Skills, capabilities, plugins or similar discovery surfaces, **all three requirements are mandatory, in this order**:
  1. Rebuild/package `Agent Core.exe` so it includes the modifications. Confirm the build succeeds before activation.
  2. Call `restart_agent_core(capabilitiesChanged=true)` **once**, then wait for Agent Core to return.
  3. **Client tool refresh depends on the controller.** A **Claude controller (Claude Code or Claude Desktop) must not open ChatGPT**: the user refreshes the Agent Core connector in Claude Desktop, so tell the user once that the refresh is needed, then verify the new schema in your own tool list. **For a ChatGPT-web controller only, Refresh tools is mandatory**: use the **browser-use capability** → open [Agent Core plugin settings](https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503) → **MANDATORY: scroll down** → look for visible **Refresh tools** text → if the text is not yet visible, **MANDATORY: scroll down again** and observe again until it is visible → **click the visible text/control labeled "Refresh tools"**. Opening the link alone does not complete this step.
- If the new restart tool is not yet exposed by the current cached client, run the same root `Restart-Agent-Core.cmd` once through the existing authorized process tool. A missing cached tool is not a reason to reinstall or restart repeatedly.
- Tell the user when a client refresh is required. A ChatGPT-web controller performs the direct-link/scroll/click workflow above through browser use; a Claude controller does not. If the available browser capability cannot reach or operate the page, report the concrete limitation and give the same direct link plus mandatory scroll/click steps. Confirm the refresh result and verify refreshed tool discovery in the subsequent client context before claiming changed capabilities/tools are exposed. Local Skills/catalog entries still use their existing discovery tools; Refresh tools does not create or activate a Skill.
- Restart disconnects the current MCP connection and clears contract receipts. Reconnect and complete `controller_contract` read/acknowledge again. A lost response or timeout means unknown outcome: inspect `runtime/restart` logs/receipts and current health instead of repeating the restart. A request receipt or launcher window alone is not proof of Core/tunnel readiness.
- This is external-controller guidance and an external-only tool; Native Agent behavior is unchanged. The existing CMD/PowerShell/Scheduled Task chain remains the sole restart implementation.

Agent Core uses lightweight Changesets-compatible release intent as development/release metadata. It is a sibling concern and must never become an execution, routing, approval, memory, or tool gate.

- When an implementation materially changes shipped Agent Core behavior, public product capability, product identity, compatibility, security behavior, persistent-state contract, or user-visible release semantics, create one pending `.changeset/*.md` intent while the change context is still fresh.
- Use exactly one Agent Core semantic bump: `patch`, `minor`, or `major`, with a concise factual summary.
- Documentation-only corrections, conversation/context archives, protected research grounding with no active integration, generated/runtime artifacts, temporary debugging output, test-only refactors with no behavior change, and formatting/comment-only edits do not normally require release intent.
- Root `package.json::version` is the canonical Agent Core release-version authority. Product-version consumers are synchronized by `npm run release:sync-version`; do not create independent Agent Core product-version literals.
- `src\rdc\version.ts` is the vendored machine-control compatibility-layer version and is explicitly independent from the Agent Core product version.
- Use `npm run release:plan` to inspect pending release intent. `release:plan` is read-only.
- `npm run release:apply` is an explicit release mutation. Do not run it merely because a changeset exists; it may only be used when the current task actually authorizes applying the reviewed release plan.
- Release tooling must never auto-commit, tag, push, publish, deploy, restart Agent Core, or infer permission to do so.
- Git-aware missing-intent enforcement uses the local synthetic ref `refs/agent-core/current-line-baseline`, never a remote branch (`origin/main` or historical `legacy/main`). Run `npm run release:check-intent` to compare current release-relevant source against that local baseline. A release-relevant delta without a new pending changeset relative to the baseline must fail the release-intent check.
- `npm run release:baseline` refreshes only the synthetic local baseline ref through a temporary Git index; it must not modify the real branch/index/worktree, contact a remote, or publish anything. Refresh it only after the corresponding release intent exists and the current-line state is accepted as the next local checkpoint.
- Every explicitly applied stable release must be archived with `npm run release:package` before that release is considered locally complete. The archive lives under `release\\v<version>\\` and includes the versioned ZIP, release notes, manifest, and SHA-256 checksum. Existing version archives are immutable by default.
- Release ZIP packaging is allowlist-based: never include `.env`, `secrets`, bridge-auth/OAuth/API-key state, user memory notes/index/state, tracker/log state, WebView/browser profiles, backups, Git metadata, live tunnel credentials, or protected reference repositories.

