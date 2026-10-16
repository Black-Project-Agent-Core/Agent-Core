> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Plan Batch 3 — Retrieval Memory Multi-Query Berbatas

## Status terkini setelah upload dan refresh — 13 Oktober 2026
Client kini mengekspos retrievalPlan. Satu pemakaian nyata pada task host yang sama menghasilkan contractVersion=2, status=partial, stopReason=deadline: root mengirim 2 hit exact-revision (3822 byte), q1 dipanggil tetapi penantiannya berakhir pada deadline, q2 tidak dipanggil. Dua panggilan dari maksimum tiga, omittedHits=0, tanpa revision/delivery conflict; synthesis memakai revisi yang sama. Penyelesaian seluruh subquery BELUM teramati, bukan gagal schema atau hilangnya seluruh Memory. Advisory task capsule MEMORY_TASK_NOT_FOUND tetap terpisah. Tidak ada rebuild, restart, loop pencarian atau upload tambahan. Detail: ../Batch-03-04-Windows-Integration-20261013.md bagian post-upload retest.

## Checkpoint historis sebelum refresh — 13 Oktober 2026
**SOURCE ENAM FASE TERIMPLEMENTASI; BUILD RESMI DAN AKTIVASI GABUNGAN SELESAI; CLIENT SCHEMA/PENGGUNAAN PLANNED CONTEXT MASIH PENDING.** Label draft dan checklist perencanaan di bawah adalah histori sebelum instruksi pelaksanaan pengguna, bukan penolakan persetujuan terbaru.
Fase 1: schema native diekspor, validasi planned mode/context v2 terpasang, v1 tetap. Fase 2: satu controller canonical host-bound, expected task/owner/workspace registry dan single-flight; pemeriksaan di dalam transaksi existing tidak membuat task baru. Fase 3: recall serial, abort/deadline, klasifikasi kegagalan dan accounting late settlement metadata-only. Fase 4: exact-revision round-robin, discard mempertahankan statistik aktual, coverage/budget dihitung ulang. Fase 5: final disclosure yang sama untuk synthesis/atribusi; konflik digest tidak ditimpa, tidak ada auto-feedback. Fase 6: descriptor/protokol/CODEBASE/ledger dan artifact schema gabungan tersedia.
Final npm run build exit 0 (368/0). Source/output identity mencakup 10 pasangan file; launcher15172/Core23036 dimulai sesudah build melalui receipt restart d24ba4d18a0742a2ba82dc3dd7dd0137, health ok/0.15.0-beta.3. Ini bukti pemasangan runtime, bukan bukti manfaat atau seluruh kondisi edge-case.
Snapshot schema resmi: SubProject/Agent-Core-Batch-03-04-MCP-Schema.json; wrapper current-connection: SubProject/Agent-Core-ChatGPT-Plugin-Batch-03-04-v1.0.1.zip. Konektor sesi ini masih tidak mengekspos retrievalPlan. Sesudah satu re-upload gabungan, resume taskKey agent-core-batch-03-04-windows-integration-20261013 dan gunakan taskId dari host; jangan membuat task/view/receipt palsu atau mengulang pemasangan Batch2. Bukti rinci dan diagnosis: ../Batch-03-04-Windows-Integration-20261013.md.

## Rencana historis yang disetujui untuk implementasi


**Status historis 12 Oktober: DRAFT FOR USER REVIEW.** Rencana ini kemudian disetujui untuk eksekusi Windows 13 Oktober; status implementasi aktual berada di appendix Windows di akhir dokumen. Dasar pembacaan: Agent Core `1657e52be193c8f55cb306397b5d0004d595bd8b`, 12 Oktober 2026. Pekerjaan ini tidak menjalankan produk, provider, pengujian, atau Windows. Rencana memakai asumsi kontrak pasca-Batch 2 sudah terpasang; ini asumsi desain kelanjutan, bukan klaim observasi runtime Windows.

**Goal:** AI eksternal dapat mengirim satu rencana pencarian dengan 2–4 subpertanyaan ke `controller_learning(action=context)`; Agent Core mengeksekusi recall serial melalui Memory canonical existing, lalu mengembalikan kandidat, revisi, asal, cakupan, dan keterbatasan yang eksplisit.

**Architecture:** Controller eksternal menyusun pertanyaan. `ExternalControllerLearningService` mengorkestrasi; helper subquestion existing memiliki parser/budget/merge; `MemoryService.controller()` dan dispatcher existing memiliki scope, disclosure, ranking, dan ledger. Satu root tetap `<PROJECT_ROOT>/runtime/memory`. Tidak ada engine atau planner donor.

**Tech stack:** TypeScript, Zod existing, Node monotonic clock, Memory experience-v2 existing. Tanpa dependency produksi baru.

## Baseline kelanjutan 2 → 3 → 4

Batch 3 mengasumsikan Batch 2 selesai dipasang: `skills.search/read`, pembacaan revision-bound dengan active digest, satu Skill discovery snapshot untuk context/synthesis, atribusi digest hanya untuk artefak tersampaikan, hybrid opsional dengan izin/provider existing, dan grants existing sudah tersedia. Batch 3 menambah recall Memory di atas kontrak itu; tidak memulai ulang pemasangan/penilaian Batch 2. Penyusunan rencana tidak bergantung pada datangnya laporan Windows. Urutan pelaksanaan yang direncanakan tetap Batch 2 → Batch 3 → Batch 4, dengan perubahan owner yang dibatasi agar tidak bertentangan.

## 1. Positive Purpose dan Negative Purpose

**Positive: [Purpose]**
- Menutup gap nyata antara helper subquestion yang tersedia dan jalur context runtime yang masih satu query.
- Membawa kebutuhan bukti yang ditentukan AI eksternal ke satu permintaan bounded, dengan provenance exact-revision dan hasil parsial yang terbaca.
- Mempertahankan sumber berbeda/revisi konflik tanpa menjumlahkan skor lintas query atau mengubah exposure menjadi bukti manfaat.

**Negative: [Purpose]**
- Tidak membuat perencana LLM internal, Native AI Agent wajib, API key/model reasoning baru, reflection loop, atau classifier kecukupan jawaban.
- Tidak mengulang Memory/Learning P0–P5, migrasi, activation, feedback/P2 qualification, Skill/P3 promotion, atau portfolio/Pareto P4 yang selesai.
- Tidak mengubah ranker Memory, SkillService, seleksi Skill Batch 2, provider, grants, atau penyimpanan canonical.
- Tidak otomatis memperluas record/evidence, melanjutkan cursor, retry, mengubah Memory, atau menyatakan suatu pertanyaan sudah terjawab.

## 2. Bukti gap dan keputusan donor

### #25 SimpleMem: ambil orchestration, pertahankan kontrak native yang lebih kuat

Pin `db80b6a7c591e0ea730a058e9f5fc4eb06572299`; [retriever donor baris 75–127](https://github.com/aiming-lab/SimpleMem/blob/db80b6a7c591e0ea730a058e9f5fc4eb06572299/simplemem/core/hybrid_retriever.py#L75-L127) menjalankan targeted queries, mengumpulkan hasil, dan dedup. [Lisensi MIT, AIMING Lab](https://github.com/aiming-lab/SimpleMem/blob/db80b6a7c591e0ea730a058e9f5fc4eb06572299/LICENSE) dibaca dari clone pada pin tersebut.

Adaptasi independen hanya mengambil pola rencana → beberapa recall → merge. Planner LLM, Python, vector store, parallel search, semantic sufficiency, reflection, dan EvolveMem replay tidak diadopsi. Apabila pelaksana menyalin bagian source substansial, notice MIT harus dipertahankan; rencana ini tidak meminta penyalinan kode.

Bukti native pada baseline:
- `src/learning/subquestion-retrieval.ts:5–124` sudah memiliki parser ketat, reservation, byte accounting, round-robin merge, coverage dan revision conflicts; pencarian import pada authored `src` tidak menemukan caller runtime di luar modul tersebut.
- `src/learning/external-controller.ts:840–867` masih memanggil satu `memory.search` pada jalur context.
- `SubProject/agent-core-memory/src/memory/service.ts:215–332` sudah menyediakan scoped controller, policy `fusion-feedback-v1`, ranking dan exposure owner.
- `src/learning/external-controller.ts:738–751,825–837` sudah menyediakan resolusi task/owner/workspace dan contoh controller bound.
- `src/learning/external-controller.ts:540–554,1002–1009` mengikat delivery/receipt pada legacy search result. Hasil `MemoryHit` tidak boleh dipaksa menjadi record lengkap untuk melewati kontrak ini.

Ini extension wiring baru di atas pekerjaan selesai, bukan klaim bahwa Memory sebelumnya tidak terpasang. Kebenaran runtime Windows maupun kualitas jawaban tidak dapat ditentukan dari pembacaan source.

### #47 Grok Build: ditunda dari batch ini

Pin `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`; [MMR token-Jaccard donor](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/mmr.rs#L1-L140), [Apache-2.0](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/LICENSE). Gap tetap nyata: canonical `retrieval.ts:332–345` mengembalikan nol ketika candidate vector tidak ada dan melewati pasangan tanpa vector; exact-signature dedup tidak menangani near-duplicate lexical.

**Keputusan batch: deferred, bukan rejected atau resolved.** Perbaikan itu memengaruhi ranking semua recall, sedangkan Batch 3 menutup orchestration opt-in. Menggabungkannya membuat penyebab perubahan hasil sulit dipisahkan dan memperbesar scope tanpa kebutuhan wiring. Ledger mempertahankan keputusan mekanisme `extend`; alokasi batch tetap belum dipilih. Tidak ada perubahan `maxSemanticRedundancy`, tokenizer, scoring, threshold, atau MMR pada Batch 3.

## 3. Kontrak yang dikunci

### Permintaan dan compatibility

Tambahkan hanya untuk `controller_learning.action=context`:
- `retrievalPlan?: RetrievalPlan`, menggunakan schema native yang diekspor dari `subquestion-retrieval.ts`.
- Jika field ada: `taskId` dan `query` wajib; `query.trim()` harus sama persis dengan `retrievalPlan.rootQuery` setelah parsing. Root dan setiap subquery dibatasi 1–2.000 Unicode codepoints. ID unik `q1`–`q4`; 2–4 subquery unik; field tak dikenal ditolak. Public mode ini tidak menerima array kosong, walaupun helper umum tetap mendukung single lookup.
- `limit` menjadi batas hit per recall, default 5, rentang 1–8 untuk mode ini; tidak ditafsirkan sebagai jumlah seluruh hit gabungan.
- Tanpa `retrievalPlan`, kontrak, single-query search, batas query lama 4.000 karakter pada schema context, dan output context v1 tidak berubah. Batas 2.000 Unicode codepoints hanya berlaku ketika plan dikirim.
- `skillSearchMode`, query Skill, dan discovery snapshot Batch 2 tetap satu kali dari `input.query` asli. Subquery hanya diberikan kepada Memory; tidak dialirkan ke Skills/Patterns/procedures.

`context(sessionId, input, hostOwnerId?)` menerima owner melalui argumen internal dari `registerControllerLearningTools`, tidak dari field tool. Untuk planned retrieval, bind ke active explicit episode yang ID-nya sama dengan `taskId`, belum ditutup, punya `memoryBinding` milik host tersebut, dan workspace sesuai resolusi registry existing. Validasi dilakukan sebelum `labelEpisode`, discovery/provider, atau dispatch. Tidak membuat task/owner/root dari isi prompt. Binding tidak tersedia menghasilkan planned block `blocked`; tidak diam-diam turun ke legacy search.

### Eksekusi dan resource

- Gunakan satu session `memory.controller(scope, 'fusion-feedback-v1')` dan `createControllerMemoryDispatcher` existing. Scope berasal dari `resolveMemoryTask(hostOwnerId, taskId)`.
- Urutan selalu `root`, kemudian pertanyaan sesuai urutan array. Kehadiran plan adalah keputusan controller untuk menjalankan seluruh subquery; runtime tidak menilai apakah root sudah cukup.
- Kapasitas planned retrieval adalah satu invocation aktif per `(hostOwnerId, sessionId)` pada instance `ExternalControllerLearningService`. Gunakan map in-memory existing-service, tanpa antrean/store/daemon. Permit tetap dipegang sampai call backend yang sudah terlanjur berjalan benar-benar settle, termasuk sesudah respons abort/deadline dikembalikan. Permintaan plan berikutnya mendapat `blocked/retrieval-busy` tanpa dispatch; cancellation berulang tidak dapat menggandakan call lewat session yang sama. Jangan melepaskan permit hanya karena timer habis. Batas ini tidak mengunci tool lain atau mengubah grants.
- Satu call in-flight; maksimum aktual **5 recall**: satu root + empat subquery. Reuse helper ceiling 6 tanpa memakai allowance ekstra. **0 expand**, **0 retry**, **0 continuation** dalam permintaan ini.
- Reuse batas helper: 4.096 byte per dispatcher response, 32.768 byte total, minimum reservation 512 byte, dan deadline dispatch 15.000 ms dengan monotonic clock. Dispatcher tetap mengurus reserve envelope-nya sendiri. Ukur seluruh serialized dispatcher response, bukan hanya `result.data`.
- Recheck episode/scope sebelum setiap dispatch dan sebelum atribusi final. Rotation/close/mismatch menghentikan plan dan membuang seluruh hit dari output invocation ini, tanpa memindahkannya ke task baru. Binding invalid pada preflight tidak memulai pekerjaan context berikutnya. Jika scope berubah setelah operasi sibling Skill sudah dimulai, planned Memory dihentikan/dibuang; operasi sibling mengikuti cancellation kontraknya sendiri dan tidak diklaim sudah berhenti.
- Abort/deadline menghentikan penantian dan dispatch berikutnya. `recall` tidak mempunyai transport AbortSignal; call yang sudah berjalan mungkin tetap selesai dan tercatat pada ledger owner. Late settlement tidak masuk output, synthesis, atau delivery map eksternal. Nyatakan `networkStopped:false` dan `inFlightAtReturn:true` bila relevan; received-byte total masih `pending` sampai settlement, bukan angka final palsu.
- Tidak ada kebutuhan model reasoning/provider baru. Recall menggunakan konfigurasi Memory existing: ketika embedder terpasang, root/subqueries dapat dikirim ke provider embedding existing. Deskripsi field harus menjelaskan amplifikasi yang dipilih eksplisit ini; tanpa embedder jalur lexical tetap tersedia. Tidak mengaktifkan provider/config atau mengubah aturan consent existing.

### Hasil planned context

Mode opt-in menghasilkan `contractVersion:2`; non-Memory context tetap tersedia. Field legacy `memories`/`contradictions` diganti dengan satu `memoryRetrieval` yang menjadi sumber Memory untuk mode ini, tanpa membuat legacy record palsu:
- `version:1`, `mode:'subquestions'`, `status:'completed'|'partial'|'blocked'`, optional `stopReason`.
- `hits`, `coverage`, `revisionConflicts` memakai tipe `MergedRetrieval` existing; `hits` mempertahankan exact revision dan seluruh origin yang masih disampaikan.
- `calls`: paling banyak lima ringkasan `{questionId,callId,outcome,payloadBytes?}` tanpa raw query/body; `usage` berisi jumlah reservation, bytes yang sudah diketahui, elapsed dan status late settlement.
- `omittedHits`, batas yang berlaku, serta advisory bahwa retrieval tidak membuktikan kebenaran, kecukupan jawaban, izin, atau manfaat.

Batasi serialized **blok `memoryRetrieval`** ke 32.768 byte, termasuk metadata. Jika perlu keluarkan hit utuh dari ekor hasil round-robin, lalu laporkan omission; jangan memotong JSON, revision, SourceRef, atau excerpt span. Recompute coverage delivery: pertanyaan yang hasilnya seluruhnya hilang dari output memperoleh alasan `output-budget`, tidak diberi kredit evidence-reviewed. Scope byte ini tidak mencakup sibling Skill/task/authority context atau framing MCP/HTTP; jangan klaim seluruh respons tool dibatasi 32 KiB.

## 4. Enam fase implementasi

### Fase 1 — Ekspos satu schema plan dan mode context

**File:** `src/learning/subquestion-retrieval.ts`, `src/mcp/controller-learning-schemas.ts`, tipe input di `src/learning/external-controller.ts`.

- [ ] Ekspor schema plan existing tanpa menggandakan parser; pertahankan helper umum dan tambahkan validasi mode context §3 pada trust boundary.
- [ ] Definisikan `ContextMemoryRetrieval` dengan `MergedRetrieval` existing, ringkasan call/usage/omission, dan discriminator output v1/v2.
- [ ] Tolak `retrievalPlan` pada action lain, root mismatch, taskId absen, satu subquery, dan limit di luar rentang planned mode sebelum efek apa pun.

**Hasil operasional:** schema tool menyatakan kontrak yang benar; caller lama tetap memakai single-query v1.

### Fase 2 — Hubungkan scope tepercaya ke owner canonical

**File:** `src/mcp/controller-learning-tools.ts`, `src/learning/external-controller.ts`.

- [ ] Teruskan plan/taskId dan owner host internal ke context; jangan mengekspos owner/root/workspace identity key sebagai argumen model.
- [ ] Gunakan `getEpisode`, `resolveMemoryTask`, resolver workspace dan capability `experience-v2` existing untuk binding §3; simpan identitas task untuk seluruh invocation. Setelah preflight valid, ambil permit single-flight host/session sebelum memulai context work; kapasitas penuh menghasilkan `retrieval-busy`, tanpa antrean.
- [ ] Tambahkan private `contextMemoryRetrieval(sessionId, input, hostOwnerId)` pada service existing; controller/dispatcher dibuat dari service canonical yang sudah aktif, bukan inisialisasi Memory baru.

**Hasil operasional:** task/workspace invalid menghasilkan block yang eksplisit; tidak ada legacy fallback, task rotation otomatis, atau writer baru.

### Fase 3 — Jalankan serial bounded recall

**File:** private method di `src/learning/external-controller.ts`; imports helper/dispatcher existing.

- [ ] Reserve → dispatch → meter complete response → admit/settle, menggunakan helper existing dan urutan §3. Call ID request-local stabil berbentuk `root:1`, `q1:1`, dan seterusnya.
- [ ] Panggil `memory_recall` dengan `view:'abstract'`, `retention:'active-durable'`, limit dan budget reservation; tidak ada parameter temporal/cursor tambahan.
- [ ] Tangani error scope/owner sebagai stop; error source/ledger, insufficient budget, abort/deadline, dan over-cap terlihat pada coverage melalui reason code stabil, tanpa raw exception/query/body. Tidak mengulang call. Stop pada pelanggaran byte/protocol; pertahankan hanya hasil terdahulu yang masih eligible untuk task yang sama.
- [ ] Cleanup timer/listener setelah settle; late promise harus ditangani tanpa unhandled rejection, dispatch baru, atau mutasi delivery task lain. Lepaskan permit single-flight hanya ketika seluruh backend invocation itu sudah settle; response timeout sendiri bukan settlement.

**Hasil operasional:** jumlah call dan reason berhenti dapat dijelaskan dari satu invocation; cancellation tidak dipresentasikan sebagai pembatalan jaringan.

### Fase 4 — Merge dan proyeksi yang jujur

**File:** `src/learning/external-controller.ts`; reuse `mergeRetrievalObservations`/`markQuestionBlocked`.

- [ ] Merge hanya admitted observations satu scope. Pertahankan round-robin, exact `(id,revision)`, origin, metadata konservatif, dan konflik native. Jangan menggabungkan atau membandingkan skor antarquery.
- [ ] Finalisasi output budget dan coverage delivery §3 sebelum menyusun event/receipt. Tidak memanggil `markEvidenceReviewed`; tidak ada semantic reviewer pada driver ini.
- [ ] Kembalikan planned block v2 dengan gap/partial/blocked; old context v1 hanya dipakai jika plan tidak dikirim.

**Hasil operasional:** sumber konflik tetap terlihat dan tidak otomatis dipilih revisi “terbaru”; hasil kosong tidak berubah menjadi jawaban sukses.

### Fase 5 — Pertahankan synthesis dan P2 receipt

**File:** `src/learning/external-controller.ts`, `src/agent-knowledge-synthesis.ts`.

- [ ] Tambahkan optional input `memoryDisclosure?: MergedRetrieval` pada synthesis. Pada jalur ini, Memory lines memakai exact revision/freshness/applicability dari hasil final; jangan refresh per-ID ke versi lain untuk lalu melabelinya sebagai hit yang sama. Lookup Journey tetap advisory terpisah, bukan replacement source.
- [ ] Pakai satu hasil final untuk planned context dan synthesis; jalur Skill Batch 2 tetap menerima `skillDiscovery` snapshot yang sama, dengan original root query/mode dan tanpa discovery ulang.
- [ ] Tambahkan private recorder delivery untuk `MemoryHit`/origins terpilih dengan expected taskId. Reuse `episode.deliveredMemories[attemptId + ':' + id] = contentDigest`; jangan cast hit menjadi `DeliveredMemorySearchResult`, menulis ulang ledger canonical, atau mengeluarkan receipt otomatis.
- [ ] Register hanya origin yang disampaikan pada output final, bukan hit terbuang/late. Counters berasal dari ringkasan call aktual, bukan jumlah hasil merge; satu event context memuat ringkasan bounded tanpa raw query/body. Jika satu key attempt/id memiliki digest berbeda, jangan overwrite; laporkan conflict. Existing `artifact_receipt` tetap menuntut actual applied/adapted use, action refs, verification, dan digest yang sama sebelum P2 feedback.

**Hasil operasional:** provenance dalam synthesis dan eligible receipt menunjuk hasil yang sama; retrieval/exposure tetap berbeda dari penggunaan dan manfaat.

### Fase 6 — Paparkan kemampuan dan handoff terbatas

**File:** deskripsi `src/mcp/controller-learning-tools.ts`; bagian terkait `docs/Memory-Subquestion-Retrieval-Protocol.md`, `docs/CODEBASE.md`, `docs/plans/README.md`, plan dan ledger kandidat. Notice donor bila benar-benar diperlukan oleh reuse source.

- [ ] Dokumentasikan opt-in input, hasil v2, contoh plan, batas query/provider, zero automatic expansion, serta alasan blocked/partial. Bedakan helper/protokol lama yang selesai dari wiring runtime baru.
- [ ] Catat #25 sebagai dipilih Batch 3 dan #47 sebagai gap di luar batch; jangan mengubah status implementasi sebelum source benar-benar dibuat.
- [ ] Handoff menyatakan revisi source, file berubah, capability runtime/client yang benar-benar tersedia, dan kebutuhan refresh descriptor bila teramati. Tidak menganggap commit/build sebagai aktivasi Windows.

**Hasil operasional:** AI eksternal dapat menemukan dan memakai kontrak baru melalui tool existing setelah runtime/client yang bersangkutan benar-benar memuatnya. Manifest default tidak diubah oleh batch ini; jangan mengklaim expanded toolset muat batas tertentu tanpa bukti tersendiri.

## 5. Batas koordinasi dan bukti akhir

- Planning ini tidak memberi instruksi menjalankan suite, benchmark, evaluasi manfaat, atau audit loop. Bukti operasional saat kelak diimplementasikan berasal dari kontrak/rute yang benar-benar terpasang, bounded invocation yang memang diotorisasi, dan hasil/source yang dapat diinspeksi. Tidak ada klaim kualitas jawaban sebelum ada bukti hasil nyata.
- Tidak ada perubahan pada image inspection/Batch 4 atau server manifest default. `external-controller`, controller schema/tool, dan synthesis harus mempunyai satu penulis ketika implementasi berlangsung; mulai dari kontrak Batch 2 terpasang dan pertahankan perilakunya, tanpa pekerjaan instalasi Batch 2 baru.
- Parent mengelola publikasi, catatan continuity, dan lifecycle Learning sesuai otorisasi aktual. Dokumen ini tetap draft untuk review pengguna; tidak menjadwalkan atau memulai implementasi, activation, release, deployment, maupun pemasangan Windows.


## 6. Peta batas lintas batch

| Fondasi / batch | Tetap menjadi tanggung jawabnya | Batas Batch 3 |
|---|---|---|
| Batch 1 | Reader web native, public transport/projection, provenance | Tidak disentuh atau diinstal ulang. |
| Batch 2 diasumsikan terpasang | Skill search/read, satu discovery snapshot, active digest, hybrid Skill opt-in | Root query dan satu snapshot Skill tetap; subquery tidak memicu pencarian Skill tambahan. |
| Batch 3 | Orkestrasi recall Memory multi-pertanyaan dan proyeksi exact-revision | Tidak mengganti ranker, engine/storage, atau aturan feedback. |
| [Batch 4](../../plans/2026-10-12-batch-04-view-bound-visual-review.md) | Review visual melalui image_inspect | Tidak memakai atau mengganti dispatcher Memory maupun synthesis Batch 3. |

Dokumentasi/status yang dibagi lintas batch diselaraskan oleh satu penulis secara berurutan. Kontrak Batch 3 dibekukan sebelum implementasi Batch 4; perbedaan hasil pemasangan aktual kelak dicatat sebagai delta, bukan alasan menebak fondasi baru atau menulis owner tandingan.

## 7. Ringkasan bersama untuk Memory lokal

<!-- batch-03-04-memory-summary:start -->
Perencanaan lanjutan 12 Oktober 2026 memakai asumsi Batch 2 sudah terpasang sesuai kontraknya; ini baseline desain, bukan klaim aktivasi Windows. Urutan rencana 2 → 3 → 4. Batch 3 memilih #25 SimpleMem dalam enam fase untuk menghubungkan rencana 2–4 subpertanyaan eksplisit ke recall Memory canonical berbatas melalui controller context existing. Tidak mengubah ranking global, tidak memakai planner LLM, dan mempertahankan snapshot/discovery Skill, digest, grants serta receipt Batch 2. #47 lexical MMR tetap gap tersendiri di luar batch. Batch 4 memilih #138 Sindie dalam lima fase untuk review visual per kriteria yang terikat source digest dan view overview/crop milik image_inspect existing; penilaian tetap berasal dari controller, bukan quality oracle atau gate ekspor. Batch 4 tidak mengubah retrieval Batch 3. Keduanya tanpa runtime donor, dependency produksi, store paralel, atau perubahan nama runtime/memory. Keenam kandidat Batch 1–2 sudah diimplementasikan pada source Linux; dua kandidat baru hanya dialokasikan ke draft, 208 entri lainnya tetap di ledger dengan keputusan masing-masing. Dua plan menunggu review pengguna; tidak ada implementasi Batch 3/4 atau pemasangan Windows pada pekerjaan perencanaan ini.
<!-- batch-03-04-memory-summary:end -->
