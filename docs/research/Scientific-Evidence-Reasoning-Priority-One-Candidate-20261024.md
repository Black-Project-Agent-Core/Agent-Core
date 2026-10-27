# Kandidat Prioritas #1: Scientific Evidence-Grounded Reasoning
**Tanggal:** 2026-10-24 (Asia/Jakarta)
**Keputusan pengguna:** Peringkat #1 di seluruh kandidat improvement Agent Core, dengan scientific-critical-thinking sebagai inti dan lima skill donor sebagai mekanisme bersyarat.
**Status studi awal (historis):** USER-PRIORITIZED / SOURCE-STUDIED / CANDIDATE ONLY. **Update 2026-10-24:** permintaan berikutnya mengaktifkan `scientific-critical-thinking` sebagai Skill native katalog (`sha256:a7ba93754e8b925de134b2287fc5c2337016d4012954ae118aac2cf0395468b0`) dan memperbarui indeks ringkas; lima skill donor lain di dokumen ini tetap kandidat kondisional yang **belum** dipasang. Pemasangan tidak membuktikan peningkatan kualitas berpikir atau manfaat kausal.
**Tujuan:** kualitas berpikir dan keputusan pada belajar, research, pembangunan, debugging sulit dan improvement melalui klaim-bukti-kontra-bukti-metode-falsifier-kesimpulan berlingkup.

## 1. Bukti source donor yang diinspeksi
**Root donor yang secara eksplisit ditunjuk pengguna:** `E:\Projects\Agent-Core\DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\scientific-agent-skills\skills`.
Checkout donor sebelumnya terverifikasi branch `main` pada `593377bb048752abb0152deab9fbb1083a6087df`; identitas ini snapshot historis, bukan klaim HEAD diverifikasi ulang pada audit ini.
| Komponen | Bukti inspeksi source | Peran yang memenuhi syarat | Bukan peran |
| --- | --- | --- | --- |
| `scientific-critical-thinking` v1.5 | `SKILL.md`, delapan referensi metode/bias/statistik/evidence/logic | Inti: scope klaim, metode, risiko bias, alternatif, kepastian proporsional bukti, kritik terlacak | Mesin pembuktian otomatis, statistik, GRADE universal |
| `scientific-brainstorming` v1.4 | `SKILL.md`, `scripts/validate_register.py`, `scripts/evaluate_matrix.py` | Ide alternatif, assumptions register, prediksi, reviewer kontra, matriks transparan | Voting/scoring sebagai kebenaran atau izin tindakan |
| `scholar-evaluation` v2.4 | `SKILL.md`, `scripts/calculate_scores.py`, `scripts/check_traceability.py` | Review karya/argumen low-stakes dan bukti per kriteria; bedakan missing/not-applicable/zero | Ranking orang, hiring, pendanaan, keputusan high impact |
| `scikit-learn` v1.5 | `SKILL.md`, `scripts/classification_pipeline.py`, evaluasi/pipeline references | Metode ML bila data dan pertanyaan relevan; split independen, CV, leakage prevention | Alat penalaran umum atau bukti kausal dari akurasi model |
| `scikit-survival` v1.4 | `SKILL.md`, `scripts/evaluate_survival_metrics.py`, censoring-aware reference | Hanya data waktu-kejadian tersensor/competing risks; concordance, dynamic AUC, Brier, CIF sesuai estimand | Statistik untuk setiap kegagalan tool/task; diagnosis/keputusan klinis |
| `scientific-schematics` v1.10 | `SKILL.md`, `scripts/generate_schematic.py`, iterative review reference | Diagram ketika diperlukan/diminta dan source-backed; audit label, panah, hubungan | Validasi semantik klaim/otomatisasi data; tanpa OpenRouter tidak ada generator upstream |

**Batas bukti:** Skill markdown dan kode lokal diperiksa; skrip donor tidak dieksekusi, Python dependency tidak dipasang, dan tidak ada penilaian empiris hasil komposit ini.
**Lisensi:** dokumentasi donor adalah skill-level license; implementasi scikit-survival upstream mempunyai ketentuan GPL berbeda. Tinjau hak sumber per berkas jika benar-benar akan mengadaptasi/redistribusi kode.

## 2. Existing owner Agent Core yang harus dipakai ulang
- `src/agent-controller.ts`, `src/agent-learning-loop.ts`: tujuan, strategi, task episode dan artifact-use.
- `src/skills/discovery.ts`, `src/skills/service.ts`: katalog aktif, relevansi, revision/digest dan instruction reading; proposal berbeda dari pemasangan.
- `src/learning/decision-review.ts`: klaim/konteks/risiko/prediksi serta evidence access; advisory bukan tool grant.
- `src/learning/decision-calibration.ts`: prediksi prospektif dan diagnostik; confidence tidak otomatis jadi kebijakan.
- `src/learning/controlled-outcome.ts` dan `src/learning/external-evaluation.ts`: matched baseline/candidate; descriptive delta, tidak otomatis menyatakan sebab akibat.
- `src/learning/skill-proposals.ts` dan `src/learning/skill-outcome-review.ts`: jalur proposal dan bukti penggunaan aktual; jangan membuat SkillService/Learning kedua.
- `src/verification/evidence-links.ts`: klaim terikat ke lokasi source bukan bukti entailment semantik (`semanticSupport:not-established`).
- Katalog aktif sudah memiliki `doubt-driven-development` dan `idea-refine`, jadi hanya tambahkan mekanisme yang membuktikan nilai inkremental, bukan mengganti dengan nama lain.

## 3. Komposisi berjenjang, bukan enam skill wajib
**T0 — Gate relevansi:** pertanyaan mudah/deterministik memakai jawaban dan verifikasi minimal; tugas berisiko, bukti diperdebatkan, atau klaim improvement penting memakai pemeriksaan mendalam. Kedalaman sebanding dampak/ketidakpastian dan bukan durasi panjang untuk dirinya sendiri.
**T1 — Batas masalah:** definisikan tujuan, klaim yang dinilai, unit observasi independen, kriteria keberhasilan, dampak, asumsi, izin dan sumber yang berwenang.
**T2 — Alternatif terpisah:** generate ide/hipotesis tandingan tanpa menganggap keluaran multi-sampel satu model sebagai beberapa ahli independen. Simpan versi awal, asumsi, prediksi pembeda, falsifier dan kemungkinan kerugian.
**T3 — Bukti primer:** baca source/code/log/dataset/dokumen aktual, tidak hanya README. Catat bukti pendukung, penyangkal, hilang, inaccessible, tidak berlaku, sumber/date dan batas pencarian.
**T4 — Critical appraisal sebagai inti:** cocokkan desain/metode dan kesimpulan; bias, confounding, multiplicity, missingness, ketepatan inferensi, replikasi, kekuatan bukti dan alternatif kausal. Reporting quality, risk of bias, certainty dan utility adalah objek berbeda.
**T5 — Modul kondisional:** `scholar-evaluation` hanya untuk karya dan proses review yang sah; `scikit-learn` bila ada data ML serta split/metrics valid; `scikit-survival` hanya untuk censored time-to-event; `scientific-schematics` hanya bila visual diperlukan dan koneksi diizinkan.
**T6 — Discriminating verification:** uji prediksi/falsifier dengan baseline valid, oracle tujuan independen, kasus gagal dan negative controls; tidak mengulang test-holdout sebagai tuning, dan tidak mengklaim sebab akibat dari delta observasional.
**T7 — Jawaban yang dibatasi:** gunakan label `verified-within-scope`, `supported-with-uncertainty`, `hypothesis`, `contradicted`, atau `unknown/unavailable` sebagai notasi RANCANGAN, bukan status enum runtime. Nyatakan konteks dan alasan.
**T8 — Siklus hasil:** kaitkan task, sumber, langkah yang benar-benar diterapkan, verification, kesimpulan dan keterbatasan melalui owner Memory/Learning/SkillService existing. Retrieval atau teks proposal bukan bukti perubahan perilaku.

## 4. Contoh penggunaan dan batas metode
| Kasus | Utama | Kondisional | Larangan inference |
| --- | --- | --- | --- |
| Perbaikan bug dan arsitektur | Critical thinking + hipotesis tandingan + source/verifier aktual | Brainstorming saat penyebab ambigu | Test pass teknis != user-goal benefit |
| Menguji apakah Memory meningkatkan keberhasilan | Critical appraisal + comparable baseline/candidate + whole-attempt accounting | scikit-learn hanya bila analisis data sah | Korelasi, unmatched model atau sedikit sampel != sebab-akibat |
| Riset dan evaluasi karya ilmiah | Critical thinking dan bukti sumber | Scholar-evaluation saat penilaian karya low-stakes | Rubric number != truth/quality universal |
| Analisis kegagalan terhadap waktu | Definisi event, censoring, competing risks dan unit independen | scikit-survival setelah cek dataset/estimand | Tidak memaksakan survival dari timestamp log biasa |
| Diagram hubungan sistem | Bukti relasi + visual clarity | scientific-schematics hanya atas permintaan dan izin outbound | Review visual tinggi != diagram benar |

## 5. Status dan aturan keputusan
- Keputusan pengguna: PRIO #1 lintas seluruh kandidat improvement. Ini prioritas kerja, **bukan** peringkat ilmiah akurasi atau izin menaikkan privilege alat.
- Kandidat upstream `autoskill` tetap HOLD untuk indexing/integrasi nanti; bukan bagian yang otomatis dipasang oleh desain ini.
- Upaya mendaftarkan proposal Skill resmi melalui `skills(action=propose)` saat studi ini ditolak runtime dengan `SKILL_PROPOSAL_TASK_IDENTITY_REQUIRED`; tidak dibypass. Dokumen ini dan indeks manusia-baca BUKAN catatan canonical SkillService.
- Tidak ada skema state baru, model kedua, daemon, script donor aktif, pengumpulan aktivitas Screenpipe, pembacaan kredensial atau outbound OpenRouter akibat dokumen ini.
- Kepastian absolut tidak bisa dijanjikan dalam riset terbuka: tuntutan yang dapat dipenuhi adalah tidak menyebut asumsi sebagai observasi, menyatakan unknown, dan memakai bukti independen untuk setiap klaim yang dinyatakan terbukti.

## 6. Acceptance dan falsifier untuk integrasi nanti
1. Peta owner/consumer dan source gap relevan dibuktikan sebelum ada perubahan kode; fungsi yang sudah ada dipakai ulang.
2. Pemilihan modul benar-benar task-conditional. Tugas deterministik sederhana tidak mengalami gate/deep-review yang mubazir.
3. Satu atau lebih tugas sulit menghasilkan evidence ledger, alternatif/falsifier, kesimpulan yang terikat bukti dan negative-case accounting; kasus kegagalan tetap utuh.
4. Untuk ML, independent unit dan holdout tervalidasi; untuk survival, censoring/time horizon/event type sesuai; untuk scholar evaluation, work-only/low-stakes; untuk schematic, manual semantic check dan outbound consent/grant.
5. Ukur task success dengan oracle independen dan cocokkan model, kasus, grants dan evaluator baseline/candidate. Jika manfaat tidak bisa diatribusikan, status tetap tidak-terbukti.
6. Verifikasi resident/actual applied-use hanya setelah approval tindakan yang spesifik, build/test sesuai lingkup, dan penerimaan teramati; pemasangan ke katalog sendiri tidak cukup.
7. **Falsifier:** penambahan langkah menambah delay/biaya tanpa meningkatkan kualitas oracle, menimbulkan overconfidence, mendorong salah aktivasi statistik, atau menurunkan kinerja tugas sederhana → revisi/rollback kandidat.

**Revisi:** 1. Studi source 6 skill, perbandingan owner Native dan keputusan prioritas pengguna 2026-10-24.
**Lanjutan:** pemilahan kandidat dan implementasi terpisah; jangan membaca dokumen ini sebagai klaim bahwa seluruh program telah dieksekusi.
