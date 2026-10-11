# Memory 14 — Histori known-at Graphiti Implementation Plan

> **Status saat ini:** Implementasi source dipublikasikan pada `60e504f9bf1c876934146dfa7298f1a270e99a14` (`0.15.0-beta.3`). Hasil dan batasan ada di [ledger fungsional](../verification/memory12-21-source-functional-2026-10-11.md). Windows belum diuji/diaktifkan dan ditunda sampai pengguna kembali. Checklist serta rancangan antarmuka di bawah dipertahankan sebagai bukti perencanaan historis, bukan klaim semua acceptance PASS.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah query bounded validAt + knownAt yang merekonstruksi revisi yang sudah tercatat pada waktu pengetahuan tertentu tanpa membocorkan koreksi masa depan.

**Architecture:** Pertahankan temporal.ts dan existing revision/archive/transaction owners. knownAt memakai metadata publikasi host yang durable, bukan updatedAt controller; snapshot histori lalu masuk selector temporal existing. Jika coverage histori tak dapat dibuktikan, hasil partial/unknown atau unavailable, bukan current fallback.

**Tech Stack:** TypeScript/Node.js, Zod, transaksi Memory existing, Vitest.

**Spec:** [Spesifikasi bersama](2026-10-11-memory-reference-adoption-spec.md).

## Global Constraints
- Status awal saat perencanaan (historis): **Draft / PROPOSED, belum dibangun**. Baseline sumber `957077fab260dd58d0cc7cfc0881172d05f84667`; inspeksi statis bukan bukti runtime resident.
- Node.js `>=24.15.0`, TypeScript, Zod dan Vitest existing; tanpa dependency/provider/database/runtime tambahan.
- Root Memory kanonis Linux tidak tersedia. Jangan membuatnya atau membaca/menyentuh Memory privat Windows; jangan menjalankan rencana ini sebelum persetujuan implementasi.
- Scope host task/workspace, permission, safety, exact source revision dan owner existing tetap wajib. Memory/Learning fail-soft, tidak boleh menjadi gate machine control.
- Tidak ada backup, stash, runtime sementara, reset, clean seluruh working tree, atau penghapusan state. Perubahan lokal di luar scope dipertahankan; konflik overlap dilaporkan.
- Uji fungsional/unit milik rencana ini saja; evaluasi longitudinal dan probe agregat menjadi milik Plan20 LongMemEval / Plan21 MemProbe, bukan suite duplikat.

## Sumber dan delta nyata
- [Graphiti EntityEdge](https://github.com/getzep/graphiti/blob/964bb11d1e7020e3cc67fab244268b0736b6c219/graphiti_core/edges.py#L263-L290) dan [search filters](https://github.com/getzep/graphiti/blob/964bb11d1e7020e3cc67fab244268b0736b6c219/graphiti_core/search/search_filters.py#L62-L65), SHA `964bb11d1e7020e3cc67fab244268b0736b6c219`; Apache-2.0. Adaptasi konsep, tanpa graph DB/Python/model Graphiti.
- Existing: `temporal.ts` punya valid interval, supersedes/contradicts; `promotion.ts` punya transition audit effectiveAt/recordedAt; `controller-session.ts` menandai `asOf` sebagai `valid-time-with-current-evidence` dan `not-known-at`.
- `revisions.ts` menyimpan maksimal 8 revisi/1.000.000 byte per memory. `capturedAt` snapshot revisi lama bukan bukti awal publikasi revisi; `archivedRevision` exact retrieval juga bukan indeks waktu pengetahuan lengkap.
- Incremental: metadata interval publikasi tepercaya, rekonstruksi snapshot knownAt bounded, capability dan query baru. Jangan mengemas asOf existing sebagai bitemporal yang sudah jadi.
- Dampak: menjawab “apa yang sudah tercatat saat itu?” dengan revision evidence. Risiko utama: future leakage, retention gap, timestamp palsu/clock regression. Ini bukan klaim mengetahui keadaan mental manusia.

## Review Focus
- Fakta Senin baru masuk Rabu: knownAt Selasa tidak mengembalikan fakta tersebut (Task1/2).
- Koreksi retroaktif: revisi sebelum koreksi tetap terlihat pada knownAt lama (Task2).
- Histori terpangkas/corrupt: partial/unknown eksplisit tanpa fallback current (Task2).
- Scope, archive, forgotten: histori tidak menembus izin/current privacy boundary (Task3).
- Timestamp ambigu, cursor beda waktu, clock mundur: reject/stale/unknown eksplisit (Task1/3).

### Task 1: Bukti waktu publikasi pada owner revisi
**Files:** Modify `SubProject/agent-core-memory/src/memory/revisions.ts`, `SubProject/agent-core-memory/src/memory/store.ts`, `SubProject/agent-core-memory/src/memory/transaction.ts`; Create `SubProject/agent-core-memory/tests/memory-known-at-history.test.ts`.
**Interfaces NEW/PROPOSED:** `KnowledgeInterval = {source:SourceRef; knownFrom:string; knownTo?:string; publicationOrder:number}`; metadata revision-file v2 terikat exact semantic revision, ditulis bersama transaksi kanonis. `KnownHistoryCoverage = {from?:string; complete:boolean; reason?:'legacy-unproven'|'retained-history-gap'|'clock-regression'|'bounded-scan'}`. Timestamp berasal dari owner commit, tidak bisa disuplai caller.
- [ ] Tulis test insert/update host: publikasi pertama memberi knownFrom; update menutup interval lama dan membuka baru, rollback transaksi tidak menerbitkan interval. Existing v1 snapshot tetap bisa dibaca tetapi tidak direkayasa knownFrom dari capturedAt/updatedAt.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-known-at-history.test.ts`.
- [ ] Implementasikan metadata dalam transaksi/revision owner yang sama, bukan append log/store kedua. Pertahankan batas 8 revisi dan 1.000.000 byte; pruning menandai coverage gap. Clock mundur menandai gap/unknown, tidak mengarang waktu benar. publicationOrder membedakan publikasi bertimestamp sama.
- [ ] GREEN: ulang perintah; fault injection memastikan record/revision publication konsisten sebelum/selepas restart.

### Task 2: Rekonstruksi snapshot lalu valid-time selection
**Files:** Modify `SubProject/agent-core-memory/src/memory/revisions.ts`, `SubProject/agent-core-memory/src/memory/store.ts`, `SubProject/agent-core-memory/src/memory/service.ts`, `SubProject/agent-core-memory/src/memory/controller-session.ts`; Extend test Task1.
**Interfaces NEW/PROPOSED:** port backend `historicalSnapshot(workspace:string, input:{knownAt:string; maxRecords:number}):Promise<{records:MemoryRecord[]; coverage:KnownHistoryCoverage; revisionRefs:SourceRef[]}>`. Batas awal maxRecords=500; overflow mengembalikan partial dengan reason, tidak silent cutoff. Gunakan selector existing `selectTemporalCandidates(records, validAt)` setelah memilih satu revisi terakhir yang sudah committed per ID.
- [ ] Tulis fixture fakta valid 2026-10-05 masuk 2026-10-07: query knownAt 2026-10-06 kosong, knownAt 2026-10-08 memuat exact revisi. Koreksi 2026-10-09 retroaktif berlaku 2026-10-05 tidak boleh muncul pada knownAt 2026-10-08.
- [ ] Tambahkan konflik tanpa supersedes: kedua klaim tetap conflict sesuai evidence yang diketahui saat itu; metadata links masa depan tidak boleh membatalkan klaim lama. 9 revisi melewati bound → gap dilaporkan untuk query yang kehilangan history, tanpa mengambil current content.
- [ ] RED: perintah Task1. Implementasikan pemilihan histori dan ranking hanya dari reconstructed records; jangan memanggil rank terhadap current universe atau membaca excerpt current setelah hit historis dipilih.
- [ ] GREEN: perintah Task1 dan `npm --prefix SubProject/agent-core-memory test -- tests/memory-temporal.test.ts tests/memory-temporal-order.test.ts`.

### Task 3: Query/cursor bounded dengan provenance utuh
**Files:** Modify `SubProject/agent-core-memory/src/memory/disclosure.ts`, `SubProject/agent-core-memory/src/memory/controller-session.ts`, `SubProject/agent-core-memory/src/memory/transfer-v2.ts`, `SubProject/agent-core-memory/docs/controller-integration.md`, `docs/CODEBASE.md`; Create `tests/memory-known-at-scope.test.ts`.
**Interfaces NEW/PROPOSED:** additive `RecallInput.validAt?:IsoInstant`, `knownAt?:IsoInstant`; knownAt mensyaratkan validAt, kombinasi asOf dengan dua field baru ditolak. Optional capability `temporalKnownAt?:true`; hasil menambah `knowledgeCoverage?:KnownHistoryCoverage`. Tanpa knownAt, asOf legacy tetap sama beserta warning not-known-at.
- [ ] Tulis schema/MCP tests timestamp wajib zona, field combination invalid, knownAt saat capability absent → MEMORY_TEMPORAL_UNSUPPORTED; cursor terikat validAt+knownAt+coverage+revision snapshot, perubahan salah satu → stale. Budget existing maksimal 65536 byte tetap berlaku.
- [ ] Tulis scope test task/workspace foreign ditolak; archive hanya melalui retention filter sah; forgotten tetap tidak terlihat. Expand historical hit harus exact revision atau unavailable, tidak versi terbaru. Transfer mempertahankan interval provenance/coverage dan menolak metadata palsu.
- [ ] RED: `npm test -- tests/memory-known-at-scope.test.ts` plus perintah Task1.
- [ ] Wire schema, cursor dan disclosure; gunakan current authorization/forgotten policy pada semua revisi, historical retention dari revisi yang dipilih. Tambahkan decoder revision v1/v2 dan dukungan transfer v2 metadata tanpa menduga historical coverage legacy.
- [ ] GREEN: ulang perintah, `npm run build`. Bukti hasil wajib menunjukkan validAt, knownAt, exact revision, gap dan sumber koreksi secara terpisah.

**Penilaian versi implementasi:** minor public capability; persistence revision-file v2 membutuhkan backward-read dan explicit unsupported-write behavior. Rollback boleh menonaktifkan knownAt tetapi tidak menghapus metadata atau downgrade state. Tidak ada aktivasi fitur sebelum reader/transfer writer konsisten.

## Kompatibilitas, versi, rollback
- Dokumen ini: **no product-version change**. Saat implementasi, catat release intent, changelog dan `docs/CODEBASE.md` sesuai perubahan nyata; sinkronkan seluruh version surface melalui workflow release existing, jangan mengarang nomor versi stabil.
- Rollback hanya kode/perubahan terlingkup setelah pemeriksaan konflik; pertahankan receipt, evidence dan revisi kanonis. Jangan memundurkan atau menghapus data agar binary lama tampak kompatibel. Format tak didukung harus dilaporkan, bukan di-reset.

## Handoff Windows setelah implementasi disetujui
- [ ] Publisher memberikan repo `https://github.com/Black-Project-Agent-Core/Agent-Core`, branch yang benar-benar dipush, dan **SHA publikasi implementasi penuh 40 karakter**. Nilainya belum ada; baseline bukan SHA implementasi. Jangan fetch nama placeholder atau menyatakan sudah dipasang.
- [ ] Controller penerima memeriksa `git status --short`, remote dan overlap file, lalu `git fetch <remote-terverifikasi> <branch-terverifikasi>` dan `git show <SHA-publikasi-terverifikasi>`. Integrasikan hanya scope yang disepakati; tidak mensyaratkan seluruh tree bersih, tidak stash/backup, selesaikan konflik overlap secara selektif; hentikan hanya perubahan yang benar-benar tidak dapat diselesaikan tanpa kehilangan pekerjaan lokal.
- [ ] Jalankan perintah test pada tiap task dan `npm run build` di checkout Windows kanonis. Jika perubahan/version surface memerlukannya, bangun UI dengan `npm --prefix src/ui run build`; publish launcher melalui `dotnet publish src/launcher/AgentCore.Launcher.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o <root-kanonis-terverifikasi>` hanya setelah lock executable dan jalur pemulihan restart aman diperiksa. Ganti parameter root dengan path nyata yang telah diverifikasi, bukan lokasi subfolder alternatif. Jangan gunakan helper development-build yang membuat output runtime/tmp. Controller penerima memverifikasi lokasi executable aktif lalu memakai prosedur aktivasi kanonis yang diizinkan, tanpa temp-runtime.
- [ ] Pastikan `src`, `SubProject/agent-core-memory/dist`, `dist`, executable `Agent Core.exe`, serta proses resident berasal dari source/build identity yang sama. Gunakan launcher/runtime kanonis, bukan salinan temp; aktivasi Memory existing tidak boleh ditebak atau diubah otomatis.
- [ ] Jalankan skenario fungsional rencana ini melalui controller eksternal dan Native dengan task uji terdaftar, bukti sintetis, dan izin host existing. Pisahkan PASS / FAIL / BLOCKED / NOT RUN; benchmark berat tidak diperlukan.
- [ ] Buat ZIP laporan tersanitasi di direktori laporan permanen di luar temp: identitas sumber/build/proses, log, screenshot relevan, inventaris file berubah, status ledger, manifest setiap file path/size/SHA-256. Verifikasi setelah ekstraksi baru di direktori laporan permanen; tanpa kredensial atau isi Memory privat.

## Checklist review sebelum eksekusi
- [ ] Baca spec bersama; cocokkan signature, ownership, boundary dan acceptance di atas.
- [ ] Konfirmasi setiap test baru benar-benar gagal sebelum implementasi dan PASS sesudahnya; jangan mengklaim hasil dari dokumen ini.
- [ ] Review diff per task dan commit hanya file task ketika implementasi telah diizinkan; publikasi mengikuti otorisasi yang berlaku.
