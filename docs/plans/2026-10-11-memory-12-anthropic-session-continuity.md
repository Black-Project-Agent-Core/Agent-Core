# Memory 12 — Kepatuhan kesinambungan sesi Anthropic Implementation Plan

> **Status saat ini:** Implementasi source dipublikasikan pada `60e504f9bf1c876934146dfa7298f1a270e99a14` (`0.15.0-beta.3`). Hasil dan batasan ada di [ledger fungsional](../verification/memory12-21-source-functional-2026-10-11.md). Windows belum diuji/diaktifkan dan ditunda sampai pengguna kembali. Checklist serta rancangan antarmuka di bawah dipertahankan sebagai bukti perencanaan historis, bukan klaim semua acceptance PASS.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memperketat bootstrap → checkpoint → resume agar controller tidak menganggap state parsial atau bukti lama sebagai kesiapan yang sudah terverifikasi.

**Architecture:** MemoryEpisodes tetap satu-satunya pemilik episode/capsule/checkpoint. Tambahan hanya proyeksi kepatuhan deterministik dari TaskContext dan aturan consumer; bukan jurnal progress atau owner capsule baru.

**Tech Stack:** TypeScript/Node.js, Zod, transaksi Memory existing, Vitest.

**Spec:** [Spesifikasi bersama](2026-10-11-memory-reference-adoption-spec.md).

## Global Constraints
- Status awal saat perencanaan (historis): **Draft / PROPOSED, belum dibangun**. Baseline sumber `957077fab260dd58d0cc7cfc0881172d05f84667`; inspeksi statis bukan bukti runtime resident.
- Node.js `>=24.15.0`, TypeScript, Zod dan Vitest existing; tanpa dependency/provider/database/runtime tambahan.
- Root Memory kanonis Linux tidak tersedia. Jangan membuatnya atau membaca/menyentuh Memory privat Windows; jangan menjalankan rencana ini sebelum persetujuan implementasi.
- Scope host task/workspace, permission, safety, exact source revision dan owner existing tetap wajib. Memory/Learning fail-soft, tidak boleh menjadi gate machine control.
- Tidak ada backup, stash, runtime sementara, reset, clean seluruh working tree, atau penghapusan state. Perubahan lokal di luar scope dipertahankan; konflik overlap dilaporkan.
- Uji fungsional/unit milik rencana ini saja; evaluasi longitudinal dan probe agregat menjadi milik Plan20 LongMemEval / Plan21 MemProbe, bukan suite duplikat.

## Sumber dan delta nyata
- [Anthropic agent.py](https://github.com/anthropics/claude-quickstarts/blob/9ec32b91df50b0d4906cae64b13c6298055ff40d/autonomous-coding/agent.py#L124-L181) dan [coding prompt](https://github.com/anthropics/claude-quickstarts/blob/9ec32b91df50b0d4906cae64b13c6298055ff40d/autonomous-coding/prompts/coding_prompt.md#L6-L82), SHA `9ec32b91df50b0d4906cae64b13c6298055ff40d`.
- Pola yang diambil: orientasi fresh context, smoke evidence, checkpoint/handoff. Tidak meniru pengecekan keberadaan `feature_list.json`, loop retry unlimited, atau flag `passes` sebagai verifier.
- Lisensi root MIT berkonflik dengan keterangan internal-use subdirektori; adopsi konsep saja, jangan menyalin implementasi sebelum klarifikasi.
- Existing: `SubProject/agent-core-memory/src/memory/episodes.ts` sudah punya checkpoint transaksional, validasi sumber dan taskContext freshness; `capsule.ts` menjaga critical items dan budget; `controller-session.ts` menyediakan `getTaskContext`/`checkpoint`.
- Incremental: status kepatuhan yang dibaca controller dan acceptance lifecycle terhadap existing owners. Plan13 memiliki ingestion cursor; rencana ini tidak menambah ingestion.
- Dampak: resume lebih dapat diaudit. Risiko: label kesiapan disalahartikan sebagai keberhasilan tugas, atau disclosure budget berubah. Tidak ada klaim peningkatan performa terukur.

## Review Focus
- Bootstrap terputus: capsule tidak ada berarti perlu checkpoint, bukan tugas baru otomatis (Task1).
- Sumber berubah: freshness stale/unknown wajib mengarahkan revalidasi (Task1).
- Budget terlalu kecil: handle harus memungkinkan expand; tidak menghilangkan critical items diam-diam (Task2).
- Replay/handoff lintas controller: scope sama melanjutkan episode yang sama, task lain ditolak (Task2).
- User stop/completion: status paused/completed tidak memicu auto-continue/retry (Task3).

### Task 1: Proyeksi kepatuhan tanpa owner baru
**Files:** Modify `SubProject/agent-core-memory/src/memory/experience-types.ts`, `SubProject/agent-core-memory/src/memory/controller-session.ts`; Create `SubProject/agent-core-memory/tests/memory-continuity-compliance.test.ts`.
**Interfaces NEW/PROPOSED:** `ContinuityAssessment = {status:'ready'|'checkpoint-required'|'revalidate-required'|'expand-required'; reasons:string[]}`; optional `TaskContext.continuity?: ContinuityAssessment`; helper `assessTaskContinuity(context:TaskContext):ContinuityAssessment` di controller-session. Status ready hanya menyatakan capsule current, bukan completion/verifikasi outcome.
- [ ] Tulis test missing-capsule → checkpoint-required; stale atau unknown → revalidate-required; handle-only → expand-required; full/current/capsule/needsCheckpoint=false → ready. Urutan prioritas: handle-only, stale/unknown, missing/needsCheckpoint, ready.
- [ ] RED: `npm --prefix SubProject/agent-core-memory test -- tests/memory-continuity-compliance.test.ts`; gagal karena interface/helper belum ada.
- [ ] Implementasikan proyeksi di `getTaskContext`; hitung ulang byte budget setelah menambah field. Jangan menulis state pada read atau mengubah checkpoint semantics.
- [ ] GREEN: ulang perintah yang sama; semua assertion PASS dan read tidak mengubah state.

### Task 2: Penerimaan lifecycle existing yang tahan restart
**Files:** Extend `SubProject/agent-core-memory/tests/memory-continuity-compliance.test.ts`; Modify `SubProject/agent-core-memory/src/memory/controller-session.ts` hanya bila adapter terbukti melanggar; existing `episodes.ts`/`capsule.ts` tetap owner.
**Interfaces existing:** `startEpisode(StartEpisodeInput)`, `appendEvent(AppendEventInput)`, `checkpoint(CheckpointInput)`, `getTaskContext({budget?})`; gunakan exact type dari experience-types/disclosure.
- [ ] Tulis fixture start tanpa checkpoint lalu fresh session: goal tetap ada, status checkpoint-required, tidak ada reset. Handoff checkpoint operationId sama harus mengembalikan capsule sama, bukan duplikat.
- [ ] Tambahkan constraint+blocker+next-action kritis, restart dengan scope sah: semua item dan source refs identik. Budget 512 menghasilkan handle/insufficient-budget eksplisit bila mandatory data tak muat, tidak false-ready; task/workspace asing gagal scope.
- [ ] RED: perintah Task1. Implementasikan perbaikan proyeksi minimal bila perlu, bukan menulis ulang serializer atau transaksi yang telah lulus test existing.
- [ ] GREEN: perintah Task1 serta `npm --prefix SubProject/agent-core-memory test -- tests/memory-capsule.test.ts tests/memory-controller-continuation.test.ts tests/memory-capsule-race.test.ts`.

### Task 3: Kontrak consumer dan bukti kepatuhan
**Files:** Modify `AGENTS.md`, `SubProject/agent-core-memory/docs/controller-integration.md`, `src/mcp/memory-experience-tools.ts`, `docs/CODEBASE.md`; Create `tests/memory-continuity-controller-contract.test.ts`.
**Interfaces:** Tidak ada tool/controller baru. Surface existing `memory_v2_read(action='task_context', scope={taskId}, payload={})`; native menggunakan session host existing. Bootstrap Learning existing bukan pemilik TaskCapsule dan tidak digabung sebagai store.
- [ ] Tulis test dispatcher mengembalikan assessment+warnings+exact episodeRef tanpa membuang field; capsule exposure tidak dilabel sebagai delivered/used/verified; paused/completed tidak menghasilkan write/auto-resume.
- [ ] RED: `npm test -- tests/memory-continuity-controller-contract.test.ts`.
- [ ] Perbarui deskripsi/schema-adapter bila diperlukan dan instruksi kedua controller: baca konteks sebelum melanjutkan continuity-sensitive task; revalidate bukti bila stale; checkpoint pada handoff; stop pengguna menang. Tidak ada gate machine-control baru.
- [ ] GREEN: ulang perintah; `npm run build`. Catat kepatuhan observer terpisah dari hasil tugas, bukan klaim model memahami atau mematuhi semua instruksi.

**Penilaian versi implementasi:** patch bila hanya memperjelas proyeksi/kontrak kompatibel; nilai ulang minor bila capability publik baru dijanjikan. Format capsule schemaVersion 1 tidak perlu berubah.

## Kompatibilitas, versi, rollback
- Dokumen ini: **no product-version change**. Saat implementasi, catat release intent, changelog dan `docs/CODEBASE.md` sesuai perubahan nyata; sinkronkan seluruh version surface melalui workflow release existing, jangan mengarang nomor versi stabil.
- Rollback hanya kode/perubahan terlingkup setelah pemeriksaan konflik; pertahankan receipt, evidence dan revisi kanonis. Jangan memundurkan atau menghapus data agar binary lama tampak kompatibel. Format tak didukung harus dilaporkan, bukan di-reset.

## Handoff Windows setelah implementasi disetujui
- [ ] Publisher memberikan repo `https://github.com/Black-Project-Agent-Core/Agent-Core`, branch yang benar-benar dipush, dan **SHA publikasi implementasi penuh 40 karakter**. Nilainya belum ada; baseline bukan SHA implementasi. Jangan fetch nama placeholder atau menyatakan sudah dipasang.
- [ ] Controller penerima memeriksa `git status --short`, remote dan overlap file, lalu `git fetch <remote-terverifikasi> <branch-terverifikasi>` dan `git show <SHA-publikasi-terverifikasi>`. Integrasikan hanya scope yang disepakati; tidak mensyaratkan seluruh tree bersih, tidak stash/backup, selesaikan konflik overlap secara selektif; hentikan hanya perubahan yang benar-benar tidak dapat diselesaikan tanpa kehilangan pekerjaan lokal.
- [ ] Jalankan perintah test pada tiap task dan `npm run build` di checkout Windows kanonis. Jika perubahan/version surface memerlukannya, bangun UI dengan `npm --prefix src/ui run build`; publish launcher melalui `dotnet publish src/launcher/AgentCore.Launcher.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o <root-kanonis-terverifikasi>` hanya setelah lock executable dan jalur pemulihan restart aman diperiksa. Ganti parameter root dengan path nyata yang telah diverifikasi, bukan lokasi subfolder alternatif. Jangan gunakan helper development-build yang membuat output runtime/tmp. Controller penerima memverifikasi lokasi executable aktif lalu memakai prosedur aktivasi kanonis yang diizinkan, tanpa temp-runtime.
- [ ] Pastikan `src`, `SubProject/agent-core-memory/dist`, `dist`, executable `Agent Core.exe`, serta proses resident berasal dari source/build identity yang sama. Gunakan launcher/runtime kanonis, bukan salinan temp; aktivasi Memory existing tidak boleh ditebak atau diubah otomatis.
- [ ] Jalankan skenario fungsional rencana ini melalui controller eksternal dan Native dengan task uji terdaftar, bukti sintetis, dan izin host existing. Pisahkan PASS / FAIL / BLOCKED / NOT RUN; benchmark berat tidak diperlukan.
- [ ] Buat ZIP laporan tersanitasi di direktori laporan permanen di luar temp: identitas sumber/build/proses, log, screenshot relevan, inventaris file berubah, status ledger, manifest setiap file path/size/SHA-256. Verifikasi setelah ekstraksi baru di direktori laporan permanen; tanpa kredensial atau isi Memory privat.

## Checklist review sebelum eksekusi
- [ ] Baca spec bersama; cocokkan signature, ownership, boundary dan acceptance di atas.
- [ ] Konfirmasi setiap test baru benar-benar gagal sebelum implementasi dan PASS sesudahnya; jangan mengklaim hasil dari dokumen ini.
- [ ] Review diff per task dan commit hanya file task ketika implementasi telah diizinkan; publikasi mengikuti otorisasi yang berlaku.
