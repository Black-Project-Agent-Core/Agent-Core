# Inventaris kemampuan Agent Core untuk paritas Hermes

Tanggal: 2026-11-06. Versi paket: `1.7.0-dev.1` (`package.json:3`). Tujuan: memetakan apa yang benar-benar ada di kode, sebagai bahan keputusan "Agent Core menggantikan Hermes sepenuhnya".

## Cara baca

- Sumber kode adalah otoritas. Dokumen (`CODEBASE.md`, `historical-hermes.md`) hanya dipakai sebagai petunjuk arah.
- Path relatif terhadap akar Source (`Agent Core Source`). Format `path:baris`.
- Status:
  - **ada-jalan**: kode lengkap, terdaftar di jalur masuk (`src/index.ts`, `src/http/app.ts`, `src/mcp/*`), dan ada berkas tes di `tests/` atau `src/**/*.test.*`. Pemeta **tidak menjalankan** build, tes, atau Core; "jalan" di sini berarti terpasang dan teruji di repo, bukan hasil eksekusi hari ini.
  - **ada-belum-terbukti**: kode ada, tetapi saya tidak menemukan tes atau bukti penggunaan nyata, atau bergantung pada konfigurasi yang default-nya mati.
  - **parsial**: sebagian kebutuhan Hermes ada, sebagian tidak.
  - **tidak ada**: grep kata kunci di `src`, `scripts`, `tests`, `extensions` tidak menemukan implementasi. Kata kunci dicatat di kolom Catatan.
- Batasan pemetaan: `src/ui/node_modules` dikecualikan. `DO NOT TOUCH...`, `.env`, `secrets`, `runtime` tidak dibaca. Tool Agent Core tidak dipakai (Core tidak menjawab saat sesi dimulai: TimeoutError); semua bukti dari baca berkas dan grep.

## Gambaran besar (hasil pemetaan)

Agent Core pada dasarnya adalah **server mesin lokal berotentikasi** (HTTP + MCP, `package.json:5` "Local authenticated RDC-compatible MCP machine bridge") yang dipakai oleh *controller eksternal* (Claude Code, Codex, dll.). Di atasnya ada **agen Native** (loop LLM sendiri) yang **default kodenya mati** (`AGENT_CORE_AI_ENABLED` default `false`, `src/config.ts:274`) tetapi **hidup di mesin ini** (koreksi supervisor 2026-11-06). Hermes, sebaliknya, adalah agen mandiri yang hidup terus: gateway pesan, cron, delegasi subagen, banyak backend terminal. Selisih terbesarnya ada di sisi itu, bukan di tool mesin/memori/skill.

## A Entry (CLI, TUI, Desktop, Web)

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Server HTTP lokal + MCP streamable (`/mcp`) | ada-jalan | `src/index.ts:276`, `src/index.ts:353`, `src/http/app.ts:580`, `src/mcp/streamable-http.ts`, tes `tests/bridge-runtime.test.ts` | Titik masuk utama. Host default `127.0.0.1`, port 8765 (`src/config.ts:125`, `:201`). Mode protokol `dual`/`legacy` (`src/config.ts:127`). |
| Web UI chat Native (React 19 + Vite) | ada-jalan | `src/ui/package.json`, `src/ui/src/App.tsx`, `src/ui/src/AgentTimeline.tsx`, `src/ui/src/SlashMenu.tsx`, `src/ui/src/ContextMeter.tsx`, `src/ui/src/ChatAttachments.test.tsx` | Percakapan, langkah tool, lampiran, menu `/` skill, meter konteks, panel perubahan tugas (`TaskChangesPanel.tsx`), halaman Skills dan Workflows. |
| API chat untuk UI (percakapan, turn, resume, pause, cancel, compact, arsip, slash-commands, providers, selection) | ada-jalan | `src/http/app.ts:244-520`, `src/agent-chat-service.ts:175`, tes `tests/agent-chat-service.test.ts`, `tests/agent-ui-transport.test.ts` | Dilindungi `authorizeAgentUi` + header `X-Agent-Core-UI-Token` (`src/launcher/AgentCoreRuntime.cs:145`). |
| Desktop Windows (launcher WinForms + WebView2) | ada-jalan | `src/launcher/MainForm.cs:9`, `:14`; `src/launcher/AgentCore.Launcher.csproj:19`; `src/launcher/AgentCoreRuntime.cs:12`; tes `src/launcher.tests/`, `tests/launcher-*.test.ts` | Hanya Windows. Menjalankan Core, watchdog restart (`AgentCoreRuntime.cs:707`), tunnel, log aktivitas. Tidak ada build macOS/Linux. |
| Endpoint satu-tembakan `POST /agent/run` | ada-belum-terbukti | `src/http/app.ts:538`, `src/index.ts:284` | Memanggil `agentController.runTask`. Tidak ada tes khusus rute ini yang saya temukan (hanya tes controller). |
| Bridge chat Native untuk controller eksternal (CLI mjs) | ada-jalan | `scripts/external/native-chat-bridge.mjs:10`, `src/mcp/native-chat-bridge-tools.ts:95`, `tests/native-chat-bridge.test.ts` | Ini jalur controller→Native, bukan CLI untuk manusia. Dalam sesi ini dilarang dipakai tanpa permintaan eksplisit user. |
| CLI interaktif manusia (`agentcore chat`, flag, REPL) | tidak ada | grep `readline`, `commander`, `yargs`, `inquirer`, `process.argv` di `src/*.ts`, `src/http`, `src/mcp`: hanya `src/index.ts:457` (cek entry) | `npm start` hanya menyalakan server (`package.json:"start"`). Tidak ada perintah pengguna. |
| TUI terminal | tidak ada | grep `\bink\b`, `blessed`, `\bTUI\b` di `src`: nol hasil relevan | |
| Tunnel publik (Cloudflare) + gateway MCP publik | ada-belum-terbukti | `src/launcher/CloudflaredLaunch.cs`, `scripts/tunnel/public-mcp-gateway.mjs:20`, `:56`, `scripts/windows/Start-Cloudflare-Tunnel.ps1`, `tunnel-client/agent-core.example.yaml` | Opsional; butuh token tunnel. Tidak diverifikasi berjalan. Izin tetap user: tunnel Cloudflare sudah pernah dihapus, jangan dipasang kembali tanpa izin baru. |
| Ekstensi browser (Open Browser Use) | ada-jalan | `extensions/agent-core-open-browser-use/manifest.json`, `src/rdc/browser-control/service.ts:392`, tes `tests/open-browser-use.test.ts`, `tests/browser-control.test.ts` | Untuk kontrol tab, bukan untuk chat. |

## B Gateway pesan (Telegram, Discord, Slack, WhatsApp, Signal, Email)

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Telegram | tidak ada | grep `telegram` di `src`, `scripts`, `tests`, `extensions`, `release`, `tunnel-client`, `subagents`: nol | |
| Discord | tidak ada | grep `discord`: nol | |
| Slack | tidak ada | grep `slack`: hanya `src/memory/privacy-masking.ts:214` (pola penyamar token `xox...`) | Itu perlindungan rahasia, bukan gateway. |
| WhatsApp | tidak ada | grep `whatsapp`: nol | |
| Signal | tidak ada | grep `signal-cli`, `signal`: nol (hasil `signal` hanya `AbortSignal`/`SIGINT`) | |
| Email (IMAP/SMTP) | tidak ada | grep `imap`, `smtp`, `nodemailer`, `imapflow`: nol di `src`; `scripts/windows/Restart-Agent-Core.ps1` hanya menyebut kata di konteks lain | |
| Webhook masuk dari platform | tidak ada | grep `webhook`: hanya `CHANGELOG.md`, `tests/credential-shapes.test.ts`, `tests/memory/memory-cognitive-privacy.test.ts` (konteks pola rahasia/riwayat) | |
| Router pesan→sesi per-chat, identitas pengguna per-platform, allowlist | tidak ada | tidak ada kode gateway; satu-satunya identitas pengguna adalah token UI dan kunci/OAuth MCP (`src/auth/key-store.ts:35`, `src/oauth/service.ts:79`) | |
| Pengiriman keluar ke chat/notifikasi | tidak ada | grep `PushNotification`, `notify` di kode produk: hanya notifikasi usulan skill internal (`src/learning/skill-proposal-notification.ts`) | Itu notifikasi ke controller, bukan ke pengguna lewat platform pesan. |

## C Cron dan otomasi

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Penjadwal tugas pengguna (cron, "setiap hari jam X jalankan prompt") | tidak ada | grep `node-cron`, `\bcron\b`, `schtasks`, `ScheduledTask`, `Register-ScheduledTask`, `scheduler` di `src`: hit hanya `src/agent-provider-scheduler.ts` (penjadwal kuota/kunci provider, bukan tugas), `src/rdc/command-guards.ts:118` (peringatan bila perintah mendaftarkan task terjadwal) | Command guard justru *memperingatkan* pembuatan task terjadwal (`command-guards.ts:113-127`, hanya saran, tidak memblokir). |
| Loop pemeliharaan internal memori ("dreaming" / REM) | ada-jalan | `src/memory/rem-consolidation.ts:262` (`IntervalLoop`), `src/memory/cognitive-maintenance.ts:346-351`, `src/http/app.ts:163-180`, tes `tests/memory/` | Satu-satunya timer periodik tingkat produk. Bisa dipicu manual lewat `POST /agent/dreaming`. |
| Curator belajar berkala | parsial | `src/config.ts:266` (`curatorIntervalHours` default 168), `src/learning/triggers.ts:15` (`isCuratorDue`), `src/learning/curator.ts:13` | Hanya *due-check* saat sesuatu memicu; tidak ada daemon yang menjalankan agen sendiri. |
| Pemulihan otomatis turn yang terputus | ada-jalan | `src/agent-chat-service.ts:237`, `:245` (`scheduleProviderResume`), `src/agent-turn-checkpoint.ts`, tes `tests/dtc1-durable-turn-continuation.test.ts`, `tests/native-provider-wait.test.ts` | Melanjutkan turn yang sudah ada, bukan memulai tugas terjadwal baru. |
| Watchdog proses Core/tunnel | ada-jalan | `src/launcher/AgentCoreRuntime.cs:707-732` | Hanya keandalan proses. |
| Hook/event trigger (file berubah, git push, dll.) menjalankan agen | tidak ada | grep `chokidar`, `fs.watch`, `watchFile`, `onEvent` untuk memicu turn: tidak ada pemicu ke Native | `workflows/*` adalah visualisasi/analisis alur, bukan automasi (`src/workflows/service.ts:34`). |

## D Tools dan toolset

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Registri tool mesin (file, edit, cari, proses, config, usage, prompt) | ada-jalan | `src/mcp/server.ts:357-396`, tes `tests/rdc-parity.test.ts`, `tests/mcp-manifest-contract.test.ts`, `tests/mcp-schema-contract.test.ts` | Toolset mengikuti permukaan `desktop-commander-0.2.50-local` (`src/index.ts:307`). Termasuk `read_file` (URL juga), `edit_block`, `write_pdf`, `file_checkpoint`. |
| Tool kontrol browser | ada-jalan | `src/mcp/server.ts:372`, `src/rdc/browser-control/service.ts:392`, `tests/browser-control.test.ts` | Aksi `open/observe/status/close/act`. |
| Tool riset web (`web_search`, `web_open`) | ada-jalan | `src/mcp/web-research-tools.ts:100`, `:108`; `src/web-research/service.ts:264`, `:283`, `:642-708`; `tests/web-research.test.ts` | Penyedia: Exa, Parallel, Jina, Firecrawl, OpenAlex, Pexels, Unsplash, Browserbase, Apify, Langfuse (`src/config.ts:296-311`). Perlu kunci per penyedia. |
| Proyeksi dokumen (PDF, Office, HTML, arsip, XLSX) | ada-jalan | `src/rdc/document-projection/service.ts:87`, `tests/document-projection.test.ts`, `tests/xlsx-projection-evidence.test.ts` | |
| Inspeksi gambar (vision lokal) | ada-jalan | `src/mcp/server.ts:360`, `src/rdc/tools/image-inspect.ts`, `tests/image-inspect.test.ts` | Hanya *membaca* gambar. |
| Tool kode (Grafel graph, orient, surface, analysis, patterns, workspace, repair) | ada-jalan | `src/mcp/code-intelligence-tools.ts:263-734`, `src/code-intelligence/service.ts:134`, `tests/code-intelligence-*.test.ts` | Butuh `grafel.exe` di runtime. |
| Tool IDE semantik (LSP: simbol, referensi, diagnostik, refactor) | ada-jalan | `src/mcp/semantic-ide-tools.ts:35`, `:79`; `src/semantic-ide/service.ts:434`; ~25 tes `tests/semantic-ide-*.test.ts` | TypeScript, Python, C# (`src/config.ts:313-340`). |
| Tool memori / learning / skills | ada-jalan | `src/memory/mcp/tools.ts:97-303`, `src/mcp/learning-tools.ts:34`, `src/mcp/skills-tools.ts:54`, `src/mcp/controller-learning-tools.ts:18` | Lihat area E dan F. |
| Tool ponsel Android (ADB) + mode game | ada-jalan | `src/mcp/phone-tools.ts:88-250`, `src/mcp/phone-game-tools.ts:32`, `:112`, `src/phone/controller.ts:46`, `tests/game-mode-advanced.test.ts` | Tidak ada padanan di Hermes standar; kelebihan Agent Core. |
| Inspeksi artefak biner (asar, JS, managed) dan harness rekonstruksi | ada-jalan | `src/mcp/artifact-inspect-tools.ts:54`, `src/artifact-analysis/service.ts`, `src/mcp/reconstruction-harness-tools.ts:10`, `tests/artifact-analysis-coverage.test.ts` | |
| Katalog kemampuan berisiko untuk Native (22 family, risiko 0-4) | ada-jalan | `src/agent-capability-catalog.ts:3-25`, `:48-266`, `src/agent-capability-resolver.ts`, `tests/agent-capability-resolver.test.ts` | Native hanya melihat tool yang digrant per family. Mode `explicit/minimal/read-only/dynamic` (`src/config.ts:104-110`). |
| Toolbox dinamis (muat skema tool bila diperlukan) | ada-jalan | `src/agent-controller.ts:227-234` (`agent_core_toolbox`), `:572-591` | Mengurangi ukuran skema ke provider. |
| Tool pembuatan gambar / video / audio | tidak ada | grep `image generation`, `generateImage`, `dall-e`, `fal.ai`, `text-to-speech`, `\bTTS\b`, `whisper`, `voice`, `speech` di `src`: hit hanya kata "transcript"/"image" konteks lain | |
| Transkripsi suara / STT / TTS | tidak ada | grep yang sama; `src/ui` tanpa `MediaRecorder`/`SpeechRecognition` (hit nol di kode produk) | |
| Eksekusi kode terisolasi (Python/JS REPL tool) | parsial | `src/mcp/server.ts:385-387` (`start_process`, `interact_with_process`) | Bisa menjalankan REPL lewat proses terminal, tetapi tidak ada tool "execute_code" bersandbox terpisah. |
| Toolset bernama yang bisa diaktifkan per tugas/platform | parsial | `src/config.ts:292-294` (`allowedTools`, `allowedCapabilities`), `src/agent-capability-catalog.ts:3` | Ada filter lewat env dan family, bukan toolset yang dinamai dan dipilih pengguna per platform. |

## E Skills

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Katalog skill berversi (inspect, search, read berbasis digest, validate) | ada-jalan | `src/skills/service.ts:578` (`SkillService`), `:797-944`, `src/skills/discovery.ts:87-170`, `tests/skill-discovery.test.ts`, `tests/skill-read-coverage.test.ts` | Pembacaan terikat digest + `nextOffset`. |
| Impor skill dari folder dan dari plugin Claude | ada-jalan | `src/skills/service.ts:953`, `:1054`, `src/skills/claude-plugin.ts:84-137`, `tests/skill-claude-plugin.test.ts` | Adaptor membaca `SKILL.md` + inventaris komponen plugin. Komponen non-skill (hook, agent, MCP) hanya **dilaporkan**, tidak dijalankan (`claude-plugin.ts:7-10`). |
| Revisi, staging, aktivasi, rollback, pensiun | ada-jalan | `src/skills/service.ts:1174`, `:1258`, `:1379`, `:1415`, `tests/skill-retirement.test.ts`, `tests/skill-writer-release-recovery.test.ts` | |
| Skill dibuat/diusulkan otomatis dari pengalaman (proposal skill, keputusan, review hasil) | ada-jalan | `src/learning/skill-proposals.ts:33`, `src/learning/skill-proposal-decisions.ts`, `src/learning/skill-outcome-review.ts`, `tests/skill-proposals.test.ts`, `tests/skill-outcome-review.test.ts` | Mirip loop "skill self-improvement" Hermes, tetapi butuh persetujuan (`src/mcp/skills-schemas.ts:70`). |
| Pemakaian skill oleh Native (menu `/`, direktif, saklar per skill) | ada-jalan | `src/agent-slash-commands.ts:14`, `src/agent-chat-service.ts:45`, `src/http/app.ts:184-242`, `src/native-skill-settings.ts`, `tests/native-skill-settings.test.ts` | Hanya skill aktif katalog. |
| Rute/efektivitas skill diukur | ada-jalan | `scripts/verify/skill-routing-eval.mjs`, `scripts/verify/skill-effectiveness-eval.mjs`, `package.json:"verify:skill-routing"` | |
| Registry/pasar skill jarak jauh (cari-dan-pasang dari hub) | tidak ada | grep `marketplace` di `src`: hanya model data marketplace plugin lokal (`src/skills/claude-plugin.ts:46-51`, "A marketplace lists plugins; it is not one"); tidak ada klien hub | Impor selalu dari path lokal. |
| Pemeriksaan drift skill upstream | ada-jalan | `scripts/research/skill-upstream-drift.mjs`, `tests/skill-upstream-drift.test.ts` | Alat pemeliharaan. |

## F Memory dan learning

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Memori kanonik berkas + indeks (CRUD, daftar, halaman) | ada-jalan | `src/memory/service.ts:160`, `src/memory/mcp/tools.ts:97-303`, `src/memory/store.ts`, ~98 berkas di `src/memory/` | Satu penyimpanan `runtime/memory` (`src/config.ts:213`). |
| Pencarian hibrid (BM25 + embedding + intent + subpertanyaan) | ada-jalan | `src/memory/bm25.ts:23`, `src/memory/retrieval.ts:212`, `src/memory/subquestion-retrieval.ts`, `src/memory/query-intent.ts`, `tests/memory/` | Embedding opsional via Cloudflare Workers AI (`src/memory/embedder.ts:71`, `src/config.ts:216-221`); tanpa itu hanya leksikal. |
| Pelupaan terukur, retensi, pensiun, kontradiksi, evolusi, konsolidasi | ada-jalan | `src/memory/forgetting-curve.ts:32`, `src/memory/retirement.ts`, `src/memory/contradiction.ts:30`, `src/memory/evolution.ts`, `src/memory/consolidation.ts` | |
| Konsolidasi episodik "dreaming" (REM) + bantuan model | ada-jalan | `src/memory/rem-consolidation.ts:159`, `:262`, `src/memory/rem-model-assist.ts`, `src/memory/cognitive-maintenance.ts:73` | Perlu penyedia model (`setDreamingCompletion`, `src/memory/service.ts:1862`). |
| Masker rahasia pada tulisan memori | ada-jalan | `src/memory/privacy-masking.ts:302`, `:348`, `tests/memory-safety-personal-identifier.test.ts` | |
| Ekspor/impor/migrasi memori | ada-jalan | `src/memory/transfer.ts:91`, `:181`, `src/memory/transfer-v2.ts`, `src/memory/migration.ts:6`, `scripts/memory/migrations/*.mjs` | |
| Memori v2 (episode tugas, working state, niat prospektif) | ada-jalan | `src/memory/mcp/experience-tools.ts`, `src/memory/prospective-intentions.ts:32`, `src/memory/episodes.ts` | |
| Memory-first recall di loop Native | ada-jalan | `src/agent-memory-use.ts`, `src/agent-knowledge-synthesis.ts`, `src/agent-controller.ts` (sistem prompt `:572`), `tests/native-memory-evaluation.test.ts` | |
| Learning (checkpoint, review, keputusan, receipt pemakaian) | ada-jalan | `src/learning/service.ts:118`, `src/learning/external-controller.ts` (±131 KB), `src/learning/review.ts`, `src/mcp/learning-tools.ts:34`, ~14 tes `tests/learning-*.test.ts` | Dipakai controller eksternal dan Native. |
| Learning loop Native (prosedur dari pengalaman, kegagalan, strategi) | ada-jalan | `src/agent-learning-loop.ts:135-198`, `tests/agent-cumulative-learning.test.ts` | |
| Profil pengguna/identitas berkas (SOUL, IDENTITY, USER, AGENTS) + wawancara profil | ada-belum-terbukti | `src/agent-profile.ts:27`, `src/config.ts:269-273` (`AGENT_CORE_AI_PROFILE_ENABLED` default `false`), `tests/agent-profile-interview.test.ts` | Mirip SOUL/USER di OpenClaw/Hermes; default mati. |
| Memori eksternal (Cortex, Mem0) | tidak ada | grep `cortex`, `mem0`, `honcho` di `src`: tidak ada klien; satu-satunya hit `cortex` adalah pembaca panduan teks `src/external-partner-capability.ts:8`, `:57-84` (`subagents/CORTEX_MEMORY.md`) | Penyedia memori pihak ketiga ala Hermes (Honcho, dll.) tidak ada. |
| Pencarian transkrip sesi lama (FTS) lintas percakapan | parsial | `src/agent-chat-store.ts` (penyimpanan percakapan, sqlite), `src/agent-context-compaction.ts:238`, `:126` (pemulihan sumber kompaksi) | Penyimpanan ada; saya tidak menemukan tool "cari semua percakapan lampau" untuk model (grep `searchConversations`, `fts`: nol di tool Native). |

## G Subagen dan delegasi

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Delegasi tugas ke subagen oleh Native (spawn, paralel, batas) | tidak ada | grep `subagent`, `sub-agent`, `spawnAgent`, `delegate`, `fork agent` di `src`: hit hanya metadata audiens profil (`src/agent-profile.ts:12`, `:19`) dan teks "Agent Core does not run Raka" (`src/workflows/controller-cycle.ts:36`) | Native adalah satu loop tunggal (`src/agent-controller.ts`). |
| Mitra "Raka" untuk controller eksternal | parsial | `subagents/raka.md`, `src/external-partner-capability.ts:30`, `:60-75`, `tests/raka-capability.test.ts` | Hanya **panduan teks**; Agent Core "cannot observe or execute host collaboration" (`external-partner-capability.ts:60`). Eksekusi oleh host (Claude Code/Codex). |
| Bridge Hermes lama (`partner` tool) | tidak ada (dipensiunkan) | grep `partner` tool terdaftar: nol; `docs/instructions/historical-hermes.md:5-9` | Dihapus 2026-09-27. Hanya sisa 2 hit kata "hermes" di `tests/learning-grafel-integration.test.ts` dan `scripts/memory/consolidation-source-map.json`. |
| Goal mode (jendela iterasi berlanjut) dan plan mode (baca-saja) | ada-jalan | `src/agent-controller.ts:471-473`, `:1059-1076`, `src/config.ts:289-291`, `tests/agent-chat-plan-mode-route.test.ts` | Ini kerja panjang oleh satu agen, bukan delegasi. |
| Kompaksi konteks + pemulihan sumber | ada-jalan | `src/agent-context-compaction.ts:169`, `:126`, `src/http/app.ts:506`, `tests/agent-context-compaction.test.ts` | |

## H Backend terminal

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Terminal lokal Windows (PowerShell/cmd, sesi interaktif, output bertahap) | ada-jalan | `src/rdc/terminal-manager.ts:132`, `:219`, `:300`, `src/rdc/tools/improved-process-tools.ts`, `tests/terminal-manager-process-ledger-race.test.ts` | Memakai `spawn`, bukan PTY penuh (grep `node-pty`, `ConPTY`: nol). |
| Ledger proses + pembersihan pohon proses | ada-jalan | `src/rdc/process-ledger.ts`, `src/process/owned-process-tree.ts`, `tests/process-ledger.test.ts` | |
| Penjaga perintah berbahaya (hapus akar, dll.) | ada-jalan | `src/rdc/command-guards.ts:99`, `tests/command-guards.test.ts` | |
| Docker | tidak ada | grep `docker` di `src`: hanya deteksi lingkungan (`src/rdc/utils/system-info.ts:6`, `:17-18`), pola penyamar (`src/memory/privacy-masking.ts:118`) dan daftar nama (`src/code-intelligence/graph-observability.ts:213`); bukan backend eksekusi | Perintah `docker ...` tetap bisa dijalankan sebagai perintah biasa di terminal lokal. |
| SSH remote | tidak ada | grep `\bssh\b` di `src`: `src/rdc/terminal-manager.ts:229-233` hanya menambah `-t` pada perintah `ssh` yang diketik; sisanya daftar nama rahasia | Bukan backend: sesi SSH adalah proses lokal biasa, tanpa ledger host jauh. |
| Singularity, Modal, Daytona (serverless) | tidak ada | grep `singularity`, `daytona`, `modal`: nol | |
| WSL | tidak ada | grep `wsl.exe`: nol sebagai backend | |
| Eksekusi di VM awan terpisah | tidak ada | tidak ada kode Core; yang ada hanya skrip proses lokal | Sandbox awan (Vercel) dipakai sebagai plugin Claude, bukan bagian Agent Core. |
| Daftar direktori yang diizinkan | ada-jalan | `src/rdc/tools/filesystem.ts:135-143`, `:190` | Default: folder home pengguna (`:140`). |

## I Provider dan model

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Rute provider: Anthropic, Atria, Gonka, OpenRouter, + base-URL OpenAI-compatible tunggal | ada-jalan | `src/config.ts:163-196`, `:274-277`, `src/agent-provider.ts:453` (`OpenAICompatibleProvider`), `:760` (`OpenAICompatibleProviderPool`), `tests/agent-provider*.test.ts` | Daftar penyedia **tetap di kode/env**; tidak ada OpenAI, Gemini, Ollama, Bedrock, Mistral sebagai nama rute. Endpoint OpenAI-compatible lain bisa lewat `AGENT_CORE_AI_BASE_URL`. |
| Failover, rotasi multi-kunci, circuit breaker, urutan provider | ada-jalan | `src/agent-provider.ts:243`, `:1000`, `:1143`, `src/agent-provider-scheduler.ts`, `src/agent-provider-state.ts:18`, `src/config.ts:281-284`, `tests/agent-provider-pool.test.ts`, `tests/agent-provider-scheduler.test.ts` | Urutan default `atria, gonka, openrouter, anthropic`. Maks 6 percobaan (`config.ts:284`). |
| Streaming Anthropic + caching prompt + reasoning effort | ada-jalan | `src/anthropic-stream.ts`, `src/config.ts:278-279`, `tests/anthropic-stream.test.ts`, `tests/agent-provider-anthropic.test.ts` | |
| Kesiapan model / kapabilitas (modalitas teks, gambar) per rute | ada-jalan | `src/agent-provider-readiness.ts:18-28`, `:222`, `src/agent-provider-state.ts:460-491`, `tests/agent-provider-readiness.test.ts` | |
| Pemilihan model & usaha penalaran dari UI | ada-jalan | `src/http/app.ts:281-310`, `src/agent-chat-service.ts:485-579` | |
| Akuntansi biaya dan konteks | parsial | `src/effective-cost.ts:6` (harga tanggal 2026-07-27, "NOT yet verified"), `src/agent-context-accounting.ts` | Estimasi, bukan tagihan; harga belum diverifikasi. |
| Provider lokal (Ollama/LM Studio/llama.cpp) sebagai rute bernama | tidak ada | grep `ollama`, `lmstudio`, `llama.cpp`, `vllm`, `bedrock`: nol di `src` | Mungkin bisa lewat base URL OpenAI-compatible; belum teruji. |
| Alias model / `/model` ala Hermes lintas provider (Gemini, OpenAI, Nous) | tidak ada | grep `generativelanguage`, `api.openai`, `gemini`, `OPENAI_API_KEY`: nol | |
| Native default | ada-jalan (di mesin ini) | `src/config.ts:274` (default kode `false`) | Default kode mati, tetapi di mesin ini diaktifkan lewat env: `/health` melaporkan `agentRuntime` available dengan 4 provider terkonfigurasi (laporan supervisor 2026-11-06; `.env` tidak dibaca). |

## J MCP dan plugin

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Agent Core sebagai **server** MCP (streamable HTTP, legacy+dual, OAuth, kunci) | ada-jalan | `src/mcp/handler.ts:144`, `src/mcp/server.ts`, `src/mcp/streamable-http.ts`, `src/oauth/service.ts:79`, `src/auth/key-store.ts:35`, `src/auth/tool-grant.ts:5-46`, `tests/oauth*.test.ts`, `tests/mcp-*.test.ts` | Grant per kredensial memfilter tool (`credentialAllowsTool`, `tool-grant.ts:28`). |
| Kontrak controller (handshake, digest, sesi) | ada-jalan | `src/mcp/controller-contract.ts`, `tests/controller-contract.test.ts` | |
| Pengaman mutasi MCP (journal, idempotensi, drain) | ada-jalan | `src/mcp/mutation-safety.ts:79`, `:377`, `tests/mcp-invocation-evidence.test.ts` | |
| Anggaran ukuran hasil MCP | ada-jalan | `src/mcp/result-budget.ts`, `tests/mcp-result-budget.test.ts` | |
| Klien MCP generik (Native memakai server MCP pihak ketiga dari konfigurasi) | tidak ada | grep `mcpServers`, `StdioClientTransport`, `StreamableHTTPClientTransport`, `connectMcp`: hanya `src/code-intelligence/grafel-client.ts` (klien khusus ke Grafel) dan `src/skills/claude-plugin.ts` (hanya menyebut/melaporkan) | Native hanya memakai registri tool bawaan (`tests/native-shared-tool-registry.test.ts`). |
| Sistem plugin runtime (muat kode pihak ketiga: hook, agen, MCP, perintah) | tidak ada | `src/skills/claude-plugin.ts:7-10` menyatakan non-skill hanya dilaporkan, tidak diikuti | Hanya skill dari plugin yang bisa diimpor. |
| Hook siklus hidup (pre/post tool, sesi mulai/akhir) di Native | tidak ada | grep `PreToolUse`, `hooks` di `src`: tidak ada mesin hook Native | Hook ada di sisi controller (Claude Code), bukan Agent Core. |
| Ekstensi browser sebagai transport | ada-jalan | `src/rdc/browser-control/open-browser-use-runtime.ts`, `extensions/agent-core-open-browser-use/` | |

## K Keamanan dan approval

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Otentikasi HTTP/UI (token UI, kunci, OAuth, origin, proxy) | ada-jalan | `src/http/auth.ts`, `src/http/security-policy.ts`, `src/config.ts:223-232`, `tests/http-auth.test.ts`, `tests/http-security.test.ts` | |
| Risiko per kemampuan + ceiling operator + grant tugas-terikat untuk Native | ada-jalan | `src/agent-capability-catalog.ts:1`, `:282`, `src/agent-capability-resolver.ts`, `src/agent-controller.ts:1003-1034`, `tests/agent-capability-resolver.test.ts`, `tests/agent-capability-execution-parity.test.ts` | Pengganti "izinkan tool?" ala Hermes, tetapi bersifat kebijakan, bukan dialog. |
| Plan mode: tool mutasi **ditolak** oleh host (`PLAN_MODE_READ_ONLY`) | ada-jalan | `src/agent-controller.ts:179-184`, `tests/agent-chat-plan-mode-route.test.ts` | |
| Dialog persetujuan interaktif per-aksi berisiko (setujui/tolak di UI) | tidak ada | grep `approveTool`, `approveToolCall`, `requestApproval`, `pendingApproval`, `awaitingApproval`, `allow once`, `always allow` di `src/**/*.ts(x)`: nol; satu-satunya persetujuan adalah **usulan skill** (`APPROVE_SKILL_PROPOSAL`, `src/mcp/skills-schemas.ts:70`) | Untuk Native, prompt memerintahkan "tunjukkan ke user sebelum bertindak" (`src/agent-controller.ts:587`), tetapi itu perilaku model, bukan gerbang UI. |
| Teks tak tepercaya diperlakukan sebagai data (injeksi prompt) | ada-jalan | `src/security/untrusted-text.ts:79`, `tests/untrusted-text.test.ts`, `src/agent-controller.ts:587` | |
| Redaksi rahasia di log/transkrip/hasil | ada-jalan | `src/security/redaction.ts:3-34`, `src/agent-turn-events.ts:96-111`, `src/security/evidence-capture-policy.ts`, `tests/credential-shapes.test.ts` | |
| Kebijakan jaringan keluar (anti-SSRF, redirect, batas ulang) | ada-jalan | `src/net/outbound-request.ts:161` (`fetchWithPolicy`), `src/net/public-address.ts`, `src/net/endpoint-policy.ts`, `tests/outbound-redirect-credentials.test.ts`, `tests/outbound-retry-budget.test.ts` | |
| Penjaga hapus katastrofik + saran persistensi | ada-jalan | `src/rdc/command-guards.ts:99-127`, `tests/command-guards.test.ts`, `tests/rdc-kill-process-guard.test.ts` | Persistensi hanya saran, tidak memblokir. |
| Berkas sensitif + identitas berkas | ada-jalan | `src/security/sensitive-file.ts`, `src/security/file-identity.ts` | |
| Checkpoint berkas + perubahan tugas (undo) | ada-jalan | `src/rdc/checkpoints/service.ts`, `src/rdc/checkpoints/task-changes.ts`, `src/http/app.ts:157`, `tests/file-checkpoint.test.ts`, `tests/task-changes.test.ts` | |
| Sandbox eksekusi tingkat OS (AppContainer/jail/container) | tidak ada | grep `sandbox`, `appcontainer`, `chroot`, `jail` di `src/rdc`: hanya validasi path di `filesystem.ts` | Isolasi hanya berupa daftar direktori + penjaga perintah. |
| Audit/aktivitas tool | ada-jalan | `src/tracker/activity-tracker.ts:89`, `src/tracker/tool-invocation.ts`, `src/rdc/utils/toolHistory.ts` | |

## L Migrasi, setup, doctor, update

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Pemulihan/diagnosis instalasi (Audit/Repair/Bootstrap) | ada-jalan | `scripts/windows/Recover-Agent-Core.ps1:2` (`ValidateSet Audit,Repair,Bootstrap`), `package.json:"recovery:audit"`, `tests/recovery-source-boundary.test.ts` | Paling dekat dengan `hermes doctor`; Windows-only, tidak ada perintah `doctor` lintas-platform. |
| Health endpoint terperinci (memori, eksekusi, Native, kode, skill, learning) | ada-jalan | `src/http/app.ts:137`, `src/index.ts:288-327`, `src/http/health.ts`, `tests/health-probe.test.ts` | |
| Promosi Source→Platform (dry-run lalu `-Apply`) dan restart | ada-jalan | `scripts/windows/Promote-Source-To-Platform.ps1:28`, `scripts/windows/Restart-Agent-Core.ps1`, `src/mcp/restart-tool.ts:59`, `tests/restart-tool.test.ts`, `tests/restart-readiness.test.ts` | |
| Rilis, intent, paket, kompatibilitas, snapshot | ada-jalan | `scripts/release/*.mjs`, `package.json` skrip `release:*`, `tests/release-*.test.ts` | Pipeline rilis internal, bukan update untuk pengguna akhir. |
| Portabilitas root & relokasi runtime | ada-jalan | `src/portability/paths.ts`, `src/portability/runtime-relocation.ts`, `scripts/portability/check-path-policy.mjs`, `tests/portability-*.test.ts` | |
| Setup awal terpandu (wizard pasang pertama, pengisian kunci provider) | tidak ada | grep `setup`, `wizard`, `onboarding` di `src` (kecuali `src/rdc/data/onboarding-prompts.json`, prompt onboarding Desktop-Commander lama) dan `scripts`: tidak ada wizard; konfigurasi lewat `.env` manual (`src/config.ts:118`) | |
| Migrasi dari Hermes/OpenClaw (impor sesi, memori, skill, kredensial lama) | tidak ada | grep `hermes`, `openclaw` di `src`, `scripts`, `tests`: hanya 2 hit tak relevan (`tests/learning-grafel-integration.test.ts`, `scripts/memory/consolidation-source-map.json`); `scripts/memory/migrations/*` hanya untuk format memori Agent Core sendiri | Ini celah langsung untuk tujuan "menggantikan Hermes". |
| Pembaruan otomatis (`update`, cek versi, unduh rilis) | tidak ada | grep `autoUpdate`, `checkForUpdate`, `self-update` di `src`: hanya saklar polling UI Workflows (`src/ui/src/WorkflowsPage.tsx:13`) dan `--no-autoupdate` untuk cloudflared (`src/launcher/CloudflaredLaunch.cs:42`), bukan pembaruan produk; pembaruan manual lewat `Promote-Source-To-Platform.ps1` | |
| Pemasangan sebagai layanan/auto-start | parsial | `scripts/windows/Register-Agent-Core-Npm.ps1`, `scripts/windows/Ensure-Agent-Core-LocalRuntime.ps1`, `src/launcher/AgentCoreRuntime.cs:707` | Launcher mengelola proses; tidak ada pendaftaran layanan OS atau systemd/launchd. |
| Lintas-platform (Linux/macOS) | tidak ada | launcher WinForms (`src/launcher/MainForm.cs:9`), skrip `.ps1`/`.cmd`, `grafel.exe` (`src/config.ts:241`) | Inti TypeScript mungkin portabel, tetapi tidak diuji dan alat pendukung Windows-only. |

## M Lainnya

| Kemampuan | Status | Bukti (path:baris) | Catatan |
|---|---|---|---|
| Lampiran file/gambar di chat Native | ada-jalan | `src/agent-chat-attachments.ts`, `src/http/app.ts:109`, `:350`, `tests/agent-chat-attachments.test.ts` | Batas total 25 MiB terkode. |
| Penyimpanan percakapan durabel + ringkasan + checkpoint turn | ada-jalan | `src/agent-chat-store.ts`, `src/agent-turn-checkpoint.ts`, `tests/agent-chat-store.test.ts` | |
| Visualisasi alur kerja / diagram siklus controller | ada-jalan | `src/workflows/service.ts:34`, `src/workflows/analyzer.ts`, `src/ui/src/WorkflowsPage.tsx`, `tests/workflows-*.test.ts` | |
| Evaluasi memori dan retrieval (offline) | ada-jalan | `scripts/memory/evaluation/*.mjs`, `src/memory/evaluation/*`, `package.json:"learning:evaluate-retrieval"` | Alat ukur; instruksi user melarang menjalankan benchmark tanpa izin. |
| Kunci Langfuse | ada-belum-terbukti | `src/config.ts:307-309`, `src/web-research/service.ts:323-325` | Kunci dipakai di layanan riset web (kondisi penyedia, bukan pengirim trace LLM). Observabilitas LLM ala Hermes (trace per turn ke platform eksternal): tidak ditemukan; grep `langfuse` hanya dua berkas itu. |
| Ponsel/game sebagai permukaan interaksi | ada-jalan | `src/phone/controller.ts:46`, `src/phone/game-mode-service.ts` | Kelebihan di luar Hermes. |
| Penelusuran kode multi-bahasa (Grafel, LSP) | ada-jalan | lihat D | Kelebihan di luar Hermes. |
| Multi-pengguna / multi-profil / isolasi per-pengguna | tidak ada | grep `multiUser`, `tenant`, `profileId` di `src` selain `src/agent-profile.ts`: satu profil pemilik (`AgentProfileAudience 'owner-private'`, `agent-profile.ts:12`) | Hermes mendukung banyak profil; Agent Core dirancang untuk satu pemilik. |
| Dokumentasi pengguna akhir (install, panduan) | parsial | `README.md`, `docs/`, `SUPPORT.md` | Dokumentasi diarahkan ke operator/controller, bukan panduan pemakai pertama kali. |
| Jumlah tes | — | `tests/` 501 berkas (termasuk fixture), `src/**/*.test.*` | Tidak dijalankan oleh pemeta. |

## Lima celah terbesar terhadap tujuan "menggantikan Hermes"

1. **Gateway pesan tidak ada sama sekali** (area B): Telegram, Discord, Slack, WhatsApp, Signal, Email nol implementasi, termasuk router sesi per-chat dan identitas pengguna per-platform. Tanpa ini Agent Core tidak bisa dipakai dari ponsel/chat seperti Hermes.
2. **Tidak ada penjadwal tugas agen / cron** (area C): Native hanya bereaksi terhadap permintaan; satu-satunya timer produk adalah pemeliharaan memori. Tidak ada "jalankan prompt ini setiap hari" dan tidak ada pemicu berbasis peristiwa.
3. **Tidak ada delegasi subagen oleh Native, dan daftar provider sempit** (area G dan I): Native satu loop tunggal (`agent-controller.ts`; default kode mati, `config.ts:274`, tetapi hidup di mesin ini), dan daftar provider tetap pada Anthropic/Atria/Gonka/OpenRouter. Raka hanyalah panduan teks untuk host.
4. **Hanya backend terminal lokal Windows, tanpa CLI/TUI untuk manusia** (area A dan H): tidak ada Docker, SSH, WSL, atau serverless; tidak ada REPL/perintah pengguna; launcher WinForms dan `grafel.exe` Windows-only.
5. **Tidak ada jalur migrasi, wizard setup, update otomatis, atau klien MCP/plugin runtime** (area J dan L): tidak ada impor dari Hermes/OpenClaw (grep nol), tidak ada onboarding terpandu, tidak ada `update`, Native tidak bisa memakai server MCP pihak ketiga, dan tidak ada dialog persetujuan interaktif per aksi berisiko (area K) — izin hanya berupa kebijakan family/grant.

Celah lebih kecil yang tercatat: tanpa TTS/STT/pembuatan gambar, tanpa memori eksternal (Honcho/Mem0) sebagai penyedia, tanpa sandbox OS, dan tanpa pencarian lintas percakapan sebagai tool model.

## Yang tidak diverifikasi

- Tidak ada build, tes, atau start Core yang dijalankan; status "ada-jalan" berarti kode + tes ada di repo.
- Tidak dibaca: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT`, `.env`, `runtime`, `SubProject` (working tree sedang kotor karena penghapusan SubProject; tidak disentuh).
- Baris yang dikutip diambil dari baca/grep pada 2026-11-06; bila kode berubah sesudahnya, nomor baris dapat bergeser.
