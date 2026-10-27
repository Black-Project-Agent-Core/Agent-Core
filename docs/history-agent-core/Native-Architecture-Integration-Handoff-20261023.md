# Handoff — integrasi arsitektur Native Agent Core

Status: **PAUSED atas permintaan pengguna**, 2026-10-23 11:22 UTC (18:22 Asia/Tomsk). Ini catatan pemulihan engineering, bukan Memory pengganti atau bukti implementasi selesai.

## Tujuan dan keputusan pengguna

- Implementasikan rencana induk dari enam proposal OpenClaw, Odysseus, Kimi Code, Hermes, Grok Build, dan DeepSeek. Native tetap mesin utama dan partner kerja serbaguna; utamakan penyelesaian andal, kontinuitas, hasil tersimpan, lalu manfaat Memory/Learning dan optimasi berbasis pengukuran.
- Pertahankan satu MemoryService/LearningService, konfigurasi provider/model/scheduler, endpoint `/agent/chat/*`, identitas request, format output dan guard existing. Tidak menambahkan runtime donor, database Memory, provider, framework orchestration atau MCP tool baru.
- Pengguna **secara eksplisit mengizinkan Native development** melalui `PLEASE IMPLEMENT THIS PLAN`; ini pengecualian terbatas terhadap freeze, bukan pembukaan global.
- Koreksi browser yang mengikat: **Open Browser Use extension v1.1.0 yang sudah terpasang**, native host `com.ifuryst.open_browser_use.extension`, menjadi default external dan Native. Pengguna memilih integrasi extension/native host lokal dan menghapus engine Chromium isolated lama. Screenshot memperlihatkan Connected. Ini bukan konektor Browser Use cloud Codex atau framework Python browser-use.
- Browser bekerja background memakai `headless:true`: browser fisik tetap headed, hasil `headless:false, background:true`. Jangan meminta foreground/desktop input. Pertahankan paired Browser Bridge dan batas conversation external yang berbeda.
- Pengguna kini meminta jeda dan kelanjutan di sesi lain. **Jangan melanjutkan implementasi tanpa permintaan resume.**

## Identitas pemulihan

- Root saat dijeda: `E:\Projects\Agent-Core`; verifikasi ulang root dinamis saat resume.
- HEAD: `c8a0d306493ecbfaa8a5c9f9ae9df1754d813e98`, branch `codex/cumulative-learning-workflow`. Banyak perubahan existing di luar tugas; jangan reset/checkout/commit atau menimpa semuanya.
- Workspace terdaftar: `agent-core`.
- Learning taskKey: `native-architecture-six-donor-integration-20261023`.
- Host taskId: `ext-3338184a4e624e1cb5abab86475a67f4`.
- Memory episode: `5743cfa7-2a3c-420a-b133-fcae1c889ed2`. Baca revision/status/capsule terakhir dari canonical Memory; jangan mengarang task ID baru atau memakai controller receipt sesi lama.
- Pre-edit file checkpoint: `b428ea8f-cd11-4a76-be6f-548734ffbbd7`.
- Paused source checkpoint: `b099ec3c-9a96-4b0e-a253-6e7d15ad38ed` (24 scoped files). Handoff text subsequently adds this reference; source bytes are checkpointed.
- Partner logical Raka telah diinterupsi saat pause. Instance/session ID lama tidak dijanjikan hidup pada chat baru. Reuse sesuai `subagents/README.md` dan profil bila tersedia; tidak menambah partner lain.

## Hasil source yang sudah ditulis

1. [Rencana induk revisi 1](../proposals/Integrasi-Arsitektur-Native-Agent-Core.md), status PROPOSED sebagai roadmap; keenam dokumen sumber tidak diubah. Link ditambahkan pada `docs/plans/README.md` dan bagian terkait CODEBASE. Tabel bukti pelaksanaan pada rencana masih perlu diperbarui.
2. `src/agent-chat-service.ts`: satu recovery startup asynchronous/sequential untuk turn yang baru terinterupsi, melalui validator DTC existing; turn resumable lama tidak diulang otomatis tiap restart. Event chat `assistant.final` ditahan sampai commit, lalu teks final dibaca dari hasil tersimpan. Disconnect observer/notice failure terpisah dari keberhasilan hasil. Learning failure tetap metadata terpisah.
3. `src/agent-chat-store.ts`: alasan recovery terjeda ditulis dengan checkpoint revision, tidak menimpa pembatalan/claim baru; timestamp conversation meningkat. `src/ui/src/host.ts` dan ChatPage `pages.tsx` menampilkan status progres/saved/failed/stopped/interrupted/recovery serta existing cancel.
4. `src/memory/retrieval.ts`: satu baris membuang titik terminal sebelum klasifikasi concrete identifier; kalimat natural dengan `contract.` sebelumnya salah diperlakukan sebagai identifier literal. Regression RED sebelum/GREEN sesudah; path/simbol dan isolasi workspace tetap diuji.
5. Browser: `src/rdc/browser-control/service.ts` sekarang default OBU; peluncur isolated, executable discovery, private WebSocket CDP client, process/temp-profile cleanup dan sibling-tab switching dihapus. `owned-tabs.ts` tinggal `isPageUrl`. Managed OBU native host/fallback owner tetap existing; tidak menghapus profil browser pengguna.
6. Native handler/schema menerima basic OBU actions dan tetap menolak Native conversation/mode. Schema MCP dan `src/rdc/tools/schemas.ts`, metadata, capability catalog/inventory dan README Browser Bridge diperbarui. Engine `isolated` ditolak; breaking contract perlu pending release intent tersendiri (belum dibuat).
7. Review menemukan sesi external dapat bocor ke Native jika hanya guard lama dibuang. Source terbaru mengikat owner host pada BrowserSession: server menghasilkan owner dari Native task/workspace atau external principal/controller session + host context task/workspaceIdentity/process. Handler memeriksa owner sebelum observe/act/close/conversation, status difilter. Owner tidak berasal dari tool JSON. **Patch ini belum diuji/build ulang.**

File tugas lain: `.changeset/native-architecture-reliability.md`, `tests/native-chat-reliability.test.ts`, `src/ui/src/NativeChatReliability.test.tsx`, `tests/native-donor-workflows.test.ts`, `tests/memory/memory-fusion-query-punctuation.test.ts`, `tests/browser-default-transport.test.ts`; browser tests existing disesuaikan. `tests/browser-executable-selection.test.ts` obsolete dihapus. `tests/browser-session-ownership.test.ts` ditugaskan ke Raka namun belum ada pada disk saat pause; jangan menganggap telah ditulis atau lulus.

Dokumen hasil [execution evidence](Native-Architecture-Integration-Execution-20261023.md) belum diperbarui dengan browser/Memory/hasil akhir. `docs/Browser-Control.md`, `docs/Open-Browser-Use.md` dan bagian browser/Memory CODEBASE juga belum diselaraskan dengan source terbaru.

## Freeze dan build

- Guard awal 31 files / 78 sections PASS. Empat perubahan reliability diterima secara sempit pada manifest dan pasangan hash dicatat dalam execution evidence.
- Satu entry tambahan `src/agent-capability-catalog.ts`: normalized SHA lama `0437478a46661de76fbd8987a8d72452a1f2c8820c184a083917d1b266834e22`, baru `f3aa99a89e89ef8b7403931ddc677b73aeafb6970dc9354688fb62c5d802a25b`. Record delta di `runtime/tmp/native-six-donor/browser-freeze-delta.json`.
- Audit hash read-only setelah patch ownership: tidak ada drift terhadap manifest. Guard tetap wajib dijalankan sebelum kompilasi; jangan baseline ulang seluruh manifest.
- Root `npm run build` terakhir PASS, termasuk native/path guards dan transport build. **Build itu mendahului patch ownership terbaru**, sehingga bukan build source final.
- UI typecheck/build PASS sebelum browser expansion. Belum build/package launcher tugas ini, belum stage activation, belum restart, belum Refresh tools, belum versi/commit/push/publish/install/download baru.
- Resident Core masih runtime sebelum tugas ini; source/dist terbaru tidak membuktikan resident sudah menggunakannya. Jangan klaim live Native reliability/default browser sudah diaktifkan.

## Bukti verifikasi dan kegagalan

Laporan JSON tersimpan di `runtime/tmp/native-six-donor/`:

| Bukti | Hasil dan batas |
| --- | --- |
| `baseline-vitest.json` | 36/36 controller/chat/DTC sebelum edit |
| `reliability-vitest.json` | 8/8 focused reliability |
| `final-serial-vitest.json` | 49/49 di 5 file, serial `--maxWorkers=1 --testTimeout=30000` |
| `final-vitest.json` | Run concurrent sebelumnya 48/49; satu test controller melewati timeout default. Isolated retry dan serial run lulus; timeout config/source tidak diubah |
| `ui-reliability-vitest.json` | 3/3. Existing App tests 5/5. Run UI awal memiliki satu selector ambigu yang telah dikoreksi |
| `browser-migration-vitest.json` | 35/35 framed OBU/default/schema, sebelum ownership patch |
| Raka targeted run | 3 files/10 tests tanpa skip, 55.62s wall /16.06s tests: Memory regression+existing retrieval dan `native-donor-workflows.test.ts` |
| `browser-live-vitest.json` | 25 passed/8 failed. Dua fixture expected salah telah dikoreksi tetapi belum rerun. Satu large-input observation memutus connection; enam downstream connection-required failures |
| `browser-large-wire-baseline.json` | Pengukuran READ-ONLY mengembalikan ukuran saja: **1,052,534 byte**, 248 actions,150 guards, melampaui frame limit **1,048,576 byte**. Tab baru ditutup acknowledged; jangan ulang full oversized response |

Tiga workflow Raka memakai Native controller/chat aktual dengan scripted loopback model: coding read/write/read dengan oracle; Learning ke store canonical sementara; conversation baru otomatis recall dari prompt natural, menulis dokumen bersumber dan use receipt; OBU background Native membuka tab, observe READY, native form POST **sekali**, observe DONE, close. Final cocok persisted row; replay tidak menambah model call. 17 scripted provider calls/11 ordinary tool calls; token/biaya tidak tersedia. Temp fixture dibersihkan; tidak mengklaim retained artifact fisik setelah cleanup. Browser effect oracle independen lulus; existing runtime `jobVerification` browser tetap unavailable.

OBU resident sempat diuji explicit pada example.org, observe dan close acknowledged. Sesudah transport failure, koneksi baru berhasil lagi. Tab pengukuran terakhir: session `56fe6ef3-7e54-46fd-b097-100e59e758a6`, tab `1523523767`, closed acknowledged; server loopback dihentikan. Probe resident session `5247dfd7-9fc2-4297-9af9-c2b11bf7326d`, tab `1523523763`, juga closed acknowledged. Tidak ada replay mutasi gagal. Cleanup tab dari failed large-input run awal tidak memiliki receipt/ID yang dipertahankan; kemungkinan orphan tetap **unknown**, jangan menebak tab lalu menutupnya.

Separate cloud Browser Use connector pernah membaca example.org/IANA sebelum pemilihan diperjelas; itu bukan bukti OBU terintegrasi. Tidak ada pengiriman/publikasi eksternal.

## Langkah berikut saat pengguna meminta resume

1. Fresh Agent Core contract read/ack → canonical Memory inspection. Reconnect episode taskKey yang sama, baca task_context dan handoff ini, revalidasi root/HEAD/worktree/source/build/runtime/target/receipts. Memory episode yang dijeda harus dibuka secara eksplisit melalui `episode_status` setelah permintaan resume; jangan membuat episode pengganti diam-diam.
2. Selesaikan negative owner-isolation tests dengan actual MCP wrapper + mocked OBU. Native A/B dan external/native tidak boleh melihat/memutasi/menutup sesi asing; task/owner/workspace spoof dalam JSON tidak berlaku; continuation task yang sama tetap dapat mengakses sesi miliknya. Review test conversation integration yang mengganti singleton service agar `assertOwner` juga memakai instance fixture.
3. Perbaiki root oversized snapshot **sebelum** rerun large-input observe. Script sekarang membangun guards dan marker untuk semua candidates sebelum memotong actions; raw strings/pageKey tetap besar. OBU wire cap 1MiB wajib dipertahankan. Pilih bounded admission/payload yang mempertahankan exact freshness/guards bagi actions admitted dan omissions eksplisit; jangan melonggarkan safety/frame limit atau truncate guard sehingga perubahan target luput. Ukur dengan small size-only response seperti baseline, lalu test besar dengan bukti cleanup.
4. `tests/browser-control.test.ts` dua expected fixture telah diperbaiki. SystemOne live canvas/keyboard fixtures kini memakai test-only Runtime.evaluate untuk seed karena profil pengguna memblokir inline JS. `tests/browser-panel-scroll.test.ts` **belum** disesuaikan: masih mengganti `session.openBrowserUse` dengan fake dan menghapusnya sebelum close, asumsi isolated yang kini salah dan dapat melewatkan dispose. Perbaiki sebelum menjalankannya.
5. Rerun scoped browser/ownership/Native workflows/Memory checks setelah source final. Catat kegagalan dan pemulihan; jangan menyebut seluruh acceptance lulus hanya karena beberapa tests berhasil. Real-model quality/causal Memory advantage/optimasi latency-biaya belum terbukti. Gelombang 3 belum diimplementasikan.
6. Lengkapi master execution table, execution report, CODEBASE/browser guides dan pending browser breaking release intent. Jangan apply version/publish. Periksa surgical diff dan native guard.
7. Guard → Node/UI build/typecheck yang diperlukan → launcher publish memakai SDK existing `runtime/dotnet-sdk/dotnet.exe` (tanpa restore/download baru), project `src/launcher/AgentCore.Launcher.csproj`, self-contained/single-file win-x64, output terisolasi. Cek state pending launcher sebelum staging; preserve existing changes. Catat hashes.
8. Checkpoint Memory sebelum activation, lalu official `restart_agent_core(capabilitiesChanged=true)` **sekali**. Lost response adalah unknown: inspeksi receipt/health, jangan restart ulang buta. Fresh handshake dan Memory setelah restart.
9. OBU background → Agent Core ChatGPT plugin settings → **scroll sampai Refresh tools terlihat** → klik → verifikasi perubahan discovery terpisah. Link: https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503 . Tidak menganggap browser UI action sama dengan refreshed cached schema.
10. Verifikasi resident sesuai scope, finalisasi Learning checkpoint/review existing tanpa mengklaim implementation selesai bila masih ada blocker. Roadmap tetap aktif saat later-wave acceptance terbuka; rollback menjaga chat/Memory/receipts/history.

Learning finalization untuk keseluruhan implementasi belum dilakukan saat jeda ini. Status checkpoint/review handoff, bila dibuat, harus dibedakan dari penyelesaian task dan dibaca dari owner aktual. Tidak ada proses implementasi yang dimaksudkan terus berjalan selama jeda.
