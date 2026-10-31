# Batas sistem dan horizon pengamatan pada bukti keputusan
Tanggal: 2026-10-31 (Asia/Jakarta)
Revisi: 1
Status: PROPOSED
Jenis: Improvement
Asal dan bukti:

- **R1 — buku/manual metode:** `E:\Projects\Learning\8bcf1ef49879d596.pdf`, *The Systems Thinking Playbook*, Linda Booth Sweeney dan Dennis Meadows; SHA-256 `47360190d13d94fe2247060840519eb3e1b23c405569d23c7154952988ef7cd2`. Dibaca penuh 1 / dilihat sekilas 0 / tidak dibuka 0 dari 1 file: teks 213/213 halaman, Main 1–107 dan Raka 108–213; Main membuka ulang lokasi yang menopang usulan. Urutan: pendahuluan/metode, aktivitas, debrief, sumber, penutup. Nomor halaman berikut adalah halaman fisik PDF. Main memeriksa render sembilan halaman; matriks h.16 dan diagram yang dirujuk h.39,77,132,169 tidak terlihat pada render sumber. Cakupan teks penuh tidak berarti seluruh grafik tersedia.
- **R2 — metadata primer:** [situs penulis](https://www.lindaboothsweeney.com/), bagian buku/penulis diperiksa 31 Oktober 2026; mengonfirmasi identitas dan tujuan pendidikan, bukan efektivitas AI. R1 mencantumkan ©1995 tetapi mengutip karya 2008 (h.29); metadata PDF dibuat ulang 2026. Edisi asli salinan ini belum dipastikan.
- **R3 — pembanding primer terbatas:** [MIT ESD.00, Lecture 4, 2011](https://ocw.mit.edu/courses/esd-00-introduction-to-engineering-systems-spring-2011/7271d52202426478111d17535e41ad8e_MITESD_00S11_lec04.pdf), slide 2,4–5 tentang negative feedback; bagian relevan diperiksa, bukan seluruh 26 halaman. Mengoreksi generalisasi osilasi R1.
- **S1 — source terkini:** [decision-review.ts](../../src/learning/decision-review.ts):28–70,85–182,203–271; [decision-projection.ts](../../src/learning/decision-projection.ts); [service.ts](../../src/learning/service.ts):119–129; [host.ts](../../src/ui/src/host.ts):271–276; [pages.tsx](../../src/ui/src/pages.tsx):621–635; [CODEBASE.md](../CODEBASE.md) §5–6. Inspeksi statis, bukan observasi fitur hidup.

## Masalah dan tujuan

R1 mengajarkan urutan pengalaman → pola sepanjang waktu → dugaan struktur → pelajaran (h.11–13,76–79). Pemilihan batas sistem dan horizon mengikuti pertanyaan, bukan kebiasaan pengamat (h.90–94,120–123). Dampak yang terlambat muncul dapat terlewat bila review hanya melihat kejadian terakhir (h.57–59,71,113).

Agent Core sudah menyimpan konteks, prediksi, asumsi, alternatif dan assessment. Celah spesifiknya adalah **panel Decision evidence Native menghilangkan nilai `context` dan `predictions` dari proyeksi**, meskipun sumbernya tetap tersimpan. Reviewer panel tidak melihat batas/horizon yang telah dideklarasikan. API eksternal mengembalikan `records` lengkap (S1, service:128); ini bukan kekurangan penyimpanan atau penalaran seluruh sistem.

Tujuan V1: membuat frame dan prediksi yang sudah ada terlihat secara ringkas sebelum reviewer menafsirkan hasil. Tidak mengklaim waktu observasi sudah cukup atau hubungan sebab telah terbukti.

## Bukti dan ketidakpastian

**Observed:** S1 menerima maksimal 12 atribut konteks dan 8 prediksi; deklarasi immutable, assessment append-only. Projector mempertahankan tiga record/4.096 byte, meredaksi teks, mengikat task/workspace dan menyatakan `controller-declared` serta `goalVerification=not-established`. Nilai konteks/prediksi tidak diproyeksikan. Evaluator sudah memisahkan outcome tool, oracle dan atribusi kausal; tidak ada bukti kesalahan klasifikasi yang harus diperbaiki.

**Inferred:** menampilkan frame dapat membantu audit keputusan sistemik. **Unknown:** frekuensi kehilangan informasi yang merugikan pengguna, kepatuhan model memilih horizon, dan manfaat pada hasil tugas. Deklarasi horizon bukan pengukuran durasi dampak; `assessedAt` hanya waktu assessment.

Hitung ulang data R1 memakai skrip aritmetika mandiri di memori, tanpa menjalankan kode referensi:

| Lokasi | Pemeriksaan | Hasil |
| --- | --- | --- |
| h.139–140 | `2^29 = 536.870.912`; 1 cm dikali itu = 5.368,70912 km = 3.335,96119 mil | `reproduced` untuk >5.000 km; `contradicted` untuk >3.400 mil. Input alternatif 0,4 inci menghasilkan 3.389,33657 mil; pembulatan berantai buku melewati ambang. |
| h.161 | Klaim umum balancing loop berosilasi; pembanding `x' = x + 0,5(1-x)`, mulai 0 | 0,5; 0,75; 0,875; 0,9375: mendekati target tanpa osilasi. Generalisasi `contradicted`; selaras R3. |

Angka efektivitas, persentase peserta, kecepatan permainan dan manfaat organisasi tetap **klaim referensi / not checked**; tidak menjadi dasar manfaat lokal. Kredibilitas R1 **moderat sebagai manual metode**, terbatas untuk ketepatan numerik dan lemah sebagai bukti kausal manfaat AI. Konflik diselesaikan dengan mengambil prosedur yang dapat diperiksa, bukan mengadopsi hukum dinamika dari metaforanya.

| Lensa | Temuan dan pengaruh |
| --- | --- |
| Semantik | Batas, interdependensi dan jeda (R1 h.57–59,71,90): memperjelas pertanyaan review. |
| Prosedural | Cerita → pola → struktur → pelajaran; prediksi mendahului observasi (h.11–13,161–162): donor utama. |
| Negatif | Salah ambang mil dan generalisasi osilasi: penjelasan menarik bukan oracle. |
| Strategi | Aktivitas sederhana membuat asumsi terlihat; pemilihan frame mengikuti tujuan (h.120–123). |
| Kredibilitas | Penulis/sumber dapat dikenali, tetapi testimonial tanpa data kontrol; R2 hanya konfirmasi identitas. |
| Freshness | ©1995 bukan umur seluruh isi; kontak/angka lama tidak diimpor. |
| Absence | Tidak ada kontrak agent, grant, retensi, pembatalan atau bukti transfer AI. |
| Medium | Teks terbaca; grafik sampel hilang dari PDF, sehingga tidak direkonstruksi sebagai fakta. |
| Environment fit | Windows, satu operator, Learning/Native existing: proyeksi lokal cocok; permainan kelompok tidak dipindahkan. |
| Cost/reversibility | Tambahan read model/UI kecil; batas output tetap; rollback tanpa migrasi. |
| Triangulasi | S1 membantah kebutuhan schema baru; R3 membatasi osilasi; arsip inquiry sudah menutup sebagian besar mekanisme. |
| Transfer | Frame/prediksi → context/predictions Learning; pengalaman tubuh/kelompok tidak setara reasoning AI. |
| Intent | Pengguna meminta proposal saja; tidak mengaktifkan temuan, menjalankan eksperimen atau mengubah Skill. |
| Bebas: keterlihatan | Data tersimpan belum tentu terlihat reviewer: gap berada pada projector/panel, bukan store. |

**Peta dukungan V1:** Prosedural, Semantik, Environment fit, Triangulasi dan Keterlihatan mendukung; Kredibilitas, Medium, Transfer dan Cost membatasi. Bukan kandidat `single-lens`. Profil nilai R1: **method + cautionary + vocabulary**, dominan Prosedural/Negatif. Berikutnya yang paling berguna: edisi dengan grafik utuh dan satu record keputusan nyata yang frame-nya hilang di panel.

Lima pertanyaan mind-control: (1) Yang diketahui adalah omission projector, bukan kegagalan reasoning. (2) R1 dan S1 mendukung keterlihatan; API eksternal lengkap menentang perluasan global. (3) Rival terkuat adalah membaca record lengkap/summary tanpa perubahan. (4) Pembeda: record berisi horizon tetapi panel tidak memperlihatkannya; proyeksi kandidat harus menampilkannya tanpa menghilangkan bukti inti. (5) Batalkan V1 jika frame ternyata sudah terlihat atau tidak diperlukan untuk kasus konkret.

Rekaman **T1**:

- **Claim:** V1 proyeksi frame/prediksi saja, memakai record existing.
- **Observed:** field tersimpan; projector/panel mengabaikannya (S1).
- **Inferred:** review mungkin lebih dapat diaudit; manfaat hasil tugas belum diketahui.
- **Rival:** summary dan pembacaan `records` cukup, terutama bagi eksternal.
- **Test:** source/caller review dan aritmetika sudah dilakukan; correctness fixture/UI/live masih rencana.
- **Flip condition:** kasus konkret tidak memerlukan frame tambahan atau batas 4 KiB memotong bukti inti; pilih no-op. Keyakinan kuat pada omission source, lemah pada manfaat perilaku.

Rekonstruksi **T2, disclosure**: (1) konteks dapat memuat data privat; (2) `#aux` membaca record tidak mengizinkan perluasan audience; (3) `#aux` field yang tersedia belum tentu aman ditampilkan mentah; (4) kesimpulan: gunakan binding task/session/workspace, redaksi dan escaping existing. Keberatan: ringkasan tambahan dapat membocorkan data atau tampak seperti fakta; jawab dengan allowlist, label deklaratif, tes sumber asing/teks sensitif dan output terbatas. Tidak ada grant baru.

## Mekanisme dan owner existing yang dipakai

**V1 tunggal, ujung ke ujung:** perluas `projectDecisionEvidence` dan tipe/render panel existing untuk menampilkan maksimal dua konteks (`attribute`, `current`, `basis`, `compatibility`) serta maksimal dua prediksi dari record yang sama, dengan ID dan jenis targetnya. Urutan deklarasi dipertahankan; bila lebih banyak, tandai terpotong. Batas sistem/horizon terlihat bila memang sudah dinyatakan sebagai konteks; tidak menambahkan field atau nama atribut wajib pada schema canonical.

Contoh dokumentasi: batas “perubahan recall pada task ini”; horizon “periksa hasil pada tugas penggunaan berikutnya yang diotorisasi”; prediksi “jawaban sesuai input diketahui”, dengan evidence/check existing bila tersedia. Jangan menambah atribut `context` semata untuk tampilan: evaluator memakai compatibility-nya untuk applicability/suggestedControl (S1:95–98). Frame penalaran murni dapat memakai `inquiry.assumptions` yang sudah terlihat. Jangan menduplikasi frame atau mengarang compatibility agar tampil; V1 hanya memproyeksikan data yang ada dan tidak memulai tugas berikutnya.

Konteks `basis`, refs dan prediksi bersumber dari deklarasi immutable; summary/findings tetap assessment. Projector hanya membaca; `LearningService`, route detail percakapan dan panel existing menjadi jalur tunggal. Tambahkan contoh di dokumentasi keputusan existing saat implementasi, tanpa instruksi wajib pada semua prompt dan tanpa revisi Skill.

**Polyglot:** TypeScript owner Learning + React cukup untuk transformasi/read model ini. Worker Python/Rust atau perubahan C# launcher tidak memberi kebutuhan fungsional tambahan; biaya IPC/deployment tidak sepadan. Python hanya dipakai membaca dan menghitung data studi.

## Scope, batas Native, risiko dan otorisasi

Rekomendasi **V1 saja**: projector → tipe UI → render → dokumentasi/acceptance. Ikat pada jalur detail Native existing; eksternal tetap memakai API keputusan existing. Tidak ada parser tanggal, `notBefore`, perhitungan kematangan, scheduler, diagram editor, Memory/store kedua, perubahan calibration/outcome, aktivasi Skill atau promosi otomatis. Kegagalan/efek buruk yang sudah diamati tetap dilaporkan segera. Hasil beberapa perubahan bersamaan tanpa kontras terisolasi tetap `confounded`.

Overlap: [Kualitas Investigasi](../history-agent-core/Kualitas-Investigasi-dan-Keputusan-Agent-Core.md) sudah mencakup inquiry/proyeksi; V1 hanya melengkapi omission konteks/prediksi. [Contoh Berangka](Contoh-Berangka-dan-Eval-Skill.md) tetap pemilik usulan konvensi Skill, tidak diduplikasi. Pencarian istilah/judul pada proposals, history, CODEBASE, sumber Skill dan canonical Memory tidak menemukan studi identik dalam hasil yang diperiksa; bukan audit seluruh repositori/Cortex.

In-flight: status/log lima commit diperiksa; HEAD bergerak dari `e7ce7c7` ke `0e01f63` selama studi. Perubahan existing `tests/memory/memory-cognitive-maintenance.test.ts` bukan milik task ini. Proposal Goal mode/recall masih mempunyai scope terbuka; jangan memasukkan patch controller/kompaksi ke V1 atau menyatakan acceptance Native keseluruhan selesai.

## Manfaat yang diharapkan dan keterbatasan

**Harapan:** reviewer dapat membedakan konteks, waktu pengamatan yang dimaksud, prediksi dan hasil; salah membaca sukses tool sebagai dampak sistemik lebih mudah dikritik. Tidak ada manfaat akurasi, kecepatan atau penghematan yang terbukti. Perubahan ini tidak membuat model otomatis memahami sistem atau menjamin horizon tepat. Risiko utama: metadata deklaratif terlihat seperti fakta dan tambahan teks menyingkirkan bukti penting.

## Acceptance, evaluasi dan rollback

Setelah V1 disetujui, pemeriksaan correctness saja:

1. Pakai satu record input-diketahui dengan dua konteks, prediksi, assessment teknis sukses dan dampak belum diamati. Nilai deklarasi terlihat; tidak muncul klaim dampak terverifikasi, kematangan atau kausalitas. Tanpa frame, record lama tetap terbaca.
2. Perluas pemeriksaan sempit di `tests/decision-projection.test.ts` dan panel UI terkait: exact task/workspace/session, sumber asing, redaksi/escaping, multibyte, maksimal tiga record/4.096 byte dan truncation. Field baru tidak boleh diam-diam menggusur asumsi/findings/sumber; prioritaskan isi existing dan nyatakan omission. Tidak ada kode produksi yang bergantung pada file tes.
3. Jalur deklarasi → persistence → detail percakapan → panel tetap memakai owner existing. Uji hidup satu input diketahui pada Native setelah build/aktivasi yang diotorisasi terpisah; bandingkan isi panel dengan record, termasuk baca ulang percakapan. Tidak ada benchmark atau eksperimen provider berulang.
4. Rollback: kembalikan projector, tipe/render dan contoh dokumen melalui commit terarah. Record canonical tidak berubah sehingga tidak ada migrasi, penghapusan history atau feature flag baru. Bila kebutuhan tampilan tidak terbukti, hentikan V1 sebagai no-op.

## Riwayat revisi

- Revisi 1, 31 Oktober 2026: studi teks 213 halaman, pemeriksaan render/source, pembanding primer dan hitung ulang. Rival memenangkan pemilihan proyeksi saja; schema kematangan/engine kausal dikeluarkan. Hanya proposal ditulis; versi produk, source, CODEBASE dan changelog implementasi tidak diubah karena belum ada implementasi.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT.

Scope yang direkomendasikan: **V1 proyeksi batas sistem, horizon pengamatan dan prediksi pada panel bukti existing, berikut dokumentasi dan acceptance ujung ke ujung**. Persetujuan proposal berbeda dari pelaksanaan, aktivasi dan manfaat terverifikasi. Permintaan saat ini selesai pada dokumen proposal.
