---
"agent-core": patch
---

Make the Node.js and npm in `runtime/node` the only ones on the machine. `scripts/windows/Register-Agent-Core-Npm.ps1` (Register, Verify, Unregister) points the npm cache and global prefix at `runtime/npm-cache` and `runtime/npm-prefix`, puts the project runtime first in the machine PATH and removes other Node/npm folders from PATH; Verify reports any second Node, version manager or stray npm folder. The user-level hook `npm-single-owner-guard.cjs` denies Claude Code commands that install Node/npm elsewhere or point prefix/cache outside the project. Documented in `docs/Node-Npm-Single-Owner.md`.
