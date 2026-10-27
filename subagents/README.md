# Subagents: Raka, partner tetap untuk Main

Raka adalah partner serbaguna bagi AI utama (Main) yang memakai Agent Core. Identitas logisnya tetap `raka`; Main tetap memiliki task, keputusan akhir, dan tanggung jawab verifikasi. Tujuannya membagi pekerjaan yang dapat berjalan mandiri, menjaga kontinuitas, dan menghindari pengulangan setup.

## Panduan yang dibaca seperlunya

- [Profil dan kontrak kerja Raka](raka.md): baca saat membuat instance atau ketika profil berubah.
- [Raka di host Claude Code dan model Anthropic](CLAUDE_CODE_HOST.md): baca saat Main berjalan di Claude Code, Claude Agent SDK, atau sesi Cowork dan cloud yang tertaut, dan host tidak punya `collaboration.*`. Panduan itu membuat subagen generik dengan tool `Agent` dan menempelkan isi `raka.md` ke brief.
- [Memory Cortex bersama](CORTEX_MEMORY.md): baca saat memakai atau memulihkan memory.
- [Bukti setup dan batas verifikasi](VERIFICATION.md): rujukan historis; periksa kapabilitas host saat ini.
- Root dokumen adalah `<PROJECT_ROOT>\subagents`. Root aktif diperoleh melalui Agent Core; workspace task dapat berada di proyek lain.

## Discovery melalui Agent Core

Setelah bootstrap, inspeksi Memory, dan pemilihan task, AI eksternal dapat memakai `controller_learning(action=context, workspace=<workspace-terdaftar>, query=<task>)`. Inventory `capabilities.inventory` dan `synthesis.capabilityExposure.inventory` memuat `external:raka`, sumber profil dengan path dinamis/digest byte, dan contoh pemanggilan pada `invocation`. Petunjuk ringkas juga masuk ke teks konteks meskipun katalog Skill besar. Baca isi panduan/profil terpilih sebelum membuat paket delegasi; inventory tidak menyalin seluruh dokumen.

`profile.status=available` hanya menyatakan panduan utama dan profil lokal tersedia. `availability` dan `execution.availability` tetap `unknown` sampai Main memeriksa fasilitas host dan instance aktual. Agent Core tidak menjalankan subagent melalui MCP, mengklaim instance aktif, atau memberi izin baru. Contoh `collaboration.*` berlaku hanya jika host benar-benar menyediakan schema tersebut. Host tanpa subagent tetap dapat mengerjakan task melalui Main. Profil utama hilang/kosong/melebihi batas baca menghasilkan status `unavailable` tanpa menghambat capability lain. Panduan Cortex yang tidak tersedia dilaporkan terpisah; kolaborasi lokal tetap dapat dilakukan.

## Cara memanggil dan memakai ulang

Gunakan API lifecycle subagent milik host saat ini. Nama tool dan argumen di bawah merupakan contoh untuk host dengan schema yang sesuai; sesuaikan dengan fasilitas yang benar-benar tersedia.

> **Host Claude Code atau model Anthropic tanpa `collaboration.*`:** jangan berhenti di contoh `collaboration.*` di bawah. Ikuti [CLAUDE_CODE_HOST.md](CLAUDE_CODE_HOST.md): buat subagen generik dengan tool `Agent`, tempel isi `raka.md` ke brief, lalu pakai `SendMessage` dan `TaskStop` untuk mengarahkan atau menghentikannya. Langkah 1 sampai 7 di bawah tetap menjadi lifecycle-nya; yang berbeda hanya nama tool.

1. Selesaikan bootstrap Agent Core dan inspeksi Memory kanonis sesuai `AGENTS.md`. Tentukan satu bagian task yang bermanfaat untuk Raka; Main mengerjakan bagian lain secara paralel.
2. Periksa inventory host dengan `collaboration.list_agents()`. Gunakan nama kanonis yang benar-benar dikembalikan host; contoh pada Main root adalah `/root/raka`.
3. Jika Raka masih mengerjakan task yang sama, gunakan `send_message` untuk koreksi atau tambahan konteks. Jangan menimpa pekerjaan aktif dengan task lain; tunggu hasil atau hentikan dengan `interrupt_agent` bila pengguna mengubah arah.
4. Jika Raka selesai/idle dan host masih mengenalinya, gunakan `followup_task` dengan target yang sama. Kirim paket task baru beserta batasnya; pekerjaan lama bukan izin untuk melanjutkan sendiri.
5. Hanya jika instance tidak tersedia atau host menyatakan tidak dapat dipakai ulang, buat instance bernama `raka` melalui `spawn_agent`. Baca profil, lalu sertakan isi kontrak inti dan paket task di pesan awal. Menyebut path saja tidak memuat isinya.
6. Di sesi baru, pulihkan identitas melalui profil dan beberapa record Cortex yang relevan. Proses agent, ID runtime, seluruh riwayat chat, dan isi konteks lama tidak dijamin bertahan. Jangan membuat nama acak sebagai pengganti kontinuitas.
7. Main membaca hasil, memeriksa bukti yang memengaruhi keputusan, mengintegrasikan perubahan yang diterima, dan memberikan hasil akhir kepada pengguna.

Gunakan fasilitas subagent dan schema yang benar-benar tersedia pada host saat ini. Nama tool dan argumen berikut adalah contoh untuk host dengan API yang sesuai; sesuaikan dengan host lain. Panggil fasilitas kolaborasi host secara langsung.

Untuk reuse setelah inventory membuktikan Raka masih tersedia, panggil `collaboration.followup_task` dengan payload seperti:

```json
{"target":"raka","message":"Paket task baru: tujuan, scope, sumber, batas tindakan, dan hasil yang diminta."}
```

Hanya bila belum ada instance yang dapat dipakai, panggil `collaboration.spawn_agent` dengan payload seperti:

```json
{"task_name":"raka","fork_turns":"none","message":"Isi profil inti Raka yang sudah dibaca, lalu paket task aktual."}
```

Ganti teks contoh dengan instruksi nyata sebelum memanggil. Jangan menjalankan kedua contoh untuk task yang sama.

## Paket task yang ringkas

Sertakan tujuan dan definisi selesai; workspace/root yang benar; task key; temuan terkini; sumber/path yang perlu dibaca; izin tindakan dan file yang boleh diedit; larangan yang relevan; hasil yang diminta; serta pemeriksaan yang diperlukan. Mulai dengan ringkasan dan pointer yang dapat diakses, lalu tambah detail sesuai kebutuhan. Path Windows membutuhkan akses Agent Core; path itu tidak otomatis tersedia pada filesystem host.

Untuk setiap task Agent Core, sertakan [docs/PROJECT-STRUCTURE.md](../docs/PROJECT-STRUCTURE.md), bagian root/owner relevan, dan larangan rumah paralel dalam brief. Main dan Raka wajib memeriksa peta serta filesystem sebelum membuat folder. Rumah pertama Skill adalah `runtime/skills`; sumber hanya `runtime/skills/capability-packs`. Folder baru untuk tujuan existing dilarang. Profil Raka memuat aturan yang sama agar ikut terbawa saat profil ditempel ke host lain.

Batasi satu penugasan utama Raka pada satu waktu. Tentukan pemilik setiap file. Main dan Raka tidak mengedit file yang sama secara bersamaan; untuk area bertumpang tindih, minta analisis atau patch usulan dan biarkan Main mengintegrasikannya. Setelah perubahan material, validasi kondisi sumber terkini.

Contoh tugas pengguna: "Panggil Raka untuk meninjau risiko perubahan ini; kamu kerjakan implementasinya." Contoh lain: "Minta Raka mencari sumber, lalu kamu susun laporannya." Main juga dapat memakai Raka tanpa pengguna mengulang namanya jika task memiliki bagian mandiri dan tidak ada larangan khusus.

## Efisiensi dan penghentian

Gunakan Raka untuk riset, analisis, implementasi, review, pengujian, data, desain, penulisan, atau operasi yang didukung tool dan izin task. Lewati delegasi untuk pekerjaan sederhana yang lebih cepat dituntaskan langsung. Penggunaan satu partner tetap tidak dengan sendirinya menurunkan token, menghapus limit, atau mempercepat semua task.

Baca discovery secara ringkas, ambil detail terpilih, dan jangan menyalin seluruh memory/log/repository ke setiap penugasan. Minta keluaran berupa hasil, bukti, dan ketidakpastian. Bila dua putaran tidak menghasilkan bukti atau kemajuan baru, Main mengecilkan ruang lingkup atau mengerjakan bagian tersebut langsung.

Jika pengguna meminta tunda, hentikan pekerjaan terkait dan simpan status faktual. Jika ada Raka aktif pada pekerjaan itu, kirim penghentian melalui host; hentikan proses eksternal secara terarah hanya bila proses tersebut benar-benar dibuat oleh task. Jangan mengaktifkan task pending dari memory tanpa instruksi pengguna.

Jika `collaboration.*` tidak tersedia tetapi host punya tool subagen generik (misalnya `Agent` di Claude Code), ikuti [CLAUDE_CODE_HOST.md](CLAUDE_CODE_HOST.md). Jika host tidak punya fasilitas subagen sama sekali, gunakan panduan sebagai referensi dan laporkan bahwa partner tidak bisa dijalankan pada host itu. Jangan mengklaim ada agent aktif atau menginstal layanan pengganti secara otomatis.
