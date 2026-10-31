# Git publication

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Git repository — active current-line publication boundary

`https://github.com/Black-Project-Agent-Core/Agent-Core` is the user-authorized **active GitHub publication destination** for the current Agent Core architecture.

- `E:\Projects\Agent-Core` (or the equivalent relocated project root) remains authoritative for source and engineering decisions. Never replace current local source using remote clone, pull, checkout, reset, rebase, or merge merely to publish.
- The active GitHub remote is `origin`; the former remote name `legacy` is historical. `main` and `codex/cumulative-learning-workflow` were published from the current local codebase on 2026-10-14; the previous remote `main` is preserved in `archive/pre-current-line-2026-10-14`.
- Preserve the prior GitHub `main` tip on a separately named archive branch before replacing an unrelated remote root. Any non-fast-forward publishing must be explicitly user-authorized, anchored to the observed remote SHA using `--force-with-lease`, and must abort on remote drift.
- The local synthetic `refs/agent-core/current-line-baseline` remains the only Git-aware release-intent comparison basis. Never substitute `origin/main`.
- Exclude local credentials, `.env`, private canonical runtime/memory notes, runtime state, backups, generated assets, and protected reference checkouts using the project `.gitignore`; do not publish secrets.
- Git commit/push authorization does not authorize `release:apply`, a new product version, tag, deployment, or a running Agent Core restart.
- Historical documentation may describe the former legacy boundary; those dated statements are evidence, not live policy.

