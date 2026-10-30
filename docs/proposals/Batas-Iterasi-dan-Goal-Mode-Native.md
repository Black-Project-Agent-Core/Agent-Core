# Batas iterasi dan Goal mode Native
Tanggal: 2026-10-30
Revisi: 1
Status: APPROVED (revisi 1, scope A+B+C build). Implementasi: A (batas 60) sudah aktif di build yang berjalan; B (jendela Goal mode) dan C (laporan batas DONE/OPEN/NEXT) sudah di-commit 2026-10-30 dan menunggu aktivasi serta verifikasi hidup. Arsip ke `docs/history-agent-core` menyusul setelah verifikasi hidup.
Jenis: Improvement
Asal dan bukti: `src/config.ts:274`, `src/agent-runtime.ts:468`, `src/agent-controller.ts:886-893` dan `:1862-1887`, `src/agent-chat-store.ts:1152`, `src/agent-chat-service.ts:465-519`, `src/agent-turn-events.ts:205`, pengamatan sesi 2026-10-30, pertanyaan pengguna 2026-10-30.

## Masalah dan tujuan

Satu giliran Native dibatasi 24 iterasi (satu iterasi = satu panggilan model beserta tool yang diminta pada panggilan itu). Pekerjaan coding yang nyata sering memerlukan lebih banyak, sehingga giliran berhenti di tengah dan pekerjaan menjadi parsial. Tujuan: pekerjaan berskala tugas selesai dalam satu rangkaian tanpa menghapus perlindungan terhadap loop liar, dan Goal mode benar-benar berarti "jalan sampai tujuan tercapai".

## Bukti dan ketidakpastian

Diperiksa langsung pada kode:

- Batas bawaan 24, dapat diubah lewat `AGENT_CORE_AI_MAX_TOOL_ITERATIONS` (`config.ts:274`, ada di `.env.example`); nilai bawaan runtime juga 24 (`agent-runtime.ts:468`). Giliran yang dilanjutkan memakai nilai terkecil antara batas tersimpan dan batas konfigurasi (`agent-controller.ts:891-893`).
- Peringatan dikirim pada 75% batas (`agent-turn-events.ts:205`); lewat dari batas, controller melakukan satu panggilan model terakhir tanpa tool untuk menulis laporan sampai 250 kata, menandai giliran `failed` dengan kode `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED`, dan laporan itu disimpan sebagai pesan asisten yang tetap masuk riwayat (`agent-controller.ts:1862-1887`, `agent-chat-store.ts:1152`).
- Giliran berikutnya mulai dengan batas segar, tetapi konteks yang terbawa hanyalah laporan itu dan riwayat terbatas; hasil tool di giliran yang berhenti tidak ikut. Inilah jalur terjadinya kerja parsial.
- `goalMode` disimpan pada giliran dan ditampilkan (Running / Paused / Finished goal, jeda), tetapi pencarian kode tidak menemukan penggunaannya di controller; ia tidak menaikkan batas iterasi.
- Pengamatan sesi ini: tiga paket native mencapai 24 iterasi tanpa selesai (satu hanya sempat mengubah sisi C#, satu selesai berkas tetapi tes belum ada, satu berhenti di tengah tes). Sebagian iterasi terbuang mencari path karena brief relatif.

Belum diukur: biaya token per iterasi tambahan dan seberapa sering giliran berhenti di batas pada penggunaan nyata. Perbandingan dengan aplikasi desktop lain didasarkan pada pengalaman pengguna, bukan pengukuran.

## Mekanisme dan owner existing yang dipakai

A. Batas bawaan 24 menjadi 60 di `config.ts` dan `agent-runtime.ts`, tetap dapat diubah lewat env.

B. Goal mode memakai batas lebih tinggi (200) dan, ketika batas tercapai, giliran berakhir `resumable` (bukan `failed`) dengan checkpoint utuh, sehingga Continue melanjutkan dengan jendela iterasi segar dan konteks dari checkpoint (kompaksi 100% menjaga ukuran). Owner: `agent-controller.ts` (batas dan status akhir), `agent-chat-service.ts` (jalur lanjutkan), `agent-turn-checkpoint.ts` (validasi `maxIterations`). Pada implementasi harus diverifikasi bahwa jalur resume yang ada dapat memperpanjang jendela tanpa melanggar validasi checkpoint.

C. Laporan batas diperkuat: berisi daftar "selesai / belum (OPEN) / langkah berikutnya" dan rujukan kompaksi yang dapat dipulihkan (terkait alat riwayat chat pada proposal Perkuatan-Recall-Kompaksi-Native).

## Scope, batas Native, risiko dan otorisasi

- Tidak ada grant baru dan tidak ada tool baru. Peringatan 75%, tombol jeda dan berhenti, serta batas percobaan provider tetap berlaku.
- Risiko biaya dan loop liar: batas 60 dan 200 tetap membatasi; Goal mode hanya aktif atas pilihan pengguna dan dapat dijeda kapan saja.
- Risiko B: status `resumable` pada batas mengubah perilaku yang sekarang `failed`; tes dan penanganan UI ("Paused goal") harus diperiksa.

## Manfaat yang diharapkan dan keterbatasan

Harapan, belum terukur: lebih sedikit giliran yang berhenti di tengah pekerjaan, dan Goal mode sesuai namanya. Keterbatasan: batas lebih tinggi menaikkan biaya pada tugas yang memang berputar; ringkasan kompaksi tetap lossy.

## Acceptance, evaluasi dan rollback

- Uji unit: nilai bawaan batas; giliran Goal mode pada batas menjadi `resumable` dan Continue melanjutkan dengan jendela baru; giliran non-Goal pada batas tetap `failed` dengan laporan.
- Verifikasi hidup: satu tugas Goal mode panjang yang melewati 60 iterasi dan selesai setelah Continue.
- Rollback: kembalikan nilai bawaan dan hapus cabang Goal mode; env tetap menimpa.

## Riwayat revisi

- Revisi 1 (2026-10-30): dokumen pertama.

## Keputusan pengguna dan scope

APPROVE revisi 1, scope A + B + C (build), diberikan pengguna di chat pada 2026-10-30 dengan pesan "Setujui A+B+C" sebagai jawaban atas pertanyaan keputusan proposal ini. Persetujuan ini tidak mencakup revisi berikutnya atau scope tambahan. Status APPROVED belum berarti selesai: implementasi, validasi dan arsip ke `docs/history-agent-core` menyusul setelah acceptance terpenuhi.
