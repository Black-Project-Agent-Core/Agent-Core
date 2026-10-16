> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Derived Passage-Level Retrieval Implementation Plan

**Goal:** Menemukan bagian relevan dari catatan panjang melalui vector per passage, tanpa menjadikan passage Memory canonical baru.

**Architecture:** MemoryIndex existing menyimpan children turunan di bawah entry parent. Retrieval mengagregasi semantic score passage menjadi satu hasil parent; owner canonical tetap mengatur scope, retention, temporal state, revision, dan penghapusan. Format/version/fingerprint mengikuti satu jalur representation existing.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Vitest, filesystem atomic write dan fake `MemoryEmbedder`; tanpa database/dependency baru.

**Spec:** Kontrak mandiri dokumen ini.

**Status: IMPLEMENTED IN SOURCE — OFFLINE FUNCTIONAL VERIFICATION RECORDED (2026-10-10).** See the [combined source ledger](../verification/memory06-11-source-functional-2026-10-10.md) for exact source identities, RED/GREEN cases, final affected gates, original timeout failures with separate assertion-preserving diagnostics, inherited root failures and sanitized report verification. Source version is `0.15.0-beta.2`; Windows beta.1 acceptance is separate. Performance benchmarks, real providers and live controller benefit are NOT RUN. Commands and checklists below retain the original specification; current implementation adapts the consolidated Plans01–05 owners rather than historical signatures.

## Global Constraints

- `M/` = `SubProject/agent-core-memory/src/memory/`; `T/` = `SubProject/agent-core-memory/tests/`.
- Corpus synthetic dan fake embedder saja. Dilarang membaca `.env`, runtime privat, secrets, atau menghidupkan provider/resident.
- Tidak ada canonical store kedua, knowledge node baru, LLM enrichment, summarization, reranker, atau hidden cloud call. Tidak mengubah bobot/fusion/feedback.
- Plan 04 tetap utuh: ia mempertahankan chunk limit existing. Plan 07 mengubah granularity; tidak menyalin pekerjaan metadata enrichment 04 atau menganggapnya telah implemented.
- Implementasi mendatang memakai checkout bersih dan commit targeted; jangan membawa 174 staged file unrelated. Tidak ada release/deployment/credential changes dalam acceptance.

## Review Focus

1. Bukti di tengah/bagian akhir catatan sangat panjang, termasuk coverage cap (Task 1).
2. Unicode/CRLF dan overlap: span tidak berasal dari normalisasi provider (Task 1).
3. Edit metadata/content, deletion, corrupt index atau crash: child lama tidak dipercaya (Task 2).
4. Parent asing/superseded dan banyak child satu parent: tidak bocor atau memenuhi seluruh top-k (Task 3).
5. Query score tidak merusak nearest/diversity existing atau menaikkan trust (Task 3).

## Bukti source dan coverage matrix

`M/embedder.ts` memakai `MAX_CHUNK_CHARS=1600`, `MAX_CHUNKS_PER_DOCUMENT=6`, whitespace normalization, lalu `averageVectors` per input dokumen. Ini batas JavaScript string length, bukan jumlah token. Algoritma dapat melewati bagian tengah long content; bukan enam passage yang dapat dicari sendiri. `M/index.ts::IndexEntry` mempunyai satu `embedding`, sedangkan `semanticContext` mengembalikan `vectors:Map<parentId,vector>`. `M/retrieval.ts::scoreRecord` menghitung cosine satu vector itu; `nearest` dan diversity juga memakai vector record. Jadi masalahnya bukan sekadar panjang preview 06.

| Rencana existing | Kontribusi | Batas terhadap 07 |
| --- | --- | --- |
| 01 | Semantic eligible subset | Tidak membuat child vectors |
| 02 | Fusion/feedback policy | Tidak mengubah granularity |
| 03 | Binding task/workspace host | Tidak memecah record |
| 04 | Metadata representation dan invalidasi | Eksplisit mempertahankan chunk limit |
| 05 | Evaluasi outcome | Tidak menyediakan index passage |
| 06 | Excerpt query-time dengan exact span | Tidak membuat retrieval vector per passage |

[Contextual Embeddings](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide), diverifikasi 2026-10-09, menyimpan embedding dan metadata per chunk, lalu membandingkan retrieval; contextualization recipe memakai Claude. Adaptasi sendiri: children lokal deterministik dan konteks allowlisted existing, tanpa generation. [RAG guide](https://platform.claude.com/cookbook/capabilities-retrieval-augmented-generation-guide) memisahkan retrieval metrics dari end-to-end accuracy. Angka recipe bukan target/hasil Agent Core. [Citations](https://platform.claude.com/cookbook/misc-using-citations) menginspirasi keterlacakan sumber; exact public excerpt tetap kontrak 06, bukan API citation cloud.

## Kontrak dan keputusan

Buat `M/passages.ts`:

- `PassageDescriptor={id:string; parentId:string; parentRevision:Digest; start:number; end:number; text:string; fingerprint:string}`. Start/end adalah interval half-open code points pada content asli, sama makna span 06; tidak memakai offset hasil provider normalization.
- `PassageProjection={version:1; passages:PassageDescriptor[]; coverage:'complete'|'partial'; totalCodePoints:number; coveredThrough:number}`.
- `buildMemoryPassages(record:MemoryRecord):PassageProjection`.

Window deterministik maksimum 600 code points, overlap 80, stride 520; semua bagian berturut-turut sampai akhir, tanpa whitespace trim pada `text`. Maksimum 128 passage/parent; jika lebih panjang, coverage partial dan coveredThrough wajib terlapor, tail di luar cap tidak diklaim searchable. Empty content menghasilkan zero child. Angka ini batas biaya implementasi, bukan rekomendasi universal; simpan di chunker version fingerprint. Emoji maksimal dua UTF-16 units sehingga body <=1.200 units; embedding text dibangun dengan `buildSemanticDocument({...record,content:passage.text})`. Jika metadata membuat input >1.600 UTF-16 units, passage semantic ditandai unavailable dengan reason `passage-input-too-large`, tanpa truncation tersembunyi atau average multiple chunks. Legacy lexical masih tersedia. Plan 04 bila tersedia memberi representation yang sama; 07 tidak menambah title sendiri.

ID child adalah SHA-256 tuple parentId, parentRevision, chunkerVersion, start/end; fingerprint mencakup exact slice, representation text/version, chunker config dan embedder identity. Revision memakai `memorySemanticRevision`; mutable access stats tidak mengubahnya. Parent metadata tidak disalin menjadi authority: lookup parent canonical pada query, lalu apply eligibility existing sebelum scoring child.

Extend `IndexEntry` dengan optional `passages?:Array<PassageDescriptor & {embedding?:number[]}>` dan `passageCoverage?:Omit<PassageProjection,'passages'>`; data ini private derived, bukan public record. Format file 4 dengan `granularity:'record'|'passage'`, `passageVersion:1`, `semanticDocumentVersion:number`. Bila 04 sudah ada, reuse constant/fingerprint/version validation (format 3 ke 4); bila belum, tulis representation version 1 untuk builder sekarang, tanpa metadata behavior 04. Jangan membuat jalur cache/version kedua.

`MemoryIndex` constructor mendapat optional third argument `{granularity?:'record'|'passage'}` default record. Passage mode menyimpan `entry.embedding` sebagai normalized mean seluruh valid child vectors hanya untuk nearest/diversity compatibility; semantic query score memakai maximum child cosine, bukan mean. `SemanticSearchContext` mendapat optional `passageScores:Map<string,{score:number;passageId:string;start:number;end:number;parentRevision:Digest}>`. Vectors existing tetap aggregate untuk neighbor/MMR; `scoreRecord` menggunakan score passage bila ada, bobot unchanged. Parent tanpa satu pun child valid tidak memperoleh semantic score; corpus dengan child belum ter-embed melaporkan embedding degraded, bukan complete coverage semantik. Clamp score ke [0,1] seperti existing. Ties child berdasarkan start lalu id. Hasil tetap satu parent, limit/top-k menghitung parents; repeated overlap tidak menambah score/support.

## Task 1 — Segmentation dan coverage deterministik

**Files:** Create `M/passages.ts`, `T/memory-passages.test.ts`.
**Consumes:** builder/revision existing. **Produces:** kontrak segmentation di atas.

- [ ] Tulis RED `middle_is_covered`: 20.000 code points synthetic, tiga oracle di head/middle/tail. Union rentang meliputi seluruh content; setiap slice exact, max600, overlap80, ID deterministik. Sertakan baseline fixture yang menunjukkan satu mean record kehilangan signal middle, bukan menyimpulkan dari import failure.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-passages.test.ts`, simpan RED.
- [ ] Implementasikan chunker tanpa provider; uji empty, 600/601, emoji/CRLF, boundary overlap, >128 children, metadata overlength, perubahan access stats versus canonical metadata. Cap menghasilkan partial eksplisit.
- [ ] GREEN command sama; review/commit hanya file task.

## Task 2 — Derived index, invalidasi, incremental rebuild

**Files:** Modify `M/index.ts`; create `T/memory-passage-index.test.ts`. Reuse `M/embedding-repair.ts` tanpa store retry baru.
**Consumes:** Task 1, fake MemoryEmbedder identity, atomicWrite existing. **Produces:** format4 dan passage-mode build/query.

- [ ] RED: rebuild dua parents; fake call log menunjukkan satu vector per eligible-size passage; ensure unchanged memanggil zero document embedding. Format2/3 tidak boleh trusted sebagai passage format4.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-passage-index.test.ts` dan simpan kegagalan.
- [ ] Implementasikan format validation, child fingerprint dan repair keys memakai child IDs pada repair owner existing. Pastikan `ensure` tidak menganggap aggregate embedding saja sebagai seluruh children lengkap; inspect/repair memeriksa setiap child yang eligible-size. Rebuild parent berubah menghapus seluruh children revision lama; parent tidak berubah reuse vectors. Atomic replacement tetap satu index file. Invalid model/dimensions/count/NaN menyebabkan degraded tanpa stale vector fallback.
- [ ] Uji deletion dan content shrink, metadata-only edit, model/version edit, restart, partial batch, repair retry bound, corrupted file, interrupted rename. Incomplete canonical scan dengan retainMissing boleh menjaga bytes diagnostik tetapi query menolak context yang tidak cocok corpus; jangan menganggap parent hilang sebagai deletion atau menyajikan retained stale child. Canonical digest sebelum/sesudah identik.
- [ ] GREEN dan targeted commit; laporkan biaya reembedding satu parent penuh saat revision berubah sebagai tradeoff, bukan incremental per kalimat yang belum dibangun.

## Task 3 — Retrieval parent-aware dan scope

**Files:** Modify `M/retrieval.ts`, `M/service.ts`; create `T/memory-passage-retrieval.test.ts`.
**Interfaces:** Tambah host-only `MemoryServiceOptions.indexGranularity?:'record'|'passage'` di deklarasi options existing, diteruskan melalui factory existing ke parameter terakhir private constructor `indexGranularity:'record'|'passage'='record'`, lalu `new MemoryIndex(store.paths,embedder,{granularity:indexGranularity})`; public MCP schema unchanged.

- [ ] RED fake embeddings membuat passage oracle cosine1, aggregate parent di bawah distractor. Assert passage mode mengembalikan parent oracle rank1 sementara record-mode baseline tidak; ukur cold/warm call count. Default factory tanpa opsi harus mempertahankan record-mode ranking/output existing.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-passage-retrieval.test.ts`.
- [ ] Implementasikan max aggregation, tie/dedup, dan host opt-in. Pertahankan eligible-set validation 01 bila sudah tersedia; bila belum, jangan melonggarkan full-corpus matcher: subset tetap lexical fallback existing. Regression tidak mensyaratkan implementasi 01.
- [ ] Uji satu parent 100 children tidak mengisi top5, overlap tidak menaikkan score, foreign/expired/superseded children tak muncul, race revision ditolak, poison text tetap advisory, nearest/diversity menggunakan aggregate. Parent applicability/verification tidak diambil dari child; synthetic private provenance marker tidak masuk embedding allowlist.
- [ ] GREEN lalu targeted commit. Jika 06 tersedia, candidate span boleh diverifikasi oleh verifier06; jangan mengubah public excerpt contract atau membuat serializer kutipan kedua. Tanpa06, span tetap internal dan pekerjaan07 tetap bisa diterima sendiri.

## Task 4 — Gate offline dan paket bukti

- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-passages.test.ts tests/memory-passage-index.test.ts tests/memory-passage-retrieval.test.ts tests/memory-controller-scope.test.ts tests/memory-phase8-10.test.ts`, lalu `npm --prefix SubProject/agent-core-memory run verify` dan `npm run build`. Dependencies hilang = BLOCKED, tanpa install otomatis.
- [ ] Bekukan fixtures/oracles sebelum candidate: head/middle/tail, overlap, irrelevant, capped, scope, revision, failure. Bandingkan parent recall@5, passage oracle coverage, duplicate rate, vector count/index bytes, embedding-input bytes/calls serta median/p95 latency. Required oracle cases PASS100%, scope/stale trust violations0, duplicate parent0; capped cases harus partial. Tidak mengklaim outcome controller atau provider sehat.
- [ ] Update `docs/CODEBASE.md` hanya setelah implementasi; tulis report seluruh run termasuk failures. Startup ensure dapat memicu reembedding: resident rollout tetap BLOCKED sampai volume, data disclosure dan biaya disetujui; offline acceptance tidak mengotorisasinya.

ZIP wajib `memory-07-passage-retrieval-report.zip`: report.md, results.json per case, seluruh RED/GREEN/regression/build logs dengan command/cwd/exit code, synthetic corpus/oracles, index old/new fixtures, fake identity/call traces, focused patch, baseline/candidate commit serta source/staged-tree identities, dan limitations. manifest.json mencatat relative path, ukuran byte dan SHA-256 setiap payload kecuali dirinya; sidecar mencatat ZIP bytes/hash. Ekstrak ke temp kosong dengan traversal/symlink ditolak; verifikasi exact file set dan seluruh ukuran/hash. Tidak ada secret/runtime privat, file-count cap arbitrer, atau log gagal yang disembunyikan.

Task done hanya setelah semua gate dan extract-validation PASS. Rollback host ke record mode dan revert commit terarah; format berbeda memerlukan derived rebuild yang disetujui, bukan reset canonical. Jangan restart resident atau memperbaiki index pengguna selama pengujian. Outcome plan05, contextual plan04, filtered plan01 dan excerpt06 dapat digabung kelak, tetapi masing-masing tetap memiliki acceptance sendiri.
