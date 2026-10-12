# Plan Batch 2 — Pencarian Skill Terarah dan Pembacaan Revisi yang Tepat

**Status:** DISETUJUI DAN DIIMPLEMENTASIKAN pada source utama Linux, 12 Oktober 2026. Build berhasil. Pemasangan runtime Windows dilakukan kemudian oleh AI pengguna dari hasil repository; belum diklaim terpasang di Windows.
**Tujuan:** controller eksternal dapat menemukan Skill yang relevan melalui query, melihat batas pemakaiannya, lalu membaca instruksi dari revisi yang dipilih, tanpa membongkar seluruh katalog atau menjalankan runtime donor.
**Arsitektur:** `SkillService` tetap satu-satunya owner katalog dan pembacaan artefak. Satu selector internal dipakai oleh `skills(search)` dan knowledge synthesis. Pencarian leksikal lokal menjadi default; kandidat semantik opsional memakai instance embedder host yang sudah ada, hanya atas permintaan eksplisit. Memory, Learning, proposal, aktivasi, grant, dan receipt existing tetap menjadi owner masing-masing.
**Baseline analisis awal (historis):** `38b00b53650b2893017e50df852013ef270902eb`, dibaca 12 Oktober 2026. Batch 1 sedang diimplementasikan dalam checkout yang sama. Cocokkan perubahan relevan satu kali saat handoff; jangan menimpa kerja Batch 1.
**Batas kompleksitas:** satu kemampuan utama, enam fase berurutan, satu penulis aktif per file. Tidak ada model selector, database vektor baru, daemon, adapter donor, atau agent berbasis API tambahan.
**Bahasa implementasi:** TypeScript pada stack Node existing. Tidak ada dependency produksi baru yang diperlukan oleh rancangan ini.

## 1. Temuan baseline yang mendasari implementasi

Pembacaan source menemukan empat bagian dari satu alur yang masih lemah:

1. `SkillService.list()` mengembalikan katalog terurut nama, dengan batas 500 entri sebelum penyaringan direktori; `inspect()` hanya mengembalikan metadata. Belum ada pencarian query maupun pembacaan instruksi terikat digest melalui tool Skills. Lihat [`service.ts:638–655`](../../src/skills/service.ts#L638-L655).
2. `rankKnowledge()` membuang skor BM25 nol. Skill diranking dari nama, deskripsi, dan declared tools saja; query parafrasa tanpa overlap tidak menghasilkan kandidat semantik. Pemilihan Skill ini diulang pada [`agent-knowledge-synthesis.ts:112–124`](../../src/agent-knowledge-synthesis.ts#L112-L124) dan [`external-controller.ts:935`](../../src/learning/external-controller.ts#L935).
3. Proposal yang disetujui sudah menghasilkan bagian `## Trigger` dan `## Non-trigger` di `SKILL.md`, tetapi informasi tersebut tidak masuk descriptor pencarian. Lihat [`service.ts:534–547`](../../src/skills/service.ts#L534-L547). Metadata yang tersedia saat ini tidak cukup untuk membantu controller membedakan relevansi dari kecocokan pemakaian.
4. Scanner membaca `SKILL.md` sekali untuk metadata, kemudian membacanya lagi ketika menghitung digest pohon. Pencarian dan pembacaan baru harus memakai bytes yang sama untuk descriptor, instruksi, dan digest yang dikembalikan, bukan menambahkan pembacaan ketiga yang berpotensi berbeda. Titik perubahan terbatas pada [`service.ts:201–229`](../../src/skills/service.ts#L201-L229).

Manfaat yang dituju adalah alur discovery → pemeriksaan applicability → pembacaan revisi yang lebih jelas. Inspeksi statis ini belum membuktikan peningkatan ketepatan, kecepatan, atau manfaat pada pekerjaan pengguna.

### Positive: [Purpose]

Ambil mekanisme donor yang lebih kuat pada celah nyata, lalu perbaiki owner Agent Core yang ada: pencarian metadata lebih dahulu, descriptor applicability, dan kandidat semantik opsional. Ganti dua cabang seleksi Skill yang lemah dengan satu jalur bersama. Keberadaan fitur lama bukan alasan untuk menolak mekanisme yang lebih baik.

### Negative: [Purpose]

Jangan memasang tiga aplikasi donor, membuat katalog paralel, menganggap similarity sebagai izin atau kebenaran, atau menyebut lexical matching sebagai semantic retrieval. Jangan menyalakan pengiriman data ke provider hanya karena kredensial sudah dikonfigurasi. Jangan mengubah discovery menjadi aktivasi Skill, eksekusi otomatis, atau bukti manfaat.

## 2. Source donor, mekanisme, dan batas adopsi

| Kandidat | Source yang dibaca langsung | Keputusan Batch 2 |
|---|---|---|
| **#195 SkillPort** | Commit `51334ae94919fc1c261673ffefdce9176c9094ef`; [`interfaces/mcp/tools.py:23–73`](https://github.com/gotalab/skillport/blob/51334ae94919fc1c261673ffefdce9176c9094ef/packages/skillport-core/src/skillport/interfaces/mcp/tools.py#L23-L73), [`indexing/internal/search_service.py:57–106`](https://github.com/gotalab/skillport/blob/51334ae94919fc1c261673ffefdce9176c9094ef/packages/skillport-core/src/skillport/modules/indexing/internal/search_service.py#L57-L106). Root LICENSE: MIT, copyright 2025 Gota. | Adaptasi metadata-first discovery dan selected loading. Implementasikan dalam `SkillService`/tool `skills` existing. Jangan menyalin FastMCP, LanceDB, remote resource server, atau fallback substring donor. Rasio terhadap skor tertinggi donor bukan bukti relevansi absolut. |
| **#17 AutoSkill / SkillEvo** | Commit `94c47ca488d4ba4117d20272e66d49b9877e68cf`; [`interactive/selection.py:61–79`](https://github.com/ECNU-ICALK/AutoSkill/blob/94c47ca488d4ba4117d20272e66d49b9877e68cf/autoskill/interactive/selection.py#L61-L79), [`interactive/retrieval.py:61–132`](https://github.com/ECNU-ICALK/AutoSkill/blob/94c47ca488d4ba4117d20272e66d49b9877e68cf/autoskill/interactive/retrieval.py#L61-L132). Root LICENSE tidak tersedia pada checkout ini. | Implementasi independen atas prinsip descriptor ringkas dan pemisahan retrieval dari applicability. Tidak menyalin source substansial. Tidak mengambil selector LLM, scope milik donor, replay loop, atau champion promotion. Non-trigger berasal dari artefak native Agent Core, bukan klaim bahwa donor brief tersebut sudah menyediakannya. |
| **#7 Voyager** | Commit `55e45a880755d0c8c66ca7fb5fe7962ac8974f89`; [`voyager/agents/skill.py:61–100,114–127`](https://github.com/MineDojo/Voyager/blob/55e45a880755d0c8c66ca7fb5fe7962ac8974f89/voyager/agents/skill.py#L61-L127). Root LICENSE: MIT, copyright 2023 MineDojo Team. | Adaptasi kandidat berbasis embedding deskripsi agar overlap kata bukan satu-satunya pintu masuk. Gunakan deskripsi/trigger deklaratif yang sudah ada, tanpa generator deskripsi LLM, Chroma, Minecraft, registry donor, atau penggantian lifecycle P3. Kemampuan ini opsional dan belum aktif jika provider atau intent pemanggil tidak tersedia. |

Source donor dipakai sebagai pembanding mekanisme, bukan dependency runtime. Apabila implementasi akhirnya memindahkan source berlisensi MIT secara substansial, pertahankan notice yang berlaku di source dan `THIRD_PARTY_NOTICES.md`. AutoSkill pada snapshot ini hanya menjadi inspirasi mekanisme untuk implementasi independen.

## 3. Batas owner dan kontrak lintas-batch

- Sumber Skill tetap `runtime/skills/catalog`; proposals, staging, history, packages, dan exports tidak ikut dicari sebagai Skill aktif.
- Katalog bersifat shared sesuai owner sekarang. Field `workspace` mengikat konteks episode/receipt, bukan ACL Skill baru dan bukan bukti bahwa sebuah Skill hanya milik workspace tertentu.
- `rankKnowledge()` tetap dipakai untuk Patterns dan procedures. Hanya dua cabang ranking Skill diganti. Jangan memperluas perubahan menjadi mesin ranking seluruh knowledge.
- Revisi, supporting files, provenance, proposal approval, promotion, rollback, serta verifikasi penggunaan P3 tetap digunakan. Discovery tidak menulis ulang artefak atau meloloskan proposal.
- Batch 1 memiliki web reader, transport URL publik, proyeksi dokumen, pemilihan konten HTML, dan MCP web. Batch 2 tidak mengubah `src/web-research`, `src/rdc/document-projection`, `src/mcp/web-research-*`, atau kontrak web Batch 1.
- Perubahan `src/index.ts`, jika diperlukan kelak, hanya pada injeksi instance embedder ke inisialisasi `SkillService`; jangan mengganti bootstrap Memory atau wiring web. Dokumentasi bersama disinkronkan sesudah hasil implementasi diketahui, dengan satu penulis.
- Scope instalasi Memory/Learning P0–P5 yang sudah ditutup tidak dibuka ulang. Tidak ada aktivasi ulang Memory, root baru, reset, pemindahan data, provider Native AI, atau pekerjaan Windows yang diasumsikan belum selesai.

## 4. Kontrak yang diusulkan untuk review

### 4.1 Descriptor dan snapshot

Tambahkan tipe di helper subordinate `src/skills/discovery.ts`:

- `SkillSearchMode = 'lexical' | 'hybrid'`.
- `SkillDiscoveryDescriptor`: `name`, `description`, `digest`, `allowedTools`, optional `compatibility`, `triggers`, `nonTriggers`, `applicability: 'declared' | 'missing' | 'ambiguous'`, dan `descriptorTruncated`.
- `SkillSearchHit`: descriptor di atas, `rank`, `channels: ('lexical' | 'semantic')[]`, `lexicalScore`, optional `semanticScore`, `scoreKind: 'rank-fusion'`, dan `executionAuthority: false`.
- `SkillSearchResult`: `version: 1`, `requestedMode`, `effectiveMode`, `hits`, `catalog` berisi jumlah scanned/valid/invalid/omitted dan completeness, `semantic` berisi status/coverage/reason, serta `truncated`. Tidak menyertakan body atau seluruh katalog.
- `SkillDiscoverySnapshot`: `{ artifacts: SkillArtifactSummary[]; search: SkillSearchResult }`. Ini hasil internal satu scan untuk inventory dan selection, bukan field yang diekspor utuh oleh `skills(search)`.

`SkillService.discover({ query, limit?, mode? }): Promise<SkillDiscoverySnapshot>` adalah jalur tunggal. `query` nonblank maksimum 4.000 karakter; `limit` default 5, maksimum 8; `mode` default `lexical`. Caller tanpa query tetap memakai list/inventory existing dan tidak melakukan embedding.

Descriptor adalah proyeksi bounded dari artefak aktif. Maksimum delapan trigger dan delapan non-trigger, masing-masing 240 Unicode code points. Baca bagian level-dua `Trigger`/`Triggers` dan `Non-trigger`/`Non-triggers` di luar fenced code, case-insensitive. Heading ganda yang ambigu menghasilkan `applicability=ambiguous`; bagian yang tidak tersedia menghasilkan `missing`. Jangan menebak applicability dari nama, file tetangga, proposal lama, atau prose bebas. Jangan menolak Skill legacy hanya karena bagian ini tidak ada.

Gunakan satu buffer `SKILL.md` yang ikut dihitung dalam digest untuk parsing metadata, descriptor, dan selected read. Scanner tetap memeriksa symlink, path, jumlah file, ukuran dan aturan parser existing. Pada discovery, nama metadata harus sama dengan nama direktori aktif yang tervalidasi; mismatch masuk hitungan invalid agar hit tidak menunjuk artefak lain. Tidak ada perubahan ke bytes artefak atau format frontmatter. Snapshot tidak menjanjikan filesystem transaction lintas perubahan manual; setiap pembacaan berikutnya harus memeriksa digest kembali.

### 4.2 Pencarian lokal dan kualitas kandidat

Gunakan BM25 existing di [`src/memory/bm25.ts`](../../src/memory/bm25.ts) untuk descriptor positif: nama, deskripsi, trigger, compatibility, dan declared tool names. Non-trigger ditampilkan untuk pertimbangan controller, tetapi tidak menjadi teks positif yang dapat menaikkan ranking Skill untuk kasus yang justru dilarang.

Pertahankan exact-name match di depan; kandidat leksikal lain harus berskor positif. Untuk mode hybrid, gabungkan daftar lexical dan semantic melalui reciprocal rank fusion `1 / (60 + rank)`, satu kontribusi per channel. Urutan seri stabil: exact-name, skor fusion, skor lexical, lalu nama. Jangan menjumlahkan raw cosine dan BM25 seolah skalanya setara. Semantic-only hit diperbolehkan; kalau masih diwajibkan BM25 positif, celah Voyager belum diperbaiki.

Kandidat selalu bersifat advisory. Trigger/non-trigger tidak dieksekusi sebagai policy atau model judge. `allowedTools` tetap deklarasi, bukan grant; ketersediaan tool yang diketahui boleh ditampilkan sebagai keterangan, tetapi tidak menjadi authority baru. Controller tetap membaca batas pemakaian dan memutuskan apakah Skill cocok.

Scan hanya active catalog, memakai plafon 500 entri yang sudah ada. Nyatakan invalid dan entri di luar plafon secara agregat; jangan mengubah partial catalog menjadi klaim kosong atau lengkap. Search output maksimum 32 KiB UTF-8 serialized, dengan pemotongan pada batas item dan metadata truncation yang tetap muat. Kurangi jumlah hit sebelum merusak descriptor menjadi JSON terpotong.

### 4.3 Semantic opt-in dan data yang keluar

Source host sekarang hanya menyediakan optional `CloudflareWorkersAIEmbedder`: [`src/index.ts:74–83`](../../src/index.ts#L74-L83), [`src/memory/embedder.ts:71–137`](../../src/memory/embedder.ts#L71-L137). Tidak ditemukan embedder lokal lain yang dapat dianggap sudah tersedia.

**Default tetap lokal.** `hybrid` hanya diminta secara eksplisit melalui `skills(search, searchMode=hybrid)` atau `controller_learning(context, skillSearchMode=hybrid)`, dan hanya memakai instance provider yang memang sudah dikonfigurasi. `lexical`, context default, bootstrap, list, status, dan read tidak memulai panggilan embedding Skill. Tidak ada fallback otomatis ke provider lain, pemasangan model, pengaturan kredensial, atau background indexing.

Aktivasi pemakaian hybrid berarti query bounded serta descriptor positif Skill akan dikirim ke **Cloudflare Workers AI pada akun embedding yang sudah dikonfigurasi**, untuk memperoleh vector pencarian. Body instruksi, supporting files, Memory, episode transcript, provenance repository, path lokal dan kredensial tidak ikut dikirim. Konfigurasi provider dan parameter yang dibuat model sendiri bukan bukti izin membagikan data. Controller harus mempunyai persetujuan pengguna untuk data/tujuan tersebut sebelum meminta mode ini; persetujuan implementasi draft tidak otomatis mengaktifkannya. Jika persetujuan atau provider tidak ada, gunakan lexical.

Gunakan cache vector sementara di instance `SkillService`, maksimum 500 entri, dengan key `provider + model + dimensions + descriptorVersion + artifactDigest`. Tidak ada file index, Memory note, atau canonical store baru. Buang cache revisi lama dari snapshot aktif; pergantian model/dimensi tidak boleh memakai vector lama. Revisi sama dapat memakai cache ulang, tetapi bukan bukti bahwa Skill pernah digunakan.

Panggilan hybrid membatasi satu batch embedding pada maksimum 32 teks: query dan paling banyak 31 descriptor yang belum tercache. Masing-masing teks maksimum 1.200 UTF-16 code units, dipotong tanpa memisahkan surrogate pair; tampilkan query/descriptor truncation. Pilih descriptor belum tercache dari seluruh snapshot secara stabil menurut nama, **bukan hanya pemenang BM25**. Bandingkan query dengan semua vector aktif yang valid di cache. Laporkan `embeddedDescriptors / validDescriptors`, alasan partial, dan jumlah descriptor yang baru dikirim; jangan menyatakan seluruh katalog telah dicari secara semantik jika baru sebagian. Permintaan berikutnya boleh melanjutkan cache secara on-demand; tidak ada loop otomatis untuk menghabiskan katalog.

Tambahkan parameter opsional backward-compatible `embedDocuments(texts, { signal? })` pada embedder host dan teruskan signal ke `fetchWithPolicy` existing. Deadline semantic per permintaan 5 detik; hentikan request/retry yang sudah dibatalkan, bukan hanya meninggalkan Promise yang masih mengirim data. Memory caller lama tetap memakai perilaku existing ketika opsi tidak diberikan. Semantic work dibatasi satu permintaan aktif per instance; bila sibuk, kembali ke lexical dengan alasan `busy`, tanpa antrean tersembunyi. Provider failure, timeout, dimensi salah, non-finite atau zero vector menghasilkan lexical fallback dan status yang jujur. Gunakan cosine positif sebagai kandidat berurutan, bukan confidence keberhasilan.

Sebelum mengirim teks, terapkan guard redaksi existing untuk pola kredensial: jika redaksi mengubah input, jangan mengirim teks tersebut dan nyatakan `sensitive-input`. Ini bukan detector lengkap data sensitif dan tidak menggantikan izin. Log hanya status, count dan identitas model publik; jangan mencatat query/descriptor ke log baru atau membocorkan token/response provider.

### 4.4 Pembacaan instruksi terikat revisi

Tambahkan action **`skills(read)`**, bukan tool atau filesystem owner baru:

`SkillService.read(name, { expectedActiveDigest, offset?, maxBytes? }): Promise<SkillReadResult>`.

- `name` memakai validasi native; `expectedActiveDigest` wajib berasal dari discovery/inspect yang dipilih. Hanya `SKILL.md` pada active catalog yang dibaca.
- `offset` adalah offset byte UTF-8, default 0; tolak offset di luar file atau di tengah karakter. Tolak body yang bukan UTF-8 valid agar offset tidak merujuk replacement characters hasil decoder. `maxBytes` default 8.192, rentang 512–32.768, merupakan budget serialized response utuh, termasuk metadata.
- Hasil: `name`, `digest`, `source: 'SKILL.md'`, `content`, `offset`, `nextOffset: number | null`, `totalContentBytes`, `truncated`, `delivery: 'instruction-fragment'`, dan `executionAuthority: false`. Content berasal dari snapshot scanner yang digest-nya dibandingkan terhadap `expectedActiveDigest`; kelanjutan memerlukan digest sama.
- Jika active digest berubah, kembalikan `SKILL_ACTIVE_REVISION_CHANGED` tanpa body. Tidak otomatis membaca history, mengganti pilihan ke versi baru, atau memperbarui receipt.
- Batas hasil harus diterapkan sebelum generic MCP spill. Unicode tetap utuh; pemanggil melihat bahwa instruksi parsial. Tidak ada auto-read semua halaman atau semua resource. Pembacaan file pendukung tetap melalui owner filesystem yang sudah ada dan izin yang berlaku.

`list`, `inspect`, `validate`, dan lifecycle actions lama tetap tersedia. Metadata-first berarti discovery tidak otomatis memuat body; read berarti bytes benar-benar dikembalikan, bukan Skill sudah dijalankan atau bermanfaat.

### 4.5 Satu hasil untuk context dan atribusi

`ExternalControllerLearningService.context()` memanggil `discover()` satu kali, lalu meneruskan snapshot itu ke optional input `skillDiscovery` pada `buildKnowledgeSynthesisPacket()`. Synthesis memakai selection yang sama; tidak menjalankan `.list()` dan BM25 lagi. Native caller yang memakai helper synthesis yang sama dapat memanggil discovery default lexical jika snapshot tidak diberikan, tanpa menambah runtime atau scope Native AI baru.

Pertahankan field `skills` pada external context sebagai array terpilih dengan field summary existing dan descriptor additive; tambahkan diagnostics `skillSearch`. Hanya hit yang benar-benar masuk output packet yang dicatat ke `artifactRevisions` dan outer `skills`. Respect budget packet existing; jangan mencatat hit yang dibuang karena budget sebagai sudah disampaikan.

Pendaftaran delivery tetap melalui [`capability-observation.ts:19–22`](../../src/mcp/capability-observation.ts#L19-L22), [`capability-awareness.ts:115–123`](../../src/capability-awareness.ts#L115-L123), dan [`external-controller.ts:285–295`](../../src/learning/external-controller.ts#L285-L295). Perluas parser hanya untuk envelope typed search/read yang benar-benar dikembalikan, lalu recheck active digest seperti sekarang. Metadata delivery, instruction fragment, dan material use harus tetap dapat dibedakan pada hasil; jangan menandai search/read sebagai penggunaan Skill.

Receipt tetap memakai task, action/evidence refs dan digest existing di [`external-controller.ts:962–1035`](../../src/learning/external-controller.ts#L962-L1035). Tidak ada positive feedback dari ranking, exposure, jumlah pencarian, cache hit, atau pengakuan model saja. Jangan membuat ledger penggunaan kedua.

## 5. Enam fase implementasi yang diusulkan

Fase di bawah adalah rancangan untuk persetujuan berikutnya, bukan instruksi untuk mulai sekarang. Kriteria hasil menjelaskan perilaku operasional yang harus tersedia; dokumen ini tidak memerintahkan pembuatan atau eksekusi suite, benchmark, maupun putaran audit tambahan.

### Fase 1 — Snapshot Skill dan descriptor applicability

**File:** tambah `src/skills/discovery.ts`; ubah terbatas `src/skills/service.ts` pada scanner dan proyeksi metadata.

- [x] Definisikan tipe §4.1 dan `describeSkill(metadata, skillMarkdown, digest): SkillDiscoveryDescriptor` sebagai fungsi murni.
- [x] Ambil metadata, descriptor, dan bytes untuk digest dari buffer `SKILL.md` yang sama; pertahankan semua batas scanner dan format artefak existing.
- [x] Bentuk satu snapshot active catalog dengan count dan completeness, tanpa membaca staging/proposal/history sebagai aktif.

**Hasil operasional:** Skill yang sudah ada dapat ditemukan tanpa migrasi; trigger dan non-trigger yang benar-benar dideklarasikan terlihat, sedangkan yang tidak diketahui tetap dilabeli tidak diketahui. Digest tidak berasal dari bytes yang berbeda dengan descriptor.

### Fase 2 — Discovery query lokal dalam owner existing

**File:** `src/skills/discovery.ts`, `src/skills/service.ts`.

- [x] Implementasikan `SkillService.discover({ query, limit, mode })` dengan mode lexical terlebih dahulu dan kontrak hasil §4.1–4.2.
- [x] Pakai BM25 existing, exact-name precedence, batas delapan hit, stable tie-break, dan descriptor positif yang tidak memasukkan non-trigger.
- [x] Terapkan batas serialized output 32 KiB, laporan partial catalog, dan status kosong yang membedakan tidak ada katalog dari tidak ada match.

**Hasil operasional:** controller memperoleh shortlist terurut query dan batas pemakaiannya tanpa meminta seluruh list; query hanya pada non-trigger tidak menaikkan Skill menjadi match positif. Seluruh jalur ini bekerja tanpa provider embedding.

### Fase 3 — Kandidat semantik opsional tanpa mesin tambahan

**File:** `src/skills/service.ts`, `src/skills/discovery.ts`, `src/memory/embedder.ts`, dan bagian inisialisasi Skills pada `src/index.ts`.

- [x] Perluas `SkillService.initialize(projectRoot, sourceValidator?, options?: { embedder?: MemoryEmbedder })` secara backward-compatible; inject instance yang sudah dibuat host, bukan membuat provider kedua.
- [x] Implementasikan cache sementara, batas batch/deadline/cancellation, pemeriksaan vector, dan coverage parsial §4.3. Memperluas signature embedder tidak mengubah perilaku Memory caller lama.
- [x] Implementasikan fusion dua ranking di helper yang sama; semantic-only hit boleh masuk, mode default tidak pernah memulai embedding Skill.
- [x] Expose ketersediaan provider, requested/effective mode, alasan degradasi dan coverage. Jangan menulis atau mengaktifkan konfigurasi/kredensial dari perubahan ini.

**Hasil operasional:** pada permintaan hybrid yang berizin dan provider terkonfigurasi, parafrasa dapat memperoleh kandidat walaupun skor lexical nol. Provider absen/gagal, batas waktu, atau cakupan cache parsial terlihat; discovery lexical tetap dapat digunakan. Tidak ada klaim bahwa kandidat pasti cocok.

### Fase 4 — Baca instruksi dari digest yang dipilih

**File:** `src/skills/service.ts`, tipe read pada `src/skills/discovery.ts`.

- [x] Implementasikan `SkillService.read()` dengan mandatory `expectedActiveDigest`, snapshot bytes, cursor byte UTF-8, dan budget envelope §4.4.
- [x] Tolak revision drift sebelum mengembalikan body; tidak melakukan fallback ke history atau revisi baru.
- [x] Kembalikan continuation yang eksplisit tanpa menjalankan instruksi atau membaca semua resource secara otomatis.

**Hasil operasional:** controller membaca tepat revisi yang dipilih dalam ukuran terkendali; dokumen panjang jelas masih parsial dan dapat dilanjutkan, sementara revision change menghasilkan alasan yang dapat ditindaklanjuti.

### Fase 5 — Satukan selection pada controller context

**File:** `src/learning/external-controller.ts`, `src/agent-knowledge-synthesis.ts`, `src/capability-awareness.ts`, `src/mcp/capability-observation.ts`.

- [x] Tambahkan optional `skillSearchMode` pada `ExternalControllerContextInput`; gunakan satu discovery snapshot untuk external context, inventory, dan synthesis.
- [x] Ganti dua ranking Skill BM25-only dengan hasil shared selector; pertahankan ranking Patterns/procedures dan retrieval Memory existing.
- [x] Tampilkan descriptor applicability dan diagnostics ringkas; hanya artefak yang benar-benar tersampaikan masuk delivery attribution.
- [x] Kenali envelope search/read pada observer/parser existing tanpa mengubah retrieval menjadi material use. Perbarui petunjuk discovery dari hanya `list/inspect` menjadi `search`, kemudian selected `read`.

**Hasil operasional:** shortlist pada context dan synthesis berasal dari snapshot/revisi yang sama, tanpa scan dan embedding ganda. Penggunaan Skill tetap membutuhkan keputusan controller dan bukti existing; proposal/activation tidak berubah.

### Fase 6 — Exposure MCP, kompatibilitas, dan catatan pemasangan

**File:** `src/mcp/skills-schemas.ts`, `src/mcp/skills-tools.ts`, `src/mcp/controller-learning-schemas.ts`, `src/mcp/controller-learning-tools.ts`, `src/agent-capability-catalog.ts`; bagian terkait `docs/CODEBASE.md`, `docs/README.md`, `README.md`, `THIRD_PARTY_NOTICES.md`, dan plan ini sesuai hasil nyata.

- [x] Tambahkan `skills.action=search|read` dan field action-specific: search memakai `query`, `limit`, `searchMode`; read memakai `name`, `expectedActiveDigest`, `offset`, `maxBytes`. Tolak field mode/cursor yang dipakai pada action lain.
- [x] Tambahkan optional `controller_learning.skillSearchMode` hanya untuk `action=context`; query wajib untuk pilihan hybrid. Default lexical tidak mengubah cara Memory dicari oleh context existing.
- [x] Klasifikasikan search/read sebagai read-only pada outcome plumbing dan capability family `skills.inspect`; pertahankan mutation actions dan grants existing. Deskripsi tool menjelaskan optional embedding tanpa mengklaim ada model reasoning baru. Tool `skills` gabungan tetap memiliki anotasi mutasi yang benar untuk action lifecycle-nya.
- [x] Sajikan status kemampuan berdasarkan jalur source/runtime yang benar-benar tersedia. Descriptor custom plugin harus mengikuti action/field baru; jika refresh manual diperlukan, laporkan perubahan satu kali tanpa mengaku client telah refresh.
- [x] Dokumentasikan hanya source/perilaku yang sudah diimplementasikan. Simpan batas aktivasi, konfigurasi semantic dan manfaat yang belum diketahui; parent menuntaskan Memory/Learning dan publikasi sesuai otorisasi pengguna.

**Hasil operasional:** AI eksternal dapat mengakses search → read melalui tool Skills yang sama dan context memakai jalur yang sama. Mode lokal tidak membutuhkan cloud; mode hybrid tetap opsional dan tidak dapat dianggap aktif hanya karena source sudah dibangun. Pembaruan descriptor tidak menambah server atau tool owner baru.

## 6. Akuntabilitas kandidat yang tidak masuk batch

[Register 216 kandidat](../research/candidate-source-review-216-20261012.md) dan [JSON evidence](../research/candidate-source-review-216-20261012.json) tetap ledger bersama. Snapshot keputusan: 88 `reuse`, 54 `defer`, 15 `extend`, 38 `reject`, dan 21 `no-source`. Status source tersebut tidak otomatis menjadi otorisasi implementasi.

Batch 1 memilih #73, #133 dan #178; Batch 2 memilih #7, #17 dan #195. **210 entri lain tetap tercatat dengan keputusan dan batas masing-masing**, bukan dianggap terintegrasi, dilupakan, atau harus dipasang. Sembilan kandidat `extend` yang belum dipilih dijelaskan berikut agar scope tidak diam-diam melebar:

- **#25 SimpleMem:** helper `src/learning/subquestion-retrieval.ts` memiliki batas yang lebih kuat, tetapi belum tersambung ke runtime context yang sekarang melakukan satu `memory.search`. Itu celah wiring multi-query yang nyata, terpisah dari Skill discovery. Tetap calon pekerjaan tersendiri; tidak membuka P0–P5, menambah planner LLM, atau mengimpor Memory engine donor.
- **#47 Grok Build:** missing-vector path `maxSemanticRedundancy()` pada `SubProject/agent-core-memory/src/memory/retrieval.ts:332–345` belum memberi lexical near-duplicate penalty. Perbaikan standar MMR/Jaccard independen tetap calon tersendiri. Tidak menyalin donor; batas lisensi/reuse yang telah ditetapkan tetap berlaku. Tidak menyisipkannya ke selector Skill hanya untuk menambah jumlah adopsi.
- **#120 ParserTry:** text-region anchor/extraction coverage termasuk kualitas proyeksi dokumen, di luar Skill discovery dan berpotensi menyentuh owner Batch 1.
- **#127 OpenChrome:** saran prosedur berdasar page fingerprint memerlukan consumer browser yang jelas; discovery Skill umum tidak membenarkan replay browser.
- **#131 senpi:** retained-tail/split-turn compaction menyangkut Native conversation continuity, bukan kontrol context host AI eksternal.
- **#135 Ouroboros:** requirement-to-evidence coverage adalah kontrak pelaporan, bukan ranking Skill.
- **#138 Sindie:** penilaian artefak visual berjangkar digest/view adalah jalur image-review terpisah.
- **#144 NomaDamas:** freshness dependency closure untuk artefak merupakan persoalan sumber/preview/review, bukan alasan membuat index Skill baru.
- **#164 Skill Self-Play:** evidence positive-anchor terhadap baseline relevan untuk proposal revisi berikutnya. Draft ini tidak mengubah promotion P3 atau membuka loop evaluasi baru.

Temuan cadangan yang sudah dianalisis tetap dihormati: **#129 MIMIC** hanya peluang projection urutan tool lintas episode, bukan Skill terbukti atau kebutuhan di batch ini; **#193 TreeQuest** belum memiliki consumer hard-task yang membenarkan allocator; semantic answer-sufficiency SimpleMem juga tidak otomatis menjadi requirement. Tidak ada batch lanjutan yang dimulai oleh draft ini.

## 7. Batas hasil dan handoff

Pengguna menyetujui implementasi pada 12 Oktober 2026. Keenam fase telah diterapkan di checkout utama Linux di atas hasil Batch 1. Source dan build tersedia untuk handoff; aktivasi runtime Windows, refresh custom plugin, dan manfaat semantic pada pekerjaan nyata merupakan status terpisah.

Implementasi menggunakan owner utama dan alur activation/descriptor existing. Pertahankan satu penulis per file, laporkan blocker yang benar-benar membutuhkan tindakan manusia, dan pisahkan source terpasang, capability terekspos, mode hybrid berizin, Skill digunakan, serta manfaat teramati. Jangan membuat rangkaian review tanpa akhir atau menjadikan semua kandidat sebagai daftar instalasi wajib.

## 8. Ringkasan bersama untuk Memory lokal

<!-- batch-02-memory-summary:start -->
Batch 2 sudah diimplementasikan pada source utama Agent Core: SkillService menyediakan discovery descriptor lokal dan pembacaan SKILL.md terikat active digest, memakai bytes snapshot yang sama. Mekanisme #195 SkillPort, #17 AutoSkill dan #7 Voyager diadaptasi secara independen tanpa runtime donor, dependency produksi baru, katalog paralel, atau folder penyimpanan baru. Default lexical tidak memanggil embedding; hybrid hanya melalui permintaan eksplisit dan izin berbagi query/descriptor positif bounded ke Cloudflare Workers AI existing, dengan cache sementara terikat model/revisi, batas batch, pembatalan dan deadline. Context dan synthesis memakai satu hasil discovery; hanya detail yang benar-benar tersampaikan mendapat atribusi, tanpa kredit penggunaan otomatis. Tool skills memperoleh action search/read dan controller_learning memperoleh skillSearchMode. Build Linux berhasil; belum ada panggilan provider live, aktivasi Windows, atau klaim manfaat semantic. Memory/Learning P0–P5 dan Batch 1 tetap pada owner existing. Hasil source disiapkan untuk diambil AI pengguna dari repository; setelah pemasangan runtime, custom plugin perlu diunggah ulang agar kontrak baru tersedia.
<!-- batch-02-memory-summary:end -->


## 9. Hasil implementasi dan handoff repository

### Source yang tersedia

- `src/skills/discovery.ts` menyediakan descriptor positif, applicability yang eksplisit, BM25/exact-name dan optional RRF semantic, tanpa body/provenance di query embedding.
- `src/skills/service.ts` memegang katalog yang sama: maksimum 500 entri, snapshot bytes yang konsisten, coverage valid/invalid/omitted, cache ephemeral terikat model/revisi, satu request embedding aktif, maksimal 31 descriptor baru ditambah query per batch, dan deadline 5 detik. Panggilan provider yang mengabaikan abort tetap menahan slot hingga selesai agar timeout tidak membuat request bertumpuk.
- `skills(search)` mengembalikan descriptor maksimal 32 KiB serialized UTF-8. `skills(read)` memerlukan `expectedActiveDigest`, `offset` byte, dan envelope budget 512–32768 byte; revision drift tidak mengembalikan body. Fragment menyatakan `nextOffset`, bukan mengaku seluruh instruksi sudah dibaca.
- `controller_learning(context)` menggunakan snapshot discovery yang sama untuk inventory, selection dan synthesis; tanpa query tetap inventory lokal. Hanya selected detail yang lolos anggaran output mendapat atribusi revisi. Search/read tidak memberi usage credit atau authority untuk eksekusi.
- Embedder host existing mendukung AbortSignal sepanjang fetch/retry/body consumption. Default lexical tidak memanggil provider. Tidak ada dependency baru atau instalasi runtime donor.
- Deskripsi MCP dibersihkan hanya dari whitespace transport dan judul anotasi identik yang sudah ada pada top-level. Kata petunjuk, judul tampilan dan behavioral hints dipertahankan. Kohort manifest existing 75 tools berukuran 130681 byte, di bawah 128 KiB; kohort tersebut tidak mencakup semua optional tools, termasuk controller_learning.

### Bukti penyelesaian Linux

Build resmi `npm run build` berhasil, termasuk path policy (364 authored files) dan build Memory subproject. Gabungan pemeriksaan terarah 11 file/123 kasus berhasil; kasus provider menggunakan doubles offline. Review source terfokus tidak menemukan masalah penting. Fixture host lama yang melewatkan konfigurasi webResearch wajib dilengkapi pada test fixture saja; tidak ada fallback konfigurasi produksi baru. Ini bukan klaim whole-suite, benchmark, live Cloudflare, atau runtime Windows.

### Arahan pemasangan oleh AI pengguna

1. Ambil hasil Batch 2 dari repository resmi Black-Project-Agent-Core/Agent-Core ke checkout utama pengguna. Cocokkan perubahan lokal yang belum dipublikasikan tanpa menimpanya dan tanpa membuat checkout/runtime duplikat.
2. Gunakan source utama dan prosedur build/start project existing. Jangan mengulang adopsi donor, menambahkan service Skills baru, atau menyalin engine ke folder temporary. Data tetap pada owner penyimpanan existing, termasuk runtime/memory.
3. Muat hasil build pada runtime target melalui prosedur restart existing saat pengguna siap. Source terpublikasi di Linux belum berarti runtime Windows sudah memakai source tersebut.
4. Setelah runtime target terpasang, unggah ulang custom plugin untuk memperbarui action search/read pada tool skills dan field skillSearchMode pada controller_learning. Tidak ada nama tool baru.
5. Jalur default langsung menggunakan lexical lokal. Hybrid hanya dipilih jika pengguna mengizinkan pengiriman query/descriptor positif bounded ke provider existing; jangan mengaktifkannya otomatis atau menyalin kredensial.
6. Catat status pemasangan nyata ke Memory lokal target dan dokumentasinya. Source implementasi tidak memerlukan file aktif dari folder temporary. Jangan menghapus data yang belum dipindahkan atau menganggap catatan Learning Linux otomatis tersedia di Windows hanya karena repository diambil.

Ringkasan section 8 disamakan dengan record canonical Memory lokal dan proyeksi MEMORY.md. Bukti hash publikasi dan finalisasi episode disimpan setelah remote readback, tanpa mengklaim keberhasilan sebelum hasil nyata.
