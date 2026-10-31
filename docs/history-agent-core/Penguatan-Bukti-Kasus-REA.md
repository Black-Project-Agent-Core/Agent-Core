# Penguatan Bukti Kasus dan Atribusi REA

Tanggal: 2026-10-31
Revisi: 3
Status: COMPLETED
Selesai: 2026-10-31
Jenis: Improvement — revisi Skill existing yang diminta langsung
Asal dan bukti: R1 `E:\Projects\Learning\awesome-reverse-engineer-anything`, commit `641331f4bdbe1a6cd7199d5d0215397bc6ae246d`, CC0-1.0; R2 `runtime/skills/capability-packs/reverse-engineer-anything/`, baseline payload `sha256:df33d0ad9abe476ab2d161c860b1bffa866737bb1f7ce2180abb97a3f56dff3c`.

## Masalah dan tujuan

User meminta studi mendalam R1 dan langsung meng-upgrade R2 sampai seluruh bahan berguna pada snapshot referensi ditangani. R1 adalah katalog klaim komunitas, bukan implementasi REA. Nilai utamanya ialah disiplin atribusi, batas klaim dan pelajaran kegagalan; keberadaan tautan tidak membuktikan hasil proyek yang ditautkan. Upgrade memakai rumah Skill pertama dan alur revisi owner existing.

## Bukti dan ketidakpastian

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

## Keputusan pengguna dan scope

User meminta `/study ... dan upgrade ...` secara langsung pada 2026-10-31. Standing task-scoped auto-trust Agent Core berlaku; tidak ada persetujuan Native, benchmark, rilis/tag/push atau grant baru yang direkayasa. Lokasi asal: `docs/proposals/Penguatan-Bukti-Kasus-REA.md`. Lokasi arsip tujuan: `docs/history-agent-core/Penguatan-Bukti-Kasus-REA.md`.
