> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Query-Focused Evidence Excerpts Implementation Plan

**Goal:** Menampilkan potongan Memory yang relevan terhadap query dengan lokasi dan revisi canonical yang dapat dibuktikan ulang.

**Architecture:** Selector deterministik memilih satu rentang dari `record.content` sesudah seleksi/ranking existing. Projection membawa teks asli dan source-span; eligibility, revision archive, disclosure safety, budget, dan exposure tetap dimiliki komponen existing.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Vitest, Node crypto; tanpa dependency/model baru.

**Spec:** Spesifikasi mandiri dan kontrak di bawah.

**Status: IMPLEMENTED IN SOURCE — OFFLINE FUNCTIONAL VERIFICATION RECORDED (2026-10-10).** See the [combined source ledger](../verification/memory06-11-source-functional-2026-10-10.md) for exact source identities, RED/GREEN cases, final affected gates, original timeout failures with separate assertion-preserving diagnostics, inherited root failures and sanitized report verification. Source version is `0.15.0-beta.2`; Windows beta.1 acceptance is separate. Performance benchmarks, real providers and live controller benefit are NOT RUN. Commands and checklists below retain the original specification; current implementation adapts the consolidated Plans01–05 owners rather than historical signatures.

## Global Constraints

- `M/` = `SubProject/agent-core-memory/src/memory/`; `T/` = `SubProject/agent-core-memory/tests/`.
- Jangan membaca `.env`, runtime privat, atau menyalin secrets. Seluruh fixture synthetic, root temporary, dan acceptance offline.
- Jangan mengubah ranking, canonical schema/store, provider, Learning, atau aktivasi host. Scope pekerjaan adalah disclosure controller `memory_recall`; legacy `projectMemorySearchResults` tidak berubah.
- Query/excerpt adalah data tidak tepercaya, bukan instruksi. Exact quote membuktikan asal byte/teks, bukan kebenaran klaim atau applicability sekarang.
- Tidak mengimplementasikan, menjalankan tes/build, restart, install, atau publish saat menyusun dokumen ini. Implementasi mendatang memakai checkout bersih; 174 staged file pekerjaan lain tidak boleh masuk commit task.

## Review Focus

1. Emoji, CRLF, combining marks: rentang harus menunjuk teks canonical asli (Task 1).
2. Match di tengah catatan panjang dan query tanpa match: pemilihan jujur, bukan rangkuman buatan (Task 1).
3. Edit sesudah recall, archive hilang, atau scope berubah: jangan membuktikan revisi yang berbeda (Task 2).
4. Poison text, metadata privat, dan budget kecil: disclosure fail-closed tanpa exposure palsu (Task 2).
5. Cursor/replay berbeda versi selector: pagination tidak diam-diam berubah (Task 3).

## Bukti dan coverage matrix

`M/search-projection.ts::projectMemoryHit` menghasilkan abstract dari 240 Unicode code points pertama. `M/controller-session.ts::recall` sudah memiliki query, eligibility, temporal selection, revision, safety check dan budget, tetapi tidak meneruskan query ke projection. `expand` memotong `serializeMemoryRecordView(record)`, yaitu JSON tersanitasi: offset pagination itu **bukan** offset content. `M/disclosure.ts::memorySemanticRevision` sudah mengikat meaning fields termasuk v2 experience; gunakan fungsi ini, jangan membuat identitas revisi lain.

| Rencana existing | Yang diselesaikan | Mengapa 06 tetap baru |
| --- | --- | --- |
| 01 filtered semantic | Validasi corpus versus eligible subset | Tidak memilih teks disclosure |
| 02 ranking policy | Fusion/feedback dan pagination ranking | Tidak memberi exact content span |
| 03 task/workspace | Binding host task dan workspace | Tidak mengganti preview |
| 04 contextual index | Representation metadata dan invalidasi | Tetap index-time; tidak membuat kutipan query-time |
| 05 outcome evaluation | Harness manfaat tugas | Tidak mengimplementasikan selector atau provenance kutipan |

[Cookbook Citations](https://platform.claude.com/cookbook/misc-using-citations), diverifikasi 2026-10-09, memperlihatkan citation terstruktur dengan dokumen dan lokasi sumber. Adaptasi sendiri di sini adalah span canonical lokal, tanpa Claude API atau jawaban generatif. [RAG guide](https://platform.claude.com/cookbook/capabilities-retrieval-augmented-generation-guide) memisahkan evaluasi retrieval dari hasil akhir; 06 hanya menguji ketepatan disclosure, bukan manfaat controller nyata. Ini bukan implementasi langsung recipe maupun jaminan statistik recipe berlaku pada Agent Core.

## Kontrak mandiri

Buat `M/evidence-excerpt.ts` dengan:

- `ContentSpan = {field:'content'; unit:'unicode-codepoint'; start:number; end:number}`; interval half-open pada `Array.from(record.content)`, tanpa trim/normalisasi.
- `MemoryExcerpt = {text:string; source:SourceRef; span:ContentSpan; selection:'query-match'|'head-fallback'; selectorVersion:1}`; `source.kind='memory'`, id dan `memorySemanticRevision(record)`.
- `selectMemoryExcerpt(record:MemoryRecord, query:string, maxCodePoints=240):MemoryExcerpt`.
- `verifyMemoryExcerpt(record:MemoryRecord, excerpt:MemoryExcerpt):boolean`: validasi integer bounds, source identity/revision dan exact slice. Verifier tidak mencari ulang query atau mempercayai label selection.

`maxCodePoints` wajib integer 1–240; nilai lain RangeError. Pemilihan: tokenisasi query dengan `tokenizeMemoryText`, deduplikasi, cocokkan token pada content case-insensitive. Semua kandidat window dan head-fallback mempunyai panjang paling banyak `min(maxCodePoints, Array.from(record.content).length)`. Window dimulai maksimum `min(80,maxCodePoints-1)` code points sebelum tiap match, clamp ke batas content agar match tetap masuk meskipun limit kecil. Hitung banyak token query unik dalam window; pilih terbanyak, tie ke start terkecil. Query tanpa token/match memilih head dengan `head-fallback`. Mapping match UTF-16 ke code-point offset memakai teks asli; lowercase hanya untuk comparison token, tidak untuk indexing string hasil transformasi. Jangan menyatukan dua span, menambah ellipsis ke `text`, mengutip metadata/context sebagai content, atau menganggap substring hasil normalisasi kutipan exact.

Tambahkan optional `excerpt?:MemoryExcerpt` pada `MemoryHit` di `M/disclosure.ts`, pertahankan `abstract?:string` sebagai alias tepat `excerpt.text`. `map` tidak mendapat keduanya. Tambahkan optional `query?:string` pada input `projectMemoryHit`. Existing pemanggil tanpa query menerima head-fallback. Buat type import-only agar tidak memperkenalkan runtime import cycle. Source-span bukan selector arbitrary-file dan tidak memberi permission membaca source.

## Task 1 — Selector dan proof murni

**Files:** Create `M/evidence-excerpt.ts`, `T/memory-evidence-excerpt.test.ts`; modify `M/disclosure.ts`, `M/search-projection.ts`.
**Consumes:** `MemoryRecord`, `SourceRef`, `memorySemanticRevision`, tokenizer existing. **Produces:** type/functions kontrak di atas.

- [ ] Tulis test `middle_match_replaces_head`: catatan 3.000 code points dengan token unik pada offset 1.500; assert excerpt berisi token, panjang <=240, start>0, abstract===text, dan verifier true. Baseline assertion preview harus gagal karena token tidak di head, bukan sekadar import yang hilang.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-evidence-excerpt.test.ts`; simpan RED output dan exit code.
- [ ] Implementasikan selector dan projection minimal sesuai kontrak. Tidak ada embedding/network call.
- [ ] Tambahkan `unicode_crlf_exact`, `duplicate_tokens_tie_first`, `no_match_labeled_fallback`, `empty_content`, `max_1_and_17_respected`, `tampered_span_rejected`, `same_text_other_revision_rejected`; assert rentang dan exact slice; limit 1 dan 17 berlaku untuk query-match maupun head-fallback. Sertakan emoji sebelum match, Turkish case expansion, combining marks, serta batas max 0/negatif ditolak sebagai RangeError.
- [ ] Ulangi command sampai GREEN. Review focused diff; commit hanya empat file task dari checkout bersih.

## Task 2 — Integrasi budget, scope, dan revisi

**Files:** Modify `M/controller-session.ts`; create `T/memory-evidence-excerpt-integration.test.ts`.
**Consumes:** Task 1 selector/proof. **Produces:** recall abstract query-aware dengan kontrak exposure existing.

- [ ] RED: panggil dispatcher existing dengan query fixture tengah; assert source revision sama dengan hit revision, reconstruct `expand` seluruh halaman JSON lalu parse `.content`, dan cocokkan slice code points dengan excerpt. Jangan menggunakan `ExpansionPage.offset` sebagai content span.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-evidence-excerpt-integration.test.ts`; catat failure relevan.
- [ ] Teruskan query ke projection sesudah existing safety/eligibility. Biaya seluruh field excerpt ikut `measureBudgeted`; jangan memotong text tanpa memperbarui span. Budget insufficient tetap existing result dan selectedCount=0.
- [ ] Uji budgets 512/896/1024/8192/65536 pada dispatcher dan session; semua response sukses <=requested bytes, wrapper reserve existing dipertahankan. Assert hanya delivered hits tercatat exposed; tidak ada teks query mentah di ledger baru.
- [ ] Uji edit/deletion sesudah recall: retained v2 exact revision boleh diverifikasi melalui expand existing; archive tidak tersedia/legacy berubah harus conflict/unavailable, tidak fallback ke revisi terbaru. Uji workspace asing, superseded/default archive, stale evidence dan poison `ignore instructions`; tidak ada kenaikan trust atau keluaran field metadata privat. Marker secret synthetic harus ditolak safety owner, bukan dihapus diam-diam sehingga proof salah.
- [ ] GREEN seluruh test baru, review lalu commit targeted.

## Task 3 — Pagination dan acceptance mandiri

**Files:** Extend dua test baru; modify `M/controller-session.ts` request binding; update `docs/CODEBASE.md` hanya saat implementasi diterima.

- [ ] RED: cursor old selector version harus stale. Tambahkan `evidence-excerpt/v1` pada recall request binding; input/public scope tetap sama. Query, revisions, ranking order dan selector version terikat; page berulang menghasilkan teks/span sama walau attemptId berbeda.
- [ ] GREEN: `npm --prefix SubProject/agent-core-memory test -- tests/memory-evidence-excerpt.test.ts tests/memory-evidence-excerpt-integration.test.ts tests/memory-disclosure.test.ts tests/memory-controller-scope.test.ts tests/memory-controller-continuation.test.ts`.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory run verify` dan `npm run build`. Dependency hilang berarti BLOCKED, bukan install tanpa izin.
- [ ] Bekukan suite sebelum candidate: head/middle/tail/absent query dan adversarial cases. Bandingkan first-240 baseline versus candidate pada record/ranking sama; laporkan exact-span rate=100%, required match coverage=100%, scope/trust violations=0, payload bytes dan median/p95 latency. Semua kegagalan wajib terlihat. Tidak menyatakan improvement semantik dari fixture deterministik.

## Acceptance ZIP, keselamatan, rollback

Implementasi selesai hanya setelah RED relevan, seluruh GREEN/regression/build, canonical digest tidak berubah, dan `memory-06-query-evidence-excerpts-report.zip` lolos ekstraksi ulang. ZIP wajib berisi report.md, results.json seluruh kasus, semua log RED/GREEN/build/regression beserta command/cwd/exit code, synthetic fixtures/oracles, sanitized before/after responses, focused patch, identitas published/HEAD/staged-tree dan kandidat, limitations serta daftar perubahan/proses/config. Sertakan manifest.json dengan path relatif, ukuran byte, SHA-256 setiap payload; manifest tidak menghash dirinya. Catat ukuran/hash ZIP di sidecar.

Ekstrak ke temp kosong dengan penolakan traversal/symlink; pastikan set file persis manifest plus manifest, lalu hitung ulang seluruh ukuran/hash. Tidak ada arbitrary file-count cap, secret, runtime user, atau path privat. ZIP rusak/missing log berarti FAIL, bukan task done. Provider/live controller NOT RUN dan tidak menjadi syarat acceptance offline.

06 mandiri dari 01–05 dan 07; 07 kelak dapat memasok candidate location tetapi tidak mengganti proof ini. Rollback revert commit task terarah; tidak perlu migrasi canonical/index. Jangan reset staging lain atau menghapus Memory. Pemulihan tidak menciptakan klaim bahwa teks lama masih berlaku kini.
