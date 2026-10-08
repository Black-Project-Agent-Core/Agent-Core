# Obsidian API — Steal / Use Integration Plan

> **Status:** SOURCE-FIRST CENSUS COMPLETE — ZERO IMPLEMENTATION VALUE — REFERENCE RETIRED/DELETED
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\obsidian-api`
> **Repository:** `https://github.com/obsidianmd/obsidian-api.git`
> **Revision:** `cc1744324150c632416857c98964f87b1574a5fc`
> **Branch:** `master`
> **Package license declaration:** MIT
> **Checkout state:** shallow during grounding; the checkout including its audit ZIP was retired after the final zero-value gate.

## 1. Exact source census

The tracked product surface is a TypeScript **declaration package**, not an executable implementation:
- `package.json` has an empty `main` and `types: obsidian.d.ts`;
- implementation-shaped files are `obsidian.d.ts`, `canvas.d.ts`, and `publish.d.ts`;
- no runtime JavaScript/TypeScript implementation exists in the checkout;
- no executable tests exist.

`canvas.d.ts` specifies Canvas JSON node/edge shapes and the large declarations specify Obsidian API contracts, lifecycle/event interfaces and vault/plugin types. These are compatibility/type contracts, not source-backed behavior that can be transplanted.

## 2. Agent Core comparison

Agent Core currently has no approved Obsidian plugin/vault runtime consumer. Creating one from declarations would be a new product integration designed from an API contract, not steal/use of an implementation.

Potential ideas such as Memory-to-Canvas export or Obsidian vault synchronization are therefore **not adoption proposals from this reference**. They would require a separate user-requested product design, behavior/security model and implementation source.

## 3. Proposal disposition

**New source-backed proposals requiring review: NONE.**

No executable mechanism, persistence algorithm, synchronization implementation, conflict handling, transactional behavior, plugin lifecycle implementation or test-backed runtime behavior is present to steal/use.

## 4. Reference disposition

**RETIRED / DELETED 2026-09-27.** Final active-source dependency search and process census were both zero. The declarations can be re-fetched from upstream if a future explicit Obsidian integration is requested; retaining this checkout provided no current implementation evidence that Agent Core needs.

No Agent Core runtime/source capability was removed by retiring this folder.
