---
"agent-core": patch
---

Add the pure function `effectiveTaskCost` (leaf module `src/effective-cost.ts`, re-exported from the Native runtime metrics owner `agent-runtime.ts`): a cache-aware, dated-weight cost of one task in weighted tokens, with `complete`, `parsial` and `tidak-berharga` labels and REM overhead kept separate. It reads and writes no state and changes no Native behaviour; its first caller is the shadow replay script.
