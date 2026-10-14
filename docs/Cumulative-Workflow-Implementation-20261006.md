# Penguatan workflow cumulative learning — 2026-10-06

Implementasi mengikuti P1 → P2 → P3 → P4 → P5 → evaluasi manfaat. Branch lokal: codex/cumulative-learning-workflow. Perubahan pengguna sebelumnya dipertahankan. Tidak ada dependency/provider baru, fine-tuning, pergantian model otomatis, atau publikasi release.

## Peta perilaku dan bukti

| Tujuan | Implementasi | Pemeriksaan |
|---|---|---|
| Model dapat diganti | Pengetahuan/task/procedure disimpan di owner lokal, tidak melekat pada provider | Persist/reopen dan penggunaan dua controller; model actual dicatat setiap run |
| Kemampuan terakumulasi | Guard state degraded; atomic write/readback/last-good; arsip task selesai; recovery selektif | State rusak tidak ditimpa; backlog >64 dan task >2000 tidak hilang |
| Memory memengaruhi tindakan | Shared relevance context, alias workspace terverifikasi, freshness/contradiction, receipts | Exposure dipisah dari applied/adapted/rejected; task/revision/action/verifier binding |
| Lifecycle belajar lengkap | Checkpoint setiap tugas bermakna, review key eksplisit, retry parsial | Review A tidak menghapus B; pekerjaan tetap dilaporkan saat sink gagal |
| Pengetahuan terhubung | Journey, kontradiksi, pola, Skill dan langkah prosedur dalam konteks bersama | Budget konteks tidak memotong langkah prosedur; artifact yang tidak dikirim tidak mendapat receipt |
| Tubuh/pengetahuan bersama | LearningService memiliki kandidat prosedur dan SkillService mematerialisasikan | Transfer external/native lintas restart; replay satu task tidak menambah dukungan |

## Kontrak tugas

External: episode start(taskKey, workspace) → context → aksi/diagnosis → episode verify → learning checkpoint(taskId, idempotencyKey) → review(checkpointKeys, taskId, candidates/disposition). Task baru pada transport yang sama memiliki episode baru. Idempotency key yang sama kembali ke episode yang sama. Runtime memberi advisory dan pending reminder; kepatuhan model eksternal tetap diukur.

Native: strategi dan verifikasi tetap dimiliki runtime/controller existing. Finalize membaca hasil review. Kandidat/sink gagal tidak menghasilkan klaim Learning berhasil; response memisahkan status pekerjaan, verification, dan Learning. Kandidat Native mewarisi bukti dan workspace task bila field tersebut tidak disebutkan; bukti khusus kandidat tidak ditimpa dan tetap divalidasi. Kegagalan materialisasi Skill masuk penanganan finalisasi yang sama sehingga response pekerjaan tidak hilang. Operasi prosedur yang gagal disimpan tetap tersimpan pada finalization, dicoba ulang setelah restart/review, dan hanya dapat dibuang lewat penolakan eksplisit. Urutan dan pengulangan langkah prosedur dipertahankan. Argumen tool yang tidak valid mendapat umpan balik agar model dapat memperbaikinya dalam batas iterasi. Review pemulihan memakai learning(action=review) dengan key native yang sama; awal turn berikutnya merekonsiliasi hanya keputusan checkpoint task tersebut, sehingga kegagalan Learning tidak mengunci chat selamanya. Kesimpulan kegagalan hanya menyimpan tindakan, observasi, dugaan sebab, perubahan strategi dan pemeriksaan berikutnya, bukan chain-of-thought.

Chat yang terputus/dihentikan menggunakan awaiting-verification tanpa membuat pelajaran keberhasilan.

Keputusan setiap checkpoint: captured, duplicates-only, awaiting-verification, rejected, atau no-new-knowledge. Sink-failed/unavailable dan incomplete/partial tetap terlihat. Review legacy boleh capture tetapi tidak menutup pending tugas lain. Review yang selesai bersifat idempoten. Perbaikan kandidat ditinjau sebagai kandidat baru; kandidat lama yang ditolak harus mendapat keputusan eksplisit sebelum checkpoint dapat ditutup.

State versi lama dibaca kompatibel; versi workflow Learning 2 menggunakan registry prosedur bersama. Penulisan mempertahankan salinan terakhir yang valid dan memeriksa readback. Unreadable state menolak mutasi, tidak menimpa riwayat dengan default. Pending tidak dipotong demi batas retensi. Recovery backup corrupt valid dipreview dan digabung berdasarkan identitas; konflik mempertahankan aktif dan dicatat untuk review. Bukti historis tidak otomatis mendapat status verified.

## Batas bukti

Digest/source snapshot membuktikan identitas sumber, bukan kebenaran klaim. Invocation harus ditemukan dalam tracker. Receipt menerima revisi yang benar-benar diberikan untuk task terkait; tindakan harus terikat pada task atau answer artifact verifier. Reference palsu/berubah diberi unavailable. Pernyataan model saja tidak mempromosikan prosedur atau mengklaim peningkatan perilaku.

Verifier controlled-workflow/v1 menjalankan pemeriksaan deterministik pada jawaban engineering dan fakta/sumber/kontradiksi riset terhadap corpus lokal tetap. Ini verifier terbatas untuk corpus tersebut, bukan sertifikat kebenaran universal. Case/answer harus terikat manifest task yang didaftarkan oleh host pada Learning state; tidak ada MCP action untuk model mendaftarkan oracle sendiri. Laporan ad-hoc yang tidak punya manifest tepercaya tetap unavailable. Klaim peningkatan perilaku memerlukan hasil perbandingan cohort, sehingga candidate seperti itu tetap proposal saat bukti perbandingan belum tersedia.

Prosedur memerlukan >=2 task independen dengan verifier yang dapat diulang, dukungan positif >2 kali negatif, serta needsReview=false. Satu task dihitung sekali walau berpindah controller. Failure baru mempertahankan sejarah dan menahan promosi. Skill existing melalui revision staging. Migrasi lama mempertahankan provenance/historical support, tidak menciptakan dukungan verified.

## Evaluasi terkontrol

Harness: scripts/verify/cumulative-workflow-eval.mjs; memakai existing runtime, MCP tool session, Memory/Learning/Skill owners dan provider primary terkonfigurasi. Dua task pengalaman/domain; empat variasi baru/domain × dua controller × dua arm × dua repeat = 64 run. Engineering memeriksa latest-event/tombstone handling; riset menggunakan memo sintetis beku, source ID dan supersession. Ini scope sempit, bukan benchmark engineering/riset umum.

Baseline memakai store baru terisolasi; reuse menyalin training store ke store baru per run. Model, tools, batas, parameter dan input sama dalam pasangan. Urutan arm bergantian antar-repeat. Worker memiliki snapshot script dan dist tetap; tracker per run diisolasi. Konfigurasi provider penuh dibekukan di memori dan diteruskan melalui stdin tanpa menyimpan credential ke bundle. Model/provider ID, prompt/input digest, corpus, verifier, transcript, state/receipt, keputusan Learning, latensi dan ringkasan tersimpan dalam bundle runtime/tmp/cumulative-workflow-evaluation. Biaya ditandai unavailable jika provider tidak memberikan billed cost.

Lulus manfaat: correctness tidak turun di tiap domain/controller, nol success tanpa bukti, semua run memiliki keputusan Learning, dan median tool calls atau repeated failures membaik di tiap kelompok. Keputusan recovery harness dibedakan dari kepatuhan controller. Tidak memilih hanya run yang menguntungkan. Jika manfaat belum terbukti, laporkan **workflow berfungsi; peningkatan belum terbukti**.

## Status verifikasi

- Targeted regression: 132 tests / 11 files lulus; setelah itu jalur recovery native melalui public Learning review diperiksa lagi: 27/27 tests pada 3 file. Storage hardening: 16/16.
- Recall/capture workspace: 39/39 tes lulus. Pemeriksaan lifecycle terakhir: 31/31 tes lulus.
- Setelah perbaikan sebelumnya: 28/28 tes lifecycle/prosedur dan 32/32 tes integrasi Native/chat/continuation/shared knowledge lulus. Build TypeScript dan path policy (308 file, 0 exception) lulus.
- Full suite terbaru: 1187 pass / 13 fail / 2 skip, ditambah satu suite gagal import. Satu kegagalan berupa mock workspace-resolver diperbaiki dan file terkait lulus 20/20 saat diuji ulang; tersisa 12 test gagal + satu suite import. Sembilan kegagalan test dan satu kegagalan import direproduksi pada snapshot sebelum implementasi (replay health memakai satu file JSON statis tambahan yang dicatat); reproduksi tes yang bergantung scripts/dist tidak lengkap karena snapshot tidak mencakup semua file tersebut. Seluruh suite belum hijau.
- Evaluasi awal dengan foundation/verifier fixture salah ditandai invalid dan disimpan terpisah, tidak masuk klaim manfaat. Cohort 20-56 juga invalid karena 52 run gagal sebelum inference akibat AGENTS.md tidak disalin ke root runtime beku; seluruh hasil tetap disimpan. Cohort 21-15-38-951Z melewati bootstrap MCP nyata sebelum training/evaluasi. Kegagalan provider dan tugas pada cohort valid tetap dihitung.
- Cohort 21-15 dihentikan setelah regresi recall pada Memory tanpa workspace; hasil mentah dan regression-abort.json dipertahankan. Regresi diperbaiki dengan tes reproduksi. Empat tugas training cohort 21-35 menghasilkan verifier pass tetapi belum berhasil menangkap pelajaran; training-only-stop.json menyimpan alasan penghentian.
- Cohort final 2026-10-05T21-59-01-576Z membekukan revisi setelah seluruh perbaikan dan menjalankan ulang keempat training, kemudian 64 run; dihentikan atas permintaan pengguna untuk mulai pemakaian sehari. Hasil tersimpan: **25/64 run selesai, 24 benar, 18 Learning lengkap; 39 run tersisa**. Run yang terinterupsi dipertahankan dalam user-handoff-stop.json dan handoff-status.json. Tidak ada klaim manfaat dari cohort parsial. Harness menyatakan sink Memory tersedia dan sink Grafel tidak dikonfigurasi. Semua percobaan terdahulu disimpan sebagai diagnostik, tidak dipilih untuk meningkatkan skor.
- Pemeriksaan aktivasi terpadu terakhir: 160/160 tes pada 13 file lulus, termasuk lifecycle/controller/recovery/integrasi/evidence; build dan path policy lulus. Review akhir memeriksa operasi prosedur pending dan preservasi langkah berulang.

## Aktivasi dan rollback

Build dan targeted checks dahulu, kemudian reload melalui launcher resmi. Tidak menerbitkan release; changeset hanya intent. Simpan evidence dan baseline perubahan lokal. Bila state degraded, perbaiki/pulihkan salinan valid melalui jalur recovery; jangan menghapus state/backlog. Model/controller tetap dapat melakukan pekerjaan biasa tanpa menjadikan Learning gerbang seluruh eksekusi external.

## Handoff pemakaian sehari

Pengguna meminta menghentikan evaluasi panjang agar dapat beristirahat dan memakai aplikasi selama satu hari. Status: mekanisme sudah diterapkan dan pemeriksaan terarah lulus; peningkatan manfaat belum terbukti. Sisa benchmark serta readback inference Native penuh dapat dilanjutkan setelah pengguna kembali. Tidak ada benchmark berat yang sengaja dibiarkan berjalan.

Gunakan Agent Core seperti biasa. Bila ada hasil yang salah, pengulangan kegagalan, Learning pending/failed, atau saran Memory yang membantu, cukup catat tugas/conversation dan waktunya; jangan menghapus state atau pending Learning. Saat kembali ke sesi ini, bukti pemakaian nyata dapat dibandingkan dengan snapshot handoff.

Pemeriksaan terarah opsional: `npx vitest run tests/cumulative-workflow.test.ts`. Untuk benchmark baru yang terisolasi: `node scripts/verify/cumulative-workflow-eval.mjs` (membuat bundle baru; membutuhkan waktu dan inference provider). Jangan menjalankan `--continue` pada bundle lama karena opsi itu memulai ulang cohort dan menulis snapshot target. Kelanjutan 39 run perlu orchestration resume yang mempertahankan snapshot dan hasil lama; belum disediakan.

## Aktivasi aktual dan pekerjaan tersisa

Launcher resmi berhasil direstart (PID 19108 → 18772). Health resident HTTP 200/status ok; Native runtime available, issueCount=0, pendingFinalizationCount=0; Learning available dan kedua sink Memory/Grafel tersedia pada produksi. Readback controller eksternal available dan episode baru menerima taskKey dengan boundary explicit. Hash dist cocok dengan snapshot final yang diuji. Readback inference Native penuh ditunda untuk mempercepat handoff.

Pemulihan empat episode EC-9 dan satu prosedur historis **belum diterapkan**: konektor chat masih memvalidasi enum lama dan menolak episodeOperation=recover sebelum request mencapai aplikasi. Backup asli serta salinan state aktif tersimpan; tidak ada pending lama yang ditandai selesai. Refresh schema konektor kemudian gunakan recovery preview/apply pada layanan resident. Tidak dilakukan mutasi state produksi offline.

Bukti handoff: `runtime/tmp/cumulative-workflow-20261006/health-after-activation.json`, `launcher-activation.json`, `history-recovery-pending.json`, `targeted-activation.log`, `release-intent-final.log`; evaluasi parsial: `runtime/tmp/cumulative-workflow-evaluation/2026-10-05T21-59-01-576Z/audited-summary.json` dan `handoff-status.json`.
