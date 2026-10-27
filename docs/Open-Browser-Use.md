# Open Browser Use — transport internal Agent Core

## 2026-10-24 — relay owner continuity

Automatic startup publishes the current Core process owner atomically before optional native-host registry checks. A registry diagnostic failure remains visible but cannot leave an already registered Agent Core relay bound to a dead previous Core. Retries preserve the same process identity; explicit shutdown and PID-reuse guards still stop the owned relay. This correction addresses the observed `Native host has exited` reconnect cycle after a failed startup registry check. Source regression and live activation evidence are tracked separately in [Revision 4 execution](history-agent-core/Native-Architecture-Integration-Revision-4-Execution.md#second-evaluation-result-and-browser-reconnect-investigation).

## 2026-10-23 — default Native/external browser

The explicit Native integration request makes the existing installed OBU extension the default transport for both controllers and removes the old isolated Chromium engine. Omit transport or select `open-browser-use`, the only transport value. `conversation_read` is served through OBU and is external-only. Host-owned session identity prevents cross-task/controller use and filters status. See [current contract](Browser-Control.md) and [execution evidence](history-agent-core/Native-Architecture-Integration-Execution-20261023.md) for source, tests and resident status.

Large snapshots keep exact guard/page/marker comparisons inside the renderer, admit at most 256 KiB of DOM action JSON and return at most 512 KiB of snapshot JSON. Omitted actions are counted; oversized metadata returns a bounded error. The OBU frame limit remains 1 MiB. Native now uses the same OBU panel-scroll/background path. Dated implementation and activation evidence below describes the preceding revisions.

Background keyboard delivery uses the existing optional keyboard/held-key capabilities and target-scoped CDP focus emulation, restored after release. A real OBU probe on the JavaScript-enabled loopback fixture observed no key event before emulation and a key event after it; this is a delivery observation, not proof of arbitrary widget behavior. No Page.bringToFront or desktop input is introduced. Final source/live evidence is linked above.

## Nested panels — external background scrolling, 2026-10-18

External OBU observations now expose SCROLL actions for visible nested vertical panels, including ChatGPT plugin settings. Select a currently observed scroll action, then observe again until the exact Refresh tools button is visible and actionable. Targets include identity, current scroll/layout/overflow and document guards; changed/replaced/locked panels require a new observation. Scroll uses instant DOM movement with overlapping viewport steps and verifies directional movement, without desktop input or bringing a tab/window forward. Hit-testing excludes clipped and covered controls/text. Discovery is bounded (nine viewport samples, up to 64 control ancestor walks, 12 levels, 256 distinct nodes, eight nested panels). Offscreen, unsampled, framed and shadow-root panels are not a universal discovery guarantee.

At the 2026-10-18 checkpoint the default/Native branch retained its prior snapshot and wheel behavior; the 2026-10-23 source changes above supersede that default. At that earlier checkpoint all 52 directed tests passed; source build and local-SDK launcher publish passed with historical governance/path checks. One official restart (`1427d0e59e15489495498feeebfde020`) completed exit 0, then resident health returned ok. That launcher binary was SHA-256 c7971956c3d048226ccb6d2cdcdf2a830e6cd4b41a0fcf1134a7760afecb16fd.

Actual resident MCP acceptance on the exact settings URL scrolled the panel once, clicked visible Refresh tools once, observed loading (button action unavailable) then enabled Refresh tools again, and closed the owned tab with acknowledged cleanup. This proves the UI operation; already-cached client descriptor discovery is not claimed. A separate actual MCP fixture performed five panel scrolls and a click, received an independent localhost POST, observed VERIFIED background panel / hidden=true, and closed acknowledged. The read-only OS observer retained one ChatGPT foreground window throughout that host-receipted browser interval (07:08:05.723–07:08:31.676 UTC). Explorer transitions after 07:08:35 remain in the wider raw trace. The earlier settings observer recorded ChatGPT/Agent Core/Chrome window transitions; their cause is unproven, so unchanged OS foreground is not claimed for that wider interval. No driver foreground command, desktop input, fallback browser, extension installation or download was used for these browser actions. Evidence is under `runtime/build/browser-use-panel-scroll-20261018` (`resident-refresh.json`, `resident-panel.json`, `episode-events.json`, foreground traces and POST receipt).

The older failed-observation tab 589865431 was absent from both its original persisted session scope and a current browser inventory of nine tabs. No reclaim, debugger attachment or cleanup mutation was needed. All seven known old/new test IDs are absent from that inventory. New qualification/settings/fixture tabs closed with acknowledged cleanup, retaining the user's browser. Temporary fixture servers and foreground observers have stopped.

## Preceding background input revision — resident MCP verified 2026-10-18

The user's no-screen-takeover requirement means no driver-requested foreground window/tab activation and no desktop mouse/keyboard injection. For OBU, the existing `headless:true` argument (also the default) now requests a background owned task tab in an already connected supported extension. The actual installed browser remains headed, so results report `headless:false, background:true`. Explicit `headless:false` retains the earlier foreground/fallback behavior. No new input field or extension installation is required.

Background open never sends `Page.bringToFront`, accepts ready hidden documents, and refuses foreground commands. Before input it checks document readiness and retains page/node freshness, CSS visibility, hit-testing and session/tab ownership checks. Background fill focuses the intended DOM editable with preventScroll, verifies that field and rechecks freshness before insertion. Background HTML clicks use native HTMLElement activation, replacing ineffective CDP mouse input; non-HTML controls are refused. DOM focus is distinct from OS foreground focus; document.hasFocus can become true for an inactive page after DOM focus. Unknown outcomes are never replayed.

Background connection requests fail if no unambiguous supported connection is already available; they do not launch the dedicated fallback. Core startup prepares native-host registration/owner state and probes existing connections, without opening a browser. The earlier fallback remains available only through explicit foreground operation. OBU uses its existing bounded host settling rather than waiting on throttled background animation frames. Four-session and existing action/observation bounds remain unchanged.

Current state: two official restarts completed with exit 0 (initial activation, then the user-auto-approved input correction). Final root launcher SHA-256: `c7971956c3d048226ccb6d2cdcdf2a830e6cd4b41a0fcf1134a7760afecb16fd`; resident health returned ok. The final actual Agent Core capability opened/read/filled/submitted an owned background tab through existing Chrome OBU 1.1.0. Independent POST receipt and fresh DOM returned `VERIFIED background-capability-verified`, `hidden=true`. The read-only foreground observer recorded 380 samples with one unchanged Chrome window, including the whole final browser flow and acknowledged task-tab cleanup. DOM `focused=true` in the receipt is not OS activation: the page remained hidden and the foreground window stayed unchanged. No desktop mouse/keyboard injection or fallback browser launch was used in this successful path.

The earlier fill guard refusal and CDP click acknowledgement without submission are retained in the evidence. Corrected input passed 48 directed tests and an existing-extension in-process qualification before final activation. One earlier observation epoch failed before page actions; its tab `589865431` cleanup was uncertain then, and it was never reclaimed. Current panel-scroll acceptance above confirms it absent. The successful final tab and settings tab cleanup were acknowledged, without independent detach proof. HTML activation is synthetic and may not satisfy widgets requiring trusted pointer events/user activation; arbitrary site popups/dialogs may request UI, so no universal website guarantee is claimed.

Historical background revision: the original PageDown attempt could not expose nested-pane scrolling. The panel-scroll implementation above supersedes that limitation. Required path: browser use → [Agent Core settings](https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503) → scroll the main settings pane down until **Refresh tools** is visible → click it. Refreshed client discovery remains a separate check from the UI action.

Plan/evidence owner: `docs/superpowers/plans/2026-10-18-browser-use-background.md` and `runtime/build/browser-use-background-20261018`. The following lifecycle acceptance describes the preceding foreground implementation.

## Current lifecycle — 2026-10-18

The user-selected runtime configuration is `{ "version": 1, "discovery": "auto" }` in `runtime/browser-control/open-browser-use.json`. The built Node/launcher runtime is active. Live MCP acceptance used the user's already-connected Chrome OBU 1.1.0 extension; no dedicated fallback browser was running or started during this successful path.

At each new OBU session, discover bounded live socket endpoints and verify their actual `getInfo` response. Prefer a single supported external extension. Multiple external profiles are ambiguous: use the single dedicated Agent Core fallback rather than selecting by socket filename or enumeration order. This detects supported connections, not arbitrary extensions or the user's foreground browser when several stock extensions are active. Explicit socket/instance selectors retain their existing semantics.

`Agent Core.exe` now contains an external browser native-messaging helper role, entered before the launcher mutex/UI only for the exact OBU extension origin. Per-user Chrome/Chromium/Brave/Edge host manifests point to that executable. Existing standard-host registrations in HKCU/HKLM, including both Windows registry views, are preserved. The helper owns one UUID AF_UNIX socket below `runtime/rdc/browser-control/managed`, bounds clients/queues/frames, correlates client IDs, and exits when its bound Core process/owner marker ends. It does not close the user's browser.

Core warms this connection after HTTP begins listening. If no unambiguous external connection is available, it starts the existing project Chrome for Testing with a dedicated persistent profile at `runtime/rdc/browser-control/managed/profile` and the bundled `extensions/agent-core-open-browser-use` extension. No CLI/MCP server or toolchain download is required. Concurrent opens share one startup. Only the fallback process started by this Core is stopped during shutdown; an unconfirmed stop remains reported as uncertain.

Managed Windows endpoints use an embedded `Agent Core.exe --browser-use-transport <socket>` .NET connector. The original Go connector remains responsible for explicit external endpoints. Real Windows integration showed that .NET AF_UNIX endpoints can have regular-file metadata and therefore fail the Go helper's `ModeSocket` guard; the managed connector validates its own direct UUID socket path and rejects reparse ancestors before connecting. Existing unrelated native-host registrations are preserved.

Before input, a confirmed background state triggers one activation of the already-owned task tab and bounded visibility/document-focus confirmation. Missing focus evidence is distinct from a confirmed background tab. The action's observation is rechecked after activation because page focus handlers can mutate the DOM. No unknown page mutation is replayed and no existing user tab is claimed.

Build the Node source and launcher, stage the new launcher with a SHA-256 marker under `runtime/launcher/pending`, then request the official restart once. The restart script swaps the verified launcher after old runtime shutdown and retains the original in `runtime/launcher/backups`. Follow the current AGENTS.md direct-link/browser-use/mandatory-scroll/visible-Refresh-tools workflow; confirm subsequent client discovery before claiming exposure.

Verification: 64 directed TypeScript tests across 8 files passed; after the managed-connector correction, 40 focused tests across 4 files passed. The standalone .NET relay harness passed 18 real stream/socket tests. Historical governance checks (31 files / 78 sections) and path policy passed. Compiled full optional manifest: 82 tools / 131048 bytes, `docs/memory/Browser-Use-Managed-MCP-Manifest-20261018.json`.

Two deliberate official restarts completed with exit 0: initial activation (`02c804bfa98541ecb1849d23ac12e4b3`) and the verified Windows connector correction (`ab2a0ecf31464c8480351d7b3a6492a8`). The final launcher SHA-256 is `1c618f64baf628f691ed8eee98d49d518b6cdbdd28d1094035bac73cd2faa735`; resident health returned ok. Live acceptance moved an owned form tab into the background using another owned tab, then filled and submitted through the original session. A fresh DOM returned `VERIFIED active-extension-focus` and an independent localhost POST receipt matched. Both test tabs were closed with acknowledged cleanup while retaining the user's browser. Fallback lifecycle is fixture-tested; a live fallback launch was intentionally unnecessary with this active extension.

The correct ChatGPT settings tab was opened through Agent Core browser use. Its nested settings pane required coordinate scrolling through the computer-use browser API; the root PageDown action did not expose the button. After scrolling, **Refresh tools** was clicked once, visibly entered loading, and returned enabled. The task tab was then closed, retaining Chrome. This proves the UI action, not refreshed tool discovery in this already-cached controller context. Evidence and screenshot: `runtime/build/browser-use-lifecycle-20261018/{verification.json,live-evidence.json,form-receipt.json,refresh-tools.png}`. The older sections below are historical explicit-transport evidence.

## Historical explicit transport acceptance (before managed lifecycle)

> Source/build, smoke Windows langsung, dan uji native HTML form melalui MCP ChatGPT aktual sudah **PASS**, termasuk fill/select/click, receipt server independen, dan observasi hasil baru. Runtime aktif setelah satu restart resmi. **Refresh tools masih PENDING**: kontrol tersebut belum terpapar pada UI pengelolaan plugin terpilih yang diperiksa.

## Status dan ruang lingkup

Transport ini menambahkan Open Browser Use (OBU) pada `BrowserControlService` yang sudah ada.
Gunakan jalur external `browser_control` dengan `transport: "open-browser-use"` secara eksplisit.
Transport default kini open-browser-use. OBU membuat tab task sendiri di background saat headless=true; tidak mengklaim tab atau percakapan yang sudah terbuka. Engine isolated sudah dihapus.
Kontrak source yang diperiksa kompatibel dengan OBU **1.0.0 dan 1.1.0**; verifikasi live yang tersedia memakai Brave dengan extension OBU **1.1.0**.
`info` langsung membuktikan koneksi saat diperiksa; hasil setiap tindakan tetap harus dibuktikan lewat observasi baru pada task yang dijalankan.

## Arsitektur

`BrowserControlService` → RPC internal → helper Go milik sesi → native host/extension OBU terpasang → tab baru milik task.
RPC Node mengelola korelasi respons, batas frame, timeout, dan event; helper meneruskan byte antara stdio berframe dan satu socket AF_UNIX.
Helper memakai standard library Go; alur observasi dan aksi tetap memakai BrowserControlService, tanpa engine browser tambahan atau JavaScript mentah dari caller.
Setiap sesi membuat dan membawa tab sendiri ke depan. Mutasi memeriksa visibility/focus; event hanya diteruskan untuk tab milik sesi.
Socket dan native host yang sudah berjalan dipakai sebagai prasyarat; helper tidak memiliki proses browser/native host tersebut.

## Prasyarat

- CLI OBU, registrasi native host, serta extension sudah terpasang dan aktif pada profil browser yang dituju.
- Extension ID: `bgjoihaepiejlfjinojjfgokghnodnhd`.
- Nama native host: `com.ifuryst.open_browser_use.extension`.
- Build helper memakai Go yang sudah tersedia dan standard library, tanpa dependensi baru atau unduhan toolchain; runtime memakai binary hasil build.
- Endpoint dan versi harus lolos pemeriksaan `info`; keberadaan CLI saja tidak membuktikan koneksi extension.

## Konfigurasi endpoint

File konfigurasi: `runtime/browser-control/open-browser-use.json`.
Konfigurasi operator yang diperiksa Main pada root `E:/Projects/Agent-Core`:

```json
{
  "version": 1,
  "socketDir": "F:/Brave-Isolated/Temp/open-browser-use",
  "extensionInstanceId": "7f82acf7-ff25-42b1-ab4d-4f5cfa810ece"
}
```

| Field | Arti |
| --- | --- |
| `version` | Wajib bernilai `1`. |
| `socketDir` | Direktori absolut untuk menemukan socket host yang masih aktif. |
| `socketPath` | Opsional: path socket absolut tertentu; mengatasi pencarian melalui `socketDir`. |
| `extensionInstanceId` | UUID profil/instance yang harus cocok dengan hasil handshake. |

`AGENT_CORE_OPEN_BROWSER_USE_SOCKET_DIR` menimpa `socketDir` dari file.
`AGENT_CORE_OPEN_BROWSER_USE_INSTANCE_ID` menimpa `extensionInstanceId` dari file.
`socketPath` eksplisit tetap menentukan endpoint; mengubah variabel direktori tidak mengubah pilihan itu.
UUID instance merupakan selector profil dan informasi diagnostik, bukan credential atau bukti autentikasi.
Socket dapat berubah setelah host restart; gunakan direktori dan UUID agar endpoint ditemukan ulang pada sesi baru.

TEMP/TMP browser atau native host dapat berbeda dari TEMP/TMP proses Agent Core.
Jika pencarian default gagal, tentukan direktori milik proses browser yang benar; jangan mengubah environment global untuk menyamakannya.
Diagnosis read-only dapat memakai `open-browser-use info --socket "<path-socket-absolut>"`.
Jangan menebak profil dari nama file socket atau menganggap `active.json` selalu menunjuk profil yang dituju.
Di Windows, Node dapat menandai socket AF_UNIX sebagai symlink/reparse point. Helper Go memeriksa `ModeSocket` dengan `Lstat` sebelum dial; symlink biasa bukan socket yang diterima.
Pemilihan endpoint yang ambigu harus gagal; transport tidak mengubah `active.json` atau membersihkan direktori socket bersama.

## Build dan pemuatan

Jalankan `npm run build:browser-transport` dari root repo pada OS dan arsitektur target, memakai Go yang sudah tersedia.
Manifest build merekam identitas source, builder, binary, target, dan versi Go; runtime memeriksa hash source/binary sebelum menjalankan helper.
Jika helper belum dibangun atau hash tidak cocok, lakukan build ulang melalui workflow proyek; jangan mengabaikan pemeriksaan tersebut.
Setelah integrasi source/schema berubah, ikuti workflow build dan restart Agent Core yang kanonis, lalu **Refresh tools** dan periksa schema external yang aktif.
Langkah ini tidak memerlukan pemasangan ulang extension atau menjalankan browser tambahan.

## Contoh alur aman

Ini contoh urutan operasional, bukan transkrip uji yang sudah berhasil. Gunakan nama field sesuai schema tool aktif.
`S` berarti `sessionId` dari respons open; `O` berarti `observationId` terbaru; `A` disalin dari `actions[].id` observasi tersebut. Ketiganya bukan nilai literal.

| Langkah | Input dan pemeriksaan |
| --- | --- |
| `open` | Pilih `transport: "open-browser-use"` dan URL publik `https://example.com/`; simpan ID sesi sebagai `S`. |
| `observe` | Amati sesi `S`; baca keadaan halaman dan daftar aksi yang benar-benar tersedia. |
| `act` | Jika ada tautan publik yang sesuai tujuan, salin `actions[].id` sebagai `A`, lalu kirim `{action:"act",sessionId:S,observationId:O,actionId:A}`. |
| `observe` | Periksa hasil navigasi/keadaan terbaru; respons aksi saja belum membuktikan hasil yang diinginkan. |
| `close` | Tutup sesi `S` dan baca status cleanup yang dikembalikan. |

Jika tidak ada aksi yang sesuai, berhenti pada observasi dan tutup sesi; jangan membuat `actionId` sendiri.
Sesudah halaman berubah, ambil observasi baru sebelum memilih aksi berikutnya.
Jika pengguna berpindah tab, mutasi ditolak dengan `BROWSER_OBU_TAB_NOT_FOREGROUND`; pilih tab task dan amati ulang. Pembacaan DOM dapat tetap dilakukan pada tab latar.
Penantian sesudah aksi memakai delay host terbatas; `ready-for-observe` bukan bukti halaman atau pekerjaan sudah selesai.
Gunakan URL HTTP(S) tanpa credential; jalur ini tidak menyediakan claim/attach ke tab atau percakapan pengguna yang sudah ada.
Transport OBU ditujukan untuk handler external; handler Native Agent tidak menerima pilihan transport ini.

## Batas sesi dan kegagalan

| Batas | Nilai/konsekuensi |
| --- | --- |
| Masa hidup sesi | 30 menit; kedaluwarsa menghentikan helper. |
| Sesi bersamaan | Maksimal 4. |
| RPC yang menunggu | Maksimal 16 per koneksi. |
| Frame JSON | Maksimal 1 MiB. |
| Timeout RPC / CDP | 10 detik / 8 detik. |

Timeout atau error CDP dari extension, termasuk yang tiba sebelum timer RPC, membuat hasil operasi **unknown**: perintah mungkin sudah berjalan tanpa hasil akhir yang dapat dipastikan.
Transport tidak mengulang mutasi atau reconnect otomatis untuk meneruskan operasi yang hasilnya belum pasti.
Kegagalan `createTab` dapat terjadi setelah tab dibuat tetapi sebelum ID diterima; tab tersebut memerlukan inspeksi manual.
Jangan menebak tab dari judul/URL atau mengklaim ulang tab yang tidak teridentifikasi untuk melakukan cleanup.
Kedaluwarsa atau berhentinya helper tidak membuktikan tab browser sudah tertutup; gunakan `close` eksplisit sebelum TTL.

## Penutupan dan kepemilikan

`close` melakukan finalisasi terbatas pada tab yang masih terkonfirmasi berada dalam scope sesi.
Tab tambahan pengguna dan tab yang dipindah keluar dari scope harus dipertahankan; cleanup tidak boleh memperluas kepemilikan.
Finalisasi `acknowledged` mengakui permintaan, tetapi detach belum terbukti independen; laporkan perubahan scope atau cleanup yang tidak pasti tanpa mengklaim tab sudah tertutup.
Helper milik sesi dihentikan pada penutupan; proses browser, extension, dan native host yang sudah ada tetap milik pengguna.

## Verifikasi Main dan status aktivasi

- **PASS build/tests:** build resmi lulus; OBU 21 + manifest 5 + Bridge 14 + protocol 2 + legacy 3 = **45 tests unik lulus lintas run**, bukan satu run 45/45. Manifest `131020/131072 B`, `82` tools; versi produk tetap `0.15.0-beta.3`.
- **PASS live native form:** Windows/Brave dengan OBU 1.1.0, `2026-10-17T23:17:25.546Z`–`2026-10-17T23:17:29.548Z`; observasi DOM, fill, select, dan click pada tab task `1523521767`.
- **Bukti hasil:** server localhost menerima `{name:'Raka 2046',plan:'design'}`; observasi DOM baru menampilkan `VERIFIED Raka 2046 design`.
- **Bukti scope/cleanup:** tab task absen pada pemeriksaan independen `Target.getTargets`; sentinel `1523521764` tetap responsif lalu cleanup mendapat ACK. Detach tetap `not-independently-observed`.
- **FAILED inline-JS tetap tercatat:** `onclick` bernilai `null` (`typeof` adalah `object`), tanpa penerimaan server walau visible/focused. Smoke native form tidak menghapus kegagalan ini; acceptance yang bergantung JavaScript belum terverifikasi.
- **Bukti policy:** Preferences menunjukkan default JavaScript `2` (blocked), managed default `null`, dan allow localhost hanya port `13456`/`8124`. Ini konsisten dengan pemblokiran profil, tetapi port fixture asli belum dipastikan sehingga penyebab pasti belum terbukti; policy tidak diubah.
- **Batas bukti:** tidak ada screenshot atau review visual. Smoke form ini tidak membuktikan semua skenario lifecycle/TTL maupun tab yang dipindahkan.
- **PASS aktivasi runtime:** satu restart resmi dengan `capabilitiesChanged=true`; receipt `runtime/restart/9ce48c8eff4944a695492b56b4448f72.json` selesai exit 0 pada `2026-10-17T23:28:38.8039523Z`. Handshake baru dan canonical Memory berhasil; task ID tetap sama. Tool MCP aktual berhasil open/observe memakai transport OBU 1.1.0.
- **Bukti historis caller:** dua percobaan TYPE_TEXT ditolak sebelum input dengan `BROWSER_OBU_TAB_NOT_FOREGROUND`; penyebab penolakan prasyarat foreground belum diketahui. Guard menyatukan hasil false, hasil yang tidak tersedia, dan exception evaluasi menjadi error ini; hasil itu sendiri tidak membuktikan aktivitas pengguna atau perpindahan fokus. Probe read-only terpisah pada tab example.com setelah open/observe menghasilkan hidden=false, focused=true dan proses foreground Brave; itu bukan snapshot saat penolakan. Sesi yang ID-nya diterima mendapat close ACK. Satu open ke fixture yang sudah kedaluwarsa mengembalikan connector Internal error tanpa ID; status sesi kosong tidak membuktikan cleanup tab yang ID-nya tidak dikembalikan. Tidak ada replay mutasi atau penghapusan tab dengan menebak identitas.
- **PASS caller aktual:** uji berikutnya melalui MCP ChatGPT menjalankan open → observe → TYPE_TEXT Partner → observe → SELECT Tugas/Review → observe → CLICK Verifikasi lokal → observe `VERIFIED Raka 2046 review`. Server menerima POST `{partner:'Raka 2046',job:'review'}` pada `2026-10-18T00:09:07.146Z`; PID 16160 selesai exit 0. Sesi `8964449a-a7bc-424d-ae32-2139776d60e0`, tab `1523521789`, close acknowledged; detach belum diamati independen. Bukti: `resident-mcp-acceptance.json` dan `resident-form-server-receipt.json`. Ini uji native HTML form, bukan acceptance JavaScript atau semua website. Hasil lulus ini tidak menetapkan penyebab penolakan terdahulu.
- **PENDING Refresh tools:** `AGENTS.md` mewajibkan **ChatGPT web → Plugins → Agent Core → Manage → Manage app → Refresh tools** setelah perubahan capability. Inspeksi UI aktual pada App ID `asdk_app_6ad1239cdf308191a3ccb8ba0cd49503` berhasil mencapai Plugin settings, menu akun, menu plugin dan dialog detail app, tetapi kontrol Manage app/Refresh tools belum terpapar; description masih cached. Tidak ada reconnect, uninstall atau upload pengganti. `refresh-tools-ui-evidence.json` mencatat observasi dan close ACK tab inspeksi. Penyegaran discovery masih memerlukan panel klien yang menyediakan kontrol tersebut; keberhasilan mutasi MCP sudah terbukti terpisah.
- **Bukti aktivasi/caller:** `runtime/build/open-browser-use-20261018/resident-mcp-evidence.json` mempertahankan respons aktual terdahulu, penolakan prasyarat foreground dan keterbatasan cleanup. `resident-mcp-acceptance.json` menyimpan run MCP berikutnya yang lulus. Bukti lama tidak ditimpa; smoke browser langsung, run MCP dan inspeksi UI refresh mempunyai cakupan masing-masing.
- **Bukti durable tersimpan:** `runtime/build/open-browser-use-20261018` menyimpan arsip awal 33 log, hasil, script pemeriksaan dan donor yang diperiksa; `evidence-manifest.json` merekam hash arsip awal. Bukti aktivasi dan diagnostik berikutnya dicatat dalam `final-evidence-manifest.json` bersama hash source yang sudah ditinjau dan dokumentasi final. `js-policy-inspection.json` menyimpan ekstraksi policy yang terbatas. Arsip donor SHA-256: `956dc4666c4460efeb7ae5c8d0d15f4793c1b1f7b01fa9e08d06362ff8987cbe`.

## Learning dan kontinuitas

Checkpoint OBU `421` dan review task-scoped `1944f32f-ecbb-4cea-93e3-33b61cf22ca4` selesai; pendingLearning=false. Reflection tetap proposal/awaiting-verification karena keberhasilan task belum membuktikan peningkatan perilaku agen. `learning-closeout.json` mencatat linkage dan batas tersebut.
Saat penutupan, handler existing episode/verify mengabaikan taskId dan sempat menutup episode Browser Bridge dengan deklarasi OBU. Salah atribusi diperbaiki pada satu record dengan backup, exclusive file access, full byte readback dan canonical start; Browser Bridge kembali tanpa closedAt/terminalOutcome, verificationStatus=unavailable, metrics.verifications=0. Semua event lama serta correction event dipertahankan. Receipt ada di `learning-attribution-repair-receipt.json`; source Learning belum diubah. [Usulan terpisah](proposals/external-episode-verification-task-selection-20261018.md) memuat perubahan terkecil dan pemeriksaannya.

## Sumber dan lisensi

Donor: [iFurySt/open-browser-use](https://github.com/iFurySt/open-browser-use), dipin ke [b136cac71a3c497b5696aefd871dd15cba7d7559](https://github.com/iFurySt/open-browser-use/commit/b136cac71a3c497b5696aefd871dd15cba7d7559).
Kontrak primer: [framing](https://github.com/iFurySt/open-browser-use/blob/b136cac71a3c497b5696aefd871dd15cba7d7559/internal/wire/frame.go), [relay](https://github.com/iFurySt/open-browser-use/blob/b136cac71a3c497b5696aefd871dd15cba7d7559/internal/host/relay.go), dan [extension](https://github.com/iFurySt/open-browser-use/blob/b136cac71a3c497b5696aefd871dd15cba7d7559/apps/chrome-extension/background.js).
Lisensi donor: [MIT, Copyright (c) 2026 Leo](https://github.com/iFurySt/open-browser-use/blob/b136cac71a3c497b5696aefd871dd15cba7d7559/LICENSE).
Pertahankan copyright dan teks izin MIT pada source yang diadaptasi serta distribusinya; pin source tidak menggantikan verifikasi runtime.
