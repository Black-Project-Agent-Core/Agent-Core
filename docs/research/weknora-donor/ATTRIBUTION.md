# WeKnora donor provenance

Source repository: https://github.com/tencent/weknora

Pinned commit: `22a331a2eac6d9ca367cd2fd2cf295cf42c4526e`.

WeKnora's own LICENSE declares its code MIT, copyright Tencent 2026, with separate third-party components/notices. The full donor LICENSE is preserved beside this note. No donor dependency, binary, logo or UI bundle is imported by this audit.

## Adaptation ledger

- W-02 provider transport boundary: `internal/models/api/endpoint.go::roundTrip` distinguishes response-body transport failures from deterministic size/JSON decode errors. Agent Core implementation is independently written TypeScript in the existing `src/agent-provider-errors.ts` owner, using structured runtime cause codes and existing scheduler policy. No Go source or third-party library was copied. A real local HTTP disconnect regression validates the new boundary; the historical Native task's exact cause remains unavailable.
- W-01 MMR postings and the smaller-set variant were measured and rejected: common-path regressions or immaterial gains did not meet the adoption gate. No production MMR implementation was imported. Raw negative results remain under runtime/build/weknora-donor-20261026.
- K-LOC-01 local XLSX evidence: donor `internal/sourceloc/{office,align,index}.go` and its ingestion consumers motivate precise source locations. The recipient implementation uses direct ExcelJS cell addresses during the existing TS projection, not donor Go/Python parsing or alignment source. Bounded incremental rendering, source SHA-256, coordinate evidence and transformed-output invalidation passed targeted/source-owner checks and a resident plugin read after the official final restart. Existing parser dependencies remain unchanged.

This note records source provenance and actual adaptation status; it is not a claim of a measured generic performance or intelligence improvement.
