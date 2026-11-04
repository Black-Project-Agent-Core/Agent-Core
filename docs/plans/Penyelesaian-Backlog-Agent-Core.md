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

### Kontrak implementasi G1

1. Pertahankan parser/required/optional/nullability/value semantics semua schema; penghilangan metadata regex tanggal hanya boleh ketika format dan validasi server tetap utuh serta negatif tanggal diuji.
2. Release script harus import-safe; inventory file wajib tidak diam-diam diabaikan, path partner yang yatim dihapus, route dinamis diperbandingkan sebagai pola stabil.
3. `--manifest-only` menilai build/cohort/budget yang benar, bukan magic count dari cohort lain; tes kontrak tetap mengunci surface.
4. Timeout dua file ditangani hanya bila baseline relevan membuktikan kebutuhan; global timeout dan assertion tidak dilonggarkan.
5. Maksimal dua percobaan per target; satu changeset patch untuk perilaku, CODEBASE CRLF, build dan review sebelum commit/aktivasi.

## Batas penerimaan dan penutupan

Trial Native, penulisan profil operator, izin target/perangkat, dan pengiriman Memory nyata ke provider membutuhkan jalur otoritas yang benar. Tugas ini tidak boleh menggunakan origin operator palsu atau membuat hasil verifikasi fiktif. G6 tetap menyebut bukti yang benar-benar tidak ada sebagai OPEN/gate spesifik.

Tidak ada push, tag, release:apply, benchmark, pembukaan HOLD/CLOSED, pemasangan ulang Skill aktif, atau store/daemon baru. Sisa pekerjaan dan perubahan keputusan ditulis bertanggal pada ledger ini sebelum compact atau handoff.
