# Code Identifier Retrieval Implementation Plan

**Status: IMPLEMENTED IN SOURCE — OFFLINE FUNCTIONAL VERIFICATION RECORDED (2026-10-10).** See the [combined source ledger](../verification/memory06-11-source-functional-2026-10-10.md) for exact source identities, RED/GREEN cases, final affected gates, original timeout failures with separate assertion-preserving diagnostics, inherited root failures and sanitized report verification. Source version is `0.15.0-beta.2`; Windows beta.1 acceptance is separate. Performance benchmarks, real providers and live controller benefit are NOT RUN. Commands and checklists below retain the original specification; current implementation adapts the consolidated Plans01–05 owners rather than historical signatures.

**Historical planning baseline:** Baseline target `4b3e32d464b98aa5116df02e8fe524217d5ad811`; inspeksi memakai checkout HEAD `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3` beserta 174 staged changes. Target tidak disamakan dengan HEAD lokal. Penyusunan docs-only: tidak ada source edit, test, build, inference, atau provider probe.

**Goal:** Memory menemukan identifier kode utuh dan subword yang masuk akal, tanpa menganggap identifier berbeda sebagai fakta yang sama.

**Architecture:** Tokenizer retrieval deterministik menghasilkan token exact dan subword terpisah. Lexical overlap/BM25 memakai representasi yang konsisten; exact identifier gate tetap konservatif. Tidak menambah parser bahasa, LSP, graph, model, alias otomatis, atau index canonical baru.

**Tech Stack:** Node >=24.15.0, TypeScript ESM, Vitest, JavaScript Unicode regex, builder/BM25/fusion existing.

**Spec:** Kontrak mandiri berikut; semua command merupakan langkah implementasi mendatang dari root repository.

## Batas dan overlap yang sengaja tidak dikerjakan ulang

`M/` = `SubProject/agent-core-memory/src/memory/`; `T/` = `SubProject/agent-core-memory/tests/`. Keduanya alias path dalam dokumen, bukan direktori baru.

| Rencana | Owner existing | Batas Plan 11 |
|---|---|---|
| 01 semantic subset | kandidat semantic eligible | tidak mengubah availability index |
| 02 ranking policy | fusion rollout, feedback, cursor | hanya memasok tokenizer revision pada binding |
| 03 identity binding | host workspace/task | tidak menebak repo dari path token |
| 04 contextual index | semantic builder/title/metadata/version | memakai builder yang ada, tanpa enrichment |
| 05 outcome eval | benefit end-to-end | benchmark identifier retrieval terisolasi |
| 10 abstention | apakah evidence cukup | subword match tidak menjadi bypass relevance |

Dokumen ini tidak menduplikasi perbaikan contextual title. Identifier yang hanya di title menjadi searchable ketika Plan 04 diterapkan; suite mandiri meletakkan identifier di content/keywords existing. Paths dari provenance tetap hanya dipakai channel source/identifier existing, bukan disisipkan ke embedding. Alias canonical yang sudah tersimpan boleh dicari; tidak membuat sinonim, relasi, nama symbol, atau klaim baru.

Pertahankan 174 staged changes tanpa reset/add/commit campuran. Dilarang membaca `.env`, credential, canonical runtime pribadi, atau protected paths. Tidak install, menjalankan server, restart, menghidupkan Cloudflare probe, melanjutkan cohort dihentikan, release, atau deployment. Seluruh acceptance wajib offline dengan fake provider dan network-deny spy.

## Diagnosis berbasis sumber

`M/semantic-document.ts::tokenizeMemoryText` lowercases sebelum regex `[\p{L}\p{N}_-]+`, sehingga camelCase kehilangan batas, snake_case menjadi token utuh, dan separator path memisahkan sebagian fragmen. Ini bukan berarti lexical retrieval sama sekali tidak bekerja: exact phrase dan whole token sudah memberi hasil.

Mengganti tokenizer saja tidak cukup: `M/retrieval.ts::scoreRecord` menurunkan case query serta `buildSemanticDocument(record)` sebelum memanggil tokenizer. Pertahankan raw strings sampai boundary extraction; lowercase hanya hasil token dan salinan exact-phrase comparison. `M/bm25.ts::meaningfulTokens` memanggil tokenizer langsung, sehingga harus memakai kontrak sama agar tidak ada drift channel.

`concreteIdentifiers` sudah mengambil identifier tertentu dengan angka/separator dan `identifierEligible` mengharuskan match pada haystack, dengan pengecualian pinned existing. Tidak boleh mengubah `ERR_CACHE_404` menjadi match untuk `ERR_CACHE_403` hanya karena shared subwords. Scope/pinned semantics bukan otorisasi baru. `intelligence.ts` dan `consolidation.ts` juga memakai tokenizer lama; jangan diam-diam mengubah similarity consolidation atau auto-link hanya untuk memperbaiki pencarian.

[OpenAI Retrieval](https://developers.openai.com/api/docs/guides/retrieval) memberi konteks hybrid lexical/semantic; [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) memberi prinsip eval tugas spesifik. Keduanya diperiksa 2026-10-09. Algoritme identifier berikut adalah adaptasi dari kode lokal, bukan resep Cookbook persis. Tidak ada klaim dokumen resmi menetapkan regex, bobot, atau peningkatan yang diusulkan.

## Kontrak tokenizer

Buat `M/identifier-tokenizer.ts`:

- `IDENTIFIER_TOKENIZER_VERSION = 'code-identifiers/v1' as const`.
- `IdentifierTokens = { exact:string[]; subwords:string[]; truncated:boolean }`.
- `tokenizeRetrievalText(value:string):IdentifierTokens`.
- `flattenRetrievalTokens(tokens:IdentifierTokens):string[]`.

Scan linear dalam urutan input; normalisasi Unicode NFC, bukan transliterasi atau NFKC yang menyamakan simbol berbeda. Simpan token utuh dengan ASCII lowercasing/Unicode lowercase konsisten existing; ubah backslash ke slash hanya pada exact path token. Exact di sini berarti identifier utuh setelah normalisasi case yang memang sudah berlaku pada retrieval; bukan resolusi symbol case-sensitive.

Batas deterministik: maksimum 131072 Unicode code points input, 4096 emitted token occurrences total, dan 256 code points per token. Jangan memotong token tengah menjadi identifier baru. Melebihi batas melewatkan token yang tidak muat, menandai truncated, lalu menghentikan scan bila budget total habis. Query truncated ditolak `MEMORY_INPUT_INVALID`; dokumen truncated memakai fallback tokenizer legacy untuk dokumen tersebut, mencatat degraded lexical warning internal, tanpa mengaku seluruh identifier telah diperiksa. Legacy fallback tidak boleh digunakan untuk melewati exact eligibility atau disclosure scope.

Untuk setiap occurrence, emit exact normalized token, lalu subwords unik occurrence itu: lower→upper boundary (`memoryRecall` → `memory`, `recall`), acronym→capitalized boundary (`HTTPServer` → `http`, `server`), underscore/hyphen, slash/backslash, dot, dan letter↔digit (`ERR_CACHE_404` → `err`, `cache`, `404`). Pertahankan exact `err_cache_404` serta exact path `src/memory/controller-session.ts`. Jangan menciptakan n-gram bebas atau edit-distance expansion. Single-character subwords tidak dipakai; exact single-character mengikuti perilaku legacy dan tidak diperluas dalam pekerjaan ini.

Array menyimpan occurrences lintas identifier supaya term frequency BM25 tetap masuk akal; deduplicate expansion hanya dalam satu occurrence dan jangan menghitung exact yang sama lagi sebagai subword. `flattenRetrievalTokens` menghasilkan `[...exact,...subwords]` setelah dedup occurrence saat scan, bukan Set global; urutan token tidak mengubah term frequency. Exact eligibility menggunakan full normalized query identifiers existing dan literal haystack existing, tidak flat subwords. Natural query `controller session` dapat menemukan `ControllerSession`. Jaminan penolakan `ERR_CACHE_403` untuk exact request `ERR_CACHE_404` dibatasi pada non-pinned fusion, sesuai identifierEligible existing. Legacy/BM25 dan pinned exemption dapat tetap mengembalikan distractor; laporkan sebagai keterbatasan baseline, bukan PASS exact-gate atau kesetaraan fakta. Pekerjaan ini tidak memperluas gate ke profil lain.

## Review Focus

1. Case dibuang sebelum boundary extraction membuat fix semu (Task 2).
2. Common subwords menenggelamkan exact error-code/path match (Task 2–3).
3. Unicode, separator berulang, input besar menyebabkan CPU/token explosion (Task 1).
4. Tokenizer berubah merusak consolidation atau memicu re-embedding (Task 2).
5. Rename/deletion/provenance tidak memberikan alias tak berdasar (Task 3).

## Task 1 — Tokenizer terbatas dan fixture jelas

**Files:** Create `M/identifier-tokenizer.ts`, `T/memory-code-tokenizer.test.ts`.

**Consumes/produces:** string canonical/query → IdentifierTokens; tidak menerima filesystem root atau mengakses file.

- [ ] Tulis `retains_exact_and_splits_boundaries`: `memoryRecall`, `HTTPServer`, `snake_case`, `foo-bar`, `src/memory/host-runtime.ts`, Windows separator, `ERR_CACHE_404`, `OAuth2Client`, Unicode NFC, angka panjang. Assert exact hadir, subwords tepat, urutan stabil, dan tidak ada implicit aliases.
- [ ] Tulis `bounds_expansion_without_partial_identifiers`: token 257 chars, input 131073 code points, 4097 emissions, repeated separator, combining marks, empty string. Assert truncated benar dan tidak ada token partial yang diklaim exact. Ukur jumlah operasi/tokens, bukan hanya timeout rapuh.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-code-tokenizer.test.ts`; pastikan failure relevan terhadap fungsi belum ada.
- [ ] Implementasikan scanner tanpa recursive/backtracking regex berbahaya. GREEN: ulang command hingga PASS; review lalu commit file terfokus pada checkout implementasi bersih.

## Task 2 — Kanal lexical konsisten tanpa mengganti owner

**Files:** Modify `M/retrieval.ts`, `M/bm25.ts`; create `T/memory-code-retrieval.test.ts`. `M/semantic-document.ts`, `M/index.ts`, `M/intelligence.ts`, `M/consolidation.ts` tetap tidak diubah kecuali review menemukan kebutuhan nyata yang dicatat terpisah.

**Interfaces:** `buildBm25Profile(records,query)` tetap; `searchMemories` dan return `MemorySearchResult[]` tetap. Helper internal lexical menerima raw text, mengekstrak tokens, dan mempertahankan existing stopword policy. Perluas optional `RetrievalComponents.lexicalTokenizationDegraded?:boolean` untuk fallback document; jangan memasukkannya ke penjumlahan score.

- [ ] Tulis `camel_boundaries_survive_score_record`, `bm25_and_overlap_share_tokens`, `exact_error_code_beats_subword_distractors`, `path_gate_requires_full_path`. Uji legacy/bm25/fusion pada corpus identik dengan fake semantic dimatikan atau tetap. Assertion wrong-code rejection/path gate hanya untuk non-pinned fusion; fixtures legacy/BM25/pinned merekam exception existing secara eksplisit tanpa assertion jaminan yang tidak ada. Root lexical formula, RRF constants, dan identifier gate tidak dirombak.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-code-retrieval.test.ts`.
- [ ] Ganti hanya call sites retrieval/BM25; `scoreRecord` menyimpan rawQuery/rawDocument dan normalized copy untuk exact phrase. Metadata token counting juga memakai tokenizer baru. Untuk BM25, meaningfulQueryTokens dihitung dari token query sesudah dedup/stopword yang konsisten; catat perubahan bobot existing akibat token count, jangan menyembunyikannya sebagai sekadar refactor.
- [ ] Tambahkan query overflow → input invalid dan oversized document fallback → degraded evidence. Tambahkan spies bahwa embedDocuments tidak bertambah, builder bytes identik, dan consolidation/intelligence masih menggunakan tokenizer lama.
- [ ] GREEN: ulang command kemudian `npm --prefix SubProject/agent-core-memory test -- tests/memory-code-tokenizer.test.ts tests/memory-controller-scope.test.ts tests/memory-controller-continuation.test.ts`. Review focused diff sebelum commit.

## Task 3 — Evaluasi identifier dan interoperabilitas

**Files:** Create `T/fixtures/code-identifiers-v1/suite.json`, `T/memory-code-retrieval-evaluation.test.ts`; update `docs/CODEBASE.md` setelah implementasi.

- [ ] Bekukan development/heldout terpisah menurut keluarga symbol/project, bukan sekadar variasi case dari identifier sama. Sertakan camel, snake, path, error code, acronym/digit, Unicode, natural-language negatives, shared prefix, renamed/deleted symbol, stale/foreign/forgotten distractors. Label canonical ID dan revision, bukan guessed aliases.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-code-retrieval-evaluation.test.ts`; assert non-pinned fusion exact-ID wrong match gagal hard gate, heldout overlap ditolak, dan source revision mismatch tidak dihitung sukses.
- [ ] GREEN: implementasikan paired baseline/candidate replay offline. Report recall@k, precision@k, MRR, false positives, no-answer negatives, token multiplier, p50/p95, dan worst-case operations per keluarga. Pilih target nonregression/latency dari development baseline lalu segel sebelum heldout; tidak mengubah tokenization atau bobot setelah membaca heldout. Zero scope leak, secret disclosure, dan stale-trust wajib lintas profil. Zero wrong exact-code admission wajib hanya untuk non-pinned fusion; false positives legacy/BM25/pinned dilaporkan terpisah dan tunduk target nonregression development, tidak disembunyikan dalam rerata.
- [ ] Jika Plan 02 tersedia, masukkan tokenizer version pada rankingRevision existing agar cursor pre-upgrade stale. Tanpa Plan 02, perluas existing snapshot digest input di `M/controller-session.ts` dengan tokenizer version; tambah assertion pagination/restart. Jangan membuat cache/cursor kedua.
- [ ] Plan 08 menyimpan query vectors saja; lexical tokenizer revision tidak masuk key selama actual embedding text/identity tetap. Binding tokenizer dimiliki ranking/cursor Plan 02; Plan 07 future passage tokenization menggunakan fungsi sama dan membawa parentId/revision sebelum dedup. Tidak mengimpor future modules. Plan 04 tetap owner semantic representation/version: lexical-only patch tidak membump semantic index atau melakukan re-embedding.
- [ ] Gate lengkap: `npm --prefix SubProject/agent-core-memory run verify && npm run build && npm test -- tests/memory-bm25-ranking.test.ts tests/capability-residual-wave.test.ts tests/memory-v2-host-integration.test.ts`. Missing dependencies berarti BLOCKED, bukan install otomatis.

## Acceptance, rollback, dan paket bukti

Plan selesai mandiri jika exact/subword fixtures, nonregression, budget, safety, build, dan preregistered heldout gates PASS. Tidak perlu Plan 01/04/10 untuk baseline content-only. Claim manfaat task/controller nyata tetap menunggu evidence outcome; retrieval exposure bukan usage. LSP/Grafel tetap sumber structural code intelligence, bukan diganti tokenizer Memory.

Rollback revert patch terfokus dan tokenizer revision; invalidasi cursor/cache melalui owner existing. Tidak menghapus Memory canonical, aliases tersimpan, vector index, atau histori receipt. Feature gagal tidak memicu automatic broad search/provider fallback.

Deliverable implementasi wajib `memory-11-code-identifier-retrieval-report.zip` dengan report, seluruh results/fixtures, preregistration, logs RED/GREEN/build/regression termasuk failure, command/cwd/exit code, baseline/candidate source hashes, token evidence, focused patch, serta manifest path/bytes/SHA-256 setiap payload. Gunakan ZIP tools existing; tanpa batas jumlah file arbitrer. Exclude `.env`, credentials, private runtime, Git metadata dan protected paths. Ekstrak ke temporary directory baru, verifikasi exact membership dan digest semua file, simpan checksum ZIP terpisah. Complete baru setelah gate wajib dan extraction verification PASS; live provider tetap NOT RUN/BLOCKED secara eksplisit.
