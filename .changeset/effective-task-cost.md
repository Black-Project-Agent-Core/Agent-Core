---
"agent-core": patch
---

Add the pure function `effectiveTaskCost` to the Native runtime metrics owner: a cache-aware, dated-weight cost of one task in weighted tokens, with `complete`, `parsial` and `tidak-berharga` labels and REM overhead kept separate. It reads and writes no state, changes no Native behaviour and has no caller yet.
