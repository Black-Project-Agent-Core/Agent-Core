# Mekanisme tool call dan pengenalan tool di OpenClaw (catatan studi)

Tanggal 2026-10-31. Status: **catatan studi baca-saja**, bukan proposal dan bukan izin mengubah apa pun.
Sumber dibaca atas instruksi eksplisit pengguna dari `F:\Workflow\openclaw`: checkout `openclaw/openclaw`,
commit `b5ae1a4363815be651d639a9d78e480cda6c7a42` (2026-10-23), paket versi 2026.10.6 (versi dari catatan
`docs/plans/architecture_integration_proposal_openclaw.md` pada commit yang sama), lisensi MIT, OpenClaw
Foundation. Repo berisi 58.640 berkas terlacak git dan sekitar 1,4 GB. Tidak ada yang diubah, dibangun,
dijalankan atau dipasang di sana. Catatan ini menjelaskan **apa yang dilakukan OpenClaw** dan
membandingkannya dengan Hermes dan dengan jalur Native Agent Core. Keputusan perubahan tidak diambil di sini.

Catatan tentang pertanyaan: pertanyaan awal menulis "hermess". Saya membacanya sebagai pertanyaan yang sama
dengan catatan saudara `Hermes-Tool-Call-Mechanism-20261031.md`: apakah runtime membangun MCP agar daftar
tool-nya bisa dilihat. Di repo OpenClaw, Hermes hanya muncul sebagai sumber impor dan migrasi
(`CHANGELOG/2026.10.5.md:1484`, `CHANGELOG/2026.10.6.md:28-30`; halaman migrasinya di `docs/install` tidak
saya buka). Hermes bukan bagian mekanisme tool OpenClaw.

## 1. Jawaban untuk pertanyaan awal

**Apakah OpenClaw membangun server MCP agar daftar tool-nya bisa dilihat? Tidak, untuk runtime bawaannya
(embedded).** Tool adalah objek TypeScript in-process dengan nama, deskripsi, skema parameter dan fungsi
`execute`. Daftarnya dirakit per run dari beberapa sumber (bagian 3), disaring kebijakan, lalu dikirim ke model
sebagai definisi fungsi biasa. Pemanggilan adalah pemanggilan fungsi, bukan permintaan MCP. Satu-satunya
tempat panggilan melintasi MCP adalah tool yang **berasal** dari server MCP luar.

MCP dipakai OpenClaw di empat tempat, semuanya di tepi, ditambah satu jalur non-MCP untuk Codex:

| Peran MCP | Arah | Kapan | Bukti |
|---|---|---|---|
| Klien MCP bawaan | server MCP luar -> **masuk** ke daftar tool sebuah run | hanya bila run punya server di `mcp.servers`; runtime berkunci sesi dengan katalog yang di-cache | `docs/tools/mcp.md:10`; `src/agents/agent-bundle-mcp-runtime.ts` (`callTool` baris 778, `listTools` baris 812); `src/agents/embedded-agent-runner/run/attempt-bundle-tools.ts:107-153`; `src/agents/agent-bundle-mcp-materialize.ts:402,485` |
| Jembatan loopback HTTP | tool Gateway -> **keluar** ke proses CLI backend | hanya backend dengan `bundleMcp: true` (`claude-cli`, `google-gemini-cli`); token per run | `docs/gateway/cli-backends.md:672-684`; `src/agents/cli-runner/loopback-bundle-mcp.ts` (menyiapkan tool MCP terkonfigurasi untuk jembatan). Implementasi server loopback tidak saya buka |
| Server MCP stdio mandiri | tool terpilih -> **keluar** ke sesi ACP | proses terpisah: `src/mcp/openclaw-tools-serve.ts` (tool `openclaw` dan `cron`) dan `src/mcp/plugin-tools-serve.ts` (tool terdaftar plugin) | header dua berkas itu; `docs/cli/acp.md:187` |
| `openclaw mcp serve` | percakapan kanal -> **keluar** ke klien MCP | atas permintaan; bukan daftar tool | `docs/cli/mcp/serve.md:1-60` |
| Codex harness (non-MCP) | tool produk -> dynamic tools Codex | run dengan harness Codex | `docs/tools/index.md:118-122` (dokumen; tidak diverifikasi di source) |

Jadi arah OpenClaw sama dengan Hermes: **daftar tool in-process dulu, MCP adalah adaptor di tepinya.**
Arah Native Agent Core sekarang kebalikannya (bagian 7).

## 2. Peta komponen

| Berkas | Peran |
|---|---|
| `packages/agent-core/src/types.ts:495` | `AgentTool` meluaskan `Tool<TParameters>`: `label`, `outputSchema?`, `prepareArguments?`, `execute(toolCallId, params, signal, onUpdate)`, `executionMode?` (`"sequential"` atau `"parallel"`). Komentar baris 512: lempar error saat gagal, jangan menyandikan error di `content`. |
| `packages/agent-core/src/agent-loop.ts` | `validateToolCallForBatchAdmission` (baris 1006), `prepareToolCall` (baris 963), kait `afterToolCall`. |
| `packages/agent-core/src/agent-loop-tool-execution.ts` | `prepareToolCallExecution`: menjalankan `tool.execute` (baris 172-179), memetakan pengecualian menjadi hasil error. |
| `packages/llm-core/src/validation.ts` | `validateToolArguments`, `validateToolCall` terhadap skema tool. |
| `src/agents/tool-catalog.ts` | Katalog tool inti: id, seksi, profil `minimal`, `coding`, `messaging`, `full` (baris 32). `TOOL_CALL_RAW_TOOL_NAME = "dispatch_action"` (baris 29). |
| `src/agents/agent-tools.ts` | `createOpenClawCodingToolsInternalAsync` (baris 675): generator `assembleOpenClawCodingTools` yang meminta tool inti (`createOpenClawTools`) dan tool plugin (`resolveOpenClawPluginToolsForOptionsAsync`). |
| `src/agents/agent-tools.before-tool-call.*.ts` | Pembungkus kait sebelum panggilan: kebijakan, persetujuan, diagnostik. |
| `src/plugins/registry-registrars-tools-hooks.ts:157` | `registerTool`: menolak nama yang tidak dideklarasikan di manifes. |
| `src/agents/agent-bundle-mcp-*.ts` | Klien MCP: manajer, runtime, materialisasi katalog menjadi `AgentTool`, nama, instruksi server. |
| `src/agents/tool-search*.ts`, `tool-search-config.ts` | Tool Search. |
| `src/agents/system-prompt-tool-list.ts`, `system-prompt-skills.ts`, `src/skills/loading/skill-contract.ts` | Bagian "Tooling" dan "Skills" pada system prompt. |
| `packages/ai/src/transports/*` | Proyeksi tool ke payload provider (`openai-completions-params.ts:171`, `anthropic-messages.ts:467`). |
| `src/mcp/*` | Server MCP di tepi (bagian 1). |

## 3. Alur dari tool sampai hasil tool

1. **Tool inti.** Didefinisikan di `tool-catalog.ts` (id, seksi, profil) dan dibuat oleh pabrik di
   `src/agents/tools/*` lewat `createOpenClawTools`.
2. **Tool plugin.** Manifes `openclaw.plugin.json` memuat `contracts.tools`, yang oleh dokumen disebut
   "kontrak discovery": menyatakan plugin mana yang memiliki tool mana **tanpa memuat runtime semua
   plugin terpasang** (`docs/plugins/tool-plugins.md:599-602`). Saat `api.registerTool(...)` dipanggil,
   registri menolak plugin yang tidak punya `contracts.tools`, dan menolak nama yang tidak dideklarasikan
   (`registry-registrars-tools-hooks.ts:170-211`). Tool boleh berupa objek atau pabrik yang menerima konteks
   run; ada opsi `optional` dan `workspaceAccess`.
3. **Perakitan per run.** `createOpenClawCodingToolsInternalAsync` menggabungkan tool inti dan tool plugin
   (`agent-tools.ts:701-716`). `attempt-bundle-tools.ts` menambah tool MCP lalu tool LSP bundle. Nama yang
   sudah dipakai tool inti dan tool klien dicadangkan agar tool MCP tidak bentrok (`reservedToolNames`,
   baris 148-151, 166-170). Untuk tool MCP dan LSP bundle, berkas itu lalu menerapkan allowlist run,
   kebijakan efektif akhir (`applyFinalEffectiveToolPolicy`), karantina skema dan
   `wrapToolWithBeforeToolCallHook` (baris 173-204). Pembungkus yang sama untuk tool inti ada di
   `agent-tools.before-tool-call.wrapper.ts`, yang tidak saya baca.
4. **Kebijakan sebelum model.** Dokumen menyatakan kebijakan diterapkan sebelum panggilan model; tool yang
   dihapus kebijakan tidak dikirim skemanya. Model hanya melihat tool yang lolos profil, allow/deny, batas
   provider, sandbox, izin kanal dan ketersediaan plugin (`docs/tools/index.md:47-49,147-150`).
5. **Pemadatan.** Tool Search atau Code Mode dapat menunda skema (bagian 4).
6. **System prompt.** `buildSystemPromptToolLines` menulis bagian "## Tooling" dengan kalimat "Tools
   policy-filtered. Names case-sensitive; call exact." lalu satu baris `- nama: ringkasan` per tool tampak,
   inti dulu dengan urutan tetap, tambahan menurut abjad (`system-prompt-tool-list.ts:20-90,93-143`).
   Instruksi server MCP ditambahkan di bagian terpisah.
7. **Payload provider.** Tool diubah menjadi definisi fungsi provider (nama, deskripsi, parameter), diurutkan
   menurut nama (`openai-completions-params.ts:199`; `agent-bundle-mcp-materialize.ts:400-402`
   mengurutkan tool MCP agar blok tool stabil antar turn).
8. **Model mengirim tool call**; loop agen memprosesnya:
   - cari tool menurut nama; tidak ada -> hasil error `Tool <nama> not found` (`agent-loop.ts:1016-1019`);
   - `prepareArguments` bila tool punya shim kompatibilitas, lalu `validateToolArguments` terhadap skema;
     gagal -> hasil error argumen dan tool **tidak dieksekusi** (baris 1021-1039);
   - kait sebelum panggilan (kebijakan, persetujuan) lewat pembungkus langkah 3 (terlihat langsung hanya
     untuk tool bundle);
   - `tool.execute(toolCallId, args, signal, onUpdate)`: **pemanggilan fungsi langsung**
     (`agent-loop-tool-execution.ts:172-179`). Pengecualian menjadi hasil error; sinyal batal menjadi
     `Operation aborted` (baris 124-157);
   - `afterToolCall` hanya bila eksekusi sempat dimulai (`agent-loop.ts:1052`);
   - hasil `AgentToolResult` (`content` teks atau gambar, `details`, `terminate?`) menjadi pesan hasil tool,
     lalu turn berikutnya.
9. **Tool MCP.** `execute` hasil materialisasi memanggil `runtime.callTool(serverName, toolName, input)`
   (`agent-bundle-mcp-materialize.ts:485`). Hasil `isError: true` diteruskan ke agen agar bisa mengikuti
   panduan pemulihan server (`docs/tools/mcp.md:151-156`).
10. **Paralelisme.** `executionMode` per tool dan admission batch dibahas di catatan 2026-10-23
    (`docs/plans/architecture_integration_proposal_openclaw.md`, bagian 1.3). Saya tidak membaca ulang
    `agent-stream-response.ts` pada studi ini.

## 4. Tool Search (pengungkapan bertahap)

Menurut dokumen, run embedded dan Copilot memakai Tool Search terstruktur **otomatis bila
`tools.toolSearch` tidak diatur**; kodenya sejalan: `enabled: setting ?? true`
(`src/agents/tool-search-config.ts:11`). Codex memakai permukaan native-nya sendiri. Fitur ini ditandai
eksperimental di dokumen (`docs/tools/tool-search.md:10`).

- Model menerima tiga tool kontrol: `tool_search`, `tool_describe`, `dispatch_action` (dulu `tool_call`),
  ditambah direktori nama dan deskripsi tool tepercaya di prefix prompt (batas 18.000 karakter, diurutkan
  menurut nama, di atas batas cache prompt).
- Katalog memuat tool OpenClaw, plugin, MCP dan tool klien. Nama dan deskripsi tool MCP dan klien
  **tidak disalin ke system prompt** karena tidak tepercaya; skema tidak tepercaya tidak diindeks, hanya
  nama dan deskripsi.
- Pencarian: BM25 leksikal berbahasa Inggris atas nama dan deskripsi tool serta nama dan deskripsi
  parameter tool tepercaya (`tool-search.md:223-224`).
- Tool inti koding, tool `direct-only` dan klien tetap terlihat langsung. Kebijakan, persetujuan, kait dan
  log tetap berlaku pada panggilan akhir; selektor `include` dan `exclude` hanya mengatur presentasi, bukan
  otorisasi.
- Dokumen mengakui kompaksi tidak selalu lebih murah: katalog kecil bisa menambah beban skema dan putaran
  discovery (`tool-search.md:119-121`). Tidak ada angka manfaat di sini; uji live-nya sengaja mengukur
  katalog kecil dan besar terpisah.

## 5. Skills: bukan MCP dan bukan registri tool

Skill adalah paket instruksi `SKILL.md`. Run mendapat **katalog** di system prompt dalam format
`<available_skills>` berisi `<name>`, `<description>`, `<location>` per skill
(`src/skills/loading/skill-contract.ts:106-126`), dengan instruksi "baca berkas skill di lokasinya bila tugas
cocok" (baris 134). Bagian "Skills" prompt menambah `skills_search` dan `skills_read` bila diaktifkan
(`system-prompt-skills.ts:15-35`; di Code Mode padanannya `skills.search` dan `skills.read` dalam `exec`).
Implementasi tool `skills_*` tidak saya buka. Skill bisa berasal dari workspace, direktori bersama, root
terkelola atau paket plugin (`docs/tools/index.md:59-60`).

## 6. Cara tool dari server MCP luar sampai ke model

Server didefinisikan di `mcp.servers` (stdio, SSE atau Streamable HTTP), lewat Settings, `openclaw mcp add`
atau berkas konfigurasi (`docs/tools/mcp.md:26-118`). Ringkasan perilaku yang terdokumentasi:

- Tool masuk dengan nama `<server>__<tool>` (`TOOL_NAME_SEPARATOR = "__"`,
  `agent-bundle-mcp-names.ts:10`) dan melewati profil serta kebijakan yang sama dengan tool lain; koneksi
  server tidak melewati kebijakan.
- Katalog terakhir yang berhasil didaftar dipertahankan selama server dipulihkan di latar belakang; skema
  yang dipertahankan tidak memberi akses eksekusi. Gagal start memakai backoff eksponensial 30 detik
  sampai 10 menit, dan turn tidak menunggu pemulihan.
- Instruksi server dari hasil initialize masuk ke prompt, dibatasi 2.000 karakter per server. Tool yang
  ditunda Tool Search atau Code Mode menyampaikannya lewat `tool_describe`.
- Selain tool, runtime membuat tool utilitas untuk resource dan prompt MCP
  (`agent-bundle-mcp-materialize.ts:380-397,453-467`).

## 7. Perbandingan OpenClaw, Hermes dan Native Agent Core

Kolom Hermes dan Agent Core dikutip dari `Hermes-Tool-Call-Mechanism-20261031.md` (yang membaca source
Agent Core pada 2026-10-31). Kutipan itu tidak saya baca ulang ke source Agent Core.

| Hal | OpenClaw | Hermes | Native Agent Core |
|---|---|---|---|
| Sumber daftar tool | objek `AgentTool` in-process, dirakit per run attempt dari tool inti, plugin, MCP, klien dan LSP lewat pipeline kebijakan | registry modul Python, diisi saat impor | tool didaftarkan ke objek `McpServer` (`src/mcp/server.ts:288`) |
| Memanggil tool | `tool.execute` = pemanggilan fungsi; tool MCP: `runtime.callTool` ke server luar | `registry.dispatch` = pemanggilan fungsi | klien MCP ke server MCP lewat `InMemoryTransport` |
| Discovery plugin | manifes statis `contracts.tools` tanpa memuat runtime plugin; registrasi menolak nama tak dideklarasikan | registrasi saat impor modul | tidak ada padanan yang saya periksa |
| Pengungkapan bertahap | Tool Search aktif secara bawaan untuk run embedded: 3 tool kontrol dan direktori di prompt | tool search bila melewati ambang konteks (5%) | 3 definisi tool di awal, sisanya `agent_core_toolbox` dan `agent_core_request_capabilities` |
| Peran server MCP | adaptor di tepi: loopback untuk CLI backend, stdio untuk ACP, jembatan kanal | adaptor subset untuk runtime Codex | permukaan utama untuk controller eksternal; Native memakai jalur yang sama |
| Pembangunan daftar | per attempt; runtime MCP berkunci sesi dan katalognya di-cache | sekali per sesi agen | per turn penuh, dua kali (kutipan catatan Hermes) |
| Stabilitas prefix cache | tool diurutkan menurut nama; direktori di atas batas cache; metadata tak tepercaya tidak masuk prompt | daftar tetap selama sesi | tidak saya periksa |

Yang **sama dalam arah** antara OpenClaw dan Hermes: daftar tool in-process adalah sumber, MCP adaptor di
tepi, pengungkapan bertahap untuk katalog besar, kebijakan menyaring sebelum model melihat skema. Yang
**berbeda**: OpenClaw menaruh discovery plugin di manifes statis, menjadikan Tool Search bawaan, dan
memisahkan skill (katalog di prompt, dibaca sesuai kebutuhan) dari tool.

## 8. Batas studi ini

- **Cakupan baca.** Dibaca penuh: `docs/tools/index.md`, `docs/tools/mcp.md`, `docs/tools/tool-search.md`,
  `src/agents/cli-runner/loopback-bundle-mcp.ts`, `src/agents/agent-bundle-mcp-tools.ts`,
  `packages/agent-core/src/agent-loop-tool-execution.ts`, `src/agents/system-prompt-tool-list.ts`,
  `src/agents/system-prompt-skills.ts`, `src/mcp/openclaw-tools-serve.ts`, dan catatan lama
  `architecture_integration_proposal_openclaw.md`. Dibaca sebagian dengan rentang baris:
  `packages/agent-core/src/types.ts` (470-580), `agent-loop.ts` (1000-1070),
  `src/agents/agent-tools.ts` (640-737), `src/plugins/registry-registrars-tools-hooks.ts` (145-265),
  `agent-bundle-mcp-materialize.ts` (380-530), `attempt-bundle-tools.ts` (100-210),
  `attempt-tool-catalog.ts` (1-60), `tool-catalog.ts` (1-70), `skill-contract.ts` (95-135),
  `openai-completions-params.ts` (168-212), `plugin-tools-serve.ts` (1-30),
  `docs/gateway/cli-backends.md` (668-712), `docs/plugins/tool-plugins.md` (594-609),
  `docs/cli/mcp/serve.md` (1-60). Hanya pencarian `git grep` atau daftar berkas: sisanya, termasuk
  `tool-search-config.ts` (hanya baris default). Tidak dibuka: seluruh `tests`, server loopback, Code Mode,
  harness Codex, `agent-stream-response.ts`, pemuat plugin dan pemindai manifes, implementasi
  `skills_search` dan `skills_read`, serta sebagian besar dari 58.640 berkas.
- **Tidak dijalankan.** Tidak ada kode OpenClaw yang dijalankan atau diuji. Angka seperti 18.000 karakter,
  2.000 karakter, backoff 30 detik sampai 10 menit dan batas 16 kueri adalah isi dokumen atau kode,
  bukan hasil ukur saya.
- **Dokumen versus kode.** Klaim dokumen yang saya cocokkan dengan source: tool plugin wajib dideklarasikan,
  tool tak ditemukan menjadi error, argumen divalidasi sebelum eksekusi, Tool Search aktif bila tidak
  diatur, nama MCP memakai `__`, tool MCP diurutkan menurut nama. Klaim yang hanya dari dokumen: katalog MCP
  dipertahankan saat pemulihan, batas instruksi 2.000 karakter, tool inti tetap terlihat di mode direktori,
  loopback dan token per run, dynamic tools Codex.
- **Kredibilitas.** Dokumen pengembang resmi dari repo itu sendiri, MIT, konsisten dengan kode yang dibaca
  (tidak ada kontradiksi yang saya temukan). Tool Search dan Code Mode ditandai eksperimental oleh
  dokumennya sendiri, jadi perilakunya bisa berubah antar rilis; commit dipin di bagian atas.
- **Kecocokan lingkungan** tidak otomatis: OpenClaw adalah Gateway TypeScript multi-kanal dengan banyak
  harness; Agent Core menaruh MCP sebagai produk untuk controller eksternal dengan grant per kunci dan
  jurnal mutasi yang bergantung pada lapisan MCP.

## 9. Pertanyaan terbuka (belum ada keputusan, bukan proposal)

1. Apakah kebiasaan OpenClaw menjaga stabilitas prefix (tool diurutkan menurut nama, direktori di atas
   batas cache, tanpa metadata tak tepercaya di prompt) relevan bagi Native? Perlu data apakah prefix
   cache memengaruhi biaya atau latensi Native; belum ada.
2. Apakah discovery berbasis manifes statis (padanan `contracts.tools`) berguna bagi katalog Skill atau
   plugin Agent Core agar tidak memuat semuanya untuk mengetahui pemiliknya?
3. Apakah mempertahankan katalog terakhir saat server pulih (tanpa memberi akses eksekusi) punya padanan
   atau nilai di jalur MCP Agent Core?
4. Manfaat Tool Search bawaan OpenClaw belum terbukti oleh dokumennya sendiri untuk katalog kecil. Tanpa
   ukuran pada beban kerja Agent Core, tidak ada alasan memindahkannya.

Bila pengguna meminta, nomor 1 sampai 3 dapat dikaji sebagai paket kecil lewat `/study`. Dokumen ini tidak
memutuskan itu.
