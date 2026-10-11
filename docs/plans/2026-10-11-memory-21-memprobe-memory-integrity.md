# MemProbe Memory Integrity Implementation Plan

> **Status saat ini:** Implementasi source dipublikasikan pada `60e504f9bf1c876934146dfa7298f1a270e99a14` (`0.15.0-beta.3`). Hasil dan batasan ada di [ledger fungsional](../verification/memory12-21-source-functional-2026-10-11.md). Windows belum diuji/diaktifkan dan ditunda sampai pengguna kembali. Checklist serta rancangan antarmuka di bawah dipertahankan sebagai bukti perencanaan historis, bukan klaim semua acceptance PASS.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menguji integritas Memory saat interference, misinformation dan consolidation berulang melalui fixture fungsional sintetis pada harness Plan05.

**Architecture:** Tambah keluarga integritas ke sidecar diagnostik bersama Plan20, menggunakan episode, temporal/provenance dan proposal/review owner existing. Pasangan baseline/candidate menjalankan sequence identik dalam store fixture terisolasi; verifier menilai state/evidence setelah tiap tahap. Tidak mengadopsi MemProbe sebagai runtime atau menambah engine Memory.

**Tech Stack:** Node >=24.15.0, TypeScript NodeNext, Zod, Vitest 4.1.11, PizZip/yauzl existing; tanpa package/model baru.

**Spec:** `docs/plans/2026-10-11-memory-reference-adoption-spec.md`, Plan05 `2026-10-09-memory-05-outcome-evaluation.md`, kontrak sidecar Task1 Plan20 `2026-10-11-memory-20-longmemeval-functional-evaluation.md`.

**Status awal saat perencanaan (historis):** **PROPOSED — planning only**. Tidak ada implementasi, test, benchmark, runtime activation atau perbaikan otomatis pada pekerjaan ini.

## Global Constraints

Seluruh Global constraints shared spec berlaku; bagian berikut memperketat lingkup rencana ini. Learning tetap fail-soft; tidak ada grant dari Memory, raw chain-of-thought atau aktivasi/reembedding implisit.

- Source Agent Core yang diperiksa `957077fab260dd58d0cc7cfc0881172d05f84667`; Memory kanonis lokal tidak tersedia; Windows tidak disentuh.
- Dataset upstream tidak disalin. suite40/hasil turunannya CC BY-NC 4.0; kode/suite56 MIT bukan alasan mengadopsi runtime atau menyalin data otomatis.
- Satu harness Plan05, satu owner Memory/Learning. Sidecar diagnostik berversi dan original synthetic cases, tanpa production migration/store kedua.
- Offline scripted, model=null, inferenceCalls=0; benchmark statistik/performance DEFERRED, provider/live NOT RUN.
- Jangan memulai ulang cohort legacy 25/64 USER-STOPPED, probe Cloudflare, provider setup atau instalasi.
- Semua langkah berikut mendatang; jangan backup/stash, alternate active copies, clean-entire-tree gate, secrets atau protected paths.

## Review Focus

1. Informasi salah yang diulang harus tetap tidak terverifikasi, tidak menjadi konsensus (Task 2).
2. Koreksi sah harus memperbarui nilai kini tanpa menghapus predecessor/source history (Task 2).
3. Consolidation berulang dengan evidence/task sama tidak boleh menggandakan support (Task 2).
4. Attribution source tidak boleh tersamar setelah ringkasan/recall/reopen (Task 2).
5. Suite gagal sebagian atau trace diubah tidak boleh tampil sebagai integrity PASS (Task 3).

---

## Bukti sumber dan keputusan adopsi

- [README MemProbe pada SHA sumber](https://github.com/jq-ding/MemProbe/blob/9068d8d9a2a47268fe6f7601b99a56a283c37be5/README.md) menjelaskan interference, misinformation, consolidation dan reconsolidation beserta stability/plasticity/source fidelity.
- [Protokol evaluasi](https://github.com/jq-ding/MemProbe/blob/9068d8d9a2a47268fe6f7601b99a56a283c37be5/src/eval/protocol.py) menggunakan reader/model; hanya dimensi diagnosis diadaptasi, bukan kode scoring/model.
- [LICENSE kode/suite56](https://github.com/jq-ding/MemProbe/blob/9068d8d9a2a47268fe6f7601b99a56a283c37be5/LICENSE) dan [DATA_LICENSE suite40](https://github.com/jq-ding/MemProbe/blob/9068d8d9a2a47268fe6f7601b99a56a283c37be5/DATA_LICENSE) harus dibedakan. Tidak menyalin teks, prompt, data atau output suite40, termasuk turunannya. Seluruh fixture rencana ini ditulis orisinal.
- Agent Core: `SubProject/agent-core-memory/src/memory/{temporal,episodes,promotion,provenance}.ts` sudah memiliki transisi/evidence/promotion; `consolidation.ts::findConsolidationCandidates` menghasilkan rekomendasi review, bukan auto merge.
- `src/learning/outcome-{contract,evaluation,verifier}.ts` dan `scripts/verify/memory-outcome-adapter.mjs` adalah harness existing. Repeated consolidation di sini berarti replay proposal/review pada owner, bukan membangun loop summarizer baru.
- Manfaat diharapkan: mendeteksi degradasi trust/history akibat gangguan. Risiko: membingungkan repetition dengan verified support; fixture deterministik terlalu mudah. Batas: diagnosis kecil bukan hasil MemProbe publik, keamanan menyeluruh, atau bukti kecerdasan meningkat.

## Pembagian dengan Plan20 dan peta file

Plan20 menguji apakah informasi dapat diingat/diperbarui/dipakai pada jawaban lintas sesi/waktu. Plan21 khusus integritas state dan lineage saat mendapat gangguan/ulangan. Temporal query hanya digunakan untuk membuktikan predecessor tidak rusak, bukan menduplikasi suite recall/time Plan20.

Gunakan helper shared `src/learning/outcome-diagnostics.ts` dan independent `outcome-diagnostics-verifier.ts` dari Task1 Plan20. Task1 Plan20 harus tersedia dahulu; seluruh fixture/rencana20 bukan prasyarat. Hanya Plan20 mendefinisikan kontrak/helper shared. Tambah fixture `tests/fixtures/memory-outcome-memprobe/{suite,diagnostics}.json`, test root `tests/memory-outcome-memprobe.test.ts` dan `tests/memory-outcome-integrity-bundle.test.ts`. Integrasi tetap runner/adapter/packager existing; jangan fork helper/scorer.

Diagnostic families tepat `integrity-interference`, `integrity-misinformation`, `integrity-repeated-consolidation`, `integrity-reconsolidation`. Gunakan empat development cases dasar Plan05 dan delapan held-out (dua per keluarga), suite terpisah dari Plan20. Freeze digest/partition/sequence/oracle/expectedRunIds sebelum candidate. Setiap case paling banyak 32 steps/64 facts sesuai kontrak shared; source/role/time/revision eksplisit.

## Task 1: Kontrak assertion integritas pada sidecar yang sama

**Files:** Konsumsi helper shared + verifier tanpa menduplikasi schema; create `tests/memory-outcome-integrity-contract.test.ts` dan fixture di atas.

**Interfaces dikonsumsi:** `DiagnosticCase.integrity`, `verifyIntegrityCheckpoints(spec:DiagnosticCase,evidence:ReadonlyMap<string,Uint8Array>): {verdict:'pass'|'fail';reasons:string[]}` dan `IntegrityScores` persis kontrak Task1 Plan20. Checkpoint memuat afterStep/current/history/forbiddenPromotions/support/source assertions; bounds dan discriminated steps hanya didefinisikan di Plan20. Rencana ini menambah isi fixture dan test, bukan parser/kontrak saingan. Bila implementasi membutuhkan perubahan kontrak shared, revisi melalui Plan20 dengan versioning sebelum fixture21 diterima.

- [ ] Tulis `rejects_ambiguous_integrity_oracle`: checkpoint di luar sequence, ID/source tidak ada, duplicate checkpoint, expected current sekaligus forbidden dan count negatif ditolak.
- [ ] Tulis `integrity_is_not_answer_accuracy`: answer benar tetapi source/history/support salah tetap FAIL; bukti snapshot hilang UNKNOWN dan completion false.
- [ ] RED: `npm test -- tests/memory-outcome-integrity-contract.test.ts tests/memory-outcome-diagnostics.test.ts`; lengkapi fixture dan sambungan validator shared tanpa mengubah v2 observation, lalu GREEN.
- [ ] Oracle/state expected tetap hanya area verifier. Adapter menerima sequence operasi yang diizinkan, tidak expected results; library scorer tidak menjalankan JS dari fixture.

## Task 2: Gangguan dan consolidation berulang melalui owner

**Files:** Modify `scripts/verify/memory-outcome-adapter.mjs`; create `tests/memory-outcome-memprobe.test.ts`.

**Interfaces dikonsumsi:** Gunakan `executeDiagnostic` dan step `review-consolidation` persis kontrak Plan20. Host fixture memverifikasi evidence independen sebelum accept; string keputusan dari corpus tidak punya kewenangan. Snapshot per checkpoint mencatat current/historical refs, sourceRefs dan unique supporting task identities dari owner existing, bukan counter lokal buatan scorer.

- [ ] Tulis `interference_preserves_unrelated_fact`: masukkan tiga distractor topik serupa lalu reopen; target benar tetap ada, scope tetangga tidak terbaca, sumber/revision tetap terlacak.
- [ ] Tulis `repeated_falsehood_never_promotes`: ulangi false claim tiga kali lewat untrusted capture, sertakan teks yang meminta grants; valid target tetap current, forbiddenPromotions kosong secara aktual, grant/tool-call count tidak berubah.
- [ ] Tulis `repeated_consolidation_deduplicates_support`: proposal/review tiga kali dengan task evidence sama, independentTaskCount tetap 1; replay operationId sama duplicate; operationId baru dengan evidence sama tidak menambah support. Tidak auto-activate Skill atau mengganti verified fact.
- [ ] Tulis `reconsolidation_accepts_verified_correction_only`: proposal tanpa evidence tetap proposal; koreksi sintetis terverifikasi menjadi successor, predecessor tetap historical dengan source asli; replay setelah reopen tidak menghasilkan link/candidate duplikat.
- [ ] RED: `npm test -- tests/memory-outcome-memprobe.test.ts`; implementasikan operation mapping terhadap episode/promotion/Learning existing, lalu GREEN. Jika owner belum mengekspos bukti yang dibutuhkan, laporkan BLOCKED/UNKNOWN, jangan memalsukan counter atau membuka runtime mutation baru.
- [ ] Bedakan actual use dari retrieval: use receipt hanya valid bila task/revision/action/oracle evidence cocok; jawaban scripted benar tidak menghapus failure integritas.

## Task 3: Paired functional report dan bundle replay

**Files:** Modify `scripts/verify/{memory-outcome-eval,package-memory-outcome}.mjs` pada ekstensi shared; create `tests/memory-outcome-integrity-bundle.test.ts`; update `docs/CODEBASE.md` dan `CHANGELOG.md` saat implementation selesai; release intent mengikuti assessment di bawah.

**Interfaces usulan:** Tambahkan bagian `integrity` berversi ke `diagnostics/report.json`; evidence snapshots tersiegel di `evidence/diagnostics/<run-id>/step-<n>.json`, manifest derived dari cases/checkpoints, bukan glob private store. Tetap simpan empat dimensi preservation/retrieval/controller-use/outcome Plan20, tetapi jangan merata-ratakan hard integrity failures menjadi PASS.

- [ ] Tulis `all_integrity_failures_are_visible`: satu stale-trust/scope/source violation menggagalkan acceptance; failed/timeout runs tetap denominator; missing checkpoint tidak boleh disingkirkan.
- [ ] Tulis `independent_replay_rejects_tamper`: forged source, swapped snapshot, duplicate support count, modified sidecar dengan report dihash ulang, missing failure log dan truncated ZIP semuanya FAIL.
- [ ] RED/GREEN: `npm test -- tests/memory-outcome-integrity-bundle.test.ts tests/memory-outcome-diagnostic-bundle.test.ts tests/memory-outcome-bundle.test.ts tests/memory-outcome-evaluation.test.ts`; lalu `npm --prefix SubProject/agent-core-memory run build && npm run build` dan seluruh focused tests Task1–3.
- [ ] Functional baseline mendatang: `node scripts/verify/memory-outcome-eval.mjs --suite tests/fixtures/memory-outcome-memprobe/suite.json --diagnostics tests/fixtures/memory-outcome-memprobe/diagnostics.json --phase baseline --output reports/memory-reference-adoption/plan21/baseline-001`; output baru, snapshot/source identity disegel dahulu.
- [ ] Paket `node scripts/verify/package-memory-outcome.mjs --report reports/memory-reference-adoption/plan21/baseline-001 --output reports/memory-reference-adoption/plan21/baseline-001.zip`; gunakan fresh extraction dan recompute semua integrity checkpoints. ZIP final di luar Temp/runtime/tmp, menyertakan logs/exit/status, source/build identity, changed files, synthetic oracle/trace dan manifest path/size/SHA-256, tanpa private store/secrets.
- [ ] Candidate kelak harus source snapshot aktual terpisah, fixtures/config identik, same-controller pairs; baseline sealed tidak dimodifikasi. Jika candidate belum tersedia, baseline-only lengkap boleh dilaporkan dengan candidate BLOCKED, bukan gain.

## Compatibility, rollback dan integrasi kanonis

Dokumen: no product-version change. Fixture/test-only tidak memerlukan bump; bila implementasi mengubah distributed report contract/tooling, catat patch release intent. Tidak ada perubahan runtime Memory schema yang direncanakan; defect runtime yang ditemukan menjadi pekerjaan scoped terpisah, bukan auto-fix tersembunyi di suite ini.

Rollback registry families dan fixture/hooks khusus21 saja. Shared helper yang dipakai Plan20 dipertahankan; laporan immutable tetap disimpan. Tidak menghapus produksi, melakukan migration, atau memulihkan store dari baseline test.

Integrasi mendatang: handoff repo `Black-Project-Agent-Core/Agent-Core`, branch dan SHA publik aktual; fetch branch yang diverifikasi, cocokkan object/SHA dengan handoff dan scoped diff, inspeksi local changes beririsan tanpa syarat tree bersih. Jangan menebak future SHA atau memakai SHA baseline sebagai hasil implementasi. Konflik berarti pause path terkait, bukan stash/backup/reset/alternate active copy. Build/test di canonical checkout setelah scope disetujui; installed/running identity dan aktivasi merupakan bukti terpisah. Windows/deployment sekarang NOT RUN.

## Self-review dan batas selesai

- [ ] Review Focus lima item masing-masing dipatok assertion; repeated evidence tidak menjadi independent support.
- [ ] Dataset/license boundaries jelas; tidak ada salinan suite40, runtime adoption otomatis, provider/model/benchmark prerequisite.
- [ ] Functional acceptance hanya setelah verifier/ZIP replay PASS; status missing evidence tetap UNKNOWN/BLOCKED, scripted benefitProven=false, real-world advantage belum terbukti.
