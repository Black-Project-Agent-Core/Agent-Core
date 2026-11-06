---
"agent-core": patch
---

Code run through `node:local`, read-only git, ripgrep and adb no longer inherit the credentials Agent Core owns. These child processes now get the same filtered environment as the machine shell.
