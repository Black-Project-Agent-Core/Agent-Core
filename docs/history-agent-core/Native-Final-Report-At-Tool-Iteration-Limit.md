# Native Final Report at the Tool-Iteration Limit
Tanggal: 2026-10-26
Revisi: 3
Status: COMPLETED — R3 implementasi penuh, acceptance, aktivasi dan review Learning selesai 2026-10-27
Jenis: Improvement (Native agent loop)

**Scope terkini 2026-10-27:** pengguna meminta kedua proposal selesai penuh,
bukan parsial. R3 mencakup persistensi laporan, replay/next-turn context, satu event
kegagalan, recovery durable, accounting attempt/model dan validasi integrasi.
Pembatasan satu berkas dan penundaan persistensi dalam R1/R2 di bawah adalah
riwayat keputusan terdahulu, digantikan permintaan penyelesaian penuh ini.

## Problem and goal
Sebuah turn Native yang mencapai `maxToolIterations` (bawaan 24, `AGENT_CORE_AI_MAX_TOOL_ITERATIONS`) langsung berakhir `failed` dengan `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED` (`src/agent-controller.ts:1671-1681`) tanpa jawaban. Semua hasil tool pada turn itu hilang bagi pengguna atau controller, dan turn berikutnya tidak melihatnya. Tujuannya: pada batas itu, Native tetap memberi satu laporan akhir berbasis hasil tool yang sudah ada, tanpa tool tambahan, dan turn tetap ditandai belum selesai.

## Evidence and uncertainty
- **Teramati 2026-10-26.** Controller eksternal mendelegasikan diagnosis flake `ENOTEMPTY` ke Native lewat `scripts/external/native-chat-bridge.mjs` (percakapan `fca5413e…`, turn `8cd82b53…`, provider atria `Atria-Dawn`). Turn berjalan sekitar 21 menit, dengan 22 tool call, 21 panggilan model, sekitar 811.748 token input dan `modelMs` 834.316, lalu berakhir `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED` dengan `response: null`.
- **Teramati.** Turn lanjutan yang meminta laporan tanpa tool (turn `652c4402…`) menjawab bahwa output tool turn sebelumnya tidak ada di konteksnya, jadi ia hanya bisa memberi dugaan.
- **Teramati.** Controller kemudian menemukan sendiri penyebabnya dalam beberapa run berinstrumen: ledger retrieval Memory ditulis oleh pengamat 250 ms yang terus berjalan setelah tes selesai.
- **Belum diketahui.** Apakah laporan pada batas iterasi akan memuat temuan yang benar (kualitas model), seberapa sering batas ini tercapai pada turn lain, dan berapa biaya satu panggilan model tambahan per turn yang mencapai batas.

## Proposed mechanism and existing owners
- **Pemilik:** loop di `NativeAgentController` (`src/agent-controller.ts`). Tidak ada owner, store, tool atau dependency baru.
- **Perubahan terkecil:** ketika `iteration` mencapai batas, lakukan satu panggilan model terakhir dengan `tools: []`. Pesannya meminta laporan singkat: apa yang teramati (dengan rujukan tool), dugaan yang ditandai sebagai dugaan, dan apa yang belum diperiksa. Teks itu dikirim sebagai `assistant.final`.
- **Status turn tidak berubah:** turn tetap `failed`/`awaiting-verification` dengan kode yang sama, jadi laporan tidak dianggap sebagai penyelesaian tugas.
- Bila panggilan terakhir itu gagal, perilaku sekarang dipakai apa adanya.

## Scope and Native boundary
- Hanya akhir loop tool di `agent-controller.ts`, dan tes untuk itu. Grant tool, routing provider, checkpoint durable, Learning finalization dan HTTP API tidak berubah.
- Satu panggilan model tambahan per turn yang mencapai batas; tidak ada percobaan ulang.

## Expected benefit and limitations
- **Manfaat yang diharapkan (belum diukur):** delegasi multi-langkah ke Native tidak lagi berakhir tanpa hasil sama sekali, dan controller atau pengguna dapat melanjutkan dari temuan nyata.
- **Batasan:** laporan bisa salah atau terlalu yakin. Laporan tidak memperpanjang anggaran tool dan tidak menyelesaikan tugas. Ini tidak memperbaiki lambatnya provider (sekitar 40 detik per panggilan pada pengamatan ini).

## Acceptance and rollback
- Tes yang gagal lebih dulu: sebuah turn dengan provider tiruan yang selalu meminta tool mencapai batas, lalu menerima tepat satu panggilan tanpa tool. `assistant.final` berisi teks laporan dan kode akhir tetap `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED`. Bila panggilan terakhir gagal, perilaku lama dipertahankan.
- Tes yang dijalankan ulang: tes agent-controller dan tes chat yang ada. Lalu build, satu restart resmi, dan satu delegasi nyata lewat bridge.
- Rollback: kembalikan satu blok di `agent-controller.ts`.

## Implementasi (Revisi 2)
- **Keputusan:** pengguna menulis "aku approve" sebagai jawaban atas pertanyaan "Approve the Native final-report-at-iteration-limit proposal?" untuk Revisi 1 (dicatat controller dari pesan chat, bukan atestasi pesan-pengguna dari host).
- **Perubahan:** satu blok di `src/agent-controller.ts` tepat setelah loop tool. Bila anggaran percobaan provider masih tersisa, controller memanggil `runtime.complete` sekali tanpa tool (`attemptLimit: 1`, route yang sama bila dipin) dengan permintaan laporan maksimal 250 kata. Teks itu dibatasi 4.000 karakter dan diredaksi, lalu dikirim sebagai `response` pada event `turn.failed` dengan kode `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED`. Bila panggilan gagal, perilaku lama dipakai. Status turn tetap gagal (`failed`/`awaiting-verification`).
- **Penyesuaian saluran dari Revisi 1:** Revisi 1 menyebut `assistant.final`. Chat service menyaring `assistant.final` dari controller dan tidak menyimpan pesan assistant untuk turn yang gagal (`agent-chat-service.ts:453`, `failTurn`). Jadi, dalam scope satu berkas, laporan dikirim lewat `turn.failed.response`. Laporan terlihat oleh konsumen stream (bridge eksternal, UI live) tetapi **tidak disimpan** ke riwayat percakapan, sehingga turn berikutnya tetap tidak melihatnya. Menyimpannya butuh perubahan `agent-chat-service.ts` dan `agent-chat-store.ts` dan menjadi keputusan terpisah.
- **Diketahui, tidak diubah:** `throw` di akhir loop masuk ke `catch` yang memancarkan `turn.failed` kedua tanpa `response`; perilaku ini sudah ada sebelumnya.
- **Tes:** dua kasus di `tests/agent-controller.test.ts` gagal lebih dulu, lalu lulus: laporan terkirim pada `turn.failed` dan permintaan ketiga tanpa `tools`; bila panggilan laporan gagal, kode tetap sama tanpa `response`.

## Revision history
- R1, 2026-10-26: dibuat dari pengamatan delegasi partner di atas. Tidak ada perubahan source.
- R2, 2026-10-26: APPROVE oleh pengguna; diimplementasikan dengan saluran `turn.failed.response` (lihat bagian Implementasi).

## Exact user decision and scope
Pilihan: APPROVE / REVISE / HOLD / REJECT atas "Native Final Report at the Tool-Iteration Limit, Revisi 1" dengan scope di atas (satu blok di `agent-controller.ts`, tes, build, satu restart resmi). Menaikkan `AGENT_CORE_AI_MAX_TOOL_ITERATIONS` adalah alternatif terpisah yang tidak termasuk proposal ini.

## Revisi 3 — implementasi lengkap dan acceptance 2026-10-27

- `agent-controller.ts` kini memancarkan satu `turn.failed` dari catch. Laporan
  diminta paling banyak sekali, `tools: []`, `attemptLimit: 1`, route dipertahankan
  dan hanya bila anggaran attempt tersisa. Kegagalan laporan mempertahankan kode
  `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED`, tanpa retry atau tool tambahan.
- `agent-turn-checkpoint.ts` menyimpan marker optional `iterationLimitReport`.
  Attempt ditulis durable sebelum request provider; response disimpan sebelum
  terminalisasi. Resume tidak meminta laporan kedua. Schema checkpoint tetap 1
  dan checkpoint lama tetap diterima. Attempt, model calls, usage dan cost response
  dihitung lewat owner metrics existing.
- `agent-chat-service.ts` menangkap laporan pada run/resume, meminta `failTurn`
  menyimpan teks, lalu memancarkan `assistant.final` setelah commit dengan
  `success:false`. Store existing menulis status gagal dan tepat satu assistant
  berlabel incomplete dalam transaksi yang sama. Teks diredaksi, maksimum 4.000
  karakter dan 250 kata termasuk label. Tidak ada table/store kedua.
- `agent-chat-store.ts` memasukkan laporan gagal itu dalam bounded next-turn
  context dan replay. Turn tetap failed/unverified; cancel, executor stale dan
  terminal status tidak dapat ditimpa laporan terlambat.
- Integrasi bridge membedakan external-controller dari local-operator. Kolom
  nullable `turn_origin` ditambahkan pada table existing; history lama tetap
  unknown. External prompts tidak menjalankan handler approval artifact/Skill
  dan tidak menghasilkan proof operator `user-message:`.

### Bukti acceptance

| Requirement | Bukti dan hasil |
| --- | --- |
| Satu report tanpa tool dan fallback saat provider gagal | Controller regressions, fake HTTP provider → controller → service/store; request tools kosong, kode gagal sama, satu event gagal |
| Tidak mengulang report sesudah crash/resume | Recovery regression menghentikan terminalisasi setelah checkpoint response, lalu resume; total request tetap tiga, marker/response tersimpan |
| Persistensi/reopen/replay/next context | Store dan service regressions; satu assistant, failed tetap failed, context memuat label incomplete |
| Batas 250 kata/4.000 karakter, redaksi, cancellation | Persistence regressions termasuk label dalam 250 kata dan stale executor/cancel refusal; redaksi bridge diuji dengan secret fixture |
| UI menampilkan laporan tanpa kehilangan draft | `src/ui/src/App.test.tsx` 11/11 PASS; regression failed turn plus saved report dan draft tetap |
| Build/EXE/satu restart/delegasi nyata | Build sukses; launcher publish sukses; receipt `dbf3f721e738486889b63f925c869412` exit 0, resident PID 1664 dan build tidak stale; live MCP bridge menghasilkan `BRIDGE_PHASE_B_OK` dengan replay satu turn |

Scoped controller/chat/bridge/HTTP/manifest/packaging/durable-continuation suites:
**120/120 PASS** dalam 10 berkas; [raw tests](../verification/native-chat-and-limit-report-tests.json).
Recovery checkpoint tersendiri juga 44/44 PASS
([raw recovery](../verification/native-limit-report-recovery-tests.json)); UI 11/11
([raw UI](../verification/native-chat-ui-tests.json)).
[Resident acceptance](../verification/native-chat-resident-acceptance.json)
memuat conversation `c9f1cb50-fed2-40e6-92ac-b314732020de` dan turn
`0233c066-dec8-4a93-baaa-05ab74b79c5e`, satu user dan satu assistant, origin external,
replay true. [Ledger lengkap](../verification/Native-Final-Report-and-Chat-Bridge-Completion.md).

### Performance, batas bukti dan rollback

Main dan Raka menggunakan `performance-oriented-software-engineering` untuk
workload exceptional-path ini: nol request report pada normal turn, maksimum satu
attempt tambahan tanpa tool pada batas iterasi, output/context bounded, durable
attempt mencegah pengeluaran ulang sesudah recovery. Tidak ada klaim speedup,
peningkatan kognitif atau kualitas factual laporan. Tes memakai provider fixture
agar jalur limit dapat dibuktikan secara deterministik; live send menguji delegasi
normal, bukan sengaja menghabiskan 24 iterasi provider.

Rollback R3 melalui source owner controller/checkpoint/service/store dan build
resmi, dengan menyimpan history/chat DB. Kolom nullable dan checkpoint optional
backward-compatible; jangan menghapus assistant/report/history atau schema secara
manual. Intent patch: `.changeset/native-limit-report-continuity.md`.

R3, 2026-10-27: permintaan full completion menggantikan scope parsial R2;
implementasi, recovery, persistensi, UI dan delegasi nyata sudah dibuktikan.

## Penutupan dan arsip

Learning checkpoint `native-report-bridge-full-completion-20261027` dan review
task `ext-12be7cffc1ac43d6b8fd6bdff69c5750` selesai dengan disposition
`no-new-knowledge`, complete=true pada 2026-10-26T21:13:09.571Z.
[Receipt](../verification/native-chat-learning-closure.json) mempertahankan batas:
episode verification tidak tersedia (`EXTERNAL_EPISODE_VERIFICATION_SCOPE_UNAVAILABLE`)
dan tidak dihitung sebagai pass; bukti acceptance adalah raw tests/resident di atas.
Path asal: `docs/proposals/Native-Final-Report-At-Tool-Iteration-Limit.md`.
Arsip: `docs/history-agent-core/Native-Final-Report-At-Tool-Iteration-Limit.md`.
Tidak ada scope R3 yang ditunda. Batas fixture/live, kualitas laporan model dan
cache tool host adalah keterbatasan bukti yang dinyatakan, bukan klaim manfaat baru.
