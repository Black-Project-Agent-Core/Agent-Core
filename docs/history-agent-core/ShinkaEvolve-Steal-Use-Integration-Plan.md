# ShinkaEvolve — Steal / Use Integration Plan

> **Status:** COMPLETE FOR APPROVED ADOPTION - INSTALLED RUNTIME QUALIFIED - CONSUMER REFERENCE
> **Tanggal:** 2026-09-29
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/shinkaevolve`
> **Revision:** `fd583c15ebcb12ec662a7cd921baf4203572e492` — branch `main`, working tree bersih saat inspeksi.
> **Checkout origin:** `https://github.com/N-I-ckel/shinkaevolve.git`
> **Identitas package:** `shinka-evolve` / `shinka.__version__ = 0.0.6`; metadata package menunjuk SakanaAI/ShinkaEvolve, berbeda dari origin fork di atas.
> **License:** Apache-2.0, Copyright 2025 Sakana AI. Adaptasi native SHINKA-P1 dicatat di bagian 7; runtime donor tidak dipasang.

> **Catatan versi:** bagian 1–6 mempertahankan desain/source-grounding yang disetujui. Status pelaksanaan terkini ada di bagian 7; conditional C bukan implementasi gelombang ini.

## 1. Tujuan dan batas keputusan

Mengambil mekanisme yang menambah kemampuan Agent Core melalui consumer nyata, bukan memasang seluruh evolution engine. Sistem tambahan boleh diusulkan; pemeriksaan tetap membedakan kebutuhan sekarang dari aplikasi/consumer yang belum ada.

Hasil saat ini: **SHINKA-P1** layak dipilih secara mandiri. Keluarga lain di bagian 5 dicatat sebagai sudah tercakup, conditional, atau tidak layak dipindahkan mentah. Tidak ada persetujuan implisit untuk model calls, eksperimen, auto-edit, install, restart, atau release.

Consumer sekarang adalah CLI analisis Learning offline; controller manusia/AI menjalankannya secara eksplisit atas report yang sudah tersedia. Native experiment-generation/model-selection loop bukan consumer yang ditemukan dalam jalur ini.

## 2. Dasar grounding dan tingkat bukti

Inventaris lengkap non-`.git`: **272 file / 12,841,891 byte**. Seluruh **177 file Python** diindeks definisinya melalui AST tanpa import/eksekusi; tidak ada parse error. Hash per file dan rentang definisi tersimpan dalam `runtime/tmp/shinka-systemone-grounding-20260929/shinkaevolve-inventory.json`.

Body executable dan test yang relevan diperiksa secara terarah: Pareto, evaluation wrapper, early-stop, novelty, patching, biaya/in-flight work, slot lifecycle, persistence/resume, serta ownership native. Inventaris/AST bukan bukti bahwa setiap cabang sudah diuji. Tidak ada benchmark, suite test, model call, atau import package yang dijalankan.

Pencarian nama dan isi `docs/**/*.md` sebelum penulisan tidak menemukan plan/rujukan ShinkaEvolve maupun SystemOneHarness. Bukti batas native dan hash awal ada di `runtime/tmp/shinka-systemone-grounding-20260929/audit.json`.

Grafel native diperiksa `current` sebelum structural review. Graph mengenali `summarizeRetrievalSeries` dan callers/tests-nya; source `scripts/learning/analyze-retrieval.mjs` membuktikan consumer CLI, termasuk dynamic import yang tidak boleh dianggap hilang hanya karena graph tidak menampilkan edge-nya.

## 3. SHINKA-P1 — Pareto evidence untuk quality/resource trade-off

**APPROVED - IMPLEMENTED.** SHINKA-P1 telah diseleksi; native comparator dan CLI telah diimplementasikan dan diuji. Hasil aktual ada di bagian 7.

### 3.1 Source donor yang benar-benar digunakan

`shinka/plots/plot_pareto.py:12–36`, `get_pareto_mask`: A mendominasi B ketika seluruh metric A minimal sebaik B dan setidaknya satu lebih baik. Nilai identik tidak saling mendominasi. Helper bekerja pada objective yang sudah diarahkan sebagai maximize.

`shinka/plots/plot_pareto.py:195–325`, `plot_pareto_curve`: arah minimization dikonversi sebelum helper; plot memisahkan frontier dan titik dominated. Yang diambil adalah mekanisme dominance/orientation, **bukan** matplotlib, annotation placement, plot UI, ataupun code-evolution lineage.

Batas source: correctness filter bersifat opsional; `.astype(bool)` bukan validasi strict; metric yang tidak bisa dikonversi dibuang oleh `dropna`; helper sendiri tidak memvalidasi NaN/Inf/cohort. Tidak ditemukan test bernama Pareto dalam indeks definisi test Python. Semua kekurangan ini harus ditangani native, bukan dianggap lolos karena source donor tersedia.

### 3.2 Gap terhadap Agent Core

| Source native yang dibaca | Implementasi saat ini | Perbedaan yang diusulkan |
|---|---|---|
| `scripts/learning/analyze-retrieval.mjs:1–143` | `--profile`, `--series`, `--frontier`, `--diversity`, `--stability`; report verifier dan exclusive output. | Tambah mode tersendiri `--pareto`, jangan ubah arti `--frontier`. |
| `src/learning/retrieval-portfolio.ts:5–48` | Shortlist mempertahankan union coverage; secara eksplisit bukan pairwise Pareto dominance. | Frontier kualitas/biaya dengan saksi dominasi, bukan mengganti coverage shortlist. |
| `src/learning/retrieval-diversity.ts:36–102` | Best-observed per declared grid cell. | Trade-off global dalam comparison group yang sama, tanpa discretization/cell winner. |
| `src/learning/retrieval-series.ts:1–208` | Cohort/split identity, resource evidence, budget, status setiap attempt, comparable groups. | Gunakan evidence tersebut sebagai input, jangan menciptakan eksperimen atau measurement. |

Pencarian terarah native `src`/`scripts` tidak menemukan implementasi non-dominance selain penjelasan bahwa portfolio bukan Pareto. Kesimpulan gap dibatasi pada jalur source tersebut, bukan klaim bahwa seluruh sistem tidak pernah melakukan perbandingan kualitas.

### 3.3 Bentuk adaptasi native

Tambahkan `src/learning/retrieval-pareto.ts` dengan fungsi pure usulan `analyzeRetrievalPareto(candidates, config)`. Kandidat membawa `runId`, `reportId`, `comparisonKey`, status eligibility, dan metric beserta provenance. Konfigurasi memilih 2–8 objective unik dengan direction `maximize|minimize` dan resource basis `per-run|cumulative` yang eksplisit.

Metric awal dibatasi ke `candidateRate`, `objective`, `regressionFraction`, serta resource dimension yang sudah ada di `retrieval-series.ts`; tidak ada expression evaluator, callback arbitrary, prediksi biaya, atau penarikan harga model.

Batas implementasi usulan: maksimal 100 run dan 8 objective, sesuai batas manifest saat ini. Nilai harus finite; duplicate run/report ID dan duplicate dimension ditolak. Metric hilang tetap `unknown`, bukan nol; run invalid/failed/incomplete tetap terlihat dalam excluded rows beserta alasan dan tidak masuk frontier.

Partisi menggunakan identity yang sudah dibentuk `profileComparisonKey` + split; objective resource juga memerlukan declared measurement-context identity yang sama. Tambahkan optional `run.resourceContext = { id, evidenceRefs }` hanya untuk mode baru; apabila resource context/metric tidak ada, tandai not-comparable. Identity ini tetap **operator-declared, not authenticated**, bukan bukti mesin/hardware sama. Jangan gabungkan train/validation/holdout atau resource per-run/cumulative.

Output usulan: `groups[]`, `frontierRunIds`, `dominated[]` dengan `dominatedBy` dan strict-improvement dimensions, `equivalentGroups`, `excluded[]`, `unknown[]`, configuration/input digest, serta numeric provenance. Urutan stabil berdasarkan ID; ties identik dipertahankan sebagai equivalence, bukan pemilihan pemenang acak. Tidak ada toleransi tersembunyi atau rounding sebelum keputusan dominance.

Frontier berarti *non-dominated among supplied eligible observations*, bukan strategi terbaik di dunia, causal improvement, bukti statistik, atau rekomendasi deployment. `launchesExperiments=false`, `approvalAuthority=false`, `deploymentRecommendation=false`, `memoryPersisted=false`. Report boleh berisi frontier kosong dengan alasan yang jelas.

### 3.4 File dan langkah implementasi setelah dipilih

1. **Ground ulang seam:** baca versi terkini `retrieval-profile.ts`, `retrieval-series.ts`, `analyze-retrieval.mjs`, `report-bundle.mjs`, `report-io.mjs`, dan `verified-value-registry.ts`. Structural review untuk perubahan callable/schema tetap dilakukan; source mengalahkan graph.
2. **Buat pure comparator:** `src/learning/retrieval-pareto.ts`; validasi finite/identity/direction, grouping, ties, saksi dominance, dan excluded evidence. Tidak perlu numpy/pandas.
3. **Integrasi consumer:** extend `analysis.pareto` dan optional resource context di `src/learning/retrieval-series.ts`; tambah `--pareto` di `scripts/learning/analyze-retrieval.mjs`, menggunakan bundle verification yang sama. Cabang `--stability` yang sekarang berada di fallback `else` harus dibuat eksplisit agar mode baru tidak masuk cabang yang salah.
4. **Provenance dan output:** gunakan `VerifiedValueRegistry`, digest/readback, max 8 MiB dan write-exclusive yang sudah ada. Resource deklaratif tidak boleh dinaikkan menjadi verified measurement. Legacy modes/manifests tanpa field baru tetap diproses seperti sebelumnya.
5. **Dokumentasi pelaksanaan:** perbarui section terkait di `docs/CODEBASE.md`, status plan ini, attribution Apache-2.0 di `THIRD_PARTY_NOTICES.md`, canonical Memory dan satu changeset material untuk selection yang benar-benar diimplementasikan. Jangan menandai installed sebelum activation readback.

### 3.5 Acceptance yang ditawarkan — belum dijalankan

New tests: `tests/shinkaevolve-pareto-adoption.test.ts`; CLI seam test dapat ditempatkan di file test baru yang sama atau fixture report existing yang sudah diperiksa saat implementasi. Perintah scoped yang diajukan: `npx vitest run tests/shinkaevolve-pareto-adoption.test.ts`; build hanya pada implementasi yang disetujui. Tidak menjalankan full regression tanpa izin.

Acceptance wajib: maximize quality/minimize wallMs; dua titik trade-off sama-sama frontier; satu titik dominated punya saksi; ties tidak saling mendominasi; permutation-invariant; null/absent/NaN/Inf tidak menjadi kemenangan; explicit zero tetap nilai valid; invalid high score tidak masuk; per-run/cumulative dan split/cohort berbeda tidak tercampur; resource context hilang unknown; input/output limit; immutable inputs dan new-file-only output; legacy `--frontier` tetap coverage-preserving.

Fixture matematis: `(quality .8, cost 10)` didominasi `(.9, 9)`, sedangkan `(.95, 12)` dan `(.9, 9)` sama-sama frontier. Duplicate coordinate dengan ID berbeda merupakan equivalent observations. Hasil ini expected reasoning, bukan benchmark yang telah dijalankan.

## 4. Pilihan arsitektur yang dipertimbangkan

**Direkomendasikan:** native pure TypeScript comparator melalui CLI existing. **Tidak dipilih:** menjalankan plot Python hanya untuk memperoleh frontier karena menambah dependency besar tanpa consumer tambahan. **Conditional:** workbench eksperimen baru dengan generator/evaluator/model client, hanya melalui proposal terpisah yang menetapkan tujuan, budget, source boundary dan manusia pemilik eksperimen; bukan kebutuhan SHINKA-P1.

## 5. Census residual — tidak menyamakan “bukan P1” dengan “tidak berguna”

| Keluarga / source anchor | Disposition saat ini dan alasan |
|---|---|
| `plots/plot_pareto.py:12–36,195–325` | **SHINKA-P1 current-fit** seperti di atas. Plotting/UI bukan bagian yang perlu diimpor. |
| `core/wrap_eval.py:103–484`; `tests/test_wrap_eval_parallel.py:22–160` | **Conditional SHINKA-C1:** deterministic aggregation by run index, correctness terpisah dari score dan explicit trial counts berguna ketika ada native evaluator yang benar-benar menjalankan stochastic trials. Consumer Learning sekarang membaca hasil rekaman; menjalankannya berkali-kali tidak menghasilkan independent trials. |
| `utils/eval_stop.py:82–363` | **Conditional C1, bukan statistical proof:** threshold/stop-reason/trials-used metadata dapat digunakan dalam evaluator baru. Empirical normal/t-interval, repeated peeking, dan confidence=1 ketika score identik tidak diadopsi mentah; butuh statistical protocol tersendiri. Stability advisory native sudah ada dan tidak boleh berubah menjadi execution stopper. |
| `core/async_runner.py:745–930` | **Conditional SHINKA-C2:** committed-cost estimate + proposal/evaluation EWMA/backpressure menunggu producer proposal/evaluation yang nyata. Source memakai estimasi nol ketika history biaya belum ada dan mengabaikan hard cap di bawah base; keduanya bukan jaminan budget keras. Tidak memasang router/limiter global untuk menirunya. |
| `core/runtime_slots.py:6–50`; `core/async_runner.py:4923–5074`; recovery tests | **Conditional C2 / partially covered:** persisted-count resume, in-flight persistence bookkeeping, acquire-before-submit, dan release-once per job berguna untuk scheduler baru. Native process ownership dan Learning serialization sudah ada; tidak ada bukti kegagalannya yang membenarkan rewrite sekarang. ID slot pool sendiri bukan generation-safe lease. |
| `database/dbase.py` generation/attempt/source-job identity; async DB; `core/async_runner.py` persistence/side effects | **Conditional C2:** authoritative result persistence terpisah dari maintenance dan duplicate job accounting. Bukan alasan membuat database learning/reflection kedua. Current Learning state owner transactions dan sealed report boundary tetap pemilik state. |
| `llm/prioritization.py:70–292,295–947,950–1470`; `test_bandit_persistence.py` | **Conditional SHINKA-C3:** cost-aware UCB/Thompson dan restore berdasarkan arm-name, termasuk reorder/add/drop, untuk model/experiment selector yang kelak ada. Native policy saat ini tidak memiliki arm-selection consumer. Jangan transplant pickle load atau fallback prefix alignment sebagai provenance aman. |
| `database/parents.py`, `islands.py`, `island_sampler.py`, `inspirations.py`, archive/crowding | **Conditional SHINKA-C4:** evolutionary population selection/migration/ancestry. Native diversity archive dan coverage portfolio hanya deskriptif; tidak berpura-pura sudah punya optimizer. Sistem evolution baru boleh dirancang setelah kebutuhan eksperimen dipilih, bukan dibuat agar referensi tampak terpakai. |
| `core/novelty_judge.py:26–225`; embed backend/client; complexity | **Conditional C4:** novelty/diversity checks untuk kandidat generated code. Memory/Grafel embeddings bukan otomatis consumer program-novelty. `check_llm_novelty` mengembalikan accept pada exception/empty answer; hasil ini tidak boleh dianggap source-verified novelty. |
| `core/prompt_evolver.py`, sampler, meta summarizers, prompts | **Conditional C3/C4:** prompt optimization memerlukan prompt assembly/generation consumer. Tidak menggantikan semantic controller Memory atau membuat model internal tambahan pada task ini. |
| `edit/apply_diff.py:587–651`, edit async/diff/full | **Covered/conditional:** EVOLVE-region patching relevan untuk sandbox optimizer saja. Native Semantic IDE sudah punya transactional source edits/fingerprint; mekanisme fuzzy indentation/first replacement tidak diangkat sebagai generic refactor authority. |
| `core/pipeline_timing.py:11–137` | **Conditional C2:** queue/stage/accounted/unaccounted timing berguna bila pipeline baru nyata. Existing wrapper duration + explicit resource evidence tidak sama dengan stage timings, tetapi tidak ada stage consumer yang memerlukan sistem baru sekarang. Native adaptasi kelak tidak boleh mengubah timestamp hilang/negatif menjadi pengukuran nol yang sah. |
| `launch/local.py:71–191`, scheduler/SLURM, CLI/launch, `shinka_jobs.sh` | **Tidak diimpor:** alternate job/process lifecycle, cluster deployment dan source execution bukan kebutuhan mode analisis offline. Native owned-process tooling tetap dipakai; external cluster hanya bila kelak disetujui secara spesifik. |
| LLM clients/providers, model availability, env/config helpers | **Conditional C3, tidak diinstal:** separate provider/credential/toolchain stack. `shinka/__init__.py:3–7` memanggil dotenv loader saat import; audit ini sengaja tidak mengimpor package. |
| Remaining plots/web UI, examples, YAML configs, skills, packaging/workflows, docs/assets | **Reference/support-only:** template operasional bagi engine donor, bukan consumer runtime Agent Core yang berdiri sendiri. AST/file inventory mencakupnya; tidak mengklaim setiap workflow/asset dieksekusi atau setiap helper sudah diaudit per cabang. |

## 6. Keputusan folder dan batas keyakinan

**HISTORICAL RETENTION - superseded by final Consumer disposition in section 9.** SHINKA-P1 memiliki consumer sekarang, sehingga repo bukan corpse dan bukan consumer-only. Jangan hapus/pindahkan sebelum proposal dipilih dan implementasinya benar-benar selesai. Bila P1 ditolak namun C1–C4 sengaja dipertahankan, barulah reevaluasi pemindahan ke `Consumer/shinkaevolve`.

Tidak ditemukan proposal current-fit tambahan yang cukup dibuktikan dalam keluarga snapshot yang diperiksa. Ini penutupan census pada revision/scope tersebut, bukan jaminan bahwa tidak ada ide masa depan atau bug di cabang yang tidak dieksekusi. Conditional yang disebut di atas harus diuji ulang saat consumer berubah.

**Hari ini:** plan baru dibuat, evidence ditulis, docs/Memory disinkronkan. Tidak ada implementation source edit, dependency installation, test/build, repo marker, commit, release, deployment, atau restart yang diperlukan/dilakukan oleh audit ini.


## 7. Approved implementation dan qualification — 2026-09-29

SHINKA-P1 diimplementasikan secara native melalui `src/learning/retrieval-pareto.ts`, additive `analysis.pareto` / `run.resourceContext` di `retrieval-series.ts`, dan mode `--pareto` pada `scripts/learning/analyze-retrieval.mjs`. Existing `--frontier` tetap coverage-preserving, bukan Pareto.

Input dibatasi 100 run / 2–8 objective. Grouping memakai comparison identity + split + resource basis/context. Missing/nonfinite metric tetap unknown; failed/invalid/incomplete tetap excluded; zero eksplisit tetap valid. Dominance witness, strict dimensions, equivalence dan digest berasal dari input yang sama tanpa hidden rounding. Resource evidence tetap operator-supplied, bukan authenticated measurement. Tidak ada execution/approval/deployment authority.

Qualification aktual: **12/12** test di `tests/shinkaevolve-pareto-adoption.test.ts` lulus, termasuk CLI menggunakan sealed/recomputed report bundles, provenance, cumulative/per-run, legacy frontier, immutable inputs dan new-file-only output. Seluruh selection gelombang ini: **46/46 PASS, 0 fail, 0 skip** di tiga file scoped; bukan full regression.

`npm run build` exit 0; path policy **266 authored files / 0 exceptions**. Release compatibility exit 0: **70 -> 70 tools**, browser-only optional params `canvas` dan `interactionCapabilities`, no newly-required/removed params, `breakingEvidence=false`. Manifest **118,082 bytes / ~29,521 tokens**, dalam budget. Intent `.changeset/20260929-shinka-systemone-adoption.md` adalah minor. Product tetap 0.14.0; read-only next-release plan 0.15.0, dua pending intents termasuk Graft/Graphify sebelumnya.

Structural review menggunakan native graph yang current sebelum perubahan dan exact source pada CLI/schema/service wiring. Post-change reindex gagal dengan `GRAFEL_CLI_FAILED: daemon not running`; readback berikutnya `index=unknown` / `graph-load-probe-failed`. Tidak dilakukan restart untuk menyembunyikan kegagalan. Historical pre-restart checkpoint: graph verification was OPEN and is closed by section 8; comparator/CLI qualification di atas tidak bergantung pada keberhasilan Grafel.

Compiled CLI baru benar-benar dijalankan oleh acceptance child process. Resident Core belum direstart; gelombang browser masih menunggu aktivasi operator. Referensi ShinkaEvolve tetap di lokasi asal sampai activation/final lifecycle census; conditional scheduler/bandit/evolution bukan pekerjaan yang diam-diam dipasang.

Evidence: `runtime/tmp/shinka-systemone-implementation-20260929/` berisi before-images, `source-diff.patch`, red/green logs, `scoped-final.log`, `build-final.log`, compatibility/intent logs dan `result.json`. Attribution Apache-2.0 diperbarui di `THIRD_PARTY_NOTICES.md`. Tidak ada dependency baru, commit/tag/push, release apply, version bump atau deployment.

## 8. Post-restart graph/source readback - 2026-09-29

All source and compiled hashes recorded for the implementation still match the qualified artifacts. SHINKA-P1 remains a compiled offline CLI capability, with its earlier 12/12 test/CLI evidence retained; no new experiment or test suite was run in this continuation.

The user restarted Core. The explicit post-change Grafel index request now succeeds: graph current, integrity accepted, **9,289 entities / 48,950 relationships** and registered-repo coverage 1/1. `analyzeRetrievalPareto` is found in native source and the CLI integration. This closes the earlier post-change graph blocker; it is not a claim that graph availability proves numeric behavior.

The shared SystemOne wave has live confirmation of control-state projection and tab switching but optional canvas/keyboard acceptance remains pending because the chat connector schema omits the new parameters. No further Core restart was requested or performed. Both references remain at their original paths pending the remaining acceptance/lifecycle review; conditional experiment/bandit/evolution consumers remain deferred.

Evidence: `runtime/tmp/shinka-systemone-implementation-20260929/live-readback-20260929.json`. Product 0.14.0, release intent unchanged, no source/build/dependency/release/Git change in this continuation.

## 9. Approved-scope closure and Consumer disposition - 2026-09-29

**COMPLETE FOR APPROVED ADOPTION.** SHINKA-P1 remains the native offline Pareto CLI, not an autonomous evolution loop. Its prior 12/12 tests/compiled-CLI proof is retained within the 46/46 scoped qualification. Current source and compiled artifact hashes match that qualification; no new numeric benchmark, experiment, test suite or build is claimed in this continuation.

The shared SystemOne acceptance blocker is resolved by the explicitly authorized authenticated-localhost probe: resident tools/list exposes the optional fields and 16/16 live checks passed, including canvas, key press/hold/release and history BACK. The temporary key was revoked before expiry and rejected with HTTP 401; all probe browser sessions/listeners closed. The chat connector still lacks those fields, so runtime acceptance is not represented as a repaired chat binding. Graph readback remains current/integrity accepted with 9,289 entities / 48,950 relationships.

**Reference lifecycle CLOSED for current scope:** shinkaevolve was moved intact to `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/shinkaevolve`, rather than deleted. The complete 272-file non-Git hash inventory is unchanged, HEAD is `fd583c15ebcb12ec662a7cd921baf4203572e492`, and Git working tree remains clean. Native-source references are attribution only; package manifests contain no donor runtime dependency.

The residual C1-C4 mechanisms from section 5 still have future-consumer value (stochastic evaluation, scheduling/resume, bandit selection, population/prompt evolution). They remain conditional, not approved implementations. Consumer classification is based on the fixed audited snapshot plus current native adoption, not a claim that every possible future idea has been exhausted.

Evidence: `runtime/tmp/shinka-systemone-implementation-20260929/authorized-live-2026-09-29T10-19-01-869Z.json` and `reference-lifecycle-20260929.json`. Product stays 0.14.0 with existing minor release intent; no release apply, version bump, commit/tag/push, new runtime/dependency or restart was performed. Docs and canonical Memory carry the same closure and connector limitation.
