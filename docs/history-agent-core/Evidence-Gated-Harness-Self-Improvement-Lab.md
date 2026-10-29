# Evidence-Gated Harness Self-Improvement Lab

## Penutupan scope — 2026-10-29

Status: COMPLETED — engineering terpilih selesai; eksperimen kondisional berhenti pada gate bukti. Tidak ada optimizer atau klaim manfaat model.

Instruksi pengguna 2026-10-29 mengizinkan penuntasan scope penting bersama Native Opus 5.5/max. Revisi 11 ini menyupersesi status antrean di kronologi berikut tanpa menghapus keputusan atau kegagalan lama.

| Paket | Disposisi akhir | Bukti |
| --- | --- | --- |
| R6-A/B/C | Implementasi sebelumnya dipertahankan | Status/backlog ringkas dan scaffold verified-recovery existing; tidak mengklaim prosedur positif atau yield baru. |
| R8-S0/S1a | Selesai sebelumnya, tetap aktif | Dry-run dan compact serialization pada §18.8–18.10. |
| R8-S1b dan aturan penutupan A/B | NO-OP / scope ditutup | Kandidat aman 25 episode/226.924 byte =3,49%, di bawah gate 10%. Melindungi semua session head dan pending episode. Native menguji argumen tandingan lalu merekomendasikan NO-OP. Tidak menutup episode agar angka tampak baik. |
| R8-S2 | COMPLETED | Tujuh file temp yatim, 20.528.749 byte, owner PID tidak hidup. Checkpoint semua byte, verifikasi hash/blob, hapus tujuh path literal nonrekursif; nol tersisa. Backup tetap ada. |
| R6-E | NO-OP / tidak dipilih | Keluarga kegagalan terpilih tidak menyediakan dua task independen dengan oracle cocok untuk membenarkan lensa DARC baru. Advisor existing dipertahankan. |
| R6-F/R7 AR-P1 | Desain dan aplikasi disiplin verifikasi selesai; perluasan eksperimen STOP | Delapan aturan dipetakan ke owner existing; lineage/checkpoint, baseline/fixture, bounded budget dan hasil negatif dipertahankan. Tidak mengklaim 12 paired opportunities atau eksperimen model A/B/C telah dijalankan. |
| HS-P0–P3 dan framing R1–R5 | STOP / insufficient evidence sesuai gate P0 | Tidak ada keluarga terpilih yang lolos syarat dua task/oracle independen; kandidat optimizer, self-edit runtime, dan training tidak dibuat. Kronologi tetap historical. |

[Laporan penutupan dan kontrak performa](../verification/Proposal-Completion.md), [review Native beserta batas sumbernya](../verification/Native-Proposal-Review.md). Stop/NO-OP adalah keputusan final scope ini, bukan HOLD aktif atau job masa depan. Eksperimen baru membutuhkan tujuan konkret dan bukti baru; tidak dijadwalkan otomatis. Benefit tetap UNPROVEN. Path asal `docs/proposals/Evidence-Gated-Harness-Self-Improvement-Lab.md`; arsip setelah Learning `docs/history-agent-core/Evidence-Gated-Harness-Self-Improvement-Lab.md`.

## Riwayat sebelum penutupan
Tanggal: 2026-10-23
Revisi: 10
Status: R8-S1a DIIMPLEMENTASIKAN DAN AKTIF 2026-10-26 (state controller eksternal ditulis tanpa indentasi; bagian 18.10). R8-S0 SELESAI 2026-10-26 (dry-run pada salinan; penutupan episode aturan A/B HOLD). R8-S1b dan R8-S2 menunggu keputusan masing-masing — R7 PROPOSED dan R6-A/B/C tetap seperti catatan implementasi di bawah — NOT IMPLEMENTED
Catatan implementasi 2026-10-25: hanya R6-A (peta konsumen status), R6-B (tampilan backlog kompak) dan R6-C (scaffold prosedur pada verified-recovery) yang dikerjakan, atas perintah pengguna; rincian di `docs/CODEBASE.md` (entri "Learning backlog visibility"). R5, R6-D/E/F dan R7 tetap PROPOSED dan tidak dikerjakan. Dokumen ini tidak direvisi.
Jenis: Improvement / phased research-to-engineering proposal
Scope: lab eksternal pada proposal ini; pengembangan dan operasi Native AI Agent Core tersedia sejak keputusan pengguna 2026-10-24.
Referensi utama: https://github.com/leezythu/Awesome-Harness-Self-Improvement
Checkout audit: F:\Workflow\Awesome-Harness-Self-Improvement
Git HEAD audit: 928f63f931bb4899b1fc3708ed697d5bc1209e59 (main, clean)

## 1. Masalah dan tujuan
Agent Core sudah menyimpan pengalaman, menyarankan proposal, menilai outcome, serta menyediakan evaluasi baseline/kandidat. Tantangan yang hendak diuji bukan jumlah fitur self-improvement, melainkan apakah kelemahan nyata pada tugas dapat diubah menjadi usulan perubahan harness kecil yang memperbaiki hasil tugas berikutnya tanpa mengorbankan correctness, biaya, izin, atau maintainability.
Tujuan proposal ini: satu alur evidence-backed dari recurring weakness -> bounded harness candidate -> isolated evaluation -> human review, dengan reuse owner yang sudah ada. Tidak ada auto-edit/auto-release/auto-approval.

## 2. Basis sumber: apa yang benar-benar diperiksa
- Repo adalah **curated reading list**, bukan runnable framework: checkout Git hanya berisi .gitignore, LICENSE, README.md, README_zh.md dan assets/banner.jpg; tidak ada source runtime, package manager, tests atau CLI.
- README.md (385 baris) mendefinisikan harness improvement pada prompt (L0), context/memory (L1), workflow (L2), code (L3), optimizer/meta-harness (L4), dan harness+weights (L5).
- README.md §2.1: ACE, Reflexion, ReasoningBank, Agent Workflow Memory; §2.2: GEPA dan prompt optimization; §2.3: AFlow/ADAS; §2.4: Self-Harness, DGM dan Meta-Harness; §4: evaluators; §5: misevolution/reward hacking; Future Directions: evaluator lemah, negative results, long-term success, human oversight.
- MIT pada LICENSE melisensikan **katalog ini**; paper dan kode pihak ketiga yang ditautkan punya hak/lisensi masing-masing. Tidak ada klaim izin menyalin implementasi downstream.
- Paper primer yang diperiksa lewat abstrak publik: Self-Harness https://arxiv.org/abs/2606.09498 (weakness mining -> minimal proposal -> regression validation); ACE https://arxiv.org/abs/2510.04618 (generator/reflector/curator, delta context); GEPA https://arxiv.org/abs/2507.19457 (reflective trace -> Pareto selection). Angka performa paper **tidak diasumsikan** berlaku pada Agent Core.
- Katalog dan abstrak adalah **research leads**, bukan bukti satu mekanisme sudah kompatibel atau menjadi gap pada current source.

## 3. Baseline Agent Core yang sudah ada: jangan dibuat ulang
- src/learning/improvement-handoff.ts: kontrak controller menawarkan maksimal satu proposal berbasis bukti, tanpa memilih atau mengizinkan eksekusi.
- src/learning/external-improvements.ts: register/feedback/progress proposal revision-bound, evidence dan user decision; tidak otomatis mengaktifkan perubahan.
- src/learning/external-evaluation.ts: manifest baseline/candidate, coverage task, context equality, host observations, outcomes/cost/time; benefitVerdict='withheld' dan membedakan comparable/insufficient/incomparable.
- src/learning/evaluation.ts: bukti/verifier revisions diikat ke input digest; validasi struktural bukan bukti efek.
- src/learning/external-procedure.ts: prosedur terstruktur dengan prerequisites, avoid, checker, rollback, positive/negative/exception cases; tetap kandidat.
- src/learning/decision-calibration.ts: kalibrasi prospektif/risiko-coverage bersifat read-only/deskriptif, bukan deployment policy.
- scripts/verify/cumulative-workflow-eval.mjs: isolated paired baseline/reuse dan oracle tersedia; bukan general-purpose candidate optimizer.
- docs/proposals/REVIEW-GUIDE.md dan Dashboard sudah menjadi jalur review; Native AI Agent Core tersedia untuk pengembangan dan operasi.
Kesimpulan terbatas: komponen dasar ada. **Belum teramati di file yang diperiksa satu workflow yang menghubungkan recurring weakness -> small harness candidate -> evaluation -> review.** Klaim absensi seluruh repo memerlukan audit owner lebih lanjut saat implementasi disetujui.

## 4. Perbandingan rute implementasi
| Rute | Benefit | Risiko/effort | Putusan proposal |
| --- | --- | --- | --- |
| A. Wiring minimal owner existing | Cepat, reversible, no parallel Memory/evaluator | Perlu kasus dan oracle valid | PILIH untuk pilot |
| B. Optimizer multi-candidate terpisah | Pencarian lebih luas | Duplikasi state, biaya, attack surface, atribusi sulit | HOLD |
| C. Runtime self-modifying code/meta-harness | Visi L3–L4 | Regression, evaluator capture, melampaui authority runtime | REJECT untuk sekarang |
| D. Model weight training L5 | Potensi jangka panjang | Tidak ada consumer dan di luar produk kini | OUT OF SCOPE |

## 5. Paket implementasi bertahap — pilih scope secara eksplisit
### HS-P0 — Evidence and stop conditions (read-only discovery)
1. Baca source owner terkini hanya jalur external Learning, Activity Tracker, verifier, proposals, evaluation; cek duplikasi dari docs/history.
2. Pilih 2–3 keluarga kegagalan yang punya bukti, bukan sekadar log sering muncul: salah penggunaan tool, kegagalan continuity/context, atau failed artifact verification.
3. Setiap keluarga memiliki matriks: task IDs, eligible opportunities, model/config/evaluator revisions, oracle independen, side effects, biaya/latensi bila ada, dan excluded evidence.
4. Jika tidak ada keluarga dengan oracle dan sedikitnya dua identitas tugas independen: STOP — insufficient evidence, jangan membuat optimizer.

### HS-P1 — Weakness-to-candidate, controller-led
1. Reuse Tracker, controller_learning, retrieval ledger dan outcome verifier existing sebagai input terbatas; AI eksternal mengelompokkan kelemahan serta alternatif hipotesis.
2. Hasilnya **satu proposal revisioned** melalui docs/proposals + existing external improvement receipt, target tunggal di prompt instruction, context selection, atau workflow decision boundary (prioritas L0–L2).
3. Setiap candidate mengikat failure evidence IDs, exact proposed delta, source owner, expected behavior, negative controls, risk, rollback, dan **falsifier** yang akan membatalkan hipotesis.
4. Jangan menjalankan candidate, mengubah AGENTS.md/root policy, grants, Native Agent, live Memory, active Skills, MCP manifest, deployment atau package karena output miner.
5. Simpan negative findings/counterevidence tanpa mentransformasikan spekulasi menjadi faktual.

### HS-P2 — Isolated paired held-out qualification (reuse existing evaluator)
1. Reuse external-evaluation.ts dan scripts/verify/cumulative-workflow-eval.mjs jika interface dan izin mencukupi; hanya tambahkan adapter jika gap telah ditunjukkan source.
2. Bekukan model, tools/grants, evaluator/verifier revision, budget, case digests dan candidate revision. Pisahkan selection data dan **held-out tasks**. Jangan tuning berulang berdasarkan holdout yang sama.
3. Bandingkan baseline vs candidate untuk independently verified goal-success, negative cases/regressions, semua eligible attempts, latency, true measured cost bila tersedia, dan side effects.
4. Infrastructure failure, evidence-unavailable dan konteks tidak comparable tidak dinilai kemenangan. Observational deltas tetap deskriptif, bukan causal claim.
5. Pilot 12 paired opportunities hanya cukup untuk feasibility/bug finding, **bukan** klaim signifikan secara statistik; insufficient-evidence adalah hasil sah.
6. Hanya gunakan fixture/clone terisolasi dalam runtime/ setelah izin tes. Active runtime dan authority di luar scope eksperimen harus tetap utuh.

### HS-P3 — Select and review (conditional)
1. Jika tersedia dua kandidat sah, tunjukkan trade-off Pareto: goal correctness, regressions, time/token/cost (bila terukur), complexity, rollback. GEPA menginspirasi keputusan, bukan dependency kedua.
2. Candidate kalah pada requirement wajib, berubah oracle, contaminated evaluator, unknown side effect atau insufficient holdout -> HOLD/REJECT, bukan auto-promote.
3. Manusia membaca proposal revisi tertentu di Dashboard dan memilih APPROVE/REVISE/HOLD/REJECT. Deploy/activation/Skill promotion/release tetap task terpisah.
4. Jika hanya satu kandidat/evaluator tidak memadai, jangan tambahkan engine multi-objective palsu.

## 6. Scope dan risiko
- Eksperimen proposal ini menargetkan controller eksternal; tidak mengubah grants atau operasi Native sebagai efek samping. Native tersedia untuk pengembangan task-scoped terpisah.
- Tidak membuat MemoryService, LearningService, model controller, timer, scheduler, daemon atau MCP tool kedua tanpa proof kebutuhan.
- Bounded verified redacted evidence; tanpa credential, private chats, chain-of-thought, secret maupun raw tool dumps.
- Budget/timeout/rollback ditetapkan sebelum test; proposal ini bukan izin test, install, build, restart, cleanup, upload, deploy atau release.
- Pisahkan source-observed, interpretation/testable hypothesis dan unknown. Paper leaderboard adalah bukti eksperimen paper, bukan local Agent Core outcome.

## 7. Acceptance, falsifier dan rollback
**P0/P1:** source-evidence matrix dapat dibaca ulang; weakness menunjuk failing task dan oracle, delta terikat satu owner, falsifier dan negative controls eksplisit; no product code/runtime mutations; proposal digest/status tersedia di owner existing.
**P2 bila disetujui:** isolated fixture, immutable case/evaluator digests, all-attempt accounting, negative controls, matched population/model/grants, verifier recomputation, absence of leakage/protected writes. Kegagalan juga dilaporkan.
**P3 bila disetujui:** user decision revision-accurate; tidak ada auto-cutover. Benefit dinyatakan hanya dengan independently verified outcome yang sesuai metrik preregistered; cost/latency tidak dapat menggantikan correctness.
**Falsifier utama:** hanya train cases naik, held-out tidak naik, negative control regress, goal oracle tidak tersedia, population mismatch, human reviewer menolak.
**Rollback:** hentikan pilot dan pertahankan evidence; cleanup hanya fixture milik eksperimen jika diizinkan; current Core tetap unchanged. Perubahan source pada task masa depan memakai backup/hash dan exact rollback.

## 8. Nilai dan batas
Nilai yang diharapkan: proposal lebih relevan terhadap failure nyata, keputusan lebih evidence-backed, dan negative outcomes tidak hilang. Pengurangan error, waktu dan biaya **belum terukur**.
Arsitektur pilot L0–L2 lebih feasible dibanding transplant DGM/SICA/Meta-Harness, sementara L3–L4 hanya melalui review baru setelah eval sah. L5 tidak diperlukan.

## 9. Evidence dan referensi terikat
- Repo F:\Workflow\Awesome-Harness-Self-Improvement; main HEAD 928f63f931bb4899b1fc3708ed697d5bc1209e59; README.md, LICENSE, Git tracked file inventory.
- Primary abstracts: https://arxiv.org/abs/2606.09498 ; https://arxiv.org/abs/2510.04618 ; https://arxiv.org/abs/2507.19457 .
- Exact inspected owners: src/learning/improvement-handoff.ts, external-improvements.ts, external-evaluation.ts, evaluation.ts, external-procedure.ts, decision-calibration.ts, verified-value-registry.ts; scripts/verify/cumulative-workflow-eval.mjs.
- Proposal contract: docs/proposals/REVIEW-GUIDE.md. Re-ground exact source at future implementation time.
- No product tests, build, benchmark, restart, or runtime install in this proposal-only task.

## 10. Revision history
- 2026-10-22 r1: source-first catalogue grounding, paper abstract leads, selected existing Agent Core owner comparison, staged proposal; no implementation.
- 2026-10-22 r2: source-level inspection of Self-Harness diagnosis/proposer/materializer/acceptance/loop, ACE curator and analyzer, GEPA Pareto selector, and Meta-Harness run history; validated existing Agent Core Learning owner paths; refined failure-causality and final-lockbox guards. Deep report: [Harness Self-Improvement Deep Source Grounding](../Harness-Self-Improvement-Deep-Source-Grounding-20261022.md). R1 terms retained as historical proposal context.
- 2026-10-22 r3: bounded 98-bullet catalogue census and source-primary challenge against Rethinking harness evolution, ModularRSI, RRSI, Skill Misevolve and Harness2; adds matched-budget null comparator, same-task contrast, action-intent parity and long-lived Skill safety auditing. [Third-wave evidence](../Harness-Self-Improvement-Third-Wave-Gap-Audit-20261022.md). No implementation.

## 11. Keputusan pengguna
**Keputusan r2 historis: tidak ada persetujuan.** Petunjuk pemilihan revisi 2 di sini sudah digantikan oleh bagian r3 paling bawah. Implementasi, pengujian, izin dan aktivasi tetap belum disetujui.

## 12. Revision 2 — Pendalaman source primer dan refinement (2026-10-22)
R1 di atas adalah proposal awal yang tetap menjadi histori. Bagian R2 ini merupakan refinement yang mengutamakan bukti source primer. Jika berbeda, R2 menjadi rekomendasi proposal terbaru, **bukan implementasi**. Bukti detail per file, blob SHA dan batas transfer ada di [laporan grounding primer](../Harness-Self-Improvement-Deep-Source-Grounding-20261022.md).

### 12.1 Mekanisme baru yang terverifikasi dari source
- **Self-Harness / integrated diagnosis:** grouping tuple `terminal_cause / criticality / agent_mechanism` dari penjelasan LLM. Pembentukan grup deterministik, tetapi *penyebab* yang dipilih LLM belum menjadi fakta kausal. Pertahankan status `observed / inferred / unknown`, evidence verifier, alternatif penyebab dan passing cases sebagai regression controls.
- **Self-Harness / proposer:** kandidat harus menunjuk `mechanism_family`, **satu `exact_hook`**, bukti kasus terdampak, passing cases yang harus dilindungi, alasan berbeda dari baseline, dan opsi **decline/no-op** bila evidence lemah. Nilai kandidat tetap terisolasi dan tidak dieksekusi hanya karena bisa dimaterialisasikan.
- **Self-Harness / acceptance:** script memakai perbandingan average pass rate, train dan held-out, default dua repeats; accepted bila tidak ada split turun dan ada satu split membaik. **Jangan menyalin boolean accepted sebagai authority**: Agent Core harus membaca hasil verifier independen dan memeriksa semua eligible attempts, comparability, budget dan perubahan evaluator.
- **ACE:** curator memproses ADD/UPDATE/MERGE/DELETE playbook; Agent Core sudah memiliki canonical Memory, revisi dan curator proposal-only. Ambil prinsip delta + retention saja, **tolak penerapan delete/merge otomatis dan engine embeddings kedua**.
- **GEPA:** selector Pareto mempertahankan kandidat spesialis berdasarkan performa per-case. Berguna setelah beberapa kandidat benar-benar qualified, **bukan alasan menciptakan optimizer pada pilot satu kandidat**.
- **Meta-Harness:** candidate frontier, evolution history dan explicit finalization menunjukkan pentingnya resumable lineage. Gunakan pointer/digest milik Learning/proposal/eval existing; bukan database, queue atau scheduler kedua.
- **Misevolution:** risiko pada memory/tool/workflow/model adalah *research risks*, bukan bukti Agent Core terkena defect. Permissions dan evaluator harus berada di luar kandidat yang dioptimasi.

### 12.2 Perubahan prioritas dan acceptance
- **HS-P0 refined — lebih dulu:** periksa outcome nyata plus sumber verifier, dan pisahkan kegagalan karena lingkungan vs metode vs missing evidence. Cluster dari dua task independen adalah syarat *kelayakan riset*, bukan pengakuan root cause.
- **HS-P1 refined — satu kandidat berbatas:** pilih satu family/hook milik external controller; catat baseline hash, exact candidate delta, predicted affected+protected cases, alternative cause, no-op decision, reversal/falsifier. Gunakan jalur proposal existing dan tidak mengedit root `AGENTS.md`, Native di luar scope task, grants, active Memory ataupun Skills.
- **HS-P2 refined — setelah izin scope tes:** jalankan evaluasi terisolasi dengan *train/diagnosis*, *reusable validation*, dan **final lockbox** yang hanya dibuka setelah kandidat dan oracle dibekukan. Bandingkan matched model/tools/config, per-case goal verifier, total attempts, regressions, biaya/latensi jika benar-benar diukur. Jangan klaim signifikansi dari pilot kecil atau mengulang final lockbox untuk tuning.
- **HS-P3 refined — kondisional:** advisory Pareto hanya setelah >=2 kandidat dengan per-case verifier dan cost/risk evidence cukup. `benefitVerdict='withheld'` existing dipertahankan sampai bukti final cukup, tetap tidak boleh auto-promote.
- **Rollback/stop:** source-evidence tidak mendukung, root cause unknown, evaluator/cases drift, passing cases regress, out-of-scope side effects, atau izin ditolak → STOP, simpan negative evidence dan candidate/proposal status; jangan memasang sesuatu hanya demi progress.

### 12.3 Referensi dan batas yang belum dieksplorasi penuh
**Koreksi sumber primer, 2026-10-22:** Abstrak arXiv Self-Harness hanya merangkum Terminal-Bench-2.0, tetapi teks lengkap HTML pada halaman resmi yang sama menyebut tambahan SWE-bench Verified dan AppWorld serta 9 kombinasi model-benchmark. Pernyataan sebelumnya bahwa cakupan tambahan hanya terverifikasi melalui mirror adalah keliru. Angka eksperimen penulis tetap bukan acceptance premise atau hasil Agent Core. Detail dan source verification: laporan grounding bagian B serta arxiv.org/abs/2606.09498.
Sumber diperiksa: Self-Harness (5 modul Python), ACE (2 modul), GEPA (1 selector), Meta-Harness (1 reference loop), dan Misevolution (paper/abstract saja). Semua file source publik tersebut **dibaca, tidak dijalankan**. Sebelum melangkah ke implementasi, sumber lanjutan paling relevan adalah (a) negative tests untuk acceptance dan forged evaluator results, (b) ACE counter helpful/harmful yang grounded ke efek, (c) lockbox contamination pada Meta-Harness, (d) GEPA selection under sparse outcomes, dan (e) source/test Misevolution. Tidak ada klaim seluruh katalog habis diteliti.
**Status historis revisi 2: PROPOSED, tidak disetujui; kini digantikan refinement r3.** Tidak ada izin otomatis untuk test, build, aktivasi atau perubahan Native.

## 13. Revision 3 — Stop claiming exhausted; strongest additional evidence (2026-10-22)
**R3 supersedes the recommendation/decision scope in R1–R2; no implementation or test approval has occurred.** Primary source evidence and local code crosswalk are in [Third-Wave Gap Audit](../Harness-Self-Improvement-Third-Wave-Gap-Audit-20261022.md).

### 13.1 Newly material gaps and owner reuse
- **HG-1 / highest priority — fairness falsifier.** [Rethinking Harness Evolution](https://arxiv.org/abs/2607.12227) empirically challenges harness evolution against equal-budget parallel sampling/sequential refinement. Existing external `src/learning/external-evaluation.ts` compares baseline/candidate with optional cost/time but lacks a third *simple-search null control* in the selected function. Add no new evaluator until pilot proves a missing adapter; first specify a valid **three-arm matched-budget experimental protocol** and per-arm complete attempts.
- **HG-2 / high priority — failure attribution.** [ModularRSI](https://arxiv.org/abs/2609.14857) contrasts passing/failing trajectories on the **same task**, across tasks and within a named harness module. The inspected Agent Core `feature-outcome-pool.ts` only aggregates feature labels/polarities, not a same-task contrast. Use a controller-generated *hypothesis* and source/verifier evidence before considering a new typed contrast projection.
- **HG-3 / conditional — proposed vs actual change check.** ModularRSI's unit tests require ADD to register a new variant, MODIFY to touch the target and REPLACE to declare a successor. Agent Core already has revision/digest safeguards, but parity of *declared mechanism/action* against *actual implementation diff* has not been fully established. Audit existing approval+staging mechanisms first; apply to future external pilot candidates, only within the approved task scope.
- **HG-4 / high impact, verification-only first — persistent Skill safety.** [Skill Misevolution](https://arxiv.org/abs/2608.12851) warns about later benign-session reuse of unsafe procedures after exposure. Selected `src/skills/service.ts` routes have digests, source provenance, user confirmation and rollback. They do not directly demonstrate *retention of prior verification/authorization requirements across a revision*. Scope initial task strictly to source/test parity, do not assume defect or transplant external lexical guard. Compare safety behavior **across sessions**, not just immediate admission.
- **HG-5 / defer — regularized selection.** [RRSI](https://arxiv.org/abs/2609.24972) introduces edit history, score/noise floor, cost trade-offs and novelty/pruning. Agent Core does not need automatic optimizer until >=2 independently scored candidates exist. Preserve NO-OP/insufficient evidence; explicitly reject RRSI's forced-candidate producer rule for this system.
- **HG-6 / research only — open-world without oracle.** [Harness2](https://arxiv.org/abs/2610.14224) studies task-level Propose–Probe–Compose and persistent improvement lessons without task-time ground truth. It does not establish a trustworthy substitute for external correctness verification on Agent Core. Its published example has unrestricted network/sandbox-off execution; do not import that into Agent Core.

### 13.2 Revised order and falsifying experiment
1. **HS-P0 plus HG-1/HG-2 source-only:** map actual oracle-backed task failures, positive controls, and existing owner for matched-budget null comparisons and same-task contrast. If no independently verified comparable examples, STOP with insufficient-evidence; do not build.
2. **HS-P1 with HG-3 constraints:** one module-locked, one-hook candidate and an explicit NO-OP; include intended modification action, expected affected/protected cases and a falsifier, plus reviewer diff when a candidate is ever staged.
3. **HS-P2 (separately approved verification):** compare baseline, equal-budget simple retry/search control and candidate using frozen model/grants/cases/evaluator; split diagnostic/training, iterative validation and a sealed final test. Do not repeatedly tune on lockbox. Record safety/Skill invariant regression separately.
4. **HS-P3 conditional:** only if multiple candidates and reliable cost/noise signals exist, show trade-off advisory. Any incorporation still requires exact revision approval; never auto-promote or activate.
5. **HG-4 contract audit can run as a separate read-only review**, with any security code/testing gated by explicit new scope.

### 13.3 What “sufficient learning” would mean
A claim of *no remaining valuable gap* needs much more than a few papers: representative source/test parity for prioritized mechanisms, current consumer identity, independent adversarial/negative cases, fair null baselines and failed hypotheses tracked. The catalog has **98 bibliographic bullets**, not 98 analyzed implementations. It is therefore **not exhausted**. Stop researching a specific family when two bounded evidence passes find no new applicable mechanism or valid consumer, and record remaining unknowns instead of claiming absolute certainty.

**R3 decision requested:** `APPROVE HS-P0 + HG-1/HG-2 source-only` (recommended initial limited analysis), `REVISE`, `HOLD`, or `REJECT` for this exact revision. No product tests, security changes, code builds, runtime modifications, Native development, release or deployment are authorized by this proposal alone.

## 14. Revision 4 — Research-to-System-Improvement, tanpa duplikasi atau capability downgrade (2026-10-22)

**Status keputusan R4: PROPOSED / BELUM DISETUJUI.** R4 memperluas penerapan proposal lama, bukan membuka proyek/self-improvement engine kedua. R1–R3 di atas dipertahankan sebagai sejarah dan sumber acceptance; keputusan r3 pada bagian 13.3 menjadi historis, bukan persetujuan untuk R4.

### 14.1 Masalah, sumber riset, dan batas klaim
- **Masukan yang ditinjau:** docs/plans/Riset Improvement Harness AI Agent.md; SHA-256 3c28d81ae29f86b4468d57fbc8d9c899dedad0014aa4c457e463c4e92e75d071. Ini dokumen riset 166 baris (termasuk formula sebagai gambar), BUKAN bukti seluruh mekanismenya belum ada atau telah efektif.
- **Rujukan internal yang juga dibaca:** docs/research/Agent-Core-Memory-Learning-Architecture-20261022.md, docs/research/Agent-Core-Polyglot-Improvement-Contract-20261022.md, docs/CODEBASE.md, AGENTS.md, serta source terpilih di src/memory dan src/learning.
- **Rujukan proposal yang tidak boleh digandakan:** proposal ini sendiri rev 1–3, terutama HS-P0–P3 dan HG-1–HG-6. R4 hanya menambahkan jalur penerjemahan berkas riset dan pemetaan lintas domain; HS-P2 dan HG-1 tetap SATU paket evaluasi tiga jalur.
- **Klaim peneliti/paper:** hipotesis atau author-reported hingga diuji independen di Agent Core. Formula score dalam berkas riset tidak ditranskripsi menjadi konstanta produksi tanpa verifikasi terhadap sumber, domain, dan implementasi sekarang.
- **Tujuan hasil:** setiap file riset yang benar-benar relevan dapat menghasilkan keputusan REUSE / ADAPT / NEW-MINIMAL / DEFER / REJECT / NO_OP, kemudian SATU kandidat per peluang terukur, tanpa mengubah sistem hanya untuk menampung konsep.

### 14.2 Peta source-to-research dan keputusan anti-duplikasi
| Tema dari dokumen riset | Owner current-source yang teramati | Keputusan R4 / gap yang masih perlu dibuktikan |
| --- | --- | --- |
| Intelligent decay dan retensi | src/memory/retention-score.ts memiliki score berbasis umur, akses dan salience; retirement.ts menjaga fingerprint | REUSE. Audit call-site/efek ranking secara read-only; jangan memasang rumus kedua atau auto-delete. Skor rendah hanya masukan review, tidak membuktikan fakta salah |
| Retrieval-driven reconsolidation | src/memory/reconsolidation-experiment.ts dan reconsolidation-report.ts menyediakan fixture, guard revisi dan verifikasi offline | REUSE eksperimen yang ada. Efek retrieval produksi serta kelayakan mutasi canonical BELUM terbukti; jangan auto-merge/rewrite/link |
| Memori prosedural berversi | src/agent-learning-loop.ts, src/learning/external-procedure.ts dan src/skills/service.ts sudah memiliki kandidat, syarat reuse, revisi, rollback | REUSE. Tidak boleh ada ProcedureStore, Skill catalog, atau model Learning kedua; evaluasi negatif ikut dipertahankan |
| Stored / retrieved / delivered / verified use | src/memory/retrieval-ledger.ts, controller-session.ts dan Learning evidence receipts | REUSE. Pertahankan pembedaan claimed-use vs verified goal effect; jangan menyimpulkan hubungan kausal dari recallCount |
| DARC dan information barrier | src/agent-learning-loop.ts mempunyai failureClass, src/learning/feature-outcome-pool.ts merangkum polaritas, external-evaluation.ts menahan benefit verdict | ADAPT HANYA BILA PERLU: buat crosswalk tambahan action-validity/procedural/format-precision sebagai proyeksi evaluasi, bukan mengganti enum/event lama; verifier tidak menerima raw answer/key |
| Prospective intentions dan HOW/WHEN | src/memory/prospective-intentions.ts mengevaluasi waiting/eligible/expired/resolved/unknown; claim-review.ts menyimpan method, triggers, cadence | REUSE. Tingkatkan kualitas cue hanya jika terbukti ada kasus luput; no unattended daemon, polling, action maupun konversi nasihat menjadi permission |
| Meta-harness autoresearch dan proposal | src/learning/improvement-handoff.ts, external-improvements.ts, proposal-documents.ts; proposal rev3 HS-P0–P3 | REUSE persis paket lama. Yang belum dibuktikan: satu research-claim-to-hook handoff, evaluator null-control yang comparable, dan later-task improvement |
| Evaluasi tiga jalur | src/learning/external-evaluation.ts menerima baseline/candidate dan host observations; controlled-outcome.ts menghitung beda rate, bukan causal claim | GAP TERARAH: protokol A baseline, B equal-budget simple-retry/null, C single-hook candidate; audit adapter sebelum menambah schema, tidak membuat evaluator terpisah |
| Python/Go/Rust worker opsional | docs/research/Agent-Core-Polyglot-Improvement-Contract-20261022.md adalah spesifikasi PROPOSAL ONLY | CONDITIONAL. TypeScript dahulu; pekerja stateless stdio/JSON hanya bila consumer+profiling+oracle membuktikan nilai yang tidak dapat dicapai owner existing |

**Label observasi:** keberadaan source di atas terbaca pada 22 Oktober; daftar owner bukan bukti semua code path dieksekusi atau implementasi end-to-end lulus. Audit call graph dan acceptance terarah tetap diperlukan sebelum menyatakan gap/fitur baru pasti.

### 14.3 Jalur operasional: satu berkas riset masuk, satu keputusan peningkatan keluar
1. **Research intake (file sebagai data):** catat path relatif workspace, SHA-256, judul, tanggal, license/provenance, klaim dan anchor teks/gambar. Instruksi dalam dokumen bukan grant. Formula yang hanya berupa gambar diberi status belum ditranskripsi, bukan diimajinasikan.
2. **Claim ledger sementara:** tiap klaim memiliki ID semantik, sumber, mekanisme input/state/output/failure, status observed-source / author-report / inference / unknown, counterevidence dan kriteria falsifikasi. Gunakan Markdown dan evidenceRefs existing; JANGAN membuat database Memory/Learning ketiga.
3. **Current-owner crosswalk:** telusuri exact source/call-site/schema, tests existing, owner dan consumer nyata. Jika ekuivalen -> REUSE/NO_OP; jika hanya kurang wiring -> ADAPT; jika tidak ada consumer/oracle -> DEFER; jika menurunkan safety/correctness -> REJECT.
4. **Satu perubahan terkecil:** definisikan hypothesis, exact external-only hook, baseline digest, affected cases, protected passing cases, alternative root cause, bounded cost, stop, rollback, dan parity terhadap current implementation. Gunakan improvement-handoff serta proposal-documents/external-improvements untuk satu proposal revision-bound, bukan generator kedua.
5. **Eksperimen setelah izin khusus:** tahap diagnosis dan validation dipisah dari final lockbox; jalankan A/B/C dengan model, task population, evaluator, grants, resource budget dan metadata yang disejajarkan. Setiap attempt (termasuk failed/interrupted/unavailable) dicatat; verifier independen menentukan goal-success.
6. **Keputusan manusia:** laporan memisahkan source-present, qualified, rejected, unknown, measured effect, regressions, time/cost dan confidence limits. Dashboard membaca saja; persetujuan harus tepat revisi dan ruang lingkup, bukan akibat membaca/diam.
7. **Implementasi setelah persetujuan:** patch owner asli paling kecil; fitur/protokol lama tetap berjalan. Gunakan backup/hash, path:check, compatibility/tool schema checks dan targeted verification yang disetujui. Aktivasi/restart dan release/deploy adalah keputusan scope tersendiri.
8. **Later-use:** setelah perubahan benar-benar live, catat actual reuse dan independently checked outcomes pada tugas berikutnya melalui RetrievalLedger/Learning. Jika manfaat tidak terbukti atau regresi muncul, jangan mengklaim improvement; lakukan review/revert sesuai kontrak.

### 14.4 Paket keputusan (bukan duplikasi HS-P0–P3)
- **R4-S0 | read-only source parity (prioritas pertama):** selesaikan matriks klaim riset versus source dan plan/status active/archived; audit keterhubungan retention/reconsolidation/procedure/intention, serta tiga-arm evaluator dan DARC crosswalk. Deliverable: satu matriks berisi REUSE/ADAPT/DEFER/REJECT/UNKNOWN dengan source refs dan keterbatasan, tanpa source edit/test.
- **R4-S1 | standar Research Application Packet (setelah S0):** definisikan template Markdown di docs/research untuk source digest, claim IDs, existing owner, effect hypothesis, falsifier, competing explanations, affected/protected cases, confidence dan permission boundary. Ini artefak turunan, bukan canonical Memory tambahan atau Skill otomatis.
- **R4-S2 | bounded wiring (conditional, sesudah keputusan baru):** hanya bila S0/S1 membuktikan gap, tambahkan projection/adaptor terkecil pada src/learning yang sudah ada, misalnya DARC crosswalk atau manifest three-arm; jangan menambah tool/daemon/storage/LLM baru demi memenuhi checklist donor. Pilih satu hook pada satu waktu.
- **R4-S3 | acceptance tiga-arm:** INHERIT HS-P2/HG-1, tidak membuat suite paralel. Baseline, equal-budget null dan kandidat diuji dengan oracle, negative controls dan sealed final holdout. Data tidak comparable atau terlalu kecil -> INSUFFICIENT_EVIDENCE, bukan PASS.
- **R4-S4 | governance + compatibility:** gunakan existing external-improvements, Skills revision decisions dan user review. Jika refaktor struktur lebih baik, izinkan perpindahan internal dalam src/, docs/, scripts/, tests/, runtime/, dist/ atau .changeset/ dengan import/export/CLI/MCP compatibility dan migration-readback terjaga. Jangan menghapus publik owner, historical records, source atau capability yang masih dibutuhkan.
- **R4-S5 | post-live learning:** ukur later-task effect termasuk kontrol tanpa perubahan, rollback readiness dan negative transfer; tulis verified learnings hanya ke canonical owner existing. Hasil unknown tidak dipromosikan.
- **R4-S6 | optional polyglot:** boleh diseleksi hanya jika ada consumer konkret, perbandingan native-vs-worker sah, network disabled, mutation none, stdio JSON ketat, resource cap, workspace/task digest dan cleanup/fail-closed. Jangan transplant agent runtime Python/Go/Rust.

### 14.5 Invarian no-downgrade, keamanan dan pemindahan struktur
- **Must preserve:** persistent canonical Memory, episode/revision/source lineage, retrieval + all existing ranking modes, Learning checkpoints/pending reviews, procedure/Skill revisions, proposal/decision history, task grants, existing MCP actions/parameters/HTTP routes, UI review, portable paths, replay/rollback dan independently verified outcome distinctions.
- **Must not weaken:** task authority, CAS/journaling, scope/auth, privacy/redaction, data corruption checks, user approvals, evaluator independence, human-in-loop proposal, idempotency/ambiguous retry and no implicit scheduling. Candidate cannot alter its own oracle/grants/evidence or mark itself approved.
- **Structure can move, capability cannot disappear:** if relayout of modules is justified, first map all imports/callers and historical compatibility, preserve public exports/JSON schemas/ids, use reversible migration/alias where needed, measure parity against baseline and update CODEBASE; do not equate renamed files with an improved system.
- **Non-degradation gate:** every previously verified protected passing case and contract must still meet its prior behavior. One failed security/authorization/canonical safety requirement blocks promotion, regardless of candidate average score. Performance cannot compensate for correctness loss.
- **No implicit state mutation:** reading a research document cannot trigger source patch, Memory rewrite, test run, tool installation, skill activation, unattended action, release or deployment.

### 14.6 Acceptance/falsifiers, bukti, risiko dan rollback
| Gate | Bukti wajib | Fail / stop |
| --- | --- | --- |
| R4-S0/S1 | Semua klaim high-impact memiliki sumber dan exact-owner disposition; reused items tidak dibangun ulang; document hash/readback | Tidak ada consumer/independent oracle, owner tak jelas -> DEFER / NO_OP |
| R4-S2 | Exact source diff satu hook, external-only, backward compatibility, no unexpected owner/state | Native/grant touch, semantic regressions, duplicate persistence -> REJECT |
| R4-S3 | Frozen A/B/C metadata, equal effort, full attempts, independent task oracle, sealed final test, negative/positive controls | Cost-only win, holdout contamination, outcome unverifiable -> WITHHOLD benefit |
| R4-S4 | Exact approved document revision, nonbreaking interface inventory, scoped backup, targeted tests/build/activation readback jika diotorisasi | Silent capability removal, unsafe restart/migration, missing rollback -> STOP |
| R4-S5 | Later-task applied/adapted receipt + independently observed goal consequences and negative transfer | Merely stored/retrieved/delivered, or self-reported success -> NO causal claim |
- **Risiko riset:** recency/access can create feedback loops, automated retention can erase counterevidence, DARC labels can misattribute failures, heldout reuse can leak answer signals, and additional worker can add attack surface/cost. Semua tetap hipotesis sampai evidence nyata.
- **Rollback:** untuk proposal-only, kembali ke revisi proposal sebelumnya/restore checkpoint (bukan source rollback). Untuk future code pilot, restore exact baseline and user data consistency via scoped existing checkpoints and validation; stop worker/fixture only, never overwrite canonical Memory or remove existing capabilities.
- **No measured performance gain claimed:** source inspection dan proposal publication bukan acceptance production atau proof intelligence improvement.

### 14.7 Riwayat revisi dan keputusan yang diminta
- R1–R3: tetap utuh di atas; metadata lama/rekomendasi r3 menjadi riwayat.
- **R4, 2026-10-22:** mengikat file riset lokal, source atlas/polyglot contract dan crosswalk implementasi, memprioritaskan research-application workflow tanpa duplikasi, menambah preservation/no-downgrade gates serta izin pemindahan struktur bersyarat. Tidak ada install, build, product test, restart atau perubahan logic.
- **Rekomendasi scope pertama:** APPROVE R4-S0 + R4-S1 (audit source dan template/protocol saja). R4-S2–S6 tetap conditional; memerlukan keputusan eksplisit berbasis hasil S0, dan R4-S3 mengacu tepat HS-P2/HG-1 agar tidak menjadi acceptance kedua.
- **Pilihan keputusan atas revisi ini:** APPROVE scoped packages / REVISE / HOLD / REJECT. Status dokumen PROPOSED; keputusan pengguna belum tercatat, tidak ada authority mengeksekusi produk.


## 15. REVISION 5 — Finalisasi cakupan seluruh berkas riset, konflik, dan kontrak integrasi (2026-10-22)

**Revisi 5 adalah keputusan rancangan terkini.** Bagian 1–14 adalah histori, analisis, dan kontrak yang tetap berlaku sejauh tidak bertentangan dengan revisi 5. Bagian ini tidak menyatakan produk diimplementasikan, diuji, diaktifkan, atau terbukti lebih baik. Tidak ada persetujuan implementasi pada revisi ini. Istilah "cakupan selesai" hanya berarti setiap mekanisme dalam sumber diberi disposisi dan kondisi bukti, bukan semua gagasan wajib dibangun.

### 15.1 Identitas sumber dan aturan keputusan
- Sumber otoritatif permintaan: docs/plans/Riset Improvement Harness AI Agent.md, 166 baris, SHA-256 3c28d81ae29f86b4468d57fbc8d9c899dedad0014aa4c457e463c4e92e75d071, dibaca dari komputer lokal. Bagian naratif hingga baris 146; baris 148–166 memuat definisi gambar persamaan. Sepuluh fragmen gambar image1–image10 diperiksa sebagai formula/simbol, bukan diabaikan.
- Referensi current-owner: pembacaan source terarah pada src/memory/retention-score.ts, service.ts, consolidation.ts, promotion.ts, reconsolidation-experiment.ts, reconsolidation-report.ts, retrieval-ledger.ts, prospective-intentions.ts, claim-review.ts, src/learning/triggers.ts, evaluation.ts, external-evaluation.ts, external-procedure.ts, external-improvements.ts, improvement-handoff.ts, proposal-documents.ts, feature-outcome-pool.ts, src/agent-learning-loop.ts; ditambah docs/CODEBASE.md dan dua riset internal di docs/research/.
- Riwayat anti-duplikasi: docs/proposals/ hanya memiliki satu proposal improvement aktif ini; docs/history-agent-core/Penguatan-Learning-Proaktif-Self-Improvement-dan-Memory.md mencatat P01–P08 sudah diimplementasikan (bukti historis, tidak diuji ulang sekarang). Sembilan proposal CME dan Marginal/Replay juga sudah didisposisikan melalui docs/proposals/README.md. Tidak ada izin menghidupkan kembali paket selesai.
- Tingkat bukti: OBSERVED SOURCE menunjukkan kode/kontrak ada, bukan runtime exercised; HISTORICAL menunjukkan laporan penerimaan terdahulu; PROPOSED adalah mekanisme kandidat; UNKNOWN adalah fakta yang belum diuji; AUTHOR-REPORTED adalah klaim publikasi pihak ketiga. Tidak ada klaim universal "zero defect" hanya dari audit terbatas.
- Keputusan per klaim: REUSE (tidak menambah owner), ADAPT-IF-GAP (tambahkan wiring terkecil bila gap nyata), EVALUATE-OFFLINE (perbandingan tanpa perubahan runtime), DEFER (belum ada consumer/oracle), REJECT (berkonflik dengan invariant), atau NO-OP (sudah cukup). Untuk semua keputusan selain REUSE/NO-OP, tidak ada aksi sampai bukti dan scope baru disetujui.

### 15.2 Traceability seluruh mekanisme dan bagian sumber
Tabel ini adalah coverage checklist untuk 10 kelompok teks utama, tabel sintesis, seluruh gambar inline, dan kesimpulan; rentang angka menunjuk baris 1-based pada hash sumber di atas.

| ID | Sumber | Klaim/kontrak dari riset | Owner atau bukti existing | Keputusan dan penerimaan |
| --- | --- | --- | --- | --- |
| F01 | 3–8 | Eksperimen external AI; Native tersedia | AGENTS.md; CODEBASE §1 | REUSE. Jangan mengubah Native-specific code atau grant |
| F02 | 3–8 | Satu canonical Memory runtime/memory, indeks/Grafel turunan | memory/host-runtime.ts, service.ts, CODEBASE §4/7 | REUSE. Tidak ada Memory store/index canonical kedua |
| F03 | 3–8 | CAS, journal, crash recovery | memory/transaction.ts, promotion.ts | REUSE. Mutasi source harus menjaga transaction/rollback |
| F04 | 3–8 | Memory, Skill, proposal advisory bukan izin | learning/external-improvements.ts, skills/service.ts, auth | REUSE. Human exact-scope/revision approval diperlukan |
| M01 | 9–12 | Lexical, BM25, vector fusion | memory/retrieval.ts, index.ts | REUSE semua ranking mode; tak boleh mengganti default diam-diam |
| M02 | 12–15, image1–5 | Utility episodik query-dependent S(M_i)=R_i F_i S_sim(M_i,Q), R_i=e^(-lambda Delta t) | memory/retention-score.ts, service.ts; rumusnya berbeda | EVALUATE-OFFLINE, bukan drop-in replacement; definisi F_i, similarity, lambda dan query sampling perlu praregistrasi |
| M03 | 15–17, image6 | Jika S(M_i) di bawah theta_review, distill/review bukan delete | memory/service.ts::retirementReview, consolidation.ts, promotion.ts | REUSE guard. Tidak ada penghapusan/auto-distill; cek lineage, pinned, contradiction, temporal facts |
| M04 | 11–19 | Retrieval-driven reconsolidation | memory/reconsolidation-experiment.ts dan report.ts fixture-only | EVALUATE-OFFLINE jika kasus ada; tak menganggap eksperimen sebagai produksi |
| M05 | 18–19 | Episodik vs semantik vs prosedural | memory/episodes.ts, learning/review.ts, agent-learning-loop.ts, external-procedure.ts | REUSE owner; data episodik bukan Skill/prosedur otomatis |
| M06 | 18–19, image7 | Prosedur berversi v1->v2->v3, success/failure history | learning/external-procedure.ts, agent-learning-loop.ts, skills/service.ts | REUSE revision/staging; audit fail_count/negative-case coverage sebelum ADAPT |
| R01 | 21–32 | Stored, retrieved, delivered, verified use berbeda | memory/retrieval-ledger.ts, controller-session.ts | REUSE, catat attempt, delivery, use dan outcome terpisah |
| R02 | 30–32 | Memori meningkatkan tugas hanya dibanding kontrol tanpa memori | learning/external-evaluation.ts, scripts/verify/cumulative-workflow-eval.mjs | EVALUATE-OFFLINE/heldout. Outcome verified sendiri belum causal proof |
| L01 | 34–41 | Episode(taskKey/workspace) dan checkpoint selalu reviewDue untuk tugas berarti | learning/external-controller.ts, triggers.ts, service.ts | REUSE. Tidak ada scheduler kedua |
| L02 | 38–41 | Reflexion atas kegagalan, tidak blind-retry; diagnosis hipotesis | agent-learning-loop.ts, tracker, existing controller contract | REUSE. Catat alternatif penyebab dan efek pemulihan, jangan auto-retry |
| L03 | 38–41 | Verified generic->MemoryLearningSink, coding->CodePatternLearningSink | learning/service.ts, sink-manager.ts, memory/learning-sink.ts | REUSE. No second curator; unknown/negative ke proposal atau no-op |
| L04 | 42–45 | DARC action-validity, procedural, format-precision | agent-learning-loop.ts::AgentFailureClass adalah taksonomi berbeda | ADAPT-IF-GAP sebagai crosswalk advisory berbasis bukti, bukan penggantian enum shared |
| L05 | 43–45, image8 | Barrier: reward [0,1], failure code abstrak, behavioral profile | learning/evaluation.ts, external-evaluation.ts, verification tools | ADAPT-IF-GAP pada projection eksperimen saja; oracle privileged terpisah dari optimizer |
| P01 | 47–60, image9–10 | Time cue t<due/t>due dan event cue | memory/prospective-intentions.ts::evaluateIntentions | REUSE klasifikasi, no background polling |
| P02 | 51–60 | waiting, eligible, expired, resolved, unknown | memory/prospective-intentions.ts, memory/episodes.ts | REUSE status; expired/resolved bukan mutasi arsip otomatis |
| P03 | 60–61 | Eligible diprioritaskan, HOW dan WHEN validasi ulang | prospective-intentions.ts, memory/claim-review.ts | REUSE. Tidak merebut hak scheduler/worker |
| H01 | 63–70 | Autoresearch/Harness2: weakness mining, single-hook, fixed budget | tracker, improvement-handoff.ts, proposal rev1–4 | ADAPT-IF-GAP satu controller-led workflow, NO auto-optimizer |
| H02 | 65–70 | Error/proposal, independent oracle dan reversal/rollback Git | learning/evaluation.ts, external-evaluation.ts, file_checkpoint | DEFER Git worktree sampai scoped isolation terbukti; rollback exact state saja |
| H03 | 69–75 | User APPROVE/REVISE/HOLD/REJECT, revision-bound decision | external-improvements.ts, proposal-documents.ts, docs/proposals/REVIEW-GUIDE.md | REUSE, Dashboard GET bukan approval |
| H04 | 71–75 | Proposal metadata: schema, id, date, source/workspace, SHA baseline, evidence, A/B/C, rollback | exact document + existing improvement registration | ADAPT-IF-GAP pada template/validator yang sudah ada, bukan registry kedua |
| X01 | 77–83 | Optional Python/Go/Rust pure compute, strict stdio JSON, network disabled, mutation none | docs/research/Agent-Core-Polyglot-Improvement-Contract-20261022.md | DEFER by default; TypeScript existing first |
| X02 | 83–103 | Input schemaVersion, kind, taskId, workspace, hypothesis, sourceRefs, baselineDigest, allowedSurfaces, budgets, network, mutation; candidate/no-op/insufficient-evidence output | existing Learning host scope, verification and source digest | ADAPT-IF-JUSTIFIED hanya sebagai one-shot bounded worker, not machine/agent kedua |
| E01 | 105–109 | Jalur A produksi, B equal-budget null, C single-hook candidate | external-evaluation.ts saat ini hanya 2 arm | ADAPT-IF-GAP adapter eksperimen; satu evaluator authority; pertahankan benefitVerdict=withheld |
| E02 | 105–109 | Sealed heldout, improvement signifikan terhadap A DAN B | docs/proposals rev3 HS-P2, HG-1 | EVALUATE setelah approval; preregister oracle, metode statistik, budget, safety |
| S01 | 110–124 | Lima domain dalam tabel sintesis + empat pilar kesimpulan | F/M/L/P/H/X/E di atas dan revisi terdahulu | Semua memiliki disposisi, tidak berarti semua menuntut coding |
| B01 | 127–146 | Daftar 18 rujukan, campuran current docs, paper, blog, komunitas | Indeks provenance §15.12 | REFERENCE ONLY sampai tiap klaim diperiksa ke sumber primer |
| IMG | 148–166 | 10 gambar simbol/formula (Mi, S(Mi), S product, lambda, exponential, theta, version chain, reward domain, t<, t>) | Formula ditranskripsi dalam §15.3 dan §15.6 | Tidak ada simbol yang menjadi parameter produksi tanpa uji |

### 15.3 Kontrak Memory: perbedaan matematika tidak boleh menjadi downgrade
- Sumber image1–6: M_i adalah record; S(M_i)=R_i * F_i * S_sim(M_i,Q); R_i=exp(-lambda * Delta t), ambang theta_review. Nilai/rentang F_i, fungsi S_sim, lambda dan theta_review TIDAK ditetapkan oleh dokumen riset. Jangan menciptakan angka atau melakukan auto-tuning berbasis asumsi.
- Source aktual retention-score.ts menghitung score = salience * exp(-0.02 * ageDays) + 0.6 * log1p(accessCount) * exp(-0.04 * daysSinceAccess), dengan salience dibatasi [0.25,2]. Source service.ts memakai skor tersebut untuk RETIREMENT REVIEW PREVIEW dan alasan low-retention; bukan mengganti ranking query fusion pada retrieval.ts. Dua formula tidak ekuivalen dan concern-nya berbeda (query relevance versus retensi global).
- Rekomendasi: pertahankan persis mekanisme retention preview sekarang. Bila ada kegagalan retrieval ber-oracle, bandingkan calon query-dependent product score secara offline sebagai ranking/proposal-only di owner evaluasi Memory yang ada, melawan fusion sekarang dengan corpus/queries/digest/knownAt sama. Jika tidak ada peningkatan hit@k/relevance pada heldout atau ada regress pada long-tail/rare/pinned/negative cases, NO-OP.
- Jika suatu record low-utility, source statement tentang distillation adalah HIPOTESIS; review semantic claim dan origin, negative/contradictory evidence, source fidelity, temporal validity, pinned and user-forgotten states melalui consolidation/promotion existing. Tidak pernah delete canonical note karena threshold, akses rendah, atau embedding gagal. Preserving both old episode and qualified semantic abstraction requires authorized guarded transaction and lineage; unverified abstraction tidak dipromosikan.
- Reconsolidation fixture existing mengusulkan related-edges saja, memiliki max-bound/digest/corpus guards dan report benefitProven=false. Itu BUKAN bukti auto-rewrite semantik atau live recalibration; perubahan retrieval-to-memory-link hanya layak melalui existing promotion flow setelah verifier + human scope.

### 15.4 Kontrak prosedur, Learning, penggunaan dan bias hasil
- image7 = v1 -> v2 -> v3 adalah ilustrasi perubahan versi, bukan prosedur eksisting yang wajib dimigrasi. Candidate tetap memakai agent-learning-loop.ts dan external-procedureAdmissionSchema: trigger/prerequisites, action, avoid, checker, rollback, kasus positif/negatif/pengecualian, provenance, allowedTools. Semantik teks dan penyangkalan tidak boleh hilang saat relayout.
- Evolusi hanya ketika ada real independently verified recovery, kegagalan lama ikut dihitung, source-task IDs berbeda, current context applicable dan unresolved needsReview tidak ditutupi. Record failed task, failureTaskIds dan contractReceipts, bukan sekadar keberhasilan versi terbaru. Failure_count derived from existing receipts, tidak memerlukan store angka mandiri.
- Learning episode, verification, checkpoint, pending review, semantic outcome, sink capture, skill proposal dan later-use adalah state terpisah. Candidate yang tidak verified = proposal-only/awaiting-verification; jangan menyulap reviewDue atau controller self-report menjadi causal effect.
- Retrieval chain lebih presisi daripada empat label narasi: STORED -> RETRIEVED -> DELIVERED -> DECLARED APPLIED/ADAPTED/REJECTED -> VERIFIED GOAL OUTCOME -> (opsional) CAUSAL EFFECT comparison. Receipt actual use dengan verificationRef membuktikan provenance/outcome yang direcheck, bukan besarnya kontribusi Memory tanpa matched counterfactual.
- Kontrol memory-on/off untuk eksperimen harus memakai *isolated evaluation* yang tidak mematikan, menghapus atau menyembunyikan canonical Memory produksi. Baseline A melestarikan perilaku normal; counterfactual B hanya dalam fixture authorized, dengan grants/model/budget setara. No uncontrolled production memory disablement.

### 15.5 DARC dan information barrier, tanpa evaluator agent kedua
- Source DARC 3 kelas adalah lens analitis: action-validity (tools/arguments/scope/precondition tidak valid), procedural (urutan/prerequisite/recovery salah), format-precision (schema/output exactness). Existing AgentFailureClass: tool-runtime, verification, hypothesis-disproved, no-progress, contradiction, provider-transport, unknown. Ini BUKAN mapping 1:1; sebuah failure bisa punya banyak lens atau insufficient-evidence.
- Jangan ubah enum shared agent-learning-loop.ts yang digunakan Native. Implementasi potensial adalah pure, optional, external-only diagnostic projection dengan {observedFailureRef, currentClass, proposedLens, alternativeCauses, confidence, evidence, falsifier}, tidak memutasi log asli, tidak mengeksekusi recovery sendiri.
- Pisahkan tiga peran logis DI DALAM owner verifikasi yang sudah ada: (1) task runner menjalankan kandidat yang diizinkan, (2) existing independent deterministic oracle memeriksa jawaban/evidence secara berizin dan dapat mengakses expected answer di trust boundary terkunci, (3) optimizer/controller hanya menerima hasil redacted/aggregated. Ini bukan penambahan runtime/evaluator-agent baru.
- Payload feedback yang keluar dari oracle dibatasi: reward numerik finite pada [0,1] dengan definisi per-case terdaftar; failureCategory enum {incomplete_coverage,format_error,timeout,false_positives,action_invalid,procedural_miss,unknown}; behavioralProfile agregat count/transition/distribution yang tidak mengandung jawaban mentah, answer key, trace sensitif, task secrets, atau hidden chain-of-thought. Metrik detail tidak dikirim bila berisiko bocor; akses, jumlah sampel dan digest dicatat.
- Tantangan penting: klaim sumber bahwa "evaluator tidak boleh melihat jawaban mentah" tidak boleh menghilangkan kemampuan oracle menghitung kebenaran. Oracle privileged boleh membaca data yang diperlukannya dalam scope yang benar; hanya *controller/proposer/curator yang mengoptimasi kandidat* dibatasi dari kunci/answer. Verifier harus dibekukan terpisah dari candidate. Jika hanya self-score tersedia, status insufficient-evidence dan tidak ada promosi.
- Reflexion triggered oleh failure nyata -> bounded alternative diagnosis -> satu perubahan strategi atau stop -> independent outcome -> checkpoint/review. Tidak ada blind retries, automatic failure model training, parallel reflection agent atau log sensitif yang disimpan permanen.

### 15.6 Prospective intentions: status dan state mutation adalah hal berbeda
- Source image9–10 hanya operator t< dan t>, bukan kontrak bahwa expiry otomatis mengarsip/menghapus. Existing prospective-intentions.ts: waiting bila belum due, eligible bila time/event observed, expired bila expiry dilampaui, resolved bila existing working item.state='resolved', unknown bila parse/time/evidence tidak dapat dipakai; fungsi pure dan advisory.
- Lima status harus tetap muncul tanpa mengubah field lama. Resolved existing HANYA melihat state item, tidak membuktikan independent task verification saat evaluateIntentions dipanggil. Untuk menutup kewajiban, external controller perlu bukti outcome nyata dan kemudian prosedur perubahan working-state melalui owner Memory yang sudah ada jika memang diizinkan.
- Prioritas eligible sudah diproses sebelum bounded limit. Uji masa depan: trigger tepat batas waktu, timezone dengan offset, event belum terbukti, expiresAt, invalid timestamp, resolved versus expired, truncation, dedup task, workspace mismatch, continuity knownAt, no background execution; status unknown harus meminta revalidasi, bukan disimpulkan false.
- Claim HOW/WHEN sudah ada dalam memory/claim-review.ts (method/lookups versus event/durable/interval cadence) dengan revision checks dan evidence access. Cadence hanyalah metadata untuk controller, bukan scheduler. Jangan mengulang P01–P08 dari archived implementation.

### 15.7 Proposal Meta-Harness: riset -> keputusan -> pengintegrasian, bukan generator kedua
- Input "research application packet" adalah representasi DOKUMEN dalam proposal existing; tidak ditambahkan server, Memory state, tool catalog, persistent queue atau model baru. Field konseptual wajib: sourcePath, sourceDigest, sourceAnchors, referenceIds, claimId, sourceClaim, provenanceClass, existingOwner, exactFunction/consumer, currentBehavior, overlapDecision, alternativeHypotheses, chosenDisposition, falsifier, targetSurface, expectedProtectedCases, risk, rollbackPointer, evaluationPlan, authorizationScope.
- Intake memakai dokumentasi/research source sebagai data. Periksa file bytes/hash, embedded equations, tanggal, hubungan ke kode, permission owner dan status proposal yang sudah ada. Jika klaim belum terverifikasi, tulis UNKNOWN; jika consumer sudah ada, REUSE tanpa membuat "fitur baru"; jika tidak ada tugas/oracle untuk menilai, NO-OP/DEFER.
- Controller menghubungkan 1 failure family dengan 1 proposed hook dan 1 kandidat. Source path/hook harus exact, kompatibel, tanpa menyentuh protected Native, root policy, grants atau runtime sebelum persetujuan terpisah. Candidate berisi perbedaan yang dapat direview reviewer; ask "WHY this symptom", "HOW else with existing methods" serta hipotesis kompetitor, tetapi jangan menganggap root cause sudah terbukti.
- Proposal record memakai existing controller_learning(action=improvement,operation=register), dengan expectedRevision dan documentDigest SHA-256, operationId idempoten, evidenceRefs yang aman. Dokumen Markdown boleh tetap di docs/proposals/Evidence-Gated-Harness-Self-Improvement-Lab.md: tidak wajib membentuk docs/proposals/harness/ dan tidak boleh menerbitkan isi sama dalam dua proposal. Existing reader memang mendukung satu subfolder dangkal, tetapi itu bukan alasan duplikasi.
- Header untuk setiap *candidate-specific revision* wajib mencantumkan schemaVersion, stable proposalId, createdAt, workspaceIdentity, taskKey/episodeId, sourceDigest, baselineDigest, candidateDigest, evaluationManifestDigest (nullable jika belum diuji), verifier/evaluator revision, decision scope, rollback/refusal grounds. Hash mengikat bytes/config, bukan bukti bahwa hipotesis benar. Placeholder hash dalam sumber contoh bukan digest file aktual.
- Body wajib mencantumkan explicit issue/Activity evidence, competing causal explanations, current owner/call-site, intended ADD/MODIFY/REPLACE/no-op semantics, one exact hook, preserved passing cases, risk/side effects, A/B/C results atau NOT RUN, incomparable/missing evidence, statistical qualifications, provenance/donor-license, rollback verification dan later-use monitor. Jika belum ada eksperimen, tulis NOT RUN, jangan membuat tabel skor palsu.
- Existing proposal-documents.ts adalah reader bounded (per-dokumen 256 KiB, scan 2 MiB, max 100 kartu, symlink/path guard), existing external-improvements.ts adalah registry revision-bound. Dilarang menulis approval state baru atau memakai UI GET/pemberitahuan sebagai tanda accepted. Feedback controller-reported bukan bukti trusted human approval; pastikan origin/version user nyata dari host.
- Human memilih APPROVE / REVISE / HOLD / REJECT pada exact revision dan scope. Approval untuk read-only review tidak sama dengan build, test, activation, Skill promotion, cleanup atau deploy. Jika revisi berganti, historical decision tidak otomatis berlaku.
- Kriteria selesai integrasi sesungguhnya memerlukan exact approved patch -> scoped source diff -> verification -> compatible resident readback -> later task use/effect. Proposal selesai direview tidak berarti implementasi DONE.

### 15.8 Autoresearch experiment, budget dan rollback tanpa berisiko merusak workspace
- Rute terpilih adalah HS-P0/P1/P2/P3 dari revisi sebelumnya dengan penguatan HG-1/HG-2: recurring failures yang ber-evidence -> counterexamples -> 1 bounded change -> matched controlled evaluation -> human review. Bukan recurrent unattended optimization loop; tidak ada parallel self-coding agents.
- Prioritas hook paling aman: external instruction/advisory text, context selection policy dalam pure offline fixture, atau external workflow decision boundary. Jangan mengubah auth/grants, root AGENTS.md, Native-specific declarations, active Skill atau real canonical Memory untuk menguji kandidat.
- Candidate isolated copy/worktree hanya dibuat dengan izin terpisah. Sebelum Git operation: periksa status worktree, source digests, symlink/junction, current owner's modified bytes. Pada pemeriksaan perancangan ini perintah git status gagal dengan "dubious ownership" pada E: filesystem; JANGAN menjalankan git config --global safe.directory atau git reset sebagai workaround diam-diam. Gunakan existing file_checkpoint exact file/snapshot untuk dokumentasi; eksperimen Git-branch/worktree di-DEFER sampai lingkungan aman dan perubahan Git disetujui.
- Rollback harus menjaga unrelated edits, state consumer, symlinks, workspace root identity, Memory CAS/revisions, active Skill versions dan user data. Precompute exact paths and baselines, validate restore preview digest sebelum restore, never operate on unspecified roots. Jika gagal rollback cleanly, STOP dan laporkan blocker, bukan klaim reverted.
- Budget preregister untuk setiap arm: wall-clock/CPU (jika terukur), token/inference calls, tool calls, retries dan data access; batas stop/timeout serta fail-soft unknown. Negative finding/no-op juga valid, dan tidak boleh memaksa "candidate" karena donor mengharuskannya.

### 15.9 Polyglot adalah opsi komputasi, bukan mesin, pemilik state, atau agent baru
- Default REJECT-DEFER instalasi runtime Python/Go/Rust dan daemon untuk penerapan riset ini. Host dan owner persistensi tetap TypeScript/Node Agent Core. Tujuan nyata harus lolos native-equivalent feasibility dan cost/performance profiling sebelum mengusulkan worker.
- Bila disetujui karena ada consumer konkret, satu request/response JSON strict over stdio dengan input tepat: schemaVersion=1; kind='analysis-request'; host-bound taskId; registered workspace; hypothesis; sourceRefs allowlisted+digest; baselineDigest; allowedSurfaces; budgets {maxDurationMs,maxInputBytes}; network='disabled'; mutation='none'. Contoh sumber maxDurationMs=10000, maxInputBytes=32768 adalah batas contoh, bukan izin executable saat ini. SourceRefs contoh sha256:e3b0... dan baselineDigest sha256:9f86... dalam research bukan bukti file nyata.
- Output strict: resultKind=candidate/no-op/insufficient-evidence, version, inputDigest, exactHook (jika candidate), sourceRefs, proposedDelta (advisory text only), affected/protectedCases, cost, risk, falsifier, rollbackHint, confidence and explicit unknowns. Validate unknown keys, output size, schema, task identity, digest, allowed mutation and timeout in existing host before use.
- Worker hanya menerima snapshot teredaksi; tidak mewarisi secrets, MCP grants, write handle ke runtime/memory, auth, internet, raw answer key atau private chat. Batas OS/proses yang sesungguhnya harus dibuktikan: set "network disabled" dalam JSON saja tidak membuktikan sandbox/network isolation.
- Crash, timeout, partial stdout, bad JSON, stale revision, leaked data, orphan process, or Windows path/junction uncertainty menghasilkan unavailable/reject; no auto-retry, no success promotion. Hapus temporary owned fixture hanya berdasarkan izin dan tanpa menyentuh root/user data.
- Bila native TypeScript memenuhi verifier dengan biaya sama atau lebih rendah, NO-OP: manfaat tambahan pekerja tidak terbukti, sehingga menambah worker justru berlawanan dengan pure improvement.

### 15.10 Tiga jalur evaluasi dan syarat "pure improvement"
- **A:** current production behavior/control snapshot. **B:** current behavior plus simple retry/parallel samples/sequential refinement dengan total budget disejajarkan. **C:** single-hook candidate. Penelitian causal-use Memory ON/OFF adalah studi terpisah di fixture, bukan diam-diam mengganti arti B.
- Existing external-evaluation.ts hanya mengenal deklarasi baseline/candidate dan observation arm dua nilai. Tidak boleh sekadar menyisipkan arm B ke struktur A/C atau mengklaim fungsi itu sudah mengevaluasi tiga arm. Adapter pure/offline yang menormalisasi tiga pasangan menggunakan evaluator existing boleh dipertimbangkan SETELAH consumer/semantik/case identity terbukti; jika kontrak public perlu perubahan, gunakan additive schema version/opt-in yang menjaga v1 dan semua callers. Tidak membangun evaluator atau oracle kedua.
- Pembekuan sebelum trial: exact task population/case digests, train/diagnostic split, validation split, final held-out lockbox, oracle, evaluator/scorer revision, model, prompt/tools/grants/config, environment/corpus/knownAt, resource budgets, candidate source diff and random seeds. Oracle/lockbox owner tidak dapat diubah kandidat. Intervensi pada satu surface dan matched isolation memastikan attribusi sebatas eksperimen yang dilakukan.
- Record per-arm EVERY eligible task/opportunity, taskId/caseId, per-case goal verdict, method/infrastructure failure, unavailable, interruption, time/cost if measured, retries and attempt selection. Unknown/missing is not pass; selecting only completed/successful attempts invalidates comparison.
- Preregister primary endpoint independently verified goal success, secondary task cost/latency/memory usage if measurable, zero-tolerance safety/privacy/grant regressions, passing/control cases, minimum meaningful effect and tolerable performance variation. Budget fairness must be observed by host, not supplied candidate metadata.
- Analisis statistik memakai paired-case/repeated-seed differences bila kasus memang paired; confidence intervals atau randomization/permutation/paired bootstrap yang sesuai data dan multiplicity correction bila >=2 hypotheses. Definisikan tingkat keyakinan, sample/power/MDE sebelum final lockbox; jangan mengarang p-value atau menyebut "statistically significant" dari 12 pilot pairs, keterulangan satu task, atau data author-reported. Low sample/no reliable oracle => feasibility only, benefit withheld.
- Promotion candidate membutuhkan (a) C lebih baik daripada A DAN B pada evaluasi final sah sesuai preregistration, (b) tidak melanggar protected hard requirements dan tidak merusak positive/negative control, (c) dapat rollback dan menjaga biaya/invarian, (d) user menyetujui exact change scope. Positive observed score dengan ketidakpastian besar hanya INSUFFICIENT_EVIDENCE; biaya lebih rendah tidak membeli izin correctness regression.
- Sealed final lockbox dibuka satu kali setelah choice/threshold dibekukan; bila dipakai untuk tune ulang, lockbox tercemar dan harus diganti sebelum klaim confirmatory. Bila regression ditemukan, simpan negative evidence + revision, stop candidate tanpa auto merge, auto retry atau penghapusan fitur.
- Setelah aktivasi terpisah yang sah, ukur real later-task verified reuse serta counterfactual bila feasible; hindari mengklaim sukses karena penggunaan memory/procedure, banyak proposal, atau kecepatan tool saja. Rekonsolidasi Memory/Skill tidak otomatis terjadi ketika evaluator melaporkan gain.

### 15.11 Register konflik, solusi dan hard preservation matrix
| Konflik/risiko konkret | Bukti atau sumber | Resolusi mengikat R5 |
| --- | --- | --- |
| Riset product utility vs existing additive retention | image3/image5; retention-score.ts dan service.ts | Jangan mengganti; offline compare lalu NO-OP jika tak unggul; tidak auto-delete |
| Low utility -> distill semantik dapat membuang fakta minoritas | baris 15–18; promotion/consolidation owners | Review source claim, negative/pinned/temporal, lineage; authorized guarded mutation only |
| "Verified use" dalam tabel riset ambigu dengan sebab kausal | baris 21–32; retrieval-ledger.ts | Bedakan verified outcome dan independent controlled causal advantage |
| DARC 3 kategori vs AgentFailureClass 7 label | baris 42–45; shared agent-learning-loop.ts | Crosswalk optional external-only; preserve original labels & runtime authority |
| Barrier "evaluator tak melihat jawaban" vs oracle perlu truth | baris 43–45 | Privileged deterministic oracle; proposer/curator hanya mendapat bounded three-channel feedback |
| expired/resolved di tabel ditafsir auto archive/verify | baris 49–60; prospective-intentions.ts | Pure classification; explicit evidence + separate host-authorized mutation |
| Klaim HOW/WHEN dianggap scheduler | baris 60–61; claim-review.ts | Metadata review saja; no polling/background tasks |
| Otomatisasi meta-harness vs handoff max1 optional | baris 63–75; improvement-handoff.ts | One controller-led proposal if observed need; no daemon/compulsory candidate |
| Git rollback absolut vs environment & unrelated edits | baris 65–70; git ownership read-only error | Existing exact-file checkpoints; Git worktree deferred until safe/approved; no global config workaround |
| docs/proposals/harness/ vs current top-level proposal | baris 69–75; proposal-documents.ts | Keep one title-matched file/registry ID, no duplicate proposal tree |
| Research three-arm vs source two-arm API | baris 105–109; external-evaluation.ts | Reuse current evaluator plus opt-in adapter only if source gap proven; never misreport B |
| Statistical "significant" vs insufficient pilot | baris 105–109; HS-P2 | Preplanned power/CI independent heldout; data gap means benefit withheld |
| Polyglot worker as second autonomous engine | baris 77–103; polyglot research contract | Default DEFER; stateless pure compute only, never new agent, Memory, Learning or scheduler |
| Archived P01–P08, 9 CME, Marginal/Replay reused | existing docs/history and proposal README | Treat implemented/closed as baseline, not reopen same work |
| Zero-regression/no-conflict demanded universally | no exhaustive execution/proof in source alone | Fail-closed nondegradation gates and explicit unknowns; never claim entire repo conflict-free before staged tests |
| Source research citations mixed strength | 18 references, including Reddit and news/blog | Provenance tiers; no paper claim becomes local observed improvement |

**Nondegradation hard inventory for any later implementation:** current Memory canonical root, records/history/CAS, all three search ranking modes, task/episode/working-state, Memory disclosure budgets/ledger/claim review, Learning pending checkpoints/review + sink routing, procedure and Skill revision lineage, negative evidence, bootstrap contract, MCP descriptors and action parameter parity, scopes/grants/security, active Native runtime, existing launcher/UI, Dashboard reader and decision history, portable Windows paths, current build/install compatibility, old Skills and pending reviews. Every eligible protected baseline fixture must pass. Do not silently delete/migrate/rename a public owner to claim cleaner design.

**Relocation rule:** structure may MOVE/REFAC safely only if an approved exact-scope action shows owner/call-site/import/public ABI/schema map, route compatibility, stable stored IDs and migration from old data without loss, adapter/alias for clients when required, rollback+user-data verification and CODEBASE update. Ordinary source relayout is not improvement in itself. Root-file edits, Native sections outside this proposal scope, grants and credentials are not included in this approval.

### 15.12 Reference disposition untuk seluruh 18 daftar sumber
| ID | Rujukan di sumber | Peran sah pada rancangan / batas pembuktian |
| --- | --- | --- |
| 1 | CODEBASE.md | Current owner map; file sebenarnya docs/CODEBASE.md dibaca |
| 2 | AGENTS.md | Local contract; session handshake ditaati, tidak diubah |
| 3 | Agent-Core-Memory-Learning-Architecture-20261022.md | Atlas internal di docs/research; baseline arsitektur, bukan live acceptance |
| 4 | Agent-Core-Polyglot-Improvement-Contract-20261022.md | Spesifikasi internal docs/research, proposal-only bukan worker terpasang |
| 5 | arXiv 2509.25250 Memory Management and Contextual Consistency | Lead memory utility/decay; rumus harus diverifikasi ke paper asli sebelum dipakai |
| 6 | arXiv 2609.16053 Retrieval-Driven Memory Reconsolidation | Lead re-konsolidasi; bukan bukti expected gain pada Agent Core |
| 7 | arXiv 2501.11739 Episodic Memory Risks | Lead risiko episodik; tidak dapat membuktikan kualitas prosedur |
| 8 | arXiv 2605.16045 RecMem | Lead recurrence/consolidation; audit assumptions/protocol sebelum transfer |
| 9 | Reddit r/AI_Agents procedural-memory discussion | Community anecdote, BUKAN verifikasi Memp/version/fail_count |
| 10 | arXiv 2610.12124 Use and Disuse | Lead intent-structured utility; date/domain/source harus diperiksa |
| 11 | arXiv 2509.18847 Structured Reflection for Reliable Tool | Lead structured reflection; benchmark eksternal saja |
| 12 | arXiv 2608.11772 Turning Agent Failures into Selective Self-Correction | Lead taksonomi DARC; crosswalk semantics belum dibuktikan |
| 13 | theharness.blog What If the Harness Could Improve Itself? | Desain meta-harness dan information barrier; bukan normative current code |
| 14 | dhruv-b.dev Auto-Research and Self-Improving Agents | Referensi metode, bukan implementasi Agent Core |
| 15 | KDnuggets Google Harness2 report | Secondary account; utamakan paper/source resmi bila kelak diterapkan |
| 16 | Medium Google Harness2 article | Secondary account; tidak untuk klaim compatibility atau sandbox |
| 17 | manthanguptaa.in Karpathy Autoresearch explainer | Technical tutorial/lead; bukan policy atau local benchmark |
| 18 | pi.dev/packages/pi-autoresearch-harness | Package example; tidak otomatis layak dipasang atau diberi izin |
**Batas inspeksi R5:** sumber bernomor 1–4 dibandingkan dengan repository/local docs; 5–18 dipetakan dari daftar sitasi di berkas riset tetapi tidak dinyatakan seluruhnya telah ditelaah paper/source primer atau direproduksi. Bila adopsi satu mekanisme bersandar langsung pada paper/blog, future owner audit wajib membuka primary source/pinned revision, license serta negative cases sebelum patch. Ketiadaan telaah primer tersebut tidak menghalangi REUSE existing, tetapi menghalangi klaim donor terbukti aman.

### 15.13 Work packages tunggal, urutan, bukti penerimaan dan otorisasi
- **R5-P0 — Source parity & research intake (read-only; pertama):** verifikasi tepat hash sumber; pemeriksaan owner/callers dan closed proposals; lengkapi table 15.2 terhadap current source per kandidat. OUTPUT review packet/disposition, bukan software baru. STOP bila source drift atau existing owner setara.
- **R5-P1 — Propose one testable external hook (proposal only):** pilih satu reproducible failure + negative control dan real consumer; gunakan packet 15.7, exact candidate delta/hashes, competing cause, cases, objective, falsifier; publish revisi melalui registry existing. No candidate if only aspirational research.
- **R5-P2 — Additive adapter (separately approved, conditional):** source gap terbukti dan public interface mapping tersedia; patch owner existing terkecil (external learning diagnostic, three-arm projection, atau Memory experiment adapter) hanya satu hook per trial. Tidak membuat Memory/Learning/Skill/evaluator/agent baru. Source changes wajib update docs/CODEBASE.md dan build guard when authorized.
- **R5-P3 — Isolated three-arm evaluation (separately authorized tests):** combine HS-P2/HG-1 into one, with user-approved controlled fixture, frozen model/lockbox/evaluator, all attempts and independent oracle; source proof + outputs + negative cases. Benefit withheld until qualified.
- **R5-P4 — Approval, compatibility and activation (separately authorized):** decision binds revision/owner/exact diff and approval. Preserve API schema and legacy clients, tests of auth/grants, Memory transactions, runtime compatibility, protected cases; build/install/restart only within explicitly authorized action.
- **R5-P5 — Later-task outcome/feedback (observed sessions only):** actual applied/adapted/rejected reuse receipt and independent later goal outcome, regressions, cost and retrievability. Promote verified reusable learnings via existing Learning sinks only; unknown/no benefit => HOLD or rollback proposal.
- **R5-P6 — Optional polyglot feasibility (separate request only):** if native code measurably cannot serve an approved consumer, propose one shot worker with protocol §15.9; otherwise NO-OP. This is not a mandatory roadmap phase.
- Supersession mapping: R5-P0 aligns R4-S0/S1 & HS-P0; R5-P1 aligns HS-P1; R5-P2 is conditional R4-S2; R5-P3 IS HS-P2/HG-1/R4-S3 (one pilot, not three); R5-P4 aligns HS-P3/R4-S4; R5-P5 aligns R4-S5; R5-P6 aligns R4-S6. Jangan membuat duplicate task, experiment, approval, atau proposal untuk nama lama.

### 15.14 Exit criteria untuk mengatakan "proposal matang" vs "software improved"
- **Dokumentasi matang** jika: [a] sumber hash dan tiap subbagian/exhibit tersambung ke 15.2/15.12; [b] tidak ada research-claim tanpa owner/disposisi atau dinyatakan UNKNOWN/DEFER; [c] inkompatibilitas utama dicatat dan diberi resolusi kondisional; [d] tidak ada operator/digest/score yang dipalsukan; [e] satu proposal ID/directory dan canonical state tetap; [f] acceptance/stop/rollback/revision-bound decision konkret; [g] pembacaan ulang hash/dokumen dan registry same-revision membuktikan publikasi, bukan runtime.
- **Software integration READY** hanya jika kemudian kasus nyata + verifier + exact intended hook + impacted graph + approval scoped + rollback/compatibility fixtures tersedia; ketidakpastian/NO-OP dapat berarti tidak ada perubahan software perlu dilakukan.
- **Implemented/DONE** hanya bila source delta diterapkan pada scope yang disetujui, targeted tests/build/Native checks dan live resident acceptance benar-benar diamati; dokumen ini tidak menjanjikan hal tersebut.
- **Pure improvement PROVEN** hanya setelah C mengalahkan A/B pada kasus heldout independen dan lulus seluruh nondegradation/safety gates, serta later-task effect tidak bertentangan. Tanpa eksperimen tersebut, hasil tetap "proposed/unknown", meski semua isi riset sudah dipetakan.

### 15.15 Bukti saat revisi 5 dibuat dan keputusan terkini
- Pemeriksaan proposal sebelum revisi: satu file improvement aktif di docs/proposals, REVISION 4 SHA-256 0e15b179efda05ea1bf67ce7125b963c23d96896eb760bcba71f368c57204551. Checkpoint pra-edit Agent Core: 2031d601-dffd-4899-bf3b-a2f53600c155. Ini recovery anchor dokumen, bukan Git worktree snapshot atau izin restore.
- Sumber riset asli SHA-256 3c28d81ae29f86b4468d57fbc8d9c899dedad0014aa4c457e463c4e92e75d071. Formula image3/image5/image7/image8/image9/image10 telah diperiksa sebagai konten gambar, tidak dinarasikan tanpa basis.
- Pemeriksaan Git status pada root E: diblokir oleh "dubious ownership" karena filesystem tidak mencatat ownership; tidak ada git config security change dan tidak ada klaim clean-worktree. Ini blocker untuk future Git-isolation saja, bukan untuk pembacaan proposal/document hash.
- Revision 5 menggantikan recommendation R4-S0/S1 dari bagian 14.7 sebagai opsi review aktif tanpa menghapus sejarah. Tidak ada root AGENTS.md, source, Native, runtime, credentials, global config, tests, build atau deployment yang diubah dalam revisi ini.
- **Keputusan promosi pengguna, 2026-10-22:** setelah membaca revisi 5, pengguna menyatakan “ok, aku sudah baca, sekarang promote proposal nya”. Interpretasi operasional terbatas sesuai scope persetujuan yang diminta R5: **APPROVE R5-P0 + R5-P1**, yakni audit source-parity serta maksimal satu kandidat proposal external-only yang didukung kegagalan dan oracle nyata. Ini bukan persetujuan implementasi, test/benchmark, perubahan source/Native, instalasi, aktivasi, release, atau deployment. R5-P2–P6 tetap conditional dan memerlukan keputusan exact-scope/revisi ketika prerequisite terbukti. R5-P0 telah memiliki audit pendahuluan di 15.2; current-source digest/call-site wajib dibaca ulang sebelum kandidat apa pun. Keputusan direkam oleh external controller dari pesan pengguna dalam sesi ini: **controller-reported, bukan host-authenticated user-message attestation**, sehingga registry feedback tidak dengan sendirinya memberi execution grant.
- Acceptance teknis terukur dan ketiadaan konflik seluruh runtime TIDAK diklaim sekarang. Targetnya adalah rancangan yang lengkap, nonduplicative, conflict-aware, dan fail-closed untuk memasuki tahap integrasi berbukti. Status administratif proposal: PROMOTED / R5-P0+P1 REVIEW SCOPE ACCEPTED; registrasi Learning dan digest dokumen harus cocok pada readback. Implementasi dan manfaat tetap NOT VERIFIED.

### 15.16 Riwayat revisi
- R1–R3: sejarah research-to-harness dan third-wave primary-source audit; tetap di atas.
- R4: research intake architecture/owner crosswalk dan preservation requirements.
- **R5, 2026-10-22:** pembacaan ulang hash-same 166 baris/10 equation images/18 references; matrix traceability 15.2, math reconciliation, real DARC+oracle trust split, advisory prospective status, proposal registry same-owner contract, conditional polyglot schema, three-arm stats criteria, explicit conflict register, archived-proposal anti-duplication, reversible approval phases dan no-downgrade gates. Tidak ada sumber kode dijalankan atau fitur diaktifkan.


## 16. REVISION 6 — Tafsir ulang riset sebagai loop self-learning yang dijalankan controller (2026-10-22)

**Status R6: PROPOSED.** R6 menggantikan *framing* R1–R5 dan paket P0–P2, bukan sejarahnya. Keputusan R5-P0/P1 (§15.15) tetap sebagai catatan historis. R6 tidak mengizinkan implementasi, test, build, restart, atau perubahan Native; keputusan baru atas revisi ini diperlukan.

### 16.1 Tafsir riset (dibaca langsung dari sumber)
- Sumber: docs/plans/Riset Improvement Harness AI Agent.md (166 baris), dibaca utuh pada sesi ini. Ini *design brief milik pengguna* untuk loop peningkatan diri pengontrol eksternal, bukan kumpulan klaim pihak ketiga yang menunggu audit.
- Loop yang dimaksud: amati kegagalan -> ajukan pertanyaan atas tindakan sendiri -> jawab dengan bukti -> satu hipotesis pada satu permukaan -> uji dengan oracle deterministik pada anggaran tetap -> tulis proposal -> manusia memutuskan APPROVE / REVISE / HOLD / REJECT.
- Dalam loop ini "host" adalah pengontrol eksternal itu sendiri: ia penanya sekaligus penjawab. Kepercayaan karena itu bertumpu pada oracle deterministik, kasus yang dibekukan, anggaran yang sama, kontrol lulus yang dilindungi, pencatatan semua percobaan, dan keputusan manusia, bukan pada atestasi identitas model oleh pihak ketiga.
- Bagian Memory, DARC, prospective intentions dan polyglot dalam riset adalah komponen yang memberi makan loop itu. Nilainya diukur dari apakah loop menghasilkan pengetahuan dan perbaikan yang terpakai ulang.

### 16.2 Yang keliru pada R1–R5 dan paket P0–P2
1. Riset diperlakukan sebagai klaim belum terverifikasi; lima revisi dipakai untuk provenance, audit dan koreksi, dan tidak ada kandidat perbaikan yang dapat dipakai yang dihasilkan.
2. `ExternalEvaluationObservation` (atestasi host atas model/config) dijadikan prasyarat evaluasi. Karena pengontrol adalah host, syarat itu melingkar dan membuat HSL-OBS-01 berhenti di HOLD. Validitas eksperimen tidak membutuhkan atestasi model; ia membutuhkan kasus beku dengan digest, verifier deterministik, anggaran sama, split holdout, kontrol lulus yang dilindungi, dan semua percobaan tercatat.
3. P2 benar bahwa rute `controller_learning(action=evaluate)` tidak dapat mencapai status comparable, tetapi kesimpulannya diperluas menjadi "riset tidak dapat dilanjutkan". Itu tidak mengikuti: jalur oracle lain sudah ada (mis. `scripts/memory/evaluation/evaluate-retrieval.mjs`).
4. Yang tetap benar dan dipertahankan: klaim kausal ditahan (`benefitVerdict=withheld`), tidak ada auto-approve atau auto-deploy, Native tetap beku, satu owner per state.

### 16.3 Pertanyaan dan jawaban mandiri atas data nyata (diukur 2026-10-22, read-only)
| Pertanyaan | Jawaban terukur | Sumber |
| --- | --- | --- |
| Apakah loop mengubah pengalaman menjadi pengetahuan? | 185 review: 129 no-new-knowledge (70%), 54 awaiting-verification (29%), 2 captured (1%). Kandidat 33: 30 proposal-only, 2 captured, 1 rejected. 24 dari 24 kandidat arsitektur tidak pernah tersimpan. Prosedur: 0 dari 457 episode. | runtime/learning/state.json (hitung read-only); learning(status) |
| Apakah antrean review sehat? | 28 pending; 24 berumur lebih dari 7 hari; 15 tanpa evidenceRefs sehingga hanya bisa berakhir tanpa isi; 17 dari 28 berasal dari workspace selain agent-core. | state.json pendingReviews |
| Berapa biaya satu siklus review? | learning(action=status) mengirim seluruh riwayat (state.json 138.895 byte) pada setiap panggilan; kontrak mewajibkan status saat reviewDue dan setiap checkpoint bermakna selalu reviewDue. | state.json; AGENTS.md; pengamatan langsung |
| Apakah state Learning membengkak? | external-controller.json 7.220.778 byte untuk 457 episode (sekitar 16 KB per episode); 7 berkas .tmp yang tampak yatim (total sekitar 20 MB, 9–21 Okt); dua snapshot .corrupt (external-controller 2 Okt; state 22 Okt). Penyebab korupsi tidak dibuktikan. | listing runtime/learning |
| Apakah lensa DARC dan kanal umpan balik abstrak ada di source? | Tidak. 'DARC', 'action-validity', 'format-precision' hanya ada di dokumen; 'behavioralProfile', 'failureCategory', 'incomplete_coverage' nol hit di src. Konsumen potensial: src/mcp/failure-loop-advisor.ts. | pencarian src (case-sensitive) |
| Apakah memori prosedural berversi sudah dipakai? | Pipeline ada (external-procedure.ts, failureTaskIds di state), tetapi tidak pernah dipakai: procedures=0. | learning(status) |
| Apakah prospective intentions punya gap terbukti? | Tidak terbukti. Evaluasi 5-status ada; bootstrap sudah menampilkan review tertunda dan episode belum selesai sebagai cue. | atlas §6; bootstrap capsule |

### 16.4 Paket perbaikan hasil tafsir (satu hook per paket, external-only, urut bukti)
- **R6-A (rekomendasi pertama) — status Learning ringkas.** Tambah tampilan ringkas opt-in untuk `learning(action=status)` (jumlah, pending beserta umur dan jumlah evidenceRefs, N keputusan terakhir); tampilan penuh tetap default sampai konsumen internal terpetakan. Langkah pertama: petakan semua konsumen (UI, Native, tes) sebelum mengubah apa pun. Metrik: ukuran respons turun minimal 90% dengan field wajib (pendingReviews, reviewDue, reviewReason) tidak berubah; tes kompatibilitas lulus. Manfaat: biaya konteks tiap siklus review turun; belum diukur.
- **R6-B — kebersihan antrean.** Tampilkan kelompok "tidak dapat ditinjau" (tanpa evidenceRefs, lebih dari 7 hari) dengan jalur satu panggilan untuk menutupnya dengan disposisi eksplisit (awaiting-verification atau rejected). Tidak ada penutupan otomatis; keputusan menutup antrean milik pengguna.
- **R6-C — aktivasi memori prosedural.** Pada checkpoint verified-recovery, sediakan perancah pertanyaan-diri (apa tindakannya, bukti independen apa, apa yang gagal lalu pulih, kondisi pakai ulang, apa yang membatalkan) sehingga controller mengajukan kandidat prosedur berstruktur. Metrik: pada 3 verified-recovery berikutnya, minimal 1 kandidat lolos admission dengan kasus negatif; procedures lebih dari 0.
- **R6-D — retensi dan kompaksi state Learning.** Arsipkan episode selesai ke ringkasan padat, pertahankan yang pending, pulihkan dengan readback; uji dulu pada salinan. Risiko tertinggi; hanya setelah R6-A. Pembersihan berkas .tmp yatim memerlukan izin terpisah.
- **R6-E — lensa DARC dan kanal umpan balik abstrak:** DEFER sampai ada data kegagalan tool berulang yang menunjukkan kebutuhan; konsumen pertama yang masuk akal: failure-loop-advisor.
- **R6-F — eksperimen A/B/C:** jalankan dengan oracle deterministik yang sudah ada (bukan `external-evaluation`), hanya saat ada hipotesis yang layak diuji.

### 16.5 Stop, rollback, batas, dan keputusan
- **Stop:** konsumen internal ternyata bergantung pada bentuk respons penuh tanpa jalur opt-in; atau field wajib berubah; atau tes kompatibilitas gagal -> NO-OP dan laporkan.
- **Rollback:** perubahan source memakai cadangan dan hash per berkas. Catatan: auto-checkpoint pada sesi ini melaporkan "quota-reached", jadi cadangan manual diperlukan sebelum edit source. Perubahan R6 pada dokumen ini bersifat aditif (header Revisi/Status dan bagian 16).
- **Batas bukti:** angka §16.3 adalah hitungan read-only pada state saat itu, bukan bukti bahwa perbaikan akan menaikkan yield. Tidak ada klaim manfaat sebelum diukur pada tugas berikutnya.
- **Catatan registry:** id proposal ini kini memiliki dua record accepted untuk R5-P0/P1 pada dua owner berbeda (sesi sebelumnya dan sesi ini). Keduanya historis setelah R6.
- **Keputusan yang diminta atas revisi 6:** APPROVE / REVISE / HOLD / REJECT. Rekomendasi: APPROVE R6-A (pemetaan konsumen dan tampilan ringkas opt-in) sebagai scope pertama; R6-B sampai R6-F bersyarat.
- **Riwayat R6 (2026-10-22):** tafsir ulang dari sumber riset asli; menambah data terukur dan koreksi framing; tidak ada perubahan source, test, build, restart, atau Native.

## 17. REVISION 7 — Karpathy autoresearch donor grounding (2026-10-23)

**Status R7: PROPOSED / source-grounded / no implementation.** R7 mempersempit desain eksperimen R6-F; tidak mengizinkan source change, test product, build, restart, release, atau perubahan Native.

### 17.1 Sumber yang benar-benar dibaca
- Checkout: `F:\Workflow\autoresearch`, branch `master`, HEAD `228791fb499afffb54b46200aca536f79142f117`, tracked working tree clean.
- `program.md` SHA-256 `dd676076ba8ab905d6cc196f69dd223754237510593c7927465d06a36bf98622`: protokol eksperimen, baseline-first, satu mutable file, keep/discard/crash ledger, branch rewind, fixed budget, simplicity criterion.
- `prepare.py` SHA-256 `f3ff54f2271df15144f0674a6234306e350004fc1ae3f9237aa176e6d3ba9944`: control plane immutable; TIME_BUDGET=300, pinned validation path, evaluator `evaluate_bpb`.
- `train.py` SHA-256 `5277fe091d302c6536bb86ed69b3eaebd7b821203ea3e5cefbad2e8949231772`: measured wall-clock budget excluding initial warmup/compile steps, fail-fast NaN/exploding loss, stable machine-readable final summary.
- `analysis.ipynb` SHA-256 `c3ea3cc87430586ea81f494688e55ffa94e94c986137f547373852f19bb51167`: keep/discard/crash counts, running-best frontier, cumulative effort per improvement.
- README states MIT; no separate LICENSE file exists in this checkout. Literal copying therefore requires provenance/license recheck at implementation time.
- Source fact: repo contains no autonomous-agent runtime. The controller loop lives in `program.md`; Python owns only the experiment workload/evaluator.

### 17.2 Satu donor package yang layak — AR-P1 Controlled Experiment Contract
1. **Immutable control plane:** freeze cases/data, oracle/evaluator revision and resource budget before candidate execution.
2. **One mutable surface:** one external-only hook/file/module per candidate. No simultaneous broad refactor.
3. **Baseline first:** every research session starts from a measured baseline under the same oracle and budget.
4. **Budget parity:** candidate and controls receive equal bounded wall-clock/action/cost budget; bootstrap/compile/setup overhead is reported separately.
5. **All-attempt ledger:** retain success, discard, crash, interrupted and evidence-unavailable attempts; never log only winners.
6. **Reversible lineage:** bind each attempt to baseline digest + candidate digest + rollback/checkpoint reference. Do not use production-branch `git reset`.
7. **Stable result envelope:** correctness/objective, duration, resource cost, verifier revision and artifact hashes must be machine-readable.
8. **Simplicity tie-breaker:** equal/near-equal verified outcomes prefer the smaller change/dependency surface; simplicity never overrides correctness or safety.

### 17.3 Owner Agent Core yang harus dipakai, bukan dibuat ulang
- `src/learning/external-evaluation.ts` + `evaluation.ts`: evidence/objective envelope dan baseline/candidate comparability.
- `controller_learning`, Activity Tracker dan existing Learning episode state: attempt/task evidence; jangan membuat `results.tsv` canonical store baru.
- Existing proposal/revision owners: human decision dan exact revision scope.
- Existing `file_checkpoint` / isolated worktree mechanisms: rollback dan candidate isolation; jangan auto-commit/reset current production branch.
- R6-F dan HG-1 tetap owner desain eksperimen; autoresearch memberi kontrak operasional yang konkret, bukan subsystem kedua.

### 17.4 Yang sengaja tidak didonor
- GPT architecture, Muon/AdamW, Flash Attention, tokenizer/data downloader, H100-specific training code: domain model-training, tidak relevan ke Agent Core harness.
- `NEVER STOP` autonomous infinite loop: ditolak. Agent Core tidak boleh mengubah source/menjalankan eksperimen tanpa scope dan evidence boundary yang tepat.
- Direct `git commit` + `git reset` sebagai acceptance gate produksi: ditolak; gunakan isolated candidate/checkpoint/proposal.
- Single-metric auto-keep: ditolak. Agent Core wajib mempertahankan correctness, protected passing cases, safety, cost dan regression evidence.
- Untracked TSV sebagai authority: ditolak; boleh menjadi export/report, bukan canonical state baru.

### 17.5 Acceptance bila AR-P1 kelak disetujui untuk implementasi
- External-controller only; Native sections outside this proposal scope tidak berubah.
- Satu synthetic/isolated candidate hook dengan frozen case digest, deterministic oracle, fixed budget dan rollback reference.
- Jalankan baseline + equal-budget simple-control + candidate agar tetap konsisten dengan HG-1; setiap attempt tercatat termasuk failure/interrupted.
- Candidate hanya menjadi proposal bila objective membaik tanpa regression pada protected cases; tidak ada auto-activation.
- Verifikasi readback menunjukkan evaluator/case/budget digest tidak berubah selama run dan candidate workspace dapat dibuang tanpa mengubah active source.
- Manfaat tetap **UNPROVEN** sampai later-task/held-out evidence menunjukkan improvement; source grounding saja bukan bukti benefit.

### 17.6 Keputusan revisi 7
Rekomendasi: **APPROVE AR-P1 design/implementation planning as the concrete contract for R6-F**, bukan langsung menjalankan eksperimen. Alternatif: REVISE / HOLD / REJECT. R6-A sampai R6-E tidak otomatis disetujui oleh keputusan AR-P1.

### 17.7 Riwayat revisi
- R7, 2026-10-23: source-first grounding `karpathy/autoresearch`; memisahkan mekanisme donor dari model-training-specific code; memilih satu controlled-experiment contract yang reuse owner Agent Core existing. No source/runtime implementation.


## 18. REVISION 8 — Re-scope R6-D: buat arsip episode existing dapat dicapai (2026-10-26)

**Status R8: PROPOSED / diukur hanya-baca / belum ada keputusan.** R8 hanya menggantikan scope **R6-D** (retensi dan kompaksi state Learning). R6-A sampai R6-C tetap seperti catatan implementasi di bagian atas dokumen; R5, R6-E, R6-F dan R7 tidak berubah dan tidak diputuskan di sini. R8 tidak mengizinkan perubahan source, tes produk, build, restart, atau pembersihan berkas sebelum ada keputusan eksplisit. **Pembaruan 2026-10-26 (Revisi 9):** R8-S0 sudah dijalankan; hasil dan scope S1 pengganti ada di bagian 18.8 dan 18.9, dan teks 18.1 sampai 18.7 di bawah dipertahankan sebagai catatan Revisi 8.

### 18.1 Masalah dan bukti (dihitung 2026-10-26, hanya baca, hanya hitungan)
- `runtime/learning/external-controller.json` berukuran 8.696.065 byte, naik dari 7.220.778 byte pada 22 Oktober; episode di state naik dari 457 menjadi 599. Setiap penyimpanan menulis ulang berkas ini beserta salinan `.last-good`.
- Arsip sudah ada. `external-controller.ts::save()` memindahkan episode yang memiliki `closedAt` dan tidak `pendingLearning` ke `runtime/learning/episodes-archive` ketika jumlah episode melebihi `MAX_EPISODES` (128); `recentEpisodes` dan `resolveMemoryTask` sudah membaca arsip itu. Baru 49 episode yang pernah diarsipkan.
- Dari 599 episode di state, **0 memiliki `closedAt`**, sehingga arsip tidak pernah menjangkau mereka. Tiga tempat yang mengisi `closedAt` (`external-controller.ts` baris 928, 961 dan 1026 pada source 2026-10-26) mensyaratkan `terminalOutcome`. Nilai itu hanya diisi oleh `controller_learning(action=episode, episodeOperation=verify)` dengan `verificationRef` yang dapat diperiksa ulang, dan hanya 3 episode memilikinya. Kontrak hanya meminta langkah itu "bila praktis".
- Pembagian isi state (ukuran = JSON ringkas per episode; jumlahnya 6.075.909 byte dari 8.696.065 byte berkas, sisanya format berkas, `sessionHeads` dan prosedur):

| Kelompok | Jumlah | Byte | Catatan |
| --- | --- | --- | --- |
| Sudah memiliki `learningDecision`, tidak pending, belum tertutup | 160 | 1.935.973 | 158 berbatas eksplisit; 66 berumur lebih dari 7 hari |
| Tanpa keputusan, tidak pending | 235 | 845.071 | 232 berbatas `inferred`; 202 memiliki paling banyak satu event; 135 berumur lebih dari 7 hari |
| `pendingLearning` | 204 | 3.294.865 | 196 bermakna; 165 berumur lebih dari 7 hari dan 118 lebih dari 14 hari |

- Pengaman yang harus dihormati: 188 `sessionHeads`, 16 di antaranya menunjuk episode yang aktif dalam 24 jam terakhir.
- Gejala yang berdekatan tetapi belum dibuktikan berkaitan: 7 berkas `.tmp-*` yatim di `runtime/learning` (20.528.749 byte; terlama 9 Oktober, terbaru 21 Oktober) dan dua snapshot `.corrupt` (1 dan 22 Oktober, UTC; penyebab tidak dibuktikan). Dampak ke latensi atau risiko korupsi **belum diukur**.

### 18.2 Hipotesis dan alternatif
- **Hipotesis:** state tumbuh karena syarat penutupan (`terminalOutcome`) praktis tidak tercapai, bukan karena arsip kurang. Bila episode yang siklus Learning-nya sudah selesai dapat ditutup tanpa verifikasi tugas, arsip existing mengambil alih tanpa mekanisme baru.
- **Alternatif yang tidak dipilih:** (a) ringkasan padat baru untuk episode (R6-D asli) menambah format dan jalur baca kedua dan tidak menyentuh penyebab; (b) menaikkan `MAX_EPISODES` hanya menunda; (c) menghapus atau mengedit berkas state di luar owner melanggar riwayat dan CAS; (d) tidak berbuat apa-apa bila dry-run menunjukkan pengurangan di bawah 10%.
- **Pembeda yang dijaga:** `closedAt` hanya berarti episode tidak menerima mutasi lagi. Ia tidak menyatakan tugas terverifikasi; `terminalOutcome` dan `verificationStatus` tetap `unavailable` bila memang tidak ada.

### 18.3 Paket (satu hook, hanya jalur controller eksternal)
- **R8-S0 — dry-run pada salinan dan desain aturan (scope pertama yang direkomendasikan).** Salin `external-controller.json` ke area scratch milik eksperimen, terapkan aturan calon pada salinan memakai logika `save()` yang sama, lalu laporkan jumlah dan byte sebelum-sesudah, episode yang tidak dapat dibaca ulang dari arsip, dan pelanggaran pengaman. Tidak menulis ke `runtime/learning` dan tidak mengubah source.
  - Aturan calon A: episode yang sudah memiliki `learningDecision`, tidak `pendingLearning`, dan bukan head sesi yang aktif dalam 24 jam dianggap tertutup.
  - Aturan calon B: episode berbatas `inferred` tanpa event selain pembuka, tidak pending, bukan head sesi aktif, dan idle lebih dari N hari (N ditetapkan dari data dry-run; titik awal 7) dianggap tertutup.
  - Tidak ada aturan yang menyentuh episode `pendingLearning`: kewajiban Learning yang belum selesai tetap terlihat dan diselesaikan lewat review.
- **R8-S1 — patch kecil dan tes (bersyarat; keputusan baru). DIGANTIKAN oleh R8-S1a/R8-S1b di 18.9 setelah hasil S0: penutupan A/B tidak diteruskan.** Satu fungsi di `external-controller.ts` yang dipanggil `save()`; tes yang gagal lebih dulu; pembacaan ulang episode terarsip lewat `recentEpisodes` dan `resolveMemoryTask`. Cadangan state dan hash sebelum penulisan live.
- **R8-S2 — pembersihan berkas `.tmp-*` yatim (izin terpisah).** Hanya setelah dipastikan tidak ada proses penulis aktif. Tidak termasuk S0 maupun S1.

### 18.4 Scope, risiko, acceptance dan rollback
- **Scope:** hanya jalur controller eksternal. Native (`agent-learning-loop.ts`) dan `runtime/learning/state.json` tidak berubah. Tidak ada tool, skema MCP, store, scheduler, atau dependency baru.
- **Risiko:** menutup episode yang masih dipakai (dimitigasi pengaman head sesi aktif dan hanya aturan A dan B); kehilangan keterbacaan histori (dimitigasi pembacaan ulang arsip pada dry-run); `closedAt` ditafsirkan sebagai verifikasi (dimitigasi dengan tidak mengisi `terminalOutcome`).
- **Acceptance S0:** laporan dry-run dapat dibaca ulang dan hitungannya cocok dengan 18.1; nol episode hilang dari gabungan state dan arsip; nol episode pending atau head aktif yang tertutup.
- **Pemalsu:** pengurangan ukuran state kurang dari 10% pada salinan; ada konsumen yang bergantung pada episode terbuka tertentu; atau arsip tidak dapat dibaca ulang. Salah satunya berarti HOLD atau NO-OP.
- **Manfaat yang diharapkan (belum diukur):** state lebih kecil dan penulisan per mutasi lebih murah. Batas atas sebelum dry-run hanya dari tabel di atas: aturan A sampai 1,9 MB dan aturan B sampai 0,85 MB. Efek pada latensi atau risiko korupsi tidak diklaim.
- **Rollback:** S0 tidak mengubah apa pun di luar area scratch. S1: pulihkan source dan state dari cadangan dan hash; arsip hanya menambah satu berkas per episode.

### 18.5 Di luar scope R8
- 204 episode `pendingLearning` (196 bermakna; 118 lebih dari 14 hari) adalah kewajiban Learning yang belum diselesaikan, bukan masalah retensi. Menutupnya memerlukan review eksplisit per item dan keputusan terpisah.
- `runtime/learning/state.json` dan antrean review (1 pending pada `learning(action=backlog)`) tidak berubah.

### 18.6 Keputusan revisi 8
Rekomendasi: **APPROVE R8-S0** (dry-run pada salinan dan desain aturan, tanpa perubahan source dan tanpa penulisan live). Alternatif: REVISE / HOLD / REJECT. R8-S1 dan R8-S2 tidak otomatis disetujui; R6-E, R6-F dan R7 menunggu keputusan masing-masing. Pembaruan Revisi 9: R8-S0 sudah dijalankan (18.8) dan keputusan lanjutan ada di 18.9; belum ada keputusan pengguna atas R8-S1.

### 18.7 Riwayat revisi
- R8, 2026-10-26: dibuat setelah pengguna meminta "promote proposal yang harus di duluin atau proposal penting". Controller mengukur ulang state (hanya baca), menemukan bahwa arsip existing tidak terjangkau karena syarat `terminalOutcome`, dan mengganti scope R6-D. Tidak ada perubahan source, runtime, tes, build, atau restart.
- R9, 2026-10-26: R8-S0 dijalankan setelah pengguna meminta controller memutuskan dan menerima rekomendasinya (jawaban atas pertanyaan keputusan berikutnya yang merekomendasikan R8-S0; dicatat controller dari pesan chat, bukan atestasi pesan-pengguna dari host). Hasil ada di 18.8 dan scope S1 pengganti di 18.9. Tidak ada perubahan source, runtime, tes produk, build, atau restart.
- R10, 2026-10-26: R8-S1a diimplementasikan dan diaktifkan (18.10). Keputusan: atas pertanyaan "Setujui R8-S1a (state ditulis tanpa indentasi)?" pengguna menjawab "you decide for me with your rekomendation choice and i accepted your advices"; rekomendasi controller adalah APPROVE R8-S1a sesuai Revisi 9 bagian 18.9 (dicatat controller dari pesan chat, bukan atestasi pesan-pengguna dari host). Restart aktivasi pertama gagal karena cacat terpisah di skrip restart; perbaikannya dicatat di 18.10 sebagai perubahan di luar scope S1a.

### 18.8 Hasil R8-S0 (2026-10-26)
Laporan lengkap: [Learning-State-Closure-R8-S0-20261026.md](../research/Learning-State-Closure-R8-S0-20261026.md); alat dan data mentah: `docs/research/learning-state-closure-r8s0/`. Masukan: salinan state SHA-256 `12E479C1988B784ABAC04A8CFB985CDEC3AEEDDBDFCFB072E47B693119A36170` (8.721.300 byte, 603 episode). `src/learning/external-controller.ts` tidak berubah (SHA-256 `98A41477F1C695B58B263CA82BB9D9B91CFD676325676176D1F34939993E8768`) dan tidak ada tulisan ke `runtime/learning`.
- **Acceptance S0 terpenuhi:** hitungan cocok dengan 18.1 dalam struktur (drift kecil yang dijelaskan di laporan; pembaca independen menghasilkan angka yang sama dengan skrip); nol episode hilang dari gabungan state dan arsip; nol episode `pendingLearning` atau head aktif yang ditutup atau dipindah; berkas arsip terbaca ulang identik pada keempat skenario primer.
- **Aturan A** (tutup episode yang sudah ber-keputusan): 152 episode, −29,83% ukuran state. **Aturan B**: 191 episode pada N=1 (−1,36%), 107 pada N=7 (−0,78%); seluruh himpunan kandidatnya hanya 201 episode dan 1,44% berkas. Tidak ada nilai N yang dibenarkan data.
- **Pemalsu 18.4 "ada konsumen yang bergantung pada episode terbuka" TERPENUHI, sehingga penutupan A/B berstatus HOLD.** `closedAt` tidak punya jalur buka-ulang: `startEpisode` dengan taskKey sama mengembalikan episode tertutup tanpa membukanya (`external-controller.ts:704-706`) dan `save()` mengarsipkannya lagi pada penyimpanan yang sama; sesudah itu checkpoint/review/receipt, `improvement`, `reconstruction_harness`, `artifact_inspect`, `episode verify` (no-op diam-diam), recall dan klaim Memory v2, serta pengingat proposal Skill ditolak atau diabaikan. Ada preseden insiden 2026-10-18 (`ext-031299db…`, ditutup keliru dan dipulihkan dengan menambal berkas arsip).
- **Alternatif terukur tanpa perubahan semantik:** menulis state tanpa indentasi memberi −29,90% byte (8.721.300 → 6.113.244) dan sekitar −26% sampai −30% biaya per mutasi pada mikrobenchmark I/O lokal. Arsip tanpa menutup, dengan pemangkasan head sesi, memberi −14,19% (66 episode, idle ≥ 7 hari) sampai −17,98% (91 episode, idle ≥ 3 hari) tetapi butuh sinyal aktivitas sesi yang belum ada.
- **Beban sebenarnya:** event menyusun 91,5% byte episode (3,09 MB di 204 episode pending yang tidak disentuh aturan apa pun); setiap penyelesaian tool terikat task menyimpan ulang seluruh berkas; `MAX_EVENTS = 160` tidak diterapkan, tetapi menerapkannya hanya menghemat sekitar 1,7%.
- **Batas bukti:** implementasi ulang `save()` (bukan pemanggilan `save()` asli), konsumen dibaca dari source dan tidak dijalankan, waktu berasal dari mikrobenchmark lokal di disk C:, dan manfaat bagi pemakai belum terbukti. Rincian dan pemeriksaan adversarial ada di laporan.

### 18.9 Keputusan revisi 9
Rekomendasi: **REVISE R8 dan APPROVE R8-S1a**; penutupan A/B **HOLD**. Alternatif: HOLD seluruhnya (satu penyimpanan tetap sekitar 0,5 detik pada pengukuran lokal), atau REJECT.
- **R8-S1a — state ditulis tanpa indentasi (disarankan; keputusan baru, bukan bagian dari R8-S0).**
  - *Pemilik dan perubahan terkecil:* `writeStateFile` (`src/persistence/state-file.ts`) mendapat parameter ketiga opsional yang bawaannya mati (bawaan tetap `JSON.stringify(value, null, 2) + '\n'`; `compact: true` memakai `JSON.stringify(value) + '\n'`). Hanya pemanggilan state di `ExternalControllerLearningService.save()` (`external-controller.ts:619`) memasangnya. Fungsi yang sama tetap dipakai (tes `batch16-exact-task-verification` memata-matai `stateFiles.writeStateFile`). Tulisan arsip, hasil recovery, `state.json` Learning dan state Native tidak berubah dan harus tetap byte-identik.
  - *Scope:* dua berkas source, tes, `docs/CODEBASE.md`, satu `.changeset` (format berkas state persisten berubah). Tanpa perubahan skema, kontrak, tool, store atau dependency baru.
  - *Tes yang gagal lebih dulu:* mutasi service menulis state tanpa indentasi dengan isi `JSON.parse` yang sama; `writeStateFile` tanpa opsi tetap berindentasi dua spasi; baca terdegradasi tetap menolak menimpa (`STATE_DEGRADED_WRITE_REFUSED`); state berindentasi lama dibaca lalu ditulis ulang ringkas dengan episode identik. Jalankan ulang sembilan berkas tes yang membaca berkas state dan suite controller eksternal, lalu build dan path policy. Suite penuh hanya dengan otorisasi eksplisit.
  - *Acceptance:* setelah satu mutasi, `external-controller.json` berupa satu baris JSON valid berukuran sekitar 70% dari semula pada state yang sama; `.last-good` terbaca; mikrobenchmark diulang pada salinan; sesudah satu restart resmi `/health` ok dan mutasi pertama menghasilkan berkas ringkas valid.
  - *Pemalsu:* sebuah pembaca yang bergantung pada indentasi muncul pada sembilan berkas tes itu, byte state Native atau Learning berubah, atau berkas hasil tidak sama dengan state sebelumnya setelah `JSON.parse` berarti HOLD.
  - *Risiko dan rollback:* rendah; keterbacaan manusia berkas berkurang. Cadangan state dan hash sebelum aktivasi; rollback mengembalikan dua perubahan source, dan penyimpanan berikutnya menulis ulang berindentasi (berkas ringkas tetap JSON valid, tanpa migrasi). Satu restart resmi untuk aktivasi di bawah otorisasi tetap `AGENTS.md`.
  - *Tidak diklaim:* perbaikan latensi yang terlihat pemakai (biaya satu penyimpanan masih di atas anggaran pengamat 250 ms sesudah perubahan).
- **R8-S1b — arsip tanpa `closedAt` (bersyarat; hanya sesudah S1a; keputusan baru).** Pindahkan episode ber-keputusan, tidak pending, idle ≥ N hari (titik awal 7 hari, preseden `PENDING_REVIEW_STALE_MS`), dan pangkas head sesi yang menunjuknya. Perkiraan −14,19% pada N=7. Prasyarat: sinyal aktivitas sesi (`sessionHeads` tanpa cap waktu), `startEpisode` yang merehidrasi harus memperbarui `updatedAt` agar tidak diarsipkan kembali pada penyimpanan yang sama, tes `startEpisode` pada arsip dengan lebih dari 128 episode, dan pengakuan bahwa reattach lewat taskScope tidak membaca arsip (`external-controller.ts:393`).
- **Penutupan aturan A/B (R8-S1 sebagaimana ditulis di 18.3): HOLD.** Aturan B: REJECT disarankan (≤ 1,44%). Variasi A dengan buka-ulang di `startEpisode` ditolak karena manfaat (A-nak idle ≥ 7 hari hanya −10,4%) dan karena sekitar 16 situs `closedAt` lain tidak tertutup olehnya.
- **R8-S2** (pembersihan berkas `.tmp-*` yatim) tetap izin terpisah. Backlog lain yang bukan bagian R8: desain retensi event, tinjauan 204 episode pending, pemangkasan head menggantung, dan penulisan `.last-good` yang lebih murah (mengubah kontrak ketahanan; keputusan sendiri).
- Keputusan harus menyebut revisi (Revisi 9 dokumen ini) dan scope, misalnya: "APPROVE R8-S1a sesuai Revisi 9 bagian 18.9". Persetujuan R8-S0 tidak berlaku untuk S1a. Pembaruan Revisi 10: keputusan atas S1a tercatat di 18.7 (R10) dan hasilnya di 18.10; R8-S1b dan R8-S2 tetap tanpa keputusan.

### 18.10 Implementasi R8-S1a (2026-10-26)
- **Perubahan source (dua berkas, sesuai 18.9):** `writeStateFile(file, value, options = {})` di `src/persistence/state-file.ts`; `options.compact` hanya membuang indentasi (`JSON.stringify(value) + '\n'`), bawaan tetap `JSON.stringify(value, null, 2) + '\n'`. Satu-satunya pemanggil yang memasangnya adalah `ExternalControllerLearningService.save()` (`src/learning/external-controller.ts:619`). Arsip episode, snapshot recovery, `runtime/learning/state.json` dan state Native tidak memasangnya.
- **Tes yang gagal lebih dulu:** `tests/state-file-compact.test.ts` (4 tes; sebelum perubahan 2 gagal, 2 lulus) menguji bawaan byte-identik berindentasi dua spasi, format ringkas dengan `.last-good` generasi sebelumnya, penolakan `STATE_DEGRADED_WRITE_REFUSED` saat ringkas, dan state berindentasi lama yang ditulis ulang ringkas dengan episode identik.
- **Tes yang dijalankan ulang:** sembilan berkas pembaca state, suite controller eksternal dan tes baru, total 19 berkas. Berurutan dengan `--testTimeout=60000`: 239 lulus, 4 gagal. Ketiga kegagalan `external-reconstruction-harness` (`'unknown'` vs `'ready'`) identik pada baseline tanpa perubahan S1a; `ENOTEMPTY` pada pembersihan direktori temp `skill-discovery-observation` juga muncul pada satu dari dua run baseline. Pada run paralel bawaan banyak tes kena timeout 15 detik; `memory-task-reconnect` sendirian juga timeout pada baseline (2 tes) dan sesudah perubahan (1 tes), jadi itu beban mesin, bukan regresi. Suite penuh tidak dijalankan.
- **Build dan path policy:** `npm run build` lulus; path policy 473 berkas, 0 pengecualian.
- **Mikrobenchmark ulang** (memanggil `writeStateFile` asli dari `dist`, bukan implementasi ulang; salinan state 606 episode, SHA-256 `b90804a0…409b57d`; median 9 run berselang-seling): 8.728.739 → 6.118.740 byte (−29,9%); satu mutasi 578 → 420 ms (−27%); isi sama setelah `JSON.parse`. Disk lokal, cache hangat; bukan latensi permintaan.
- **Aktivasi:** cadangan `runtime/build/r8-s1a-20261026/` (state dan `.last-good` sebelum aktivasi, SHA-256 state `b90804a0…409b57d`). Restart resmi pertama gagal tanpa meluncurkan proses baru (lihat catatan restart di bawah); restart resmi kedua berhasil (receipt `1172e70d…`, exit 0). `/health` ok, proses mulai 2026-10-26T07:26:06Z, `build.stale=false`.
- **Acceptance terpenuhi:** sesudah mutasi pertama di proses baru, `external-controller.json` berupa satu baris JSON valid berukuran 6.118.840 byte (70,1% dari 8.728.739), 606 episode, nol episode hilang, hanya episode aktif yang berubah; `.last-good` terbaca. `state.json` Learning tetap berindentasi. Pemalsu 18.9 tidak terpenuhi.
- **Catatan restart (di luar scope S1a, dikerjakan untuk menyelesaikan aktivasi):** `Test-ProjectProcess` di `scripts/windows/Restart-Agent-Core.ps1` menghitung setiap proses `runtime\node\node.exe` sebagai milik proyek. Bridge stdio Claude Desktop (`E:\Agent-Core-Plugin\setup\agent-core-stdio-bridge.mjs`, dua proses) memakai Node itu dan tidak keluar saat launcher ditutup, sehingga restart menunggu 120 detik lalu berhenti dengan Agent Core mati. Fungsi baru `Test-ExternalNodeScript` mengecualikan Node bawaan yang argumen pertamanya path absolut di luar checkout; flag, path relatif dan path di dalam checkout tetap dihitung. Tes `tests/restart-external-node-client.test.ts` gagal lebih dulu; enam berkas tes restart 21/21 lulus. Proses bridge tidak dihentikan.
- **Tidak diklaim:** perbaikan latensi yang terlihat pemakai; satu penyimpanan masih di atas anggaran pengamat 250 ms.
- **Rollback:** kembalikan dua perubahan source dan bangun ulang; penyimpanan berikutnya menulis ulang berindentasi. Berkas ringkas tetap JSON valid, jadi tidak perlu migrasi. Cadangan di atas tersedia bila perlu.
