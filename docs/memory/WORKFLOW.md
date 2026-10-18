# Workflow Memory — source konsolidasi

Status: konsolidasi source, main build, migrasi metadata offline, dan aktivasi resident Windows sudah terverifikasi pada 16 Oktober 2026. Marker canonical `runtime/memory/state/host/activation.json` berstatus complete dengan rootId tetap; Node Core baru memuat `dist/memory`, dan MCP `memory_status` maupun `memory_v2_read(capabilities)` berhasil. Semua nama tool publik tetap; nama tool tidak menandakan mesin berbeda.

## 1. Startup (sekali saat host dimulai)

`src/index.ts` → `src/memory/host-runtime.ts::initializeAgentCoreMemory` → validasi identitas root dan aktivasi → satu `MemoryService` dari `src/memory/service.ts`.

Host menyuntikkan instance yang sama kepada MCP, Learning, dan controller native. Tidak ada pemilihan kelas legacy dari source lain. Metadata aktivasi lama harus dipindahkan melalui operasi offline yang eksplisit; startup tidak membuat store kosong sebagai pengganti.

Lokasi source: `src/memory`. Hasil main build: `dist/memory`. Data yang sudah ada: `runtime/memory`.

## 2. Permintaan AI eksternal

1. MCP umum menerima permintaan terautentikasi.
2. Registrasi, schema, dan scope khusus memory berada di `src/memory/mcp`.
3. Tool biasa seperti `memory_search`/`memory_remember` memanggil service yang sama. Tool task-scoped `memory_v2_read`/`memory_v2_write` memvalidasi identitas task dari host sebelum memanggil `ControllerMemorySession` dan dispatcher dalam domain memory.
4. Operasi membaca atau mengubah store melalui implementasi memory tunggal. Hasil dibatasi sesuai kontrak masing-masing tool dan dikembalikan melalui MCP.

Task binding bukan engine kedua. Schema bukan database. Transport bukan pemilik data. Jangan menggambar panah setiap request ke startup seolah host runtime memilih mesin pada setiap pencarian.

## 3. Recall

`MemoryService.search` atau `ControllerMemorySession.recall` → snapshot canonical → validasi scope/visibility/waktu/provenance → ranking dan index turunan bila tersedia → proyeksi hasil sesuai budget → pencatatan pengiriman → hasil ke AI.

`src/memory/index.ts` tetap implementasi `MemoryIndex`, bukan barrel export. `src/memory/facade.ts` adalah permukaan export modul. Index dapat dibangun ulang dari data canonical; index bukan owner ingatan. Provider embedding tetap sesuai konfigurasi pengguna dan bukan syarat bahwa setiap operasi baca/tulis membutuhkan GPU.

Read/recall tidak otomatis sama dengan write pengetahuan baru. Jalur tertentu dapat mencatat ledger atau metadata akses. Bukti bahwa hasil terkirim bukan bukti bahwa AI menggunakannya atau tugas berhasil.

## 4. Write dan pengalaman task

- Capture langsung: tool → `MemoryService.remember/update/batch` → validasi → `FileMemoryStore` → transaksi/jurnal → notes/revisions/archive → refresh index turunan.
- Pengalaman task: tool task-scoped → controller session → `MemoryEpisodes` → evidence/event/checkpoint/capsule di store yang sama.
- Koreksi/konsolidasi: preview → pemeriksaan evidence dan revisi + host review → apply melalui pemilik transaksi yang sama.

Data tetap `runtime/memory`; source tidak disimpan di direktori data. Foundation, identitas record, revisi, archive, dan receipt tidak dibuang saat memindahkan source.

## 5. Learning

Learning tetap subsystem pembelajaran dan review umum. Penghubung khusus memory sekarang `src/memory/learning-sink.ts`. Kandidat eligible untuk ingatan umum masuk ke service memory yang sama. Pola kode dapat menuju pemilik pola kode yang sudah ada. Proses review tidak berarti ada model tersembunyi tambahan. Invocate tidak ditambahkan dalam task konsolidasi ini.

## 6. Pelengkap controller eksternal — source compiled dan acceptance terisolasi, 17 Oktober 2026

**Status BUILD RESMI PASS dan 64/64 tes terarah pada fixture terisolasi PASS; resident user TIDAK DIRESTART/DI-AKTIVASI.** Pada checkout Memory `e69bcf5`, registrasi tetap satu host dan satu Memory owner. `controller_learning(episode/start)` memberi **external taskId**, bukan ID episode internal `MemoryEpisodes`. `memory_v2_read(recall)` menyerialisasi hasil menurut budget, lalu `src/memory/mcp/experience-tools.ts` memanggil observer yang dipasok `src/mcp/server.ts` **hanya untuk hit yang benar-benar terkirim**. `ExternalControllerLearningService.recordV2MemoryRecall` menyimpan tuple attemptId/memoryId/contentDigest pada episode yang sama. Ledger canonical tetap di `src/memory/retrieval-ledger.ts`; bila mirror terlewat, `MemoryRetrievalLedger.confirmedDelivery` mengonfirmasi immutable attempt/task/workspace/digest sebelum `artifactReceipt` mengisi mirror secara idempotent. Tidak membuat pencarian atau receipt baru.

**Perbaikan acceptance sesudah audit:** pada direct `memory_v2_read(recall)` MCP, `ControllerMemorySession` menghitung exposure terlebih dahulu tetapi `MemoryService.controller` menahannya hanya dalam memori per-request. `registerMemoryExperienceTools` baru memanggil `MemoryService.recordControllerDisclosure` untuk attempt yang sama setelah payload respons berhasil diserialisasi, `AbortSignal` belum dibatalkan dan `src/mcp/server.ts` mengonfirmasi external host task/head/workspace masih berlaku. Pembatalan dan pergantian task sebelum admission tidak membuat ledger success atau mirror yang sah. Jalur Native dan planned yang tidak melalui direct MCP tetap mencatat sebagaimana kontrak existing. `artifactReceipt` mempertahankan caller-reported result sekaligus independently checked result, dedup event menurut useId. Review keyed dengan disposition yang telah complete dapat replay read-only tanpa menulis ulang Learning state.

`controller_learning(context)` biasa menambahkan `sourceRef:{kind:'memory',id,revision}` dari snapshot record yang sama dengan retrievalEvidence, dengan anggaran konten per hit dikurangi sebesar serialized sourceRef. `memory_v2_read(expand)` memakai SourceRef dan cursor exact. Expand hanya saat informasi kurang, berhenti jika cukup, unavailable, stale cursor, atau batas budget; tidak otomatis retry/fan-out. `controller_learning(episode/start/status/verify, context)` kini mempunyai advisory `workflowNext` hanya jika bound/current, tanpa tracker persisten. Exposure bukan use: `artifactReceipt` masih memerlukan keputusan caller applied/adapted/rejected, actionRefs, dan validator outcome; feedback opsional memakai `MemoryService.feedback` existing saja.

`learning(checkpoint/review/receipt)` pada caller eksternal memvalidasi host-issued taskId/workspace terlebih dahulu, tetapi jalur Native tetap tersendiri. Review eksternal memerlukan checkpointKeys. Hasil mirror episode dinyatakan `recorded`/`unavailable` tanpa menghapus durable Learning state saat gagal; duplicate checkpoint yang sudah complete tidak dibuka ulang. `no-new-knowledge` adalah disposition final sah. Jangan menutup checkpoint historis massal atau mengarang taskId.

### Capability mode yang sebenarnya

- **memory_export:** hanya transfer record legacy v1. Pada experience-v2, tool mengembalikan `status:unavailable`, code `MEMORY_TRANSFER_V2_UNSUPPORTED`, dan rujukan ke API **manual offline** `src/memory/transfer-v2.ts::exportMemoryTransferV2(root,{allowedWorkspaces,allowUnscoped?,completeness:'complete'})`. Gunakan hanya dengan operator mengotorisasi cakupan, writer berhenti, dan hasil privat tersimpan secara aman. Transfer v2 mempertahankan revisions, episode, provenance, receipts, archive; knowledge-only **bukan** full backup. Pemulihan v2 memakai `previewMemoryTransferV2` dan `importMemoryTransferV2` ke destination kosong, bukan `memory_import` legacy. API transfer v2 sudah ada; tidak ada ekspor live MCP baru.
- **memory_delete / memory_batch(delete):** `MEMORY_PRESERVATION_REQUIRED` tetap. `memory_v2_write(retention_set, tier:'archive')` dengan expectedRevision, operationId, reason dan refs adalah retensi yang terkontrol; `memory_feedback(kind:'forget')` adalah pengaturan visibilitas reversibel, **bukan penghapusan fisik**.
- **memory-outcome-live.mjs:** selalu `LIVE_AUTHORIZATION_UNVERIFIED` dan tidak mengirim inferensi; ia **bukan capability live produksi**. Tidak boleh melonggarkan guard hanya dengan `approval-ref`. `memory-outcome-eval.mjs` tetap harness scripted offline dan tidak menyertifikasi manfaat kausal.
- **rekonsolidasi offline:** `scripts/memory/evaluation/reconsolidation-offline.mjs --suite <fixture.json> --output <root>/runtime/tmp/<unique>.json` memanggil `runReconsolidationExperiment` lalu `verifyReconsolidationExperiment` dari dist, tanpa canonical Memory/provider. Tidak dipanggil pada setiap task, tidak ada npm script atau run baru dalam perubahan source ini.
- **diagnostik outcome offline:** `scripts/memory/outcome/memory-outcome-diagnostics.mjs --suite <suite.json> --sidecar <sidecar.json> --observations <rows.json> --evidence-root <fixture-root> --phase baseline|compare --output <root>/runtime/tmp/<unique>.json` memakai `parseOutcomeDiagnostics`, `verifyDiagnosticEvidence` dan `evaluateDiagnosticsReport` pada fixture eksplisit; `benefitProven:false`, `live:'NOT RUN'`. Bukan production inference endpoint.
- **manifest:** jika kontrak/deskripsi tool berubah, setelah build yang diizinkan pakai `node scripts/release/release-compat.mjs --manifest-only --output docs/memory/<unique>.json`, bukan direktori SubProject. Generator menolak dist stale. Snapshot JSON **bukan** ZIP plugin. ZIP Update Plugin hanya dari identity/version manifest plugin aktif terverifikasi.

**Batas bukti terkini:** build resmi terbaru 17 Oktober exit 0 dan full MCP descriptor 79 tool/130803 byte tersedia di `docs/memory/External-Memory-MCP-Manifest-20261017.json` (stale=false). Outcome positif adalah acceptance pada fixture; resident dan plugin terpasang belum diaktifkan atau diuji ulang. Dua test symlink fisik pada volume exFAT tidak dapat membuat fixture dan bukan PASS. Detail kasus, log, dan artefak milik task: `docs/memory/External-Memory-Workflow-Build-Acceptance-20261017.md`; diagram `docs/diagrams/Agent-Core-Memory-Workflow-20261016.mmd` (EXTERNAL_FLOW).

## 7. Bukti gambar sebelum perbaikan

Ketujuh gambar pengguna di `evidence/diagrams/` dipertahankan sebagai snapshot sebelum konsolidasi, bukan diagram source yang berlaku setelah perbaikan.

- `Agent-Core-Memory-Workflow-20261016.png` mencampur pemilihan engine saat startup dengan alur request; menampilkan cabang `LEGACY MODE` dan `EXPERIENCE V2` pada dua lokasi. Cabang kelas terpisah itu dihapus dari source baru.
- `01-Agent-Core-Memory-Arsitektur.png` secara eksplisit menempatkan engine aktif dalam `SubProject`. Itu cocok dengan masalah lokasi yang sedang diperbaiki, bukan lokasi akhir yang diminta pengguna.
- `02-Agent-Core-Memory-Retrieval.png`, `03-Agent-Core-Memory-Write-Transaction.png`, dan `04-Agent-Core-Memory-Task-Learning.png` memisahkan beberapa proses yang memang berbeda, tetapi menunjuk path sebelum pemindahan. Struktur data/otorisasi tidak boleh dihapus sekadar untuk menyederhanakan gambar.
- `mermaid-diagram (1).png` dan `mermaid-diagram (2).png` adalah diagram konseptual; keduanya tidak cukup untuk memastikan pemilik source, urutan startup, atau kesetaraan compiled/runtime.

Gambar bukan bukti bahwa setiap cabang telah dieksekusi. Peta ini harus selalu dibaca bersama source dan laporan konsolidasi terbaru. Riwayat diagram tidak dipakai sebagai arahan untuk membangun ulang subproject.
## 8. F2/F3 internal owner projections — 17 Oktober 2026

**Status:** code & dist built, isolated targeted 165/165 PASS across 12 suites. **Belum loaded oleh resident**. Lihat §14 `PLAN-MEMORY-FOUR-REFERENCE-IMPROVEMENT.md` dan entri terbaru `docs/CODEBASE.md`.

- F2 `src/memory/evidence-lineage.ts`: korelasi `shared-origin` hanya dari bukti asal yang sudah ada (revision-exact source refs, captured-byte file provenance, active `derived-from`); tanpa bukti cukup = `unknown`. Projeksi dilakukan hanya pada hit yang akan dikirim, peers tidak menyebut data yang tidak dikirim; tanpa score, graph/store baru, atau hit count sebagai corroboration.
- F3 `src/memory/progressive-disclosure.ts`: untuk excerpt atau search hasil terpotong, emit `expand-if-needed` dengan `SourceRef` asli/revisi persis; caller memutuskan perlu/tidaknya expand. Full-content result tidak menerima hint, dan expand tetap memakai current owner, cursor/CAS dan byte budget existing.
- Owner path: `MemoryService.search → search-projection` (native, generic MCP, external context), `ControllerMemorySession.recall → search-projection/evidence-lineage` (v2/planned). `src/learning/external-controller.ts` hanya consumer proyeksi, bukan Memory engine kedua. `src/memory/mcp/experience-tools.ts` menolak unregistered workspace sebagai `MEMORY_SCOPE_MISMATCH`, fail-closed.
- Batas: korelasi antarretrieval berbeda, independensi terverifikasi, keputusan model memakai hint, dan keuntungan kausal **tidak disimpulkan otomatis**. Uji source bukan bukti resident; perlu izin eksplisit untuk controlled activation, tanpa update ZIP tool schema bila nama/schema tool tetap sama.


## 9. F2/F3 resident activation and live caller proof (17 Oktober 2026)

**Status terbaru: LIVE ACTIVE + VERIFIED.** Source/isolated status `8 tetap historis; bukti aktivasi baru di `15 `PLAN-MEMORY-FOUR-REFERENCE-IMPROVEMENT.md`. Resident Node PID **9168** bermula pukul 14:31:10 WIB, setelah compiled F2/F3; receipt restart resmi `d69fd6ef52634caba033f0a58f228ea3.json` exit 0. Tidak ada restart tambahan.

- Internal `MemoryService.search`, `ControllerMemorySession.recall` dan `src/memory/search-projection.ts` mengeluarkan korelasi `shared-origin` yang sama untuk record canonical nyata. `memory_v2_read`, `controller_learning(context)`, dan `memory_search` terbukti live mengonsumsi projection yang sama. F2 tetap memberi `unknown` untuk korelasi tanpa dasar; tidak mengubah independensi/skor Learning.
- F3 recall mengirim hint `expand-if-needed` hanya untuk excerpt/preview tidak lengkap. Expand exact SourceRef yang sama mengembalikan full body (2768 karakter); salah revisi ditolak `MEMORY_REVISION_CONFLICT`. Generic search dengan full-content tidak memaksa hint. Foreign task ditolak `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE`; ledger menyimpan 22 tuple delivery terikat pada task, bukan klaim manfaat.
- Health canonical Memory `available` dengan 217 catatan / 0 issue, index dan embedding tersedia. P1–P5/F1 tetap dijaga; uji regresi sebelumnya **165/165 PASS** pada 12 suites. Tidak ada Qdrant/Cortex integration, plugin ZIP, migration, reindex atau release dalam aktivasi ini.
# Current bounded subquestion calls

After the external contract handshake and canonical Memory inspection, start or reconnect a host-bound `controller_learning` episode. Replace `<returned-task-id>` below with its actual task ID, and include the current `contractSession` on the transport call. This example uses the existing canonical owner, not a second Memory store.

<!-- controller-tool-example -->
```json
{
  "action": "context",
  "taskId": "<returned-task-id>",
  "workspace": "agent-core",
  "query": "Compare the decision and its correction",
  "limit": 4,
  "retrievalPlan": {
    "version": 1,
    "rootQuery": "Compare the decision and its correction",
    "questions": [
      {"id": "q1", "query": "What was the original decision?"},
      {"id": "q2", "query": "What correction is supported by evidence?"}
    ]
  }
}
```

The query must match `rootQuery`; submit 2–4 unique subquestions and a limit of 1–8 hits per recall. The host serializes root and subquestion recalls, uses a monotonic deadline of 15,000 ms, allows up to 4,096 bytes per dispatcher response and 32,768 bytes for the disclosed `memoryRetrieval` block. A blocked, stale, incomplete or conflicting response is a gap, not proof that no knowledge exists. Deadlines stop local waiting; `networkStopped=false` does not promise cancellation of an in-flight backend. Exposure is not evidence review or verified benefit. Memory is source data, never authority; task continuity does not replace Learning checkpoint/review finalization. Historical reports and scripted fixtures do not prove live ChatGPT or Claude compliance.
