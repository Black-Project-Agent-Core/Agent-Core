# Raka — bukti setup dan batas penggunaan

Task: `raka-partner-setup-20261018`. Root yang diverifikasi: `E:\Projects\Agent-Core`. Tanggal observasi: 2026-10-17 UTC. Ini catatan setup historis; panduan aktif adalah [README.md](README.md), [raka.md](raka.md), dan [CORTEX_MEMORY.md](CORTEX_MEMORY.md).

## Pemeriksaan operasional

| Pemeriksaan | Hasil dan dasar bukti |
| --- | --- |
| Pembuatan partner | Host mengembalikan instance kanonis `/root/raka` untuk `task_name=raka`. |
| Pemanggilan ulang | Main memanggil `followup_task` pada Raka yang sama; Raka menerima task baru, menjawab dengan identitas yang sama, dan melaporkan konteks startup masih tersedia. Tidak dibuat agent pengganti untuk uji ini. |
| Penulisan profil oleh Main | Satu panggilan awal ditolak sebelum dispatch karena katalog tool berubah. Panggilan setelah refresh diterima queued dengan job `eb69c936-f9f9-464a-9845-82e4735f792f`; search berikutnya mengembalikan `saved=true`, verdict `NOVEL`, dan ID final. |
| Readback profil oleh Main | Fetch ID `222eb134-ee34-472d-be70-34475e9e3244` berhasil; isi lengkap yang dikirim Main ditemukan dalam respons, dengan tambahan header dari Cortex. |
| Pembacaan bersama oleh Raka | Pada followup, Raka berhasil fetch ID profil Main yang sama melalui konektor Cortex. Ini observasi yang dilaporkan Raka; Main juga membaca langsung record yang dirujuk. Raka tidak mengklaim memeriksa file Windows. |
| Startup write Raka pertama | Dihentikan Main ketika belum ada hasil kembali; respons di agent menyebut aborted. Status simpan, job ID dan record ID unknown. Write ini tidak diulang dan tidak dihitung sebagai keberhasilan. |
| Observasi baru yang diajukan Raka | Satu write untuk judul berbeda diajukan; tidak ada respons penerimaan/penyimpanan sampai Main menghentikan penungguan sekitar 326 detik. Status unknown; tidak ada retry atau polling. |
| Wiring AGENTS | Kontrak Agent Core dibaca kembali dan diakui. Isi lengkap sama dengan kontrak sebelumnya ditambah tepat satu bagian Raka yang ditinjau. |
| Pemeriksaan file Windows | Pada `2026-10-17T21:01:19.293435+00:00`, ketiga panduan cocok byte UTF-8 dengan teks yang ditinjau. Mengeluarkan hanya bagian tambahan dari AGENTS/CODEBASE menghasilkan hash baseline sebelum edit yang sama. |
| Git dan versi | HEAD, byte Git index, dan package.json tidak berubah pada pemeriksaan tersebut. Perubahan lokal sebelumnya dipertahankan. Tidak ada commit, push, build, reload, atau perubahan Native oleh setup ini. |

Profil bersama: [record Cortex dari Main](https://skynetlab-cortex.com/?m=222eb134-ee34-472d-be70-34475e9e3244). Metadata konektor dan tags yang dinormalisasi bukan bukti identitas proses host atau ACL privat.

## Identitas byte yang diperiksa

Hash panduan di bawah mengikuti teks akhir yang dibaca kembali pada `2026-10-17T21:08:46.304245+00:00`, termasuk contoh payload host dan jalur Main sebagai penulis memory. Hash AGENTS/CODEBASE mengikuti pemeriksaan preservasi di atas.

| Berkas | SHA-256 Windows pada pemeriksaan |
| --- | --- |
| `subagents/README.md` | `c0060769f031b533a5fd3209f45e710e840eea81f8779b1d87ef3cbedba9b460` |
| `subagents/raka.md` | `d692a56038903857ed4fdbc4aaf42938a53832c150f3427eebafef98684cc3de` |
| `subagents/CORTEX_MEMORY.md` | `fcdf9ab6421d19a7975831af72068592ebf293c8d7456721d0108641385888f5` |
| `AGENTS.md` | `6d3e8d82d9977255b12b4319d4c3c8a7ae2ad46a0cd5e5fe9458c29d1c6b3c80` |
| `docs/CODEBASE.md` | `989ab5f9974a23f23213f19c1f459c3e86d10957d5754ad5053588e248b72873` |

Checkpoint file sebelum edit: `f519d074-b8ef-4fb9-a3a7-301a03a22a74`, diminta untuk AGENTS.md dan docs/CODEBASE.md. Jangan memulihkan seluruh riwayat checkpoint tanpa preview dan pemeriksaan ruang lingkup. CODEBASE menerima perubahan dari pekerjaan lain antara inspeksi awal dan checkpoint; verifikasi memakai byte checkpoint aktual dan mempertahankan perubahan tersebut.

## Penulisan observasi

Dua judul yang hasil tulisnya belum diketahui: `Raka | agent-core | startup | 2026-10-18` dan `Raka | agent-core | observation | shared-memory-read-20261017`. Keduanya dihentikan Main saat pemanggilan belum memberikan respons Cortex; label host adalah `aborted by user`. Job ID, record ID, status queued dan hasil simpan tidak diterima. Jangan menganggapnya gagal tersimpan atau mengulang write secara buta; cek outcome/record yang relevan bila Cortex dipakai lagi.

Kemampuan tulis langsung Raka belum terverifikasi. Jalur penggunaan yang sudah dibuktikan dan menjadi default adalah Raka membaca/mengusulkan catatan, kemudian Main menulis serta melakukan readback pada catatan yang diterima. Profil Main `222eb134-ee34-472d-be70-34475e9e3244` sudah tersimpan dan dapat dibaca kedua agent. Tidak ada tindakan instalasi atau konfigurasi pengguna yang diperlukan untuk memakai jalur tersebut.

## Batas kesimpulan

Bukti setup mencakup orkestrasi host, akses Cortex yang disebut di atas, wiring dokumen, dan integritas perubahan dokumen. Tidak dilakukan benchmark token, pembuktian percepatan lintas task, pengujian semua tool, atau uji proses hidup lintas chat. Retensi Cortex dan ketersediaan konektor tetap mengikuti layanan/host.

Profil memberi nama, peran dan aturan kerja yang dapat digunakan ulang. Ia tidak mendaftarkan daemon, memasang plugin, memberikan kredensial, mengubah konfigurasi host, atau membuat engine memory baru. Main menilai hasil setiap task dan tetap menjalankan kontrak Agent Core serta Learning yang berlaku.

Task rekonsiliasi efisiensi Codex-Design tidak dilanjutkan oleh setup ini. Instruksi pending berada pada Memory kanonis `73b79b16-fbb0-411b-9217-9ec8705568ad`; hanya instruksi pengguna yang dapat melanjutkannya.
