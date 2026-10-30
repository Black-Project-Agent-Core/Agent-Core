# Registry tool Native: dibangun sekali, konteks per panggilan

Tanggal: 2026-10-31
Status: **S1 sampai S4 SELESAI diimplementasikan (2026-10-31)**, bukti dan rincian di bagian 10. Tahap 0 commit `a29ddf7`; S1 `051e2b0`; S2 `cddf5de` dan `6e8ef6e`; S3 `0f0205e`, `466dfb3`, `6f7081f`, `a4557c9`; S4 audit dan dokumen. Bagian 1 sampai 9 tetap rencana asli (historis); keputusan bagian 6 diambil pada rekomendasinya.

[Dokumentasi](../README.md) · [Codebase](../CODEBASE.md) · [Indeks rencana](README.md)

## 1. Tujuan dan batas

Permintaan pengguna (2026-10-31): Native Agent Core memakai tool, skill, dan sejenisnya secara embedded, tanpa membangun server MCP berulang. MCP hanya untuk pihak ketiga. Kode MCP untuk Native tidak dihapus, hanya dimatikan atau disembunyikan, dan sejauh mungkin tidak terekspos. Pertanyaan kuncinya: dibangun dari nol atau cukup wiring ke sistem yang ada. Jawaban yang sudah terbukti: **wiring**, karena seluruh pendaftaran tool hanya memakai `registerTool(nama, konfigurasi, callback)` dan semua pembungkus (grant, jurnal mutasi, anggaran hasil, evidence) menempel pada metode itu.

Di luar cakupan: mengukur lama pembangunan server (pengguna memutuskan tidak perlu), benchmark kecepatan (aturan tetap pengguna), menghapus jalur MCP lama, mengubah permukaan MCP untuk controller eksternal (`src/mcp/handler.ts`), dan plugin pihak ketiga.

## 2. Keadaan sekarang (diverifikasi pada source)

Selesai pada tahap 0, commit `a29ddf7`:

- `src/mcp/in-process-tool-host.ts` (`InProcessToolHost`): registry biasa dengan `registerTool`, `listTools`, `callTool(nama, argumen, { signal, meta })`. Perilakunya mengikuti SDK MCP (konversi skema, validasi, hasil `isError`, urutan kunci JSON).
- `createAgentCoreMcpServer` menerima `runtime.toolTarget`; `createAgentCoreToolHost(key, runtime)` membungkusnya. Ke-55 titik pendaftaran di kode (menghasilkan 79 tool Native bila semua layanan aktif, menurut hitungan penelusur) dan semua pembungkusnya tidak berubah.
- `AgentRuntimeToolSession` memegang `ToolPort`: `DirectToolPort` (default; Stop, batas 60 detik) atau `McpToolPort` (hanya dengan `AGENT_CORE_NATIVE_TOOL_TRANSPORT=mcp`, klien MCP dimuat malas).
- `contractDigest` dan JSON definisi identik di kedua jalur (ada tesnya), jadi checkpoint yang tersimpan tetap cocok.
- Uji nyata: turn Native memakai `read_file` lewat jalur langsung dan menjawab benar.

Yang masih berulang per turn (penelusuran read-only, `agent-controller.ts` dan `server.ts`):

| Hal | Letak | Frekuensi per turn biasa |
|---|---|---|
| `discoverAvailableTools` membangun satu registry penuh hanya untuk mengambil nama | `agent-controller.ts:883` | 1 |
| `AgentRuntimeToolSession.open` membangun registry bergrant | `agent-controller.ts:932` | 1, plus 1 setiap grant berubah (`:1419`) |
| `contractDigest` melakukan `modelTools` dan `structuredClone` | `agent-tool-session.ts:245` | 1 per digest |
| `isMutating` mendaftar ulang seluruh tool | `agent-controller.ts:1794` | 1 per tool call |
| Turn sapaan | `answerSimpleTurn` | 0 (tidak membangun registry) |

Akar masalah kedua: identitas task tertanam di penutup (closure) saat pendaftaran. Dari 79 pendaftaran Native: 27 murni statis, 27 hanya menangkap data sesi eksternal (efektif statis untuk Native), dan **25 butuh konteks per panggilan**: 17 tool Memory, `memory_v2_read` dan `memory_v2_write`, `learning`, `skills`, `image_inspect`, `browser_control`, `artifact_inspect`, `reconstruction_harness`.

## 3. Temuan yang ikut ditangani

Semuanya dari pembacaan kode, belum dijalankan. Tiap butir harus dibuktikan dengan tes merah sebelum diperbaiki.

1. **`image_inspect` kehilangan tampilan gambarnya.** Native tidak memberi `imageInspector`, jadi tiap registry baru membuat penyimpan `views` baru. `overview` lalu `crop` atau `review` gagal dengan `IMAGE_INSPECT_VIEW_NOT_FOUND` setelah registry dibuka ulang atau di turn berikutnya (`server.ts:344`; jalur HTTP memakai cache per kunci, `handler.ts:149-168`).
2. **`skills` bertanda `readOnlyHint: false`** (`skills-tools.ts:58`), sehingga `isMutating('skills')` bernilai benar untuk setiap `list`, `read`, `search`. Setiap pembacaan skill mendapat checkpoint `tool-dispatching` dan bungkus jurnal mutasi, dan kegagalannya menjadi `...SIDE_EFFECT_RESULT_UNAVAILABLE`.
3. **Digest bergantung pada keadaan hidup saat registry dibangun.** `registerPhoneTools` berhenti bila telepon tidak aktif (`phone-tools.ts:77`), jadi menyalakan atau mematikan telepon antara parkir dan resume mengubah digest dan menggagalkan resume.
4. **Dugaan, belum diverifikasi:** mode kebijakan `explicit` mengecilkan grant menjadi `get_config` saja bila ada permintaan kapabilitas dengan ceiling lebih besar (`agent-capability-resolver.ts:262-286`), dan `mergeRestrictions` mempertahankan batasan lama bila entri baru tidak punya (`:112-113`). Tes yang ada tidak mencakupnya.
5. **Kebocoran di jalur MCP lama:** ada `throw` di luar `try/finally` antara `agent-controller.ts:932` dan `:1179`. Tidak berpengaruh di jalur langsung (`close()` kosong), hanya di fallback.

## 4. Tahap kerja berurutan

| Tahap | Isi | Acceptance | Rollback |
|---|---|---|---|
| **S1. Cache yang aman** | Cache daftar nama tool per proses, berkunci bentuk registry (ada tidaknya layanan memory, learning, skills, semanticIde, codeIntelligence, webResearch, artifactAuthorization, nativeWorkspace, dan `phoneController.enabled`). `modelTools`, `contractDigest`, dan peta `isMutating` di-memo per sesi dan dibuang saat sesi dibuka ulang. | Discovery berulang membangun registry sekali; kunci berubah (misalnya telepon on/off) membangun ulang; digest tidak berubah. | Satu commit, mudah dikembalikan; tanpa saklar baru. |
| **S2. Perbaikan berdiri sendiri** | (a) `image_inspect`: penyimpan tampilan berkunci sesi Native, lewat `runtime.imageInspector` yang sudah ada. (b) `skills`: `isMutating` mempertimbangkan aksi untuk tool campuran, sehingga `list/search/read/inspect` tidak dihitung mutasi (butuh keputusan, lihat bagian 6). (c) Tes merah untuk butir 3 dan 4 di bagian 3; perbaiki hanya yang terbukti. | `overview` lalu `crop` berhasil lintas turn; pembacaan skill tidak memicu checkpoint dispatching; tiap perbaikan punya tes merah lalu hijau. | Per butir, commit terpisah. |
| **S3. Registry sekali per proses dengan konteks per panggilan** | `ToolCallContext` yang diisi host (bukan `_meta`): `{ kind: 'native', taskId, workspace, sessionId, ownerId, principalId, allowedTools, failureLoopAdvisor, imageViewKey }`, diteruskan `DirectToolPort` ke `ctx.caller`. Pembungkus membaca konteks, bukan penutup: helper `tool()` (`server.ts:130-288`) dan tiga WeakMap; `installInvocationContext` (membekukan `checkpointGranted`, sekarang harus per panggilan dan default tolak); `installCredentialToolGrant` (dari `registered.disable()` menjadi filter per panggilan di `listTools` dan `callTool`); `callerId` jurnal mutasi. Registrar yang butuh identitas (25 tool di bagian 2) membangun resolver scope per panggilan. Satu registry untuk Native dan satu untuk eksternal (nama tool yang sama berbeda skema, `browser_control`, `artifact_inspect`, `reconstruction_harness`). `AgentRuntimeToolSession.open` menjadi tampilan tipis: registry bersama + konteks + grant. | `contractDigest` per grant identik dengan jalur lama; dua task berurutan memakai registry yang sama tanpa kebocoran advisor, browser, atau scope Memory; resume memakai digest checkpoint lama; tes `memory-task-reconnect` untuk workspace kosong tetap menolak (kegagalan pindah ke waktu panggilan). | Saklar `AGENT_CORE_NATIVE_TOOL_REGISTRY=per-task` mempertahankan jalur sekarang sampai S3 stabil; jalur MCP lama tetap. |
| **S4. Rapikan eksposur MCP untuk Native** | Audit sisa pemakaian MCP di jalur Native: yang tersisa hanya klien stdio Grafel (alat pihak ketiga, tetap) dan fallback bersaklar. Perbarui `CODEBASE.md` dan peta struktur. Penamaan `AgentCoreMcpRuntime` untuk runtime bersama dicatat sebagai OPEN, bukan dikerjakan. | Tidak ada pembuatan `McpServer`, klien, atau transport di jalur Native default (tes sudah ada, diperluas); dokumen sesuai source. | Dokumentasi saja. |

Urutan yang direkomendasikan: S1 lalu S2 (kecil, nilai langsung, risiko rendah), kemudian S3 hanya bila pengguna memutuskan registry sekali per proses memang diperlukan, lalu S4. Plugin dan skill sebagai manifest statis ala `contracts.tools` OpenClaw dicatat sebagai **OPEN** tanpa pekerjaan: di Native, skill sudah dibaca langsung lewat `SkillService` dan satu-satunya jalur plugin hanya konversi menjadi SKILL.md.

## 5. Pagar pengaman (berlaku untuk semua tahap)

- Identitas di `ToolCallContext` hanya diisi host. Tidak boleh dibaca dari `_meta` atau argumen yang dikirim model atau klien (di jalur MCP `_meta` dikendalikan klien).
- `checkpointGranted` dan `evidenceReadAllowed` dihitung per panggilan dari grant sesi, default tolak.
- Cek silang task pada `artifact_inspect` dan `reconstruction_harness` (`mutationContext.taskId` melawan identitas registry) tidak boleh menjadi tautologi: sumber keduanya harus independen.
- `contractDigest` tetap identik byte demi byte: urut nama, urutan kunci JSON dipertahankan (`in-process-tool-host.ts`), tool kondisional yang hilang saat `nativeWorkspace` kosong tetap hilang.
- Perubahan hanya lewat owner yang ada: `src/mcp/server.ts`, `src/agent-tool-session.ts`, registrar masing-masing. Tidak ada folder, registry, atau mesin penyimpanan paralel.
- Tidak ada benchmark. Verifikasi hanya kebenaran fungsi.

## 6. Keputusan yang dibutuhkan dari pengguna

1. **Tahap mana sekarang.** Rekomendasi: S1 dan S2 sekarang; S3 setelah keduanya terbukti dan hanya bila diinginkan.
2. **Pembacaan skill sebagai bukan-mutasi (S2b).** Rekomendasi: ya, per aksi (`list`, `search`, `read`, `inspect`); aksi yang menulis (`propose`, `decide_proposal`, dan sejenisnya) tetap mutasi. Ini mengubah semantik checkpoint untuk skill, jadi perlu persetujuan eksplisit.
3. **Kebijakan `explicit` (butir 4 bagian 3).** Hanya diperbaiki bila tes merah membuktikannya; bila terbukti mengubah perilaku grant yang ada, minta keputusan lagi.

## 7. Verifikasi (hanya kebenaran)

- Tes terarah per tahap, maksimal dua percobaan per target: `tests/in-process-tool-host.test.ts`, `tests/agent-tool-session.test.ts`, `tests/agent-capability-execution-parity.test.ts`, `tests/dtc1-durable-turn-continuation.test.ts`, `tests/native-donor-workflows.test.ts`, `tests/agent-controller.test.ts`, ditambah tes baru per butir. `tests/memory/memory-task-reconnect.test.ts` sudah punya dua kegagalan batas waktu yang sama di kedua jalur; jangan dibaca sebagai regresi tanpa pembanding.
- `tsc --noEmit` dan `npm run build` untuk tiap tahap.
- Uji nyata setelah aktivasi lewat `native_chat_bridge`: turn yang memakai `read_file`, `skills` (list lalu read), dan `image_inspect` (overview lalu crop, dua turn berurutan); lalu satu turn sapaan.
- Aktivasi memakai prosedur yang ada (`npm run build`, `restart_agent_core`, handshake ulang), dan tidak dilakukan saat ada turn yang sedang menjalankan tool.

## 8. Sumber dan owner

- Catatan studi: [Hermes](../research/Hermes-Tool-Call-Mechanism-20261031.md) dan [OpenClaw](../research/OpenClaw-Tool-Call-Mechanism-20261031.md). Keduanya menaruh tool sebagai objek dalam proses, dipanggil sebagai fungsi, dengan konteks per panggilan; MCP hanya klien untuk server luar atau jembatan untuk runtime luar.
- Owner yang dipakai: `src/mcp/in-process-tool-host.ts`, `src/mcp/server.ts`, `src/agent-tool-session.ts`, `src/agent-controller.ts`, `src/mcp/external-controller-tool-support.ts`, `src/auth/tool-grant.ts`, `src/mcp/mutation-safety.ts`, registrar di `src/mcp/*-tools.ts` dan `src/memory/mcp/*`.
- Peta struktur: [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md); arsitektur dan catatan implementasi: [CODEBASE.md](../CODEBASE.md) (entri 2026-10-31 "Native calls its tools without building an MCP server").

## 9. Batas rencana ini

Penelusuran bersifat baca-saja dan belum menjalankan kode. Belum diperiksa: apakah deskripsi tool menyematkan keadaan runtime selain telepon, apakah telepon aktif di konfigurasi nyata, perilaku runtime dari dua dugaan di butir 4 bagian 3, dan apakah ada handler `rdc` yang menyimpan keadaan modul berkunci task. Angka jumlah pendaftaran (79 Native, 63 tanpa telepon) berasal dari hitungan agen penelusur dan tidak saya cocokkan satu per satu dengan source.
