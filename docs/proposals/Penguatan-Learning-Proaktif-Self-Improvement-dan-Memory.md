# Penguatan Learning, Proaktif, Self-Improvement, dan Memory

Tanggal: 19 Oktober 2026. Revisi: 2.
Status: IMPLEMENTED — parsial: P08, P01, P02 dan kartu/panduan proposal; build, satu restart dan fungsi resident terverifikasi. P03–P07 tetap PROPOSED.

Permintaan pengguna: bandingkan seluruh 68 temuan dengan Agent Core saat ini, temukan kemampuan yang belum ada atau masih lemah, lalu susun usulan konkret. Dokumen ini menjadi satu usulan terpadu dengan delapan paket perubahan yang dapat dipilih terpisah. Menyimpan dokumen ini tidak mengaktifkan paket mana pun.

Persetujuan lanjutan pengguna: implementasi bertahap **P08 deadline recall → P01
kontinuitas task → P02 validasi ulang Memory**, memakai owner existing dan tidak
menyentuh Native. Pengguna juga menyetujui folder/panduan Markdown serta kartu
proposal. Paket **P03–P07 tetap PROPOSED** dan tidak mendapat persetujuan otomatis
dari perubahan ini. Bukti implementasi dan aktivasi berada di
[laporan penerimaan](../External-Learning-Priorities-20261019.md); temuan snapshot
kajian awal di bawah tetap merupakan catatan historis sebelum implementasi.

## Kesimpulan yang memengaruhi arah pengembangan

Agent Core sudah memiliki sebagian besar fondasinya: Memory kanonis, tipe epistemik dan temporal, supersession, episode dan working state, capsule beranggaran, lineage, checkpoint/review Learning, prosedur berbukti, proposal Skill dengan revisi, dan pemeriksa outcome terbatas. Membangun mesin learning atau memory baru akan menggandakan owner yang sudah ada.

Kelemahan yang paling berguna ditangani adalah **hubungan antarbagian dan ketepatan penilaian**: kesinambungan task eksternal sampai checkpoint Memory; validasi ulang klaim menurut penyebab perubahan; feedback saran proaktif; evaluasi yang membedakan konteks, revisi dan jenis kegagalan; serta penanganan recall yang lambat atau gagal menemukan pengetahuan yang sebenarnya tersedia.

Ada juga batas yang perlu dijaga: compaction deterministik sudah mempertahankan item dan omission ledger, tetapi tidak membuktikan bahwa controller pertama kali mengekstrak makna sumber secara benar. Backup lengkap aset yang masih tersedia juga berbeda dari reproduksi interpretasi suatu percakapan.

Usulan menargetkan **external AI/controller**. Native Agent tetap frozen. Semua penyimpanan tetap dimiliki `src/memory`, `LearningService`/`LearningStateStore`, Skills, dan tracker existing. Tidak ada usulan model tersembunyi, store kedua, daemon evolusi, pembaruan izin otomatis, atau kewajiban selalu menghasilkan perubahan.

## Dasar bukti dan batas kajian

- Sumber ide: [68 temuan hasil kajian](../../../Learning/MAKNA-DAN-USULAN-LEARNING.md), M01–M68 dari 34 ZIP. ZIP tidak diekstrak atau dipelajari ulang dalam tugas ini.
- Baseline source lokal: Git HEAD `e69bcf5d3bd4c597a9e8a0c2735c044324b5c120`, dengan perubahan working tree yang sudah ada. HEAD saja bukan identitas seluruh source; hash berkas yang dipakai disimpan dalam [manifest kajian](../../../Learning/_study/gap68-source-audit.json).
- Code Intelligence melaporkan index current dan graph tersedia untuk workspace `agent-core`; pencarian `LearningCurator` cocok dengan source aktual. Keputusan di sini memakai pembacaan source, bukan graph sebagai otoritas terakhir.
- Bootstrap aktual mengungkap 28 pending review dan lima episode eksternal dengan Learning belum tuntas. Angka ini bukan bukti kelima pekerjaan gagal atau review layak dibuang; backlog tidak disentuh.
- Pada task kajian ini, `episode/start` berhasil, tetapi konteks awal mengembalikan `memoryTaskContext.status=unavailable`, alasan `MEMORY_TASK_NOT_FOUND`. Status episode berikutnya tetap menunjuk task yang benar. Ini mendukung pembedaan episode Learning dari episode Memory, bukan diagnosis kerusakan store atau bukti tab/chat tertukar.
- Source dan tes existing diperiksa sebagai kontrak. Tidak ada suite produk, benchmark, inference eksperimental, build, restart, instalasi atau perubahan konfigurasi dijalankan untuk kajian ini. Hasil tes historis dalam dokumentasi tidak dinyatakan sebagai tes baru.
- Status “ada” berarti mekanisme relevan ditemukan pada source sekarang. Itu tidak membuktikan semua client memakai mekanisme tersebut atau manfaat kausal pada pekerjaan sehari-hari.

## Rekonsiliasi dengan proposal dan implementasi sebelumnya

[README proposal](README.md) dan [integrasi sembilan proposal](../Nine-Proposal-Integration-20261016.md) menyatakan sembilan proposal CME sudah terintegrasi/dipenuhi owner existing. [Integrasi Marginal/Replay](../Marginal-Replay-Integration-20261016.md) juga sudah ditutup. Karena itu salience, contextual strategy review, prediksi versus outcome, calibration, semantic generalization dan proactive handoff **tidak dihitung sebagai kemampuan yang belum ada**.

[Perbaikan selector verifikasi episode](external-episode-verification-task-selection-20261018.md) sudah implemented/resident-verified menurut bukti historisnya, dan pemeriksaan selector memang ada pada source. Usulan P01 tidak membuka ulang defect itu. Namespace tanpa header sesi tetap dibagi menurut credential/jam; receipt kontrak bukan identitas chat. Penambahan isolasi chat otomatis tidak diasumsikan mungkin tanpa dukungan host.

[Rencana empat referensi Memory](../memory/PLAN-MEMORY-FOUR-REFERENCE-IMPROVEMENT.md), termasuk lineage dan progressive disclosure, sudah mempunyai implementasi. P02/P06/P07/P08 hanya membahas residual yang diuraikan di bawah. Status HOLD lain tidak berubah oleh dokumen ini. Questionnaire Invocate tetap deferred.

## Indeks bukti source

Nomor baris adalah titik masuk pada snapshot kajian, bukan janji baris tidak akan bergeser. Tautan menuju berkas owner; manifest mencatat hash byte.

| Bukti | Owner dan titik masuk | Yang benar-benar didukung |
| --- | --- | --- |
| E01 | [host-runtime.ts](../../src/memory/host-runtime.ts), [host-activation.ts](../../src/memory/host-activation.ts) | Pemilihan canonical Memory dan validasi aktivasi; bukan store baru per controller. |
| E02 | [experience-types.ts](../../src/memory/experience-types.ts):37, 71, 92, 107, 120 | Tipe klaim, working item, event berurutan, ingestion binding, checkpoint/capsule. |
| E03 | [capsule.ts](../../src/memory/capsule.ts):9, 25; [capsule-integrity.ts](../../src/memory/capsule-integrity.ts):7 | Item wajib, teks exact, budget, omission ledger dan pemeriksaan integritas. |
| E04 | [controller-session.ts](../../src/memory/controller-session.ts):56; [controller-protocol.ts](../../src/memory/controller-protocol.ts) | Penilaian continuity dan permukaan controller Memory terpisah. |
| E05 | [external-controller.ts](../../src/learning/external-controller.ts):641, 764, 813, 1111 | Episode Learning, checkpoint/review linkage, selector verifikasi dan pembacaan task context Memory. |
| E06 | [improvement-handoff.ts](../../src/learning/improvement-handoff.ts):4, 14 | Handoff proaktif berupa kontrak instruksi terbatas dan advisory. |
| E07 | [skill-proposal-types.ts](../../src/learning/skill-proposal-types.ts):1; [skill-proposal-notification.ts](../../src/learning/skill-proposal-notification.ts):19 | State, exact revision, decision dan notice untuk proposal **Skill**, termasuk delivery unconfirmed. |
| E08 | [prospective-intentions.ts](../../src/memory/prospective-intentions.ts):7, 33 | Cue waktu/event; projection advisory tidak menjadwalkan atau mengeksekusi. |
| E09 | [types.ts](../../src/learning/types.ts):32, 105; [state.ts](../../src/learning/state.ts):22 | Kandidat, pending review, keputusan, prosedur dan proposal dalam owner Learning existing. |
| E10 | [decision-review.ts](../../src/learning/decision-review.ts):15, 69, 169 | Deklarasi prospektif, konteks/authority, prediksi dan penilaian berbasis oracle terbatas. |
| E11 | [decision-calibration.ts](../../src/learning/decision-calibration.ts):61 | Populasi prediksi, exclusion, sample, risk–coverage; bukan bukti kompetensi umum. |
| E12 | [external-controller.ts](../../src/learning/external-controller.ts):684, 1728 | Outcome teknis tool dan perbandingan agregat episode; belum kontrak kesebandingan penuh. |
| E13 | [feature-outcome-pool.ts](../../src/learning/feature-outcome-pool.ts):4, 24; [curator.ts](../../src/learning/curator.ts):23 | Proposal review dari polaritas outcome per feature/event; ini tidak otomatis menghukum strategi. |
| E14 | [cumulative-workflow-eval.mjs](../../scripts/verify/cumulative-workflow-eval.mjs):62, 238; [controlled-outcome.ts](../../src/learning/controlled-outcome.ts):21 | Harness terisolasi, pasangan model/case, metrik dan signed delta sudah ada. |
| E15 | [review.ts](../../src/learning/review.ts):27, 67; [workflow-evidence.ts](../../src/learning/workflow-evidence.ts):55, 77 | Admission, evidence resolution, pemisahan use/correctness/behavioral benefit. |
| E16 | [service.ts](../../src/learning/service.ts):209, 296; [agent-learning-loop.ts](../../src/agent-learning-loop.ts):61, 133 | Procedure contract, proof per task, materialisasi proposal; tidak mengaktifkan Skill otomatis. |
| E17 | [skill-outcome-review.ts](../../src/learning/skill-outcome-review.ts):9, 22 | Outcome Skill terikat revisi aktif, task dan action/verifier; review negatif menjadi proposal. |
| E18 | [provenance.ts](../../src/memory/provenance.ts):140; [source-snapshot.ts](../../src/memory/source-snapshot.ts):25 | Pemeriksaan provenance/source drift; byte unchanged bukan kebenaran dunia tetap. |
| E19 | [revisions.ts](../../src/memory/revisions.ts):13, 74; [temporal.ts](../../src/memory/temporal.ts); [visibility.ts](../../src/memory/visibility.ts) | Riwayat, knownAt/validity dan pemfilteran keberlakuan. |
| E20 | [feedback.ts](../../src/memory/feedback.ts):10, 74, 226; [retention-score.ts](../../src/memory/retention-score.ts):29 | Feedback, forget/restore, salience bounded dan retention dengan akses logaritmik yang meluruh. |
| E21 | [promotion.ts](../../src/memory/promotion.ts):285, 369; [transfer-v2.ts](../../src/memory/transfer-v2.ts):245 | Preview/apply revisi, receipt idempoten, backup/restore dengan batas kelengkapan. |
| E22 | [retrieval-ledger.ts](../../src/memory/retrieval-ledger.ts); [relevance.ts](../../src/memory/relevance.ts):37; [search-projection.ts](../../src/memory/search-projection.ts) | Query/revision-bound retrieval dan relevance; receipt exposure berbeda dari manfaat. |
| E23 | [relations.ts](../../src/memory/relations.ts):32; [repository-identity.ts](../../src/memory/repository-identity.ts) | Relasi dengan validity/provenance dan workspace identity; bukan causal proof. |
| E24 | [mcp/experience-tools.ts](../../src/memory/mcp/experience-tools.ts):33, 60, 65; [service.ts](../../src/memory/service.ts):357 | Direct recall menerima deadline/signal, tetapi rank semantic tidak meneruskannya ke semanticContext. |
| E25 | [index.ts](../../src/memory/index.ts):411; [planned-context.ts](../../src/memory/planned-context.ts):141; [embedder.ts](../../src/memory/embedder.ts):104 | Index mendukung signal; planned recall punya race deadline; provider mempunyai timeout sendiri. |
| E26 | [safety.ts](../../src/memory/safety.ts); [redaction.ts](../../src/security/redaction.ts); [evidence-capture-policy.ts](../../src/security/evidence-capture-policy.ts) | Safety/redaksi/capture policy existing; bukan jaminan ekstraksi makna atau deteksi seluruh rahasia. |
| E27 | [Restart-Agent-Core.ps1](../../scripts/windows/Restart-Agent-Core.ps1):53; [apply-release.mjs](../../scripts/release/apply-release.mjs):42; [checkpoints/service.ts](../../src/rdc/checkpoints/service.ts):20 | Lifecycle/receipt dan rollback file existing; bukan bukti transaksi universal self-update. |
| E28 | [subagents/README.md](../../subagents/README.md), [raka.md](../../subagents/raka.md), [capability-awareness.ts](../../src/capability-awareness.ts) | Paket delegasi dan pemisahan discoverable/used/beneficial. |

## Usulan konkret

### P01 — Sambungkan kontinuitas task eksternal dengan episode Memory

**Prioritas tinggi. Temuan:** M12, M21, M29, M49, M57–M58. **Kondisi kini:** E02–E05 sudah menyediakan mekanisme yang diperlukan, tetapi memulai episode Learning tidak menghasilkan working state/capsule Memory. `memoryTaskContext()` hanya membaca; hasil `MEMORY_TASK_NOT_FOUND` pada kajian ini adalah contoh konkret batas itu.

**Perubahan minimum:** gunakan adapter external existing untuk menghubungkan task Learning dengan handle episode Memory. Sediakan alur eksplisit untuk controller menulis tujuan, constraint, hasil langkah, blocker dan next action ke working state existing, lalu checkpoint pada handoff/budget pressure. Simpan taskId, episodeId/revision, operationId, cursor/receipt dan artifact revisi sebagai satu rantai referensi. Tidak menyalin seluruh percakapan atau hasil tool secara otomatis.

Resume harus membaca capsule, expand bila handle-only/partial, memeriksa source freshness serta status pause/completed, kemudian melanjutkan hanya langkah yang belum selesai. TaskId yang diminta harus diperiksa terhadap invocation host sebelum dan sesudah await pada adapter; jangan menganggap receipt kontrak mengisolasi dua chat. Bila host tidak memberi session identity terpisah, laporkan kebutuhan serialisasi, bukan menciptakan chat ID dari teks model.

**Owner:** external `src/learning/external-controller.ts`, `src/mcp/controller-learning-tools.ts`, adapter Memory scope; reuse `ControllerMemorySession`/episodes. **Manfaat yang diharapkan:** pengulangan penjelasan dan pengulangan aksi berkurang. **Risiko:** task salah dipautkan, resume state usang, atau duplikasi writer. Fail-soft dengan gap eksplisit; tidak memblokir kerja biasa.

**Acceptance yang diusulkan:** resume task yang mempunyai constraint/failed path/operasi ambigu tanpa mengulang operasi; replay operationId sama tidak menambah event; head berubah A→B ketika await harus menolak atribusi; capsule terlalu besar tetap memberi handle exact; task paused tidak dieksekusi karena cue eligible. Ukur langkah/penjelasan yang berulang pada pasangan tugas yang sebanding. Belum diuji pada kajian ini.

### P02 — Validasi klaim Memory menurut penyebab perubahan

**Prioritas tinggi. Temuan:** M08, M10, M22, M43, M60–M61, M67. **Kondisi kini:** E18–E20 sudah memeriksa freshness, temporal validity dan retention. Namun `static/dynamic` serta source byte/Git drift belum menyatakan HOW memvalidasi isi klaim atau WHEN klaim perlu ditinjau akibat dependency/keputusan baru. Access count bukan keberlakuan.

**Perubahan minimum:** tambahkan metadata review untuk klaim yang dipilih melalui owner experience/curation existing: `validationKind` reality/decision/dependency/relevance; sumber+field lookup; pemicu perubahan; cadence terpisah; scope/authority; `lastAttempt` dan `lastSuccessfulValidation`; alasan unknown; disposition retain/revise/externalize/retire. Status insiden historis, hasil validasi klaim dan keberlakuan panduan aktif harus tetap berbeda. Mulai dari klaim operasional volatile, bukan migrasi semantik otomatis semua note.

Externalization mengganti konstanta volatile dengan langkah lookup sumber/field, pembandingan dan fallback, disertai backlink old→new. Source hilang memperbarui attempt/blocker, tidak memajukan tanggal validasi sukses. Review harus mempertahankan safeguard yang jarang dipakai. Retention sudah memakai akses logaritmik yang meluruh dan salience bounded; belum ada bukti populer menjadi kebal retensi. Perubahan cap popularitas hanya layak dibahas bila kasus nyata memperlihatkan dominasi yang merugikan; tidak menjadi pekerjaan wajib paket ini. Curator tetap proposal-only.

**Owner:** `src/memory/experience-types.ts`, provenance, source-snapshot, feedback/retention dan `src/learning/curator.ts`; tidak membuat scheduler. **Manfaat:** aturan usang lebih mudah ditemukan tanpa menghilangkan sejarah. **Risiko:** salah klasifikasi atau terlalu banyak review; metadata legacy tetap unknown. Jangan mengubah perilaku Native/frozen; implementasi kelak harus memilih extension external yang kompatibel atau menunda bagian yang tidak dapat diisolasi.

**Acceptance:** enam skenario: fakta dunia berubah tanpa byte berubah; keputusan baru belum efektif; dependency naik versi tetapi workaround masih dibutuhkan; source unavailable; safeguard langka tetap berlaku; externalization belum berhasil ditulis. Tidak satu pun boleh menghasilkan validasi sukses palsu. Perubahan cadence saja tidak boleh mengubah authority atau truth.

### P03 — Tutup siklus feedback proposal proaktif dan pertanyaan belajar

**Prioritas menengah. Temuan:** M03, M16–M18, M20, M30, M32, M39, M43–M44, M48. **Kondisi kini:** E06 adalah kontrak handoff, E07 mempunyai lifecycle untuk Skill, E08 memberi cue advisory. Belum ada record setara yang memadai untuk feedback proposal improvement umum serta keputusan yang menunggu informasi. Menambah heartbeat tidak menyelesaikan celah tersebut.

**Perubahan minimum:** perluas record Learning existing untuk proposal external umum yang menunjuk Markdown/revision, task pemicu, evidence, kebutuhan keputusan dan tindakan berikutnya. Reuse pola notice/decision existing tanpa menyamarkan proposal umum sebagai Skill yang perlu dibangun. Bedakan observed candidate, disampaikan, respons belum diketahui, accepted/deferred/rejected, dikerjakan dan outcome. Pertanyaan belajar menyebut keputusan yang terbantu dan bukti apa yang hilang; pilih paling satu pertanyaan/saran material dari bukti task yang sedang dikerjakan.

Simpan suppression alasan dan waktu tinjau bila pengguna memang memberi waktu. Diam adalah response unknown. Ulangi hanya ketika ada perubahan bukti/status atau waktu review yang diminta. Cue eligible bukan perintah eksekusi. Cheap pulse membaca perubahan ringkas; review mendalam dibatasi budget. Checkpoint/review wajib tidak dihapus. Tujuan pesan tetap chat/task asal; penerima/channel lain memerlukan instruksi eksplisit dan dukungan host. Tidak mengirim pesan atau membuat automation dalam kajian ini.

**Owner:** `src/learning/improvement-handoff.ts`, state/types/notice existing, `prospective-intentions`; adapter external saja. **Manfaat:** saran lebih relevan, tidak berulang, dan dapat ditindaklanjuti. **Risiko:** spam, inference minat dari diam, duplikasi lifecycle. Utamakan quiet/no-op yang dapat dijelaskan, bukan kuota ide.

**Acceptance:** HOLD/REJECT tidak muncul ulang tanpa bukti material; jawaban belum ada tidak dihitung negatif; dua evaluasi bukti sama tidak menambah notice; delivery unconfirmed tidak disebut dibaca; pengguna aktif pada tugas kompleks dapat menunda saran; failed check tidak menjadi all-clear. Tidak ada klaim bahwa proses eksternal dapat bangun sendiri tanpa fasilitas host.

### P04 — Samakan kontrak evaluasi dan klasifikasi outcome

**Prioritas tinggi sebelum menyimpulkan manfaat. Temuan:** M09, M19, M25–M27, M37–M40, M45, M51, M53, M55, M65. **Kondisi kini:** E10–E11 dan E14–E17 sudah kuat dan tidak perlu diganti. Kelemahan spesifik ada pada adapter agregat: E12 membandingkan episode tanpa mengharuskan manifest kesebandingan; E13 menyatukan outcome berdasarkan featureId/event dan menganggap `unavailable` negatif. Hasilnya hanya saran review, bukan ban strategi; jangan melebihkan dampaknya.

**Perubahan minimum:** reuse manifest harness dan envelope evaluasi existing pada proyeksi external. Simpan tujuan production/exploration, case/populasi, controller, model aktual, asset/config revision yang benar-benar dimuat, evaluator/collector revision, jendela, unit kesempatan, baseline/candidate membership dan coverage. Kembalikan comparable/incomparable/insufficient dengan alasan sebelum delta ditafsirkan. Manifest yang tidak tersedia tetap unknown; jangan mewajibkan harness mahal untuk tugas biasa.

Pisahkan task-negative terverifikasi, infrastructure failure, evidence missing, interrupted, not-exercised dan unknown. Dedup bukti outcome menurut task+artifact revision+jenis outcome, bukan event ID saja; retry dan log lebih ramai bukan sampel independen. Pertahankan metrik all-attempts dan subset terverifikasi agar kegagalan infrastruktur tidak disembunyikan maupun dianggap bukti strategi buruk. Cost/time hanya diisi bila terukur. Gunakan data aktual path/model; tidak mengubah routing model host.

**Owner:** external `evaluate`, feature-outcome-pool/curator dan tracker existing, reuse `learning/evaluation.ts`, controlled-outcome dan script evaluasi existing. **Manfaat:** mengurangi kesimpulan belajar palsu. **Risiko:** re-klasifikasi sejarah; simpan hasil lama, proyeksi baru bertanda revision, dan unknown untuk metadata legacy.

**Acceptance:** verbosity ×10 tidak mengubah jumlah kesempatan; dua event task sama tidak menjadi dua support; pergantian model/evaluator tidak lolos sebagai pasangan; provider outage tetap masuk all-attempts tetapi tidak menghukum metode; eksplorasi tidak menaikkan skor produksi; delta regresi tetap negatif; missing cost tetap unavailable. Kemampuan fungsi dan manfaat held-out dievaluasi terpisah.

### P05 — Pertahankan kondisi dan larangan saat pelajaran menjadi prosedur

**Prioritas menengah. Temuan:** M01, M04, M11, M22, M24, M42, M46–M47, M54, M66. **Kondisi kini:** E15–E17 mengikat evidence dan exact procedure contract. Tetapi input procedure mengandalkan `description`, `reuseCondition`, `steps:string[]` dan allowedTools; kelengkapan prasyarat, AVOID, reversal condition, validasi serta rollback masih bergantung pada tulisan controller. Digest yang benar tidak memastikan unsur itu dipertahankan.

**Perubahan minimum:** gunakan format admission external dengan bagian berlabel trigger, prerequisite, action, avoid, expected consequence/checker, reversal/stop dan rollback-or-not-applicable. Normalisasikan secara lossless ke contract/steps existing; sertakan bukti asal dan pertahankan urutan serta pengulangan langkah. Jangan mengubah kontrak Native. Format lengkap tetap kandidat sampai replay bermakna dan qualification existing terpenuhi.

Sediakan skenario positif, negatif dan pengecualian. Sebagai teks fixture, pasangan “Kirim laporan tanpa persetujuan” versus “Jangan kirim laporan tanpa persetujuan” harus tetap berbeda setelah normalisasi; fixture itu tidak memberi izin mengirim. Sebaliknya, “boleh kirim setelah persetujuan” dan “jangan kirim tanpa persetujuan” dapat mempunyai batas operasional yang kompatibel; jangan menganggapnya negasi berlawanan hanya karena kata berbeda. Parameterisasi jawaban/hostname privat dengan rujukan lookup yang dapat diuji; jangan hanya menghapus literal lalu mengklaim prosedur masih benar. Exact proposal revision dan subitem menentukan cakupan review; tidak ada penyalinan otomatis ke AGENTS atau izin baru.

**Owner:** adapter procedure external, Learning review, proposal Skill existing. **Manfaat:** pengalaman lebih mudah dipakai ulang dengan batas kesalahan lama tetap terbawa. **Risiko:** template menjadi checklist kosong, negative condition salah dinormalisasi, atau contoh menghafal jawaban. Rollback/not-applicable harus dijelaskan; bukan dipaksakan pada setiap operasi.

**Acceptance:** negasi/pengecualian/kondisi authority survive extraction dan normalization; private answer constants tidak bocor; checker yang hanya `node --version` tidak membuktikan goal; satu task diceritakan dua controller tetap satu support; subitem yang tidak dipilih tidak berubah. Uji perilaku external sungguhan kelak harus dibedakan dari schema pass.

### P06 — Belajar dari recall miss yang berhasil dipecahkan

**Prioritas menengah. Temuan:** M28, M59, M62–M64. **Kondisi kini:** E22 punya retrieval/revision binding dan E20 punya feedback helpful/not-helpful/stale/wrong. Controller dapat mengedit keyword/link secara manual. Namun belum ada receipt terikat yang menunjukkan query gagal → sumber yang kemudian ditemukan → perbaikan jalur temu → query pembeda berhasil.

**Perubahan minimum:** melalui owner retrieval-ledger dan feedback/curation existing, catat original query atau fingerprint aman, scope/ranking mode, attempt ID, sumber/revision yang ternyata relevan, penyebab teramati dan kandidat repair. Repair dibatasi alias/keyword/link, tidak menulis ulang fakta tetangga. Preview+explicit apply memakai update/batch existing dan drift check. Negative alias/block manusia bertahan; co-occurrence tidak membuktikan identitas sama.

**Manfaat:** mengurangi pengguna harus mengulang fakta yang sudah tersimpan. **Risiko:** query sensitif, alias terlalu luas, false positive dan overfit satu pertanyaan. Simpan query mentah hanya jika perlu serta sesuai policy; bila hanya hash tersedia, jangan mengklaim dapat replay query.

**Acceptance:** original query dan parafrasa relevan menemukan target, query tetangga yang salah tidak mendapat target, workspace/revision berubah membatalkan repair, alias yang ditolak tidak muncul lagi; empty result akibat outage tidak dianggap knowledge missing. Protokol tidak memberi reward dari jumlah hasil saja.

### P07 — Catat derivasi interpretasi pada batas ekstraksi

**Prioritas lanjutan. Temuan:** M15, M49, M57–M58, M66, M68. **Kondisi kini:** E02–E03 sudah menjaga replay event, generator deterministik, item wajib dan omission ledger; E21 menyatakan isi transfer yang ada/tidak ada. Tidak ada alasan membuat compactor kedua. Yang belum ditangkap lengkap adalah kontrak semantik sebelum stateChanges ditulis controller: dari bagian sumber mana suatu pelajaran ditafsirkan dan dengan konteks apa.

**Perubahan minimum:** lampirkan derivation receipt external pada kandidat/episode evidence existing: source digest+range yang diizinkan, role/tool-call/result identity bila tersedia, parser/normalizer revision, controller/model identifier jika host dapat membuktikannya, policy/prompt digest, reference time, operator corrections dan excluded/lost ranges. Field yang tidak dapat diamati berstatus unknown. Simpan hasil interpretasi lama sebagai revisi; re-interpretasi dengan kontrak baru menghasilkan kandidat/delta, bukan overwrite diam-diam.

**Manfaat:** audit asal kesalahan makna dan rebuild yang dapat dijelaskan. **Risiko:** metadata berlebihan, sumber privat atau COT ikut tersalin, dan klaim kesetaraan palsu. Hanya abstraksi/rentang bukti yang diizinkan; tidak menangkap hidden reasoning atau seluruh log chat. Byte-identical replay dan semantic equivalence tetap dua klaim berbeda.

**Acceptance:** source sama + parser/policy beda diberi label interpretasi baru; unknown model tidak diisi tebakan; role user yang sebenarnya tool result tidak memperoleh authority manusia; negasi/koreksi tertaut ke sumber; sumber terhapus tidak dilaporkan recoverable; backup available-only tidak disebut sejarah utuh. Kebutuhan ini tidak menghalangi pemakaian Memory normal.

### P08 — Terapkan deadline recall pada seluruh jalur external

**Prioritas tinggi, lingkup teknis paling kecil. Temuan:** M31, M34, M45. **Kondisi kini:** E24 menetapkan `deadlineMs=now+15s`, tetapi menunggu dispatcher dan semantic rank tanpa race deadline lokal pada jalur langsung. Rank memanggil `semanticContext` tanpa options.signal, sementara E25 sudah mendukung signal dan planned context sudah mempunyai deadline/late-settlement logic. HTTP request abort pada `src/mcp/handler.ts` menutup transport; itu bukan pembuktian seluruh pekerjaan internal berhenti dalam 15 detik. Ini inkonsistensi source, belum pengukuran latency live.

**Perubahan minimum:** reuse pola waiter deadline/cancellation existing untuk direct external recall; teruskan signal yang sah ke index waiters dan cek deadline+scope kembali sebelum serialisasi/record disclosure. Kembalikan partial lexical atau unavailable dengan alasan yang jelas sesuai budget, bukan success-empty palsu. Pertahankan single-flight/cache ownership; pembatalan satu waiter tidak boleh membatalkan caller lain. Jangan menerapkan race ini pada mutasi Memory yang sudah commit dan kemudian menganggapnya batal.

**Owner:** adapter external `src/memory/mcp/experience-tools.ts`, host-context path pada service/index; reuse planned-context/query-cache. **Manfaat:** recall tambahan tidak menahan pendampingan ketika provider lambat. **Risiko:** late result tetap selesai di belakang, disclosure tercatat sesudah caller sudah berhenti, atau cancellation merusak shared cache. Tidak menjanjikan network provider pasti dibatalkan.

**Acceptance:** fake clock/provider lambat/hung; deadline total termasuk lookup/rank/disclosure; abort caller; dua waiter satu cancel; head/scope berganti ketika await; late settlement tidak menambah delivered receipt atau memilih task baru. Laporan harus membedakan stopped-waiting, provider-settled dan cancelled-confirmed. Belum ada timing test atau perubahan produk pada kajian ini.

## Matriks seluruh 68 temuan

**A** = mekanisme inti ada pada source; **L** = sebagian ada, residual lemah/belum terstruktur; **V** = kemampuan dasar ada tetapi hasil yang dimaksud belum dibuktikan oleh kajian; **T** = sengaja dibatasi/di luar prioritas external saat ini. Status bukan persentase kecerdasan atau pengukuran kualitas. Satu ide dapat mempunyai mekanisme A dan manfaat yang tetap unknown; kolom status memilih kesimpulan yang paling relevan.

| ID | Status | Pencocokan dengan Agent Core sekarang dan residual | Arah |
| --- | --- | --- | --- |
| M01 | A | Handoff berbukti dan goal/decision existing (E06,E10); jangan menambah aturan tanpa kasus. | P05 memperjelas format kasus. |
| M02 | A | Contract/capability, Memory dan proposal mempunyai owner berbeda (E01,E07,E28). | Pertahankan batas authority. |
| M03 | L | Handoff maksimal satu, cue advisory ada (E06,E08); quiet/suppression umum belum lifecycle lengkap. | P03. |
| M04 | V | Verifier dan tes fungsi ada (E10,E14,E15); kepatuhan instruksi external pada skenario nyata belum diuji di sini. | P05. |
| M05 | A | Raka punya paket misi/batas/evidence/done eksplisit (E28); host inheritance bukan jaminan. | Reuse. |
| M06 | A | kind note/decision/lesson/procedure, epistemic dan relasi tersedia (E02,E23). | Tidak membuat store entitas kedua. |
| M07 | A | Supersession, revisi dan temporal recall tersedia (E19,E21). | Reuse; sejarah bukan primary authority. |
| M08 | L | Validity/temporal/verification tersedia (E02,E19); tipe validasi sebab-spesifik belum lengkap. | P02. |
| M09 | A | Receipt delivered/applied dan proof outcome dipisah (E15,E17,E22). | P04 untuk agregasi sebanding. |
| M10 | L | Visibility/expiry/retention existing (E19,E20); rarity dan validity perlu review sebab-spesifik. | P02; tanpa auto-delete. |
| M11 | V | Schema/contract dan verifier terbatas ada (E10,E15); prompt bagus belum proof perilaku host. | P05. |
| M12 | L | Working state/capsule lengkap ada; episode Learning tidak otomatis menghasilkan task capsule (E02–E05). | P01. |
| M13 | A | Capsule/abstract/paged expansion punya budget terpisah dari sumber (E03,E04). | Reuse. |
| M14 | A | Kandidat, sink, review, exact proposal status dan activation terpisah (E07,E09,E15,E16). | Tidak membangun pipeline baru. |
| M15 | A | hypothesis/sourceRefs serta proposal-only synthesis/promotion tersedia (E02,E15,E21). | P07 menambah provenance interpretasi. |
| M16 | L | Curator interval dan cue ada; cheap/deep review external belum berbasis perubahan/manfaat marginal (E06,E08,E13). | P03; finalisasi wajib tetap. |
| M17 | L | Feedback/decision Skill ada (E07,E17), feedback improvement umum belum setara. | P03. |
| M18 | L | Blocker/obligation/salience ada (E02,E08,E10); pertanyaan belajar belum dikaitkan lifecycle keputusan secara utuh. | P03. |
| M19 | V | Discoverable/used/beneficial dipisah (E28,E17); menyelesaikan goal arbitrary memerlukan oracle nyata. | P04. |
| M20 | L | Skill notice mengakui delivery unconfirmed (E07); kontrak penerima proposal umum masih praktik controller. | P03; chat asal default. |
| M21 | A | failureContext dan blocker/next action tersedia (E02,E15). | P01 membantu kontinuitas handoff. |
| M22 | L | Prospective predictions/context/assessment tersedia (E10); reversal condition belum field khusus. | P02/P05. |
| M23 | A | Canonical host activation dan registered workspace identity ada (E01,E23). | Reuse; tidak menambah fallback store. |
| M24 | A | Memory advisory, candidate admission dan exact user decision terpisah (E07,E15,E26). | P05 menguji semantic preservation. |
| M25 | L | Unknown/unavailable banyak jalur sudah eksplisit (E10,E11,E22); feature pool mengelompokkan unavailable negatif (E13). | P04. |
| M26 | L | Harness punya model/case manifest (E14); perbandingan episode umum belum mensyaratkan kontrak sebanding (E12). | P04. |
| M27 | L | Harness terisolasi ada (E14); aggregate feature/episode belum uniformly purpose-bound (E12,E13). | P04. |
| M28 | L | Typed links/workspace identity ada (E23); alias knowledge repair dengan exclusion manusia masih manual. | P06, tanpa auto-merge. |
| M29 | A | Ingestion sequence/cursor/receipt dan promotion replay ada (E02,E21). | P01 menghubungkan alur external. |
| M30 | L | Notice per revision/session ada untuk Skill (E07); transisi bermakna/quiet untuk saran umum belum lengkap. | P03. |
| M31 | L | Planned recall melacak in-flight/late settlement (E25); direct recall belum deadline menyeluruh (E24). | P08. |
| M32 | L | Immediate reason dan curator cadence ada (E09,E13); belum ada budget review external berbasis kejenuhan. | P03; no-op sah. |
| M33 | V | Atomic commit/receipt dan exact expansion tersedia (E21,E22); write ACK belum uji query relevance pascapromosi. | P04, pengujian terarah kelak; bukan worker baru. |
| M34 | L | Planned retrieval berdeadline/budget ada (E25), direct external rank masih dapat menunggu provider (E24). | P08. |
| M35 | A | Scope/registered identity, eligible corpus sebelum ranking tersedia (E04,E23,E24). | Pertahankan scope-before-topK. |
| M36 | A | Revisi/digest/import conflict/transfer completeness tersedia (E07,E19,E21). | Tidak menimpa learned store dengan seed. |
| M37 | A | Verified label, evidence availability, use dan semantic support dibedakan (E11,E15,E17). | P04 untuk agregat legacy/unknown. |
| M38 | L | Decision declare sebelum assessment ada (E10); semua attempt lintas jalur belum satu denominator (E12,E13). | P04. |
| M39 | A | Handoff tidak wajib proposal/eksekusi dan Learning proposal-only (E06,E15). | P03 menambah alasan backoff, bukan forced innovation. |
| M40 | L | Harness baseline/reuse, order dan signed delta ada (E14); summary episode belum comparability-complete (E12). | P04. |
| M41 | A | Redaction/safety/evidence capture policy tersedia (E26); tidak membuktikan semua informasi privat terdeteksi. | Minimisasi pada setiap paket. |
| M42 | A | Unverified/behavioral claims tetap proposal; qualified procedure tidak autoaktif (E15,E16). | P05 memperkaya kasus validasi. |
| M43 | L | Salience/context calibration ada (E10,E11); frontier pertanyaan dan perubahan environment belum queue external terarah. | P02/P03/P04. |
| M44 | T | Idle tidak memberi mandate; scheduler model external tidak dimiliki Core (E06,E08). | Budget event/task-based P03; tidak menambah sensor/daemon. |
| M45 | L | Outcome teknis/tool dan evidence unknown dipisah (E12,E15); feature pool belum cause-specific (E13). | P04/P08. |
| M46 | L | Exact contract/reuseCondition ada (E16); precondition/avoid/checker/rollback masih teks tidak terstruktur. | P05. |
| M47 | L | Safety dan provenance ada (E15,E26); jawaban privat versus metode transfer belum dibuktikan admission umum. | P05/P07. |
| M48 | L | Working commitments/obligation dan pause/completed state ada (E02,E08); pemilihan saran belum commitment-aware penuh. | P03, advisory saja. |
| M49 | L | Sequence/origin/sourceRefs/ingestion ada (E02); tidak otomatis menangkap seluruh percakapan external/semantik peran. | P01/P07, sumber terpilih saja. |
| M50 | A | Task/credential scope dan capture policy tersedia (E04,E24,E26); source text bukan consent. | Tidak menambah kolektor default-on. |
| M51 | T | External model/depth dipilih host; harness dapat merekam model aktual (E14). | P04 observasi, tanpa mengganti model host. |
| M52 | A | Official restart/receipt, release transaction, Skill rollback dan checkpoint file ada (E07,E21,E27). | Reuse; universal auto-self-update tidak diperlukan. |
| M53 | L | Calibration punya unit/samples/exclusion (E11); feature pool masih per event/polaritas (E13). | P04. |
| M54 | A | Exact proposal digest/decision dan consolidation preview/apply ada (E07,E21). | P05 untuk item semantik; tanpa monolog internal. |
| M55 | L | Prospective calibration dan correction refs tersedia (E10,E11,E15); koreksi manusia bukan otomatis label kompetensi. | P04, label terikat bukti. |
| M56 | T | Forget/restore, archive, revision dan backup berbeda; permanent erase tidak tersedia untuk experience-v2 (E20,E21). | Jelaskan hide vs erase; tidak mengusulkan penghapusan destruktif. |
| M57 | L | Deterministic capsule mempertahankan exact mandatory items (E03); benar/salah ekstraksi awal belum divalidasi semantik. | P01/P05/P07; tidak mengganti compactor. |
| M58 | A | Omitted IDs, source availability dan transfer completeness sudah ada (E02,E03,E21). | P07 untuk gap sebelum ekstraksi, bukan ledger kedua. |
| M59 | A | Query/mode/revision/temporal-bound relevance dan ledger tersedia (E19,E22). | P06 mengevaluasi repair dengan query pembeda. |
| M60 | A | Salience bounded dan bonus akses logaritmik ikut meluruh (E20); belum ada bukti immunity retensi. | Reuse; perubahan cap hanya jika ada kasus dominasi. |
| M61 | L | Pinned/critical/retention dan candidate-purpose ada (E02,E03,E15,E20); expected loss/non-derivability belum admission eksplisit. | P02, terutama exception langka. |
| M62 | L | Manual metadata repair bisa dilakukan; bound recall-miss→repair→retest receipt belum ada (E20,E22). | P06. |
| M63 | A | Shared safety, task scope dan proposal admission tersedia (E15,E24,E26); semantic authority/polarity tetap penilaian controller. | P05/P07 memperjelas review; bukan engine policy baru. |
| M64 | A | Typed temporal links/provenance tersedia; co-access tidak otomatis causal (E23). | P06 menjaga alasan/path repair. |
| M65 | V | Active Skill revision dan lifecycle receipts ada (E07,E17,E27); manfaat revisi loaded pada cohort sekarang belum diuji. | P04. |
| M66 | L | Hash/exact steps menjaga teks setelah capture (E03,E16); semantic polarity sebelum capture belum terbukti. | P05/P07. |
| M67 | L | Source drift/expiry/curation tersedia, HOW/WHEN/disposition belum kontrak klaim lengkap (E02,E18–E20). | P02. |
| M68 | L | Replay/import/revisions/capsule generator ada (E02,E03,E21); interpretive derivation belum lengkap. | P07. |

## Urutan yang disarankan dan keputusan yang belum dibuat

1. **P08 → P01 → P02:** batas tunggu recall, kontinuitas external, lalu validasi panduan yang menua. P08 paling sempit; P01 paling langsung mengurangi pengulangan konteks; P02 menjaga isi yang diarahkan tetap tepat.
2. **P04 sebelum menyatakan paket mana pun meningkatkan kemampuan.** Reuse pemeriksa/harness yang ada; mulai dengan audit data/fixture terarah, kemudian tugas held-out yang sebanding. Kegagalan dan partial runs tetap dilaporkan.
3. **P06 → P03 → P05:** perbaiki recall miss, relevansi saran, dan portabilitas prosedur pada kasus nyata yang terlihat.
4. **P07 setelah kebutuhan reproduksi interpretasi konkret muncul.** Jangan menambah metadata besar pada semua note hanya demi kelengkapan desain.

Setiap paket kelak memerlukan diff external-only, definisi selesai dan bukti terarahnya sendiri. Jika public capability/schema berubah, workflow build → restart resmi → Refresh tools berlaku pada tugas implementasi yang diizinkan; **tidak dijalankan untuk dokumen usulan ini**. Tidak ada paket ini yang membenarkan perubahan Native freeze atau aktivasi Skill otomatis.

Kriteria manfaat bersama: lebih sedikit penjelasan/aksi berulang, false recall dan saran berulang tidak meningkat, critical constraints tetap terjaga, serta task correctness tidak turun. Ukur coverage, unknown, biaya dan latency hanya bila tersedia; schema pass, banyak note, jumlah saran dan test count bukan pengganti manfaat tugas.

## Ledger kajian

Hasil tugas ini adalah dokumen usulan, matriks 68/68 dan manifest hash sumber. Raka membantu analisis Memory; Main memeriksa silang source material dan mengintegrasikan hasil. `CODEBASE.md` menerima catatan dokumentasi yang menyatakan status proposal, bukan fitur terimplementasi. Tidak ada source produk, konfigurasi, active Memory knowledge, catalog, dependency atau release yang diubah; tidak ada proses aplikasi direstart. Metadata episode/checkpoint/review Learning tugas ini dicatat melalui lifecycle existing.

Pemeriksaan akhir hanya memeriksa cakupan ID, keunikan, referensi berkas, konsistensi status dan source hash. Pemeriksaan itu membuktikan keterlacakan dokumen, bukan kebenaran universal semua klaim, keberhasilan runtime baru, atau manfaat delapan usulan.
