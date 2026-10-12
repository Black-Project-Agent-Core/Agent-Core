# Plan Adopsi Bertahap Learning, Memory, dan Self-Improvement Agent Core

**Status:** plan integrasi berbasis checkout kandidat; implementasi fitur belum dijalankan.  
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

Checkout yang diperiksa berada pada revisi `8d1f1582411b16548cd52f0b869dd1d59ebe51f8`. Source default branch GitHub juga dibaca untuk `src/memory/host-runtime.ts`, `src/learning/curation-delta.ts`, dan ekspor Memory subproject. Ada perubahan dokumentasi lokal yang sudah ada; plan ini tidak menimpanya.

Temuan source:
- Memory memiliki recall, episode, bukti, consolidation, revision/temporal history, project synthesis, dan prospective intentions.
- Learning memiliki curation delta, counterexample, receipts pemakaian, prosedur, serta proposal skill.
- Retrieval memiliki portfolio, diversity, Pareto, dan riwayat; sebagian pola Shinka sudah diadopsi.
- **`host-runtime.ts` masih memuat target `runtime/memory-v2`.** Ini berbeda dari keputusan pengguna tentang nama penyimpanan, tetapi bukan bukti bahwa mesin Windows sedang memakai folder tersebut.
- Credential scheduler adalah penjadwalan credential/quota provider, **bukan scheduler tugas atau pengingat**.

**Target penyimpanan Memory:** `<PROJECT_ROOT>/runtime/memory`; pada mesin Windows pengguna saat ini: `E:\Projects\Agent-Core\runtime\memory`. Nama folder tetap `memory` pada Linux maupun Windows. Versi engine v2/v3/v4 dan seterusnya boleh berubah tanpa mengubah nama lokasi penyimpanan. Target ini bukan klaim bahwa migrasi Windows sudah selesai. Nama versi engine boleh dipertahankan pada kode. Skills dan state operasional yang punya tanggung jawab berbeda tetap memakai pemilik aslinya; satu folder Memory tidak berarti memindahkan semua state aplikasi ke sana.

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

### P0. Satukan jalur aktif dan penyimpanan

**Prioritas:** pertama. **Donor baru:** tidak ada.

- [ ] Cocokkan source utama terbaru, entrypoint, build, tool schema, dan resolver root pada mesin pelaksanaan; catat satu pemilik untuk setiap fungsi pada tabel di atas.
- [ ] Selaraskan root akhir ke `runtime/memory`, termasuk konfigurasi dan activation metadata yang bergantung pada nama lama. Jangan hanya mengganti nama folder atau melemahkan integritas marker.
- [ ] Jika format data berbeda, gunakan jalur migrasi/transfer milik engine; pertahankan ID, bukti, revision, dan relasi. Jangan menumpuk isi dua format dalam satu root atau menjalankan dua writer.
- [ ] Hubungkan episode controller yang sah ke Memory melalui scope/binding host yang sudah tersedia; cocokkan schema connector dengan implementasi sumber, tanpa membuat identitas episode palsu.
- [ ] Pastikan jalur yang dipakai AI eksternal menunjuk service tersebut. Lengkapi build/entrypoint dari source utama, bukan hanya menyimpan patch di folder sementara.

**Hasil aktif:** controller bisa membaca dan menulis melalui jalur yang sama, dengan root dan engine yang eksplisit; tidak ada kebingungan tentang salinan mana yang dipakai.

**Catatan:** tahap ini menyelesaikan sambungan integrasi. Bukan perluasan task ke game, model lokal, atau browser baru.

### P1. Koreksi Memory dan pelajaran yang terlacak

**Acuan utama:** ACE #1 dan ReMe #28. **Pelengkap:** provenance Hindsight #27. Ambil mekanismenya saja.

**Owner:** curation delta/curator yang sudah ada; `controller-session.ts`, `promotion.ts`, `revisions.ts`, `provenance.ts`, dan `project-synthesis.ts` pada engine Memory.

- [ ] Gunakan delta `add-lesson` / `add-counterexample` yang sudah ada. Bedakan menguatkan bukti, mempersempit cakupan, dan mengoreksi record; jangan menambah record identik setiap sesi.
- [ ] Sertakan sumber, waktu, ruang lingkup penerapan, dan revision target pada koreksi. Pisahkan observasi, dugaan, keputusan, dan hasil.
- [ ] Saat sumber berubah, tandai kesimpulan turunannya untuk direvisi melalui dependency yang sudah tersedia; jangan menganggap seluruh Memory otomatis salah.
- [ ] Pertahankan riwayat koreksi dan alasan penggantian. Pengetahuan lama yang tidak lagi berlaku tidak boleh muncul sebagai fakta terkini.
- [ ] Hubungkan keputusan konsolidasi ke episode asal dan ke pembacaan berikutnya melalui kontrak existing.

**Hasil aktif:** kesalahan tidak hanya dicatat; pelajarannya direvisi, riwayatnya terlihat, dan versi yang sesuai konteks yang disajikan kembali.

**Anti-duplikasi:** tidak memasang bank Hindsight, workspace ReMe, atau playbook ACE sebagai penyimpanan paralel.

### P2. Perbaiki retrieval berdasarkan pemakaian nyata

**Acuan utama:** utility MemRL #2. **Korea:** AMD #83 sebagai pola bantuan ketika tool gagal. **Alternatif nanti:** AutoRAG #82 atau SimpleMem/EvolveMem #25 bila ada celah kebijakan retrieval spesifik.

**Owner:** `retrieval-ledger.ts`, `feedback.ts`, `retrieval.ts` milik engine terpilih; `artifactReceipt` pada controller eksternal; modul retrieval Learning yang sudah ada; failure advisor yang sudah ada.

- [ ] Sambungkan retrieval yang disajikan dengan receipt ketika Memory benar-benar dipakai. Record diambil, dibaca, diterapkan, dan bermanfaat adalah kejadian berbeda.
- [ ] Gunakan ID/revision/attempt yang tersedia untuk menghubungkan hasil tindakan. Bila manfaat tidak dapat diatribusikan, simpan sebagai belum diketahui, bukan keberhasilan palsu.
- [ ] Perluas pemeringkatan existing dengan kegunaan yang didukung hasil, sambil menjaga relevansi, validitas waktu, ruang lingkup, dan keberagaman. Jangan membuat search engine kedua.
- [ ] Untuk kegagalan tool, ambil petunjuk relevan dari pengalaman yang sudah ada berdasarkan jenis kegagalan, argumen, serta prasyarat. Controller tetap memutuskan perbaikan berikutnya.
- [ ] Hindari mengulang petunjuk identik pada error yang sama tanpa bukti baru; gunakan batas pengulangan milik jalur existing.

**Hasil aktif:** pengalaman yang tepat memengaruhi pilihan berikutnya; tool failure dapat memunculkan petunjuk koreksi bersumber.

**Anti-duplikasi:** tidak memasang overlay benchmark AMD atau teacher agent. Lisensi kode AMD yang belum jelas perlu diselesaikan sebelum menyalin implementasinya; pola dapat dirancang sendiri dari publikasi.

### P3. Pengalaman menjadi skill yang bisa diperbarui

**Acuan utama:** AutoSkill/SkillEvo #17. **Pelengkap:** Trace2Skill #155. **Korea:** MIMIC #129 hanya untuk pola observasi menjadi usulan, setelah trace existing dimanfaatkan.

**Owner:** controller procedure, `src/skills/service.ts`, seluruh jalur skill proposal yang sudah ada.

- [ ] Bentuk usulan dari episode dan pelajaran P1–P2, lengkap dengan bukti, prasyarat, batas tool, cakupan, dan kondisi tidak berlaku.
- [ ] Cari fingerprint dan skill terkait sebelum memilih salah satu keputusan: pakai ulang, perbaiki, gabung, buat, atau buang usulan.
- [ ] Untuk koreksi skill, targetkan revision tertentu; pertahankan pengecualian yang sah dan jangan menggabungkan dua prosedur dengan prasyarat yang saling bertentangan.
- [ ] Simpan perubahan sebagai revisi pada registry yang sama. Muat hanya skill relevan ke konteks controller, bukan seluruh katalog.
- [ ] Hubungkan outcome pemakaian ke revisi skill agar revisi buruk bisa ditarik melalui jalur yang sudah ada.

**Hasil aktif:** tugas berikutnya memakai prosedur yang telah dipelajari, dan kesalahan memperbaiki prosedur yang sama, bukan melahirkan tumpukan skill serupa.

**Anti-duplikasi:** tidak memasang registry SkillPort terpisah, proxy AutoSkill, atau observer MIMIC kedua bila event existing sudah memadai. Pengamatan tool harus menyaring rahasia dan data tak relevan.

### P4. Perbaikan terbatas pada artefak milik sistem

**Acuan:** GEPA #3 dan ShinkaEvolve #194. **Keputusan:** adopsi tambahan ditunda sampai P1–P3 benar-benar menyediakan artefak dan feedback yang dibutuhkan.

**Owner:** jalur improvement/outcome dan retrieval portfolio/Pareto/series existing.

- [ ] Pakai kemampuan portfolio/Pareto/riwayat yang sudah ada; source menunjukkan adopsi parsial Shinka, sehingga jangan membuat archive atau optimizer baru.
- [ ] Batasi satu siklus pada satu jenis artefak: misalnya aturan retrieval atau instruksi skill. Catat parent revision, perubahan, alasan, dan bukti hasil.
- [ ] Controller mengusulkan revisi; mekanisme lokal menangani penyimpanan, batas, dan keputusan penerapan menurut otoritas existing.
- [ ] Pertahankan versi yang sedang dipakai dan jalur pemulihan. Hasil yang belum jelas tidak boleh dipromosikan menjadi klaim peningkatan.
- [ ] Jangan memberi izin perubahan source produksi, credential, atau kebijakan keamanan hanya karena usulan berasal dari proses learning.

**Hasil aktif:** perbaikan artefak kecil dapat diterapkan dan dibatalkan dengan alasan yang jelas, tanpa agent pengubah dirinya secara tak terbatas.

**Alternatif:** TreeQuest #193 hanya jika nanti diperlukan search state ask/tell yang tidak bisa diwakili portfolio existing. Bukan dependensi wajib atau scheduler baru.

### P5. Proaktif berdasarkan pengalaman dan konteks

**Acuan:** prospective intentions milik Agent Core; pola `proactive_read` ReMe #28. Saï #96 tetap referensi produk, bukan SDK yang diasumsikan tersedia.

**Owner:** `prospective-intentions.ts`, project synthesis, dan konteks controller eksternal.

- [ ] Bentuk intention dari kebutuhan eksplisit atau pengalaman yang relevan, dengan sumber, kondisi pemicu, masa berlaku, serta batas kewenangan.
- [ ] Pada titik konteks yang sudah tersedia, seperti awal/resume sesi atau hasil tool, bandingkan observasi dengan intention dan tampilkan kandidat perhatian yang relevan.
- [ ] Bedakan pernah ditampilkan, ditunda, selesai, dan kedaluwarsa agar pengingat tidak berulang tanpa perubahan.
- [ ] Controller memutuskan respons/tindakan sesuai izin pengguna. Memory tidak boleh mengubah catatan menjadi izin baru.
- [ ] Bila host tidak bisa membangunkan sesi AI yang sedang tidak aktif, antrekan intention sampai sesi tersedia. Jangan mengklaim proaktif offline atau memakai credential scheduler sebagai scheduler tugas.

**Hasil aktif:** controller mengenali kejadian serupa dan mengangkat kebutuhan yang relevan berdasarkan pengalaman, dengan bukti serta batas yang dapat dipahami.

**Perluasan opsional:** timer/wake adapter hanya menjadi task terpisah jika kebutuhan nyata dan dukungan host telah jelas. Bukan syarat menyelesaikan P0–P4.

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

- [ ] Setelah perubahan diterapkan, perbarui dokumentasi dan Memory lokal melalui jalur yang sama, dengan revision/sumber dan status yang selaras.
- [ ] Jangan menulis bahwa integrasi sudah selesai hanya karena dokumen atau plan dibuat.
- [ ] Utamakan tool existing. Jika schema/tool baru memerlukan unggah ulang custom plugin, beritahu pengguna dengan nama tool/perubahan dan paket yang perlu diunggah. Jelaskan juga pemanggilan awal tool terkait saat aktivasi.
- [ ] Kerjakan hal yang berada dalam kewenangan pelaksana tanpa meminta arahan berulang. Intervensi manusia hanya untuk kebutuhan nyata seperti unggah plugin, login/credential, izin keamanan, atau tindakan destruktif yang memerlukan persetujuan saat itu.

### Folder sementara dan salinan lama

- [ ] Setelah integrasi benar-benar berada pada source utama dan tidak ada dependency aktif pada lokasi sementara, pindahkan seluruh materi yang masih diperlukan ke owner yang benar.
- [ ] Inventarisasi lokasi `temp` dan `E:\Projects\Agent-Core\runtime\tmp` yang tepat; jangan menganggap semua folder bernama temp di komputer termasuk scope.
- [ ] Bersihkan seluruh isi lokasi sementara yang berada dalam scope setelah syarat tadi terpenuhi. `runtime/tmp` bukan pengecualian permanen.
- [ ] Gunakan penghapusan yang dapat dipulihkan bila tersedia. Penghapusan permanen yang tidak dapat dipulihkan memerlukan konfirmasi saat tindakan; izin membuat plan bukan izin menghapus data sekarang.
- [ ] Cadangan pemulihan yang diperlukan harus jelas perannya, tidak di-load sebagai runtime alternatif, dan bukan alasan membiarkan codebase aktif di temp.

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

## 10. Mulai dari mana?

**Batch pertama hanya P0 dan P1.** Tujuannya satu jalur aktif dan koreksi yang benar-benar terbaca kembali. Sesudah itu P2, kemudian P3. P4 bersifat bersyarat, dan P5 memanfaatkan hasil tahap sebelumnya tanpa mengasumsikan kemampuan membangunkan AI.

Plan ini siap direview. Task ini mencakup clone referensi, kajian source, penyusunan plan di checkout Agent Core, dan publikasi dokumen ke repo sesuai permintaan. Migrasi Memory, implementasi fitur, instalasi dependency donor, dan aktivasi plugin belum dijalankan.

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
