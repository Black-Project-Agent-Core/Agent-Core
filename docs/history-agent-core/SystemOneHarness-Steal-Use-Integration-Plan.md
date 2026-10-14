# SystemOneHarness — Steal / Use Integration Plan

> **Status:** COMPLETE FOR APPROVED ADOPTION - INSTALLED RUNTIME QUALIFIED - CONSUMER REFERENCE
> **Tanggal:** 2026-09-29
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/SystemOneHarness`
> **Revision:** `ab8e8f08b4a6268c0633a474423d556599ee06a4` — branch `main`, working tree bersih saat inspeksi.
> **Origin:** `https://github.com/HarnessRouter/SystemOneHarness.git`
> **Package:** `systemone-harness` 0.4.0; Python >=3.10; license Apache-2.0.

> **Catatan versi:** bagian 1–9 adalah desain/source-grounding yang disetujui. S1-P1–P4a/b/c telah diseleksi; status aktual dan batas aktivasi ada di bagian 10. Conditional C tidak dipasang.

## 1. Hasil seleksi dan batas eksekusi

Empat proposal dapat direview secara terpisah: **S1-P1 control-state projection**, **S1-P2 canvas observation**, **S1-P3 owned-tab navigation**, dan **S1-P4 bounded keyboard/history primitives**. Semuanya mempunyai consumer berupa `browser_control` milik Agent Core; tidak perlu memasang model System One, Browser Use, UHP server, extension, atau controller kedua.

P1 memperbaiki coverage state yang sekarang tersebar pada action rows; P2/P3/P4 menambah capability. Ini bukan klaim seluruh primitive upstream aman untuk disalin. Batas dan kelemahan donor ditulis di bawah. Tidak ada implementation atau pemasangan pada tahap planning ini.

Sistem baru tidak dilarang; tetapi native model-loop/harness server bukan prasyarat empat proposal ini. Pemilik eksekusi tetap AI/controller yang memilih satu tool action secara eksplisit, bukan internal confidence gate atau auto-agent.

## 2. Dasar grounding

Inventaris lengkap non-`.git`: **54 file / 12,059,166 byte**; seluruh **31 Python file** diindeks AST tanpa import atau eksekusi, parse error 0. Hash dan rentang simbol: `runtime/tmp/shinka-systemone-grounding-20260929/SystemOneHarness-inventory.json`. Besaran byte termasuk assets, bukan ukuran source logic saja.

Body yang dibaca mencakup actions, gate, controller, encoder, trace, tools/compiler, objective, provider, UHP, config, browser/MCP/stdio environments, browser tests, serta extension background/sidepanel. Tests merupakan bukti tentang assertion upstream, **tidak dijalankan**; browser tests memiliki dependency/environment skips. Tidak ada Chrome, provider API, atau daemon donor yang diaktifkan.

Tidak ditemukan plan/rujukan kedua repo dalam pencarian `docs/**/*.md` sebelum audit. Evidence summary dan hash native awal: `runtime/tmp/shinka-systemone-grounding-20260929/audit.json`.

### 2.1 Ownership native yang sudah diperiksa

`src/rdc/browser-control/service.ts:1–721` memiliki owned Chromium session, loopback CDP, safe DOM snapshot, `click|fill|select|scroll|wait`, observation/action budgets dan mutation freshness. `publicActions` sudah mengeluarkan `currentValue`, `checked`, `selected`, dan `expanded`; jangan mengusulkan fitur tersebut seolah belum ada sama sekali.

Public schema: `src/mcp/rdc-schemas.ts:89–109`; handler schema: `src/rdc/tools/schemas.ts:139–156`; dispatch: `src/rdc/handlers/browser-control-handlers.ts`; metadata: `src/mcp/rdc-tool-metadata.ts`; registration: `src/mcp/server.ts:185`. Field/signature yang diusulkan harus konsisten pada kedua schema dan handler, bukan hanya class implementation.

Grafel native berstatus `current` sebelum pemeriksaan. `BrowserControlService` ditemukan sebagai `agent-core::c5d7377d41f1b906`; structural impact satu hop menampilkan browser-control tests. Source handler adalah bukti wiring sebenarnya; hasil graph bukan bukti seluruh callback/dynamic dispatch sudah terwakili.

## 3. S1-P1 — Control state yang tidak bergantung pada alternatif action

**APPROVED — IMPLEMENTED; qualification di bagian 10.** Donor: `systemone_harness/envs/browser.py`, `_select_values` dan `_observe`, serta `tests/test_browser_env.py:68–100`. Source menyusun current field values, checkbox state, selected option dan `Set so far`, terpisah dari action yang dipilih.

**Gap spesifik:** native `SNAPSHOT_SCRIPT` mengeluarkan select hanya untuk opsi lain yang enabled; current selection melekat ke alternatif action. Select yang tidak punya alternatif, read-only control atau control tanpa action dapat kehilangan state dalam public projection. Checkbox/value yang sudah ada tidak perlu dibuat ulang.

**Adaptasi usulan:** tambahkan `controlStates` pada hasil `observe`, record terpisah dari `actions`: opaque control ID, role, accessible name, value/status yang memang aman, selected label/value, checked, expanded, readOnly/disabled dan omission metadata. Maksimal 128 record, label/value 500 karakter, total tambahan 8,000 karakter; laporkan jumlah yang dipotong. Nilai panjang harus ditandai truncated.

Ambil state dari observasi DOM yang sama; tidak perlu satu CDP query per control. Password/file/hidden/inert/hidden-value harus tetap dikecualikan, termasuk saat elemen tidak actionable. Jangan memperluas hasil dengan hidden DOM atau credentials. Read-only evidence bukan permission untuk mengubah control tersebut.

Jangan menyalin seluruh text `Set so far` ke beberapa lokasi output: satu structured projection adalah authority, summary opsional diturunkan dari record yang sama. Existing action IDs, stale guards, single-use consumption, max 250 actions dan max 120 observations tetap berlaku.

**Files setelah disetujui:** modify `src/rdc/browser-control/service.ts`; bila serializer/budget helper diperlukan, create `src/rdc/browser-control/control-state.ts` dengan pure `projectControlStates(raw, limits)`. Update metadata/documentation hanya untuk output tambahan; jangan menambah parameter/API baru bila tidak diperlukan.

**Acceptance yang diajukan:** safe field filled; selected-only select tetap terlapor meskipun tidak punya action; checkbox true/false/mixed; safe readOnly/disabled status tanpa write action; duplicate labels tidak menggabungkan control berbeda; password/file/hidden tidak bocor; limit/omitted akurat; perubahan state sesudah observe tetap menyebabkan stale refusal. New fixture di `tests/systemone-browser-adoption.test.ts`, tanpa transaksi/situs eksternal.

## 4. S1-P2 — Opt-in canvas raster-to-grid observation

**APPROVED — IMPLEMENTED; qualification di bagian 10.** Donor: `envs/browser.py:82–140` `_CANVAS_JS`, `name_legend`, `named_clusters`, `_sample_canvas`; `tests/test_browser_canvas.py:48–98` mengassert dimensi, warna langka yang diberi nama, dan disabled mode. Yang diambil: bounded downsampling, quantized palette dan explicit legend; bukan Browser Use runtime atau interpretasi model.

**Gap spesifik:** `browser_control.observe` native berisi DOM/text/action saja. Canvas tanpa accessible DOM dapat kosong secara informasi meskipun page terlihat. Tidak ditemukan canvas sampling di class/seam native tersebut. Phone/desktop tools adalah lane berbeda, bukan pengganti otomatis observasi owned browser session.

**Batas manfaat:** grid adalah observasi raster lossy, bukan OCR, screenshot beresolusi penuh, object detection, atau bukti bahwa chart/game dimengerti. Label semantik hanya datang dari operator. Tidak ada download model, akses asset web tambahan, atau model call.

### 4.1 Kontrak dan implementasi usulan

Mode default tetap off. `observe` dapat meminta `canvas: { mode: 'inventory'|'sample', canvasId?, columns?, rows?, paletteSize?, labels? }`. Inventory hanya mengeluarkan opaque IDs bagi canvas visible pada page saat ini. Sampling wajib memilih ID yang sebelumnya diobservasi pada session/document yang sama; tidak menerima CSS/XPath/JavaScript dari controller dan tidak memilih largest canvas secara diam-diam.

Usulan batas: maksimal 8 canvas inventory; satu canvas per sample; default 32x16 cell, hard cap 128x64 dan 8,192 cell; palette 2–16; maksimal 16 hex/label pairs dan tidak lebih banyak dari palette budget; label maksimal 80 karakter. Ukuran/nilai invalid ditolak, bukan silently clamped. Batasi output tambahan 20,000 karakter, di luar itu explicit partial/omitted.

Sample pada offscreen buffer kecil, bukan copy full-resolution image ke disk. Laporkan source size, sampled size, observation timestamp/document identity, grid, palette, approximation/omission flags. Tangani alpha/transparency dengan legend eksplisit; RGB transparan tidak boleh dibaca sebagai objek hitam. Canvas tainted/unsupported context atau error readback menghasilkan `unavailable` dengan alasan, bukan grid kosong yang dianggap pengukuran sukses.

Named colors diprioritaskan secara bounded; laporkan warna asli yang diminta, quantized observed color, matching distance/ambiguous/absent. Nama operator tidak menjadi klaim object identity. Satu warna pada objek berbeda tidak boleh digabung menjadi “objek yang sama”. `named_clusters` donor berbasis kedekatan kolom, bukan connected-component/object detector; native cukup melaporkan bounded cell spans dengan keterbatasan itu atau tidak mengeluarkan clusters sama sekali.

Sampling tidak memanggil `act`, tidak menghasilkan coordinate-click authority dan tidak membuka control baru. Pixel raster dapat berubah tanpa DOM berubah; output harus menjelaskan timestamp dan tidak menjanjikan pixel freshness pada aksi berikutnya. Screenshot/OCR capture dan raw canvas export bukan bagian proposal ini.

**Files:** create `src/rdc/browser-control/canvas-observation.ts` untuk helpers bounded inventory/sampling/projection; modify `service.ts`, `src/rdc/handlers/browser-control-handlers.ts`, kedua browser schemas dan tool metadata. Usulan service signature additive `observe(sessionId, options?)`; legacy `observe(sessionId)` tetap valid. Kode CDP tetap host-owned, bukan input script.

**Acceptance:** fixture canvas 640x320 menjadi grid32x16; palette order deterministic; operator-named rare color tidak hilang tanpa omission signal; wrong-session/stale canvas ID ditolak; multiple/hidden canvas; resize/remove; transparency; tainted canvas; finite limits; off mode tidak memanggil sampler; DOM observe tetap berhasil ketika optional canvas tidak tersedia. Tidak menyatakan pixel-perfect/no-loss.

## 5. S1-P3 — Observed tab navigation dalam owned browser

**APPROVED — IMPLEMENTED; qualification di bagian 10.** Donor: `envs/browser.py` `_observe` membuat candidates `tabs`, `_execute` memiliki `switch_tab`. Native `pageTarget` mengambil page pertama dan `BrowserSession` menyimpan satu client; tidak ada tab inventory/switch operation pada action kind/schema yang dibaca. Consumer nyata adalah page yang membuka target baru selama workflow browser.

**Adaptasi usulan:** observasi daftar page targets dari browser yang dibuka session ini saja, bind opaque tab/action ID ke full internal target ID; tampilkan maksimal 16 tabs dengan active flag, title dan safe URL metadata. Jangan menyalin pemotongan target ID menjadi 4 karakter dari donor. Tidak attach browser eksternal, profile pengguna, arbitrary CDP endpoint atau OS window.

Expose `SWITCH_TAB` melalui action ID yang baru diobservasi, bukan caller-supplied raw target. Sebelum switch, pastikan target masih ada dan milik session; invalidate observation lama. Rebind owned client/target, enable domains yang dibutuhkan, lalu wajib observe baru. Pop-up/new-tab detection tidak otomatis mengklik/mengirim data di tab itu.

Target non-page, devtools/extension/browser-internal, dan disallowed URL scheme tidak menjadi action. Transisi `about:blank` yang masih pending dilaporkan pending sampai target memenuhi policy; jangan mengalihkan user ke page lain sebagai fallback. Tab ditutup pada jeda observe-act harus gagal spesifik, tanpa menutup tab lain.

**Files:** create `src/rdc/browser-control/owned-tabs.ts`; integrate `BrowserSession`, `pageTarget`, snapshot/action projection dan `act` di `service.ts`; update metadata. `act(sessionId, observationId, actionId, text?)` tetap dapat dipertahankan karena target sudah terikat di action map. Semua target/profile tetap ditutup oleh owned-session cleanup existing.

**Acceptance:** dua tabs dengan title sama tetap berbeda; full target IDs yang suffix-nya sama tidak collision; closed/replaced/stale tab rejected; session A tidak dapat memilih tab B; focus switch menghasilkan observation baru; global action/observation budget tetap dibatasi; close membersihkan owned targets tanpa menyentuh browser lain. Fixture loopback dan mocked CDP; no personal browser automation.

## 6. S1-P4 — Bounded keyboard dan history primitives

**APPROVED — P4a/P4b/P4c IMPLEMENTED; qualification di bagian 10.** Donor `envs/browser.py:34–74` mendefinisikan finite `press_key`, `hold_key`, dan `go_back`; `_hold` mengirim keyDown/keyUp dengan durasi, `_execute` menjalankan primitive tersebut. Native service saat ini menggunakan keyboard hanya secara internal untuk replace text; controller tidak mempunyai key/history primitive untuk Escape, keyboard-widget navigation, atau held-key canvas input.

Pisahkan selection **P4a press**, **P4b hold**, **P4c back**. Tidak harus memilih semuanya. P4 independen dari P2: aksi keyboard tidak boleh mengasumsikan ada object semantics dari raster canvas.

**Kontrak usulan:** pada `open`, `interactionCapabilities` optional berisi subset `keyboard|held-key|history`, default kosong. Capabilities ini hanya menambah daftar primitive untuk session yang eksplisit diminta, bukan sistem izin/route global. Primitive tetap dieksekusi satu per `act` dengan fresh observed action ID.

Press: finite whitelist sumber `Enter, Escape, Tab, Backspace, Space, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, PageUp, PageDown, Home, End`. Hold: hanya Arrow directions, Space, Shift; durasi preset 150/400/800 ms, hard cap 800 ms. Tidak menerima script, key sequence, modifier chord, shortcut browser/OS, clipboard command, atau macro. Caller tidak dapat menyelundupkan text melalui field key.

Observe harus mencatat target/document/focus fingerprint. Jangan menawarkan keyboard action untuk password/file/hidden atau browser-internal context. Enter/Space/Backspace yang dapat mutate/submit tetap action eksplisit, tidak dieksekusi hanya karena confidence model tinggi. Focus berubah setelah observe menyebabkan stale rejection. Pengaktifan held-key tidak menonaktifkan refusal/no-progress/mutation safety.

Release memakai `try/finally` dengan best-effort keyUp bahkan saat operasi gagal/cancel/close. Jika transport hilang dan release tidak dapat dipastikan, hasil `mutation-uncertain`, bukan retry ulang keyDown. Track held keys pada owned session agar cleanup tidak meninggalkan stuck input; tidak mengirim tombol ke OS/browser lain.

BACK ditawarkan hanya bila previous history entry yang sesuai scope terlihat dari current owned page. Navigasi menghabiskan satu action dan menginvalidasi observation lama; dialog/repost/interstitial dilaporkan untuk keputusan controller berikutnya, tidak di-accept otomatis. Tidak membuat loop “back until success”.

**Files:** create `src/rdc/browser-control/keyboard-actions.ts` bila pemisahan diperlukan; modify `service.ts`, kedua browser schemas, handler dan metadata untuk optional open capabilities. Observed action map menyimpan key/duration/history identity internal; jangan menambah arbitrary code payload di public MCP.

**Acceptance:** each allowed key exactly one dispatch pair; every hold duration bounded; thrown send/cancel releases when transport remains available; lost transport reports uncertainty and no blind retry; wrong focus/session rejected; no modifier injection; BACK changes observation identity; feature off preserves old action surface. Tests tidak melakukan keystrokes pada desktop/browser pengguna.

## 7. Integrasi bersama dan urutan delivery setelah persetujuan

1. Re-ground source/header/helper terkini dan pilih P1/P2/P3/P4a–c. P1–P4 dapat dipilih terpisah; jangan membuat dependency palsu antar-proposal.
2. Pertahankan satu `BrowserControlService`/owned CDP lifecycle. Helper baru hanya pemisahan tanggung jawab; tidak ada Browser Use daemon, transport MCP kedua, watcher, confidence gate, atau per-task agent.
3. Semua actions, termasuk tabs/keys/history, berbagi existing max250 candidate budget dan max60 consumed actions. Jangan memperbesar diam-diam; tampilkan omission per kategori. Canvas/control-state merupakan observation evidence, bukan action tambahan. Old actions tidak boleh hilang tanpa omission evidence ketika opsi baru diaktifkan.
4. Sinkronkan schema publik, schema handler, dispatch dan metadata. Uji parity pada handler aktual, bukan hanya helper. Default/off modes harus mempertahankan behavior lama; service signature baru optional.
5. Tambahkan focused fixtures pada `tests/systemone-browser-adoption.test.ts`; existing `tests/browser-control.test.ts` menjadi regression seam bila diizinkan. Perintah yang ditawarkan: `npx vitest run tests/systemone-browser-adoption.test.ts tests/browser-control.test.ts`. No test command dijalankan dalam audit ini.
6. Setelah implementasi disetujui, build untuk menghasilkan artifact; public signature/metadata changes memerlukan structural review dan focused manifest/schema compatibility checks. Manifest budget existing harus diperiksa, bukan diasumsikan cukup. Jumlah tool tidak perlu bertambah.
7. Catat license/attribution source yang benar-benar diadaptasi di `THIRD_PARTY_NOTICES.md`, satu changeset untuk shipped selection, update affected `CODEBASE.md`, plan dan canonical Memory. Release apply/commit/tag/push/deploy/restart tetap memerlukan instruksi terpisah. Live activation tidak dibuktikan oleh file build saja.

## 8. Census keluarga lain dan batas source donor

| Keluarga / anchor | Disposition dan fakta pembatas |
|---|---|
| `envs/browser.py` DOM candidate/action mapping; `tests/test_browser_env.py` | **Partly covered + P1:** native sudah memiliki observed action IDs, labels, safe fill/select, currentValue/checked flags dan fresh geometry/occlusion. Tidak mengganti semuanya. Donor `NOT_TEXT_INPUT_TYPES` tidak menyebut password; native password exclusion wajib dipertahankan. |
| Canvas sampler / legend / clusters | **P2:** observasi tambahan melalui owned session. Jangan menyalin arbitrary selector, implicit largest-canvas choice, atau label-as-object inference. |
| Tab list/switch, key/hold/back | **P3/P4:** identity/focus/session ownership dan release safety dirancang ulang; jangan menyalin last-four-character tab IDs atau keyDown/sleep/keyUp tanpa cleanup yang dijamin. |
| `actions.py:1–272`, `tools.py:66–173` | **Conditional S1-C1:** finite schema-to-question compiler/unsupported-reason catalogue untuk discrete-decision consumer yang kelak nyata. Native sekarang melayani typed MCP tool calls, bukan decision questions. `oneOf` partial extraction/coercion tidak cukup untuk menggantikan runtime schema validation; tool metadata/risk hints bukan otorisasi. |
| `gate.py:1–96`, `controller.py:1–198` | **Tidak diadopsi sebagai authority:** confidence threshold read/write/destructive, repeated `finish` yang menjadi `finish_insisted`, serta realtime bypass tidak membuktikan permission/success. Native tool execution tidak boleh dikendalikan gate probabilistik tambahan. |
| `controller.py` budgets/cancel/repeat; `trace.py` | **Partly covered/conditional:** event/status distinctions berguna, tetapi native already has bounded calls/process ownership/invocation evidence. New autonomous controller/loop bukan kebutuhan browser primitive; tidak mengadopsi unredacted state logs atau menganggap terminal=verified success. |
| `encoder.py:1–100`, `config.py:1–94` | **Conditional S1-C2:** decision-context compilation menunggu native prompt assembly consumer. Estimate chars/4 bukan hard token guarantee. `compile_skills` menghitung budget dari panjang path dalam `self.skills`, bukan total isi yang telah ditambahkan; jangan menyalin budget semantics itu. |
| `objective.py:1–190` dan CLI evaluation/retune flow | **Conditional S1-C2:** declarative failure locus/ordered metrics untuk native environment evaluator baru. Native Learning sudah mempunyai comparable report/split/resource evidence; scoreboard donor tidak membuktikan independent verifier, identical cohorts atau causal improvement. Jangan ganti evaluation authority dengan simple goal predicate. |
| `provider.py:1–192` | **Conditional C1/C2:** decision API adapter + recorded/script provider untuk harness yang memang dipilih nanti. Tidak ada panggilan live/model verification dalam audit. Hard-coded hosts/models, retry policy dan usage default zero tidak digunakan sebagai fakta biaya/availability saat ini. |
| `envs/mcp.py:27–169`, browser MCP wrapper | **Conditional S1-C3:** adapter observe/reset/execute bagi external environment. Agent Core tidak membutuhkan MCP client federation kedua untuk empat proposal. Source header branch memakai import `httpx2` sementara pyproject mendeklarasikan `httpx`; kompatibilitasnya belum terbukti dan bukan dependency yang akan dipasang diam-diam. |
| `envs/stdio.py:27–66` | **Tidak diganti ke native process layer:** constructor menyimpan timeout tetapi `_call` memakai blocking `readline` tanpa deadline itu. Timeout/cancel/process-owner harus nyata bila adapter kelak dipakai, bukan sekadar property. |
| `uhp.py:51–459`, `tests/test_uhp.py` | **Conditional C3:** protocol adapter/session continuation/ordered event projection hanya bila user memilih UHP consumer. Source deklarasi discovery menyebut idempotency false; tidak menganggap UHP wrapper sebagai durable/exactly-once layer. No new listener/session DB sekarang. |
| `extension/background.js`, `extension/sidepanel.js` | **Conditional C3:** UHP UI client, bukan browser automation engine. Sidepanel menyimpan key pada `chrome.storage.local`; tidak diimpor sebagai credential-storage policy Agent Core. Tidak memasang extension atau mengakses personal browser. |
| `environment.py`, config/CLI/examples, fixtures/tests, assets/package metadata | **Support/reference-only:** konvensi bagi harness donor dan qualification examples; bukan current consumer tambahan. Test source dibaca/diindeks tetapi tidak dijalankan. Tidak mengklaim every branch dynamically verified. |

## 9. Keputusan folder dan review

**HISTORICAL RETENTION - superseded by final Consumer disposition in section 12.** S1-P1–P4 mempunyai native consumer dan menunggu seleksi, sehingga SystemOneHarness bukan corpse dan bukan consumer-only. Conditional C1–C3 tidak menjadi alasan untuk membuat runner/DB/model baru sekarang. Jika seluruh P ditolak, evaluasi lagi apakah conditional sengaja dipertahankan dan baru pindahkan ke `Consumer/SystemOneHarness` bila memang hanya itu nilainya.

Penutupan census terbatas pada revision tetap dan keluarga executable yang diperiksa: tidak ada current-fit tambahan yang cukup terjustifikasi di luar daftar ini; bukan bukti bahwa tidak mungkin ada ide/bug masa depan. Source inventory lengkap tetap dibedakan dari targeted body review dan dari tests yang belum dijalankan.

**Tahap hari ini:** plan/evidence/docs/Memory saja. Tidak ada capability yang dipasang, perubahan product source, install helper/dependency, marker, build/test, runtime restart, atau reference deletion/move.


## 10. Approved implementation dan qualification — 2026-09-29

Seluruh current-fit selection disetujui dan diimplementasikan: **S1-P1, P2, P3, P4a press, P4b hold, P4c back**. Consumer tetap satu native `browser_control`, tanpa model/controller/UHP/Browser Use runtime baru.

- **P1:** `control-state.ts` dan independent DOM projection menghasilkan safe `controlStates`, termasuk selected-only, readOnly/disabled dan mixed state; batas 128 record / 500-character values / 8,000-character envelope dipertahankan dengan omissions.
- **P2:** `canvas-observation.ts` menyediakan opt-in inventory/sample, opaque session/document-bound canvas IDs, document digest/timestamp, RGBA transparency, deterministic palette, operator-label matching evidence, bounds dan unavailable reasons. Default/off tidak membaca raster.
- **P3:** `owned-tabs.ts` mengikat opaque IDs ke full owned target IDs, menampilkan maksimal 16 tabs, memeriksa target/URL ulang sebelum switch, dan menolak closed/stale targets. Tidak attach browser personal atau arbitrary CDP endpoint.
- **P4:** `keyboard-actions.ts` membatasi whitelist dan durasi 150/400/800 ms; focus/document checks, idempotent best-effort keyUp, close cancellation dan explicit uncertain outcome. Hold timer dimulai pada dispatch, bukan setelah acknowledgement yang bisa lambat. History BACK hanya melalui observed owned history entry; dialog dilaporkan, bukan auto-accepted.

Public `src/mcp/rdc-schemas.ts`, handler `src/rdc/tools/schemas.ts`, actual handler forwarding dan metadata disinkronkan. Parameter tambahan hanya optional `canvas` (observe) dan `interactionCapabilities` (open). Existing signatures tetap menerima panggilan lama. Seluruh action berbagi max250 candidates/max60 consumed actions; observe max120. Per-session in-flight marker mencegah interleaving key/tab mutations, bukan global routing/permission gate.

Qualification aktual: **31/31** di `tests/systemone-browser-adoption.test.ts`, **3/3** existing `tests/browser-control.test.ts`, dan **12/12** SHINKA-P1; total **46/46 PASS, 0 fail, 0 skip**. Browser tests memakai isolated owned Chromium + loopback fixture; schema parity dan actual handler forwarding diuji, bukan hanya pure helpers. Taint/closed-target/failure/late-ack cases menggunakan bounded mocks; tidak diklaim sebagai live personal-browser probes.

Dua kegagalan putaran awal ditangani: readiness startup diperketat agar `about:blank` yang complete tidak dianggap ready untuk URL tujuan; cleanup fixture multi-session mendapat 30-second hook budget sesuai owned process cleanup. Source-review tests juga mengungkap missing public canvas document identity dan hold deadline yang menunggu acknowledgement; ketiganya memiliki failing-before / passing-after evidence.

Build final exit 0, path policy **266/0**. Compatibility **70 -> 70 tools**, no tool/route removal, no newly-required params, `breakingEvidence=false`; manifest **118,082 bytes / ~29,521 tokens**. Schema review atas dua optional fields diselesaikan melalui exact-source + parity/handler acceptance; post-change graph evidence sendiri belum tersedia.

**HISTORICAL PRE-RESTART — resident activation (closed by section 11):** Node Core PID 1740 masih proses start `2026-09-29T08:01:41Z`, sedangkan compiled browser service baru `09:15:42Z`. Build/test child-process qualification bukan bukti schema/capability baru telah resident. User-controlled restart/reconnect diperlukan untuk fresh live readback.

**HISTORICAL PRE-RESTART — graph verification (closed by section 11):** reindex gagal `daemon not running`; subsequent status `index=unknown`, `graph-load-probe-failed`. Pre-change structural review current; source-only fallback digunakan sesudah kegagalan. Tidak ada automatic daemon/Core restart dan tidak ada klaim graph sehat/current untuk source baru.

Referensi SystemOneHarness tetap pada lokasi asal untuk final activation/lifecycle review. Conditional C families tidak dipasang. Evidence, source hashes, before-images dan test logs: `runtime/tmp/shinka-systemone-implementation-20260929/`. Attribution di `THIRD_PARTY_NOTICES.md`; minor intent `.changeset/20260929-shinka-systemone-adoption.md`. Tidak ada dependency baru, release apply, version bump, commit/tag/push atau deployment.

## 11. Post-restart live readback - 2026-09-29

Resident Core PID **3164** started at **2026-09-29T09:46:26.063Z**, after browser artifact **09:15:42Z** and public-schema artifact **09:15:44Z**. `/health` returned ok, version 0.14.0, Memory issueCount 0 and Code Intelligence available. The original implementation/source and compiled hashes still match `result.json`; no implementation change or build was performed in this continuation.

**S1-P1 live observed through the connected MCP:** a loopback fixture returned three independent control-state records including a select with only one selected option, a read-only field, and a checked checkbox. Synthetic password/hidden values did not appear in the observation.

**S1-P3 live observed through the connected MCP:** a fixture action opened a second owned tab; the returned SWITCH_TAB action was invoked and a fresh observation reported `SECOND TAB VERIFIED` on the selected tab. Both tabs belonged to the same isolated session. The session was closed with inputRelease=confirmed and the temporary fixture process was stopped. A subsequent browser status listed zero sessions.

**Post-change graph verification CLOSED:** explicit index request succeeded after the user restart; readback is current with graphIntegrity=accepted, **9,289 entities / 48,950 relationships**, registered-repo coverage 1/1. New Pareto and CanvasObserver source entities are discoverable in this refreshed graph.

**HISTORICAL pending acceptance - resolved for resident runtime by section 12; chat schema exposure unchanged:** the Agent Core browser_control schema exposed to this chat still lacks `canvas` and `interactionCapabilities`; targeted connector discovery for canvas returned no action. Consequently S1-P2 and S1-P4 opt-in paths were not exercised through this connector. A separate local HTTP MCP handshake without a bearer returned http-unauthorized. No key was read/created, no auth state was altered, and no authentication requirement was bypassed. An authenticated runtime tools/list readback was not obtained, so server-advertisement vs connector-cache cause is not conclusively established.

The prior **46/46** scoped qualification remains historical test evidence with unchanged hashes, not a newly rerun suite. Overall wave is not labeled COMPLETE/live-verified for all selections. Remaining acceptance needs a connector schema that exposes both optional fields or separately authorized temporary local verification credentials; another Core restart is not the indicated next step.

References remain in their original protected locations until this remaining acceptance/lifecycle review closes. Evidence: `runtime/tmp/shinka-systemone-implementation-20260929/live-readback-20260929.json`. No tests/build/release apply, version bump, Git mutation, dependency installation, or additional Core/daemon restart occurred in this continuation.

## 12. Authorized resident MCP acceptance and final lifecycle - 2026-09-29

**COMPLETE FOR APPROVED ADOPTION.** After explicit user approval of temporary-key verification, one key was created at `2026-09-29T10:19:01.957Z`, with expiry `10:29:01.914Z`. The probe called only the existing `http://127.0.0.1:8765/mcp` endpoint; browser activity used isolated owned Chromium and synthetic loopback pages. No personal profile, external page, donor runtime or second Core instance was used.

Authenticated resident `tools/list` returned 70 tools and advertised both optional `browser_control.canvas` and `browser_control.interactionCapabilities`. This establishes a real difference from the schema exposed to this chat. The chat binding was not modified; the precise connector/cache cause remains unproven. Native runtime acceptance is closed, not a claim that the missing fields are now callable directly through this chat's binding.

**Fresh live probe: 16/16 checks PASS, process exit 0.** It exercised default-off behavior; independent safe control state; visible-canvas inventory; 640x320 source -> 32x16 lossy sample; operator-label/document binding; unknown and resized-canvas rejection while DOM remains available; explicit keyboard options; observed Escape key-down/key-up; bounded 150/400/800ms candidates; actual 150ms ArrowRight down/release; forward navigation and observed BACK effect. Session cleanup also passed. Earlier connected-MCP S1-P3 tab-switch proof remains valid unchanged-artifact evidence.

The key was revoked at **10:19:19.079Z**, before expiry. Native verification rejected it and an HTTP MCP request using that same key returned **401**. Other key metadata remained unchanged apart from permitted usage timestamps; no prior credential was revoked or replaced. The key value was neither printed nor persisted to script/report/Memory. The revoked hash/metadata record is retained by the existing key store for audit. Browser session count is zero and the local fixture listener/client were closed.

The earlier 46/46 scoped tests (including 31 SystemOne cases), build and compatibility results are retained historical qualification with matching source/compiled hashes; no full suite or build was rerun. Fresh graph status remains current/integrity accepted with 9,289 entities / 48,950 relationships.

**Reference lifecycle CLOSED for current scope:** SystemOneHarness was moved intact to `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/SystemOneHarness`. All 54 non-Git file hashes match the original audit; HEAD remains `ab8e8f08b4a6268c0633a474423d556599ee06a4` and working tree is clean. Active-source references are attribution comments, not runtime imports. Remaining C1-C3 value awaits future discrete-decision/context/UHP consumers, so the reference is not deleted and those systems were not installed.

Evidence: `runtime/tmp/shinka-systemone-implementation-20260929/authorized-live-2026-09-29T10-19-01-869Z.json` and `reference-lifecycle-20260929.json`. Earlier snapshots remain historical, not overwritten. No product source/dependency/build change, Core restart, release apply, version bump, commit/tag/push or deployment occurred in this continuation. Docs and canonical Memory are updated to this exact runtime-vs-connector boundary.
