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

Tidak ada push, tag, release:apply, benchmark, pembukaan HOLD/CLOSED, pemasangan ulang Skill aktif, atau store/daemon baru. Sisa pekerjaan dan perubahan keputusan ditulis bertanggal pada ledger ini sebelum compact atau handoff.
