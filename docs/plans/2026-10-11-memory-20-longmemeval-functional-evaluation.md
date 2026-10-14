# LongMemEval Functional Evaluation Implementation Plan

> **Status saat ini:** Implementasi source dipublikasikan pada `60e504f9bf1c876934146dfa7298f1a270e99a14` (`0.15.0-beta.3`). Hasil dan batasan ada di [ledger fungsional](../verification/memory12-21-source-functional-2026-10-11.md). Windows belum diuji/diaktifkan dan ditunda sampai pengguna kembali. Checklist serta rancangan antarmuka di bawah dipertahankan sebagai bukti perencanaan historis, bukan klaim semua acceptance PASS.
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah keluarga functional test sintetis untuk recall lintas sesi, update, waktu dan abstention ke harness Plan05 tanpa benchmark berat.

**Architecture:** Pertahankan suite/observation v2 Plan05 yang strict, tambah sidecar diagnostik berversi dan terikat digest untuk skenario multi-event. Runner, isolated owner, verifier independen dan ZIP tetap milik Plan05. Pisahkan bukti preservation, retrieval, controller-use dan outcome; jawaban scripted tidak dianggap peningkatan reasoning.

**Tech Stack:** Node >=24.15.0, TypeScript NodeNext, Zod, Vitest 4.1.11, PizZip/yauzl existing; tanpa Python, GPU, dependency atau API baru.

**Spec:** `docs/plans/2026-10-11-memory-reference-adoption-spec.md`; kontrak dasar `2026-10-09-memory-05-outcome-evaluation.md`.

**Status awal saat perencanaan (historis):** **PROPOSED — planning only**. Tidak ada implementasi, test, benchmark atau provider execution pada pekerjaan ini.

## Global Constraints

Seluruh Global constraints shared spec berlaku; bagian berikut memperketat lingkup rencana ini. Learning tetap fail-soft; tidak ada grant dari Memory, raw chain-of-thought atau aktivasi/reembedding implisit.

- Baseline Agent Core `957077fab260dd58d0cc7cfc0881172d05f84667`; Memory kanonis checkout tidak tersedia dan Windows tidak disentuh.
- Harness Plan05 sudah diimplementasikan. Jangan membuat runner, store atau evaluator LLM paralel; gunakan owner experience-v2 existing dengan root fixture terisolasi.
- Fixture sintetis orisinal; jangan download dataset eksternal atau membuka oracle ke controller.
- Mode offline/scripted, model=null, inferenceCalls=0; heavy/performance benchmark DEFERRED dan live NOT RUN.
- Jangan melanjutkan cohort legacy 25/64 USER-STOPPED, `--continue`, atau probe Cloudflare yang dihentikan.
- Semua command berikut adalah rencana implementasi; jangan backup/stash, alternate active copies, clean-entire-tree gate atau memodifikasi private Memory.

## Review Focus

1. Fakta tersimpan tetapi tidak retrieved harus berbeda dari kegagalan preservation (Task 2).
2. Nilai lama benar pada waktu historis tetapi salah untuk pertanyaan sekarang (Task 2).
3. Jawaban unsupported/abstention tidak boleh dinilai memakai model judge atau label controller sendiri (Task 2).
4. Retrieved hit tanpa exact-revision use receipt tidak berarti controller menggunakan Memory (Task 3).
5. Sidecar/oracle diganti setelah seal harus membatalkan laporan meskipun skor terlihat baik (Task 1/3).

---

## Bukti sumber dan keputusan adopsi

- [README LongMemEval](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md) menetapkan information extraction, multi-session reasoning, knowledge updates, temporal reasoning dan abstention.
- [Evaluator QA](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py) memakai model judge; desain ini sengaja menggantinya dengan oracle lokal exact, bukan mengklaim skor sebanding dengan publikasi.
- [Metrik retrieval](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/print_retrieval_metrics.py) menjadi referensi pemisahan retrieval/QA. Kode upstream MIT; dataset Hugging Face dan LongMemEval-V2 di luar cakupan, tidak diunduh atau diasumsikan lisensinya.
- Source Agent Core: `src/learning/outcome-contract.ts` membatasi family enam nilai dan oracle engineering/research; `outcome-evaluation.ts` memisahkan usefulness/attribution; `outcome-verifier.ts` recompute independen. Memasukkan field baru ke v2 tanpa cabang kontrak akan ditolak.
- `scripts/verify/memory-outcome-{adapter,eval}.mjs` menyediakan isolated host, explicit policy, trace dan source seals; `package-memory-outcome.mjs` mengemas/verifikasi bukti. `SubProject/agent-core-memory/src/memory/{temporal,episodes,controller-session}.ts` tetap owner yang diuji.
- Manfaat diharapkan: diagnosis titik kegagalan lebih jelas. Risiko: synthetic overfitting, oracle leakage dan salah klaim manfaat. Batas: correctness fixture kecil tidak membuktikan kualitas percakapan panjang atau provider nyata.

## Kontrak dan peta file

Buat `src/learning/outcome-diagnostics.ts` dan `outcome-diagnostics-verifier.ts` sebagai ekstensi pure harness, bukan Memory runtime. Buat fixture di `tests/fixtures/memory-outcome-longmemeval/` dan test root `tests/memory-outcome-longmemeval.test.ts`; ubah adapter/runner/packager Plan05 untuk sidecar opt-in.

Sidecar `memory-diagnostics/v1` strict berisi `{version,suiteDigest,cases}`. Setiap case memiliki `{caseId,diagnosticFamily,steps,oracle}`; diagnosticFamily allowlist tepat `recall-extraction`, `recall-multi-session`, `recall-update`, `recall-temporal`, `recall-abstention`, `integrity-interference`, `integrity-misinformation`, `integrity-repeated-consolidation`, `integrity-reconsolidation`. Step adalah discriminated union: `capture`, `reopen`, `recall`, `answer`, `review-consolidation`. Capture memakai `{id,value,sourceId,effectiveAt,trust:'verified-fixture'|'untrusted-fixture',supersedes?:string}`; recall `{query,asOf?:string}`; answer `{answerMode:'current'|'historical'|'abstain'}`. Trust fixture hanya dipasang host adapter dari oracle evidence, tidak melalui teks controller. Review-consolidation reserved untuk Plan21 dan memakai proposal/review owner existing, tidak aktivasi otomatis.

Oracle memuat `{expectedPreservedIds:string[],expectedRetrievedIds:string[],expectedAnswer:{kind:'facts';facts:Array<{id,value,sourceId}>}|{kind:'abstain'},forbiddenIds:string[]}`. Bound per case 32 steps dan 64 facts; tanggal RFC3339 offset wajib. Sidecar tidak disalin ke workspace controller. Buat `DiagnosticObservation={caseId,runId,traceDigest,preservedRefs,retrievedRefs,useReceiptRefs,answer,evidenceRefs}` dengan refs exact id/revision/source/digest; semua skor diturunkan dari evidence file, bukan boolean self-report.

Kontrak shared juga mendefinisikan optional `integrity:{checkpoints:Array<{afterStep:number,expectedCurrentIds:string[],expectedHistoricalIds:string[],forbiddenPromotions:string[],expectedSupport:Array<{candidateId:string,independentTaskCount:number}>,expectedSources:Array<{id:string,sourceIds:string[]}>}>}`; maksimum 32 checkpoints, index unik/in-range. Step `review-consolidation` memiliki `{operationId:string,candidateId:string,taskEvidenceIds:string[],decision:'proposal-only'|'accept-verified'|'reject'}`. Plan21 hanya mengisi/menguji kontrak ini. Helper independen `verifyIntegrityCheckpoints(spec:DiagnosticCase,evidence:ReadonlyMap<string,Uint8Array>): {verdict:'pass'|'fail';reasons:string[]}` dan `IntegrityScores={stability,validUpdate,history,sourceFidelity,supportDeduplication}` memakai nilai PASS/FAIL/UNKNOWN + evidenceRefs. Bila sidecar v1 sudah dipublikasikan tanpa field ini, gunakan sidecar v2 backward-compatible, jangan mengubah arti v1 diam-diam.

Existing v2 family tetap kategori coarse yang sah (`relevant-reuse`, `user-correction`, `stale-evidence`, `irrelevant`); tampilkan diagnosticFamily terpisah agar tidak salah menyebut eksperimen sebagai enam keluarga standar. Empat development case Plan05 dipertahankan untuk preregistration; held-out baru terdiri 10 kasus (dua per lima keluarga). Bekukan suite, sidecar, corpus, oracle dan expectedRunIds sebelum candidate; perbandingan hanya pasangan cohort/domain/controller sama, semua failure tetap denominator.

## Task 1: Sidecar tervalidasi, tanpa mematahkan v2

**Files:** Create dua helper di atas, `tests/memory-outcome-diagnostics.test.ts`; modify runner `scripts/verify/memory-outcome-eval.mjs` hanya entry opt-in `--diagnostics FILE`.

**Interfaces usulan:** `parseOutcomeDiagnostics(raw:unknown,suite:OutcomeSuite): DiagnosticSuite`; `evaluateDiagnosticObservation(spec:DiagnosticCase,row:DiagnosticObservation): DiagnosticScores`; `verifyDiagnosticEvidence(specBytes:Uint8Array,rowBytes:Uint8Array,evidence:ReadonlyMap<string,Uint8Array>): {verdict:'pass'|'fail';reasons:string[]}`. Scores empat dimensi `{preservation,retrieval,controllerUse,outcome}` masing-masing `{status:'PASS'|'FAIL'|'UNKNOWN';evidenceRefs:string[]}`. Verifier tidak memanggil scorer.

- [ ] Tulis `sidecar_is_bound_and_strict`: suiteDigest salah, duplicate/foreign/missing caseId, family unknown, step ilegal, source missing, invalid integrity checkpoint dan lebih dari bound ditolak; sidecar hilang memakai jalur v2 lama identik.
- [ ] Tulis `forged_scores_cannot_validate`: flip verdict atau ganti evidence setelah rehash report tetap FAIL melalui recomputation oracle.
- [ ] RED: `npm test -- tests/memory-outcome-diagnostics.test.ts tests/memory-outcome-contract.test.ts`; implementasi helper/schema minimal lalu GREEN.
- [ ] Jangan mengubah literal `memory-outcome/v2`, frozen suite lama atau snapshot baseline. Untuk sidecar baru, hasil diagnostik ditulis sebagai artefak tambahan versioned, bukan field tak dikenal dalam observation v2.

## Task 2: Lima keluarga sintetis dan operasi owner nyata

**Files:** Create `tests/fixtures/memory-outcome-longmemeval/{suite,diagnostics}.json`, `tests/memory-outcome-longmemeval.test.ts`; modify `scripts/verify/memory-outcome-adapter.mjs`.

**Interfaces usulan:** `OutcomeMemoryAdapter.executeDiagnostic(spec,context,diagnostic): Promise<{base:OutcomeObservation,diagnostic:DiagnosticObservation}>`; konsumsi scoped session/capture/temporal owner existing, bukan mock retrieval. Controller scripted menerima hanya informasi dari surface yang memang diizinkan; oracle hanya verifier.

- [ ] Tulis fixture extraction dengan satu fakta target/distractor; multi-session dengan dua fakta saling melengkapi; update dengan predecessor/successor; temporal dengan nilai sebelum/sesudah instant; abstention dengan fakta tidak tersedia. Gunakan dua varian held-out per keluarga, label sintetis berbeda dari development.
- [ ] Tulis `preserved_but_not_retrieved_is_distinct`: setelah reopen record ada, query sengaja irrelevant, preservation PASS/retrieval FAIL. `historical_and_current_diverge`: asOf lama memilih predecessor, sekarang successor, salah zona/unknown timezone ditolak tanpa tebakan.
- [ ] Tulis `abstention_is_oracle_driven`: jawaban kosong tidak otomatis lulus; exact `{kind:'abstain'}` lulus hanya bila oracle tidak memiliki bukti memadai. Multi-session jawaban parsial FAIL; source salah FAIL walaupun value benar.
- [ ] RED: `npm test -- tests/memory-outcome-longmemeval.test.ts`; implementasikan driver operation-to-owner dan evidence traces, lalu GREEN dengan network/provider spy nol.
- [ ] Lifecycle capture → persist → reopen → recall → answer → verification → receipt → review wajib terekspos; tidak menulis expected answer langsung dari oracle ke hasil driver. Unknown bukti tidak diperlakukan sebagai PASS.

## Task 3: Reporting, ZIP dan acceptance

**Files:** Modify `scripts/verify/{memory-outcome-eval,package-memory-outcome}.mjs`; create `tests/memory-outcome-diagnostic-bundle.test.ts`; update `docs/CODEBASE.md` dan `CHANGELOG.md` hanya ketika fitur implemented; release intent mengikuti assessment di bawah.

**Interfaces usulan:** report tambahan `diagnostics/report.json` dan `diagnostics/observations.json`, suite sidecar `fixtures/diagnostics.json`; packager memakai `memory-outcome-bundle/v2` untuk diagnostik, tetap membaca bundle v1 lama; anggota tambahan hanya melalui schema/allowlist berversi yang terikat suiteDigest dan traceDigest. File fixture/oracle tetap di area verifier.

- [ ] Tulis `hit_without_receipt_is_not_use`: retrieval PASS, controllerUse UNKNOWN bila receipt hilang, FAIL bila revision/task/action mismatch; outcome dapat PASS tanpa klaim usefulness. `all_failed_runs_remain`: row hilang berarti report incomplete.
- [ ] Tulis `bundle_replays_diagnostic_evidence`: missing oracle/trace, stale sidecar, traversal/symlink, swapped baseline, corrupted ZIP semuanya FAIL; v2 bundle lama tetap bisa direplay.
- [ ] RED/GREEN: `npm test -- tests/memory-outcome-diagnostic-bundle.test.ts tests/memory-outcome-bundle.test.ts tests/memory-outcome-evaluation.test.ts`; lalu `npm --prefix SubProject/agent-core-memory run build && npm run build` dan seluruh focused tests Task1–3.
- [ ] Baseline functional mendatang: `node scripts/verify/memory-outcome-eval.mjs --suite tests/fixtures/memory-outcome-longmemeval/suite.json --diagnostics tests/fixtures/memory-outcome-longmemeval/diagnostics.json --phase baseline --output reports/memory-reference-adoption/plan20/baseline-001`; direktori harus baru, snapshot/source identity diverifikasi dahulu.
- [ ] Paket `node scripts/verify/package-memory-outcome.mjs --report reports/memory-reference-adoption/plan20/baseline-001 --output reports/memory-reference-adoption/plan20/baseline-001.zip`; fresh extraction, cocokkan seluruh path/size/SHA-256 dan recompute kedua laporan. ZIP di luar Temp/runtime/tmp; sertakan command/exit, gagal/blocked, patch inventory, source/build identities, tanpa private Memory/secrets.

## Compatibility, rollback dan integrasi kanonis

Plan21 memakai helper sidecar Task1 yang sama. Task1 Plan20 adalah prasyarat bersama; seluruh fixture LongMemEval bukan prasyarat Plan21. Hanya Plan20 mendefinisikan kontrak/helper shared; jangan membuat kontrak/runner salinan.

Dokumen saat ini: no product-version change. Implementasi perubahan tooling/report contract: patch intent bila mengubah kemampuan distribusi; fixture/test-only tanpa perilaku produk: no product-version change, alasan dicatat. Format diagnostik versioned terpisah; v2 parser/verifier lama tetap menerima artefak lama. Rollback menghapus opt-in hook dan helper yang tidak dipakai plan lain; simpan laporan, jangan migrasikan atau menghapus store.

Handoff kelak menyebut repo `Black-Project-Agent-Core/Agent-Core`, branch dan SHA publik aktual. Fetch branch terverifikasi, cocokkan SHA/object dan inventory path rencana ini, inspeksi konflik hanya path beririsan, pertahankan unrelated work; konflik berhenti tanpa backup/stash/reset atau syarat seluruh tree bersih. Baseline SHA bukan SHA implementasi. Belum ada publikasi berarti integrasi BLOCKED. Build/test functional di checkout kanonis setelah persetujuan; installed/running identity harus diverifikasi terpisah. Tidak ada Windows/deployment sekarang.

## Self-review dan batas selesai

- [ ] Kelima keluarga dan lima Review Focus punya test; oracle, trace, receipt dan exact revision mendukung empat skor terpisah.
- [ ] Tidak ada model judge, benchmark berat, clone dataset atau klaim sebanding dengan skor LongMemEval publik.
- [ ] Laporan membedakan PASS/FAIL/BLOCKED/NOT RUN, efficiency DEFERRED, scripted benefitProven=false; ZIP berhasil direplay sebelum klaim acceptance functional.
