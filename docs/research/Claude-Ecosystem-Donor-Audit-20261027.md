# Claude ecosystem donor audit

Tanggal: 2026-10-27
Status: laporan riset hanya-baca; tidak ada source, Skill, konfigurasi, atau layanan yang diubah oleh studi ini
Proposal turunan: [Claude-Ecosystem-Donor-Proposals](../history-agent-core/Claude-Ecosystem-Donor-Proposals.md)
Folder bukti: [claude-ecosystem-donor](claude-ecosystem-donor/) (temuan lengkap per irisan, `traceability.tsv`, `ATTRIBUTION.md`, laporan pemeriksa independen)

## Tujuan
Perintah pengguna (`/goal`, 2026-10-27): pelajari tiga folder referensi sedalam mungkin dan cari setiap bagian yang dapat memperkuat Agent Core. Hasilnya menjadi satu proposal upgrade. Laporan ini mencatat sumber, metode, hasil, batas cakupan, dan verifikasi, supaya proposal dapat diaudit.

## Sumber
| Sumber | HEAD | Tanggal | File terlacak | Lisensi |
|---|---|---|---|---|
| `E:\Projects\Side-Project-Dont-Touch\claude-code` | `a5b0f2e` | 2026-10-26 | 1.615 | All rights reserved |
| `...\claude-plugins-official` | `5826794` | 2026-10-23 | 591 | Apache-2.0 (root) |
| `...\knowledge-work-plugins` | `33d3dea` | 2026-10-21 | 1.285 | Apache-2.0 (root) |

Studi `claude-code` sebelumnya (revisi `b782847`, 1.153 file) dan lima usulan yang sudah diimplementasikan hari ini tercatat di `docs/history-agent-core/`. Laporan ini hanya memakai delta dan area yang belum pernah dibaca penuh.

## Metode
Delapan irisan dibagi per folder dan per jenis isi, dibaca oleh pekerja baca-saja dengan brief bersama ([METHOD-worker-brief](claude-ecosystem-donor/METHOD-worker-brief.md)): baseline Agent Core, doktrin, kendala (anggaran manifest tool, anggaran teks selalu-dimuat), format temuan, dan larangan mengubah apa pun. Tiap temuan wajib memuat sumber dengan baris, baseline Agent Core hasil pembacaan, celah, perubahan terkecil, lisensi, skala, risiko, dan pemisahan bukti dari dugaan. Putaran kedua membaca penuh bagian CHANGELOG yang semula hanya di-skim. Putaran ketiga dan keempat (enam dan tiga pekerja) menutup celah file yang hanya di-skim atau tidak dibuka. Pekerja tidak boleh membuat subagen; satu Raka tidak dipakai karena kontrak membatasi satu penugasan.

| Berkas temuan | Irisan | Temuan |
|---|---|---|
| W1, W1b | `CHANGELOG.md` (8.192 butir) | 29, 14 |
| W2, W9a, W9d, W10b | `claude-code/mods` | 19, 13, 11, 7 |
| W3 | `claude-code` selain `mods` dan CHANGELOG (237 file) | 20 |
| W4, W9b, W10a | `claude-plugins-official/plugins` | 22, 20, 14 |
| W5 | `claude-plugins-official` sisanya (317 file) | 30 |
| W6, W9c, W9e, W9f, W10c | `knowledge-work-plugins` inti, sales/marketing/support, regulated/ops, engineering | 24, 9, 11, 9, 6 |
| W7 | `bio-research`, `small-business` | 14 |
| W8 | `partner-built` (disimpan hanya untuk keterlacakan; dikecualikan) | 18 |
| Total | 18 pekerja | **290** |

## Hasil
`traceability.tsv` memetakan **290 dari 290** temuan: 219 ke 14 paket proposal, 31 sebagai referensi tanpa tindakan, 40 dikecualikan.

| Paket | Temuan | Paket | Temuan |
|---|---|---|---|
| UP-01 Scanner `changed_source` | 21 | UP-08 Skill baru (empat) | 6 |
| UP-02 Adapter plugin Claude | 19 | UP-09 Delta referensi Skill | 18 |
| UP-03 Penjaga proses dan perintah | 15 | UP-10 Kualitas dan admisi Skill | 22 |
| UP-04 Integritas berkas dan git | 22 | UP-11 Vonis bukti | 18 |
| UP-05 Keandalan loop Native | 19 | UP-12 Bersyarat | 11 |
| UP-06 Anggaran teks dan manifest | 10 | UP-13 UI dan observabilitas | 10 |
| UP-07 Konten tak tepercaya, OAuth | 18 | UP-14 Proses repo dan ekosistem | 10 |

Tidak ada paket yang membutuhkan skema tool MCP baru. Disposisi pekerja: ADOPT sedikit (perbaikan internal berbasis teknik donor), ADAPT mayoritas, REFERENSI sisanya; tidak ada yang disalin.

## Pengecualian atas keputusan pengguna
Finance; aplikasi lintas-platform dan SaaS (Zoom, Slack, Telegram, Discord, iMessage, fakechat, Asana, Linear, Common Room, Apollo, brand-voice); dan seluruh non-coding (`sales`, `marketing`, `customer-support`, `human-resources`, `legal`, `bio-research`, isi domain `small-business`, `productivity`, `operations`, `product-management`, `pdf-viewer`, riset dan ux-copy `design`, math, playground, output-style). Pemilahan: isi domain dibuang; pola perilaku agen atau arsitektur Skill yang kebetulan ditemukan di folder itu tetap dipakai bila punya bukti independen dari source Agent Core. Daftar ID: kolom `package` pada `traceability.tsv` (`EXCL-FIN`, `EXCL-APP`, `EXCL-ZOOM`, `EXCL-NONCODE`).

## Verifikasi
- **Main** memeriksa ke source Agent Core: cacat scanner `changed_source`, regex tautan adapter (diukur kuadratik), celah adapter, `kill_process`, `finishReason`, `core.fsmonitor`, enkode `text.ts`, `change-review.ts`, `registerClient`, dan jumlah pack yang menyebut berkas di luar `references/`. Satu klaim Main keliru (empat pack; benar 11) dan diperbaiki sebelum pemeriksa bekerja.
- **Pemeriksa independen** (pembaca baca-saja yang bertugas membantah): 63 klaim, 41 CONFIRMED, 14 PARTIAL, 2 REFUTED, 6 UNVERIFIABLE. Koreksi terbesar: pemotongan 128 file scanner tidak terjangkau lewat tool (skema `.max(128)`); penjaga hapus dialamatkan ke jalur shell; tujuh (bukan enam) pemanggil git; `.gitattributes` sudah ada; `Steal.txt` berisi banyak kunci. Semua koreksi wajib diterapkan pada proposal. Laporan: [V1-verification-report](claude-ecosystem-donor/V1-verification-report.md).
- Tidak ada kode donor yang dijalankan dan tidak ada tes Agent Core yang dijalankan untuk studi ini. Pengukuran regex memakai salinan regex pada `node -e` tanpa mengimpor kode proyek.

## Cakupan dan batasnya
Setiap file terlacak mempunyai baris pada ledger pekerja dan jumlah ledger sama dengan `git ls-files` per irisan, tetapi **tidak semua file dibaca penuh**. Menurut pekerja: CHANGELOG 51% butir dibaca penuh (sisanya UI terminal, IDE, cloud, prefiks produk dipindai kata kunci); `mods` d.ts 55–65% baris, `hooks` sumber non-barrel dibaca penuh dan 146 sampai 406 barrel dibuktikan murni; `claude-code` lain ±57% penuh; `plugins-official` bagian A 44%, bagian B 58%; `knowledge-work-plugins` inti 46% dan beragam. Yang tidak terbaca: biner, lockfile, library minified, fixture, badan sebagian besar tes (hanya judul), UI pane terminal, dan folder yang dikecualikan. Temuan baru per putaran: 13, 20, 9, 11, 11, 9, 14, 7, 6; pengembalian menurun tetapi tidak nol, sehingga klaim "tidak ada yang tersisa" **tidak dapat dibuktikan**.

## Pertanyaan terbuka dari pekerja (diteruskan ke keputusan pemilik di proposal)
- Penjaga hapus katastropik refusal-only atau penasihat (D1); `-NoProfile` pada PowerShell 5.1 (D6); `-c safe.directory` pada pembantu git (sengaja?); apakah revisi referensi pada paket Addy yang di-pin `UPSTREAM.json` boleh (UP-09); apakah uji tracker ujung ke ujung dijalankan sebelum memperbaiki `featureId` Skill (UP-13).

## Keterbatasan
Changelog mencatat perilaku, bukan kode; klaim tentang internal Claude Code adalah inferensi. Source engine Claude Code tidak ada di checkout. Manfaat tiap paket belum diukur; tidak ada benchmark kecepatan yang diusulkan (keputusan pemilik). Angka cakupan dan hitungan temuan per pekerja adalah laporan pekerja, bukan hitungan ulang Main kecuali yang tertulis di bagian Verifikasi.
