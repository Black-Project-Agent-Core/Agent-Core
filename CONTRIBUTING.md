# Contributing to Agent Core

Agent Core is a local-first, Windows-oriented project. This GitHub repository contains the current source line; it is not a legacy-only reference mirror. See [README.md](README.md) for supported entrypoints and [docs/CODEBASE.md](docs/CODEBASE.md) for source ownership.

## Ground rules

- Treat the current local Agent Core source as authoritative.
- Inspect source and runtime state before changing implementation.
- Keep changes minimal, coherent, and inside the existing architecture.
- Do not add hidden orchestration gates, autonomous retry loops, or parallel authority stores.
- Preserve the separation between Agent Core and external Remote Desktop Commander.
- Never commit credentials, live `.env`, OAuth/API keys, private runtime state, browser profiles, or forensic backups.
- Do not modify `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/` unless the task explicitly authorizes it.

## Before changing code

Read:

- `AGENTS.md` for the operating contract.
- `docs/CODEBASE.md` for the maintained architecture map.
- The exact source files that own the behavior being changed.

Source code outranks documentation when they disagree.

## Development workflow

1. Understand the requested behavior and current implementation.
2. Inspect the smallest relevant source surface.
3. Make the minimal coherent change.
4. Update the affected section of `docs/CODEBASE.md`.
5. Assess and record version impact for every change, including reduced capabilities. Add a release intent when the change affects behavior, capability, compatibility, security, persistent state or release semantics. Documentation-only work can explicitly record no product-version change. Use a prerelease for implemented changes awaiting functional acceptance.
6. Run only the verification authorized or required for the task.
7. Keep unrelated local changes intact.

## Commits and pull requests

Use concise commit messages that describe the actual change. Pull requests should include:

- what changed;
- why it changed;
- affected architecture/runtime surfaces;
- verification actually performed;
- release/version impact, if any;
- any known residual risk or follow-up.

Do not claim a fix, pass, deployment, or verification result without evidence.

## Integration and acceptance handoff

A successful push is not a successful installation. Identify the exact repository, branch and commit to fetch before asking another controller to test. Inspect and back up local changes, integrate only the intended scope, build each affected component, activate the build and verify the actual running version before testing its behavior. Never use a destructive reset or blanket overwrite to resolve an unknown dirty checkout.

Provide environment-specific follow-through for steps the author could not perform. Report source verification, native acceptance, publication and deployment separately. Use functional tests first when benchmarking is deferred. Return a complete sanitized ZIP with source/build identities, results, logs, screenshots where relevant, and a path/size/SHA-256 manifest verified after fresh extraction. Exclude secrets and private runtime data.

## Release integrity

`package.json::version` is the product-version authority. Stable release artifacts are immutable under `release\v<version>\`.

Do not commit/tag/push/publish/deploy/restart as a side effect of unrelated work. Those actions require explicit task authorization.

## Security

Do not paste or commit secrets in issues, pull requests, logs, fixtures, or screenshots. Follow [SECURITY.md](SECURITY.md) for security-sensitive reports.
