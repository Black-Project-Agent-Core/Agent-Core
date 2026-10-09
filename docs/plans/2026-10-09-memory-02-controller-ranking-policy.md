# Controller Ranking Policy Implementation Plan


**Goal:** Menghubungkan recall ControllerMemorySession ke fusion dan feedback yang sudah ada melalui kebijakan host opt-in, dengan pagination stabil dan baseline tetap tersedia.

**Architecture:** Tambahkan pilihan policy kecil pada factory controller existing. Ranking tetap memakai searchMemories; snapshot cursor mengikat policy, feedback, dan hasil ranking. Tidak membuat mesin ranking kedua atau menyalakan seluruh fitur sekaligus.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Vitest, existing fusion/BM25/feedback/cursor owners.

**Spec:** Bagian spesifikasi mandiri dalam dokumen ini.

**Status:** PROPOSED — NOT IMPLEMENTED. Baseline `c5e3fe970b770aaa5ba3023ea19239f71f53709c`; tanggal 2026-10-09 UTC+7. Command merupakan instruksi eksekusi mendatang, bukan hasil tes.

## Global Constraints

- `M/` berarti `SubProject/agent-core-memory/src/memory/`. Public tool input tidak diberi knob ranking atau feedback yang dapat diklaim caller.
- Semua gate wajib menggunakan fixture synthetic, clock terkontrol, dan tanpa live model/provider. Tidak melanjutkan Cloudflare probe atau cohort lama yang dihentikan.
- Jangan membaca `.env`, secrets, folder terlarang, atau canonical runtime pengguna. Provider configured bukan provider verified.
- Dokumen ini tidak memberi izin implementasi, perubahan permission, instalasi, deployment, atau pembayaran. Eksekusi menunggu review pengguna dan memakai checkout bersih, tanpa mengikutsertakan staged edits lain.

## Review Focus

1. Feedback berubah di tengah pagination harus membatalkan cursor (Task 2).
2. Feedback storage gagal tidak menghapus filter forgotten yang fail-closed (Task 1–2).
3. Negatif feedback tidak menghidupkan memori superseded/foreign (Task 3).
4. Tie score, perubahan jam, dan perubahan policy tidak menyebabkan duplicate/skip halaman (Task 2).
5. Kemiripan semantik atau recall exposure tidak dianggap bukti pemakaian/manfaat (Task 3).

## Spesifikasi mandiri dan bukti sumber

`M/service.ts:229–235` menyediakan callback `rank(records, query, rankingTime)` dengan `maxNeighbors:0` dan tanpa rankingProfile maupun feedbackSalience. Default `searchMemories` dalam `M/retrieval.ts` adalah legacy. `MemoryService.search` sudah memasok feedback ketika profile fusion dipilih, sekitar baris 1173–1176; `feedbackSalienceMap` memiliki fallback map kosong.

Ini gap pada jalur controller-specific, bukan klaim seluruh Agent Core belum hybrid. `src/learning/external-controller.ts:654–660,770–777` sudah memakai fusion, masing-masing neighbor 1 dan 2. `src/agent-runtime.ts:670–680` memakai fusion untuk context awal. Rencana tidak mengubah ketiga consumer itu atau menyatukan budget mereka secara paksa.

`M/controller-session.ts:110–128` mempertahankan rankingTime dari cursor dan mengikat snapshot pada semantic revisions serta urutan ID. Itu fondasi yang dipertahankan; penambahan feedback mutable membutuhkan binding tambahan. Temporal certainty sorting tetap terjadi setelah ranking. `M/retrieval.ts` sudah mempunyai reciprocal-rank fusion, deduplication, diversification dan bounded feedback influence; tidak ditulis ulang.

Requirements: baseline default menghasilkan perilaku lama; host dapat memilih fusion+feedback untuk evaluasi/rollout. Seluruh kandidat harus sudah scope/temporal eligible. Neighbor expansion tetap 0 untuk kedua policy pertama: mengambil limit sebesar seluruh kandidat membuat eksperimen neighbor belum memberi manfaat yang jelas dan menambah variabel. Tidak menambah source-file hints tanpa konteks host yang terverifikasi. Disclosure budget, freshness, advisory warning, source revision dan ledger tetap dipertahankan.

Cookbook [Optimizing Customer Support Agents for Cost and Quality](https://developers.openai.com/cookbook/examples/agent_optimization/optimizing_agents_for_cost_and_quality) dipakai sebagai inspirasi eksperimen baseline versus perubahan terukur. Adaptasi lokal mengubah satu policy dan mengukur kualitas/biaya; bukan mengambil hasil persentase contoh, mengganti model, atau menginstal framework evaluasinya. [Context personalization](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization) memberi gagasan context yang curated; tidak mengadopsi aturan “yang terbaru selalu benar” karena Agent Core sudah memiliki evidence/temporal owner.

## Keputusan interface

Usulan type di `M/service.ts`:

`export type ControllerRetrievalPolicy = 'baseline-v1' | 'fusion-feedback-v1';`

`controller(scope: ControllerScope, policy: ControllerRetrievalPolicy = 'baseline-v1'): ControllerMemorySession`.

Factory menolak nilai tidak dikenal pada runtime dengan `MEMORY_INPUT_INVALID`; policy disalin immutable ke closure. Tidak menambah state global/environment flag. Baseline memilih legacy, maxNeighbors 0, tanpa salience. Candidate memilih fusion, maxNeighbors 0, salience hanya ID eligible. Menggunakan `feedbackSalienceMap` existing boleh fail-soft menjadi neutral; forgotten filtering pada snapshot tetap menggunakan strictForgottenIds dan fail-closed. Jangan membungkus seluruh recall dalam catch yang menyembunyikan masalah authorization/canonical/ledger.

Usulan internal port di `M/controller-session.ts`:

`interface ControllerRankedSnapshot { results: MemorySearchResult[]; rankingRevision: string }`

`rank(records: MemoryRecord[], query: string, rankingTime: number): Promise<ControllerRankedSnapshot>`.

`rankingRevision` adalah digest versioned dari policy ID, salience entries eligible yang sorted, dan identitas semantic snapshot. Perluas internal `SemanticSearchContext` di `M/index.ts` dengan `revision: string`; semanticContext menghasilkan digest dari embedder identity (provider/model/dimensions), format/representation version yang tersedia, serta sorted pasangan entry ID+fingerprint yang dipakai pada pemanggilan itu. Digest dihitung dari file index yang sama dengan vectors, bukan load kedua. Pada baseline format 2 yang belum punya representation version, pakai label tetap `semantic-document/v1`; jika rencana 04 sudah diterapkan gunakan constant/version-nya. Tidak memasukkan builtAt atau access counters. Semantic unavailable memakai sentinel eksplisit, bukan revision kosong. Baseline juga punya revision eksplisit. Feedback digest memuat hanya angka/id synthetic atau canonical yang sudah eligible; digest saja masuk cursor binding. Hit score tidak memaparkan salience map. Snapshot digest memasukkan revision dan urutan ID+score, sehingga perubahan material tidak diam-diam memakai offset lama. Query kosong/map view tetap deterministic dan tidak memanggil rank. Old cursor saat kontrak binding berubah harus menghasilkan stale error, bukan mencoba melanjutkan offset berbeda.

## Task 1 — Policy opt-in yang setia terhadap baseline

**Files:** Modify `M/service.ts`, `M/controller-session.ts`, `M/index.ts`; create `SubProject/agent-core-memory/tests/memory-controller-ranking-policy.test.ts`.
**Consumes:** searchMemories dan feedback store existing. **Produces:** factory overload/type dan rank envelope di atas.

- [ ] Tulis red test yang membandingkan default dengan explicit baseline pada fixed records/time: ID, score, warnings, payload budget sama, tanpa membandingkan random attemptId. Candidate fixture pendek versus panjang dengan lexical term yang sama mengikuti expected fusion oracle, bukan hard-code asumsi tie yang belum dihitung.
- [ ] Tambahkan spy rank yang memastikan candidate memanggil rankingProfile fusion, maxNeighbors 0, eligible salience; baseline tidak meneruskan feedback. Nilai policy palsu harus ditolak sebelum baca/embedding.
- [ ] Jalankan dari root `npm --prefix SubProject/agent-core-memory test -- tests/memory-controller-ranking-policy.test.ts`; red wajib berasal dari policy belum tersedia, bukan fixture salah.
- [ ] Implementasikan dua policy dan envelope. Perbarui fake SemanticSearchContext dengan revision serta semua backend fake yang menggunakan port rank, ditemukan dengan `rg -n 'rank:' SubProject/agent-core-memory/tests tests`; jangan mengubah assert safety demi compile.
- [ ] Tambahkan feedback helpful versus wrong pada dua kandidat comparable. Assert pengaruh mengikuti batas existing dan tidak mengubah record canonical. Feedback tidak tersedia menghasilkan neutral ranking; forgotten-store failure tetap source-unavailable. Jalankan test sampai PASS, review dan commit file terfokus.

## Task 2 — Pagination terikat pada ranking state

**Files:** Modify `M/controller-session.ts`; create `SubProject/agent-core-memory/tests/memory-controller-ranking-pagination.test.ts`.
**Consumes:** ControllerRankedSnapshot Task 1. **Produces:** snapshot binding policy-aware; public RecallInput/RecallPage tidak berubah.

- [ ] Buat tiga kandidat nonduplicate fixed clock; paginate limit 1 hingga selesai. Assert gabungan IDs sama dengan recall satu halaman, tidak duplicate/skip, tie ID stabil, dan clock maju tidak mengubah ordering karena rankingTime cursor.
- [ ] Red cases: setelah halaman pertama, ubah helpful feedback, pilih policy berbeda untuk scope sama, ubah ketersediaan semantic channel, atau ganti provider/model/representation revision dengan urutan dan score identik. Masing-masing harus `MEMORY_CURSOR_STALE`, walaupun kebetulan urutan ID tidak berubah. Cross-workspace/task tetap `MEMORY_SCOPE_MISMATCH`.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-controller-ranking-pagination.test.ts`, simpan red evidence.
- [ ] Masukkan rankingRevision serta ID+score ke digest snapshot; pertahankan existing temporal certainty sort sebelum binding final. Tidak memasukkan waktu baru, exposure counter, attemptId, atau retrievalCount ke ranking revision karena akan membuat semua cursor stale.
- [ ] Ulangi test; uji map tanpa query, budget minimal 512, feedback berubah di proses kedua/restart, dan handoff session/controller pada task sama. Sebelum commit, jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-controller-scope.test.ts tests/memory-controller-continuation.test.ts tests/memory-disclosure.test.ts` dan pastikan PASS.

## Task 3 — Evaluasi terkontrol dan acceptance independen

**Files:** Extend dua test baru; update `docs/CODEBASE.md` hanya saat source benar-benar diimplementasikan.

- [ ] Tambahkan fixture held-out lexical, semantic fake, duplicate, foreign distractor, stale/corrected claim, forgotten, archive dan temporal boundary. Jalankan kedua policy pada corpus identik. Plan 01 tidak wajib: semantic full-corpus fake bisa menguji policy; subset defect yang belum diperbaiki dicatat sebagai keterbatasan baseline terpisah.
- [ ] Assert zero scope leak, zero stale/superseded dianggap current, budget tidak terlewati, ledger exposure tetap terpisah dari use receipt. Candidate tidak dapat menaikkan foreign memory lewat feedback besar. Poison instruction tetap data advisory, tidak menjadi tool permission.
- [ ] Jalankan kedua test baru, `npm --prefix SubProject/agent-core-memory run verify`, `npm run build`, dan `npm test -- tests/capability-residual-wave.test.ts tests/memory-bm25-ranking.test.ts` untuk existing ranking consumers. Missing dependency adalah BLOCKED; tidak install otomatis.
- [ ] Catat paired relevance/top-k/negative-case outcomes, calls, bytes, median/p95 latency dan raw rows. Sebelum melihat candidate, tetapkan target kualitas eksperimen berdasarkan baseline dan label fixture; jangan menjadikan angka persentase tanpa baseline sebagai fakta. Nonregression safety adalah gate wajib; candidate default tetap opt-in walau unit test PASS.
- [ ] Review dan commit perubahan terfokus setelah gate. Default production tidak berubah dalam pekerjaan ini. Aktivasi default membutuhkan hasil outcome eval terpisah dan keputusan rollout; tidak harus menunggu seluruh lima rencana untuk menyelesaikan patch opt-in.

## Report, rollback, dan batas verifikasi

Deliverable wajib `memory-02-controller-ranking-policy-report.zip`: report.md, results.json dengan setiap case/policy/status, log red/green/build/regression lengkap, fixture version/hash, evidence ranking/cursor, focused patch, baseline/candidate source identities, dan manifest.sha256 seluruh payload. Ekstrak ke folder baru dan verifikasi hashes serta daftar file. Jangan memasukkan secrets atau runtime user; jangan menyingkat paket dengan arbitrary file cap. Gate dianggap selesai hanya setelah tes wajib PASS dan ZIP valid. NOT RUN/BLOCKED/FAIL harus tetap terlihat, tidak dihitung sebagai manfaat.

Rollback: host kembali memilih baseline-v1; untuk source regression revert commit terarah beserta CODEBASE. Tidak reset feedback/canonical memory, mengubah grants, atau membuat cursor lama valid secara paksa. Cursor outstanding boleh stale dan dimulai ulang secara eksplisit.

Plan 02 mandiri. Plan 01 memperbaiki availability semantic subset; plan 04 mengubah representation; keduanya dijalankan serial bila menyentuh service/index dan comparative results dipisahkan per revision. Plan 03 tidak perlu untuk test host scope synthetic. Plan 05 dapat memberi bukti outcome sebelum promosi default. Live Cloudflare/controller run adalah gate terpisah, memerlukan secure setup dan izin biaya/data, serta tidak menjadi syarat menguji kebijakan offline ini. Dokumen rencana tidak mengklaim tes atau improvement telah terjadi.
