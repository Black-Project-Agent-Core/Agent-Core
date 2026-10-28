# Indeks Capability Agent Core

Status pembacaan katalog 2026-10-25: **43 artifact valid** (36 Replica/Addy, 3 capability khusus termasuk `mind-control`, 1 indeks, 2 Skill operasional existing, dan 1 entri lama `scientific-critical-thinking` yang tersisa setelah pergantian nama karena SkillService tidak memiliki fungsi hapus). Indeks ringkas aktif berukuran **6.896 byte**; full body dan referensi setiap skill hanya dimuat saat terpilih. Bukti import/revisi/digest/search katalog tersedia; keberhasilan penggunaan ilmiah atau manfaat kinerja belum dievaluasi pada task ini.

## Capability khusus aktif dan kandidat improvement terpisah

**Upgrade aktif — `performance-oriented-software-engineering` (2026-10-27; PROMOTED + RESIDENT READBACK):** Kontrak workload/target/batas ukur/guardrail, diagnosis jalur kritis, dan bukti sesuai klaim kini aktif. Detail tooling/host dan hardware acceleration dimuat dari referensi saat relevan. Digest final `sha256:ad530ab0a8350ddb9a82fd2ceedfcc74a4d778e060a9fe9cb90554cf4ae9115a` mencakup 8 file (22.535 byte); entrypoint 7.650 byte, turun 21,5% dari 9.746 byte. Baca resident pada budget respons 8.192 byte benar-benar selesai dalam satu fragmen (`nextOffset=null`, `truncated=false`); kedua referensi juga terbaca pada digest final. Registry proposal `implemented/catalog-active` cocok dengan artefak final. [Proposal selesai dan keputusan pengguna](history-agent-core/performance-oriented-software-engineering-upgrade.md); [bukti](history-agent-core/performance-engineering-skill-promotion-evidence.json). Revisi aktif lama dan perantara tersedia untuk rollback. Manfaat kualitas keputusan dan performa aplikasi belum diukur.

**Status terbaru — mind-control revisi 10 AKTIF (2026-10-27):** seluruh scope A/B/C/D dan target satu fragmen proposal asli selesai. Digest `sha256:4c4649bf58044de3d3ccabd1ed6906afa8cd61612b400d7667a7487c5f19af04`, 16 file/184.747 byte; entrypoint 7.689 byte, respons resident 8.106 byte pada budget 8.192 (`nextOffset=null`). T0/T1/T2, enam field, contoh debugging, tujuh pemeriksaan argumen, 13 referensi/LICENSE dan trigger tetap. Registry `implemented/catalog-active` terikat provenance; revisi 9 tersedia untuk rollback. Benchmark historis baseline/kandidat 3/3 substantif, format 0/3 versus 3/3; regresi kandidat 10 oleh Raka yang dipakai ulang 12/12 substantif dan 3/3 format, bukan eksperimen fresh/kausal. 56 tes scope/Skill lulus; tidak ada klaim manfaat reasoning umum, Native atau latency. [Evaluasi](../runtime/skills/capability-packs/mind-control/evals/report.md), [proposal selesai](history-agent-core/mind-control-upgrade.md), [bukti resident](history-agent-core/mind-control-upgrade-evidence.json).

**Riwayat prioritas #1 — revisi 7 (historis; status terkini revisi 9 di atas).** Salinan adapter dari K-Dense-AI (sebelumnya bernama `scientific-critical-thinking`, diganti nama pada 2026-10-25) sudah diimpor lengkap dan dipromosikan sebagai adapter-revision 7 pada 2026-10-25 (revisi 5 `sha256:1cdde028…` dan revisi 6 `sha256:f841a254…` tersimpan di riwayat untuk rollback; revisi 7 mencatat kepemilikan atas nama Ikbal dan Claude Code, dengan hak cipta K-Dense Inc. tetap dipertahankan untuk bagian turunan upstream): 15 file, yaitu `SKILL.md`, lisensi, `UPSTREAM.json`, dan 12 referensi (8 dari upstream ditambah 4 tambahan Agent Core: `argument_reconstruction.md`, `fallacies_and_form.md`, `evidence_links_and_decisions.md`, `question_map.md`), dengan digest aktif `sha256:d3ad77bd8a5811b36af1b5c65e2bc088bd1adf7b67cf6efd5516595a463f974b` (186.473 byte); digest indeks aktif adalah `sha256:03cafcdfab3beded262c3b2a94d8a6c93c211160b9441b856c255a6f25c2aa4c`. Entri lama `scientific-critical-thinking` (digest `sha256:a7ba93754e8b925de134b2287fc5c2337016d4012954ae118aac2cf0395468b0`, 11 file) masih ada di katalog tetapi tidak lagi dirujuk oleh indeks aktif maupun guidance bersama. Shared Native/external guidance selalu membawa descriptor ringkas dan read request yang terikat digest. Gate aktivasi dinilai sebelum relevansi topik: body aktif dibaca untuk setiap task coding dan setiap task lain yang memerlukan reasoning, judgment, inference, tradeoff, planning, debugging, penilaian bukti, atau penanganan ketidakpastian—termasuk task biasa, standar, kreatif, dan non-sains. Hanya pekerjaan non-coding yang rutin, mekanis, deterministik, dan tidak memerlukan reasoning yang melewati body; kedua belas referensi tetap dimuat selektif. Dokumentasi donor lain tetap opsi kondisional dalam [kajian komposit](research/Scientific-Evidence-Reasoning-Priority-One-Candidate-20261024.md). Aktivasi katalog bukan bukti perbaikan kualitas berpikir yang sudah terukur.

**Riwayat revisi 8, kini rollback target (2026-10-26; paket A+B proposal `mind-control-upgrade` disetujui pengguna, lalu promosi disetujui pada hari yang sama; revisi 7 `sha256:d3ad77bd…` tersimpan di riwayat untuk rollback; handshake baru mengiklankan digest baru tanpa restart; penerapan pada task berikutnya dicatat melalui receipt terpisah):** digest aktif `sha256:9b97e694092fad4aeff92d3405c3ec18788e4f05eed155607df7d2eff6a3a4c0` (16 file, 184.149 byte). Body `SKILL.md` turun dari 21.993 ke 7.785 byte dan terkirim dalam satu fragment `skills(read)` 8.192 byte (`nextOffset=null`, diverifikasi dry-run SkillService); delapan bagian upstream (Overview, When to Use, Appraisal Workflow, Visual Aids, Core Capabilities, Application Guidelines, Remember, Citing) dipindah byte-identik ke referensi ke-13 `references/scientific_appraisal.md`; satu definisi trigger; delapan referensi upstream dan LICENSE tidak berubah. Angka "15 file, 12 referensi, 186.473 byte, digest `sha256:d3ad77bd…`" pada paragraf di atas menggambarkan revisi 7 yang kini historis. Dokumen dampak: [proposal selesai](history-agent-core/Mind-Control-Upgrade-Dampak.md).

**Kandidat terpisah — `autoskill`: HOLD oleh pengguna.** Tetap kandidat pengindeksan/adaptasi di masa depan; tidak diaktifkan atau digabung otomatis dengan prioritas #1. Bukti keputusan tersimpan di Memory kanonis (`6e0ae88e-f568-49ed-8581-19d323988a31`).

Indeks aktif di bawah menunjuk **39 capability** (36 Replica/Addy + 3 khusus), bukan 39 instruksi yang dimuat sekaligus. Dua capability yang sudah lama aktif (`performance-oriented-software-engineering` dan `reverse-engineer-anything`) dipindahkan sumbernya ke `runtime/skills/capability-packs/`; ketiga capability khusus kemudian dipromosikan sebagai revisi aktif dengan bagian `## Triggers` dan `## Non-triggers` yang dapat dibaca parser katalog. Paket baru men-seed indeks ringkas dan ketiga capability khusus ke katalog aktif. `autoskill` tetap kandidat HOLD dan **tidak masuk katalog aktif**. Registrasi proposal Skill historis tetap gagal (`SKILL_PROPOSAL_TASK_IDENTITY_REQUIRED`); impor saat ini memakai jalur direct user-authoring SkillService pada scope permintaan baru, bukan pemalsuan approval proposal.

## Jalur penggunaan wajib

1. Pada setiap task atau perubahan tujuan yang berarti, baca `agent-core-capability-index` (6.896 byte; pembacaan lengkap revisi aktif diverifikasi langsung lewat SkillService pada 2026-10-25 dari offset 0 sampai `nextOffset=null` dengan budget maksimal 8.192 byte per fragmen; verifikasi ulang lewat MCP belum dilakukan), lalu evaluasi gate `mind-control` sebelum relevansi topik.
2. Aktifkan `mind-control` untuk setiap task coding atau task lain yang memerlukan reasoning. Pilih capability lainnya berdasarkan tujuan pada tabel; jangan memuat semua panduan. Periksa digest aktif dengan `skills(action=inspect, name=...)`.
3. Baca skill terpilih melalui `skills(action=read, expectedActiveDigest=..., maxBytes=8192)` sampai `nextOffset=null`; baca referensi hanya pada bagian yang diperlukan.
4. Terapkan langkah yang relevan pada keputusan, tindakan dan verifikasi nyata. Catat `artifactUse` pada Native atau `controller_learning(action=artifact_receipt)` pada controller eksternal. Ketersediaan dan membaca saja bukan penggunaan.
5. Untuk `mind-control`, lewati hanya pekerjaan non-coding yang rutin, mekanis, deterministik, dan tidak membutuhkan reasoning; capability lain boleh dilewati jika tidak terkait. Keterbatasan tool yang benar-benar diperlukan harus dicatat. Aturan pengguna, grant, pembatalan dan batas otoritas tetap berlaku.

Pemeriksaan relevansi semantik adalah kewajiban instruksi. Runtime memeriksa kelengkapan pembacaan dan revisi sebelum menerima klaim applied/adapted; ini tidak membuktikan manfaat atau menjamin kepatuhan host eksternal di luar Agent Core.

## Replica — konteks rekonstruksi aplikasi

| Capability | Tujuan |
|---|---|
| [replica-architect](../runtime/skills/catalog/replica-architect/SKILL.md) | Rancang stack, data dan API clone dari hasil recon. |
| [replica-backend](../runtime/skills/catalog/replica-backend/SKILL.md) | Tambahkan auth, database, pembayaran dan integrasi backend clone. |
| [replica-brand](../runtime/skills/catalog/replica-brand/SKILL.md) | Buat nama, warna, suara dan identitas asli bagi clone. |
| [replica-build](../runtime/skills/catalog/replica-build/SKILL.md) | Bangun ulang layar dan flow clone sebagai potongan fungsional. |
| [replica-deploy](../runtime/skills/catalog/replica-deploy/SKILL.md) | Siapkan deployment clone, domain dan pemeriksaan produksi. |
| [replica-design](../runtime/skills/catalog/replica-design/SKILL.md) | Turunkan token desain dan spesifikasi komponen clone. |
| [replica-diff](../runtime/skills/catalog/replica-diff/SKILL.md) | Bandingkan kelengkapan fitur dan layout clone dengan acuan. |
| [replica-entrepreneur](../runtime/skills/catalog/replica-entrepreneur/SKILL.md) | Riset ulasan publik untuk gap produk dan positioning clone. |
| [replica-launch](../runtime/skills/catalog/replica-launch/SKILL.md) | Siapkan landing page, harga dan listing peluncuran clone. |
| [replica-recon](../runtime/skills/catalog/replica-recon/SKILL.md) | Petakan layar, flow dan fitur aplikasi acuan; app reconstruction/recon. |
| [replica-test](../runtime/skills/catalog/replica-test/SKILL.md) | Uji flow, edge case dan bug clone dengan bukti e2e. |

## Engineering — pilih fase pekerjaan

| Capability | Tujuan |
|---|---|
| [api-and-interface-design](../runtime/skills/catalog/api-and-interface-design/SKILL.md) | Rancang kontrak API, tipe dan batas modul yang stabil. |
| [browser-testing-with-devtools](../runtime/skills/catalog/browser-testing-with-devtools/SKILL.md) | Verifikasi UI di browser nyata: DOM, console, network dan profil. |
| [ci-cd-and-automation](../runtime/skills/catalog/ci-cd-and-automation/SKILL.md) | Rancang pipeline build, tes dan deployment otomatis. |
| [code-review-and-quality](../runtime/skills/catalog/code-review-and-quality/SKILL.md) | Review diff untuk correctness, maintainability dan risiko regresi. |
| [code-simplification](../runtime/skills/catalog/code-simplification/SKILL.md) | Kurangi kompleksitas kode sambil mempertahankan perilaku. |
| [constraint-driven-development](../runtime/skills/catalog/constraint-driven-development/SKILL.md) | Tetapkan standar mutu dan jaga agar pemeriksaan tidak dilemahkan. |
| [context-engineering](../runtime/skills/catalog/context-engineering/SKILL.md) | Susun aturan, indeks dan konteks relevan secara bertingkat. |
| [debugging-and-error-recovery](../runtime/skills/catalog/debugging-and-error-recovery/SKILL.md) | Reproduksi masalah, cari akar penyebab, perbaiki dan verifikasi. |
| [deprecation-and-migration](../runtime/skills/catalog/deprecation-and-migration/SKILL.md) | Rencanakan penggantian API, sistem atau skema dengan transisi aman. |
| [documentation-and-adrs](../runtime/skills/catalog/documentation-and-adrs/SKILL.md) | Catat perilaku, keputusan arsitektur dan bukti verifikasi. |
| [doubt-driven-development](../runtime/skills/catalog/doubt-driven-development/SKILL.md) | Uji asumsi keputusan penting dengan review independen terarah. |
| [frontend-ui-engineering](../runtime/skills/catalog/frontend-ui-engineering/SKILL.md) | Bangun UI responsif, aksesibel dan lengkap state-nya. |
| [git-workflow-and-versioning](../runtime/skills/catalog/git-workflow-and-versioning/SKILL.md) | Kelola branch, konflik, commit dan versi saat operasi Git diperlukan. |
| [idea-refine](../runtime/skills/catalog/idea-refine/SKILL.md) | Kembangkan dan seleksi alternatif dari ide yang masih kasar. |
| [incremental-implementation](../runtime/skills/catalog/incremental-implementation/SKILL.md) | Implementasikan perubahan bertahap dalam potongan kecil. |
| [interview-me](../runtime/skills/catalog/interview-me/SKILL.md) | Gali kebutuhan ketika tujuan/pengguna belum jelas. |
| [observability-and-instrumentation](../runtime/skills/catalog/observability-and-instrumentation/SKILL.md) | Tambahkan log, metrik, tracing dan sinyal kegagalan yang berguna. |
| [performance-optimization](../runtime/skills/catalog/performance-optimization/SKILL.md) | Ukur bottleneck lalu optimalkan frontend, backend atau query. |
| [planning-and-task-breakdown](../runtime/skills/catalog/planning-and-task-breakdown/SKILL.md) | Pecah kebutuhan jelas menjadi langkah yang dapat diverifikasi. |
| [security-and-hardening](../runtime/skills/catalog/security-and-hardening/SKILL.md) | Audit input, auth, dependency dan batas kepercayaan; perkuat kontrol. |
| [shipping-and-launch](../runtime/skills/catalog/shipping-and-launch/SKILL.md) | Periksa kesiapan rilis, rollout, monitoring dan rollback. |
| [source-driven-development](../runtime/skills/catalog/source-driven-development/SKILL.md) | Verifikasi keputusan API/library melalui dokumentasi resmi. |
| [spec-driven-development](../runtime/skills/catalog/spec-driven-development/SKILL.md) | Tulis spesifikasi dan acceptance sebelum perubahan besar. |
| [test-driven-development](../runtime/skills/catalog/test-driven-development/SKILL.md) | Buktikan bug/perilaku dengan tes gagal, lalu perbaikan terfokus. |
| [using-agent-skills](../runtime/skills/catalog/using-agent-skills/SKILL.md) | Pilih workflow engineering dan urutan skill yang relevan. |

## Satu produk, dua registrasi

Agent Core dapat terdaftar dua kali pada satu klien Claude: sebagai server MCP lokal milik pengguna (tool bernama `mcp__agent-core__*`) dan sebagai konektor Claude Desktop (tool bernama `mcp__<uuid>__*`; awalan UUID dapat berbeda per instalasi). Keduanya satu produk, tetapi dua identitas dengan kredensial, `contractSession`, pemilik Memory dan episode Learning masing-masing.

1. Pilih satu bentuk per sesi dan jangan berpindah di tengah task.
2. Lakukan satu jabat tangan `controller_contract` untuk bentuk itu. Jangan memberikan `contractSession` dari satu bentuk ke bentuk lain.
3. Dalam laporan dan pesan ke pengguna sebut produknya "Agent Core" beserta bentuk yang dipakai (lokal atau konektor), bukan awalan nama tool.
4. Kode Agent Core tidak boleh mencocokkan tool lewat awalan klien. Pemeriksaan 2026-10-28 tidak menemukan `mcp__` di `src`; server hanya mengenali nama polos seperti `controller_contract`.

Aturan ini disimpan di sini, bukan di `AGENTS.md`, supaya teks yang selalu dimuat tidak bertambah.

## Sumber dan kompatibilitas

- [Replica](https://github.com/Jakeschincariol/replica-skill), commit `77c9436fb3d18c3d58169efb8caf4fe906b0dc51`, MIT; 11 capability.
- [Addy Agent Skills](https://github.com/addyosmani/agent-skills), commit `aeac41d4d005999432bb7312f7ff06383a91d59d`, MIT; 25 capability.
- Sumber adapter: `runtime/skills/capability-packs`. Setiap paket menyimpan `UPSTREAM.json` dan lisensi; template, helper dan referensi tetap artifact-local.
- Tool khusus Claude/Chrome DevTools dipetakan ke owner Agent Core yang tersedia. Browser memakai OBU latar belakang; profiling/network yang tidak didukung tetap dilaporkan unavailable. Contoh Bash disesuaikan ke PowerShell saat diperlukan.
- Script tidak berjalan karena pemasangan atau routing semata; eksekusi mengikuti task relevan dan otorisasi yang ada. Tidak ada layanan, provider atau memory store kedua.

Bukti pemasangan dan test: [rencana pelaksanaan](plans/2026-10-24-capability-routing-install.md).
