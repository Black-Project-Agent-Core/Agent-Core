# Peluang Adopsi Source Kandidat — Analisis Kumulatif 12 Oktober 2026

**Status: RISET SAJA. Bukan plan Batch 5/6 atau perintah implementasi.**

Riset source native tetap memakai body kode baseline `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`; publikasi dokumentasi pertama `97863a285646170846da6a81c79556b1b9eeb58d` tidak mengubah produk. Pendalaman kedua memperbarui dokumen dan register yang sama. Tanggal menggunakan UTC.

## Hasil kumulatif terkini

| Kedalaman bukti | Entri | Batas klaim |
|---|---:|---|
| Body kode berpinned | 175 | Potongan implementasi pada SHA tertentu, bukan seluruh codebase/engine |
| Interface saja | 3 | Tidak membuktikan implementasi backend |
| Dokumentasi saja | 30 | Source fitur yang hendak diadopsi tidak tersedia/terverifikasi; bukan dasar transplantasi kode |
| Reserved Batch 1–4 | 8 | Tidak dibuka ulang sebagai kandidat baru |
| Total | 216 | ID kandidat, bukan jumlah repository unik |

- Seluruh **65 entri** yang sebelumnya prior-only, docs, interface/config atau source unpinned sudah ditindaklanjuti. Hasilnya **32 body berpinned, 3 interface, dan 30 docs-only**. Tidak ada entri unallocated yang masih hanya ditandai prior-only tanpa tindak lanjut.
- **17 kelompok peluang tetap**, dari **18 kandidat utama**. #69 dan #92 menambah bukti/pembanding untuk kelompok existing, tidak menambah kelompok atau instalasi. Kategori tetap 6 gap eksternal, 4 bersyarat eksternal, 4 bukti/evaluasi, 2 producer/aplikasi opsional, 1 native-only.
- Inventaris lokal pada 20:19 UTC memuat **209 checkout Git dengan remote berbeda**. Ini inventaris sumber penelitian, bukan 209 kandidat atau 209 engine lengkap. Ada keluarga kandidat multi-repo; repo SDK/contoh/model card tidak otomatis membuka source engine.
- #169 misalnya memiliki body SDK HTTP, tetapi itu tidak membuktikan server sandbox terbuka. #65 wrapper memanggil implementasi internal/layanan hosted. #50/#54/#55/#68 tidak menyediakan source mekanisme curriculum/self-learning yang diajukan. #49 kini memiliki pin historis resmi, tetapi hanya membuktikan mekanisme riwayat percakapan.

## Syarat sebelum plan Batch 5 dan 6

Dokumen peluang adalah riset pada snapshot source, bukan plan implementasi. Semua peluang berstatus belum dipilih. Batch 3 dan 4 harus sudah terintegrasi sebelum penyusunan plan Batch 5–6. Tidak cukup hanya file plan tersedia atau laporan lama menyebut selesai.

Saat prasyarat itu tercapai, lakukan satu rekonsiliasi terarah terhadap peluang yang akan dipilih:
1. Catat commit/codebase hasil integrasi aktual, kontrak tool yang dipakai AI eksternal, dan batas bukti aktivasi. Pisahkan source dari runtime/manifest client.
2. Baca ulang jalur donor yang dirujuk pada pin yang tercatat; jika pin berubah, jelaskan perubahan dan lisensi file terkait.
3. Baca ulang owner penerima dan caller yang benar-benar dapat dijangkau AI eksternal. Kehadiran nama file atau helper belum membuktikan fungsi aktif.
4. Bandingkan gap dengan hasil Batch 3 dan4. Jika sudah tertutup, tandai tercakup; jangan mengadopsi ulang atau membuat owner paralel. Jika sebagian tertutup, batasi sisa gap.
5. Pastikan tidak mengubah kontrak multi-query/revisi/disclosure/grants/receipt Batch3 atau batas view/source/semantic-assessment Batch4 tanpa alasan yang eksplisit.
6. Gabungkan peluang donor yang menutup gap native sama menjadi satu pilihan mekanisme, dengan perbandingan bukti, bukan beberapa instalasi. Nilai lisensi, dependency yang tersisa, biaya integrasi dan consumer konkret.
7. Setelah itu barulah pilih isi dua batch baru. Perbarui status selected/covered/deferred/rejected dan alasan di register yang sama. Penilaian source statis tidak boleh berubah menjadi klaim manfaat runtime tanpa bukti.

Konsep Invocate tetap ditunda. Riset ini tidak mengotorisasi pembangunan, pergantian engine, pemasangan provider, aktivasi model/API, atau perubahan memory store. Nama penyimpanan tetap runtime/memory.

## Daftar peluang

| Kandidat utama | Peluang | Kategori | Bukti tambahan |
|---|---|---|---|
| #30 | Membedakan recall kosong dan recall gagal | external-runtime-gap | — |
| #34 | Cakupan bagian dan disclosure omission pada knowledge packet | external-runtime-gap | — |
| #44 | Bukti negatif untuk pemilihan Skill yang opsional | evidence-evaluation-only | — |
| #47 | Diversitas lexical ketika embedding tidak tersedia | external-runtime-gap | #92 |
| #82 | Advisory sumber/metode berbasis evidence lintas task, conditional | conditional-external | — |
| #83 | Task-conditioned failure-local recall untuk controller eksternal | external-runtime-gap | — |
| #90 | Advisory progress dengan isolasi run/task dan hasil sukses yang unchanged | external-runtime-gap | #69 |
| #94 | Evaluasi pemilihan respons tool yang membedakan slot, relevansi, dan completion | evidence-evaluation-only | — |
| #120, #140 | Proyeksi PDF berbasis kemampuan, halaman, wilayah, dan asal ekstraksi | external-runtime-gap | — |
| #123 | Serialisasi per aplikasi untuk worker non-reentrant | producer-or-optional-application | — |
| #127 | Saran prosedur terverifikasi yang terikat konteks halaman | conditional-external | — |
| #131 | Batas turn utuh untuk context Native Agent Chat | native-only-not-current-target | — |
| #135 | Cakupan klaim eksplisit terhadap evidence exact-revision | conditional-external | — |
| #144 | Freshness artefak dari dependency set yang diketahui producer | producer-or-optional-application | — |
| #164 | Paket bukti revisi Skill dengan cakupan keberhasilan lama dan defect probe | evidence-evaluation-only | — |
| #183 | Penjelasan freshness berbasis bukti konfirmasi pada retirement preview | conditional-external | — |
| #192 | Propensity yang dapat diputar ulang untuk evaluasi recall | evidence-evaluation-only | — |

## Cara membaca bukti

[Register JSON](candidate-adoption-opportunities-20261012.json) memuat 216 ID, `firstPassDepth`, `cumulativeInspectionDepth`, dan `continuationEvidence` pada 65 entri yang diperdalam. Field `opportunities` mempertahankan analisis donor/native beserta supporting evidence. Pin/range/simbol, lisensi, coupling dan syarat recheck disimpan agar keputusan dapat ditelusuri. [Ledger awal](candidate-source-review-216-20261012.md) adalah keputusan first-pass, bukan daftar instalasi. Prioritas tetap AI eksternal yang mengendalikan owner internal Agent Core.

## Pendalaman lanjutan: hasil terbaru

### Pendalaman sumber kandidat #46–#102

12 Oktober 2026. Lingkup: **26 ID yang ditugaskan**, bukan seluruh rentang nomor. Baseline Agent Core `97863a285646170846da6a81c79556b1b9eeb58d`; diff authored `src` dan source Memory terhadap baseline pertama `86fe9efe…` kosong. Semua pekerjaan berupa pembacaan statis, tanpa implementasi, test/build, eksekusi donor, instalasi, model, atau perubahan Memory pada tahap inspeksi.

#### Hasil utama

- **26/26 tercatat tepat sekali:** 8 badan implementasi berpinned, 3 interface/wrapper saja untuk mekanisme yang dibahas, 15 dokumentasi tanpa engine.
- **#49 xAI kini berpinned.** Riwayat file resmi menemukan notebook pada `bd388d4caac49ce49f41312dced4a0ca41f0add8`. Class `ChatApp` dan `ChatAppWithTools` benar-benar dibaca beserta lisensi pada revisi itu. Ini memperbaiki keterbatasan pin sebelumnya, tetapi implementasinya tetap riwayat chat host, bukan Memory belajar persisten. [Notebook](https://github.com/xai-org/xai-cookbook/blob/bd388d4caac49ce49f41312dced4a0ca41f0add8/examples/multi_turn_conversation/guide.ipynb#L90-L326).
- **#65 Simulang belum membuka engine.** Source CLI dan binding NAPI tersedia. `StateSatisfiesModel` meneruskan pekerjaan ke dependency `simulang-rs-internal` dan layanan persepsi; tidak ada alasan menamai wrapper itu engine persepsi/belajar. [Binding](https://github.com/simular-ai/simulang-js/blob/bd05ff840554429e40a7e4090457c2212bd78fe6/src/language_model/state_satisfies.rs#L1-L85), [dependency](https://github.com/simular-ai/simulang-js/blob/bd05ff840554429e40a7e4090457c2212bd78fe6/Cargo.toml#L20-L24).
- **#78 AI:GO lebih jelas:** README resmi eksplisit menyatakan source Backend.AI GO tidak dipublikasikan. Lisensi binary Apache-2.0 dan source subkomponen mlxcel tidak boleh dipakai untuk mengklaim source engine AI:GO terbuka. [Disclosure resmi](https://github.com/lablup/backend.ai-go-releases#license).
- **#71 Agentica diperketat menjadi interface-only.** API repo/commit saat ini memberi 404; panduan resmi cached memperlihatkan deklarasi method, tanpa badan method. Penyebab 404 tidak ditebak. [Deklarasi MicroAgentica](https://wrtnlabs.github.io/agentica/docs/core/micro/).
- **#50/#54/#55/#68 tetap tanpa source mekanisme training/curriculum.** Model card, pin repo, file inference, paper atau weights bukan bukti implementasi algoritme belajar yang dimaksud.

#### Dua pendukung kelompok peluang existing

##### #69 atria → opp-090-scoped-progress-advice

Donor `a5e51c066bf604d9292b2eb8a791176d5cbe1909` membatasi pencocokan status aktif mulai `max(0, liveAnchor - 7)` sampai akhir capture, bukan jendela persis delapan baris. Pola idle boleh cocok di mana pun; bell di mana pun merupakan pengecualian needs-input. `Tracker.Observe` membedakan snapshot berubah, tidak berubah, serta bell event. Badan fungsi dan caller dibaca, bukan hanya interface. [Classifier](https://github.com/sethdeckard/atria/blob/a5e51c066bf604d9292b2eb8a791176d5cbe1909/libatria/agent/classify.go#L122-L237), [caller](https://github.com/sethdeckard/atria/blob/a5e51c066bf604d9292b2eb8a791176d5cbe1909/libatria/watch/tracker.go#L105-L170).

Gap native yang spesifik:
- `analyzeProcessState` dapat menghasilkan `isFinished` dari substring completion pada seluruh output atau pola error di tiga baris terakhir.
- `startProcess` memakai hasil itu untuk pesan finished.
- `interactWithProcess` memakainya untuk mengakhiri wait lebih awal dan menulis pesan finished.
- **Ini tidak membunuh proses atau memfinalisasi ledger.** `terminal-manager` melakukan finalisasi dan perpindahan completed-session dari event exit aktual. `readProcessOutput` melaporkan completion dari `isComplete/exitCode`; teks hanya dipakai untuk waiting pada sesi hidup.

Consumer tepat ialah external MCP `start_process`/`interact_with_process`, lewat `terminal-handlers.ts`. Seam internalnya tetap deteksi/proyeksi status terminal existing: observasi terbaru dapat memberi status advisori, sementara klaim selesai harus terikat bukti exit. Native memproses raw stream, donor memproses screen; konstanta live-anchor/blank-screen tidak langsung dapat disalin. Ini submekanisme tambahan dalam kelompok progres existing, bukan owner/process manager baru. Lisensi donor MIT dengan notice dependency. Belum ada reproduksi runtime atau klaim manfaat terukur.

[Bukti native deteksi](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/97863a285646170846da6a81c79556b1b9eeb58d/src/rdc/utils/process-detection.ts#L54-L130), [wait-return](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/97863a285646170846da6a81c79556b1b9eeb58d/src/rdc/tools/improved-process-tools.ts#L549-L594), [exit authority](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/97863a285646170846da6a81c79556b1b9eeb58d/src/rdc/terminal-manager.ts#L516-L548).

##### #92 Dataverse → AC-047-lexical-mmr-fallback

Badan `get_signatures`, pembentukan star edges dan pipeline Spark sampai connected components dibaca. Native masih memakai exact-signature dedup serta redundansi vector-only; vector yang hilang menghasilkan nol. Ini memperkuat gap leksikal **yang sudah ada**, bukan peluang baru.

Caveat source tambahan: `minhash.py:249` menulis `mod_prime = 1 << 61 - 1`, yang diparse sebagai `1 << (61 - 1)` atau 2^60, bukan `(1 << 61) - 1`. Rentang 230–258 kini dibaca langsung. Ini catatan aritmetika parameter dari source; dampak runtime, tingkat kegagalan, atau invalidasi seluruh algoritme tidak diuji. Donor belum tervalidasi dan tidak disarankan ditransplantasikan langsung.

MinHash adalah pembanding alternatif, belum dipilih. Untuk jumlah kandidat kecil, exact token-Jaccard #47 lebih sederhana daripada Spark/GraphFrames/LSH. Collision maupun transitivitas cluster bukan bukti kesamaan semantik, authority atau izin menghapus Memory. Apache-2.0 dan atribusi upstream harus diperiksa per file sebelum penyalinan. [Donor](https://github.com/UpstageAI/dataverse/blob/a0adedc316a4269ae6292fa1527381cfc2688eec/dataverse/etl/deduplication/minhash.py#L33-L101), [native](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/97863a285646170846da6a81c79556b1b9eeb58d/SubProject/agent-core-memory/src/memory/retrieval.ts#L332-L345).

#### Akuntansi seluruh kandidat

- Badan berpinned: **#49, #60, #69, #88, #92, #93, #101, #102**.
  - #60 benar-benar memiliki self-edit → LoRA reset/tokenization → `Trainer.train` → simpan adapter. Ini adaptasi bobot model, di luar consumer Learning body eksternal.
  - #88 mempertahankan `response.ok` di output tetapi mengembalikan `StageResult(success=True)` bila panggilan tidak melempar exception. Jangan mengambil status itu sebagai verified effect; lisensi source belum ditemukan.
  - #93 yang terbuka ialah serving/media adapter OmniServe, **bukan** training/self-learning HyperCLOVA.
  - #101 memiliki retrieval dan eksekusi eksperimen shell/CUDA, dengan larangan komersial CC BY-NC.
  - #102 forward GNN/attention/MLP dibaca sampai sigmoid output. Prediktor terlatih bukan bukti efek yang terverifikasi.
- Interface/wrapper: **#65, #71, #74**. #74 handler/client HTTP STORM terbuka; engine RAG tetap di endpoint hosted, lisensi repo belum ditemukan.
- Docs tanpa engine: **#46, #50, #54, #55, #62, #63, #68, #75, #76, #77, #78, #79, #80, #81, #96**.
  - #62 hanya abstrak resmi berhasil diambil ulang; pembacaan data-availability lama tidak diklaim sebagai pembacaan baru.
  - #75 menambah konteks dokumentasi untuk kelompok PDF existing, bukan donor source baru.
  - #96 ialah Lumigloo Sai, terpisah dari Simular. Metadata GitHub cached sangat lama; tidak dipakai sebagai bukti source selamanya tidak ada.

#### Batas dan syarat lanjut

`candidate-adoption-opportunities-20261012.json` menyimpan bukti tiap ID: commit/path/symbol/range/hash, pembacaan pass ini, lisensi, caller/owner native, keterbatasan, dan pembedaan source yang tersedia dari source engine yang belum tersedia. Keputusan ledger sebelumnya dipertahankan; **nol kelompok peluang independen baru** dibuat.

Batch 3 dan 4 masih draft. Sesudah benar-benar terintegrasi, baca ulang owner/caller pada commit hasil, bandingkan dengan dua kelompok existing, dan tutup atau kecilkan gap yang sudah teratasi. Pertahankan batas retrieval/revisi/disclosure/receipt Batch 3 dan view/source/assessment Batch 4. Tidak ada plan Batch 5–6; Invocate tetap ditunda.

### Pendalaman lanjutan kandidat 111–161

Tanggal: 12 Oktober 2026. Baseline Agent Core: `97863a285646170846da6a81c79556b1b9eeb58d`.

#### Hasil

Seluruh **28 ID yang dialokasikan** sudah diperiksa lagi: **19 body implementasi berpinned** dan **9 dokumentasi resmi tanpa engine yang dapat diperiksa**. Tidak ada entri prior-only tersisa dalam partisi ini. Ini pembacaan terarah pada fungsi/jalur yang dicatat, bukan audit seluruh repository.

**Tidak ditemukan kelompok peluang baru yang layak ditambahkan.** Keputusan ledger lama dipertahankan. Temuan mendukung pembatasan scope dan beberapa peluang existing; tidak menambah owner, runtime, store, atau batch.

Semua 141 record bukti donor/native yang berpinned diverifikasi identik dengan bytes commit yang dirujuk. Rentang baris diperiksa terhadap panjang file. Hasil lengkap, symbol, SHA, hash file, source URL, lisensi, dan keterbatasan ada di [candidate-adoption-opportunities-20261012.json](candidate-adoption-opportunities-20261012.json).

#### Temuan paling berguna

- **Bridge rhwp perlu dipisahkan dari pola uji UI.** `agent=1` hanya membatasi pemasangan `window.__rhwpAgent`; listener `message` didefinisikan di luar gate, tidak memeriksa origin, dan membalas `targetOrigin: '*'`. Ini temuan source snippet, bukan bukti kerentanan deployment. Bridge native justru memeriksa physical loopback, extension origin/ID dan client binding. Jangan memindahkan transport donor. [Donor](https://github.com/leeryong/rhwp-Agent-Skills_by_BLUESKY/blob/22b71ac155e4f0d1dd8ff927c0c64cd2cd28d24d/skills/rhwp-gui-agent/bridge/agent-bridge.snippet.ts#L19-L131), [native](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/97863a285646170846da6a81c79556b1b9eeb58d/src/http/browser-bridge.ts#L1-L63).
- **Taxonomy T-MAP tidak selalu mempertahankan unknown.** Timeout/error menjadi pesan assistant; empty response dan gagal parse judge dapat jatuh ke Refused. Ini mendukung kehati-hatian pada peluang taxonomy evaluasi existing, bukan alasan membuat evaluator produksi baru. [Body evaluasi](https://github.com/pwnhyo/T-MAP/blob/7e7fa027c1b0a1c0f7ef4365202b660823d17c34/core/base.py#L267-L389).
- **OMC memiliki korelasi request, tetapi batas retry bukan bukti kelulusan.** Helper feedback mengakhiri pending setelah maksimum percobaan. Caller completion menyeluruh belum diaudit, sehingga tidak disimpulkan otomatis menerima task. Native episode/report recheck dan exact-revision receipt tetap authority. [Helper](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/8262f9f790eed35e6cbd66572b36c2acba18f679/src/hooks/ralph/verifier.ts#L196-L269).
- **MemoryBank tidak cocok untuk canonical history.** Formula aktual `exp(-t / 5*S)` berlawanan dengan intuisi strength pada komentar; loader secara probabilistik menghapus history dan menulis ulang file asli. Persode juga menguatkan hasil hanya karena di-recall. Native receipt mempertahankan perbedaan exposure, penggunaan terverifikasi dan utility. [MemoryBank](https://github.com/zhongwanjun/MemoryBank-SiliconFriend/blob/cf61c4196e4cfdb0f2b7a0316249fa40312dc3a9/memory_bank/memory_retrieval/forget_memory.py#L20-L148), [native feedback](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/97863a285646170846da6a81c79556b1b9eeb58d/src/learning/external-controller.ts#L1005-L1036).
- **Batas source diperjelas.** DURU secara eksplisit menyatakan installer-only/source not published; Scarlet hanya README/gambar. Empat repository Wrtn mengembalikan 404 melalui API yang diperiksa, sementara halaman resmi terindeks masih terbaca. Status 404 tidak membuktikan private/deleted. SelfMem, Alibaba SkillForge dan vesslctl tetap paper/announcement tanpa implementasi terverifikasi. Tidak mengganti mereka dengan repo senama yang tidak terkait.

#### Cakupan per kandidat

| ID | Kedalaman baru | Kesimpulan terarah |
|---|---|---|
| 111 | Body berpinned | Cache prompt/exemplar dan classifier model; Skill existing cukup sebagai seam konten, tanpa classifier baru |
| 112 | Body berpinned | Learned safety routing tidak menggantikan origin/grant/authorization native |
| 113 | Body berpinned | Harness defensive-only; sebagian error/empty dipetakan ke refusal, dukungan taxonomy existing |
| 115 | Body berpinned | Cache Lucene dan gold-label rationale filtering, bukan verifikasi langkah atau kebutuhan training native |
| 116 | Body berpinned | Proxy token-logit efisiensi dengan fallback parse; bukan pengukuran resource terverifikasi |
| 119 | Docs-only | Source tidak dipublikasikan; region citation hanya dukungan dokumentasi untuk gap PDF existing |
| 121 | Body berpinned | Bridge/load/export nyata; origin check snippet tidak memadai untuk transplantasi transport |
| 122 | Docs-only | Watson/Holmes hanya deskripsi sistem; engine tidak terlihat |
| 124 | Body berpinned | Similarity/salience dan recall reinforcement tidak setara verified-use feedback |
| 126 | Body berpinned | Eksperimen SAE/model steering; di luar body external-controller |
| 128 | Body berpinned | SSOT installer vendor; native resource/revision/activation owner sudah menjadi seam yang tepat |
| 130 | Body berpinned | Full-scan transcript positional search; native-chat scope bukan context model eksternal |
| 132 | Body berpinned | Ekspor Markdown lokal dan merge backup; fuzzy session lookup tidak menjadi authority Agent Core |
| 134 | Body berpinned | Transition/request-correlated reviewer state; tidak menambah mode store atau critic runtime |
| 136 | Docs-only | AutoBE compiler/rewrite body tidak dapat diakses; Code Intelligence bukan bukti parity compiler |
| 137 | Docs-only | Typed service/DTO example hanya placeholder implementasi; current source tak terakses |
| 139 | Docs-only | Hosted vector-store dedupe klaim README; hash implementation belum terbaca |
| 141 | Body berpinned | Graph dan remote execution heuristic; lisensi ETRI membatasi reuse |
| 142 | Docs-only | Hosted compute CLI announcement; tidak ada workload/consumer native yang membutuhkan service baru |
| 143 | Body berpinned | Buffered HTTP event export; worker tidak requeue failure pada body yang diperiksa |
| 145 | Body berpinned | Ed25519/payload/caller dan nonce scope nyata; signed cross-app consumer belum dibutuhkan |
| 146 | Body berpinned | Dashboard/cache/managed config sync; bukan kebutuhan local revision-bound Skill owner |
| 147 | Docs-only | AutoView usage menginvokasi generate tanpa body; lisensi CLI belum terkonfirmasi |
| 153 | Body berpinned | Stochastic destructive forgetting; ditolak untuk canonical history |
| 154 | Docs-only | SelfMem paper; helper subquestion native belum ditemukan caller produksi sebelum Batch 3 |
| 157 | Docs-only | SkillForge paper; diagnosis section tidak mengotorisasi auto-rewrite/activation |
| 159 | Body berpinned | Macro generation/repair dapat usable tanpa verification; native verified procedure lifecycle dipertahankan |
| 161 | Body berpinned | Scaffold search baseline tetap dan exception→0; native invalid/unknown tidak boleh dihilangkan |

#### Lisensi dan batas penggunaan

MIT root text dibaca untuk SoT, KARD, Persode, oh-my-agent, cc-plus, OMX/OMC, Align SDK, MeshKit dan MemoryBank. Oh My OpenAgent memakai Sustainable Use License dengan batas pemakaian/distribusi; komponen pihak ketiga mempunyai ketentuan sendiri. Zeude menampilkan Apache-2.0 beserta notice ZEP. LICENSE AutoCode secara eksplisit menyatakan rights reserved dan izin tertulis; ArchCode tidak punya root LICENSE yang ditemukan. Kandidat lain tanpa root text tidak dianggap bebas disalin. MIT pada README Samsung hanya klaim README, bukan teks lisensi penuh. Lisensi paper tidak memberi lisensi engine yang tidak tersedia.

Tidak ada source donor yang disalin ke produk. Tidak ada donor execution, dependency/model download, test/build/benchmark, perubahan runtime/Memory, perubahan Windows, atau implementasi pada tahap inspeksi.

#### Syarat tetap sebelum pemilihan lanjutan

Batch 3 dan 4 masih **draft**, bukan integrasi yang diamati. Setelah benar-benar terintegrasi, baca ulang external caller, revision/disclosure, receipt serta view/source-assessment contract dan tutup peluang yang sudah tercakup. Source helper yang belum wired tidak boleh disebut capability eksternal aktif. `outcome-verifier` offline juga bukan bukti parity compiler/rewrite dengan AutoBE.

Dukungan dari partisi ini tidak menambah tiga kelompok existing: `opp-094-tool-response-eval-taxonomy`, `opp-pdf-projection-evidence`, dan `opp-native-turn-boundaries`. Yang terakhir tetap native-only, di luar prioritas current target. **Tidak ada plan Batch 5/6. Invocate tetap ditunda.**

### Pendalaman lanjutan: 11 kandidat 167–214

Baseline Agent Core: `97863a285646170846da6a81c79556b1b9eeb58d`, descendant dokumentasi dari baseline product sebelumnya. Sebelas file native yang dikutip cocok dengan blob HEAD.

#### Hasil

- **5 kandidat naik dari interface ke body implementasi terpin:** #169, #172, #175, #180, #182.
- **6 kandidat tetap dokumentasi tanpa engine publik terverifikasi:** #167, #186, #199, #203, #208, #214.
- **0 kelompok peluang baru.** Keputusan awal dipertahankan. Kedalaman implementasi tidak disamakan dengan keunggulan terukur atau kesesuaian untuk controller eksternal.

#### Body implementasi yang benar-benar dibaca

1. **#169 AIO Sandbox.** Body `Bash.__exec`, fetch/error handling dan retry kini dibaca. Retry default dua kali berlaku pada 408/429/5xx tanpa pemeriksaan metode/idempotency. Jangan menyalin retry POST menjadi jaminan eksekusi aman. Ini **SDK HTTP**, bukan audit engine server sandbox. Native terminal manager/ledger sudah membedakan wait timeout, exit code dan identitas proses. [Source retry](https://github.com/agent-infra/sandbox/blob/7f1afaf8d82bd30531a19caeb1a24dfebbc97d8c/sdk/js/src/core/fetcher/requestWithRetries.ts#L18-L73). Apache-2.0.

2. **#172 TARS.** Loop screenshot → VLM → operator, batas loop, abort dan retry dibaca. Native `browser_control.act` mengikat aksi ke observation terbaru dan memeriksa freshness. Kualitas model visual donor belum dibandingkan; loop controller baru tidak menjadi kebutuhan body eksternal. [GUIAgent.run](https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/packages/ui-tars/sdk/src/GUIAgent.ts#L128-L452). Apache-2.0.

3. **#175 tRPC-Agent-Go.** Registry request, deadline/cancel dan FIFO invocation-scoped dibaca. Queue membedakan owning/borrowed attachment agar child tidak menutup queue owner. Pemanggil `llmflow` yang memilih waktu drain belum diaudit; jangan mengklaim keseluruhan safe-boundary sudah terbukti. Runner semantik ini belum mempunyai consumer body eksternal yang membutuhkan transplantasi. [Queue](https://github.com/trpc-group/trpc-agent-go/blob/cbd89b07842e68f4e50279e7fb009e1d66cb9044/internal/state/steer/steer.go#L44-L191). Apache-2.0.

4. **#180 Kimi Code/CLI.** Matching dan subprocess hook kini dibaca, termasuk fail-open pada kegagalan serta akumulasi output tanpa batas pada helper TS. CLI Python memisahkan kegagalan telemetry agar keputusan block tidak hilang. Native MCP sudah memisahkan grant enforcement dan error observer; prinsip ini mendukung owner existing, bukan gap baru. [Hook runner](https://github.com/MoonshotAI/kimi-code/blob/cbd754049a114ee36d1b27675c82819e4963c692/packages/agent-core-v2/src/features/externalHooks/internal/runHook.ts#L58-L205), [isolasi telemetry Python](https://github.com/MoonshotAI/kimi-cli/blob/9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82/src/kimi_cli/hooks/engine.py#L205-L256). MIT / Apache-2.0 sesuai repo.

5. **#182 OpenAgentCore.** Dispatch, cancellation dan transaksi konfigurasi Agent benar-benar dibaca. Settlement prepared release belum ditelusuri penuh, sehingga tidak ada klaim exactly-once atau cancellation superior. Control-plane pengganti belum punya manfaat konkret untuk consumer MCP eksternal existing. [Dispatch](https://github.com/MiniMax-AI/OpenAgentCore/blob/0bffeb361f4b09b4c99386a0528e7938ecf9757c/apps/daemon/internal/dispatch/router.go#L93-L219). MIT.

#### Batas sumber yang dikonfirmasi ulang

- **#167 MiniMax Forge/M2.7:** laporan resmi menyebut framework/harness internal. Training engine dan code license belum terverifikasi. [Forge](https://www.minimax.io/news/forge-scalable-agent-rl-framework-and-algorithm), [M2.7](https://www.minimax.io/news/minimax-m27-en).
- **#186 Tencent ADP:** halaman produk menjelaskan layanan, belum memberikan body engine yang dapat dibandingkan. [ADP](https://adp.tencentcloud.com/en).
- **#199 BeliefMem:** paper **v2** dan lisensi CC BY 4.0 dibaca ulang. Nilai belief dinyatakan sebagai confidence hasil LLM, bukan posterior terkalibrasi. Public engine tetap belum terverifikasi. [Paper](https://arxiv.org/html/2605.05583v2).
- **#203 EVE-Agent:** reward bukti merupakan objective training proposer/solver; belum menjadi verifikasi task independen. Engine publik belum terverifikasi; paper CC BY-NC-ND 4.0. [Paper](https://arxiv.org/html/2605.22905v1).
- **#208 Fugu/TRINITY/Conductor:** README menegaskan coordinator melalui Sakana API. Fungsi installer memang dibaca, tetapi tidak dihitung sebagai engine. Root tree tidak memiliki LICENSE; lisensi asset demo tidak mewakili keseluruhan repo. [README](https://github.com/SakanaAI/fugu/blob/0e04afcc10d8fb7f82cdbe903b83666dc0fe51ec/README.md#L5-L43).
- **#214 Kozuchi:** dokumentasi menyebut sebagian teknologi proprietary sebagai **planned**; tidak membuktikan engine self-evolution tersedia. [Dokumentasi resmi](https://en-documents.research.global.fujitsu.com/multi-ai-agent-framework/).

#### Batas dan kelanjutan

JSON pendamping menyimpan SHA, path, symbol, rentang, caller native, lisensi dan unknown per entri. Tidak ada donor/product execution, instalasi, build/test, product edit, ataupun plan Batch 5/6 pada tahap inspeksi. Pencarian luas pada clone sparse tRPC sempat gagal lazy-fetch SSL; known-path reads sukses, dan kegagalan itu tidak dipakai untuk menyimpulkan ketiadaan engine.

Setelah Batch 3/4 benar-benar terintegrasi, wajib membaca ulang owner/caller hasil implementasi dan mencocokkan dokumentasinya. Recall, source/view binding, grants, receipts dan metadata-only capture tidak boleh diasumsikan dari draft. Invocate tetap ditunda.

## Lampiran: hasil putaran pertama

Bagian berikut mempertahankan cakupan pembacaan pada putaran pertama. Angka prior-only dan depth di lampiran bersifat historis; tabel kumulatif di awal adalah status terkini.

## Pendalaman kandidat 001–054

Baseline Agent Core: `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`, 12 Oktober 2026. Target tetap AI eksternal yang memakai owner Agent Core existing. Ini riset source, bukan rencana Batch 5/6 atau implementasi.

### Hasil utama

Tiga peluang menyentuh perilaku runtime/response controller eksternal; satu peluang tambahan bersifat evaluasi opsional. Tidak ada klaim peningkatan performa terukur.

#### #47 Grok Build: diversitas saat embedding tidak tersedia

Celah lama dikonfirmasi kembali. `maxSemanticRedundancy` native mengembalikan nol untuk kandidat tanpa vector dan melewati pasangan selected tanpa vector. Exact-signature dedup tidak menyelesaikan near-duplicate lexical. Donor [MMR token-Jaccard](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-memory/src/mmr.rs#L19-L120) menyediakan pembanding tanpa embedding.

Seam riset: fallback pasangan lexical berbatas dalam selector canonical yang sama. Jangan mengganti jalur pasangan vector lengkap, fusion, feedback atau penyimpanan. Native menerima pool yang dapat lebih besar daripada asumsi donor; cache/token/comparison bounds perlu jelas. Dua token set kosong pada donor dianggap identik, sehingga tidak layak disalin tanpa penyesuaian. Lisensi Apache-2.0.

Batch 3 sudah menunda #47 secara eksplisit karena ranking global berbeda dari orchestration multi-query. Periksa lagi source hasil integrasi sebelum memilihnya.

#### #30 Mem0: bedakan recall kosong dari recall gagal

Peluang baru yang sempit. Donor [memisahkan generation error dari hasil kosong](https://github.com/mem0ai/mem0/blob/b7ad69afda6b6ed030347c66d48a13e4de9dec08/mem0/memory/main.py#L957-L991). Native `ExternalControllerLearningService.context` dan `failureContext` mengubah exception pencarian Memory menjadi `[]`, lalu memakai wording tidak ada Memory relevan. Dengan demikian kegagalan lookup dapat tampak seperti pencarian sukses tanpa hasil.

Seam riset: status read bounded dan reason code tersanitasi pada response existing, sambil tetap fail-soft. Tidak ada retry otomatis, web fallback, provider atau gate baru. Fallback lexical yang memang berhasil tetap hasil valid. Donor sendiri masih mengubah parse error menjadi kosong; jangan meniru seluruhnya. Lisensi Apache-2.0.

Overlap kuat dengan Batch 3: planned retrieval sudah dirancang mempunyai partial/blocked status. Recheck apakah implementasi aktual juga menyelesaikan jalur legacy single-query dan failure capsule. Bila sudah, tutup peluang ini.

#### #34 OpenViking: cakupan packet saat budget habis

Peluang baru pada komposisi packet. Donor [memberi floor detail dahulu, lalu memperdalam, dan melaporkan item yang hilang](https://github.com/volcengine/OpenViking/blob/4a2909b44f0b89b0069527bd9da022739f9c1fa1/openviking/retrieve/context_assembler/budget.py#L44-L194). Native `buildKnowledgeSynthesisPacket` memfilter line menurut urutan tetap dan sisa 16.000 unit UTF-16; tidak ada ringkasan omission/coverage per section. Contradictions dan evidence gaps berada dekat akhir sehingga dapat hilang ketika budget sempit.

Seam riset: komposisi section-aware serta omission yang eksplisit, memakai output terpilih yang sama dengan atribusi artefak existing. Canonical Memory sudah memiliki byte budgeting dan Skill sudah mempunyai diagnostik omission; tidak perlu owner baru.

Berkas donor berlisensi AGPL-3.0: referensi konsep saja, tanpa rekomendasi menyalin source. Tidak mengadopsi VLM, cooldown ledger, prefetch atau store donor. Batch 3 mengubah owner synthesis yang sama; recheck wajib setelah integrasi, dan jangan menyamakan cap 32 KiB blok Memory dengan seluruh packet/transport.

#### #44 Anthropic skill-creator: bukti negatif untuk seleksi Skill, opsional

Donor [membedakan should-trigger dan should-not-trigger](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/skill-creator/scripts/run_eval.py#L184-L241). Evaluator native `memory-retrieval-hit-at-k` mensyaratkan expected ID nonempty, sehingga tidak mewakili kasus “Skill ini seharusnya tidak dipilih”. Unit test native untuk non-trigger sudah ada; ini bukan klaim ketiadaan pengujian.

Jika nanti diminta bukti kualitas seleksi, proyeksi offline kecil dengan positive/negative/unknown dapat berguna. Bukan fitur runtime, pengulangan instalasi Batch 2, benchmark wajib atau gate penerimaan. Donor punya jebakan: kegagalan subprocess dihitung False, query duplikat dapat kolaps, dan set “test” berulang kali dipakai memilih pemenang. Pertahankan unavailable terpisah dan final holdout yang benar-benar belum dipakai. Lisensi komponen Apache-2.0; tidak mengadopsi Claude CLI atau loop optimisasi.

### Cakupan dan batas

- Semua 54 ID tercatat tepat sekali di `candidate-adoption-opportunities-20261012.json`
- 47 kandidat dibaca ulang pada potongan code berpinned; ini bukan audit penuh 47 repository
- #49: snapshot code dari URL raw resmi dibaca kembali, tetapi pin historis tidak diketahui dan path tidak ada pada tree checkout sekarang
- #46: dokumentasi resmi dibaca ulang, tanpa mengklaim engine source
- #50/#54: README/lisensi dan inventory release dibaca; tidak ada training engine pada tracked tree tersebut
- #7/#17/#25: bukti donor diteruskan dari ledger karena alokasi Batch 2/3 sudah ada; bukan inspeksi donor baru
- 53 pemeriksaan HEAD kandidat cocok dengan pin input; beberapa kandidat berbagi repository
- Disposisi: 4 deepened, 43 rechecked tanpa gap baru, 3 reserved, 3 docs-only, 1 pinned-source unavailable

Kesimpulan reuse/defer/reject lama tidak diubah secara massal. Banyak donor hanya menawarkan loop model, training, replacement store atau mutation tanpa bukti yang lebih lemah daripada kontrak native. Contoh penting: Hindsight membedakan grounding hilang dari semua grounding tidak-teresolusi, sementara native sudah mempunyai nested exact-revision dependency checks; tidak perlu membuka ulang instalasinya.

Sebelum adopsi apa pun: Batch 3 dan 4 harus diintegrasikan, lalu dokumentasi dibandingkan dengan source hasil sebenarnya. Artefak JSON mencatat seam, prerequisite, overlap, SHA/file/symbol/range dan recheck spesifik untuk tiap peluang.

Tidak ada code donor/native yang dieksekusi, pengujian/build, instalasi, perubahan produk/config/proses/Windows, Memory write, commit atau push. Perubahan worker ini hanya artefak riset dalam direktori penugasan.

## Pendalaman kandidat 55–108

Riset statik, 12 Oktober 2026. Baseline Agent Core `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`. Tidak ada implementasi, instalasi, build/test atau perubahan Windows. Keputusan ledger sebelumnya tetap dipertahankan; ini catatan peluang, bukan rencana batch baru.

### Hasil utama

Empat peluang nyata atau conditional dicatat dengan source donor, SHA, simbol/range, native caller, lisensi, seam internal dan pemeriksaan pasca-Batch3/4 di JSON pendamping. Tidak ada klaim manfaat terukur.

1. **#83 AMD: task-conditioned failure recall.** Donor menyaring fungsi lalu memakai query turn untuk memilih contoh. Native external failure recall sudah ada, tetapi query hanya tool/failure-family/argument keys; episode taskFamily/taskKey tidak dipakai. Ini perbaikan spesifisitas di owner existing, bukan alasan store baru. Sumber tidak memiliki root license yang ditemukan; jangan menyalin kode atau raw reasoning.
2. **#90 EXAONE: advisory progress yang benar-benar task-scoped.** External HTTP handler membagikan satu FailureLoopAdvisor, dan success memutus streak tanpa result-state signal. Donor membentuk state per run. Isolasi task perlu diperjelas sebelum mencoba advisory successful-but-unchanged. Hard duplicate blocking, automatic stop dan model sufficiency donor ditolak karena polling/retry sah.
3. **#94 FunctionChat-Bench: coverage evaluasi respons tool.** Native routing harness menilai trigger boolean; effectiveness harness menilai final-answer exact match. Taxonomy slot-missing, irrelevant/unsupported, completion dan calls dapat mengungkap failure yang tidak terwakili secara eksplisit. Pertahankan existing harness, heldout dan exact schemas; jangan copy comparator donor yang menyamakan case/spasi atau hanya memeriksa first call.
4. **#82 AutoRAG: lesson advisory source/method lintas task.** Seams internal ada melalui Learning/Memory context, tetapi readiness masih conditional pada real verified source/method outcomes. Frekuensi judged evidence bukan kualitas. Donor reset store, early pending drain, confidence yang hanya naik, dan clustering lima token tidak layak dibawa. Jangan membuat learned router atau store kedua.

### Koreksi hasil pemeriksaan

- **#97 PREPING:** verification-before-memory tidak unconditional. `validation_policy.py:24–41` mengembalikan semua results bila validation_stats kosong. Jalur ini tidak layak menjadi authority native.
- **#100 SLA:** source/paper read-only dan network-none hanya pada Docker branch; non-Docker branch tidak menegakkan immutability melalui mount.
- **#67 Sai:** suppression setelah write_memory hanya melihat tool call, bukan keberhasilan/digest; jangan mengadopsinya buta.
- **#86 Membrane:** partial judge reply dapat membuang candidate tanpa verdict; parser menerima verdict string yang belum ditutup ke enum. Native tidak boleh kehilangan evidence hanya karena model melewatkan item.
- **#107 UniversalRAG:** normalizer menolak duplikat/unknown tetapi menerima `no+paragraph`; closed enum tidak sama dengan validasi semantic combination.
- **#108 Adaptive-RAG:** native subquestion helper memang ada, tetapi external context masih single-query. Gap wiring adalah reservasi Batch3 #25, bukan pekerjaan baru untuk #108.
- **#71 Agentica:** satu file orchestration resmi berhasil terbaca via cached raw web; API repo memberi404 dan SHA tidak terverifikasi. Dicatat partial-unpinned, tidak diklaim fully inspected/current engine.

### Cakupan yang jujur

- 54/54 ID tercatat tepat sekali.
- 31 kandidat mendapat read kode donor lokal berpinned;2 hanya dokumen (#55/#68); #71 partial kode web tanpa SHA.
- 20 kandidat hanya carried-forward/reserved pada tahap ini: #60, #62, #63, #65, #69, #73, #74, #75, #76, #77, #78, #79, #80, #81, #88, #92, #93, #96, #101, #102.
- 20 file owner/harness native dibaca; semua range dan hash ada di JSON.
- Disposisi: docs-only-no-engine=2; existing-source-rechecked-no-new-gap=21; carried-forward-out-of-scope=9; unavailable-source=10; deepened-source=10; partial-unpinned-source=1; reserved-prior-batch=1.

##73 reserved Batch1. Sumber closed/hosted yang tidak memberi engine dan kandidat training/runtime yang jelas di luar lingkup tidak dikejar ulang tanpa alasan. Riwayat keputusan dan bukti lama disimpan terpisah dari range yang dibaca pada task ini. Semua local Git HEAD berpinned yang diperiksa cocok dengan input; source-only Motif menggunakan hash snapshot. Atria dibaca dari Git object karena worktree hanya berisi metadata repository.

### Batas dan pemeriksaan wajib

Sebelum mempertimbangkan adopsi apa pun, tunggu Batch3/4 terintegrasi lalu cocokkan dokumentasi dengan source dan hasil aktual. Baca kembali scope episode/owner, serial multi-query limits, late-settlement semantics, exact revision/receipt, metadata-only visual handling, dan manifest/evaluation schema. Root Memory tetap `runtime/memory`. Tidak ada model/runtime/store donor, permission gate, autonomous promotion, atau rencana Batch5/6 di riset ini.

File detail: `candidate-adoption-opportunities-20261012.json`.

## Pendalaman kandidat 109–162

**Status: riset statik saja, 12 Oktober 2026.** Baseline Agent Core: `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`. Tidak ada integrasi, rencana Batch 5/6, eksekusi donor, build, test, instalasi, perubahan Windows pada tahap inspeksi source.

### Hasil utama

Peluang paling konkret untuk **AI eksternal yang memakai Agent Core** adalah satu kelompok gabungan **#120 ParserTry + #140 OpenDataLoader PDF**: mempertahankan metadata kemampuan ekstraksi, halaman, wilayah teks, dan asal ekstraksi pada owner PDF existing. Lima kelompok lainnya sengaja dibedakan sebagai bersyarat atau di luar target eksternal sekarang. Jumlah kelompok bukan jumlah pekerjaan yang disetujui.

Semua **54 ID tercatat tepat sekali** dalam [JSON lengkap](candidate-adoption-opportunities-20261012.json). Verdict ledger sebelumnya tidak diubah.

| Disposisi | Jumlah |
|---|---:|
| Source diperdalam | 8 |
| Source dibaca ulang, tanpa gap baru yang cukup kuat | 16 |
| Docs-only dibaca ulang, tanpa engine | 2 |
| Reserved Batch terdahulu | 2 |
| Source lama dibawa maju, tanpa membaca badan source baru | 19 |
| Paper/docs/access-limited dibawa maju, implementasi tak terverifikasi | 7 |

Artinya **24 kandidat mendapat pembacaan code baru**, 2 pembacaan docs-only, dan 26 memakai bukti review sebelumnya ditambah 2 reserved Batch 1/4. Pemeriksaan HEAD/tree clone bukan klaim bahwa seluruh source telah dibaca. Semua clone yang tersedia cocok dengan SHA pin ledger. #133 reserved Batch 1; #138 reserved draft Batch 4, belum terintegrasi pada baseline ini.

### Peluang yang layak disimpan

#### 1. #120 + #140: proyeksi PDF yang mempertahankan bukti

**Gap struktural terkonfirmasi; manfaat belum diukur.** ParserTry menyatakan capability dan memisahkan parser tidak tersedia dari error, lalu [adapter PyMuPDF](https://github.com/leeryong/ParserTry/blob/efc01d8ab1a350f14d74f614443f01bcba5d1071/backend/parsers/pymupdf_parser.py#L52-L146) mempertahankan bbox per span dan ukuran halaman. OpenDataLoader [SerializerUtil](https://github.com/opendataloader-project/opendataloader-pdf/blob/2fd4b076f7e175aa33cd4d4e51f72a9447c51920/java/opendataloader-pdf-core/src/main/java/org/opendataloader/pdf/json/serializers/SerializerUtil.java#L51-L146) benar-benar mengeluarkan halaman/bbox dan metadata seperti sumber teks stream/OCR, metode pencocokan kata, dan inferensi heading.

Native `PdfPageItem` berisi text/images/pageNumber; `pdf2md.ts:89–101` meratakan hasil transformasi menjadi string. `ProjectionResult` tidak menyatakan kapabilitas OCR/tabel/region yang tidak didukung atau tidak dicoba. Ini kehilangan struktur yang berguna untuk controller, bukan bukti extractor donor lebih akurat.

**Feasibility internal cukup kuat:** dependency yang sudah terpasang, `@opendocsg/pdf2md` versi 0.2.9, membentuk TextItem x/y/width/height sebelum transform (`lib/util/pdf.js:68–85`). Tidak otomatis perlu PyMuPDF, Java, Docling, atau model OCR baru. Namun posisi dibulatkan dan tinggi bersifat heuristik; konvensi koordinat, rotasi, clipping dan approximation harus eksplisit.

Seam riset: wrapper PDF dan hasil `DocumentProjectionService` existing, dengan satu bytes snapshot dan output bounded. Batch 1 public reader sudah memakai bytes yang sama untuk digest dan parsing (`public-url.ts:35–76`); kontrak itu harus dipertahankan. Region PDF bukan `viewId` inspector dan bukan bukti controller telah melihat pixels.

Lisensi #140 Apache-2.0. #120 hanya mempunyai badge MIT yang menunjuk LICENSE tak ada pada tracked tree; engine recommendation masih obfuscated. Jangan menyalin source substantif #120 sebelum lisensinya jelas. Pola kontrak kecil dapat diimplementasikan independen.

#### 2. #127 OpenChrome: saran prosedur sesuai halaman

**Bersyarat, relevan untuk controller eksternal sebagai saran.** [Action cache donor](https://github.com/shaun0927/openchrome/blob/e2ee5e30fa54f44e1fa0202ad5bc83d8702f1417/src/actions/action-cache.ts#L337-L403) membedakan URL/signature mismatch, kebijakan replay, dan variabel yang belum disubstitusi. Native sudah mempunyai guard observation/action/focus yang kuat, tetapi pemilihan prosedur di context masih berbasis teks, bukan kecocokan dengan observasi halaman saat ini.

Pola kecil yang mungkin berguna: proyeksi match/mismatch/unknown atas **prosedur existing yang sudah punya bukti terverifikasi** dan metadata observasi sekarang. Tidak membawa action cache, confidence donor, store domain baru, replay otomatis, atau ID elemen lama. Perlu kasus nyata saran prosedur basi sebelum diprioritaskan. Lisensi MIT.

#### 3. #135 RLM-FORGE/Ouroboros: cakupan klaim eksplisit

**Bersyarat dan mungkin tidak diperlukan sesudah Batch 3/4.** [TraceGuard](https://github.com/Q00/rlm-forge/blob/e7d1a6691025a406e0cc21a3f18369df0afa494f/src/rlm_forge/traceguard.py#L184-L278) memvalidasi fact ID terhadap chunk ID. Native sudah punya coverage subquestion dan identitas revision, tetapi itu belum sama dengan cakupan seluruh klaim pada suatu laporan.

Hanya layak jika ada consumer laporan yang jelas setelah Batch 3/4: expected claim IDs → exact evidence handles → missing/invalid/unknown yang eksplisit. Tidak menambah subsystem laporan atau model jury. Donor menerima kumpulan klaim kosong secara vakum dan dictionary dapat menimpa fact ID duplikat; kedua perilaku tidak layak diadopsi. Binding handle bukan pembuktian entailment atau kebenaran. Lisensi MIT.

#### 4. #144 slides-grab: freshness dependency set milik producer

**Bersyarat untuk producer artefak, bukan kemampuan build generik Agent Core.** [Donor](https://github.com/NomaDamas/slides-grab/blob/49bdaed950584a46437fb2b80939a7f5e0c8e4d0/src/design-gate-state.js#L104-L219) membandingkan hash source, aset lokal, report dan preview. Native mempunyai byte integrity satu artefak dan snapshot file terpilih. Presentation Bridge mengetahui source/previews/report, tetapi belum memproyeksikan satu dependency set yang dapat dicek kembali sebagai hubungan producer.

Koreksi penting: donor hanya menemukan src/poster dan CSS url dalam HTML (`270–289`), **bukan closure dependency transitif** stylesheet/font/import. Peluangnya terbatas pada set dependency yang benar-benar diketahui producer. Setelah Batch 4, exact emitted-view digest bisa menjadi referensi evidence; digest itu sendiri tidak membuktikan source slide atau font masih current. Tidak mengadopsi export gate/dual oracle. Lisensi slides-grab MIT; tiga repo lain dalam keluarga #144 hanya dibawa maju dari review lama.

#### 5. #131 senpi: batas turn Native Chat

**Gap nyata tetapi native-only, di luar prioritas controller eksternal sekarang.** [Donor](https://github.com/code-yeongyu/senpi/blob/792eb9c38e19947828a666a5c84b8442ef34277c/packages/agent/src/harness/compaction/compaction.ts#L322-L434) memilih cut point dan mengenali split turn. Native `boundedContextMessages` memotong suffix message pada batas 24 pesan/48.000 unit UTF-16 tanpa disclosure omission.

Jalur native tersebut hanya membaca user dan assistant final, jadi jangan menyebutnya menghasilkan orphan tool-result. `messages.slice(-256)` pada checkpoint merupakan pertanyaan reachability terpisah, belum dibuktikan gagal. Seam hanya owner Native Chat; bukan kontrol terhadap context AI eksternal. Tidak mengimpor runtime atau summarizer donor. Lisensi MIT dengan atribusi upstream.

#### 6. #123 Aspen-MCP: kepemilikan aplikasi non-reentrant

**Bersyarat, khusus worker aplikasi opsional.** [ComFunnel](https://github.com/EPEL-SNU/Aspen_Plus_MCP/blob/eebd0ad1881b6fa8030137dc0d7da97cf4f76430/src/com_funnel.py#L33-L54) menserialisasi operasi dan menghindari deadlock nested call. Presentation Bridge memulai conversion secara independen, dan worker Keynote meluncurkan proses osascript terpisah. Namun script memakai docRef eksplisit; belum ada kegagalan concurrency yang teramati.

Simpan sebagai hipotesis owner-local singleflight bila kelak ada workflow Keynote paralel yang bermasalah. Jangan mengimpor antrean donor yang tidak bounded, Python/COM, atau aplikasi Aspen. Tidak menjadi blocker Linux/current external controller. Lisensi MIT.

### Temuan yang memperkuat reuse/defer

- **#150 Mandol:** kegagalan resolusi space [mengembalikan None](https://github.com/AgentCombo/Mandol/blob/6d7af4f004e1b311fb5c93d3e14fab90677942d8/src/mandol/retrieval/graph_context_expander.py#L515-L533), yang mematikan filter kandidat; hasil dapat tetap diberi label space_restricted. Native memperluas hanya dari `scopedRecords`. Ini observasi source, bukan exploit teruji.
- **#148 TencentDB / #152 MemoryOS:** kegagalan cabang retrieval dikonversi menjadi list kosong. Jangan menganggap empty set sebagai bukti pencarian lengkap.
- **#151 openJiuwen:** promote-before-checkpoint berguna, tetapi checkpoint corrupt menjadi empty set. Native mempertahankan outcome per kandidat dan review yang belum selesai.
- **#155 Trace2Skill:** final merge yang gagal mengembalikan `current[0]`, menghilangkan kontribusi lain; native revision/resource preservation lebih sesuai.
- **#156 SkillClaw:** verifier yang dinonaktifkan tidak menahan jalur upload. Native verification-backed use dan proposal-only review tetap lebih sesuai.
- **#158 SkillNet:** graph expansion mempunyai mekanisme berbeda, tetapi belum ada kegagalan katalog besar yang membuktikan kebutuhan. `expand` mempertahankan semua seeds, meskipun seeds melampaui limit; jangan menyalin batas itu tanpa validasi.
- **#110 CoLoR / #160 AFlow:** source mengandung fallback/loop yang tidak layak dijadikan peningkatan tanpa evaluasi; native quality/resource evidence tetap owner.

### Syarat sebelum keputusan adopsi berikutnya

Tunggu Batch 3 dan 4 terintegrasi, lalu cocokkan dokumentasi dengan source dan hasil aktual. Baca kembali owner yang tersentuh, exact-revision/origin/omission Batch 3, emitted-view digest/criteria coverage Batch 4, serta kontrak digest/bytes Batch 1. Hilangkan peluang yang sudah tertutup; jangan membuat Batch 5/6 dari hitungan kandidat.

JSON menyimpan SHA, file/symbol/rentang yang benar-benar dibaca, file digest, links, lisensi, coupling, seam, prerequisites dan recheck spesifik per kelompok. Konsistensi JSON/ID/digest/rentang diperiksa. Itu validasi artefak riset saja, bukan test produk atau bukti peningkatan kemampuan.

## Pendalaman kandidat 163–216

Riset statik pada Agent Core `86fe9efe53dcfa8da61616c5e5d34e724e0a1891`, 12 Oktober 2026. Target tetap AI eksternal yang mengendalikan tubuh Agent Core. Ini catatan peluang, **bukan rencana integrasi Batch 5/6**.

### Hasil utama

Tiga mekanisme layak disimpan sebagai peluang bersyarat di owner existing. Tidak ada bukti peningkatan performa terukur, tidak ada gate baru, dan semua keputusan ledger lama tetap dipertahankan.

#### #164 Skill Self-Play: cakupan bukti revisi Skill

Donor memeriksa paket revisi, memvalidasi sampel keberhasilan lama dan probe defect, lalu menolak bila ada isu. Native sudah mengikat digest kandidat/baseline, lineage sumber, bukti dan keputusan pengguna, tetapi jalur yang dibaca belum membawa paket cakupan retained-positive/defect-probe untuk revisi yang tepat.

Peluang kecil: artefak bukti advisory yang direferensikan proposal/staging existing, dengan identitas baseline/kandidat, kasus, verifier/oracle, hasil dan cakupan yang hilang. Controller eksternal menafsirkan hasil; keputusan aktivasi tetap existing.

Batas penting: donor memvalidasi kontrak **sampel**, bukan menjalankan eksperimen performa tugas baseline versus kandidat. Anchor boleh kosong; `tests.jsonl` yang tidak ada melewati tahap tes lokal; checker berasal dari paket Python. Jangan membawa validator executable donor atau menyebut hasilnya bukti independen.

- [Donor: validasi paket, anchor, probe](https://github.com/Qwen-Applications/skill-self-play/blob/bb693c89fee66e1f824d6a777759a49b7a295a83/tool_call/refine_skills.py#L449-L669)
- [Native: promoteRevision](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/86fe9efe53dcfa8da61616c5e5d34e724e0a1891/src/skills/service.ts#L1100-L1141)
- Apache-2.0 diperiksa ulang. Tidak membutuhkan vLLM, training stack atau model reasoning baru.

#### #183 DeerFlow: membedakan umur konfirmasi dari umur edit/akses

Donor mempunyai komponen `lastConfirmedAt`, fallback waktu pembuatan yang lebih lemah, dan access heat yang terpisah. Native retirement preview memakai `updatedAt`, jumlah/waktu akses dan salience. Native juga sudah mempunyai metadata `verifiedAt` serta source refs, sehingga celahnya bukan absennya penyimpanan waktu/bukti.

Peluang: penjelasan tambahan pada preview read-only existing, untuk memperlihatkan apakah freshness berasal dari bukti konfirmasi yang sah, pengeditan, akses, atau masih unknown. Belum ada dasar untuk mengubah bobot, ranking atau menghapus memori otomatis. `verifiedAt` juga tidak otomatis berarti pengguna mengonfirmasi klaim.

Donor mendeteksi reinforcement lewat regex pada pesan manusia; itu bukan bukti konfirmasi untuk tiap fakta. Otoritas konfirmasi exact-revision harus ditentukan sebelum scoring dipertimbangkan. Status lama **defer** tetap benar.

- [Donor: confirmation freshness dan access heat](https://github.com/bytedance/deer-flow/blob/65fa321ec18a8e97b5ee60b023afbd95b0eba83b/backend/packages/harness/deerflow/agents/memory/backends/deermem/deermem/core/eviction.py#L73-L154)
- [Native: scoreMemoryRetention](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/86fe9efe53dcfa8da61616c5e5d34e724e0a1891/SubProject/agent-core-memory/src/learning/retention-score.ts#L26-L39)
- MIT diperiksa ulang. Hanya mekanisme penjelasan/scoring yang mungkin portabel; harness dan store donor tidak dibutuhkan.

#### #192 Kagura: propensity untuk evaluasi recall

Donor menerima pool yang sudah diurutkan, mencampur top-k deterministik dengan subset uniform, menolak exploration floor yang tidak mungkin, dan melaporkan probabilitas inklusi sebenarnya beserta seed/policy. Ledger native yang dibaca mempunyai rank, disposition, digest dan delivery, tetapi belum mempunyai probabilitas seleksi/identitas randomisasi.

Peluang ini **khusus evaluasi terikat tujuan dan budget**, bukan randomisasi recall produksi. Metadata dapat hidup pada artefak evaluasi existing. Ia membuat bias paparan dapat diaudit; tidak dengan sendirinya membuktikan manfaat kausal atau mengizinkan feedback positif.

Batch 3 sangat relevan: probabilitas sebelum merge bukan probabilitas hasil akhir setelah beberapa query, dedup, relevance filtering dan pemangkasan byte. Jika probabilitas akhir tidak dapat dihitung benar, jangan menamainya propensity final.

- [Donor: selector evaluasi dan probabilitas](https://github.com/kagura-ai/memory-cloud/blob/487602c0b95f863555fce40b756bdf31c026add9/backend/src/services/recall_selection.py#L1-L125)
- [Native: kontrak exposure/receipt](https://github.com/Black-Project-Agent-Core/Agent-Core/blob/86fe9efe53dcfa8da61616c5e5d34e724e0a1891/SubProject/agent-core-memory/src/memory/retrieval-ledger.ts#L25-L103)
- Apache-2.0 diperiksa ulang. PostgreSQL/Qdrant/Redis donor tidak dibutuhkan. Reproduksi seed perlu identitas algoritme RNG; seed yang sama tidak menjamin Python dan JavaScript menghasilkan pilihan sama.

### Temuan pembatas yang memperkuat keputusan lama

- **#193 TreeQuest, #194 ShinkaEvolve, #209 Optuna:** benar-benar mempunyai alokasi/sampling kandidat; native portfolio/series merupakan analisis hasil, bukan implementasi optimizer tersebut. Namun belum ada tujuan pencarian eksternal yang konkret. Tetap lead tertunda, bukan alasan membuka ulang P4. TreeQuest memindahkan trial ke finished sebelum pembaruan tree berikutnya; Optuna `skip_if_finished` tidak membandingkan reward baru, dan validator yang dibaca menolak NaN tetapi tidak infinity. Jangan menyalin perilaku itu melewati kontrak finite/digest native.
- **#177 MS-Agent:** donor menghitung pengulangan argumen tanpa memeriksa outcome, menyisipkan pesan `user`, lalu menghentikan runtime. Native FailureLoopAdvisor memakai kegagalan aktual, keluarga error, pengecualian polling dan reset saat sukses. Tidak ada alasan mengambil otoritas atau stop gate donor.
- **#185 WeKnora:** body tiap chunk dipisahkan kembali dari konteks ranking yang diperluas. Ini invariant attribution yang berguna untuk recheck Batch 3; native excerpt/synthesis sudah mempunyai revision/span/source refs.
- **#181 MiniMax Code, #210 J-tau, #216 ELYZA:** masing-masing memperlihatkan batas yang tidak boleh disalin: verifikasi bergantung billing route; reward 1 saat kriteria tidak ada; `critical_violation_free=True` sebagai placeholder. Native missing/unknown dan pelanggaran eksplisit tetap dipertahankan.
- **#204–207:** mekanisme LoRA/KV-cache/fast-weight/expert tensor memerlukan akses internal model. Tidak dipromosikan sebagai peningkatan AI eksternal melalui Memory.
- **#208/#215:** konfigurasi/provider atau client HTTP yang terbuka tidak membuka engine koordinasi/retrieval hosted. Tidak ada klaim audit engine tersebut.

### Cakupan yang benar-benar dikerjakan

Seluruh **54 ID tercatat tepat satu kali** dalam `candidate-adoption-opportunities-20261012.json`.

- 47 entri mempunyai pembacaan ulang source/interface/config pada pin SHA yang tercatat: 41 focused source excerpts, 5 boundary/interface-only, 1 configuration-only
- Total 52 pasangan file donor dibaca sebagai excerpt, ditambah identifikasi lisensi untuk enam kandidat; bukan 52 file diaudit seluruhnya
- 9 entri ditandai deepened-source; 38 existing-source-rechecked-no-new-gap
- 5 docs-only dibawa dari bukti terdahulu: #167, #186, #199, #203, #214. Tidak dilakukan pencarian publik baru atau klaim ketiadaan source secara global
- 2 reserved dipertahankan: #178 Batch 1 dan #195 Batch 2. Donornya tidak dibuka ulang
- Sibling repo/file yang tidak tercantum pada `currentPassInspection.donorEvidence` tetap bukti terdahulu, bukan pembacaan baru

JSON memisahkan setiap bukti lama dari file, simbol, baris dan SHA yang dibaca pada pass ini; peluang dilengkapi owner native, lisensi, coupling, seam, prasyarat dan recheck spesifik.

### Sebelum prioritas lanjutan dipilih

Tunggu Batch 3/4 benar-benar terintegrasi, lalu cocokkan dokumentasi dengan hasil nyata. Periksa ulang snapshot/digest Skill dan delivery pada Batch 3, asal/probabilitas hasil recall setelah merge, serta batas deklaratif review visual Batch 4. Review visual tidak menjadi oracle performa Skill maupun konfirmasi kebenaran memori. Jika kontrak baru sudah menutup celah, hapus duplikasi usulan.

### Ledger tindakan

Hanya artefak riset partisi ini dibuat. Tidak ada perubahan source produk, donor execution, tes/build produk, instalasi, panggilan provider, perubahan Windows, commit atau push. Dirt dokumentasi existing dipertahankan. Satu path katalog TreeQuest yang diasumsikan salah diperbaiki ke clone existing yang sudah tercatat; tidak ada download baru. Pemeriksaan akhir hanya validitas JSON, keanggotaan ID, batas line evidence dan keberadaan berkas hasil.

## Batas hasil pekerjaan

Tidak ada engine donor dijalankan, dependency dipasang, source produk diubah, build/test/benchmark dijalankan, atau runtime Windows diubah pada riset ini. Pin source dan pembacaan kode memberi bukti struktur/control flow, bukan hasil performa. Tidak ada plan Batch 5/6 dibuat. Invocate tetap ditunda. Dokumen ini harus direkonsiliasi dengan hasil integrasi Batch 3/4 sebelum dipakai memilih batch selanjutnya.

## Ringkasan kesinambungan

Riset source kandidat Agent Core pada 12 Oktober 2026 mencakup 216 ID: 8 reserved Batch 1–4 dan 208 entri lain. Setelah pendalaman lanjutan 65 entri, cakupan kumulatif adalah 175 body kode berpinned, 3 interface, 30 entri berbukti dokumentasi saja, dan 8 reserved. Body kode berarti potongan implementasi yang dibaca, bukan seluruh engine; SDK atau wrapper tidak membuktikan source backend tersedia. Tidak ada entri unallocated yang hanya mengandalkan bukti putaran lama tanpa tindak lanjut. Tetap ada 17 kelompok peluang dari 18 kandidat utama; #69 dan #92 menambah bukti pada kelompok existing, bukan instalasi baru. Riset membedakan 6 gap eksternal, 4 peluang eksternal bersyarat, 4 bukti/evaluasi, 2 producer/aplikasi opsional, dan 1 native-only. Tidak ada perubahan produk, eksekusi donor, instalasi, build/test/benchmark atau Windows. Batch 5–6 belum dibuat: wajib menunggu Batch 3–4 terintegrasi lalu mencocokkan ulang source donor/native dan kontrak aktual. Invocate tetap ditunda; storage canonical tetap runtime/memory.
