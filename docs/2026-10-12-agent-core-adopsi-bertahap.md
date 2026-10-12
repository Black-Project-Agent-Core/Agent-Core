# Plan Adopsi Bertahap Learning, Memory, dan Self-Improvement Agent Core

**Status terkini, direkonsiliasi 12 Oktober 2026:** scope pemasangan sampai aktif ditutup berdasarkan implementasi Linux dan laporan Windows yang diberikan pengguna. P0, P1, P2, P3, dan P5 diimplementasikan; P4 memakai ulang portfolio/Pareto existing. Aktivasi canonical Memory, sinkronisasi isi, dan finalisasi Learning Linux selesai. Laporan pengguna menyatakan jalur inti Windows aktif dan `memoryFeedback` sudah terekspos pada plugin. **Sisa tahap wajib: 0.** Batas audit tambahan tetap dicatat sebagai belum terbukti, bukan blocker pemasangan atau tugas baru. Laporan Windows tidak diverifikasi langsung oleh pelaksana rekonsiliasi Linux ini.
**Tanggal:** 12 Oktober 2026.  
**Tujuan:** membuat kemampuan yang sudah ada benar-benar tersambung dan berguna bagi satu AI eksternal yang mengendalikan Agent Core, kemudian mengisi kekurangan dengan mekanisme kandidat terpilih.  
**Arsitektur:** pertahankan pemilik Memory, Learning, Skills, dan Browser yang sudah ada. Donor adalah referensi algoritme atau kontrak kecil, bukan alasan memasang seluruh framework.  
**Teknologi dasar:** TypeScript/Node.js dan persistence proyek yang sudah tersedia. Tidak menetapkan database, model, atau daemon baru.  
**Bahan:** katalog kandidat 216 entri, checkout 12 repository utama yang dipatok ke commit tertentu, dan source Agent Core. Manifest sumber berada pada [daftar clone](research/adoption-sources-20261012.json).

## 1. Keputusan utama

1. Mulai dari **P0: integrasi dan kepemilikan**, bukan instalasi kandidat.
2. Setelah itu **P1: koreksi bersumber → P2: retrieval yang belajar dari pemakaian → P3: pengalaman menjadi skill → P4: perbaikan terbatas → P5: proaktif kontekstual**.
3. Selesaikan satu tahap sampai menghasilkan fungsi aktif sebelum menambah lapisan berikutnya. Tahap yang ternyata sudah lengkap cukup dipakai, tidak ditulis ulang.
4. Prioritas ditentukan oleh kekurangan nyata, kematangan mekanisme, dan biaya integrasi. Asal Korea/Jepang/China membantu discovery, bukan alasan mengganti fungsi yang telah bekerja.
5. Ini **satu plan**, bukan 216 proyek instalasi. Kandidat lain tetap berada di katalog sebagai alternatif.

**Positive: [Purpose]** Pengalaman tersimpan dengan sumbernya, dapat ditemukan kembali, dikoreksi, dipakai dalam keputusan, dan disarikan menjadi prosedur yang berguna tanpa menggandakan sistem.

**Negative: [Purpose]** Menambah nama engine, database, folder penyimpanan, agent loop, atau laporan seolah-olah itu peningkatan, padahal jalur pemakaian oleh controller belum tersambung.

## 2. Dasar faktual dan batasnya

**Baseline inspeksi awal, 12 Oktober 2026, sebelum implementasi.** Temuan di bawah dipertahankan sebagai dasar keputusan. Status pelaksanaan terbaru ada pada bagian 12; checkout kemudian diselaraskan ke upstream `d4d03e3` tanpa menimpa perubahan lokal yang sah.

Checkout yang diperiksa berada pada revisi `8d1f1582411b16548cd52f0b869dd1d59ebe51f8`. Source default branch GitHub juga dibaca untuk `src/memory/host-runtime.ts`, `src/learning/curation-delta.ts`, dan ekspor Memory subproject. Ada perubahan dokumentasi lokal yang sudah ada; plan ini tidak menimpanya.

Temuan source pada baseline tersebut:
- Memory memiliki recall, episode, bukti, consolidation, revision/temporal history, project synthesis, dan prospective intentions.
- Learning memiliki curation delta, counterexample, receipts pemakaian, prosedur, serta proposal skill.
- Retrieval memiliki portfolio, diversity, Pareto, dan riwayat; sebagian pola Shinka sudah diadopsi.
- **Pada baseline, `host-runtime.ts` memuat target `runtime/memory-v2`.** Ini berbeda dari keputusan pengguna tentang nama penyimpanan, tetapi bukan bukti bahwa mesin Windows sedang memakai folder tersebut.
- Credential scheduler adalah penjadwalan credential/quota provider, **bukan scheduler tugas atau pengingat**.

**Target penyimpanan Memory:** `<PROJECT_ROOT>/runtime/memory`; pada mesin Windows pengguna saat ini: `E:\Projects\Agent-Core\runtime\memory`. Nama folder tetap `memory` pada Linux maupun Windows. Versi engine v2/v3/v4 dan seterusnya boleh berubah tanpa mengubah nama lokasi penyimpanan. Pada inspeksi awal, target ini belum menjadi bukti migrasi Windows; laporan pengguna yang kemudian menutup scope aktivasi dicatat terpisah pada bagian 12. Nama versi engine boleh dipertahankan pada kode. Skills dan state operasional yang punya tanggung jawab berbeda tetap memakai pemilik aslinya; satu folder Memory tidak berarti memindahkan semua state aplikasi ke sana.

Sumber proyek: [host runtime](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/main/src/memory/host-runtime.ts), [curation delta](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/main/src/learning/curation-delta.ts), [ekspor Memory](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/main/SubProject/agent-core-memory/src/index.ts).

## 3. Peta pemilik fungsi: wajib dipakai ulang

| Fungsi | Source utama yang sudah ada | Batas kepemilikan |
|---|---|---|
| Pemilihan engine/root | `src/memory/host-runtime.ts` | Satu writer aktif untuk satu root |
| Memory pengalaman | `SubProject/agent-core-memory/src/memory/` | Record, sumber, revision, retrieval, consolidation |
| Jalur controller eksternal | `src/learning/external-controller.ts`, `src/mcp/controller-learning-tools.ts` | Episode, konteks, receipt pemakaian, procedure |
| Penyaringan pelajaran | `src/learning/curation-delta.ts`, `curator.ts`, `service.ts` | Delta kecil, counterexample, keputusan penerimaan |
| Penggunaan dan pemilihan Memory | `retrieval-ledger.ts`, `feedback.ts` pada engine Memory; `src/learning/retrieval-*.ts` | Jejak pemakaian dan kebijakan retrieval |
| Skill | `src/skills/service.ts`, `src/learning/skill-proposals.ts`, `skill-proposal-decisions.ts`, `skill-outcome-review.ts` | Satu registry dan satu lifecycle proposal |
| Proaktif kontekstual | `SubProject/agent-core-memory/src/memory/prospective-intentions.ts` | Intention dan observasi; bukan otorisasi eksekusi |

Path relatif terhadap repo. Tanda `retrieval-*.ts` menunjuk keluarga modul yang sudah ada, bukan instruksi membuat ulang semuanya. Pelaksana memilih file spesifik berdasarkan celah yang ditemukan pada tahap terkait.

## 4. Aturan anti-duplikasi

- **Reuse dahulu, extend kedua, replace hanya bila perlu.** Bila sebuah fitur sudah tersedia dan tersambung, tandai dipakai ulang dan lanjutkan.
- Satu fungsi punya satu pemilik, satu sumber data utama, satu kontrak yang dipakai controller. Adapter tidak boleh menjadi database/registry kedua.
- `dist` adalah hasil build source, bukan tempat patch mandiri atau salinan engine baru.
- Jangan menaruh implementasi aktif di `temp` atau `runtime/tmp`. Jangan membuat folder Memory baru bernama v3/v4/candidate sebagai hasil akhir.
- Data turunan seperti index atau ringkasan boleh ada jika dapat dibangun ulang dan tidak menjadi sumber kebenaran kedua.
- Nama donor tidak harus menjadi nama modul. ACE/ReMe/AMD/Trace2Skill adalah acuan mekanisme, bukan enam service tambahan.
- Perubahan GitHub yang sudah dikerjakan harus diperhitungkan saat pelaksanaan: ambil perubahan upstream, pertahankan perubahan lokal yang sah, satukan pada source utama. Jangan menyalin checkout menjadi proyek tandingan.
- Setiap perluasan schema memakai kontrak yang sudah ada. Nama field baru hanya ditambahkan bila belum ada padanannya.

## 5. Tahapan pengerjaan

Kotak tercentang mencatat implementasi atau pemakaian ulang owner pada source; bukan klaim manfaat terukur atau deployment Windows. Aktivasi runtime Linux, penutupan scope operasional, dan batas bukti laporan Windows dijelaskan terpisah pada bagian 12.

### P0. Satukan jalur aktif dan penyimpanan

**Status source:** diimplementasikan. **Prioritas:** pertama. **Donor baru:** tidak ada.

- [x] Cocokkan source utama terbaru, entrypoint, build, tool schema, dan resolver root pada mesin pelaksanaan; catat satu pemilik untuk setiap fungsi pada tabel di atas.
- [x] Selaraskan root akhir ke `runtime/memory`, termasuk konfigurasi dan activation metadata yang bergantung pada nama lama. Jangan hanya mengganti nama folder atau melemahkan integritas marker.
- [x] Jika format data berbeda, gunakan jalur migrasi/transfer milik engine; pertahankan ID, bukti, revision, dan relasi. Jangan menumpuk isi dua format dalam satu root atau menjalankan dua writer.
- [x] Hubungkan episode controller yang sah ke Memory melalui scope/binding host yang sudah tersedia; cocokkan schema connector dengan implementasi sumber, tanpa membuat identitas episode palsu.
- [x] Pastikan jalur yang dipakai AI eksternal menunjuk service tersebut. Lengkapi build/entrypoint dari source utama, bukan hanya menyimpan patch di folder sementara.

**Hasil aktif:** controller bisa membaca dan menulis melalui jalur yang sama, dengan root dan engine yang eksplisit; tidak ada kebingungan tentang salinan mana yang dipakai.

**Catatan:** Linux dimulai dengan root kosong, sehingga tidak ada migrasi format atau relokasi data historis pada pelaksanaan ini. Jalur relokasi eksplisit mempertahankan data dan backup; marker historis tetap kompatibel sampai relokasi sengaja dilakukan. Tahap ini menyelesaikan sambungan integrasi. Bukan perluasan task ke game, model lokal, atau browser baru.

### P1. Koreksi Memory dan pelajaran yang terlacak

**Acuan utama:** ACE #1 dan ReMe #28. **Pelengkap:** provenance Hindsight #27. Ambil mekanismenya saja.

**Owner:** curation delta/curator yang sudah ada; `controller-session.ts`, `promotion.ts`, `revisions.ts`, `provenance.ts`, dan `project-synthesis.ts` pada engine Memory.

- [x] Gunakan delta `add-lesson` / `add-counterexample` yang sudah ada. Bedakan menguatkan bukti, mempersempit cakupan, dan mengoreksi record; jangan menambah record identik setiap sesi.
- [x] Sertakan sumber, waktu, ruang lingkup penerapan, dan revision target pada koreksi. Pisahkan observasi, dugaan, keputusan, dan hasil.
- [x] Saat sumber berubah, tandai kesimpulan turunannya untuk direvisi melalui dependency yang sudah tersedia; jangan menganggap seluruh Memory otomatis salah.
- [x] Pertahankan riwayat koreksi dan alasan penggantian. Pengetahuan lama yang tidak lagi berlaku tidak boleh muncul sebagai fakta terkini.
- [x] Hubungkan keputusan konsolidasi ke episode asal dan ke pembacaan berikutnya melalui kontrak existing.

**Hasil aktif:** kesalahan tidak hanya dicatat; pelajarannya direvisi, riwayatnya terlihat, dan versi yang sesuai konteks yang disajikan kembali.

**Anti-duplikasi:** tidak memasang bank Hindsight, workspace ReMe, atau playbook ACE sebagai penyimpanan paralel.

### P2. Perbaiki retrieval berdasarkan pemakaian nyata

**Acuan utama:** utility MemRL #2. **Korea:** AMD #83 sebagai pola bantuan ketika tool gagal. **Alternatif nanti:** AutoRAG #82 atau SimpleMem/EvolveMem #25 bila ada celah kebijakan retrieval spesifik.

**Owner:** `retrieval-ledger.ts`, `feedback.ts`, `retrieval.ts` milik engine terpilih; `artifactReceipt` pada controller eksternal; modul retrieval Learning yang sudah ada; failure advisor yang sudah ada.

- [x] Sambungkan retrieval yang disajikan dengan receipt ketika Memory benar-benar dipakai. Record diambil, dibaca, diterapkan, dan bermanfaat adalah kejadian berbeda.
- [x] Gunakan ID/revision/attempt yang tersedia untuk menghubungkan hasil tindakan. Bila manfaat tidak dapat diatribusikan, simpan sebagai belum diketahui, bukan keberhasilan palsu.
- [x] Perluas pemeringkatan existing dengan kegunaan yang didukung hasil, sambil menjaga relevansi, validitas waktu, ruang lingkup, dan keberagaman. Jangan membuat search engine kedua.
- [x] Untuk kegagalan tool, ambil petunjuk relevan dari pengalaman yang sudah ada berdasarkan jenis kegagalan, argumen, serta prasyarat. Controller tetap memutuskan perbaikan berikutnya.
- [x] Hindari mengulang petunjuk identik pada error yang sama tanpa bukti baru; gunakan batas pengulangan milik jalur existing.

**Hasil aktif:** pengalaman yang tepat memengaruhi pilihan berikutnya; tool failure dapat memunculkan petunjuk koreksi bersumber.

**Anti-duplikasi:** tidak memasang overlay benchmark AMD atau teacher agent. Lisensi kode AMD yang belum jelas perlu diselesaikan sebelum menyalin implementasinya; pola dapat dirancang sendiri dari publikasi.

### P3. Pengalaman menjadi skill yang bisa diperbarui

**Acuan utama:** AutoSkill/SkillEvo #17. **Pelengkap:** Trace2Skill #155. **Korea:** MIMIC #129 hanya untuk pola observasi menjadi usulan, setelah trace existing dimanfaatkan.

**Owner:** controller procedure, `src/skills/service.ts`, seluruh jalur skill proposal yang sudah ada.

- [x] Bentuk usulan dari episode dan pelajaran P1–P2, lengkap dengan bukti, prasyarat, batas tool, cakupan, dan kondisi tidak berlaku.
- [x] Cari fingerprint dan skill terkait sebelum memilih salah satu keputusan: pakai ulang, perbaiki, gabung, buat, atau buang usulan.
- [x] Untuk koreksi skill, targetkan revision tertentu; pertahankan pengecualian yang sah dan jangan menggabungkan dua prosedur dengan prasyarat yang saling bertentangan.
- [x] Simpan perubahan sebagai revisi pada registry yang sama. Muat hanya skill relevan ke konteks controller, bukan seluruh katalog.
- [x] Hubungkan outcome pemakaian ke revisi skill agar revisi buruk bisa ditarik melalui jalur yang sudah ada.

**Hasil aktif:** tugas berikutnya memakai prosedur yang telah dipelajari, dan kesalahan memperbaiki prosedur yang sama, bukan melahirkan tumpukan skill serupa.

**Anti-duplikasi:** tidak memasang registry SkillPort terpisah, proxy AutoSkill, atau observer MIMIC kedua bila event existing sudah memadai. Pengamatan tool harus menyaring rahasia dan data tak relevan.

### P4. Perbaikan terbatas pada artefak milik sistem

**Acuan:** GEPA #3 dan ShinkaEvolve #194. **Status:** portfolio/Pareto/riwayat existing dipakai ulang; optimizer baru tidak diperlukan untuk batch ini. Siklus optimisasi tambahan tetap bersyarat pada kebutuhan nyata dan feedback P1–P3. Ketentuan siklus di bawah berlaku bila perluasan opsional itu kelak diperlukan; tidak ada siklus baru yang dijalankan pada batch ini.

**Owner:** jalur improvement/outcome dan retrieval portfolio/Pareto/series existing.

- [x] Pakai kemampuan portfolio/Pareto/riwayat yang sudah ada; source menunjukkan adopsi parsial Shinka, sehingga jangan membuat archive atau optimizer baru.
- **Opsional, tidak diperlukan pada batch ini:** batasi satu siklus pada satu jenis artefak: misalnya aturan retrieval atau instruksi skill. Catat parent revision, perubahan, alasan, dan bukti hasil.
- **Ketentuan perluasan opsional:** controller mengusulkan revisi; mekanisme lokal menangani penyimpanan, batas, dan keputusan penerapan menurut otoritas existing.
- **Ketentuan perluasan opsional:** pertahankan versi yang sedang dipakai dan jalur pemulihan. Hasil yang belum jelas tidak boleh dipromosikan menjadi klaim peningkatan.
- [x] Jangan memberi izin perubahan source produksi, credential, atau kebijakan keamanan hanya karena usulan berasal dari proses learning.

**Hasil aktif:** perbaikan artefak kecil dapat diterapkan dan dibatalkan dengan alasan yang jelas, tanpa agent pengubah dirinya secara tak terbatas.

**Alternatif:** TreeQuest #193 hanya jika nanti diperlukan search state ask/tell yang tidak bisa diwakili portfolio existing. Bukan dependensi wajib atau scheduler baru.

### P5. Proaktif berdasarkan pengalaman dan konteks

**Acuan:** prospective intentions milik Agent Core; pola `proactive_read` ReMe #28. Saï #96 tetap referensi produk, bukan SDK yang diasumsikan tersedia.

**Owner:** `prospective-intentions.ts`, project synthesis, dan konteks controller eksternal. API encode/session intention existing dipertahankan; tidak ada pengingat pribadi baru yang perlu dibuat untuk menyelesaikan integrasi ini.

- [x] Bentuk intention dari kebutuhan eksplisit atau pengalaman yang relevan, dengan sumber, kondisi pemicu, masa berlaku, serta batas kewenangan.
- [x] Pada titik konteks yang sudah tersedia, seperti awal/resume sesi atau hasil tool, bandingkan observasi dengan intention dan tampilkan kandidat perhatian yang relevan.
- [x] Bedakan pernah ditampilkan, ditunda, selesai, dan kedaluwarsa agar pengingat tidak berulang tanpa perubahan.
- [x] Controller memutuskan respons/tindakan sesuai izin pengguna. Memory tidak boleh mengubah catatan menjadi izin baru.
- [x] Bila host tidak bisa membangunkan sesi AI yang sedang tidak aktif, antrekan intention sampai sesi tersedia. Jangan mengklaim proaktif offline atau memakai credential scheduler sebagai scheduler tugas.

**Hasil aktif:** controller mengenali kejadian serupa dan mengangkat kebutuhan yang relevan berdasarkan pengalaman, dengan bukti serta batas yang dapat dipahami.

**Perluasan opsional, tidak diperlukan untuk batch ini:** timer/wake adapter tetap ditunda dan hanya menjadi task terpisah jika kebutuhan nyata dan dukungan host telah jelas. Bukan syarat menyelesaikan P0–P4.

## 6. Antarmuka yang dipertahankan

Ini nama interface yang ditemukan pada source, bukan permintaan membuat API kembar:

- `initializeAgentCoreMemory(projectRoot, legacyMemoryDir, embedder)` mengembalikan `{service, experience?, mode, root}`: P0 memperbaiki ownership/root di sini.
- `ControllerMemorySession.recall()` / `expand()` dan `MemoryService.controller(scope, policy)`: P2 tetap memakai disclosure, budget, dan revision existing. Policy yang sudah dikenal: `baseline-v1` dan `fusion-feedback-v1`; pemilihnya host, bukan parameter bebas pengguna recall.
- `feedback(id, eventId, kind, expectedContentDigest?)`, `recordUseReceipt(input)`, dan `artifactReceipt()`: P2 menyambungkan outcome ke record/revision, bukan penghitung baru yang terpisah.
- `LearningService.reviewDelta()` serta `prepareConsolidation()` / `applyConsolidation()`: P1 memakai jalur penerimaan dan koreksi yang sama.
- `upsertSkillProposal()`, `decideSkillProposal()`, `recordSkillOutcome()`, `reviewSkillOutcomes()`, serta `SkillService.stageRevision()` / `promoteRevision()` / `rollbackRevision()`: P3 menjaga usulan, hasil build, dan skill aktif sebagai status berbeda.
- `evaluateIntentions()` dan `intentionUpsert()`: P5 mengembangkan pemakaian intention, bukan menjadikannya eksekutor.

Signature lengkap mengikuti source terbaru saat pelaksanaan. Jangan membuat interface yang hanya berbeda nama untuk mengakali kontrak existing. Subquestion retrieval, hybrid retrieval, provenance, dan source-linked synthesis sudah ada; proposal baru harus menyebut kemampuan spesifik yang belum dipenuhi.

## 7. Keputusan kandidat: dipakai, alternatif, dan ditunda

| Kandidat | Keputusan | Bagian yang diambil / alasan penundaan |
|---|---|---|
| ACE, ReMe, Hindsight | Acuan P1 | Semantik koreksi dan sumber; pemilik tetap engine existing |
| MemRL, AMD | Acuan P2 | Utility pemakaian serta petunjuk kegagalan; tanpa bank/teacher tambahan |
| AutoSkill/SkillEvo | Acuan P3 | Keputusan reuse/improve/merge/create/discard dalam lifecycle Skills existing |
| Trace2Skill | Pelengkap P3 bila diperlukan | Konflik antar-pelajaran; fokus rilis upstream pada spreadsheet perlu diperhatikan |
| MIMIC | Pola saja, adopsi utuh ditunda | Observer existing didahulukan; proyek awal dan risiko merekam rahasia |
| GEPA, ShinkaEvolve | Reuse adopsi parsial existing pada P4 | Jangan membuat portfolio, Pareto, atau optimizer kedua |
| SimpleMem/EvolveMem | Alternatif P2/P4 | Hanya untuk celah policy retrieval yang bernama; bukan engine Memory baru |
| AutoRAG | Referensi tambahan P2/P4 | Ledger feedback berguna; jangan menyalin hint global sebagai ranking query-aware |
| PerMemBench | Referensi selektivitas | `relevance.ts` sudah memiliki admission/relevance; tidak membuat gate kedua |
| TreeQuest | Ditunda | Search bercabang belum kebutuhan wajib, jangan tambah pohon di atas portfolio tanpa alasan |
| Kagura, Mem0, Graphiti, MemOS, MemoryOS, EverOS | Tidak dipasang dalam plan ini | Backend alternatif berisiko menggandakan store/index/ownership |
| SkillPort | Alternatif distribusi, bukan registry baru | Skills service existing dipakai lebih dahulu |
| OpenChrome, OpenSandbox, TARS, PaddleOCR | Di luar tahap inti Memory/learning | Hanya dibuka sebagai perluasan capability ketika ada gap konkret; browser existing tetap pemilik |
| Full agent frameworks, training/RL, model baru | Ditunda | Tidak diperlukan untuk satu controller eksternal dan adopsi mekanisme ini |
| Saï, sistem proprietary/paper-only | Referensi konsep | Tidak dianggap paket/API yang bisa langsung diintegrasikan |

Kandidat yang tidak disebut tetap berada di katalog. Tidak ada kewajiban menghabiskan seluruh kandidat. Alternatif hanya mengganti keputusan pada fungsi yang sama bila ada alasan, tidak otomatis ditambahkan di sampingnya.

## 8. Penyelesaian setiap tahap

Pelaksana menutup tahap dengan hasil yang ringkas:
1. Fungsi apa yang kini aktif dan bagaimana controller memakainya.
2. Source owner mana yang berubah atau dipakai ulang.
3. Record/revision/receipt operasional yang menunjukkan sambungan fungsi, jika tersedia; jangan mengarang bukti.
4. Kandidat mana yang ternyata tidak diperlukan karena fungsi existing sudah mencukupi.
5. Perubahan schema/tool dan kebutuhan unggah ulang plugin, bila ada.

Tidak menjadikan pemeriksaan berulang, laporan panjang, speed test, atau benchmark sebagai produk utama. Catatan **tersedia di source**, **terhubung ke runtime**, dan **membantu keputusan nyata** harus tetap dibedakan. Temuan kegagalan fungsi diarahkan ke perbaikan yang spesifik, bukan memulai ulang seluruh perencanaan.

### Dokumentasi, Memory lokal, dan plugin

- [x] Perbarui plan ini dan `MEMORY.md` dengan source owner dan status pelaksanaan yang selaras.
- [x] Sinkronisasi isi Memory operasional dan finalisasi Learning Linux selesai melalui owner aktif; record `f8a6042a-7ad1-4994-a1b7-812e170e30ad` dibaca kembali dengan `pendingReviewCount=0`. Rekonsiliasi status mempertahankan record yang sama dan riwayatnya, bukan membuat duplikat.
- [x] Jangan menulis bahwa integrasi sudah selesai hanya karena dokumen atau plan dibuat.
- [x] Utamakan tool existing dan nyatakan perubahan schema: field opsional `memoryFeedback` pada `controller_learning`, tanpa tool baru.
- [x] Kebutuhan exposure schema plugin ditutup berdasarkan laporan Windows pengguna: descriptor yang terhubung sudah menampilkan `memoryFeedback`. Tidak perlu mengulang refresh/re-upload hanya karena catatan historis masih menyebutnya pending; feedback manfaat nyata tetap belum diuji.
- [x] Kerjakan hal yang berada dalam kewenangan pelaksana tanpa meminta arahan berulang. Intervensi manusia hanya untuk kebutuhan nyata seperti unggah plugin, login/credential, izin keamanan, atau tindakan destruktif yang memerlukan persetujuan saat itu.

### Folder sementara dan salinan lama

Housekeeping dilaporkan sesuai batas bukti, bukan disimpulkan selesai menyeluruh. Rekonsiliasi ini tidak menjalankan tindakan Windows atau pembersihan baru.

- **Linux, pelaksanaan 12 Oktober 2026:** source aktif berada pada owner utama, `dist` standar telah dibangun, dan `runtime/tmp` dilaporkan kosong pada penutupan batch.
- **Windows, menurut laporan pengguna 12 Oktober 2026:** pemeriksaan `runtime/tmp` tidak menemukan item; receipt mencatat `ACTIVE_VERIFIED`, `COMPLETE_TMP_EMPTY`, serta enam item lama yang dipindahkan melalui Recycle Bin.
- **Belum terbukti di luar cakupan tersebut:** pemindahan seluruh materi dari setiap lokasi `temp`, pemeriksaan setiap item Recycle Bin, seluruh Scheduled Task, seluruh backup, dan ketiadaan seluruh kemungkinan dependency sementara. Jangan memberi centang selesai pada klaim yang lebih luas.
- **Batas tindak lanjut:** audit cleanup forensic dan hash arsip penuh bersifat opsional bila diminta terpisah. Ini bukan blocker pemasangan dan tidak otomatis menjadi task baru. Pertahankan receipt/backup; rekonsiliasi status tidak memberi izin penghapusan tambahan.

## 9. Sumber kandidat utama

- [ACE](https://github.com/ace-agent/ace)
- [ReMe consolidation](https://github.com/agentscope-ai/ReMe/blob/main/docs/en/auto_dream.md)
- [Hindsight observations](https://hindsight.vectorize.io/developer/observations)
- [MemRL](https://github.com/MemTensor/MemRL)
- [AMD: KAIST dan DeepAuto.ai](https://agent-memory-distillation.github.io/)
- [AutoSkill/SkillEvo](https://github.com/ECNU-ICALK/AutoSkill)
- [Trace2Skill](https://github.com/Qwen-Applications/Trace2Skill)
- [MIMIC](https://github.com/first-fluke/mimic)
- [GEPA](https://github.com/gepa-ai/gepa)
- [ShinkaEvolve](https://github.com/SakanaAI/ShinkaEvolve)
- [EvolveMem](https://github.com/aiming-lab/SimpleMem/blob/main/EvolveMem/README.md)
- [ReMe proactive read](https://github.com/agentscope-ai/ReMe/blob/main/docs/en/proactive.md)
- [TreeQuest](https://github.com/SakanaAI/treequest)

## 10. Urutan awal dan keputusan pelaksanaan

**Rencana awal saat inspeksi:** mulai dengan P0 dan P1, lalu P2 dan P3; P4 bersifat bersyarat, sedangkan P5 memakai hasil tahap sebelumnya tanpa mengasumsikan kemampuan membangunkan AI.

**Pelaksanaan yang kemudian disetujui:** integrasikan P0, P1, P2, P3, dan P5 melalui owner existing pada Linux; pakai ulang portfolio/Pareto untuk P4. Status awal “plan siap direview; implementasi belum dijalankan” sudah superseded oleh catatan bagian 12. Clone donor dan hasil inspeksi bagian 11 tetap merupakan referensi bertanggal, bukan service atau dependency runtime.

## 11. Hasil inspeksi checkout donor dan keputusan integrasi

**Selesai:** 12 shallow clone nyata pada Linux, masing-masing dengan commit tetap dalam manifest. ReMe consolidation dan proactive berasal dari repo yang sama, sehingga 13 tautan sumber utama menjadi 12 repository. Checkout berada di direktori referensi terpisah dari Agent Core. Tidak ada dependency donor dipasang, script donor dijalankan, model dipanggil, atau submodule benchmark diinisialisasi. Kajian ini terarah pada jalur mekanisme inti, bukan audit seluruh baris kode.

| Donor dan source yang dibaca | Temuan konkret | Keputusan untuk Agent Core |
|---|---|---|
| [ACE: curator](https://github.com/ace-agent/ace/blob/82709de050e1db6e6ef2f07bcb0393560b94992a/ace/core/curator.py), [playbook apply](https://github.com/ace-agent/ace/blob/82709de050e1db6e6ef2f07bcb0393560b94992a/playbook_utils.py) | Jalur apply menerapkan ADD; UPDATE/MERGE/DELETE masih TODO. Analyzer merge adalah komponen opsional berbeda. | P1 memakai delta/counterexample existing. Ambil pemisahan proposal dan apply, jangan mengganti koreksi yang lebih lengkap dengan curator donor. |
| [ReMe: integrate](https://github.com/agentscope-ai/ReMe/blob/c1de31ab2cf581394b821382d78d87eeeed35fad/reme/steps/evolve/dream/integrate.py), [proactive](https://github.com/agentscope-ai/ReMe/blob/c1de31ab2cf581394b821382d78d87eeeed35fad/reme/steps/evolve/proactive/proactive.py) | Empat kata kerja koreksi adalah kebijakan instruksi LLM. Lock proses dan snapshot mtime/size bukan transaksi lintas proses. Proactive reader tidak mengeksekusi follow-up. | P1 mempertahankan transaksi/revision existing; P5 mengambil topic identity, bukti waktu, dan suppression saja. |
| [Hindsight: writes](https://github.com/vectorize-io/hindsight/blob/a9eeed77f9bce99d8f97d39a30d3281747300824/hindsight-api-slim/hindsight_api/engine/memories/pg/writes.py), [consolidator](https://github.com/vectorize-io/hindsight/blob/a9eeed77f9bce99d8f97d39a30d3281747300824/hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py) | Dependency invalidation dan recheck sumber saat publikasi tersedia. Salah satu jalur create bisa memangkas ID sumber yang hilang tetapi mempertahankan prosa yang sudah dibuat. | P1 tidak menyalin perilaku itu: perubahan/hilangnya dependency yang dipatok membuat usulan perlu dihitung ulang, bukan sekadar menghapus sitasi. Gunakan project-synthesis dan prepare/apply existing. |
| [MemRL: memory service](https://github.com/MemTensor/MemRL/blob/c1b322ca43de36ddf64c6712f89d0095bfc35ce0/memrl/service/memory_service.py), [value driven](https://github.com/MemTensor/MemRL/blob/c1b322ca43de36ddf64c6712f89d0095bfc35ce0/memrl/service/value_driven.py) | Jalur aktif memadukan similarity dan Q serta eksplorasi; update dapat memberi credit kepada semua Memory yang diambil. | P2 mengambil pemisahan relevance/utility, tetapi hanya receipt penerapan yang sah boleh memberi bukti manfaat. Tidak menyalin blanket credit atau bank MemOS donor. |
| [AMD: store](https://github.com/taeilkim2465/agentic_memory_distillation/blob/2895d10c07105432325b088f4803dc94a10003c9/toolsandbox/common/memory/store.py), [injection](https://github.com/taeilkim2465/agentic_memory_distillation/blob/2895d10c07105432325b088f4803dc94a10003c9/toolsandbox/common/memory/injection.py) | Petunjuk dibatasi pada tool yang gagal, biasanya dua contoh. Kandidat sedikit dapat lolos tanpa minimum similarity; batas dalam prompt tidak selalu ditegakkan parser. | P2 perluas failure-context selector existing hanya jika belum mencukupi; pertahankan batas ukuran, relevansi, redaksi argumen, dan no-repeat existing. |
| [AutoSkill: maintenance](https://github.com/ECNU-ICALK/AutoSkill/blob/94c47ca488d4ba4117d20272e66d49b9877e68cf/autoskill/management/maintenance.py), [promotion](https://github.com/ECNU-ICALK/AutoSkill/blob/94c47ca488d4ba4117d20272e66d49b9877e68cf/autoskill/offline/conversation/self_evolve/promotion.py) | Identitas pekerjaan membantu revise/merge. Ada jalur promotion yang mengizinkan coverage tidak lengkap atau trace error sebagai warning. | P3 memakai identitas pekerjaan pada proposal existing. Bukti tidak lengkap tetap unknown; tidak mengganti keputusan aktivasi revision-bound yang sudah ada. |
| [Trace2Skill: reduce](https://github.com/Qwen-Applications/Trace2Skill/blob/3d0b52a140f002a512930252b613c49048f7d5ac/skill_evolver/parallel_evolving_agent.py), [apply/validate](https://github.com/Qwen-Applications/Trace2Skill/blob/3d0b52a140f002a512930252b613c49048f7d5ac/skill_evolver/skill_evolving_agent.py) | Final merge fallback dapat hanya mengembalikan patch pertama. Validator yang tidak ada dapat menghasilkan True. | P3 mempertahankan seluruh konflik/pending contribution; missing validator tidak berarti valid. Patch menuju staged revision, tidak langsung menimpa skill aktif. |
| [MIMIC: evolution](https://github.com/first-fluke/mimic/blob/3b179ecdb0f59254efaaad4eb6d24d85f671014d/apps/opencode-plugin-mimic/src/modules/evolution/engine.ts), [instincts](https://github.com/first-fluke/mimic/blob/3b179ecdb0f59254efaaad4eb6d24d85f671014d/apps/opencode-plugin-mimic/src/modules/knowledge/instincts.ts) | Generator command/hook/skill mengandung TODO; output MCP placeholder. Beberapa fallback dapat memilih pola tanpa bukti terkait. | Hanya pola ringkasan observasi, cooldown, dan penjelasan proposal. Tidak dipilih sebagai generator capability siap pakai. |
| [GEPA: acceptance](https://github.com/gepa-ai/gepa/blob/462e437a09be67d2acb59564cc0ea59132f5777c/src/gepa/strategies/acceptance.py), [mutation](https://github.com/gepa-ai/gepa/blob/462e437a09be67d2acb59564cc0ea59132f5777c/src/gepa/proposer/reflective_mutation/reflective_mutation.py) | Satu authority memilih/menerima kandidat; konfigurasi tertentu menerima skor sama. Agent Core telah mengadopsi coverage portfolio dari revision lebih lama. | P4 mempertahankan owner dan attribution historis; nilai sama bukan bukti peningkatan. Tidak memasang optimization engine kedua. |
| [ShinkaEvolve: archive](https://github.com/SakanaAI/ShinkaEvolve/blob/8adc053a2ce4511ad2ac310e004c530a73fb974a/shinka/database/dbase.py), [novelty](https://github.com/SakanaAI/ShinkaEvolve/blob/8adc053a2ce4511ad2ac310e004c530a73fb974a/shinka/core/novelty_judge.py) | Archive terbaru memakai fitness/crowding dan ranking beberapa kriteria; bukan identik dengan pairwise Pareto lama yang sudah diadopsi Agent Core. Novelty bisa tidak dinilai ketika data tidak tersedia. | P4 hanya menambah lineage/inspiration bila dibutuhkan. Baru/berbeda tidak otomatis benar, berguna, atau diizinkan. |
| [SimpleMem: retriever](https://github.com/aiming-lab/SimpleMem/blob/db80b6a7c591e0ea730a058e9f5fc4eb06572299/simplemem/core/hybrid_retriever.py), [EvolveMem: replay](https://github.com/aiming-lab/SimpleMem/blob/db80b6a7c591e0ea730a058e9f5fc4eb06572299/EvolveMem/evolvemem/replay.py) | Ada implementasi referensi lama selain jalur core terbaru. Label candidate_beats_baseline dapat memakai perbandingan non-strict >= sehingga hasil setara masuk label tersebut. | P2/P4 memakai bounded subquestion retrieval existing. Jangan menyalin implementasi ganda atau menyebut hasil setara sebagai perbaikan. |
| [TreeQuest: interface](https://github.com/SakanaAI/treequest/blob/96047d712d66bbbf4dcc86dcd3e2eaab98c35f83/src/treequest/algos/base.py), [trial](https://github.com/SakanaAI/treequest/blob/96047d712d66bbbf4dcc86dcd3e2eaab98c35f83/src/treequest/trial.py) | State milik caller, ask/tell dan penanganan completion berulang tersedia. Library tidak menyediakan kebenaran reward atau Memory. | Tetap opsional setelah P4 mempunyai kebutuhan pencarian bercabang; tidak menambah sidecar Python atau registry trial terpisah sekarang. |

### Penyempurnaan langkah integrasi dari hasil source

- **P1:** tambah hanya semantik koreksi yang belum dicakup `reviewDelta`/promotion. Usulan yang dependency-nya berubah tetap usulan, lalu dihitung ulang dari sumber terkini. Jangan menurunkan kemampuan existing demi mengikuti donor.
- **P2:** gunakan `feedback` dan `recordUseReceipt`; tidak perlu menyimpan Q upstream bila bounded feedback existing sudah mencukupi. Pisahkan petunjuk error dari recall umum melalui selector failure existing.
- **P3:** refinement/merge berangkat dari baseline digest yang sama. Jika consolidation sebagian gagal, simpan yang belum terselesaikan sebagai pending, bukan membuang kontribusi diam-diam. Aktivasi tetap melalui `SkillService` yang sudah ada.
- **P4:** label yang dipakai harus membedakan `improved`, `equivalent`, `regressed`, dan `unknown` secara semantik; gunakan field existing atau mapping pada laporan, bukan enum/database baru tanpa kebutuhan. Pertahankan hasil yang tersedia, jangan mengulang seluruh workflow karena sebagian bukti belum lengkap.
- **P5:** read-only intention/topic exposure bisa dipakai pada batas sesi/tool; perubahan status tetap melalui owner existing. Tidak ada janji wake atau tindakan offline yang belum didukung host.

### Lisensi dan batas adopsi

Manifest mencatat keberadaan berkas lisensi, bukan izin menyeluruh untuk setiap dependency. AutoSkill menyatakan MIT di README, Trace2Skill menyatakan Apache-2.0, MIMIC menyatakan MIT pada README/package tetapi ketiganya tidak memiliki teks lisensi root dalam snapshot ini. AMD tidak ditemukan berkas lisensinya. Untuk kandidat tersebut, plan memilih implementasi mekanisme secara mandiri dan tidak menyalin source substansial sebelum dasar izin dan notice jelas. Kandidat berlisensi juga tetap memerlukan atribusi serta pemeriksaan lisensi komponen yang benar-benar diambil.

**Paket publikasi:** plan ini, manifest commit sumber, dan catatan kontinuitas repository. Checkout donor tetap berada di Linux sebagai referensi; tidak dimasukkan ke GitHub Agent Core sebagai salinan codebase, dependency, submodule, atau sistem aktif.


## 12. Status implementasi, aktivasi, dan penutupan scope — 12 Oktober 2026

### Ringkasan pelaksanaan Linux (bukti historis 12 Oktober 2026)

- **P0 diimplementasikan dan fresh root Linux diaktifkan.** `runtime/memory-v2-activation.json` kini memakai schema 2, `root: runtime/memory`, `mode: experience-v2`, dan identitas engine `256e31b4-0186-4265-86f4-ea2cb3e16175`. Aktivasi tercatat pada `2026-10-12T05:56:25.018Z`; manifest engine mempunyai identitas yang sama. Nama metadata engine tidak mengubah nama folder penyimpanan. Tidak ada root paralel `runtime/memory-v2` yang dibuat untuk aktivasi fresh.
- **P1, P2, P3, P5 diimplementasikan pada jalur existing.** Source owner dan batas tiap jalur ada pada tabel berikut. Implementasi bukan bukti bahwa semua alur sudah memberi manfaat dalam pekerjaan pengguna.
- **P4 dipakai ulang.** Portfolio/Pareto/riwayat existing cukup untuk batch ini; tidak ada optimizer, model, daemon, atau store donor tambahan yang diperlukan. Tidak ada klaim siklus optimisasi baru sudah dijalankan.
- **Sinkronisasi operasional Linux selesai pada 06:07 UTC, terpisah dari implementasi source:** pelaksana utama sudah membaca owner terlebih dahulu, menyimpan record interim `f8a6042a-7ad1-4994-a1b7-812e170e30ad`, dan membacanya kembali secara tepat. Episode controller adalah `ext-d3f2bf5039ec49a9a52a1511dada14bc`; episode Memory adalah `af631b5b-5fb7-48f2-8fc6-16012752a0a9`. Isi final diamend melalui checkpoint/reviewDelta pada record yang sama; riwayat lama tetap tersedia (1 revision). Revision saat penutupan awal `sha256:dd492b17c8ba733787154b53342dd69d344ad9336f3004861aa429458c62a00f` berhasil dibaca kembali sesudah reopen, cocok dengan ringkasan bersama saat itu, dan ditemukan melalui fusion recall. Learning finalization selesai dengan `pendingReviewCount=0`. Pernyataan plugin belum selesai berlaku pada waktu itu saja dan superseded oleh laporan Windows di bawah.
- **Batas pelaksanaan Linux:** tidak ada relokasi root historis atau deployment Windows yang dijalankan oleh pelaksana Linux. Marker schema 1 tetap dibaca secara kompatibel; relokasi ke nama canonical tersedia sebagai operasi offline eksplisit setelah semua writer berhenti dan data/backup lolos pemeriksaan.

### Penutupan Windows berdasarkan laporan pengguna

Sumber: `Pengujian-Integrasi-Independen.md`, Library ID `libfile_1c0cb9310d3c819182c5b378e2a90e15`, diberikan pengguna pada 12 Oktober 2026. Laporan berasal dari [sesi pengujian Windows](https://chatgpt.com/g/g-p-6a4731eb0df081918f4e64005909762b-joe/c/6accc358-6944-83ec-8cc1-3904bc651b5b). Ini laporan yang diberikan pengguna, bukan hasil verifikasi langsung Windows dalam rekonsiliasi Linux ini.

- Laporan menyatakan `/health` HTTP 200 / `ok`, versi `0.15.0-beta.3`, marker schema 2 / `complete`, canonical `runtime/memory`, root ID `84705917-7036-4eb4-b4a4-bf9de887aab8`, dan 133 record pada waktu pemeriksaan. Jumlah record merupakan snapshot, bukan invariant.
- Task, event, capsule, task context controller, Learning checkpoint/idempotency/review dinyatakan operasional; review key pengujian selesai dengan `no-new-knowledge`, tanpa durable knowledge sintetis.
- `memoryFeedback` sudah terlihat pada descriptor plugin yang benar-benar terhubung di sesi laporan. Ini menutup pending exposure/refresh plugin; tidak membuktikan outcome `helpful`/`not-helpful` atau manfaat terukur.
- Identitas root dan sampel record historis dapat dibaca menurut laporan. Hash seluruh arsip, audit menyeluruh 28 file rekonsiliasi, manfaat feedback nyata, dan cleanup forensic belum dibuktikan. Verdict laporan tetap **PARTIAL PASS** untuk keseluruhan cakupan audit; jangan mengubahnya menjadi PASS penuh.
- Berdasarkan jalur inti yang berhasil dilaporkan, pengguna dan assistant menutup **scope pemasangan sampai aktif**. Tidak ada tindakan pengguna mendesak atau tahap wajib tersisa. Batas bukti tadi bukan blocker pemasangan, bukan alasan memasang ulang, dan bukan daftar tugas baru.

### Hitungan kandidat dan batas adopsi

- **216 entri katalog:** bahan discovery/alternatif, bukan 216 kewajiban instalasi.
- **12 repository di-clone dan dipelajari:** checkout referensi dengan commit dipatok. Ini bukan klaim 12 framework diintegrasikan utuh; adopsi hanya mekanisme/kontrak terpilih pada owner Agent Core yang sudah ada.
- **0 tahap wajib tersisa dalam batch yang disetujui:** P0/P1/P2/P3/P5 diimplementasikan, P4 reuse. Kandidat opsional/ditunda di bagian 7 tetap bukan pekerjaan yang otomatis harus dilanjutkan.

### Source owner dan hasil yang dihubungkan

| Tahap | Owner source | Implementasi/pemakaian ulang dan batas |
|---|---|---|
| P0 | `src/memory/host-runtime.ts`, `src/memory/host-activation.ts`, `scripts/memory/activate-canonical.mjs`; binding existing pada `src/learning/external-controller.ts` | Satu selector host, aktivasi fresh canonical dan relokasi eksplisit. Marker incomplete, identitas berbeda, orphaned experience data, root konflik, dan backup tidak cocok ditolak; tidak menginisialisasi writer legacy untuk menyembunyikan kehilangan metadata experience. Scope controller tetap berasal dari episode yang diikat host. |
| P1 | `src/learning/{service,memory-sink}.ts`; `SubProject/agent-core-memory/src/memory/{promotion,service,episodes}.ts` | Delta refinement/counterexample dipromosikan melalui episode, revision target, sumber berpinned, dan reviewer host untuk digest plan yang tepat. Riwayat serta metadata sah dipertahankan. Source dependency diperiksa kembali sebelum publikasi; perubahan sumber/target membuat usulan perlu diperiksa ulang, bukan menghapus bukti diam-diam. |
| P2 | `src/learning/external-controller.ts`, `src/mcp/controller-learning-{schemas,tools}.ts`; kedua owner `memory/retrieval-ledger.ts`, feedback/retrieval existing | Receipt penggunaan tetap mengikat task, attempt, record, revision, tindakan, dan verifikasi. `memoryFeedback` bersifat penilaian eksplisit setelah pemakaian applied/adapted yang terverifikasi; retrieval atau hasil sukses saja tidak otomatis berarti helpful. Feedback dibatasi/dideduplikasi; failure advisor dan ranking existing dipakai ulang. |
| P3 | `src/skills/service.ts`; owner proposal/decision/outcome Learning existing | Build revisi mempertahankan supporting files dan metadata Skill dari baseline digest yang tepat. Staging/promosi menolak baseline yang berubah. Proposal, build, aktivasi, dan manfaat tetap keadaan berbeda; keputusan aktivasi existing tidak dilonggarkan. |
| P4 | `src/learning/retrieval-{portfolio,pareto,series}.ts` dan jalur improvement/outcome existing | Reuse owner existing; tidak memasang archive/optimizer kedua atau memberi kewenangan mengubah source/credential dari catatan Learning. |
| P5 | `src/learning/external-controller.ts`; `SubProject/agent-core-memory/src/memory/prospective-intentions.ts` | Context controller menampilkan task context dan eligible intentions dari episode sah; owner mengutamakan item eligible sebelum pemangkasan batas jumlah, dengan suppression paparan berdasarkan episode/revision/item. Paparan tetap advisory dan delivery belum dikonfirmasi; tidak menyelesaikan obligation, tidak memberi izin tindakan, dan tidak membangunkan AI offline. |

### Ringkasan implementasi bersama

<!-- adoption-memory-summary:start -->
Status 12 Oktober 2026: scope pemasangan sampai aktif ditutup; 0 tahap wajib tersisa. Katalog 216 kandidat dan 12 clone adalah referensi, bukan 12 framework terintegrasi utuh. P0/P1/P2/P3/P5 diimplementasikan; P4 reuse portfolio/Pareto. Satu owner memakai runtime/memory. P1 menjaga koreksi, sumber dan riwayat melalui delta Learning; P2 menilai memoryFeedback hanya setelah penggunaan terverifikasi; P3 menjaga resource dan revision Skill; P5 intention terikat episode tanpa wake offline. Aktivasi, sinkronisasi record dan Learning Linux selesai. Laporan Windows pengguna Pengujian-Integrasi-Independen.md menyatakan root canonical schema 2 complete, jalur task/event/capsule/context/checkpoint/review aktif, dan memoryFeedback terekspos plugin; ini tidak diverifikasi langsung oleh pelaksana Linux. PARTIAL PASS laporan membatasi audit arsip penuh, manfaat feedback dan cleanup forensic yang belum terbukti. Batas itu bukan blocker instalasi atau task baru. Jangan mengulang pemasangan/refresh yang sudah ditutup tanpa kebutuhan baru. Riwayat sebelum penutupan dipertahankan.
<!-- adoption-memory-summary:end -->

### Kontrak connector dan pemanggilan awal

Tidak ada tool baru. Schema `controller_learning` menambah field opsional `memoryFeedback: helpful | not-helpful` untuk `action: artifact_receipt`, `artifactKind: memory`, dan pemakaian applied/adapted dengan outcome terverifikasi. Pada awal implementasi descriptor lama memerlukan refresh/re-upload; kebutuhan exposure tersebut sudah ditutup oleh laporan Windows pengguna yang menampilkan field ini pada plugin terhubung. Pemanggilan lama tanpa field tersebut tetap tidak mengirim penilaian manfaat secara tersirat. Jangan mengulang refresh tanpa bukti descriptor kembali tertinggal.

Mulai dengan Memory-first melalui `memory_list`/`memory_read`. Buat atau resume episode melalui `controller_learning(action=episode, episodeOperation=start, taskKey=..., workspace=...)`; gunakan `taskId` yang dikembalikan sebagai scope pada jalur Memory experience existing. Bila perlu episode Memory untuk koreksi/intention, gunakan `memory_v2_write(action=task_start, scope={taskId}, payload=...)`, lalu `controller_learning(action=context)` untuk konteks bersama. Kirim `artifact_receipt` hanya untuk pemakaian yang benar-benar diketahui beserta evidence/revision/attempt; sertakan `memoryFeedback` hanya jika penilaian eksplisit memang tersedia. Finalisasi tetap melalui checkpoint/review Learning existing.

### Verifikasi dan batas kesimpulan

**Bukti historis implementasi Linux; tidak dijalankan ulang saat rekonsiliasi status.** Build canonical (`npm run build`, termasuk path policy dan build subproject Memory) serta pemeriksaan terarah dijalankan selama implementasi. Bukti tes berada pada `tests/memory-canonical-activation.test.ts`, `tests/memory-v2-host-integration.test.ts`, `tests/learning-curation-promotion.test.ts`, `tests/adoption-reuse-wiring.test.ts`, pemeriksaan receipt/ledger, dan tes promotion/synthesis subproject yang terkait. Build akhir resmi lulus (path policy: 361 authored files, tanpa exception). Pemeriksaan gabungan akhir: 36 kasus pada 5 file lulus; pemeriksaan koreksi/curation terakhir: 26 kasus lulus; engine promotion terakhir: 139 kasus lulus. Angka kelompok dapat bertumpang-tindih dan tidak dijumlahkan atau diklaim sebagai seluruh repository.

Aktivasi, amendment record tugas, readback setelah reopen, fusion recall, dan finalisasi Learning Linux sudah dilakukan pada data canonical aktual. Hash isi bersama pada penutupan awal 06:07 UTC: `a42c5ff0df2833bf40f4d7da31b8a7d2fc10b9201a0b3389c00fc48153bd2d9b`; ini bukan hash ringkasan rekonsiliasi terbaru. Status Windows dan exposure connector berasal dari laporan pengguna di atas, bukan disimpulkan dari build atau fixture. Manfaat pada tugas pengguna tetap belum dibuktikan. Tidak ada benchmark atau klaim peningkatan kecerdasan/kecepatan untuk batch ini.

### Penutupan operasional batch

Implementasi aktif berada pada source utama; build memperbarui dist standar, tanpa dist atau store tandingan. `runtime/tmp` Linux kosong; tidak ada implementasi aktif untuk dipindahkan atau data sementara untuk dihapus. Tidak ada dependensi tambahan yang diperlukan. Pemeriksaan akhir menemukan dan memperbaiki celah validasi sumber saat commit, pemulihan receipt setelah sumber hilang, preservasi metadata link, dan pemangkasan intention. Publikasi hanya mencakup perubahan batch ini; perubahan dokumentasi lokal yang sudah ada dipertahankan.

### Rekonsiliasi dokumentasi dan Memory — 12 Oktober 2026

Ringkasan bersama terbaru menjadi isi amendment pada record Linux yang sama, `f8a6042a-7ad1-4994-a1b7-812e170e30ad`, melalui resume episode adopsi yang masih terbuka serta checkpoint/reviewDelta baru. Riwayat penutupan awal dipertahankan. Receipt rekonsiliasi `runtime/learning/adoption-status-reconcile-20261012-receipt.json` mencatat revision tepat, hash isi, hasil review, readback, dan jumlah pending review. Ini koreksi kontinuitas status, bukan implementasi fitur, instalasi, pengujian ulang, atau verifikasi langsung Windows.
