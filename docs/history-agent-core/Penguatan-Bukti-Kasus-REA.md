# Penguatan Bukti Kasus dan Atribusi REA

Tanggal: 2026-10-31
Revisi: 5
Status: COMPLETED
Selesai: 2026-10-31
Jenis: Improvement — revisi Skill existing yang diminta langsung
Asal dan bukti: R1 `E:\Projects\Learning\awesome-reverse-engineer-anything`, commit `641331f4bdbe1a6cd7199d5d0215397bc6ae246d`, CC0-1.0; R2 `runtime/skills/capability-packs/reverse-engineer-anything/`, baseline payload `sha256:df33d0ad9abe476ab2d161c860b1bffa866737bb1f7ce2180abb97a3f56dff3c`.

Tambahan Revisi 4: R3 `E:\Projects\Learning\awesome-rea`, katalog MIT oleh Sanbu, commit `9aac7d1121f4f2685109b899d92dde8b297871c5`; R4 [DX-Ball evidence](https://github.com/morluto/rea/blob/42fc6c53ae188978deb3bedfe88287b6b316ba22/website/evidence/dx-ball-sound-pan.md); R5 [known-source controls](https://github.com/UnknownHacker1/rea-groundtruth/blob/5b48f366368c9fbe2abaaab810aba6814c27190b/README.md); R6 [Open Scrantic ENGINE](https://github.com/glauberlima/open-scrantic/blob/8c049614158f2adb09e517ce9e29da89e8a3ac38/docs/ENGINE.md). R4–R6 dibaca sebagai teks publik secara read-only, bukan dieksekusi. Kredibilitas R3 moderat sebagai kurator dengan pin/tanggal dan batas reproduksi; R4–R6 primer tetapi hasil runtime tetap laporan penulis.

**Asal Revisi 5 (ID R1–R5 di bagian Revisi 5 bersifat lokal, tidak mengganti ID historis):** lima checkout yang diminta pengguna di `E:\Projects\Learning`. Seluruhnya bersih saat inventaris; total **281 berkas tracked / 8.702.891 byte**. Urutan baca: README/arsitektur, seluruh mekanisme yang memetakan target, lalu implementasi/kontrak/kasus gagal dan metadata; terjemahan, gambar dekoratif dan respons generate tidak diperlakukan sebagai sumber independen.

| ID / repo / commit | Tipe, kredibilitas dan profil nilai | Cakupan gabungan Main/Raka |
| --- | --- | --- |
| R1 `open-scrantic`, `d90f1692927e7955e7c0745d3770af58e8d1f3e2` | Implementasi Rust, MIT; moderat: source/tes tersedia, runtime tidak direproduksi. Donor + method, dominan Procedural/Negative. | **dibaca penuh 52 / dilihat sekilas 1 / tidak dibuka 5 dari 58 file**; semua 20 `src/*`, build, dokumentasi dan snapshot dibaca; Cargo.lock sekilas; lima aset logo/demo/icon dilewati. Satu PNG desain internal diperiksa Raka, bukan validasi fidelity. |
| R2 `ReaFuse`, `c64502a2827832c042d894ba90dc678a95772cb1` | Implementasi Node, MIT; moderat untuk mekanisme, lemah untuk sertifikasi hasil. Method + cautionary, dominan Negative/Transfer. | **dibaca penuh 76 / dilihat sekilas 12 / tidak dibuka 1 dari 89 file**; seluruh 17 `src/*`, empat tes, fixture, server/zip dan showcase code/spec/contract/report. Sekilas: lock, lima UI/style, dua LINEAGE berulang, empat respons generate; `.env.example` tidak dibuka. |
| R3 `REA-Github`, `b41f030f2e2a744bb06a1c72f032784cada4ae87` | README, stub C++/header dan gambar, MIT; lemah: paket yang diiklankan tidak ada pada tracked tree. Cautionary, dominan Credibility/Absence. | **dibaca penuh 31 / dilihat sekilas 0 / tidak dibuka 0 dari 31 file**; 26 teks (3.503 byte/134 baris) dan lima PNG dilihat Raka. Gambar bukan bukti executable/provider berjalan. |
| R4 `stealth_enum_workspace`, `57ab57524c7013dc664e2c1d03d70d4f6b92df0a` | Generator Dart 2.2.6, MIT; moderat untuk source, klaim AOT/performa/security belum diuji. Donor + cautionary, dominan Negative/Procedural. | **dibaca penuh 40 / dilihat sekilas 3 / tidak dibuka 8 dari 51 file**; seluruh kode, tes, generated examples, README/changelog/config unik; tiga lock head/tail. Enam gambar dan dua salinan llms tidak dibaca; hash dua salinan sama dengan root llms yang dibaca penuh. |
| R5 `rea-atlas`, `877b34ecab0043bc56aa0773d2333161039731f1` | Katalog CC0-1.0; moderat sebagai peta, bukan oracle linked projects. Vocabulary + method + cautionary, dominan Strategy/Medium. | **dibaca penuh 11 / dilihat sekilas 4 / tidak dibuka 37 dari 52 file**; semua field 224 tuple `data.json` dibaca lewat proyeksi lossless, `render.py` dan aturan/editorial penuh; semua deskripsi EN diproyeksikan, file multilingual tetap sekilas, begitu pula README awal, images/stars metadata. Empat README terjemahan dan 33 gambar tidak dibuka. |

Cakupan total: **dibaca penuh 210 / dilihat sekilas 20 / tidak dibuka 51 dari 281 file**. Respons generate R2 diperiksa data-only: kode/tes yang diproyeksikan sama dengan creature yang dibaca; ini tidak dihitung ulang sebagai sumber independen atau pembacaan penuh respons. Main membuka sendiri setiap lokasi yang menopang perubahan. Tidak ada skrip donor, instalasi, target execution, benchmark atau lookup publik yang dilakukan. Recall Agent Core kontekstual mengembalikan foundation; BM25 mengembalikan catatan harness lama; pencarian Cortex tidak mengembalikan studi lima donor ini pada hasil yang ditampilkan. Batas hasil tersebut bukan klaim tidak ada Memory lain.

## Masalah dan tujuan

**Perluasan Revisi 5:** pengguna menunjuk lima checkout di atas dan meminta **studi sekaligus upgrade langsung** pada rumah source yang sama. Instruksi langsung tersebut mengadaptasi batas proposal-only `study`; tidak ada approval Native atau state proposal yang direkayasa. Extend record existing, bukan membuat proposal/Skill tandingan. Baseline aktif diverifikasi melalui `skills(inspect)`: adapter 2, payload `8849f319…`, 17 berkas/185.283 byte. Status git awal bersih, HEAD `c394e41`; lima commit terbaru dan proposal/history/CODEBASE/pack serta Memory diperiksa. Studi sebelumnya selesai, bukan pekerjaan tertunda yang dihidupkan kembali.

**Perluasan Revisi 4:** instruksi pengguna kali ini menunjuk `Learning/awesome-rea`, bukan `Learning/awesome-reverse-engineer-anything` pada Revisi 1–3. Lanjutkan catatan yang sama dan rumah Skill existing; hasil dan digest lama di bawah tetap riwayat, bukan bukti untuk donor baru. Pengguna meminta implementasi langsung, sehingga batas proposal-only skill study diadaptasi sesuai instruksi tersebut.

User meminta studi mendalam R1 dan langsung meng-upgrade R2 sampai seluruh bahan berguna pada snapshot referensi ditangani. R1 adalah katalog klaim komunitas, bukan implementasi REA. Nilai utamanya ialah disiplin atribusi, batas klaim dan pelajaran kegagalan; keberadaan tautan tidak membuktikan hasil proyek yang ditautkan. Upgrade memakai rumah Skill pertama dan alur revisi owner existing.

## Bukti dan ketidakpastian

### Perluasan Revisi 5 — delta, lensa dan keputusan

**Observed:** R1 `src/assets/resource.rs:16–52` memakai satu volume+ranges untuk entry overlap; `exe.rs:245–268,386–390`, `engine/ads.rs:20–25,65–82,752–760` dan `engine/ttm.rs:10–12,276–309` membedakan per-resource, agregat dan kerja per-frame. R2 `schemas.mjs:60–69`, `prompts.mjs:61–80`, `pipeline.mjs:179–228` membangun kontrak dahulu dan memetakan asal. Tetapi guard `pipeline.mjs:368–375` memeriksa prefix sebelum `util.mjs:58–67` menyelesaikan path; source menunjukkan normalisasi dot-segment dapat melewati sub-ownership meskipun tetap di root. Ini temuan statis donor, tidak dieksploitasi/diperbaiki karena donor read-only.

R2 `verify.mjs:11–47,67–88` memeriksa missing denominator tetapi membuang exit/overflow dan menerima ringkasan TAP dari teks; hash `report.mjs:69` bukan verifier. Klaim lineage juga tidak otomatis benar: `showcase/ratewise/lab/spec-B.response.json:33–41,64–66` menyatakan input bits sudah berupa bit count dan formatter tidak punya parser, sedangkan `creature/src/index.mjs:6–12,39–57`, contract `:7–49` dan `REPORT.md:48–57` menambah parsing/konversi dengan label B. Perilaku baru/adaptasi itu harus dibedakan dari inheritance. Tidak mengklaim runtime bug telah direproduksi.

R3 `README.md:3,17–20,27–28` mengiklankan 6.3.0, tetapi `agent/Skill.cpp`, `cli/Json.cpp`, `native/Ghidra.cpp` hanya stub; nama provider, gambar GUI dan `notes/VERSION.json` tidak membenarkan mengganti pin. R4 generator `packages/stealth_enum_generator/lib/src/stealth_enum_generator.dart:263–375,398–560` menunjukkan konstanta int, collision probing, branches dan label opsional; string hilang tidak menghilangkan flow. Verifier `scripts/verify_aot_strings.sh:109–130,193–220,240–302` hanya mensyaratkan sebagian string kontrol positif; mode Flutter dengan path invalid jatuh ke keterangan desktop. Klaim per-string/platform lebih kuat daripada pemeriksa aktualnya. Tes generation/representasi tidak membuktikan biaya nol atau ketahanan global.

R5 semua 224 tuple (156 No, 56 Yes, 12 Unverified) dan `render.py:5–15,73–111` menempatkan tag REA sebagai filter opsional, memisahkan kategori hasil dan mengurutkan subset memakai popularitas. Cari hasil existing menurut target/versi/format sebelum mengulang analisis, tetapi tag/star/license dalam katalog tetap lead yang harus diperiksa primer. Seluruh isi repo yang hanya ditautkan tidak termasuk studi.

**Angka data-only:** 4 × floor(1000/(13×18)) = **16 ms**, `reproduced` untuk aritmetika R1 `docs/ENGINE.md:95–98`; snapshot ini sudah menyebut integer division sehingga koreksi angka Revisi 4 di bawah tetap sejarah snapshot lama, bukan cacat pada donor sekarang. 80×256 KiB = **20 MiB**, lebih dari batas 16 MiB yang dicontohkan source, reproduced sebagai hitungan; bukan pengukuran memori runtime. Rentang hasil normalisasi R4 0x10000000..0x7FFFFFFF mempunyai **1.879.048.192** kemungkinan: finite dan bukan bukti bebas collision lintas enum. Hasil tes/AOT, klaim waktu brute-force, biaya nol, jumlah popularitas dan hasil linked projects = **klaim referensi / not checked**, tidak dijadikan manfaat lokal.

| Lensa | R1 | R2 | R3 | R4 | R5 |
| --- | --- | --- | --- | --- | --- |
| Semantic | Parser/VM dan resource budget. | Spec→contract→grow→verify. | Release/provider hanya klaim. | Enum menjadi konstanta/flow int. | 224 lead menurut target/output. |
| Procedural | Per-item vs total vs per-step. | Case→asal→oracle sebelum repair. | Isi aktual diperiksa dahulu. | Kontrol setiap canary dan build. | Cari reuse, buka primer. |
| Negative | Alias/ref bisa mengamplifikasi. | Guard path/runner/lineage tidak sekuat banner. | Stub, arsip tidak tersedia. | Label/pragma bukan semantic/security proof. | Tag/star tidak memverifikasi proyek. |
| Strategy | Pisah engine/data/adapters. | Acceptance tetap, implementasi berubah. | Jangan percaya packaging semu. | Ganti anchor dari nama ke efek. | Tag REA opsional, bukan gate. |
| Credibility | Source+tes; tanpa eksekusi. | Source membantah sebagian klaim. | Lemah untuk kemampuan operasional. | Source kuat relatif klaim marketing. | Kurator sekunder, CC0. |
| Freshness | Pin d90; timing doc kini lebih tepat. | Alpha, schema/model dapat drift. | 6.3.0 bukan runtime 6.5.0. | 2.2.6/config dan generated files berbeda umur. | Snapshot katalog; tag bukan recheck otomatis. |
| Absence | Fidelity seluruh game belum dibuktikan. | Kontrak bukan oracle independen. | Source operasional/build tak ada. | Tidak ada bukti recovery mustahil/overhead nol. | Linked repos tidak diperiksa. |
| Medium | Sisa lima aset tidak dinilai. | UI/respons berulang hanya sekilas. | PNG bukan run lokal. | Enam gambar tidak dipakai sebagai bukti. | EN/canonical tuples, terjemahan/gambar dilewati. |
| Environment fit | Rust tidak ditambahkan; metode saja. | Node owner dipakai, pipeline donor tidak. | Pin existing dipertahankan. | Windows native image route, decoder tidak diasumsikan. | Lookup selektif tanpa download/install. |
| Cost/reversibility | Guide selektif, tiada parser baru. | Tiada contract engine/registry baru. | Tidak diintegrasikan. | Tiada SDK/analyzer baru. | Tidak menyalin katalog. |
| Triangulation | Guide target sudah punya RNG/state. | Guide target sudah punya finite oracle. | Source melawan README. | Generator/examples/verifier saling membatasi. | Bukan penguat independen katalog lama. |
| Transfer | Guard agregat saat rebuild parser/VM. | Traceable fixed acceptance+run integrity. | Peringatan capability by name. | Flow tanpa label+negative proof. | Pilih reuse/output yang sesuai. |
| Intent | Preserve quirks+safe port. | Compose dua donor, bukan full binary RE. | Packaging notes. | Menjual resistance enum. | Membantu menemukan pekerjaan yang sudah ada. |
| Bebas: bukti yang hilang | Biaya alias berbeda dari ukuran input. | Label asal dapat salah meski tes hijau. | Gambar/filename dapat menyamar sebagai kemampuan. | Tidak punya nama berbeda dari tidak punya perilaku. | Hasil matching/port/recomp berbeda. |

**Support map dan T1:** seluruh kandidat didukung ≥2 lensa, tanpa single-lens. Manfaat masih inferred; attribution beberapa tambahan sekaligus **confounded**. Kelima pertanyaan mind-control dijawab melalui observed/counterevidence, saingan, pembeda dan flip berikut; confidence moderat untuk kelayakan metode, unknown untuk peningkatan hasil investigasi.

| Claim / perubahan terkecil | Observed + dukungan | Inferred / rival terkuat | Test pembeda / flip condition |
| --- | --- | --- | --- |
| C1 cari reuse dan tetapkan jenis hasil | R5 tuple/render, R3 stub; Strategy+Negative+Transfer. | Menghindari derivasi ulang; rival: identitas target existing sudah cukup. | Review route against current guide; bila tidak memperjelas keputusan, hapus paragraf. Popularitas/kurasi tidak menjadi oracle. |
| C2 pulihkan flow saat label enum hilang | R4 generator/examples; Semantic+Negative+Transfer. | Branch effect bisa diketahui tanpa nama; rival: analyzer yang tersedia tidak mendukung image. | Pastikan tidak mengklaim decoder/perintah baru; bila prerequisite tidak tersedia, unknown, jangan menyimpulkan tidak ada logic. |
| C3 negatif per-canary pada image yang sama | R4 verifier/control; Procedural+Negative+Environment. | Menghindari pass vacuous; rival: kontrol umum analyzer lama cukup. | Per-identifier control dan mode scope dibedakan; bila positifnya tak terbukti, simpulan removal ditahan. |
| C4 kontrak berjejak dan integritas run | R2 schema/pipeline/showcase/verify; Procedural+Negative+Triangulation. | Mengurangi salah inheritance dan pass palsu; rival: finite acceptance target sudah memadai. | Source→units/case→oracle dan runner outcome tetap terikat; jika tidak ada bukti independen, hasil behavioral unknown. |
| C5 batas agregat parser/VM | R1 resource/exe/ads/ttm; Procedural+Negative+Cost. | Batas per-item tidak cukup; rival: hardening umum di luar REA. | Dipakai hanya saat rekonstruksi parser/VM; kalau hanya inspeksi statis, route dilewati. Jangan salin angka donor. |

**T2 untuk batas security/trust C2–C4:** (1) source memperlihatkan string/label, konstanta, guard dan runner yang benar-benar ada; (2) `#aux` image/build yang dibandingkan harus cocok, source donor bukan eksekusi/oracle independen; (3) karena itu absennya nama, hash report dan label A/B tidak dapat membuktikan enforcement, clean-room atau fidelity; (4) keberatan terkuat ialah guard/kontrak sudah memadai, dibedakan oleh canonical path ownership, per-case evidence dan matching control; bukti runtime/primer yang cocok dapat mengubah verdict. Tidak ada bypass target/kredensial atau perubahan izin yang diterapkan.

**Disposisi sisa:** interpreter/script/resource, seed/warm-up/urutan RNG, timing, opcode state, numeric fidelity, packing, kompatibilitas platform, schema/context budget, provenance dan oracle finite sudah ada di sepuluh reference target: tidak digandakan. R1 batas aman dicatat sebagai deliberate differences; snapshot/image saja bukan semua event. R2 original-scanner thresholds/certificate, auto-repair count, cache/provider/server/UI/generation stack tidak ditransplantasikan. R3 tidak menyumbang provider/runtime. R4 generator, kunci, hash, benchmark dan angka limit tidak diimpor. R5 224 proyek/tools, star-ranking dan terjemahan tidak disalin ke Skill. Semua tema material yang ditemukan pada bacaan memiliki nasib; 51 berkas tidak dibuka dan linked projects tetap di luar klaim, sehingga tidak dinyatakan bahwa seluruh informasi potensial donor habis selamanya. Untuk menaikkan bukti selanjutnya dibutuhkan artifact/oracle tugas nyata dan hasil yang independen, bukan katalog atau benchmark tambahan.

### Perluasan Revisi 4 — cakupan dan keputusan

R3 berisi **984 berkas tracked / 10.020.781 byte**. **Dibaca penuh 55 / dilihat sekilas 5 / tidak dibuka 924 dari 984 berkas**. Urutan: editorial/aturan sumber, seluruh kasus yang memetakan target, lalu riset dan metadata; terjemahan dan situs generate dilewati untuk menghindari pembacaan semantik berulang. Main membaca sendiri seluruh 38 `cases/*.md` EN; Raka membaca ulang semuanya, `data/cases.json` dan tiga `research/*.md` secara penuh (42 berkas / 193.870 byte), serta `SKILL.md` dan sembilan reference target baseline. Main memeriksa sendiri lokasi setiap metode yang dipakai. JSON/kasus bukan dua sumber independen.

Tambahan bacaan penuh Main: `ABOUT.md`, `SOURCES.md`, `CONTRIBUTING.md`, `LOCALIZATION.md`, `DISCOVERABILITY.md`, `templates/case.md`, `LICENSE`, `CHANGELOG.md`, `data/languages.json`, dan empat berkas `.github/` (total union penuh 230.083 byte). Bacaan sekilas: `README.en.md` dan empat `scripts/*` (head/tail/hit relevan saja; tidak dijalankan). Dari berkas tidak dibuka, 418 adalah kasus terjemahan dan 468 adalah HTML; 38 lainnya meliputi locale data, README terjemahan, aset dan metadata. Status ini tidak mengklaim audit visual/aset atau verifikasi terjemahan. R4: teks 100 baris dibaca; R5: 61 baris; R6: 161 baris teks, gambar holiday yang dirujuk tidak dibuka karena tidak dipakai menilai visual.

**Observed:** R3 menghitung 38 kasus (5 official + 33 lainnya); 16 berkas target sebelum revisi cocok dengan katalog aktif. Hanya `SKILL.md` baseline berubah, satu reference ditambah; tidak ada skrip/lock/pin/reference lama diubah. Pencarian overlap pada proposal, history, CODEBASE, source packs dan Memory menemukan catatan studi Revisi 1–3; tidak dibuat proposal/state Skill paralel. Recall kontekstual tersedia tetapi hanya mengembalikan foundation, sedangkan BM25 mengembalikan riwayat harness; ini bukan bukti tidak adanya semua Memory terkait.

**Pemeriksaan angka (data-only, bukan benchmark):** R4 byte konstanta terurai menjadi 1,5625 / 500 / 1; rentang inklusif fungsi = 63 byte dan 641 input × 5 skala = 3.205 (`reproduced` untuk decoding/hitungan, bukan eksekusi/compiler match). Rumus R6 `4 × 1000/(13 × 18)` = 17,094 ms, berbeda dari label 16 ms (`contradicted` secara aritmetika; timer/implementasi aslinya belum diperiksa). Angka tick tidak ditransplantasikan. Hasil eksperimen lain, jumlah tes, p-value, biaya dan popularitas = `klaim referensi / not checked`; tidak menjadi bukti manfaat upgrade.

| Lensa R3–R6 | Temuan dan batas |
| --- | --- |
| Semantic | R3 `cases/*.md:12–30`: perilaku terbatas, bukan katalog decompiler/rekonstruksi penuh. |
| Procedural | `dx-ball`, `rea-groundtruth`, `open-scrantic`, `ductf-masked-squares`: langkah pembeda bisa dipakai dengan tool existing. |
| Negative | `gunzrs:26`, `local-model-mcp:26`, R5 known-source misses dan rumus R6 yang tidak konsisten membatasi transfer literal. |
| Strategy | Mulai dari pertanyaan/entry slice; pilih kontrol, data route atau seam sebelum menambah runtime. Inferensi strategi, bukan klaim penulis universal. |
| Credibility | R3 `SOURCES.md`, `LICENSE`; pin dan tanggal jelas, reproduksi tidak dilakukan. Kesalahan rumus R6 membatasi kepercayaan angka tanpa menghapus nilai metodenya. |
| Freshness | Setiap `cases/*:8–10,26`: 6.3/6.4/6.7 dan PR historis tidak menjamin keadaan pin 6.5.0. |
| Absence | `picoprint`, `watch-esim-helper`, `vd-streamer-linux`: callback akhir, protokol lengkap dan hardware coverage tidak selalu tersedia. |
| Medium | `LOCALIZATION.md` dan generator: 38 kasus editorial yang sama diproyeksikan ke banyak bahasa; HTML/terjemahan bukan penguat independen. Gambar R6 tidak dipakai. |
| Environment fit | Windows, scope satu user, schema/izin existing; jangan membawa Docker/Linux/solver/historical flags sebagai dependency. |
| Cost/reversibility | Satu reference 7.958 byte selektif, entrypoint ≤8.192 byte; rollback existing tanpa layanan baru. |
| Triangulation | Bandingkan sembilan reference target dan studi lama; R4/R5/R6 mengecek tiga mekanisme dari sumber primer, bukan semua hasil donor. |
| Transfer | Pindahkan urutan penyelidikan dan pembatas klaim; jangan pindahkan software, aset, rasio hasil, benchmark atau toolchain. |
| Intent | Pengguna meminta pendalaman dan upgrade langsung; R3 bertujuan kurasi kasus, bukan spesifikasi runtime baru. |
| Free: rantai hasil | `watch-esim-helper:18–30`, `coop-anything:22–30`: handoff/visibility adalah tahap antara, sehingga acceptance harus mengikuti efek yang benar-benar diminta. |

**Nasib seluruh 38 kasus** (`cases/<id>.md`, terutama baris 18/22/26/30; target pembanding `native-and-artifacts.md:82–96,127–141`, `case-evidence.md:44–90`, `evidence-workflows.md:27–49`):

| Nasib | Kasus | Keputusan |
| --- | --- | --- |
| Metode tambahan (4) | dx-ball, th04, rea-spanish-lab, ski-or-die | Pulihkan kontrak numerik dari caller/assembly/bytes; pisahkan fidelity, aproksimasi dan byte match. |
| Metode tambahan (3) | rea-groundtruth, bzip2-groundtruth, rea-on-rea | Kontrol dengan truth diketahui, referensi symbolized yang cocok dan prediksi sebelum unblinding. |
| Metode tambahan (2) | desktop-games-nostalgia, open-scrantic | Interpreter/program/resources serta state RNG/waktu/scheduler dan perbedaan sengaja. |
| Delta terbatas (1) | gunzrs | Peringatan packing sudah ada; tambahkan jalur data terpisah setelah batas statis. |
| Delta terbatas (6) | vd-streamer-linux, picoprint, watch-esim-helper, coop-anything, openbattlefield2, v5vpn-rea-client | Seam platform/protokol dan tahap hasil akhir; acceptance/hardware umum sudah ada. |
| Metode tambahan (1) | ductf-masked-squares | Predicate/tabel → constraint; satisfiable, diterima original dan unik adalah klaim berbeda. |
| Metode tambahan (1) | local-model-mcp | Anggaran schema sebelum tool call; jangan salin flag/jumlah tool PR lama. |
| Sudah tercakup (5) | hexgrab, netcat-analysis, notion-clipboard, wispr-flow, disklens | Atribusi campuran, pemeriksaan independen, keterbatasan graph/runtime dan source. |
| Sudah tercakup (1) | aegis-totp | Oracle finite dan standard vectors. |
| Sudah tercakup (3) | opensource-rea-lab, rea-playbook, reafuse | Artifact/slice → spec → checks; perilaku baru terpisah dari donor. |
| Sudah tercakup (4) | hyper3d-clone, paper-rs, terminal-rs, open-claude-ui | Observasi UI berbeda dari backend/fidelity/implementasi baru. |
| Sudah tercakup (3) | adamterm, ledger-reborn, rec-rs | Metadata dahulu dan arsitektur sesuai scope. |
| Sudah tercakup (1) | vsl-dsp | Protokol terbatas dan kode kontrol unknown. |
| Sudah tercakup (2) | sparkdash-rea, rea-safe-agents | Integrasi/containment berbeda dari analisis, model dan hardware proof. |
| Tidak diulang (1) | rea-lab | Retensi Evidence sudah ada; benchmark dan klaim manfaat tidak diambil. |

**T1 per kelompok kandidat:** Claim = tambahkan tujuh metode selektif di reference existing-pack; Observed = lokasi donor/target pada tabel; Inferred = urutan tersebut membantu menentukan probe berikutnya; Rival = sembilan guide lama sudah cukup atau teks tambahan membebani konteks; Test = review Main/Raka terhadap seluruh kasus, parser/link check dan readback payload, bukan bukti efek pada investigasi; Flip = metode ternyata duplikat/tidak terpakai atau runtime tidak mendukung operasi yang dibutuhkan, maka hapus/persempit. Confidence moderat untuk transfer metode, unknown untuk perbaikan outcome. Lima pertanyaan mind-control menghasilkan keputusan ini: fakta dipisah dari klaim, bukti lawan (coverage/pin/rumus/cost) dipertahankan, rival dibandingkan, pemeriksaan pembeda disebutkan, kondisi pembatalan eksplisit.

Support map: seluruh kelompok mendapat Procedural + Negative + Transfer; kalibrasi/aritmetika/state juga Triangulation dari R4–R6. Environment/Cost/Freshness membatasi semuanya; medium/credibility membatasi kasus yang hanya kurasi. Tidak ada kandidat single-lens dalam scope. Konflik tidak dirata-rata: metode tetap dipakai, angka lama/hasil eksperimen tidak dijadikan fakta lokal. Atribusi manfaat tujuh perubahan sekaligus `confounded`.

| Kandidat / saingan terkuat | Pengamatan pembeda / kondisi mengubah keputusan |
| --- | --- |
| Kalibrasi / oracle umum sudah cukup | Kontrol memakai wrapper/build yang sama; bila bentuk itu sudah tercakup dengan truth independen, gunakan hasil tersebut tanpa membuat kontrol baru. |
| Numerik / pseudocode sudah akurat | Cocokkan caller, instruksi dan konstanta; bila konsisten untuk pertanyaan terpilih, tidak perlu analisis ulang/byte-matching. |
| Constraint / contoh positif sudah cukup | Predicate dan input ditolak membedakan model terlalu longgar; bila tidak ada bukti second-model exhaustion, jangan simpulkan unik. |
| Interpreter-state / executable berisi seluruh aturan | Telusuri opcode dan resource ke transisi; bila tidak ada embedded program, route ini dilewati. |
| Packing fallback / warning stub sudah cukup | Lanjut hanya bila data terpisah menjawab pertanyaan; bila tidak, unknown, bukan penambahan unpacker. |
| Seam / full rewrite lebih sesuai | Batas dependency dan efek akhir pengguna menentukan pilihan; bila adapter gagal memenuhi scope, pertimbangkan implementasi yang lebih luas dengan bukti baru. |
| Anggaran konteks / output slicing saja cukup | Pisahkan biaya schema sebelum call dari output/analyzer/provider; bila schema bukan pembatas, pertahankan tool surface existing. |

Tidak ditemukan kandidat metode material lain dalam 38 kasus editorial setelah review Main/Raka. Kesimpulan ini terbatas pada snapshot dan bacaan di atas, bukan seluruh ekosistem/isi setiap tautan eksternal atau 924 berkas tidak dibuka. Profil R3: method + cautionary + confirmation, nilai dominan Procedural/Negative, kredibilitas moderat. Untuk menaikkan bukti manfaat berikutnya dibutuhkan artifact/oracle tugas nyata dan hasil independen dengan izin yang sesuai; bukan penambahan katalog atau eksperimen benchmark.

### Riwayat studi Revisi 1–3

**Cakupan:** dibaca penuh 24 / dilihat sekilas 0 / tidak dibuka 0 dari 24 berkas tracked, 208.340 byte / 2.177 baris, oleh Main dan Raka. Raka membaca semua berkas; Main memeriksa sendiri lokasi setiap temuan yang dipakai, entrypoint/rujukan target, implementasi lifecycle dan validator. Urutan: README/definisi, kasus/metode yang memetakan target, lalu terjemahan, skrip dan metadata. Padding tabel dinormalisasi hanya saat pembacaan Raka; semantik dipertahankan. Tidak ada gambar/biner pada 24 berkas ini. Halaman/repo eksternal yang ditautkan belum dibaca dan tidak termasuk klaim cakupan ini.

Inventaris: `README.md`, `README.zh-CN.md`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore`, `lychee.toml`; sepuluh dokumen EN/CN `docs/{by-app,is-it-rea,new-this-week,press-and-posts,x-posts}{,.zh-CN}.md`; `scripts/{validate_list,align_tables}.py`; `.github/ISSUE_TEMPLATE/case.yml`, `.github/pull_request_template.md`, dan workflow `discover-candidates.yml`, `links.yml`, `validate-list.yml`.

**Observed:** target source dan catalog aktif identik pada baseline: 15 berkas, 169.907 byte, digest di atas. Tidak ada kandidat staged untuk nama ini. R2 sudah mendukung routing, batas provider, bukti statis/runtime, reuse analisis dan verifikasi finite (`SKILL.md`; `references/evidence-workflows.md`; `source-and-runtime.md`; `native-and-artifacts.md:141–157`). Tidak perlu toolchain, provider atau harness baru.

**Bukti R1 yang membedakan:**

- `AGENTS.md:17–35` membedakan pernyataan pemakaian REA dari mutu/legalitas rekonstruksi. `docs/is-it-rea.md:29–36` membedakan containment, inventory, method recovery dan REA sebagai target pengujian.
- `README.md:78,93,116–117,128` membatasi helper DX-Ball, atribusi showcase TH04, JAR mucrab/CFR/javap, bukti differential feature-heist, dan hardware yang belum diuji. Ini laporan katalog; proyek/oracle asal tidak diperiksa.
- `README.md:133–136,230–237` menyingkap containment, artefak berisi instruksi, hasil terukur versus estimasi, aliran data ke provider dan batas reuse. Ini tidak membenarkan instalasi container/alat atau kesimpulan hukum baru.
- Review statis `validate_list.py:55–62,191–207,328–378,464–474`: H3 mengganti konteks H2; 36 bullet komunitas EN berada di luar predicate case, sehingga pemeriksaan tag/lisensi/row tidak mencakupnya. Lisensi/row yang hilang hanya warning; `new-this-week` tidak diperiksa. Main menghitung ulang jumlah tersebut dari data dengan Node, **tanpa menjalankan skrip donor**. CI hijau tidak membuktikan klaim semantik.
- `README.md:44,165` memuat 74/75 versus 75/75 sekaligus frasa “same accuracy”; pemeriksaan integer membuktikan hitungan berbeda, bukan inferensi signifikansi. `is-it-rea.md:5` bertanggal 14 Oktober tetapi berisi kasus yang daftar mingguan tempatkan lebih akhir. Tanggal halaman, tanggal pembuatan repo dan revalidasi per kasus dipisahkan. Tidak ada benchmark dijalankan atau hasil eksternal direproduksi.

| Lensa | Hasil dan pengaruh pada keputusan |
| --- | --- |
| Semantic | Ambil perbedaan atribusi/scope, bukan klaim kemampuan baru dari daftar. |
| Procedural | Case card dan acceptance finite melengkapi alur operasional existing. |
| Negative | Gap H3/warning, skor tidak identik, helper bukan seluruh game; batasi otoritas validator/klaim. |
| Strategy | Katalog memilih checkability; adaptasi memakai bukti minimum per klaim, bukan menyalin katalog. |
| Credibility | Moderat untuk metode kurasi; lemah/tidak diverifikasi untuk outcome eksternal. Kesalahan internal membatasi klaim semantik. |
| Freshness | Pin snapshot dan tanggal pemeriksaan per klaim; versi/tanggal baru bukan bukti kompatibilitas lokal. |
| Absence | Tidak ada artefak, oracle, log/repro mentah atau bukti hukum untuk seluruh kasus. |
| Medium | Semua sumber lokal berupa teks; tautan/screenshot/post eksternal tidak otomatis terbaca. |
| Environment | Windows dan pin 6.5.0 dipertahankan; klaim OS/hardware/provider lain tetap bersyarat. |
| Cost/reversibility | Satu reference dan entrypoint ringkas; rollback lewat history SkillService. |
| Triangulation | Cocokkan EN/CN, is-it-rea, skrip dan R2; repost/terjemahan tidak dihitung independen. |
| Transfer | Pindahkan metode provenance/acceptance/trust ke owner Skill existing; tool/provider baru tidak didukung bukti. |
| Intent | Implementasi upgrade langsung, bukan proposal yang menunggu persetujuan ulang. |
| Free: denominator/attribution leakage | Satu helper, satu commit, containment atau test target tidak dinaikkan menjadi sukses seluruh aplikasi. |

**T1:** Claim: referensi terpilih memperbaiki kontrak laporan/acceptance R2. Observed: gap atribusi pada entrypoint dan bukti di atas. Inferred: pemakaian berikutnya dapat mengurangi klaim berlebihan. Rival: R2 sudah cukup melalui aturan bukti umum. Test: mapping setiap tambahan terhadap R2, review independen Raka, lint/validate dan readback kandidat/aktif. Flip: bila aturan sudah identik atau menambah alat/otoritas tanpa konsumen, hapus tambahan itu. Confidence moderat untuk relevansi; manfaat perilaku belum diukur.

**T2 trust boundary:** (1) R1 menunjukkan instruksi/decoy dapat dibawa target; (2) R2 sudah menganggap WebMCP inventory tidak tepercaya tetapi belum menyatakan batas artefak secara umum; `#aux` file target bukan kontrak host; `#aux` grant/izin existing tetap berlaku. Kesimpulan: analisis isi sebagai data dan pertahankan instruksi host sebenarnya. Keberatan “semua AGENTS diabaikan” ditolak; kondisi pembalik ialah file tersebut memang instruksi workspace/host yang berlaku, bukan artefak yang dianalisis.

## Mekanisme dan owner existing yang dipakai

**Revisi 5:** adapter 3 menambah satu `references/recovery-contracts.md` dan route selektif di `SKILL.md`. SkillService existing tetap pemilik validate/stage/promote/rollback; semua reference lama dan launcher/lock/pin dipertahankan. Polyglot dipertimbangkan: Markdown + lifecycle Node existing cukup; Rust/Dart donor hanya bukti metode. Parser/decompiler/FFI baru tidak memberi manfaat yang diperlukan scope ini.

**Tambahan Revisi 4:** `references/investigation-methods.md` menjadi satu rumah prosedur baru di pack existing; `SKILL.md` hanya menambah routing selektif dan metadata `adapter-revision: 2`. Seluruh sembilan reference lama tetap identik. Native dan external membaca artifact yang sama melalui SkillService; perubahan ini tidak menambah parser/decompiler/API. Polyglot dipertimbangkan: prosedur Markdown dan lifecycle Node existing memadai, sehingga bahasa/runtime/FFI tambahan tidak memberi manfaat terjustifikasi. Panduan seam tetap meminta pemilihan bahasa menurut komponen bila kelak implementasi nyata memerlukannya.

Sumber hanya di `runtime/skills/capability-packs/reverse-engineer-anything/`. Tambah `references/case-evidence.md` dan pointer/aturan data pada `SKILL.md`; rapikan kalimat ekuivalen agar entrypoint tetap satu halaman. Pertahankan delapan rujukan operasional, launcher, manifest/lock, lisensi dan pin 6.5.0/revisi upstream 42. Catalog/history dikelola SkillService melalui validate → stage_revision → promote_revision → readback; tidak ditulis langsung.

Alur `decide_proposal` yang diamati di `src/skills/service.ts:598–680` merender ulang SKILL.md dari template proposal dan mempertahankan hanya ancillary files baseline; tidak mewakili penambahan reference ini secara utuh. Karena user meminta implementasi langsung, gunakan jalur revisi source existing, bukan membuat approval Native palsu atau mengganti adapter dengan template. Dokumen ini catatan studi/implementasi, bukan state approval Skill tandingan.

## Scope, batas Native, risiko dan otorisasi

**Revisi 5, scope yang diminta langsung:** satu paket coherent C1–C5, source→review→validasi→promosi owner→build/publish/restart resmi→readback client→Learning→commit lokal. Risiko utama teks tambahan membebani konteks atau dianggap kemampuan runtime; guide selektif dan kalimat batas/prerequisite menguranginya. Tidak ada source engine, konfigurasi, dependency/toolchain, provider baru, target live, push/tag/release, atau perubahan donor. Source, artifact aktif dan history tetap role owner existing.

| Paket | Nasib seluruh tema berguna R1 |
| --- | --- |
| V1 provenance | Terapkan identitas target/source/output, source kind, peran alat, first-party/partial/showcase/test target, tanggal dan deduplikasi sumber. |
| V2 acceptance | Terapkan independent oracle, input/batas/failure, scope finite, kondisi OS/hardware dan hasil yang belum diuji; gunakan verifier existing. |
| V3 trust/reuse | Terapkan artifact-as-data, disclosure provider, capture ≠ sandbox, pemisahan provenance kode/aset dan klaim clean-room. |
| Perbandingan manfaat | Simpan kondisi eksperimen dan measured/estimated/reported; jangan infer equivalence atau menjalankan benchmark. |
| Routing/runtime | Sudah tercakup; pin/runtime/provider/harness baru ditolak sebagai tidak didukung snapshot. JAR inventory ≠ method recovery cukup sebagai batas route, tanpa menginstal CFR/JDK. |
| Katalog/validator | Jangan salin daftar, CI atau validator. Gunakan keterbatasan struktural-versus-semantik dan kontradiksi sebagai pelajaran. |

Scope yang diminta: V1+V2+V3 dan konsekuensi langsung dokumentasi, validasi, aktivasi serta commit lokal. Tidak mengubah Native execution, grant, model, Memory owner, provider, Tool API atau source donor. Polyglot tidak memberi keuntungan untuk perubahan Markdown/adapter ini; runtime Node existing dipertahankan. Risiko: konteks bertambah dan secondary claims tersalahangkat; mitigasi reference selektif, source-date/role yang jelas dan counterexample.

## Manfaat yang diharapkan dan keterbatasan

Revisi 5 **diharapkan** memperjelas pilihan reuse, pertanyaan tanpa nama, kriteria negatif, asal acceptance dan batas resource rekonstruksi. Lint/build/readback hanya membuktikan paket dan delivery; belum ada bukti causal benefit, zero overhead atau peningkatan kemampuan decompiler/model. Batas coverage dan sumber sekunder di atas tetap berlaku.

Harapan: laporan membedakan siapa membuktikan apa, scope rekonstruksi dan batas lingkungan/reuse. Verifikasi artifact/lifecycle tidak membuktikan hasil reverse engineering lebih akurat. Atribusi beberapa perubahan sekaligus `confounded`; tidak ada klaim causal benefit. Profil nilai R1: method, cautionary, vocabulary; yang paling bernilai ialah prosedural/negatif. Bukti berikutnya untuk outcome empiris memerlukan primary project/artifact/oracle dan eksperimen yang diizinkan; itu bukan pekerjaan terbuka pada snapshot studi ini.

## Acceptance, evaluasi dan rollback

### Spesifikasi Revisi 5

- C1–C5 tercakup selektif, source ≤8.192 byte per resource yang diubah/ditambah, tautan relatif dan parser valid; semua 16 berkas baseline selain SKILL identik.
- Main memeriksa anchors; Raka review source final dengan hasil/ketidakpastian. Verifikasi correctness-only: lint/validate, baseline-fenced stage/promote, build launcher/runtime dan readback client sampai offset terakhir; tidak menjalankan donor/suite/benchmark.
- CODEBASE/changelog/patch intent mencatat keadaan aktual; adapter revision naik, produk tetap 1.6.0 hingga rilis terpisah. Learning dan commit task-owned ditutup menurut hasil nyata.
- Rollback owner `rollback_revision` ke `sha256:8849f3190b0a226ebe91601152cb7cf4ca20d927d2bba6c77ab8699d1572a2bf` dengan fencing current digest; revert source commit bila perlu. Jangan edit/delete catalog/history atau membuang perubahan orang lain.

### Hasil implementasi Revisi 5

- Adapter 3 aktif, payload **`sha256:5f2338f50e9473a3d5e4e7ae0f73cf4de5b0f82d45cb84598ce4d6b9646a671c`**, 18 berkas / 193.090 byte. `SKILL.md` 8.054 byte, `recovery-contracts.md` 7.917 byte. Perbandingan hash source terhadap baseline aktif sebelum promosi: **16/17 berkas identik**, hanya entrypoint berubah; satu reference ditambah. Sepuluh reference lama, launcher, manifest/lock, lisensi dan pin tetap sama.
- Review independen Raka **APPROVE** untuk kedua resource: lima grup didukung bukti dan tidak menambah decoder/grant/engine. Satu locator generator di laporan dikoreksi ke path `packages/stealth_enum_generator/lib/src/stealth_enum_generator.dart`. Main memeriksa sendiri anchors material dan membaca kembali source baru. Tidak ditemukan kandidat material tambahan pada materi yang dibaca setelah disposition dan review; batas 51 berkas serta linked projects tetap berlaku.
- Lint strict lulus, 42 pack / **0 parser errors, 0 dangling links**; target tanpa page warning. Advisory inherited tentang UPSTREAM.json dan sumber executable di luar `references/` tetap diketahui; provenance/pin tersedia di source-and-runtime dan record owner. `skills(validate)` → `stage_revision` → baseline-fenced `promote_revision` lulus, `sourceLineageChanged=false`. Digest `8849f319…` dipertahankan owner untuk rollback. Tidak ada penulisan langsung ke catalog/history managed.
- `npm.cmd run build` lulus: 532 authored files, 42 source/47 managed Skill, 472 direktori sesuai peta, browser transport current dan TypeScript. Publish launcher memakai `dotnet` + **MSBuild SDK 8.0.425 existing** (`/t:Publish`, Release, win-x64, self-contained/single-file) tanpa restore/download/install; output `runtime/build/launcher/Agent Core.exe`, SHA256 **`90a3e568d6b89772135edfc202deb6f9621a071d477dc5c7996680d3519221d6`**. Root executable yang sedang dipakai tidak ditimpa; perubahan Skill dilayani catalog-data external existing.
- Satu restart resmi `restart_agent_core(capabilitiesChanged=true)` selesai lewat receipt **`runtime/restart/65e5808424a74893b2400f4cc015be83.json`**, 2026-10-31 **15:06:14 WIB**, exit 0; Core PID **16484**, mulai 15:05:31 WIB, dist tidak basi/readiness siap. Log request awal kosong bukan alasan mengulang restart. Kontrak dibaca ulang, seluruh body identik, digest `6cd3db27…` diakui ulang, canonical Memory diinspeksi dan episode **`ext-d0e913f0bc3149f887f34423ef9626e5`** dilanjutkan memakai taskKey yang sama.
- Fresh bootstrap menampilkan digest adapter 3. Client Codex membaca body **0 → 7.759 → akhir** dan reference **0 → 7.761 → akhir**; gabungan konten kedua resource **persis sama dengan source**, bukan hanya metadata/hash. Receipt aktual: `tool:b9ca543dd97e4443822eae90a877cfa5`, `tool:4066961e521848118738f86bee669607`, `tool:b9748e4859c34bdaba973c3f3ef4e997`, `tool:bbb530b50402476e99ce9fb64a66b5cc`. Ini fresh discovery/readback di Codex; schema tool tidak berubah, tidak mengklaim klik Refresh tools ChatGPT/Claude.
- Empat receipt penggunaan index/skill-authoring (`applied`) dan mind-control/performance (`adapted`) tercatat, **`result=unavailable`, `trustChanged=false`**: tindakan nyata ada, causal benefit tidak diukur. Percobaan receipt awal menolak `EXTERNAL_RECEIPT_REVISION_NOT_DELIVERED`; status membuktikan episode/complete reads tersimpan tetapi current head tidak terikat. Setelah rebind stable taskKey/workspace dan verifikasi current episode, keempat receipt berhasil. Tidak mengarang receipt atau mengubah guard. `git diff --check` juga menemukan CR pada dua baris CODEBASE baru; hanya EOL baris itu dikoreksi, riwayat mixed-EOL existing dipertahankan; pemeriksaan berikutnya lulus.
- Canonical task Memory mendapat observation/advisory state dan checkpoint **`56d42fc1-e29a-4b48-8116-5da44b645058`**, episode `14f35641-318f-41a4-82b3-ffa695ae56bb` revision 2. State tersebut berlabel unverified/controller observation, bukan durable behavioral truth. Tidak menduplikasi metode Skill menjadi Memory permanen. Learning checkpoint/review dan commit lokal dicatat pada penutupan di bawah.
- Tidak ada donor/test suite/benchmark/target REA yang dijalankan, dependency/config/provider/tool grant diubah, push/tag/release diterbitkan, atau pembersihan data pengguna. Tidak ada file sementara task yang dibuat. Perubahan tracked hanya dua source instruction resources dan empat dokumen/metadata existing.

**Penutupan Revisi 5:** Learning checkpoint **`study-rea-five-reference-delta-complete`** memakai `verified-recovery` karena scope receipt dipulihkan setelah penolakan nyata; explicit review selesai **15:12:37 WIB**, **`complete=true`, `no-new-knowledge`**, nol capture/proposal, dua review lama tidak diubah. Transfer sudah berada di Skill existing; tidak dipromosikan menjadi klaim manfaat. Episode melaporkan outcome controller `verified`, sedangkan independent workflow verifier tetap `unavailable`; keduanya tidak disamakan. Input verifikasi awal tanpa `verificationRef` ditolak, lalu diperbaiki dengan receipt delivery yang nyata. Kontrak, inspeksi canonical Memory, episode, checkpoint Memory dan lifecycle Learning tidak dilewati. Tidak ada pekerjaan implementasi tersisa dalam scope C1–C5. Commit lokal memakai pathspec enam file milik tugas; hash akhir dilaporkan pada jawaban pengguna, tanpa push/tag/release.

### Spesifikasi perluasan Revisi 4 — sebelum perubahan Skill

- Baca seluruh 38 kasus editorial dan petakan masing-masing: metode tambahan, sudah tercakup, atau dikecualikan dengan alasan; hitung cakupan terhadap 984 berkas tracked tanpa mengaku membaca terjemahan/situs yang dilewati.
- Tambahkan hanya metode yang belum operasional: pemeriksaan blind spot, pemulihan aritmetika, interpreter/data dan state waktu/acak, batas packing, constraint dengan batas keunikan, seam platform/protokol dan anggaran konteks. Pertahankan sumber/oracle/izin existing.
- Gunakan satu reference selektif ≤8.192 byte dan entrypoint ≤8.192 byte; pertahankan launcher, runtime 6.5.0, upstream 42 dan seluruh reference lama.
- Validasi parser/tautan, stage/promote melalui SkillService dengan baseline fencing, build/publish/restart resmi sekali, lalu baca kembali payload aktif lewat client sampai offset terakhir. Jangan menjalankan donor atau benchmark.
- Perbarui adapter revision, CODEBASE, changelog/patch intent dan catatan ini; catat cakupan, keterbatasan bukti serta Learning aktual, kemudian commit hanya path milik tugas.

### Hasil implementasi Revisi 4

- Seluruh 38 kasus mempunyai nasib di tabel. Tujuh metode diterapkan dalam `investigation-methods.md` 7.958 byte dan `SKILL.md` 8.164 byte. Review Raka tidak menemukan blocker; saran agar route menyebut schema/context diterapkan sebelum promosi final. Hash/perbandingan isi menunjukkan 15 dari 16 berkas baseline identik, hanya entrypoint berubah dan satu reference ditambah.
- `skill-pack-lint.mjs --strict`: 42 pack, nol parser error/dangling link; target tanpa page warning. Advisory inherited tentang UPSTREAM.json dan ancillary executable resources tetap seperti sebelumnya, bukan bukti provenance hilang (lihat source-and-runtime dan record owner). Validasi/staging owner existing dan pemeriksaan link kedua resource lulus. Tidak menambah script/test/dependency atau menjalankan suite, donor maupun benchmark.
- SkillService mempromosikan `sha256:8849f3190b0a226ebe91601152cb7cf4ca20d927d2bba6c77ab8699d1572a2bf`, 17 berkas / 185.283 byte, dengan expected-active fencing ke `sha256:7653a3c1ac81b5f5831556f6dbec14c3f0d1aac992f66049ddca95a9e0bb238e` dan `sourceLineageChanged=false`. Kandidat sebelum saran route (`3952896a…`) tetap kandidat immutable terkelola, tidak aktif; tidak dihapus manual dari state owner. Katalog aktif dan seluruh source payload final identik.
- `npm.cmd run build` lulus: path policy 532 berkas authored, 42 source/47 managed Skill, 472 direktori sesuai peta dan TypeScript. Publish launcher memakai MSBuild SDK 8.0.425 existing tanpa restore/download; output `runtime/build/launcher/Agent Core.exe` SHA256 `696b1fce7cb83af5daa2ce880ff00101b60ecad736a1bca85eab4adcb816d471`. Root binary yang sedang dipakai tidak ditimpa; catalog tetap data eksternal milik owner.
- Satu `restart_agent_core(capabilitiesChanged=true)` menghasilkan receipt `runtime/restart/19c15044bc774c80bd874d446fc38ecc.json`: selesai 2026-10-31 07:32:41 UTC, exit 0, Core PID 5704, dist tidak basi/readiness siap. Request log awal kosong bukan kegagalan atau alasan retry; receipt diperiksa dan restart tidak diulang. Kontrak setelah restart sama isinya/digest, diakui ulang, Memory diinspeksi dan episode `ext-2276f21230474dae948978f88366d68e` dilanjutkan dengan taskKey yang sama.
- Client Codex membaca SKILL offset 0 → 7.760 → akhir dan reference offset 0 → 7.758 → akhir dengan digest final; gabungan masing-masing hasil sama persis dengan source. Ini discovery/readback aktual di Codex, bukan klaim klik Refresh tools di ChatGPT/Claude atau pengujian efektivitas REA.
- Receipt index (`applied`), mind-control dan performance-oriented-software-engineering (`adapted`) tercatat dengan `result=unavailable`, `trustChanged=false`; tidak ada workflow report independen yang membuktikan causal benefit. Performance dipakai untuk membatasi workload/konteks dan menghindari kerja berulang; advanced mind-control extensions yang tidak relevan tidak diterapkan. Kontrak, inspeksi Memory, episode dan checkpoint/review dicatat menurut hasil sebenarnya saat penutupan.
- Learning checkpoint `study-awesome-rea-expanded-corpus-complete` (`explicit-learn`) dan review eksplisit selesai 2026-10-31 07:37:41 UTC: `complete=true`, `no-new-knowledge`, nol capture/proposal. Metode sudah berada di Skill existing; tidak diduplikasi menjadi Memory dan tidak ada manfaat behavioral yang direkayasa. Kontrak, inspeksi Memory, episode dan checkpoint/review tidak dilewati. Dua review lama milik task lain tidak diubah. Koreksi EOL pada dua baris dokumentasi yang sempat ditandai `git diff --check` telah dituntaskan; diff check final lulus.

**Rollback Revisi 4:** gunakan `rollback_revision` owner ke baseline `7653a3c1…` dengan fencing digest aktif; source dapat dikembalikan lewat revert commit tugas. Jangan edit/delete catalog, staged atau history langsung. Pending `.changeset/rea-case-evidence.md` diperluas untuk patch yang sama; versi produk 1.6.0 tidak di-release ulang, tanpa tag/push.

**Audit tambahan yang diminta pengguna (read-only):** Native default sudah memakai `InProcessToolHost` internal. `agent-controller.ts:887–891` memasok taskId ke discovery; `agent-tool-session.ts:116–128,241–255` reuse registry per shape/service dan cache daftar nama. Factory bernama `createAgentCoreMcpServer` tetap dipanggil sebagai registrar, tetapi `server.ts:317,325–329` melewati pembacaan protokol/constructor MCP saat `toolTarget` diberikan; listing/call langsung memakai Map/handler (`in-process-tool-host.ts:68–106`). `AGENT_CORE_NATIVE_TOOL_TRANSPORT=mcp` adalah opt-in legacy; `per-task` tetap direct, tanpa exception fallback otomatis. HTTP MCP eksternal tetap jalur berbeda (`mcp/handler.ts`). Audit source Main/Raka ini tidak memverifikasi override environment proses atau ketersediaan Context7/Supabase pada Native; tidak ada perubahan kode Native atau tes tambahan.

### Hasil Revisi 1–3 (historis, selesai)

- [x] SKILL.md/reference baru ≤8.192 byte, tautan valid, parser/lint dan validasi source lulus.
- [x] Baseline pin, launcher/lock, lisensi dan delapan rujukan lama identik byte; semua tema pada tabel ditangani atau dikecualikan dengan bukti.
- [x] Review Raka atas isi final; kasus helper/showcase/JAR/test-target/containment/hardware tidak dinaikkan menjadi klaim global.
- [x] Stage/promote owner existing dengan expected active digest dan konfirmasi source-lineage; body serta reference aktif dibaca sampai akhir dan digest sama kandidat.
- [x] Aktivasi/build/restart sesuai jalur resmi, tanpa benchmark; hasil aktual dicatat tanpa mengarang refresh client.
- [x] CODEBASE/changelog/patch intent, Learning dan commit lokal task-owned selesai; dokumen diarsipkan setelah acceptance.

### Hasil implementasi dan bukti aktual

- Source final: `SKILL.md` 8.177 byte dan reference baru 7.406 byte. Pemeriksaan hash atas 15 berkas baseline menemukan hanya `SKILL.md` berubah; 14 lainnya tetap identik. Review akhir Raka menerima scope dan coverage setelah dua perbaikan: finite pass tidak menolak identitas byte yang memang teruji pada scope tertentu, dan kalimat benchmark mengikuti otorisasi/scope host existing tanpa gate portabel baru.
- `node scripts/verify/skill-pack-lint.mjs --strict` lulus: 42 pack, nol parser error, tanpa dangling link atau page warning pada target. Advisory inherited mengenai provenance JSON, file runtime yang tidak dibaca lewat Skill API dan boilerplate pack lain tidak diubah. Provenance existing tetap berada di reference source/runtime dan record owner.
- SkillService `validate` → `stage_revision` → `promote_revision` menghasilkan payload `sha256:7653a3c1ac81b5f5831556f6dbec14c3f0d1aac992f66049ddca95a9e0bb238e`, 16 berkas / 177.338 byte, dengan expected-active baseline dan `sourceLineageChanged=true`. User memilih rumah source canonical existing; konfirmasi lineage diberikan tanpa mengarang approval Native.
- `npm.cmd run build` lulus, termasuk path policy (532 berkas author), Skill homes (42 source / 47 managed), struktur (472 direktori) dan TypeScript. Publish launcher awal dengan SDK default 10.0.101 gagal `MSB4057: _ChooseAppHost`; target privat itu ada pada SDK 8.0.425 yang sudah terpasang. Publish lewat MSBuild SDK 8 existing berhasil, nol warning/error, tanpa mengubah guard/project. Restore mengunduh paket build/runtime .NET 8.0.31 existing dari NuGet ke cache pengguna; tidak menambah SDK atau dependency REA.
- Launcher hasil publish berada di `runtime/build/launcher/Agent Core.exe`, SHA256 `5ea48baf1204dafa231d25fe86a758983b487cc0399d4cf786338aee68d32116`. Binary root yang sedang dipakai tidak ditimpa; perubahan Skill dilayani oleh catalog external-data existing. Tidak ada klaim bahwa binary staging telah dipasang ke root.
- `restart_agent_core(capabilitiesChanged=true)` diminta sekali. Receipt `runtime/restart/6e0fbb64e99a4e15a74471b2ce432d36.json` selesai 2026-10-31 07:05:35 UTC, exit 0; Core baru PID 8240 mulai 07:04:54 UTC, readiness siap dan dist tidak basi. Satu pembacaan connector yang bertepatan restart tidak membalas; receipt diperiksa dahulu dan tidak ada restart kedua. Setelah readiness, koneksi pulih; kontrak dibaca/diakui ulang dan episode yang sama dilanjutkan.
- Client Codex menerima digest baru lewat bootstrap dan `skills(inspect)`. `skills(read)` body offset 0 → 7.763 → akhir serta reference offset 0 → akhir menghasilkan konten yang dicocokkan persis terhadap source. Bukti pemanggilan: `tool:ba7618f13b5343f19adf625afd829550`, `tool:e95ca0e8d99e43cfac797e819cb2ccfe`, `tool:51d0785862344ee4845de3f5f0886abc`, `tool:3fbc66f6857a449cbd8059010a13c74f`. Ini bukti discovery/readback client aktual; tidak ada klik Refresh tools pada ChatGPT/Claude yang diklaim. Schema Tool API tidak berubah.
- `.changeset/rea-case-evidence.md` mencatat intent patch, changelog dan CODEBASE diperbarui. Versi produk 1.6.0 tidak dirilis ulang; tidak ada tag/push/release. Tidak ada skrip donor, runtime REA, benchmark atau proyek eksternal yang dijalankan. Manfaat pada investigasi berikutnya belum diuji.
- Receipt penggunaan capability-index/skill-authoring (`applied`) dan mind-control (`adapted`) tercatat untuk keputusan/perubahan aktual, dengan `result=unavailable` dan `trustChanged=false`: tidak ada report workflow independen yang membuktikan efek tiap Skill. Format ID/parameter receipt awal ditolak, lalu diperbaiki berdasarkan schema/owner; tidak disamakan dengan kegagalan artifact atau bukti manfaat. Recall BM25 terpisah untuk recovery SDK tersedia tetapi hanya menghasilkan catatan path-governance yang tidak menjawab masalah SDK; ini bukan bukti recall kontekstual studi telah pulih.
- Commit implementasi: `c1fd61d606b11cc5dbae84d9ca2996e97b569d97`. Episode `ext-569fd0669dc344eba89bb8e3e92fdac4` mencatat outcome controller `verified`; verifier workflow independen tetap `unavailable`, terpisah dari hasil lint/build/readback aktual di atas. Learning checkpoint `study-awesome-rea-skill-upgrade-2026-10-31` (`verified-recovery`) dan explicit review `2dfadd4d-039a-48ed-84ca-a105bd1e8aac` selesai (`complete=true`). Satu kandidat recovery SDK ditahan sebagai proposal `awaiting-verification`, nol durable capture: owner memerlukan resolusi bukti/evaluasi efek lebih lanjut. Tidak ada klaim manfaat baru yang dipaksa masuk Memory, eksperimen tambahan atau pekerjaan implementasi tersisa untuk scope upgrade ini. Transfer studi sudah berada di rumah Skill existing, tidak diduplikasi ke Memory.
- Seluruh tema berguna dalam 24 berkas snapshot telah diterapkan, dinyatakan sudah tercakup, atau dikecualikan dengan alasan pada tabel scope. Batas penyelesaian ini tidak meliputi isi halaman/repo eksternal yang hanya ditautkan donor. Dokumen manusia-baca dipindahkan ke path arsip di bawah setelah Learning selesai; canonical Skill tetap milik SkillService.

Rollback: owner `rollback_revision` ke baseline digest di atas dengan current-active fencing; jangan menyalin/mengedit catalog/history langsung. Source dapat dikembalikan lewat revert commit task ini; jangan membuang perubahan orang lain.

## Riwayat revisi

- Revisi 1: studi 24 berkas, pemeriksaan silang Main/Raka dan review desain; implementasi/aktivasi sedang dituntaskan. Recall kontekstual Memory melaporkan `memory-source-unavailable`; list/read foundation, kontrak dan episode berhasil. Health satu kali `ok` v1.6.0; tidak dipakai untuk mengklaim retrieval pulih.
- Revisi 2: isi final, lint/validate, promotion, build/publish, restart resmi dan readback client selesai. Recall yang tidak tersedia tidak dicoba ulang atau dinyatakan pulih. Learning, commit dan pemindahan arsip dicatat saat penutupan.
- Revisi 3: acceptance ditutup; commit implementasi dan hasil Learning aktual dicatat, termasuk batas verifier/candidate. Status COMPLETED dan pemindahan ke arsip tanpa perubahan catalog/runtime lebih lanjut.
- Revisi 4: pengguna menunjuk donor berbeda `awesome-rea`; studi diperluas ke 38 kasus, tujuh metode tambahan diterapkan dan diaktifkan melalui owner existing, seluruh resource final dibaca kembali. Catatan Revisi 1–3 dipertahankan sebagai sejarah, bukan cakupan donor baru. Audit source tambahan mengonfirmasi default Native tool discovery internal tanpa MCP server.
- Revisi 5: pengguna menunjuk lima checkout secara eksplisit; audit delta terhadap adapter 2 memperluas lima metode tanpa menduplikasi reference lama. Coverage, disposition, counterevidence dan acceptance dicatat sebelum promosi; adapter 3 aktif, review/lint/build/restart/readback dan Learning selesai dengan batas manfaat yang jelas. Catatan diteruskan di arsip existing, tidak membuat proposal/state approval tandingan.

## Keputusan pengguna dan scope

Revisi 5 diminta langsung pada 2026-10-31: `study` lima donor dan **upgrade** target canonical. Scope upgrade mengikuti permintaan ini; tidak menunggu approval tambahan atau membuat dokumen proposal/state paralel. Tidak ada keputusan Native, izin benchmark/publikasi atau manfaat behavioral yang direkayasa. Riwayat Revisi 1–4 tetap dipertahankan.

User meminta `/study ... dan upgrade ...` secara langsung pada 2026-10-31; Revisi 4 melaksanakan donor `awesome-rea` yang disebut dalam permintaan saat ini. Scope tambahan audit MCP/internal tool diminta langsung pada sesi yang sama dan selesai sebagai pemeriksaan source. Standing task-scoped auto-trust Agent Core berlaku; tidak ada persetujuan Native, benchmark, rilis/tag/push atau grant baru yang direkayasa. Lokasi asal historis: `docs/proposals/Penguatan-Bukti-Kasus-REA.md`. Catatan lengkap diteruskan pada arsip existing `docs/history-agent-core/Penguatan-Bukti-Kasus-REA.md`, tanpa proposal/state approval baru.
