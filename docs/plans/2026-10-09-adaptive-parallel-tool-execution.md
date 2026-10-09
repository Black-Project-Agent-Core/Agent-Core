# Adaptive Parallel Tool Execution — Rencana Implementasi

**Goal:** Mempercepat pekerjaan coding yang benar-benar independen melalui controller eksternal ChatGPT/Claude dan MCP Agent Core, dengan jumlah pekerjaan paralel yang menyesuaikan mesin eksekusi, beban terkini, dependensi, dan konflik resource.

**Architecture:** Controller memilih strategi; Agent Core menyediakan inventaris mesin dan membatasi eksekusi melalui satu admission service bersama. Gunakan concurrency yang sudah ada, perluas koordinasi path yang ada, dan ikat resource pada umur pekerjaan sebenarnya. Tidak menambah model, runtime AI, scheduler persisten, atau lapisan otorisasi baru.

**Tech Stack:** TypeScript ESM/Node, MCP SDK yang sudah terpasang, Zod, Vitest, modul bawaan Node; PizZip/yauzl existing untuk paket acceptance. Tidak membutuhkan API key/provider/model tambahan.

**Spec:** Keputusan pengguna dan spesifikasi mandiri dalam dokumen ini. Referensi resmi dibuka pada 2026-10-09.

**Status: PROPOSED — NOT IMPLEMENTED.** Penyusunan hanya membaca source/referensi dan menulis rencana ini. Tidak menjalankan build, suite, benchmark, provider, migrasi, restart, release, atau deployment. Angka kebijakan di bawah adalah usulan yang harus diuji, bukan hasil performa.

## 1. Keputusan pengguna dan batas pekerjaan

Butir 1–4 dan 8 merangkum arah permintaan pengguna. Butir 5–7 merangkum hasil brainstorming yang diminta pengguna dimasukkan ke rencana. Mekanik konkret seperti format opaque ID, path profil, API bootstrap, dan TTL adalah usulan desain dalam dokumen ini, bukan kutipan keputusan pengguna yang terpisah:

1. ChatGPT atau Claude yang mengendalikan Agent Core melalui MCP tetap menjadi pengambil keputusan. AI/model tambahan tidak wajib.
2. Prioritasnya waktu penyelesaian coding; penggunaan CPU/RAM lebih tinggi boleh selama aman dan berguna. Paralel bukan tujuan tersendiri.
3. Controller terlebih dahulu mencoba membaca Memory relevan, memastikan mesin tempat tool berjalan, membaca spesifikasi serta tekanan resource baru, lalu menilai kompleksitas, dependensi, konflik, dan overhead.
4. Tugas sederhana/standar boleh tetap serial. **3–6 adalah target normal ketika tugas memang cocok, bukan minimum.** Mesin lemah/sibuk boleh memilih 1, 2, atau 3. Tugas sangat kompleks boleh lebih dari 6 jika kapasitas, independensi, dan batas host mendukung.
5. Profil mesin disimpan sekali dan dirujuk dengan ID opaque yang stabil. Setiap Memory memakai konteks global/proyek/mesin hanya bila relevan; jangan menyalin pemilik, lokasi, atau spesifikasi pada semua catatan.
6. Profil tersimpan bukan bukti beban saat ini. Refresh resource sebelum memutuskan dan saat pekerjaan berlangsung. Pemilik hanya diperlukan untuk batas akses yang memang membutuhkannya. Memory bukan otorisasi.
7. Bootstrap inventory read-only harus tetap tersedia ketika Memory kosong, gagal, atau tidak bisa dibaca. Controller mengungkapkan degraded mode dan tetap melakukan pekerjaan yang aman. Tidak boleh ada lingkaran “harus Memory untuk mengenali mesin, tetapi harus mengenali mesin untuk membaca Memory”.
8. Hasil implementasi kelak harus disertai laporan lengkap dan ZIP bukti yang dapat diperiksa. Pekerjaan sekarang hanya rencana yang akan disimpan/push untuk implementasi kemudian.

Yang **diusulkan implementer**, belum menjadi angka pilihan pengguna: default hard ceiling 12 work units, target biasa maksimal 6, reserve RAM, freshness TTL, batas antrean, estimator biaya, dan format metadata teknis. Nilainya harus terlihat dalam konfigurasi serta laporan benchmark; mengubahnya tidak boleh memperluas izin tool.

### Global constraints

- Pertahankan autentikasi HTTP, credential tool grants, validasi argument/path, mutation journal, evidence policy, result budget, dan batas keselamatan yang ada.
- Admission mengatur resource, bukan persetujuan, ranking tugas semantik, atau eksekusi DAG wajib. Tidak ada gate baru yang mengharuskan semua tugas punya rencana/model kedua.
- Tidak mengasumsikan UI ponsel berarti tool berjalan di ponsel, atau UI desktop berarti tool berjalan pada desktop itu. Resource hanya diukur pada host eksekusi tool; target remote/phone harus dinyatakan terpisah.
- Jaminan admission dibatasi satu proses Agent Core dan pekerjaan yang melewati owner terinstrumentasi. Proses Agent Core lain, aplikasi lain, shell daemon yang melepaskan diri, serta target remote yang tidak menyediakan metrik tidak berada dalam jaminan ini.
- Estimasi RAM bukan hard memory limit. Tidak memasang cgroup/Job Object, mengganti security settings, membunuh proses asing, atau mengubah OS dalam scope ini.
- Tidak menyalin `.env`, credential, Memory pribadi, hostname mentah, username, lokasi fisik, absolute path pribadi, command sensitif, atau stdout pengguna ke profil publik/laporan.
- Implementasi/rilis nanti harus dimulai dari baseline terverifikasi. Checkout inspeksi memiliki HEAD `8a80251fd43234cc9ff82aa8746b65b1ef3bd6b3` dan 174 path staged yang tidak terkait; jangan commit/reset/stash seluruhnya. Rencana Memory telah dipublikasikan pada `docs/memory-improvement-plans-20261009`, commit `45efa7225b86e0829323aaf4bcff8468a166c0c3`, berdasarkan feature `c5e3fe970b770aaa5ba3023ea19239f71f53709c`. Cocokkan source saat implementasi, jangan menganggap working tree sekarang identik dengan HEAD atau branch itu.

## 2. Bukti source dan adaptasi referensi

### Yang benar-benar ada

| Owner/path existing | Temuan dan konsekuensi desain |
|---|---|
| `src/mcp/handler.ts::createMcpHttpHandler`, `legacyJsonFallback`, `protocolHandler` | Factory membuat server MCP untuk request; transport/server ditutup pada akhir request. Limiter yang dibuat di factory/server akan salah karena setiap request mendapat anggaran baru. Transport close juga bukan bukti pekerjaan anak sudah berhenti. |
| `src/mcp/handler.ts` bootstrap dan `src/mcp/capability-observation.ts` | Handler meng-await bootstrapInstructions sebelum membuat server; bootstrap menyentuh sesi dan menunggu Memory/Learning. Optional capability hooks juga dapat menunggu Learning sesudah tool selesai. Inventory harus mempunyai jalur diagnostik sempit yang tidak memanggil kedua hook ini; catch error saja tidak menangani promise yang menggantung. |
| `src/mcp/server.ts::createAgentCoreMcpServer` | Registrasi pusat membungkus grant, mutation safety, observasi, evidence, dan result budget. Tempat pemasangan wrapper admission, dengan service milik host yang diinjeksi. Semua tool registrars harus tercakup, bukan hanya helper RDC `tool(...)`. |
| `src/index.ts`, `controllerMcpRuntime`, `src/agent-tool-session.ts::open/call` | Native in-memory MCP dan external HTTP dapat memakai owner yang sama. Injeksi satu service di sini. `AgentRuntimeToolSession.call` sudah menjaga selected-tool/action grants dan invocation ID. |
| `src/agent-controller.ts`, loop `for (const call of reply.toolCalls)` | Loop Native saat ini serial serta memiliki checkpoint/strategy/finalization state. Jangan menggantinya dengan `Promise.all` dalam perubahan ini. Native cukup berbagi batas host; paralelisasi loop Native merupakan pekerjaan terpisah. |
| `src/rdc/tools/filesystem.ts::readMultipleFiles` | Sudah menggunakan `Promise.all(paths.map(...))`. Jangan membuat batch API baru untuk masalah yang sudah punya fan-out; batasi fan-out internal ini dengan anggaran bersama. |
| `src/rdc/mutation-coordinator.ts::PathMutationCoordinator.run` | Sudah canonicalize realpath, mengurutkan beberapa path, serta melepas lock dalam finally. `src/rdc/tools/edit.ts` memakai singleton ini. Perluas/reuse owner ini; jangan membuat lock path kedua yang tidak saling mengetahui. |
| `src/mcp/mutation-safety.ts::McpMutationSafety` | Memiliki journal invocation, counter active, dan draining. Counter bukan concurrency ceiling atau lock konflik antarresource. Pertahankan invocation deduplication/uncertain-outcome semantics existing; invocation ID optional dan retention bounded, sehingga bukan jaminan exactly-once. |
| `src/rdc/terminal-manager.ts::executeCommand`, `src/rdc/process-ledger.ts::ProcessLedger` | Proses bisa hidup setelah timeout/early response. Ada identitas proses dan ledger; output buffer dibatasi per sesi, belum merupakan anggaran RAM host. `read_process_output` dapat memajukan cursor sesi, sehingga anotasi read-only bukan bukti bebas konflik. |
| `src/rdc/search-manager.ts::SearchManager.startSearch` | Membuat proses ripgrep dan mengembalikan session; pekerjaan Office tambahan dapat berjalan di belakang. Permit tidak boleh dilepas hanya karena respons awal atau ripgrep selesai jika pekerjaan tambahan belum selesai. |
| `src/rdc/browser-control/service.ts`, `src/phone/controller.ts` | Ada state sesi/observasi dan target perangkat. Aksi pada sesi/tab/perangkat sama harus diserialkan; jangan menganggap beberapa klik independen. |
| `src/rdc/utils/system-info.ts::getSystemInfo`, `src/rdc/tools/config.ts::getConfig` | Informasi OS/container/process tersedia; get_config menampilkan RSS/heap proses Agent Core. Ini bukan snapshot tekanan CPU/RAM host/container lengkap. Jangan memakai currentClient sebagai identitas mesin. |
| `src/portability/runtime-relocation.ts::currentMachineId` | Identitas existing adalah platform/arch/hostname. Gunakan hanya sebagai sinyal drift lokal, jangan mempublikasikannya sebagai opaque ID atau bukti kepemilikan. |
| `src/memory/host-runtime.ts::initializeAgentCoreMemory`, `src/index.ts::startAgentCoreService` | Marker tervalidasi memilih legacy atau v2. Saat ini startup meng-await inisialisasi tanpa catch, sehingga failure bisa menghentikan host sebelum inventory tersedia; fallback startup perlu diuji, bukan hanya optional injection. Checkout inspeksi tidak memuat runtime Memory; tidak ada klaim bahwa profil/memori live sudah dibaca atau v2 aktif. `MEMORY.md` dibaca sebagai histori, bukan metrik terkini. |

### Referensi resmi

[Claude Cookbook: parallel tools](https://platform.claude.com/cookbook/tool-use-parallel-tools) memberi pola batch meta-tool untuk mengurangi bolak-balik controller. Tetapi implementasi contohnya memanggil setiap invocation melalui loop sinkron. Kesimpulan inspeksi: **batching tidak sama dengan eksekusi bersamaan**. Adopsi idenya hanya bila host/controller ternyata membatasi beberapa tool call dan bukti menunjukkan batching dibutuhkan; jangan menyalin contoh sebagai scheduler produksi.

[Claude Docs: parallel tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use) memisahkan beberapa tool-use blocks dari kebijakan eksekusi aplikasi. Controller/host boleh menjalankan operasi independen bersama atau serial sesuai side effect/dependensi; hasil tetap harus dikorelasikan ke ID panggilan. Adaptasi Agent Core: buktikan overlap runtime, bukan menghitung tool blocks. Pengelompokan pesan Claude adalah tanggung jawab host Claude, bukan sesuatu yang MCP Agent Core bisa paksa. Computer/browser actions dengan urutan state harus tetap berurutan.

Tidak menambah Anthropic SDK, model tertentu, atau opsi provider pada Agent Core demi fitur ini. Untuk ChatGPT/Claude app, kemampuan mengirim parallel calls diukur pada koneksi aktual; Agent Core tidak menjanjikan dapat mengubah batas aplikasi mereka.

## 3. Urutan controller tanpa ketergantungan melingkar

1. Pada tugas baru, coba Memory relevan melalui owner canonical existing. Baca sedikit konteks yang berguna, bukan seluruh store. Selama identitas mesin belum diketahui, mulai dengan global/proyek yang tersedia; jangan menunggu record mesin.
2. Baca inventory/bootstrap serta snapshot segar dari host tool. Jika Memory tidak tersedia, catat `memoryStatus=unavailable|degraded`, lakukan bootstrap ini tetap read-only, dan jelaskan bahwa keputusan memakai pemeriksaan live dengan kontinuitas terbatas.
3. Ikat hasil pada `machineId` dan `runtimeInstanceId` milik server; pastikan workspace terdaftar dengan owner existing. Baru ambil Memory machine-specific bila relevan. Sesi/UI/client name tidak memilih mesin, pemilik, atau project root.
4. Nilai tugas: apa yang bisa berjalan bersama, apa yang menunggu hasil lain, resource mana yang sama, dan apakah overhead lebih besar daripada manfaat. Catat ringkas rencana aksi dan concurrency yang dipilih, tanpa menyimpan chain-of-thought.
5. Kirim beberapa panggilan independen jika host mendukungnya. Jika hanya satu call dapat berjalan, gunakan satu call/bulk tool existing; jangan menjanjikan paralel yang tidak teramati.
6. Pada setiap wave, baca status terbaru bila snapshot melewati TTL atau ada perubahan beban/kegagalan. Host juga refresh pada admission; controller tidak dapat menaikkan ceiling dengan snapshot lama.
7. Gabungkan hasil berdasarkan call ID, validasi output sebelum aksi dependen, dan lakukan Learning finalization existing. Perubahan strategi setelah kegagalan tidak berarti mengulangi mutasi dengan status tidak pasti.

Satu task boleh mempunyai beberapa read/tool independen. **Beberapa task berbeda yang memakai session head Learning sama belum aman untuk diinterleave.** Rencana `2026-10-09-memory-03-task-workspace-binding.md` pun membatasi atribusi Learning lintas-task. Serialkan kelompok aktivasi/aksi/hook/finalisasi pada namespace Learning yang sama; jangan menandai concurrent end-to-end Learning sebagai PASS. Empat rencana Memory lain tetap independen: retrieval/ranking/contextual index/evaluation tidak menjadi prasyarat admission. Integrasi file bersama harus direview berurutan.

## 4. Profil, Memory, dan snapshot resource

### Profil sekali, snapshot berulang

Usulkan `src/execution/resources.ts` sebagai owner kecil untuk dua data yang berbeda:

- `ExecutionHostProfile`: `{schemaVersion:1, machineId:string, profileRevision:number, capturedAt:string, platform:string, arch:string, logicalCpuCount:number, totalMemoryBytes:number, containment:'host'|'container'|'unknown'}`. ID berupa UUID acak yang tidak mengandung pemilik/lokasi/hardware serial. Path runtime: `<PROJECT_ROOT>/runtime/portability/execution-host.json`; bukan file tracked Git.
- Profil dibuat/diperbarui pada inisialisasi host yang diizinkan, bukan sebagai side effect tool inventory. Simpan anchor pembanding lokal dalam file runtime privat; manfaatkan sinyal relocation existing tanpa mengubah ID portability existing. Jangan masukkan anchor ke respons/log/Memory.
- Restart atau perpindahan folder pada host yang sama mempertahankan ID. Host berubah menghasilkan ID baru serta hubungan histori lokal; hardware berubah pada host sama menaikkan revision. Clone/identitas tidak bisa diverifikasi menghasilkan `identityStatus='unverified'`, bukan auto-merge profil. ID mengidentifikasi host terdaftar lokal, bukan bukti identitas global atau otorisasi. Container melaporkan batas container dan tidak mengklaim tahu host fisik.
- Jika profil belum ada, inventory memberikan `machineId:null`, `identityStatus:'unregistered'`, dan `runtimeInstanceId` ephemeral. Ia tetap bisa mengukur resource tanpa menulis profil/Memory. Profil yang tidak bisa dibaca tidak di-reset menjadi record tepercaya baru.
- `ResourceSnapshot`: `{runtimeInstanceId, machineId, sampledAt, ageMs, effectiveCpuCount, effectiveMemoryLimitBytes, availableMemoryBytes, cpuBusyRatio, processRssBytes, activeWorkUnits, activeJobs, source, completeness, issues}`. Angka tidak tersedia bernilai null, bukan nol atau sehat. Tidak menyertakan daftar command/proses pengguna.
- Linux memperhitungkan CPU affinity/quota/cpuset dan memory.max/current jika tersedia, bukan hanya jumlah CPU/RAM host. Windows/macOS menggunakan API Node plus probe read-only terbatasi bila diperlukan; unsupported metric tetap unknown. Snapshot CPU adalah delta sampling, bukan angka load-average lintas-OS yang diasumsikan setara. Pengambilan snapshot single-flight dengan timeout agar tidak membuat subprocess probe sebanyak jumlah tool call.

### Scope Memory tanpa duplikasi

Tidak migrasi semua record atau menambah owner/location/spec wajib. Gunakan record/profile reference melalui field existing: `provenance.workspace` untuk konteks proyek yang terverifikasi; tag konvensi `scope:global`, `scope:project`, atau `scope:machine`; tag `machine:<opaque-id>` hanya pada pelajaran yang bergantung mesin. Catatan dapat berkaitan proyek dan mesin sekaligus; scope adalah applicability, bukan akses.

Satu record ringkas profil, jika memang perlu disimpan pada canonical Memory melalui owner existing, cukup merujuk ID/revision serta evidence profil. Spesifikasi lengkap tetap satu tempat. Pelajaran generik tidak diberi machine tag. Jangan menambahkan implicit retrieval filter/ACL berdasarkan tag; controller menilai relevansi menggunakan identitas live. Profil tersimpan tidak memuat beban live dan tidak boleh dijadikan freshness evidence. `ownerId` hanya muncul pada host binding yang memerlukan akses, sebagaimana rencana Memory 03; tidak disalin ke setiap Memory atau dipercaya dari payload.

## 5. Kontrak admission dan batas concurrency

### Interfaces yang diusulkan, belum tersedia

| File | Interface/tanggung jawab |
|---|---|
| `src/execution/resources.ts` (baru) | `readExecutionProfile(projectRoot:string):Promise<ExecutionHostProfileResult>` read-only; `initializeExecutionProfile(projectRoot:string, observation:HostObservation):Promise<ExecutionHostProfileResult>` startup-only; `sampleResources(options:{fresh:boolean;signal?:AbortSignal}):Promise<ResourceSnapshot>`. `HostObservation` berisi platform/arch/spec dan anchor privat hasil probe host, tidak datang dari MCP caller. |
| `src/execution/admission.ts` (baru) | `ExecutionAdmissionService.acquire(request:ExecutionRequest):Promise<ExecutionLease>`; `status(options:{fresh:boolean}):Promise<ExecutionStatus>`; `beginDraining():void`; `waitForIdle(timeoutMs:number):Promise<boolean>`. Request: ID internal, principal namespace, task namespace opsional tervalidasi, tool, trusted resource claims/cost, requested concurrency hint, signal, queue deadline. |
| `src/execution/admission.ts` | Lease mempunyai `id`, `release():void` idempotent, `mapChildren<T,R>(items:readonly T[], run:(item:T,index:number)=>Promise<R>):Promise<R[]>`, dan `attachJob(job:OwnedJobHandle):void`. Handle: `{id, kind, settled:Promise<void>, requestCancel?:()=>Promise<void>}` dari owner job, bukan Promise respons awal. Transfer ke job menahan lease hingga seluruh pekerjaan terukur selesai. |
| `src/execution/tool-policy.ts` (baru) | `describeExecution(tool:string,args:unknown,host:ExecutionHostContext):Promise<ExecutionDescriptor>` menghasilkan scope/path canonical, jenis efek, estimates, kategori ordinary/control/coordinator dan alasan konservatif. Caller tidak dapat mendeklarasikan shell berbahaya sebagai read-only. Unknown selalu konservatif. |
| `src/rdc/mutation-coordinator.ts` (existing) | Tambah `tryAcquireAccess(claims:PathAccessClaim[],owner:object):(()=>void)|null`; `PathAccessClaim={path:string,mode:'read'|'write',recursive:boolean}`. Semua claims canonical dan diperoleh atomik atau nol. Pertahankan `run(paths,action)` sebagai API kompatibel write-lock; owner token internal memungkinkan inner operation meminjam lock yang sudah mencakup path, bukan lock berulang. |
| `src/mcp/execution-control.ts` (baru) | `installExecutionAdmission(server,service,hostContext):void`; `registerExecutionStatusTool(server,service):void`; sanitasi metadata `io.agentcore/execution` menjadi hint `{requestedConcurrency?:number, complexity?:'simple'|'normal'|'very-complex'}`. Metadata yang hilang/unsupported tidak memblokir tool lama. |

Type public lintasfile diekspor dari owner di atas; jangan membuat service registry/event bus baru. `ExecutionStatus` menggabungkan snapshot, profile status, effective limit, queue size, draining/degraded reasons, enforcementScope, supported transports/features, dan observed overlap. Ia tidak memuat klaim seluruh mesin terlindungi atau host UI sudah mendukung paralel.

### Lifetime dan komposisi

- Buat **satu** service pada `src/index.ts` sebelum membentuk `controllerMcpRuntime`. Tambahkan field optional pada `BridgeMcpHttpOptions` dan `AgentCoreMcpRuntime`; teruskan objek yang sama ke factory HTTP dan Native tool session. Jangan membuat service baru pada `createAgentCoreMcpServer` atau setiap reconnect.
- Urutan efektif callback: grant yang ada → admission → mutation safety existing → handler/evidence existing. Pasang wrapper setelah credential grant dan sebelum mutation-safety registration wrapper; tes urutan runtime, jangan mengandalkan asumsi urutan source saja. Request yang masih antre belum dicatat seolah mutasinya sudah dieksekusi. Grant denial tidak memperoleh permit atau membuka path.
- Antrean dibatasi; request yang menunggu tidak memegang sebagian permit/path lock. Acquire seluruh resource yang diperlukan secara atomik, fair antarprincipal dengan FIFO per resource; job yang blocked tidak menahan resource independen. Jangan membuat circular wait akibat multi-path berurutan.
- Penurunan limit tidak mematikan kerja yang sudah sah: tahan admission baru sampai count turun. Cancel sebelum start menghapus waiter; kegagalan/error/timeout hanya melepas permit setelah handler/child benar-benar selesai atau berhenti terverifikasi. Promise.race timeout sendiri bukan penghentian.
- MCP disconnect/HTTP close tidak melepaskan job yang hidup. Running operation yang tidak mendukung cancel tetap tercatat `cancelling|outcome-unknown`; jangan memulai duplikat. Call ID/invocation ID dan mutation journal existing tetap menjadi sumber dedupe; admission tidak menciptakan exactly-once guarantee baru.
- Stop/poll/status pekerjaan milik caller memakai control lane terpisah yang kecil/bounded supaya tidak deadlock saat semua ordinary slots dipakai job. HardMaxWorkUnits membatasi ordinary work termasuk owned background jobs; controlMaxConcurrent=2 adalah tambahan di luar batas itu. Trace mencatat ordinaryActive, controlActive, dan totalActive=ordinaryActive+controlActive; gate memeriksa kedua batas secara terpisah, bukan mengklaim total≤ordinary cap. Control lane tidak menerima start_process, arbitrary command, batch, mutasi file, atau tindakan lain yang menyamar sebagai polling. Semua akses tetap lewat grant.
- Shutdown melakukan drain dan menunggu dengan batas; ketidakselesaian dicatat jujur. Tidak membunuh proses asing. Setelah restart, reconcile job yang dapat diverifikasi dari process ledger sebelum menerima beban tambahan; job tak pasti mengurangi kapasitas/menyalakan serial-degraded, tidak dianggap selesai karena PID hilang atau dipakai ulang.

### Nested work dan resource konflik

1. `read_multiple_files` memakai `mapChildren`, bukan Promise.all tak terbatas. Satu child meminjam work unit parent; child tambahan hanya memperoleh unit bersama yang langsung tersedia. Parent tidak menunggu unit tambahan sambil menahan semua slot. Hasil dipertahankan dalam urutan input, partial error tetap sesuai kontrak lama. Satu token tidak boleh dipakai dua child bersamaan.
2. Aggregate outstanding work units mencakup fan-out semua requests/sessions serta jobs yang hidup. Nested fan-out tidak mendapat anggaran baru. AsyncLocalStorage boleh membawa lease context internal; jangan menerima token lease dari argument tool.
3. File read/read boleh bersamaan, read/write dan write/write pada path sama berserial. Move memperoleh source+destination; directory operation mengunci subtree yang relevan. Pertahankan realpath, Windows case normalization, alias dan pemeriksaan path owner. Path tak dapat dikanonisasi aman memakai scope lebih lebar atau menolak sebelum efek, bukan mengabaikan konflik.
4. Perluas singleton PathMutationCoordinator untuk klaim baca/tulis/subtree dan gunakan owner yang sama pada wrapper serta inner edit. Inner operation yang membutuhkan resource di luar klaim harus berhenti sebelum mutasi, bukan memperluas lock secara diam-diam setelah memegang resource lain. Tidak ada lock path duplikat.
5. Serialkan cursor pembacaan output/interaksi pada process session sama; browser observe/action yang mengubah state pada context/session sama; dan phone actions pada device sama. Browser/context berbeda baru boleh paralel setelah fixture membuktikan state terisolasi. Shared browser profile/clipboard/input global tetap exclusive.
6. Arbitrary shell atau tool unknown tidak dapat dipastikan efeknya hanya dari teks perintah/label controller. Default exclusive scope terhadap ordinary work pada mesin, dengan status/cancel tetap dapat berjalan. Parallel builds hanya diperbolehkan bagi pola/owner yang terbukti terisolasi dan punya working/output directories terpisah; jangan menambahkan parser shell spekulatif atau `safe:true` dari caller sebagai izin.
7. Long-lived process/search menahan unit hingga settlement semua child/Office work. Dev server dari arbitrary shell tetap memegang machine-exclusive scope sampai berhenti, sekalipun port sudah siap: ordinary coding/browser berikutnya akan terblokir, hanya status/cancel diagnostics yang tetap berjalan. Ini keterbatasan fase awal yang sengaja dinyatakan; dukungan resident server yang benar-benar terisolasi membutuhkan trusted owner teruji pada pekerjaan berikutnya, bukan flag bebas dari controller. Browser process resident tidak menahan ordinary invocation slot selamanya, tetapi RSS/prosesnya masuk snapshot dan aksi tetap terikat session lock. Tidak ada janji mengontrol child yang benar-benar lepas dari ownership.

### Kebijakan awal yang harus dikalibrasi

Usulan konfigurasi di `src/config.ts`: `execution.mode='serial'|'adaptive'`, `hardMaxWorkUnits=12`, `normalTarget=6`, `maxQueued=64`, `queueTimeoutMs=30000`, `snapshotMaxAgeMs=2000`, `controlMaxConcurrent=2`. Awal rollout `serial`; adaptive baru diaktifkan setelah gate lulus. Ini konfigurasi host, tidak dapat dinaikkan oleh MCP caller.

- Pilihan controller dan limit host terpisah. Simple biasanya memilih 1. Normal memilih hingga 3–6 jika independen. Very-complex dapat meminta 7–12; permintaan >6 tidak otomatis disetujui.
- Hitung kapasitas global hanya dari hard ceiling host, CPU budget, memory budget, dan active jobs. Hint caller tidak dapat mengubah kapasitas global. Batas request/task milik caller adalah minimum kapasitas tersisa, hint controller, dan eligible independent work; hint 1 hanya membatasi kelompok pekerjaan caller itu, tidak memperlambat principal lain. Task namespace berasal dari host binding; jika belum tersedia, hint hanya berlaku pada invocation/fan-out itu. Tanpa hint, target normal kelompok maksimal 6; very-complex dapat meminta lebih dalam ceiling host. Tanpa metrik cukup, global fallback limit 1. Antrean/active jobs tetap bisa menyebabkan **0 slot baru tersedia**, meski effective limit minimal 1.
- Fixture awal: reserve memory `max(512 MiB, 10% effective limit)`; estimates I/O ringan 64 MiB, compute 512 MiB, unknown 1 GiB; tambahkan memory pressure dan RSS existing, hindari double-count process/container RSS. Estimasi default bukan batas maksimum konsumsi tool.
- CPU budget awal compute ≤ effective CPUs; I/O ≤ 2× effective CPUs bila memory cukup. CPU busy ≥0.90 atau available memory di bawah reserve menahan heavy admission baru. Metrik unknown/stale tidak membuka >6. Beri hysteresis dua sampel sehat sebelum menaikkan limit; turunkan admission segera pada pressure.
- Nilai 1/2/3/6/>6 diuji dengan fixture deterministik. Jangan menyatakan “12 thread pasti aman” berdasarkan core/RAM saja. Jika tool blocking sinkron menahan event loop, concurrency async tidak membuatnya lebih cepat; ukur event-loop delay dan gunakan jalur serial sampai ada alasan terukur untuk pekerjaan worker-thread terpisah.

## 6. Discovery dan controller compatibility

Expose tool read-only `execution_status({fresh?:boolean})`, default fresh true, tanpa butuh Memory atau Learning episode. Daftarkan melalui pola MCP existing; tambahkan descriptor ke family `observe.local` di `src/agent-capability-catalog.ts` serta inventory `src/capability-awareness.ts` bila registry menuntutnya. Tool grant existing tidak boleh diam-diam diperluas.

Untuk credential lama yang hanya mengizinkan get_config, tambahkan argument opsional `executionOnly:true` pada schema/metadata tool existing: callback langsung mengembalikan `structuredContent.execution` dari service yang sama tanpa menjalankan getConfig penuh atau logging config existing. Pemanggilan lama tanpa argument ini mempertahankan perilakunya. Bootstrap server instructions juga boleh menambahkan ringkasan bounded mode/identity/freshness dan petunjuk refresh. Perilaku read-only ini tidak menulis profil/Memory dan tidak memerlukan schema record Memory baru. Jika neither tool dapat diakses, laporkan capability unavailable dan gunakan serial existing; jangan menyuruh model mengira-ngira RAM.

Jalur HTTP diagnostik tetap memakai `/mcp` yang sama, autentikasi yang sama, dan grants yang sama. Tambahkan `classifyExecutionDiagnostics(envelope:unknown):boolean` pada `src/mcp/execution-control.ts`: true hanya untuk envelope tunggal `initialize`, `notifications/initialized`, `tools/list`, `tools/call(execution_status)`, atau `tools/call(get_config)` dengan executionOnly=true. Tool execution_status tidak memerlukan flag itu; get_config biasa bukan diagnostic. Gunakan parsed envelope tunggal yang sama dengan SDK melalui options.parsedBody, atau parse bounded clone request satu kali (batas awal 256 KiB); jangan mempercayai header/client label. Malformed/mixed batch/unknown method tidak memperoleh bypass. Pada diagnostic request, factory memakai petunjuk AGENTS + cached readiness/snapshot dan tidak mengirim external Learning object ke bootstrap, evidence/outcome, atau capability-observation hooks yang dapat menulis/menunggu. Handler callback tetap memvalidasi nama/action diagnostic sebelum dispatch. Autentikasi berlaku pada initialize/list/call; credential tool grants tetap menyaring discovery dan menolak raw call. Diagnostic mode tidak boleh mengungkap tool/catalog yang tidak diberikan kepada principal. Ini tidak melewati grant atau memberi jalur mutasi baru; normal requests mempertahankan hooks existing.

Untuk Memory yang menggantung saat startup, authenticated diagnostic surface harus di-bind sebelum inisialisasi Memory dimulai, dengan readiness kecil `initializing|ready|unavailable`. Owner startup memegang satu init promise dan statusnya; tidak melakukan Promise.race lalu meninggalkan pekerjaan yang dapat menulis. Selama initializing/unavailable, hanya inventory diagnostic tersedia; normal tools diaktifkan setelah inisialisasi sah selesai. Close melaporkan pending initialization dan tidak mengklaim clean stop jika owner belum selesai. Tidak membuat writer pengganti/repair otomatis. Tool inventory sendiri tidak memulai/meretry Memory init. Dengan begitu kegagalan/hang Memory tidak menutup diagnosis, dan tidak ada late write yang disembunyikan sebagai timeout selesai.

Capabilities membedakan `serverConcurrentAdmission`, `clientParallelObserved`, `clientLimitKnown`, `cancellationSupported`, `backgroundJobsTracked`, dan `memoryStatus`. `clientParallelObserved` hanya dari overlap terukur pada connection/task terkait, tidak dari nama ChatGPT/Claude. Unknown tetap unknown. Metadata hint tidak tersedia pada semua UI; tanpa metadata, constraints host tetap bekerja dan controller masih dapat memilih berapa call dikirim.

**Tidak membuat batch tool pada tahap wajib.** Characterization harus lebih dahulu menunjukkan bottleneck di host/controller. Jika nanti diperlukan, itu tahap opsional dengan review desain tersendiri: registered-tool allowlist, child per-call grants/validation, result IDs, bounded entries/bytes/time, partial errors, cancel, larangan recursive batch, dan anggaran sama. Batch tidak boleh mendispatch langsung ke handler untuk melewati wrapper. Tidak ada need untuk menjalankan model tambahan.

## 7. Review focus

Lima kondisi berisiko tertinggi dan pemilik tesnya:

1. Server MCP baru per request/reconnect menghasilkan beberapa limiter dan oversubscription lintascontroller → Task 4.
2. Response timeout/abort selesai tetapi process/search/Office child masih hidup, termasuk restart/PID reuse → Task 5.
3. Multi-file nested fan-out mengalikan limit atau deadlock saat limit=1; output cursor/browser state punya efek walaupun diberi read-only hint → Task 3 dan 5.
4. Memory unavailable, profil hasil copy, cgroup quota tidak terbaca, atau load basi disalahartikan sebagai kapasitas aman → Task 2 dan 6.
5. File alias/subtree serta session-head Learning membuat pekerjaan terlihat independen padahal berbagi state → Task 3 dan 6.

## 8. Tahap implementasi yang dapat diuji mandiri

Semua command berikut adalah pekerjaan mendatang, **NOT RUN pada penyusunan rencana**. Jalankan tiap tahap dengan siklus tes RED yang menunjukkan perilaku, perubahan minimum, GREEN, review, lalu commit scoped. Jangan menjalankan commit command dari checkout kotor tanpa isolasi index/worktree yang sudah diverifikasi. Jangan mengganti assertion agar baseline tampak lulus.

### Task 1 — Characterization jalur execution dan baseline

**Files:** create `tests/execution-baseline.test.ts`, `scripts/verify/parallel-execution-eval.mjs`; read existing files di tabel source. Tidak mengubah production dispatch.

**Consumes:** factory MCP, in-memory client, HTTP fixture/auth existing. **Produces:** baseline terukur per-call IDs, queued/start/end events, peak outstanding work, mode transport, dan result/correctness checks.

- [ ] Buat fixture dua operasi read independen dengan barrier deterministik; uji client.callTool overlap melalui dua HTTP requests terautentikasi, dual/legacy mode, dan Native tool session. Pisahkan “caller mengirim dua request” dari “handler overlap”.
- [ ] Characterize readMultipleFiles internal, loop Native serial, process early-return, search Office completion, same-file coordinator, dan shared Learning head. Tes baseline mencatat keadaan current tanpa menuntut fitur baru sudah ada.
- [ ] Jalankan `npm test -- tests/execution-baseline.test.ts tests/agent-tool-session.test.ts tests/ecosystem-residual-adoption.test.ts tests/four-plan-adoption-wave.test.ts`. Catat output/exit/revision; lingkungan yang belum siap adalah BLOCKED, bukan concurrency FAIL.
- [ ] Harness menerima `--mode baseline|serial|adaptive --fixture <name> --seed <integer> --out <dir>`; default isolated synthetic fixture, tidak membaca repository/runtime privat atau memanggil provider. Simpan baseline JSON yang cukup untuk rerun.
- [ ] Gate: titik concurrency terukur teridentifikasi; gap yang hendak diubah terbukti. Jika host asli tidak overlap, jangan menambah batch diam-diam; laporkan batas kompatibilitas.

### Task 2 — Host identity dan live resource inventory fail-soft

**Files:** create `src/execution/resources.ts`, `tests/execution-resources.test.ts`; modify `src/portability/runtime-relocation.ts` hanya untuk exposure sinyal drift terstruktur bila diperlukan; tests `tests/portability-relocation.test.ts`.

**Consumes:** path portability/atomic persistence existing. **Produces:** profile/snapshot interfaces di bagian 4–5 dengan adapter probe injectable serta fake clock.

- [ ] Tulis RED: same-host restart/root move mempertahankan opaque ID; machine drift memisahkan ID; perubahan hardware menaikkan revision; raw hostname/anchor tidak ada di JSON publik. Profile missing/corrupt pada read-only inventory tidak menulis byte apa pun.
- [ ] Tulis RED: CPU quota 2 pada host 32 CPU melaporkan effective≤2; memory container 4 GiB tidak melaporkan seluruh RAM host sebagai tersedia; unlimited/missing cgroup, unsupported OS probe, timeout, negative/out-of-range values menjadi unknown/degraded.
- [ ] Jalankan `npm test -- tests/execution-resources.test.ts tests/portability-relocation.test.ts`, simpan RED, implementasikan profile dan sampler minimum tanpa menambah dependency.
- [ ] Tes Memory service undefined/error, stale profile kuat + load live berat, wrong runtimeInstanceId, single-flight probe, dan TTL refresh. Assert hasil tidak mengambil angka load dari profil atau model payload.
- [ ] Ulangi command sampai GREEN. Gate: inventory tanpa Memory dan tanpa write bekerja, fixture tidak memerlukan privilege/system changes; dokumentasikan platform live yang belum diuji.

### Task 3 — Bounded admission dan konflik yang memakai owner existing

**Files:** create `src/execution/admission.ts`, `src/execution/tool-policy.ts`, `tests/execution-admission.test.ts`, `tests/execution-conflicts.test.ts`; modify `src/rdc/mutation-coordinator.ts`, `src/config.ts`; extend `tests/four-plan-adoption-wave.test.ts`.

**Consumes:** ResourceSnapshot dan canonical path/lock existing. **Produces:** ExecutionRequest/Lease/Status, descriptor registry kecil, config tunables dan mode serial.

- [ ] Tulis RED table-driven limits 1/2/3/6/8/12, normal target bukan minimum, simple chooses 1, heavy pressure tidak menerima heavy work baru, stale/unknown fallback1, hint 999 tetap≤hard ceiling, hint 1 milik principal A tidak menurunkan kapasitas principal B, dan dua controller berbagi limit.
- [ ] Tulis RED queued cancellation, queue timeout, queue overflow, exception, handled error, release dua kali, dynamic shrink, increase hysteresis, dan shutdown drain. Assert ordinaryPeak≤hardMaxWorkUnits, controlPeak≤controlMaxConcurrent, totalPeak dilaporkan terpisah, serta outstanding kembali 0 setelah semua work benar-benar settled.
- [ ] Tulis RED realpath alias/Windows case, same file read-write, independent files overlap, rename A→B versus B→A, directory subtree, missing path parent resolution, dan failed canonicalization. Assert tidak deadlock/partial write; existing coordinator.run tests tetap lulus.
- [ ] Jalankan `npm test -- tests/execution-admission.test.ts tests/execution-conflicts.test.ts tests/four-plan-adoption-wave.test.ts`; simpan RED lalu implementasikan atomic admission dan reusable lock ownership. Unknown claims harus conservative, bukan dilewatkan.
- [ ] Tambahkan nested mapChildren pada cap 1 dan cap 3 dari beberapa parent: tidak deadlock, peak aggregate≤cap, child order/partial result stabil, cancellation menghentikan antrean tetapi tidak memalsukan completion child.
- [ ] Ulangi sampai GREEN. Gate: semua test correctness lulus sebelum metrik speed dipakai; tidak ada model/API call.

### Task 4 — Satu enforcement boundary untuk external dan native

**Files:** create `src/mcp/execution-control.ts`, `tests/execution-mcp.test.ts`, `tests/execution-bootstrap.test.ts`; modify `src/index.ts`, `src/mcp/handler.ts`, `src/mcp/server.ts`, `src/agent-capability-catalog.ts`, `src/mcp/rdc-schemas.ts`, `src/mcp/rdc-tool-metadata.ts`, `src/capability-awareness.ts` bila diperlukan; extend `tests/agent-os-tool-grant-adoption.test.ts`, `tests/mcp-schema-contract.test.ts`.

**Consumes:** shared admission service, descriptors, snapshot. **Produces:** execution_status, get_config additive compatibility, wrapper seluruh registrar, host-injected runtime options.

- [ ] Tulis RED satu service identity sama pada dua simultaneous HTTP requests, reconnect, in-memory Native, dan mixed external+Native. Cap3 berarti total3, bukan3 per server/session.
- [ ] Tulis RED startup nyata dengan Memory init melempar (termasuk marker v2 invalid): hanya endpoint authenticated execution_status/get_config read-only tersedia, health menyebut Memory unavailable dengan alasan tersanitasi, byte canonical/marker tetap identik, tool eksekusi/mutasi/Memory/Learning/Native tidak didaftarkan pada bootstrap diagnostik ini, dan tidak menginisialisasi writer legacy pengganti. Tangkap error hanya di sekitar initializeAgentCoreMemory; jangan catch arbitrary startup/auth/security failure. Implementasikan mode diagnostik-only kecil dalam startAgentCoreService/server dengan normal auth/grant/AGENTS tetap wajib, guard dependent constructors serta health refresh/spread optional. Normal startup tetap memakai pemilihan writer existing. Jika writer gagal saat sudah hidup, operasi yang bergantung pada Memory/Learning tetap ditolak oleh owner; tidak ada bypass dengan profil/admission. Jangan membuat fresh store, legacy fallback, migrasi, atau mengubah validasi marker menjadi lolos.
- [ ] Tulis RED real HTTP: bootstrapInstructions/touchSession, Memory.list, learning.status, recordCapabilityUse, dan takeCapabilityUsageNotice dibuat never-resolving. Diagnostic initialize/tools-list/status/get_config executionOnly tetap selesai dalam batas fixture serta spy hook bernilai 0; setelah deferred hooks dilepas tidak ada late Memory/Learning write. Normal call tetap memakai hooks. Uji malformed/mixed batch, header spoof, tool/action mismatch, dan payload terlalu besar agar tidak bisa menyamar sebagai diagnostics. Assert credential tanpa grant tidak melihat nama tool terlarang pada tools/list dan raw call tetap ditolak, termasuk mode startup degraded.
- [ ] Tulis RED init Memory belum settle: diagnostics dapat dibaca, normal tools tidak tersedia, satu init promise tetap tracked dan tidak diretry, success mengaktifkan normal runtime, failure tetap diagnostics, close saat pending dilaporkan incomplete. Tidak mengklaim timeout menghentikan init yang tidak dapat dibatalkan.
- [ ] Tulis RED forbidden tool/raw direct-call ditolak sebelum acquire/handler; queued valid mutation tidak membuat journal received sebelum dispatch; failed/uncertain mutation tetap memakai perilaku journal existing. Hint tidak memperluas tool/action/path grant.
- [ ] Tulis RED context AbortSignal yang benar menurut SDK terpasang, cancel notification/transport abort, request ID correlation, malformed metadata, old caller tanpa metadata, serta server close saat owned job masih berjalan.
- [ ] Jalankan `npm test -- tests/execution-mcp.test.ts tests/execution-bootstrap.test.ts tests/agent-os-tool-grant-adoption.test.ts tests/mcp-schema-contract.test.ts tests/ecosystem-residual-adoption.test.ts`; implementasikan wiring tepat satu instance dan urutan wrapper yang diuji.
- [ ] execution_status harus berjalan saat Memory undefined dalam mode diagnostik-only; credential yang tak punya grant tetap ditolak, get_config fallback hanya pada grant yang sudah ada. Jangan otomatis menulis credential baru untuk lulus tes.
- [ ] Gate: native loop tetap serial, shared service enforcement terbukti, response schema/image result budget/evidence tidak berubah. Jalankan tambahan `npm test -- tests/image-inspect-mcp.test.ts tests/image-inspect-http.test.ts tests/mcp-result-budget.test.ts` bila baseline branch memang memuat fitur image-inspect.

### Task 5 — Umur job, nested tools, dan stateful targets

**Files:** modify `src/rdc/tools/filesystem.ts`, `src/rdc/terminal-manager.ts`, `src/rdc/process-ledger.ts`, `src/rdc/search-manager.ts`, `src/rdc/browser-control/service.ts` hanya hook lifecycle yang diperlukan; create `tests/execution-job-lifetime.test.ts`, `tests/execution-nested.test.ts`; extend `tests/terminal-manager-process-ledger-race.test.ts`, `tests/process-ledger.test.ts`.

**Consumes:** Lease.mapChildren/attachJob dan descriptor claims. **Produces:** job handles yang settled benar-benar mencakup seluruh pekerjaan, recovery konservatif, controlled concurrency coverage map.

- [ ] Tulis RED start_process timeout/early response tetap menahan permit, short-lived exit sebelum ledger attach, spawn error, double exit/error, cancel gagal, child tree masih hidup, dan PID reuse setelah restart. Gunakan fixture process lokal kecil yang dimiliki harness.
- [ ] Tulis RED start_search respons awal/ripgrep exit terjadi sebelum Office async work selesai; settlement menunggu keduanya. Stop/cancel mengurus semua child yang dimiliki atau melaporkan residual unknown, tidak melepaskan kapasitas palsu.
- [ ] Tulis RED readMultipleFiles internal dan dua bulk calls bersamaan: total inflight tidak melebihi limit, urutan hasil sama baseline, path validation tetap dipanggil, result size/budget tetap bounded.
- [ ] Tulis RED process-output cursor same session, browser observation/action freshness same context, different isolated context, serta phone same-device descriptor. Tambahkan dev server synthetic yang belum diklasifikasikan: ordinary read/browser menunggu sampai job stopped, status/cancel masih dapat bekerja. Control lane bisa poll/stop owner ketika ordinary cap penuh tetapi tidak menerima start/unknown action.
- [ ] Jalankan `npm test -- tests/execution-job-lifetime.test.ts tests/execution-nested.test.ts tests/terminal-manager-process-ledger-race.test.ts tests/process-ledger.test.ts`; implementasikan hooks tepat pada lifecycle owner, lalu GREEN. Jalankan `tests/browser-control.test.ts` hanya pada lingkungan fixture browser yang tersedia; unavailable ditandai BLOCKED dan adaptive browser coverage tidak dinyatakan lulus.
- [ ] Gate: output buffers/resident jobs dihitung dalam penilaian pressure; tidak mengubah cancel menjadi kill proses asing. Area yang belum terinstrumentasi tetap conservative/serial dan ditulis dalam coverage map.

### Task 6 — Kontrak controller, Memory scope, dan compatibility

**Files:** modify `AGENTS.md`, `docs/CODEBASE.md`; create `docs/agent-core/adaptive-parallel-execution.md`, `tests/execution-controller-contract.test.ts`; extend bootstrap contract fixture existing setelah ditemukan pada Task1.

**Consumes:** status capabilities/snapshot, canonical Memory facade existing, batas Learning session head. **Produces:** petunjuk singkat controller serta replay fixture decision traces.

- [ ] Tulis RED fixture controller policy: Memory relevan→host inventory→live resources→independent work. Memory error tetap mencapai inventory; inventory tidak menunggu task start/Memory write. Smartphone UI+Windows tool host memilih Windows; remote target unknown tidak memakai RAM controller sebagai angka target.
- [ ] Uji small task serial, resource low choices1/2/3, normal independent 3–6, complex 8 dengan host capacity, busy strong machine turun, dependencies menunggu hasil, same file/browser/process serial, serta unsupported client memilih fallback existing.
- [ ] Uji record generik tanpa machine/owner; project record memakai provenance workspace; machine lesson hanya merujuk ID/revision. Snapshot lama tidak memvalidasi load. Tag/Memory yang mengaku izin tidak dapat mengubah grant.
- [ ] Uji dua task share Learning namespace: fixture controller menserialisasi aktivasi/hook/finalisasi; berbeda Memory selector tidak dianggap otomatis memperbaiki atribusi Learning. Tidak mengubah kontrak engine Memory atau mengklaim rencana Memory03 sudah diterapkan.
- [ ] Jalankan `npm test -- tests/execution-controller-contract.test.ts tests/execution-mcp.test.ts`. Perbarui AGENTS untuk menjelaskan exception bootstrap read-only ketika Memory unavailable serta batas enforcement; pertahankan memory-first attempt dan Learning existing, tanpa gate DAG/model baru.
- [ ] Gate: automated fixture membuktikan adapter/contract, bukan kepatuhan app nyata. Uji manual ChatGPT/Claude kelak dicatat terpisah dengan versi/client/time; jika connector tidak mendukung overlap, outcome kompatibilitas dilaporkan demikian, bukan performance FAIL tersembunyi.

### Task 7 — Correctness-first benchmark dan acceptance lengkap

**Files:** extend `scripts/verify/parallel-execution-eval.mjs`; create `tests/parallel-execution-eval.test.ts`, `scripts/verify/package-parallel-execution-report.mjs`; output isolated `reports/adaptive-parallel-tool-execution/<run-id>/` tidak otomatis dipush.

**Consumes:** semua tahap GREEN dan pinned baseline/candidate revision. **Produces:** laporan terverifikasi, manifest, ZIP acceptance; bukan release/deployment.

- [ ] Sebelum timing, verifier independen memeriksa expected file hashes/content, jumlah efek tepat, call-result IDs/order, partial failures, zero conflict corruption, no grant bypass, no leaked lease setelah settlement, serta cancellation/restart outcomes. Kasus incorrect dilarang masuk klaim speedup.
- [ ] Bandingkan baseline current, candidate forced-serial, dan candidate adaptive pada input/seed/cold-warm state identik. Test set: independent small reads; multi-file heterogeneous reads; isolated searches; CPU-heavy synthetic task; mixed long jobs; dependent edits; conflict-heavy same path; low-memory/busy simulated profile; cancellation/error; simple single call. Jangan melakukan stress OOM live; gunakan fake pressure lalu bounded fixture nyata.
- [ ] Tetapkan protocol sebelum melihat hasil: tiga warm-up dan sepuluh measured repeats per case, urutan mode dirotasi, input disalin segar. Laporkan seluruh run, median/p95 end-to-end dan tool latency, queue wait, critical-path/wall time, throughput, CPU time, RSS sampling interval/peak, memory pressure, event-loop delay, peak work units, errors/cancel outcomes, controller round-trips bila tersedia. RSS sampling bisa melewatkan spike; jangan menyebutnya exact peak/hard guarantee.
- [ ] Gate release-feature: correctness/security wajib 100% pada fixture mandatory; tidak ada leak/deadlock; ordinary concurrency≤ordinary limit dan control concurrency≤control limit di trace, total dicatat terpisah; low-capacity fallback dan degraded mode lulus. Usulan speed gate yang harus dipin sebelum run: independent-work aggregate median≤0.90×candidate-serial, simple/dependent median regression≤10%, p95 regression≤20%. Jika tidak terpenuhi, fitur tetap serial default dan laporan menjelaskan bottleneck. Angka ini target usulan, bukan janji hasil; perubahan threshold setelah melihat data harus dipisahkan sebagai eksperimen baru.
- [ ] Jalankan `npm run build`; lalu targeted tests Task1–6 dan `npm test -- tests/parallel-execution-eval.test.ts tests/http-auth.test.ts tests/agent-tool-session.test.ts tests/ecosystem-residual-adoption.test.ts tests/four-plan-adoption-wave.test.ts`. Root build juga membangun Memory subproject, tetapi tidak membuktikan full Memory regression; tidak mengubah Memory engine dalam scope ini.
- [ ] Jalankan harness tiga mode dengan `--fixture acceptance --seed 20261009 --out <isolated-output>`. Catat environment/tool versions dan actual commit+working diff digest. Bila memakai snapshot staged, buktikan manifest source input; jangan melabeli hasil sebagai hash HEAD saja.
- [ ] Buat laporan yang berisi: ringkasan keputusan, requirement→test/evidence matrix, arsitektur/current coverage, keputusan vs tunables, change ledger, reproduction commands, hasil correctness sebelum speed, setiap run/case termasuk failure, resource/client limitations, compatibility, cancellation/unknown outcomes, security/privacy review, rollout/rollback, blockers, dan status akhir.
- [ ] Susun ZIP lengkap: `report.md`, `results.json`, `environment.json` tersanitasi, `capabilities.json`, `coverage.json`, `logs/`, `traces/`, `fixtures/` synthetic, `evidence/`, `patch/implementation.diff`, `manifest.json`, `SHA256SUMS`. Manifest mendaftar setiap payload path relatif, byte size, SHA-256, purpose, dan redaction status; manifest/checksum files tidak self-hash. Simpan checksum manifest dalam SHA256SUMS; checksum ZIP sebagai sidecar di luar ZIP.
- [ ] Verifikasi paket: reject symlink/absolute path/`..`/duplicate names; cek allowlist file dan secret sentinel; ekstrak ke direktori baru; bandingkan inventory tepat, ukuran dan SHA-256 seluruh payload dengan manifest; baca kembali laporan serta parse JSON; replay minimal fixture dari hasil ekstraksi. Simpan hasil pemeriksaan dan SHA-256+size ZIP final di sidecar, agar tidak mengubah ZIP sesudah checksum.
- [ ] Reviewer independen mengaudit diff, replay gate, dan paket. Status per requirement: PASS/FAIL/BLOCKED/NOT RUN. Synthetic/offline PASS bukan bukti ChatGPT/Claude live overlap. Akhir keseluruhan tidak PASS bila mandatory check belum berjalan atau ZIP gagal diverifikasi.

### Task 8 — Rollout konservatif dan handoff

**Files:** finalisasi `docs/agent-core/adaptive-parallel-execution.md`, `docs/CODEBASE.md`; configuration hanya pada target yang memang diizinkan ketika implementasi/activation diminta nanti.

- [ ] Default serial menjaga semantik; jalankan characterization/telemetry bounded terlebih dahulu. Aktifkan adaptive pada fixture read-only, lalu scoped source reads/search, lalu hanya kelas yang lolos lifecycle/conflict coverage. Unknown/shell/stateful scope tetap conservative.
- [ ] Jangan mereset Memory, grant, atau journal. Jika fail/regression/pressure tak tertangani, ubah mode menjadi serial: antrean baru memakai limit 1, pekerjaan yang sedang berjalan didrain, job masih hidup tetap tercatat; jangan “rollback” dengan melepaskan semua permit.
- [ ] Rollback kode melalui commit feature terpisah setelah drain aman; profil tambahan kompatibel/read-only boleh tetap ada. Jika proses tidak dapat didrain, laporkan blocker dan tunggu tindakan yang diizinkan, bukan menghapus ledger atau mematikan proses sembarang.
- [ ] Handoff menyertakan revision, laporan/ZIP+checksum, effective config, keterbatasan host/controller, cara reproduksi, dan mode aktif yang benar-benar dibaca kembali. Commit/push dokumentasi atau source tidak sama dengan merge/release/restart/deployment.

## 9. Definition of done

Rencana ini selesai ketika satu dokumen tersimpan dan diterbitkan di branch yang tepat tanpa membawa staged changes lain. **Implementasi kelak** selesai hanya jika semua persyaratan pengguna terpetakan ke bukti, admission shared dan lifecycle nyata lulus, fallback/permissions tetap benar, benchmark tidak mengorbankan correctness, serta ZIP lengkap lolos hash/size/extraction/replay. Kecepatan aktual tetap belum diketahui sampai pengukuran; adaptive tidak boleh menjadi default hanya karena kode berhasil dibangun.
