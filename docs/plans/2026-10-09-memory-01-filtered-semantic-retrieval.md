# Filtered Semantic Retrieval Implementation Plan


**Goal:** Mempertahankan pencarian semantik pada subset workspace/temporal yang sah tanpa melonggarkan validasi corpus canonical.

**Architecture:** Pisahkan input validasi seluruh corpus dari kandidat yang boleh mendapat vector. Tetap gunakan MemoryIndex, snapshot FileMemoryStore, seleksi temporal, dan ControllerMemorySession yang ada; tidak membuat index per workspace atau memory store baru.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Vitest, filesystem canonical, MemoryEmbedder fake deterministik.

**Spec:** Bagian “Spesifikasi mandiri” dalam file ini.

**Status:** IMPLEMENTED IN ISOLATED SOURCE — local offline verification PASS (537 Memory tests; root build PASS); external-controller acceptance pending. Implementation baseline: `bcdde08f40330f405173bb47a0a2eca06621c135`. Original planning baseline: `c5e3fe970b770aaa5ba3023ea19239f71f53709c`. Tanggal rencana: 2026-10-09 (UTC+7). Checklist below records the original implementation procedure. The local evidence report records commands actually run; external acceptance remains a separate gate. Plan 02 must not begin before the user returns its acceptance report and that report is reviewed.

## Global Constraints

- Source utama berada di `SubProject/agent-core-memory/src/memory/`; singkatan `M/` selanjutnya hanya merujuk direktori itu.
- Offline fake embedding adalah jalur acceptance wajib. Cloudflare dikonfigurasi tetapi kemampuan model aktual belum terverifikasi; probe yang dihentikan pengguna tetap dihentikan.
- Jangan membaca, menyalin, mengemas, atau mengubah `.env`, secrets, direktori terlarang, maupun runtime canonical pengguna untuk fixture.
- Rencana bukan izin implementasi, perubahan keamanan, instalasi, provider call, atau deployment. Gunakan worktree bersih yang disetujui saat eksekusi; jangan mengganggu staged changes pekerjaan lain.
- Adapter, migration, freeze/reconcile/rollback, capsule, serta temporal engine sudah tersedia dan tidak dibangun ulang.

## Review Focus

1. Subset kosong tidak memanggil embedder (Task 1).
2. ID sama tetapi fingerprint kandidat berbeda tidak menggunakan vector lama (Task 1–2).
3. Workspace asing/pinned palsu tidak lolos melalui semantic maupun linked results (Task 2).
4. Index parsial atau corrupt tidak dianggap corpus sehat (Task 2–3).
5. Perubahan canonical di antara snapshot dan ranking menghasilkan stale error, bukan jawaban campuran (Task 2).

## Spesifikasi mandiri dan alasan

`M/index.ts:113–123`, fungsi `fileMatchesRecords`, mensyaratkan jumlah entry dan fingerprint seluruh records sama. `MemoryIndex.semanticContext(query, records)` di sekitar baris 329 menggunakannya sebelum embedding query. Namun `M/service.ts:218–235` menyerahkan records yang telah dibatasi workspace, visibility, dan temporal oleh controller. Jalur umum `MemoryService.search` juga mengirim `activeRecords` di sekitar baris 1166. Karena index mencakup corpus canonical, subset yang lebih kecil dapat membuat semanticContext menjadi null walaupun vector valid. Ini diagnosis dari sumber; red test harus membuktikan kasus sebelum menyebutnya defect terverifikasi.

Target: query sinonim yang tidak punya overlap lexical tetap memperoleh vector milik kandidat eligible. Validasi index terhadap corpus penuh, provider/model/dimensions, dan fingerprint tetap wajib. Vector record yang tidak eligible menurut kontrak surface, forgotten, expired, superseded, archive yang tidak diminta, atau temporal tidak berlaku tidak boleh hadir dalam map ranking. Controller hanya mengecualikan foundation pinned dari batas workspace; public search saat ini mengizinkan semua pinned lintas workspace. Kompatibilitas public pinned itu dipertahankan dan diuji eksplisit, bukan diklaim sebagai isolasi strict controller. `selectTemporalCandidates` di `M/temporal.ts` menghasilkan record revision terkini dengan valid-time filtering; fitur ini bukan pemulihan historical bytes dan rencana tidak mengubah semantik itu.

Bukan sasaran: menaikkan threshold/weight, mengganti provider, mengaktifkan fusion, menambah graph, membuktikan manfaat model nyata, atau memperbaiki seluruh concurrency store. Kenaikan recall yang diharapkan adalah hipotesis; report hanya menyatakan hasil yang diukur.

Inspirasi [Cookbook RAG matching](https://developers.openai.com/cookbook/examples/how_to_combine_gpt4o_with_rag_outfit_assistant): pencarian cosine memakai corpus vector yang telah dihitung. Adaptasi lokal memisahkan validitas corpus dan izin kandidat; bukan menyalin pipeline gambar atau menambah OpenAI dependency. [Context personalization](https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization) menjelaskan pemisahan scope memory. Di sini scope merupakan batas host yang sudah ada, bukan label yang dipilih model.

## Keputusan interface dan file

Ubah signature internal, kompatibel untuk pemanggil lama:

`MemoryIndex.semanticContext(query: string, canonicalRecords: MemoryRecord[], eligibleRecords: MemoryRecord[] = canonicalRecords): Promise<SemanticSearchContext | null>`.

Validasi `fileMatchesRecords(file, canonicalRecords, embedder)` dahulu. Selanjutnya validasi bahwa setiap eligible ID unik, ada pada corpus, dan fingerprint sama; mismatch mengembalikan null pada lapisan index. Bangun vectors hanya dari irisan eligible dan valid entry, tanpa mengubah file index. Query embedding dilakukan setelah diketahui ada vector eligible; tetap validasi dimensi dan nilai finite. Dua-arg call berarti seluruh corpus, bukan bypass.

Di `M/service.ts`, controller rank mengambil snapshot canonical lengkap melalui `store.snapshot`, memeriksa complete/issues dengan aturan fail-closed yang sudah digunakan snapshot controller, dan membandingkan semantic revision kandidat terhadap canonical sebelum ranking. Jika kandidat berubah/hilang setelah snapshot sebelumnya, lempar `MemoryControllerError('MEMORY_CURSOR_STALE')`; jangan menyamarkannya dalam catch provider. Snapshot callback hanya mempersiapkan salinan immutable dan validasi, lalu lepaskan lock sebelum network-capable embedDocuments. Fingerprint index memverifikasi salinan tersebut; mutation berikutnya tetap ditangani kontrak cursor berikutnya. Jangan memegang filesystem lock selama provider call.

Pada `search`, gunakan raw canonical records untuk validasi index. Turunkan `semanticEligible` dari activeRecords menggunakan predicate yang sama dengan public search: bila workspace ada, hanya `record.pinned || resolveWorkspace(record.provenance.workspace) === workspace` (provenance harus ada); tanpa workspace, seluruh activeRecords. Jangan mengirim activeRecords lintas-workspace langsung sebagai subset. Public search mempertahankan all-pinned exception existing; controller tetap foundation-only. Test public pinned foreign sengaja eligible, nonpinned foreign tidak; test controller pinned foreign selalu ditolak. Normalisasi alias workspace bagi ranking jangan mengubah material fingerprint yang divalidasi. Jika rencana 04 sudah menambah field fingerprint, kedua array harus tetap merujuk semantic revision canonical yang sama. Tidak perlu API/tool schema baru.

## Task 1 — Buktikan dan perbaiki kontrak subset pada index

**Files:** Modify `M/index.ts`; create `SubProject/agent-core-memory/tests/memory-semantic-subset.test.ts`.

**Consumes:** `MemoryEmbedder { identity; embedDocuments(texts): Promise<number[][]> }`, `MemoryIndex.rebuild(records)` dan `resolveMemoryPaths` existing.
**Produces:** signature semanticContext tiga argumen di atas.

- [ ] Buat fixture temp dengan records `allowed`, `foreign`, `expired`; fake identity `fixture/subset-v1/3`, vector query/allowed `[1,0,0]`, foreign `[0,1,0]`. Semua teks/vector synthetic dan tidak memakai provider factory.
- [ ] Tambahkan test `eligible_subset_keeps_semantic_vectors`: rebuild seluruh corpus, panggil canonical+subset `[allowed]`; assert context non-null, keys tepat `['allowed']`, cosine allowed 1. Pada baseline test padanan dua argumen subset harus FAIL karena null, bukan karena import salah.
- [ ] Jalankan dari root: `npm --prefix SubProject/agent-core-memory test -- tests/memory-semantic-subset.test.ts`; simpan red assertion/output/exit code.
- [ ] Implementasikan signature dan validasi. Tambahkan kasus empty subset, missing ID, changed content/fingerprint, duplicate eligible ID, provider identity berubah, vector NaN/salah dimensi. Empty dan invalid subset tidak memanggil query embedder; invalid corpus tidak dilonggarkan.
- [ ] Jalankan command yang sama; semua assertions PASS. Rekam bahwa full-corpus call dua argumen tetap kompatibel. Commit terpisah hanya file milik task setelah review; jangan `git add .`.

## Task 2 — Integrasikan controller dan pencarian umum

**Files:** Modify `M/service.ts`; create `SubProject/agent-core-memory/tests/memory-controller-semantic-subset.test.ts`; extend test Task 1 untuk service search.

**Consumes:** signature Task 1; `MemoryService.controller(scope)`, `ControllerMemorySession.recall`, snapshot store existing.
**Produces:** semantic eligibility sesuai filter existing tanpa mengubah public RecallInput.

- [ ] Tulis red integration: workspace A punya catatan sinonim, workspace B punya exact lexical distractor; fake embedding mempertahankan semantic signal A. Gunakan temporary standalone experience store sesuai fixture existing `memory-temporal.test.ts`. Assert A tampil karena vector, B tidak tampil dan tidak berada dalam vectors rank.
- [ ] Tambahkan temporal before/after boundary, forgotten, expiry, archive default/explicit, foundation versus foreign pinned, dan provider throw. Assert selection temporal tetap sama, lexical fallback hanya eligible, tidak ada stale/foreign record terungkap.
- [ ] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-controller-semantic-subset.test.ts` untuk red yang spesifik.
- [ ] Integrasikan raw corpus plus eligible subset di kedua call site; tambahkan race fixture yang mengganti kandidat di antara controller snapshot dan rank. Assert `MEMORY_CURSOR_STALE`; index corrupt/provider failure tidak menghasilkan sukses semantik palsu.
- [ ] Jalankan kedua test baru dan `npm --prefix SubProject/agent-core-memory test -- tests/memory-controller-scope.test.ts tests/memory-temporal.test.ts tests/memory-temporal-order.test.ts`; hasil PASS diperlukan sebelum review/commit task.

## Task 3 — Gate, rollback, dan bukti

- [ ] Jalankan `npm --prefix SubProject/agent-core-memory run verify` dan `npm run build`; dependencies harus sudah tersedia. Jika belum, tandai BLOCKED dan minta setup sesuai izin, jangan install otomatis.
- [ ] Ukur corpus synthetic berukuran sama pada baseline/candidate: semantic availability, top-k label hit, query calls, median/p95 waktu dan bytes. Laporkan raw observations; jangan membuat SLA atau klaim speedup sebelum baseline. Zero scope leak dan zero penggunaan stale vector adalah gate keras.
- [ ] Perbarui bagian implementasi relevan `docs/CODEBASE.md` setelah source benar-benar berubah. Rencana ini sendiri tidak mengubah CODEBASE karena status tetap proposed.
- [ ] Buat ZIP `memory-01-filtered-semantic-retrieval-report.zip` dengan `report.md`, `results.json`, seluruh log red/green/gate, fixtures synthetic, evidence call-count/scope/race, patch terfokus, baseline/candidate commit atau source hash, serta `manifest.sha256` untuk semua payload. Tidak ada file-cap arbitrer; jangan menyisipkan runtime/credential.
- [ ] Ekstrak ZIP ke folder temp baru, verifikasi setiap SHA-256 dan kelengkapan file terhadap manifest. Report memuat command, cwd, environment, exit code, waktu, PASS/FAIL/NOT RUN/BLOCKED, batas verifikasi dan aksi material. Task belum selesai bila gate wajib gagal atau report tidak dapat diekstrak.

## Urutan, acceptance, dan rollback

Bisa dikerjakan sendiri sebelum rencana 02/03/04. Rencana 05 opsional untuk comparative outcome lebih luas, bukan dependency acceptance. Perubahan `service.ts` beririsan dengan 02 dan `index.ts` dengan 04: kerjakan serial/rebase dan ulangi gate, jangan paralel merge blind.

Acceptance independen: red yang terbukti, seluruh targeted regression + build/verify PASS, subset benar-benar menerima vector valid, tidak ada scope/stale trust violation, dan ZIP terverifikasi. Ini membuktikan mekanik offline, bukan kualitas Cloudflare atau peningkatan kecerdasan.

Rollback cukup revert commit source/test/docs task secara terarah pada worktree bersih; jangan reset memory canonical atau menghapus index pengguna. Format index tidak berubah pada rencana ini. Pengujian provider nyata merupakan gate terpisah yang BLOCKED sampai secure setup dan biaya/data-disclosure disetujui; tidak meneruskan probe yang telah dihentikan.
