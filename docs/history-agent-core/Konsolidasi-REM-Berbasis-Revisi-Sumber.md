# Konsolidasi REM berbasis revisi sumber
Tanggal: 2026-10-31
Revisi: 1
Status: COMPLETED — P1/P2 source/build terverifikasi dan build aktif pada resident 2026-10-31; hasil siklus live belum diamati
Jenis: Improvement
Asal dan bukti:

- **R1 — repo primer:** `F:\AI Skill\openclaw`, HEAD `8d83344835ca6f1a1828126ea0a6b3b458836154`, paket `2026.10.9`, MIT/OpenClaw Foundation. Inventaris Git: 61.683 file, 705.258.972 byte blob. Studi dreaming ini: **dibaca penuh 34 / dilihat sekilas 9 / tidak dibuka 61.640 dari 61.683 file**; 34 + 9 + 61.640 = 61.683. Urutan: README/package/lisensi, dokumen dreaming, fase/ranking/promotion, publikasi dan cron. Pembaca kedua membaca penuh 28 file; main 10, overlap empat. Skim mencakup range/grep yang terlihat; metadata-only tidak dihitung sebagai pembacaan. Anchor rekomendasi di bawah diperiksa sendiri oleh main. Tidak menjalankan kode donor.
- **R2 — target primer:** baseline Agent Core `29c393d`, tree bersih sebelum studi; `docs/CODEBASE.md`, `src/memory/{rem-consolidation,cognitive-maintenance,service,store,disclosure,evidence-lineage,derivations}.ts`, `src/learning/curator.ts`, tes maintenance dibaca selektif. Arsip cognitive upgrade dan queue history menunjukkan REM serta review salience/replay sudah diintegrasikan; ini bukan usulan mengulangnya.
- **R3 — konteks historis:** canonical Memory dan Cortex dicari selektif. Recall CME tentang replay membedakan konsolidasi dari peningkatan keputusan; status HOLD dalam recall lama dikoreksi oleh queue history kini yang mencatat integrasi. Recall yang terpotong tidak dipakai sebagai bukti detail atau instruksi. Studi tujuh file sebelumnya tetap proposal terpisah; persetujuannya tidak tersirat dari studi ini.

## Masalah dan tujuan

Bedah mekanisme dreaming OpenClaw dan ambil delta terkecil untuk REM Agent Core yang sudah ada. Gap yang didukung sumber: idempotensi REM target memakai ID anggota, bukan revisi isinya; snapshot perencanaan dan pembuatan digest juga belum diikat sebagai satu pemeriksaan sumber dalam commit yang sama. Tujuan usulan: digest mengikuti koreksi sumber, menolak rencana usang, dan menjelaskan keputusan tanpa membuat sistem dreaming kedua.

## Bukti dan ketidakpastian

**Alur R1 yang diamati:** `docs/concepts/dreaming.md:70–139`, `extensions/memory-core/src/dreaming-phases.ts:1063–1148,1209–1213`, dan `dreaming.ts:161–227` menunjukkan:

```text
recall + daily notes + sesi interaktif yang eligible
  → Light: dedupe, pilih/stage trace
  → REM: tema/refleksi dan kandidat berbasis heuristik
  → Deep: gate → baca ulang sumber → pilih operasi → validasi → publikasi
  → ringkasan/diary untuk review manusia, bukan sumber promosi baru
```

Light dan REM tidak mempromosikan ke MEMORY.md; kegagalan fase menahan fase berikutnya. Bukan tiga panggilan model wajib dan bukan simulasi tidur biologis. Light/REM menulis sinyal yang ikut memengaruhi Deep; REM “confidence” menggabungkan skor retrieval, recall, recurrence dan concept tags (`dreaming-phases.ts:870–880`). Skor ini tidak membuktikan kebenaran atau dukungan independen.

**Ranking:** `short-term-promotion.ts:27–81,104–179` memakai relevance/frequency/diversity/recency/consolidation/conceptual dengan bobot 0,30/0,24/0,15/0,15/0,10/0,06. Hit fase memberi boost terbatas. Gate skor, jumlah sinyal, keragaman kueri interaktif dan usia tetap terpisah; synthetic scheduler/backfill keys tidak memenuhi keragaman kueri. **Reproduced secara aritmetis:** bobot dasar berjumlah 1,00; boost maksimum 0,06 + 0,09 = 0,15, sehingga raw accumulator dibatasi 1,15. Candidate score yang dikembalikan di-clamp ke maksimum 1 (`:176–179`). Nilai itu bukan probabilitas kebenaran atau hasil evaluasi kemampuan.

**Batas model:** `dreaming-consolidation.ts:23–31,83–121,199–273` meminta operasi added/merged/superseded, bukan prose pengganti bebas. Host membentuk teks dari kandidat bersumber dan memeriksa jumlah/identitas operasi, prior-entry, project group serta lineage. `dreaming-narrative.ts:205–279` memakai completion terpisah untuk diary, retry default model hanya untuk configured-model unavailable; penolakan otorisasi tidak mengizinkan fallback (`:111–125`). Hasil dapat pending/skipped/degraded; diary indah tidak membuktikan promosi berhasil. Dokumen `dreaming.md:109,145–164` juga menyatakan transcript tidak secret-masked sebelum ingestion dan diary bukan sumber promosi. Tidak mengadopsi transfer data ke model untuk target.

**Pola donor yang layak ditransfer:** `short-term-promotion-apply.ts:287–307` membaca ulang sumber hidup dengan fingerprint sebelum/sesudah. `:323–339,376–438` memeriksa ulang row, source, kandidat dan base MEMORY di dalam lock sebelum publikasi. `dreaming-consolidation-candidates.ts:11–25` memblok origin untrusted/system; `session-ingestion.ts:133–145,375–377` mengecualikan generated narrative/cron dari ingestion yang diperiksa. Ini kontrol struktural, bukan semantic entailment.

**Batas donor:** daily notes tanpa provenance dianggap agent/trusted (`dreaming-phases.ts:300–313,704–714`); session exclusions opsional dan metadata missing/mismatch tidak otomatis diblok (`session-ingestion.ts:182–196,249–252`). Jangan menyebutnya private-only atau tahan semua poisoning. Dedupe `dreaming-snippet-dedupe.ts:14–49` hanya mencocokkan satu path. Preimages dibatasi delapan (`dreaming-consolidation-artifacts.ts:12,35–67`). Fallback append dapat melakukan budget compaction; komentar `short-term-promotion-apply.ts:510–547` menerima external-editor race. Commit MEMORY mendahului update recall store (`:469–477,536–575`), sehingga bukan transaksi tunggal semua state atau jaminan exactly-once.

**Scheduling:** `dreaming-cron.ts:112–138,179–271` mengelola job berdasarkan declaration key, isolated/light context, delivery none, dan mempertahankan disabled state karena patch tidak mengubah enabled. Config donor default on dan `0 3 * * *` (`src/memory-host-sdk/dreaming.ts:22,337–367`); itu bukan pilihan jadwal target. Job, fase, completion diary dan publikasi mempunyai status berbeda. Reconciliation bukan izin menjalankan job di studi ini.

**Target R2:** `rem-consolidation.ts:55–104` menyaring expired/pinned/superseded/own-REM/archive, membatasi 400 kandidat terbaru, mengelompokkan metadata dalam workspace, lalu hash sorted member IDs. Perubahan content/revisi dengan kumpulan ID sama tetap bertemu existing key. `cognitive-maintenance.ts:212–242` snapshot → plan → host.remember, maksimal lima digest per siklus; belum meneruskan expected source revisions. `service.ts:244–262,1052–1105` memuat wrapper snapshot dan remember; create memiliki lock, tetapi tidak memvalidasi ulang isi semua sumber plan. Perencanaan digest deterministik/ekstraktif/inferred; seluruh write path tidak boleh diklaim selalu bebas model, sebab remember dapat memanggil optional intelligence.evolve.

Owner yang bisa dipakai sudah ada: `memorySemanticRevision` mengabaikan access statistics namun mencakup meaning fields (`disclosure.ts:102–109`); `store.transact/commitPlan` mengunci, reload, memeriksa read-set, mengarsipkan perubahan dan mempublikasikan transaksi (`store.ts:288–322,337–380`). `evidence-lineage.ts` adalah advisory shared-origin, bukan gate trust; `derivations.ts` khusus receipt controller eksternal, bukan API internal REM siap pakai. Jangan menganggap dua owner tersebut sudah otomatis menyelesaikan gap REM.

**Overlap:** `docs/history-agent-core/Advanced-Memory-Cognitive-Upgrades.md` berstatus COMPLETED dan mencatat aktivasi sembilan fitur; source yang dibaca mengonfirmasi wiring loop melalui `service.ts:487` dan `cognitive-maintenance.ts:266–282`. Status resident/config sekarang tidak diproba. `Proposal-Review-Queue-History.md:127–153` menutup salience, generalization dan replay lama; recall HOLD bukan alasan membuka ulang. Proposal profil/otomasi revisi 1 tidak disentuh: delta ini memakai loop REM existing, tidak bergantung pada P3 otomasi yang belum disetujui.

**Inferred:** fresh revision binding dan commit guard dapat mengurangi penggunaan plan usang. **Unknown:** kejadian stale nyata di resident, manfaat retrieval/keputusan, poisoning menyeluruh, crash outcome dan biaya aktual. Tidak ada benchmark, run donor atau tes runtime. Klaim sleep-time-compute/Generative Agents di dokumen donor tidak dievaluasi sebagai bukti ilmiah pada studi kode ini.

| Lensa | Temuan yang memengaruhi keputusan |
|---|---|
| Semantic | Fase, score, promosi dan diary berbeda; nama REM bukan bukti belajar. |
| Procedural | Rehydrate → fingerprint → final lock → commit merupakan unit transfer. |
| Negative | Default trust, feedback fase, fallback compaction dan file/state split membatasi jaminan. |
| Strategy | Ambil guard yang hilang; pertahankan owner/loop target. |
| Credibility | Source MIT dipin + jalur negatif pada source/test; kuat untuk mekanisme statis, outcome belum diuji. |
| Freshness | Snapshot 2026.10.9; hash berbasis ID saja tidak menangkap koreksi isi. |
| Absence | Tidak ada bukti kausal manfaat; source availability bukan semantic truth; privasi membutuhkan scope nyata. |
| Medium | Audit range/penuh terarah; tes dibaca, tidak dijalankan; rehydration Markdown tetap heuristik. |
| Environment fit | Windows, satu canonical Memory; donor MEMORY.md/SQLite tidak ditransplantasikan. |
| Cost/reversibility | Reuse cap 400 kandidat/5 digest dan loop existing; jangan tambah model/worker/store. |
| Triangulation | Source target mengoreksi dugaan REM belum ada; arsip mengoreksi Memory HOLD lama. |
| Transfer | Revisi/idempotensi/guard/explain cocok; diary puitis dan auto-provision scheduler tidak diperlukan. |
| Intent | Bedah + satu proposal, bukan menjalankan dreaming atau aktivasi. |
| Free: independence | Recall berulang, phase hits dan ringkasan turunan bukan bukti independen baru. |

Support map: P1 didukung Procedural/Freshness/Negative/Transfer, dibatasi Cost dan legacy provenance. P2 didukung Procedural/Medium/Intent, dibatasi privacy dan persistensi report. Tidak ada kandidat single-lens. Konflik utama: kemudahan auto-promotion donor berhadapan dengan keharusan sumber/revisi terikat; pilih guard target yang lebih ketat. Value profile R1: donor metode + cautionary, dominan Procedural/Negative; bukan oracle kebenaran. R2/R3: overlap/confirmation, histori harus divalidasi dengan source. Bukti berikut paling berguna adalah satu kasus koreksi sumber terkontrol dan hasil correctness target setelah approval.

**Mind-control — lima pertanyaan dan T1/T2:** apa yang diketahui, dukungan/penentangnya, rival, observasi pembeda dan falsifier tercatat berikut. Implementation Test masih proposed.

| Field | P1: revisi dan commit | P2: penjelasan siklus |
|---|---|---|
| Claim | ID saja belum cukup untuk idempotensi/freshness digest. | Existing report perlu menjelaskan keputusan guarded plan. |
| Observed | Source key/host.remember target vs fingerprint/final guard donor di atas. | CognitiveCycleReport memuat planned/created/failed, tetapi belum alasan stale/admission per plan. |
| Inferred | Fingerprint revisi + final recheck cukup tanpa loop/model baru. | Reason counts membantu audit tanpa raw snippets/diary. |
| Rival | Member-set idempotence memang disengaja; digest historis tidak harus selalu terkini. | Log/status existing sudah cukup; report baru berpotensi noise. |
| Test | Edit sumber dengan IDs sama: refresh owned digest; unchanged/access-only: no-op; mutate/delete sebelum commit: skip. | Bad source/skip/failure tetap berbeda dari no-op/sukses dan tidak membocorkan isi. |
| Flip condition | Semua digest ternyata sengaja immutable historical snapshots: pertahankan sejarah dan tandai generation/context, jangan refresh; keyakinan moderat sampai consumer diverifikasi. | Consumer tidak memerlukan detail tambahan: batasi counts pada lastCycle existing; keyakinan moderat. |

T2 reconstruction: (1) plan berasal dari snapshot; (2) sumber dapat berubah sebelum/di antara siklus; (3) ID tetap tidak menyatakan content tetap; (4) `#aux` intended digest merepresentasikan sumber eligible saat dibuat/diperbarui, bukan fakta terverifikasi baru; (5) `#aux` transaksi canonical existing tetap pemilik tunggal. Kesimpulan: periksa revisi/admission dalam transaksi yang sama dan pertahankan histori. Keberatan: fingerprint bukan kebenaran, lock baru dapat deadlock; jawab dengan label inferred, zero new trust grants dan satu lock owner existing. Jika (4) tidak disetujui, pilih snapshot historis yang ditandai eksplisit, bukan mengubahnya diam-diam. Manfaat jika P1/P2 berubah bersama beratribusi `confounded`.

## Mekanisme dan owner existing yang dipakai

**P1 — ikatan sumber pada REM existing.** Pertahankan clustering/extractive output dan batas kerja; tambahkan expected member ID + `memorySemanticRevision` + workspace + eligibility/policy revision pada plan. Pisahkan stable family identity dari generation fingerprint; access count/time tidak membuat generation baru. Sebelum publish, host Memory memeriksa kembali source masih ada, revision sama, scope eligible, tidak expired/archived/superseded/own-generated, dan belum ada generation yang sama.

Gunakan satu jalur internal `MemoryService` → `store.transact` existing untuk final guard dan mutation; bukan check-then-call remember di luar lock. Record construction, masking, validation, archive dan index refresh harus direuse, bukan disalin ke writer baru; jangan memanggil remember/snapshot ber-lock lagi dari dalam planner. Planner sinkron tidak memanggil model/I/O. Integrasi hanya pada hook CognitiveHost yang diperlukan.

Untuk family yang sama tetapi source generation berubah, perbarui hanya digest REM milik engine dengan histori/arsip existing dan ID yang stabil; jangan membuat dua current digest untuk family sama. `source.ref` boleh memakai format internal berversi untuk family/generation, v2 memakai exact source refs bila disediakan owner. Jangan menebak revisi pada digest legacy: tampilkan sebagai legacy/unknown, migrasikan hanya setelah sumber dapat diperiksa, jangan hapus atau mereset store. Sumber berubah/hilang pada final check membatalkan plan, bukan memaksakan isi snapshot lama. Perubahan sumber setelah commit tidak membuat digest menjadi fakta terverifikasi; stale/unknown legacy atau lineage yang tidak lagi eligible masuk review existing, bukan auto-rewrite/delete seluruh Memory. Retrieval global dan historical knownAt tidak dirombak oleh paket ini.

Admission memakai metadata host dan policy Memory existing, bukan kepercayaan dari string tag/model atau sekadar filename. Unknown provenance tidak otomatis menjadi trusted; kandidat yang tidak eligible ditunda dengan alasan. Derived/REM/report material tidak boleh dihitung sebagai dukungan independen atau dipakai untuk menaikkan verification. Tidak memperluas ingestion ke seluruh chat/transcript atau provider. Guard privacy/masking existing tetap berlaku.

**P2 — jelaskan keputusan pada report existing.** Perluas DigestPlanResult/CognitiveCycleReport dan `cognitiveStatus().lastCycle` dengan bounded reason counts untuk unchanged, source-changed/unavailable, ineligible, unsafe, budget-deferred dan commit-failed. Pisahkan planned, applied, skipped dan failed; metadata kecil saja, tanpa raw source/private snippets. Bila ID ditampilkan melalui consumer existing, scope/filter mengikuti caller. Report lastCycle tetap volatil seperti sekarang; bukan audit history crash-proof atau Dream Diary baru. Revisi record canonical tetap histori perubahan yang sebenarnya.

Polyglot dipertimbangkan: Rust/Go worker atau Python synthesis menambah IPC, deployment, model dan writer tanpa bottleneck terukur. TS existing memadai untuk revision hashes dan bounded checks; gunakan owner transaksi saat ini. Tidak ada scheduler/C# UI/GPU/DB baru. Audit ini memilih mengurangi kerja berulang dan risiko state sebelum menambah mesin eksekusi.

## Scope, batas Native, risiko dan otorisasi

Rekomendasi **P1 → P2**, keduanya hanya setelah APPROVE revisi/scope. Owner `src/memory` dan state `runtime/memory` tetap tunggal; loop/cognitive flags existing dipertahankan, tidak mengaktifkan fitur yang sedang nonaktif. Learning tetap owner kandidat pengetahuan/prosedur dan keputusan promosi; digest inferred tidak memperoleh instruction authority, izin tool, status verified atau aktivasi Skill.

Tidak diusulkan: loop dreaming kedua, penyalinan MEMORY.md donor, Dream Diary/UI, tiga model calls, model synthesis/promosi otomatis baru, backfill massal, memory deletion, jadwal pukul 03.00, atau transplant bobot ranking donor. Kekayaan diary tidak membenarkan biaya/privasi baru bagi tugas ini. Native/eksternal tetap berbagi owner; paket ini tidak mengubah prompt/grants atau kontrak sesi eksternal.

Risiko yang harus dijaga saat implementasi: legacy key compatibility, duplicate concurrent commits, nested locks, index failure setelah commit, perubahan eligibility, source loss, dan pembacaan digest lama sebagai current. Scope ini memastikan plan yang dipublikasikan sesuai sumber saat commit; bukan jaminan pembaruan seketika setiap derivative setelah semua perubahan sumber. Unknown/stale harus terlihat dan direview melalui lifecycle existing.

## Manfaat yang diharapkan dan keterbatasan

Harapan: koreksi sumber tidak dilewatkan hanya karena ID tetap, commit rencana usang ditolak, dan alasan no-op/failure dapat ditelusuri. Ini perbaikan kontrak konsistensi, bukan klaim peningkatan kecerdasan atau replay biologis. Belum ada bukti manfaat keputusan, akurasi, biaya maupun performa. Heuristik clustering/ekstraksi tetap dapat memilih materi yang kurang berguna; fingerprint hanya membuktikan identity/freshness input. P2 tidak mempertahankan histori report melewati restart.

## Acceptance, evaluasi dan rollback

**Studi sekarang:** readback dokumen, delapan heading, source anchors, scope, coverage dan diff. Tidak ada donor execution, tes produksi, build, benchmark, restart, activation, atau perubahan konfigurasi. Versi perubahan ini Revisi 1 dokumen; tidak ada product-version bump untuk proposal.

**Setelah approval, correctness saja:**

| Paket | Acceptance terkontrol | Rollback |
|---|---|---|
| P1 | Same IDs + corrected text menghasilkan generation berbeda dan satu current owned digest; unchanged/access-only no-op. Source changed/deleted/expired/tainted setelah plan ditolak pada final commit. Dua engine/attempt tidak menghasilkan duplicate current generation. Legacy/unknown tidak dipalsukan terverifikasi; source/private records dan histori tidak hilang. Reuse masking, pin protection, transaction recovery/index repair tetap berfungsi. | Kembalikan delta kode yang disetujui, pertahankan source/digest revisions dan histori; hentikan apply REM melalui owner existing bila diperlukan, tanpa mematikan semua cognitive features. Jangan menghapus Memory pengguna atau downgrade schema/reset store. |
| P2 | Counter planned/applied/skipped/failed dan reason diketahui cocok dengan input kasus; failure bukan sukses/no-change; output tidak memuat isi privat; lastCycle hilang setelah restart dicatat sebagai batas. | Kembalikan report projection; data canonical tidak berubah. |

Gunakan target planner dan maintenance integration existing (`tests/memory/memory-cognitive-maintenance.test.ts`), maksimal dua invokasi per target: merah → hijau. Satu pemeriksaan manual melalui service pada store sementara terisolasi milik tugas membuktikan input/output, bukan mesin Memory kedua atau fixture yang diperlukan runtime. Jangan memakai live Memory pengguna sebagai eksperimen. Tidak ada benchmark kecepatan/biaya atau suite luas demi warna hijau. Source activation/restart mengikuti keputusan implementasi yang nanti disetujui; studi ini belum mengizinkannya.

## Riwayat revisi

- Revisi 1 — studi dreaming terarah pada snapshot 2026.10.9; mengakui REM Agent Core yang sudah diimplementasikan. Delta yang diusulkan hanya revision binding/final guard dan reason report existing. Bukan revisi proposal profil/otomasi atau pembukaan ulang cognitive upgrade yang selesai. CODEBASE/changelog mencatat proposal saja.

Penerapan Revisi 1, 2026-10-31: `rem-consolidation.ts` memisahkan family key dari generation fingerprint yang mengikat semantic source revisions/workspace/bounds. Ref internal `rem:v2` juga mengikat output untuk menolak overwrite digest yang diedit operator; itu integrity check, bukan grant. Legacy tanpa revisi hanya dapat diikat ulang bila seluruh current extract/metadata/parents masih cocok; lainnya `legacyUnknown`, tidak ditebak/dihapus. `MemoryService.commitCognitiveDigest` memakai `store.transact` existing untuk final guard, create/update satu ID, exact source refs v2 dan archive/history. Konstruksi record dipakai bersama remember/batch; write REM tidak memanggil intelligence/model. `CognitiveCycleReport` memuat reason counts, updated IDs dan index issues; commit yang berhasil tidak diulang hanya karena refresh indeks gagal. Source exclusions menghitung record; hasil commit menghitung plan, sehingga reason counts bukan denominator dukungan independen.

Verifikasi source: tes merah pertama pada target maintenance menunjukkan 9 kegagalan, termasuk double create lintas engine dan publikasi sumber yang berubah setelah snapshot. Invokasi kedua: **33/33 PASS**, mencakup same-ID corrections, access-only idempotence, concurrent engines, source change/delete/expiry antara plan dan commit, operator edits, safe legacy adoption, cap lima digest, post-commit index failure, masking serta archive/exact refs v2. Type check source lulus; total test target tepat dua invokasi. Pemeriksaan service berinput diketahui dilakukan pada fixture terisolasi dalam invokasi hijau tersebut, tanpa pengulangan manual yang redundan. **Build resmi `npm run build` exit 0**, path policy 532 authored files/0 exceptions, Skill ownership 42 sources/47 artifacts dan structure 472 directories PASS. Tidak ada benchmark atau percobaan pada live Memory pengguna. Review Native pendamping kemudian selesai read-only; profil P1/P2 dan verifikasi resolver terakhir juga selesai pada 2026-10-31. Resident tidak direstart dan fitur nonaktif tidak diaktifkan; hasil ini membuktikan source/build, bukan perubahan pada live Memory atau manfaat perilaku. Version intent patch: `.changeset/rem-source-revision.md`.

## Disposisi review Native — 2026-10-31

Turn pendamping b579b9bb-e6c4-4692-8b48-99d628b41bf5 selesai read-only (verification unavailable), tidak menjalankan tes atau memberikan approval operator. Dua saran REM dinilai terhadap kontrak: counter ineligible memang menggabungkan record yang dikecualikan dan family/plan yang ditahan; unit campuran sudah dijelaskan dan bukan denominator dukungan, statistik kegagalan operator atau klaim dampak. Assertion ineligible > 0 sendiri lemah, tetapi tes operator-edit juga memastikan planned=0, tidak ada update dan isi digest operator tetap utuh. Pilihan konservatif dipertahankan dalam scope ini.

Hash output semantik penuh sengaja memperlakukan perubahan metadata oleh owner lain sebagai output yang tidak lagi dimiliki eksklusif oleh REM; otomatisasi menahan refresh daripada menimpa perubahan itu. Source semantic revision penuh juga sengaja mengikat link/tag/provenance, walaupun render teks mungkin sama. Mengurangi hash menjadi teks saja akan melemahkan final guard dan membutuhkan kebijakan owner/revisi baru; tidak diterapkan sebagai polish setelah dua tes sudah lulus. Batas refresh yang konservatif dan legacyUnknown tetap eksplisit. Tidak mengubah source REM atau mengulang target tes berdasarkan review ini.

## Keputusan pengguna dan scope

2026-10-31 — pengguna meminta "buat goals untuk mengerjakan 2 proposal dengan bantuan dari Native Agent Core" dan menyebut kedua path proposal. Scope rekomendasi Revisi 1 dipakai: P1 → P2 REM, lalu P1 → P2 profil; P3 otomasi tetap HOLD sesuai prasyaratnya. Ini instruksi pengguna di chat Codex yang direlay sebagai external-controller, bukan pesan operator Native atau userEvidenceRef buatan. Pada batas keputusan implementasi itu, aktivasi live belum diminta; hasil source/tes/build di atas mempertahankan batas historis tersebut. Keputusan aktivasi berikut menggantikan status deployment itu.

Scope implementasi: **P1 + P2, berurutan**, Revisi 1. Model synthesis/diary, scheduler baru, backfill dan promosi otomatis tambahan tetap di luar scope. Pilihan internal: pisahkan family ID stabil dari generation sumber; final guard dan perubahan digest lewat transaksi canonical. Sumber/revisi yang tidak dapat diperiksa atau digest yang diedit manusia tidak boleh ditimpa; report menyatakan skip/review.

## Aktivasi dan penyelesaian — 2026-10-31

Pengguna kemudian meminta "aktivasi dulu kalau gitu, biar perubahan nya di gunakan bukan di gantung begitu". Build backend/UI resmi berhasil dan satu restart existing selesai exit 0 (receipt `7850af8f7bef4c48b948b384fe98bde5`), Core PID 16484 → 9316, mulai 17:42:10 WIB. Health setelah verifikasi Native: HTTP 200, status ok, stale false, canonical Memory complete/available dan 0 issue. Hash artifact REM/controller/UI cocok sebelum/sesudah build serta setelah restart. [Catatan aktivasi bersama](../proposals/Profil-Agen-dan-Otomasi-Terarah.md#aktivasi-live-p1p2--2026-10-31) memuat delapan hash, checkpoint, readback Native dan rollback; ini satu deployment, bukan dukungan independen berulang.

Konfigurasi cognitive `all` sudah aktif dan dipertahankan. Initializer Memory existing menggunakan loop REM 30 menit pada canonical store sehat; tidak menambah job P3, model, writer atau scheduler. Status siklus cognitive tidak diekspos health publik dan belum diamati pada tugas ini. Tidak memaksa siklus/digest live atau memakai Memory pengguna sebagai eksperimen; status selesai menyatakan kode guarded REM sudah dimuat resident, bukan bahwa digest baru atau manfaat retrieval telah terbukti. Correctness tetap 33 pemeriksaan source terarah yang sudah lulus. Intent patch existing dipertahankan; produk tetap 1.6.0, tanpa release/tag/push atau intent duplikat.

P1/P2 diselesaikan pada 2026-10-31. Path asal: docs/proposals/Konsolidasi-REM-Berbasis-Revisi-Sumber.md. Publikasi aktivasi: commit ef44b1a; review Learning task aktivasi selesai sebelum pemindahan arsip. Path arsip: docs/history-agent-core/Konsolidasi-REM-Berbasis-Revisi-Sumber.md. Keputusan, kegagalan awal, batas source dan keterbatasan live di atas dipertahankan; tidak ada paket OPEN/HOLD dalam dokumen REM ini. P3 HOLD tetap milik dokumen profil/otomasi yang aktif.
