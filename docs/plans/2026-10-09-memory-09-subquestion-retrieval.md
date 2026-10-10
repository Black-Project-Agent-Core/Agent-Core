# Bounded Subquestion Retrieval Implementation Plan

**Goal:** Membantu controller eksternal ChatGPT/Claude mencari bukti beberapa bagian pertanyaan kompleks melalui tool recall existing, dengan coverage dan batas biaya yang terlihat.

**Architecture:** Controller menyusun maksimal empat subpertanyaan; Agent Core tetap menjadi body retrieval. Protokol dokumentasi dan helper deterministik menguji batas, dedup ID/revision serta coverage tanpa model internal atau framework baru. Eksekusi serial menjadi jalur dasar.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Vitest, Zod dan crypto existing; tanpa LlamaIndex, Anthropic SDK atau dependency baru.

**Spec:** Kontrak mandiri berikut. **Status: IMPLEMENTED — OFFLINE GATE PASS (2026-10-10).** Helper, protokol opt-in, replay synthetic melalui owner/host existing dan contoh schema aktual telah diimplementasikan. Bukti RED/GREEN/gate dicatat di laporan implementasi; perintah pada task di bawah tetap spesifikasi historis. Integrasi `docs/CODEBASE.md`, release intent/version dan ZIP akhir dimiliki parent. ChatGPT/Claude live tetap NOT RUN; benchmark performa deferred.

**Baseline:** Publikasi rencana `4b3e32d464b98aa5116df02e8fe524217d5ad811`; checkout inspeksi HEAD `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3` dengan 174 path staged. Source yang dibaca adalah working tree; ketiganya tidak diasumsikan identik. Implementasi harus merekam identitas tree/file, bekerja di checkout bersih yang disetujui dan mempertahankan staging asing.

## Global Constraints

- Tidak membaca `.env`, secrets, runtime Memory pribadi atau folder terlindungi. Fixture dan transcript hanya synthetic; jangan merekam chain-of-thought privat.
- Tidak ada agent framework, planner model tersembunyi, global scheduler, tool baru wajib, provider call atau Native controller rewrite.
- Tool grants, authenticated binding, disclosure budget dan eligibility existing tetap berlaku setiap request. Kumpulan hasil bukan otorisasi atau cache ACL.
- Protokol bukan jaminan aplikasi ChatGPT/Claude mematuhinya. Prompt MCP tidak dapat memaksa reasoning ataupun memperluas tool support aplikasi.
- Probe Cloudflare/cohort lama yang dihentikan tetap berhenti. Acceptance offline terpisah dari observasi controller live.
- Rencana bukan izin implementasi, instalasi, publish/release/deploy. `docs/CODEBASE.md` berubah kelak setelah kode/protokol benar-benar diimplementasikan.

## Bukti sumber dan distinct-scope matrix

`SubProject/agent-core-memory/src/memory/disclosure.ts:16–45` memiliki RecallInput, MemoryHit, RecallPage dan exact-revision ExpandInput; hit membawa revision, applicability, freshness, verification dan retrievalEvidence. `controller-session.ts:98–149` memilih eligible records, membatasi payload dan mengembalikan partial/nextCursor. `controller-protocol.ts` memetakan `memory_recall`/`memory_expand` ke session existing. MCP host `src/mcp/memory-experience-tools.ts:6–46` mengekspos facade `memory_v2_read` dengan action `recall`, `expand`, `capabilities`, `task_context`, bukan tool top-level bernama memory_recall. `src/mcp/memory-tools.ts:139–170` menyediakan legacy memory_read/search.

| Rencana existing | Batas scope 09 |
|---|---|
| 01 filtered semantic | Recall dipakai apa adanya; tidak mengubah corpus/vector eligibility |
| 02 ranking policy | Merge menjaga urutan per pertanyaan, tidak mengganti fusion/score |
| 03 task/workspace | Menggunakan scope terverifikasi; tidak membuat binding dari label model |
| 04 contextual index | Tidak menambah enrichment/index/entity graph |
| 05 outcome evaluation | Fixture protokol lokal, bukan harness kemampuan end-to-end baru |
| 08 query cache | Cache hanya optimasi opsional; bukan dependency |
| Adaptive parallel | Tidak menjadwalkan resource atau mewajibkan overlap; serial cukup |

[Claude Cookbook SubQuestionQueryEngine](https://platform.claude.com/cookbook/third-party-llamaindex-subquestion-query-engine), diverifikasi 2026-10-09, memperlihatkan pertanyaan lintas dokumen dipecah menjadi pertanyaan lebih kecil sebelum jawaban gabungan. Adaptasi mengambil pola dekomposisi dan atribusi bukti saja; tidak menginstal LlamaIndex, mengadopsi model contoh, atau menganggap hasil contoh sebagai kualitas Agent Core.

## Spesifikasi mandiri dan batas enforcement

Trigger: pertanyaan mempunyai dua atau lebih kebutuhan bukti yang dapat dinyatakan terpisah, misalnya membandingkan keputusan dua periode dan alasan perubahan. Pertanyaan lookup tunggal menggunakan recall biasa. Controller menyatakan daftar kebutuhan bukti singkat, bukan reasoning privat. Memory-first dan lifecycle existing tetap berlaku; protokol tidak membangun gate yang menghalangi pekerjaan aman ketika Memory unavailable.

Urutan: discover tool/capabilities aktual → satu recall pertanyaan asli → bila coverage belum cukup, buat 2–4 subpertanyaan unik → recall serial → merge → expand bukti paling relevan → jawab dengan sumber dan gap. Root recall dan subquestion tidak boleh dicampur lintas workspace/task. Jika binding tepercaya tidak tersedia, tandai BLOCKED untuk mode v2, jangan menciptakan taskId dari prompt. Legacy boleh dipakai secara eksplisit untuk jawaban biasa, tetapi tidak diklaim lulus exact-revision acceptance v2.

Batas usulan per sesi: maksimum 4 subpertanyaan, 6 recall calls total termasuk root/retry/continuation, 2 expand calls termasuk continuation, total response payload 32.768 bytes, setiap call meminta maksimum 4.096 bytes, batas elapsed 15.000 ms memakai monotonic clock. Bootstrap inventory/capabilities dicatat terpisah; tidak disembunyikan dari total tool-cost laporan. Tidak ada recursion/decomposition ulang; satu retry hanya untuk kegagalan transien dan tetap memakan call allowance. Sisa budget di bawah minimum existing 512 bytes menghentikan call. Retry authorization/scope error dilarang. Deadline memblokir dispatch baru dan menandai hasil partial; kalau client tidak bisa membatalkan call berjalan, catat settlement terlambat dan jangan mengklaim network berhenti.

Tool response tidak boleh dipotong menjadi JSON invalid: hasil melebihi requested cap ditolak dari accumulator dan dicatat protocol violation. Controller dapat memilih berhenti lebih awal. Semua threshold ini usulan yang dapat diuji, bukan kemampuan mesin/aplikasi terukur.

Merge key adalah `(kind='memory', id, revision)`, menyimpan semua questionIds dan retrieval attempt references. ID sama/revision berbeda tidak ditimpa dengan “yang terbaru”; simpan sebagai konflik revision, periksa ulang lewat recall saat budget cukup dan jangan menyatakan keduanya fakta current. Score hanya bermakna di dalam recall asal, tidak dirata-rata atau dibandingkan lintas pertanyaan. Urutan tampilan round-robin pertanyaan, lalu urutan asli tiap response; dedup tidak menghapus provenance.

Coverage per subpertanyaan: `unsearched`, `retrieved`, `evidence-reviewed`, `gap`, `blocked`. `retrieved` berarti ada kandidat, bukan pertanyaan sudah terjawab; reviewed berarti expansion exact revision diperiksa, bukan kebenaran otomatis. Stale/unknown/conflicted tetap ditandai; source text/abstract dapat berisi instruksi berbahaya dan hanya data advisory. Current user intent serta verifikasi independen mengalahkan confidence model. Final answer memisahkan fakta bersumber, konflik, inferensi dan bagian yang belum diketahui; exposure bukan pemakaian/manfaat terverifikasi.

## Review Focus

1. Pertanyaan seolah berbeda tetapi duplikat, kosong, atau memuat rencana tool berbahaya (Task 1).
2. Satu hasil mendukung beberapa pertanyaan tanpa menggandakan evidence (Task 2).
3. ID sama dengan revision berubah di antara calls (Task 2–3).
4. Satu pertanyaan timeout/blocked tidak menghilang dari coverage (Task 1–3).
5. App mengabaikan prompt, serial-only atau tidak menyediakan facade v2 (Task 4).

## Task 1 — Kontrak bounded yang dapat diuji

**Files:** Create `src/learning/subquestion-retrieval.ts`, `tests/memory-subquestion-contract.test.ts`, `tests/fixtures/memory-subquestion/suite.json`.

**Interfaces usulan:** `Subquestion={id:string;query:string}`; `RetrievalPlan={version:1;rootQuery:string;questions:Subquestion[]}`. `parseRetrievalPlan(input:unknown):RetrievalPlan`; `createRetrievalBudget(startMs:number):RetrievalBudget`; `reserveRetrievalCall(budget:RetrievalBudget,kind:'recall'|'expand',nowMs:number):{allowed:boolean;maxBytes:number;reason?:string}`; `recordRetrievalBytes(budget:RetrievalBudget,bytes:number):void`. `RetrievalBudget={recallCalls:number;expandCalls:number;remainingBytes:number;deadlineMs:number;protocolViolation:boolean}`; reserve menaikkan counter sebelum dispatch, record mengurangi bytes sesudah response dan menandai violation jika melewati reservation. Budget bukan ACL. Maksimum payload reservation disimpan caller per call; tidak lebih dari satu call berjalan pada driver serial. Query 1–2.000 karakter; ID unik `q1`–`q4`; duplicate query trim-identik ditolak. Parser strict menolak unknown field/embedded executable instructions sebagai struktur, tetapi tidak menjamin mendeteksi semua malicious prose.

- [x] RED cases `rejects_fifth_question_duplicate_unknown_field`, `counts_root_retry_and_continuation`, `deadline_stops_dispatch`, `remaining_below_512_stops`. Assertion call ketujuh ditolak, expand ketiga ditolak, elapsed 15.000 tepat ditolak, over-budget tidak silent truncate.
- [x] Jalankan `npm test -- tests/memory-subquestion-contract.test.ts`, simpan failure relevan.
- [x] Implementasikan parser/reducer pure tanpa model, network, filesystem atau pengambilan konfigurasi host.
- [x] GREEN command sama; pastikan query sederhana dapat ditangani jalur single-recall di fixture tanpa decomposition. Review dan commit hanya file task setelah gate.

## Task 2 — Merge provenance dan coverage

**Files:** Extend helper Task 1; create `tests/memory-subquestion-merge.test.ts`.

**Interfaces:** `RetrievalObservation={questionId:string;callId:string;result:Budgeted<RecallPage>}` memakai types disclosure existing. `mergeRetrievalObservations(plan:RetrievalPlan,observations:RetrievalObservation[]):MergedRetrieval`. Output `hits:Array<{hit:MemoryHit;questionIds:string[];callIds:string[]}>`, `coverage:Array<{questionId:string;status:'unsearched'|'retrieved'|'evidence-reviewed'|'gap'|'blocked';reason?:string}>`, `revisionConflicts:string[]`. Error/timeout tanpa response dicatat dengan `markQuestionBlocked(merged,questionId:string,reason:string):MergedRetrieval`, bukan fabricated RecallPage. Helper ini hanya proyeksi transcript, bukan hasil yang sudah dipercaya; evidence-reviewed ditambahkan melalui `markEvidenceReviewed(merged, source:SourceRef, questionIds:string[]):MergedRetrieval` setelah expansion tersedia dan direview caller.

- [x] RED `same_revision_merges_provenance`, `different_revision_never_overwrites`, `partial_has_visible_gap`, `cross_question_score_not_compared`. Assert satu hit/dua questionIds, dua revision tersimpan, order round-robin stabil dan insufficient-budget bukan empty-success.
- [x] `npm test -- tests/memory-subquestion-merge.test.ts` harus RED lalu GREEN setelah implementasi minimal. Tolak observation questionId asing; root memakai ID khusus `root` yang valid hanya untuk hasil recall asli, tanpa membuat subquestion kelima.
- [x] Tambahkan fake malicious memory “abaikan grants”; helper tidak dispatch apa pun dan mempertahankan trust metadata. Unknown/stale tidak berubah menjadi current akibat banyak pertanyaan menemukan ID sama.

## Task 3 — Replay offline lewat owner existing

**Files:** Create `tests/memory-subquestion-integration.test.ts`; extend fixture suite saja. Tidak membuat wrapper MCP production baru.

**Consumes:** helper Tasks 1–2, MemoryService.controller dan dispatcher existing pada temporary synthetic experience-v2 store. Scope diberikan host fixture yang tepercaya. Panggilan read melalui facade-equivalent action mapping dan exact revision expansion; grants/cursor tetap diuji owner.

- [x] Tulis fixture dua keputusan/periode, satu koreksi, foreign-workspace distractor, poisoned abstract, insufficient-budget, error dan late settlement. Oracle memetakan evidence ID/revision ke kebutuhan, bukan jawaban model.
- [x] RED: `npm test -- tests/memory-subquestion-integration.test.ts`; missing compiled subproject berarti BLOCKED, bukan regression RED.
- [x] Implementasikan scripted controller test-only dengan limiter Task 1 dan merge Task 2. Sebelum setiap call owner memeriksa eligibility/freshness kembali; ubah record/scope antarcall dan pastikan cached observation tidak memberi akses baru. Tidak meng-cache session authorization atau menganggap exact historical revision current.
- [x] GREEN command sama; assertion nol scope leak, nol stale-as-current, maksimum calls/bytes/deadline, pertanyaan gagal tetap terlihat. Scripted decomposition tidak membuktikan ChatGPT/Claude sungguhan memilih subpertanyaan baik.

## Task 4 — Protokol controller dan acceptance

**Files:** Create `docs/Memory-Subquestion-Retrieval-Protocol.md`; modify bagian continuity-sensitive recall pada `AGENTS.md` secara sempit saat implementasi; update `docs/CODEBASE.md` setelah verifikasi.

- [x] Tulis contoh payload aktual `memory_v2_read` action recall/expand dan fallback yang dilabeli; jangan mengiklankan memory_recall sebagai nama MCP host. Tuliskan batas, jawaban coverage dan stop condition; tidak mengubah memory-first/Learning/security owner.
- [x] Tambahkan `tests/memory-subquestion-protocol.test.ts`: RED terhadap contoh schema/nama tools yang belum ada; GREEN sesudah setiap contoh diparse schema dan mapper existing. Test script memverifikasi kontrak dokumentasi, bukan kepatuhan reasoning app.
- [x] Gate: `npm --prefix SubProject/agent-core-memory run build && npm run build && npm test -- tests/memory-subquestion-contract.test.ts tests/memory-subquestion-merge.test.ts tests/memory-subquestion-integration.test.ts tests/memory-subquestion-protocol.test.ts tests/memory-v2-host-integration.test.ts`. Missing dependency/setup BLOCKED; tidak install otomatis.
- [ ] **NOT RUN — optional live acceptance.** Observasi app sungguhan opsional memerlukan akses/otorisasi terpisah: tampilkan synthetic multi-part prompt, rekam tool trace/calls/coverage tanpa chain-of-thought. Catat ChatGPT dan Claude secara terpisah; unavailable atau ignored protocol tetap NOT RUN/BLOCKED/noncompliant. Tidak menjanjikan parallel calls atau model internal baru.

## Laporan, rollback dan acceptance mandiri

ZIP mendatang `memory-09-subquestion-retrieval-report.zip` wajib memuat report/results, seluruh logs RED/GREEN/regression, synthetic fixtures/transcript, coverage dan revision traces, focused patch, source identities dan manifest path/bytes/SHA-256. Catat command/cwd/exit code/waktu, PASS/FAIL/BLOCKED/NOT RUN, limits dan batas klaim. Tidak ada secrets, `.env`, private Memory, Git metadata atau arbitrary file cap. Ekstrak ke folder baru, tolak traversal/duplicate/symlink, verifikasi exact membership/ukuran/hashes; checksum ZIP di luar paket. Gate gagal atau extraction gagal berarti belum selesai.

Acceptance mandiri: protokol, helper dan replay offline lolos tanpa lima rencana terdahulu. Kepatuhan controller live, kualitas dekomposisi dan manfaat reasoning tetap unproven; plan 05 dapat mengevaluasinya kemudian tetapi bukan dependency. Rollback menghapus opt-in panduan/helper lewat revert commit terarah, menyimpan bukti, tanpa reset canonical Memory, grants atau staged pekerjaan lain. Tidak ada migrasi, activation atau rollout otomatis.

## Implementation record — 2026-10-10

- Scope implemented: `src/learning/subquestion-retrieval.ts`, four `tests/memory-subquestion-*.test.ts` suites, `tests/fixtures/memory-subquestion/`, `docs/Memory-Subquestion-Retrieval-Protocol.md`, and one continuity-sensitive guidance bullet in `AGENTS.md`. No new production MCP registration, runtime activation, migration, dependency or provider call.
- Parser accepts zero questions for single lookup, otherwise 2–4 unique q1–q4 questions; strict executable structure rejection is not a malicious-prose detector. Budget has one outstanding serial reservation, pre-dispatch call accounting, actual complete disclosure-envelope bytes, minimum/deadline/clock-regression guards and whole-response rejection on cap violation.
- Merge retains exact ID/revision tuples, all question/call/attempt provenance and per-origin score/trust labels. Display order is round-robin; scores are never aggregated across queries. Projection conservatively preserves unverified/stale/unknown evidence. Conflicting revisions retain both and cannot promote reviewed coverage until independently resolved outside this helper.
- Synthetic driver uses actual `memory_v2_read` registration/schema and the existing owner dispatcher, fresh scope resolution on every call, one transient retry, no authorization retry, visible insufficient-budget/error/timeout/deadline states and uncancelled late settlement. No injected response is mistaken for a successful owner page. Oracle maps fixture ID/revision to needs, not model answers.
- TDD records include initial RED for missing helper/merge/test-only replay/document and separate assertion-level RED/GREEN for unique conflict reasons and conservative verification. Compiled owner was present; the replay RED was missing new test-only controller, not a missing dependency. Intermediate failed GREEN runs are retained and explained in the evidence report.
- Final gate: `npm --prefix SubProject/agent-core-memory run build && npm run build && npm test -- --maxWorkers=1 tests/memory-subquestion-contract.test.ts tests/memory-subquestion-merge.test.ts tests/memory-subquestion-integration.test.ts tests/memory-subquestion-protocol.test.ts tests/memory-v2-host-integration.test.ts` — PASS, exit 0, 5 suites / 30 tests. Root path policy PASS, 350 authored files / zero documented exceptions. Fresh replay export was enabled through a test-only evidence destination.
- Evidence is supplied to the parent in `memory-09` with command/cwd/start/end/exit logs, synthetic coverage/revision transcripts, source identities and a focused patch. Full root regression, final combined-tree validation, report ZIP extraction/membership/hash validation and CODEBASE integration are parent-owned; these are not claimed complete by this worker.
- ChatGPT live: NOT RUN. Claude live: NOT RUN. Performance benchmarks: DEFERRED. Decomposition quality, app instruction compliance and reasoning/benefit remain unproven. Canonical Memory/Learning and installed Windows runtime were not accessed.
- Version assessment: additive opt-in controller/helper capability merits a minor release intent under the combined release. Parent owns release metadata and all synchronized version surfaces; this scope does not independently bump them or publish.
