# Agent Core: Rencana Verifikasi Resident, Kemandirian Native Agent, dan Reuse Pengetahuan

- ID arsip: AC-HISTORY-20261002-01
- Dibuat: 2026-10-02 UTC.
- Status dokumen: PLAN ARCHIVED; status pelaksanaan lima fase: NOT STARTED.
- Tujuan: menjadi catatan keputusan dan titik lanjut agar pekerjaan tidak dimulai lagi dari nol.
- Otorisasi saat penyusunan: membuat dan menyimpan plan. Pengujian, restart, implementasi, instalasi, release, dan publikasi belum dijalankan oleh tugas ini.
- Lokasi: docs/history-agent-core/Agent-Core-Resident-Autonomy-Learning-Plan-20261002.md.

## 1. Arah yang dipertahankan

Agent Core adalah badan agent persisten dengan model yang dapat diganti. Pengalaman harus menghasilkan pengetahuan/procedure/skill yang benar-benar digunakan pada keputusan berikutnya.
External controller dan Native Agent menggunakan body, canonical Memory, Learning, Skills, procedure, dan evidence yang sama.
State operasional seperti cursor credential, cooldown, dan chat.sqlite tetap terpisah dari semantic Memory; model tidak memerlukan API key mentah.
Target akhirnya: Native Agent menyelesaikan task, menerima koreksi, dan memakai pelajaran tersebut pada task terkait setelah pergantian sesi, restart, atau model.
Keberhasilan terbatas tidak membuktikan kecerdasan, kemandirian, atau pembelajaran universal.

## 2. Sumber dan kondisi awal arsip

### Sumber percakapan yang dibaca
- Cari-AI-Tools-Sejenis.md: tujuan body/model terpisah, cumulative learning, dan riset mekanisme donor.
- Agent-Core-31.md: perjalanan EC, persistent credential rotation, Interactive Agent Chat, dan NACP.
- Memahami-Percakapan-Agent.md: kelanjutan parity, provider riset, doctrine operator, dan gate resident P8.
- Timestamp dalam ekspor dipertahankan sebagai waktu sumber; jangan menganggapnya UTC bila zona waktunya tidak disebutkan.

### Grounding lokal saat menyusun plan
- AGENTS.md dibaca untuk kontrak operasi dan pemisahan arsitektur.
- Bagian latest direction dalam [Agent-Core-Product-Direction.md](../Agent-Core-Product-Direction.md) dibaca pada 2026-10-02 sekitar 19:08 UTC.
- Canonical Memory product-direction ID 282a3bef-4b6e-4a05-b15c-49e726e0ec61 dibaca; updatedAt 2026-10-02T18:28:21.517Z.
- Memory mengacu ke implementation-verification ID 38eeb399-5f0a-4875-81bb-e72982a77ca8.
- Staleness Memory menyatakan linked docs berubah dari snapshot terdahulu. Utamakan exact dokumen/source terbaru dan bukti runtime, bukan timestamp Memory saja.
- Pembacaan dokumen/Memory ini bukan pengujian ulang resident. Health, build, provider, dan acceptance tidak dijalankan dalam tugas pengarsipan.

### Baseline yang sudah dilaporkan, bukan pekerjaan dari nol
- EC-0 sampai EC-9, persistent provider scheduling, dan IAC-9 termasuk restart-continuity dilaporkan resident-verified.
- NACP body/shared-knowledge parity, dynamic task-scoped grants, dan shared Memory dua arah dilaporkan resident-verified.
- Latest Product Direction mencatat ordinary memory_search attribution menghasilkan knowledgeUseReceipts=1 dan matched external/native engineering parity sudah lulus.
- Karena itu, jangan menjadikan receipt atau matched parity yang sama sebagai penemuan baru atau mengulangnya tanpa alasan regresi.
- Credentialed research dilaporkan source/build/targeted-qualified: 72 tools, 23 targeted tests PASS. Angka ini catatan baseline, bukan hasil tes baru.
- Remaining gate yang tercatat: supported Core reload bila masih diperlukan, lalu Native Agent P8 memakai web.research dan finalizes dengan evidence.
- Perubahan minor NACP masih unapplied menurut dokumen yang dibaca; tugas plan ini tidak mengubah release.
- Demo cerita create/read/recycle di sesi ini hanya membuktikan external controller memakai tool Agent Core; bukan bukti native autonomy.
- Istilah lama native runtime deferred, get_config-only, dan IAC restart pending adalah sejarah yang telah dilampaui, bukan current baseline.

### Kelas bukti
- TRANSCRIPT-REPORTED: laporan dalam percakapan dengan sumber dan batas kesimpulan.
- DOCUMENT/MEMORY-RECORDED: status yang dibaca dari dokumen/Memory, belum otomatis diuji ulang.
- SOURCE/BUILD-VERIFIED: kode/build telah diperiksa pada revision tertentu.
- RESIDENT-VERIFIED: perilaku benar-benar diamati pada proses resident teridentifikasi dengan artifact/receipt.
- UNKNOWN atau BLOCKED: bukti belum tersedia; tidak diubah menjadi defect atau PASS.

## 3. Urutan dan aturan melanjutkan

Fase 1 menjadi prasyarat seluruh eksekusi. Fase 2 menutup gap P8; Fase 3 memakai jalur riset yang sudah terbukti; Fase 4 memperluas evidence reuse pada pekerjaan nyata; Fase 5 menguji pemulihan yang belum tercakup.
Jika bukti fase tertentu sudah memadai untuk kondisi yang sama, tautkan dan beri VERIFIED BY EXISTING EVIDENCE; jangan menjalankannya lagi hanya untuk membuat laporan baru.
Re-test hanya bila revision/configuration berubah relevan, kondisi uji baru, bukti tidak memadai, atau ada dugaan regresi.
Fase 3–5 adalah evaluasi lanjutan; tidak boleh secara retroaktif membatalkan kelulusan EC/IAC/NACP pada tested scope sebelumnya.

## 4. Fase 1: Rekonsiliasi docs, source, dan resident

- Status: NOT STARTED. Prioritas: pertama.
- Baca current authority, metadata health/version, source/build terkait, dan receipt terakhir tanpa mengubah runtime.
- Bedakan versi source, build, proses resident, konfigurasi yang dimuat, tanggal observasi, model, dan controller.
- Petakan baseline EC/PCR/IAC/NACP/P8 serta bukti yang sudah ada ke acceptance masing-masing.
- Susun resume map: last verified step, open gap, exact next action, dependency, dan alasan tidak mengulang pekerjaan selesai.
- Dokumen terkait: [CODEBASE](../CODEBASE.md), [Product Direction](../Agent-Core-Product-Direction.md), [NACP Plan](../Agent-Core-Native-Agent-Capability-Parity-Plan-20261002.md).
- PASS: klaim penting memiliki kelas bukti dan batas versi; kontradiksi diselesaikan atau dicatat dengan dampaknya.
- FAIL: klaim berlawanan dengan bukti tetap dipakai atau status melebihi bukti.
- BLOCKED: akses/evidence tertentu tidak tersedia; sebutkan bagian tepat yang tidak dapat dinilai.
- Output: baseline teranotasi dan resume map. Jangan menulis ulang seluruh sejarah atau membuat authority paralel.

## 5. Fase 2: Tutup P8 native web research

- Status: NOT STARTED. Dependency: Fase 1.
- Cek apakah resident sekarang sudah memuat source/configuration baru. Catatan searchConfigured=false terdahulu bukan observasi live sekarang.
- Jika perlu reload, periksa pekerjaan aktif dan gunakan supported Restart Core, bukan Restart All, sesuai scope/izin pelaksanaan.
- Berikan goal riset terbatas kepada Native Agent; agent sendiri memilih penggunaan grant web.research, web_search, dan web_open.
- Bukti minimum: identitas resident/task, grant sesuai scope, search result, sumber yang benar-benar dibuka, klaim terlacak ke sumber, verified finalization, dan Learning closure sesuai lifecycle existing.
- API probe langsung, credential non-empty, atau jawaban berisi tautan saja tidak cukup membuktikan native P8.
- Catat generic research, OpenAlex akademik, Pexels aset, dan Browserbase fallback hanya sesuai coverage yang benar-benar diuji; jangan klaim seluruh fallback dari satu happy path.
- PASS: native resident menyelesaikan alur dengan evidence yang dapat diperiksa dan finalization sah.
- FAIL: alur berjalan tetapi evidence tidak mendukung hasil, finalization gagal, atau external controller harus menentukan tiap tool call.
- BLOCKED: autentikasi, provider, grant, resident mismatch, atau izin menghalangi pengujian.
- Output: laporan P8 bertaut receipt dan pembaruan status existing docs hanya setelah hasil tersedia.

## 6. Fase 3: Tugas kreatif native end-to-end

- Status: NOT STARTED. Dependency: baseline dan jalur riset relevan sudah terbukti.
- Skenario usulan: brief presentasi 10 slide bertema strategi konten untuk studio desain independen, dengan sedikitnya tiga sumber yang relevan.
- Output uji berupa Markdown, bukan PPTX; setiap slide memiliki tujuan, headline, poin isi singkat, arahan visual, dan referensi bila memuat klaim faktual.
- Gunakan Bahasa Indonesia; hindari statistik rekaan dan klaim pasar tanpa sumber. Tetapkan tanggal riset serta audiens pemilik studio kecil.
- Tujuan penyimpanan fixture dan batas pemakaian provider ditetapkan sebelum run; jangan menimpa file produksi.
- Berikan tujuan dan kriteria tersebut, bukan daftar tool call. Native Agent menentukan riset, sintesis, penyimpanan, serta readback.
- Periksa jumlah slide, kegunaan brief, dukungan sumber, isi file, dan trace eksekusi secara terpisah.
- PASS: artifact memenuhi kriteria inti dan native trace menunjukkan eksekusi end-to-end; pertanyaan klarifikasi yang memang perlu dicatat, bukan otomatis kegagalan.
- FAIL: artifact salah/tidak lengkap, evidence palsu, atau keberhasilan bergantung pada external controller mengerjakan langkah inti.
- BLOCKED: kemampuan, sumber, konfigurasi, atau izin tulis yang diperlukan tidak tersedia.
- Output: artifact Markdown, receipt, penilaian kualitas, intervensi manusia, dan batas coverage. Tidak ada publishing atau pembelian.

## 7. Fase 4: Reuse pengetahuan pada kondisi baru

- Status: NOT STARTED. Dependency: task/koreksi relevan dan baseline learning existing.
- Pilih satu koreksi material dari pekerjaan nyata, misalnya fakta harus diberi sumber dan asumsi kreatif harus dibedakan dari hasil riset.
- Ikuti mekanisme existing: koreksi → verified lesson/procedure → persistence → retrieval → penggunaan/adaptasi yang teramati → outcome terverifikasi.
- Sesi baru memakai task terkait dengan tema berbeda; jangan menyisipkan kembali jawaban/pelajaran lengkap ke prompt lalu menyebutnya recall.
- Perluas kondisi secara terpisah: fresh session, setelah supported restart, lalu model/provider lain yang tersedia dan diizinkan.
- Periksa bukti EC/NACP yang sudah lulus; uji hanya applicability/gap kondisi baru, bukan mengulang seluruh acceptance historis.
- Tambahkan variasi ketika lesson tidak berlaku agar agent memeriksa precondition, bukan mengikuti Memory secara buta.
- Ukur correctness, repeated known mistakes, intervensi, tool calls/waktu/biaya bila tersedia; tidak menetapkan klaim peningkatan kausal dari satu contoh.
- PASS per kondisi: rantai evidence lengkap, lesson diterapkan atau ditolak secara tepat, dan hasil memenuhi kriteria task.
- FAIL: pada kondisi teruji terjadi salah-pakai knowledge, hasil keliru, atau receipt penggunaan diklaim tanpa bukti.
- BLOCKED/INCONCLUSIVE: model, observabilitas, izin restart, atau bukti hubungan tidak tersedia; jangan mengarang kelulusan.
- Output: matriks kondisi, provenance/receipt dan batas generalisasi. Tidak membuat Memory/Learning/Skill stack kedua atau menyimpan private chain-of-thought.

## 8. Fase 5: Recovery dan pencegahan efek ganda

- Status: NOT STARTED. Dependency: baseline, fixture terisolasi, skenario gangguan dan pemulihan yang diizinkan.
- Pilih satu controlled provider failure atau interupsi melalui fasilitas uji existing. Jangan merusak credential produksi atau memutus pekerjaan lain.
- Catat checkpoint, status permintaan, artifact sebelum gangguan, titik kegagalan, dan efek yang mungkin sudah terjadi.
- Sebelum retry, inspeksi efek dan idempotency state; timeout tidak membuktikan aksi belum terjadi.
- Verifikasi fallback/resume atau penghentian aman dengan penjelasan blocker; jangan memaksa fallback di luar scope.
- PASS: status dan hasil tetap benar, tidak ada efek ganda, recovery atau safe-stop mengikuti kontrak skenario.
- FAIL: duplikasi, kehilangan hasil yang sudah committed, retry tidak aman, atau success palsu.
- BLOCKED: isolasi, observabilitas, atau izin tidak cukup. Hentikan bagian terkait dan pertahankan hasil lain.
- Output: evidence sebelum/sesudah, jejak recovery, verifikasi artifact/side effect, cleanup dan risiko tersisa.

## 9. Provider dan batas pelaksanaan

- Unsplash HTTP 401 adalah status terdahulu yang perlu diuji ulang hanya jika dibutuhkan; Pexels adalah alternatif yang dilaporkan bekerja.
- Apify baru auth-verified; Actor, input, biaya, dan tujuan belum dipilih. Jangan menjalankan Actor otomatis karena token tersedia.
- Langfuse auth tidak memberi izin otomatis mengekspor prompt, trace, konten pribadi, atau secret.
- API key tidak boleh masuk dokumen, Memory, log, screenshot, atau output. Cek metadata/presence tanpa membocorkan nilai.
- Otorisasi luas dalam transcript tidak menggantikan instruksi dan izin yang berlaku pada tindakan berikutnya.
- Tidak ada instalasi, release apply, push, commit, publishing, perubahan keamanan, atau provider berbayar baru tersirat oleh arsip plan ini.
- Hentikan langkah berisiko bila efek ambigu, izin kurang, atau sumber bertentangan; jangan ulangi kegagalan identik tanpa evidence baru.

## 10. Evidence ledger dan laporan historis

Template entri: ID | fase | waktu UTC | sumber | kelas bukti | source/build/resident/model | expected | observed | receipt/artifact | status | batas klaim | next action.
Status: NOT STARTED, IN PROGRESS, PASS, FAIL, BLOCKED, INCONCLUSIVE, atau VERIFIED BY EXISTING EVIDENCE.
Pisahkan hasil per kondisi; error yang berhasil dipulihkan tidak otomatis menggagalkan task, dan nol error bukan target universal.
Simpan report pelaksanaan terpisah dengan tautan ke plan ini; jangan mengubah proposal menjadi seolah-olah pernah dieksekusi.
Gunakan owner docs existing untuk current status, folder ini untuk jejak keputusan/riwayat. Jangan membuat proses internal baru hanya untuk mengarsipkan.
Setiap sesi berikutnya membaca latest status dan resume map, bukan sekadar bagian paling awal transcript.
Ringkasan report: keputusan, file/folder, panggilan eksternal, biaya diketahui, restart, verification, kegagalan/recovery, dan blocker.

## 11. Titik lanjut dan completion gate

- NEXT: setelah pelaksanaan diminta, mulai Fase 1 dari metadata resident dan receipt yang tersedia; jangan langsung restart.
- Prioritas gap berikutnya adalah P8 bila belum ditutup oleh evidence yang lebih baru.
- Setelah P8, pilih satu task nyata pada Fase 3 dan gunakan hasilnya untuk evaluasi reuse Fase 4.
- Fase 5 menutup recovery yang belum tercakup existing tests; jangan membuka ulang keseluruhan proyek.
- Rangkaian selesai bila cakupan yang dipilih memenuhi acceptance dan evidence tersimpan.
- BLOCKED berarti pekerjaan tertunda dengan alasan dan next action, bukan produk dinyatakan complete.
- Sesi berikutnya tidak boleh mengklaim seluruh plan selesai hanya karena file ini tersimpan.

## 12. Changelog

- 2026-10-02 UTC | PLAN CREATED | Lima usulan disusun menjadi arsip berdasarkan tiga transcript dan pembacaan terbatas authority lokal.
- PLANNED: rekonsiliasi live, P8, task kreatif native, reuse lintas kondisi, controlled recovery.
- OBSERVED IN THIS TASK: pembacaan dokumen/Memory, folder arsip dibuat; penyimpanan plan diverifikasi lewat readback setelah penulisan.
- NOT EXECUTED: health acceptance, build/tests, restart, native task, provider probe, fault injection, release/deployment.
