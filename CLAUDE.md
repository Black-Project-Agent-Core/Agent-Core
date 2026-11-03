# Working on Agent Core from a cloud session

This repository is the **Source** of Agent Core. The running install (**Platform**) is a separate folder on the owner's Windows PC; it is not in this repository. Changes are made here (including from a cloud session), then built, tested and promoted on the PC.

## Division of work

- **Cloud session (you):** read the code, edit source and docs, update `docs/CODEBASE.md`, add a release intent when behavior changes, commit to a branch and push it. You may run what works in the cloud (for example `npm ci` and `npx tsc --noEmit`), but a green run there is not acceptance.
- **Owner's PC:** `git fetch` and check out the branch in `Agent Core Source`, build (`npm run build`), run the tests, then run `scripts/windows/Promote-Source-To-Platform.ps1` (dry-run first, then `-Apply`) and restart Core once. Build, test and promotion results come from there.
- Tell the owner in your final message which branch to fetch and what to verify locally.

## Rules that always apply

- Read `AGENTS.md` first. It is the operating contract; the owner has granted full authority for Agent Core work, but secrets and protected content stay protected.
- Never touch `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT`, `.env`, `secrets`, or `runtime` state. They are not in this repository on purpose.
- Do not write literal drive or install paths (no `E:\...`, no `F:\...`) into source, config or scripts. Derive roots dynamically (`docs/instructions/portability.md`). `npm run path:check` enforces this locally.
- `docs/CODEBASE.md` uses CRLF line endings. Edit it with a method that preserves `\r\n` and update the section a change affects.
- When a change materially alters shipped behavior, add one `.changeset/*.md` intent (`docs/instructions/release-and-refresh.md`). Never run `release:apply`, tag, publish, or restart anything from the cloud.
- `docs/PROJECT-STRUCTURE.md` is generated; do not edit it by hand. If you add a directory, say so in the final message so the owner runs `npm run structure:sync`.
- Use `docs/proposals/` for proposals (`REVIEW-GUIDE.md` has the template). Proposals written on the PC's Platform copy are copied back to this folder by hand.
- Reply to the owner in Indonesian. Code, commands, paths and error text stay verbatim.
