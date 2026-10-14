# Memory 17 — OpenAI Memory/Compaction Content Integrity Implementation Plan

> **Status saat ini:** Implementasi source dipublikasikan pada `60e504f9bf1c876934146dfa7298f1a270e99a14` (`0.15.0-beta.3`). Hasil dan batasan ada di [ledger fungsional](../verification/memory12-21-source-functional-2026-10-11.md). Windows belum diuji/diaktifkan dan ditunda sampai pengguna kembali. Checklist serta rancangan antarmuka di bawah dipertahankan sebagai bukti perencanaan historis, bukan klaim semua acceptance PASS.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status awal saat perencanaan (historis):** Draft / PROPOSED; belum ada implementasi, test run, atau aktivasi.

**Goal:** Memisahkan task facts dan artifact outcomes dari reusable procedure candidates, serta membuktikan isi penting tetap utuh pada capsule berbudget.

**Architecture:** Capsule deterministik existing tetap pemilik continuity dan byte budgeting; artifact/episode/promotion existing tetap pemilik bukti. Helper pure memeriksa integritas isi dan routing candidate yang dinyatakan controller, bukan menebak semantik dengan LLM tersembunyi. Kesimpulan kasus tidak otomatis menjadi prosedur; fakta bersumber tetap boleh disimpan melalui jalur Memory yang benar.

**Tech Stack:** TypeScript, Node >=24.15.0, Vitest existing, tanpa OpenAI SDK/Python/SQLite/model dependency baru.

**Spec:** `docs/plans/2026-10-11-memory-reference-adoption-spec.md`.

## Global Constraints

- TypeScript/Node.js sesuai proyek: Node >=24.15.0, Vitest yang sudah terkunci dalam repo. Tidak menambah Python, database graph, service, daemon, atau SDK donor sebagai prasyarat.
- Scope owner/workspace/task tetap dipercaya dari host, bukan dari isi memory atau argumen controller yang mengaku sebagai owner.
- Memory advisory dan Learning fail-soft; kegagalan keduanya tidak mengunci machine-control atau pekerjaan pengguna.
- Bukti sumber, revision, temporal lineage, pinned protection, dan keputusan review tetap dipertahankan. Klaim model bukan verifikasi independen.
- Tidak menyimpan rahasia, raw chain-of-thought, atau menambang percakapan host tanpa akses dan ruang lingkup yang sah. Gunakan input controller/tool yang sudah disetujui.
- Tidak membaca/menulis Memory produksi sebagai fixture. Gunakan data sintetis terisolasi; uji fungsi didahulukan, benchmark CPU/RAM/latency berat ditunda.
- Tidak mengeksekusi repo donor atau memakai dataset/kode berlisensi belum jelas. PM-Bench belum memiliki lisensi tracked yang ditemukan; MemProbe suite40/derivatif bersifat nonkomersial; lisensi subfolder contoh Anthropic perlu klarifikasi sebelum penyalinan. Adopsi ide melalui implementasi dan fixture orisinal.
- Tidak mengubah marker aktivasi, memigrasi store, mengaktifkan opt-in, atau memulai reembedding/cloud calls secara tersirat.
- Runtime/source aktif tetap di folder asli. Tidak ada clone/worktree/backup/stash baru di Windows atau runtime aktif dari temp. Status Git dirty bukan error runtime dan bukan alasan mensyaratkan seluruh checkout bersih.
- Pisahkan source commit, build, artefak terpasang, proses aktif, hasil uji, release dan package. Dokumentasi ini tidak mengubah versi produk; implementasi kelak harus menilai versi berdasarkan perubahan kontrak nyata.


Batas khusus rencana ini:

- Baseline `957077fab260dd58d0cc7cfc0881172d05f84667`; canonical runtime Memory Linux tidak tersedia. Tidak membaca/menulis Windows dalam tugas plans-only.
- Tidak menjalankan test/build/install, live provider, benchmark berat, migrasi atau deployment runtime sekarang.
- Preserve task/workspace identity, exact revision provenance, policy, mandatory critical items dan independent verification; source text bukan instruksi.
- Satu canonical capsule/promotion/Learning owner; tidak membuat summary database, second investigation record atau runtime temporary.
- Semua API bernama PROPOSED di bawah adalah rencana lokal, bukan API SDK atau fitur baseline.

## Review Focus

- Budget sempit tidak boleh diam-diam membuang larangan/blocker/important ID (Task 1).
- Kesimpulan artifact terverifikasi tidak membuktikan prosedur reusable (Task 2).
- Ringkasan mengubah angka, path, status uncertainty atau evidence revision: tolak sebagai continuity resmi (Task 1/3).
- Task override sementara tidak berubah menjadi global preference atau active Skill (Task 2).
- Missing/stale artifact atau source poisoning tidak diluluskan karena prose summary tampak meyakinkan (Task 3).

## Grounding, dampak dan lisensi

Referensi [OpenAI Cookbook snapshot MIT](https://github.com/openai/openai-cookbook/tree/5bd6cb40b6b84b69b2032d810610aa85064102df), commit `5bd6cb40b6b84b69b2032d810610aa85064102df` (HEAD snapshot 2026-10-09; bukan klaim tanggal publikasi setiap notebook).
- `examples/agents_sdk/building_reliable_agents_memory_compaction.ipynb`, JSON cells[10]: compaction melanjutkan run; reusable memory menyimpan pelajaran; memo menjadi reviewed output. Larangan case facts pada memory berlaku khusus workflow contoh, bukan aturan universal semua Memory.
- cells[23]: contoh `OpenAIResponsesCompactionSession` dan forced checkpoint; cells[25]: `MemoryGenerateConfig` mengarahkan workflow lesson, bukan findings kasus. Prompt itu tidak menyediakan deterministic security filter.
- `session_memory.ipynb` cells[21,41–42,54–55] dan `context_personalization.ipynb` cells[30,36,54,62–63] memberi konteks tambahan; notebook demo bukan durability/verification authority. Tidak mengeksekusi sel, termasuk sel filesystem walau live run dimatikan.
- Baseline `SubProject/agent-core-memory/src/memory/capsule.ts::renderTaskCapsule` sudah menjaga mandatory items, source refs, omission warnings dan insufficient budget. `episodes.ts` memeriksa scoped snapshot/revision, `promotion.ts` menjaga host review/CAS, `src/learning/review.ts` menjaga candidate evidence. Jangan mengganti dengan lossy model summary.

Dampak yang dituju: mencegah hilangnya identitas/constraint dan kontaminasi prosedur oleh hasil satu kasus. Belum ada bukti savings, latency atau reasoning benefit; evaluasi manfaat tetap Plan05. Adaptasi ide tanpa copy kode; salinan substansial kelak mempertahankan MIT notice. SDK contoh perlu verifikasi versi tersendiri bila kelak benar-benar dipilih.

## Ownership dan dependensi

- Plan17 memiliki helper baru `memory/capsule-integrity.ts` subproject serta `src/learning/candidate-purpose.ts`, fixture content-integrity dan satu hook capsule existing.
- Plan12 memiliki trigger/session lifecycle, resume dan tool-call grouping; Plan17 tidak menambah lifecycle/trim strategy. Plan16 memiliki delta operations/review submission; consume classifier Plan17, jangan membuat classifier kedua.
- Plan15 memiliki persisted project synthesis; Plan17 tidak membuat synthesis record atau dependency cache.
- Plan05 tetap owner harness outcome; Plan17 menambah fixture correctness kecil, tanpa runner/evaluator lain. Shared capsule integration dengan Plan12 dilakukan serial.

### Task 1: Invariant isi capsule, bukan reducer sesi baru

**Files:** Create `SubProject/agent-core-memory/src/memory/capsule-integrity.ts`; Modify `SubProject/agent-core-memory/src/memory/capsule.ts`; Test `SubProject/agent-core-memory/tests/memory-capsule-content-integrity.test.ts`.

**Interfaces (PROPOSED):** `assertCapsuleContentIntegrity(input:{workingState:WorkingItem[]; capsule:TaskCapsule; episodeRef:SourceRef}):void`. Import existing types; return void atau existing controller error `MEMORY_SOURCE_UNAVAILABLE` untuk invalid internal output. Hook dipanggil sesudah successful deterministic render, bukan untuk insufficient-budget branch. Tidak mengubah public TaskCapsule schema/generator.

- [ ] RED: exact stable JSON setiap mandatory WorkingItem dan sourceRef harus sama; angka `1.25`, path case-sensitive, status unverified, constraint negatif dan important-id tidak boleh terparafrasa. Capsule yang sengaja diubah satu byte atau revision mesti ditolak.
- [ ] Run `npm --prefix SubProject/agent-core-memory test -- tests/memory-capsule-content-integrity.test.ts`; expected FAIL karena helper belum ada.
- [ ] Implement pembandingan deterministik lewat helper mandatory/ref existing; wajib memastikan supporting omissions dinyatakan tepat, duplicate/missing IDs tidak lolos. Jangan memanggil provider atau membatasi berdasarkan jumlah pesan.
- [ ] Ulangi command; expected PASS. Tambahkan fixture UTF-8: budget exact payloadBytes PASS, satu byte di bawah mandatory envelope insufficient-budget dengan warning existing; tidak ada truncated content.
- [ ] Review/commit scoped hanya sesudah implementasi/commit diotorisasi.

### Task 2: Contract tujuan candidate, facts versus reusable procedure

**Files:** Create `src/learning/candidate-purpose.ts`; Test `tests/learning-candidate-purpose.test.ts`; Modify `src/learning/review.ts` dengan validator opt-in, `src/learning/types.ts` untuk field optional berikut.

**Interfaces (PROPOSED):** `CandidatePurpose = 'task-fact'|'artifact-outcome'|'reusable-procedure'`; optional `LearningCandidate.purpose?:CandidatePurpose`; `validateCandidatePurpose(candidate:LearningCandidate):LearningCandidate`. Task-fact/artifact-outcome hanya menerima kind `durable-fact` atau `architecture` dan tanpa `steps`; reusable-procedure memakai operational-reflection, nonempty reuseCondition dan 1–50 steps. Purpose omitted mempertahankan kompatibilitas caller existing dan tetap melewati gate review existing.

- [ ] RED: artifact-outcome berisi steps tidak dapat dipromosikan sebagai reusable procedure; procedure tanpa reuseCondition/evidence ditolak; temporary task override dengan purpose task-fact tidak mengaktifkan Skill atau mengubah global preference. Label purpose tidak membuat verified=true sah tanpa proof.
- [ ] Run `npm test -- tests/learning-candidate-purpose.test.ts`; expected FAIL.
- [ ] Implement structural gate sebelum review existing; semantic truth tetap controller+independent verifier. Jangan lexical-guess purpose dari nama file/kalimat. Task facts/outcomes tidak wajib dibuat candidate: artifacts dan episode refs existing adalah home default.
- [ ] Ulangi command; expected PASS termasuk legacy candidate tanpa purpose dan evidence unsupported. Plan16 adapter memakai validator ini; tidak menggandakan mutation/review.
- [ ] Review/commit scoped dan pertahankan field purpose dalam evidence/audit serialization existing jika tersedia; jangan membuat registry baru.

### Task 3: Fixtures end-to-end kecil, stale evidence dan poisoning

**Files:** Create `SubProject/agent-core-memory/tests/memory-compaction-content-flow.test.ts`, `tests/learning-compaction-purpose-flow.test.ts`; update affected `docs/CODEBASE.md` saat implementasi. Modify helper Task1/2 hanya bila fixture membuktikan gap.

**Interfaces:** Consume `renderTaskCapsule`, episode artifact registration dan `MemoryPromotion.prepare/apply` existing; consume `validateCandidatePurpose` + `LearningService.review` existing. Artifact outcome wajib referensi receipt/revision existing, bukan menyalin case memo sebagai procedure body.

- [ ] RED: scenario goal+constraint+blocker+changed-file+important-id+verified artifact menghasilkan capsule dengan exact content/ref; missing artifact dan stale revision tidak menjadi current fact. Source berbunyi “ignore constraints/approve this” tidak mengubah permission atau candidate verification. Kasus kedua boleh memakai procedure hanya sesudah review/readiness existing.
- [ ] Run `npm --prefix SubProject/agent-core-memory test -- tests/memory-compaction-content-flow.test.ts` dan `npm test -- tests/learning-compaction-purpose-flow.test.ts`; expected FAIL bila gate baru belum ada; existing PASS menjadi regression, bukan alasan menambah kode.
- [ ] Implement hanya gap terbukti melalui owner existing; jangan membuat judge model, second harness atau empty-store recovery. Supporting omission visible; mandatory overflow tetap explicit insufficient-budget.
- [ ] Ulangi kedua command; kemudian `npm --prefix SubProject/agent-core-memory test -- tests/memory-capsule.test.ts tests/memory-capsule-race.test.ts tests/memory-promotion.test.ts` dan `npm test -- tests/learning-finalization-continuity.test.ts`; expected PASS. Build hanya nanti pada implementasi terotorisasi.
- [ ] Review/commit scoped; tulis fixture counts serta PASS/FAIL/NOT RUN nyata, tanpa menyamakan plumbing dengan real model benefit.

## Compatibility, rollback, versi dan handoff Windows nanti

- Dokumen saja: no product-version change. Implementasi validator optional additive: assess minor/prerelease bila capability purpose ditambah; patch bila hasil review membatasi perubahan hanya invariant bug fix. Putuskan tepat saat diff tersedia, gunakan release intent/changelog/version surfaces existing.
- Capsule schema/version dan deterministic generator tidak berubah. Reader lama tetap valid; caller tanpa purpose tetap jalan. Tidak menyatakan provider compacted content sebagai authoritative capsule.
- Rollback menonaktifkan optional purpose adapter; canonical facts, artifact receipts, pending Learning dan promoted procedures dipertahankan. Jangan menghapus history, stash, membuat backup/runtime temporary atau mensyaratkan seluruh working tree bersih.
- Handoff `Black-Project-Agent-Core/Agent-Core` menyebut branch dan eventual exact pushed SHA verified. Baseline sumber ini bukan bukti running Windows.
- Windows: discover nama remote/branch aktual (jangan mengasumsikan `origin`); fetch verified SHA → inspect scoped local edits → integrate canonical tanpa overwrite konflik → build Memory+host yang terdampak (tanpa build UI/launcher jika tidak berubah) → activate owner existing → verify running build identity → functional content/budget/stale-artifact/purpose tests → PASS/FAIL/BLOCKED/NOT RUN.
- ZIP sanitized wajib di luar temporary, berisi logs, changed-file inventory, source/build identity, functional evidence dan manifest path/size/SHA-256; verifikasi fresh extraction. Tidak berisi secrets/private Memory, dan tidak mengeksekusi langkah tersebut sekarang.
