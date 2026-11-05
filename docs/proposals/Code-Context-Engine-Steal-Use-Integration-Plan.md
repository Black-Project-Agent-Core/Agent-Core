# Absorpsi Code Context Engine ke Agent Core (Steal-Use)

Tanggal: 2026-11-06
Revisi: 3
Status: PROPOSED
Jenis: Improvement
Asal dan bukti: referensi lokal `code-context-engine` (paket `src/context_engine/`, lisensi MIT, folder referensi di luar repo ini). Bukti Agent Core berupa path relatif terhadap repo ini dan id catatan Cortex (lihat "Bukti dan ketidakpastian").

## Masalah dan tujuan

Permintaan user (2026-11-06): pelajari referensi `code-context-engine` (CCE) sedalam mungkin dan serap ke Agent Core. Keputusan user 2026-11-05 (Cortex `11f4d1aa-2511-4cc2-885c-1f4122d82526`): CCE tidak dipasang sebagai alat terpisah. Alur kerjanya diserap ke Memory Agent Core, lalu dicari titik optimal agar membantu. Indeks kode dua folder yang sudah dibuat user dengan CCE (Cortex `841abb1c-793c-4442-a338-ee074295e68f`) dimaksudkan untuk dipakai ulang.

Masalah yang terverifikasi di Agent Core:
- Pencarian kode Grafel bekerja di level entitas (nama simbol), bukan isi. Pada 2026-11-06, kueri natural language `how memory search fuses BM25 and embeddings` lewat `code_orient(action=find, search=bm25)` mengembalikan entitas `Bm25Profile` dan `buildBm25Profile`, plus duplikat dari salinan `runtime/memory/state/backups/legacy/...`. Fungsi fusi `searchMemories` (`src/memory/retrieval.ts:211-270`) tidak muncul di hasil.
- `code_symbol(action=find, includeBody=true)` mengembalikan rentang baris `searchMemories` (211-270), tetapi tidak mengembalikan teks body. Pengambilan isi harus dua langkah: cari rentang, lalu baca file.
- Tidak ada retrieval berbasis chunk isi kode (skor lexical atau vektor). Grafel dikonfigurasi dengan `GRAFEL_EMBEDDING_URL` kosong (`src/code-intelligence/grafel-runtime.ts:113`). Nilai kosong itu ada sejak baseline `639cdf77` (`git log -S`) dan tidak terdokumentasi di `docs/`.

Tujuan: menambah kemampuan retrieval isi kode di owner code-intelligence, memakai ulang owner yang sudah ada (tokenizer identifier, masking secret, batas output, validasi path), tanpa runtime baru, tanpa egress baru, dan tanpa menduplikasi Memory atau Grafel.

## Bukti dan ketidakpastian

Observasi (diperiksa langsung di sumber):
- `src/mcp/code-intelligence-schemas.ts:11-16`: action `code_orient` (status, overview, clusters, topology, modules, stats, find, inspect, diagnostics, quarantine, metrics); `search` = `bm25 | substring`.
- `src/mcp/code-intelligence-tools.ts`: handler `code_orient`. Action `find` diteruskan ke `grafel_find`. Action `context` lewat helper `runContextSearch` (Fase A).
- `src/code-intelligence/provider-capabilities.ts:4-17`: daftar tool inti Grafel. Tidak ada tool chunk atau embedding.
- `src/code-intelligence/grafel-runtime.ts:102-124`: environment provider. `GRAFEL_EMBEDDING_URL: ''` (baris 113), `GRAFEL_EAGER_ALGO: 'false'` (baris 112).
- `src/memory/embedder.ts:80-84`: embedder Memory hanya `cloudflare-workers-ai` (endpoint `api.cloudflare.com/.../ai/v1/embeddings`, model `@cf/google/embeddinggemma-300m`, 768 dimensi).
- `src/memory/identifier-tokenizer.ts:4-55`: tokenizer identifier `code-identifiers/v1` (token exact dan subword, batas panjang dan jumlah token).
- `src/memory/privacy-masking.ts:63-76`: `maskSecrets` (placeholder bertipe, mis. `[REDACTED:secret]`).
- `src/text-bounds.ts:2-7`: `truncateText`. `src/portability/paths.ts:23`: `pathInside`.
- `src/memory/mcp/schemas.ts:63`: `sourceFiles` (maks 32) pada tulis Memory. Ini padanan `record_code_area` CCE.
- `.grafelignore` (akar Source): mengecualikan `DO NOT TOUCH`, `SubProject`, `rdc`, `.rdc-standalone`, `launcher-publish`, `_artifacts`, `.grafel`, `.tmp`, `.env*`. Tidak mengecualikan `runtime/` dan tidak memuat pola `*.pem`, `*.key`, `credentials*`.
- `docs/instructions/code-intelligence.md:25-26`: temuan graf kode tidak boleh disimpan sebagai Memory. Indeks kode tinggal di owner code-intelligence.
- Status provider 2026-11-06: index `current`, grup `agent-core`, 88.798 entitas, 431.382 relasi.
- Catatan Cortex: `841abb1c` (indeks dua folder selesai: 50 target tanpa error; router kunci base, 02-05; chunk tests 9.775 dan SubProject 3.836; cache embedding 22.758). `6d882824` (kunci 02 lulus tes embedding, 768 dimensi, sama dengan kunci 1). `31d6248b` (aturan code index). `11f4d1aa` (keputusan absorpsi 2026-11-05).

Dari referensi CCE (diperiksa di kode lewat subagen `ecc:code-explorer`, selesai; ringkasan koreksi di bagian berikut):
- `src/context_engine/indexer/embedder.py:1-23`: tiga backend. Backend Cloudflare disebut "the same endpoint and model as Agent Core" dan opt-in karena "code chunks leave the machine" (`CCE_EMBED_BACKEND=cloudflare`). Default lokal `BAAI/bge-small-en-v1.5` (`src/context_engine/config.py:61`).
- README CCE: retrieval hybrid BM25 + vektor dengan RRF, graf CALLS/IMPORTS, memori sesi, ledger penghematan, grammar compression deterministik, scan secret.

Ketidakpastian (belum diverifikasi):
- Model Cloudflare yang dipakai indeks user belum diverifikasi byte per byte. Nilai `CLOUDFLARE_EMBEDDING_MODEL` di `.env` CCE sengaja tidak dibaca karena berisi kunci. Kesamaan model bertumpu pada komentar kode CCE dan dimensi 768.
- Format penyimpanan CCE (skema SQLite dan sqlite-vec) belum dibaca langsung dari indeks user. Fase B bergantung padanya.
- Kesegaran indeks CCE terhadap perubahan setelah 2026-11-05 belum diperiksa.
- Manfaat penghematan token belum diukur. Aturan user melarang benchmark.

## Koreksi dari analisis mendalam CCE

Hasil dossier mengoreksi atau mempertegas beberapa klaim Rev 1:
1. Chunking CCE hanya per fungsi atau kelas (tree-sitter), tanpa pemecahan berdasarkan ukuran. Kode di luar fungsi (konstanta, SQL, markdown) hilang bila ada minimal satu fungsi (`indexer/chunker.py`). Fase A memakai window baris, jadi cakupannya lebih luas.
2. Embedding Cloudflare CCE hanya membaca 1.600 karakter pertama tiap chunk (`indexer/embedder.py`, `_CF_MAX_INPUT_CHARS`), ekor chunk tidak diembed. Implikasi Fase B: vektor mewakili kepala chunk. Fase B harus memilih ukuran embed secara sengaja.
3. Graf CALLS tidak diproduksi di kode. IMPORTS mengarah ke node yang tidak pernah dibuat, dan `related_context` kosong untuk chunk kode (`storage/graph_store.py`, `indexer/pipeline.py`). Tidak diserap; Grafel tetap pemilik graf.
4. Pola redaksi Anthropic `sk-ant-(api03|admin01)-...` memakai grup menangkap, sehingga redaksi tidak lengkap (`indexer/secrets.py:120`, disimpulkan dari logika, belum dijalankan). Tidak diserap. Tindak lanjut yang disarankan: pemeriksaan hitungan (tanpa menampilkan nilai) pada indeks CCE yang sudah dibuat user, dengan izin user.
5. Redaksi di jalur memori CCE hanya PII (`memory/db.py:659-671`). Output tool disimpan tanpa batas dan tanpa redaksi rahasia (`memory/hooks.py:323-324`). Tidak diserap tanpa redaksi rahasia.
6. Hook server dan REST lokal CCE tanpa autentikasi yang memadai (`memory/hook_server.py`, `serve_http.py:210-213`). Tidak diserap.
7. Retrieval yang layak diserap sebagai algoritma: RRF k=60 dengan boost FTS 1.5 untuk intent CODE_LOOKUP; blend 0.5 confidence dan 0.5 RRF ternormalisasi; batas 3 chunk per file; potong marginal 0,75; guard top-1; dedupe overlap (`retrieval/retriever.py`). Stopword CCE hanya Inggris.
8. Grammar compression deterministik (`memory/grammar.py`, level lite default) layak untuk Fase C, dengan leksikon Indonesia dan aturan: negasi, angka, kode, path, dan URL tidak diubah.
9. Ledger penghematan CCE memakai tiga rumus berbeda: baseline ukuran file dibagi 4, estimasi output 500 kali persentase, dan progressive disclosure ukuran dibagi 6. Angka 94% hardcoded (`cli.py:1034-1035`). Tidak diserap.
10. Riwayat git hanya diindeks pada run full pertama (`indexer/pipeline.py:785`), padahal hook memanggil index non-full. Tidak diserap.
11. Salinan CCE di folder referensi tampak dimodifikasi lokal (komentar merujuk embedder Agent Core). Lisensi MIT; atribusi tetap ke pemilik asli. Pilihan salinan lokal atau upstream diserahkan ke user.

## Kritik peer (2026-11-06) dan tindak lanjut

Sesi penilai memberi delapan temuan. Setiap temuan saya cek di kode sebelum memperbaiki:
1. Indeks basi memberi rentang salah. Terbukti. Ditutup dengan validasi ukuran dan mtime per hit, rebuild saat berubah, dan pembuangan hit yang tetap tidak cocok.
2. Cabang `action=context` melewati telemetri dan bookkeeping controller. Terbukti. Ditutup dengan helper `runContextSearch`. Deskripsi tool tidak lagi menyebut Grafel untuk fitur ini.
3. Commit ganda, dan CODEBASE hanya di satu cabang. Terbukti. Commit di cabang aktif memuat kode, tes, changeset, proposal, dan entri CODEBASE. Entri CODEBASE dimasukkan lewat staging indeks saja, supaya edit pihak lain di working tree tidak ikut. Cabang duplikat tidak dipakai lagi.
4. Masker tidak menutup kata sandi tanpa digit atau bersimbol. Terbukti. Ditutup dengan aturan kedua pada snippet. Nilai bertanda kutip selalu ditutup. Aturan `secret-assignment` di Memory tidak diubah karena di luar scope.
5. Berkas besar terlewat diam-diam. Terbukti. Batas naik ke 2 MiB, dan setiap berkas yang dilewati dicatat dengan nama dan alasan.
6. Deny list peka huruf besar, `secrets` bertingkat, dan junction. Terbukti untuk dua yang pertama. Deny list kini tidak peka huruf besar, `secrets` ditolak di kedalaman mana pun, dan junction dicek lewat `realpath`. Tes junction hanya berjalan di Windows.
7. Celah tes. Terbukti. Tes baru mencakup cache basi, batas file dan waktu, berkas besar, biner, junction, folder terlarang bertingkat, kata sandi tanpa digit, single-flight, dan wiring action=context dengan telemetri.
8. Tanpa timeout dan single-flight. Terbukti. Ditambahkan single-flight per root dan anggaran waktu build 20 detik. Truncation dilaporkan dengan alasannya.

Tinjauan statis lewat workflow tidak selesai: dua reviewer tidak mencatat hasil, dan lensa ketiga tidak sempat dimulai. Penelusuran sendiri menemukan bug tambahan: indeks kosong ketika daftar berkas terpotong `maxFiles`. Bug itu diperbaiki sebelum tes hijau. Akibatnya belum ada tinjauan independen atas perbaikan ini; bukti yang tersedia adalah tes dan typecheck.

## Peta adopt / extend / build per kapabilitas CCE

| # | Kapabilitas CCE | Padanan di Agent Core (owner) | Keputusan | Alasan singkat |
|---|---|---|---|---|
| 1 | Chunk kode dan pencarian isi (BM25 identifier) | Grafel hanya entitas (`grafel_find`) | EXTEND: Fase A, `code_orient action=context` (diimplementasi lokal) | Celah terverifikasi (lihat Masalah) |
| 2 | Hybrid vektor + BM25 + RRF | Fusi BM25 + embedding untuk Memory (`src/memory/retrieval.ts`); embedder Cloudflare | EXTEND: Fase B, menunggu keputusan | Model dan endpoint sama; indeks sudah ada |
| 3 | Pakai ulang indeks dan cache embedding CCE | tidak ada | BUILD impor baca-saja: Fase B | Hindari embedding ulang; kuota harian base pernah habis |
| 4 | Graf CALLS/IMPORTS, related, paths | Grafel `related`, `find_paths`, `subgraph`, `trace` | ADOPT EXISTING | Sudah lebih kaya di Grafel; CCE tidak berfungsi (koreksi 3) |
| 5 | Chunking tree-sitter | Entitas Grafel dan rentang Semantic IDE (LSP) | REJECT | Tidak ada keunggulan spesialis (lihat Polyglot) |
| 6 | `record_decision`, `session_recall` | Memory: `memory_remember`, `memory_search`, Memory v2 | ALREADY | Tidak perlu tool baru |
| 7 | `record_code_area` | Memory `sourceFiles` (`src/memory/mcp/schemas.ts:63`) | ALREADY | Pakai `sourceFiles` |
| 8 | `session_timeline`, `session_event` | Learning episode (events), `get_recent_tool_calls` | ALREADY (sebagian) | Riwayat sudah ada per episode |
| 9 | `decision_extractor` (ekstraksi otomatis) | Learning checkpoint dan review, dikendalikan controller | REJECT | Kontrak melarang menyimpan hipotesis yang belum terverifikasi; regex CCE hanya Inggris |
| 10 | Memory nudges | Pengingat di `src/agent-controller.ts`, `src/mcp/external-controller-tool-support.ts` | DEFER | Butuh keputusan UX; bukan kebutuhan terverifikasi |
| 11 | Turn summarization | `src/agent-context-compaction.ts`, `src/learning/review-summary.ts` | ALREADY (owner lain) | Sudah ada |
| 12 | Grammar compression memori | tidak ada | CANDIDATE: Fase C | Risiko hilangnya negasi; nilai belum terukur |
| 13 | Aturan output compression ke CLAUDE.md | caveman, ultracave, ponytail (level pengguna) | REJECT | Duplikat |
| 14 | Ledger penghematan dan dashboard | `src/memory/retrieval-ledger.ts`, `src/effective-cost.ts`, `src/agent-context-accounting.ts` | PARTIAL: CANDIDATE Fase C | Baseline file penuh belum ada; rumus CCE tidak konsisten (koreksi 9) |
| 15 | Masking secret dan PII | `src/memory/privacy-masking.ts`, `src/code-intelligence/changed-source-security.ts`, `src/security/redaction.ts` | ALREADY, dipakai ulang | Fase A memakai `maskSecrets` dan aturan kedua |
| 16 | Pengecualian file kredensial | `.grafelignore` hanya `.env*` | EXTEND: Fase A lewat deny-list | `.grafelignore` Grafel tidak diubah |
| 17 | Indeks inkremental, watcher, hook git | Grafel: index current, debounce reload 2000 ms | DEFER | Staleness belum terbukti di lapangan |
| 18 | Governor sumber daya (ONNX, PSI, flock) | tidak ada ONNX | REJECT | Tidak relevan |
| 19 | Endpoint HTTP `/search` | Permukaan MCP dan HTTP Agent Core | REJECT | Duplikat permukaan |
| 20 | Dashboard dan tabel harga | Native UI, `src/effective-cost.ts` | REJECT | Duplikat |
| 21 | Penulis config editor dan Agent Plugin | Plugin dan launcher Agent Core | REJECT | Owner lain |
| 22 | Hook fail-closed | Hook Agent Core | REJECT | Owner lain |

## Polyglot

CCE ditulis dengan Python (tree-sitter, sqlite-vec, fastembed atau Ollama). Agent Core adalah TypeScript/Node. Tidak ada keunggulan spesialis yang nyata dan terverifikasi yang membenarkan runtime Python kedua di dalam Agent Core. Tree-sitter dan sqlite-vec punya binding Node, dan Fase A cukup dengan pemecahan per baris. Keputusan: implementasi tetap TypeScript. Python tetap di luar Agent Core sebagai alat indeks yang sudah dipasang user, sampai Fase B memutuskan impor data.

## Mekanisme dan owner existing yang dipakai

Fase A (implementasi lokal, lihat Keputusan untuk branch):
- Permukaan: action baru `context` pada tool `code_orient` yang sudah ada. Tidak menambah tool, jumlah tool tetap. Owner: `src/code-intelligence/`.
- Modul `src/code-intelligence/context-search.ts`: indeks window 40 baris (geser 32) per root workspace, skor BM25 atas token identifier, dedupe window yang tumpang tindih per file. Setiap hit dicek terhadap ukuran dan mtime file saat indeks dibuat. Snippet dibaca ulang dari sumber, lalu di-mask sebelum dipotong.
- Handler `runContextSearch` di `src/mcp/code-intelligence-tools.ts` memakai pembukuan yang sama dengan tool provider: entri tracker, dan bookkeeping controller eksternal (read-only).
- Dipakai ulang: `tokenizeRetrievalText` dan `flattenRetrievalTokens` (Memory), `maskSecrets` (Memory), `truncateText`, dan resolver workspace `CodeIntelligenceService.resolveWorkspace` (root = `worktreePath ?? cwd`).
- Tidak ada Grafel baru, proses baru, jaringan, dependensi baru, atau state persisten baru. Cache indeks hanya di memori proses, 60 detik, dengan single-flight.

Fase B (menunggu keputusan user):
- Impor baca-saja indeks CCE (chunk, path, rentang baris, vektor, kunci hash) ke owner code-intelligence. Embedding ulang hanya untuk chunk baru atau berubah.
- Kueri di-embed dengan embedder Memory yang sudah ada (model dan endpoint yang sama dengan CCE cloud). Skor digabung dengan BM25 memakai Reciprocal Rank Fusion, seperti CCE.
- Egress: hanya teks kueri ke Cloudflare. Kode yang sudah terindeks adalah hasil keputusan user (lihat Otorisasi).

Fase C (kandidat, tidak dikerjakan):
- Grammar compression deterministik untuk keluaran recall Memory, dengan leksikon Indonesia. Aturan CCE dipertahankan: negasi (not, never, no, only, except), angka, kode, path, dan URL tidak diubah.
- Ledger penghematan konteks: token yang disajikan dibanding baseline file penuh, dicatat di ledger yang sudah ada.

## Scope, batas Native, risiko dan otorisasi

Scope Fase A:
- File: `src/code-intelligence/context-search.ts` (baru), `src/mcp/code-intelligence-schemas.ts` (nilai enum), `src/mcp/code-intelligence-tools.ts` (helper `runContextSearch`, cabang `context`, deskripsi tool), `tests/code-context-search-hardening.test.ts` (baru, menggantikan `tests/code-context-search.test.ts` yang dihapus), `docs/CODEBASE.md` (entri dan baris tabel code understanding, CRLF; hanya hunk milik Fase A), `.changeset/code-context-lexical-search.md` (intent minor), dan dokumen ini.
- Di luar scope: Grafel, `.grafelignore`, Memory, Learning, Native, promosi ke Platform, push, dan release.

Batas Native: tidak ada perubahan jalur Native, tidak ada grant tool baru, tidak ada proses yang berjalan terus.

Risiko dan mitigasi:
- Membaca konten terlarang: deny-list folder tidak peka huruf besar, berlaku di kedalaman mana pun: `runtime`, `release`, `backups`, `secrets`, `dist`, `build`, `coverage`, `bin`, `obj`, `.git`, `node_modules`, `_artifacts`, `launcher-publish`, `.tmp`, dan folder yang dilindungi. Di akar saja: `SubProject`, `rdc`, `.rdc-standalone`, `.grafel`. Nama file yang ditolak: `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.kdbx`, `*.keystore`, `*.jks`, `id_rsa*`, `credentials*`, `secrets*`, `.npmrc`, `.pypirc`, `.netrc`, `.pgpass`, `appsettings*.json`, dan `*.local.*`. Symlink dilewati. Junction dicek lewat `realpath`, dan direktori yang keluar dari root tidak dimasuki. File yang dikecualikan tidak pernah dibuka.
- Kebocoran rahasia di snippet: window di-mask dengan `maskSecrets`, lalu dengan aturan kedua untuk nilai key-value. Nilai bertanda kutip selalu ditutup. Nilai tanpa kutip ditutup bila panjang atau mengandung digit, supaya tipe seperti `password: string` tetap terbaca. Masking bersifat best-effort per window: rahasia yang terbelah di batas window tidak tertangkap. Aturan `secret-assignment` di Memory tidak diubah karena di luar scope.
- Basi: cache indeks 60 detik. Setiap hit dicek terhadap ukuran dan mtime file. Hit yang berubah memicu satu rebuild. Hit yang tetap tidak cocok dibuang (`staleDropped`). File baru di dalam TTL belum terlihat sampai indeks dibangun ulang.
- Indeks parsial: batas 4.000 file, 2 MiB per file, 60.000 window, dan anggaran waktu build 20 detik. Berkas yang dilewati dicatat dengan nama dan alasan (`skippedSamples`, `skippedByReason`). Alasan truncation dilaporkan (`truncatedReason`).
- SubProject dikecualikan, mengikuti `.grafelignore`. Ini berbeda dari indeks CCE yang memasukkannya. Keputusan user.
- Lexical tidak menangkap sinonim. Ditangani di Fase B.
- Otorisasi: keputusan Agent Core dari user (auto-accept Agent Core, 2026-11-04), arahan absorpsi (Cortex `11f4d1aa`), dan egress kode ke Cloudflare untuk indeks yang sudah dibuat user (Cortex `841abb1c`). Data runtime dan memori tetap tidak keluar dari mesin. `runtime` dan `secrets` tetap dikecualikan. Dokumen ini bukan persetujuan Fase B.

## Manfaat yang diharapkan dan keterbatasan

Diharapkan, belum terukur: kueri natural language menemukan rentang kode yang memuat istilah, termasuk fungsi yang namanya tidak memuat istilah kueri. Snippet langsung tersedia tanpa dua langkah cari lalu baca. File penuh yang dibaca berkurang.

Keterbatasan: lexical saja. Window baris bisa memotong fungsi (mitigasi: overlap 8 baris). Tidak ada benchmark (aturan user). Manfaat token tidak diklaim.

## Acceptance, evaluasi dan rollback

Acceptance fungsional, bukan kecepatan:
1. `npx vitest run tests/code-context-search-hardening.test.ts` lulus: 11 dari 11. Percobaan pertama merah (8 gagal, masing-masing menangkap bug yang dikritik). Percobaan kedua hijau.
2. Regresi: `tests/mcp-manifest-contract.test.ts` dan `tests/code-intelligence-{exact-graph,health-refresh,finalization,post-v033}.test.ts` lulus: 45 dari 45.
3. `npx tsc -p tsconfig.json --noEmit` lulus untuk seluruh proyek.
4. `npm run build` belum lulus di `path:check` karena snapshot `docs/PROJECT-STRUCTURE.md` stale. Kondisi ini sudah ada di HEAD `241ad96a` (diperiksa pada salinan HEAD). Fase A tidak menambah direktori. Perbaikannya adalah `npm run structure:sync` oleh owner.
5. Verifikasi di PC owner setelah promosi: `code_orient(action=context)` pada Platform. Hanya fungsional. Tidak ada benchmark.

Rollback: revert commit di branch. Tidak ada state persisten, jadi tidak perlu migrasi.

## Riwayat revisi

- Rev 1 (2026-11-06): draf pertama dari studi dan verifikasi di atas.
- Rev 2 (2026-11-06): dossier CCE selesai dan dikoreksi (bagian Koreksi). Fase A diimplementasi lokal.
- Rev 3 (2026-11-06): kritik peer atas implementasi diterima dan diperbaiki (bagian Kritik peer). Tes hardening 11/11 hijau; regresi 45/45 hijau. Cabang duplikat `feat/code-context-lexical` tidak dipakai lagi.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT.

Status implementasi: Fase A ada di branch aktif `fix/agent-core-tool-latency-and-ui-cards`, di atas commit `7944f5ff`, termasuk perbaikan kritik. Belum dipromosikan ke Platform, belum di-push, dan belum dijalankan di Platform. Commit `3ad0ad48` di cabang duplikat `feat/code-context-lexical` tidak dipakai lagi.

Keputusan yang diperlukan dari user:
1. Fase A: setujui, revisi, atau tolak.
2. Fase B: impor indeks CCE dan pakai embedding Cloudflare yang sama untuk pencarian semantik?
3. SubProject: diindeks seperti CCE, atau dikecualikan seperti Grafel?
4. Setelah impor, instalasi CCE di mesin ini dipensiunkan atau dibiarkan?
5. Salinan CCE: pakai salinan lokal di folder referensi atau upstream?
