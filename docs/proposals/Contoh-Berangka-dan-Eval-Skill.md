# Contoh berangka dan eval input-diketahui untuk Skill Agent Core
Tanggal: 2026-10-30
Revisi: 1
Status: PROPOSED
Jenis: Improvement (paket P1 adalah revisi Skill `skill-authoring`, dikerjakan lewat facade `skills` setelah disetujui)
Asal dan bukti: 26 gambar `F:\Referensi\Insget\code.withnarayan_1793161717329.jpg` sampai `code.withnarayan_1793162132985.jpg` (dibaca penuh; halaman 9/15 seri Deep Learning tidak ada pada set); `src/skills/service.ts:198-221`; `runtime/skills/capability-packs/skill-authoring/SKILL.md`; `runtime/skills/capability-packs/mind-control/evals/`; `scripts/verify/skill-pack-lint.mjs`; hasil `skills(action=review_outcomes)` 2026-10-30.

## Masalah dan tujuan

Referensi adalah dua seri catatan belajar (Deep Learning 15 halaman, Persamaan Diferensial 10 halaman) dan tidak memberi celah arsitektur. Yang dipelajari adalah metodenya: setiap konsep disertai contoh dengan angka di tiap langkah sehingga pembaca dapat menghitung ulang, lalu ditutup halaman revisi dan pertanyaan uji.

Tujuan: Skill prosedural Agent Core membawa contoh berangka yang dapat diperiksa dan, bila perlu, kasus input-diketahui yang tidak menambah apa pun pada teks yang dibaca model. Konvensi penulisan Skill belum menyebutnya; folder `evals/` sudah dikenali owner Skill tetapi hanya 1 dari 43 paket yang memakainya.

## Bukti dan ketidakpastian

Teramati:

1. Contoh referensi saya hitung ulang dengan skrip sementara (kode referensi tidak dijalankan). Empat salah: DL 4/15 langkah 1, `Z1` seharusnya `[-0,06; 0,32]` (halaman: `[-0,16; 0,64]`) dan hasil 0,479, bukan 0,385; DL 10/15, feature map seharusnya `[[0,3,3],[0,1,1],[0,-1,-1]]`; ODE 9/10 contoh 6, `C` = 7/4 (halaman: 5/4); ODE 9/10 contoh 5, `A` = -1/2 (halaman: 1/2, jawaban akhir benar). Lolos: BCE 0,2231, hukum pendinginan Newton, max dan average pooling. Angka referensi tetap `klaim referensi`; pemeriksa dapat menghitung ulang dengan tangan.
2. `excluded()` di `src/skills/service.ts:198-204` melewati `evals/` tingkat atas dan dipakai `walkSkillFiles`. Bahwa digest Skill dihitung dari daftar itu belum saya baca penuh; diuji pada acceptance P2(c).
3. Hanya `mind-control` yang punya `evals/` (`cases.json`, `grader.md`, `report.md`, `results.json`). `skill-authoring` (4.470 B dari batas 8.192 B) tidak menyebut contoh berangka atau eval, dan lint tidak memeriksanya.
4. `mind-control/evals/report.md`: skor substansi baseline sudah 12/12; perubahan teramati hanya kepatuhan format rekaman. Kasus terlihat oleh kedua kondisi, satu sampel per kasus, tanpa held-out, dan satu putaran melibatkan beberapa agen.
5. `skills(review_outcomes)`: `recommendations` kosong, 128 dikecualikan. Artinya tidak ada rekomendasi revisi yang memenuhi syarat, bukan bukti bahwa tidak ada Skill yang salah diterapkan.

Disimpulkan: konvensi mungkin membuat penulisan Skill lebih konsisten dan revisi lebih mudah diperiksa secara mekanis. Tidak diketahui: apakah Skill tanpa eval pernah salah diterapkan, dan apakah ada manfaat pada hasil tugas.

Rekaman mind-control (T1). Klaim: tambahkan konvensi contoh berangka dan pemeriksaan struktural eval, tanpa menjalankan eval pada model. Rival terkuat: instruksi existing, `stage_revision` dan pelaporan hasil negatif sudah cukup, dan eval hanya menambah pekerjaan (bukti 4 mendukung rival ini). Uji: P2 dapat diuji struktural; manfaat tidak diuji. Flip condition: tidak ada paket baru yang memakai konvensi pada tinjauan berikutnya, atau lint menimbulkan noise. Keyakinan: teknis kuat dari source, manfaat lemah (unknown).

## Mekanisme dan owner existing yang dipakai

- P1, konvensi di `skill-authoring` (revisi Skill, sekitar 600 B): langkah baru "Contoh berangka dan cek input-diketahui". (a) Skill prosedural baru memuat satu contoh yang input dan keluarannya dapat dihitung ulang, di `SKILL.md` atau `references/`, tetap di bawah 8.192 B per fragmen. (b) Opsional `evals/cases.json` dan `grader.md` mengikuti tata letak `mind-control`. (c) Angka pada contoh dihitung ulang sebelum Skill diajukan. Owner: Skill `skill-authoring`, jalur `skills(stage_revision)`.
- P2, pemeriksaan struktural di `scripts/verify/skill-pack-lint.mjs`: bila `evals/cases.json` ada, periksa JSON valid, `id` unik, `prompt` tidak kosong dan `grader.md` ada. Ringkasan lint menambah satu angka "paket dengan evals". Tidak ada catatan per paket tanpa evals (menghindari 42 catatan noise); `--strict` tidak berubah. Owner: skrip lint yang sudah ada.
- P3, pilot berbasis bukti (bersyarat): hanya Skill yang punya hasil negatif terverifikasi pada `skills(review_outcomes)` diberi `evals/`, paling banyak dua. Rekomendasi saat ini kosong, jadi P3 tidak dikerjakan sampai ada bukti. Menjalankan eval pada model (berbayar, multi-agen) di luar scope dan butuh keputusan terpisah.

Tidak diusulkan ulang: aturan menghitung ulang angka referensi sudah ada di skill `study` langkah 3 dan di proposal Skill `study`. Tidak ada mekanisme Memory atau Learning baru, tidak ada penyimpanan baru.

## Scope, batas Native, risiko dan otorisasi

- Rekomendasi: P1 dan P2. P3 ditahan sampai ada bukti.
- Native dan controller eksternal memakai katalog Skill yang sama. `evals/` dikecualikan dari pemindaian, jadi Skill aktif lain tidak berubah. Tidak ada grant tool baru. Aktivasi revisi `skill-authoring` hanya atas keputusan untuk digest yang tepat; persetujuan dokumen ini tidak mengaktifkan apa pun.
- Tidak ada folder baru di luar rumah Skill: `evals/` berada di paket sumber `runtime/skills/capability-packs/<nama>/`.
- Risiko: `SKILL.md` `skill-authoring` melewati 8.192 B (sisa 3,7 KB, tambahan sekitar 600 B); konvensi dibaca sebagai kewajiban untuk 42 paket upstream (ditulis sebagai arahan untuk Skill baru atau yang direvisi, bukan migrasi massal); eval dianggap bagian runtime (hanya data); pola `mind-control` hanya terbukti pada kepatuhan format.

## Manfaat yang diharapkan dan keterbatasan

Manfaat adalah harapan, belum terukur: penulis Skill lebih sering menyertakan contoh yang dapat diperiksa, kesalahan angka pada contoh tertangkap sebelum Skill diaktifkan, dan revisi Skill dapat diperiksa mekanis untuk format. Keterbatasan: tidak ada bukti salah-pakai; eval `mind-control` tidak menunjukkan perbaikan substansi; konvensi menambah pekerjaan penulis; atribusi manfaat `confounded` bila P1 dan P2 dinilai bersamaan.

## Acceptance, evaluasi dan rollback

Hanya kebenaran fungsi, tanpa benchmark kecepatan dan tanpa putaran model; maksimal 2 percobaan per target.

- P1: `skill-authoring/SKILL.md` tetap di bawah 8.192 B setelah revisi; `skills(validate)` lulus; lint tidak menambah error.
- P2: (a) paket fixture dengan `evals/cases.json` berisi `id` ganda dilaporkan lint; (b) `cases.json` valid tidak menghasilkan catatan; (c) menambah `evals/` pada satu paket tidak mengubah digest dari `skills(validate)` (input diketahui: digest sebelum sama dengan sesudah).
- Rollback: P1 dengan `skills(rollback_revision)`; P2 dengan mengembalikan satu file; `evals/` hanya data dan dapat dihapus tanpa memengaruhi digest.

## Riwayat revisi

- Revisi 1, 2026-10-30: dibuat dari studi 26 gambar `code.withnarayan` atas permintaan pengguna ("Tulis proposal"). Rekomendasi studi sebelumnya adalah tidak menulis proposal karena bukti kebutuhan belum ada; keputusan menulis adalah keputusan pengguna.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT. Rekomendasi scope: P1 dan P2.
