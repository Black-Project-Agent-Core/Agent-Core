# Diagnosis latensi interaktif Native Agent Core

Tanggal: 2026-11-01 (Asia/Tomsk). Status: diagnosis selesai; perbaikan produksi belum diaktifkan oleh task ini.

## Kesimpulan

Kelambatan teks pertama, pergantian tool, dan jawaban akhir mempunyai dasar teknis. Penyebab lokal yang terukur adalah normalisasi seluruh riwayat runtime untuk operasi kecil. Pencatatan, recall, finalisasi dan status juga berada pada jalur yang ditunggu pengguna. Adapter selain Anthropic belum melakukan token streaming.

Belum ada alasan berbukti untuk mengganti Node/TypeScript, menambah RAM, atau menulis ulang seluruh harness. Kandidat cache existing mengurangi biaya normalisasi dalam bahasa dan owner yang sama. Belum ada perbandingan dengan Codex Desktop, Claude Desktop, OpenClaw atau Hermes memakai model, endpoint, effort, history dan tool yang benar-benar sama.

## Identitas, scope dan hasil verifikasi

- Root `E:/Projects/Agent-Core`; HEAD `07acdee305cde090778452ef1e6847cb4497f494`; branch `docs/restart-agent-core-via-cmd`.
- Resident PID 18384; `runtime/node/node.exe`; entry `dist/index.js`; mulai `2026-11-01T07:58:40.178Z`; health HTTP200, versi `1.7.0-dev.1`.
- State: 184 task, 137 session, 7.697 episode, 4.424.410 byte. Health: nol running chat turn, satu resumable turn, satu pending finalization. Active session bukan jumlah inference bersamaan.
- Worktree sebelum diagnosis sudah memuat perubahan `.env.example`, `docs/CODEBASE.md`, `src/agent-runtime.ts`, tes maintenance Memory, changeset cache, dan tes cache. Semuanya dipertahankan; patch cache bukan dibuat oleh diagnosis ini.
- Tidak membaca `.env`, credential, browser profile atau direktori terlindungi. Tidak melakukan provider completion, replay task lama, perubahan konfigurasi, build, restart, commit atau publication.
- Chat SQLite dibuka read-only; keluaran hanya metadata/agregat, tanpa isi percakapan.
- Tes existing yang dijalankan: `rtk npm test -- tests/agent-runtime-normalize-cache.test.ts`: 5/5 lulus. Ini memeriksa parity cache, invalidasi, isolasi mutation hasil, validasi pada cache hit dan konsistensi fixture file; bukan penerimaan live Native.

SHA-256 snapshot:

| Artefak | Hash |
|---|---|
| `src/agent-runtime.ts` | `d1310d287ce3a80fb1d8b4d462d0e682a3a30d0b9f6c41550eef89719e17700c` |
| `dist/agent-runtime.js` | `1fda14482718b6817c58e89565fca8b7b25a7bfa9c92db31401d967df8034d79` |
| `src/agent-provider.ts` | `33b98e772a9bc77caa06d9c94566148ad625e7875f263abb34cf61da66eb2f29` |
| `dist/agent-provider.js` | `a4f2c6826533112557b0a46c3b443ab9a3356fa543627668eae4070637aceeae` |
| `runtime/agent-runtime/state.json` | `f90e0079e7ecc8dbb558f28790b81d316f9e91787248428b2d4ae546a6df42f7` |

## 1. Operasi kecil memvalidasi seluruh riwayat

`src/agent-runtime.ts:538–582`: `mutate` menunggu antrean per file, `load` membaca seluruh JSON dan menjalankan `normalizeState`, operation mengubah state, `save` menjalankan normalisasi lagi dan menulis seluruh file. `getTask` dan health juga memanggil `load`. `MAX_TASKS=2000`; sekarang baru 184 task.

Normalisasi menelusuri task, episode dan evidence validation. Satu detik di bawah adalah seluruh normalisasi, bukan bukti bahwa `JSON.parse` sendirian memakan satu detik. Belum ada CPU flamegraph untuk membagi biaya validator internal.

`src/persistence/state-file.ts` juga memeriksa generasi lama, menulis `.last-good`, atomic write dan readback. `atomic-file.ts` melakukan file sync. Proteksi ini tidak boleh dihapus untuk mengejar angka; solusi harus mengurangi pengulangan kerja dengan validasi dan durability tetap benar.

Pengukuran baru memakai subprocess Node proyek `v24.21.0`, canonical state read-only, satu warm-up dan empat sampel per kondisi. Dist dimuat dalam memori dengan ekspor diagnostik fungsi normalisasi; source kandidat ditransformasikan melalui `node:module.stripTypeScriptTypes`, memakai dependency dist yang sama. Tidak menulis state/build. `assert.deepStrictEqual` memastikan hasil ketiga kondisi sama.

| Kondisi | Sampel ms | Median ms |
|---|---|---:|
| Current dist tanpa cache | 1149, 1055, 949, 997 | 1026 |
| Source kandidat, cache off | 1277, 1062, 1031, 1026 | 1046,5 |
| Source kandidat, warm cache | 44, 20, 21, 19 | 20,5 |

Ini contrast satu fungsi pada input sama. Belum membuktikan latency chat end-to-end, biaya mutation penuh atau p95. Cache tetap membaca dan memproses file serta belum membatch update.

## 2. Bookkeeping menahan hasil tool

`agent-controller.ts:1904` menulis metrics/episode sebelum dispatch. Setelah tool kembali, `bumpMetrics(toolMs)` ditunggu pada `finally`, lalu episode keberhasilan (`1999`) dan capability receipt (`2005`) sebelum event `tool.completed` (`2022`). Beberapa full-state mutation berada di luar stopwatch tool. Capability receipt melewati mutation bila tidak ada use relevan, sehingga jumlah update berbeda antarcall.

Agregat `chat_turn_steps` untuk task `65ea481a-3076-4c85-9e75-7c27a41f7ddc`, turn `b550e8ac-aaa4-4dce-9d3e-8cf4ad948393`:

| Tool | N | Rata-rata step ms |
|---|---:|---:|
| `get_config` | 1 | 7628 |
| `get_file_info` | 8 | 7460 |
| `get_more_search_results` | 14 | 7321 |
| `read_file` | 36 | 7577 |
| `read_multiple_files` | 1 | 8034 |
| `skills` | 3 | 6977 |
| `start_search` | 16 | 7702 |

Total 79 tool mencatat `toolMs` hanya 15.472 ms, sekitar 196 ms per call. Pola penundaan lintas tool cocok dengan shared runtime overhead. Durasi step UI mencakup biaya lebih luas daripada `toolMs`; jangan menjumlahkannya sebagai dua komponen independen.

## 3. Telemetri turn nyata

Wall di bawah adalah `task.updatedAt - task.createdAt`, bukan waktu user mengirim sampai browser merender. Model stage mencakup envelope `runtime.complete`, termasuk callback sebelum provider dispatch; bukan stopwatch jaringan murni.

| Task | Wall ms | Model stage ms | Tool ms | Recall ms | Residual ms |
|---|---:|---:|---:|---:|---:|
| `65ea481a…` | 2503367 | 1096854 | 15472 | 0 | 1391041 |
| `54b13192…` | 161592 | 46428 | 0 | 15223 | 99941 |
| `614313f8…` | 267783 | 153873 | 0 | 19701 | 94209 |

Task pertama: wall 41 menit 43 detik; model stage 18 menit 17 detik; tool 15,5 detik; residual 23 menit 11 detik. Dua task terakhir tidak memanggil ordinary tool. Mempercepat implementasi tool saja tidak menyelesaikan masalah.

Residual berarti belum teratribusi: normalisasi, mutation queue, checkpoint, context assembly, finalisasi dan jeda lain dapat berkontribusi. Continuation dapat memasukkan jeda manual. Jangan menyebut seluruh residual sebagai CPU normalisasi atau waktu yang pasti bisa dihapus; dibutuhkan trace fase untuk atribusi akurat.

## 4. Patch belum menjadi build aktif

Source memuat `TASK_NORMALIZATION_CACHE`, current dist tidak. Source mtime `2026-10-31T20:58:06Z`; dist `2026-10-31T20:02:38Z`. Resident memakai dist. Restart saja memuat build lama yang sama; source harus dibangun sebelum aktivasi.

Health `build.stale=false` tidak membantah temuan ini. `src/http/process-identity.ts:38–40` membandingkan dist mtime terhadap process start, bukan source terhadap dist. Health baik tidak membuktikan source terbaru sudah terkompilasi atau menjamin performa interaktif.

## 5. Jalur awal dan akhir terlalu berat untuk percakapan ringan

`isSimpleConversation` (`agent-turn-outcomes.ts:43`) hanya menerima vocabulary sapaan/terima kasih/identitas yang sempit, maksimal 60 karakter dan 8 kata. Banyak pertanyaan biasa masuk jalur lengkap.

Jalur lengkap menunggu fusion recall (`agent-controller.ts:905–921`, `agent-runtime.ts:746`), retrieval/episode writes, knowledge synthesis, tool discovery, capability/session dan checkpoint sebelum inference. Recall dua task terakhir tercatat 15,2 dan 19,7 detik. Waktu jaringan embedding vs biaya lokal belum diisolasi.

Task `54b13192…`: satu model call, nol tool, input 15.151 token, output usage 5.904 token. Output usage dapat mencakup thinking, bukan seluruhnya teks yang terlihat. Nol tool tidak otomatis berarti request ringan.

Finalisasi (`agent-controller.ts:1690–1784`) menunggu knowledge/artifact outcomes, Learning, episode verification/finalization, task/memory-use reads dan checkpoint. `AgentChatService:730` menahan final controller; final persisted baru dikirim setelah chat commit (`:758`). UI lalu memperoleh detail canonical. Mengurangi waktu model saja belum menghapus gap akhir.

## 6. Streaming provider belum lengkap

Transport local mendukung event bertahap: `http/app.ts:336–355` NDJSON → `launcher/AgentCoreRuntime.cs:367–385` ResponseHeadersRead/ReadLineAsync → `MainForm.cs:620–638` → `ui/src/App.tsx:173–189`.

Tetapi `agent-provider.ts:514` menetapkan `streaming = anthropic && options.probe !== true`. Atria/Gonka/OpenRouter menerima `stream:false` dan menunggu JSON penuh. Dist juga demikian. Ini mengurangi responsivitas teks pertama tanpa membuktikan inference model lebih lambat.

Recent stored completions memakai `anthropic` / `claude-sonnet-5-5`; kekurangan streaming route lain bukan penjelasan utama untuk sampel tersebut. Anthropic hanya meneruskan text delta ke preview; thinking tidak menjadi preview. `display:'omitted'` dan effort tinggi dapat menghasilkan jeda terlihat saat stream tetap aktif.

## 7. Effort, konteks dan prompt cache

`config.ts:56–60` menetapkan default ceiling `max`; `agent-provider.ts:1236–1242` memilih effort tertinggi yang didukung sampai ceiling. UI Auto berarti tidak memberi override, bukan otomatis memilih effort cepat. Recent turn mempunyai `reasoning_effort=null`.

Nilai ceiling efektif proses aktif belum terbukti karena `.env`/environment proses tidak dibaca. Yang terbukti adalah default source dan tidak adanya override turn. [Anthropic](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost) menjelaskan effort mengendalikan frekuensi/kedalaman thinking; perubahan effort juga dapat menginvalidasi prompt cache. Jangan menggantinya setiap call tanpa mempertimbangkan mutu dan cache.

Prompt cache bukan sepenuhnya mati: task `65ea481a…` mencatat cache-read 4.660.540 dari total input 5.019.312 token, sekitar 92,9%. Ini reuse input, bukan cache hasil tool atau reasoning/output berikutnya.

## 8. Pengali sekunder

- Tool loop `agent-controller.ts:1426` serial. Bounded concurrency hanya layak untuk read-only calls yang terbukti independen, dengan grant, cancellation, urutan dependency dan mutasi tetap terjaga.
- Search first-chunk wait hanya 40 ms (`rdc/search-manager.ts:214`). Start-up lebih lama menghasilkan handle/poll; sampel mencatat 16 start dan 14 poll. Belum dihitung berapa model round yang semata-mata polling; beberapa poll dapat berada dalam satu reply.
- Launcher status timer 3 detik mengambil `/health` lalu runtime load. Cache health 5 detik dan coalescing mengurangi frekuensi, lazimnya sekitar 6 detik pada pola tersebut. Timeout Promise.race tidak menginterupsi normalisasi sinkron yang telah berjalan. Mekanisme sesuai [panduan Node.js](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop); kontribusi CPU live belum diprofilkan.
- Detail chat mengambil runtime/Learning decision evidence walaupun panel tertutup. Polling chat 1,5 detik tidak selalu memicu detail selama local request aktif: `App.tsx:299–303` memblokir reopen. Jangan menyalahkan seluruh polling UI.
- UI menghapus preview pada final lalu menunggu detail canonical; render semua pesan/step juga bertambah dengan history. Belum ada browser trace untuk menyebut React sebagai penyebab dominan.

## Urutan perbaikan dan batas bukti

1. Review dan aktifkan cache existing melalui build/restart resmi; ukur ulang workload sama.
2. Kurangi mutation berulang lewat owner runtime existing. Pertahankan validasi, cancellation, persist-before-side-effect dan result durability; jangan sekadar melepas await.
3. Buat proyeksi status/chat ringan dan hindari menunggu detail evidence untuk menampilkan final persisted.
4. Cocokkan jalur percakapan, effort dan konteks dengan kebutuhan. Pertahankan Memory/Learning/Skill wajib pada tugas yang memerlukannya.
5. Setelah pengukuran ulang, tangani streaming OpenAI-compatible dan independent read-only batching bila masih relevan.

Trace yang dibutuhkan: accepted UI, queue/preflight, recall, provider request sent, first text token, tool dispatch/result/durable result, final text ready, commit dan final rendered. Pisahkan callback lokal dari waktu provider. Bandingkan median/p95 pada model/endpoint/effort/prompt/history/cache/tool/jaringan setara sebelum mengklaim parity desktop.

Claim: shared normalization/persistence merupakan bottleneck lokal penting. Observed: median normalisasi 1.026 ms, mutation berulang, gap tool-body vs step, cache belum resident. Inferred: ini menjelaskan porsi besar gap interaktif. Rival: inference/effort, recall, finalisasi dan UI ikut berkontribusi. Test: contrast fungsi identik dan 5 regression checks lulus. Flip condition: bila aktivasi cache tidak mengurangi fase lokal pada workload sama, phase trace/CPU profile menentukan biaya tersisa. Microbenchmark bukan janji end-to-end.

`performance-optimization`, `performance-oriented-software-engineering` dan `mind-control` diterapkan untuk baseline, contrast terisolasi, fakta/inferensi dan rival explanation. Raka meninjau UI/transport read-only; Main memeriksa mekanisme utama terhadap source/dist. Context Mode dipakai untuk agregasi metadata/hash. Tidak ada audit source OpenClaw/Hermes atau klaim aplikasi Replica.

Probe awal gagal karena package `typescript` hanya menyediakan metadata versi, bukan `transpileModule`; diganti dengan transform Node built-in yang tersedia. Beberapa lookup file/schema dan dua read Memory memakai input yang tidak cocok; diperbaiki setelah membaca schema aktual. Tidak ada mutation yang diulang secara buta. Draft patch dokumentasi pertama gagal validasi context; filesystem diperiksa dan kedua target belum ada sebelum patch diperbaiki.

Tindak lanjut tahap pertama dijabarkan dalam [Respons Interaktif Native revisi 1](../proposals/Respons-Interaktif-Native.md). Tidak ada perbaikan produksi yang diklaim.
