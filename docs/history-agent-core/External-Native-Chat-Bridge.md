# External Controller ↔ Native Agent Chat Bridge
Tanggal: 2026-10-27 (Asia/Bangkok; riwayat mulai 2026-10-23)
Revisi: 3
Status: COMPLETED — R1/R2/R3 seluruh implementasi dan acceptance selesai; aktivasi dan review Learning selesai 2026-10-27
Jenis: Improvement
Scope: External AI Controller adapter; Native AI Agent Core tersedia untuk pengembangan dan operasi sesuai keputusan pengguna 2026-10-24.

**Keputusan terkini R3:** pengguna meminta kedua proposal benar-benar complete,
termasuk keseluruhan scope bridge. Phase B kini termasuk otorisasi task ini;
label `NOT APPROVED` pada bagian bertanggal 2026-10-23 di bawah adalah riwayat,
bukan pembatas scope R3. Tidak ada klaim bahwa source/test saja membuktikan resident.

## Masalah dan tujuan
Percobaan GUI pada 2026-10-23 menunjukkan external controller tidak memiliki primitive semantik untuk menulis ke composer Native Agent atau membaca jawabannya. Koordinat desktop hanya menebak target dan tidak boleh menjadi jembatan chat.

Tujuan terkini: menyediakan kanal terstruktur External Controller → Native Chat dan Native Chat → External Controller melalui owner existing. R3 mencakup facade dan provenance hardening pada HTTP/chat service/store; grants dan provider tetap dimiliki owner semula. R2 UI synchronization tetap dipertahankan.

## Bukti dan ketidakpastian
- `src/agent-chat-service.ts` sudah memiliki list/get/create conversation, `runTurn`, resume, cancel, archive, event sink, persisted user/assistant messages, dan idempotent `clientRequestId`.
- `src/http/app.ts` sudah mengekspos loopback `/agent/chat/*`; turn memakai NDJSON events + final result.
- Route chat dilindungi loopback + `X-Agent-Core-UI-Token` dengan constant-time comparison.
- `src/launcher/AgentCoreRuntime.cs` sudah menjadi client resmi API tersebut.
- `src/ui/src/App.tsx` hanya meneruskan composer ke host; UI bukan authority data.
- Pencarian `src/mcp` menemukan 0 bridge/tool Native Chat untuk External Controller.
- Child process Agent Core melihat token lokal tersedia (nilai tidak dibaca/ditampilkan), dan read-only GET berhasil membaca 17 conversation dari loopback API.

## Mekanisme dan owner existing yang dipakai
### Phase A — adapter eksternal minimal
Buat `scripts/external/native-chat-bridge.mjs` sebagai client lokal, bukan service baru.
- Port: `AGENT_CORE_PORT` atau default 8765, sama dengan `src/config.ts`.
- Token: dibaca dari environment child process; tidak pernah dicetak, disimpan, atau dikembalikan ke model.
- Backend: HTTP loopback existing; tidak membaca/menulis `chat.sqlite` langsung.
- Operasi: `list`, `read <conversationId>`, `send <conversationId> <prompt>`, `cancel <turnId>`, dan optional `create`.
- `send` membaca stream NDJSON dan mengeluarkan envelope bounded: event penting + final response/error.
- External controller menjalankan adapter melalui `start_process`; tidak ada klik, koordinat, SendKeys, UIAutomation, atau clipboard.

### Phase B — first-class external MCP facade, hanya setelah Phase A terbukti
Jika penggunaan CLI berulang memang bernilai, tambahkan satu external-only MCP tool semantik (mis. `native_chat_bridge`) yang membungkus adapter/backend yang sama.
Registrasi wajib hanya saat `!runtime.nativeTaskId`; jangan menambah capability Native, mengubah Native grants, atau menyentuh `agent-chat-service.ts`/HTTP/UI/launcher di luar scope proposal adapter ini.

## Kenapa bukan UI automation
UI adalah proyeksi state. API chat already owns conversation identity, persisted messages, busy state, idempotency, streaming, cancellation, continuation, provider affinity, dan Learning finalization. Mengendalikan textarea melewati semua kontrak itu dan tidak tahu apakah target benar.

## Scope, batas Native, risiko dan otorisasi
- Scope proposal adapter ini tetap mengikuti keputusan pengguna yang terkait. Proposal ini tidak mengubah agent model loop, chat service/store, HTTP route existing, UI, launcher, provider, capability catalog Native, atau Native grants.
- Phase A hanya menambah script external-controller di `scripts/`.
- Secret boundary: token hanya dibaca di child process dan dipakai sebagai request header loopback; output wajib redacted dan tidak boleh mengandung header/token.
- User-message semantics: bridge mengirim prompt sebagai external-controller initiated Native turn. Ini berbeda dari operator-authenticated local-chat commands; bridge tidak boleh dipakai untuk memalsukan `user-message:` approval/authorization evidence.
- Jangan membaca `chat.sqlite` langsung untuk live state; service/API existing tetap source of truth.
- Jangan auto-send tanpa explicit controller action pada task aktif.

## Manfaat yang diharapkan dan keterbatasan
Expected: input/output Native Chat menjadi addressable, replayable, idempotent, dan tidak bergantung layout desktop.
Expected: controller dapat melihat streaming progress dan final text dengan conversation/turn identity yang sama seperti UI.
Belum terbukti: apakah dialog controller↔Native meningkatkan task outcome. Bridge hanya transport; manfaat kognitif harus dievaluasi terpisah.
Keterbatasan: Native Agent yang busy tetap dapat menolak turn; provider/runtime failures tetap diteruskan apa adanya.

## Acceptance, evaluasi dan rollback
1. Read-only `list` dan `read` cocok dengan conversation/detail yang ditampilkan UI untuk sample yang sama.
2. Test turn terisolasi membuat tepat satu persisted user message dan satu final assistant message dengan `clientRequestId` unik.
3. Stream mengembalikan event/result tanpa token, credential, atau raw secret leakage.
4. Mengulang `clientRequestId` yang sama mereplay hasil, bukan membuat turn kedua.
5. Wrong conversation/busy/cancel/error tetap fail closed dan bounded.
6. Phase A tidak mengubah file di `src/agent-*`, frozen sections, database schema, atau UI.
7. Rollback Phase A cukup menghapus script adapter; runtime Native dan stored conversations tetap valid.

## Hasil Phase A — 2026-10-23
- Implemented: `scripts/external/native-chat-bridge.mjs`; zero dependency baru, backend tetap `/agent/chat/*`, token hanya dibaca dari environment child process dan tidak diproyeksikan ke output.
- Operasi aktif: `list`, `read`, `create`, `send` (NDJSON events/result + idempotent `clientRequestId`), dan `cancel`.
- Read acceptance: adapter membaca 17 conversation aktif dari backend Native Chat.
- Isolated send acceptance: conversation `External Bridge Verification 2026-10-23` menerima satu turn terverifikasi; Native Agent menghasilkan assistant response `BRIDGE_OK`.
- Replay acceptance: request `bridge-verification-20261023-b` mengembalikan turn/task yang sama dengan `replayed=true`; readback menunjukkan tepat 1 user message + 1 assistant message pada turn tersebut.
- Negative path: percobaan pertama tercatat gagal di Native runtime dengan `AGENT_RUNTIME_VERIFICATION_EVIDENCE_REQUIRED`; bridge tetap menyimpan identitas turn/pesan dengan benar. Invalid read/cancel keluar non-zero dan bounded.
- Secret boundary: output acceptance tidak mengandung nilai `AGENT_CORE_UI_TOKEN`.
- Guards: historical governance check PASS (31 files / 78 shared sections), `path:check` PASS (465 authored files, 0 exceptions), release plan membaca changeset `external-native-chat-bridge` sebagai patch intent.
- Tidak ada perubahan pada `src/agent-*`, HTTP Native, UI, launcher, provider, grants, database schema, atau kebijakan runtime.

## Riwayat revisi
- R1, 2026-10-23: source-first audit; pengguna kemudian menyetujui Phase A. Adapter external-controller diimplementasikan dan targeted acceptance di atas teramati. Phase B tetap belum disetujui.

## Keputusan pengguna dan scope
Keputusan pengguna 2026-10-23: menyetujui plan pada dokumen ini untuk dikerjakan. Scope diterapkan sebagai **R1 Phase A build + targeted verification only**.
Phase A: COMPLETED / VERIFIED terhadap acceptance yang tercatat di atas.
Phase B first-class MCP facade: NOT APPROVED / tidak dikerjakan.


## Revisi 2 — Visibilitas pesan External Controller pada Native UI (2026-10-23)
**Status R2: USER-APPROVED / IMPLEMENTED / TARGETED TEST PASS / RESIDENT CHAT VISIBLE MESSAGE VERIFIED (2026-10-23).** R1 Phase A remains verified; Phase B remains outside approved scope. Existing protected Native sections and baseline remain unchanged.

### Gejala dan bukti langsung
- Screenshot pengguna 2026-10-23: header menunjukkan `Chats: 18`, tetapi thread yang aktif masih `New Chat` dan tidak ada item `External Bridge Verification 2026-10-23` di daftar yang terlihat.
- Live `native-chat-bridge.mjs list` pada backend: 18 conversation aktif, termasuk `External Bridge Verification 2026-10-23` dengan ID `6dd03444-e764-4253-a7e5-229930facb2b`.
- `src/ui/src/App.tsx`: `chatListLoadedRef` membatasi fetch list ke satu kali saat snapshot healthy; tidak ada poll/invalidation untuk external-created thread.
- `src/launcher/MainForm.cs`: `agent-chat-list`, `agent-chat-open`, dan `agent-chat-send` diproses hanya ketika WebView mengirim pesan host; external API tidak memicu UI event.
- `src/ui/src/pages.tsx`: transcript merender `props.agentChat.active.messages`, bukan query live; health counter berasal dari snapshot terpisah.
- Dua area ini kini tersedia untuk pengembangan Native; keputusan 2026-10-24 menggantikan pembatasan historis.

### Usulan perubahan minimum (memerlukan izin Native UI yang eksplisit)
1. Utamakan pemakaian kontrak host yang sudah ada: `agent-chat-list` dan `agent-chat-open`, tanpa API HTTP, provider, canonical DB, Memory/Learning, atau autentikasi baru.
2. Buat UI melakukan *bounded refresh* saat halaman Chat aktif (misalnya 3–5 detik), hanya setelah request sebelumnya settle. Deteksi conversation baru dan perubahan `updatedAtMs`; perbarui daftar tanpa memindahkan active thread secara otomatis.
3. Jika active thread menerima external turn, baca ulang detailnya secara bounded; jangan reset `runningRequestId`, draft textarea, atau optimistic local message, dan abaikan stale response yang tidak cocok dengan selected conversation.
4. Tunjukkan thread external baru sebagai item yang dapat diklik. Jangan hijack foreground, input, atau focus pengguna. Tidak ada automatic Send.
5. Jika polling tidak cukup efisien/tepat, desain host notification dari existing chat service hanya setelah kebutuhan dan safety terbukti; jangan menciptakan state store kedua.

### Acceptance dan risiko
- Setelah External Controller membuat/mengirim ke thread via loopback, **tanpa restart app**, daftar Native UI menampilkan thread tersebut dan saat dipilih pesan user terlihat, bahkan jika provider gagal membalas.
- Mengirim ke active thread memperbarui transcript setelah completion/failure, tanpa duplikasi, focus steal, kehilangan draft, atau race dengan local send.
- Source/backing database tetap canonical; idempotency, permission, operator-command provenance, dan error boundaries tidak berubah.
- Targeted UI tests plus pembuktian pada resident WebView2 sesudah explicit approval; screenshots, tool receipts, dan readback, bukan perkiraan.
- Rollback hanya pada perubahan UI yang tepat; pertahankan perubahan pengguna dan batas authority runtime.

### Status keputusan R2
**APPROVED by user on 2026-10-23, narrowly scoped to Native Chat UI synchronization.** Implemented with an additive effect in `src/ui/src/App.tsx`; no changes to protected `src/ui/src/pages.tsx`, `src/launcher/MainForm.cs`, or runtime authority. Phase B external MCP facade remains NOT APPROVED.

### Observed implementation / acceptance
- `src/ui/src/App.tsx`: polls existing `agent-chat-list` only while Chat is visible and host healthy, one request at a time (4 s interval); newly discovered external threads appear without taking over current selection.
- Active conversation is reloaded via existing `agent-chat-open` only after `updatedAtMs` advances; skip while locally sending, preserve ChatPage draft, track manually selected thread and correct delayed stale responses.
- Targeted `src/ui/src/App.test.tsx`: 5/5 PASS. New test proves external thread appears, current selection and draft survive, opening it displays external user message, and newer messages refresh without draft loss.
- UI typecheck, historical governance checks (31 files / 78 sections) and `path:check` (465 authored files) PASS; Vite production build produced new `dist/ui` assets; official one-time Agent Core restart observed new desktop PID and healthy core/native chat.
- Resident visual acceptance PASS for one live external send: `runtime/tmp/native-chat-r2-realtime-before.png` shows the opened `External Bridge Verification 2026-10-23` conversation without the new test message; `runtime/tmp/native-chat-r2-realtime-after.png` shows the **same open Chat** with new visible user bubble starting `TES REALTIME 23-10-2026` while the Native turn was processing. Both acquired with offscreen Win32 `PrintWindow`, no focus/input/refresh action. Backend readback confirms exactly one persisted user message on the new turn; assistant turn later failed, which does not negate user-message visibility. End-to-end UI refresh was observed for this case; latency guarantees and all concurrent races have not been independently benchmarked.
- No new tool/provider/grant schema or dependency, no manual coordinate input, no git push or release deployment. One additional explicit user-requested send was used only for final R2 live-visibility acceptance. Changeset intent generated at `.changeset/20261023063852-60bc51.md`.
- R2 UI message-visibility acceptance is satisfied for the observed live case. This document remains active because Phase B external MCP facade is still outside the approved scope; no source/runtime changes were made during the final visual verification.

## Revisi 3 — penyelesaian Phase B dan audit acceptance (2026-10-27)

### Scope dan keputusan

Permintaan pengguna untuk menyelesaikan kedua proposal secara penuh membuka Phase B
sebagai pekerjaan task-scoped. Prasyarat nilai penggunaan CLI berulang telah teramati:
adapter dipakai untuk acceptance R1/R2 dan diagnosis Native yang tercatat dalam
proposal Native-Final-Report-At-Tool-Iteration-Limit. Ini bukan klaim peningkatan
kualitas penalaran Native. Tidak ada perubahan pada Native capability catalog atau
Native tool grants.

### Implementasi owner existing

- `src/mcp/native-chat-bridge-tools.ts` mendaftarkan satu `native_chat_bridge` dengan
  `list`, `read`, `create`, `send`, `cancel`; `server.ts` mengecualikannya ketika
  `runtime.nativeTaskId` ada. Credential tool-grant, controller contract dan mutation
  admission existing tetap membungkus registrasi.
- Facade menjalankan adapter existing melalui `process.execPath`, absolute script
  path dari project-root resolver, `shell:false`, `windowsHide:true`; prompt dikirim
  melalui stdin. Input tidak dapat memilih program, endpoint, credential atau origin.
  Backend tetap API chat loopback existing, tanpa DB writer baru.
- Send membutuhkan `clientRequestId` eksplisit dan stabil. Timeout/disconnect tidak
  menyebabkan retry otomatis atau Native stop. Outcome yang belum diketahui menyuruh
  membaca conversation/turn sebelum retry ID yang sama; `cancel` tetap aksi eksplisit.
- Adapter menandai send/replay `X-Agent-Core-Chat-Origin: external-controller`.
  HTTP menolak origin header tak dikenal dan meneruskan marker ke owner chat.
  Perubahan service/store milik Main membedakan external prompts dari trusted local
  operator commands; pesan external tidak boleh menghasilkan approval `user-message:`.
  Marker dan guard ini menutup celah provenance yang ditemukan saat audit Phase B.
- Batas adapter: HTTP JSON 4 MiB, satu baris stream 1 MiB, maksimum 200 event,
  record output 128 KiB dan seluruh stdout 512 KiB. Facade mempunyai child-output
  limit 512 KiB. Record besar diberi preview/truncation eksplisit, bukan completeness
  palsu. Timer dan reader dilepas dalam `finally`; UI token diredaksi dari output.
- Packaging existing harus menyertakan script adapter tepat pada path yang dipakai
  facade. Main menambahkan pemeriksaan/copy paket terkait; tidak ada instalasi baru.

### Performance contract dan pengukuran

Workload: operasi kontrol chat berfrekuensi rendah, prompt sampai 200.000 karakter,
stream Native yang dapat panjang, list/read dengan hasil bounded. Critical path
adalah spawn Node → HTTP loopback → layanan Native/provider → stream/projection →
exit; provider tidak digunakan oleh fixture transport. Tujuan perubahan adalah kanal
semantik yang dapat di-address dan pembatas resource/wait, bukan SLO latency baru.
Guardrails: autentikasi loopback, origin external, idempotency, cancellation tanpa
replay buta, output bounded dan draft/selection UI tetap terjaga.

Skill performance-oriented-software-engineering digunakan dari entrypoint host dan
source aktif untuk memilih adapter reuse dengan buffering bounded, mempertahankan
serial task ownership, serta membedakan biaya transport dari provider. Tidak ada
worker pool/cache/engine tambahan. Batas buffer bukan pengukuran peak RSS proses.

Raw measurement: `runtime/build/native-chat-bridge-phase-b-metrics.json`, lima proses
serial untuk list 20 conversation pada backend HTTP fixture. Run integrasi terakhir
2026-10-26T21:07:10.529Z mencatat 1958/466/613/1055/1748 ms (median 1055 ms,
rentang 466–1958 ms), masing-masing 1.585 byte stdout. Suite lain dan resident
acceptance berjalan bersamaan; angka ini bukan baseline lingkungan terisolasi.
Boundary mencakup child spawn sampai loopback JSON receipt dan process exit;
startup terisolasi, CPU, peak memory, tail latency produksi, provider latency,
throughput Native dan speedup belum diukur. Lima sampel ini tidak membuktikan
distribusi latency produksi atau manfaat kausal.

### Acceptance matrix R3

| Acceptance asli / tambahan Phase B | Bukti saat checkpoint source | Status |
| --- | --- | --- |
| List/read beridentitas sama dengan UI | R1/R2 resident readback dan screenshot before/after dipertahankan; R3 list/read melalui facade memakai canonical API dan ID yang sama | PASS historis visual + R3 API |
| Satu persisted user dan assistant untuk isolated send | R3 live facade create/send/read: conversation c9f1cb50-fed2-40e6-92ac-b314732020de, turn 0233c066-dec8-4a93-baaa-05ab74b79c5e, response BRIDGE_PHASE_B_OK | PASS resident, tepat dua pesan |
| Token/output/stream bounded | Token/general-secret redaction, missing-token/no-backend, oversized JSON/streamline, timeout/cancellation tests; live output dibandingkan dengan host credentials tanpa mencetak nilainya | PASS fixture + live secret check |
| Replay tidak menciptakan request identity baru | R3 live replay request native-bridge-full-acceptance-20261027: replayed=true, turn/pesan tetap satu pasang | PASS fixture + resident |
| Wrong/busy/cancel/error fail closed | Busy/cancel/unknown outcome fixture; resident missing read dan cancel menghasilkan bounded isError/404, tidak menambah turn | PASS fixture + resident negative |
| Phase A mempertahankan source/runtime Native | Batas historis R1 dipertahankan; R3 HTTP/service/store provenance hardening eksplisit untuk scope lengkap pengguna | PASS source + integration tests |
| R2 list/transcript refresh, draft/selection tanpa focus steal | Original offscreen before/after R2 tetap ada; `App.test.tsx` membuktikan failed turn + persisted assistant report terlihat dan draft tetap | PASS targeted UI; tidak ada UI source baru |
| External-only discovery dan input bounds | Manifest tests mengecualikan Native dan menjaga cap 128 KiB; real MCP client melihat 83 tool termasuk facade | PASS source + resident discovery |
| External prompt bukan trusted operator proof | Header route/invalid origin 400 dan service approval isolation tests; resident turn tersimpan messageOrigin=external-controller | PASS source + resident provenance |
| Packaging dan aktivasi | Exact script allowlist dan private-sibling exclusion tests; build/EXE publish sukses, satu restart resmi exit 0 dan PID 1664 healthy/build tidak stale | PASS fixture + resident |

### Directed verification dan batas checkpoint

- RED: facade belum ada; sesudah registration, fixture mengungkap marker origin yang
  hilang dan HTTP body tak bounded. Manifest menunjukkan cohort count berubah dan
  payload melampaui cap; count direkonsiliasi dan metadata baru dipadatkan tanpa
  menaikkan cap atau melemahkan runtime validation.
- GREEN: `native-chat-bridge-facade`, existing `native-chat-bridge` dan
  `mcp-manifest-contract`: 21/21 tests, tiga berkas, run akhir 11,95 s.
- UI targeted: `src/ui/src/App.test.tsx -t 'Native Chat UI refresh'`: 1/1 pass;
  failed status/error code dan persisted report terlihat bersamaan, draft utuh.
- Tidak ada live Native send, build/restart atau foreground/elevated input dari
  subtask Raka. Main memiliki aktivasi dan final acceptance seluruh proposal.
  Kalimat ini mencatat batas checkpoint Raka; Main kemudian menyelesaikan aktivasi
  dan acceptance resident pada catatan integrasi berikut.

### Riwayat revisi lanjutan

- R3, 2026-10-27: current full-completion request supersedes historical Phase B
  NOT APPROVED. Facade, bounds/cancellation/provenance hardening, package dependency
  audit dan acceptance matrix ditambahkan; original R1/R2 evidence dipertahankan.

### Acceptance integrasi Main

Scoped 10-file suite **120/120 PASS**, termasuk controller/checkpoint recovery,
store/replay/context, external operator isolation, HTTP, bridge, manifest dan
release support. UI existing **11/11 PASS**. [Ledger](../verification/Native-Final-Report-and-Chat-Bridge-Completion.md)
menautkan seluruh raw tests dan [resident readback](../verification/native-chat-resident-acceptance.json).
Resident send memakai satu model call dan nol tool call; Native Learning complete.
Replay lanjutan untuk validasi negatif tidak memanggil provider atau menambah pesan.

MCP lokal terautentikasi mengiklankan 83 tool termasuk `native_chat_bridge` dan
benar-benar mengeksekusi facade. Cache tool pada chat Codex ini masih menampilkan
82 tool tanpa facade sesudah refresh yang dilaporkan pengguna. Keterbatasan cache
host dinyatakan terbuka; pengujian memakai real MCP protocol client langsung,
bukan mengklaim tool baru telah muncul pada daftar tool chat ini. Tidak ada restart
kedua untuk cache, konfigurasi credential baru atau pelebaran grant.

Verifikasi negatif awal gagal karena validator mengharapkan pesan not_found untuk
cancel; API existing mengembalikan HTTP 404 dengan `{stopped:false}`. Validator
diperbaiki sesuai kontrak teramati dan rerun lulus. Auth key khusus Codex yang
diwariskan tidak diterima resident; configured host API key diterima tanpa
menampilkan atau mengubah nilainya. Tidak ada auth bypass.

Rollback facade: keluarkan registration dan exact adapter release dependency,
build/aktivasi melalui owner existing; conversation/history tetap valid. Rollback
R2 hanya effect UI terkait, mempertahankan data dan perubahan pengguna lainnya.
Changeset existing diperbarui menjadi minor intent untuk API tool tambahan;
version/release tidak diterapkan, tidak ada push/deploy/install baru.

### Penutupan dan arsip

Learning task `ext-12be7cffc1ac43d6b8fd6bdff69c5750`, checkpoint
`native-report-bridge-full-completion-20261027`: review `no-new-knowledge`,
complete=true, 2026-10-26T21:13:09.571Z.
[Receipt](../verification/native-chat-learning-closure.json) mencatat episode verify
unavailable karena scope koneksi; tidak diubah menjadi klaim pass. Raw tests dan
resident acceptance tetap bukti actual. Path asal:
`docs/proposals/External-Native-Chat-Bridge.md`; arsip:
`docs/history-agent-core/External-Native-Chat-Bridge.md`.
Scope R1 adapter, R2 UI refresh, dan R3 facade/provenance/package selesai penuh.
