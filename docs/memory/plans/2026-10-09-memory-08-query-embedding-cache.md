> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Query Embedding Cache Implementation Plan

**Goal:** Menghindari embedding query identik berulang melalui cache volatile terbatas dan singleflight, tanpa menyimpan hasil recall atau keputusan akses.

**Architecture:** Satu cache per instance MemoryIndex menyimpan vector query tervalidasi. Validasi corpus, eligibility, freshness, disclosure dan ranking tetap berjalan setiap request; operasi dokumen tetap memakai owner existing.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Vitest, Map/AbortSignal dan crypto bawaan; tanpa dependency/provider baru.

**Spec:** Persyaratan mandiri dalam dokumen ini. **Status: IMPLEMENTED IN SOURCE — OFFLINE FUNCTIONAL VERIFICATION RECORDED (2026-10-10).** See the [combined source ledger](../verification/memory06-11-source-functional-2026-10-10.md) for exact source identities, RED/GREEN cases, final affected gates, original timeout failures with separate assertion-preserving diagnostics, inherited root failures and sanitized report verification. Source version is `0.15.0-beta.2`; Windows beta.1 acceptance is separate. Performance benchmarks, real providers and live controller benefit are NOT RUN. Commands and checklists below retain the original specification; current implementation adapts the consolidated Plans01–05 owners rather than historical signatures.

**Baseline:** Publikasi rencana `4b3e32d464b98aa5116df02e8fe524217d5ad811` berbeda dari HEAD checkout inspeksi `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3` plus 174 path staged. Temuan berikut berasal dari working source, bukan klaim isi ketiga tree identik. Eksekusi harus merekam commit dan SHA-256 file input, memakai checkout bersih yang disetujui, serta tidak memasukkan staging pekerjaan lain.

## Global Constraints

- `M/` berarti `SubProject/agent-core-memory/src/memory/`; `T/` berarti `SubProject/agent-core-memory/tests/`.
- Tidak membaca `.env`, secrets, private Memory/runtime atau folder terlindungi. Fixture synthetic dalam temp root saja.
- Cache opt-in host-local; default disabled sampai acceptance. Tidak ada konfigurasi dari argumen tool publik, persistensi query, shared process cache, telemetry raw query, atau cached ACL.
- Probe Cloudflare yang dihentikan tetap berhenti; configured bukan verified. Semua acceptance wajib offline.
- Dokumen tidak mengotorisasi implementasi, instalasi, release, deployment atau perubahan izin. `docs/CODEBASE.md` diperbarui kelak setelah implementasi nyata.

## Evidence dan distinct-scope matrix

`M/index.ts:329–345::semanticContext` memuat dan memvalidasi index lalu selalu memanggil `embedDocuments([query])`. `M/index.ts:155–173::build` sudah menggunakan ulang embedding dokumen bila identity/fingerprint cocok; itu bukan gap baru. `M/controller-session.ts:98–149::recall` melakukan snapshot/rank lagi untuk continuation. `M/service.ts:229–235,1163–1176` merupakan consumer semantic; `M/embedder.ts:3–13` mendefinisikan identity provider/model/dimensions dan API tanpa AbortSignal. Penghematan aktual belum diukur.

| Rencana lain | Batas yang dipertahankan di 08 |
|---|---|
| 01 filtered semantic | Tidak memperbaiki subset/corpus; menerima signature terbaru jika sudah merged |
| 02 ranking policy | Tidak cache ranked pages, score, feedback, cursor atau policy |
| 03 task/workspace | Tidak mendefinisikan ulang binding/autentikasi |
| 04 contextual index | Mengonsumsi versi representation, tidak membangun dokumen/index baru |
| 05 outcome evaluation | Gate mekanik lokal, tidak menyalin harness/manfaat reasoning |
| Adaptive parallel | Singleflight query identik saja, bukan scheduler/resource admission |
| 09 subquestion | Tidak memecah query atau menentukan reasoning controller |

[Cookbook RAG](https://platform.claude.com/cookbook/capabilities-retrieval-augmented-generation-guide) memakai `query_cache` untuk memakai ulang vector query. [Contextual retrieval](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide) juga mencontohkan cache query, terpisah dari embedding dokumen berkonteks. Adaptasi lokal menambahkan batas, identity dan invalidasi; tidak menyalin serialisasi pickle, cache tanpa batas, atau mengklaim hasil benchmark cookbook sebagai hasil Agent Core. Keduanya diverifikasi 2026-10-09.

## Kontrak mandiri

Default usulan opt-in: 128 entry selesai, maksimum 2 MiB vector payload (`8 × dimensions` per vector), TTL absolut 60.000 ms, maksimum 8 flight berbeda dan 32 waiter per flight. Ini batas desain usulan, bukan kapasitas mesin terukur. TTL memakai monotonic clock yang diinjeksi. Query lebih dari 16 KiB UTF-8 melewati cache/singleflight dan memakai jalur lama. Kapasitas penuh pada flight/waiter juga bypass, bukan antrean tanpa batas; admission provider tetap milik jalur existing.

Key berupa SHA-256 encoding tuple length-safe: namespace `memory-query-cache/v1`, provider, model, dimensions, queryRepresentationVersion, documentRepresentationVersion, cache generation, dan byte query persis yang diterima semanticContext. Tidak lowercase, trim tambahan atau menyatukan whitespace; normalisasi caller tetap existing. Version query awal `embedDocuments-query/v1`; representation dokumen awal `semantic-document/v1` atau constant rencana 04 jika tersedia. MemoryIndex membuat cache privat sendiri dari limits, bukan menerima objek cache yang bisa dibagikan caller. Satu cache melekat pada tepat satu embedder instance dan MemoryIndex, sehingga endpoint/account berbeda tidak berbagi walau label model sama. Penggantian instance/config menghapus cache; credentials tidak menjadi key/log.

Cache memuat vector saja, bukan query mentah setelah flight selesai, record IDs, corpus, workspace permission, hasil ranking atau keputusan trust. Simpan dan kembalikan salinan vector; caller tidak bisa meracuni entry melalui mutation. Dimensi harus cocok, semua nilai finite; failure, zero-length, malformed, timeout dan cancellation tidak di-cache. LRU mengusir entry selesai; flight bukan eviction victim. `clear()` menaikkan generation sehingga completion lama tidak mengisi generation baru.

Cancellation berlaku per waiter. Abort satu waiter tidak menggagalkan waiter lain. Semua waiter batal menandai flight abandoned; completion provider ditelan dengan handler rejection, tidak di-cache. API embedder existing tidak mampu membuktikan penghentian network, sehingga cancellation lokal hanya berhenti menunggu/memakai hasil. Jangan mengklaim request provider dibatalkan atau mengganti transport dalam scope ini. Entry flight ditahan sampai promise provider settle agar cancellation tidak membuka flight duplicate tanpa batas. `dispose()` bersifat terminal: melepaskan waiter dengan AbortError, menaikkan generation dan menolak semua get berikutnya; provider lama tetap ditangani sampai settle. Lifecycle shutdown owner memanggil dispose, tanpa mengklaim network abort.

## Review Focus

1. Unicode/whitespace query berbeda tidak bertabrakan (Task 1).
2. Provider/model/dimensi/representation berubah pada flight aktif (Task 1–2).
3. Semua waiter abort tetapi provider belakangan selesai/reject (Task 2).
4. Warm cache setelah record expired, forgotten atau workspace berubah (Task 3).
5. NaN, vector mutable, dan capacity-pressure tidak meracuni hasil (Task 1–2).

## Task 1 — Cache vector bounded dan identity

**Files:** Create `M/query-embedding-cache.ts`, `T/memory-query-embedding-cache.test.ts`.

**Interfaces usulan:** `QueryEmbeddingKey={identity:MemoryEmbedderIdentity;queryRepresentationVersion:string;documentRepresentationVersion:string;query:string}`; `QueryCacheLimits={maxEntries:number;maxVectorBytes:number;ttlMs:number;maxFlights:number;maxWaiters:number;maxQueryBytes:number}`. `QueryEmbeddingCache(limits:QueryCacheLimits, now:()=>number)` menyediakan `getOrCreate(key:QueryEmbeddingKey, produce:()=>Promise<number[]>, signal?:AbortSignal):Promise<number[]>`, `clear():void`, `dispose():void`, `stats():{entries:number;vectorBytes:number;flights:number;hits:number;misses:number;joins:number;evictions:number;bypasses:number}`. Stats tidak memuat key/query/vector.

- [ ] Tulis `same_query_hits_once`, `identity_and_representation_partition`, `unicode_is_exact`, `ttl_is_absolute`, `lru_and_byte_limits`, `caller_mutation_is_isolated`. Assert dua request sama memanggil fake sekali; pergantian tiap field memanggil lagi; tepat TTL invalid; bytes/entry tidak melebihi batas.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-query-embedding-cache.test.ts`; simpan assertion relevan, bukan hanya import failure.
- [ ] Implementasikan key, validasi vector, copy, TTL/LRU dan stats minimum; tidak memakai wall clock atau persistence.
- [ ] GREEN: ulang command, tambahkan vector lebih besar dari budget yang tetap returned tetapi tidak tersimpan. Review dan commit hanya file task pada checkout bersih.

## Task 2 — Singleflight dan cancellation

**Files:** Extend kedua file Task 1.
**Consumes/produces:** API yang sama, dengan deferred promise fake untuk mengendalikan completion.

- [ ] Tulis `eight_waiters_one_call`, `one_abort_others_complete`, `all_abort_no_cache`, `clear_while_pending`, `rejected_flight_retries`, `capacity_bypass_is_explicit`. Assert delapan waiter satu provider call, waiter aborted menerima AbortError, hasil lama tidak repopulate setelah clear, error tidak tersimpan.
- [ ] Jalankan command Task 1 dan rekam RED untuk concurrency sebelum implementasi flight.
- [ ] Tambah reference-count waiter, cleanup listener pada settle, abandoned/generation guard, rejection handler; tidak memegang filesystem lock sambil menunggu provider.
- [ ] GREEN command yang sama; advance fake clock melewati TTL sebelum completion tidak mengubah identity. TTL entry mulai saat valid completion. Test `dispose_is_terminal` menolak get setelah dispose dan tidak repopulate; test flight selesai setelah shutdown dan valid vector berubah menjadi NaN pada fake tidak memunculkan unhandled rejection.

## Task 3 — Integrasi index tanpa cached trust

**Files:** Modify `M/index.ts`, `M/service.ts`; create `T/memory-query-cache-integration.test.ts`; update `docs/CODEBASE.md` setelah acceptance.

**Interfaces:** Tambahkan optional constructor options `MemoryIndex(..., options?:{queryCache?:QueryCacheLimits})`. Tambahkan `queryCache?:QueryCacheLimits` pada `MemoryServiceOptions` di `M/service.ts:32`; `MemoryService.initialize(baseDir,memoryRoot?,embedder?,options?)` dan constructor meneruskan salinan limits ke index. Index mengalokasikan cache privat, tidak menerima cache instance bersama; tidak mengubah schema tool. Tambahkan `MemoryIndex.dispose():void` untuk dispose cache; jalur teardown pemilik wajib memanggilnya bila tersedia, sedangkan drop instance/process termination tetap menghapus cache volatile. Jangan mengklaim host memiliki shutdown hook yang belum diverifikasi. `semanticContext` menerima optional cancellation options pada argumen terakhir yang kompatibel signature hasil rencana 01; tanpa 01 gunakan `(query,records,options?:{signal?:AbortSignal})`, dengan 01 gunakan `(query,canonical,eligible?,options?)`. Pilih satu bentuk sesuai source target dan pin di patch, bukan dua implementasi paralel.

- [ ] Sebelum source berubah, rekam RED perilaku baseline melalui fake embedder counting dan `semanticContext` existing: dua query identik menghasilkan dua call terhadap target satu. Baru tambahkan cache opt-in. RED integration: dua semanticContext untuk query sama menghasilkan satu fake call saat opt-in; disabled tetap dua. Test `same_labels_different_owners_never_share` membuat dua index dengan embedder identity identik tetapi fake endpoint/vector berbeda dan objek limits input yang sama: masing-masing harus memanggil fake sendiri dan mengembalikan vector miliknya. Uji pagination recall yang eligible dan corpus penuh tanpa bergantung perbaikan 01.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-query-cache-integration.test.ts`.
- [ ] Panggil cache hanya setelah index/corpus/vector eligibility valid. Setiap request tetap load/validate index, snapshot, current permissions, freshness dan trust; jangan cache SemanticSearchContext. Warm vector tidak boleh melewati filter atau stale cursor.
- [ ] GREEN: mutate content, expire/forget record, scope asing, corrupt index, changed representation, no-vector corpus; hasil current harus mengikuti kontrak existing. Record mutation tidak wajib menghapus vector query tetapi tetap memaksa pemeriksaan corpus ulang. Nol stale/scope disclosure adalah hard gate.

## Acceptance, rollback dan ZIP

- [ ] Jalankan targeted tests di atas, `npm --prefix SubProject/agent-core-memory run verify`, `npm run build`. Missing dependency adalah BLOCKED; jangan install otomatis. Ukur cold/warm/concurrent fake calls, payload bytes, latency raw/median/p95; untuk 20 request identik warm dan delapan concurrent pada cache kosong masing-masing tepat satu call. Hasil/ranking eligible harus sama cache on/off; tidak menjanjikan latency nyata atau penghematan billed.
- [ ] ZIP mendatang `memory-08-query-embedding-cache-report.zip` memuat report, results per case, seluruh logs RED/GREEN/regression, synthetic fixtures, call-count/cancellation traces, focused patch, source identities, serta manifest setiap path/bytes/SHA-256. Sertakan command/cwd/exit code/waktu dan PASS/FAIL/BLOCKED/NOT RUN; tidak mengemas `.env`, secrets, runtime pribadi, node_modules atau Git metadata.
- [ ] Ekstrak ke direktori baru, tolak duplicate/traversal/symlink, cocokkan daftar anggota, ukuran dan SHA-256; checksum ZIP disimpan di luar ZIP. Paket lengkap termasuk kegagalan, tanpa arbitrary file cap. Gate wajib gagal berarti FAIL, prasyarat hilang BLOCKED, bukan selesai.

Rollback: hilangkan opt-in dan clear cache; source revert hanya commit terkait setelah review, tanpa menghapus canonical/index atau reset 174 staged path. Tidak ada migrasi disk. Implementasi mandiri tidak bergantung lima rencana lain; konflik signature/service dengan 01/02/04 diselesaikan serial dan diuji ulang. Acceptance hanya mekanik offline; manfaat reasoning dan kualitas live tetap belum terbukti.
