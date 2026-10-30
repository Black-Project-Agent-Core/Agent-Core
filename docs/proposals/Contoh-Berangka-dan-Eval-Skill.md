# Contoh berangka dan eval input-diketahui untuk Skill Agent Core
Tanggal: 2026-10-30
Revisi: 2
Status: PROPOSED
Jenis: Improvement (paket P1 adalah revisi Skill `skill-authoring`, dikerjakan lewat facade `skills` setelah disetujui)
Asal dan bukti: R1 = carousel Deep Learning, 15 gambar `F:\Referensi\Insget\code.withnarayan_1793161717329.jpg` sampai `_1793161749087.jpg` (sampul, halaman 1-8 dan 10-15; halaman 9/15 tidak ada pada set). R2 = carousel Persamaan Diferensial, 11 gambar `_1793162130356.jpg` sampai `_1793162132985.jpg` (sampul dan halaman 1-10). Keduanya infografis catatan belajar akun `@code.withnarayan`: anonim, tanpa sumber, tanggal, versi atau lisensi, tujuan menarik audiens; kredibilitas rendah. Dibaca penuh 26 dari 26 (ukuran 1440x1919 piksel pada dua gambar yang diukur); empat area diperbesar untuk membedakan salah baca dari salah tulis. Source Agent Core: `src/skills/service.ts:198-266`, `runtime/skills/capability-packs/skill-authoring/SKILL.md`, `runtime/skills/capability-packs/mind-control/evals/`, `scripts/verify/skill-pack-lint.mjs`, `skills(action=review_outcomes)` 2026-10-30 22:47 WIB.

## Masalah dan tujuan

Referensi tidak memberi celah arsitektur. Yang dapat dipindahkan adalah metodenya: tiap konsep ditutup contoh dengan angka di tiap langkah, lalu halaman revisi dan pertanyaan uji. Tujuan: Skill prosedural Agent Core membawa satu contoh yang dapat dihitung ulang, dan penulis Skill benar-benar menjalankan hitungan itu sebelum Skill diajukan. Konvensi penulisan Skill belum menyebutnya; folder `evals/` sudah dikenali tetapi hanya 1 dari 42 paket yang memakainya.

Revisi 2 adalah studi ulang atas 26 gambar yang sama dengan skill `study` berbasis lensa. Yang berubah dari Revisi 1: bukti hitung ulang lebih luas, satu ketidakpastian ditutup dari source, ledger lensa ditambahkan, dan rekomendasi scope menyempit dari "P1 dan P2" menjadi "P1".

## Bukti dan ketidakpastian

Teramati (hitung ulang memakai skrip sementara di luar repo, data hanya dari gambar, kode referensi tidak dijalankan; hasil referensi tetap `klaim referensi` sampai dihitung ulang):

1. Dicek dengan skrip, 12 contoh: 8 salah, 1 tidak konsisten, 3 cocok.
   - Salah. R1 4/15: `Z1` seharusnya `[-0,06; 0,32]` (halaman `[-0,16; 0,64]`), keluaran 0,479 (halaman 0,385). R1 10/15: feature map seharusnya `[[0,3,3],[0,1,1],[0,-1,-1]]` (halaman `[[0,0,0],[0,3,-3],[0,3,-3]]`; kernel dibalik juga tidak cocok). R2 4/10 contoh 5: `x dv/dx` = `v^2 - v + 1`, bukan 1. R2 4/10: `dy/dx = x/y + 1` ditulis "bukan homogen" padahal fungsi `y/x` berderajat nol. R2 7/10 contoh 5: `vx = -x^2/2 + C` (halaman `-x + C`), jawaban `y = 2x/(2C - x^2)`. R2 7/10 contoh 6: tanda `- tan x . v`, jawaban `y = cos x / (C - sin x)`. R2 9/10 contoh 4: C.F. `y'' - y = 0` adalah `C1 e^x + C2 e^-x`, bukan `(C1 + C2 x) e^x`. R2 9/10 contoh 6: `C` = 7/4 (halaman 5/4).
   - Tidak konsisten: R2 9/10 contoh 5 menulis `A` = 1/2, jawaban akhir `-(x/2) cos x` benar (`A` = -1/2).
   - Cocok: BCE 0,2231 (R1 4/15), turunan aturan rantai (R1 5/15, analitik sama dengan numerik), hukum pendinginan (R2 10/10 contoh 2).
2. Dengan tangan, tanpa skrip: R2 1/10 contoh 5 "derajat tiga" padahal definisi di halaman yang sama memberi derajat 1; R2 2/10 contoh 6 dan 7 menyebut derajat "tidak terdefinisi" untuk akar dan pecahan, sedangkan konvensi buku teks membersihkan akar dan pecahan lebih dulu (definisi berbeda-beda, dicatat sebagai selisih konvensi). Contoh lain pada R2 3/10, 5/10, 6/10, 8/10 dan R1 pooling cocok.
3. Salah bukan angka: R1 3/15 softmax `Σ e^(αz_j)` (R1 2/15 dan 15/15 tanpa `α`); R1 14/15 `print("Test Accuracy:"; test_acc)` adalah SyntaxError dan data uji dipakai sebagai `validation_data`; R1 12/15 butir "update gate menentukan seberapa banyak masa lalu dipertahankan" bertentangan dengan rumus `h_t = (1 - z_t) h_(t-1) + z_t h~_t`; R2 sampul menulis daftar isi yang tidak sama dengan halaman (ada "First-Order, First-Degree", tidak ada Bernoulli).
4. `excluded()` di `src/skills/service.ts:198-204` melewati `evals/` tingkat atas. Digest hasil `scanDirectory` (`:258-266`) dan jalur proposal (`:620-641`) dihitung dari daftar `walkSkillFiles`, jadi `evals/` tidak masuk digest dan tidak dapat dibaca lewat `skills(read)`. (Revisi 1 menyebut ini belum dibaca; sekarang teramati.)
5. Hanya `mind-control` yang punya `evals/` dari 42 paket (Revisi 1 menulis 43: itu hitungan entri termasuk berkas). `skill-authoring` (4.470 B dari 8.192 B) tidak menyebut contoh berangka atau eval; `skill-pack-lint.mjs` tidak memuat kata `evals`.
6. `mind-control/evals/report.md`: skor substansi baseline sudah 12/12; perubahan teramati hanya kepatuhan format rekaman, satu sampel per kasus, kriteria terlihat oleh kedua kondisi. `skills(review_outcomes)`: `recommendations` kosong, 128 dikecualikan: bukan rekomendasi yang memenuhi syarat, bukan bukti tidak ada Skill salah-pakai.

Disimpulkan: kesalahan berkumpul pada contoh bertingkat (propagasi angka, substitusi lalu integral, koefisien tak tentu); contoh sekali-rumus lolos. Contoh berangka saja bukan jaminan; yang menangkap kesalahan adalah menjalankan hitungan. Lint struktural `evals/cases.json` tidak dapat menangkap nilai harapan yang salah. Pemeriksa contoh pada Skill hanya penulisnya: model pembaca tidak menjalankan kode dan `evals/` tidak sampai ke model.

Tidak diketahui: apakah Skill tanpa eval pernah salah diterapkan, dan apakah ada manfaat pada hasil tugas. Penyebab kesalahan referensi (dugaan: gambar hasil generasi, karena `α` nyasar dan ekspresi akhir R2 10/10 rusak; tidak diverifikasi). Isi halaman 9/15.

Rekaman mind-control (T1). Klaim: tambahkan ke `skill-authoring` konvensi contoh berangka yang dihitung ulang dengan menjalankan hitungan; tahan lint `evals/`. Rival terkuat: instruksi existing, `stage_revision` dan pelaporan hasil negatif sudah cukup (bukti 6 mendukung rival). Uji: ukuran dan `skills(validate)` untuk P1; manfaat tidak diuji. Flip condition: tinjauan Skill berikutnya tidak memakai konvensi, atau muncul hasil negatif terverifikasi pada Skill tanpa contoh. Keyakinan: lemah untuk manfaat, kuat untuk fakta source.

Ledger lensa:

| Lensa | Temuan | Efek |
|---|---|---|
| Semantik | pelajaran DL dan ODE standar; tidak ada mekanisme untuk Agent Core | tidak ada kandidat dari isi |
| Prosedural | definisi, diagram, rumus, contoh per langkah, halaman revisi dan pertanyaan | sumber P1 |
| Negatif | kesalahan pada contoh bertingkat (butir 1-3) | P1 wajib menghitung ulang; melemahkan P2 |
| Strategi | hanya hasil akhir ditulis; tidak ada cara memeriksa; pertanyaan wawancara tanpa jawaban | contoh perlu pasangan input-keluaran |
| Kredibilitas | anonim, tanpa sumber, banyak salah | isi hanya `klaim referensi`; metode tetap dapat dipakai |
| Ketiadaan | halaman 9/15 hilang, daftar isi R2 tidak cocok, tanpa bukti efek | cakupan DL tidak lengkap |
| Medium | teks pada empat area diperbesar dan ditegaskan | salah baca dikesampingkan untuk temuan di area itu |
| Kecocokan lingkungan | `skill-authoring` belum memuat; `evals/` dikecualikan dari digest | mendukung P1; P2 hanya didukung ini |
| Biaya | P1 sekitar 600 B dari sisa 3,7 KB; rollback satu revisi | rendah |
| Triangulasi | mind-control baseline 12/12; `review_outcomes` kosong; skill `study` langkah 3 sudah menghitung ulang referensi | rival kuat; manfaat tidak diketahui |
| Transfer | contoh dengan pasangan input-keluaran berpindah; halaman revisi dan pertanyaan tanpa jawaban tidak | hanya pasangan itu dibawa |
| Bebas: siapa pemeriksa contoh | pembaca manusia di referensi; di Skill hanya penulis | pemeriksaan di langkah penulisan, bukan runtime |
| Waktu, Maksud | API `tf.keras` dan nilai default cepat usang; pengguna menetapkan tanpa benchmark | tidak dipakai; tidak ada rencana benchmark |

Peta dukungan. P1: didukung Prosedural, Kecocokan lingkungan, Negatif (isi) dan lensa bebas; dibatasi Kredibilitas, Ketiadaan dan Triangulasi. P2: hanya Kecocokan lingkungan (`single-lens`) dan ditentang Negatif, sehingga keluar dari scope rekomendasi sampai paket kedua memakai `evals/`. P3: tidak berubah dari Revisi 1.

Profil nilai referensi: peran metode (utama) dan peringatan; kredibilitas rendah; nilai terbesar pada lensa Prosedural dan Negatif. Untuk menaikkan nilai: sumber asli penulis dan halaman 9/15, atau satu Skill nyata dengan hasil negatif terverifikasi.

## Mekanisme dan owner existing yang dipakai

- P1, konvensi di `skill-authoring` (revisi Skill, sekitar 600 B), langkah baru "Contoh berangka dan hitung ulang": (a) Skill prosedural baru atau yang direvisi memuat satu contoh dengan pasangan input dan keluaran yang dapat dihitung tanpa menjalankan Skill, di `SKILL.md` atau `references/`, tiap fragmen tetap di bawah 8.192 B; (b) penulis menghitung ulang contoh dengan menjalankan skrip atau alat, bukan membaca ulang, dan mencatat cara serta hasilnya pada ringkasan pengajuan; (c) opsional `evals/cases.json` dan `grader.md` mengikuti tata letak `mind-control`. Owner: Skill `skill-authoring`, jalur `skills(stage_revision)`.
- P2 (ditahan), pemeriksaan struktural `evals/cases.json` di `scripts/verify/skill-pack-lint.mjs`. Kembali ke scope bila paket kedua memakai `evals/`; bahkan lalu hanya memeriksa bentuk, bukan nilai harapan.
- P3 (ditahan), `evals/` hanya untuk Skill dengan hasil negatif terverifikasi; rekomendasi `review_outcomes` kosong. Menjalankan eval pada model berbayar dan multi-agen di luar scope.

Tidak diusulkan ulang: aturan menghitung ulang angka referensi sudah ada di skill `study` langkah 3 dan di proposal Skill `study`. Tidak ada mekanisme Memory atau Learning baru, tidak ada penyimpanan baru.

## Scope, batas Native, risiko dan otorisasi

- Rekomendasi: P1 saja. P2 dan P3 ditahan.
- Native dan controller eksternal memakai katalog Skill yang sama. Tidak ada grant tool baru. Aktivasi revisi `skill-authoring` hanya atas keputusan untuk digest yang tepat; persetujuan dokumen ini tidak mengaktifkan apa pun. Tidak ada folder baru di luar rumah Skill.
- Risiko: `SKILL.md` `skill-authoring` mendekati batas 8.192 B (sisa 3,7 KB); konvensi dibaca sebagai kewajiban untuk 41 paket lain (ditulis sebagai arahan untuk Skill baru atau yang direvisi, bukan migrasi massal); contoh yang dihitung ulang hanya membuktikan angka contoh itu, bukan seluruh Skill.

## Manfaat yang diharapkan dan keterbatasan

Manfaat adalah harapan, belum terukur: kesalahan angka pada contoh Skill tertangkap sebelum Skill diaktifkan, dan revisi lebih mudah diperiksa. Keterbatasan: tidak ada bukti salah-pakai Skill; eval `mind-control` tidak menunjukkan perbaikan substansi; konvensi menambah pekerjaan penulis; referensi berkredibilitas rendah sehingga hanya metodenya yang dipakai, bukan klaim efeknya.

## Acceptance, evaluasi dan rollback

Hanya kebenaran fungsi, tanpa benchmark kecepatan dan tanpa putaran model; maksimal 2 percobaan per target.

- P1: `skill-authoring/SKILL.md` tetap di bawah 8.192 B setelah revisi; `skills(validate)` lulus dan digest dilaporkan; lint tidak menambah error; langkah baru memuat pasangan input-keluaran dan kewajiban menjalankan hitungan.
- Rollback: `skills(rollback_revision)` untuk satu revisi. Dokumen ini tidak mengubah apa pun sebelum ada keputusan.

## Riwayat revisi

- Revisi 1, 2026-10-30: dibuat dari studi 26 gambar `code.withnarayan` atas permintaan pengguna ("Tulis proposal"). Rekomendasi studi sebelumnya adalah tidak menulis proposal karena bukti kebutuhan belum ada; keputusan menulis adalah keputusan pengguna. Scope yang direkomendasikan: P1 dan P2. Commit `c8d7285`.
- Revisi 2, 2026-10-30: studi ulang atas set yang sama dengan skill `study` berbasis lensa. Perubahan: bukti hitung ulang naik dari 4 menjadi 8 salah dan 1 tidak konsisten dari 12 contoh yang dicek dengan skrip, ditambah 3 temuan dengan tangan dan 5 temuan bukan angka; ketidakpastian digest `evals/` ditutup dari source; hitungan paket dikoreksi dari 43 menjadi 42; ledger lensa, peta dukungan dan profil nilai ditambahkan; P1 diperkuat dengan kewajiban menjalankan hitungan; P2 ditahan karena `single-lens` dan tidak menangkap kegagalan yang teramati; rekomendasi scope menjadi P1 saja. Tidak berubah: P3, owner, rollback, tanpa benchmark.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT atas Revisi 2. Revisi 1 belum pernah diputuskan, jadi tidak ada keputusan lama yang digantikan. Rekomendasi scope: P1 saja.
