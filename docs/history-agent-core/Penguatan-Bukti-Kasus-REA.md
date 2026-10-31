# Penguatan Bukti Kasus dan Atribusi REA

Tanggal: 2026-10-31
Revisi: 4
Status: COMPLETED
Selesai: 2026-10-31
Jenis: Improvement — revisi Skill existing yang diminta langsung
Asal dan bukti: R1 `E:\Projects\Learning\awesome-reverse-engineer-anything`, commit `641331f4bdbe1a6cd7199d5d0215397bc6ae246d`, CC0-1.0; R2 `runtime/skills/capability-packs/reverse-engineer-anything/`, baseline payload `sha256:df33d0ad9abe476ab2d161c860b1bffa866737bb1f7ce2180abb97a3f56dff3c`.

Tambahan Revisi 4: R3 `E:\Projects\Learning\awesome-rea`, katalog MIT oleh Sanbu, commit `9aac7d1121f4f2685109b899d92dde8b297871c5`; R4 [DX-Ball evidence](https://github.com/morluto/rea/blob/42fc6c53ae188978deb3bedfe88287b6b316ba22/website/evidence/dx-ball-sound-pan.md); R5 [known-source controls](https://github.com/UnknownHacker1/rea-groundtruth/blob/5b48f366368c9fbe2abaaab810aba6814c27190b/README.md); R6 [Open Scrantic ENGINE](https://github.com/glauberlima/open-scrantic/blob/8c049614158f2adb09e517ce9e29da89e8a3ac38/docs/ENGINE.md). R4–R6 dibaca sebagai teks publik secara read-only, bukan dieksekusi. Kredibilitas R3 moderat sebagai kurator dengan pin/tanggal dan batas reproduksi; R4–R6 primer tetapi hasil runtime tetap laporan penulis.

## Masalah dan tujuan

**Perluasan Revisi 4:** instruksi pengguna kali ini menunjuk `Learning/awesome-rea`, bukan `Learning/awesome-reverse-engineer-anything` pada Revisi 1–3. Lanjutkan catatan yang sama dan rumah Skill existing; hasil dan digest lama di bawah tetap riwayat, bukan bukti untuk donor baru. Pengguna meminta implementasi langsung, sehingga batas proposal-only skill study diadaptasi sesuai instruksi tersebut.

User meminta studi mendalam R1 dan langsung meng-upgrade R2 sampai seluruh bahan berguna pada snapshot referensi ditangani. R1 adalah katalog klaim komunitas, bukan implementasi REA. Nilai utamanya ialah disiplin atribusi, batas klaim dan pelajaran kegagalan; keberadaan tautan tidak membuktikan hasil proyek yang ditautkan. Upgrade memakai rumah Skill pertama dan alur revisi owner existing.

## Bukti dan ketidakpastian

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

**Tambahan Revisi 4:** `references/investigation-methods.md` menjadi satu rumah prosedur baru di pack existing; `SKILL.md` hanya menambah routing selektif dan metadata `adapter-revision: 2`. Seluruh sembilan reference lama tetap identik. Native dan external membaca artifact yang sama melalui SkillService; perubahan ini tidak menambah parser/decompiler/API. Polyglot dipertimbangkan: prosedur Markdown dan lifecycle Node existing memadai, sehingga bahasa/runtime/FFI tambahan tidak memberi manfaat terjustifikasi. Panduan seam tetap meminta pemilihan bahasa menurut komponen bila kelak implementasi nyata memerlukannya.

Sumber hanya di `runtime/skills/capability-packs/reverse-engineer-anything/`. Tambah `references/case-evidence.md` dan pointer/aturan data pada `SKILL.md`; rapikan kalimat ekuivalen agar entrypoint tetap satu halaman. Pertahankan delapan rujukan operasional, launcher, manifest/lock, lisensi dan pin 6.5.0/revisi upstream 42. Catalog/history dikelola SkillService melalui validate → stage_revision → promote_revision → readback; tidak ditulis langsung.

Alur `decide_proposal` yang diamati di `src/skills/service.ts:598–680` merender ulang SKILL.md dari template proposal dan mempertahankan hanya ancillary files baseline; tidak mewakili penambahan reference ini secara utuh. Karena user meminta implementasi langsung, gunakan jalur revisi source existing, bukan membuat approval Native palsu atau mengganti adapter dengan template. Dokumen ini catatan studi/implementasi, bukan state approval Skill tandingan.

## Scope, batas Native, risiko dan otorisasi

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

Harapan: laporan membedakan siapa membuktikan apa, scope rekonstruksi dan batas lingkungan/reuse. Verifikasi artifact/lifecycle tidak membuktikan hasil reverse engineering lebih akurat. Atribusi beberapa perubahan sekaligus `confounded`; tidak ada klaim causal benefit. Profil nilai R1: method, cautionary, vocabulary; yang paling bernilai ialah prosedural/negatif. Bukti berikutnya untuk outcome empiris memerlukan primary project/artifact/oracle dan eksperimen yang diizinkan; itu bukan pekerjaan terbuka pada snapshot studi ini.

## Acceptance, evaluasi dan rollback

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

## Keputusan pengguna dan scope

User meminta `/study ... dan upgrade ...` secara langsung pada 2026-10-31; Revisi 4 melaksanakan donor `awesome-rea` yang disebut dalam permintaan saat ini. Scope tambahan audit MCP/internal tool diminta langsung pada sesi yang sama dan selesai sebagai pemeriksaan source. Standing task-scoped auto-trust Agent Core berlaku; tidak ada persetujuan Native, benchmark, rilis/tag/push atau grant baru yang direkayasa. Lokasi asal historis: `docs/proposals/Penguatan-Bukti-Kasus-REA.md`. Catatan lengkap diteruskan pada arsip existing `docs/history-agent-core/Penguatan-Bukti-Kasus-REA.md`, tanpa proposal/state approval baru.
