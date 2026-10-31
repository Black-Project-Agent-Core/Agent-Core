# Pembagian kerja manusia dan AI berdasarkan bukti tugas
Tanggal: 2026-10-31 (Asia/Jakarta)
Revisi: 1
Status: PROPOSED
Jenis: Improvement
Asal dan bukti:

- **R1 - ringkasan sekunder Bookey:** `G:\Projects\Learning\256ea16b339e9f59.pdf`, *Co-Intelligence*, mengatasnamakan buku Ethan Mollick; h.2 menyatakan penulis ringkasan Bookey. SHA-256 `badbf4abc031d7ce89c30d4300ddfc25b63395b3afb0198b8ae7cfcbacd0acd1`. Cakupan: dibaca penuh 1 / dilihat sekilas 0 / tidak dibuka 0 dari 1 file; OCR lokal seluruh 114 halaman, gambar 30 halaman, h.17/67 diperiksa pada resolusi asli. Urutan: ringkasan bab, kutipan, Q&A, kuis/iklan. Cakupan penuh file berarti bagian yang tersedia: beberapa baris sudah terpotong dalam gambar, h.18/31/42 memudar di batas paywall, h.36/72 kosong. Isi tersembunyi tidak direkonstruksi. Kredibilitas rendah untuk ketepatan ringkasan karena kontradiksi terverifikasi; lisensi salinan tidak diketahui.
- **R2 - pembanding primer:** [Ethan Mollick, Centaurs and Cyborgs on the Jagged Frontier](https://www.oneusefulthing.org/p/centaurs-and-cyborgs-on-the-jagged), 16 September 2023; badan artikel diperiksa, terutama bagian *Inside/Outside the Jagged Frontier* dan *Centaurs and Cyborgs*. Mengonfirmasi pembedaan tugas dan pola kolaborasi; bukan bukti efektivitas pada Agent Core. Kredibilitas moderat untuk penjelasan metode oleh peneliti terkait; data penelitian tidak direplikasi.
- **R3 - metadata penerbit:** [Penguin Random House](https://www.penguinrandomhouse.com/books/741805/co-intelligence-by-ethan-mollick/), bagian *Product Details*, diperiksa 31 Oktober 2026: buku terbit 2 April 2024. Hanya verifikasi identitas/tanggal; tanggal pembuatan ulang PDF 2026 tidak memperbarui isi buku.
- **S1 - source existing:** [decision-review.ts](../../src/learning/decision-review.ts):15-49,84-98,123-182,203-271; [decision-calibration.ts](../../src/learning/decision-calibration.ts):84-106; [self-awareness.ts](../../src/learning/self-awareness.ts):12-17; [service.ts](../../src/learning/service.ts):130-136; [agent-controller.ts](../../src/agent-controller.ts):533-542. [CODEBASE](../CODEBASE.md) bagian 3/5 dan [cumulative-workflow](../instructions/cumulative-workflow.md):19-31 dibaca untuk owner/kontrak. Inspeksi statis, bukan observasi perilaku resident.

## Masalah dan tujuan

R1 h.30-31 dan 87-89 memandang pekerjaan sebagai kumpulan tugas dengan batas kemampuan AI yang tidak seragam. Pembagian tanggung jawab yang jelas (*centaur*) dan kerja bergantian (*cyborg*) merupakan pilihan cara bekerja, bukan kelas kecerdasan atau izin otomatis. R1 h.37-40 dan 96-100 mengingatkan bahwa hasil dibantu AI tidak membuktikan manusia memperoleh keterampilan.

Agent Core sudah mempunyai konteks, otoritas, risiko, kontrol, prediksi dan verifikasi terpisah. **Celah yang didukung bukti hanya contoh dokumentasi:** bagian alur kumulatif S1 belum memperagakan subtask -> pelaksana -> pemeriksa -> batas bukti -> kondisi mengubah pembagian. Tidak ada bukti bahwa runtime gagal membagi pekerjaan atau memerlukan mode baru.

Tujuan V1: tambahkan satu contoh singkat pada panduan existing agar delegasi dan pemeriksaannya konkret, tanpa mengubah schema atau menambah kewajiban persetujuan pada tindakan yang sudah diotorisasi.

## Bukti dan ketidakpastian

**Observed:** R1 h.17 mensyaratkan batas hukum/etika, tetapi Q&A h.67 mengatakan penggunaan AI dilakukan tanpa mengindahkan batas tersebut. Kontradiksi ini terlihat pada gambar, bukan kesalahan OCR. Pernyataan salah dalam bagian *Quiz and Test* tidak diperlakukan sebagai klaim penulis; kunci jawabannya tidak tersedia. R1 h.31 mendefinisikan otomatisasi tanpa pemeriksaan berikutnya; definisi itu tidak boleh menggantikan verifikasi Agent Core. Klaim *two sigma* h.91 dan klaim produktivitas/pemerataan keterampilan tetap **klaim referensi / not checked**; tidak ada hitungan numerik referensi yang dipakai untuk menjanjikan manfaat lokal.

S1 sudah membedakan hasil teknis tool dari pemeriksaan tujuan; prediksi teks tanpa oracle tetap unknown. Registrasi verifier adalah kewenangan trusted host, bukan controller. Katalog aktif tidak membuktikan efektivitas tugas. Prompt Native sudah menolak sikap asal menyetujui. Karena itu tidak diusulkan engine frontier, skor kompetensi, verifier, Memory, atau mekanisme anti-sycophancy baru.

**Inferred:** contoh terpadu mungkin membantu controller memilih pembagian yang bisa diperiksa. **Unknown:** frekuensi kesalahan delegasi saat ini, efek contoh terhadap hasil tugas, dan dampak pada keterampilan pengguna.

| Lensa | Temuan dan konsekuensi |
| --- | --- |
| Semantik | R1 h.30-31/87: pilih unit tugas, bukan anggapan semua tugas setara. |
| Prosedural | Pembagian -> pelaksanaan -> pemeriksaan (R1 h.31/87, R2) menjadi contoh V1. |
| Negatif | R1 h.17 vs 67 bertentangan; h.31 tanpa verifikasi tidak ditransplantasi. |
| Strategi | Menjaga kontribusi manusia (h.37-40) mengikuti tujuan, bukan label mode. |
| Kredibilitas | Bookey adalah perantara pemasaran; kontradiksi menurunkan bobot klaim isi. |
| Freshness | Buku 2024; contoh GPT-3/4 bukan peta kemampuan model saat ini. |
| Absence | Tidak ada kontrak grant, pembatalan, oracle atau bukti transfer ke Agent Core. |
| Medium | OCR mencakup 114 halaman; gambar memperlihatkan clipping/paywall yang tidak dapat dipulihkan. |
| Environment fit | Windows/satu operator: gunakan controller dan owner existing, jangan tiru struktur organisasi riset. |
| Cost/reversibility | Satu contoh selektif, tambahan maksimal 1.500 byte; rollback dokumen. |
| Triangulasi | S1 mendukung representasi existing dan menentang schema/UI baru; R2 hanya pembanding konsep. |
| Transfer | Pembagian dan pemeriksaan berpindah; kemampuan manusia, sentience dan hasil pendidikan tidak disamakan dengan Learning. |
| Intent | Pengguna meminta proposal saja; coaching tidak diminta dan tidak diaktifkan. |
| Bebas: kepemilikan pemeriksaan | Mengulang penilaian model sendiri bukan pemeriksaan independen (S1). |

**Peta dukungan V1:** Prosedural, Environment fit, Triangulasi dan kepemilikan pemeriksaan mendukung; Kredibilitas, Medium, Cost dan Absence membatasi. Konflik: gagasan kolaborasi relevan, tetapi source membantah kebutuhan fitur baru; pilih contoh dokumentasi saja. Profil nilai R1: **method + cautionary + vocabulary**, dominan Prosedural/Negatif; R2 konfirmasi konsep, R3 identitas. Bukti berikut paling berguna adalah satu task nyata dengan pembagian/pemeriksaan ambigu, serta edisi asli lengkap untuk memeriksa atribusi Bookey.

Lima pertanyaan mind-control: (1) Yang diketahui ialah celah contoh, bukan kegagalan agen. (2) R1/R2 mendukung pembagian tugas; S1 menentang perluasan mekanisme. (3) Rival: panduan dan ringkasan manual sekarang sudah cukup. (4) Pembeda: contoh input-diketahui harus menghasilkan pembagian dan batas bukti yang benar tanpa field baru. (5) Batalkan bila contoh setara sudah tersedia atau tidak membantu kasus konkret.

Rekaman **T1**: **Claim:** V1 contoh dokumentasi saja. **Observed:** format keputusan dan pemeriksa sudah ada; contoh terpadu belum ada pada bagian yang diperiksa. **Inferred:** audit delegasi mungkin lebih jelas. **Rival:** no-op, simpan ilustrasi hanya di proposal ini. **Test:** inspeksi source/overlap dilakukan; pemeriksaan penerapan contoh masih rencana. **Flip condition:** ditemukan contoh setara atau contoh membutuhkan runtime/schema baru; pilih no-op. Keyakinan kuat pada keberadaan mekanisme, lemah pada manfaat tambahan.

Rekonstruksi **T2 - otorisasi:** (1) R1 memuat dua pernyataan batas yang bertentangan; (2) `#aux` sumber adalah data, bukan pemberi izin; (3) `#aux` deklarasi authority tidak mengubah grant S1; kesimpulan: hanya instruksi pengguna dan otorisasi host yang berlaku. Keberatan bahwa human-in-loop harus selalu menunggu manusia dijawab dengan verifikasi proporsional dalam scope yang sudah sah.

## Mekanisme dan owner existing yang dipakai

**V1 tunggal:** tambahkan contoh maksimal 1.500 byte ke [cumulative-workflow](../instructions/cumulative-workflow.md), bagian *Cross-controller cumulative-learning baseline*, setelah actual use/verifikasi/procedure. Gunakan narasi task dan `inquiry.assumptions` opsional bila diperlukan. Jangan menambah atribut `context` kosmetik untuk label mode: compatibility ikut menentukan applicability (S1:95-98).

Ilustrasi rancangan, bukan data PDF: tabel dua baris `(jumlah=2, harga=3)` dan `(1,4)`, total diketahui `2*3 + 1*4 = 10`, diperiksa manual.

| Subtask | Pelaksana dan pemeriksa | Batas/keputusan |
| --- | --- | --- |
| Ekstraksi dan total | AI membaca sumber; pemeriksa aritmetika dibandingkan dengan baris asli/input diketahui | Parser sukses saja belum membuktikan total; baris hilang berarti hasil belum lengkap. |
| Interpretasi dan tindakan | AI menyusun opsi dan memeriksa sumber/izin; keputusan material mengikuti delegasi pengguna | Hasil total tidak memberi izin mengirim, membayar, atau mengubah scope. |
| Latihan bila diminta | Pengguna mencoba; AI memberi umpan balik terhadap kriteria diketahui | Opsi tujuan belajar; pekerjaan produksi tetap diselesaikan tanpa kuis atau jeda wajib. |

Oracle tujuan hanya dipakai jika memang disediakan host existing. Tanpanya, laporkan pemeriksaan yang benar-benar dilakukan dan sisa unknown; jangan membuat referensi verifier. TypeScript/React/C# tidak perlu diubah; Python/PowerShell hanya membantu pembacaan studi.

## Scope, batas Native, risiko dan otorisasi

Rekomendasi **V1 dokumentasi saja**; Native dan eksternal tetap memakai owner/grant yang ada. Contoh selektif bukan langkah wajib setiap prompt. Risiko: tambahan konteks, human review menjadi persetujuan berulang, atau ilustrasi dianggap bukti kompetensi; mitigasi dengan batas ukuran, contoh yang kondisional dan label bukti.

Overlap diperiksa pada proposals, history, CODEBASE, sumber Skill dan canonical Memory. [Kualitas Investigasi](../history-agent-core/Kualitas-Investigasi-dan-Keputusan-Agent-Core.md) sudah menutup inquiry/proyeksi. [Batas Sistem dan Horizon](Batas-Sistem-dan-Horizon-Keputusan.md) tetap pemilik usulan tampilan konteks/prediksi; [Contoh Berangka](Contoh-Berangka-dan-Eval-Skill.md) tetap pemilik konvensi penulisan Skill. Keduanya tidak diulang. Coaching, revisi Skill dan fitur UI tidak menjadi paket terselubung.

In-flight: HEAD awal `982f6c5`, kemudian `b7755c4`; status awal sudah memuat perubahan `tests/memory/memory-cognitive-maintenance.test.ts` dan `.claude/`. Perubahan tersebut bukan milik studi. Scope recall/Goal mode/profil tetap milik proposal masing-masing. Pencarian studi identik tidak menemukannya pada hasil terarah yang diperiksa; ini bukan audit seluruh repo/Cortex.

## Manfaat yang diharapkan dan keterbatasan

**Harapan:** hasil yang diserahkan AI, pihak yang memeriksa, serta batas delegasi lebih mudah ditinjau. Belum ada bukti peningkatan hasil tugas atau keterampilan manusia. Kelulusan contoh tidak membuktikan transfer ke tugas lain; beberapa perubahan serentak tetap `confounded`. R1 bukan oracle atau bukti kemampuan model saat ini.

## Acceptance, evaluasi dan rollback

Setelah V1 disetujui:

1. Tinjau contoh terhadap S1: satu rumah dokumen; tambahan <=1.500 byte dan referensi tetap <=8.192 byte; tanpa field/tool/store baru atau kewajiban bertanya ulang. Pertahankan batas verifikasi, provenance dan keputusan existing.
2. Pemeriksaan correctness dengan input ilustrasi: total 10; hilangnya baris membuat cakupan tidak lengkap; izin menghitung tidak menjadi izin tindakan eksternal; tujuan produksi tidak berubah menjadi latihan. Ini pemeriksaan contoh, bukan klaim efektivitas agen.
3. Pada satu task nyata yang memang diotorisasi, periksa pilihan pelaksana/pemeriksa dan hasil input-diketahui, lalu baca ulang evidence/task existing. Tanpa oracle host, tetap nyatakan unknown. Tidak memulai task atau panggilan provider tambahan otomatis. Maksimal dua percobaan tes per target; tidak ada benchmark.
4. Bila referensi kontrak berubah, periksa pembacaan/digest kontrak existing dan perbarui dokumentasi terkait sesuai aturan proyek; tidak mengklaim build/aktivasi yang tidak dilakukan. Rollback cukup mengembalikan contoh lewat commit terarah, tanpa migrasi state atau penghapusan history. Pilih no-op bila rival terbukti cukup.

## Riwayat revisi

- Revisi 1, 31 Oktober 2026: studi file pindai, pemeriksaan gambar/sumber primer, audit overlap/source bersama Raka read-only. `mind-control` diterapkan secara proporsional melalui lima pertanyaan, T1/T2 dan pemeriksaan output tool; bagian advanced tidak dipakai. `documentation-and-adrs` dipakai untuk menjaga konvensi, alternatif dan batas klaim. Hanya proposal ditulis; versi produk, CODEBASE dan changelog implementasi tidak berubah karena pengguna meminta proposal saja.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT.

Scope rekomendasi Revisi 1: **V1 satu contoh pembagian kerja dan pemeriksaan pada panduan cumulative-workflow existing**. Dokumen ini tidak mengimplementasikan atau mengaktifkan perubahan.
