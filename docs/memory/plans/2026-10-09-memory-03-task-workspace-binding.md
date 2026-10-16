> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Host-Validated Task/Workspace Binding Implementation Plan


**Goal:** Memisahkan identitas tugas/workspace Memory v2 dari koneksi MCP, dengan binding yang divalidasi host dan tetap aman ketika reconnect.

**Architecture:** Gunakan episode Learning eksternal sebagai identitas tugas stabil, identitas kredensial terautentikasi sebagai pemilik binding, serta registrasi workspace yang sudah ada. Adapter menyelesaikan binding setiap panggilan sebelum membuat `MemoryService.controller`; pemilik episode, transaksi, cursor, dan penyimpanan Memory tetap digunakan.

**Tech Stack:** TypeScript ESM, Node >=24.15.0, Zod, Vitest 4.1.11; tanpa dependency baru atau provider nyata.

**Spec:** Spesifikasi mandiri tertanam di bagian “Requirements”. Baseline sumber: `c5e3fe970b770aaa5ba3023ea19239f71f53709c`.

**Status: IMPLEMENTED — SCOPED OFFLINE GATES PASS; AGGREGATE REVIEW PENDING.** Implementasi sumber disetujui pengguna pada 2026-10-10 UTC dan dikerjakan di checkout sintetis dari snapshot upstream `b3fe106`. Gate root Plan03: 8 file / 75 tes PASS; gate engine terpisah: 4 file / 97 tes PASS. RED perilaku adapter, collision owner, reconnect HTTP/Native baseline, dan taskKey whitespace disimpan; symbol yang belum tersedia ditandai scaffolding, bukan defect. Build agregat, suite root penuh, dokumentasi CODEBASE, commit/push dan laporan gabungan dimiliki integrator induk. Provider/live/benchmark/resident activation tidak dijalankan atau diklaim. Laporan sumber: `.task-evidence/plan03/report.md`; ZIP terisolasi disertai receipt ekstraksi/hash. Tidak ada migrasi/aktivasi produksi, kredensial atau perubahan security runtime.

## Global Constraints

- Hanya perbaikan binding facade Memory v2; tidak mengganti autentikasi, grants, transport MCP, atau model keamanan global.
- Tidak membaca secret, `.env`, folder terlindungi, atau menyalin Memory produksi ke fixture/laporan.
- Pertahankan activation marker dan single writer `src/memory/host-runtime.ts`; jangan menyalakan engine dari keberadaan source.
- Semua gate wajib offline dengan fixture sintetis; tidak melanjutkan cohort lama yang dihentikan atau probe Cloudflare.
- Dugaan kegagalan sumber menjadi defect terkonfirmasi hanya setelah tes perilaku RED yang relevan direkam.
- Implementasi kelak wajib memperbarui bagian relevan `docs/CODEBASE.md`; jangan mengubahnya pada tahap rencana.

## Review Focus

1. Reconnect/headerless melewati pergantian jam: tugas eksplisit yang sama tetap dapat dilanjutkan, bukan episode baru.
2. Dua task: interleaving facade menjaga state/cursor Memory v2; atribusi Learning memerlukan aktivasi task terserialisasi.
3. Dua pemilik memakai header/taskKey sama: pemilihan task pemilik lain ditolak sebelum engine dipanggil.
4. Alias workspace hilang/berpindah atau basename kebetulan sama: binding lama ditolak, bukan diarahkan ulang.
5. Episode historis tanpa bukti pemilik dan state rusak: tidak diadopsi otomatis atau direset menjadi store kosong.

## Evidence: fakta source versus hipotesis

- `src/mcp/memory-experience-tools.ts`, `registerMemoryExperienceTools`, baris 25–33: `taskId = nativeTaskId ?? sessionId`, `workspaceKey = nativeWorkspace ?? 'agent-core'`; closure menangkap nilai saat registrasi. Ini fakta sumber, bukan bukti kebocoran resident.
- `src/mcp/handler.ts`, `externalControllerSessionId`, baris 60–73: header menjadi basis hash; tanpa header basisnya `legacy:<keyId>:<hourlyBucket>`. `createMcpHttpHandler` meneruskan nilai itu ke server. Hipotesis: tugas panjang dapat berganti identitas setelah batas jam, sementara beberapa tugas satu sesi dapat berbagi identitas.
- `src/http/app.ts`, autentikasi sebelum `mcpHandler`, dan `src/http/auth.ts::authenticateRequest` menghasilkan `VerifiedKey` dari `src/auth/key-types.ts`. `src/auth/tool-grant.ts::installCredentialToolGrant` sudah melarang direct call yang tidak mendapat grant. Gunakan hasil host ini, bukan owner dari header/payload.
- `src/learning/external-controller.ts::startEpisode` mengubah `sessionHeads`; reuse mencari `taskKey` + workspace. Episode/arsip belum memiliki binding kredensial. `getOrCreateEpisode`, `recordToolOutcome`, `labelEpisode`, `verifyEpisode`, dan jalur procedure/receipt tetap bergantung head sesi; owner-scoping tidak membuatnya task-selectable.
- `src/memory/service.ts::registeredWorkspaceIdentity` dan padanannya `SubProject/agent-core-memory/src/memory/service.ts` mengembalikan `{name,key}` berdasarkan root/registrasi. `resolveWorkspace` saja menerima nama ternormalisasi, sehingga bukan bukti registrasi.
- `SubProject/agent-core-memory/src/memory/episodes.ts::scope`, `taskKey`, `startEpisode` memakai ownership `{rootId,workspaceKey,taskId}`. `controller-session.ts` mengikat cursor ke root/workspace/task; `controller-protocol.ts` menganggap otorisasi scope tanggung jawab host. Tidak perlu mengubah engine ini.
- `src/agent-controller.ts`, `toolRuntime` sekitar baris 535, sudah memasok `nativeTaskId: task.id` dan `nativeWorkspace: task.workspace`; `src/agent-tool-session.ts::principal` dan `open` mempertahankan grant Native.

## Requirements

R1. External memulai `controller_learning(action=episode, episodeOperation=start, taskKey, workspace)`. Host memverifikasi workspace dan mempersistenkan binding pada episode yang dihasilkan. Tuple reuse adalah pemilik kredensial + identitas workspace + taskKey; reconnect dengan tuple sama mengembalikan taskId sama.

R2. Tambahkan selector envelope `scope: { taskId: string }` pada `memory_v2_read/write`. Ini referensi, bukan pemberian otorisasi. External wajib menyertakannya; native boleh menghilangkannya karena task datang dari runtime. Selector native berbeda harus ditolak. Payload engine tetap strict dan tidak menerima `taskId`, `workspaceKey`, `ownerId`, atau `controllerId` sebagai override.

R3. Host membaca episode berdasarkan selector, memeriksa pemilik dan identitas registrasi terkini, lalu membentuk scope engine. `workspaceKey` engine tetap nama canonical yang dikenali backend; simpan `registeredWorkspaceIdentity().key` secara terpisah untuk pemeriksaan drift, bukan sebagai workspace pencarian. Tidak ada fallback workspace `agent-core` ketika workspace task tidak diketahui.

R4. Kredensial tidak ada, task tidak diketahui, episode tanpa binding, registrasi ambigu/hilang/berubah, atau state degraded menghasilkan error terstruktur sebelum read/write engine. Jangan mengungkap keberadaan task milik pihak lain. Rotasi kredensial memerlukan pemetaan pemilik host yang eksplisit di pekerjaan lain; tidak disamakan dari nama atau header.

R5. State historis dipertahankan. Tidak mengklaim ulang episode unbound. Klien v2 lama tanpa selector menerima `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE` dan petunjuk start episode; tools Memory legacy tetap tersedia. Ini pengetatan kontrak v2 yang disengaja, bukan backward compatibility tanpa perubahan klien.

R6. Shared knowledge antarcontroller tetap mengikuti scope workspace engine saat ini. Rencana ini tidak menciptakan tenant isolation global atau otomatis mengizinkan kredensial lain mengambil task Native/external.

R7. Jaminan interleaving hanya state Memory v2. Learning context/label/verify/procedure/receipt dan observation hooks belum task-selectable. Controller wajib menserialisasi aktivasi `startEpisode` task yang dimaksud beserta seluruh kelompok panggilan/hook dan finalisasi Learning sebelum mengaktifkan task lain pada namespace sesi yang sama. Ini batas operasional, bukan lock baru. Tanpa serialisasi, atribusi Learning dapat salah; jangan melaporkan concurrent end-to-end Learning sebagai PASS.

## Adaptasi referensi resmi

[OpenAI Cookbook: Session Memory](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory) membahas kontinuitas percakapan. [Building Reliable Agents with Memory and Compaction](https://developers.openai.com/cookbook/examples/agents_sdk/building_reliable_agents_memory_compaction) membedakan kontinuitas konteks dan reuse memory. Adaptasi lokal: transport bukan identitas tugas; resume memakai state terverifikasi. Referensi telah dibuka, bukan spesifikasi otorisasi Agent Core; tidak menambah SDK/provider/store.

## Interfaces yang diimplementasikan

Semua perubahan berikut internal host kecuali selector envelope:

- `ExternalControllerEpisode.memoryBinding?: { ownerId: string; workspaceIdentityKey: string }`, dinormalisasi ketat, dipersistenkan/diarsipkan tanpa perubahan otomatis.
- `startEpisode(sessionId, input, hostBinding?: { ownerId: string; workspaceIdentityKey: string }): Promise<ExternalControllerEpisode>` memperluas signature saat ini. HostBinding tidak menjadi field schema tool. Lookup bound hanya cocok owner+identity+taskKey; lookup legacy hanya episode unbound.
- `resolveMemoryTask(ownerId: string, taskId: string): Promise<{taskId:string;workspaceKey:string}>` pada `ExternalControllerLearningService`: read-only, validasi binding dan registrasi ulang; error `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE` untuk semua identitas tidak valid.
- `registerControllerLearningTools(server,service,sessionId,host?:{ownerId:string;workspaceIdentity:(workspace:string)=>{name:string;key:string}}):void`; callback host mengambil registry Memory, bukan payload. Workspace wajib saat start bound.
- Buat `src/mcp/memory-scope.ts`: `ownerScopedLearningSession(ownerId:string, transportSessionId:string):string`, hash tuple berprefix `ext-owner-`; serta type `MemoryScopeResolver = (selector?: {taskId:string}) => Promise<ControllerScope>` menggunakan type engine yang ada.
- `registerMemoryExperienceTools(server,memory,resolveScope:MemoryScopeResolver):void` menggantikan `BoundIdentity`. Resolver dipanggil per invocation, tidak men-cache keputusan lintas request.

## Task 1: Buktikan mismatch dan persist binding host

**Files:** Create `tests/memory-task-binding.test.ts`; modify `src/learning/external-controller.ts`; create `src/mcp/memory-scope.ts`.

**Consumes:** `VerifiedKey.id`, `registeredWorkspaceIdentity`, episode owner lama. **Produces:** ketiga interface host di atas serta normalisasi/arsip binding.

- [x] Tulis tes `separates_owner_and_registered_workspace`: owner A/B memakai taskKey `repair-1` pada workspace sama; `expect(a.id).not.toBe(b.id)`. Owner A reconnect memperoleh `expect(resumed.id).toBe(a.id)`. Workspace kedua memberi ID berbeda.
- [x] Jalankan `npm test -- tests/memory-task-binding.test.ts`; simpan RED. Missing symbol adalah RED scaffolding, bukan konfirmasi hipotesis; rekam juga reproduksi adapter baseline pada Task 2 sebelum menyatakan defect.
- [x] Implementasikan binding lewat owner Learning yang ada. `normalizeEpisode`, load/save/arsip mempertahankannya; reuse tidak mengambil episode unbound. `resolveMemoryTask` memakai registry kini dan menolak perubahan identity key.
- [x] Tambahkan tes nama workspace palsu, basename sama, registrasi ambigu, archived binding, state rusak, dan same-header berbeda owner. Assert penolakan tidak mengubah byte state dan tidak memanggil engine.
- [ ] Ulangi command sampai GREEN, review perubahan task ini, lalu commit terpisah hanya saat eksekusi telah diizinkan.

## Task 2: Sambungkan adapter dan lifecycle eksternal

**Files:** Create `tests/memory-scope-mcp.test.ts`; modify `src/mcp/memory-experience-tools.ts`, `src/mcp/controller-learning-tools.ts`, `src/mcp/server.ts`, `src/mcp/handler.ts`.

**Consumes:** interface Task 1. **Produces:** resolver host dan schema selector; payload dispatcher engine tidak berubah.

- [x] Tambahkan tes baseline: buat dua episode melalui `ExternalControllerLearningService.startEpisode`, lalu gunakan fake Memory controller yang mencatat scope adapter. Assert taskId controller sama dengan episode Learning aktif; rotasi episode pada session sama harus mengubah taskId controller, reconnect taskKey sama mempertahankannya. Rekam kegagalan perilaku sebelum patch adapter.
- [x] Jalankan `npm test -- tests/memory-scope-mcp.test.ts` dan simpan RED asli. Jangan mengganti assert untuk membuat baseline lolos.
- [x] Di jalur v2, bentuk namespace Learning owner-scoped dari key terautentikasi, lalu gunakan konsisten untuk bootstrap, controller_learning, dan observation hooks. Pertahankan helper transport hourly saat ini; namespace bukan taskId.
- [x] Pada episode start, validasi workspace dengan registry dan berikan hostBinding internal. Bangun resolver server: external memerlukan selector+owner; native memakai task/workspace runtime tervalidasi. Adapter hanya mengirim hasil resolver ke `memory.controller`.
- [x] Uji semua aksi read/write, selector foreign owner/unknown/unbound, payload override, scope kosong, dan grant denial. Assert `isError === true`, error stabil, `controller` dipanggil nol kali pada penolakan; jalur valid menerima taskId episode, bukan sessionId.
- [ ] Ulangi command sampai GREEN; review gate Task 2 sebelum commit terpisah.

## Task 3: Verifikasi reconnect, interleaving, dan kompatibilitas

**Files:** Create `tests/memory-task-reconnect.test.ts`; modify fixture `tests/memory-v2-host-integration.test.ts`; tidak mengubah production engine.

**Consumes:** facade Task 2. **Produces:** bukti end-to-end offline melalui handler dan Native in-memory MCP.

- [x] Tulis tes RED headerless pada `2026-10-09T00:59:59Z` lalu `01:00:01Z`, header berubah, dan restart fixture. Bind ulang taskKey secara serial; assert taskId/episodeRef sama dan `memory_v2_write(action=checkpoint)` idempotent tidak menambah event kedua.
- [x] Uji interleaving langsung facade Memory v2: task_start, event_append, task_context, checkpoint A/B; state A tidak memuat B, cursor lintas task menghasilkan `MEMORY_SCOPE_MISMATCH`, task asing tidak mengubah ledger. Ini tidak menguji jaminan atribusi Learning.
- [x] Lewat handler nyata, jalankan kelompok aktivasi A→panggilan/hook/finalisasi A, lalu B, lalu A. Assert episode yang aktif sesuai kelompok. Tambahkan characterization: setelah start B, `getEpisode(sessionId).id === b.id` meski selector Memory adalah A; dokumentasikan keterbatasan, jangan mengharapkan Learning otomatis mengikuti selector.
- [x] Uji Native host task tetap stabil antar tool session; selector task lain ditolak. Pertahankan tes grant. Ubah fixture v2 session-only menjadi episode-bound, serta tambahkan assert fail-closed untuk klien tanpa selector; legacy read/list/search tetap lulus.
- [x] Jalankan `npm test -- tests/memory-task-reconnect.test.ts tests/memory-v2-host-integration.test.ts tests/agent-tool-session.test.ts tests/agent-os-tool-grant-adoption.test.ts`; perbaiki wiring minimal, rekam RED/GREEN tanpa provider.

## Task 4: Gate mandiri, dokumentasi, rollback, dan laporan

**Files:** Modify `docs/CODEBASE.md` bagian MCP/Memory v2 hanya setelah implementasi; create laporan terisolasi `reports/memory-03-task-workspace-binding/`.

- [ ] Dari root repository, jalankan `npm run build`, lalu `npm test -- tests/memory-task-binding.test.ts tests/memory-scope-mcp.test.ts tests/memory-task-reconnect.test.ts tests/memory-v2-host-integration.test.ts tests/cumulative-workflow.test.ts tests/http-auth.test.ts tests/agent-tool-session.test.ts tests/agent-os-tool-grant-adoption.test.ts`.
- [x] Jalankan `npm --prefix SubProject/agent-core-memory test -- tests/memory-controller-scope.test.ts tests/memory-controller-continuation.test.ts tests/memory-episodes.test.ts tests/memory-episode-concurrency.test.ts`. Root Vitest mengecualikan `SubProject`; command terpisah wajib. Scripts/config telah diinspeksi, hasil eksekusinya masih **NOT RUN**.
- [ ] Catat exit code, versi tool, fixture seed/waktu, revision/diff. Update CODEBASE: kontrak selector, batas pemilik, dan kewajiban serialisasi Learning. Hasil harus memisahkan Memory-v2 interleaving dari Learning serial; concurrent Learning tetap unsupported.
- [ ] Buat ZIP berisi `report.md`, `results.json`, `logs/`, `fixtures/`, `evidence/`, `patch/implementation.diff`, dan `SHA256SUMS` untuk setiap file selain manifest sendiri. Hanya fixture sintetis dan log tersanitasi. Ekstrak ke direktori baru, tolak path traversal, verifikasi seluruh hash dan inventaris, catat hasil pemeriksaan serta SHA256 ZIP terpisah.
- [ ] Reviewer independen memeriksa diff, replay gate, dan ekstraksi. **PASS** hanya jika semua gate wajib dan verifikasi bundle lulus. Yang belum dieksekusi **NOT RUN**; environment/dependency menghalangi **BLOCKED**; kegagalan assert **FAIL**. Skenario live/provider dilaporkan terpisah, bukan syarat atau pengganti gate offline.

## Dependencies, bahaya, dan rollback

Mandiri dari rencana retrieval subset, policy, context index, dan eval. File shared `server.ts`, `memory-experience-tools.ts`, fixture host, dan CODEBASE harus dikerjakan berurutan; review interface setelah rebase.

Risiko: kontrak selector berubah, ownership historis tidak tersedia, registry drift, head Learning lama tertinggal. Jangan menebak migrasi. Rollback memakai commit terpisah dan backup terverifikasi; jangan menghapus episode, memindahkan canonical Memory, atau memulihkan session-as-task. Jika rollback menghilangkan metadata binding, hentikan write v2 sampai kompatibel. Deployment/resident memerlukan izin tersendiri.

## Implementasi dan batas acceptance — 2026-10-10

Binding, normalisasi/persistensi/arsip, resolver read-only, namespace pemilik, schema selector dan integrasi handler telah diimplementasikan. TaskKey dinormalisasi sekali sebelum lookup agar normalisasi penyimpanan tidak mengubah identitas saat reconnect. Root/engine gates di atas offline dengan fixture sintetis; tidak ada pembacaan Memory produksi, secret, atau provider. Test HTTP menjalankan aktivasi dan hook/finalisasi Learning secara serial A→B→A dan secara eksplisit membuktikan selector Memory A tidak mengubah head Learning B. ZIP Plan03 diverifikasi dengan fresh extraction dan manifest SHA-256; review independen atas perbaikan binding dan replay 75 tes root PASS; acceptance akhir menunggu integrator. Perubahan kontrak v2 adalah breaking pre-1.0 client tightening, changeset minor dalam train 0.15; perubahan version surface ditangani integrator.

Review independen menemukan dua blocker dan keduanya diperbaiki dengan RED/GREEN: tujuh jalur observasi Learning sebelumnya mengubah canonical workspace binding, serta `bounded()` meruntuhkan spasi internal nama registry. Semua observasi sekarang hanya melabel ulang episode legacy unbound. Canonical workspace bound dipertahankan persis dan divalidasi, bukan diproses sebagai teks deskriptif, pada create/normalize/load/save/archive. Reconnect melalui alias, observasi workspace lain, restart, arsip, dan nama registry `my  repo` diuji; gate final Plan03 75 tes root PASS dan reviewer independen mereplay 75/75 PASS.
