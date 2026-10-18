# External Memory Workflow — Windows Build dan Isolated Acceptance (17 Oktober 2026)

**Jenis:** laporan engineering source/build/MCP/fixture, bukan resident deployment, release, plugin installation atau eksperimen kemampuan belajar. **Status selama penulisan:** final targeted suite masih dieksekusi; hasil akhirnya dicatat di bagian penutupan. Pembacaan dan penulisan dilakukan pada Windows dalam root `E:\Projects\Agent-Core`.

## 1. Source dan boundary yang dipegang

- Branch: `codex/cumulative-learning-workflow`. Dasar lokal saat pemeriksaan: `e69bcf5d3bd4c597a9e8a0c2735c044324b5c120`, dengan perubahan P1–P5 lokal yang **tidak** di-reset atau ditimpa. `main` Batch17 adalah sibling branch terpisah; tidak merge, cherry-pick, commit atau push.
- Sebelum tindakan sudah ada file modified yang bukan milik task: `MEMORY.md`, `docs/Batch16-Windows-Exact-Task-Verification-20261016.md`, `docs/research/candidate-source-review-216-20261012.json`; ketiganya dipertahankan.
- Canonical data `runtime/memory`, episode pengguna, Learning checkpoint produksi, server resident, provider inference, reindex, migrasi, restart, release, upload plugin dan backup tidak menjadi target tulis. Seluruh synthetic fixtures/logs berada di `runtime/tmp/memory-external-p1p5-20261017-o5WMD3` atau root sementara unik yang dikelola test runner di bawah `runtime/tmp`. Temporary HTTP MCP tests memakai bind loopback port 0 dan menutup **server milik fixture sendiri**; tidak memakai port/proses resident.
- Owner Memory khusus tetap `src/memory`, transport `src/memory/mcp`. Native, Learning dan MCP umum memanggil owner yang sama. `dist` dihasilkan hanya oleh build resmi, tidak diedit manual.

## 2. Build dan manifest terkompilasi

| Perintah | Exit | Output milik task |
| --- | --- | --- |
| `npm run build` (awal, sebelum kasus negatif baru) | **0** | `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/build-initial.log` dan `build-initial.receipt.json` |
| `npm run build` (sesudah perbaikan Learning/reporting) | **0** | `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/build-final.log` dan `build-final.receipt.json` |
| `npm run build` (sesudah deferred MCP ledger admission) | **0** | `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/build-after-admission-gate.log` dan `build-after-admission-gate.receipt.json` |
| `node scripts/release/release-compat.mjs --manifest-only --output docs/memory/External-Memory-MCP-Manifest-20261017.json` | **0** | `docs/memory/External-Memory-MCP-Manifest-20261017.json`; receipt `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/manifest-final-receipt.json` |
| `node scripts/release/release-compat.mjs --manifest-only` | **0** (pre-final admission-gate check) | `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/manifest-only-confirm.receipt.json` |

**Official build detail:** `npm run path:check && tsc -p tsconfig.json`, path policy **413 authored files, 0 exceptions**; build akhir exit 0. Tidak ada package dependency, compiler rule, runtime service atau port produksi diganti.

**Final manifest full cohort:** **79 tool, 130803 byte**, batas **131072**, sisa **269 byte**; SHA-256 `0a66feae8bbbf3078134ed1bd0ac1e68f0f9e088253991bf47903779da414126`. Script melaporkan `available=true`, `stale=false`, `exceeded=false` untuk reviewed cohort 76 tools/124297 bytes; expanded full-with-controller cohort 79 tools/130803 bytes, diukur langsung dari JSON output. Lima deskripsi publik (`memory_export`, `memory_import`, `memory_delete`, `memory_batch`, `memory_feedback`) ada beserta inputSchema. File awal dengan digest sama disimpan sebagai `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/manifest-before-delivery-gate.json` untuk audit, bukan dua manifest dalam docs.

**Plugin:** manifest dan dist telah dihasilkan, namun ZIP yang mapping app ID-nya sama dengan plugin terpasang **belum dibuat/diunggah**. Paket lokal lama yang diperiksa pada task sebelumnya memakai mapping app lain; jangan menebak ID/versi. Metadata yang masih dibutuhkan untuk packaging tahap berikut: current release `.app.json` (app mapping/ID) serta `.codex-plugin/plugin.json` (plugin technical name, semantic version dan current packaging metadata) dari **plugin yang benar-benar terpasang**. Refresh saja bukan bukti upgrade. Tidak ada runtime activation baru.

## 3. Masalah source yang dibuktikan oleh pemeriksaan dan koreksi

| Gejala/kasus awal | Akar masalah dan perubahan minimal | Status evidence |
| --- | --- | --- |
| 4/53 awal failed pada `tests/adoption-reuse-wiring.test.ts` (baseline 7 file) | Fixture memanggil `artifactReceipt` tanpa host-issued invocation dan memakai import `initializeStandaloneMemory` yang sudah tidak diekspor. `tests/adoption-reuse-wiring.test.ts` kini memakai `initializeMemoryRoot` dan `captureToolInvocationContext` valid, bukan melemahkan `verificationTarget`. | Targeted rerun `tests-adoption-corrected.log`: **8/8 PASS**. |
| Reported result hilang pada receipt unverified | `ExternalControllerLearningService.artifactReceipt` dahulu menimpa `input.result` dengan `unavailable` sebelum diteruskan ke `LearningService.receipt`. Source `src/learning/external-controller.ts` kini mempertahankan `callerReportedResult` untuk write dan verifier existing menyimpan independently checked `result=unavailable`. | P3 asserts `reportedResult:'success'` dan `result:'unavailable'` bersama pada fixture terisolasi. |
| Replay Memory receipt menggandakan episode artifact-use | `recordArtifactEvent` menambahkan event/metrik pada setiap replay padahal Memory ledger sudah idempotent. Marker `receipt:<useId>`, task head checks dan duplicate suppression ditambahkan pada `src/learning/external-controller.ts`. | P2/P3 fixture membaca **1 receipt dan 1 event** setelah dua panggilan identik; feedback juga hanya satu. |
| Ledger accepted incomplete handoff status | `confirmedDelivery` dahulu tidak mengecek `retrievalStatus='succeeded'` dan `selectedCount>=1` secara eksplisit. Guard ditambahkan di `src/memory/retrieval-ledger.ts`, tetap memakai task/workspace/attempt/memory/digest/disposition/handoff yang sama. | Kasus negatif failed retrieval, dropped, not-attempted handoff, failed handoff, wrong ID/digest tidak memberi positive delivery. |
| Cancelled/discarded MCP result dapat menjadi canonical returned attempt | `ControllerMemorySession.recall` sebelumnya mencatat exposure sebelum final MCP handler memastikan serialisasi, cancellation dan validasi host-head. Khusus **direct v2 MCP recall**, `MemoryService.controller` kini menerima internal deferred exposure callback, `src/memory/mcp/experience-tools.ts` menahan attempt dalam memori request dan baru memanggil `MemoryService.recordControllerDisclosure` setelah response ter-serialize, tidak aborted dan scope checker `src/mcp/server.ts` masih mengonfirmasi bound/current task. Native/planned session tetap jalur yang ada. | Isolated cancellation dan scope-rotation sebelum admission: tidak ada ledger returned entry yang bisa di`confirmedDelivery`, tidak ada episode mirror. Positive direct v2 returned tetap mempunyai canonical attempt dan satu mirror. |
| Repeated Learning keyed review sesudah `no-new-knowledge` ditolak oleh `LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND` | `src/mcp/learning-tools.ts` memerlukan pending key walaupun Learning sudah menyimpan keyed completed decision dan episode sudah menutupnya. Read-only exact completed replay kini memeriksa same task/workspace/key/disposition dari `LearningService.status`; apabila cocok, kembalikan `duplicate:true, externalEpisodeLinkage:not-required` tanpa menulis state. Foreign, unknown atau changed-disposition tetap ditolak. | P4 test menyimpan bytes `learning/state.json` sebelum/sesudah replay dan memeriksa sama, pending lain tetap satu. |

Keterbatasan bukti: hasil tool, controller-reported use, verified outcome, helpful feedback dan manfaat kausal Memory adalah klaim berbeda. Pengujian ini tidak mengesahkan manfaat kausal atau penggunaan Memory oleh pengguna nyata.

## 4. Matriks acceptance fungsional pada source final

| Tahap / batas | Pengujian dan hasil nyata | Status |
| --- | --- | --- |
| P1 — current task next step | `tests/memory/memory-task-reconnect.test.ts`: episode/start, controller status, task A→B dan foreign owner; workflowNext bound current dan tidak mengungkap task sebelumnya. | **PASS** |
| P2 — returned v2 hits only | Recall limit 1 atas beberapa synthetic note; payload berisi satu hit dan hanya satu key di deliveredMemories/ledger. Insufficient budget 512 tidak menambah attempt; suppression dihitung dari hasil serialisasi. | **PASS** |
| P2 — reconciliation canonical | Bypass mirror pada synthetic host-issued task; `confirmedMemoryDelivery` exact attempt/task/workspace/id/digest, rejected/applied outcome nyata, dua panggilan identik menghasilkan satu receipt dan satu artifact-use event. | **PASS** |
| P2 — negative handoff | Failed retrieval, dropped disposition, not-attempted/failed handoff, ID/digest/attempt/workspace salah → tidak ada positive delivery. | **PASS** |
| P2 — cancellation/late admission | Abort sebelum final output, task scope berubah sebelum ledger admission, invocation lama setelah task rotation → tidak ada canonical returned attempt yang layak receipt dan tidak ada mirror palsu. | **PASS** |
| P3 — host-bound use dan feedback | Exact external host invocation, applied/rejected, valid actionRefs, verified success vs independently unavailable, wrong owner dan unbound Learning receipt ditolak. Dua equivalent calls → satu Memory feedback helpful; result yang belum valid tetap unavailable, reportedResult dipertahankan. | **PASS** |
| P4 — scoped Learning and idempotency | Checkpoint keyed task A/B, scope mismatch ditolak, mirror failure → linkage unavailable sementara Learning durable; repeat checkpoint memulihkan linkage; keyed no-new-knowledge menutup hanya task A; completed keyed review replay tidak mengubah bytes `learning/state.json`. Native head tidak ikut terganti. | **PASS** |
| P5 — revision/sourceRef dan budget | SourceRef, digest, excerpt berasal dari snapshot recall sama; serialized excerpt+SourceRef ≤1400 byte/item. Expand exact revision dan cursor; source berubah di tengah pencarian tetap mengembalikan referensi/caption snapshot awal. | **PASS** |
| Mode v2 dan batas data | Legacy `memory_export` mengembalikan `status=unavailable`/`MEMORY_TRANSFER_V2_UNSUPPORTED`; physical `delete` ditolak `MEMORY_PRESERVATION_REQUIRED`. Negative malformed activation/foreign owner/invalid path traversal ditolak. | **PASS** |
| Native regression terarah | `tests/memory/memory-task-reconnect.test.ts` dan `tests/memory/memory-v2-host-integration.test.ts`: Native task stabil lintas tool sessions; foreign selector/missing workspace gagal aman. | **PASS** |

**Final integrated command:** `node node_modules/vitest/vitest.mjs run tests/adoption-reuse-wiring.test.ts tests/memory/memory-task-reconnect.test.ts tests/memory/memory-v2-host-integration.test.ts tests/memory/memory-scope-mcp.test.ts tests/mrr3-knowledge-use-receipt.test.ts tests/memory/engine/memory-receipt-integrity.test.ts tests/memory/memory-outcome-live-gate.test.ts`. **Exit 0; 7 files PASS; 64/64 tests PASS.** Log: `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/tests-final-p1p5-seven.log`, receipt `tests-final-p1p5-seven.receipt.json`.

### Preservation suite: keterbatasan Windows exFAT

Suite tambahan lengkap `tests/memory/engine/memory-preservation.test.ts` awalnya exit 1 dengan 3 gagal/27 berhasil: dua test gagal saat *membuat fixture symlink*, bukan karena safeguard Memory. Probe lokal `fs.symlinkSync` menghasilkan `EISDIR`; `mklink /J` menghasilkan pesan "Local NTFS volumes are required"; `fsutil fsinfo volumeinfo E:` mengonfirmasi **exFAT**. Assertions symlink tidak dihapus/dilemahkan. Kasus audit-only-history sebelumnya melewati default 15000 ms ketika bersaing untuk I/O; rerun sendiri dengan `--testTimeout 60000` lulus dalam 10.294 detik.

**Run penyelesaian lingkungan yang didukung:** `node node_modules/vitest/vitest.mjs run tests/memory/engine/memory-preservation.test.ts --testTimeout 60000 --testNamePattern "^(?!.*symlink).*"`. **Exit 0; 28 PASS, 2 SKIPPED (symlink creation unavailable on exFAT)**. Log `runtime/tmp/memory-external-p1p5-20261017-o5WMD3/tests-preservation-exfat-supported.log` dan receipt bernama sama. Kedua symlink fisik **NOT RUN**, bukan PASS. Bila pemilik ingin menuntaskan cakupan symlink itu, diperlukan sandbox **NTFS** yang dapat membuat symlink/junction dan otorisasi menjalankan dua test tersebut pada sandbox itu; tidak ada kebutuhan mengubah guard canonical atau data pengguna.

### Dua utilitas offline (bukan inference)

- `node scripts/memory/evaluation/reconsolidation-offline.mjs --suite <runtime/tmp/.../fixtures/reconsolidation-suite.json> --output <runtime/tmp/.../reconsolidation-offline-result.json>` → **exit 0**, `mode=scripted-offline`, `verdict=pass` untuk fixture, `benefitProven=false`. Log `reconsolidation-offline-cli.log`.
- `node scripts/memory/outcome/memory-outcome-diagnostics.mjs --suite <runtime/tmp/.../fixtures/diagnostic-suite.json> --sidecar <runtime/tmp/.../fixtures/diagnostic-sidecar.json> --observations <runtime/tmp/.../fixtures/diagnostic-observations.json> --evidence-root <runtime/tmp/.../fixtures/diagnostic-evidence> --phase baseline --output <runtime/tmp/.../offline-diagnostics-report.json>` → **exit 0**, laporan `complete=false`, `integrityStatus=FAIL` karena intentionally missing `missing-diagnostic-trace`. **PASS hanya untuk pembuktian guard negatif**, bukan PASS terhadap integritas evidence/benefit. `live=NOT RUN`. Log `offline-diagnostics-cli.log`. Guard `LIVE_AUTHORIZATION_UNVERIFIED` tidak diubah; tidak ada provider/inference dipakai.

## 5. Daftar file source, tests dan dokumentasi milik tahap ini

**Source yang diperbaiki dalam build/acceptance ini:** `src/learning/external-controller.ts` (original result, receipt event dedup), `src/mcp/learning-tools.ts` (exact completed review replay), `src/memory/retrieval-ledger.ts` (retrieval-status guard), `src/memory/service.ts` (request-scoped deferred disclosure owner), `src/memory/mcp/experience-tools.ts` (serialisasi/cancellation/current scope gate), `src/mcp/server.ts` (external host invocation checker). File P1–P5 yang diubah sebelum tahap ini seperti `src/mcp/controller-learning-tools.ts` dan `src/memory/mcp/tools.ts` turut dibangun/diperiksa tetapi bukan penemuan baru tahap ini.

**Tes terarah yang disesuaikan:** `tests/adoption-reuse-wiring.test.ts` (fixture host-bound API), `tests/memory/memory-task-reconnect.test.ts` (P1–P5, cancellation, late/scope, negative ledger), `tests/memory/memory-v2-host-integration.test.ts` (export/delete experience-v2 guard). Suite lama lain dibaca dan dipakai apa adanya; tidak menulis history agar terlihat lulus.

**Artefak/dokumen final:** `docs/memory/External-Memory-Workflow-Build-Acceptance-20261017.md` (laporan ini), `docs/memory/External-Memory-MCP-Manifest-20261017.json`, `docs/memory/PLAN-EXTERNAL-MEMORY-WORKFLOW-COMPLETION.md`, `docs/CODEBASE.md`, `docs/memory/WORKFLOW.md`, dan `docs/diagrams/Agent-Core-Memory-Workflow-20261016.mmd`. Changeset intent dari tahap source sebelumnya `.changeset/20261017-external-memory-workflow-closure.md` dipertahankan. Tidak ada file proyek lain dibersihkan.

**Kepemilikan artefak isolated:** semua `*.log`, `*.receipt.json`, fixture dan laporan JSON eksperimen dalam `runtime/tmp/memory-external-p1p5-20261017-o5WMD3` adalah buatan tugas ini. Test runner memakai subroot temporary terpisah dalam `runtime/tmp`, bukan canonical production root. Tidak ada permintaan untuk menghapus artefak tersebut; biarkan sebagai audit trail. Temporary REPL milik tugas ditutup setelah final readback.

## 6. Status dan tindakan berikutnya

| Lapisan | Hasil sesungguhnya |
| --- | --- |
| Source | **IMPLEMENTED**, tetap satu owner `src/memory` dan kompatibilitas Native terjaga pada tes terarah. |
| Official build | **COMPLETED / PASS**, exit 0, 413 authored files/0 path exceptions, `dist` hasil build resmi. |
| Targeted isolated functional acceptance P1–P5 | **COMPLETED / PASS: 64/64** dalam 7 suites; tidak memakai production data. |
| Additional preservation checks | **28/28 PASS** pada exFAT; **2 symlink fixtures NOT RUN** karena filesystem tidak mendukung pembuatan symlink; jangan dipresentasikan sebagai full 30/30. |
| Offline evaluation utilities | CLI reconsolidation berjalan dan fixture verdict pass; diagnostics negative guard mengembalikan integrity FAIL yang tepat; tak ada live inference/benefit claim. |
| Manifest/plugin packaging | Manifest **COMPLETED / 130803 bytes under limit**; **ZIP aktif belum dibuat**, karena identitas/current release manifest plugin terpasang yang cocok belum tersedia; Update Plugin belum dilakukan. |
| Runtime activation | **NOT PERFORMED**: resident tidak restart, belum ada current source readback dari resident. |
| Git | Local branch/HEAD tetap baseline; no commit/merge/push; pekerjaan lokal pengguna tetap utuh. |

**Keputusan label tahap:** **COMPLETED untuk build resmi dan pengujian fungsional terisolasi P1–P5** dengan bukti exit code dan persisted fixture; tidak menyatakan seluruh repository, resident activation, plugin update ataupun dua kasus symlink sebagai VERIFIED/PASS. Jika tahap berikutnya memerlukan integrasi/deploy, itu persetujuan terpisah.

**Hanya kebutuhan pemilik yang benar-benar tersisa:** (1) lingkungan pengujian **NTFS** bila ingin kedua symlink-specific test; (2) metadata actual installed plugin — `.app.json` dan `.codex-plugin/plugin.json` / current release version beserta app mapping sah — bila ingin membuat ZIP untuk **Update Plugin**; (3) izin terpisah bila ingin restart/aktivasi resident, deploy, merge atau push. **Tidak perlu ZIP untuk menyatakan keberhasilan source/build/test tahap ini.**


## 7. Adaptive real-symlink fixture follow-up — 17 Oktober 2026 (hasil terbaru dua kasus tertunda)

**Cakupan:** dua pengujian asli tetap bernama **standalone refuses a symlinked root before creating any foundation outside it** dan **parent-directory symlink aliases are rejected before bootstrap**. Pertama menguji root canonical yang langsung diarahkan ke symlink; kedua menguji komponen ancestor symlink dalam jalur calon root (`parent-alias/nested`). Keduanya tetap memanggil `initializeMemoryRoot`, mensyaratkan error persis `MEMORY_PATH_SYMLINK` dan memastikan direktori target sintetis di luar calon root tetap kosong. Source guard `src/memory/initialize.ts::initializeMemoryRoot` → `src/memory/transaction.ts::assertContainedPath` **tidak diubah**.

**File/helper minimal:** `tests/memory/engine/memory-preservation.test.ts` (helper `root(base?)` yang sudah ada, `adaptiveSymlinkFixture`, `probeRealDirectorySymlink`, dan `afterEach`). Tidak ada dependency, tool, subproject, startup hook, engine Memory, migrasi, atau perubahan proses produksi. `docs/CODEBASE.md` dan plan diselaraskan. Kandidat dihitung ulang setiap eksekusi dari project `runtime/tmp`, `os.tmpdir()`, `TEMP/TMP`, `LOCALAPPDATA/Temp`, serta user-home temp dari `HOMEDRIVE/HOMEPATH` Windows, **tanpa username/drive/path mesin hardcode**.

**Proteksi fixture:** probe via `mkdtemp` membuat target sintetis kosong lalu mencoba `symlink(target,link,'dir')` — **directory symbolic link nyata**, bukan junction atau mock. `lstat`, `readlink`, `realpath`, jenis direktori, dan exact target harus cocok; label filesystem dibaca read-only via `Get-Volume` jika tersedia. Probe symlink nyata, bukan label NTFS, menentukan hasil. Pada tempat yang didukung, satu root unik baru memiliki direktori saudara `inside` dan `outside`; link di `inside`, target di `outside`. Alokasi unik tidak memakai lock atau marker historis. Teardown memeriksa root hasil `mkdtemp` dan tujuan link, melakukan `unlink` tanpa mengikuti link, lalu menghapus **hanya root fixture milik eksekusi**. Jika tidak aman, root unik dibiarkan beserta detailnya dan tidak ada recursive cleanup temp umum.

| Kandidat aktual | Filesystem | Probe directory symlink | Pembersihan probe |
| --- | --- | --- | --- |
| Project `runtime/tmp` | exFAT | `EISDIR` — tidak didukung | `clean` |
| User temp melalui `LOCALAPPDATA` yang diarahkan | exFAT | `EISDIR` — tidak didukung | `clean` |
| User-home temp melalui `HOMEDRIVE/HOMEPATH` | NTFS | `EPERM` — user token tanpa izin membuat symlink | `clean` |

**Interpretasi:** kedua test memanggil selector tetapi **tidak ada link yang bisa dibuat**, sehingga assertion `MEMORY_PATH_SYMLINK` tidak dijalankan. Hasilnya **2 NOT RUN**, **bukan 2/2 PASS**. `whoami /priv` tidak mencantumkan `SeCreateSymbolicLinkPrivilege` pada token tes; status Developer Mode tidak terverifikasi melalui pemeriksaan read-only. Tidak ada perubahan ACL, registry, privilege, Developer Mode, volume, atau hak akses sistem.

**Perintah/log:**

- `npm run build`: **exit 0**; `PATH POLICY PASS — 413 authored files, 0 exceptions`. Log/receipt di `runtime/tmp/adaptive-symlink-acceptance-20261017-24wOm4/build-adaptive-symlink.log` dan `build-adaptive-symlink.receipt.json`.
- `node node_modules/vitest/vitest.mjs run tests/memory/engine/memory-preservation.test.ts --testNamePattern "standalone refuses a symlinked root|parent-directory symlink aliases" --reporter verbose`: **exit 0**, dua test yang dipilih **dynamic SKIPPED (NOT RUN)**. Vitest melaporkan `30 skipped` karena 28 kasus lain dikecualikan oleh filter; log per-kasus memuat probe/`cleanup:clean` di `runtime/tmp/adaptive-symlink-acceptance-20261017-24wOm4/two-symlink-final.log` dan `two-symlink-final.receipt.json`.
- Regresi 28 kasus non-symlink yang memakai helper `root` bersama dieksekusi terpisah. Log/receipt: `runtime/tmp/adaptive-symlink-acceptance-20261017-24wOm4/preservation-helper-regression.log` dan `preservation-helper-regression.receipt.json`. Status finalnya dicatat di bawah sesudah exit code tersedia.

**Sisa keputusan yang memerlukan user:** sediakan atau izinkan konteks *test-only* Windows pada NTFS yang memiliki hak membuat **directory symbolic link** (misalnya Developer Mode yang disetujui pemilik atau token dengan `SeCreateSymbolicLinkPrivilege`); lalu **jalankan ulang kedua test asli**. Perubahan ini sendiri tidak membuat startup Agent Core.exe bergantung pada symlink. Memory produksi `runtime/memory` dan proses resident **tidak dijadikan target tes**.


**Readback regresi helper setelah perubahan:** `node node_modules/vitest/vitest.mjs run tests/memory/engine/memory-preservation.test.ts --testTimeout 60000 --testNamePattern "^(?!.*symlink).*"` → **exit 0, 28 PASS, 2 SKIPPED** (kedua symlink tidak dipilih karena filter). Log/receipt: `runtime/tmp/adaptive-symlink-acceptance-20261017-24wOm4/preservation-helper-regression.log` dan `preservation-helper-regression.receipt.json`. Ini bukti bahwa helper `root` dan teardown tidak merusak 28 kasus lain, **bukan** bukti dua guard symlink lulus.

**Teardown dan sisa artefak:** setiap probe menghasilkan direktori unik di kandidat yang bersangkutan, dan kedua eksekusi melaporkan `cleanup:clean` untuk ketiga kandidat (enam probe total). Karena tidak ada kandidat yang lolos, **tidak ada actual symlink fixture root yang dialokasikan** untuk dua test. Output log, receipt build/test dan metadata tetap tersimpan **hanya** di direktori proyek `runtime/tmp/adaptive-symlink-acceptance-20261017-24wOm4` sebagai bukti tugas; tidak dibersihkan. Tidak ada symlink tersisa yang diketahui dari eksekusi ini. Kesimpulan terakhir: **fixture selector SOURCE READY; real symlink assertions BLOCKED oleh permission NTFS pada token user saat ini**. Belum layak dinyatakan `2/2 PASS` atau `COMPLETED` untuk dua pemeriksaan tersebut.


## 8. Actual real symlink test rerun and opt-in fixed SYSTEM task source — 17 Oktober 2026

**Two original test names:** `standalone refuses a symlinked root before creating any foundation outside it` and `parent-directory symlink aliases are rejected before bootstrap`. In this task both actually executed `initializeMemoryRoot` against genuine NTFS directory symlinks, asserted `MEMORY_PATH_SYMLINK`, and checked the synthetic sibling destination remained empty. **Result 2/2 PASS**, **28 filtered SKIP**; Vitest process **exit 0**. Both synthetic roots were removed, per-test log contains `MEMORY_SYMLINK_FIXTURE_TEARDOWN cleaned:true`. This is an independent new execution, not reuse of earlier fixture/PASS.

**Critical scope note:** read-only Windows token probe shows the test subprocess inherited **High Mandatory Integrity (Administrators enabled)**, and `SeCreateSymbolicLinkPrivilege` listed Disabled but symlink operations nonetheless succeeded. Thus these 2/2 verify the path guard with real symlinks **under this elevated token only**. They do **not** establish that a Medium Integrity test process can create links nor that an installed Scheduled Task can provide links UAC-free. The protected Scheduled Task has **NOT** been installed or run. A read-only check confirmed proposed ProgramData folder absent, named task absent and `HKCU\Software\AgentCore\SymlinkFixture` key absent.

**Source staged:** `scripts/windows/Install-Agent-Core-Symlink-Fixture.ps1` (preview + explicit UAC install/uninstall), `scripts/windows/Invoke-Agent-Core-Symlink-Fixture.ps1` (non-elevated Status/Prepare/Cleanup), `scripts/windows/Agent-Core-Symlink-Fixture-Worker.ps1` (fixed task helper to be copied under protected NTFS only). `tests/memory/engine/memory-preservation.test.ts::adaptiveSymlinkFixture` now has optional fixed-Scheduled-Task fallback after native symlink probe: prepared real links are verified and then used in both original assertions; privileged fixture cleanup has a dedicated safe path. No test runner or Agent Core is executed elevated by the helper. No general privileged command accepted from registry; no change to `src/memory`, task restart files, registry settings, UAC, Developer Mode, user permission, NTFS ACL or canonical Memory on this source-staging task.

**Checks performed:** Parser.ParseFile on all 3 Windows scripts **exit 0, zero errors**; `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Install-Agent-Core-Symlink-Fixture.ps1 -Mode Preview` **exit 0**, source-only/no UAC; `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Invoke-Agent-Core-Symlink-Fixture.ps1 -Operation Status` **exit 3**, expected `SYMLINK_SETUP_REQUIRED`. `npm run build` **exit 0**, 416 authored files / 0 path exceptions. Targeted command `node node_modules/vitest/vitest.mjs run tests/memory/engine/memory-preservation.test.ts --testNamePattern "standalone refuses a symlinked root|parent-directory symlink aliases" --reporter verbose` **exit 0, 2 passed/28 filtered skipped**. Log and receipt: `runtime/tmp/one-time-uac-symlink-source-review-tc4gM3/build.log`, `build.receipt.json`, `two-original-symlink-tests.log`, and `two-original-symlink-tests.receipt.json`.

**INSTALLATION APPROVAL GATE:** documented in `docs/memory/ONE-TIME-UAC-SYMLINK-FIXTURE-SETUP-20261017.md`: proposed ProgramData ACL-protected NTFS root, fixed on-demand SYSTEM task name, registry metadata, task ACL, operation contract and safe uninstall. **Do not run installation before explicit approval for the external protected folder/privileged persistent task**. After that, prove normal-user Medium Integrity Prepare → receipt → actual lstat/realpath → Cleanup and rerun both tests; only then mark the "one UAC for later normal calls" workflow verified. Plugin/restart/production Memory are unrelated.


## 9. Same-machine on-demand SYSTEM helper after explicit user approval — 17 Oktober 2026

Previous `2 NOT RUN` and source-staged descriptions are **historical snapshots**. User explicitly approved the planned fixed SYSTEM Scheduled Task and ACL-protected NTFS ProgramData install. Approved setup entrypoint `Install-Agent-Core-Symlink-Fixture.ps1 -Mode Install` was invoked (outer exit 0) and live readback confirmed installed task/root/HKCU, checked worker SHA, task ACE normalization and one fixed action/zero triggers. **Visual UAC prompt itself not independently observed**: the launching session was already admin-capable.

**Source fix 1:** task ACL had no excessive rights; Windows normalized registered SDDL mask values from GA/GRGX to `001F01FF` (SYSTEM/Admin) and `001200A9` (user RX). The normal caller's overly literal ACL validator initially failed with `SYMLINK_SETUP_REQUIRED:Task grants excessive privilege`. Updated only `scripts/windows/Invoke-Agent-Core-Symlink-Fixture.ps1::Assert-Install` to accept these exact equivalent rights. Caller Status then exit **0**; no task re-registration or ACL widening.

**Source fix 2:** restricted-token Cleanup initially reported a sharing violation while reading a receipt still opened `FileShare.None` by the SYSTEM writer. Independent readback confirmed the worker had actually cleaned the fixture and committed a status-ok receipt. The client now re-reads the **same receipt** until the writer closes it, catches transient `IOException`, keeps the original timeout and **never retries Task.Run**. Protected worker installed bytes/hash stayed identical.

| Check | Actual results |
| --- | --- |
| Setup / task | Installer outer exit **0**. Folder/task/HKCU exist. Task owner Administrators; principal SYSTEM, logon type 5, zero triggers, one action, enabled, last result 0. Protected root owner Administrators, non-inherited ACL with SYSTEM/Admin Full, target SID ReadAndExecute. Worker source/installed SHA equal. |
| Normal client status | Exit **0** after source validator fix. |
| Initial fixed task Prepare and Cleanup | Both exit **0**; two genuine `lstat.isSymbolicLink` directory links, exact target verified, target empty, owned fixture removed. |
| Restricted caller `runas /trustlevel:0x20000` | Group Administrators **disabled**; High Integrity mandatory label (not Medium). Normal client Prepare **0** / Cleanup **0**, two link/target proofs, fixture cleanup true. No `RunAs`/UAC calls made by normal client. |
| Both original Memory guard tests under restricted caller | Exit **0**; **2 PASS, 28 filtered SKIP**, two `MEMORY_SYMLINK_PRIVILEGED_FIXTURE` records and two `MEMORY_SYMLINK_FIXTURE_TEARDOWN cleaned:true kind:fixed-scheduled-task`; Memory path guard `MEMORY_PATH_SYMLINK` and empty target checks actually executed. |
| Final fixture state | ProgramData `fixtures` directory has **0 active GUID subdirectories**; 10 owned protected receipts retained as evidence. |
| Syntax/build | Parser three PS1 files **exit 0, 0 errors**; final official `npm run build` **exit 0**, path policy **416 authored files, 0 exceptions**. |
| Boundaries | No restarts, no production canonical Memory writes, migration/reindex, plugin update, new dependencies, merge/push/release or deletion of foreign data. |

**Owned evidence:** `runtime/tmp/one-time-uac-install-approved-BNExBg` — install log/receipt, initial Prepare/Cleanup/readback JSON, original restricted client receipt-sharing violation (preserved), corrected restricted client result JSON, two-test restricted log and receipt, task/readback JSON, PS1 syntax check JSON, and post-fix build log/receipt. All test fixture GUID roots were released; protected receipts and this log directory retained for traceability.

**Meaning of completion:** **one protected helper installed on this same machine and reusable UAC-free via an administrator-disabled token; two real original tests PASS via fixed worker**. An exact *Medium Integrity* token execution is **not separately proven**, because the restricted-token probe retained the High integrity label. No assumptions about other machines, changes to protected worker or visual UAC prompts. Installation and controlled uninstall details: `docs/memory/ONE-TIME-UAC-SYMLINK-FIXTURE-SETUP-20261017.md`.
