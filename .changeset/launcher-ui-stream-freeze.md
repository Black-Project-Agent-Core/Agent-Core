---
"agent-core": patch
---

Stop the desktop window from freezing ("Not Responding") while a Native turn waits on Core: the turn stream is read without a synchronous socket read on the UI thread. Keep only the newest three launcher rollback copies when a restart installs a new launcher.
