# Memory 15 — Hindsight Evidence Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Draft / PROPOSED; dokumen rencana, bukan kemampuan yang sudah aktif.

**Goal:** Menyimpan sintesis proyek kecil dengan lineage per klaim, lalu menolak pemakaian sebagai fakta terkini ketika dependency berubah.

**Architecture:** Sintesis adalah satu Memory record existing, diusulkan controller dan diterapkan hanya oleh MemoryPromotion. Helper murni memvalidasi envelope dan freshness; tidak ada database, writer, scheduler reflect, atau LLM tersembunyi baru. Preview, host review, CAS, archive dan receipts tetap milik owner existing.

**Tech Stack:** TypeScript, Node >=24.15.0, Zod dan Vitest existing; tanpa dependency baru.

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

- Baseline inspeksi: `957077fab260dd58d0cc7cfc0881172d05f84667`; runtime Memory Linux tidak tersedia. Tidak mengakses/mengaktifkan Windows dalam pekerjaan perencanaan.
- Memory-first, host task/workspace binding, verification independen, review dan satu canonical writer tetap wajib; jangan menciptakan Memory sementara pengganti.
- Hanya rencana; tidak menjalankan test/build, install, benchmark berat, commit, push, deployment atau migrasi sekarang.
- Sintesis tetap advisory; source resolution tidak sama dengan semantic verification. Secret, instruksi sumber dan raw reasoning bukan isi yang boleh dipromosikan.
- Nilai batas di bawah adalah proposal baru, bukan klaim default upstream atau implementasi baseline.

## Review Focus

- Sumber dihapus setelah preview: apply gagal tanpa merusak sintesis terakhir (Task 2).
- Sumber berubah tetapi ID tetap: current recheck memakai revision, bukan timestamp saja (Task 2).
- Unicode dan satu klaim besar: hitung byte UTF-8; jangan memotong klaim atau citation (Task 1).
- Sumber di workspace lain atau siklus self-reference: tolak, jangan perluas scope (Task 1/2).
- Refresh tanpa evidence baru/gagal: pertahankan record lama, tampilkan stale/unknown secara jujur (Task 3).

## Grounding, manfaat dan batas

Referensi: [Hindsight, snapshot MIT](https://github.com/vectorize-io/hindsight/tree/a9eeed77f9bce99d8f97d39a30d3281747300824).
- `hindsight-api-slim/hindsight_api/engine/memory_engine.py::_execute_mental_model_refresh` memisahkan perhitungan tanpa write dari persist; `refresh_mental_model` dan `dry_run_refresh_mental_model` berbagi executor.
- `engine/mental_model_refresh.py` memodelkan full/delta, snapshot watermark dan outcome preserved/failed. `compute_mental_model_is_stale` memeriksa perubahan scope dan retracted grounding; batch-list check tidak identik dengan single-model check. Jangan mengklaim watermark saja mendeteksi penghapusan.
- `engine/reflect/agent.py` memiliki pencarian/baca mental model dan budget. Ini bukan izin menyalin autonomous reflect atau menjadikan mental model authority.
- Baseline `src/agent-knowledge-synthesis.ts::buildKnowledgeSynthesisPacket` sudah menyusun packet sementara. `SubProject/agent-core-memory/src/memory/{promotion,episodes,capsule,provenance}.ts` sudah memiliki promotion, scoped snapshots, capsule dan lineage. Gap yang ditargetkan adalah sintesis proyek persist dan validasi dependency saat reuse, bukan retrieval/RRF baru.

Dampak diharapkan: mengurangi sintesis ulang yang tidak perlu sambil membuat pembatalan klaim dapat diperiksa. Manfaat latency/quality belum dibuktikan. Adaptasi ide TypeScript; tidak vendor Python/PostgreSQL atau copy source. Salinan substansial kelak wajib mempertahankan MIT notice.

## Ownership dan dependensi

- Plan15 memiliki `memory/project-synthesis.ts` baru dalam subproject, hook khusus sintesis di `promotion.ts`, dan fixture di bawah.
- Plan12 memiliki lifecycle sesi; Plan13 memiliki capture/commit dan Plan14 memiliki query validAt/knownAt. Plan15 tidak mengubah kebijakan tersebut.
- Plan16 memiliki delta Learning; Plan17 memiliki integritas isi capsule. Integrasi pada file shared dilakukan serial, tanpa menimpa perubahan antarplan.
- Plan05 tetap owner evaluasi dampak; existing Plan01–11 eligibility/ranking tidak dilonggarkan.
- `controller-session.ts` subproject menambahkan read-time gating sintesis pada `recall` sebelum ranking/disclosure; koordinasikan hunk shared dengan Plan14. Tidak mengganti retrieval engine atau public tool schema.

### Task 1: Envelope sintesis bersumber yang bounded

**Files:** Create `SubProject/agent-core-memory/src/memory/project-synthesis.ts`; Test `SubProject/agent-core-memory/tests/memory-project-synthesis.test.ts`.

**Interfaces (PROPOSED):** `ProjectSynthesis = {schemaVersion:1; projectKey:string; claims:Array<{text:string; refs:SourceRef[]}>; gaps:string[]}`; `encodeProjectSynthesis(value:ProjectSynthesis):string`; `decodeProjectSynthesis(content:string):ProjectSynthesis|null`; `buildProjectSynthesisAction(input:{actionId:string; value:ProjectSynthesis; experience:RecordExperience; target?:SourceRef}):ConsolidationProposal['actions'][number]`. Import existing SourceRef, RecordExperience dan ConsolidationProposal; output create/amend existing, category `project-synthesis`, content envelope JSON, sourceRefs exact union. `experience` tidak boleh berstatus controller-asserted verified.

- [ ] RED: assert 1–16 claims, 1–32 unique total refs dan encoded content <=8192 UTF-8 bytes; 17 claims/33 refs/8193 bytes ditolak; satu klaim wajib mempunyai refs; malformed envelope tidak diinterpretasikan sebagai synthesis valid.
- [ ] Run `npm --prefix SubProject/agent-core-memory test -- tests/memory-project-synthesis.test.ts`; expected FAIL karena interface belum ada.
- [ ] Implement helper pure; pertahankan teks/citation utuh, reject unknown keys dan self-target reference. Semua refs harus tercakup pada inputRefs action; tidak menebak evidence dari prose.
- [ ] Ulangi command; expected PASS termasuk emoji/multibyte dan stable serialization.
- [ ] Review diff task dan commit scoped hanya bila implementasi/commit telah diotorisasi; jangan stage perubahan lain.

### Task 2: Persist melalui promotion dan periksa dependency saat apply

**Files:** Modify `SubProject/agent-core-memory/src/memory/promotion.ts`; Test `SubProject/agent-core-memory/tests/memory-project-synthesis-promotion.test.ts`.

**Interfaces:** Consume helper Task1 dan `MemoryPromotion.prepare(scope, input)` / `apply(scope, input)` existing. Tidak membuat apply kedua. Tambahkan invariant internal untuk action category `project-synthesis`: refs input/evidence sesuai envelope; dependency current memakai existing readSet/CAS. Historical artifact refs tetap exact revision, resolvable dan eligible; tidak dipalsukan sebagai current mutable Memory.

- [ ] RED: prepare synthesis lalu amend/delete/pindah-scope satu sumber sebelum apply menghasilkan conflict/unavailable; target dan record unrelated tetap byte-identical. Dua apply operationId sama mengembalikan receipt replay, bukan record kedua.
- [ ] Run `npm --prefix SubProject/agent-core-memory test -- tests/memory-project-synthesis-promotion.test.ts`; expected FAIL untuk invariant baru.
- [ ] Implement validasi khusus synthesis pada prepare dan final transaction recheck; gunakan `promotionSnapshot`, `readSet`, existing host review dan `transact` existing. Jangan menyimpan envelope sebelum semua guard sukses.
- [ ] Ulangi command lalu `npm --prefix SubProject/agent-core-memory test -- tests/memory-promotion.test.ts tests/memory-promotion-recovery.test.ts`; expected PASS tanpa perubahan ordinary promotion.
- [ ] Review/commit scoped sesuai otorisasi; catat tidak ada migration/persistent schema baru.

### Task 3: Reuse gated, fallback dan acceptance kecil

**Files:** Modify `SubProject/agent-core-memory/src/memory/project-synthesis.ts`, `SubProject/agent-core-memory/src/memory/controller-session.ts`; Test `SubProject/agent-core-memory/tests/memory-project-synthesis-reuse.test.ts`; update affected `docs/CODEBASE.md` saat implementasi.

**Interfaces (PROPOSED):** `checkProjectSynthesisDependencies(value:ProjectSynthesis, resolve:(ref:SourceRef)=>Promise<'current'|'stale'|'unavailable'>):Promise<{status:'current'|'stale'|'unknown'; invalidRefs:SourceRef[]}>`. Resolver berasal scoped host/source owner existing, tidak filesystem reader baru. Controller recall consumer menahan synthesis stale/unknown dari primary recall; ordinary eligible source records tetap tersedia, tanpa extra model call. Record ber-category synthesis tetapi envelope malformed dianggap unknown dan tidak lolos sebagai ordinary note.

- [ ] RED: unchanged dependencies membolehkan reuse; satu changed ref menolak; unavailable resolver menjadi unknown; unrelated source edit tidak membatalkan; jumlah resolution <=32; legacy note tidak berubah. Failed/empty proposed refresh tidak overwrite last good synthesis.
- [ ] Run `npm --prefix SubProject/agent-core-memory test -- tests/memory-project-synthesis-reuse.test.ts`; expected FAIL.
- [ ] Implement check pada selection sintesis; budget resolver shared dengan request existing, tidak retry tanpa batas. Jika budget habis, status unknown dan fail-soft ke recall existing; tidak menyatakan klaim current.
- [ ] Ulangi command; expected PASS. Jalankan build yang relevan hanya pada fase implementasi terotorisasi; fixture lokal kecil cukup, tanpa model/benchmark.
- [ ] Review/commit scoped serta catat outcome/version dan evidence aktual.

## Compatibility, rollback, versi dan Windows handoff nanti

- Rencana saja: no product-version change. Implementasi additive opt-in: assess minor/prerelease pada release intent existing; jangan bump sekarang. Selaraskan version surfaces, changelog dan CODEBASE pada implementasi.
- Record menggunakan schema existing; reader lama tetap melihat advisory JSON text. Legacy mode tidak menerima bypass promotion v2; capability unavailable tetap BLOCKED, bukan writer alternatif.
- Rollback menonaktifkan consumer sintesis dan kembali ke recall existing; jangan hapus canonical records/history atau rollback workspace wholesale. Scope konflik per file; tidak perlu whole working tree bersih, stash atau backup baru.
- Handoff wajib memakai repository `Black-Project-Agent-Core/Agent-Core`, branch dan exact eventual pushed SHA yang diverifikasi, bukan menganggap baseline ini sudah terpasang.
- Windows: discover nama remote/branch aktual (jangan mengasumsikan `origin`); fetch SHA verified → inspect perubahan lokal relevan → integrasi scoped ke checkout canonical, stop pada konflik → build Memory lalu host → aktivasi melalui owner existing → verifikasi running build identity → functional tests stale/delete/replay/scope → report PASS/FAIL/BLOCKED/NOT RUN.
- ZIP sanitized di luar direktori temporary: logs, identity source/build, daftar file berubah, evidence functional, manifest path/size/SHA-256; fresh extraction dan hash check. Tidak membuat runtime sementara, backup/stash baru, atau menyertakan private Memory/secrets.
