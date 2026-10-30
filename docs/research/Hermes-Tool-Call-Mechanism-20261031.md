# Mekanisme tool call dan pengenalan tool di Hermes Agent (catatan studi)

Tanggal 2026-10-31. Status: **catatan studi baca-saja**, bukan proposal dan bukan izin mengubah apa pun.
Sumber dibaca atas instruksi eksplisit pengguna dari `F:\Workflow\Hermes-Official-20261003`: checkout
`NousResearch/hermes-agent`, commit `05a32542eaf78ace8847e5ef6fdffd0f533d1457` (2026-10-18), lisensi MIT,
penulis Nous Research. Tidak ada yang diubah, dibangun, dijalankan atau dipasang di sana. Catatan ini
menjelaskan **apa yang dilakukan Hermes** dan membandingkannya dengan jalur Native Agent Core saat ini.
Keputusan perubahan ada di bagian 8 dan belum diambil.

## 1. Jawaban untuk pertanyaan awal

**Apakah Hermes membangun server MCP untuk melihat daftar tool miliknya sendiri? Tidak.**
Daftar tool Hermes berasal dari registry Python di dalam proses yang sama. Setiap berkas tool
mendaftarkan dirinya saat diimpor (`registry.register(...)`), dan loop agen memanggil handler lewat
pemanggilan fungsi biasa. MCP dipakai Hermes untuk dua hal lain, dan keduanya dibuat dari registry,
bukan sebaliknya:

| Peran MCP | Arah | Kapan | Bukti |
|---|---|---|---|
| Klien MCP | server MCP luar -> **masuk** ke registry | saat startup atau latar belakang, memakai cache skema di disk dan pendaftaran malas | `tools/mcp_tool.py` baris 1-9; `tools/mcp_tool_discovery.py` `discover_mcp_tools`, `_register_lazy_from_cache`; `tools/mcp_tool_registration.py:353` memanggil `registry.register` |
| Server MCP | registry -> **keluar** ke runtime luar | hanya di proses terpisah, subset terpilih, untuk runtime Codex | `agent/transports/hermes_tools_mcp_server.py` baris 1-8, 62-120 |
| Kontrak pengelolaan | UI desktop atau TUI mengatur server MCP di konfigurasi | tidak berhubungan dengan pemanggilan tool | `tui_gateway/contracts/tools_mcp_plugins.py` baris 1-8 |

Jadi arah Hermes: **registry dulu, MCP adalah adaptor di tepinya.** Arah Native Agent Core sekarang
kebalikannya (bagian 6).

## 2. Peta komponen

| Berkas | Peran |
|---|---|
| `tools/registry.py` (1.086 baris) | Singleton `registry` (kelas `ToolRegistry`). `register()`, `get_definitions()`, `dispatch()`, cache `check_fn`, cakupan per profil. Tanpa dependensi, diimpor oleh semua berkas tool. |
| `tools/*.py` (dan `tools/<paket>/tool.py`) | Implementasi tool. Tiap berkas memanggil `registry.register(name, toolset, schema, handler, check_fn, ...)` pada level modul. |
| `toolsets.py` (495 baris) | Kamus `TOOLSETS` dan daftar `_HERMES_CORE_TOOLS`. Tool hanya terlihat model bila sebuah toolset menamainya. |
| `model_tools.py` (993 baris) | Orkestrasi: `discover_builtin_tools()`, `get_tool_definitions()`, `handle_function_call()`, kait pra dan pasca panggilan. |
| `agent/agent_init.py` (`_load_tools`) | Mengambil definisi sekali saat agen dibuat: `agent.tools`, `agent.valid_tool_names`. |
| `agent/turn_tool_round.py` (313 baris) | Satu putaran tool call dalam loop turn: validasi, dedup, simpan sebelum eksekusi, eksekusi, kompresi. |
| `agent/tool_executor.py`, `agent/tool_dispatch_helpers.py` | Pemilihan jalur eksekusi dan paralelisme. |
| `agent/inline_tool_executors.py` | Tool tingkat agen (`todo_list`, `memory`, `session_search`, `delegate_task`) yang butuh keadaan agen hidup dan melewati registry. |
| `tools/tool_search.py` | Pengungkapan bertahap: tool MCP dan plugin dibungkus tiga tool jembatan `tool_search`, `tool_describe`, `tool_call`. |

## 3. Alur dari startup sampai hasil tool

1. **Discovery** (`registry.discover_builtin_tools`): mengimpor setiap `tools/*.py` yang punya
   `registry.register(...)` pada level modul. Prasaring teks lalu `ast.parse`; vonis per berkas disimpan
   di cache disk berkunci `(mtime_ns, size)`. Docstring menyebut pemindaian AST ±145 ms untuk ±100
   berkas (klaim referensi, tidak saya reproduksi).
2. **Registrasi**: `ToolEntry(name, toolset, schema, handler, check_fn, requires_env, is_async, ...)`
   disimpan per cakupan (profil). Skema yang bukan dict ditolak saat registrasi, bukan saat request.
   Bayangan antar toolset ditolak kecuali `override=True`, dan plugin butuh izin operator. Penghitung
   `registry._generation` naik pada setiap register, deregister atau alias.
3. **Seleksi toolset** (`model_tools._select_tool_names`): dari toolset yang aktif untuk platform atau
   sesi, dikurangi toolset yang dinonaktifkan. Tool yang tidak disebut toolset tidak terlihat meski
   terdaftar.
4. **Definisi untuk model** (`get_tool_definitions`): `registry.get_definitions()` menyaring dengan
   `check_fn` (cache TTL 30 detik), lalu penulis-ulang skema dinamis (agar skema tidak menyebut tool
   yang tidak ada), sanitizer skema, lalu **tool search** sebagai langkah terakhir. Hasil dimemo
   (kunci: generasi registry, stat `config.yaml`, cakupan profil dan lainnya, maksimum 8 entri) dan
   selalu dikembalikan sebagai salinan dangkal supaya penambahan tool agen tidak meracuni cache.
5. **Inisialisasi agen** (`_load_tools`): `agent.tools = get_tool_definitions(...)`,
   `agent.valid_tool_names = {nama...}`, dan `_tool_snapshot_generation` direkam. Daftar ini **tetap
   selama sesi**; AGENTS.md menyebut mengubah toolset di tengah percakapan merusak prefix cache, jadi
   perintah yang mengubahnya berlaku di sesi berikutnya.
6. **Model mengirim `tool_calls`.** `run_tool_round` memvalidasi nama terhadap `valid_tool_names`
   (panggilan tak dikenal mendapat hasil `tool` berisi error, yang valid tetap dieksekusi), memperluas
   batch lokal, membuang duplikat, dan membatasi `delegate_task`.
7. **Simpan sebelum eksekusi**: baris assistant berisi tool call ditulis ke database sesi sebelum tool
   mana pun berjalan, agar resume melihat blok yang sudah dieksekusi bila Hermes restart. Jika
   penulisan gagal, turn dihentikan; tool tidak dijalankan dari keadaan yang hanya ada di memori.
8. **Pemilihan jalur eksekusi** (`_resolve_sequential_dispatch`), urutan prioritas: tool inline agen,
   `delegate_task`, tool context engine, tool memory provider, lalu registry. Registry dipanggil lewat
   `model_tools.handle_function_call(...)`. Paralel: batch dibagi segmen oleh perencana yang memeriksa
   tumpang tindih path; `_MAX_TOOL_WORKERS = 8`.
9. **`handle_function_call`**: `coerce_tool_args`, alias lama, jembatan tool search (`tool_call`
   dibuka dan dikirim ulang sebagai tool aslinya supaya semua kait melihat nama sebenarnya), middleware
   `tool_request`, kait plugin `pre_tool_call` (bisa memblokir atau mengubah argumen), persetujuan edit
   ACP, lalu `registry.dispatch`.
10. **`registry.dispatch`**: `entry.handler(args, **kwargs)`. **Konteks per panggilan** (`task_id`,
    `session_id`, `user_task`, ...) dikirim sebagai kwargs dan disaring sesuai tanda tangan handler
    (`_kwargs_accepted_by`). Handler bukan penutup yang terikat pada task saat registrasi. Semua
    pengecualian dikembalikan sebagai `{"error": ...}` yang dibatasi panjangnya.
11. **Kontrak hasil**: handler mengembalikan string JSON. Satu pengecualian: tool yang menyerahkan
    gambar boleh mengembalikan amplop `{"_multimodal": true, "content": [...], "text_summary": ...}`.
    Gambar tersebut menjadi bagian riwayat dan dikirim ulang pada setiap panggilan API berikutnya, jadi
    ukuran dan jumlah pengulangannya dibatasi di satu tempat (`vision_tools_history_budget.py`).
12. Setelah panggilan: kait `post_tool_call` dan `transform_tool_result`, pencatatan, kompresi konteks
    bila perlu, lalu iterasi berikutnya.

## 4. Tool search (pengungkapan bertahap)

Bila permukaan tool yang boleh ditunda (tool MCP, plugin, beberapa tool inti yang dipicu kejadian)
melewati porsi konteks, model hanya melihat tiga tool jembatan; katalog dibangun ulang dari definisi
hidup setiap kali (tanpa keadaan per sesi, karena yang berkunci sesi pernah menjatuhkan tool diam-diam).
Default: ambang 5% konteks, anggaran daftar maksimum 4.000 token. Tool inti tidak pernah ditunda. Tool
yang dibuka lewat jembatan divalidasi terhadap skema konkretnya dan terhadap katalog sesi (sesi
terbatas seperti subagen tidak bisa menjangkau seluruh registry lewat jembatan).

## 5. Cara tool dari server MCP luar sampai ke model

`discover_mcp_tools()` membaca `mcp_servers` dari `config.yaml`, menyambungkan tiap server (stdio,
HTTP, SSE) pada satu event loop latar belakang, mendaftarkan tool-nya ke **registry yang sama** di
bawah toolset `mcp-<nama>`, lalu semuanya ikut jalur bagian 3. Server bertanda `lazy: true`
didaftarkan dari **cache skema di disk** tanpa menyambung dulu (`_register_lazy_from_cache`); cache
yang tidak ada atau basi jatuh kembali ke koneksi biasa yang sekaligus memperbarui cache. Kepercayaan
dicatat per profil (`_record_scope_trust`); ada pemeriksaan malware OSV pra-spawn dan pembatasan
konkurensi koneksi. Catatan: server MCP luar membayar ongkos koneksi di sisi Hermes, tetapi tidak ada
server yang dibangun **untuk tool Hermes sendiri**.

## 6. Perbandingan dengan Native Agent Core (per 2026-10-31)

Dibaca dari source Agent Core, bukan dari ingatan.

| Hal | Hermes | Native Agent Core |
|---|---|---|
| Sumber daftar tool | registry modul, diisi saat impor | `createAgentCoreMcpServer` mendaftarkan semua tool ke objek `McpServer` (`src/mcp/server.ts:288`) |
| Memanggil tool | `registry.dispatch` = pemanggilan fungsi | klien MCP ke server MCP lewat `InMemoryTransport` (`src/agent-tool-session.ts:194-212`) |
| Frekuensi pembangunan | sekali per proses; definisi sekali per sesi agen | **per turn penuh, dua kali**: `discoverAvailableTools` (`agent-tool-session.ts:104`, dipanggil di `agent-controller.ts:883`) hanya untuk mengambil nama, lalu `AgentRuntimeToolSession.open` (`agent-controller.ts:932`) untuk sesi tool; ditutup dan dibuka ulang saat permintaan kapabilitas mengubah daftar tool yang diberi grant (`agent-controller.ts:1413-1419`) |
| Konteks per task | kwargs per panggilan | penutup yang terikat saat registrasi: `nativeTaskId`, `nativeWorkspace`, `failureLoopAdvisor` (`src/mcp/server.ts:290-291` dan seterusnya) |
| Pembacaan kontrak | tidak ada padanan | `loadAgentProtocol()` membaca `AGENTS.md` dengan `readFileSync` pada setiap pembuatan server (`src/mcp/agent-protocol.ts:6-20`) |
| Grant dan izin | seleksi toolset, `check_fn`, kait pra-panggilan | kunci `VerifiedKey` dengan `toolGrant` terikat saat server dibuat, plus `admissionIssue` |
| Mutasi aman | simpan sebelum eksekusi; ada tidaknya jurnal mutasi khusus tidak saya periksa | jurnal mutasi dan `io.agentcore/invocation-id` lewat `_meta` (`agent-tool-session.ts:205`); dipakai kelanjutan turn |
| Pengungkapan bertahap | `tool_search/describe/call` bila melewati ambang | hanya 3 definisi tool di awal, sisanya `agent_core_toolbox` dan `agent_core_request_capabilities` |
| Server MCP | adaptor ke luar, subset, proses terpisah | permukaan utama untuk controller eksternal; Native memakai jalur yang sama |

Yang **sama dalam prinsip**: pengungkapan bertahap, simpan sebelum eksekusi untuk resume, hasil tool
bergambar dengan anggaran riwayat, seleksi tool per sesi. Yang **berbeda dalam arah**: Hermes menaruh
registry sebagai sumber tunggal dan MCP sebagai tepi; Agent Core menaruh MCP sebagai sumber dan Native
sebagai klien dalam proses.

## 7. Batas studi ini

- **Cakupan baca.** Repo ±34.000 berkas (termasuk `runtime/` dan `tests/`; beberapa folder
  `runtime/tools` menolak akses). Dibaca penuh: `AGENTS.md`, `tools/AGENTS.md`,
  `agent/turn_tool_round.py`. Dibaca sebagian dengan rentang baris: `tools/registry.py` (80-240, 705-790,
  884-975), `model_tools.py` (196-345, 488-545, 700-975), `agent/agent_init.py` (1095-1150),
  `agent/tool_executor.py` (1660-1730 dan hasil grep), `agent/tool_dispatch_helpers.py` (255-330),
  `agent/transports/hermes_tools_mcp_server.py` (1-120 dari 166), `tools/mcp_tool.py` (1-70),
  `tools/mcp_tool_discovery.py` (396-436, 600-662 dan daftar fungsi), `toolsets.py` (1-70),
  `tools/tool_search.py` (1-60 dan grep). Hanya daftar fungsi: `tools/mcp_tool_registration.py`. Tidak
  dibuka: sisanya, termasuk `tests/`, gateway, plugin dan seluruh perilaku runtime.
- **Tidak dijalankan.** Tidak ada kode Hermes yang dijalankan. Angka 145 ms, 8 pekerja, ambang 5% dan
  4.000 token adalah isi kode atau komentar, bukan hasil ukur saya.
- **Belum diverifikasi:** alur paralel penuh, jalur plugin (`ctx.register_tool`, hanya dibaca dari
  AGENTS.md), perilaku saat registry berubah di tengah sesi (hanya terlihat dari penghitung generasi),
  dan isi `tool_search` di luar docstring.
- **Kredibilitas.** Dokumen pengembang resmi dari repo itu sendiri, konsisten dengan kode yang dibaca
  (tidak ada kontradiksi yang saya temukan). Kekurangan yang mereka akui sendiri:
  `_last_resolved_tool_names` adalah global proses yang bisa basi saat delegasi; hasil `check_fn`
  di-cache 30 detik. Kompleksitas besar (puluhan ribu baris hanya di jalur ini).
- **Kecocokan lingkungan** tidak otomatis: Hermes adalah satu proses Python tanpa permukaan konektor
  berautentikasi; Agent Core adalah TypeScript dengan MCP sebagai produk untuk controller eksternal,
  grant per kunci dan jurnal mutasi yang bergantung pada lapisan MCP.

## 8. Pertanyaan terbuka (belum ada keputusan, bukan proposal)

1. Apakah daftar nama tool Native cukup disimpan sekali per proses dan dibangun ulang hanya saat tool
   atau skill berubah? (Padanan memo `get_tool_definitions` berkunci generasi.)
2. Apakah sesi tool Native bisa dibuat saat tool pertama benar-benar dipanggil, bukan di awal turn?
3. Apakah handler tool Agent Core dapat menerima konteks per panggilan alih-alih penutup per task?
   Itu syarat bagi registry tunggal ala Hermes. Jaminan yang harus tetap utuh: grant, jurnal mutasi,
   `invocation-id`, pembatalan, dan perilaku controller eksternal.
4. Apakah cache disk untuk hasil discovery (padanan `tool_discovery_cache.json`) bermanfaat di sini?
5. Berapa lama sebenarnya pembangunan server per turn? Belum terukur; telemetri task belum memisahkan
   langkah itu. Tanpa angka, pekerjaan di nomor 1-4 hanya hipotesis.

Bila pengguna meminta, nomor 1 dan 2 dapat dijadikan paket kecil, dan nomor 3 proposal terpisah dengan
paket bertahap. Dokumen ini tidak memutuskan itu.
