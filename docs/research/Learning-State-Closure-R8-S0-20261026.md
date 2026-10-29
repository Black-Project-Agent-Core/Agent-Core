# Penutupan episode Learning eksternal: hasil R8-S0 (2026-10-26)

Status: **R8-S0 selesai** (dry-run pada salinan state, ditambah peta konsumen dan peta frekuensi tulis yang dibaca dari source). Tidak ada perubahan source, tes produk, build, restart, maupun penulisan ke `runtime/learning`. Keputusan R8-S1 menunggu pengguna.

Sumber keputusan: [Evidence-Gated-Harness-Self-Improvement-Lab.md](../history-agent-core/Evidence-Gated-Harness-Self-Improvement-Lab.md) bagian 18 (Revisi 8). Persetujuan R8-S0 dicatat controller dari pesan chat pengguna 2026-10-26 ("you decide for me with your recommendation choice and i accepted your advices", jawaban atas pertanyaan keputusan berikutnya yang merekomendasikan R8-S0). Itu pembacaan controller, bukan atestasi pesan-pengguna dari host dan bukan grant eksekusi; cakupannya hanya R8-S0.

## 1. Kesimpulan

1. **Aturan A dan B sebagaimana ditulis (menutup episode dengan `closedAt`) tidak boleh dilanjutkan ke S1.** Ukuran dan integritas data tidak bermasalah (nol episode hilang, nol episode pending atau head aktif tertutup, semua arsip terbaca ulang identik). Masalahnya perilaku: `closedAt` bukan sekadar "tidak menerima mutasi". Tidak ada jalur buka-ulang, dan setiap penulisan yang terikat task ditolak atau dibuang (bagian 6). Pemalsu yang ditulis R8 sendiri ("ada konsumen yang bergantung pada episode terbuka tertentu", bagian 18.4) terpenuhi, sehingga hasilnya HOLD untuk penutupan seperti yang ditulis.
2. **Aturan B tidak layak.** Seluruh himpunan kandidatnya (`inferred`, paling banyak satu event, tidak pending, bukan head aktif, umur berapa pun) hanya 201 episode: 89.646 byte ringkas, atau 125.174 byte (1,44%) pada berkas berindentasi. Dengan N=1 pengurangannya 1,36% dan dengan N=7 0,78%. Titik awal N=7 tidak didukung data.
3. **Pengurangan ukuran terbesar tanpa perubahan semantik berasal dari serialisasi.** Berkas ditulis dengan indentasi dua spasi (`writeStateFile`). Isi yang sama ditulis ringkas menjadi 6.113.244 byte dari 8.721.300 (**−29,9%**), setara dengan aturan A (−29,8%). Pada mikrobenchmark I/O lokal (sebanding dengan byte), biaya satu mutasi turun sekitar 26% sampai 30%; efek latensi yang terlihat pemakai tidak diukur.
4. **Beban sebenarnya bukan jumlah episode tertutup.** Event menyusun 91,5% byte episode (18.189 event, 5.574.695 byte ringkas), 3.085.847 byte di antaranya ada pada 204 episode `pendingLearning` yang tidak disentuh aturan apa pun. `MAX_EVENTS = 160` dideklarasikan tetapi tidak pernah diterapkan. Setiap penyelesaian tool terikat task menulis ulang seluruh berkas (bagian 7).
5. **Rekomendasi:** REVISE R8. Setujui R8-S1a (serialisasi ringkas lewat parameter opsional pada `writeStateFile`, jadi menyentuh `src/persistence/state-file.ts` di samping `external-controller.ts`) bila pengguna ingin mengurangi biaya tulis; tahan penutupan A/B; R8-S1b (arsip tanpa menutup, dengan pemangkasan head) hanya sebagai langkah lanjutan setelah S1a, karena butuh sinyal aktivitas sesi yang belum ada (bagian 9).

## 2. Metode

- **Salinan:** `runtime/learning/external-controller.json` disalin ke area scratch sesi dan hash-nya dicocokkan sebelum, sesudah dan pada salinan: SHA-256 `12E479C1988B784ABAC04A8CFB985CDEC3AEEDDBDFCFB072E47B693119A36170`, 8.721.300 byte, 603 episode, waktu berkas 2026-10-26 04:38:32Z (itu juga waktu rujukan "sekarang" untuk umur). Salinan stabil (tiga hash sama). Berkas live terus berubah karena resident menulis, jadi semua angka merujuk pada salinan ini.
- **Alat:** [dry-run-closure.mjs](learning-state-closure-r8s0/dry-run-closure.mjs) (SHA-256 `FBA4C4F300C6A18B79D2385201C20F7E6BFC918939A648C3C9EEFC5D42E216FD`). Menolak `--state` di dalam `runtime/learning` dan `--out` di dalam `runtime`. Mengimplementasikan ulang langkah arsip `save()` (`src/learning/external-controller.ts`, "private async save") dan format `writeStateFile` (`JSON.stringify(value, null, 2) + '\n'`). Itu implementasi ulang, bukan pemanggilan `save()` asli: mengimpor modul `dist` menarik `activityTracker` dan layanan lain dengan efek samping di luar scratch.
- **Fidelitas:** serialisasi ulang state yang di-parse menghasilkan berkas asli byte demi byte (`reserializeIdentical: true`), jadi hitungan byte sebelum dan sesudah memakai format yang sama persis dengan yang ditulis `save()`.
- **Pembanding independen:** satu agen lain menghitung ulang baseline dengan skripnya sendiri, tanpa diberi angka yang diharapkan. Semua angka kelompok, head, arsip, berkas `.tmp` dan total cocok dengan skrip ini.
- **Pembaca kode:** dua agen baca-saja memetakan semua konsumen `closedAt` dan keanggotaan `state.episodes`, serta frekuensi pemanggil `mutate()`/`save()`/`recentEpisodes()`. Baris-baris yang paling menentukan (394, 434, 470, 606-607, 704-706, 1015, 1019, 1026) saya baca sendiri di source. Peta 52 entri dan peta 22 titik `mutate()` disimpan apa adanya di [consumer-map-20261026.json](learning-state-closure-r8s0/consumer-map-20261026.json) dan [write-frequency-map-20261026.json](learning-state-closure-r8s0/write-frequency-map-20261026.json); entri-entrinya tidak diaudit satu per satu.
- **Pemeriksaan adversarial:** tiga agen lain memeriksa versi pertama laporan ini (angka, kutipan source, serangan terhadap rekomendasi). Temuan material dikoreksi di versi ini.
- **Hasil mentah:** empat berkas JSON agregat (tanpa isi episode) di [learning-state-closure-r8s0](learning-state-closure-r8s0/): `dry-run-primary-A-B7-20261026.json` (spesifikasi R8), `…-A-nak-…`, `…-archive-idle7-nohead-…`, `…-archive-idle7-prune-…`. Masing-masing memuat tabel skenario penuh; yang membedakan hanya skenario primer yang ditulis ke artefak dan diverifikasi. Salinan state sendiri tidak disimpan di repo.

## 3. Baseline dan pencocokan dengan bagian 18.1

| Kelompok (byte = JSON ringkas per episode, seperti 18.1) | 18.1 (599 episode; berkas 8.696.065 B) | Salinan ini (603 episode; berkas 8.721.300 B) |
| --- | --- | --- |
| Punya `learningDecision`, tidak pending, belum tertutup | 160; 1.935.973 B | **163**; 1.954.812 B (161 eksplisit; 66 lebih dari 7 hari) |
| Tanpa keputusan, tidak pending | 235; 845.071 B | **236**; 845.520 B (233 `inferred`; 203 paling banyak satu event; 141 lebih dari 7 hari) |
| `pendingLearning` | 204; 3.294.865 B | **204**; 3.293.657 B (196 bermakna; 167 lebih dari 7 hari; 118 lebih dari 14 hari) |
| `sessionHeads` (dihitung per sesi) | 188 (16 aktif 24 jam) | 191 sesi menunjuk 164 episode; 15 sesi menunjuk 14 episode yang berubah dalam 24 jam; **29 sesi menunjuk 25 episode yang hanya ada di arsip** |

Selisih berkas +25.235 byte (+18.080 byte ringkas: kelompok pertama +18.839, kedua +449, pending −1.208 pada jumlah yang sama; tidak dibandingkan per episode). Sub-hitungan ikut bergeser: eksplisit 158 → 161, `inferred` 232 → 233, paling banyak satu event 202 → 203, lebih dari 7 hari 135 → 141 (kelompok kedua) dan 165 → 167 (pending). Jumlah pending sama (204), jadi S0 cocok dengan 18.1 dalam struktur tetapi bukan hitungan identik; selisihnya dibaca sebagai drift state live sejak pengukuran 18.1, bukan sebagai kesalahan hitung (pembaca independen menghasilkan angka yang sama dengan skrip ini). Nilai lain: 0 episode dengan `closedAt`, 3 dengan `terminalOutcome` (semuanya pending), 17 episode memiliki `learningDecision` sekaligus `pendingLearning` (dihitung di kelompok pending), arsip live berisi 50 berkas episode (49 dengan `closedAt` dan `terminalOutcome`, 1 tanpa), tujuh berkas `.tmp-*` yatim 20.528.749 byte. Nilai `learningDecision` pada kelompok pertama: `no-new-knowledge` 113, `awaiting-verification` 48, `captured` 2.

## 4. Hasil skenario

Pengurangan dihitung dari 8.721.300 byte. "Dipindah" = episode yang keluar dari state ke arsip. Kolom head = dipindah episode yang saat ini menjadi head sesi mana pun.

| Skenario | Mode | Dipindah | Pengurangan state | Arsip bertambah (KiB) | Head sesi | `awaiting-verification` |
| --- | --- | --- | --- | --- | --- | --- |
| A (spesifikasi R8) | tutup | 152 | −29,83% | 2.294 KB | 78 | 42 |
| A, pengaman "head apa pun" | tutup | 74 | −10,49% | 808 KB | 0 | 21 |
| A-nak (tanpa `awaiting-verification`) | tutup | 110 | −20,15% | 1.548 KB | 57 | 0 |
| A-nak, idle ≥ 3 hari | tutup | 66 | −13,68% | 1.050 KB | 45 | 0 |
| A-nak, idle ≥ 7 hari | tutup | 45 | −10,40% | 798 KB | 33 | 0 |
| A-nak, pengaman "head apa pun" | tutup | 53 | −7,61% | 586 KB | 0 | 0 |
| B, N = 1 / 3 / 7 / 14 / 30 | tutup | 191 / 154 / 107 / 12 / 0 | −1,36 / −1,11 / −0,78 / −0,09 / 0% | 108 / 87 / 61 / 7 / 0 KB | 2 / 1 / 0 / 0 / 0 | 0 |
| A+B7 (spesifikasi penuh) | tutup | 259 | −30,61% | 2.356 KB | 78 | 42 |
| Arsip tanpa menutup, idle ≥ 1 hari, bukan head | arsip | 60 | −9,37% | 719 KB | 0 | 14 |
| Arsip tanpa menutup, idle ≥ 7 hari, bukan head | arsip | 21 | −3,12% | 239 KB | 0 | 9 |
| Arsip tanpa menutup, idle ≥ 3 hari, head dipangkas | arsip + pangkas | 91 | −17,98% | 1.371 KB | 59 | 25 |
| Arsip tanpa menutup, idle ≥ 7 hari, head dipangkas | arsip + pangkas | 66 | −14,19% | 1.082 KB | 45 | 21 |
| Arsip tanpa menutup, idle ≥ 14 hari, head dipangkas | arsip + pangkas | 19 | −3,42% | 258 KB | 14 | 4 |
| Serialisasi ringkas saja | kompak | 0 | **−29,90%** (6.113.244 B) | 0 | n/a | n/a |

Catatan:
- **"Dipindah" sama dengan "ditutup" pada semua skenario tutup**, karena `MAX_EPISODES = 128` tidak pernah menjadi pembatas (603 episode, 204 di antaranya pending): `save()` mengarsipkan setiap episode tertutup tidak-pending pada penyimpanan yang sama. Keadaan "tertutup tetapi masih di state" bersifat sesaat.
- Total byte di disk hampir tidak berubah pada skenario yang memindahkan episode (A+B7: state turun 2.669.174 byte, arsip naik 2.412.309 byte, bersih −256.865 byte; kolom arsip di tabel dalam KiB). Arsip live juga menyimpan satu `.last-good` per entri (50 entri, 50 `.last-good`), sehingga pemakaian disk arsip sebenarnya dua kali lipat. Manfaat ada pada berkas yang ditulis ulang setiap mutasi, bukan pada ruang disk.
- Urutan array `episodes` tidak sama dengan urutan `startedAt` (satu penurunan di indeks 350). `save()` mengambil episode tertutup pertama menurut urutan array; itu tidak berpengaruh di sini karena semua yang memenuhi syarat terarsip.
- **Aturan A tanpa pengaman "head apa pun" meninggalkan head sesi yang menunjuk episode di arsip:** 118 sesi menggantung setelah A (89 baru ditambah 29 yang sudah menggantung sekarang). Dengan pengaman "head apa pun", pengurangan jatuh ke 10,49% (A) atau 7,61% (A-nak, di bawah batas 10% pemalsu R8).

## 5. Pemeriksaan acceptance S0

Berlaku untuk keempat skenario primer (spesifikasi A+B7, A-nak, arsip idle 7 hari tanpa head, arsip idle 7 hari dengan pemangkasan head):

| Pemeriksaan | Hasil |
| --- | --- |
| Episode hilang dari gabungan state dan arsip | **0** pada keempatnya |
| Id yang ada di state dan arsip sekaligus | 0 (nol) |
| Episode `pendingLearning` yang dipindah | 0 dari 204 (204/204 tetap di state) |
| Episode head aktif 24 jam yang dipindah | 0 (14/14 tetap di state) |
| Berkas arsip terbaca ulang, nama = sha256(id), isi identik dengan episode yang diharapkan | 259/259, 110/110, 21/21, 66/66 |
| Episode terikat Memory (`memoryBinding`) yang memenuhi prasyarat `resolveMemoryTask` | 134/134, 95/95, 14/14, 48/48 |
| Jumlah enam metrik state + arsip = sebelum (`toolCalls` 18.071, `toolFailures` 151, `repeatedFailures` 2, `memoryRecalls` 311, `artifactUses` 0, `verifications` 0) | sama pada keempatnya |
| Tabrakan dengan berkas arsip live | 1 pada A+B7 dan arsip-pangkas-7: id `ext-031299db…` sudah ada di state **dan** di arsip live (isi sama, tidak pending, head sesi, keputusan `awaiting-verification`); `save()` akan menimpanya dan menyimpan `.last-good`. Nol pada A-nak. |

Pemalsu R8: reduksi < 10% tidak terjadi pada A (29,8%) dan A+B7 (30,6%), tetapi terjadi pada arsip tanpa menutup idle ≥ 7 hari bukan-head (−3,12%; JSON menandainya `reductionBelow10pct`) dan A-nak dengan pengaman "head apa pun" (−7,61%); arsip tidak terbaca ulang: tidak; episode hilang: tidak; **konsumen bergantung pada episode terbuka: ya (bagian 6)**.

## 6. Konsumen yang bergantung pada episode terbuka

Peta lengkap (52 entri, dengan baris) ada pada hasil agen; yang menentukan, dengan baris source saat pemeriksaan (file `src/learning/external-controller.ts` kecuali dinyatakan lain). Yang saya baca sendiri ditandai ✓.

| Konsumen | Bila episode `closedAt` (tetap di state) | Bila sudah di arsip |
| --- | --- | --- |
| `startEpisode`, taskKey sama (704-706 ✓) | Menemukan episode tertutup tanpa pemeriksaan `closedAt`, memasang head ke sana, mengembalikannya dengan `closedAt` terisi. Tidak ada episode baru, tidak ada buka-ulang. | `recentEpisodes` memberi episode sebagai `prior`, didorong kembali ke state (705), lalu `save()` di mutasi yang sama mengarsipkannya lagi (606-607 ✓). Head menggantung. Memanggil `start` lagi mengulang hal yang sama; hanya taskKey baru yang menghasilkan episode kerja. |
| `invocationTaskCurrent` (465-470 ✓) | `false`. Gerbang untuk learning checkpoint/review/receipt, `controller_learning` improvement, `procedure` (hanya jalur propose bermuatan terstruktur), `reconstruction_harness` dan `artifact_inspect`. Gerbang `closedAt` lain: `procedure` list/inspect (1870), `artifact_receipt` (1701, 1744, 1838), konteks terencana (1300, 1331), recall v2 (875), checkpoint (900), `workflowNext` (1196) dan `src/mcp/external-reconstruction-harness-tools.ts:53`. | `verificationTarget` melempar, hasil `false` yang sama. |
| `invocationEpisode` (422-436 ✓) | `late-closed`: pencatat hasil tool, recall, capability use, notice, failure context menjadi no-op. | `late-unavailable` / `unbound`. |
| `captureToolInvocationContext` (367-410 ✓) | Reconnect lewat taskScope menolak target tertutup (394 ✓). | Head ada tetapi episode tidak: `unbound('no-task')`; cabang reconnect dilewati karena syaratnya `!sessionHeads[sessionId]` (382 ✓). |
| `verifyEpisode` (1000-1026 ✓) | No-op diam-diam bila sudah tertutup (1015, 1019): tidak ada `terminalOutcome`, tidak ada verifikasi, tidak ada error. | Konteks tak terikat, melempar. |
| Admission Memory v2 (`src/memory/mcp/scope.ts` 62-70, dipasang di `src/memory/mcp/experience-tools.ts` 63-67 dan `src/mcp/server.ts` 396-400) | `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE` hanya untuk `memory_v2_read` recall dan aksi `claim_review`, `recall_repair`, `derivation`. Aksi lain (`task_start`, `event_append`, `checkpoint`, `task_context`, dst.) memakai `resolveMemoryTask` yang tidak memeriksa `closedAt` dan tetap bekerja. | Sama untuk aksi yang sama, walau `resolveMemoryTask` berhasil dari arsip. |
| `skillProposalNotices`, `takeCapabilityUsageNotice` | Notice dan SKILL PROPOSAL REMINDER yang wajib disampaikan `AGENTS.md` tidak dikeluarkan. | Sama. |
| `episodeActivity` / pelepasan checkpoint yatim (`src/mcp/learning-tools.ts` 121-129) | `closed: true` memenuhi syarat pelepasan. | `exists: false`: checkpoint yatim tidak pernah dapat dilepas. |
| `status().featureOutcomeEvidence`, `curate()` (1993-2031) | Termasuk. | Episode dan event outcome-nya hilang dari ringkasan; proposal curator bisa lenyap. `evaluate()` tetap melihatnya lewat `recentEpisodes`. |

Yang **tidak** terpengaruh: `resolveMemoryTask` (membaca arsip), aksi Memory v2 selain recall/`claim_review`/`recall_repair`/`derivation`, `evaluate()`, fungsi murni di `external-evaluation.ts` (tidak membaca `closedAt`; aturan A/B tidak mengisi `terminalOutcome`), tampilan jumlah di `/health`, launcher dan UI, prosedur (state `procedures[]` kosong).

Dampak praktis aturan A: episode yang review-nya sudah selesai tetapi tugasnya berlanjut, atau controller yang memakai ulang taskKey antar chat atau hari, kehilangan tulisan terikat task milik Learning serta recall dan klaim Memory v2 (tabel di atas). Kerugian terjadi setelah jeda lebih dari 24 jam tanpa memanggil `episode start`, karena aturan A sudah mengecualikan head yang aktif dalam 24 jam. 86 episode eksplisit yang diperbarui dalam 7 hari terakhir masuk himpunan A. Ada preseden nyata: pada 2026-10-18 episode `ext-031299db…` ditutup keliru oleh `episode verify` (`taskId` tidak diteruskan) dan satu-satunya pemulihannya adalah menambal berkas arsipnya dengan tangan (`closedAt` dan `terminalOutcome` dihapus; catatan di `runtime/build/open-browser-use-20261018/learning-attribution-incident.json` dan `repair-learning-attribution.mjs`). Tidak ada jalur buka-ulang yang sah. Perilaku ini sudah berlaku untuk episode yang ditutup lewat `terminalOutcome` (49 berkas arsip), tetapi di sana penutupan menandai tugas selesai dan terverifikasi; aturan A memperluasnya ke episode yang hanya sudah direview. Pengujian yang ada menutup episode lewat `terminalOutcome` (`tests/cumulative-workflow.test.ts:118`, `tests/memory/memory-task-reconnect.test.ts:411`, `tests/batch16-exact-task-verification.test.ts:79`) atau menyuntikkan `closedAt` langsung ke berkas state (`tests/learning-external-scope.test.ts:89`, `tests/external-reconstruction-harness.test.ts:244`; baris 272 menguji status `late-closed` yang dimock), dan menguji `startEpisode` pada arsip hanya untuk episode tidak tertutup dengan kurang dari 128 episode (`tests/memory/memory-task-binding.test.ts:86,105`). Tidak ada tes yang menutup lewat jalur review sungguhan tanpa `terminalOutcome`, atau yang memulai ulang taskKey tertutup atau terarsip.

## 7. Frekuensi tulis dan biaya

- **Setiap mutasi menulis ulang seluruh berkas.** Per `mutate()`+`save()` dengan S = 8.721.300 byte: baca S (load), baca S lagi (generasi sebelumnya), baca S (readback) = 3S; tulis generasi sebelumnya ke `.last-good` dan generasi baru = 2S; dua fsync, dua rename. Total ±5S (±43,6 MB).
- **Tool call biasa memicu penyimpanan.** Untuk konteks terikat, `recordToolOutcome` mengubah `updatedAt`, metrik dan event, sehingga setiap penyelesaian tool dari ±29 tool dasar (serta skills, harness, phone, code, web) menyimpan seluruh berkas. Tidak dipanggil pada keberhasilan `memory_*`, `learning`, `controller_learning`. Pengamat lain (`takeCapabilityUsageNotice`, recall) dibatasi `observerBefore` dan menyimpan hanya bila ada perubahan. Penyimpanan tanpa pembatas: `startEpisode`, checkpoint, review, label, verify, dan jalur pengiriman skill di 839 (setiap `skills list/inspect/search/read`, termasuk halaman `nextOffset`). `load()` tidak di-cache: setiap panggilan membaca dan mem-parse seluruh berkas (±3 `load()` per tool call terikat, 6-7 untuk tool skills/phone/code/harness). Daftar tool, jumlah `load()` dan pengecualian di atas dibaca agen dan tidak saya verifikasi ulang; pemanggil `recordToolOutcome` yang saya cek: `src/mcp/server.ts` 170 dan 236, `src/mcp/external-controller-tool-support.ts` 104 dan 160, `src/mcp/web-research-tools.ts` 83, `external-controller.ts` 486.
- **Volume:** 16.802 event tool (16.565) atau kegagalan (237) tercatat 2026-10-01 sampai 2026-10-26 (puncak 3.013 pada 2026-10-07); jumlah `metrics.toolCalls` seluruh episode 18.071. Itu perkiraan jumlah penyimpanan, bukan hitungan pasti. Total byte tulis kumulatif tidak diukur.
- **Mikrobenchmark lokal** (Node, disk C: pada scratch sesi, cache hangat, median 9 putaran, urutan before, after, before-compact, after-compact; satu mutasi = parse generasi sebelumnya + serialize + tulis `.last-good` + tulis generasi baru dengan fsync dan rename + baca ulang):

| Varian | Byte | Biaya per mutasi | Terhadap "sebelum" pada run yang sama |
| --- | --- | --- | --- |
| Sebelum (berindentasi) | 8.721.300 | 494-500 ms (parse 49-51; stringify 60-63; tulis 384-386) | 0 |
| Ringkas saja | 6.113.244 | 357-371 ms | −26% sampai −28% |
| A+B7 (berindentasi) | 6.052.126 | 365 ms | −27% |
| A+B7 + ringkas | 4.191.355 | 268 ms | −46% |
| A-nak (berindentasi) | 6.963.952 | 413 ms | −17% |
| A-nak + ringkas | 4.852.210 | 306 ms | −38% |
| Arsip idle ≥ 7 hari + pangkas (berindentasi) | 7.483.683 | 428 ms | −14% |
| Arsip idle ≥ 7 hari + pangkas + ringkas | 5.227.052 | 299 ms | −40% |

  Batasan: ini mikrobenchmark I/O yang sebanding dengan byte, bukan latensi permintaan Agent Core. Ia tidak memuat dua pass `normalizeEpisode` (load dan save), dua `JSON.stringify` pengamat di `mutate()` (baris 632 dan 636) dan satu `JSON.parse` tambahan di `writeStateFile` (baris 9); disk E: (lokasi `runtime/learning`) tidak diukur; varian dijalankan dalam blok tetap, bukan bergantian, dan tanpa sebaran. Pemeriksa independen yang memanggil `writeStateFile` nyata dari `dist` 11 kali pada salinan di C: mendapat median 512 ms (min 444, maks 559) ditambah `load` 47 ms, dekat dengan 494-500 ms di atas; pemeriksa lain mengulang dengan urutan bergantian dan jalur async nyata dan mendapat −28,7% dan −30,0% untuk serialisasi ringkas. Hanya pasangan dalam satu run yang dibandingkan.
- **Anggaran pengamat 250 ms** (`observeInvocation`) lebih kecil dari biaya satu penyimpanan pada pengukuran di atas. Bahwa pengamat benar-benar kedaluwarsa di produksi adalah inferensi; berkas tidak menunjukkan event yang terbuang. Sebelum maupun sesudah serialisasi ringkas, biaya satu penyimpanan tetap di atas 250 ms pada pengukuran ini, sehingga latensi yang terlihat pemakai kemungkinan tidak berubah (inferensi).
- **`recentEpisodes` bukan jalur panas** (dipanggil oleh `startEpisode` dengan taskKey, `episode status`, `evaluate`) dan membaca seluruh direktori arsip tiap panggilan: 259 berkas membutuhkan 67 ms dan 110 berkas 18 ms pada pembacaan hangat di JSON hasil (pemeriksa mendapat 69 dan 29 ms; sekitar 0,25 ms per berkas), ditambah 50 berkas yang sudah ada (sekitar 13 ms). Satu berkas arsip yang rusak menggagalkan seluruh panggilan (baris 1224). Biaya baca dingin tidak diukur.

## 8. Temuan sampingan (di luar cakupan S0, tidak ditindaklanjuti)

1. 29 dari 191 `sessionHeads` sudah menunjuk episode yang hanya ada di arsip; head menggantung memblokir reattach lewat taskScope (382) dan membuat `getOrCreateEpisode` (649-656) membuat episode `inferred` baru dan memindahkan head.
2. `MAX_EVENTS = 160` dideklarasikan (baris 36) tetapi tidak diterapkan; event adalah sumber pertumbuhan utama dan 55% byte event ada pada 204 episode pending. Namun menerapkan batas 160 hanya menghemat sekitar 106 KB (1,74% state ringkas): hanya 12 episode melebihi 160 event (maksimum 216). Batas 80 menghemat sekitar 20,7% dan 40 sekitar 41%, tetapi menghapus event yang dirujuk evidence ref (`source:external-episode:<id>#<eventId>`, baris 519); itu membutuhkan desain retensi event, bukan sekadar menerapkan konstanta (angka ini dari pemeriksa, tidak saya reproduksi).
3. Satu episode (`ext-031299db…`) ada di state dan di arsip sekaligus tanpa `closedAt`. Catatan insiden 2026-10-18 (`runtime/build/open-browser-use-20261018/learning-attribution-incident.json`) menjelaskan asalnya: `episode verify` dengan `taskId` yang tidak diteruskan menutup episode itu secara keliru, lalu berkas arsipnya ditambal dengan tangan. Duplikasi state-plus-arsip sesudahnya konsisten dengan rehidrasi `startEpisode` (tidak direproduksi).
4. Tujuh berkas `.tmp-*` yatim (20.528.749 byte, 9 sampai 21 Oktober) menunjukkan penulisan yang terputus; penyebab tidak ditentukan. Pembersihannya adalah R8-S2 dan butuh izin terpisah.
5. Tidak ada tes untuk `startEpisode` pada taskKey tertutup atau terarsip dengan lebih dari 128 episode.
6. Kode sudah memperlakukan 7 hari tanpa aktivitas sebagai ditinggalkan (`PENDING_REVIEW_STALE_MS`, `src/learning/triggers.ts:26`, dipakai di `src/mcp/learning-tools.ts:129`); itu preseden bagi pilihan N pada R8-S1b. `recoverHistory` tidak dapat membaca snapshot korup di atas 2 MiB (`readEvidenceSnapshot`, `src/verification/evidence-snapshot.ts`), dengan atau tanpa S1a.

## 9. Rekomendasi dan opsi keputusan

Hipotesis R8 ("bila episode yang siklus Learning-nya selesai dapat ditutup tanpa verifikasi tugas, arsip existing mengambil alih tanpa mekanisme baru") **benar secara mekanis dan salah secara perilaku**: arsip berfungsi dan data utuh, tetapi penutupan tanpa `terminalOutcome` mencabut kemampuan tugas yang masih mungkin berlanjut.

| Opsi | Isi | Bukti | Perilaku berubah? |
| --- | --- | --- | --- |
| **R8-S1a (disarankan)** | Tulis state `external-controller.json` tanpa indentasi lewat parameter ketiga opsional pada `writeStateFile` (`src/persistence/state-file.ts`; bawaan tetap indentasi 2; fungsi yang sama), dipasang hanya pada pemanggilan di `external-controller.ts:619`. Menyentuh dua berkas source. | −29,9% byte; sekitar −26% sampai −30% pada mikrobenchmark I/O (efek latensi yang terlihat pemakai tidak diukur) | Tidak pada semantik. Pemeriksa tidak menemukan pembaca (src, tes, skrip, UI, launcher) yang bergantung pada indentasi; keterbacaan manusia berkas berkurang. State Native (`agent-runtime.ts:509,513,795`) dan `state.json` Learning (`state.ts:273`) memakai `writeStateFile` yang sama dan harus tetap byte-identik (laporan di `agent-runtime.ts:795` diikat digest). |
| R8-S1b (lanjutan, bersyarat) | Arsip episode ber-keputusan tanpa `closedAt`, idle ≥ N hari, dengan pemangkasan head yang menunjuknya. | idle ≥ 7 hari: 66 episode, −14,2%; idle ≥ 3 hari: 91, −18,0%; tanpa memangkas head: ≤ −9,4% | Ya, lebih ringan dari penutupan: butuh sinyal aktivitas sesi (`sessionHeads` tanpa cap waktu), `startEpisode` pada episode ter-rehidrasi harus memperbarui `updatedAt` atau dikecualikan agar tidak diarsipkan kembali pada penyimpanan yang sama, dan reattach lewat taskScope tidak membaca arsip (393). |
| Penulisan `.last-good` lebih murah (belum dinilai) | Ganti penulisan atomik penuh `.last-good` (`state-file.ts:13`) dengan `copyFile` atau hardlink+rename | Pemeriksa: −33,7% (copyFile) dan −35,1% (hardlink) terhadap jalur sekarang, ±−52% bila digabung dengan ringkas (tidak saya reproduksi) | Ya, pada kontrak ketahanan: salinan tidak di-fsync dan hardlink berbagi inode dengan penyunting di tempat. Butuh keputusan sendiri; tidak disarankan sekarang. |
| A + buka-ulang di `startEpisode` untuk `closedAt` tanpa `terminalOutcome` | Penutupan A disertai jalur buka-ulang | Penanda bersih: semua situs penutupan lama mensyaratkan `terminalOutcome` (928, 961, 1023, 1026), jadi `closedAt` tanpa `terminalOutcome` menandai penutupan aturan A | Tidak menutup reconnect taskScope (394) dan sekitar 16 situs `closedAt` lain untuk sesi yang lanjut tanpa `start`; manfaat A-nak idle ≥ 7 hari hanya −10,4%. Ditolak karena manfaat. |
| Penutupan A atau A+B seperti ditulis | Atur `closedAt` pada episode ber-keputusan | −29,8% / −30,6% | **Ya, besar (bagian 6). HOLD.** |
| Aturan B saja | | ≤ −1,36% | Ringan, nilai terlalu kecil. REJECT disarankan. |
| Backlog terpisah | Desain retensi event (menerapkan batas 160 hanya menghemat ±1,7%); tinjau 204 episode pending; pangkas head menggantung | Event 91,5% byte episode | Perlu keputusan sendiri. |

Rekomendasi: **APPROVE R8-S1a** pada Revisi 9 dokumen proposal (bagian 18.9), dengan scope: parameter opsional bawaan-mati pada `writeStateFile` (fungsi dan jalur panggil yang sama, karena `tests/batch16-exact-task-verification.test.ts` memata-matai `stateFiles.writeStateFile` pada baris 120, 134, 144, 169, 208, 221, 256 dan 266) dan satu pemanggilan di `external-controller.ts:619`; tes yang gagal lebih dulu (format ringkas, bawaan tetap berindentasi, penolakan baca terdegradasi); menjalankan ulang sembilan berkas tes yang membaca berkas state (`cumulative-workflow`, `batch16-exact-task-verification`, `external-bootstrap-capsule`, `external-learning-promotion-api`, `learning-external-scope`, `learning-task-selector-http`, `memory/memory-task-reconnect`, `memory/memory-task-binding`, `skill-discovery-observation`) dan suite controller eksternal; build dan path policy; entri `docs/CODEBASE.md` dan changeset (format berkas persisten berubah); cadangan state dan hash sebelum aktivasi; satu restart resmi sesudahnya. **HOLD** penutupan A/B; R8-S1b dan R8-S2 tidak otomatis disetujui. Pilihan sah lainnya adalah tidak berbuat apa-apa: satu penyimpanan tetap sekitar 0,5 detik pada pengukuran lokal.

## 10. Batas bukti

- Semua angka byte dan hitungan adalah observasi dari satu salinan; state live terus tumbuh.
- Fidelitas arsip diuji terhadap implementasi ulang `save()`, bukan `save()` asli; jalur `startEpisode` dan konsumen dibaca dari source, tidak dijalankan.
- Peta konsumen berasal dari pembacaan kode oleh agen dan pemeriksaan sampel oleh controller; bukan hasil tes. Dampak pada klien nyata (berapa sering sesi memakai ulang `mcp-session-id` lebih dari 24 jam) tidak diketahui.
- Waktu adalah mikrobenchmark lokal pada disk C:, bukan pengukuran produksi. Manfaat nyata bagi pengguna belum terbukti.
- Tes penuh tidak dijalankan; tidak ada build atau restart.
- Pemeriksaan adversarial atas versi pertama laporan: angka dihitung ulang independen (cocok, kecuali yang dikoreksi di versi ini), kutipan source dibaca ulang (tidak ada nomor baris yang bergeser; satu angka salah dan beberapa pernyataan terlalu luas dikoreksi), rekomendasi diserang (inti bertahan; scope S1a diperluas ke `state-file.ts`, CODEBASE dan changeset). Peta konsumen penuh dan peta frekuensi tidak diaudit entri demi entri.
