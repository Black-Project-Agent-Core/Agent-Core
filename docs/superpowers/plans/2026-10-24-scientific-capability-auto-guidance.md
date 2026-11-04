# Scientific Capability Auto-Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose scientific critical thinking as the default cross-session reasoning capability; always expose its compact descriptor and load its full active instructions for every coding or reasoning task.
**Architecture:** Extend the existing shared guidance route used by Native prompts and external bootstrap/context. Keep SkillService, the compact index, progressive reads, and capability-pack ownership unchanged.
**Tech Stack:** TypeScript, Vitest, Agent Core SkillService.
**Spec:** `docs/superpowers/specs/2026-10-24-scientific-capability-auto-guidance-design.md`

## Global Constraints
- Preserve versioned SkillService ownership; the current source locator after the 2026-10-27 correction is `runtime/skills/capability-packs`, inside the original Skill home. The dated promotion scope below remains historical; this locator update does not authorize promotion.
- Never inline the scientific Skill body or its references into shared guidance.
- Update `docs/CODEBASE.md` with implemented behavior and evidence limits.

## Review Focus
- Scientific Skill missing from the catalog must report unavailable without blocking bootstrap.
- External bootstrap and task context must expose the same active digest.
- Native guidance must expose the same route.
- A marker inside the Skill body must never appear in guidance.
- Only routine, mechanical, deterministic non-coding work that needs no reasoning may skip the full scientific workflow.

### Task 1: Regression coverage
**Files:** Modify `tests/external-skill-guidance.test.ts`.
- [x] Import a fixture scientific Skill containing a private body marker.
- [x] Assert bootstrap, context, and Native guidance expose its exact digest and selection rule but omit the marker.
- [x] Run the focused test and observe the expected failure before production code changes.

### Task 2: Shared route and documentation
**Files:** Modify `src/skills/external-guidance.ts`, `AGENTS.md`, `docs/External-Engineering-Skills.md`, `docs/Capability-Index.md`, `docs/CODEBASE.md`, and the existing capability changeset.
- [x] Add the lightweight scientific route with a pre-relevance activation gate: every coding/reasoning task triggers it; only routine deterministic non-coding work with no reasoning skips it.
- [x] Document cross-session descriptor exposure, the pre-relevance activation gate, and selective reference reads.
- [x] Run the focused test to green.

### Task 3: Integrated verification and activation
- [x] Run related capability tests and the project build.
- [x] Confirm source/reference hashes and absence of legacy top-level folders.
- [x] Restart through the official Agent Core restart path, refresh tools if required, and verify resident guidance/catalog exposure.
- [x] Record actual Skill use and finalize Learning with inspectable evidence.
