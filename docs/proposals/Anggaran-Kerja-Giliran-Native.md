# Anggaran kerja per giliran Native
Tanggal: 2026-11-03 (Asia/Tomsk)
Revisi: 1
Status: PROPOSED
Jenis: Improvement
Asal dan bukti: R1 `openclaw/openclaw` 2026.10.6 (`F:\Workflow\openclaw`, commit `b5ae1a43638`), R2 lingkungan OpenClaw milik pengguna (`F:\Workflow\openclaw-env`), source Agent Core dan [diagnosis latensi](../verification/Native-Interactive-Latency-Diagnosis.md); rincian cakupan dan cara belajar ada di awal bagian Bukti dan ketidakpastian.

## Masalah dan tujuan

Sesudah tahap 1 `Respons Interaktif Native`, chat Native masih terasa jauh lebih lambat daripada OpenClaw di mesin pengguna. Diagnosis 2026-11-01 mencatat waktu tool sekitar 0,2 detik per panggilan, sedangkan satu langkah tool rata-rata 7,5 detik; tahap 1 menyerahkan pengurangan jumlah penulisan state ke scope tersendiri. Tujuan: mengurangi kerja per giliran (mutasi state penuh, recall yang menunggu tanpa batas) dengan durabilitas, semantik batal, Memory-first dan kontrak finalisasi tetap benar, dibuktikan dengan hitungan deterministik, bukan benchmark waktu.

## Bukti dan ketidakpastian

Cakupan dan cara belajar:

- R1 `F:\Workflow\openclaw`: repo `openclaw/openclaw`, commit `b5ae1a43638`, paket 2026.10.6, MIT; kredibilitas kuat. Cakupan perkiraan: dibaca penuh 9 / dilihat sekilas 71 / tidak dibuka 58.560 dari 58.640 berkas terlacak. Urutan baca: AGENTS.md dan skill performa, jalur giliran, Active Memory, persistensi, tes work-count. Blok cakupan Codex D1 hilang karena galat penyedia, jadi angka ini dihitung dari kutipan yang saya cocokkan sendiri.
- R2 `F:\Workflow\openclaw-env`: lingkungan terisolasi yang dijalankan pengguna; bukti lokal kuat, generalisasi lemah. Dibaca: kunci dan syarat `openclaw.json`, kunci, tahap dan hitungan `cache-trace.jsonl`, skrip, agregat log. Nilai kredensial dan isi percakapan tidak dibuka.
- Agent Core: `src/agent-controller.ts`, `agent-runtime.ts`, `agent-chat-service.ts`, `persistence/state-file.ts`, `memory/*`; tes `agent-controller`, `dtc1-durable-turn-continuation`, `agent-runtime-normalize-cache`.
- Cara belajar: Codex menjadi rekan setara di dua workspace scratch dengan aturan tertulis dan menyerahkan sepuluh berkas bukti ber-`path:baris`; saya membaca sendiri dan membuka ulang 18 kutipan kunci (semua cocok, satu selisih baris). Hitungan mutasi diperiksa dua pihak terpisah dan cocok. Codex mengoreksi tiga kerangka saya (cache normalisasi sudah ada; jaringan recall tidak selalu terjadi; mutasi pra-inferensi lebih dari empat) dan membantah dugaan saya bahwa Active Memory tidak aktif di R2.

Observed, Agent Core (source saat ini):

1. Tiap `mutate` (`agent-runtime.ts:567-586`) memuat, mem-parse dan menormalisasi seluruh state, menjalankan operasi, lalu menyimpan; `writeStateFile` (`state-file.ts:5-18`) membaca versi lama, menulis `.last-good`, menulis state dan membaca ulang. Struktur: 3 pembacaan penuh dan 2 penulisan atomik penuh per mutasi; `state.json` 5.354.045 B (2026-11-03 20:12). Cache normalisasi task (`agent-runtime.ts:196-215`) menghemat komputasi, bukan I/O ini.
2. Sebelum panggilan provider pertama (giliran segar, Memory diizinkan, tanpa kompaksi): 5 mutasi (`agent-controller.ts:912,950,957,958,1041`), 6 bila `delegatedTools` (:1188). Per tool sukses: 2 sebelum dispatch (:2006-2007) dan 2 sesudahnya (:2052 di `finally`, :2099), ditambah 0 atau 1 capability-use (:2105); direct Memory tool +2; jalur error berbeda (+3). Checkpoint DTC terpisah (:1997, :2001, :2146, :2149) menyalin pesan dengan `structuredClone` (:1283). Event `memory.recall.completed` terbit di antara mutasi pertama dan kedua recall (:951-954).
3. Recall pra-inferensi `assembleMemoryContext` (`agent-runtime.ts:748-792`) menunggu fusion, kadang ditambah bm25, tanpa deadline atau signal. `MemoryService.search` memasuki embedding kueri untuk profil apa pun bila embedder dan indeks siap (`service.ts:1477-1485`), jadi `bm25` bukan jalur tanpa jaringan. Embedder: 3 percobaan × 30 detik dengan backoff 8 detik (`embedder.ts:100-105`), batas per permintaan, bukan deadline recall. Cache vektor kueri ada (128 entri, TTL 60 detik).
4. Sesudah teks model terakhir ada sekitar 24 langkah yang ditunggu. `assistant.final` dari controller sengaja ditahan sampai jawaban tersimpan (`agent-chat-service.ts:763`, :768-791), dan `finalizeTask` dapat mengembalikan giliran ke model atau mengubah jawaban bila Learning gagal (`agent-controller.ts:1850-1862`).
5. Aritmetik diagnosis dihitung ulang: 79 langkah tool rata-rata 7,53 detik, `toolMs` 0,196 detik, sisa 7,33 detik per langkah; empat mutasi × 1,62-1,79 detik (pengukuran tahap 1, bukan pengukuran baru) = 6,5-7,2 detik, 88-98% sisa. Konsisten, bukan bukti sebab: checkpoint DTC tidak terukur dan state tumbuh dari 4,42 ke 5,35 MB.

Observed, OpenClaw:

6. Doktrin (`AGENTS.md:64,67,69`; `.agents/skills/openclaw-performance/SKILL.md`): state di SQLite, bukan JSON baru; validasi sekali di batas kepercayaan, tanpa membaca ulang tulisan sendiri; urutan hapus, sekali di owner, bawa fakta, batch, cache terakhir; hitung operasi sebelum waktu. Batching pernah di-revert tiga kali (#162560, #173901, #175092).
7. Persistensi: SQLite WAL, `synchronous NORMAL`, `autoCheckpointPages: 0` (`openclaw-agent-db.ts:462-473`); satu baris event per pesan; pagar penulis `activeWriterRunId` diklaim sebelum streaming (`session-bootstrap.ts:562-585`, `session-accessor.sqlite-scope.ts:83-102`). Terminal UI mengikuti settlement append pada jalur normal, bukan jaminan mutlak (ada fallback saat append gagal).
8. Active Memory berjenjang: lane 1 `lexicalOnly` (`trigger-recall.ts:219,318`), regex niat (`escalation.ts:97-112`), lalu sub-agent; preflight 1,5 detik, timeout 15 detik, pemutus sirkuit 3 timeout per 60 detik, ringkasan ≤ 220 karakter (`index.ts:255-271`). Pola niat memuat Inggris, Spanyol, Mandarin, Jepang, Korea, Rusia, Portugis dan Prancis (`escalation.ts:3-81`); Indonesia tidak ada.
9. R2: `active-memory` hanya `enabled: true` tanpa `config.agents`, jadi lane lanjutan tidak menarget agen. Namun resolver efektif `rememberAcrossConversations` bernilai true bila `session.dmScope` kosong dan tidak ada binding ber-`dmScope` (`config-utils.ts:101-123`), sehingga recall produk eligible untuk percakapan privat. Aktivasi runtime tetap UNKNOWN.
10. Hook `agent_end` plugin dilepas tanpa ditunggu (`agent-end-side-effects.ts:111-117`), tetapi itu pekerjaan observasional; di Native pekerjaan sesudah teks final adalah durabilitas dan Learning (butir 4).

Inferred: bookkeeping state penuh menjelaskan sebagian besar jeda antar-tool; recall tanpa batas ikut menambah jeda awal; OpenClaw terasa lancar karena tulisnya sebanding ukuran event, recall berbatas, pekerjaan observasional dilepas, dan penyedia serta model berbeda.
Unknown: porsi checkpoint DTC, UI, model dan jaringan; apakah Active Memory benar-benar memanggil recall di sesi pengguna; waktu aktual sesudah perubahan (tidak diukur, sesuai aturan pengguna).

T1: Claim: kerja bookkeeping dan recall per giliran Native dapat dipangkas tanpa mengubah durabilitas, semantik batal dan Memory-first. Observed: butir 1-4 dan 6-8. Inferred: penggabungan mutasi berurutan menjaga urutan efek; deadline bersignal menjaga recall tetap berbatas. Rival: biaya dominan ada di checkpoint DTC, model atau UI; atau migrasi penyimpanan (partisi state atau jurnal append, pola OpenClaw) lebih menghilangkan beban sebanding seluruh state, dengan risiko lebih besar. Test: hitungan W1 pada tiga fixture berbatas dan tes paritas. Flip: tes DTC mengunci urutan mutasi satu-satu, hitungan tidak turun, atau paritas state gagal.

Ledger lensa:

| Lensa | Temuan | Efek |
|---|---|---|
| Semantik | Butir 6-10 | Fakta R1 dihitung bila dibuktikan di kode |
| Prosedural | Tes work-count menghitung eksekusi statement, bukan waktu (`test/helpers/sqlite-statement-execution-counter.ts:42-141`, `session-actor-worker.test.ts:158-183`) | Metode yang cocok dengan aturan tanpa benchmark |
| Negatif | Batching di-revert tiga kali; counter tingkat metode dapat menyembunyikan I/O; lossless-claw dapat menunggu peringkasan model sebelum request; K5 (lepas pekerjaan sesudah final) bertabrakan dengan kontrak finalisasi | Membatasi W2, menahan K5 |
| Strategi | OpenClaw bertumpu pada satu proses pemilik SQLite; Agent Core memakai JSON tunggal dengan `.last-good` dan baca-ulang | Migrasi penyimpanan tidak diusulkan, hanya frekuensi tulis |
| Kredibilitas | R1 kuat (dokumen cocok dengan kode pada semua yang diperiksa); R2 campuran | R2 hanya bukti lingkungan |
| Kesegaran | Pin 2026.10.6 (2026-10-23); repo bergerak cepat | Kutip commit |
| Absen | Tidak ada waktu per fase untuk alur pengguna; pola niat Indonesia tidak ada; tidak ada pembanding pada model sama | Pola niat dirancang sendiri; manfaat hanya harapan |
| Medium, Lingkungan, Biaya | Isi cache-trace dan basis data SQLite tidak dibuka; Node 24, TypeScript dan SQLite sama, tetapi OpenClaw multi-kanal dengan model OpenAI; tiap paket punya saklar | Hanya prinsip yang dipindah |
| Triangulasi | Dua studi OpenClaw sebelumnya tidak menyentuh jalur giliran; Codex dan saya cocok pada hitungan mutasi | Celah ini yang diisi |
| Maksud, Bebas (independensi pengamat) | Pengguna bertanya mengapa OpenClaw lancar walau effort xhigh; perbandingan melibatkan penyedia, model dan prompt berbeda | Atribusi `confounded` |

Dukungan per paket: W1 oleh Prosedural, Strategi dan Negatif, dibatasi Negatif (counter metode saja kurang). W2 oleh Semantik, Negatif (aritmetik) dan Lingkungan, dibatasi Negatif (revert batching, `toolMs` di `finally`, kontrak durabilitas). W3a oleh Semantik, Prosedural dan Negatif. W3b oleh Semantik dan Prosedural, dibatasi Absen (bahasa Indonesia) dan Lingkungan (Memory-first). W4 oleh Prosedural, dibatasi Lingkungan; manfaatnya proteksi regresi karena `system[0]` identik antar task sudah dikunci tes (`agent-controller.test.ts:267-282`).

Tumpang tindih: tidak ada. `Respons Interaktif Native` tahap 1 (cache normalisasi, aktif) dan `Perkuatan Recall Kompaksi Native` (pemulihan sumber kompaksi) menyentuh area lain.

Profil nilai: R1 donor dan metode (kredibilitas kuat; nilai terbesar di lensa Prosedural); R2 konfirmasi dan peringatan (campuran). Untuk menaikkan nilainya, bawa log waktu per fase atau jejak hitungan dari run OpenClaw dengan model yang sebanding.

## Mekanisme dan owner existing yang dipakai

Tidak ada store, daemon atau cache authority baru; semua perubahan berada di owner yang ada.

| Paket | Owner dan perubahan terkecil | Padanan OpenClaw dan yang tidak ikut |
|---|---|---|
| W1 penghitung kerja (khusus tes) | Pengait penghitung opsional (no-op bawaan) di `AgentRuntimeService` (`mutate`, `load`, `normalizeState`, `writeStateFile`), `continuation.save`, `MemoryService.search` dan percobaan provider; direset per task, giliran dan percobaan; fixture berbatas. Bukan dasbor atau telemetri produksi | `trackSqliteStatementExecutions`; tanpa telemetri |
| W2 gabung bookkeeping | Satu metode gabungan di `AgentRuntimeService` yang memakai pembantu sama dengan `recordEpisode`, `recordRetrieval`, `bumpMetrics`, `recordCapabilityUse` dalam satu `mutate`, dipanggil di tiga titik: sesudah recall, sebelum dispatch, sesudah dispatch sukses. Jalur gagal dan batal tetap seperti sekarang (`toolMs` di `finally`); `.last-good`, baca-ulang, checkpoint DTC dan checkpoint `tool-dispatching` tidak berubah; `memory.recall.completed` terbit setelah gabungan durabel | "Sekali di owner"; tidak ikut SQLite atau tulis per event |
| W3a recall berbatas | `assembleMemoryContext` dan `MemoryService.search` menerima `signal` dan `deadlineMs` dari pemanggil dan meneruskannya ke indeks dan embedder; hasil terlambat ditolak; hasil dicatat berbeda sebagai tersedia, kosong, dilewati atau tidak tersedia (deadline); model diberi catatan berbatas "recall tidak tersedia" agar tidak menganggap Memory kosong; `recordRetrieval` dan provenance tetap | Preflight, timeout dan ringkasan berbatas Active Memory |
| W3b tangga recall | Opsi `lexicalOnly` sungguhan pada `MemoryService` (melewati `semanticContext`). Tingkat 1 `lexicalOnly` dengan ambang kuat; tingkat 2 fusion bila tingkat 1 lemah dan ada niat recall (pola niat Indonesia dan Inggris dirancang sendiri) atau tugas ber-workspace; pemutus sirkuit per sumber daya atau model dan scope | Lane 1, regex niat, pemutus sirkuit; tidak ikut sub-agent recall |
| W4 kontrak prefix | Tes kontrak per segmen (sistem, tool, riwayat) pada batas permintaan provider; kompaksi, pembaruan skema atau otoritas, resume dan pemangkasan gambar menjadi batas eksplisit; hasil tool yang sama diputar ulang identik | `assertStableProviderPrefix` |

## Scope, batas Native, risiko dan otorisasi

Urutan dan rekomendasi: W1 lalu W2; "sesuai rekomendasi" berarti W1 + W2. W3a menyusul dengan keputusan sendiri. W3b hanya sesudah fixture cakupan (termasuk bahasa Indonesia) lulus pada fusion. W4 opsional dan kecil.

Ditahan, bukan paket: melepas pekerjaan sesudah teks final (pola `agent_end`). Di Native pekerjaan itu menentukan hasil final dan `assistant.final` ditahan sampai jawaban tersimpan (butir 4); mengubahnya adalah redesign lifecycle (pekerjaan durabel terpisah, lease, idempotensi, pemulihan), bukan optimasi. Kandidat kecil untuk studi lanjutan: bookkeeping notice dan receipt sesudah commit chat.

Tidak mencakup: migrasi state ke SQLite atau jurnal append, perubahan model, provider, effort atau key, pembacaan `.env`, perubahan format state, benchmark, push, tag dan release.

Risiko: W2 mengubah granularitas durabilitas bookkeeping (state antara berbeda saat crash; checkpoint DTC tetap melindungi efek tak dikenal). W3 dapat menurunkan kualitas recall untuk kueri parafrase, dan pola niat belum memuat bahasa Indonesia; deadline tanpa signal membiarkan hasil terlambat masuk prompt; pemutus sirkuit global dapat menyembunyikan recall yang tidak terkait. W1 saja tidak mengubah perilaku produksi.

## Manfaat yang diharapkan dan keterbatasan

Harapan struktural, bukan hasil ukur dan bukan janji detik: sebelum inferensi 5 menjadi 3 mutasi; per tool sukses 4-5 menjadi 2 (bukan semua tool, error atau batal; direct Memory tool tetap +2); tiap mutasi yang hilang menghapus 3 pembacaan dan 2 penulisan penuh state; recall yang selesai di tingkat 1 tidak meminta embedding; recall tidak lagi menunggu tanpa batas. Keterbatasan: checkpoint DTC, ukuran state, model, UI dan jaringan tetap; perbandingan dengan OpenClaw terkonfounding oleh penyedia dan model; W3 bergantung pada kualitas aturan niat.

## Acceptance, evaluasi dan rollback

Hanya kebenaran dan hitungan deterministik; tanpa benchmark kecepatan.

- W1: dengan pengait terpasang, hasil dan byte keluaran tidak berubah; baseline hitungan dicatat sebagai konstanta tes untuk tiga fixture berbatas (giliran segar tanpa tool, satu tool sukses, satu tool gagal) dan dibaca sebagai batas fixture itu, bukan konstanta produk.
- W2: kesetaraan state akhir, urutan episode dan receipt (selain stempel waktu) antara mode lama dan baru; jalur gagal dan batal tidak berubah (`toolMs` tetap tercatat); `memory.recall.completed` tidak terbit sebelum gabungan durabel; tes `dtc1-durable-turn-continuation`, `agent-controller` dan `agent-runtime-normalize-cache` tetap lulus; batas atas pada fixture W1: ≤ 3 mutasi sebelum provider pertama (≤ 4 bila `delegatedTools`) dan ≤ 2 per tool sukses non-Memory; jumlah checkpoint tidak berubah.
- W3a: signal dan deadline sampai ke indeks dan embedder (timer terkendali, bukan jam dinding); hasil terlambat tidak masuk prompt atau receipt; empat keadaan hasil tercatat berbeda; pemeriksaan hidup dengan item Memory yang diketahui tetap ditemukan.
- W3b: fixture niat Indonesia dan Inggris; `lexicalOnly` = 0 pemanggilan `embedDocuments`; Memory-first, audience, supersession dan provenance tidak berubah; pemutus sirkuit pulih terkendali.
- W4: tes kontrak per segmen dengan batas eksplisit untuk kompaksi, otoritas, skema dan resume.
- Rollback: `AGENT_CORE_RUNTIME_BATCH_BOOKKEEPING=off`, `AGENT_CORE_NATIVE_RECALL_DEADLINE=off` dan `AGENT_CORE_NATIVE_RECALL_TIERS=off` mengembalikan jalur lama (pola `AGENT_CORE_RUNTIME_NORMALIZE_CACHE`); tidak ada data yang dihapus dan format state tidak berubah.

## Riwayat revisi

- Revisi 1 (2026-11-03): usulan awal dari studi OpenClaw bersama Codex.

## Keputusan pengguna dan scope

Belum ada keputusan; menunggu APPROVE / REVISE / HOLD / REJECT. Rekomendasi: W1 + W2.
