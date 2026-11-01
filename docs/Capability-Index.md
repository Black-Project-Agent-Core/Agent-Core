# Indeks Capability Agent Core

## Permukaan harness dan owner

Inventaris berikut memenuhi Harness2 P5. Otorisasi berasal dari tugas pengguna dan
kontrak aktif; membaca atau memilih capability tidak memberi grant baru.

| Permukaan | Owner dan lokasi existing | Batas perubahan |
| --- | --- | --- |
| System prompt | `src/agent-controller.ts`; bootstrap `src/learning/external-controller.ts` | Perubahan source dalam scope task, dengan verifikasi dan aktivasi build. |
| Guardrails | Auth, grants, path policy, `AGENTS.md` | Pertahankan batas keamanan; keputusan task tidak menghapus autentikasi. |
| Memory | `src/memory`, canonical `runtime/memory` | Mutasi melalui owner Memory, revision/checkpoint; tanpa store paralel. |
| Tool guidance | Schema dan handler `src/mcp` serta capability catalog | Validasi kontrak; build/activation dan refresh discovery bila berubah. |
| Partner/subagents | Native runtime/chat; profil external `subagents/` | Assignment jelas, satu penulis per file; hasil partner diverifikasi Main. |
| Skills | SkillService; `runtime/skills` | Proposal/revisi/aktivasi exact digest melalui lifecycle owner; grant tetap. |
| Scripts | `scripts/` menurut owner build/verify/release existing | Jalankan hanya untuk scope task; script terpasang tidak otomatis dieksekusi. |
| Plugins | Adapter SkillService dan host connector terdaftar | Provenance/lisensi serta scope import diperiksa; instalasi bukan izin eksekusi. |

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

## App replica — konteks rekonstruksi aplikasi

| Capability | Tujuan |
|---|---|
| [app-replica](../runtime/skills/catalog/app-replica/SKILL.md) | Bangun ulang aplikasi acuan sebagai clone milik sendiri: recon, riset ulasan, desain, arsitektur, backend, build, tes, parity, rebrand, peluncuran dan deploy (sebelas stage). |

## Engineering — pilih fase pekerjaan

| Capability | Tujuan |
|---|---|
| [api-and-interface-design](../runtime/skills/catalog/api-and-interface-design/SKILL.md) | Rancang kontrak API, tipe dan batas modul yang stabil. |
| [code-review-and-quality](../runtime/skills/catalog/code-review-and-quality/SKILL.md) | Review diff untuk correctness, maintainability dan risiko regresi; termasuk menyederhanakan kode tanpa mengubah perilaku. |
| [constraint-driven-development](../runtime/skills/catalog/constraint-driven-development/SKILL.md) | Tetapkan standar mutu dan jaga agar pemeriksaan tidak dilemahkan. |
| [context-engineering](../runtime/skills/catalog/context-engineering/SKILL.md) | Susun aturan, indeks dan konteks relevan secara bertingkat. |
| [debugging-and-observability](../runtime/skills/catalog/debugging-and-observability/SKILL.md) | Reproduksi masalah, cari akar penyebab, perbaiki dan verifikasi; tambahkan log, metrik, tracing dan sinyal kegagalan. |
| [delivery-and-release](../runtime/skills/catalog/delivery-and-release/SKILL.md) | Rancang pipeline build, tes dan deployment otomatis; periksa kesiapan rilis, rollout, monitoring dan rollback. |
| [deprecation-and-migration](../runtime/skills/catalog/deprecation-and-migration/SKILL.md) | Rencanakan penggantian API, sistem atau skema dengan transisi aman. |
| [documentation-and-adrs](../runtime/skills/catalog/documentation-and-adrs/SKILL.md) | Catat perilaku, keputusan arsitektur dan bukti verifikasi. |
| [doubt-driven-development](../runtime/skills/catalog/doubt-driven-development/SKILL.md) | Uji asumsi keputusan penting dengan review independen terarah. |
| [frontend-and-browser-testing](../runtime/skills/catalog/frontend-and-browser-testing/SKILL.md) | Bangun UI responsif, aksesibel dan lengkap state-nya; verifikasi di browser nyata: DOM, console, network dan profil. |
| [git-workflow-and-versioning](../runtime/skills/catalog/git-workflow-and-versioning/SKILL.md) | Kelola branch, konflik, commit dan versi saat operasi Git diperlukan. |
| [incremental-implementation](../runtime/skills/catalog/incremental-implementation/SKILL.md) | Implementasikan perubahan bertahap dalam potongan kecil. |
| [requirements-and-planning](../runtime/skills/catalog/requirements-and-planning/SKILL.md) | Gali kebutuhan, kembangkan ide kasar, tulis spesifikasi dan acceptance, lalu pecah menjadi tugas yang dapat diverifikasi. |
| [security-and-hardening](../runtime/skills/catalog/security-and-hardening/SKILL.md) | Audit input, auth, dependency dan batas kepercayaan; perkuat kontrol. |
| [source-driven-development](../runtime/skills/catalog/source-driven-development/SKILL.md) | Verifikasi keputusan API/library melalui dokumentasi resmi. |
| [test-driven-development](../runtime/skills/catalog/test-driven-development/SKILL.md) | Buktikan bug/perilaku dengan tes gagal, lalu perbaikan terfokus. |

### Penggabungan 2026-11-01

Sejak 2026-11-01 indeks aktif menunjuk **20 capability** (1 app-replica, 16 engineering, 3 khusus); tabel 2026-10-25 di atas tentang 39 capability adalah riwayat. Dua puluh empat Skill yang isinya bersambung atau sama digabung menjadi lima Skill baru (`app-replica`, `requirements-and-planning`, `delivery-and-release`, `debugging-and-observability`, `frontend-and-browser-testing`) dan tiga Skill yang sudah ada menyerap satu referensi (`code-review-and-quality`, `performance-oriented-software-engineering`, `agent-core-capability-index`). Teks lengkap setiap Skill lama dipertahankan sebagai referensi stage; asal dan pin upstream ada di `references/merged-from.md` tiap pack. Skill lama dipensiunkan lewat `retire` (bukan dihapus) dan dapat dipulihkan dengan `list_retired` lalu `rollback_revision`.

| Skill lama | Rumah baru |
|---|---|
| replica-recon, replica-entrepreneur, replica-design, replica-architect, replica-backend, replica-build, replica-test, replica-diff, replica-brand, replica-launch, replica-deploy | app-replica |
| interview-me, idea-refine, spec-driven-development, planning-and-task-breakdown | requirements-and-planning |
| ci-cd-and-automation, shipping-and-launch | delivery-and-release |
| debugging-and-error-recovery, observability-and-instrumentation | debugging-and-observability |
| frontend-ui-engineering, browser-testing-with-devtools | frontend-and-browser-testing |
| code-simplification | code-review-and-quality |
| performance-optimization | performance-oriented-software-engineering |
| using-agent-skills | agent-core-capability-index |

Nama lama yang masih muncul di teks upstream (checklist bersama, tautan antar-skill) dibaca sebagai Skill tujuan; peta yang sama ada di indeks ringkas.

## Satu produk, dua registrasi

Agent Core dapat terdaftar dua kali pada satu klien Claude: sebagai server MCP lokal milik pengguna (tool bernama `mcp__agent-core__*`) dan sebagai konektor Claude Desktop (tool bernama `mcp__<uuid>__*`; awalan UUID dapat berbeda per instalasi). Keduanya satu produk, tetapi dua identitas dengan kredensial, `contractSession`, pemilik Memory dan episode Learning masing-masing.

1. Pilih satu bentuk per sesi dan jangan berpindah di tengah task.
2. Lakukan satu jabat tangan `controller_contract` untuk bentuk itu. Jangan memberikan `contractSession` dari satu bentuk ke bentuk lain.
3. Dalam laporan dan pesan ke pengguna sebut produknya "Agent Core" beserta bentuk yang dipakai (lokal atau konektor), bukan awalan nama tool.
4. Kode Agent Core tidak boleh mencocokkan tool lewat awalan klien. Pemeriksaan 2026-10-28 tidak menemukan `mcp__` di `src`; server hanya mengenali nama polos seperti `controller_contract`.

Aturan ini disimpan di sini, bukan di `AGENTS.md`, supaya teks yang selalu dimuat tidak bertambah.

## Sumber dan kompatibilitas

- [Replica](https://github.com/Jakeschincariol/replica-skill), commit `77c9436fb3d18c3d58169efb8caf4fe906b0dc51`, MIT; 11 capability, kini stage dalam `app-replica`.
- [Addy Agent Skills](https://github.com/addyosmani/agent-skills), commit `aeac41d4d005999432bb7312f7ff06383a91d59d`, MIT; 25 capability asal, kini 16 pack (dua lainnya masuk sebagai referensi `performance-oriented-software-engineering` dan `agent-core-capability-index`).
- Sumber adapter: `runtime/skills/capability-packs`. Setiap paket menyimpan `UPSTREAM.json` dan lisensi; template, helper dan referensi tetap artifact-local.
- Tool khusus Claude/Chrome DevTools dipetakan ke owner Agent Core yang tersedia. Browser memakai OBU latar belakang; profiling/network yang tidak didukung tetap dilaporkan unavailable. Contoh Bash disesuaikan ke PowerShell saat diperlukan.
- Script tidak berjalan karena pemasangan atau routing semata; eksekusi mengikuti task relevan dan otorisasi yang ada. Tidak ada layanan, provider atau memory store kedua.

Bukti pemasangan dan test: [rencana pelaksanaan](plans/2026-10-24-capability-routing-install.md).
