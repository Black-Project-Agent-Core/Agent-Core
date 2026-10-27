# Anggaran teks always-on — laporan Fase 0
Tanggal: 2026-10-26
Status: SELESAI — hanya baca terhadap kontrak, source, konfigurasi, dan runtime. Tidak ada kata kontrak yang diubah; tidak ada build, tes produk, atau restart. Berkas baru hanya laporan ini dan alat ukurnya di `docs/research`.
Asal: [Harness2 Donor Proposals](../proposals/Harness2-Donor-Proposals.md), usulan P1, scope Fase 0 saja. Keputusan penerimaan 2026-10-26 dicatat controller dari pesan pengguna; itu bukan atestasi pesan-pengguna dari host dan bukan grant eksekusi.
Alat ukur dan data mentah: [measure-always-on.mjs](always-on-budget-phase0/measure-always-on.mjs) dan [measure-20261026.json](always-on-budget-phase0/measure-20261026.json).

## 1. Hasil singkat

| Permukaan | Ukuran terukur | Est. token | Dibayar |
| --- | --- | --- | --- |
| `AGENTS.md` lewat `controller_contract(read)` | 78.135 byte, 475 baris (hasil tool 78.493 karakter) | 19.534 | sekali per handshake; penerimaan tidak lagi kedaluwarsa karena idle |
| Kapsul bootstrap (respons `acknowledge`) | batas keras 7.000 karakter; bagian statis 6.579 | 1.646 | sekali per handshake |
| Prompt Native, bagian statis (mode `dynamic`, 79 tool) | 16.392 byte | 4.098 | pada setiap panggilan model |
| Input Native yang dilaporkan provider (percakapan saja, 1 panggilan) | — | 7.732 dan 8.263 (teramati, bukan estimasi) | pada setiap panggilan model |

Awal sesi eksternal membayar `AGENTS.md` ditambah kapsul: sampai kira-kira 21.284 token (estimasi).

1. **`AGENTS.md`:** wajib-selalu 41,4%; situasional 52,1% (khusus tool/capability 33,5%, khusus jenis tugas 18,6%); historis atau bukan instruksi aktif 6,5%. Klasifikasi adalah penilaian controller (bagian 2).
2. **Kapsul bootstrap:** bagian statis memakai 6.579 dari 7.000 karakter (94,0%). Baris dinamis (current authority, koreksi, pelajaran, jumlah review dan episode Learning yang tertunda) hanya mendapat sisa 421 karakter, padahal batas atasnya 5.383. Pada sesi ini respons `acknowledge` terpotong tepat setelah baris current authority pertama (berakhir dengan "- c"), sehingga baris jumlah review dan episode Learning yang tertunda tidak sampai.
3. **Prompt Native:** bagian statis (±4.098 token) adalah sekitar separuh dari input panggilan pertama yang dilaporkan provider. Sisanya (±3.634–4.165 token) dinamis dan tidak dapat dipecah per bagian tanpa menjalankan runtime. Bagian statis dikirim ulang pada setiap panggilan model.
4. **Redundansi kata-demi-kata rendah:** kapsul memuat 2,6% 6-kata yang juga ada di `AGENTS.md`, prompt Native 3,9%. Penghematan karenanya tidak datang dari menghapus duplikat, melainkan dari memuat bagian sesuai kebutuhan atau memadatkannya.
5. **Pemalsu P1 tidak terpenuhi:** wajib-selalu bukan mayoritas (41,4%) dan bagian situasional tidak kecil (52,1%; 33,5% bila hanya yang paling pasti dihitung). Fase 0 karena itu tidak menghentikan P1. Fase 1 tetap keputusan terpisah (bagian 7 dan 10).

## 2. Metode dan batas

- **Byte:** UTF-8 dari berkas atau dari string yang dibangun kode produksi. Teks panduan skill, `IMPROVEMENT_HANDOFF_CONTRACT`, dan `CAPABILITY_USE_CONTRACT` diimpor dari modul `dist/` yang sama dengan runtime. Konstanta dan fungsi `systemPrompt`, `nativeToolboxTool`, `COMPACT_STRATEGY_TOOL`, `COMPACT_FINALIZE_TOOL`, `FINALIZE_TOOL` dan `CAPABILITY_TOOL` diekstrak dari `dist/agent-controller.js` dan dievaluasi tanpa memuat konfigurasi, `.env`, atau layanan.
- **Estimasi token:** `ceil(byte / 4)`, aturan yang sama dengan `estimatedContextTokens()` di `src/agent-controller.ts` (tanpa tambahan 1.024 miliknya). Ini bukan hitungan tokenizer Claude atau provider; deviasi sekitar ±25% wajar untuk campuran teks Inggris, Indonesia, kode, dan Markdown. Yang andal adalah perbandingan relatif antarbagian dan input token yang dilaporkan provider.
- **Satu-satunya angka token nyata:** `inputTokens` per task Native di `runtime/agent-runtime/state.json`. Hanya angka yang dibaca, tanpa isi prompt.
- **Segmentasi `AGENTS.md`:** heading `#`, `##`, `###`, lima blok tebal berhuruf kapital, dan satu paragraf (aturan ada di skrip). Jumlah byte semua segmen sama dengan ukuran berkas (78.135).
- **Klasifikasi:** penilaian controller dengan alasan per baris, bukan fakta. **A** = dibutuhkan di setiap sesi atau tugas bermakna. **S1** = khusus tool atau capability (keyakinan tinggi). **S2** = khusus jenis tugas (keyakinan lebih rendah). **H** = historis atau dinyatakan bukan instruksi aktif. Tabel klasifikasi (`CLS`) ada di skrip agar dapat diaudit dan diubah. "Situasional" berarti dapat dimuat sesuai kebutuhan, bukan bahwa teksnya tidak berguna.
- **Keadaan yang diukur:** `AGENTS.md` pada working tree (sudah ada perubahan belum di-commit sebelum tugas ini; tugas ini tidak mengubahnya) dan build `dist/` pada 2026-10-26.

## 3. `AGENTS.md` per bagian

| Kelas | Segmen | Byte | Est. token | Porsi |
| --- | --- | --- | --- | --- |
| A — wajib-selalu | 24 | 32.361 | 8.091 | 41,4% |
| S1 — situasional: tool/capability | 13 | 26.140 | 6.535 | 33,5% |
| S2 — situasional: jenis tugas | 7 | 14.538 | 3.635 | 18,6% |
| H — historis atau bukan instruksi aktif | 2 | 5.096 | 1.274 | 6,5% |
| **Jumlah** | 46 | **78.135** | **19.534** | 100,0% |

Jumlah token per baris dibulatkan ke atas per baris, sehingga jumlahnya dapat berbeda sedikit dari total kelas. Enam bagian terbesar: External-controller build activation and tool refresh (6.010 byte, S1); Mandatory capability routing — Native and external (5.010 byte, A); User-authorized task-scoped auto-trust — 2026-09-30 (4.250 byte, A); Code Intelligence protocol (3.774 byte, S1); Historical Hermes A2A partner protocol — RETIRED, NOT CURRENT INSTRUCTIONS (3.610 byte, H); Self-learning / Hermes-adapted learning protocol (3.347 byte, A).

| Baris | Bagian | Byte | Est. token | Kelas | Alasan klasifikasi |
| --- | --- | --- | --- | --- | --- |
| 1–2 | Agent Core — Local AI Operating Contract | 46 | 12 | A | Judul dokumen |
| 3–6 | Top-level directives | 344 | 86 | A | Izin kerja Agent Core; pendek |
| 7–8 | Codex-Design: blocked unless the user names it | 50 | 13 | A | Judul sisa; tanpa isi sendiri |
| 9–15 | NATIVE AI AGENT CORE — ACTIVE DEVELOPMENT AND OPERATION. | 1.052 | 263 | S1 | Hanya untuk tugas yang menyentuh Native; ringkasan satu baris cukup di inti |
| 16–22 | EXTERNAL CONTROLLER SESSION BOOTSTRAP FIRST. | 1.123 | 281 | A | Aturan handshake; dibutuhkan di awal setiap sesi |
| 23–33 | ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE. | 1.697 | 425 | A | Memory-first; setiap sesi |
| 34–45 | MANDATORY LEARNING FINALIZATION AFTER MEANINGFUL WORK. | 2.552 | 638 | A | Finalisasi Learning; setiap tugas bermakna |
| 46–53 | External Memory v2 task selection | 1.000 | 250 | A | Pengikatan task untuk memory_v2; setiap tugas bermakna |
| 54–68 | Mandatory capability routing — Native and external | 5.010 | 1.253 | A | Routing capability; inti, tetapi memuat rincian per-skill yang situasional |
| 69–79 | Reusable external partner Raka | 2.249 | 563 | S1 | Hanya saat mendelegasikan subtask |
| 80–88 | Purpose and scope | 775 | 194 | A | Cakupan kontrak; pendek |
| 89–94 | Cumulative workflow contract — 2026-10-06 | 1.240 | 310 | S2 | Latar kualifikasi prosedur/Skill |
| 95–102 | Historical product direction context — confirmed 2026-10-03, current development scope updated 2026-10-24 | 1.486 | 372 | H | Konteks arah produk; latar belakang |
| 103–116 | Cross-controller cumulative-learning baseline — current operating path | 3.315 | 829 | A | Jalur operasi lintas controller; memory-first, koreksi, receipt |
| 117–127 | Skill proposal and reminder protocol — 2026-10-07 | 2.433 | 609 | S2 | Saat menulis atau menyampaikan proposal Skill |
| 128–129 | Capability awareness and usage disclosure — 2026-10-07 | 61 | 16 | A | Judul bagian; pendek |
| 130–140 | External continuity, claim review and proposal documents — 2026-10-19 | 3.152 | 788 | S2 | Saat memakai memory_v2 lanjutan atau menulis dokumen proposal |
| 141–146 | Capability inventory and usage notice (paragraf) | 1.172 | 293 | A | Pengungkapan penggunaan capability; pendek |
| 147–159 | Creator partnership and decision autonomy | 1.923 | 481 | A | Cara kerja dasar |
| 160–165 | Identity | 492 | 123 | A | Peran |
| 166–175 | Personality | 636 | 159 | A | Gaya |
| 176–191 | Operating doctrine | 988 | 247 | A | Alur kerja dasar |
| 192–202 | Tool model | 964 | 241 | A | Model tool; pendek |
| 203–225 | Code Intelligence protocol | 3.774 | 944 | S1 | Hanya pekerjaan kode terstruktur |
| 226–238 | Semantic IDE / LSP protocol | 3.008 | 752 | S1 | Hanya pekerjaan kode semantik |
| 239–248 | Structural review protocol | 742 | 186 | S1 | Hanya review diff struktural |
| 249–254 | Graph-quality calibration protocol | 728 | 182 | S1 | Hanya kalibrasi graf |
| 255–262 | External REA Reconstruction Harness | 1.542 | 386 | S1 | Hanya rekonstruksi/REA |
| 263–264 | Release intent / version integrity protocol | 48 | 12 | S1 | Hanya saat mengubah perilaku yang dikirim |
| 265–291 | External-controller build activation and tool refresh | 6.010 | 1.503 | S1 | Hanya setelah build/restart |
| 292–303 | Git repository — active current-line publication boundary | 1.661 | 416 | S1 | Hanya saat commit/publikasi |
| 304–312 | Remote Desktop Commander boundary | 1.333 | 334 | S1 | Hanya saat menyentuh RDC |
| 313–328 | Dynamic path / portability protocol | 2.591 | 648 | S1 | Hanya saat menulis kode/skrip proyek |
| 329–339 | Local machine rules | 1.087 | 272 | A | Aturan keselamatan mesin |
| 340–343 | Verification rule | 83 | 21 | A | Aturan verifikasi |
| 344–360 | User-authorized task-scoped auto-trust — 2026-09-30 | 4.250 | 1.063 | A | Cakupan izin kerja |
| 361–366 | User intent and safety | 503 | 126 | A | Keselamatan |
| 367–374 | Feedback and continuity | 611 | 153 | A | Koreksi pengguna |
| 375–388 | Failure-learning / Reflexion protocol | 2.892 | 723 | S2 | Hanya saat ada bukti kegagalan |
| 389–397 | Memory capture protocol | 1.664 | 416 | S2 | Hanya saat menulis Memory |
| 398–414 | Self-learning / Hermes-adapted learning protocol | 3.347 | 837 | A | Checkpoint/review; tumpang tindih konsep dengan blok MANDATORY LEARNING FINALIZATION |
| 415–418 | Explicit learn / distillation protocol | 571 | 143 | S2 | Hanya saat pengguna meminta belajar eksplisit |
| 419–439 | Historical Hermes A2A partner protocol — RETIRED, NOT CURRENT INSTRUCTIONS | 3.610 | 903 | H | Dinyatakan RETIRED, NOT CURRENT INSTRUCTIONS |
| 440–446 | Communication | 332 | 83 | A | Gaya jawaban |
| 447–470 | Codebase architecture source of truth | 2.586 | 647 | S2 | Hanya saat mengubah Agent Core atau butuh peta arsitektur |
| 471–475 | Optional Batch 9/10 source-evidence workflows — 2026-10-15 | 1.402 | 351 | S1 | Hanya workflow bukti sumber opsional |

## 4. Prompt Native per bagian

Mesin ini menjalankan Native dengan `capabilityPolicy=dynamic`: 79 tool tersedia dan diberi grant awal, tetapi hanya 3 definisi yang dipresentasikan pada turn percakapan saja (toolbox ditambah versi ringkas strategy dan finalize); 5 bila dua definisi lain ikut dipresentasikan (dari episode task `080e6ef5`, `4b00b8dd`, `4d3f6ead`, `d07c07cf`).

### 4.1 Bagian statis (diukur)

| Bagian | Byte | Est. token |
| --- | --- | --- |
| systemPrompt: identitas dan sikap kerja (10 baris) | 1.599 | 400 |
| systemPrompt: `MEMORY ACCESS` | 544 | 136 |
| systemPrompt: pemakaian tool dan capability (4 baris, termasuk `CAPABILITY_USE_CONTRACT` dan baris tool delegasi) | 1.153 | 289 |
| systemPrompt: strategi, bukti, dan prosedur (10 baris) | 1.495 | 374 |
| systemPrompt: `IMPROVEMENT_HANDOFF_CONTRACT` | 1.185 | 297 |
| systemPrompt: aturan `decisionReview` dan salience | 711 | 178 |
| systemPrompt: `RESPONSE_STYLE_CONTRACT` | 1.732 | 433 |
| systemPrompt: aturan finalize (2 baris) | 265 | 67 |
| systemPrompt: pemisah (memori dan paket sintesis kosong) | 4 | 1 |
| **Subtotal systemPrompt** | 8.688 | 2.172 |
| `NATIVE SKILL GUIDANCE` (indeks dan 3 rute skill) | 4.145 | 1.037 |
| `agent_core_toolbox` (615 dasar + 79 nama × ±20 byte) | 2.193 | 549 |
| `agent_core_strategy` (versi ringkas) | 608 | 152 |
| `agent_core_finalize` (versi ringkas) | 758 | 190 |
| **Total statis** | 16.392 | 4.098 |

### 4.2 Bagian dinamis (tidak diukur; batas dari source)

| Bagian | Batas atau sifat | Sumber |
| --- | --- | --- |
| `LOCAL MEMORY CONTEXT` | sampai 5 item; anggaran 12.000 karakter pada JSON item; isi tiap item masuk penuh ke prompt | `AgentRuntime.assembleMemoryContext` |
| Paket sintesis pengetahuan | batas 16.000 unit UTF-16, dengan cadangan 2.048 | `buildKnowledgeSynthesisPacket` |
| `skillDecisionContext` | variabel | `agent-controller.ts`, penyusunan pesan sistem |
| Definisi tool yang dipresentasikan | 3 pada turn percakapan; tiap definisi MCP penuh tambahan belum diukur | `presentModelTools` |
| Pesan pengguna dan riwayat | tiap pesan riwayat sampai 200.000 karakter | `agent-controller.ts` |

### 4.3 Observasi provider

| Task | Panggilan model | Tool | Input token | Output token | Model |
| --- | --- | --- | --- | --- | --- |
| `080e6ef5` | 1 | 0 | 7.732 | 288 | Atria-Dawn |
| `4b00b8dd` | 1 | 0 | 8.263 | 74 | Atria-Dawn |
| `4d3f6ead` | 2 | 0 | 21.323 | 692 | nemotron-3-ultra (free) |
| `d07c07cf` | 2 | 0 | 23.649 | 623 | nemotron-3-ultra (free) |
| `5b6ac855` | 3 | 0 | 27.551 | 466 | nemotron-3-ultra (free) |

Pembacaan dan batasnya:
- Pada dua turn satu panggilan, bagian statis (±4.098 token) adalah ±49,6–53,0% dari input. Sisa ±3.634–4.165 token adalah memori yang dipanggil, paket sintesis, pesan pengguna, dan kerangka pesan.
- Kedua task itu berjalan pada 2026-10-25 06:14 dan 08:26 UTC, sebelum baris `MEMORY ACCESS` (544 byte, ±136 token) aktif di resident (08:49 UTC). Bagian statis saat itu karenanya sedikit lebih kecil dari angka build sekarang, dan sisa dinamisnya sampai ±4.301 token.
- Turn dua dan tiga panggilan memakai model lain dan menjumlahkan semua panggilan; input per panggilan tidak dapat dipisah dari catatan itu. Yang pasti: bagian statis dikirim ulang pada tiap panggilan, jadi biayanya bertambah dengan jumlah panggilan.
- Pengaruh cache prompt di sisi provider tidak diketahui.
- Mode `explicit` (tidak aktif di mesin ini) menambah `CAPABILITY_TOOL` 4.557 byte (±1.140 token) dan `FINALIZE_TOOL` 2.237 byte (±560 token) serta semua definisi tool yang diberi grant. `STRATEGY_TOOL` tidak berhasil dievaluasi dan tidak diukur.

## 5. Kapsul bootstrap per bagian

Kapsul dibangun `bootstrapInstructions` di `src/learning/external-controller.ts` dan dipotong `slice(0, 7_000)`.

| Bagian (urutan di kapsul) | Karakter | Est. token | Kumulatif |
| --- | --- | --- | --- |
| Pembuka, aturan bootstrap, task start, claim_review (5 baris) | 757 | 190 | 757 |
| EXTERNAL SKILL GUIDANCE (indeks + 3 rute skill) | 4.146 | 1.037 | 4.903 |
| Baris panduan proposal (bila ada proposal Skill) | 272 | 68 | 5.175 |
| Baris penyelesaian (verifikasi, checkpoint, review) | 219 | 55 | 5.394 |
| IMPROVEMENT_HANDOFF_CONTRACT | 1.185 | 297 | 6.579 |
| **Jumlah statis** | **6.579** | **1.646** | |
| Sisa untuk baris dinamis | 421 | | |

Baris dinamis menurut source: current authority (sampai 2 baris), koreksi material (sampai 3), pelajaran (sampai 3), jumlah review Learning yang tertunda, episode eksternal dengan Learning yang belum selesai (sampai 5), dan satu baris penutup. Batas atas gabungannya 5.383 karakter, jauh di atas sisa 421.

Bukti dari sesi ini: respons `acknowledge` berakhir dengan "- c", yaitu awal baris kedua. Bagian statis 6.579 ditambah baris current authority pertama (±416 karakter, dihitung manual dari teks yang diterima) dan awal baris berikutnya menghasilkan ±7.000, sesuai batas.

## 6. Temuan lain

1. **Bagian historis tetap dimuat.** Dua bagian H berjumlah 5.096 byte (6,5%): "Historical Hermes A2A partner protocol — RETIRED, NOT CURRENT INSTRUCTIONS" (3.610 byte) dan "Historical product direction context". Bagian pertama menyatakan sendiri bahwa ia bukan instruksi aktif.
2. **Segmen terbesar bersifat situasional.** "External-controller build activation and tool refresh" (6.010 byte, 7,7% berkas) hanya relevan setelah build atau restart.
3. **Teks yang sama hidup di dua jalur kode.** Panduan skill Native (4.145 byte) dan eksternal (4.147 byte) berbeda dua byte; `IMPROVEMENT_HANDOFF_CONTRACT` (1.184 byte) ada di kapsul dan di prompt Native. Satu sesi hanya membayar salah satu, jadi ini beban pemeliharaan, bukan biaya sesi. Tumpang tindih kapsul dengan prompt Native: 98,5% dari 6-kata kapsul ada di prompt Native.
4. **Daftar 79 nama tool dikirim pada setiap panggilan Native** lewat deskripsi `agent_core_toolbox` (±1.578 byte dari 2.193 byte toolbox).
5. **Tumpang tindih konsep, bukan kata.** "Self-learning / Hermes-adapted learning protocol" dan "MANDATORY LEARNING FINALIZATION" mengatur hal yang berdekatan, tetapi tumpang tindih kata-demi-katanya hanya 3%. Menggabungkannya memerlukan penulisan ulang, bukan penghapusan.

## 7. Terhadap pemalsu P1 dan kandidat Fase 1

Pemalsu P1: "bila Fase 0 menunjukkan sebagian besar teks adalah wajib-selalu atau bagian situasional kecil, hentikan di Fase 0." Hasil: wajib-selalu 41,4% (bukan mayoritas), situasional 52,1% (bukan kecil; 33,5% pada tingkat yang paling pasti). Pemalsu tidak terpenuhi, jadi laporan ini tidak menghentikan P1. Kesimpulan itu bergantung pada klasifikasi (bagian 2); sensitivitasnya: bila hanya S1 dihitung situasional, bagian itu tetap 26.140 byte (±6.535 token).

Nilai yang berbeda per permukaan: `AGENTS.md` dibayar sekali per handshake, sedangkan bagian statis Native dibayar pada setiap panggilan model. Untuk kuota provider Native, pemangkasan per panggilan lebih berpengaruh per turn; untuk controller eksternal, `AGENTS.md` dan kapsul adalah biaya awal sesi.

Kandidat Fase 1 (belum ada yang disetujui atau dikerjakan). Angka penghematan adalah batas atas teoretis, bukan prediksi:

| Kandidat | Perubahan | Batas atas | Risiko utama | Ukuran |
| --- | --- | --- | --- | --- |
| F1-A Kapsul: jamin ruang untuk baris dinamis | hitungan Learning dipindah ke depan, pemotongan per baris utuh, batas dinaikkan dari 7.000 ke 7.600 karakter (spesifikasi di proposal); teks kontrak tidak berubah | bukan penghematan: tambahan sampai 600 karakter (±150 token) per handshake agar jumlah review dan episode Learning yang tertunda tampil | rendah; satu fungsi dan tes | S |
| F1-B Native: sertakan panduan skill dan bagian situasional hanya bila turn membutuhkannya | `agent-controller.ts`, `external-guidance.ts` | panduan 4.145 byte (±1.037 token) per panggilan; sampai ±2.080 token bila `RESPONSE STYLE`, handoff, `decisionReview` dan `MEMORY ACCESS` ikut dikondisikan | gerbang `mind-control` dan indeks harus tetap terpicu; definisi "turn sederhana" perlu diuji | M |
| F1-C Kontrak eksternal: inti kecil ditambah bagian dibaca sesuai kebutuhan | `AGENTS.md`, gerbang handshake, digest | S1 ±6.535 token; S1+S2 ±10.170; ditambah H ±11.444 per handshake | kepatuhan pada bagian yang tidak terbaca saat dibutuhkan; handshake, digest, receipt; tanpa ukuran kepatuhan | L |

Urutan yang disarankan controller bila Fase 1 dibuka: F1-A dahulu (celah fungsional kecil dengan bukti sesi ini), lalu F1-B, dan F1-C hanya bila angka dan risiko kepatuhan dapat diterima.

## 8. Yang tidak terukur

- Token sebenarnya per bagian (tidak ada tokenizer Claude atau provider yang dipakai).
- Bagian dinamis prompt Native per turn (memori yang dipanggil, paket sintesis) dan definisi MCP penuh yang dipresentasikan.
- `STRATEGY_TOOL` dan seluruh jalur mode `explicit`.
- Teks `instructions` server MCP saat initialize (tidak dibaca terpisah) dan teks yang disuntikkan di sisi klien (CLAUDE.md pengguna, hook, skill): di luar scope P1.
- Efek pemangkasan terhadap kepatuhan atau mutu tugas: tidak ada pengukuran.
- Satu mesin, satu tanggal; build `dist/` bisa berbeda dari proses resident bila source berubah setelah restart terakhir.

## 9. Reproduksi

```
node docs/research/always-on-budget-phase0/measure-always-on.mjs --out hasil.json
```

Butuh `dist/` hasil `npm run build` dan Node 24. Skrip hanya membaca `AGENTS.md` dan modul `dist/`; hasil dibandingkan dengan [measure-20261026.json](always-on-budget-phase0/measure-20261026.json). Pengulangan pada tanggal lain menghasilkan angka berbeda bila `AGENTS.md` atau prompt berubah; bagian baru yang belum terklasifikasi ditampilkan sebagai `?`.

## 10. Keputusan yang diminta

Fase 0 selesai. Keputusan berikutnya milik pengguna dan terpisah per kandidat: **F1-A / F1-B / F1-C = APPROVE / REVISE / HOLD / REJECT**. Laporan ini bukan persetujuan, tidak mengubah kontrak, dan tidak menjalankan kandidat apa pun.

## Riwayat
- 2026-10-26: dibuat untuk P1 Fase 0 oleh controller eksternal; hanya baca.
