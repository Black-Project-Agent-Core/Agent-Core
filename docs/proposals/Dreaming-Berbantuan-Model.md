# Dreaming berbantuan model
Tanggal: 2026-10-31
Revisi: 4
Status: P1 IMPLEMENTED IN SOURCE (disetujui 2026-11-01; belum di-build, belum diaktifkan, default mati); P2 PROPOSED, belum disetujui
Jenis: Improvement
Asal dan bukti: telaah kode OpenClaw dari klon `G:\Projects\Learning\openclaw` (commit `f1c93577085244aa96aa87b53a2df9b59d293bd7`) dan source Agent Core `src/memory/{rem-consolidation,cognitive-maintenance,cognitive-config,service,intelligence,types}.ts`, `src/http/app.ts`, `src/agent-runtime.ts`; tangkapan layar Dreaming Review dari pengguna (2026-10-31). Bukti kode OpenClaw lengkap (dengan `file:baris`, penanda kepastian dan daftar yang belum dibaca) ada di satu tempat: [OpenClaw workspace files dan dreaming, telaah kode](../research/OpenClaw-Workspace-Files-dan-Dreaming-Telaah-Kode-20261031.md).

## Masalah dan tujuan

Pengguna menduga dreaming membutuhkan AI lain di latar belakang, terpisah dari AI utama di chat. Kode OpenClaw membenarkan separuhnya: sweep berjalan dari cron di luar chat, tetapi pemilihan apa yang layak disimpan dilakukan kode deterministik; model dipanggil di dua tempat saja (rencana konsolidasi MEMORY.md dan prosa diari).

REM Agent Core hari ini sepenuhnya deterministik dan ekstraktif: isi digest hanyalah istilah bersama dan kalimat pertama tiap catatan anggota. Tidak ada ringkasan abstraktif, tidak ada diari yang dapat dibaca manusia, dan status siklus terakhir hanya hidup di memori proses (halaman Dreaming Review menampilkan "No REM cycle recorded since this Core started" setelah tiap restart).

Tujuan: menambah dua langkah opsional berbantuan model di atas owner REM yang ada: (P1) teks digest abstraktif yang berpagar, dan (P2) satu entri diari per siklus untuk manusia. Tanpa engine, store, job, atau model kedua; default mati; hasil model tidak pernah naik menjadi fakta terverifikasi.

## Bukti dan ketidakpastian

**Observed — OpenClaw (`extensions/memory-core/src`):**
- Pemicu: cron `agentTurn` terisolasi dengan token system-event (`dreaming-cron.ts:105-130`); hook `before_agent_reply` untuk trigger heartbeat/cron menjawab `handled`, jadi model chat tidak dipanggil (`dreaming.ts:613-656`).
- Fase Light/REM deterministik (`dreaming-phases.ts:884-944,1151-1214`); kandidat Deep dipilih skor berbobot tanpa model (`dreaming.ts:174-183`).
- Model dipanggil via `subagent.complete` untuk konsolidasi: keluaran JSON `added/merged/superseded` yang divalidasi host, teks entri ditulis host, gagal berarti append-only (`dreaming-consolidation.ts:23-32,387-459`); dan untuk prosa diari dengan fallback generik yang tidak membocorkan isi staging (`dreaming-narrative.ts:38-62,96-97,205-280`). Cron sweep mengembalikan hasil sebelum inferensi selesai (`dreaming-narrative.ts:286-319`).

**Observed — Agent Core:**
- `planEpisodicDigests` mengelompokkan catatan episodik per workspace lewat relatedness metadata dan menulis isi ekstraktif (`rem-consolidation.ts:146-242`, isi pada `:204-209`). Validasi commit berjalan di dalam transaksi kanonik "tanpa lock bersarang, I/O atau panggilan model" (`rem-consolidation.ts:108`), dengan CAS revisi sumber (`:109-127`).
- Digest ditulis lewat `commitCognitiveDigest` (`service.ts:1078-1118`): `maskInput` untuk redaksi, `store.transact`, epistemic `hypothesis`/`unverified`, tautan `derived-from`, referensi sumber memuat fingerprint keluaran sehingga edit manusia terdeteksi (`rem-consolidation.ts:54-75`).
- Batas siklus: paling banyak 5 digest per siklus (`cognitive-maintenance.ts:58,224`), interval bawaan 30 menit (`cognitive-config.ts:67`); skip bila fingerprint sumber tidak berubah (`rem-consolidation.ts:223-225`). Status Dreaming hanya agregat tanpa teks (`cognitive-maintenance.ts:292-307`); route `/agent/dreaming` khusus pemilik (`http/app.ts:163-177`).
- "Intelligence" Memory bersifat deterministik (`provider = 'embedding-deterministic'`, `intelligence.ts:77-78`), jadi tidak ada komponen penulis berbasis model yang dapat dipakai ulang di dalam `src/memory`.
- Jalur panggilan model satu kali sudah ada di runtime Native: `AgentRuntime.complete(messages, tools, affinityKey, signal, options)` (`agent-runtime.ts:670-677`); kompaksi konteks memakai `redactSensitiveString` sebagai preseden redaksi (`agent-context-compaction.ts:1-3`).
- `AGENT_CORE_MEMORY_COGNITIVE=all` menyalakan setiap nama di `COGNITIVE_FEATURES` (`cognitive-config.ts:9-19,86-87`). Pengaturan produksi pengguna memakai `all` (catatan Memory/Mem0 2026-10-28; tidak diperiksa ulang dari `.env`).

**Inferred:** langkah model hanya bernilai bila REM benar-benar menghasilkan rencana digest; kualitas ringkasan abstraktif lebih mudah dibaca daripada kumpulan kalimat pertama. **Unknown:** seberapa sering REM menghasilkan rencana pada data nyata (belum ada siklus tercatat sejak restart), kualitas dan biaya aktual, apakah `AgentRuntime.complete` berjalan tanpa sesi/tugas aktif selain affinity key (belum diuji), apakah recall otomatis Native dapat mengecualikan catatan diari, dan nilai enum `EvolutionEvent.source` (`types.ts:40`: `user|controller|deterministic|intelligence|system`) yang pantas untuk aksi berbantuan model.

| Field | Isi |
|---|---|
| Claim | Dua langkah berbantuan model berpagar, default mati, meningkatkan keterbacaan digest dan memberi diari manusia tanpa mengubah jaminan REM. |
| Observed | Lihat daftar di atas. |
| Inferred | Pola OpenClaw (rencana di luar kunci, host menulis, validasi, fallback) cocok dengan CAS REM yang sudah ada. |
| Rival | (a) Tidak berbuat apa-apa: ekstraktif sudah aman. (b) Peringkas deterministik lokal yang lebih baik, tanpa data keluar mesin. Keduanya lebih murah dan lebih privat; kualitas lebih terbatas. |
| Test | Usulan di bagian Acceptance; belum dijalankan. |
| Flip condition | Bila rencana digest nyata hampir tidak pernah muncul, atau pengguna menolak data Memory dikirim ke provider, usulan ini gugur dan opsi (b) dipilih. Keyakinan moderat pada desain, lemah pada manfaat. |

## Mekanisme dan owner existing yang dipakai

| Kebutuhan | Owner existing | Perubahan minimum |
|---|---|---|
| Pemilihan klaster dan fingerprint | `planEpisodicDigests` | Tetap deterministik; teks ekstraktifnya menjadi fallback. |
| Panggilan model satu kali | `AgentRuntime.complete` | Antarmuka sempit `DreamingCompletion` disuntikkan ke engine lewat pola `CognitiveHost` (`cognitive-maintenance.ts:18-29`); `src/memory` tidak mengimpor modul `agent-*`. Tanpa tool (`tools=[]`), batas output dan timeout. |
| Penulisan | `commitCognitiveDigest` | Tidak ada jalur tulis baru. Isi hasil model menggantikan `plan.content` sebelum commit; revalidasi sumber (`sourceChanged`) tetap berlaku. |
| Redaksi dan keamanan | `maskInput`, `scanMemorySafety`, `redactSensitiveString` | Redaksi sebelum teks dikirim; `scanMemorySafety` pada keluaran. |
| Status | `dreamingStatus` | Tambah hitungan agregat (dipanggil, diterima, ditolak, fallback); tanpa teks. |

**P1 — digest abstraktif.** Setelah rencana deterministik dibuat, untuk rencana yang akan dibuat atau diperbarui (bukan yang fingerprint-nya tidak berubah), engine meminta model menulis ulang `content` dari cuplikan anggota yang sama, per workspace, di luar kunci kanonik. Validasi deterministik: panjang maksimum, hanya merujuk id anggota yang ada, lolos `scanMemorySafety`, tidak memuat URL atau perintah baru. Gagal, kosong, timeout, atau ditolak berarti commit teks ekstraktif seperti hari ini. Catatan tetap `hypothesis`/`unverified`, tag `inferred`; peristiwa evolusi diberi detail `assist: model` (usulan: `source: 'system'` bukan nilai enum baru, supaya build lama tetap membaca catatan).

**P2 — diari (bersyarat).** Satu entri prosa singkat per siklus yang menghasilkan digest baru atau berubah; fallback generik tanpa isi memori bila model gagal. Bentuk penyimpanan yang diusulkan: catatan Memory kanonik dengan `retention: archive` (sudah dikecualikan dari kandidat REM, `rem-consolidation.ts:99-100`) dan tag `dream-diary`, ditampilkan di Dreaming Review. Syarat sebelum implementasi: buktikan bahwa recall otomatis Native dapat mengecualikan catatan ini; bila tidak terbukti, P2 tetap HOLD.

**Berkas `DREAMS.md` — belum diputuskan (koreksi Revisi 2).** Revisi 1 menulis bahwa tidak ada `DREAMS.md` "konsisten dengan keputusan 2026-10-31". Itu keliru: keputusan pengguna "Pakai Memory kanonik" (2026-10-31) dijawab untuk `MEMORY.md` dan catatan harian `memory/YYYY-MM-DD.md`, bukan untuk `DREAMS.md`. Fakta kode OpenClaw yang relevan (`extensions/memory-core/src/dreaming-dreams-file.ts`, `dreaming-narrative.ts`, `dreaming.ts`): `DREAMS.md` ditulis oleh kode host (entri diari di antara penanda `<!-- openclaw:dreaming:diary:start/end -->` dan blok terkelola `## Deep Sleep`), bukan oleh model; model hanya mengembalikan prosa lewat `subagent.complete` yang prompt-saja tanpa tool, tanpa transkrip, dengan `systemPrompt` persis `extraSystemPrompt` dari kode. Berkas itu bukan instruksi atau system prompt untuk AI dreaming, tetapi juga bukan keluaran mati: kode membacanya kembali sebagai data kontinuitas. Empat entri diari terakhir dipakai fase Light untuk memprioritaskan kandidat yang belum tercakup diari (`dreaming-phases.ts:82,1078-1082`), dan tiga entri terakhir, dijepit panjangnya, masuk prompt narasi sebagai "Diary continuity context" agar model memilih sudut baru (`dreaming-narrative.ts:64,161-179`; pembaca `dreaming-dreams-file.ts:271-292`). Artinya DREAMS.md berperan sebagai memori kerja diari bagi proses dreaming latar belakang, yang sebagian membenarkan gambaran pengguna. Pada Agent Core fungsi yang sama dapat dipenuhi dengan membaca catatan diari dari Memory. **Keputusan pengguna 2026-10-31: opsi 1, "Hanya Memory"** (dijawab di chat setelah ketiga opsi disodorkan). Tiga opsi yang dipertimbangkan:
1. **Hanya Memory (DIPILIH pengguna, usulan ini mengikutinya):** diari = catatan Memory `archive` + tampilan Dreaming Review; tidak ada berkas baru, tidak ada store kedua.
2. **`DREAMS.md` proyeksi baca-saja:** Core menghasilkan ulang berkas dari catatan diari Memory agar dapat dibaca/diedit di editor teks; berkas itu turunan, bukan sumber kebenaran, tidak pernah disuntik ke prompt, dan suntingan manusia tidak mengalir balik (atau aliran balik dibuat eksplisit di revisi lain).
3. **`DREAMS.md` sebagai store tulis sendiri seperti OpenClaw:** berkas menjadi tempat penyimpanan diari, paralel dengan Memory; melanggar prinsip satu home dan memerlukan keputusan arsitektur terpisah.

**Tidak diusulkan sekarang (P3):** keputusan merge/supersede oleh model seperti di OpenClaw. Agent Core sudah punya `decideContradictions` berbasis aturan; perubahan itu perlu keputusan terpisah.

Polyglot dipertimbangkan: panggilan model adalah I/O ke provider yang sudah ada; Rust/Go/Python tidak memberi keuntungan yang dapat dibuktikan dan menambah IPC serta deployment. Tetap TypeScript.

## Scope, batas Native, risiko dan otorisasi

Scope yang diminta persetujuannya: **P1**, dengan **P2 bersyarat** pada syarat recall di atas. Dokumen ini tidak memberi izin mengubah source, menyalakan flag, membangun, atau me-restart.

- **Saklar terpisah, bukan bagian dari `all`.** Nilai `AGENT_CORE_MEMORY_COGNITIVE=all` sudah dipakai produksi dan akan menyalakan fitur baru apa pun di `COGNITIVE_FEATURES`. Fitur ini wajib memakai opsi sendiri (`rem.modelAssist`: `off` bawaan, `digest`, `digest+diary`) yang tidak ikut dalam `all`; kalau tidak, data Memory akan keluar mesin tanpa opt-in eksplisit.
- **Data keluar mesin.** Teks catatan eligible REM (episodik, bukan pinned, per workspace) dikirim ke rute provider Native yang dipilih (cloud). Operator harus menyetujui ini secara eksplisit; teks diredaksi lebih dulu; log memuat hitungan dan id, bukan isi.
- **Biaya dan kuota.** Batas existing 5 digest per siklus tetap; ditambah batas panggilan model per hari (usulan awal 20) dan batas output (usulan awal 1.024 token). Model tidak dipanggil untuk rencana yang tidak berubah. Tidak ada klaim penghematan atau benchmark.
- **Risiko:** (1) injeksi lewat isi catatan: catatan diperlakukan sebagai data, tanpa tool, keluaran divalidasi; (2) halusinasi menjadi "fakta": tetap `hypothesis`, tautan `derived-from`, recall memperlakukannya sebagai data historis tanpa otoritas instruksi; (3) konkurensi: kunci kanonik tidak dipegang saat model berjalan, CAS saat commit; (4) polusi recall oleh diari; (5) manfaat belum terukur.
- **Batas Native:** berjalan di Core latar belakang, bukan dalam giliran chat; route `/agent/dreaming` tetap khusus pemilik dan menolak origin chat eksternal.

## Manfaat yang diharapkan dan keterbatasan

Harapan: digest yang dapat dibaca dan dipakai ulang lebih mudah daripada daftar kalimat pertama, dan diari yang membuat siklus REM terlihat oleh pengguna. Ini harapan, bukan hasil terukur; kualitas bergantung model, REM ekstraktif sudah aman dan murah, dan manfaat dapat kecil bila catatan episodik sedikit. Atribusi manfaat akan `confounded` bila P1 dan P2 dinilai bersamaan tanpa kontras terpisah.

## Acceptance, evaluasi dan rollback

Tes sempit, paling banyak dua percobaan per target (merah lalu hijau), tanpa benchmark:

| Paket | Correctness setelah approval | Rollback |
|---|---|---|
| P1 | Saklar mati menghasilkan nol panggilan model dan digest identik bit demi bit; model gagal/kosong/timeout/ditolak menghasilkan commit ekstraktif identik; sumber berubah saat model berjalan menghasilkan `sourceChanged` tanpa tulisan; keluaran memuat pola rahasia atau id asing ditolak; batas harian tercapai menghasilkan nol panggilan dengan alasan agregat; status hanya agregat. | Matikan opsi. Digest berbantuan model tetap valid dan `intact` karena fingerprint keluaran dihitung dari catatan yang di-commit; tidak ada migrasi. |
| P2 | Dengan opsi `digest+diary`, siklus tanpa perubahan tidak menulis diari; kegagalan model menulis fallback generik tanpa isi memori; catatan diari tidak menjadi kandidat REM dan tidak muncul di recall otomatis Native (bukti wajib sebelum aktivasi). | Matikan opsi; catatan diari lama dapat dibiarkan atau diarsipkan lewat jalur Memory existing. |

Verifikasi hidup (OPEN): satu siklus REM manual terkendali lewat halaman Dreaming Review setelah build resident, mengikuti bukti UI yang masih OPEN pada Revisi 2 proposal profil.

## Riwayat revisi

- Revisi 1 — 2026-10-31: proposal awal dari telaah kode OpenClaw dan source REM Agent Core.
- Revisi 2 — 2026-10-31: koreksi klaim keliru bahwa pengguna telah memutuskan "tidak ada DREAMS.md"; bagian P2 kini memuat tiga opsi `DREAMS.md` yang belum diputuskan beserta fakta kode OpenClaw tentang siapa yang menulis berkas itu. Status tetap PROPOSED.
- Revisi 3 — 2026-10-31: mencatat keputusan pengguna "DREAMS.md = Hanya Memory" (opsi 1). Scope P1/P2 tidak berubah dan belum disetujui; status tetap PROPOSED.

- Revisi 4 — 2026-11-01: pengguna memilih "Setujui P1 saja" di chat; P1 diimplementasikan di source (lihat bagian terakhir). P2 tidak disetujui dan tidak diimplementasikan.

## Keputusan pengguna dan scope

**Keputusan 2026-11-01 (pengguna, di chat, atas pertanyaan dengan tiga pilihan): APPROVE P1 saja.** P2 (diari) tetap menunggu keputusan terpisah dan syarat recall di atas. Persetujuan ini mencakup perubahan source, tes, dan dokumentasi untuk P1; tidak mencakup build, restart, menyalakan `AGENT_CORE_REM_MODEL_ASSIST`, rilis, atau mengirim data Memory ke provider.

**Realisasi P1 di source (observed; tes tersempit lolos, lihat `CHANGELOG.md` dan `docs/CODEBASE.md`):** saklar terpisah `AGENT_CORE_REM_MODEL_ASSIST=off|digest` (bukan bagian `all`); `src/memory/rem-model-assist.ts` memuat prompt dan validasi; `MemoryCognitiveEngine.setDreamingCompletion` menerima fungsi dari host (`src/index.ts` menyuntikkan `AgentRuntimeService.complete` tanpa tool dan tanpa sesi); batas 20 panggilan per hari UTC dan timeout 30 detik dapat diatur; status hanya agregat. Penyimpangan dari rancangan awal, semuanya lebih ketat atau lebih sederhana: (1) batas output ditegakkan oleh validasi (maks 1.200 karakter), bukan parameter token provider, karena `AgentProviderCompletionOptions` tidak punya parameter itu; (2) anggaran harian ada di memori proses dan reset saat restart; (3) kegagalan model menghasilkan digest ekstraktif untuk generasi sumber itu dan tidak dicoba ulang sampai sumber berubah, sesuai rancangan; (4) rencana yang ekstraknya gagal `scanMemorySafety` (mis. memuat kredensial) tidak pernah dibuat, jadi isinya tidak sampai ke model.

**Terbuka (OPEN):** (a) bug yang sudah ada dan terlihat dari tes merah yang belum di-commit: sumber yang di-*forget* masih masuk digest REM baru; perbaiki sebelum `AGENT_CORE_REM_MODEL_ASSIST` dinyalakan karena teks itu juga akan dikirim ke provider; (b) verifikasi hidup satu siklus REM manual setelah build resident; (c) belum diuji apakah `AgentRuntime.complete` berjalan tanpa tugas aktif di Core yang sedang berjalan, selain lewat fake di tes; (d) manfaat dan biaya belum terukur dan tidak diklaim.

## Keputusan sebelumnya

Keputusan sebagian (2026-10-31, dari pengguna di chat): **DREAMS.md = Hanya Memory**. Tidak ada berkas `DREAMS.md`, proyeksi baca-saja, atau store tulis kedua; diari, bila kelak disetujui, hidup sebagai catatan Memory `archive` dan tampilan Dreaming Review. Keputusan ini tidak menyetujui P1 atau P2: scope P1/P2 masih menunggu APPROVE / REVISE / HOLD / REJECT.
