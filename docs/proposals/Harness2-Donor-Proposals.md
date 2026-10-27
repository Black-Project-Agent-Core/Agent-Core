# Harness2 donor proposals
Tanggal: 2026-10-25
Revisi: 3
Status: PROPOSED — P1 Fase 0 DITERIMA dan SELESAI 2026-10-26 (laporan hanya-baca); P1 Fase 1 kandidat F1-A DITERIMA 2026-10-26, DIIMPLEMENTASIKAN di source (build, tes dan path policy lulus) dan AKTIF di resident sejak restart resmi 2026-10-26 10:36 WIB (diverifikasi pada respons acknowledge hidup); kandidat F1-A2 DITERIMA 2026-10-26, DIIMPLEMENTASIKAN di source (tes, build dan path policy lulus) dan AKTIF sejak restart yang sama; F1-B, F1-C dan P2–P5 belum diputuskan
Jenis: Improvement (lima usulan terpisah, keputusan per item)
Asal dan bukti: [Harness2-Donor-Audit-20261025](../research/Harness2-Donor-Audit-20261025.md), [features.csv](../research/harness2-donor/features.csv), source `G:\repos\harness2` commit `1cfe254`, source Agent Core yang disebut per item.

## Masalah dan tujuan
Audit source Harness2 (pertama kali dibaca dari source, bukan paper) menemukan lima mekanisme yang relevan untuk memperkuat Agent Core
tanpa menambah owner, gate, atau jalur eksekusi baru. Dokumen ini mengusulkan **apa** yang layak didonorkan, **di mana** menguntungkan,
dan **bagian mana** memperkuat Agent Core. **Tidak ada yang dikerjakan sebelum kamu memutuskan tiap item.** Semua hasil Harness2 adalah klaim
penulis pada benchmark mereka; tidak ada ukuran manfaat lokal.

## Bukti dan ketidakpastian
Rincian, jangkar baris, dan hal yang belum diverifikasi ada di dokumen audit. Skor paritas fitur 58,5 hanya cakupan daftar fitur donor,
bukan mutu Agent Core. Gap di bawah ini terbukti **pada fungsi yang dibaca**, bukan di seluruh repo.

## Ringkasan usulan (urut nilai/biaya)

| # | Usulan | Menguntungkan di | Memperkuat bagian | Ukuran | Ketergantungan |
|---|---|---|---|---|---|
| P1 | Ukur anggaran teks always-on (Fase 0, hanya baca, tanpa mengubah perilaku) | token per sesi, kecepatan awal | kontrak `AGENTS.md`, prompt Native | S | tidak ada |
| P2 | Gate paritas upaya pada perbandingan evaluasi | kepercayaan atas `benefitVerdict` | `external-evaluation.ts` (Learning) | S-M | sumber hitungan upaya per arm |
| P3 | Peringatan struktural pada validasi Skill (referensi menggantung) | kualitas Skill sebelum aktif | `SkillService` | S | tidak ada |
| P4 | Bahasa atribusi sadar-konfound untuk review dan usulan perbaikan | akurasi pelajaran | `improvement-handoff.ts`, `REVIEW-GUIDE.md` | XS (teks) | tidak ada |
| P5 | Inventaris "permukaan harness" delapan komponen (dokumen) | kejelasan usulan | `docs/Capability-Index.md` | XS (dok) | tidak ada |

## P1. Ukur anggaran teks always-on (Fase 0 saja)
- **Donor:** `prompts.py:130-146` (urutan biaya tuas: skill, skrip, subagen, plugin, teks always-on terakhir) dan `tree.py:336-390`
  (teks always-on dibatasi 24.000/8.000 karakter dan diperiksa sebelum probe).
- **Teramati di Agent Core:** `AGENTS.md` 78.135 byte; satu `controller_contract(read)` 78.493 karakter; giliran Native percakapan-saja
  sekitar 8 ribu token masukan (task `080e6ef5` 7.732, `4b00b8dd` total 8.337). Rincian per bagian belum ada.
- **Fase 0 (yang diusulkan):** laporan hanya-baca: ukuran byte dan estimasi token per bagian `AGENTS.md`, per bagian prompt Native, dan
  per bagian kapsul bootstrap; tandai bagian yang bersifat wajib-selalu vs situasional. Tanpa mengubah satu pun kata kontrak.
- **Fase 1 (TIDAK diusulkan sekarang):** memecah kontrak menjadi inti kecil + bagian sesuai-kebutuhan. Mengubah kontrak dan gate handshake,
  jadi butuh keputusan terpisah setelah angka Fase 0.
- **Menguntungkan:** prioritasmu (hemat kuota); mungkin permulaan sesi lebih cepat. **Memperkuat:** disiplin anggaran konteks.
- **Pemalsu:** bila Fase 0 menunjukkan sebagian besar teks adalah wajib-selalu atau bagian situasional kecil, hentikan di Fase 0.
- **Risiko:** hampir nol (hanya baca). Manfaat Fase 1 terhadap token dan kepatuhan **belum terbukti**.

### P1 Fase 1 — kandidat F1-A: ruang bagi baris dinamis kapsul bootstrap (spesifikasi untuk keputusan)
Status: DITERIMA 2026-10-26, DIIMPLEMENTASIKAN di source dan AKTIF di resident sejak restart resmi 2026-10-26 10:36 WIB (lihat Aktivasi di bawah). Dasar: [laporan Fase 0](../research/Always-On-Text-Budget-Phase0-20261026.md), bagian 5 dan 7.
- **Masalah dan bukti:** `bootstrapInstructions` (`src/learning/external-controller.ts`) memotong teks pada 7.000 karakter. Bagian statis (aturan, panduan skill, handoff) 6.579 karakter, sisa 421. Baris dinamis (current authority, koreksi, pelajaran, `pending Learning reviews`, `prior external episodes with unresolved Learning`) bisa sampai 5.383 karakter dan berada di belakang bagian statis, sehingga terpotong. Pada sesi 2026-10-26 respons `acknowledge` berakhir dengan "- c" setelah satu baris current authority (±416 karakter). `AGENTS.md` menyatakan kewajiban Learning yang terlewat dapat ditampilkan pada bootstrap berikutnya; saat ini ada 204 episode eksternal `pendingLearning` (Evidence-Gated Lab, R8 bagian 18.1) yang tidak dapat tampil.
- **Perubahan terkecil (satu fungsi; teks kontrak tidak berubah):** (a) pindahkan dua baris hitungan ke awal baris dinamis (±85 karakter); (b) potong pada batas baris utuh, bukan di tengah baris; (c) naikkan batas dari 7.000 ke 7.600 karakter. Hitungan: 6.579 statis + ±85 hitungan + ≤±890 satu baris current authority terburuk = ≤±7.554. Jadi hitungan dan satu baris current authority selalu muat, dengan sisa ±46–520 karakter untuk baris berikutnya pada batas baris. Biaya: sampai 600 karakter (±150 token estimasi) per handshake.
- **Alternatif yang tidak dipilih:** memangkas teks statis (mengubah panduan skill atau handoff yang dipakai bersama Native; itu wilayah F1-B/F1-C); hanya memindahkan hitungan tanpa menaikkan batas (baris current authority tidak lagi muat utuh: 421 − 85 = 336 < 416).
- **Acceptance:** tes yang gagal lebih dulu: dengan tiga baris current authority terpanjang dan 204 episode pending, kedua baris hitungan ada, tidak ada baris terpotong, panjang ≤ 7.600; tanpa data dinamis keluaran identik dengan sekarang; tes yang memanggil `bootstrapInstructions` (`external-skill-guidance`, `improvement-handoff`, `controller-contract`) tetap lulus; build dan path policy lulus. Setelah restart resmi (keputusan terpisah) respons `acknowledge` menampilkan kedua hitungan.
- **Pemalsu:** bila kapsul nyata sudah menampilkan kedua hitungan pada kondisi yang sama, gugurkan. Bila konsumen kapsul ternyata bergantung pada panjang 7.000, tahan.
- **Risiko:** rendah. Kapsul adalah konteks lokal, bukan otoritas instruksi. Tidak ada pengurai baris hitungan di `src` atau `tests` (dicari 2026-10-26). Skema tool MCP tidak berubah.
- **Rollback:** pulihkan satu fungsi dari cadangan dan hash; tidak ada perubahan skema atau state.
- **Di luar scope:** F1-B, F1-C, perubahan `AGENTS.md`, restart atau aktivasi tanpa keputusan terpisah.
- **Hasil implementasi (2026-10-26):**
  - **Perubahan:** hanya `bootstrapInstructions` di `src/learning/external-controller.ts`. Dua baris hitungan (`pending Learning reviews`, `prior external episodes with unresolved Learning`) kini berada tepat setelah `IMPROVEMENT_HANDOFF_CONTRACT`, sebelum baris current authority, koreksi dan pelajaran. Baris episode tertunda dan baris penutup tetap setelah pelajaran, supaya hitungan dan satu baris current authority terburuk selalu muat. Teks dipotong pada batas baris utuh (`lastIndexOf('\n', 7_600)`), dan batasnya kini 7.600 karakter. Teks kontrak, skema tool dan state tidak berubah.
  - **Hitungan:** statis 6.579 karakter (sudah termasuk pemisah baris; angka Fase 0) + dua baris hitungan 82 karakter dengan dua pemisah = 6.663. Satu baris current authority terburuk 893 karakter berakhir di 7.556, di bawah 7.600. Baris current authority kedua tidak muat dan dibuang utuh, tidak terpotong.
  - **Tes:** `tests/external-bootstrap-capsule.test.ts` memuat tiga tes: batas dan baris utuh di bawah tekanan data dinamis, urutan baris dinamis, dan bentuk tanpa data dinamis. Pada fungsi asli (direkonstruksi sementara dengan berkas tes versi final) dua tes pertama gagal (`- pending Learning reviews: 0` tidak ada; kapsul terpotong di baris current authority) dan tes bentuk lulus; fungsi baru lalu dipulihkan dari cadangan dengan hash yang sama dengan yang dibangun. Pada fungsi baru ketiganya lulus, begitu juga tes konsumen `external-skill-guidance`, `improvement-handoff` dan `controller-contract` (tiga file, 14 tes). Uji mutasi pada fungsi baru, masing-masing membuat minimal satu tes gagal: pemotongan di tengah baris, batas 8.000, dua baris hitungan dikembalikan ke belakang, dan baris episode dipindah ke depan baris current authority. Mutasi yang terakhir awalnya lolos karena teks statis fixture hanya 5.892 karakter; celah itu ditutup oleh tes urutan. Build lulus; path policy PASS (473 file, 0 pengecualian). Pencarian ulang di `src`, `tests` dan `scripts` tidak menemukan konsumen lain yang mengurai baris kapsul.
  - **Batas bukti:** fixture memakai katalog Skill kosong, dengan teks statis 5.892 karakter dibanding 6.579 pada pengukuran Fase 0. Kecocokan satu baris current authority terburuk pada kapsul nyata (berakhir di 7.556) adalah hitungan, bukan hasil tes, dan baru terkonfirmasi pada kapsul nyata setelah restart resmi. Suite penuh tidak dijalankan (di luar scope yang disetujui).
  - **Temuan di luar scope F1-A (tidak diubah):** baris `prior external episodes with unresolved Learning` mencetak jumlah setelah daftar dipotong ke lima, sehingga nilainya paling tinggi 5 walau `controller_learning(action=status)` melaporkan 195 episode tertunda. Perbaikan kecil yang mungkin (F1-A2): hitung dari daftar sebelum `.slice(0, 5)`. Spesifikasinya ada di bagian F1-A2 di bawah; butuh keputusan terpisah.
  - **Aktivasi (2026-10-26):** `dist` dibangun 10:26 WIB, lalu satu restart resmi (`restart_agent_core`, `capabilitiesChanged=false`) dijalankan setelah F1-A2 selesai. `/health` sebelum restart: proses 5028, mulai 2026-10-25 23:50:34 UTC, `build.stale: true`; sesudah: proses 1308, mulai 2026-10-26 03:36:40 UTC, `stale: false`. Respons `acknowledge` pada handshake baru memuat `- pending Learning reviews: 2` dan `- prior external episodes with unresolved Learning: 195` tepat setelah teks improvement-handoff, diikuti dua baris current authority utuh; kapsul 7.350 karakter (batas 7.600), dan baris koreksi, pelajaran, episode serta penutup terpotong utuh oleh batas. Pemalsu F1-A (hitungan tidak tampil) tidak terpenuhi. Belum diamati hidup: satu baris current authority terburuk (893 karakter); kapsul hidup ini memuat dua baris yang lebih pendek.
  - **Rollback:** kembalikan urutan lama (current authority, koreksi, pelajaran, dua baris hitungan, baris episode, baris penutup), ganti dua baris `joined` dan `text` dengan `const text = lines.join('\n').slice(0, 7_000);`, hapus `tests/external-bootstrap-capsule.test.ts`, lalu build. Pemulihan lewat `git checkout` tidak aman karena berkas yang sama memuat perubahan lain yang belum di-commit, dan checkpoint pra-edit otomatis tidak tersedia.

### P1 Fase 1 — kandidat F1-A2: jumlah sebenarnya episode tertunda pada kapsul bootstrap (spesifikasi untuk keputusan)
Status: DITERIMA 2026-10-26, DIIMPLEMENTASIKAN di source dan AKTIF di resident sejak restart resmi yang sama dengan F1-A (lihat Aktivasi di bawah). Dasar: temuan saat implementasi F1-A (bagian F1-A di atas).
- **Pengamatan dan bukti:** baris `- prior external episodes with unresolved Learning: N` memakai `pendingEpisodes.length`, dan `pendingEpisodes` sudah dipotong ke lima (`.slice(0, 5)`) di `bootstrapInstructions` (`src/learning/external-controller.ts`). Nilainya karena itu paling tinggi 5. `controller_learning(action=status)` melaporkan 195 episode `pendingLearning` pada 2026-10-26, dan [Evidence-Gated Lab R8](Evidence-Gated-Harness-Self-Improvement-Lab.md) bagian 18.1 mencatat 118 dari yang bermakna lebih tua dari 14 hari. Batas bukti: dibaca dari source dan dari angka status; belum diamati pada kapsul hidup saat spesifikasi ditulis karena F1-A belum aktif (diamati setelah aktivasi, lihat Aktivasi di bawah), dan 195 mencakup episode yang mungkin tidak memenuhi syarat `meaningful` atau adalah episode sesi aktif.
- **Pemilik yang ada:** `ExternalControllerLearningService.bootstrapInstructions`. Tidak ada owner baru.
- **Perubahan terkecil:** hitung jumlah dari daftar episode tertunda sebelum dipotong, dan tetap tampilkan paling banyak lima baris episode terbaru. Fungsi yang sama dengan F1-A; teks baris tidak berubah, hanya nilainya.
- **Manfaat yang diharapkan:** kapsul melaporkan ukuran backlog Learning yang sebenarnya, sesuai maksud `AGENTS.md` bahwa kewajiban Learning yang terlewat dapat ditampilkan pada bootstrap berikutnya. Pengaruh pada perilaku controller belum terukur. Pertimbangan: angka ratusan bisa terbaca sebagai beban yang tidak mungkin dilunasi; angka lima menyembunyikan skalanya. Alternatif yang tidak dipilih di sini: mengubah teks baris menjadi "5 ditampilkan dari N" (mengubah format) atau hanya menghitung episode terbaru (menyembunyikan backlog lama, yang justru ingin ditangani R8).
- **Scope:** hanya fungsi itu dan satu tes tambahan; tanpa perubahan skema, kontrak, state, restart atau aktivasi.
- **Risiko:** rendah. Panjang baris bertambah paling banyak beberapa karakter; tidak ada konsumen yang mengurai baris kapsul (dicari pada F1-A).
- **Rencana verifikasi:** tes yang gagal lebih dulu (enam atau lebih episode tertunda: baris hitungan menunjukkan jumlah sebenarnya, bukan 5, dan daftar tetap lima baris); tes kapsul dan tiga tes konsumen; build dan path policy; satu mutasi (hitungan dikembalikan ke daftar terpotong membuat tes gagal).
- **Pemalsu:** bila kapsul hidup setelah restart sudah menunjukkan jumlah sebenarnya dari sumber lain, atau jumlah itu ternyata menyesatkan controller (misalnya mendorong penutupan massal tanpa bukti), gugurkan atau revisi.
- **Keputusan yang diminta:** APPROVE / REVISE / HOLD / REJECT untuk scope di atas. Restart atau aktivasi adalah keputusan terpisah.
- **Hasil implementasi (2026-10-26):**
  - **Perubahan:** hanya `bootstrapInstructions` di `src/learning/external-controller.ts`; terhadap salinan pra-edit 3 baris ditambah dan 3 dihapus. `pendingEpisodes` tidak lagi dipotong ke lima saat dibentuk, sehingga baris `- prior external episodes with unresolved Learning: N` mencetak jumlah seluruh episode `meaningful` dengan `pendingLearning` selain episode sesi aktif. `.slice(0, 5)` dipindah ke pembentukan baris episode, jadi daftar tetap paling banyak lima baris, yang terbaru. Teks baris, urutan, pengurutan dan batas 7.600 tidak berubah. Ini lebih kecil daripada memisahkan variabel baru (`pendingAll`) seperti yang terbayang saat spesifikasi ditulis, dengan perilaku yang sama.
  - **Tes:** `tests/external-bootstrap-capsule.test.ts`: tes tekanan batas kini mengharapkan hitungan 6 untuk enam episode tertunda (sebelumnya 5), dan tes urutan menegaskan hitungan 6 serta tepat lima baris `  - episode `. Pada fungsi F1-A (sebelum perubahan) kedua tes gagal karena alasan yang benar (hitungan tercetak 5) dan tes bentuk lulus; setelah perubahan ketiganya lulus. Tiga mutasi pada fungsi baru masing-masing membuat tes gagal: daftar empat baris dan daftar enam baris (tes urutan), serta hitungan diambil dari daftar yang dipotong (kedua tes pertama).
  - **Tes konsumen:** `external-skill-guidance` (5 tes) lulus bila dijalankan sendiri; `improvement-handoff` dan `controller-contract` lulus. Dalam run tiga file bersamaan satu tes `external-skill-guidance` ("always exposes the installed capability index …") habis waktu pada 15 detik (hook pembersihan 10 detik), dua kali berturut-turut pada source baru dan sekali pada source F1-A. Karena run yang sama pada source sebelum perubahan memberi kegagalan yang sama dan tes itu tidak membuat episode tertunda, kegagalan itu tidak berasal dari perubahan ini. Penyebab lambatnya run gabungan tidak diselidiki; ketiga file yang sama lulus (14 tes) saat F1-A dikerjakan.
  - **Build dan path policy:** `rtk npm run build` exit 0; PATH POLICY PASS (473 file, 0 pengecualian); `dist` dibangun ulang.
  - **Batas bukti:** fixture memakai enam episode, bukan 195. Baris hitungan bisa beberapa karakter lebih panjang (misalnya tiga digit), sehingga hitungan terburuk F1-A menjadi kira-kira 7.558 dari 7.600; itu aritmetika, bukan hasil tes. Tidak ada tes yang menegaskan bahwa lima baris yang tampil adalah lima yang terbaru (pengurutan tidak diubah). Suite penuh tidak dijalankan.
  - **Aktivasi (2026-10-26):** restart resmi yang sama dengan F1-A (lihat bagian F1-A). Respons `acknowledge` hidup mencetak `- prior external episodes with unresolved Learning: 195`, bukan 5. Pembacaan independen `runtime/learning/external-controller.json`: 602 episode, 196 berstatus `meaningful` dengan `pendingLearning`, dan 195 bila episode tugas ini sendiri (kepala sesi) dikecualikan, sama dengan angka yang tercetak. Pemalsu F1-A2 (hitungan tetap 5) tidak terpenuhi. Daftar lima episode terbaru tidak tampil pada kapsul hidup ini karena batas memotong baris di belakang dua baris current authority; itu perilaku F1-A, bukan kerusakan.
  - **Rollback:** di `bootstrapInstructions`, pindahkan `.slice(0, 5)` kembali ke akhir pembentukan `pendingEpisodes`, hapus komentar dan `.slice(0, 5)` pada baris episode, lalu kembalikan dua penegasan tes (hitungan 5 pada tes pertama; hapus dua penegasan tambahan pada tes urutan). `git checkout` tidak aman karena berkas yang sama memuat perubahan lain yang belum di-commit; salinan pra-edit hanya ada di scratchpad sesi.

## P2. Gate paritas upaya pada evaluasi
- **Donor:** `ledger.py:26-113`: jumlah rollout/sesi harus tepat R=4k/P=3k, duplikat label diperiksa lebih dulu karena duplikat bisa
  memuaskan jumlah (`ledger.py:89-113`).
- **Teramati di Agent Core:** `external-evaluation.ts:89` sudah menolak tugas duplikat/tumpang-tindih antar-arm; tidak ada perbandingan
  upaya per arm, biaya dan waktu hanya selisih (`:131-134`). Ini implementasi konkret dari HG-1 (anggaran inferensi sama) di proposal Lab.
- **Perubahan terkecil:** observasi host opsional `attempts` per tugas; bila rata-rata per arm berbeda lebih dari ambang yang dideklarasikan
  di manifest, status `incomparable` dengan alasan `effort-imbalance` (bukan penolakan senyap). Tanpa owner baru.
- **Menguntungkan:** perbedaan hasil tidak lagi bisa muncul hanya karena satu arm diberi lebih banyak percobaan. **Memperkuat:** kredibilitas
  evaluasi yang sengaja menahan klaim manfaat.
- **Pemalsu:** bila host tidak bisa memberi hitungan upaya per arm yang independen dari manifest, usulan digugurkan.
- **Risiko:** kecil; perlu tes yang gagal dulu. Hanya mempersempit "comparable", tidak memperluas klaim.

## P3. Peringatan struktural pada validasi Skill
- **Donor:** `tree.py` `_check_script_refs` dan `_check_skills` (skrip yang dipanggil harus ikut dalam harness; skill harus punya pemicu).
- **Teramati di Agent Core:** `scanDirectory` memeriksa higiene file dan digest saja (`service.ts:208-249`); path yang dirujuk SKILL.md tidak diperiksa.
- **Perubahan terkecil:** `validate/stage_revision/import` mengembalikan `warnings[]` (bukan penolakan) untuk path relatif di SKILL.md
  (`references/...`, `scripts/...`) yang tidak ada di artefak. Tanpa kompilasi Python (tidak ada toolchain).
- **Menguntungkan:** referensi rusak ketahuan sebelum aktivasi, bukan saat dibaca. **Memperkuat:** jalur Skill/proposal Skill.
- **Pemalsu:** bila uji pada paket Skill yang ada menghasilkan banyak positif palsu, jadikan saran saja atau gugurkan.
- **Risiko:** kecil; peringatan tidak mengubah wewenang.

## P4. Bahasa atribusi sadar-konfound
- **Donor:** `prompts.py:1105-1163`: vonis `helped/hurt/no observed effect/confounded`; pelajaran yang hanya bertumpu pada baris `confounded`
  dianggap tebakan; tanpa kontras eksekusi tulis `NO_ENTRY`.
- **Teramati di Agent Core:** hanya `attribution: supported|unknown`; kata "confound" tidak ada di `src/learning`.
- **Perubahan terkecil (teks):** tambah tiga baris ke `IMPROVEMENT_HANDOFF_CONTRACT` dan `REVIEW-GUIDE.md`: bila beberapa komponen berubah
  bersamaan dan tidak ada eksekusi yang mengisolasi satu, tandai atribusi `confounded`; pelajaran yang hanya bertumpu padanya tetap
  `awaiting-verification`. Tanpa skema atau penyimpanan baru. Menambah sedikit teks (lawan P1; ditebus dengan memangkas redundansi).
- **Menguntungkan:** pelajaran lebih kecil kemungkinan salah-atribusi. **Memperkuat:** kualitas Learning.
- **Pemalsu:** bila tiga tinjauan berikutnya tidak pernah punya perubahan multi-komponen, aturan tidak dipakai; revisi atau gugurkan.

## P5. Inventaris permukaan harness
- **Donor:** model delapan komponen (system prompt, guardrails, memory, tool guidance, subagents, skills, scripts, plugins).
- **Teramati:** semuanya ada di Agent Core di bawah owner terpisah; belum ada satu tabel yang menyebut mana yang boleh diubah otonom dan
  mana yang butuh persetujuanmu.
- **Perubahan:** satu tabel dokumen di `docs/Capability-Index.md` (owner, file, aturan persetujuan). Tanpa kode.
- **Menguntungkan/memperkuat:** setiap usulan perbaikan cukup menunjuk satu baris tabel.

## Tidak diusulkan
Loop Propose-Probe-Compose pada tugas produksi; seleksi buta tanpa abstain; adapter executor/benchmark; cache improver; eksekusi tanpa
sandbox; penguncian POSIX. Alasan di dokumen audit bagian 5. Laboratorium fixture ber-oracle tetap di proposal Evidence-Gated (HOLD).

## Scope, batas Native, risiko dan otorisasi
Hanya jalur controller eksternal dan dokumen; Native tidak berubah kecuali P1 Fase 0 yang hanya mengukur prompt Native. Tidak ada salinan
kode/prompt Harness2 (Apache-2.0; ide ditulis ulang). Setiap item mengikuti keputusan eksplisitmu; dokumen ini sendiri tidak membangun,
me-restart, atau merilis apa pun. F1-A dan F1-A2 dibangun dan dites pada 2026-10-26 atas APPROVE; satu restart resmi sesudahnya mengaktifkan keduanya (dicatat di bagian Aktivasi masing-masing).

## Acceptance, evaluasi dan rollback
Tiap item punya pemalsu di atas. Tes harus gagal dulu sebelum perubahan kode (P2, P3). Rollback: item bersifat tambahan; hapus perubahan
tanpa memengaruhi perilaku lama. Tidak ada klaim manfaat sebelum diukur.

## Riwayat revisi
- Revisi 1 (2026-10-25): draf dari audit source Harness2 `1cfe254`.
- 2026-10-26: keputusan promosi untuk P1 Fase 0 dicatat di bagian keputusan. Isi usulan P1–P5 tidak diubah, sehingga revisi tetap 1.
- 2026-10-26: P1 Fase 0 selesai; hasilnya dicatat di bagian keputusan dan di laporan terpisah. Isi usulan tetap tidak diubah.
- Revisi 2 (2026-10-26): menambah spesifikasi kandidat F1-A di bawah P1 sebagai hasil Fase 0. Isi Fase 0 dan P2–P5 tidak diubah; pemecahan kontrak (F1-C) tetap tidak diusulkan sekarang.
- 2026-10-26: keputusan F1-A dicatat dan implementasi source selesai. Teks usulan P1–P5 tidak diubah; hanya status, hasil dan temuan F1-A yang ditambahkan, sehingga revisi tetap 2.
- Revisi 3 (2026-10-26): menambah spesifikasi kandidat F1-A2 di bawah P1 sebagai temuan implementasi F1-A. Scope F1-A yang diterima, F1-B, F1-C dan P2–P5 tidak diubah.
- 2026-10-26: keputusan F1-A2 dicatat dan implementasi source selesai. Teks usulan P1–P5 tidak diubah; hanya status dan hasil F1-A2 yang ditambahkan, sehingga revisi tetap 3.
- 2026-10-26: aktivasi F1-A dan F1-A2 lewat satu restart resmi dicatat dengan bukti respons acknowledge hidup. Hanya status dan bagian Aktivasi yang diubah; revisi tetap 3.

## Keputusan pengguna dan scope
**Keputusan promosi, 2026-10-26.** Pengguna meminta, "bantu aku untuk promote proposal yang harus di duluin atau proposal penting di agent core", dan menyerahkan pemilihan urutan kepada controller. Controller memilih **P1 — hanya Fase 0** sebagai yang pertama, berdasarkan bukti yang diukur pada sesi ini:
- Satu `controller_contract(read)` mengembalikan 78.493 karakter (478 baris); `AGENTS.md` berukuran 78.135 byte dan 475 baris.
- Bagian "Historical Hermes A2A partner protocol — RETIRED, NOT CURRENT INSTRUCTIONS" sendiri 3.609 byte (sekitar 4,6%) dan tetap dimuat pada setiap handshake. Ini contoh yang akan dikuantifikasi Fase 0; menghapusnya bukan bagian dari keputusan ini.
- Selaras dengan prioritas hemat kuota yang sudah dinyatakan pengguna, tanpa ketergantungan pada item lain, dan berisiko hampir nol karena hanya membaca.

**Scope yang DITERIMA: P1 Fase 0 saja.** Laporan hanya-baca berisi ukuran byte dan estimasi token per bagian `AGENTS.md`, per bagian prompt Native, dan per bagian kapsul bootstrap, dengan penandaan wajib-selalu versus situasional. Tidak mengubah satu kata pun kontrak, source, konfigurasi, atau perilaku; tidak ada build, restart, atau tes produk. Fase 0 berhenti sesuai pemalsu P1 bila hasilnya menunjukkan bagian situasional kecil.

**Hasil Fase 0 (selesai 2026-10-26, hanya baca):** [laporan](../research/Always-On-Text-Budget-Phase0-20261026.md); alat ukur dan data mentah ada di `docs/research/always-on-budget-phase0/`. `AGENTS.md` 78.135 byte dalam 46 bagian: wajib-selalu 41,4%, situasional 52,1%, historis 6,5% (klasifikasi adalah penilaian controller). Pemalsu P1 tidak terpenuhi, jadi Fase 0 tidak menghentikan P1. Temuan lain: kapsul bootstrap dibatasi 7.000 karakter dan bagian statisnya 6.579, sehingga baris dinamis (termasuk jumlah review dan episode Learning yang tertunda) hampir tidak muat; bagian statis prompt Native 16.392 byte (±4.100 token estimasi) dikirim pada setiap panggilan model. Kandidat Fase 1 F1-A (ruang bagi baris dinamis kapsul), F1-B (bagian Native kondisional) dan F1-C (pemecahan kontrak eksternal) menunggu keputusan terpisah; tidak ada yang dikerjakan.

**Keputusan promosi F1-A, 2026-10-26.** Setelah laporan Fase 0 dan spesifikasi F1-A disajikan, pengguna menjawab, "kerjakan F1-A". Controller mencatatnya sebagai APPROVE F1-A sesuai spesifikasi Revisi 2: satu fungsi `bootstrapInstructions`, tes yang gagal lebih dulu, build dan path policy. Restart atau aktivasi tidak termasuk dan butuh keputusan terpisah; F1-B dan F1-C tidak diterima. Hasilnya ada di bagian F1-A di atas.

**Keputusan promosi F1-A2, 2026-10-26.** Setelah F1-A selesai, controller mengajukan F1-A2 dengan pertanyaan "Setujui F1-A2 sebelum restart resmi?". Pengguna menjawab, "Auto-Approve, no debates". Controller mencatatnya sebagai APPROVE F1-A2 sesuai spesifikasi Revisi 3: satu fungsi `bootstrapInstructions`, tes yang gagal lebih dulu, build dan path policy. Controller membaca jawaban itu bersama otorisasi tetap Agent Core di `AGENTS.md` (penguatan 2026-10-18: aktivasi yang diperlukan, termasuk restart resmi, sudah diizinkan) sebagai izin untuk satu restart resmi sesudah F1-A2 selesai, supaya F1-A dan F1-A2 aktif bersama; bagian restart adalah penafsiran controller, bukan kutipan pengguna. F1-B, F1-C, P2–P5 dan Evidence-Gated Lab tidak diterima. Restart resmi dijalankan satu kali setelah F1-A2 selesai; hasil aktivasinya dicatat di bagian F1-A dan F1-A2 di atas.

**Belum diputuskan (tetap menunggu APPROVE / REVISE / HOLD / REJECT per item):** P1 Fase 1 lainnya (F1-B, F1-C), P2, P3, P4 dan P5.

**Urutan keputusan berikutnya yang disarankan controller:** P3, P5, P4 (angka Fase 0 kini tersedia), lalu P2; F1-A dan F1-A2 sudah diputuskan dan dikerjakan. P2 diturunkan dari urutan nilai/biaya di atas karena `benefitVerdict` di `external-evaluation.ts` bernilai tetap `'withheld'`, sehingga gerbang paritas upaya hanya mempersempit status `comparable`, sementara jalur evaluasi eksternal masih sedikit dipakai (`learning(action=backlog)`: 0 prosedur, 2 improvement eksternal). P2 lebih bernilai bersama paket evaluasi A/B/C di proposal Evidence-Gated.

**Atribusi:** ketiga keputusan di atas dicatat controller dari pesan pengguna di sesi chat; bukan atestasi pesan-pengguna dari host dan bukan grant eksekusi. Pengguna dapat membalik atau mempersempit keputusan ini kapan saja dengan REVISE / HOLD / REJECT.
