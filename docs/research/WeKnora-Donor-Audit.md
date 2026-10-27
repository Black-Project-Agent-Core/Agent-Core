# WeKnora → Agent Core: audit dan adaptasi

Status: ENGINEERING ACCEPTANCE COMPLETE, 26 Oktober 2026. Seluruh path donor telah ditriase dan kandidat material diberi keputusan; dua adaptasi yang diterima sudah dibuild, diaktifkan dan diuji melalui proses aktif. Ini audit dengan batas bukti yang tercatat, bukan bukti universal bahwa setiap fungsi sudah ditelaah atau tidak ada teknik unggul lain. Otorisasi mencakup engineering, partner dan memory; tidak ada commit/push/rilis produk yang dilakukan. Finalisasi Learning dicatat terpisah.

## Identitas dan batas bukti

- Donor: `G:/repos/weknora`, origin Tencent/WeKnora, commit `22a331a2eac6d9ca367cd2fd2cf295cf42c4526e`, checkout bersih saat inventory.
- Target: Agent Core existing di project root aktif; owner map ada di [CODEBASE](../CODEBASE.md). Jangan mengganti Memory/Learning/runtime/auth yang sudah ada dengan engine donor.
- [Inventory](weknora-donor/inventory.json): 5.674 tracked file, 143.295.431 byte. Mapping semua path berbeda dari deep review setiap isi.
- [Combined coverage](weknora-donor/coverage.json): semua5.674 path telah menerima byte/blob triage dan keputusan per keluarga;0 blob mismatch,1.978 perbedaan CRLF-only. Manifest saat ini menghitung118 file dengan excerpt eksplisit dan5.556 mechanical-only pada249 keluarga. Ini bukan klaim seluruh fungsi sudah dibaca secara semantik atau tidak ada teknik unggul lain yang mungkin ditemukan.
- Main: platform/storage/security/operations + docs/assets/third party, 1.668 file. Raka: knowledge/retrieval/ingestion, 1.608 file. Native: agent/tools/UI, 2.398 file. Cross-domain service/type contracts memakai handoff eksplisit.
- Kode WeKnora sendiri menyatakan MIT; pihak ketiga tetap memiliki lisensinya sendiri. Adaptasi substansial harus membawa donor/commit/notice yang berlaku. Tidak ada donor service atau dependency yang dijalankan hanya untuk membaca source.

## Strategi

Adaptasi terarah ke owner TypeScript existing dipilih agar perilaku, otorisasi, persistensi dan portabilitas Agent Core tetap koheren. Mengimpor backend Go/Redis/SQL/UI donor secara utuh akan menambah owner/runtime yang tidak diperlukan. Memakai dokumentasi donor saja tidak cukup untuk menyimpulkan superiority. Setiap kandidat perlu caller, mekanisme, pembanding Core, regresi dan keputusan adopsi/penolakan.

## Ledger awal

| ID | Temuan | Status dan bukti |
| --- | --- | --- |
| W-01 | Sparse-overlap MMR postings | REJECTED. 100 exact synthetic correctness fixtures passed, but default 50/k=5 workload regressed 1.976→2.392 ms. Smaller-set alternative passed 104 fixtures with immaterial common-path gain and mixed-semantic regression. [Raka report](weknora-donor/raka-knowledge-audit.md#r-02--w-01--sparse-overlap-mmr-measured-rejected); no production algorithm changed. |
| W-02 | Transport read failure vs contract failure | ADAPTED, TESTED, BUILT, RESIDENT ACTIVE. Donor `internal/models/api/endpoint.go::roundTrip` distinguishes body-read failures from deterministic size/decode errors. Local real HTTP mid-body disconnect reproduced `terminated` + `UND_ERR_SOCKET`; six expected RED assertions, then 168/168 targeted tests GREEN. Existing `src/agent-provider-errors.ts` now recognizes a bounded structured cause chain. Build passed; official restart receipt `f334a6332d7a4a7bb661fd20ea1ea8ac` completed exit 0 at 15:49Z, PID15488, build not stale. Historical Native error causes were not retained, so their root cause is unproven. New Native wave3 has observed `TRANSPORT_TRANSIENT` route failures followed by sibling-key attempts; task still running, no completion/causal success claim yet. |
| W-03 | Heading/fence-aware chunking | DEFER. Donor maintains offsets/breadcrumb/fence tracking, but recipient note-corpus quality improvement is unmeasured. Existing digest-bound passage projection/version/index retained; no second chunking owner. |
| W-04 | Datasource sync/cursor replacement | REJECT risky semantics; no mirror/sync consumer established. Raka traces delete-before-create and cursor advanced before ingest succeeds. Source-derived risk, not executed donor incident. |
| W-05 | BM25/RRF/MMR/passage/cache | NO PORT: mechanism parity exists in Core, including bounded query embedding cache/repair. Multi-engine/vector-store breadth is product-specific. |
| W-06 | Donor memory exposure-as-use | REJECT. Weaker than Core's separate retrieval/use/feedback/outcome ledger; no Memory implementation import. |
| K-LOC-01 | Direct Office spreadsheet locations | ADAPTED, TESTED, BUILT, RESIDENT ACTIVE. Direct ExcelJS coordinates preserve sparse rows/cells; bounded source/output evidence travels through existing local read_file/MCP owners. [Design](../superpowers/specs/2026-10-26-weknora-xlsx-evidence-design.md), [plan](../superpowers/plans/2026-10-26-weknora-xlsx-evidence.md), runtime execution ledger and actual resident response support the claim.58/58 projection/XLSX/MCP/public-URL tests plus7/7 PDF-owner/manifest regressions pass. Existing native/default Excel and public URL behavior remain scoped as tested. |
| N-01 | Semantic context compaction/calibration | DEFER: richer connected donor mechanism; needs history-preservation oracle, token/provider budget and checkpoint policy. No measured equal-budget recipient benefit; no model-call/tokenizer import. |
| N-02 | Typed model output/handle registry | DEFER: preserve omission/partial-failure distinctions, but missing recipient metadata consumer not established. Core exact-revision evidence owners retained; no parallel XML/display registry. |
| N-03 | Redis live-run/steer/event suffixes | NO PORT: multi-replica product requirement absent; TTL is not a byte bound. Core persisted turn idempotency/recovery retained. |
| N-04 | MCP/sandbox/browser/clients | NO WHOLESALE PORT: preserve OAuth/tool/process/browser owners; source-specific boundaries and unsupported-platform limits are recorded in Main review. |

## Pekerjaan berikutnya

- [x] Beri semua inventory path byte/blob triage dan keputusan per keluarga; gabungkan anchors dan mechanical-only unknowns tanpa mengklaim setiap file deeply reviewed.
- [x] Reproduksi/evaluasi kandidat material dan tulis design/plan spesifik sebelum source product diubah; accepted W-02 dan K-LOC-01 memiliki oracle independen.
- [x] Implementasikan hanya kandidat yang lolos pembanding; pertahankan hasil negatif.
- [x] Jalankan verifikasi terarah dan build/integrasi/aktivasi yang diperlukan; ledger lengkap. Status Memory/Learning mempunyai lifecycle terpisah dan tidak disamakan dengan hasil engineering.

Native attempt pertama gagal setelah rujukan inventory relatif ditafsirkan sebagai path donor dan provider response kemudian terminated; brief wave 2 memakai path absolut dan alur lebih sempit. Ini kegagalan nyata, bukan bukti audit telah selesai.

## Reports and steering

- [Knowledge/retrieval/ingestion — Raka](weknora-donor/raka-knowledge-audit.md) dan [detail coverage](weknora-donor/raka-coverage.json).
- [Platform/storage/security/operations — Main](weknora-donor/main-platform-audit.md).
- [Native raw report](weknora-donor/native-agent-audit.md), harus dibaca bersama [Main corrections and decisions](weknora-donor/native-main-review.md). Wave3 menulis laporan setelah20 tool calls/30 provider attempts, lalu finalized failed; klaim coverage JSON/endpoint/absence tertentu di laporan mentah tidak diterima. Main review mengoreksi dan memberi disposition kandidat.
- Atas instruksi pengguna, Native diam sementara; Main lanjut bersama Raka. Raka diberi akses canonical Memory Agent Core dan task sendiri `ext-1aa385453ff442a9b33d2eca759299e8`, tanpa mengubah task Main atau grants global.
- Ide pengguna tentang multi direct access dengan satu Memory Agent Core dicatat sebagai **future/deferred**. Tidak ada pekerjaan arsitektur tersebut dalam goal ini.

## W-02 evidence and decision

Claim: structured body-read transport failures should reach the existing transient provider classification. Observed: a loopback HTTP response truncated after headers produced an opaque TypeError with a socket-code cause; the old classifier missed it. Inferred: bounded structured cause inspection improves that failure boundary without new runtime owners. Rival: a bare `terminated` can be an unrelated contract failure; it remains non-retryable. Test: real server regression plus deterministic/status/cycle/depth checks, 168/168 combined provider/outbound tests, successful build and official restart. Flip: HTTP status/deterministic parsing/caller cancellation must preserve their existing behavior; no broad regex fallback is accepted.

Exact design/plan: [spec](../superpowers/specs/2026-10-26-weknora-provider-transport-design.md), [plan](../superpowers/plans/2026-10-26-weknora-provider-transport.md). Runtime RED/GREEN JSON and build log are under `runtime/build/weknora-donor-20261026`. This is a functional recovery-boundary fix, not a measured latency improvement.

## K-LOC-01 reproduction

Raka's first focused tests invoke the existing projection owner with literal sparse coordinates and fail2/2 on missing sparse text/metadata (`runtime/build/weknora-donor-20261026/xlsx-red.log`). Main independently generated a separate7,077-byte synthetic workbook and called current compiled `documentProjectionService.projectBytes`: A1 header survives, Z100 and second-sheetB7000 values are absent, with no XLSX evidence. Raw report: `xlsx-sparse-before.json`. This establishes a functional loss in the old path; it does not yet verify the implementation or claim formula correctness/quality/latency gains.

## Final activation and acceptance

The selected local XLSX/XLSM implementation fixes the count-as-coordinate defect using actual data-bearing row numbers and cell addresses. Limits:8 sheets,5,000 data-bearing rows/sheet,128 physical columns,65,536 rectangular slots,2,048 codepoints/cell and incremental4MiB output admission. Sidecar limits:128 cells,160-codepoint escaped excerpts,16KiB compact JSON. Source SHA-256 and exact output spans are retained only while body binding is exact; redaction/preview clears pointers. Formula values are cached, no recalculation/macros/external links are executed, merged/hidden states are disclosed. ExcelJS parser allocations precede renderer limits and are not a sandboxed peak-memory guarantee.

Raka delivered18 new XLSX tests;58/58 tests passed in four focused files. Main independently added two parsed-PDF owner-marker delivery regressions and ran the MCP manifest contract:7/7 passed in two files. W-02's eight provider/outbound files passed168/168 earlier. These are233 targeted tests across three focused runs, not a full repository suite. Main reviewed independent literal fixtures, actual serialized outputs and source wiring. First integrated build caught TS2352 in a generic fallback cast; matching the existing `as unknown as T` convention corrected this compile-only issue, then `npm run build` passed (471 authored files, zero path exceptions).

Official final restart `b800905190d8402da589aa3700c687ea` completed exit0 at2026-10-26T16:33:13Z. ResidentPID12116 started16:32:54Z from `dist/index.js`; `/health` reports OK and build not stale. A real fresh-contract Agent Core plugin `read_file` against the preserved7,093-byte benign workbook returns all four literal locations A1/Z100/D90000/B7000, complete content/location coverage, exact body binding and every excerpt span equal to delivered Unicode text. Artifacts: `runtime/build/weknora-donor-20261026/xlsx-live-mcp-result.json`, `xlsx-sparse-after.json`, `final-resident-health.json`, `final-integrated-build.log`, `shared-budget-final-green.json` and `xlsx-execution.md`.

Structural second opinion: provider graph initially advertised current but missed the new helper. A scoped index refresh completed (22,287 entities/140,854 relationships; counts include preexisting working-tree material). Both sampled symbols then resolve; caller traces identify projection service, local file route, handler and shared budget. Exact source confirms only local `projectionToFileResult(...,{includeXlsxEvidence:true})` enables metadata; both URL call sites retain the default. One same-named object `convert` graph anchor points to another converter, so exact source overrides that ambiguous anchor. No graph metadata repair or global architectural gate was added.

No donor service, dependency install, external message, Git commit/push or product release occurred. Native stays quiet per user; Raka used canonical historical Memory but its exact-task receipts/finalization were refused after shared-head rotation. That limitation is preserved without touching another task's checkpoint. The multi-direct/shared-Memory architecture idea remains deferred.

## Memory and Learning finalization

Main resumed only its own task. Exact digest-bound `mind-control` and `performance-oriented-software-engineering` adapted-use receipts were recorded successfully; this records actual use, not causal benefit. Canonical task event revision2 and capsule `570c04fe-65b7-4e01-9fe5-7530429c642b` preserve the outcome, selective-coverage limits and user deferral. Its observations are explicitly unverified controller continuity, not host-certified truth. A separate workspace-file `evidence_capture` timed out; commit status is unknown and the operation was not duplicated. No raw Memory files were edited.

Main Learning checkpoint `weknora-donor-agent-core-upgrade-20261026-final-v1` was recorded once. Exact-task review completed with disposition `awaiting-verification`, because no sealed independent host workflow manifest exists. No new durable verified claim or Skill/procedure was promoted. Reported engineering outcome and repeatable tests/resident results remain distinct from host `verificationStatus: unavailable`. Raka's separate Learning finalization remains unavailable after its shared-head rotation; no other task's checkpoint was reviewed or cleared. Basic Memory/Cortex continuity is synchronized separately with these limits.
