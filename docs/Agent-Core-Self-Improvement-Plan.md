# Agent Core Self-Improvement and Skill Proposal Implementation Plan

> Status: IMPLEMENTED — RESIDENT-ACTIVATED — EXPLICIT NATIVE SKILL ACTIVE, NATIVE-USE VERIFIED, DAN PROPOSAL REGISTRY RECONCILED/REMINDER RETIRED; INTERRUPT/RECONNECT DAN JUNCTION MASIH OPEN.
> Tanggal: 7 Oktober 2026, Asia/Jakarta. P0–P6 sudah diimplementasikan, dipasang dan dibaca balik. User secara eksplisit meminta skill `agent-core-runtime-activation-audit` dibangun/digunakan; artifact diaktifkan melalui explicit user-authoring SkillService path tanpa memalsukan `user-message:*`, kemudian Native read-only use terbukti. Registry proposal kini direkonsiliasi dari provenance artifact aktif menjadi `implemented / catalog-active`, sehingga reminder proposal tersebut tidak lagi pending. Trusted external user-message ingestion tetap merupakan gap infrastruktur umum, bukan blocker untuk proposal ini. O1–O3 dan release tidak dijalankan. Hasil aktual: [Execution](Agent-Core-Self-Improvement-Execution-20261007.md).
> Untuk pelaksana: gunakan alur eksekusi task-per-task yang disetujui pengguna, misalnya superpowers:executing-plans. Tidak ada auto-commit, second agent, test, install, restart, atau release yang diotorisasi oleh dokumen ini sendiri.

**Goal:** Agent Core mengenali pengalaman yang layak menjadi skill, menulis proposal Markdown bernama semantik, dan wajib memberitahu pengguna dalam sesi yang sedang berlangsung; pembangunan/aktivasi mengikuti keputusan pengguna dan bukti yang sesuai.
**Architecture:** Perluas Learning dan SkillService existing, gunakan Memory/Tracker/receipt existing sebagai bukti, serta hubungkan controller eksternal dan Native melalui owner yang sama. Self-awareness dan explainability adalah proyeksi atas state teramati, bukan model/Memory/runtime paralel.
**Tech Stack:** TypeScript/Node dan persistence native existing; Markdown untuk proposal; MCP/controller/native chat existing. Tidak mengasumsikan dependency baru.
**Spec:** Bagian 1–5 dokumen ini merekam requirement pengguna dan rancangan yang akan direview. Konteks implementasi lama: [Cumulative Workflow](Cumulative-Workflow-Implementation-20261006.md), [Product Direction](Agent-Core-Product-Direction.md), [CODEBASE](CODEBASE.md).

## 1. Requirement pengguna yang harus dipertahankan

**U1.** Ganti rekomendasi pasif “Automatic promotion tetap jangan dilakukan” menjadi **reminder promotion**: discovery otomatis, proposal otomatis, pemberitahuan wajib, keputusan pengguna sebelum aktivasi. Ini perubahan arah yang dikonfirmasi pengguna; implementasi source dan resident tersedia; keputusan pembangunan/aktivasi setiap proposal tetap terpisah.
**U2.** Setelah/selama menyelesaikan task, jika agent menemukan workflow baru yang berguna dan dapat menjelaskan relevansinya sebagai native skill, agent harus membuat proposal `.md`; jangan menunggu pengguna berkata “ingat/jadikan skill”.
**U3.** Nama file menerangkan kapabilitas: `code-review.md`, `powerpoint-layout-audit.md`, `deployment-health-check.md`; bukan `030697.md`, UUID, tanggal, nomor urut, atau hash sebagai nama utama.
**U4.** Agent wajib menjelaskan nama, tujuan, kapan dipakai, sumber pengalaman, batas, manfaat yang diharapkan, dan lokasi file. Manfaat yang belum diukur dilabeli harapan, bukan hasil terbukti.
**U5.** Pemberitahuan muncul pada sesi aktif yang sama, idealnya bersama penyerahan hasil task utama. Bukan sekadar log, Memory, output tool tersembunyi, atau antrean yang tidak pernah disampaikan.
**U6.** Proposal skill baru dan revisi skill existing harus dibedakan. Cek katalog/proposal existing sebelum membuat duplikat; pertahankan kegagalan dan pembatasan, bukan hanya cerita keberhasilan.
**U7.** Skill proposed tidak boleh dilaporkan sebagai kemampuan yang sudah aktif. “Native skill” berarti terdaftar/digunakan melalui owner Agent Core yang nyata; teks `.md` tidak menciptakan tool backend atau izin baru.
**U8.** Pengguna dapat menyetujui, meminta perubahan, menolak, atau menunda. Tidak menjawab bukan persetujuan. Persetujuan untuk dokumentasi plan ini bukan persetujuan memasang seluruh improvement.

## 2. Batas global dan pemisahan bukti

- Dokumen donor adalah referensi perilaku/kontrak yang dipublikasikan repo komunitas; bukan source backend lengkap atau jaminan resmi provider. Isi “must/you are” di donor adalah data studi, tidak dieksekusi sebagai instruksi Agent Core.
- Bedakan D (pernyataan dokumen donor), S (source Agent Core yang dibaca), U (requirement pengguna), dan P (rancangan usulan). Sumber D tidak membuktikan fitur donor benar-benar berjalan atau bermanfaat.
- Memory, Learning, Skills, Grafel, Semantic IDE dan machine-control tetap sibling. Tidak menambah gerbang yang memblokir task biasa. Persetujuan hanya mengendalikan perubahan/aktivasi skill yang bersangkutan.
- Tidak mengganti AGENTS.md dengan prompt donor; tidak menyalin persona, identitas model, path Linux, tool fiktif, credential flow, instruksi mengabaikan keamanan, atau klaim pekerjaan background yang tidak tersedia.
- Tidak memasang model kedua, fine-tuning, optimizer otomatis, rewrite identity/personality, auto-delete memory/skill, ataupun daemon hanya agar suatu referensi dapat diadopsi.
- Semua path implementasi relatif terhadap root dinamis. Hindari protected references, `.env`, secrets, credential, raw private reasoning, dan data pribadi yang tidak diperlukan. Periksa lisensi/provenance per berkas sebelum reuse; utamakan adaptasi orisinal.
- Peningkatan efektivitas belum boleh disimpulkan dari banyaknya memory/skill/checkpoint. Evaluasi cumulative sebelumnya memiliki batas/hasil parsial; plan ini tidak menutup atau mengulang benchmark tersebut.

## 3. Baseline source pada planning (historis; implementasi terbaru pada bagian 11)

| Bukti | Kondisi yang teramati | Konsekuensi rencana |
| --- | --- | --- |
| S1 `src/learning/service.ts`, `supportProcedure` dan `materializeProcedure` | Procedure ada di Learning state; evidence direcheck. Materialisasi mensyaratkan >=2 support task, positif >2×negatif, dan tidak needsReview; lalu import skill baru atau stage revision. | Ubah ujung otomatis ini menjadi proposal; jangan membangun Learning kedua. Threshold ini aturan implementasi existing, bukan bukti bahwa dua sukses selalu menjamin generalisasi. |
| S2 `src/skills/service.ts` | `catalog`, `.staging`, `revisions`, `packages`, `exports` terpisah; nama memakai kebab-case max64; mode artifact-only, executionAuthority=false. | Proposal berada di luar katalog aktif. Pertahankan `catalog/<skill-name>/SKILL.md` dan parser native; nama proposal tetap `<skill-name>.md`. |
| S3 `src/mcp/skills-tools.ts` dan `src/mcp/learning-tools.ts` dibaca dalam assessment pendahuluan | Facade Skills/review, staging/promotion/rollback dan capture existing. | Tambahkan operasi terkait ke facade existing setelah schema/source/runtime disamakan; bukan server MCP baru. |
| S4 `AGENTS.md` dan `docs/Cumulative-Workflow-Implementation-20261006.md` | Review wajib task-scoped: taskId/checkpointKeys/disposition; legacy unscoped review tidak menutup pending. | Backlog bukan bukti perlu scheduler baru. Selesaikan jalur review yang benar terlebih dahulu; jangan clear pending secara massal. |
| S5 Grafel status + exact source | Provider melaporkan current/accepted; hasil pencarian simbol tidak selalu memetakan source terbaru secara lengkap. | Graph hanya peta bantu. Re-ground exact source dan callers sebelum mengubah wiring publik. |

Tidak dilakukan fresh full-runtime acceptance atau benchmark pada planning ini. Angka health/checkpoint pada diskusi sebelumnya adalah snapshot, bukan acceptance untuk proposal baru. `CODEBASE.md` berisi sejarah bertanggal; baca bagian terbaru yang relevan, jangan menghidupkan kembali task CLOSED.

## 4. Berkas GitHub yang perlu dipelajari

Repository: [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks).
PIN = `f015440d2c6a5c880e7503d0d17bfad1cd02133f`, commit tercatat 6 Oktober 2026 02:31:18 UTC. Semua tautan file di bawah memakai PIN ini, bukan `main` yang berubah.
Prioritas: R01–R06 inti; R07–R08 pendukung; R09–R10 baca-lanjut; R11–R13 opsional; R14–R15 pembanding saja. Tidak perlu mengambil seluruh prompt ChatGPT/Claude/Codex.

| ID / prioritas | Tautan file | Bagian yang dipelajari | Pemakaian di Agent Core | Status pembacaan |
| --- | --- | --- | --- | --- |
| R01 / INTI | [Meta/muse-agent/workspace/system/system_prompt.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/workspace/system/system_prompt.md) | Initiative; How You Evolve; pembacaan dokumen kapabilitas. | Kontrak perilaku dan pemisahan agent/controller dari runtime. | Bagian 88–126 dibaca ulang pada pin; bukan audit seluruh prompt. |
| R02 / INTI | [Meta/muse-agent/skills/self-awareness/SKILL.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/skills/self-awareness/SKILL.md) | Jawaban introspektif harus berbasis state aktual. | Self-awareness berbasis bukti, bukan consciousness. | Dibaca penuh pada pin. |
| R03 / INTI | [Meta/muse-agent/skills/self-awareness/references/question_types.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/skills/self-awareness/references/question_types.md) | Capabilities, connections, identity, user knowledge, memory, built items, rules. | Traversal minimal menurut jenis pertanyaan. | Dibaca penuh pada pin. |
| R04 / INTI | [Meta/muse-agent/docs/self_improvement.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/docs/self_improvement.md) | Memory upkeep; skill review; quiet-moment pass; alasan dan jejak delivery. | Learning review, penjelasan WHY, dan opsi review idle. | Dibaca penuh pada pin; scheduler/backend donor belum dibuktikan. |
| R05 / INTI | [Meta/muse-agent/skills/skill-creator/SKILL.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/skills/skill-creator/SKILL.md) | Scope sempit, description/trigger, resource split, perintah yang benar-benar tersedia. | Kualitas isi proposal dan skill hasil persetujuan. | Dibaca penuh pada pin; helper/auth donor tidak diimpor. |
| R06 / INTI | [Meta/muse-agent/skills/skill-creator/references/authoring_guide.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/skills/skill-creator/references/authoring_guide.md) | Nama berbasis kapabilitas; operational core vs references/assets. | Penamaan semantik dan output contract. | Dibaca penuh pada pin; snake_case donor tidak mengganti parser kebab-case Agent Core. |
| R07 / PENDUKUNG | [Meta/muse-agent/PROACTIVE_PREFERENCES.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/PROACTIVE_PREFERENCES.md) | Topik, larangan, waktu dan format pemberitahuan. | Reminder ringkas, relevan, tidak berulang tanpa perubahan. | Dibaca penuh pada pin; jam contoh donor bukan default pengguna. |
| R08 / PENDUKUNG | [Meta/muse-agent/docs/scheduling-and-watching.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/docs/scheduling-and-watching.md) | Polling bukan live stream; jadwal bukan bukti eksekusi; run bukan bukti delivery. | Kejujuran scheduler dan bukti penyampaian reminder. | Dibaca penuh pada pin; klaim komputer donor selalu hidup tidak berlaku pada PC pengguna. |
| R09 / BACA-LANJUT | [Meta/muse-agent/skills/self-awareness/references/extensions.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/skills/self-awareness/references/extensions.md) | Dashboard dan rekomendasi koneksi opsional. | Output introspeksi tambahan, bukan dashboard baru wajib. | Path/content pernah dibaca pada diskusi; baca ulang pin sebelum dipakai. |
| R10 / BACA-LANJUT | [Meta/muse-agent/docs/memory.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/docs/memory.md) | Dokumentasi memory donor. | Pembanding kontrak memory, bukan pengganti canonical Memory. | Baca penuh pada pin sebelum menarik detail implementasi. |
| R11 / OPSIONAL | [Meta/muse-agent/HEARTBEAT.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/HEARTBEAT.md) | Template daftar recurring checks. | Referensi intent saja, bukan implementasi worker. | Isi template pernah dibaca; tidak membuktikan scheduler tersedia. |
| R12 / OPSIONAL | [Meta/muse-agent/docs/goals.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/docs/goals.md) | Goal, progress dan briefing berbeda dari job yang berjalan. | Future goals; jangan mencampur fakta dengan target masa depan. | Pernah dibaca; revalidasi sebelum fase opsional. |
| R13 / OPSIONAL | [Meta/muse-agent/docs/ideas.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Meta/muse-agent/docs/ideas.md) | Idea sebagai usulan tindakan sebelum dibangun. | Future idea UX; bukan syarat proposal skill. | Pernah dibaca; revalidasi sebelum fase opsional. |
| R14 / PEMBANDING | [Anthropic/claude-design/claude-design.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/Anthropic/claude-design/claude-design.md) | Perubahan terarah, mempertahankan bagian yang tidak diminta, pemeriksaan output. | Pembanding workflow kualitas; tidak mengimpor HTML environment donor. | Bagian awal pernah dibaca; bukan dependensi jalur utama. |
| R15 / PEMBANDING | [OpenAI/Codex/plan_mode.md](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/OpenAI/Codex/plan_mode.md) | Pemisahan penyusunan rencana dari eksekusi. | Pembanding plan/execute; bukan konfigurasi Agent Core. | Path pernah ditemukan; isi perlu dipelajari sebelum adopsi. |

### Cara menggunakan referensi

Baca R01 → R02/R03 → R04 → R05/R06 → R07/R08. Untuk setiap mekanisme, tulis donor section → bukti source lokal → delta yang benar-benar diperlukan → penerima native → acceptance. Jangan mengklaim audit exhaustive atas seluruh repository.
R09–R15 tidak menjadi alasan menunda jalur inti. Sebelum dipakai, fetch file pada PIN, baca isinya, catat digest/provenance, lalu tandai mana yang nyata di dokumen dan mana yang usulan kita. Missing file/tool/helper berarti belum tersedia, bukan boleh direkayasa seolah ada.
Tidak clone/import donor ke katalog aktif pada tahap ini. Snapshot lokal donor hanya pada lokasi reference yang disetujui, dan tidak pernah menjadi prompt bootstrap otomatis. Lisensi repo: [LICENSE](https://github.com/asgeirtj/system_prompts_leaks/blob/f015440d2c6a5c880e7503d0d17bfad1cd02133f/LICENSE); label lisensi repo bukan bukti hak atas seluruh materi pihak ketiga.

### Konflik donor yang sengaja tidak diadopsi mentah

R02 menyarankan tidak menambah skill ideas tanpa diminta. Untuk Agent Core, U1–U5 adalah permintaan eksplisit pengguna agar proposal skill bernilai wajib disampaikan; bukan izin mengirim seluruh ide/koneksi yang tidak relevan.
R04 menyebut newer claims supersede older ones. Agent Core tetap membutuhkan bukti dan hubungan supersession yang sah, bukan sekadar timestamp lebih baru.
R06 memakai snake_case untuk frontmatter donor; Agent Core mempertahankan kebab-case sesuai S2. R08 menggambarkan komputer donor selalu hidup; itu tidak berlaku untuk Agent Core yang berjalan di PC pengguna.

## 5. Rancangan inti: proposal, reminder, keputusan

```text
Task / koreksi / recovery teramati
  → nilai apakah ada pola reusable dan periksa skill/proposal existing
  → simpan proposal <skill-name>.md + bukti + status
  → bacakan reminder ringkas dalam sesi aktif yang sama
  → pengguna: setujui / revisi / tolak / nanti
  → pembangunan + pemeriksaan sesuai scope persetujuan
  → import / promote melalui SkillService existing
  → status aktif yang jujur + outcome/receipt untuk penggunaan berikutnya
```

### Discovery tidak sama dengan kelayakan aktivasi

Satu temuan bermakna boleh memicu proposal bila agent bisa menjelaskan kegunaan, kondisi reuse dan bukti. Jangan mengubah angka contoh “1/2/3 keberhasilan” pada diskusi menjadi hukum baru. Bukti lemah tetap `awaiting-verification`, tanpa label “siap aktif”.
Aturan support independen existing dipertahankan untuk menyatakan learned procedure qualified. Qualified berarti layak direkomendasikan, bukan izin impor/promotion otomatis. Koreksi/kegagalan baru menahan rekomendasi readiness sampai direview; jangan menghapus sejarah negatif.
Skill yang dibuat secara eksplisit atas permintaan pengguna tidak wajib menunggu dua task buatan: tetap jalur authoring existing dengan scope/pemeriksaan yang disetujui. Jangan memproduksi task sintetis hanya untuk menaikkan support.

### Penamaan dan penyimpanan yang diusulkan

Proposal: `runtime/skills/proposals/<workspace-name>/<skill-name>.md`; contoh `runtime/skills/proposals/agent-core/code-review.md`. Workspace memakai nama semantik dengan identitas root terverifikasi dalam metadata, bukan drive letter atau folder-name coincidence.
Skill aktif tetap: `runtime/skills/catalog/<skill-name>/SKILL.md`. Direktori proposal tidak ikut `skills list` sebagai skill aktif dan tidak dimuat oleh controller sebagai trusted instruction. `SKILL.md` tidak diganti menjadi `code-review.md` di dalam katalog native.
Nama sesuai kebab-case max64 existing. Hash/UUID/tanggal boleh untuk metadata audit/revision internal, tidak untuk basename proposal. Benturan makna memakai nama lebih spesifik seperti `typescript-code-review.md`, bukan nomor urut.
Nama sama bukan bukti workflow sama. Dedup berdasarkan identity workspace + capability + scope + procedure lineage; gabungkan bukti hanya bila benar-benar setara. Revisi mempertahankan nama semantik dan jejak perubahan; perubahan scope membatalkan approval lama.
Gunakan persistence atomik existing, expected digest/CAS, batas ukuran parser yang sudah ada, penolakan traversal/symlink/Windows reserved names, dan pemulihan last-good existing. Jangan membuat salinan canonical Learning atau Memory baru di proposal.

### Isi minimum proposal Markdown

`name`, judul manusia, `status`, `action=create|revise`, workspace, sumber task/session, procedure fingerprint bila tersedia, revision/digest, skill aktif terkait, tujuan, trigger dan non-trigger, workflow, tools nyata, manfaat diharapkan, bukti/support/failure, keterbatasan, kebutuhan implementasi, acceptance yang direncanakan, dan keputusan pengguna.
Status dokumen dan confidence tidak boleh ditulis oleh model sebagai bukti izin. Metadata approval hanya dicatat dari tindakan/ucapan pengguna yang terikat proposal/revisi dan scope; gunakan mekanisme keputusan existing bila tersedia.
Template konseptual, bukan proposal skill yang benar-benar telah ditemukan:

```markdown
# Code Review
Nama: code-review
Status: proposed
Aksi: create
## Tujuan
Meninjau perubahan kode dan melaporkan temuan yang didukung source.
## Kapan digunakan
Permintaan review kode/perubahan; bukan izin mengedit atau deploy.
## Temuan asal dan bukti
Isi dengan task dan hasil yang benar-benar teramati; bukti yang kurang dinyatakan belum tersedia.
## Workflow dan alat
Inspeksi perubahan, telusuri dependensi, verifikasi temuan material, laporkan prioritas.
## Manfaat yang diharapkan
Konsistensi review dan berkurangnya pengulangan analisis; belum klaim peningkatan terukur.
## Batas dan acceptance
Tidak mengarang tool; pemeriksaan yang diperlukan ditulis sebelum pelaksanaan.
## Keputusan pengguna
Belum ada persetujuan pembuatan atau aktivasi.
```

### Pemberitahuan wajib dalam sesi aktif

Setelah file berhasil ditulis dan dibaca balik, controller wajib menyampaikan satu pemberitahuan yang menyebut nama, fungsi, pemicu penggunaan, bukti singkat, manfaat, link/path, dan status belum aktif. Hasil task utama tetap disampaikan; jangan membelokkan task menjadi implementasi skill tanpa persetujuan.
Contoh copy setelah berkas benar-benar ada: “Aku menemukan pola yang layak diusulkan sebagai `code-review`. Fungsinya meninjau perubahan kode dengan bukti source. Proposal tersimpan di `.../code-review.md`; manfaatnya masih berupa harapan dan skill belum aktif. Kamu dapat menyetujui, merevisi, menolak, atau menundanya.”
Simpan notification pending hanya setelah proposal durable. Bedakan `pending`, `included-in-response`, `delivery-confirmed`, `acknowledged`; pengembalian tool/log bukan bukti pengguna menerima atau membaca pesan. External ChatGPT yang tidak memberi delivery receipt tidak boleh ditandai `delivery-confirmed`.
Satu pemberitahuan per revisi bermakna dalam sesi; beberapa proposal dapat diringkas dalam satu pemberitahuan dengan masing-masing path. “Nanti” tidak diingatkan setiap turn: munculkan lagi ketika relevan, pengguna meminta, atau ada bukti baru. “Tolak” menghentikan reminder revisi tersebut; bukti baru boleh melahirkan revisi yang dijelaskan, bukan mengabaikan penolakan.
Jika sesi putus sebelum pemberitahuan, pertahankan pending dan tampilkan pada sesi aktif berikutnya. Ini recovery atas interupsi, bukan alasan sengaja menunda notifikasi sampai background job. Gagal menulis proposal harus dilaporkan sebagai gagal; tidak boleh mengaku file sudah dibuat.

### Persetujuan dan lifecycle

Alur dokumen: `proposed → notified → approved | changes-requested | deferred | rejected`. Alur artefak terpisah: `not-built → staged → validated → catalog-active`; `native-integrated` hanya bila loading/use native benar-benar terbukti.
“Setujui proposal” dicatat sesuai scope pembuatan yang disajikan; “buat dan aktifkan” dapat mengotorisasi keduanya secara eksplisit. Jangan meminta ulang keputusan identik. Pemasangan dependency, tindakan external/destructive, restart atau release di luar scope tetap memerlukan intent yang sesuai.
Approval terikat proposal digest, target skill, expected active digest dan scope. Perubahan isi semantik/rencana setelah approval memerlukan keputusan atas revisi baru. CAS menolak active/source drift. Skill lama tetap dipertahankan sampai replacement yang disetujui berhasil; rollback existing tetap tersedia.
Validasi struktur bukan pembuktian manfaat. Jangan memakai `skills import` sebagai jalan pintas mengaktifkan skill hasil discovery sebelum approval. Metadata `allowed-tools` tetap metadata, bukan pemberian akses eksekusi.

## 6. Peta owner dan pekerjaan implementasi

P0–P6 telah disetujui; core implementation tersedia di source dan kandidat compiled. Nama/signature di bawah adalah rancangan awal; ownership aktual ada pada laporan Execution dan bagian 11. Checkbox yang selesai berarti source/fixture qualification, bukan resident/live acceptance. Item OPEN yang tersisa dinyatakan eksplisit.

### P0 — Re-ground dan pastikan kontrak dua controller

Files: inspect `src/learning/service.ts`, `src/skills/service.ts`, `src/learning/external-controller.ts`, `src/agent-controller.ts`, `src/agent-runtime.ts`, `src/mcp/learning-schemas.ts`, `src/mcp/controller-learning-schemas.ts`, `src/mcp/skills-schemas.ts` dan corresponding tools. Temukan nama schema aktual lewat tree bila berbeda.
- [x] Cocokkan server source, dist resident dan descriptor connector untuk taskId/checkpointKeys/disposition. Descriptor sesi planning belum mengekspos semua field yang tercantum pada AGENTS.md; jangan mengulang unscoped review lalu mengklaim pending selesai.
- [x] Petakan semua caller materialisasi/import/revisi di external dan Native; pastikan shared Learning owner, bukan dua registry. Gunakan graph current sebagai pendamping exact source.
- [x] Catat baseline hashes, preservasi pending/procedure/skill existing, dan rencana rollback scoped tanpa aktivasi atau migrasi otomatis.
Deliverable: peta wiring dan schema terarah yang cukup untuk P1–P3; tidak menambah gate task umum atau mengubah status task CLOSED.

### P1 — Automatic semantic skill proposal

Files: add proposed `src/learning/skill-proposals.ts`; extend `src/learning/types.ts`, `src/learning/service.ts`, `src/skills/service.ts`; update related procedure type hanya bila dibutuhkan. Test proposed `tests/skill-proposals.test.ts`.
Interfaces proposed: `upsertSkillProposal(input: SkillProposalInput): Promise<SkillProposalRecord>`; input membawa workspace identity, semantic name, purpose, triggers/nonTriggers, workflow, evidence refs dan source procedure. Record membawa proposalId, revisionDigest, path, status, evidence qualification dan target skill revision.
- [x] Tulis kasus terarah untuk proposal pertama, nama semantik, collision bermakna, dedup task/replay lintas controller, evidence negatif, dan file write failure. Jalankan hanya setelah otorisasi test.
- [x] Ubah `materializeProcedure` menjadi permintaan proposal/qualification, bukan automatic import baru. Tidak menghapus atau menurunkan skill existing yang sudah aktif secara retrospektif.
- [x] Persist `.md` terpisah dari katalog dan catat pointer/decision pada state owner existing; atomic write/readback + digest. Satu proposal bisa lahir sebelum qualified, tetapi readiness tidak dipalsukan.
Deliverable: file bernama semantik yang bisa dibaca pengguna; active catalog dan execution authority tidak berubah.

### P2 — Mandatory in-session reminder

Files: add proposed `src/learning/skill-proposal-notification.ts`; extend `src/mcp/external-controller-tool-support.ts`, `src/learning/external-controller.ts`, `src/agent-controller.ts`, `src/agent-runtime.ts`, serta final-response/turn event owner yang dibuktikan pada P0. Test proposed `tests/skill-proposal-notification.test.ts`.
Interfaces proposed: `pendingSkillNotices(scope): Promise<SkillProposalNotice[]>` dan `recordSkillNoticeDelivery(input): Promise<void>`; notice berisi proposalId/digest, task/session, path, purpose/trigger/benefit/evidence/status. Delivery input tidak boleh mengklaim ack yang tidak tersedia.
- [x] Buktikan file durable sebelum notice; Native menyertakan notice pada response/event existing, external mendapat capsule untuk disampaikan pada jawaban sesi yang sama. Simpan status pending saat gagal/interupsi.
- [ ] **OPEN — penerimaan live/eksternal atau cakupan tambahan:** Uji satu reminder/revisi, response task utama tetap utuh, streaming terputus, reconnect, later/reject, dan output tool yang belum disampaikan. Jangan memaksakan template chat berupa puluhan card.
- [x] AGENTS.md memuat kewajiban pemberitahuan. Reminder proposal yang nyata sudah diteruskan pada percakapan external aktif dan tersimpan pada jawaban Native; tidak ada klaim delivery-confirmed atau pengguna sudah membaca. Refresh descriptor cached dan persetujuan external tetap terpisah.
Deliverable: pengguna menerima proposal skill pada interaksi yang relevan; catatan delivery tidak berbohong dan tidak spam.

### P3 — User decision sampai aktivasi skill

Files: extend `src/learning/skill-proposals.ts`, `src/skills/service.ts`, `src/mcp/skills-schemas.ts`, `src/mcp/skills-tools.ts`; reuse jalur approval/native intent existing. Test proposed `tests/skill-proposal-decisions.test.ts`.
Interfaces proposed: `decideSkillProposal({proposalId, expectedProposalDigest, decision, scope, userEvidenceRef})`; keputusan `approve|revise|reject|defer`; scope membedakan pembuatan dan aktivasi. `activateApprovedSkillProposal` meneruskan validated artifact ke import/promote existing dengan expected digest.
- [x] Jangan percaya klaim model “user approved” tanpa bukti keputusan user. Batasi efek pada proposal dan revisi yang dipilih; no-reply/ambiguous intent tidak mengaktifkan.
- [x] Uji approval stale, source drift, new skill dan revision, dependency baru, kegagalan validasi, rollback, serta duplicate delivery/replay approval tanpa efek ganda.
- [ ] **OPEN — penerimaan live/eksternal atau cakupan tambahan:** Laporkan proposed/staged/catalog-active/native-integrated secara terpisah. Buktikan native loader memakai skill bila hendak mengklaim native-integrated; tidak ada tool auto-execution dari isi Markdown.
Deliverable: jalur discovery tidak lagi diam-diam mengubah katalog; persetujuan konkret menghasilkan kemampuan yang transparan sesuai scope.

### P4 — Grounded self-awareness

Files: prefer `src/agent-knowledge-synthesis.ts`, `src/learning/external-controller.ts`, `src/agent-runtime.ts` dan read-only status/context existing; tambahkan helper kecil `src/learning/self-awareness.ts` hanya bila komposisi existing tidak mencukupi. Test proposed `tests/agent-self-awareness.test.ts`.
Interface proposed: `buildSelfAwarenessView({workspace, questionType}): Promise<SelfAwarenessView>`; view berisi observations bertanggal, evidenceRef, status available/active/degraded/stale/unknown/proposed, dan explicit omissions.
- [x] Adaptasi R02/R03: pilih evidence minimal berdasarkan pertanyaan, bukan scan drive/global personal data. Baca health/schema/catalog/Memory terkait; schema tersedia tidak berarti connected/usable.
- [ ] **OPEN — penerimaan live/eksternal atau cakupan tambahan:** Uji missing/stale/contradictory evidence, proposal vs active catalog, expired connection, dan operasi yang belum pernah terbukti. Snapshot/health saja tidak membuktikan hasil task.
Deliverable: kedua controller menjelaskan kemampuan aktual dan batasnya tanpa mengarang identitas, consciousness, atau akses.

### P5 — Explainable improvement / WHY

Files: reuse `src/learning/decision-evidence.ts`, `src/learning/journey.ts`, `src/memory/retrieval-ledger.ts`, `src/learning/skill-proposals.ts`, `src/skills/service.ts`; helper proposed `src/learning/improvement-explanation.ts`. Test proposed `tests/improvement-explanation.test.ts`.
Interface proposed: `explainImprovement({proposalId?, skillName?, revisionDigest?, workspace}): Promise<ImprovementExplanation>`; hasil adalah evidence chain, missing links, observed outcome dan separately labeled expected benefit.
- [x] Trace task → observable action/result → review/decision → proposal → user decision → skill revision → actual later use/receipt. Dedup independent support dan pertahankan contradiction/failure.
- [x] Uji dangling/mismatched/expired refs, queued-vs-delivered, exposure-vs-use, dan bukti luar workspace. Tidak membuat alasan retroaktif dari hasil akhir, tidak mengekspor private reasoning atau secret.
Deliverable: “mengapa skill ini diusulkan/diubah?” dijawab dari bukti tersimpan, bukan perasaan model.

### P6 — Outcome-driven skill revision review

Files: extend `src/learning/curator.ts`, `src/learning/feature-outcome-pool.ts`, proposal module P1, dan existing skill revision metadata; test proposed `tests/skill-outcome-review.test.ts`.
- [x] Dari outcome/receipt existing, usulkan retain/review/revise/retire beserta alasan. Jarang dipakai tidak otomatis buruk; satu kesalahan tidak otomatis membatalkan seluruh kemampuan.
- [x] Revisi lewat proposal bernama semantik yang sama dengan lineage/digest baru; gunakan P2/P3. Tidak auto-promote atau auto-delete; penolakan/defer tidak hilang saat restart.
- [x] Uji masalah yang sama tidak membuat proposal berulang, bukti baru membuka review yang relevan, historical support tidak dianggap verified, dan approval revision lama tidak berlaku untuk revision baru.
Deliverable: pengalaman berikutnya memperbaiki proposal/skill secara transparan, bukan hanya menambah jumlah file.

## 7. Fase opsional, bukan prerequisite jalur utama

**O1 — Bounded idle/periodic review.** Pelajari R04/R08/R11 setelah P1–P6 dan hanya bila pengguna memilih fase ini. Gunakan runtime/controller existing, opt-in jadwal dan compute budget, cancellation, one-run ownership, dan state pending existing. Tidak second LLM/agent tersembunyi atau retry tanpa batas. Scheduler hanya menyiapkan review/proposal; tidak melewati persetujuan.
Reminder in-session P2 harus bekerja tanpa O1. External ChatGPT tidak bisa bekerja sesudah turn hanya karena file heartbeat ada; tanpa runtime worker yang hidup/terotorisasi, statusnya pending sampai interaksi berikutnya. Tidak ada janji “selalu berjalan” saat PC mati.
**O2 — Proactive preferences.** R07 dapat mengatur topik, quiet hours dan format untuk future background notification; jangan mengadopsi jam contoh donor. Pengaturan jangan menghilangkan reminder penting dari hasil task yang sedang diminta pengguna.
**O3 — Goals/Ideas.** R12/R13 hanya arah perluasan setelah pengguna menyetujui consumer nyata. Goal ≠ fact Memory; idea ≠ task disetujui. Tidak membuat GoalService/database/messaging baru pada implementasi inti ini.
**DITOLAK untuk plan ini:** free-form dreaming/personality rewriting, persetujuan palsu, mengganti policy dengan donor, otomatis mengumpulkan relasi pribadi, auto resource acquisition, dan menambah kemampuan hanya demi kesan agent “lebih pintar”.

## 8. Review focus dan acceptance yang direncanakan

Kelima failure class utama: (a) proposal dianggap sudah aktif, (b) reminder hanya masuk tool/log, (c) replay/cross-controller menggandakan support atau approval, (d) revisi/file berubah setelah keputusan pengguna, (e) backlog/sink failure menghilangkan hasil task atau data lama. Pemilik pengujian: P1/P3, P2, P0/P1/P3, P1/P3, P0/P2/P6.

| ID | Bukti penerimaan yang wajib ada sesudah implementasi disetujui |
| --- | --- |
| A01 | Novel reusable finding menghasilkan proposal semantik; contoh basename `code-review.md`, bukan UUID/timestamp. |
| A02 | Purpose/trigger/non-trigger/evidence/benefit/limitation lengkap; klaim manfaat belum diukur dilabeli expected. |
| A03 | Proposal belum qualified boleh ada tetapi tidak diimpor atau diklaim aktif; active catalog tidak berubah tanpa intent. |
| A04 | Sesi Native dan external masing-masing menampilkan reminder pada jawaban task yang sama; keluaran tool saja bukan PASS. |
| A05 | Interrupted delivery tetap pending dan muncul secara benar setelah reconnect; tidak mengklaim user sudah membaca. |
| A06 | User approve/revise/reject/later berjalan; diam, approval lama dan cross-scope tidak mengaktifkan. |
| A07 | Collision, dedup, independent support dan failure history benar; kedua controller berbagi owner prosedur. |
| A08 | Atomic write/readback/recovery dan CAS menghadapi concurrent edits tanpa overwrite state lain. |
| A09 | Revised artifact melewati validasi/promotion native existing; rollback mempertahankan bukti dan izin. |
| A10 | Self-awareness memisahkan installed/connected/proposed/unknown; missing evidence tidak menjadi health PASS. |
| A11 | WHY trace menghubungkan bukti sebenarnya dan menandai missing/stale refs; tidak mengarang sebab/manfaat. |
| A12 | Reminder tetap bekerja tanpa scheduler; scheduler opsional menghormati cancel/budget dan tidak menambah hidden agent. |
| A13 | Traversal, Windows reserved-name, symlink, credential/instruction-poisoning, dan lintas workspace tidak lolos lewat proposal. |
| A14 | Task A review tidak menutup task B; task result dan Learning completion tetap terpisah; pending tidak dihapus. |

Pengujian terarah berikut sudah dijalankan pada source dan sebagian terhadap candidate; hasil dan residual ada pada bagian 11: suite terarah `tests/skill-proposals.test.ts`, `tests/skill-proposal-notification.test.ts`, `tests/skill-proposal-decisions.test.ts`, `tests/agent-self-awareness.test.ts`, `tests/improvement-explanation.test.ts`, `tests/skill-outcome-review.test.ts` ditambah regression existing yang benar-benar tersentuh. Tulis reproduksi/failing case dahulu, implement minimal, lalu ulangi kasus yang diotorisasi.
Contoh command setelah file dan otorisasi ada: `npx --no-install vitest run tests/skill-proposals.test.ts tests/skill-proposal-notification.test.ts tests/skill-proposal-decisions.test.ts`. Gunakan tooling lokal existing; jangan mengunduh test runner diam-diam.
Sebelum aktivasi, gunakan build/path policy dan `release:compat` existing bila diotorisasi. Jika ada perubahan public schema, lakukan structural review dan fresh connector check. Tidak menjalankan broad suite/64-run benchmark/visual checks tanpa otorisasi spesifik.

## 9. Urutan, rollback, dan definition of done

Urutan disarankan: P0 → P1 → P2 → P3, kemudian P4/P5 → P6. Selesaikan pengalaman proposal/reminder/keputusan lebih dulu, baru scheduler atau Goals. P4/P5 dapat direview terpisah tanpa membuat milestone inti tergantung fitur opsional.
Implementer harus menyampaikan exact planned tests dan activation boundary sebelum eksekusi. Persetujuan pada plan/task menentukan scope yang boleh dikerjakan; jangan menganggap checkbox OPEN sebagai izin.
Material behavior change memakai satu `.changeset/*.md` per coherent shipped scope dengan bump yang ditentukan dari diff nyata; doc-only plan ini tidak memerlukan changeset. Root package version tetap canonical. Tidak commit/tag/push/publish/release/restart otomatis.
Rollback scoped mempertahankan Memory, pending reviews, proposal/approval history dan skill aktif sebelumnya. Berkas donor tidak boleh menjadi recovery source untuk Agent Core. Migration lama hanya memperkaya provenance; tidak membuat approval/support palsu atau mereset state.
Definition of done: acceptance relevan terbukti; docs/CODEBASE/Memory sinkron; proposal dan reminder benar-benar muncul untuk kedua controller; aktivasi hanya sesuai keputusan; perbedaan source-built/resident/behavioral-benefit dicatat. Lebih banyak skill bukan metrik sukses tersendiri.

## 10. Catatan handoff planning (historis, sebelum persetujuan implementasi)

Yang diselesaikan oleh dokumen ini: requirement U1–U8 tertulis, baseline source dibaca, 8 referensi inti/pendukung dibaca ulang pada commit tetap, 7 lead baca-lanjut/pembanding diberi status, serta P0–P6 dan O1–O3 dipisahkan.
Yang BELUM dilakukan: implementasi proposal/reminder/self-awareness/WHY/scheduler; clone/import donor; perubahan source/AGENTS/runtime; tes produk; dependency install; restart; aktivasi skill; release. Semua contoh workflow/filename bukan klaim skill baru sudah ditemukan atau aktif.
Seleksi berikutnya sudah diterima: P0–P6 diimplementasikan; O1–O3 tetap tidak dipilih. Jangan meminta pengguna mengulangi requirement penamaan/reminder.

## 11. Hasil implementasi dan resident readback — 7 Oktober 2026

P0–P6 core sudah terpasang. Instalasi awal memuat 531 file termasuk 6 aset UI yang dipertahankan; patch berikutnya hanya agent-controller.js dan sourcemap. Fresh readback 7 Oktober memeriksa manifest gabungan: 531/531 hash cocok. Core PID 14228, launcher 7772, tunnel 5556; versi 0.14.0 dan health ok. Tidak ada pemasangan ulang atau restart pada final readback ini.

Source qualification sebelumnya: 112 PASS / 0 FAIL / 1 host SKIP; compiled/installed core: 53 PASS / 0 FAIL / 1 SKIP pada subset yang sama. Koreksi evidence handoff memiliki RED/GREEN 61 PASS / 0 FAIL / 1 host SKIP pada source dan satu regresi compiled terpilih PASS (7 kasus lain tidak dipilih, bukan host SKIP). Angka historis ini tidak dianggap rerun baru pada final readback.

Native retest task 903f44ba-eb9e-48f9-b274-c334c4b38fd0 menghasilkan turn finalized, jawaban tersimpan, dan reminder revisi proposal yang sama. Notice recorded included-in-response / delivery unconfirmed. Learning task Native complete/no-new-knowledge. Model memilih ref read_file nyata; independent job verifier tetap unavailable. Retest ini tidak memanggil Skills.proposals, sehingga facade tersebut dibuktikan terpisah melalui fresh authenticated MCP; tidak dinyatakan native-integrated Skill use.

Fresh MCP historis membuktikan enam action additive serta proposals/self-awareness/WHY. Setelah explicit user-authoring dan Native-use closure, registry proposal `agent-core-runtime-activation-audit` direkonsiliasi terhadap provenance artifact aktif yang mengikat proposal ID/revisi yang sama. State sekarang `implemented / catalog-active`; keputusan Native `user-message:*` tetap 0 karena tidak direkayasa, dan qualification tetap `awaiting-verification`. Reminder untuk proposal ini retired.

OPEN yang tersisa: interrupted-stream/reconnect end-to-end, junction host, refresh cached Skills descriptor, serta trusted external user-message ingestion sebagai kemampuan umum untuk keputusan proposal baru. Build/activation/later Native use proposal `agent-core-runtime-activation-audit` sendiri sudah selesai. Tidak ada bukti manfaat terukur atau klaim seluruh plan STABLE/COMPLETE. O1–O3 tidak dipilih.

Authority: [Agent-Core-Self-Improvement-Execution-20261007.md](Agent-Core-Self-Improvement-Execution-20261007.md). Fresh evidence: runtime/tmp/self-improvement-activation-20261007/postrestart-closure.json, postrestart-current-readback.json, postrestart-facade-readback.json, native-retest-proof.json dan native-retest-detail.json. Canonical Memory: 122f8273-4966-4fbd-b987-deb468ca66ed.

## 12. Explicit user-authoring closure for agent-core-runtime-activation-audit — 7 Oktober 2026

Pengguna secara eksplisit meminta proposal `agent-core-runtime-activation-audit` dikerjakan dan dipakai. Connector external saat ini tidak menyediakan trusted persisted user-message ingestion, sehingga approval proposal **tidak** direkayasa sebagai `user-message:*`. Sesuai jalur explicit user-requested authoring pada plan, SkillService memvalidasi lalu mengimpor artifact native dengan provenance ke proposal/revisi asal.

- Active catalog artifact: `runtime/skills/catalog/agent-core-runtime-activation-audit/SKILL.md`.
- Artifact digest: `sha256:dc8a49f3ff2b811671de9f40339cab7e81d1ef5a7cc64b75df1092bd3debbb8d`.
- Metadata menyimpan origin proposal ID `skill-proposal:761c5a51ecb6c21e9a48d0c82ba51799` dan revision `sha256:8eb4a2ed7f2a8d5c412b61f8f7153aae37024cc0941a329cd4fb910aba0e3bd3`.
- Catalog count berubah 1 → 2; `executionAuthority=false` tetap berlaku.
- Knowledge synthesis fresh menampilkan skill sebagai ACTIVE SKILL ARTIFACT.
- Native read-only acceptance task `59a5e5d1-c7d2-4215-b47a-3480943bc24e` finalized dan mencatat `artifactUse=skill:agent-core-runtime-activation-audit / applied`; 12 tool calls, 0 tool failures.
- Runtime readback: Agent Core v0.14.0, health ok, Agent Runtime skillCount=2, running Native turns=0. Conversation uji diarsipkan reversible.
- Evidence: `runtime/tmp/explicit-skill-authoring-20261007/closure.json`.

Registry reconciliation sekarang selesai tanpa memalsukan host approval: active artifact memiliki metadata origin proposal ID/revisi yang persis sama, sehingga proposal state diubah menjadi `implemented / catalog-active` dengan fulfillment `active-artifact-reconciliation` dan digest artifact aktif. Jalur `decide_proposal` tetap tidak dipalsukan dan keputusan Native `user-message:*` tetap kosong. Qualification proposal tetap awaiting-verification; measured benefit belum dibuktikan. OPEN yang tersisa: trusted external decision ingestion untuk proposal baru secara umum, interrupted-stream/reconnect, dan junction host.
