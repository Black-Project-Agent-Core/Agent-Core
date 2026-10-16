> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Contextual Memory Index Implementation Plan


**Goal:** Membuat judul dan metadata canonical terpilih ikut dicari secara lexical/BM25/semantic, termasuk alias yang sudah disimpan sebagai keywords, dengan invalidasi index yang benar.

**Architecture:** Perluas satu builder dokumen deterministik yang dipakai seluruh channel. Versikan representation dan index turunan, serta masukkan seluruh input representation ke fingerprint. Canonical note, evidence, migration, dan privacy owner tetap menjadi sumber otoritas.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Vitest, MemoryIndex filesystem dan fake MemoryEmbedder existing.

**Spec:** Persyaratan mandiri dalam dokumen ini.

**Status:** IMPLEMENTED — offline focused functional acceptance PASS on 2026-10-10. User approved Plans 02–05. Aggregate integration verification, CODEBASE synchronization, publication identity and report ZIP are owned by the integrating controller. Baseline `c5e3fe970b770aaa5ba3023ea19239f71f53709c`; no provider calls, benchmarks or resident activation.

## Global Constraints

- `M/` berarti `SubProject/agent-core-memory/src/memory/`. Hanya representation turunan yang berubah; tidak ada entity graph, LLM enrichment, vector database baru, atau store kedua.
- Alias hanya berasal dari keywords yang sudah disimpan dan dapat diperiksa; tidak menebak entitas/relasi dari tetangga.
- Semua acceptance wajib offline. Provider Cloudflare configured tetapi unverified, probe berhenti atas permintaan pengguna dan tidak dilanjutkan.
- Jangan membaca/menyalin `.env`, secrets, folder terlarang, atau runtime canonical pengguna. Fixture synthetic di temp root saja.
- Rencana tidak mengotorisasi implementasi, install, embedding network, security settings, release, atau deployment. Jangan ikut meng-commit perubahan/staging pekerjaan lain.

## Review Focus

1. Edit title tanpa edit content harus menginvalidasi vector (Task 2).
2. Unicode/CRLF, metadata duplikat, serta label yang tertanam dalam teks tetap deterministik (Task 1).
3. Index lama/current model sama tidak boleh memakai embedding representation lama (Task 2).
4. Metadata yang berisi path, credential-like marker, atau unverified alias tidak diserap dari provenance/sumber lain (Task 1–3).
5. Rebuild gagal/crash tidak merusak canonical atau mengaku semantic tersedia (Task 3).

## Baseline dan persyaratan mandiri

Pada baseline, `M/semantic-document.ts:3–9` menggabungkan content, context, keywords, tags, dan category, tetapi tidak title. `MemoryRecord` di `M/types.ts` sudah mempunyai `title?:string`. `M/service.ts` sudah menyimpan title saat remember/batch dan memperbaruinya saat update; jadi ini gap pada representation, bukan field canonical baru.

Builder yang sama dipakai `M/retrieval.ts` untuk exact phrase/token overlap dan identifier haystack, serta `M/bm25.ts` untuk dokumen BM25. Perubahan builder berpengaruh lintas channel, sehingga lexical regression sama pentingnya dengan embedding. `M/index.ts` fingerprint pada baseline meliputi content/keywords/context/tags/category dan experience v2, tanpa title. `MemoryIndexFile` pada baseline masih version 2; `build` memakai ulang vector bila fingerprint dan identity sama. Menambah title ke builder saja tidak cukup: cache dapat tetap menggunakan vector lama.

Target yang dapat diuji: catatan berjudul identifier unik dapat ditemukan walau identifier tidak ada dalam content; alias yang memang ada dalam keywords membantu query; file tidak memperoleh metadata baru dari neighbor/caller tidak terverifikasi. Existing metadata canonical bukan bukti bahwa klaimnya benar. “Verified metadata” di sini berarti field yang sudah melewati capture/update owner dan memiliki evidence bila klaim menuntutnya, bukan memberi label verified baru karena ikut diindex. Uji fixture harus membedakan metadata berdasar evidence dan saran alias yang belum disimpan.

Allowlist representation tetap sempit: title, content, context non-General, keywords, tags, category non-Uncategorized. Jangan menambahkan raw provenance.repo, absolute path, gitRef, source.ref, evidence text, sourceSnapshot, identity, task ID, credentials, atau seluruh experience object ke teks embedding. Existing source-file ranking terpisah tetap bekerja tanpa menyebarkan paths ke semantic provider. Tidak ada otomatisasi penambahan alias. Penambahan keyword nyata memerlukan update canonical melalui owner existing dengan evidence, di luar pekerjaan index ini.

Cookbook [How to parse PDF docs for RAG](https://developers.openai.com/cookbook/examples/parse_pdf_docs_for_rag) digunakan sebagai inspirasi menjaga konteks pada representasi retrieval; adaptasi ini memakai title/metadata lokal yang tersedia, bukan OCR atau parsing PDF. [Context personalization](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization) memperlihatkan memory notes dengan keywords. Yang diadopsi hanya representasi ringkas dan scope; bukan distillation LLM, penyalinan profil pribadi, atau aturan recency-wins.

## Keputusan format, ownership, dan interface

Signature `buildSemanticDocument(record: MemoryRecord): string` tetap. Tambahkan export `SEMANTIC_DOCUMENT_VERSION = 2 as const` pada `M/semantic-document.ts`. Urutan output diputuskan: `title: <title>` jika nonempty, content, context, keywords, tags, category. Normalize CRLF menjadi LF dan trim pada nilai yang dirender; pertahankan Unicode dan urutan keyword canonical agar tidak mengubah arti/menyisipkan synonym. Deduplikasi alias baru tidak dilakukan di builder: duplicates existing diuji dampaknya, perubahan canonical memakai owner metadata sendiri.

Implemented index: `MemoryIndexFile.version: 3` dan `semanticDocumentVersion: typeof SEMANTIC_DOCUMENT_VERSION`. `fingerprint(record)` meliputi identity record, seluruh field yang telah ada, title, serta representation version dan hasil `buildSemanticDocument(record)`. Mempertahankan experience dalam fingerprint menjaga invalidasi yang sudah ada walau experience tidak dikirim ke provider. Mutable retrievalCount/lastAccessedAt tidak ditambahkan.

`validateIndexFile` menolak format 2 sebagai unsupported derived format; `inspect` menyatakan degraded, sementara `ensure` existing dapat membangun ulang dari canonical saat setup/repair yang sah. Version 2 tidak di-upgrade dengan sekadar mengganti angka. Embeddings lama tidak dipakai ulang melintasi format/representation version; repair key mendapat fingerprint baru. Atomic write existing dipertahankan. Public canonical schema version dan migration activation tidak berubah.

## Task 1 — Representation satu pintu dan privacy allowlist

**Files:** Modify `M/semantic-document.ts`; create `SubProject/agent-core-memory/tests/memory-contextual-document.test.ts`.
**Consumes:** MemoryRecord v1/v2 existing. **Produces:** builder signature tetap dan SEMANTIC_DOCUMENT_VERSION 2.

- [x] Buat red fixture record title `Nebula Adapter`, content berbeda, keywords alias `penghubung-nebula`. Assert builder memuat title tepat sekali dan alias canonical; proposed alias yang hanya ada pada neighboring fixture tidak muncul.
- [x] Assert lexical token overlap dan BM25 untuk query title meningkat dari baseline, menggunakan `searchMemories` dan `buildBm25Profile`, tanpa membutuhkan fake provider. Sertakan query irrelevant untuk membuktikan semua judul tidak otomatis dianggap relevan.
- [x] Jalankan dari root `npm --prefix SubProject/agent-core-memory test -- tests/memory-contextual-document.test.ts`; red harus gagal pada title yang hilang.
- [x] Implementasikan rendering/constant. Tambahkan CRLF, judul whitespace, Unicode Indonesia, title panjang, duplikat keyword, content berisi string `title:`. Tidak memotong content diam-diam; batas chunk embedder existing tetap berlaku dan dicatat.
- [x] Tambahkan provenance/sourceSnapshot dengan marker synthetic `PRIVATE_PATH_SENTINEL`, dan experience evidence marker. Assert marker tidak muncul dalam builder/spy embedDocuments selama marker tidak ada di allowlisted content; metadata terlarang tidak disapu masuk. Jika marker memang ada pada content, safety owner harus dinilai terpisah, bukan janji builder men-scrub segala rahasia.
- [x] Ulangi test sampai PASS dan review file task secara terarah. Commit terintegrasi dimiliki integrating controller.

## Task 2 — Versioning dan fingerprint yang menutup stale-vector reuse

**Files:** Modify `M/index.ts`; create `SubProject/agent-core-memory/tests/memory-contextual-index-version.test.ts`.
**Consumes:** SEMANTIC_DOCUMENT_VERSION dan builder Task 1. **Produces:** index format 3 dengan representation version; ensure/rebuild tetap signature existing.

- [x] Tulis red test fake embedder dengan call log; build record lalu edit title saja. Assert ensure memanggil embedder untuk record berubah, fingerprint berubah, semanticText baru tersimpan; record tak berubah tidak diembed ulang pada format sama.
- [x] Tulis fixture index format 2 synthetic dengan identity provider/model/dimensions sama. Assert inspect degraded; ensure menulis format 3 dan semanticDocumentVersion 2 setelah rebuild, tidak reuse vector lama. Ulangi restart lalu ensure: zero document re-embedding ketika corpus sama.
- [x] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-contextual-index-version.test.ts`; simpan red output dan exit code.
- [x] Implementasikan format validation/fingerprint/build output secara konsisten di semua literal file index. Tambahkan tests untuk representation version salah, title removal, keywords edit, experience edit, lastAccessedAt/retrievalCount edit. Dua metadata akses terakhir tidak menyebabkan document re-embedding.
- [x] Ulangi test sampai PASS. `rg -n 'version: 2|version:2' SubProject/agent-core-memory/src/memory/index.ts` dipakai untuk review literal index tersisa, bukan mengganti seluruh record v2. Review fixtures lain yang memuat raw index version secara selektif, commit terintegrasi dimiliki integrating controller.

## Task 3 — Rebuild/fallback, channel regression, dan rollout

**Files:** Extend dua test baru; update `docs/CODEBASE.md` setelah implementasi.

- [x] Tambahkan fake provider gagal, mismatch dimensions, partial vector batch, interrupted atomic write, corrupt old index dan retry-bound repair. Canonical note digests sebelum/sesudah harus identik; lexical masih bekerja, semantic status jujur degraded, tidak ada stale vector trusted. Gunakan fault injection lokal sesuai pola existing index/store tests, bukan menghentikan proses resident.
- [x] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-contextual-document.test.ts tests/memory-contextual-index-version.test.ts tests/memory-controller-scope.test.ts tests/memory-phase8-10.test.ts`; lalu `npm test -- tests/memory-bm25-ranking.test.ts tests/capability-residual-wave.test.ts` dari root.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory run verify` dan `npm run build`. Jika dependency tidak ada, laporkan BLOCKED tanpa install otomatis.
- [ ] Bandingkan title-only, alias-only, metadata-noise, adversarial metadata dan held-out queries pada baseline/candidate corpus identik. Rekam relevansi per kasus, no-answer/negative behavior, document bytes, embedding call count, cache hit, median/p95 latency. Jangan menetapkan performance gain sebagai fakta; target rollout ditetapkan dari baseline sebelum hasil candidate dinilai.
- [x] Review privacy diff dari spy embedDocuments: hanya allowlist terencana yang bertambah. Version bump bukan perubahan pasif: startup/initialize memanggil ensure, yang menangkap format unsupported lalu dapat melakukan full re-embedding dengan provider configured. Tambahkan test startup menggunakan index v2 + fake embedder spy: call log membuktikan semua entry perlu diembed ulang, tanpa network. Karena itu jangan start/restart resident dengan build baru sampai reindex, volume, data yang dikirim, dan plafon biaya disetujui. Gate operasional ini terpisah dari acceptance offline; tanpa persetujuan, resident rollout BLOCKED. Tidak mengklaim operator hanya akan mengirim data setelah memanggil rebuild secara manual.

## Acceptance independen, urutan, dan rollback

Rencana 04 dapat selesai sendiri menggunakan index langsung dan lexical service fixture. Tidak bergantung pada perbaikan subset 01 atau opt-in fusion 02. Jika 01 diterapkan lebih dahulu, fingerprint validator dan tiga-arg semanticContext harus tetap sejalan; shared `index.ts` dikerjakan serial. Rencana 05 dapat mengukur dampak outcome lebih luas tanpa menjadi syarat circular.

Gate wajib: red title/fingerprint terbukti, tests/build/verify PASS, format lama tidak dipercaya, no scope leak/stale trust violation, canonical bytes tidak berubah oleh rebuild, dan report ZIP terverifikasi. Ini tidak membuktikan provider Cloudflare bekerja atau retrieval tambahan meningkatkan jawaban controller nyata.

Rollback terarah revert source/test/CODEBASE task. Binary lama akan menolak derived format 3; lakukan rebuild derived index dengan binary yang sesuai pada maintenance yang disetujui. Jangan menghapus canonical notes/experience, menurunkan canonical schema, atau mengubah token provider. Simpan manifest before/after; existing atomic/recovery owners dipakai, bukan rollback framework baru.

## ZIP wajib dan status jujur

Hasil implementasi wajib `memory-04-contextual-index-report.zip`: report.md, results.json per case/channel, logs red/green/build/regression, synthetic old/new index fixtures, evidence document/input diff yang disanitasi, focused patch, baseline/candidate commit/source identities, dan manifest.sha256 untuk seluruh payload. Tidak ada batas jumlah file arbitrer; jangan memasukkan `.env`, credential, runtime user, atau raw secret-bearing path. Ekstrak ke folder temp baru, cocokkan daftar dan SHA-256 semua payload, lalu catat pemeriksaan itu.

Report wajib memuat command/cwd/exit code, ukuran corpus, fake identity, status PASS/FAIL/NOT RUN/BLOCKED, perubahan file/config/proses, dan batas klaim. Task belum selesai jika gate wajib atau extraction gagal. Live provider/controller scenario diberi NOT RUN/BLOCKED terpisah sampai secure setup/biaya/data-disclosure diizinkan; tidak diperlukan untuk menilai perbaikan offline ini.

## Execution ledger — 2026-10-10

- Task 1: PASS, seven synthetic offline tests. Missing title, normalization and version constant were observed RED before implementation. Canonical alias order and duplicates remain unchanged. Long documents are not truncated by this builder; existing embedder chunking remains bounded to six chunks of up to 1,600 characters.
- Task 2: PASS, 16 contextual index tests after 11 expected RED failures. Index format 3 carries document version 2; title, rendered document and representation version bind fingerprints and controller semantic revision. Format 2 and unknown representations trigger a complete rebuild, never a numeric relabel. Access telemetry remains outside embedding identity.
- Required focused regressions: 43/43 combined document/index/semantic-subset tests; 62/62 extended standalone tests. Standalone build and root build/path policy PASS. Root capability residual suite PASS; root BM25 budget assertion fails unchanged on the independently checked baseline and is tracked separately by the integrating controller.
- Identical synthetic corpus functional comparison: five records, six cases across lexical/BM25/semantic channels, 18 case/channel outcomes PASS; provider documents expand from 212 to 330 bytes, five documents re-embedded from format 2, zero document calls on restart cache hit. No measured real-provider benefit is claimed.
- Benchmarks, measured latency/quality benefit and live Cloudflare/provider/controller scenarios: NOT RUN, explicitly deferred. Full standalone verify will be replaced by build plus functional suites excluding the lifecycle benchmark suite.
- Resident Windows activation: BLOCKED until the actual provider-bound fields, reindex volume and cost ceiling are approved. Startup calls ensure and may re-embed every canonical record automatically. No resident process was started or restarted.
- Product-version impact: patch release intent added; product version surfaces and publication are owned by the integrating controller. No commit, push, release or deployment performed by this workstream.
