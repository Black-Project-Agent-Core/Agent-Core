# Rencana perbaikan kewajiban memori Agent-Core

Rencana acuan ini didasarkan pada [audit 9 September 2026](memory-lifecycle-audit-2026-09-09.md). Perbaikan kewajiban kesehatan, validitas konteks, keputusan penyimpanan, dan pemulihan penutupan dijelaskan dalam [kontrak stabilitas saat ini](stability.md). Daftar di bawah mempertahankan sasaran audit; keberhasilan setiap sasaran harus dibuktikan oleh pengujian dan verifikasi runtime, bukan disimpulkan dari rencana ini.

## 1. Pulihkan scope data tanpa melemahkan isolasi

- Inventarisasi segmen dengan pemilik kosong dan hubungkan ke provenance/event pemilik yang dapat diverifikasi. Jangan menetapkan seluruh isi vault ke pengguna pertama yang terhubung.
- Buat rencana migrasi eksplisit per segmen, salinan pemulihan, dan verifikasi hash sebelum perubahan. Jika kepemilikan tidak bisa ditentukan, tahan segmen tersebut untuk rekonsiliasi.
- Terapkan migrasi atomik pada metadata pemilik yang terbukti; pertahankan ID, revisi, relasi, dan isi. Perbarui proyeksi dan mirror setelah canonical state terverifikasi.
- Tolak data baru tanpa pemilik valid. Health harus membedakan vault kosong yang sah dari item yang tidak dapat diakses akibat metadata kepemilikan.
- Penerimaan: pengguna yang berhak memperoleh item yang sesuai, pengguna lain tetap ditolak, dan restart mempertahankan hasil tersebut.

## 2. Satukan kesiapan tiga komponen sebelum konteks kerja

- Tambahkan readiness terstruktur pada status dan route: vault, graph, serta mirror; masing-masing memiliki status, waktu pemeriksaan, alasan kegagalan, dan generasi/hash yang relevan.
- Vault harus terbaca dengan scope valid. Graf harus dapat dipakai dan cocok dengan generasi vault. Mirror harus terkonfigurasi, terautentikasi, dan memiliki konfirmasi untuk generasi lokal yang diperlukan.
- Terbitkan konteks/lease pekerjaan substantif hanya setelah ketiganya siap. Jangan menganggap keberadaan executable atau ledger lokal sebagai bukti operasional.
- Berlakukan kewajiban sejak pembukaan konteks analisis, bukan hanya sebelum tool tulis. Daftar pengecualian dibatasi pada status, diagnosis, serta pemulihan yang tidak menjalankan tugas utama.
- Pertahankan kemampuan mengembalikan hasil recall kosong yang berhasil. Gangguan salah satu komponen harus menghasilkan status tertahan yang dapat ditindaklanjuti, tanpa menyamar sebagai hasil kosong.
- Penerimaan: semua kombinasi komponen tidak siap diblokir; konteks baru dapat diterbitkan setelah pemulihan berhasil. Mode produksi memakai kebijakan ketat; perubahan mode harus terlihat dalam status.

## 3. Jadikan finalize penutupan yang dapat dipertanggungjawabkan

- Ikat kewajiban akhir ke task ID stabil dan execution evidence, bukan hanya teks objective. Pergantian kata tidak boleh menghilangkan kewajiban sebelumnya.
- Validasi kandidat dan persyaratan keputusan sebelum penutupan. Kandidat baru yang dinyatakan durable tetapi kurang informasi harus mendapat error yang menyebut kekurangannya.
- Catat `NO_DURABLE_MEMORY` hanya bersama alasan yang konsisten: sementara, duplikat, tidak relevan di masa depan, atau alasan lain yang terdefinisi dan berbukti.
- Pisahkan hasil pekerjaan lokal, keputusan memori lokal, dan durability remote. `finalized` baru berarti selesai setelah seluruh kewajiban yang diwajibkan terpenuhi.
- Bila remote gagal sesudah pekerjaan terjadi, simpan status tertunda dan lanjutkan sinkronisasi secara idempoten. Retry harus memakai task/decision ID yang sama dan tidak mengeksekusi ulang pekerjaan.
- Terapkan pemeriksaan receipt pada status terminal Agent-Core. Dokumentasikan bahwa keluaran percakapan di luar Agent-Core tetap memerlukan integrasi klien agar jaminan ini berlaku.

## 4. Pengujian, rollout, dan bukti penerimaan

- Gunakan [probe audit](../scripts/memory/audit-lifecycle.mjs) sebagai reproduksi awal, kemudian ubah ekspektasi kasus yang relevan ketika kebijakan baru diimplementasikan. Jangan menganggap probe perilaku lama sebagai sertifikasi kebijakan baru.
- Uji scope yang rusak, vault kosong, graf tidak tersedia/usang, remote putus, lease kedaluwarsa, tugas analisis, perubahan objective, finalize terlewat, kandidat tidak lengkap, restart, dan retry sesudah sebagian pekerjaan selesai.
- Uji matriks jalur MCP, HTTP internal, execution, dan continuity. Gunakan transport fixture untuk gangguan; lakukan verifikasi remote nyata hanya pada lingkungan uji yang sesuai.
- Rollout setelah mapping data tervalidasi, probe kesiapan tersedia, dan seluruh pengujian penerimaan lulus. Keberhasilan tidak boleh bergantung pada restart manual untuk menemukan konfigurasi yang salah.
- Pantau tugas tanpa preflight, item yang tidak terjangkau scope, lifecycle tanpa keputusan, umur pending closure, kegagalan graf, dan keterlambatan mirror. Setiap angka memiliki denominator dan asal data yang jelas agar event tidak disamakan dengan jumlah tugas.
