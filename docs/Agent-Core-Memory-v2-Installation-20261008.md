# Agent Core Memory v2 — Installation and Cutover

**Tanggal:** 2026-10-08
**Root pada acceptance host asal:** `E:\Projects\Agent-Core`; bukan path wajib untuk checkout lain.
**Status:** INSTALASI DAN ACCEPTANCE FUNGSIONAL EXTERNAL-CONTROLLER SELESAI menurut penutup 2026-10-09 waktu Indonesia dan [laporan live acceptance](Agent-Core-Memory-v2-Live-Acceptance-20261009.md). Pernyataan pending di tahap sebelumnya adalah kronologi, bukan pekerjaan aktivasi yang harus diulang.
**Review dokumentasi 2026-10-08 UTC:** integrasi dikonfirmasi dari source `8a80251`; runtime host asal tidak diuji ulang. Tanggal, angka migrasi, dan bukti resident di bawah tetap milik sesi asal.
**Upstream:** `rendevouz999/Agent-Core-Memory`, commit `b266f62ba11b54859185cede8e61c43c4e28cb9a`.

## Tujuan dan boundary

- Engine v2 adalah capability internal Agent Core dan berada di `SubProject/agent-core-memory`, bukan server/gateway Memory kedua.
- Tidak ada overwrite atau penghapusan `runtime/memory`. Data v1 dipertahankan untuk rollback/forensik.
- Snapshot canonical v1 dibekukan dengan lock; activation marker terbit terakhir setelah transfer+readback. Dua writer format berbeda tidak boleh menulis pada root yang sama.
- Tidak ada restart otomatis, Git commit/push atau release apply.

## Backup yang tersedia

- `runtime/backups/memory-v1-pre-v2-20261008/memory/` adalah salinan 196 file/7.772.431 byte dari snapshot awal yang terkunci.
- `runtime/backups/memory-v1-pre-v2-20261008/manifest.json` memiliki hash SHA-256 masing-masing file. Snapshot directory serta hasil ekstraksi `memory-v1-full.zip` dibandingkan byte-for-byte.
- `runtime/backups/memory-v1-pre-v2-20261008/cross-scope-quarantine.json`: 21 link lintas/unscoped dari 15 catatan dikarantina dari graph v2 aktif. V1 dan historical snapshots tetap menyimpan riwayat asli.
- `runtime/backups/memory-v1-pre-v2-20261008/legacy-revision-archive-report.json`: 190 revision snapshots dari 68 file revisions ditautkan ke archive immutable v2.
- `runtime/backups/memory-v1-pre-v2-20261008/transfer-scope-policy.json`: workspace lama yang benar-benar teramati, sebagai data migrasi, bukan path hardcoded dalam source.

## Kandidat v2 dan verifikasi migrasi

- `runtime/memory-v2-candidate-20261008`: 123 record (122 catatan non-pinned + satu foundation). Catatan dipertahankan, metadata experience-v2 ditambahkan.
- `runtime/tmp/memory-v2-restore-post-history-20261008`: complete export/import isolasi berhasil, 123 record terbaca, replay idempotent; tidak memakai canonical Memory aktif.
- Penyalinan 71 legacy sidecars awal berhasil (feedback, retrieval ledger, use receipts, 68 revisions). Revision sidecars original tidak dibuang.
- Active graph cross-scope dibatasi untuk mencegah paparan antar-workspace; V1 historical reference tetap tersedia di arsip immutable.

## Integrasi host dan packaging

- `src/memory/host-runtime.ts`: startup memilih v1 bila marker tidak ada, atau v2 bila marker valid. Gagal tertutup pada marker rusak; format tidak co-write.
- `src/mcp/memory-experience-tools.ts`: dua tool publik `memory_v2_read` dan `memory_v2_write`. Tool v2 memiliki scope berdasarkan identitas controller dari host; tidak menerima identitas/persetujuan palsu dari payload.
- `src/index.ts`, `src/mcp/server.ts`, `src/agent-capability-catalog.ts`: engine terhubung ke external dan Native controller; operasi Memory lama tetap dapat dipanggil.
- `scripts/release/package-release.mjs` dan `packaging-policy.mjs`: artefak engine + NOTICE dibawa saat packaging; Memory v1/v2, candidate root, activation marker, backup dan tmp dilarang ikut dalam arsip produk.

## Prosedur cutover terkontrol — catatan runbook historis

1. Tutup **Agent Core Launcher** secara normal sehingga Core port/service berhenti. Jangan kill paksa.
2. Jalankan `E:\Projects\Agent-Core\ACTIVATE-MEMORY-V2.cmd`. Helper menolak jika Launcher masih ada atau port Core masih terbuka.
3. Helper melakukan preflight transfer; snapshot final v1, memverifikasi bahwa perubahan sejak baseline hanya metadata retrieval append-only; menyalin delta aman, melakukan restore v2 lengkap, membandingkan hash dengan final snapshot dan menulis `runtime/memory-v2-activation.json` PALING AKHIR.
4. Jika terjadi kesalahan, biarkan `runtime/memory` tetap utuh. Jangan hapus file atau memaksa lanjut. Periksa pesan error/artefak, lalu minta audit.
5. Hanya jika command exit 0, jalankan `Agent Core.exe` secara manual. Buka sesi MCP baru untuk memeriksa health v2, retrieval history, task episode + capsule, dan operasi legacy.
6. Baru sebut **SELESAI** bila resident startup dan fresh connector lulus serta histori, contoh record lama, dan writer baru benar-benar terbukti berfungsi.

## Rollback

1. Tutup Launcher secara normal.
2. Jalankan `E:\Projects\Agent-Core\ROLLBACK-MEMORY-V2.cmd`.
3. Helper membuat backup v2 penuh ke `runtime/backups/memory-v2-rollback-*\memory`, menyimpan manifest, lalu memindahkan marker v2 ke backup; tidak menghapus v2.
4. Jalankan Launcher secara manual. Tanpa marker, engine v1 menggunakan `runtime/memory` semula.
5. Jangan otomatis menggabungkan tulisan v2 baru kembali ke v1; simpan v2 untuk review/import terkontrol agar tidak menimpa sejarah.

## Verified vs pending — checkpoint sebelum aktivasi final

- **Verified on Windows:** root build + path policy; host adapter and MCP contracts (10/10), source-compiled v2 standalone; complete isolated restore + idempotent replay; backup and archive integrity. Separate synthetic end-to-end activation → v2 write → full rollback passed without modifying real `runtime/memory`. Live preflight found 123 migrated records, 196 preserved files, and only five access-metadata deltas plus append-only ledger bytes.
- **Windows standalone test caveat:** A wider selected donor suite is not green on this Windows filesystem, with 34 failures largely involving 5-second timeouts, EBUSY/ENOTEMPTY temporary file cleanup, and Windows symlink fixture behavior. The scoped host/transfer/cutover acceptance above passed; no whole-engine Windows suite PASS or production-stability claim is made.
- **External-controller wiring verified:** `src/mcp/handler.ts` now forwards `memoryExperience` into each authenticated MCP server factory. Functional loopback MCP acceptance confirmed `memory_v2_read` and `memory_v2_write` in `tools/list` and a successful `memory_v2_read(capabilities)` call. Host test group 6/6 passed. Full project build/path policy passed, `release:compat` ok=true with 76 tools and 119724/120000-byte manifest. No speed benchmark was run.
- **Fail-closed activation verified:** invoking `ACTIVATE-MEMORY-V2.cmd` while the real Launcher was running returned exit 7 and created neither the activation marker nor production `runtime/memory-v2` root.
- **Pending:** user closes main Launcher normally, runs `ACTIVATE-MEMORY-V2.cmd` and manually relaunches. Then fresh connector must confirm resident v2 health, old Memory read/search, v2 episode/capsule and a controlled v2 write/read; only afterward claim installation finished. Optional monitored rollback drill is separate.
- **NOT claimed:** full-repository regression green, model-aware internal conversation compaction, end-to-end speed improvement across controllers, stable/released package.


### Interrupted restore recovery and verified launcher result

- A prior completed `runtime/memory-v2` restore without an activation marker is **not** evidence that v2 became resident. The donor transfer receipt binds the bundle to its exact destination; newly exported bundles must not be replayed blindly over it.
- Updated `scripts/memory/activate-v2.mjs` verifies every transferable file digest against the pinned staging bundle, archives the equivalent unactivated v2 root as `runtime/backups/memory-v2-interrupted-*`, and restores the final root cleanly. Five access-only Memory deltas plus the ledger were tested on a separate fixture for first application and idempotent replay.
- Full isolated activation → v2 synthetic write → rollback passed with original v1 untouched; the interrupted v2 root is retained and audited rather than deleted.
- `ACTIVATE-MEMORY-V2.cmd` now writes `runtime/backups/memory-v2-activation-last.log`. A clean result is not 'no visible error': it must show **VERIFIED ACTIVATION**, a marker at `runtime/memory-v2-activation.json`, and a normal launcher restart.
- Current live state after another inspection: two `Agent Core` processes running; activation command safely rejected with exit `7` and logged `FAILED: Launcher still running. No activation started.` **No marker or active v2**. Close the Launcher and run the CMD from the `E:` project root again; do not run it while connected to a running Core.
- No speed benchmarks were executed. Live external + Native controller acceptance remains pending after the successful cutover.

### 2026-10-09 — exFAT lease fix and safe repeat activation

**Observed incident:** On volume `E:` (`exFAT`), the first production activation failed with `MEMORY_LOCK_COMPROMISED` from `proper-lockfile`. The physical directory mtime was rounded to two-second intervals; the v2 heartbeat expected the exact requested millisecond value. The v1 canonical root stayed intact and no v2 activation marker was published.

**Correction:** v2's existing lock owner now uses a scoped Windows timestamp adapter, preserving atomic exclusion and detecting unexpected physical directory changes. Export acquires a consistent snapshot under the lock, then validates/serializes copied data outside the lock. No lock bypass or global dependency change was introduced.

**Retry with new evidence:** If old `runtime/backups/memory-v1-final-before-v2-20261008` is valid but live v1 has newer retrieval-only data, the script now creates an additional immutable `memory-v1-final-before-v2-20261008-retry-...` snapshot. The host accepts only a validated base/retry manifest reference with the correct digest; originals are never overwritten. Semantic changes outside the reviewed migration policy still block cutover.

**Functional acceptance, not benchmark:** an actual exFAT lease and cross-process exclusion test passed; selected transfer tests 3/3; root host/MCP/schema tests 12/12; full project build and compatibility pass (76 MCP tools). Full isolated activation → v2 write → rollback passed twice, including once with a simulated appended v1 retrieval ledger and versioned final freeze. Details and local patch ownership: `SubProject/agent-core-memory/PATCHES.md`.

**Live status at this documentation update:** `runtime/memory-v2-activation.json` remains absent. `runtime/memory` (v1) is still the active Memory root. The source/build is ready but the production cutover must be executed while Launcher is **fully closed**.

**Next operator action:** close Agent Core Launcher normally; run `cmd.exe /k "E:\Projects\Agent-Core\ACTIVATE-MEMORY-V2.cmd"`; wait for `VERIFIED ACTIVATION`, then relaunch Agent Core and reconnect ChatGPT. If the marker is absent or a failure is logged in `runtime/backups/memory-v2-activation-last.log`, do not delete/force-overwrite any Memory files.

**Final acceptance required before saying SELESAI:** resident health says experience-v2, legacy records remain readable, `memory_v2_read`/`memory_v2_write` are visible on fresh connector, and task episode/capsule and a controlled write/read succeed. Promote the verified migration result to the NEW canonical Memory only after the marker has been issued, so legacy v1 is not modified between frozen snapshots.

### 2026-10-09 — Successful production activation (updated status)

- User-run `ACTIVATE-MEMORY-V2.cmd` printed `VERIFIED ACTIVATION` and an activation
  report with `activated:true`, 123 records, five reconciled v1 metadata records
  and a preserved interrupted-restore backup.
- The fresh external Agent Core connector now **actively uses experience-v2**:
  `memory_v2_read(capabilities)` returns `writeMode:experience-v2`, while
  `memory_status` confirms canonical health available, 123 initial records, zero issues.
- Full initial v1/v2 record parity and exact historical v1 expansion passed.
- Live task episode, event append, capsule checkpoint and task context readback passed.
- See `docs/Agent-Core-Memory-v2-Live-Acceptance-20261009.md` for current evidence.
- The previous paragraphs describing v2 as not activated remain historical incident
  evidence and are superseded by this section for current runtime status.
- Controlled durable Memory write/read finalization follows as the last acceptance
  before calling the production installation finished.

### 2026-10-09 — Production installation and functional acceptance SELESAI

- The prior *pending activation* paragraphs are historical evidence; this section
  supersedes them for the currently connected Agent Core instance.
- Valid marker, matching final legacy snapshot digest, resident external MCP
  `writeMode=experience-v2`, old Memory read/search, exact historical v1 expand,
  live episode/event/capsule and task-context readback have all been exercised.
- Full initial v1/v2 parity: 123 records preserved with zero missing/unexpected IDs or
  changes to original record contents. The original v1 root and backups remain untouched.
- A new durable production record, ID `1099ff1c-aef0-4d31-b2e5-86cbe74402be`,
  was saved through the legacy Memory API into v2 format, then read through both
  the legacy read API and v2 recall. Result: 124 canonical records, zero issues.
- Installation and current external-controller functional acceptance are **complete**.
- Real cross-provider continuation, Native-Agent-specific runtime acceptance and
  general Windows full-regression stability remain separately unverified.
- No speed or throughput benchmarks, Git publish, release apply or production rollback.
