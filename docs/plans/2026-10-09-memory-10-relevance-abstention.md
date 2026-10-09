# Memory Relevance Abstention Implementation Plan

**Status: PROPOSED / NOT IMPLEMENTED.** Baseline target `4b3e32d464b98aa5116df02e8fe524217d5ad811`; checkout inspeksi memiliki HEAD `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3` dengan 174 perubahan staged. Identitas target bukan klaim HEAD lokal sama. Penyusunan hanya membaca sumber dan menulis rencana ini; tidak menjalankan source, build, test, provider, atau runtime pribadi.

**Goal:** Recall query boleh menyatakan bukti relevan tidak cukup, tanpa mengisi hasil dengan kandidat terbaik yang sebenarnya lemah.

**Architecture:** Tambahkan keputusan evidence deterministik sesudah scope/temporal filtering dan sebelum disclosure. Gunakan komponen ranking existing, bukan scorer/reranker kedua. Policy host opt-in dan fixture offline memisahkan perbaikan retrieval dari klaim kemampuan controller.

**Tech Stack:** Node >=24.15.0, TypeScript ESM, Vitest, Zod, MemoryService dan ControllerMemorySession existing.

**Spec:** Kontrak tertanam di bawah. Semua command adalah langkah implementasi mendatang dari root repo.

## Batas dan matriks overlap

`M/` berarti tepat `SubProject/agent-core-memory/src/memory/`; `T/` berarti `SubProject/agent-core-memory/tests/`. Prefix ini berlaku untuk seluruh daftar file dan interface.

| Rencana existing | Kepemilikan yang dipertahankan | Tambahan 10 |
|---|---|---|
| 01 filtered semantic | subset/index availability | keputusan relevance setelah kandidat eligible |
| 02 controller ranking | policy ranking, feedback, cursor snapshot | digest abstention sebagai input binding existing |
| 03 task/workspace | host identity, authorization | tidak mengubah scope |
| 04 contextual index | builder title/metadata, representation/index version | tidak mengubah representation |
| 05 outcome evaluation | end-to-end benefit/receipt | fixture relevance lokal dan confusion matrix |

Tidak membangun ulang fusion, feedback, contextual title, rollout global, ledger, atau retrieval harness besar. Plan 07 passages dan 08 query cache bersifat interoperability mendatang, bukan prasyarat. Tidak membaca `.env`, canonical runtime, secrets, atau folder terlindungi; tidak restart resident, install dependency, commit staged milik pekerjaan lain, release, maupun deployment. Pengujian memakai temporary root sintetis dan network stub yang melempar error. Cohort lama yang dihentikan dan probe Cloudflare tetap dihentikan.

## Diagnosis sumber dan referensi

`M/retrieval.ts::scoreRecord` menambahkan recency maksimum 0.05; `searchMemories` menerima `score > 0`. Karena itu record baru tanpa lexical/semantic evidence dapat melewati jalur legacy. Ini diagnosis sumber, belum reproduksi test atau observasi resident.

Fusion bukan tanpa threshold: `fusionChannelScores`, `identifierEligible`, positive-channel admission, RRF, dan `FUSION_THRESHOLD_RATIO=0.2` sudah ada. Tetapi threshold relatif terhadap kandidat teratas mengukur posisi relatif, bukan kecukupan bukti absolut. Weak-best dapat tetap lolos. BM25 dinormalisasi terhadap maksimum corpus; nilai 1 juga bukan kepastian relevansi.

`M/service.ts::controller` saat ini mengembalikan array ranking; `M/controller-session.ts::recall` mengurutkan temporal, mengikat cursor, mengukur budget, dan mencatat exposure. `M/disclosure.ts::RecallPage` belum menjelaskan alasan hit kosong. Store gagal sudah menjadi `MEMORY_SOURCE_UNAVAILABLE`; jangan menggantinya dengan abstention sukses.

[OpenAI Retrieval](https://developers.openai.com/api/docs/guides/retrieval) membahas threshold dan tradeoff hasil; [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) mendukung evaluasi spesifik tugas. Halaman diperiksa 2026-10-09. Implementasi di sini merupakan adaptasi dari sumber Agent Core; referensi tidak memberikan resep persis atau threshold yang bisa disalin ke RRF lokal.

## Kontrak keputusan

Buat `M/relevance.ts` dengan:

- `RelevancePolicy = { version:'relevance/v1'; calibrationDigest:string; minLexicalCoverage:number; minSemanticSimilarity:number }`.
- `RelevanceInput = { results:MemorySearchResult[]; eligibleCount:number; semanticStatus:'available'|'unavailable'|'disabled'; policy:RelevancePolicy }`.
- `assessMemoryRelevance(input:RelevanceInput): RelevanceDecision`.
- `RelevanceDecision = { status:'supported'|'insufficient-relevant-evidence'|'empty-corpus'; acceptedIds:string[]; policyDigest:string; semanticStatus:RelevanceInput['semanticStatus'] }`.

Coverage memakai field baru `components.contentLexicalCoverage` (0–1), bukan tokenOverlap atas gabungan metadata atau BM25 relatif. Tambahkan `components.contentExactPhrase:boolean` dan `contentLexicalCoverage:number` pada `RetrievalComponents` di `M/retrieval.ts`, dengan default false/0 dalam zero(). Hitung sekali dalam scoreRecord dari query dan record.content saja, memakai tokenizer lexical yang sama dengan channel aktif; title/context/keywords/tags/category/provenance tidak ikut. Field evidence ini tidak ditambahkan ke score atau mengubah urutan. Kandidat diterima bila contentExactPhrase true, content coverage memenuhi ambang, atau similarity memenuhi ambang dengan semanticStatus available. Nilai threshold wajib finite pada rentang (0,1]; konfigurasi gagal validasi ditolak, bukan fallback accept-all. Metadata/source/feedback/pinned/recency sendiri tidak menjadi bypass lexical content gate. Semantic evidence berasal representation existing yang dapat memuat metadata; policy tidak mengklaim semantic channel content-only atau benar secara faktual. Exact phrase tidak memberikan otorisasi atau kebenaran; ia hanya evidence lexical. Existing identifier eligibility tetap berlaku. Tak ada field probability/confidence.

Kosong berarti eligibleCount nol setelah filter; insufficient berarti eligible ada tetapi tak cukup evidence. Semantic unavailable adalah dimensi kesehatan terpisah: lexical kuat tetap dapat supported disertai warning. Jika semua lemah dan semantic unavailable, hasil tetap insufficient dengan status unavailable, bukan klaim corpus tidak memuat jawaban. Empty query/map bukan evaluasi relevance dan mempertahankan perilaku lama.

Perluas `MemoryServiceOptions` di `M/service.ts` dengan `controllerRelevancePolicy?:RelevancePolicy`, divalidasi dan disalin immutable saat initialize. Default undefined mempertahankan baseline. Backend controller mendapat readonly `relevancePolicy?:RelevancePolicy`; `recall` memanggil fungsi pure hanya bila property tersedia. Status semantic berasal envelope pemanggilan rank yang sama, bukan mutable global lintas request. Gunakan `ControllerRankedSnapshot = {results:MemorySearchResult[];rankingRevision:string;relevanceContext?:{semanticStatus:RelevanceInput['semanticStatus']}}`. Jika Plan 02 sudah ada, perluas type itu; jika belum, tambahkan envelope minimum ini dan ubah semua implementasi/fake rank secara atomik. Ini bukan implementasi fusion rollout atau feedback Plan 02. Ketika policy aktif, relevanceContext wajib tersedia; missing context adalah input/backend contract error, bukan status available yang ditebak.

`RecallPage` mendapat optional `relevance:{status:RelevanceDecision['status'];policyDigest:string;semanticStatus:RelevanceInput['semanticStatus']}`. Public input tidak mendapat knob threshold. Tidak memaparkan rejected IDs/text. Filter dilakukan sebelum paging; jika accepted kosong, hits kosong, tanpa cursor, tanpa auto-expand/fetch/provider retry. Budget tetap dihitung termasuk metadata. Ledger exposure hanya untuk data benar-benar dikirim; abstention bukan applied/adapted reuse.

## Review Focus

1. Recent/pinned distractor tanpa evidence harus ditolak (Task 1).
2. Provider gagal berbeda dari corpus kosong dan store gagal (Task 2).
3. Threshold berubah antarpages membuat cursor stale (Task 2).
4. Recall meningkat dengan harga false positives harus tampak per kelompok (Task 3).
5. Zero hit tidak memicu forced fetch atau izin tambahan (Task 2).

## Task 1 — Policy pure dan reproduksi

**Files:** Modify `M/retrieval.ts`; create `M/relevance.ts`, `T/memory-relevance-policy.test.ts`, `T/fixtures/relevance-v1/development.json`, `T/fixtures/relevance-v1/heldout.json`.

- [ ] Tulis `recent_only_and_weak_best_abstain`: fixed clock, query tanpa kecocokan, recent legacy score positif; fake semantic sangat lemah menghasilkan fusion kandidat tetapi decision insufficient. Tambahkan exact content positive, coverage boundary, unavailable semantic, NaN/Infinity, pinned distractor, eligibleCount=0. Fixture metadata-only (query tepat di context/keywords/title, tidak di content, semantic disabled) wajib insufficient walau old exactPhrase/tokenOverlap tinggi; assert score/ranking tidak berubah karena field evidence baru. Threshold unit test adalah fixture eksplisit, bukan default produksi.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-relevance-policy.test.ts`; kegagalan wajib interface belum ada/assertion relevance, bukan dependency.
- [ ] Implementasikan evidence content-only pada scoreRecord dan fungsi pure/validasi; update zero() serta fake RetrievalComponents secara atomik. Field evidence hilang pada candidate aktif ditolak sebagai contract error, bukan fallback ke metadata score. Preserve urutan IDs accepted dari ranking, tanpa sorting ulang atau membaca filesystem.
- [ ] GREEN: ulang command hingga PASS. Review patch task; commit terfokus hanya pada checkout implementasi bersih.

## Task 2 — Integrasi controller dan disclosure

**Files:** Modify `M/service.ts`, `M/controller-session.ts`, `M/disclosure.ts`; create `T/memory-relevance-controller.test.ts`.

**Interface:** backend rank tetap satu owner: `rank(records:MemoryRecord[],query:string,rankingTime:number):Promise<ControllerRankedSnapshot>`. Audit seluruh fake rank. Tanpa Plan 02, `rankingRevision` adalah digest versioned policy baseline, semantic availability, provider/model/dimensions, serta sorted entry ID/fingerprint snapshot yang sama; tanpa semantic gunakan sentinel eksplisit. Jangan memasukkan timestamp request. Integrasi Plan 02 kemudian memakai digest owner tersebut, bukan dua revision paralel.

- [ ] Tulis `no_evidence_has_no_cursor_or_fetch`, `semantic_failure_preserves_lexical_support`, `empty_is_not_unavailable`, `store_failure_stays_error`, `policy_change_stales_cursor`; spy expand/embed retry harus nol. Tambahkan foreign, forgotten, superseded, stale, low budget 512, restart, dan map query kosong.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-relevance-controller.test.ts`.
- [ ] Integrasikan keputusan sebelum slicing; tambahkan policyDigest dan accepted IDs ke snapshot binding yang sama milik Plan 02. Tanpa Plan 02, pertahankan cursor existing dan perluas input digest saja. Jangan memasukkan access counters atau clock baru. Source/provenance/permission checks dan ledger failure tetap fail-closed.
- [ ] GREEN: ulang test lalu `npm --prefix SubProject/agent-core-memory test -- tests/memory-controller-scope.test.ts tests/memory-controller-continuation.test.ts tests/memory-disclosure.test.ts`. Commit terfokus setelah review.

## Task 3 — Kalibrasi, acceptance, dan rollback

**Files:** Create `T/memory-relevance-evaluation.test.ts`; update `docs/CODEBASE.md` hanya setelah implementasi.

- [ ] Bekukan corpus/query/label/digest; pisahkan keluarga development dan heldout agar varian near-duplicate tidak lintas partition. Development mencakup positif/negatif, typo, semantic-only, exact identifiers, metadata distractor, provider unavailable. Semua memakai fake deterministik dan jam tetap.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-relevance-evaluation.test.ts`; assert evaluator menolak overlap partition, threshold berubah setelah seal, dan baris gagal hilang dari denominator.
- [ ] Ukur baseline development; enumerasi pasangan threshold dari nilai coverage/similarity development, pilih precision-first dengan recall floor serta toleransi latency yang dipraregistrasikan berdasarkan kebutuhan tugas. Simpan angka final, metode tie-break (recall tertinggi, lalu threshold lexical/semantic leksikografis), baseline digest, sample size, tradeoff yang diterima. Jika tidak ada pasangan memenuhi batas, hasil no-go, bukan menurunkan target setelah melihat heldout.
- [ ] GREEN: implementasikan evaluasi lokal dalam test; segel policy/preregistration sebelum sekali membuka heldout. Laporkan TP/FP/TN/FN, precision, recall, false-abstention, false-support, coverage, latency p50/p95 per kelompok dan jumlah unknown. Tidak mengubah threshold berdasarkan heldout; revisi memerlukan heldout baru.
- [ ] Gate: `npm --prefix SubProject/agent-core-memory run verify && npm run build && npm test -- tests/memory-v2-host-integration.test.ts tests/memory-bm25-ranking.test.ts`. Dependency hilang berarti BLOCKED, tidak install otomatis. Safety gate nol scope leak, forced fetch, stale trust, atau klaim manfaat palsu.

Acceptance mandiri berarti test/gate PASS, evaluasi lengkap dan tradeoff memenuhi preregistration; bukan bukti peningkatan reasoning live. Plan 07 nanti menerapkan decision terhadap parent canonical setelah passage aggregation dan membawa `parentId/revision`; Plan 08 hanya menyimpan query vectors: policyDigest bukan bagian key karena tidak mengubah embedding input. Versi abstention masuk binding ranking/cursor Plan 02; Plan 08 berubah hanya bila actual embedding text atau embedder identity berubah. Tidak ada import ke modul future. Rollback meniadakan host option, mengembalikan patch terarah, membiarkan cursor candidate stale; canonical memory tidak dihapus.

Hasil implementasi wajib `memory-10-relevance-abstention-report.zip`: report, semua result/negative fixtures, preregistration, failed/red/green/build logs dengan command/cwd/exit code, fake identity, baseline/candidate hashes, focused patch, dan manifest setiap path/bytes/SHA-256. Gunakan ZIP dependencies existing; keluarkan `.env`, secrets, runtime pribadi, Git metadata. Ekstrak ke direktori baru, verifikasi exact membership dan hash semua payload, simpan SHA-256 ZIP terpisah. Complete hanya bila gate wajib dan extraction PASS; live/provider tetap NOT RUN atau BLOCKED sampai izin terpisah.
