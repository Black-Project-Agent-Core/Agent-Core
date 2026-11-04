# Goals penyelesaian backlog Agent Core

Status: **IN_PROGRESS — G0 ledger dibuat; G1 sedang dikerjakan.**
Tanggal awal: 2026-11-04. Baseline source: `b5b5ccd`, branch kerja `fix/agent-core-tool-latency-and-ui-cards`.

## Tujuan dan otorisasi

Permintaan pengguna setelah audit: "ok, sekarang kerjakan yang paling di rekomendasikan, dan selesaikan semuanya secara bertahap, buat goalsnya". Kerjakan rekomendasi sempit per proposal, bukan seluruh opsi alternatif. Implementasi, tes dan verifikasi dikerjakan controller ini; **tidak memulai tugas atau percakapan Native** tanpa permintaan eksplisit untuk task tersebut. Izin tetap build/promosi/restart Agent Core berlaku setelah fase stabil. Tidak ada izin baru untuk push, tag, publikasi, benchmark, rahasia, atau pemalsuan origin operator.

Ledger ini satu dokumen kendali pekerjaan, bukan store/registry/engine goal baru. Sumber program tetap `src/`, tooling `scripts/`, Skill melalui owner source/lifecycle existing, dan keputusan/qualification kanonik tetap milik Learning/SkillService.

## Status yang digunakan

- `PENDING`: belum dimulai.
- `IN_PROGRESS`: sedang dikerjakan.
- `VERIFIED`: acceptance scope tersebut dibuktikan; cantumkan bukti dan batasnya.
- `WAITING_OPERATOR`: hanya bagian yang benar-benar membutuhkan tindakan/otoritas operator; bukan alasan menahan goal independen.
- `DEFERRED_EXISTING`: scope opsional atau HOLD lama yang tidak dibuka kembali.
- `CLOSED_BY_DECISION`: keputusan penutupan eksplisit dipertahankan, bukan klaim tes lulus.

## Master goals

| ID | Goal dan hasil | Status | Acceptance |
|---|---|---|---|
| G0 | Satu inventaris aktif: 13 proposal, tiga pekerjaan teknis, delapan record qualification serta residual plan lama | VERIFIED | Owner/scope/status/bukti dan dependensi tercatat tanpa menghitung mirror atau `study` dua kali; indeks menunjuk ledger ini |
| G1 | Budget manifest MCP, dua target timeout, gerbang release-compat | IN_PROGRESS | Surface/validasi utuh; budget tetap 131072 byte/32768 token; cohort benar; target terarah, build dan gerbang rilis lulus |
| G2 | Residual correctness biaya/replay dan Dreaming P1 | PENDING | Residual dihitung/ditangani tanpa memaksa oracle cocok; guard-retry/p90-nol dan kebijakan forgotten/digest diuji pada fixture; batas live/provider eksplisit |
| G3 | Anggaran Kerja W1+W2 | PENDING | Counter opsional tidak mengubah hasil; bookkeeping lebih sedikit menurut hitungan fixture, state/episode/receipt dan checkpoint DTC tetap benar pada sukses/error/batal |
| G4 | Contoh Berangka P1; Pembagian Kerja V1; Kreativitas V1 bila baseline belum cukup | PENDING | Contoh dihitung ulang; batas ukuran dijaga; no-op menang bila cukup; perubahan Skill memakai lifecycle dan digest aktual |
| G5 | Batas Sistem/Horizon V1 pada Decision evidence | PENDING | Konteks/prediksi existing terlihat, binding/redaksi/escaping/budget utuh; tidak ada schema/store/otoritas baru |
| G6 | Acceptance implementasi aktif dan qualification Skill | PENDING | Bukti relevan ditutup per scope; trial Native, operator-private UI dan Memory-provider yang belum diizinkan tidak dipalsukan |
| G7 | Rekonsiliasi source/build/Platform, dokumen, registry dan riwayat | PENDING | Tiap perubahan punya commit; aktivasi diverifikasi bila diperlukan; tidak ada OPEN usang/mismatch akibat tugas; gate operator/HOLD/closed dipisah |

Urutan: **G0 → G1 → G2 → G3 → G4 → G5 → G6 → G7**. Bila satu acceptance membutuhkan operator, catat gate-nya dan teruskan goal independen. Perubahan yang menyentuh owner/berkas sama tidak dikerjakan oleh penulis paralel.

## Pemetaan proposal — 13 unik

Status dokumen saat audit tidak otomatis merupakan keputusan registry atau bukti resident terbaru.

| Proposal | Scope yang dikerjakan / batas | Goal |
|---|---|---|
| [Anggaran Kerja Giliran Native](../proposals/Anggaran-Kerja-Giliran-Native.md) | Rekomendasi rev1 W1+W2; bukan W3a/W3b/W4 | G3 |
| [Batas Sistem dan Horizon](../proposals/Batas-Sistem-dan-Horizon-Keputusan.md) | V1 projector/tipe/render existing | G5 |
| [Contoh Berangka dan Eval Skill](../proposals/Contoh-Berangka-dan-Eval-Skill.md) | Rev2 P1 saja; P2/P3 tetap ditahan | G4 |
| [Pembagian Kerja Manusia dan AI](../proposals/Pembagian-Kerja-Manusia-dan-AI.md) | V1 satu contoh <=1500 byte pada panduan existing | G4 |
| [Penilaian Kreativitas](../proposals/Penilaian-Kreativitas-Berbasis-Konteks.md) | V1 baseline/no-op dahulu, owner rubrik terkini | G4 |
| [Penglihatan Native](../proposals/Penglihatan-Native-Agent-Core.md) | Anthropic/V5/saklar sudah ada; acceptance terpisah, non-Anthropic ditunda sampai ada konsumen yang sesuai | G6 |
| [Biaya Efektif dan Replay](../proposals/Biaya-Efektif-dan-Replay-Tugas-Macet-Native.md) | Empat residual V1/V2; V3 CLOSED, V4 di luar scope | G2 |
| [Dreaming Berbantuan Model](../proposals/Dreaming-Berbantuan-Model.md) | P1 correctness dan status artifact; opt-in/provider/live gate terpisah; P2 belum dipilih | G2/G6 |
| [Profil Agen dan Otomasi](../proposals/Profil-Agen-dan-Otomasi-Terarah.md) | P1/P2 source/build ada; operator-private UI/REM/cleanup terikat acceptance; P3 HOLD | G6 |
| [Batas Iterasi dan Goal Mode](../proposals/Batas-Iterasi-dan-Goal-Mode-Native.md) | A+B+C aktif; acceptance Continue/iterasi tidak dianggap selesai dari keberadaan kode | G6 |
| [Perkuatan Recall Kompaksi](../proposals/Perkuatan-Recall-Kompaksi-Native.md) | P1/P2 aktif; acceptance compaction_source; P3 tetap ditunda | G6 |
| [Respons Interaktif](../proposals/Respons-Interaktif-Native.md) | Cache tahap 1 aktif; bukti resident/end-to-end dipisah dari hitungan deterministik W1/W2 | G3/G6 |
| [Skill study](../proposals/skills/agent-core/study.md) | Approved/catalog-active; qualification terpisah, tidak dipasang ulang | G6 |

## Qualification Skill dan residual lama

Delapan record yang diamati memiliki `artifactStatus=catalog-active`, `qualification=awaiting-verification`: `agent-core-runtime-activation-audit`, `performance-oriented-software-engineering-upgrade`, `mind-control-upgrade`, `security-change-review`, `incident-postmortem`, `windows-powershell-host`, `skill-authoring`, `study`. Cocokkan exact revision/use/outcome sebelum mengubah qualification; jangan menganggap source/fixture sebagai manfaat model. `study` sudah tercakup pada tabel 13, bukan item ke-14.

Plan Native Conversation Control, Semantic IDE, Memory06–21 dan MRR mengandung wording awal yang sudah disusul implementasi. Game Mode, self-improvement dan REA mempunyai residual acceptance historis. G7 merekonsiliasi setiap scope dengan sumber/bukti terbaru; tidak menutup semua checkbox atau menghidupkan kembali acceptance yang dihentikan pengguna.

## G1 — catatan pelaksanaan dan bukti

### Baseline merah

- 2026-11-04: `vitest run tests/mcp-manifest-contract.test.ts --maxWorkers=1 --reporter=verbose`, percobaan 1. **4 PASS, 1 FAIL**. Cohort optional lengkap 83 tools: **133002 byte > 131072 byte**. Angka ini hasil run baru, bukan 132877 byte dari plan 2 November. Durasi run bukan benchmark dan tidak menjadi kriteria.
- Cohort dasar pada tes mengunci 79; cohort rilis mengaktifkan artifact inspection dan tidak boleh ditolak karena angka cohort dasar. Tidak menaikkan budget dan tidak menghapus tool/field.
- 2026-11-04: baseline `semantic-ide-provisioning` dan `game-mode-advanced`, percobaan 1 per target: **22 PASS, 0 FAIL** pada timeout existing. B2 ditutup untuk baseline sekarang tanpa menaikkan timeout atau mengubah assertion; kegagalan laporan lama tidak direproduksi.
- 2026-11-04: tes baru tanggal dan release-compat, percobaan 1: **3 PASS, 6 FAIL**. Tanggal gagal hanya pada regex wire yang berulang; validasi nilai, optional/nullability, batch dan range tetap lulus. Regresi rilis berhenti sebelum import CLI lama karena helper/entry point import-safe belum ada.
- Perbaikan yang dipilih: metadata regex tanggal saja; `PATH_GUIDANCE` tidak diubah karena generatornya juga memuat panduan mount container yang harus dipertahankan. Pengurangan metadata akan diterima hanya jika budget tetap lulus tanpa perubahan panduan tersebut.
- Review correctness, TypeScript/Zod dan keamanan selesai; tidak ada validator server dihapus. Lima batas tambahan release tooling diberi tes RED sebelum diperbaiki: entry via junction, flag tanpa nilai, baseline Git hilang, optional export berlebih, dan verdict optional cohort.
- GREEN G1: **23/23** pada manifest/date/schema/release dan batasnya; **7/7** regresi kompatibilitas browser terkait (11 tidak dipilih), ditambah **22/22** baseline dua target timeout. Total 52 tes terarah lulus; bukan suite penuh. Target RED→GREEN masing-masing tidak melebihi dua percobaan.
- Inventaris registrasi rilis kini satu owner `MCP_REGISTRATION_FILES`; kedua path partner yatim dibuang dari owner aktif, route regex di-parse tanpa dieksekusi, missing source/baseline/flag dan over-budget optional export gagal sebelum menulis artifact.
- Pemeriksaan sintaks, `git diff --check`, root `tsc --noEmit`, build Source dan self-contained publish launcher sebelumnya exit 0. Build final setelah seluruh koreksi sedang dijalankan; belum mengklaim aktivasi.
- Gate kontinuitas: perubahan metadata discovery mengubah tool-contract digest. Health sebelum aktivasi mencatat 0 running dan 0 resumable chat turn. Tidak ada checkpoint yang dibypass, dibatalkan atau dimigrasikan otomatis.
- G0 di-commit lokal sebagai `b6cff15`; handoff pengguna tetap tidak terlacak dan tidak ikut commit.
- 2026-11-05: build final Source exit 0; self-contained launcher publish dan pemeriksaan helper tanpa shared .NET runtime lulus. Cohort rilis compiled 80 tools: **123182 byte**, `stale=false`, `exceeded=false`; cohort optional penuh compiled 83 tools: **129684 byte**, sisa **1388 byte** dari 131072. Tidak mengubah PATH_GUIDANCE atau panduan mount container.
- Pemeriksaan penuh mengungkap selector `native` yang belum dikenali analyzer. Regresi tambahan **4/4 PASS** setelah RED; 7 kasus kompatibilitas lama tetap PASS pada percobaan kedua. Total kasus unik terarah **56 PASS**; 11 tidak dipilih. Batas dua percobaan per target dipertahankan.
- Full compatibility terhadap ref kanonik `d9f60ade48b6d12ba959c8d0b2351f13d2d49781` melaporkan breaking browser lama (`mode`, `revision`, `sinceRevision`, pilihan action/transport). Ini bukan regresi G1: perbandingan perubahan tugas terhadap HEAD menunjukkan `breakingEvidence=false`, tanpa tool/parameter dihapus atau baru diwajibkan. Retirement OBU sudah tercatat dalam changeset major **yang telah diterapkan pada 1.0.0** dan `docs/Open-Browser-Use.md`. Baseline tidak direset untuk menyembunyikan sinyal; rekonsiliasi metadata baseline dipetakan ke G7. Tidak mengklaim seluruh release gate hijau.
- Ruling pemeriksaan whitespace: CODEBASE tetap CRLF sesuai kontrak proyek; gunakan `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check`, bukan mengubah line ending untuk menyembunyikan peringatan Git.
- Pratinjau promosi Source→Platform lulus: 0 extra item untuk dihapus; perubahan source hanya dua schema tugas dan dua skrip rilis. Runtime, secrets, .env, node_modules, tests dan EXE tidak dimirror oleh skrip. Apply menjalankan preflight segar lagi.
- Checkpoint sebelum promosi: `a392cd31-aa1b-4185-aaf6-881585eeb347`; metadata untuk seluruh **12 path yang diminta** cocok dan tersedia. Checkpoint mewarisi **302 entri** total; itu bukan seluruhnya hasil tugas dan tidak boleh direstore massal. Rollback hanya scope artifact tugas.
- Launcher baru yang dipublish/diverifikasi: 163045589 byte, SHA-256 `fe04078d77815f9528fb87705cf897896054e871f398f226d93c404021fe437b`. Pending lama identik dengan EXE aktif dan tidak memiliki marker aktivasi; tidak ada kandidat berbeda yang ditimpa pada checkpoint ini.

### Checkpoint sebelum compact — 2026-11-05

**Aktivasi G1 BELUM selesai.** Promosi ke Platform sudah exit 0 dan 13/13 hash artifact tugas cocok, tetapi permintaan `restart_agent_core` tidak berhasil menjalankan CMD. Log tepat `runtime/restart/mcp-005f21d5-713a-4f35-9511-1766b12f6099.log` berisi `'F:\Agent' is not recognized as an internal or external command`. Tidak ada restart kedua yang diminta.

Pemeriksaan ulang: health `ok`, versi `1.7.0-dev.1`, **build.stale=true**, 0 running dan 0 resumable chat turns. EXE aktif masih SHA-256 `91ce94384edbc989b36012a0ebbba766066c369dd7830ab31b10c196630bd8eb`; marker pending masih ada untuk kandidat `fe04078d77815f9528fb87705cf897896054e871f398f226d93c404021fe437b`. Health ok bukan bukti build baru sudah dimuat. Verifier host `bn0qu5cuh` tidak memiliki completion record dan outputnya kosong; pemeriksaan proses terakhir tidak menemukan verifier milik task yang masih hidup.

Owner yang harus diperbaiki setelah compact: `src/mcp/restart-tool.ts:27–28` meneruskan satu pasang kutip ke `cmd /d /s /c` dengan `windowsVerbatimArguments=true`; CMD root sendiri sudah mengutip jalur PowerShell/skrip pada baris 4. Buat regresi quoting path-spasi dan perbaiki owner bersama tanpa melemahkan guard satu permintaan per resident. Rebuild/promosikan perbaikan, lalu gunakan jalur CMD resmi yang sudah didokumentasikan untuk bootstrap bila tool hidup masih memegang request lama. Itu hanya boleh sesudah bukti non-eksekusi ini diperiksa, bukan retry buta atau jalur restart baru. Setelah actual restart, periksa receipt baru, hash EXE, health/stale, handshake dan refresh discovery; jangan membuka ChatGPT dari controller Claude.

**Lanjutkan G1 dahulu**, baru G2–G7. Tes target saat ini: manifest=2, date-schema=2, release-compat=2, release-boundaries=2, release-aliases=2, selected release-stable-readiness=2; mcp-schema=1, semantic-provisioning=1, game-mode=1, launcher-package=1. Jangan menjalankan ulang target yang sudah dua percobaan tanpa izin sesuai aturan; target quoting restart belum dijalankan oleh task ini. Build/typecheck/lint bukan percobaan tes. Source commit kode `ca4afa13`, goal ledger awal `b6cff15`; `handoff-agent-core-orchestration.md` untracked milik pengguna tetap dipertahankan. Task key Learning utama: `agent-core-backlog-goals-g0-g1-20261104`; jangan memakai task ID sesi lain.

### Kontrak implementasi G1

1. Pertahankan parser/required/optional/nullability/value semantics semua schema; penghilangan metadata regex tanggal hanya boleh ketika format dan validasi server tetap utuh serta negatif tanggal diuji.
2. Release script harus import-safe; inventory file wajib tidak diam-diam diabaikan, path partner yang yatim dihapus, route dinamis diperbandingkan sebagai pola stabil.
3. `--manifest-only` menilai build/cohort/budget yang benar, bukan magic count dari cohort lain; tes kontrak tetap mengunci surface.
4. Timeout dua file ditangani hanya bila baseline relevan membuktikan kebutuhan; global timeout dan assertion tidak dilonggarkan.
5. Maksimal dua percobaan per target; satu changeset patch untuk perilaku, CODEBASE CRLF, build dan review sebelum commit/aktivasi.

## Batas penerimaan dan penutupan

Trial Native, penulisan profil operator, izin target/perangkat, dan pengiriman Memory nyata ke provider membutuhkan jalur otoritas yang benar. Tugas ini tidak boleh menggunakan origin operator palsu atau membuat hasil verifikasi fiktif. G6 tetap menyebut bukti yang benar-benar tidak ada sebagai OPEN/gate spesifik.

Tidak ada tag, release:apply, benchmark, pembukaan HOLD/CLOSED, pemasangan ulang Skill aktif, atau store/daemon baru. Larangan push pada rencana awal digantikan hanya untuk publikasi branch kerja beserta plan/handoff yang diminta pengguna pada 2026-11-05; bukan izin memublikasikan branch lokal lain. Sisa pekerjaan dan perubahan keputusan ditulis bertanggal pada ledger ini sebelum compact atau handoff.

## Publikasi plan dan handoff lintas mesin — 2026-11-05

Pengguna meminta push source lokal ke GitHub untuk clone pada mesin lain, kemudian secara eksplisit meminta semua plan serta handoff disertakan. Branch `fix/agent-core-tool-latency-and-ui-cards` telah dipush fast-forward hingga `bfaa0f2130dd64ee256df81fb528d3a29306b045`, dengan SHA remote sama dengan HEAD lokal. Publikasi dokumen lanjutan menambahkan [handoff terkini](../../handoff-agent-core-orchestration.md) dan lampiran rencana lengkap di bawah. Status tidak berubah: G0 VERIFIED, G1 IN_PROGRESS karena aktivasi belum selesai, G2–G7 PENDING.

Dua rencana Agent Core yang sebelumnya berada di penyimpanan plan host Claude disertakan utuh sebagai snapshot: rencana induk yang disetujui (`melodic-knitting-shell.md`) serta rencana pendahulu pascapenggabungan Skill (`swift-wibbling-cosmos.md`). Tidak ada dependensi kelanjutan pada lokasi lokal kedua file itu. Rencana konsolidasi donor Skill di proyek lain bukan scope Agent Core ini dan tidak dipublikasikan. Sebanyak 13 plan/spec Agent Core yang sebelumnya diabaikan Git di `docs/superpowers/` dipublikasikan pada path asal dengan [indeks arsip historis](../superpowers/README.md); `.gitignore` hanya membuka Markdown plan/spec dan indeks tersebut, bukan seluruh artifact host. Tidak ditemukan plan/review/backlog tambahan di `.handoff/`; yang ada hanya `config.md`, sudah dilacak Git.

**Prioritas pembacaan:** status dan keputusan terbaru pada bagian utama ledger serta handoff terkini mengalahkan status awal lampiran. Angka baseline, daftar tes yang direncanakan, saran meringkas PATH_GUIDANCE, saran menaikkan timeout, usulan push branch lain, dan tindakan cleanup lama adalah riwayat perencanaan, bukan pekerjaan yang otomatis harus diulang. Tidak ada reset hitungan tes akibat perpindahan mesin. Semua plan/proposal yang sudah dilacak tetap ikut repository; canonical Memory/Learning, secrets, receipt/log, build output dan Platform tidak ikut Git. Batas bukti host lama dan langkah kelanjutan source/runtime mesin tujuan dijelaskan dalam handoff.


## Lampiran A — Rencana induk G0–G7 yang disetujui (snapshot historis)

Provenance: `melodic-knitting-shell.md`, SHA-256 `f411516ea8cfb36d84e63293b31580a891190e0dccb9377dbf6a4ca8c1e46509`. Teks perencanaan lengkap dipertahankan di bawah; bukan ledger kedua atau instruksi aktif untuk mengulang langkah yang telah selesai/ditolak.

<details>
<summary>Teks lengkap rencana A</summary>

# Goals penyelesaian backlog Agent Core secara bertahap

## Context

Pengguna meminta: **"kerjakan yang paling di rekomendasikan, dan selesaikan semuanya secara bertahap, buat goalsnya"**, setelah audit 13 proposal unik serta plan lanjutan yang belum selesai. Tujuannya menyelesaikan pekerjaan nyata, bukan hanya merapikan label atau menganggap implementasi sebagai acceptance.

Root source: `F:\Agent Core\Agent Core Source`; Platform berjalan: `F:\Agent Core\Agent Core`. Baseline yang sudah diperiksa: branch `fix/agent-core-tool-latency-and-ui-cards`, HEAD `b5b5ccd`; hanya `handoff-agent-core-orchestration.md` yang untracked dan bukan milik tugas ini. Tidak membuat worktree atau mengganti branch secara sembarang. Tugas Cache Countdown sebelumnya sudah selesai dipasang pada commit `6ed97eb` di repo lain dan tidak diulang.

**Urutan rekomendasi:** perbaikan kontrak MCP/gerbang rilis terlebih dahulu, residual correctness, pengurangan bookkeeping yang terukur lewat hitungan deterministik, paket dokumen/Skill kecil, panel bukti, acceptance, lalu rekonsiliasi akhir. Semua goal dipelihara pada satu ledger proyek, bukan sistem goal/runtime/store baru.

## Batas dan cara kerja

- Kerjakan implementasi dan tes sendiri. **Tidak memulai chat, goal, task atau delegasi ke Native Agent Core** tanpa permintaan pengguna yang eksplisit untuk task tersebut. Subagent host hanya untuk analisis/review terarah, bukan pengganti Native.
- Tes maksimal dua percobaan per target; tidak benchmark. Setelah kegagalan kedua, kumpulkan bukti baru dan tahan pengulangan berikutnya sesuai aturan pengguna. Compile/typecheck/lint bukan percobaan tes.
- Jangan menghapus tool/field/validator, menaikkan batas manifest 131.072 byte/32.768 token, melonggarkan grant, mengubah provider/model/effort/key, membaca `.env`/`secrets`, atau membuka area terlindungi.
- Tidak push, tag, publikasi, `release:apply`, benchmark/model-quality cohort, atau pemasangan ulang Skill yang sudah aktif. CLOSED/HOLD yang eksplisit tidak dibuka lagi hanya karena kata "semuanya".
- Source diubah di Source, bukan `dist`/cache sebagai source. Pemilik Skill tetap source pack dan lifecycle SkillService; katalog/revisi/proyeksi kanonik tidak diedit manual.
- Build, promosi Source → Platform, dan restart resmi boleh dikerjakan sesuai izin tetap setelah fase stabil. Gunakan skrip promosi existing dengan pemeriksaan/dry-run, bukan menyalin state runtime privat. Restart sekali dan jangan saat turn Native/tool mutasi berjalan. Inspeksi receipt/health sesudah disconnect, jangan mengulang buta.
- Gate autentikasi operator-private, refresh connector milik pengguna, hak target/perangkat, pengiriman Memory ke provider, dan trial Native nyata tidak dipalsukan. Bila perlu tindakan tersebut, catat `WAITING_OPERATOR` secara spesifik; teruskan goal lain yang tidak bergantung padanya. Tes sintetis tidak disebut acceptance hidup.
- Polyglot dipertimbangkan: TypeScript untuk owner runtime/MCP/Learning, MJS untuk tooling rilis existing, React untuk panel. Tidak ada keuntungan yang membenarkan runtime/IPC baru. Python standard library hanya untuk pemeriksaan data/dokumen terarah bila perlu.

## Goal ledger dan definisi selesai

Pada awal eksekusi, buat satu dokumen aktif `docs/plans/Penyelesaian-Backlog-Agent-Core.md`, rujuk dari indeks plan/proposal, dan simpan goal, scope/revisi, dependensi, status, bukti, commit serta blocker. Gunakan rumah `docs/plans` existing; tidak membuat folder atau registry tandingan. Pertahankan riwayat lama sebagai riwayat. Status: `PENDING`, `IN_PROGRESS`, `VERIFIED`, `WAITING_OPERATOR`, `DEFERRED_EXISTING`, `CLOSED_BY_DECISION`. Hanya `VERIFIED` dihitung selesai secara teknis; HOLD/CLOSED lama tidak disebut fitur yang diluluskan.

| Goal | Hasil yang harus dicapai | Kriteria penutupan |
|---|---|---|
| **G0 — Kendali backlog** | Petakan 13 proposal, tiga pekerjaan teknis, delapan record qualification Skill dan residual plan lama tanpa hitungan ganda | Setiap scope memiliki owner/revisi, status berbasis sumber terbaru dan acceptance; `study` tidak dihitung dua kali; status indeks usang diberi koreksi bertanggal |
| **G1 — Kontrak MCP dan gerbang build/rilis** | Tutup B1 manifest, B2 timeout terarah, C `release-compat` | Surface/validasi utuh; semua cohort yang dimaksud diukur benar; tes terarah hijau, build bersih, `--manifest-only` exit 0 untuk build/cohort valid dan gagal untuk stale/over-budget |
| **G2 — Residual correctness** | Tutup empat residual biaya/replay; selidiki dan tangani residual kode Dreaming P1 yang benar-benar belum selesai | Selisih hitungan dijelaskan tanpa mengubah oracle agar cocok; bobot harga dibedakan dari tagihan; guard-retry/p90-nol ditangani; policy digest/forgotten dan kegagalan assist diuji pada fixture sintetis; status build/aktivasi faktual |
| **G3 — Anggaran kerja W1+W2** | Implementasikan rekomendasi utama Anggaran Kerja Giliran Native rev1 pada owner runtime existing | Counter no-op tanpa mengubah hasil; state/episode/receipt akhir setara; batas mutasi fixture dan checkpoint tetap; sukses/error/batal/DTC tetap benar; kill switch dan rollback existing dipertahankan |
| **G4 — Paket dokumen dan Skill terbatas** | Contoh Berangka rev2 P1; Pembagian Kerja Manusia–AI V1; Kreativitas V1 bila baseline memang kurang | Contoh hitung dijalankan dan benar; tambahan panduan ≤1.500 byte dan fragmen ≤8.192 byte; pemilik rubrik terkini dipakai; baseline/no-op menang bila sudah cukup; revisi yang diperlukan tervalidasi dan dipromosikan lewat lifecycle exact digest |
| **G5 — Panel Decision evidence** | Batas Sistem/Horizon V1: proyeksikan konteks dan prediksi yang sudah ada | Maksimal dua konteks/dua prediksi, binding/redaksi/escaping dan budget 4.096 byte terjaga; record lama tetap terbaca; tidak ada schema/store/otoritas baru; panel tidak menyebut deklarasi sebagai dampak terverifikasi |
| **G6 — Acceptance dan qualification** | Tutup bukti yang masih hilang pada Goal mode, kompaksi, vision, profil/REM, cache respons, Dreaming dan delapan record Skill | Gunakan bukti yang sudah ada dahulu; jalur deterministik/UI yang sah diperiksa sendiri; qualification hanya dinaikkan untuk revisi/use/outcome yang cocok; trial Native/operator/Memory-provider yang belum diizinkan tetap gate spesifik, bukan PASS palsu |
| **G7 — Integrasi dan penutupan** | Source/build/Platform, indeks, CODEBASE, proposal, qualification dan riwayat konsisten | Setiap perubahan tugas di-commit lokal; build/hash/health diperiksa saat aktivasi diperlukan; tidak ada ketergantungan runtime ke tes; tidak ada OPEN usang/mismatch akibat tugas; daftar gate manusia/HOLD/closed dipisah dari pekerjaan selesai |

### Pemetaan scope yang tidak boleh hilang

- Lima usulan baru: Anggaran Kerja **W1+W2** (G3), Batas Sistem **V1** (G5), Contoh Berangka **rev2 P1**, Pembagian Kerja **V1**, Kreativitas **V1 baseline/no-op dahulu** (G4).
- Empat partial: biaya/replay dan Dreaming correctness (G2), vision/profil/REM dan sisa acceptance (G6).
- Tiga implementasi aktif: Goal mode, kompaksi dan respons interaktif (G6), bukan dipasang ulang.
- `study` sudah aktif; qualification dan tujuh record Skill aktif lain (G6), bukan delapan instalasi baru.
- Tetap di luar implementasi sekarang: V3 redirect biaya CLOSED; profil P3 periodic jobs HOLD; Dreaming P2 diary; kompaksi P3 ringkasan model; Contoh Berangka P2/P3; W3a/W3b/W4 recall/prefix yang merupakan paket terpisah; vision non-Anthropic sampai ada konsumen/rute yang sesuai; donor blueprint di luar Agent Core; R4/benchmark lama. Semua tetap terlihat pada ledger dengan alasan, bukan dihapus diam-diam.
- Plan Native Conversation Control, Semantic IDE, Memory06–21, MRR dan REA direkonsiliasi terhadap owner sekarang. Jangan membangun ulang kemampuan yang sudah ada atau menganggap checklist lama sebagai izin baru. Acceptance gameplay/perangkat yang memerlukan target aktual mendapat gate tersendiri.

## G1: langkah implementasi terperinci — dikerjakan pertama

### A. Bekukan baseline dan tes merah yang relevan

1. Periksa ulang Git/diff, runtime/toolchain existing dan file owner; pertahankan berkas handoff pengguna. Jalankan tes sempit kontrak manifest untuk memperoleh ukuran/count aktual, bukan memakai angka audit lama sebagai hasil baru.
2. Periksa ulang dua kegagalan timeout pada target yang sama. Jangan menciptakan RED palsu bila kini tidak gagal. Perubahan timeout hanya pada dua file yang terbukti membutuhkan import/fixture berat, tidak global dan tidak menghapus assertion.
3. Tambahkan regresi paling kecil untuk cacat rilis: import tidak menjalankan CLI, cohort yang berisi artifact-inspection tidak ditolak karena angka usang, file inventory yang wajib benar-benar ada, dan route dinamis tidak hilang dari perbandingan.

### B. Perbaikan kontrak manifest

- File utama: `src/memory/mcp/schemas.ts`, `src/mcp/rdc-schemas.ts`, `src/mcp/rdc-tool-metadata.ts`; periksa seluruh caller/schema tanggal yang terkait sebelum menyentuh helper.
- Reuse Zod/serializer/metadata existing. Ringkas hanya redundansi transport/deskripsi yang sudah setara. Kandidat metadata `pattern: undefined` pada schema ISO boleh dipakai hanya setelah kontrak disepakati: `format: date-time` tetap, seluruh validasi server tetap menolak input invalid, required/optional/nullability/hasil parser tidak berubah. Tes negatif tanggal/offset/invalid input harus mengunci ini.
- Jangan memakai helper `isoInstantSchema` yang ber-transform hanya untuk mengecilkan schema: itu bisa mengubah nilai/parser. Jangan menaikkan budget atau mengurangi tool.
- `tests/mcp-manifest-contract.test.ts` memiliki cohort berbeda: dasar 79, full optional 83. Tool artifact-inspection pada runtime rilis menambah satu di cohort yang berbeda. Label dan cek masing-masing dengan benar; tidak menyamakan semuanya.

### C. Perbaikan `release-compat`

- Owner: `scripts/release/release-compat.mjs`; gunakan kembali `registeredManifest`, `builtManifestBudget`, `toolNames`, `publicRoutes`, `compareMcpContracts` dan baseline owner `release-lib.mjs`.
- Buat entry point import-safe dan ekspor helper yang perlu diuji; `import` tidak boleh menjalankan Git/CLI/build atau menghasilkan side effect.
- Hilangkan path `partner-tools.ts`/`partner-schemas.ts` yang tidak lagi memiliki owner aktif; jangan diam-diam mengabaikan file wajib lain yang hilang saat menentukan freshness.
- Tutup bug `toolCount !== 79` pada jalur budget yang sebenarnya membuat cohort dengan `artifactAuthorization`. **Jangan sekadar mengganti magic number menjadi 80 atau menambahkan konstanta kedua.** Jumlah berasal dari registrasi cohort yang sama; ekspektasi surface/identitas dikunci oleh tes kontrak dan pemeriksaan kompatibilitas existing. Jalur `--manifest-only` menilai ketersediaan, freshness, budget dan opsi baseline yang diminta, bukan menolak cohort valid hanya karena cardinality cohort lain. Tes harus membedakan cohort valid, stale, over-budget dan surface kontrak yang salah.
- Tambahkan ekstraksi route dinamis yang mengikuti bentuk `route.match` aktual di `src/http/app.ts`, memakai label regex/pola stabil tanpa mengeksekusi route atau melonggarkan pemeriksaan removed/breaking route.
- Reuse/perluas tes release yang sudah ada jika sesuai; buat satu tes baru hanya bila belum ada owner untuk regresi tersebut. Jangan menambahkan registry/serializer/tooling rilis paralel.

### D. Gate hijau, dokumentasi, aktivasi dan commit

- Jalankan ulang target terarah maksimal percobaan kedua; kontrak manifest, tanggal, release-compat serta dua target timeout harus memiliki hasil yang dibaca. Jika run gagal kedua, jangan menyembunyikan kegagalannya atau mengulang tanpa izin.
- Jalankan build/typecheck/path/structure sesuai pipeline existing. Ukuran manifest adalah pemeriksaan batas deterministik, bukan benchmark. `release-compat --manifest-only` dijalankan terhadap build baru tanpa `--output` agar tidak membuat snapshot sejarah baru.
- Update bagian terkait `docs/CODEBASE.md` dengan CRLF dipertahankan, ledger goals dan satu changeset patch. Product version mengikuti release-intent owner existing; tidak menjalankan release:apply/tag/publish.
- Review correctness, TS dan keamanan perubahan batas input; perbaiki temuan dalam scope, jangan menambah fitur lain. Tinjau diff penuh dan commit lokal dengan pathspec eksplisit serta attribution yang diwajibkan host.
- Bila perubahan descriptor perlu aktivasi, gunakan Source→Platform promotion existing setelah dry-run dan gate stabil, rebuild/package launcher yang disyaratkan kontrak, restart resmi sekali, handshake baru dan cek health/hash. Refresh connector Claude adalah tindakan pengguna bila tool schema yang terpapar berubah. Jangan membuka ChatGPT.

## Prosedur bagi G2–G7

Selesaikan satu paket/goal pada satu waktu. Sebelum paket berikutnya, baca ulang source/kontrak/revisi aktual, tetapkan acceptance sempit dan rollback, lalu jalankan red→green/review/dokumentasi/commit. Tidak memulai seluruh subsystem sekaligus. Ketika satu acceptance tertahan gate operator, catat bukti dan lanjutkan paket independen; jangan menyatakan seluruh goal verified.

Simpan cakupan lengkap pada ledger agar goal yang belum dikerjakan tidak hilang setelah compact. Gunakan Memory/Learning existing dan outbox Cortex hanya sesuai ketersediaan; tidak menciptakan owner kontinuitas baru. Learning finalization tidak boleh memakai task ID sesi lain atau mengubah hasil pekerjaan teknis yang sudah diverifikasi.

## Verifikasi akhir program

Seluruh scope implementasi yang dipilih memiliki hasil, tes/check yang benar-benar dijalankan, commit dan status aktivasi. Dokumen aktif tidak lagi menunjuk ke riwayat sebagai backlog baru. Record CLOSED/HOLD serta unknown tetap eksplisit. Laporan akhir memisahkan: implementasi selesai, acceptance terverifikasi, gate operator yang benar-benar tersisa, dan scope yang sengaja tetap ditunda. Tidak ada klaim speedup, manfaat model, keputusan pengguna palsu, atau PASS berdasarkan keberadaan artifact saja.

</details>


## Lampiran B — Rencana pendahulu setelah penggabungan Skill (snapshot historis)

Provenance: `swift-wibbling-cosmos.md`, SHA-256 `800999582b46b16ee65f560a8925faea3f913c9b474a378b67867adecf92f3be`. Teks perencanaan lengkap dipertahankan di bawah; bukan ledger kedua atau instruksi aktif untuk mengulang langkah yang telah selesai/ditolak.

<details>
<summary>Teks lengkap rencana B</summary>

# Rencana lanjutan Agent Core — setelah penggabungan Skill (2026-11-02)

## Context

Sesi ini menyelesaikan tiga hal di `E:\Projects\Agent-Core` (branch `docs/restart-agent-core-via-cmd`, commit lokal, belum di-push): perbaikan route `/agent/skills` (`4a60b82`), langkah `retire` pada lifecycle Skill (`adff9d9`), dan penggabungan 24 pack Skill menjadi 5 pack baru + 3 pack yang menyerap satu skill (`7741606`). Agent Core lokal sudah online lagi (`/mcp` berhasil). Rencana ini menutup sisa pekerjaan dan menyiapkan keputusan yang memang milik Anda.

## Fakta terverifikasi (baca-saja, 2026-11-02)

- HEAD `7741606`, tree bersih; branch **tanpa upstream**; **127 commit di depan `origin/main`**, 0 di belakang (jadi push ke `main` = fast-forward, tanpa force).
- Katalog hidup: 28 aktif, `list_retired` = 24 (dikonfirmasi lewat konektor claude.ai setelah restart).
- `E:\n8n` **sudah tidak ada** (Test-Path False) → selesai, dicoret dari daftar.
- `autoMode.environment` di `~/.claude/settings.json` **sudah terisi 24 entri** → selesai, dicoret. (`allow`/`soft_deny` tidak ada; tidak diminta.)
- `runtime/agent-runtime/native-skill-settings.json` tidak ada → tidak ada Skill yang dimatikan untuk Native, jadi tidak ada pengaturan lama yang hilang karena nama berubah. Skill baru otomatis aktif.
- Aturan publikasi (`docs/instructions/git-publication.md`): remote `origin` = `Black-Project-Agent-Core/Agent-Core`; lokal otoritatif; push tidak memberi izin rilis/versi/tag/restart.
- Learning: episode lokal `ext-35ebb46908414ac78db29bb6cad29b20` (route + retire) dan `ext-1dc22d50077749d892cdcefd43ac9260` (penggabungan) **belum punya checkpoint**; yang sudah ada hanya milik identitas konektor (`ext-eb9fec2d…`, status awaiting-verification). Evidence ref Learning hanya menerima awalan `tool: activity: memory: file: grafel: source: verification: user-correction:` (`commit:` dan `episode:` ditolak/dibuang).

## Tahap A — Tutup pekerjaan Skill (tanpa keputusan baru)

1. Handshake bentuk **lokal**: `controller_contract` read → acknowledge (sesi lama mati karena restart), lalu `memory_search` ringan (workspace `Agent-Core`). Satu bentuk per sesi: jangan campur dengan konektor.
2. Muat ulang skema `skills` lewat ToolSearch; pastikan enum memuat `retire` dan `list_retired`.
3. Paritas dengan hasil konektor: `skills(list)` = 28 nama yang sama, `skills(list_retired)` = 24. Baca `agent-core-capability-index` pada digest aktif `sha256:3d9e03d3…` dalam satu fragmen (6.899 byte, `nextOffset=null`).
4. Uji paging referensi besar pada digest aktif: baca `app-replica` `references/kit/parity.py` (8.943 byte) sampai `nextOffset=null`, dan satu referensi `delivery-and-release`. Tujuan: membuktikan file >8.192 byte terkirim utuh lewat `skills(read)`, bukan hanya "terbaca sebagian".
5. Learning (episode lokal): `learning(checkpoint)` untuk kedua episode dengan `idempotencyKey` stabil (`skills-retire-lifecycle-and-agent-skills-route-20261101-complete`, `skills-merge-unified-packs-20261101-local-complete`), `evidenceRefs` berawalan benar (`file:docs/CODEBASE.md`, `source:src/skills/service.ts`, `verification:npm run build exit 0; vitest 5 files 41 passed`), lalu `learning(review)` dengan `checkpointKeys` persis dan kandidat berevidence valid, atau disposition `awaiting-verification` bila bukti kausal belum ada. Learning bersifat fail-soft dan terpisah dari hasil tugas.

Verifikasi A: keluaran `list` dan `list_retired` cocok dengan angka di atas; checkpoint mengembalikan `advanced: true`.

## Tahap B — Perbaiki tes merah yang sudah ada sebelum sesi ini (terbukti identik di HEAD `055a856`)

**B1. Budget manifest MCP** (`tests/mcp-manifest-contract.test.ts`, "keeps the full optional-cohort manifest inside the handshake budget"): 132.877 byte terhadap batas 131.072 (lebih 1.805 byte; 86 byte di antaranya dari skema `retire`).
Diukur baca-saja dari `dist/` (83 tool, 132.877 B, cocok persis). Batas 128 KiB bukan angka tes sembarang: docs menyebutnya "131072-byte host limit" (`docs/Batch13-Hooks-REA-Windows-Implementation-20261015.md:49`) dan dipakai juga oleh `scripts/release/release-compat.mjs`, `scripts/verify/rea-harness-registration.mjs:32`, `scripts/verify/agents-md-audit.mjs:92`. Jadi **jangan menaikkan budget**; kurangi byte tanpa membuang tool, field, validator, atau melemahkan tes.
Sumber boros (tidak ada tool yang dibuang): 14 regex `date-time` ×278 B = 3.892 B (dari `z.iso.datetime()` di `src/memory/mcp/schemas.ts:7,11-13,63,75,88,130,142` dan `src/mcp/rdc-schemas.ts:84`), dan kalimat `PATH_GUIDANCE` (`src/mcp/rdc-tool-metadata.ts:5`) yang dipakai 12 tool serta menyatakan hal yang sama dua kali.
Perubahan yang direkomendasikan (disimulasikan pada manifest hidup oleh agen Explore):
1. **A. Satu `isoInstant = z.iso.datetime().meta({ pattern: undefined })`** dipakai di 9 tempat → hemat 4.046 B (JSON Schema tetap `{"type":"string","format":"date-time"}`; validasi Zod tetap menolak input salah; diuji pada zod 4.4.3).
2. **B. Ringkas `PATH_GUIDANCE`** jadi satu kalimat ("IMPORTANT: Use absolute paths (slash direction is normalized); relative and ~/ paths depend on cwd and may fail.") → hemat 1.452 B.
   Hasil A+B ≈ 127.379 B (headroom ≈ 3,7 KB; token ≈ 31.845 dari 32.768).
3. Tidak dikerjakan: C (hapus baris `Aliases:` dari 26 tool — mengubah cara model memilih tool), D (regex UUID), E (spasi) — opsional bila headroom kurang.
Trade-off yang perlu diketahui: klien tidak lagi melihat regex `pattern` untuk field tanggal, hanya `format: date-time`; server tetap memvalidasi.
TDD: test merah sudah ada (`mcp-manifest-contract` kasus "full optional-cohort"); jalankan, ubah A lalu B, jalankan lagi (maks 2 percobaan). Periksa juga tes Memory MCP yang menguji tanggal (cari `iso`/`date-time` di `tests/memory-*`), dan setelah build panggil `memory_search`/`memory_remember` (butuh restart untuk skema hidup; lihat D4). Tes tidak perlu diubah: tes deskripsi membandingkan teks terdaftar dengan `RDC_TOOL_METADATA`.
Docs: perbarui `docs/CODEBASE.md:63` (butir "known failure" ini) dan tambah changeset. Lima `docs/memory/*-MCP-Manifest-2026101*.json` adalah snapshot sejarah — jangan diubah.

**B2. Dua tes impor lambat** (`tests/semantic-ide-provisioning.test.ts`, `tests/game-mode-advanced.test.ts`): gagal di batas 15 detik (`vitest.config.ts: testTimeout: 15_000`), lulus dengan `--testTimeout=60000`. Penyebabnya mesin lambat saat muat modul berat (sharp, provisioner), bukan logika. Perubahan: satu baris `vi.setConfig({ testTimeout: 60_000 })` di awal masing-masing dari dua file itu. Alternatif ditolak: mengubah `vitest.config.ts` global (menyamarkan tes yang benar-benar menggantung di tempat lain). Catatan: ini bukan benchmark kecepatan; tidak ada pengukuran waktu.

Verifikasi B: tiga file tes dijalankan, maksimal dua percobaan per target (merah → hijau); `npm run build` tetap lulus.

## Tahap C — Gerbang rilis `scripts/release/release-compat.mjs` (temuan F6 laporan maintenance)

Masalah nyata di skrip rilis: `mcpFiles` memuat `src/mcp/partner-tools.ts` (baris 176) dan `schemaFiles` memuat `src/mcp/partner-schemas.ts` (baris 190) yang tidak ada (dibaca sebagai null); regex `publicRoutes()` hanya melihat `route === '...'`, bukan `route.match(/.../)`; `--manifest-only` mengharuskan `toolCount === 79` (baris 209). **Terbukti sekarang** (dijalankan baca-saja): laporan berisi `toolCount: 80`, `bytes: 126375`, `exceeded: false`, tetapi proses keluar dengan **kode 2** hanya karena 80 ≠ 79. Artinya gerbang `release:compat --manifest-only` selalu gagal walau budget aman — cacat nyata, bukan kosmetik. (Cohort-nya `reviewed-registration-without-memory-v2-and-controller-learning`; tes `mcp-manifest-contract` mengunci 79 untuk cohort lain, jadi dua angka itu tidak boleh disamakan begitu saja.)
Langkah: (1) cari tahu tool ke-80 yang didaftarkan builder rilis tetapi tidak oleh `registeredTools()` di tes; (2) tes dulu yang memanggil `builtManifestBudget` dan menegaskan skrip tidak gagal pada cohort yang valid, serta tidak membaca file yang tidak ada; (3) hapus dua path mati; (4) satu sumber untuk jumlah tool (turunkan dari cohort yang sama atau baca dari berkas baseline yang sudah ada, bukan konstanta kedua); (5) sertakan route `route.match`. Dikerjakan setelah B1 (menyentuh area yang sama); tidak ada rilis yang dijalankan.

## Tahap D — Keputusan Anda (tidak dikerjakan sebelum dijawab)

- **D1 Push.** 127 commit lokal belum di GitHub. Rekomendasi: setelah tahap B lulus, push **branch kerja** `docs/restart-agent-core-via-cmd` ke `origin` (membuat branch remote baru, tidak menyentuh `main`); lalu fast-forward `main` bila Anda mau GitHub mengikuti lokal. Tidak ada force push (0 commit di belakang). Hook `respect` akan bertanya sebelum push; ini bukan izin rilis/tag/versi.
- **D2 Temuan inventaris F2–F4** (tidak ada pemicu UI untuk `POST /agent/run`; halaman lama di `pages.tsx` tak terjangkau; aksi launcher `activity-monitor`/`tunnel-details` tanpa pengirim). Rekomendasi: biarkan (aturan skill maintenance: kandidat tidak dihapus), karena tidak ada kerugian fungsi; menyambungkan pemicu UI adalah keputusan produk.
- **D3 Grup duplikat OPEN** (keluarga helper sha256/digest/hash, `ref`, `fail`, builder hasil MCP Memory, `sendJson` di `app.ts` vs `oauth`). Rekomendasi: pass maintenance terpisah hanya untuk keluarga hash bila kesetaraan perilaku bisa dibuktikan; sisanya tetap OPEN (header/penanganan galat berbeda).
- **D4 Rilis, versi, restart.** Changeset `skill-packs-merged.md` sudah ada; `release:apply`, tag, dan versi baru hanya atas perintah Anda. Perubahan skema B1 hanya terlihat oleh klien setelah `npm run build` + `restart_agent_core` (+ `/mcp` untuk bentuk lokal); restart tidak dijalankan di tengah giliran yang masih memakai tool mutasi. Rekomendasi: satu restart di akhir setelah B dan C lulus, dengan persetujuan Anda; tes B1 tidak membutuhkan restart.

## Tahap E — Penutupan tiap perubahan kode

Update bagian terkait di `docs/CODEBASE.md` (CRLF: sisipkan dengan skrip yang mempertahankan `\r`), tambah changeset, hapus `.impeccable/` (root dan `capability-packs`) sebelum `npm run structure:check`, commit lokal dengan pathspec eksplisit (tanpa `git stash -u`), lalu checkpoint + review Learning.

## Yang sengaja tidak dikerjakan

- Mengubah nama Skill lama di teks upstream (`references/upstream-shared/*.md`) — byte-identik lintas pack; tabel alias di indeks sudah menutupinya.
- Menghapus kandidat tak terpakai (aturan maintenance), push, rilis, atau restart tanpa persetujuan.
- Mengubah `SlashMenu.test.tsx` (`replica-test` hanya string fixture).

## Verifikasi akhir

`npm run build` (path:check, structure:check, tsc) → 0; tes: `tests/skill-reference-deltas.test.ts`, `skill-retirement`, `capability-pack-indexing`, `agent-skills-http`, `mind-control-upgrade`, ditambah tiga tes dari tahap B (manifest, dua tes lambat) dan tes baru tahap C; `node scripts/release/release-compat.mjs --manifest-only` → kode keluar 0 dengan `bytes ≤ 131072`; `node scripts/verify/agents-md-audit.mjs` (baca-saja) menampilkan headroom; `git status` bersih; `skills(list)` lokal = 28. Setiap perbaikan kode: tes merah dulu, lalu hijau (maks 2 percobaan per target), tanpa benchmark.

## File yang disentuh (perkiraan)

`tests/semantic-ide-provisioning.test.ts`, `tests/game-mode-advanced.test.ts` (B2); `src/memory/mcp/schemas.ts`, `src/mcp/rdc-schemas.ts`, `src/mcp/rdc-tool-metadata.ts` (B1: satu helper `isoInstant`, satu kalimat `PATH_GUIDANCE`); `scripts/release/release-compat.mjs` + satu tes baru (C); `docs/CODEBASE.md` (butir known failure, baris 63), `.changeset/*.md`. Pola yang dipakai ulang: `builtManifestBudget` (release-compat), `wireManifest`/`registeredTools` (tes manifest), `RDC_TOOL_METADATA`.

</details>
