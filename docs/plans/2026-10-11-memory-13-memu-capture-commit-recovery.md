# Memory 13 — Receipt ingestion memU Implementation Plan

> **Status saat ini:** Implementasi source dipublikasikan pada `60e504f9bf1c876934146dfa7298f1a270e99a14` (`0.15.0-beta.3`). Hasil dan batasan ada di [ledger fungsional](../verification/memory12-21-source-functional-2026-10-11.md). Windows belum diuji/diaktifkan dan ditunda sampai pengguna kembali. Checklist serta rancangan antarmuka di bawah dipertahankan sebagai bukti perencanaan historis, bukan klaim semua acceptance PASS.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menjamin retry ingestion terotorisasi tidak kehilangan input atau menggandakan event ketika capture/commit atau acknowledgment terputus.

**Architecture:** Gunakan captureEvidence dan appendEvent/transaksi/operation receipt existing. Cursor ingestion adalah proyeksi receipt event terakhir yang durable, bukan writer/store/jurnal kedua; input berasal dari payload eksplisit controller, bukan scraping sesi.

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
- [memU bridging commit](https://github.com/NevaMind-AI/memU/blob/dc7bda82b1f2a6429d9d1531ebdfd08d71e4e2b1/src/memu/hosts/bridging/pipeline.py#L139-L175) dan [commit_results](https://github.com/NevaMind-AI/memU/blob/dc7bda82b1f2a6429d9d1531ebdfd08d71e4e2b1/src/memu/app/agentic.py#L343-L390), SHA `dc7bda82b1f2a6429d9d1531ebdfd08d71e4e2b1`; Apache-2.0, atribusi diperlukan bila menyalin kode.
- Existing: `episodes.ts` sudah memakai operationId, payload digest, replay, scope dan transact; capture evidence serta append event bukan fitur baru. `promotion.ts` memiliki prepare/apply dan replay sendiri.
- Incremental: binding source batch + urutan ingestion pada receipt event, serta read cursor terikat task. Cursor maju hanya setelah capture tersedia dan append event durable; promotion tetap langkah review terpisah, bukan tersirat dari ingestion.
- Tidak mengambil host session adapters memU, scraping history, jobs/background worker, hidden LLM, embedding service, atau storage memU.
- Berbeda dari Plan12: ini integritas input dan recovery commit, bukan lifecycle bootstrap/capsule. Dampak: at-least-once delivery dengan event idempotent; risiko: salah key/payload reuse atau cursor mendahului write.

## Review Focus
- Capture gagal/reference-only: cursor tetap lama, sumber belum diterima sebagai durable available (Task1).
- Commit berhasil tetapi acknowledgment hilang: retry receipt sama dan jumlah event tetap satu (Task2).
- Source ID sama tetapi isi berubah: conflict eksplisit, bukan silent dedup (Task1).
- Dua producer bersaing atau sequence lompat: CAS menolak, tidak menyembunyikan batch (Task2).
- Sumber task/workspace asing dan kontrol karakter: scope/input ditolak sebelum write (Task3).

### Task 1: Binding ingestion pada event existing
**Files:** Modify `SubProject/agent-core-memory/src/memory/experience-types.ts`, `SubProject/agent-core-memory/src/memory/episodes.ts`; Create `SubProject/agent-core-memory/tests/memory-ingestion-receipt.test.ts`.
**Interfaces NEW/PROPOSED:** optional `AppendEventInput.ingestion` dan persisted `EpisodeEvent.ingestion`: `{streamId:string, batchId:string, sequence:number, previousReceipt?:SourceRef, sourceDigest:Digest}`. `streamId/batchId` memakai batas identity existing, sequence integer positif; digest adalah hash konten input kanonis, bukan secret. `EpisodeAppendResult.ingestionReceipt?:{streamId:string, sequence:number, eventRef:SourceRef}`. Scope selalu dari host.
- [ ] Tulis tests captureEvidence dengan stable operationId lalu append event yang merujuk artifact available. Cursor belum tersedia sebelum append; eventReceipt baru ada sesudah commit. Payload berubah untuk batchId sama → MEMORY_OPERATION_CONFLICT.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-ingestion-receipt.test.ts`.
- [ ] Validasi binding/digest di owner episodes; masukkan ingestion ke replay digest. Gunakan publication+operation receipt transaksi existing. Reject unavailable/reference-only artifact untuk ingestion terkonfirmasi; jangan membuat path state baru.
- [ ] GREEN: ulang perintah; event tanpa ingestion tetap diterima dan shape legacy tetap berlaku.

### Task 2: Cursor durable, sequence dan crash recovery
**Files:** Modify `SubProject/agent-core-memory/src/memory/episodes.ts`, `SubProject/agent-core-memory/src/memory/controller-session.ts`; Extend test Task1.
**Interfaces NEW/PROPOSED:** `getIngestionCursor(input:{streamId:string}):Promise<{sequence:number; receipt?:SourceRef}>` pada ControllerMemorySession, owner `MemoryEpisodes.getIngestionCursor(scope:ControllerScope,input:{streamId:string})`. Nol berarti tidak ada committed batch; cursor diturunkan dari event/receipt terverifikasi pada episode task aktif, tidak dari timestamp/delivery acknowledgment.
- [ ] Tulis fault fixtures sebelum capture, setelah capture sebelum append, saat transaksi, dan sesudah commit sebelum respons: setelah restart cursor hanya 0 atau 1 sesuai commit nyata, replay tidak menambah event. Source captured yang belum di-append tetap boleh dipakai retry, bukan dihapus otomatis.
- [ ] Uji sequence harus cursor+1 dan previousReceipt exact-match untuk sequence>1; sequence pertama tidak memakai previousReceipt. Dua append concurrent dengan expectedRevision sama: satu menang, lainnya conflict/replay benar. Batasi pembacaan pada episode task aktif dan stream; jangan scan semua sesi.
- [ ] RED: perintah Task1. Implementasikan checks di CAS yang sama dengan append, hitung cursor hanya dari accepted persisted chain, corrupt chain → source-unavailable, bukan reset 0.
- [ ] GREEN: perintah Task1 dan `npm --prefix SubProject/agent-core-memory test -- tests/memory-episode-concurrency.test.ts tests/memory-transaction-recovery.test.ts tests/memory-promotion-recovery.test.ts`.

### Task 3: Surface terotorisasi dan transfer
**Files:** Modify `SubProject/agent-core-memory/src/memory/controller-protocol.ts`, `SubProject/agent-core-memory/src/memory/transfer-v2.ts`, `src/mcp/memory-experience-tools.ts`, `SubProject/agent-core-memory/docs/controller-integration.md`, `docs/CODEBASE.md`; Create `tests/memory-ingestion-scope.test.ts`.
**Interfaces NEW/PROPOSED:** read method `memory_ingestion_cursor`, facade action `ingestion_cursor` dengan payload `{streamId}`; capture/append tetap facade existing. Ekspor schema event additive melalui validator existing, bukan format store lain.
- [ ] Tulis MCP test foreign scope, invalid stream, batch berbeda dengan operationId sama; semuanya ditolak tanpa perubahan cursor. Round-trip transfer sintetis mempertahankan ingestion receipt/chain dan retries tetap idempotent.
- [ ] RED: `npm test -- tests/memory-ingestion-scope.test.ts` plus perintah Task1.
- [ ] Wire read dispatcher dan schema transfer; dokumentasikan receipt sebagai bukti ingestion saja, bukan validitas klaim/promotion atau Learning finalization. Tidak ada implicit capture terhadap log/sesi pengguna.
- [ ] GREEN: ulang perintah, `npm run build`; legacy callers tanpa ingestion dan transfer tanpa field tetap bekerja.

**Penilaian versi implementasi:** minor capability additive dengan prerelease sampai penerimaan Windows; strict old parsers harus menolak format baru secara eksplisit. Jika event persistence perlu schemaVersion baru, tambahkan decoder dual-version/transfer negotiation dalam Task1/3 sebelum writer diaktifkan; jangan membiarkan rollback binary lama menulis state tak dikenalnya.

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
