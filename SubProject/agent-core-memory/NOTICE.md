# Notice

This repository is a standalone source extraction of the Memory subsystem from Agent Core.

It intentionally excludes:
- canonical user memory and runtime memory data
- credentials, secrets, environment files, and tokens
- tracker/runtime logs and backups
- Agent Core UI, launcher, browser, phone/game, code-intelligence, and Semantic IDE subsystems

The extraction keeps only the source dependency closure required by the Memory engine.
External runtime packages are limited to `proper-lockfile` and `zod`.
