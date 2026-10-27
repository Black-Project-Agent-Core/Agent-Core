# Atribusi dan lisensi: Claude ecosystem donor audit

Tanggal: 2026-10-27. Berlaku untuk folder ini dan untuk `docs/proposals/Claude-Ecosystem-Donor-Proposals.md`.

Studi ini membaca tiga checkout lokal secara baca-saja. **Tidak ada kode atau teks donor yang disalin ke source, Skill, atau konfigurasi Agent Core.** Semua temuan adalah gagasan mekanisme yang ditulis ulang dengan kata sendiri; kutipan di berkas temuan dibatasi satu kalimat pendek. Bila implementasi kelak menyalin teks yang dilisensikan, atribusi dan `THIRD_PARTY_NOTICES.md` harus diperbarui pada tugas yang sama.

| Sumber | Revisi dibaca | Lisensi | Catatan |
|---|---|---|---|
| `claude-code` | `a5b0f2e03aba37ea34e527fe30b2f6aaa4895b9f` (2026-10-26) | All rights reserved, Anthropic Commercial Terms (`LICENSE.md`) | Hanya gagasan mekanisme; reimplementasi mandiri; jangan menyalin kode atau teks. |
| `claude-plugins-official` | `58267944f92187b7d6a1c822165c96c81c864806` (2026-10-23) | Apache-2.0 di root | Setiap plugin membawa `LICENSE` sendiri; `claude-security` berlisensi proprietary dan melarang pemakaian untuk produk non-Anthropic (hanya gagasan yang diambil); README `hookify` dan `pr-review-toolkit` menulis MIT sementara file LICENSE-nya Apache-2.0. |
| `knowledge-work-plugins` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` (2026-10-21) | Apache-2.0 di root | `LICENSE` root memuat paragraf asing di ujung (dari PR kontributor `d6c8015`); `small-business` tidak punya `LICENSE` sendiri dan tidak ada `NOTICE`; plugin `partner-built` (Zoom, brand-voice, apollo, slack) berlisensi MIT sendiri, `common-room` Apache-2.0. |

Working tree ketiga checkout tampak termodifikasi pada beberapa berkas, tetapi pekerja menemukan perbedaannya hanya akhir baris (indeks LF, working tree CRLF); isi `marketplace.json`, policy, dan `bump-tracking.json` sama dengan HEAD. Tidak ada berkas donor yang diubah.

Keputusan pengguna 2026-10-27 mengecualikan finance, aplikasi lintas-platform (termasuk Zoom) dan seluruh bagian non-coding dari proposal. `W8-knowledge-work-partner-built.md` tetap disimpan di folder ini **hanya untuk keterlacakan ID** (temuan `KWP-*` yang dipetakan ke pengecualian di `traceability.tsv` dan beberapa yang dipertahankan dengan bukti independen). Berkas itu bukan bagian dari proposal dan dapat dihapus atas permintaan pengguna.
