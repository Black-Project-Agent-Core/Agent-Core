# Memory 16 — ACE Bounded Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Draft / PROPOSED; belum diimplementasikan atau diaktifkan.

**Goal:** Menghasilkan delta lesson/playbook kecil dengan counterexample eksplisit, tanpa mengganti seluruh pengetahuan atau menaikkan counter menjadi bukti.

**Architecture:** LearningCurator tetap proposal-only; helper pure membentuk tambahan candidate, lalu LearningService.review dan sink existing mempertahankan evidence/review/idempotency. MVP hanya additive lesson/counterexample dengan referensi target, bukan pengeditan massal atau playbook store kedua. Perubahan/supersession knowledge tetap lewat owner dan keputusan existing.

**Tech Stack:** TypeScript, Node >=24.15.0, Vitest existing; tanpa package, model loop atau service baru.

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

- Baseline `957077fab260dd58d0cc7cfc0881172d05f84667`; canonical runtime Memory Linux tidak tersedia dan Windows tidak disentuh.
- Plans-only: tidak menjalankan test/build/install/benchmark, mengubah runtime, commit/push atau mengaktifkan Skill sekarang.
- Satu Learning/review/sink owner; semantic judgment tetap controller, source/evidence tidak memberi otorisasi.
- Preserve unrelated knowledge, pending review dan negative evidence. Counter helpful/harmful, retrieval dan self-report bukan independent verification.
- Batas yang ditetapkan berikut merupakan proposal; review readiness existing dan policy/grants tidak berubah.

## Review Focus

- Delta ambigu atau operation upstream belum implementasi: reject eksplisit, jangan silent no-op (Task 1).
- Counterexample dengan evidence lemah: proposal/pending saja, bukan menghapus lesson (Task 2).
- Target direvisi/pindah workspace saat review: stale dan perlu review ulang (Task 2).
- Dua controller mengirim delta identik: satu checkpoint/candidate outcome, bukan dua support (Task 2).
- Satu candidate gagal di batch: pertahankan partial success, unresolved review dan semua record unrelated (Task 3).

## Grounding, dampak, lisensi

Referensi [ACE, Apache-2.0](https://github.com/ace-agent/ace/tree/82709de050e1db6e6ef2f07bcb0393560b94992a), commit `82709de050e1db6e6ef2f07bcb0393560b94992a`.
- `ace/ace.py`, `ace/core/{generator,reflector,curator}.py` memisahkan peran; `playbook_utils.py::update_bullet_counts` memberi feedback counter.
- `playbook_utils.py::apply_curator_operations` mengimplementasikan ADD; UPDATE/MERGE/CREATE_META/DELETE masih TODO. Plan ini tidak menyalin operasi yang belum ada atau mengklaim mutation komplet dari paper.
- Baseline `src/learning/curator.ts::LearningCurator.propose` sudah menghasilkan bounded proposal (maksimum 100), tidak menulis knowledge. `review.ts::LearningReviewCoordinator.review`, `service.ts::LearningService.review` dan `memory-sink.ts::MemoryLearningSink.capture` sudah menangani review, attribution dan persistence.
- Existing `agent-learning-loop.ts` dan skill proposal owner mengurus procedure readiness. Tidak ada jalan pintas dari playbook delta menjadi active Skill.

Dampak yang dituju: perubahan dapat diaudit, regressions satu lesson tidak menghapus lesson lain. Efektivitas reasoning dan biaya belum dibuktikan. Adaptasi ide saja; bila code disalin kelak, audit Apache LICENSE/NOTICE dan attribution. Tidak mengunduh submodule ace-appworld atau menjalankan training/benchmark.

## Ownership dan dependensi

- Plan16 memiliki `src/learning/curation-delta.ts` baru dan extension terbatas `curator.ts`, `service.ts`, `types.ts` untuk delta envelope; review/sink tetap canonical.
- Task2 Plan17 (`candidate-purpose.ts`) adalah prasyarat kecil yang diimplementasikan terlebih dahulu; tidak perlu menunggu seluruh Plan17. Plan17 memiliki pemisahan isi candidate dan validator capsule; interface Plan17 dipakai sebelum delta menjadi LearningCandidate, bukan digandakan.
- Plan15 memiliki project synthesis persistence; Plan16 tidak memiliki renderer/synthesis atau invalidation cache.
- Plan12 memiliki session lifecycle. Plan05 tetap pemilik evaluasi manfaat; fixture di sini hanya correctness.
- Integrasi `types.ts`/`service.ts` lintasplan serial dan preserve fields tambahan; tidak reformat file besar.

### Task 1: Contract delta additive yang bounded

**Files:** Create `src/learning/curation-delta.ts`; Modify `src/learning/types.ts`; Test `tests/learning-curation-delta.test.ts`.

**Interfaces (PROPOSED):** `CurationDelta = {operationId:string; checkpointKey:string; taskId:string; workspace:string; entries:Array<{kind:'add-lesson'|'add-counterexample'; target?:{id:string; revision:string}; candidate:LearningCandidate}>}`; `validateCurationDelta(value:unknown):CurationDelta`; `curationDeltaFingerprint(delta:CurationDelta):string`. Revision menggunakan semantic digest owner existing, bukan tanggal. Counterexample wajib target; lesson boleh target hanya bila refinement eksplisit.

- [ ] RED: 1–8 entries, serialized UTF-8 <=8192 bytes, tiap candidate <=2048 UTF-8 bytes, evidenceRefs 1–8, duplicate entries ditolak; 9 entries/8193 bytes reject. Unknown operation UPDATE/MERGE/DELETE/CREATE_META reject; malformed target reject.
- [ ] Run `npm test -- tests/learning-curation-delta.test.ts`; expected FAIL karena helper belum ada.
- [ ] Implement pure validation dan stable fingerprint; reuse candidate/evidence safety existing. Unicode tetap utuh; tidak memotong evidence atau mengubah candidate menjadi verified.
- [ ] Ulangi command; expected PASS termasuk injection-like source sebagai data tidak dipercaya.
- [ ] Review dan commit scoped hanya bila implementasi/commit diotorisasi.

### Task 2: Hubungkan proposal dengan existing checkpoint review

**Files:** Modify `src/learning/curator.ts`, `src/learning/service.ts`, `src/learning/curation-delta.ts`; Test `tests/learning-curation-delta-review.test.ts`.

**Interfaces (PROPOSED):** `LearningService.reviewDelta(delta:CurationDelta, explicit?:boolean):ReturnType<LearningService['review']>`. Method ini adapter ke `review`, bukan reviewer/persistence baru. Consume target identity/revision via current Memory owner; candidateId diturunkan dari operationId+entry fingerprint, checkpointKey/taskId melewati options existing sesudah dibandingkan dengan binding host trusted; taskId/workspace dalam delta tidak boleh memilih otoritas sendiri. `LearningCurator.propose` tetap tanpa side effect; delta hanya datang dari controller yang sudah terikat task/workspace.

- [ ] RED: target current accepted review; target stale/deleted/cross-workspace ditolak sebelum capture; numeric helpful=1000 tidak melewati evidence gate; raw verified=true tanpa replayable evidence tetap nonaccepted. Replay checkpoint+operation identik tidak menambah support atau record.
- [ ] Run `npm test -- tests/learning-curation-delta-review.test.ts`; expected FAIL.
- [ ] Implement adapter di owner Learning; validate target pada commit path existing, jangan check-then-write di writer independen. Jika existing sink tidak dapat CAS target reference, simpan counterexample sebagai proposal pending dan return awaiting-verification, bukan mengklaim applied mutation.
- [ ] Ulangi command; expected PASS. Existing review tetap mengurus partial outcome/idempotency dan independent verification; counterexample tidak otomatis retire target atau activate Skill.
- [ ] Review/commit scoped; dokumentasikan state pending yang sengaja belum menjadi knowledge mutation.

### Task 3: Preservation, failure recovery dan bounded acceptance

**Files:** Test `tests/learning-curation-delta-preservation.test.ts`; Modify `src/learning/curation-delta.ts` hanya bila fixture menemukan gap; update affected `docs/CODEBASE.md` saat implementasi.

**Interfaces:** Consume Task1/2, existing `LearningService.review` outcome dan state. Tidak menambah batch-wide overwrite atau storage schema.

- [ ] RED: fixture tiga unrelated lessons tetap content/revision-identical sesudah add lesson/counterexample; satu sink failure mempertahankan accepted sibling dan pending failed candidate. Retry hanya unresolved candidate tidak menggandakan accepted sibling; task yang sama dari dua controller tetap satu support.
- [ ] Run `npm test -- tests/learning-curation-delta-preservation.test.ts`; expected FAIL untuk jaminan baru yang belum ada; bila sudah PASS, pertahankan sebagai regression dan jangan mengarang perubahan runtime.
- [ ] Implement hanya gap preservation terbukti; reference counterexample mempertahankan evidence negatif terlihat dan reuseCondition spesifik, tanpa rewrite seluruh registry.
- [ ] Ulangi command lalu `npm test -- tests/learning-finalization-continuity.test.ts tests/learning-review-summary.test.ts tests/agent-cumulative-learning.test.ts`; expected PASS. Tidak ada heavy benchmark atau live LLM.
- [ ] Review/commit scoped serta lampirkan evidence actual; correctness PASS bukan klaim helpfulness meningkat.

## Compatibility, rollback, versi dan handoff Windows nanti

- Dokumentasi ini: no product-version change. Implementasi API additive: assess minor/prerelease, release intent/changelog/version surfaces existing; tidak bump sekarang.
- Existing review caller tanpa delta tidak berubah. Delta unsupported diperlakukan pending/rejected eksplisit; jangan kehilangan checkpoint, menambahkan reviewer kedua atau menurunkan verification policy.
- Rollback mematikan adapter delta; existing accepted records, audit, counterexample dan pending reviews tetap disimpan. Tidak perlu clean whole working tree; preserve unrelated edits, stop konflik scoped. Tidak membuat backup/stash/runtime temporary baru.
- Handoff repo `Black-Project-Agent-Core/Agent-Core` harus menyebut branch serta exact eventual pushed SHA verified; source SHA berbeda dari running build/Release.
- Windows: discover nama remote/branch aktual (jangan mengasumsikan `origin`); fetch exact SHA → inspect local edits → integrate canonical scoped → build → activate existing host → verify running identity → test duplicate/stale/partial-success/counterexample → status PASS/FAIL/BLOCKED/NOT RUN.
- Hasil berupa ZIP sanitized di luar temporary: logs, source/build identity, file inventory, functional evidence, manifest path/size/SHA-256 dan pemeriksaan ulang sesudah fresh extraction. Jangan sertakan secret/private Memory. Tidak melakukan langkah Windows ini sekarang.
