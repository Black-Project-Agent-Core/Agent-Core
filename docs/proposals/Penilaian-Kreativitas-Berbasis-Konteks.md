# Penilaian kreativitas berbasis konteks
Tanggal: 2026-10-31
Revisi: 1
Status: PROPOSED
Jenis: Improvement
Asal dan bukti: R1, paper primer Kühn dkk., The Importance of the Default Mode Network in Creativity—A Structural MRI Study, Journal of Creative Behavior 48(2), 152–163 (2014), DOI [10.1002/jocb.45](https://doi.org/10.1002/jocb.45), berkas [127210.pdf](../../../Learning/127210.pdf), SHA-256 `65c5bb708e1d7daf00043b5965875f2e1d5175363940b34377815748b4f58d52`. Kredibilitas moderat untuk asosiasi pada sampelnya, lemah untuk sebab-akibat dan transfer ke AI. Cakupan referensi pengguna: **dibaca penuh 1 / dilihat sekilas 0 / tidak dibuka 0 dari 1 file**; teks dan render seluruh 13 halaman diperiksa, termasuk sampul, tiga tabel, Gambar 1, daftar pustaka dan catatan penulis. Urutan: identitas → argumen → metode/rumus → hasil/gambar → diskusi/bibliografi. Penelusuran tambahan R2–R3 dan sumber Agent Core bersifat terarah, bukan pembacaan seluruh literatur atau repositori.

## Masalah dan tujuan

Agent Core sudah memiliki alur divergent–convergent pada `idea-refine`. Yang belum eksplisit dalam dua berkas rubrik yang diperiksa ialah pemisahan jumlah kandidat, keragaman kategori, kebaruan relatif suatu pembanding, dan kualitas/kegunaan. Differentiation sekarang terutama berarti alasan pengguna beralih produk. Akibat yang mungkin terjadi ialah kandidat tampak kreatif karena banyak, berbeda kata, atau tidak biasa, tanpa penjelasan bahwa ia berguna dan memenuhi batas tugas. Ini **risiko metode**, bukan kegagalan runtime yang telah diamati.

Tujuan usulan: memperjelas penilaian di fase evaluasi Skill existing dengan bukti dan batas pembanding, sehingga pengguna dapat memeriksa mengapa suatu kandidat dipilih. R1 menyumbang metode pengukuran dan peringatan terhadap analogi biologis. Temuan struktur otak tidak menjadi spesifikasi engine, scheduler, atau model kedua.

## Bukti dan ketidakpastian

**R1 — jejak pembacaan lengkap.** Nomor halaman berikut memakai halaman jurnal; halaman fisik = halaman jurnal − 150.

| Bagian | Isi yang diperiksa dan batas kesimpulannya |
|---|---|
| Sampul fisik 1 | Versi penerbit, repositori Radboud, handle 2066/127210, unduhan 2026-10-30, ketentuan artikel 25fa. Tanggal unduh bukan tanggal penelitian baru. |
| 152–154 | Hipotesis DMN, kontrol kognitif dan proses tidak sadar; kreativitas mencakup novelty dan quality. Dibandingkan studi Jung: ketebalan korteks vs VBM, scanner 1,5T vs 3T, serta penilaian/ranking berbeda. Narasi ketebalan korteks di abstrak bukan ukuran aktual studi ini. |
| 155–156 | 21 relawan sehat, 16 perempuan/5 laki-laki, tangan kanan, usia rerata 21,33 (SD 1,85; 19–25); persetujuan etik/informed consent. MRI struktural dengan mata tertutup, kemudian AUT di luar scanner: kegunaan satu batu bata selama dua menit, tanpa contoh untuk mengurangi pengarahan ide. Tidak ada manipulasi tidur, incubation, atau tingkat kontrol. |
| 156 | Akuisisi T1 MPRAGE 3T, voxel 0,9 mm isotropik; resampling 1 mm, segmentasi/normalisasi/modulasi VBM8/SPM8, smoothing 8 mm. Regresi seluruh otak dengan kovariat jenis kelamin, usia, volume otak; ambang voxel p<0,001 dan koreksi extent/nonstationary menurut penulis. Mengukur volume gray matter, bukan aktivitas DMN. |
| 156–157 | Flexibility = jumlah kategori berbeda, bukan jumlah perpindahan urutan. Uniqueness berasal dari frekuensi ide dalam kumpulan jawaban, dibalik dengan 1−rerata. Creativity = rerata rating dua penilai, skala 1–5, kemudian rerata antaride. Kedua reliabilitas dilaporkan α=0,93. Membagi dengan jumlah ide menghilangkan penjumlahan mekanis, tidak membuktikan independensi statistik dari fluency. |
| 157 | Rerata (SD; rentang): flexibility 4,64 (1,58; 2–8), uniqueness 0,90 (0,04; 0,82–0,98), creativity 2,43 (0,64; 1,30–3,75). Ini laporan penulis; data individual tidak tersedia dalam PDF untuk menghitung ulang. |
| 158–159, Tabel 1–3/Gambar 1 | Berturut-turut 5/5/4 klaster positif. Tabel 1: vmPFC, rTPJ, rSFG, rITG, insula kiri; Tabel 2: vmPFC, precuneus, frontal pole kiri, thalamus kiri, insula kiri; Tabel 3: vmPFC, rTPJ, precuneus kiri, insula kiri. Gambar: merah creativity, biru uniqueness, hijau flexibility; penulis menekankan overlap vmPFC. Nama wilayah bersama/overlay bukan replikasi independen atau uji conjunction yang dilaporkan terpisah. Z-score bukan koefisien korelasi atau persen manfaat. Tidak ada klaster negatif yang lolos menurut penulis. |
| 159–160 | Kesimpulan tentang sumber daya neural dan proses kurang terkontrol merupakan interpretasi. Arah hubungan diakui belum jelas; dugaan dua arah dan manfaat training bukan hasil intervensi studi ini. Hasil melibatkan kedua hemisfer, sehingga tidak mendukung resep “otak kanan”. AUT hanya potensi divergent thinking pada satu domain; penulis sendiri meminta pengujian domain lain. Tekanan untuk kreatif dan pembelajaran implisit dibahas sebagai implikasi, bukan diuji di sini. |
| 161–163 | Seluruh daftar pustaka, afiliasi, korespondensi dan catatan kontribusi setara dibaca. Sumber yang dikutip di daftar itu tidak otomatis dianggap telah dibaca atau direplikasi. Tahun terbit isu 2014; copyright tercetak 2013. |

**Audit angka/rumus, menggunakan data saja di luar repositori.**

| Pemeriksaan | Hasil dan status |
|---|---|
| Komposisi dan contoh kategori | 16+5=21; tiga kegunaan dalam kategori membangun → 1, tiga kategori berbeda → 3: **reproduced**. |
| Uniqueness | Formula tertulis: `U = 1 − (Σ f(ide)/N) / m`, N = seluruh ide yang disebut dan m = jumlah ide peserta. Contoh sintetis kumpulan A,B,A,A,C,D: peserta A,B → 0,6667; C,D → 0,8333: **reproduced untuk rumus**, bukan skor peserta asli. Angka berubah jika kumpulan pembanding berubah; bukan ukuran kebaruan universal. |
| Rerata creativity | Dua ide dengan rating (2,4) dan (4,4) → (3+4)/2=3,5: **reproduced untuk rumus**, bukan data R1. Keunikan tidak otomatis membuktikan kegunaan. |
| Tiga tabel | 5+5+4=14 baris; jumlah extent per tabel 2.514/3.022/1.345: **reproduced sebagai checksum**, bukan volume gabungan karena klaster antaranalisis dapat bertumpang tindih. Seluruh Z 3,51–5,25; ekor normal satu sisi terbesar ≈0,000224, konsisten dengan ambang voxel: **reproduced hanya pemeriksaan numerik**, bukan validasi koreksi seluruh otak. Koordinat negatif diperiksa pada render karena ekstraksi teks kehilangan beberapa tanda minus. |
| Penjelasan korelasi negatif, 157 | Teks mengatakan skor rendah disertai gray matter lebih sedikit akan menyiratkan korelasi negatif. Arah itu justru positif: **contradicted secara logis**. Ini kesalahan penjelasan, bukan bukti tabel atau hasil negatif sebenarnya terbalik. |
| Statistik empiris | Rerata/SD/rentang peserta, α, fitted VBM, validitas p terkoreksi dan overlap: **not checked: belum direproduksi secara independen**, karena jawaban mentah, rating per penilai, citra, peta statistik dan rincian reproduksi tidak disertakan. Tidak mengonversi Z menjadi r atau ukuran efek AI. |

**Triangulasi primer selektif.** R2, [Beaty dkk. (2014), Creativity and the default network](https://pmc.ncbi.nlm.nih.gov/articles/PMC4410786/), metode §2.2, hasil dan diskusi §4–4.1 dibaca terarah: kelompok terpilih 12+12 dari pool 91 memperlihatkan konektivitas inferior frontal–DMN lebih besar pada kelompok kreatif. Ini asosiasi dan mengingatkan bahwa proses terkontrol serta spontan dapat bekerja sama; bukan replikasi VBM R1 atau bukti menurunkan kontrol AI. R3, [Bartoli dkk. (2024), Default mode network electrophysiological dynamics and causal role in creative thinking](https://pmc.ncbi.nlm.nih.gov/articles/PMC11449134/), metode stimulasi/scoring dan hasil terkait dibaca terarah: 13 pasien, 9 menerima stimulasi; penulis melaporkan originality AUT berkurang, sedangkan variability/flexibility tidak berubah signifikan. Bukti intervensi itu terbatas pada paradigma/pasien manusia dan proxy semantic distance; tidak menguji kegunaan hasil atau arsitektur AI. Statistik R2–R3 tidak direplikasi. Keduanya sumber berbeda, bukan menghitung preprint dan publikasi studi yang sama sebagai dua dukungan.

**Observed — Agent Core saat telaah.**

- [idea-refine/SKILL.md](../../runtime/skills/capability-packs/idea-refine/SKILL.md), Phase 1–2, baris 83–133: sudah menghasilkan 5–8 variasi, mengelompokkan, menilai user value/feasibility/differentiation dan mengungkap asumsi. [refinement-criteria.md](../../runtime/skills/capability-packs/idea-refine/refinement-criteria.md), baris 52–73 dan 94–103: differentiation berorientasi produk; value/feasibility menentukan kuadran, differentiation menjadi tie-breaker. Dua berkas itu byte-identik dengan salinan katalog lokal; metadata katalog mencatat digest `sha256:7d4fb5c5d443034a33aba2a37033c8be09664d4ca0213dce1601488e7a85161d`. Ini pengamatan disk, bukan receipt resident baru.
- [mind-control/references/innovation.md](../../runtime/skills/capability-packs/mind-control/references/innovation.md), baris 12–16, 22–47: audit mekanisme analogi, perbandingan multiobjektif, hard constraints dan falsifier sudah ada. [Capability-Index.md](../Capability-Index.md), baris 78, sudah merutekan ideasi ke `idea-refine`. Tidak perlu fase atau capability baru.
- [rem-consolidation.ts](../../src/memory/rem-consolidation.ts), baris 108–126, 160–174 dan 204–209, serta [service.ts](../../src/memory/service.ts), baris 1078–1110: REM mengelompokkan metadata dan menulis digest ekstraktif dengan validasi revisi sumber; hasil tetap hypothesis/unverified. [Dreaming-Berbantuan-Model.md](Dreaming-Berbantuan-Model.md), Revisi 1, PROPOSED pada commit `4a0b455`, sudah mengusulkan digest abstraktif/diari opsional. R1 tidak menambah dasar untuk menduplikasi atau memperluas paket itu.
- [retrieval-novelty.ts](../../src/memory/evaluation/retrieval-novelty.ts), baris 37–43, 60–80, mengukur jarak vektor keberhasilan query retrieval. Itu bukan kebaruan semantik ide; angka tersebut tidak dipakai sebagai creativity score.
- [SkillService](../../src/skills/service.ts), baris 662–690 dan 1347–1371, sudah memiliki build proposal approved, pemeriksaan drift, aktivasi/readback dan rollback digest. Sumber existing dipakai, tanpa katalog atau store baru.

**Inferred:** rubrik dengan pembanding eksplisit dapat memperjelas alasan seleksi dan mencegah jumlah/keanehan dianggap kualitas. **Unknown:** apakah praktik pengguna saat ini sudah cukup baik, seberapa sering risiko itu terjadi, dan apakah revisi meningkatkan hasil; tidak ada kasus kegagalan atau manfaat kausal yang terverifikasi dalam telaah ini.

| Lensa | Temuan, pengaruh pada keputusan |
|---|---|
| Semantic | R1 153,155–157 membedakan novelty/quality dan tiga ukuran. Membatasi kreativitas sebagai satu angka/jumlah. |
| Procedural | R1 156–157 memisahkan unit ide, kategori, frekuensi dan rerata penilai. Donor utama ialah definisi unit/pembanding, bukan scanner atau pipeline VBM. |
| Negative | Audit di atas menemukan kesalahan arah korelasi dan batas reproduksi. Klaim neural dibatasi; rumus tidak disalin menjadi skor global. |
| Strategy | R1 154–156 membedakan studi terdahulu, menghindari contoh yang mengarahkan, dan memakai satu objek. Adaptasi: rubrik evaluasi sesudah generation existing; contoh uji tidak menjadi kandidat siap pakai sebelum ideasi. |
| Credibility | Primer dengan metode, etik dan tabel, tetapi n kecil/homogen, data mentah tidak disertakan dan ada inkonsistensi narasi. Nilai moderat untuk asosiasi, lemah untuk klaim mekanistik/AI. |
| Freshness | Penelitian 2014; unduhan/metadata 2026 tidak memperbarui hasil. R2–R3 membatasi narasi DMN lawan kontrol yang terlalu sederhana. |
| Absence | Tidak mengukur proses tidak sadar, tidak memanipulasi incubation/tidur, tidak menguji AI atau pemanfaatan produk; kualitas dinilai secara holistik tanpa rubric kegunaan terpisah. |
| Medium | 13/13 teks dan render dibaca; tanda minus tabel diperiksa visual, Tabel 2 diperbesar. Gambar asosiasi anatomis tidak memperlihatkan dinamika proses berpikir. |
| Environment fit | Statistik antarmanusia → model bahasa tidak sepadan; metode penjelasan penilaian dapat diadaptasi pada Windows/satu pengguna lewat Skills existing. |
| Cost/reversibility | Dua berkas Skill existing, tambahan konteks hanya ketika dipilih; tanpa layanan/model/job baru. Biaya token/kognitif aktual belum diketahui; rollback digest tersedia. |
| Triangulation | R2 melengkapi dengan konektivitas, R3 dengan intervensi terbatas; source Skills/REM menghalangi duplikasi. Tidak menyamakan tiga jenis bukti itu. |
| Transfer | Unit ide/kategori/pembanding → rubrik Skill: layak diuji. Gray matter/DMN/tidur → controller, memori atau izin: hubungan mekanistik target tidak tersedia. |
| Intent | Penulis meneliti korelat struktur kreativitas; pengguna meminta studi mendalam dan satu proposal, sehingga hasil berupa keputusan terarah dengan batas bukti. |
| Lensa bebas: validitas konstruk | Kandidat baru tetapi salah/tidak berguna dapat tinggi pada rarity. Banyak parafrasa dapat tinggi pada hitungan. Kedua kasus harus terlihat terpisah dalam penilaian. |

**Support map:** V1 didukung Semantic, Procedural, Negative, Environment fit dan validitas konstruk; dibatasi Credibility, Absence, Cost serta rival no-op. Kandidat engine DMN/incubation didorong hanya analogi Semantic, tetapi ditentang Transfer, Credibility, Triangulation dan owner existing: dikeluarkan. REM berbantuan model dikeluarkan karena overlap proposal existing, bukan dianggap sudah aktif atau telah terbukti bermanfaat.

**Mind-control, lima pertanyaan:** (1) Yang diketahui ialah isi R1 dan rubrik disk yang diperiksa; (2) pemisahan konstruk mendukung V1, rubrik existing dan ketiadaan bukti kegagalan menentangnya; (3) alternatif terkuat ialah menjalankan rubrik existing/innovation dengan baik tanpa revisi; (4) pembeda ialah penilaian input tetap yang transparan pada contoh acceptance; (5) bila baseline menjelaskan seluruh perbedaan itu sama baiknya, pilih no-op.

**T1 — V1.** Claim: pertajam evaluasi kandidat pada Skill existing. Observed: bukti R1 dan berkas di atas. Inferred: penyebutan pembanding dan dimensi terpisah dapat mengurangi kesalahan proxy; manfaat belum diukur. Rival: no-op dengan penerapan rubrik existing yang disiplin. Test: audit rumus sudah dilakukan; pemeriksaan perilaku Skill hanya diusulkan, belum dijalankan. Flip condition: baseline memenuhi acceptance tanpa perubahan atau revisi hanya menambah istilah; keyakinan moderat pada gap representasi, lemah pada manfaat hasil.

**T2 — batas klaim neural:** (1) R1 mengamati asosiasi volume–skor, bukan aktivitas, ketidaksadaran atau intervensi kontrol. (2) `#aux-1` bahwa volume menyebabkan proses tertentu dan `#aux-2` bahwa analogi itu setara secara fungsional dengan controller AI tidak diuji. (3) Maka kesimpulan “kurangi kontrol/otorisasi AI atau tambahkan tidur agar kreatif” tidak mengikuti bukti. Keberatan terkuat: R3 membawa bukti kausal manusia; tetap tidak menguji kedua premis transfer AI itu. Pembalik: mekanisme target serta bukti tugas AI yang relevan, independen dan berizin; belum tersedia.

## Mekanisme dan owner existing yang dipakai

**Satu paket V1 — perjelas rubrik `idea-refine`.** Sesudah fase generation/clustering existing, evaluasi kandidat memakai:

1. **Jumlah dan keragaman:** catat kandidat mentah, kandidat berbeda setelah parafrasa digabung, serta kategori pendekatan beserta alasannya. Fluency/hitungan dan flexibility/kategori tidak disebut ukuran kualitas; hitungan diagnostik, bukan kuota wajib baru.
2. **Kebaruan relatif konteks:** pembanding konkret dari solusi saat ini/prior art yang benar-benar diperiksa, bagian yang berbeda, serta batas pencariannya. Bila pembanding tidak tersedia, tulis unknown; tidak mengklaim “belum pernah ada”. Tidak menghitung rarity dari satu respons model atau menyalin denominator peserta R1.
3. **Kualitas/kegunaan:** hubungan dengan tujuan pengguna, ketepatan substansi, kelayakan dan hard constraints. Ide tidak biasa yang melanggar batas ditolak; ide biasa tetapi berguna tetap boleh menang. Kebaruan bukan syarat universal bagi pekerjaan rutin.
4. **Keputusan yang dapat ditinjau:** kandidat → kategori/pembanding → kebaruan dan kualitas terpisah → bukti/unknown → pilih/tolak/tunda beserta alasan. Tidak perlu bobot, nilai 1–5, persentase atau skor kreativitas gabungan.

Perubahan minimum nantinya hanya Phase 2 pada `idea-refine/SKILL.md` dan penjelasan/contoh pada `refinement-criteria.md`. Tetap gunakan routing existing; referensi dimuat selektif. `mind-control` dipakai ulang untuk unknown, rival, hard constraints dan falsifier, tanpa menggandakan instruksinya. Tidak ada tabel/format yang diwajibkan untuk setiap jawaban nonideasi.

Lifecycle tetap milik SkillService: inspeksi digest aktif saat eksekusi, satu proposal revisi melalui `skills(action=propose)`, review exact revision, lalu build/aktivasi hanya sesuai keputusan pengguna. Tidak menyunting katalog atau state proposal kanonik secara manual.

## Scope, batas Native, risiko dan otorisasi

**Rekomendasi: V1 saja; baseline/no-op diperiksa terlebih dahulu pada input acceptance yang sama.** Jika no-op sudah memenuhi pembeda, tutup usulan tanpa revisi Skill. Jika gap terkonfirmasi, lanjutkan satu revisi Skill melalui lifecycle existing; jangan mengembangkan engine atau evaluasi umum.

Dokumen ini bahan review Improvement melalui fallback lokal, **bukan pengganti record Skill proposal**. Registrasi revisi Skill masih OPEN: contract MCP mengembalikan internal error dan satu probe health timeout. Karena layanan tidak terjangkau, `skills(action=propose)` tidak diulang/dipalsukan; proyeksi `docs/proposals/skills/agent-core` tidak ditulis manual. Persetujuan dokumen ini belum mengaktifkan Skill; revisi/digest formal harus dapat ditinjau sebelum aktivasi.

Kewajiban layanan yang dilewati: pembacaan/acknowledgement contract yang berhasil, inspeksi Memory lewat facade, pembukaan/finalisasi episode Learning baru, checkpoint/review serta receipt penggunaan Skill/artifact. Memory kanonik foundation dan catatan relevan diperiksa lewat filesystem; bukan via layanan. Prosedur `mind-control` diadaptasi dari berkas lokal, termasuk tool-output-trust, bukan diklaim sebagai penggunaan resident ber-receipt. Raka melakukan audit source read-only; lokasi yang menopang rekomendasi dibuka kembali oleh penulis utama.

Otorisasi task saat ini hanya satu dokumen ini dan commit lokalnya. Tidak ada perubahan source/Skill/config, instalasi, aktivasi, provider call uji, penulisan Memory, perbaikan layanan, atau benchmark. Dirty path lama `tests/memory/memory-cognitive-maintenance.test.ts`, `.claude/`, dan `docs/proposals/agents/` berada di luar tugas dan dipertahankan.

Risiko V1: penilaian oleh model yang sama dapat bias, baseline terbatas dapat dianggap kebaruan universal, kategori dapat subjektif, dan rubrik dapat menambah beban konteks. Mitigasi: bukti/pembanding bernama, unknown eksplisit, alasan kategorisasi dan keputusan pengguna; tidak mewajibkan penilai/model kedua. Instruksi keselamatan, tool grants, Native/external boundary serta status hypothesis Memory tetap milik owner existing. Revisi ini tidak memberi izin baru.

## Manfaat yang diharapkan dan keterbatasan

Harapan V1 ialah alasan seleksi lebih jelas dan kandidat tidak dinilai tinggi hanya karena banyak atau aneh. Belum ada bukti peningkatan kreativitas, keberhasilan tugas, atau efek kausal. Acceptance hanya membuktikan keterbedaan penilaian pada contoh yang diketahui; tidak membuktikan transfer umum. Jika prompt, model dan rubrik diubah bersama, atribusi dicatat `confounded`.

Profil nilai R1: **method, cautionary, vocabulary**; donor terkuat berada pada Procedural/validitas konstruk, bukan penyalinan mekanisme neural. R2–R3 memberi pembatas triangulasi, bukan oracle kualitas AI. Bukti berikut yang paling berguna: satu kasus ideasi pengguna dengan tujuan, baseline, kandidat dan hasil pemanfaatan yang dapat diperiksa. Untuk menguatkan klaim MRI diperlukan data/rating/citra serta rincian analisis asli; data itu tidak dipersyaratkan untuk menilai V1 yang sempit.

## Acceptance, evaluasi dan rollback

Semua berikut rencana setelah keputusan scope; belum dijalankan. Gunakan satu input tetap, satu kontrak penilaian dan fixture buatan yang jelas, bukan benchmark atau penilaian diri tanpa bukti.

| Pemeriksaan correctness | Hasil yang harus terlihat |
|---|---|
| Baseline/no-op | Jalankan rubrik existing dahulu. Jika sudah memisahkan unit, pembanding, kebaruan, kualitas dan unknown pada kasus di bawah, hentikan revisi. Keluaran baseline disimpan apa adanya; tidak diturunkan nilainya untuk membenarkan V1. |
| Parafrasa dan kategori | Contoh delapan kandidat berisi lima parafrasa pendekatan A dan tiga pendekatan berbeda B/C/D: laporkan delapan mentah, empat kandidat berbeda, empat kategori bila asumsi kategorinya memang berbeda. Parafrasa tidak mendapat kredit sebagai ide/kategori baru. |
| Biasa, aneh, berguna | Pada kebutuhan “pengingat offline tanpa mengirim data keluar”: A pengingat kalender lokal yang sudah tersedia; B unggah data ke layanan cloud eksperimental; C ringkasan agenda dari data lokal dengan mekanisme berbeda yang dijelaskan. A boleh dipilih karena berguna; B ditolak meskipun berbeda; C hanya calon baru relatif baseline yang disebut, kelayakan belum terbukti ditulis unknown. Tidak memaksakan C menang. |
| Pembanding tidak cukup | Bila hanya solusi saat ini yang diketahui, penilaian membatasi klaim pada solusi itu; prior art global unknown. Tidak memberi skor rarity/persentase kebaruan dari kumpulan kandidat sendiri. |
| Batas tugas dan bukti | Kandidat yang melanggar constraint ditolak; ketepatan/kegunaan tidak diganti semantic distance atau angka novelty retrieval. Tidak melakukan panggilan/penyimpanan di luar izin input. |
| Integritas lifecycle | Jika revisi diperlukan, source/metadata exact digest divalidasi lewat SkillService existing; source drift membatalkan promosi. Readback harus membuktikan revisi yang diputuskan benar-benar aktif sebelum menyatakan aktivasi. |

Satu pemeriksaan hidup yang relevan cukup: tugas ideasi kecil yang memang diminta pengguna melalui jalur Native/eksternal berizin, dengan pembanding diketahui dan review manusia atas alasan pilih/tolak. Tidak meminta dua model, suite eksperimen, angka speedup atau jadwal otomatis. Untuk target tes yang memerlukan perubahan perilaku, paling banyak dua percobaan merah→hijau sesuai Hard Rules; berhenti/minta izin bila masih gagal, bukan mengulang.

Rollback: batalkan paket sebelum aktivasi, atau kembalikan digest Skill sebelumnya melalui `rollbackRevision` existing dengan expected digest dan keputusan yang sesuai. Tidak memerlukan migrasi Memory atau perubahan scheduler. Hasil tugas lama tetap bukti historis; tidak dihapus atau dinilai ulang sebagai run baru. Sebelum implementasi nanti, periksa ulang source/proposal Dreaming dan digest aktif karena dokumen ini hanya snapshot telaah.

## Riwayat revisi

- Revisi 1 — 2026-10-31: telaah penuh R1, pemeriksaan rumus/tabel/render, triangulasi primer terarah dan audit owner/overlap. Mencatat satu paket V1 dengan rival no-op, keterbatasan layanan serta registrasi Skill yang masih OPEN. Hanya dokumen proposal; versi produk, CODEBASE dan changelog tidak diubah karena belum ada implementasi.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT.

Scope yang dapat ditinjau: **V1**, diawali pembeda baseline/no-op, lalu satu revisi `idea-refine` hanya bila gap terkonfirmasi. Aktivasi menunggu proposal Skill formal dengan digest yang dapat diperiksa. REM/Dreaming, engine DMN, incubation terjadwal, skor global, perubahan izin dan model tambahan tidak termasuk.
