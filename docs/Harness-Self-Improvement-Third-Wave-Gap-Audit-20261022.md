# Harness Self-Improvement — Third-Wave Source Gap Audit
Tanggal: 2026-10-22
Status: BOUNDED SOURCE AUDIT COMPLETED; NOT EXHAUSTIVE; PROPOSAL-ONLY
Tujuan: challenge kelengkapan revisi 2 Evidence-Gated-Harness-Self-Improvement-Lab.md
Scope: Agent Core external controller only; Native AI Agent Core development and operation are active under the 2026-10-24 user decision.

## 1. Scope, authority, dan apa yang tidak dibuktikan
- Local curated source: F:\Workflow\Awesome-Harness-Self-Improvement, checkout main HEAD 928f63f931bb4899b1fc3708ed697d5bc1209e59 (sebelumnya diperiksa).
- README memiliki 385 baris, **98 bullet bibliografi** dengan pola `- **Judul**`, tersebar pada sections 1–7. Angka 98 adalah hitungan bullet, **bukan 98 executable repositories atau studi yang telah diperiksa source secara menyeluruh**.
- Source basis: paper primer terbaru, source GitHub repo eksperimen yang dipilih, beberapa test case primer, source Agent Core existing di src/learning, src/skills, scripts/verify; tidak menjalankan benchmark, clone, test atau install.
- Bedakan verified-source observation, author-reported paper results, inference about missing owner, and unknown. Source observation tidak otomatis menunjukkan equivalence pada runtime atau penerimaan untuk sistem produksi.
- LICENSE katalog MIT tidak memindahkan izin copy source ke downstream; Google RRSI/Harness2 menunjukkan Apache 2.0 pada repo mereka, sementara setiap komponen harus diperiksa lisensinya sebelum reuse byte.

## 2. Koreksi material atas putaran dua
- Self-Harness primary page https://arxiv.org/abs/2606.09498: abstrak menyebut TB2 dan tiga model, tetapi **HTML teks lengkap di halaman resmi** menguraikan TB2, SWE-bench Verified, AppWorld serta 9 model-benchmark kombinasi. Pernyataan laporan r2 bahwa tambahan hanya dibuktikan mirror adalah **salah**, kini sudah dikoreksi di dokumen itu dan proposal.
- Hasil penelitian penulis tetap tidak membuktikan perbaikan Agent Core; multi-round heldout selection juga belum menghapus masalah benchmark reuse.
- Katalog 98 entries merupakan frontier riset yang cukup besar; studi dalam satu turn tidak dapat menetapkan "nothing left to learn" secara absolut.

## 3. Temuan sumber primer baru yang mengubah prioritas
### T3-01. Matched-budget null comparator, counterevidence terhadap self-evolution
Paper https://arxiv.org/abs/2607.12227 — Rethinking the Evaluation of Harness Evolution for Agents.
Code https://github.com/rethinking-harness-evolution/code:
- audit_blind_rollout_selection.py blob 7a9ef6a523cf69bf3cb73e08d706780a900b66a2: mengevaluasi blind chooser setelah selection, menahan pass/fail feedback dari selector agar tidak dipakai sebagai sinyal tersembunyi.
- scripts/eval_held_out_iters.py blob a0c5248fa80e20099d1f44089934e75577a088b0: menjalankan evaluasi split test/val pada snapshot harness per iterasi, dengan resumable markers; bukti source saja, bukan acceptance program independen.
Paper melaporkan harness evolution tidak konsisten mengalahkan parallel sampling/sequential refinement pada budget inference/feedback setara dan transfer heldout terbatas.
Implikasi: **baseline-vs-candidate dua arm tidak cukup untuk menyatakan harness improvement lebih efektif daripada menghabiskan budget pada retry/parallel selection**. Tambahkan null control dan cost/latency/attempts fairness pada evaluator pilot sebelum klaim manfaat.

### T3-02. Contrastive same-task failure diagnosis + module targeting
Paper https://arxiv.org/abs/2609.14857 — ModularRSI.
Official code https://github.com/IQuestLab/ModularRSI:
- tests/unit/test_evo_contrast.py blob dce8989e2c36cd2f9d73f2626e1eb3b5c910f5a5: same-task passing vs failing roll, per-module lenses, explicit no-passing evidence, efficient-correctness guard.
- tests/unit/test_evo_action_gate.py blob cf17cb180e897c7b1cc6d6b719c6c239dd125f73: declared ADD/MODIFY/REPLACE diverging from actual touched files/variants rejected mechanically.
- tests/unit/test_evo_clustering.py blob 97321f5aba1b956d603edc2e1e5790abec659001: matching intervention proposals, stale superseded finding reroutes to successor; out-of-scope audited rather than silently redirected.
Paper modularizes Agent Loop, Tool Use, Observation, Context, Task Completion and reports benchmark-disjoint training and cross-domain transfer.
Transfer: require evidence paired pass/fail **when available**, distinguish same-task vs different-task, localize blame as hypothesis, and validate intended action vs actual variant/source changes if future staged implementation is approved. Native modules outside this external experiment remain out of scope.

### T3-03. RRSI history, noise tolerance, cost/no-op tradeoff
Paper https://arxiv.org/abs/2609.24972 — RRSI.
Code https://github.com/google-research/rrsi:
- rrsi/selection.py blob a7d71da94b97b148a5d80d3878e5a89818bc06f9: noise-adjusted score floor, cost budget and domain guard, return None if no admissible candidate.
- rrsi/history.py blob ed93c19cf8db9c7ba81f26ef2d7ab3bd0a0b1bfd: per-edit history of hypothesis/score/cost/accepted; premeasurement failures distinct from observed measurements.
- rrsi/propose.py blob 5fee32ad88f49669131f42721e5075631fc7d122: budgeted/scoped proposed edits, source diff annotations, exploration history; also states **no abort, must ship candidate** (incompatible with Agent Core no-op/insufficient evidence principle).
Transfer: avoid re-proposing disproven hypothesis; use cost and noise bands **only when verified multiple runs support them**; preserve explicit no-op for Agent Core. No automated proposer/cost-based policy now.

### T3-04. Skill misevolution: authoring + reuse + new-session carryover
Paper https://arxiv.org/abs/2608.12851 — Practice Makes Unsafe.
Code https://github.com/henrymao2004/misevolve:
- src/misevolve/governance/safeevolve.py blob 0b934199aa88af1fa34e0a016cd5391877b7de43: audit+repair candidate and retirement on harmful reuse, but observed **individual branch can ADMIT risky candidate with audit record**, outer wrapper owns quarantine; never copy isolated policy function as authoritative safety gate.
- src/misevolve/governance/lineage.py blob b38153b48277757fda9bf9bdaa73ef31a3ef8c56: lexical verification preservation for authorization/confirmation/validation/provenance/integrity/reversibility/scope/secrets, ancestor linkage. Lexical signals can false-positive and false-negative.
- tests/governance/test_safeevolve.py blob e8d3f42a0fc8c82634991564915dd3275207dbb2: test intended admission, repair, quarantine, unsafe reuse retirement.
New risk dimension: valid and useful-looking skills can persist unsafe instructions and be reused in benign later tasks after original unsafe instruction disappears. Source has negative tests but no Agent Core test was run.
Transfer: assess **existing Skill revision lineage + retention of verification requirements across version** and cross-session reuse safety as distinct acceptance case, without creating security engine or automatically deleting Skills.

### T3-05. Open-world no-oracle method — study only
Paper https://arxiv.org/abs/2610.14224 and code https://github.com/google-research/harness2.
Harness^2 task-level Propose–Probe–Compose + harnessing-level reuse of improvement lessons; no ground-truth oracle at task time.
Official README warns unrestricted executor web/network and Codex sandbox disabled in example; unsafe to port run instructions into Agent Core without explicit isolation and provenance controls.
Potential relevance: Agent Core often does novel tasks lacking automatic oracle. Propose **human or external oracle checks** and uncertainty-preserving empirical probe as research work. No autonomous verifier-less acceptance.

## 4. Grounding terhadap source existing Agent Core
- src/learning/external-evaluation.ts: schema baseline/candidate 2 arms, matched declaration of model/evaluator/cases/time windows, host observed results, optional measuredCostUsd/time. Has no matching **task-level retry/parallel sampling null control** in this selected evaluator; `benefitVerdict='withheld'`, so no existing causal-benefit claim.
- src/learning/feature-outcome-pool.ts: aggregates by featureId, binary polarity with support count; no same-task passing/failing trajectory contrast or diagnosis module ledger in inspected function. Other components may exist elsewhere; a repository-wide absence claim is not warranted.
- src/learning/workflow-evidence.ts: evidence resolution checks source digest and verifier; same-task provenance is explicitly not causal effect proof.
- src/learning/external-improvements.ts and improvement-handoff.ts: revision-bound one-proposal user-review, not automatic adoption, supported and should be reused.
- src/skills/service.ts activateRevision/promoteRevision selected lines: source lineage, active/candidate digests, explicit confirmation, backup/restore and proposal approval; inspected branch does not explicitly compare safety requirement families between old/new Skill. Could be checked in other modules; **no claim of confirmed security bug**. Research gap: verify whether regression tests exercise cross-version safety-invariant preservation.
- scripts/verify/cumulative-workflow-eval.mjs: 64-run source describes baseline vs reuse on 2 domains/2 controllers, oracle support and isolated fixtures. That does not substitute for independent matched-compute null comparator; actual tests were **not run** during this turn.
- Runtime authority remains unchanged; no write/credential/deploy capability granted by proposal.

## 5. Prioritized gap / effort / risk matrix
| ID | Hypothesis | Current owner | Expected benefit | Risk/effort | Disposition |
| --- | --- | --- | --- | --- | --- |
| HG-1 | Matched-budget simple-search null baselines | external-evaluation + scripts/verify | Falsify fake harness advantage | medium effort/low production risk if isolated | **HIGH pilot** |
| HG-2 | Same-task contrast and module attribution | Tracker/learning + code-evidence | Better targeted proposals, fewer false causes | medium | **HIGH pilot** |
| HG-3 | Staged action-intent parity (modify/add/replace) | proposal docs/manifest and existing source diff | Prevent declared vs actual edit drift | medium and needs candidate staging | AFTER HG-2 |
| HG-4 | Cross-version Skill verification-retention and fresh-session misuse | existing Skills revision/qualification owner | Prevent safety requirement loss despite task success | potentially high safety impact; unknown current gap | **HIGH read-only contract audit; no security edits** |
| HG-5 | Noise/cost/history regularization | existing eval+Learning history | Avoid overfitting/redundant attempts | high budget and low samples | DEFER |
| HG-6 | Verifier-free open-world reflection | existing external controller/workflow | Task-level improvement on novel tasks | high false-accept risk | RESEARCH/HOLD |
| HG-7 | Full autonomous code/weight evolution | no approved owner | speculative | very high, task authority constraint | REJECT |

## 6. Minimum proof and stopping criteria
1. Pin source/benchmark/version and enumerate actual consumer and current implementation parity before drafting code.
2. At least one independently checked reproducible case where existing Agent Core path fails, and passing regression cases retained.
3. For HS-P0/HS-P1, evidence must support failure family and candidate hook; NO-OP is legitimate when cause is unknown.
4. For pilot comparisons, baseline + equal-budget simple sampling/refinement + candidate, matched model/context, oracle, permissions and complete attempts; if budget unavailable, label comparison insufficient.
5. True heldout/final lockbox preserved; user approval separate from evaluator acceptance, and prompt/Skill rollback remains possible.
6. No unauthorized changes, no side effects and no semantic promotion of inferred diagnoses.
7. **Do not claim globally no more opportunities.** A bounded stop is justified when remaining inspected sources have no unique current consumer or only replicate existing owner, marginal value is low, and all unverified high-impact gaps are documented. Current state does NOT meet full-exhaustion claim.

## 7. What remains unexamined
Not all 98 bibliographic bullets were source-audited; many projects and papers from the catalogue retain unknown implementation value. Not yet independently reproduced experiments, measured code implementation equivalence, sampled real safety failures, or performed task-level heldout comparisons. Risk and benchmark methods from papers are research evidence, not claims of defects in Agent Core. Follow-on audit should be scoped by potential benefit, known consumer, and testable counterexample rather than random mass cloning.

## 8. Actions this task took
Read-only Agent Core source and public repo files plus paper primary texts; created this report, corrected previous source-version misstatement in R2 report/proposal, advanced existing proposal to R3, and updated CODEBASE documentation. No product code, tests, build, install, clone, runtime activation, process restart, deploy, release, credential use or destructive cleanup.
