# Profil agen dan otomasi terarah
Tanggal: 2026-10-31
Revisi: 1
Status: PROPOSED — P1/P2 disetujui dalam goal implementasi 2026-10-31; P3 HOLD
Jenis: Improvement
Asal dan bukti:

- **R1 — repo:** `F:\AI Skill\openclaw`, HEAD `8d83344835ca6f1a1828126ea0a6b3b458836154`, paket `2026.10.9`, MIT. Inventaris Git: 61.683 file, 705.258.972 byte blob; angka ukuran adalah metadata, bukan pengukuran kinerja. Cakupan tercatat tim: **dibaca penuh 56 / dilihat sekilas 99 / tidak dibuka atau belum dinilai 61.528 dari 61.683 file** (56 + 99 + 61.528 = 61.683). Skim mencakup range/grep yang terlihat; output terpotong bukan bukti untuk file yang tidak terlihat. Main membaca penuh 10 dokumen/template, pembaca kedua 47 file, overlap satu TOOLS template; anchor rekomendasi diperiksa kembali oleh main. `docs/concepts/system-prompt.md` hanya skim, berbeda dari `src/agents/system-prompt.ts` yang dibaca penuh pembaca kedua. Urutan: template/dokumen arsitektur, loader/prompt/privasi, lalu migration dan scratch yang menjawab pertanyaan. Tidak menjalankan kode donor; ini audit terarah, bukan klaim seluruh repo telah dipelajari.
- **R2 — dokumentasi resmi daring:** [TOOLS retired](https://docs.openclaw.ai/reference/templates/TOOLS), [HEARTBEAT retired](https://docs.openclaw.ai/reference/templates/HEARTBEAT), [heartbeat migration](https://docs.openclaw.ai/gateway/heartbeat), diperiksa 31 Oktober 2026. Isi relevan dibaca, navigasi situs tidak diaudit; selaras dengan retirement pada snapshot lokal. Rujukan implementasi tetap R1 yang dipin.
- **R3 — artikel:** [Roberto Capodieci, 10 Maret 2026](https://capodieci.medium.com/ai-agents-003-openclaw-workspace-files-explained-soul-md-agents-md-heartbeat-md-and-more-5bdfbee4827a), isi artikel terbaca; primer untuk pendapat penulis, bukan spesifikasi runtime. Menjelaskan model tujuh file lama dan menawarkan produk berbayar; tidak membuktikan retirement maupun penghematan biaya. Klaim teknis proposal memakai R1/R2.
- **R4/R5 — video yang ditautkan pengguna:** [TOOLS, t=468](https://www.youtube.com/watch?v=oN__gKJnPls&t=468) dan [heartbeat, t=382](https://www.youtube.com/watch?v=UTztjR4o7Y8&t=382). Fetch ditahan throttling; isi/transkrip tidak terbaca. Penjelasan pengguna dicatat sebagai klaim yang diuji silang, bukan kutipan video terverifikasi.

## Masalah dan tujuan

Ambil pemisahan kepribadian, identitas, kebijakan, profil pengguna, memori, panduan tool dan pekerjaan berkala tanpa mewajibkan tujuh file bootstrap. Fokus revisi maksud pengguna: pahami retirement TOOLS/HEARTBEAT dan buat rencana transplantasi yang tidak menghidupkan kembali mekanisme usang. Hasil tugas ini hanya dokumen; integrasi membutuhkan keputusan pengguna atas paket/revisi ini.

## Bukti dan ketidakpastian

**Observed — R1:** `docs/reference/templates/{SOUL,IDENTITY,AGENTS,USER,TOOLS,HEARTBEAT}.md` dan `docs/concepts/agent-workspace.md` membedakan peran berkas. Daftar bootstrap runtime `src/agents/workspace-bootstrap-policy.ts:18–37` berisi AGENTS, SOUL, IDENTITY, USER, BOOTSTRAP, MEMORY; tidak TOOLS/HEARTBEAT. Nama TOOLS masih ada di pengurut `system-prompt-context-files.ts:7–15`, tetapi itu tidak membuktikan loader otomatis membacanya. Persona adalah steering; keberadaan file/injeksi bukan jaminan kepatuhan model.

**Retirement TOOLS:** template TOOLS dan `src/commands/doctor-tools-md-migration.ts:266–285` memindahkan catatan lokal ke `AGENTS.md ## Tools`; Skills tetap prosedur pemakaian. Ini konsolidasi owner. Pengurangan token/konflik belum dibuktikan: isi khusus tetap dipindahkan dan migrator justru memperingatkan bila gabungannya melampaui budget (`:366–381`). Jangan menyebut batas karakter sebagai alasan kausal yang sudah dibuktikan.

**Retirement HEARTBEAT:** template HEARTBEAT menyatakan file tidak lagi dibuat/dibaca runtime. `src/cron/default-proactive-job.ts:23–54` membuat ordinary `agentTurn` dengan schedule/delivery sendiri; `scratch-contract.ts:35–41,72–98` membedakan absent, kosong, dan isi serta membatasi byte. Scratch adalah checklist/status per job, **bukan parser jadwal atau scratch global**. `scratch-write.kernel.ts:60–103` memeriksa job/revisi; `store/scratch.worker.ts:16–32` menulis melalui transaksi shared state DB. expectedRevision opsional pada helper/kernel, tetapi model-facing `agents/tools/cron-tool-automation.ts:41–79` mewajibkannya dan mengikat operasi ke invocation aktif. Pertahankan guard itu pada target.

**Koreksi biaya/API:** `docs/gateway/heartbeat.md:220–228` hanya mendukung mekanisme sempit: NO_REPLY tidak membutuhkan extra final-answer request; check awal masih dapat memakai model. `doctor-heartbeat-retirement.ts:207–228` memperingatkan duplicate suppression dan no-route skipping lama dihapus. Maka jumlah panggilan/delivery dapat berbeda, tidak otomatis turun. `auto-reply/heartbeat.ts:12–16` masih memuat prompt `heartbeat_respond` dan fallback, sedangkan `agents/tools/cron-tool-schema.ts:40–42` menyediakan scratch_get/scratch_set/record_result. Audit ini tidak menemukan registration aktif heartbeat_respond pada jalur yang diperiksa; jangan mengandalkannya sebagai API integrasi baru.

**Privasi:** panduan main/private tidak boleh disalin sebagai jaminan seluruh loader. `workspace.ts:957–978` membuang root MEMORY untuk subagent/cron/group/channel; audience tidak diketahui tidak otomatis ditolak. `bootstrap-files.ts:306–363` memeriksa ulang sumber yang dilindungi setelah hooks, bukan melarang semua nested memory. Target harus memakai principal/audience/provenance eksplisit, bukan nama file saja.

**Target observed:** `src/agent-controller.ts:525–548` memuat identitas/kebijakan Native dalam kode, Memory sebagai bukti, file/tool/plugin sebagai data. Jalur salam memakai `DIRECT_ANSWER_PROMPT` (`:656–681`), normal/resume merakit dan memperbarui prompt tersendiri (`:1090–1111`). `src/mcp/agent-protocol.ts:4–22` membaca kontrak root AGENTS untuk eksternal. Root AGENTS 85.540 byte dan MEMORY 236.943 byte sudah ada; head MEMORY berisi catatan implementasi historis. Canonical Memory tetap `src/memory`, state `runtime/memory`, bukan file root baru. Tool inventory/grant milik `src/agent-tool-session.ts:276–293` dan registry existing. `AgentChatService.runTurn` memiliki idempotensi request tetapi membedakan local/external origin (`src/agent-chat-service.ts:509–551`); belum ada origin unattended pada signature ini.

**Overlap/in-flight:** baseline `2100a7f`, tree bersih sebelum studi. Arsip `docs/history-agent-core/Integrasi-Arsitektur-Native-Agent-Core.md:79,130` membahas snapshot OpenClaw lama/turn ownership, bukan profil ini. Studi tool call lama yang ditemukan lewat Cortex dan CODEBASE membahas registry; reuse hasilnya, jangan membuat registry/MCP baru. Catatan resolver Native AGENTS kondisional di CODEBASE tetap historis; usulan ini memberi consumer terbatas, belum membuktikan resolver itu ada. Pencarian bounded pada proposal, history, CODEBASE, Skill sources, canonical Memory dan Cortex tidak memberi bukti implementasi lengkap tujuh peran. Tidak diaudit seluruh repo sebagai klaim ketiadaan. Provider scheduler adalah pemilih provider, bukan scheduler pekerjaan pengguna.

**Inferred:** profil opt-in dan pemisahan scratch/jadwal cocok bagi Native. **Unknown:** dampak perilaku lintas model, biaya API aktual, scheduler target terbaik di deployment lain, serta isi kedua video. Tidak ada klaim manfaat terukur.

| Lensa | Hasil dan pengaruh keputusan |
|---|---|
| Semantic | Tujuh tujuan berbeda; R1 runtime meretire dua nama. Pertahankan tujuan, bukan jumlah file. |
| Procedural | Template → loader → scope → prompt → run/delivery; uji tiap sambungan, bukan sekadar file terbaca. |
| Negative | Merge dapat overflow; audience unknown tidak fail-closed; missing scratch berbeda dari empty; jadwal bukan scratch. |
| Strategy | Pisahkan authoring manusia dari owner execution; reuse Native, Memory dan tool grants. |
| Credibility | R1 sumber primer dipin + MIT; R2 konfirmasi saat ini; R3 historis/komersial; R4/R5 tak terbaca. |
| Freshness | R3 Maret berbeda dari snapshot 2026.10.9; schema numbers docs/package juga drift, jangan disalin. |
| Absence | Tidak ada bukti kausal penghematan total atau compliance model; jangan menjualnya sebagai kepastian. |
| Medium | Audit statis terarah; sebagian file hanya range/grep, video tidak terbaca; tidak ada run donor. |
| Environment fit | Windows/satu operator; existing TS runtime, C# launcher, canonical Memory dan task grants. |
| Cost/reversibility | Tiga file profil kecil opt-in; hindari injeksi 85/236 KB dan tujuh store/loop paralel. |
| Triangulation | R1/R2 setuju retirement; R3 bukan bukti retirement; doc privacy perlu dikoreksi dengan runtime. |
| Transfer | Ambil role separation, snapshot dan revision guard; jangan impor scheduler/DB/tool donor utuh. |
| Intent | Rencana integrasi, tanpa aktivasi; klarifikasi baru menajamkan retirement dan biaya. |
| Free: authority | Teks persona ≠ grant, ingatan ≠ aturan, scratch ≠ jadwal, silence ≠ successful execution. |

**Mind-control:** lima pertanyaan: apa yang diketahui; bukti pendukung/penentang; penjelasan rival; observasi pembeda; apa yang mengubah keputusan. Rekaman T1 berikut mengikuti urutan enam field; tes implementasi masih usulan.

| Field | P1 | P2 | P3 |
|---|---|---|---|
| Claim | Profil terpilih perlu mencapai jalur normal/salam/resume. | Reuse Memory/registry; bukan tujuh store. | Ordinary job opsional; tahan aktivasi. |
| Observed | Dua jalur prompt berbeda pada anchor controller di atas. | Canonical Memory, root historical file, task-granted registry sudah ada. | R1 memisahkan schedule/scratch/result; signature target belum punya unattended origin. |
| Inferred | Resolver opt-in kecil cukup untuk authoring operator. | Projection scoped lebih kecil daripada bootstrap semua file. | Trigger OS menghindari daemon baru pada Windows. |
| Rival | Cukup edit hardcoded prompt jika authoring tidak diperlukan. | Bootstrap tujuh file memberi kemudahan tetapi membuat authority/store ganda. | Tidak membangun proactive system sampai ada check nyata. |
| Test | Proposed: snapshot sama pada tiga jalur, bad path gagal aman. | Proposed: audience ditolak dan fake grant tidak efektif. | Proposed: occurrence/revision/origin/quiet/failure checks pada acceptance. |
| Flip condition | Kebutuhan authoring hilang atau trust tidak bisa diikat; keyakinan moderat, belum di-run. | Consumer ekspor nyata membutuhkan view read-only; keyakinan kuat untuk reuse owner, bukan manfaat. | Tanpa monitor/cadence/auth konkret tetap HOLD; keyakinan moderat pada pemisahan, lemah pada pilihan trigger sampai deployment diuji. |

T2 authority reconstruction: (1) source menunjukkan file bootstrap dan job state adalah input berbeda; (2) kontrak target menempatkan file/Memory sebagai data dan grants pada host; (3) `#aux` operator memang memerlukan authoring profil dan memilih root terpercaya; `#aux` pekerjaan berkala belum mempunyai izin tugas/cadence konkret. Kesimpulan: hanya profil yang dipilih eksplisit boleh menjadi subordinate guidance, Memory tidak naik menjadi aturan, dan P3 tetap off. Keberatan terkuat: persona dapat dipakai untuk menyelundupkan izin atau job menyamar sebagai operator; syarat trust/origin dan acceptance negatif di bawah wajib menggagalkan keduanya. Jika syarat itu tidak terpenuhi, kembali prompt existing tanpa integrasi. Klaim biaya total turun belum terbukti. Jika paket diubah bersama, atribusi manfaat `confounded`.

Support map: P1 didukung Semantic/Procedural/Intent, dibatasi Negative/Authority/Cost; P2 didukung Transfer/Triangulation/Cost, dibatasi privacy/provenance; P3 didukung Procedural/Strategy, dibatasi Environment/Absence/otorisasi. Tidak ada kandidat direkomendasikan hanya dari satu lensa. Value profile R1: donor + metode + caution, kredibilitas tinggi untuk kode snapshot, tertinggi pada Procedural/Negative. R2: confirmation primer; R3: vocabulary/historical caution, rendah untuk runtime kini; R4/R5: belum dapat dinilai. Bukti berikut yang berguna: satu kebutuhan monitor nyata dan correctness receipt target, bukan video pemasaran atau benchmark.

## Mekanisme dan owner existing yang dipakai

| Tujuan asal | Bentuk minimum yang diusulkan di Agent Core |
|---|---|
| SOUL | File opt-in pada direktori profil operator yang dipilih eksplisit; tone/nilai/humor, tunduk kontrak sistem. |
| IDENTITY | File profil terpilih untuk nama/emoji/peran/avatar lokal; metadata tampilan bukan routing ID, permission atau identitas model. TS controller dan C# launcher memakai snapshot sama melalui transport chat existing. |
| AGENTS | Pertahankan kontrak root existing dan receipt eksternal. Native fixed policy tetap owner; tidak menginjeksi semua root AGENTS atau mempromosikan AGENTS repo donor. Catatan environment ringkas di bagian Tools existing setelah disetujui. |
| USER | File profil operator terpilih, preferensi aktif/superseded bertanggal; hanya pemilik terautentikasi. Bukan hasil recall otomatis yang naik menjadi instruksi. |
| MEMORY | Retrieval/projection dari canonical Memory existing; root MEMORY historis tidak dijadikan writer/store kedua. Preferensi operator yang secara eksplisit disahkan masuk USER melalui keputusan terpisah, bukan auto-promotion ingatan. |
| TOOLS | Tidak membuat TOOLS bootstrap baru. Catatan lokal di AGENTS Tools, prosedur di Skills, availability dan grant dari registry live; metadata stale tidak mengizinkan tool. |
| HEARTBEAT | Tidak membuat HEARTBEAT parser/loop. Ordinary job opsional: schedule milik trigger, scratch milik metadata job, hasil milik task/checkpoint/delivery. |

P1 memakai satu resolver kecil di jalur `agent-controller`/`agent-chat-service`, konfigurasi di `src/config.ts`, dan metadata chat existing untuk nama/avatar. Pilih satu root profil yang eksplisit terdaftar; cwd/worktree baru tidak memilih persona. File donor/attachment/hasil tool tetap data. Snapshot memuat digest/revisi, principal, workspace, audience, status read/truncated/absent; per-turn immutable, refresh pada turn baru dan resume, setelah compaction/provider change tetap snapshot turn yang sama. Resume lama tidak diam-diam ditulis ulang: tandai sumber lama dan sisipkan blok current yang terpisah. Salam hanya SOUL/IDENTITY/USER yang eligible, tanpa memanggil tools/Memory/Skills demi sapaan. Eksternal hanya menerima projection bila host mendukung dan dipilih; rencana ini tidak menjamin Codex/controller lain mengikuti persona Native.

Budget usulan awal profil: SOUL 4 KiB, IDENTITY 1 KiB, USER 4 KiB; total 9 KiB UTF-8, ditambah metadata ringkas. Angka ini pilihan target, bukan salinan limit donor atau angka optimal terukur. Tolak file oversized/UTF-8 invalid/unreadable dengan diagnosis dan fallback profil bawaan; jangan memotong aturan diam-diam. Missing optional memakai default tanpa membuat file. Baca safe realpath dalam root yang dipilih, tolak symlink/reparse escape, jangan mengejar path di isi Markdown. Cache bounded berdasarkan principal/root/digest dengan invalidasi edit; jangan membangun service/cache global baru. Tidak ada model tambahan untuk merangkum bootstrap.

P2 memakai Memory retrieval dan tool-list existing, bukan penyalinan root files. Audience unknown, background, shared atau subagent tidak menerima USER/private Memory kecuali scope eksplisit mengizinkan; validasi lagi setelah projection/hook. Jangan mencatat isi privat di event/log/git; simpan digest/status secukupnya. Tidak ada editor/writer profil otomatis pada tahap ini, sehingga tidak ada masalah dua writer atau export bolak-balik.

P3 **terpisah dan off**: reuse `AgentChatService`, runtime task/checkpoint dan cancellation. Windows Task Scheduler merupakan trigger awal yang diusulkan agar tidak membuat scheduler daemon kedua; TS tetap validasi dan dispatch, PowerShell hanya adapter OS, C# hanya UI bila dibutuhkan. Scheduler terpilih harus tunggal. Metadata job minimal di state owner runtime existing: jobId, revision, enabled, scheduleRef/timezone, owner, prompt/scratch, lastRun/request/result; bukan DB Memory baru. Scratch write wajib expectedRevision, commit atomik, deletion tombstone. Request ID stabil per job/occurrence mencegah replay task; bukan jaminan exactly-once efek eksternal. Origin unattended baru wajib dibedakan dari local-operator sebelum dispatch; **jangan memakai token UI untuk menyamar sebagai pesan pengguna**. Model tidak boleh menyetujui proposal/grant sendiri. Tanpa owner/auth/origin yang terbukti, P3 gagal acceptance dan tetap nonaktif.

Polyglot dipertimbangkan: service Rust/Go atau scheduler Python terpisah menambah IPC, deployment dan state tanpa kebutuhan terukur di sini. Gunakan TS existing + adapter Task Scheduler/PowerShell yang tipis, reuse C# launcher. Alternatif lintas OS atau scheduler in-process baru ditinjau bila deployment membutuhkannya; tidak dibangun sekarang.

## Scope, batas Native, risiko dan otorisasi

Rekomendasi **P1 → P2 lebih dahulu; P3 HOLD** sampai pengguna memilih monitor/cadence/output yang konkret. Persetujuan P1/P2 tidak membuat periodic job, mengubah grants, memigrasi root MEMORY, atau mengubah kontrak eksternal. Batas persona tidak pernah menggantikan real access checks, hook, safety, atau instruksi pengguna saat ini. Subagent cukup konteks tugas dan policy yang eligible; profil pribadi tidak diwariskan massal.

| Paket | Perubahan setelah approval | Risiko utama |
|---|---|---|
| P1 | Resolver opt-in, tiga file contoh tanpa data privat, normal/salam/resume + metadata tampilan; flag default off. | Persona tertinggal atau berbeda antarjalur; injeksi dari path tidak terpercaya. |
| P2 | Hubungkan scoped Memory dan live inventory; rapikan satu lokasi catatan Tools dengan review diff. | Kebocoran profil, store/policy ganda, stale tool descriptions. |
| P3 | Satu job eksplisit, trigger OS, unattended origin, revisioned scratch, outcome/delivery policy dan disable. | Efek berulang setelah crash, token/credential scope, delivery bising, timezone/DST, run saat provider gagal. |

P3 wajib fail-closed untuk job invalid/nonaktif, auth/audience tidak diketahui dan scratch missing/unreadable; empty berarti no-op. Ini pilihan target yang lebih ketat daripada donor. Batasi satu run aktif per job, deadline dan retry bounded, jangan mengejar missed ticks dengan burst. Check deterministik memakai tool lokal tanpa LLM bila cukup; model hanya untuk interpretasi yang dibutuhkan. No-change tetap quiet; failure/needs-attention tetap tercatat dan dilaporkan sesuai preferensi. Recurring digest yang diminta tetap mengikuti cadence, bukan ditekan sebagai no-change. Tidak menyalin pengecualian izin unattended dari prompt donor.

## Manfaat yang diharapkan dan keterbatasan

Harapan: identitas/tone konsisten lintas model, policy tidak tercampur profil, konteks awal lebih terarah, serta monitoring dengan owner/jadwal/status yang dapat diaudit. Konsolidasi mengurangi tempat yang harus dirawat; tidak otomatis mengurangi byte/token. Scratch DB tidak menghapus biaya agentTurn. Kepatuhan model dan dampak biaya aktual belum terbukti; tidak direncanakan benchmark. File profil privat harus di luar sumber publik; commit hanya template kosong yang telah ditinjau.

## Acceptance, evaluasi dan rollback

Tugas sekarang: pemeriksaan dokumen, anchor, delapan bagian, revisi/status dan diff; nol tes runtime, build, restart, migrasi atau job. Belum ada acceptance implementasi yang diklaim lulus.

| Paket | Correctness setelah approval | Rollback |
|---|---|---|
| P1 | Input diketahui membuktikan snapshot yang sama mencapai normal/salam; resume/compaction/model switch tidak menduplikasi atau menimpa history. Missing/invalid/oversized/escape ditangani; nama UI sesuai snapshot. Periksa prompt faktual dan satu turn Native terkontrol, tidak hanya jawaban model. | Matikan flag; kembali prompt/tampilan existing, pertahankan file operator dan checkpoint lama. |
| P2 | USER/private Memory tidak masuk unknown/shared/subagent/background; recall tetap data; fake grant dari Markdown ditolak; daftar tool sama dengan grant actual. Digest kontrak eksternal tidak berubah hanya karena edit persona. | Matikan projection; retrieval dan registry existing tetap tersedia, tidak menghapus Memory/operator content. |
| P3 | Satu job contoh yang secara eksplisit diizinkan: occurrence duplikat → satu task, revision stale ditolak, empty/absent tidak run, quiet tidak delivered, error tetap failure, disable bertahan setelah restart, interrupted run tidak mengulang efek tanpa pemeriksaan. Auth/origin unattended tidak bisa menyetujui artifact. | Disable job lalu unregister hanya trigger milik job itu; simpan scratch/receipt, jangan hapus job pengguna lain atau state Memory. |

Maksimal dua invokasi tes per target (merah → hijau), correctness checks sempit sesuai Respect; tidak ada benchmark atau suite luas demi warna hijau. Jadwal/timezone, output/delivery dan izin side effect harus menjadi keputusan konkret P3 sebelum aktivasi. Jika satu prasyarat gagal, catat OPEN dan pertahankan default off.

## Riwayat revisi

- Revisi 1 — studi snapshot 2026.10.9; memasukkan klarifikasi retirement/biaya pengguna. Rencana saja; tidak ada source/config/Skill/AGENTS/profil/job yang diubah atau diaktifkan. CODEBASE/changelog hanya mencatat keberadaan proposal. Revisi dokumen menjadi versi perubahan ini; versi produk tidak dinaikkan untuk proposal dokumentasi.

## Keputusan pengguna dan scope

2026-10-31 — pengguna meminta "buat goals untuk mengerjakan 2 proposal dengan bantuan dari Native Agent Core" dan menyebut kedua path proposal. Scope rekomendasi Revisi 1 dipakai: P1 + P2 profil setelah P1 + P2 REM; P3 tetap HOLD sampai monitor/cadence/output konkret diotorisasi. Relay external-controller tidak dipalsukan sebagai approval operator Native. Implementasi/validasi/aktivasi belum dinyatakan selesai.

Scope implementasi: **P1 + P2, HOLD P3**, Revisi 1. Tugas studi sebelumnya tidak mengintegrasikan apa pun; goal pengguna berikutnya mengerjakan scope ini. Tidak ada periodic job atau profil pribadi yang diaktifkan oleh pencatatan keputusan ini.
