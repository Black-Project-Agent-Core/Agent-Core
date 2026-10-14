# Memory Reuse Reliability — implementasi pre-runtime

> Status terkini: MRR-1, MRR-2, dan MRR-3 **IMPLEMENTED — TARGETED/COMPILED VERIFIED — RESIDENT VERIFIED**. MRR-4 membuktikan cross-session procedural reuse; MRR-4.1 mengamati bounded procedural advantage pada matched fixture (correctness sama, problem-solving calls 11→9; elapsed time tidak membaik). MRR-5 membuktikan natural durable Memory capture dapat terjadi, tetapi final external-controller acceptance tetap melewati mandatory Learning checkpoint/review meski second correction + live advisory sudah resident. Verdict boundary: **MANDATORY_LEARNING_FINALIZATION_NOT_RELIABLE_IN_EXTERNAL_CONTROLLER**. Pre-runtime body/Memory scope ditutup; owner invariant berikutnya adalah Native Agent Runtime Phase 1. MRR-3.1 tetap local-server-correct/external connector descriptor pending untuk `receipt`.
> Dasar: Agent-Core-PreRuntime-Maturity-Grounding-20260930.md dan instruksi pengguna melaksanakan rekomendasi serta melaporkan dampaknya.
> Owner: Learning/Memory existing. Tidak membuat model loop, store kedua, scheduler, credential, atau donor runtime.

## Scope pekerjaan dan kontrak perbaikan

MRR-1: generic Learning capture meneruskan workspace eksplisit yang dinormalisasi ke provenance Memory. Tanpa workspace tetap global. Dedup hanya pada scope yang sama, isi yang sama, kategori dan kondisi penggunaan yang sama; judul yang sama dengan isi baru tidak menggugurkan pelajaran baru. Tidak memigrasi atau menebak scope catatan lama.

MRR-2: helper Git provenance memakai safe.directory per-command untuk root yang dipilih, bukan konfigurasi global. Freshness catatan baru dengan daftar file lokal memakai snapshot hash/ukuran byte yang terbatas, termasuk file dirty/untracked. Reuse pembaca snapshot native di verification/evidence-snapshot.ts, bukan parser atau filesystem engine baru. Snapshot disimpan opsional di provenance record; bukan database baru.

Snapshot hanya untuk file teks eksplisit di root project lokal yang resolvable; maksimal 64 file, 2 MiB/file dan 32 MiB total pembacaan. Path protected, secrets, environment, runtime, Git/dependencies, reparse/alias, nonteks dan policy metadata-only/omit tidak dibaca sebagai source. Capture yang tidak lengkap tetap unavailable. Snapshot merekam byte source pada capture, bukan menjamin kebenaran semantik pelajaran, transaksi atomik lintas file, atau keadaan setelah pembacaan.

Catatan lama tidak diberi snapshot retroaktif. Caller yang menyebut gitCommit eksplisit tetap memakai basis commit referensi; tidak diam-diam di-rebase ke byte sekarang. Jawaban freshness harus membedakan basis local-byte-snapshot dari git-reference. Source tidak tersedia atau berbeda identitas tetap eksplisit, bukan current palsu. Pembandingan legacy harus mengenali file yang tidak tercakup commit, bukan menganggap git diff kosong sebagai bukti file untracked tidak berubah.

MRR-3: rancang bukti penggunaan minimal record/body-digest -> applicability ringkas -> invocation/evidence -> outcome dengan ledger/tracker existing. Tetap rancangan, tidak menambahkan public tool atau menaikkan feedback lama menjadi task-benefit proof.

MRR-4: tulis rencana acceptance G1/G2 dan pilot prosedur lintas sesi melalui controller MCP eksternal. Pengujian perilaku dan sesi controller kedua memerlukan persetujuan scope; jangan mensimulasikan sesi baru dengan mengaku konteks telah hilang. Tidak menambah/menjalankan suite atau memakai Memory produksi sebagai fixture pada langkah source/build ini.

## Urutan pelaksanaan

1. Baca Memory/audit/source; snapshot before-images dan structural impact.
2. Perbaiki scope dan dedup pada MemoryLearningSink.
3. Tambahkan metadata snapshot opsional melalui provenance/note/transfer yang ada; perbaiki Git/freshness semantics.
4. Build untuk menyiapkan artifact, tanpa restart dan tanpa release apply; baca hasil compiler.
5. Review source/diff dan keterhubungan; simpan status implementasi, rancangan evidence, acceptance dan dampak di dokumen ini, CODEBASE dan canonical Memory.

Batas otorisasi: build/readback source bukan behavioral acceptance. Source perbaikan tidak akan diklaim resident sebelum proses yang memuat build baru dibuktikan. Existing test fixture mismatch dicatat dalam rencana pengujian; tidak mengubah suite tanpa approval terarah.

## Pembaruan izin pengguna: auto-trust tugas melalui RDC

Pengguna memberi izin penuh melanjutkan perbaikan dan verifikasi terarah melalui RDC. Persetujuan mencakup isolated fixture tests, koreksi fixture test yang sudah ditemukan, build dan sinkronisasi hasil; tidak meminta ulang per langkah. Ini menggantikan pembatasan pengujian pada catatan awal di atas. Hasil tetap memerlukan bukti; autentikasi, tool grants, path safety dan integritas tidak dimatikan. Runtime AI, release dan restart tetap tidak dimulai otomatis.

## Hasil implementasi dan pengaruhnya — 2026-09-30 WIB

**MRR-1/MRR-2: IMPLEMENTED — BUILD PASS — TARGETED/COMPILED VERIFIED — RESIDENT VERIFIED.** Historical pre-restart activation-pending state is superseded by the resident probes recorded below. Auto-trust eksekusi tugas sudah dicatat pada AGENTS.md; tidak ada penggantian authenticator, credential, grant atau policy evidence.

| Perubahan | Dampak yang diuji |
|---|---|
| Learning meneruskan workspace yang dinormalisasi | Review tersimpan dan ditemukan setelah MemoryService dibuka ulang melalui legacy/BM25/fusion pada workspace yang benar; tidak muncul pada workspace berbeda. |
| Dedup terikat scope, isi, kategori dan kondisi penggunaan | Global/scoped dan workspace berbeda tidak saling menekan; judul sama tidak menggugurkan isi atau precondition baru. |
| Snapshot byte source opsional | Byte working tree menjadi basis freshness, termasuk dirty/untracked; perubahan berukuran sama menghasilkan changed. |
| Parser canonical dan transfer mempertahankan snapshot | Snapshot tidak hilang setelah readback/export/import; output export terlepas dari objek sumber dan perubahan snapshot masuk identitas transfer baru. |
| Helper Git root-scoped dan basis eksplisit | Capture Git menggunakan per-command safe.directory, bukan konfigurasi global. Legacy commit-only dilabeli git-reference dan file di luar commit tetap unavailable. |
| Fixture Learning diperbaiki | Mock mengikuti stateStore.mutate; state mock dibersihkan antar-test dan test tracker source diisolasi dari tracker produksi. |

Source berubah: src/learning/memory-sink.ts, src/memory/provenance.ts, src/memory/types.ts, src/memory/note-format.ts, src/memory/transfer.ts; source baru: src/memory/source-snapshot.ts. Pemilik snapshot tetap Memory provenance, menggunakan pembaca bounded existing di src/verification/evidence-snapshot.ts. Tidak ada store/model/provider baru.

Catatan lama tidak dimigrasi atau diberi snapshot buatan. Catatan tanpa baseline tetap unavailable sampai provenance diperbarui secara eksplisit berdasarkan source yang benar; izin penuh tidak mengubah ketidaktahuan menjadi fakta. Source snapshot hanya memeriksa byte yang dipilih, bukan membuktikan isi pelajarannya benar atau seluruh repository atomik pada satu waktu. Binary/oversized/private/runtime/excluded/policy-restricted paths tetap tidak dibaca otomatis.

## Bukti yang benar-benar dijalankan

Dua file pengujian terarah: **39/39 PASS, 0 failure, 0 skip** pada targeted-corrected.json, terdiri dari 19 Memory Reuse Reliability dan 20 Learning decision-evidence. **8/8 compiled checks PASS** pada compiled-check.json. Ini bukan full regression, HTTP resident acceptance, benchmark manfaat, atau sesi AI baru.

Build exit 0; path policy 280 authored files dan 0 exceptions. npm mengeluarkan notice pembaruan, bukan kegagalan compiler; tidak dilakukan pembaruan npm. Reindex Grafel current/accepted, 9.689 entities/51.590 relationships; source helper dan tiga caller production ditemukan pada graph serta dicocokkan dengan source.

Riwayat kegagalan disimpan: red awal 13 pass/3 fail menunjukkan parser snapshot, export alias dan label basis belum selesai. Percobaan gabungan berikutnya 31 pass/8 fail menemukan mock tracker yang belum di-reset dan filesystem yang menolak pembuatan junction dengan EISDIR. Fixture diperbaiki; penolakan alias diuji lewat unit seam pembaca native yang diberi label, **bukan klaim junction OS berhasil diuji**. Tidak ada assertion yang diubah untuk menganggap source salah sebagai benar.

Setelah restart pengguna, port 8765 dilayani Node PID 5716 yang mulai sesudah artifact provenance 2026-09-29T20:25:36Z. `/health=ok` pada v0.14.0, Memory issueCount 0, Learning available, dan Grafel current/accepted. Probe resident MRR-2 membuat record sintetis dengan `sourceSnapshot`, membacanya sebagai `current`, lalu mengubah source dengan ukuran byte yang sama dan memperoleh `changed` berbasis `local-byte-snapshot`. Probe resident MRR-1 menangkap kandidat Learning ber-workspace `agent-core` dan pencarian fusion scoped mengembalikan record yang sama dengan workspace tersebut. Kedua record dan seluruh file fixture kemudian dihapus. Minor intent `.changeset/20260930-memory-reuse-reliability.md` tetap belum diterapkan menjadi release.

Bukti dan before-images: ../runtime/tmp/memory-reuse-reliability-20260930/. Utama: red.json, targeted-final.json (intermediate failure), targeted-corrected.json (final tests), compiled-check.json, build.log, status-evidence.json, resident-process.json dan final-readback.json ketika penutupan administratif selesai.

## MRR-3: rancangan receipt pemakaian — HISTORICAL DESIGN, NOW RESIDENT VERIFIED

Receipt yang diusulkan merupakan record evidence pada tracker/bounded ledger existing, bukan Memory canonical kedua atau alat pemberi izin. Field minimum: useId, workspace, memoryId, contentDigest dari isi yang dibaca, retrievalAttemptId bila tersedia, keputusan applicability (applied/adapted/rejected), observedAt, invocation/evidence references, outcome dan verification reference. Keputusan applicability cukup alasan operasional ringkas; tidak merekam jejak penalaran internal.

Pemilik yang diusulkan: Memory menyediakan identitas/digest dan retrieval context; tracker menghubungkan tindakan/outcome; controller memberikan penilaian kecocokan dan bukti hasil; Learning hanya mempertahankan kesimpulan yang didukung. Tidak menambahkan orchestrator atau executor Skills. Missing attribution tetap unknown, refusal tidak diberi nilai manfaat nol secara otomatis, dan satu event tidak boleh disebarkan sebagai manfaat seluruh retrieval lama.

Event retrieval-completed existing tetap membuktikan handoff saja. Feedback lama tidak diubah menjadi receipt retroaktif. Receipt baru harus memisahkan label observed-use dari klaim causal-improvement; klaim improvement memerlukan pembanding. **Catatan historis G1/G2:** pada saat bagian ini pertama ditulis, schema/producer/consumer receipt belum ada. Keadaan terkini disupersede oleh MRR-3 resident-verified di `MRR-3-Knowledge-Use-Receipt-Plan.md` dan CODEBASE 0.1.81.

## MRR-3.1: controller surface / authority sync — LOCAL SERVER CORRECT, EXTERNAL DESCRIPTOR PENDING

Fresh-session authority mapping pada 2026-09-30 menemukan bahwa exact current source `src/mcp/learning-schemas.ts`, registration `src/mcp/learning-tools.ts`, compiled `dist/mcp/learning-*.js`, dan fresh tools/list-equivalent manifest dari current dist semuanya sudah mengekspos enam action: `status/checkpoint/review/curate/journey/receipt`. Generated manifest tetap 70 tools dan receipt fields tetap additive pada facade `learning` yang sama.

Controller descriptor yang diberikan oleh connector/platform ke sesi fresh ini masih hanya mengiklankan lima action lama dan tidak menyediakan receipt-specific fields. Local ChatGPT plugin ZIP yang tersimpan di repo hanya berisi app-binding/package metadata, tidak menyimpan schema tool, dan bukan authority untuk current controller descriptor. Repo Agent Core tidak memiliki file descriptor current connector yang dapat diperbaiki untuk menyinkronkan enum tersebut.

Karena itu tidak ada local product-source fix yang dibenarkan: tidak dibuat tool kedua, shim, perubahan auth/grant/mutation safety, atau duplicate receipt path. Boundary current adalah **local Agent Core server correct; external registered connector/platform descriptor requires refresh/update outside repo authority**. Sampai fresh controller descriptor benar-benar menunjukkan `receipt`, direct controller receipt tetap unavailable walaupun resident server capability sudah verified. Plan/evidence: `MRR-3.1-Controller-Surface-Sync-Plan.md`, `runtime/tmp/mrr31-generated-manifest.json`, dan `runtime/tmp/mrr31-controller-visible-schema.json`.

## MRR-4 / MRR-4.1: cross-session procedural reuse — EXECUTED

MRR-4 memakai fresh controller terpisah dan matched parser fixtures. Session A menghasilkan verified reusable procedure; Session B tanpa transcript/Memory ID menemukan procedure sendiri, memeriksa freshness/applicability, menerapkannya pada variasi fixture, dan menghasilkan accepted pre-action use receipt. Ini membuktikan cross-session procedural reuse; pilot pertama belum menunjukkan measurable advantage karena baseline terlalu mudah.

MRR-4.1 meningkatkan hardness dengan layered-configuration fixtures yang mempunyai tiga interacting invariants dan dua plausible partial strategies yang tetap FAIL. Baseline A memenuhi predeclared hardness gate (11 problem-solving calls, 114.198069 detik, first substantive correction PASS). Fresh B menemukan procedure secara independen, applicability=`applied`, verifier PASS dengan correctness sama, dan menggunakan 9 problem-solving calls. Ini adalah bounded observed advantage pada investigation/tool-call cost (11→9, -18.2%), bukan klaim universal atau time improvement karena elapsed B 116.240033 detik sedikit lebih lambat.

Dua pilot tersebut membuktikan persistence/retrieval/applicability/use/outcome sisi Memory ketika procedure sudah tercapture. Mereka tidak membuktikan ordinary task otomatis masuk ke Learning capture, karena Session A pada kedua pilot secara eksplisit diminta membuat reusable lesson.

## MRR-5: natural Learning capture — FAILURE FOUND, CORRECTION IMPLEMENTED

Dua fresh-controller ordinary repair tasks sengaja tidak menyebut learn/remember/Memory/MRR. Keduanya mereproduksi failure, memperbaiki source fixture, dan authoritative verifier PASS; namun live Learning state tetap `checkpointCount=164`, `sinceReview=3`, `lastCheckpointAt=2026-09-29T22:03:14.144Z`, dan canonical Memory tidak mendapat lesson transaksi/batch baru. Verdict: **NATURAL_CAPTURE_FAILED**.

Source grounding menemukan dua sambungan yang kurang: meaningful-task finalization hanya berupa instruction yang rendah salience di bagian bawah `AGENTS.md`, dan `LearningCheckpointInput.evidenceRefs` diterima facade tetapi tidak dipersist ke `LearningState`. Perbaikan minimal sekarang mempromosikan finalization ke top-level controller contract dan menambahkan bounded additive `pendingReviews` pada state Learning existing. Queue menyimpan idempotency key, reason, safe evidence refs, optional workspace, dan timestamp sampai semantic `review` selesai; ia bukan second Memory dan bukan semantic knowledge. `learning(status)` sekarang mengekspos pending review count/reason dan duplicate checkpoint mempertahankan immediate review reason dari durable pending entry.

Qualification source/build pada current source dikonfirmasi ulang: dedicated continuity tetap tercakup dan touched Learning/MCP **51/51 PASS** across 5 files; build exit 0; path policy 280/0; release compatibility 70→70 tools, routes unchanged, `breakingEvidence=false`, `verificationIssues=[]`; manifest tetap dalam budget; release-intent check `ok=true`. Resident activation/readback kini juga terbukti: Core lama PID 10176 diganti oleh PID 12488 yang mulai setelah build terbaru, `/health=ok` v0.14.0, Memory available/issueCount0, Learning available, dan live `learning(status)` mengekspos `pendingReviewCount` serta `reviewReason`. Evidence: `runtime/tmp/mrr5-resident-activation-20260930.json`. Yang belum terbukti hanya perilaku fresh controller biasa setelah menerima contract baru.

## Pekerjaan yang masih terbuka

**CLOSED — resident activation/readback:** restart pengguna sudah diverifikasi; MRR-1 scoped Learning capture/recall dan MRR-2 byte-snapshot freshness bekerja pada proses resident. Fixture dan Memory sintetis sudah dibersihkan.

**CLOSED — receipt implementation:** MRR-3 sudah diimplementasikan, targeted/compiled qualified, dan **resident verified** sesuai `MRR-3-Knowledge-Use-Receipt-Plan.md`; authenticated resident acceptance 15/15 lulus dan fixture/receipt/retrieval/revision residue sudah dibersihkan.

**CLOSED — reuse pilots:** MRR-4 cross-session reuse dan MRR-4.1 bounded procedural advantage sudah dieksekusi dengan fresh controllers dan matched fixtures. Klaim dibatasi pada observed reuse/advantage di fixture tersebut; bukan general causal guarantee.

**CLOSED AS BOUNDARY EVIDENCE — MRR-5 external-controller finalization:** natural durable Memory capture sudah observed, tetapi final ordinary fresh controller tetap tidak menjalankan Learning checkpoint/review setelah verified recovery. Live Learning timestamps tetap sebelum task final, pendingReviewCount=0, dan tidak ada Memory topological-order baru. Karena second correction + resident advisory juga tidak membuat external controller patuh secara deterministik, tidak ada MRR-5.3/MRR-5.4. Remaining semantic finalization owner resmi pindah ke Native Agent Runtime Phase 1. Closure: `Pre-Runtime-Body-Memory-Learning-Closure-20260930.md`; plan: `Native-Agent-Runtime-Phase-1-Plan.md`.
