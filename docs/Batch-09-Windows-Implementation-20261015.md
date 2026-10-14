# Batch 9 — Windows claim-to-evidence association (15 October 2026)

## Implementation and owner

Scope: approved candidate #135 RLM-FORGE/Ouroboros fact-handle association only. The existing owner `src/verification/evidence-links.ts` now accepts strict schemaVersion 2 alongside untouched v1 semantics, and `scripts/verify/verify-evidence-links.mjs` remains the real external controller entry point. No added MCP tool, review model, recursive agent, second verifier or automatic approval.

The required expectedClaims list (1–32 unique IDs) prevents vacuous success. Claims (0–32) carry `{id,from,lines:{start,end},linkIds}`, up to 8 unique link IDs each and 256 associations total. Referenced links must be registered in the same source document, at a sourceLine within the declared claim range, with a concrete targetLines anchor. Extra/unknown/duplicate/cross-document associations fail validation before reading source. The old snapshot reader still enforces local path/identity/UTF-8/digest limits and excludes source mutation.

Report v2: `algorithmRevision=agent-core-evidence-links/v2`, `claimCoverage.version=1`, `scope=declared-claims-only`, expected/supplied/bound/unknown/missing/evidenceMissing/failed/unavailable counts and at most 32 per-claim results. Invariant: expected=bound+unknown+failed+unavailable; unknown=missing+evidenceMissing; supplied=expected-missing. Output `complete` applies only to declared claim anchors. CLI remains 0=pass,1=fail,2=unavailable/invalid; report max 1 MiB before write; no body/semantic score is persisted.

## Source build and actual caller evidence

- Existing Windows root `E:\Projects\Agent-Core`; branch `codex/cumulative-learning-workflow`. The published Batch 7–8 merge baseline was `c7596b0a1b087b7d5fe9fff9a21d6804708c4d78`. No Batch 7–8 source rebuild was repeated.
- Official `npm run build` after Batch 9 modification: PID 20840, exit 0; path policy 371 authored files / 0 exceptions, Memory and root TypeScript compiled.
- Actual source claims are recorded in `docs/Batch-09-Claim-Assertions-20261015.md`. The real CLI uses that document together with current owner and CLI file digests; no synthetic scenario is used.
- Manifest and report: `runtime/backups/batch09-claim-evidence-20261015/real-source-claims-{manifest,report}.json` (manifest filename is `real-source-claims-manifest.json`; report filename is `real-source-claims-report.json`).
- CLI result: status **pass**, exit **0**, `expected=3/supplied=3/bound=3/unknown=0/failed=0/unavailable=0/complete=true`; report digest `sha256:d1cfa038e0bd172bd6e140d5384b578c6c105c2df723fa73ba36931028cca543`, byte size 3573.
- Source manifest and complete JSON result reside outside `temp` and `runtime/tmp`, with exclusive output behavior and revalidation inherited from existing owner.
- No forced race, negative manifest, timeout or unreadable-file case was performed. Pass means three structural source anchors validated at that snapshot, **not** that every assertion is semantically true, every report sentence is covered, or a measured benefit exists.

Batch 9 CLI runs compiled `dist` directly in a new Node process, so this implementation alone did not require a resident restart or plugin upload. Batch 10 activation and final Memory/Learning/cleanup are separately documented by the joint execution report.
