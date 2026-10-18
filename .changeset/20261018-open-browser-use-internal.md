---
"agent-core": minor
---

Add the installed Open Browser Use extension/native host as an explicit internal
transport of external browser_control. Reuse observed actions and bounded evidence,
isolate task-created tabs and connection epochs, and compile a small owned Go IPC
helper for Windows AF_UNIX. Preserve Native Agent's frozen contract, the default
isolated browser and the existing Browser Bridge conversation approval flow.
