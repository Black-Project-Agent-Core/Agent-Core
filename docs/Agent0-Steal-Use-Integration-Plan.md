# Agent0 - Steal / Use Integration Plan

> **Status:** SOURCE-FIRST GROUNDED - CONDITIONAL CONSUMER PROPOSALS ONLY - NO IMPLEMENTATION
> **Grounded:** 2026-09-29
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/Agent0`
> **Previous location:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Agent0`
> **Revision:** `f775b5101e62fe92976831adf4a21a38fcc0a767`, branch `main`.
> **Origin:** `https://github.com/aiming-lab/Agent0.git`
> **License evidence:** root Apache-2.0; relevant modules retain individual Bytedance / Agent0-VL notices. Preserve applicable per-file notices rather than invent one universal copyright owner.

## 1. Current decision

**No immediate native implementation is proposed.** The useful remaining mechanisms require a real curriculum generator, trainable-model rollout/evaluator, or sandboxed experimental runner. This does not mean Agent0 is useless: the conditional workstreams below are preserved for selection when such a consumer is chosen.

The user's permission to propose new systems is respected. A new bounded experiment subsystem is an available architecture option, but installing a GPU training stack or adding a hidden model/controller merely to manufacture a consumer is not justified by the current machine-control/report task. Neither model-weight training nor general self-improvement is a current Agent Core capability established by this audit.

Under the explicit consumer-only rule, the checkout was moved to `Consumer/Agent0`, not deleted. Move evidence and post-move hash/status verification are recorded in `runtime/tmp/a-evolve-agent0-agent-os-grounding-20260929/Agent0-consumer-move.json`.

## 2. Evidence and ownership

The audit inventories **1,286 non-Git files / 35,584,327 bytes**, including **819 Python AST-parsed files with zero parse errors**. The checkout contains distinct `Agent0/curriculum_train`, `Agent0/executor_train`, and `Agent0-VL` trees, including substantial vendored verl code. Do not confuse those families or assume all code is unique Agent0 logic. Source bodies were selectively inspected; inventory coverage is not full dynamic or security certification.

Native `src/learning/controlled-outcome.ts:18-39` already separates hard validity, opportunity counts and objective; `evaluation.ts:71-95` handles bound correctness/verifier evidence; `retrieval-series.ts:116-217` retains failed/incomplete attempts, split identity and resource evidence. Existing MCP invocation safety, owned process lifecycle, Memory and Reflexion remain separate owners. Source comparison found no trainable-model/curriculum producer in the inspected Learning path; the current CLI reads explicit report bundles rather than generating training rollouts.

Source facts below are from the pinned snapshot. They are not claims about published benchmark performance, current external package compatibility, hardware requirements, or a trained model's actual quality. No model downloads, Python imports, GPU jobs, tool servers, sandbox executions or test suites were run.

## 3. Conditional workstreams for later selection

### AG0-C1 - curriculum diversity and difficulty diagnostics

**Source:** `Agent0/curriculum_train/examples/reward_function/curriculum_reward.py:33-69,113-152`. The donor groups questions by a BLEU-derived distance and cluster share, favors intermediate success probability with `min(score, 1-score)`, and adds a capped tool-output-fence bonus. These are different signals and must not be collapsed into verified task effectiveness.

**Potential native use:** an explicitly requested dataset/curriculum workbench could report duplicates/cluster concentration and measured difficulty separately for supplied task IDs. It must bind dataset revision, scorer, sample count and split, retain failed trials, and label estimates as estimates. An initial offline descriptive adapter could precede any generator or training service, but no such task corpus or producer contract has been selected here.

**Do not copy blindly:** `_bleu_distance_matrix` mirrors a directional BLEU calculation into a symmetric matrix; singleton/empty behavior and case bounds need validation. `calculate_tool_reward` counts literal ```output fences, not successful verified tool effects. `generate_results` depends on four HTTP services/file side channels without request deadlines; module-level environment changes and `test.json` writes are not a pure comparator.

**Requirements before implementation:** choose an actual source corpus/evaluation consumer and valid success denominator; decide whether lexical clustering is appropriate; define bounded inputs and calibrated difficulty evidence. The new adapter should live under the existing offline Learning/report owner, not a second Memory store. No reward for needless tool use, automatic task publication, or training loop is part of this conditional option.

### AG0-C2 - role-separated trajectory and outcome evaluation

**Source:** `Agent0-VL/verl/workers/rollout/vllm_rollout/agent0_trajectory.py:99-137,254-321`; `vllm_agent0_rollout_spmd.py:441-570`; `workers/reward_manager/agent0.py:24-237`; `utils/reward_score/agent0_verify.py:25-143`.

The useful idea is to retain solver answer, tool outcome, verifier judgment and repair metadata as separate fields, rather than misread a verifier's confidence number as the final answer. The reward manager explicitly prefers `final_answers`; per-step evidence and final outcome are separately accumulated. This is a possible contract for a future trainable-model evaluator, not proof of independent verification.

**Donor limits:** `is_complete` means final_answer is not None; all_steps_verified only checks that verification objects exist. No-tools success rate is 1.0, missing confidence defaults to 0.5, and parsed JSON checks field presence without strict finite/range validation. Rollout repair is selected by confidence threshold; one tool success may mark a multi-tool step successful. These must not replace native execution permission, observed-effect evidence or correctness eligibility.

**Native adaptation when a consumer exists:** typed run/step/tool IDs, explicit not-observed states, final-answer provenance, independent evaluator identity and bound input digests, full accounting of failed/timeout trials, and human-reviewed repair proposals. Confidence remains a reported judgment, never a grant to execute, overwrite source, or promote Memory. No hidden second model is installed to process memories.

### AG0-C3 - isolated rollout execution and resumable evaluation

**Source:** `Agent0-VL/sandbox/subprocess_sandbox.py:50-175`, `sandbox/local_sandbox.py:31-139`, `verl/evaluation/agent0_evaluator.py:534-624`, and `verl/trainer/ppo/agent0_core_algos.py:25-114`.

Potential value includes order-preserving batched results, explicit timeout/error outcomes, step masks and per-prompt advantage groups, plus retaining failed evaluation samples. These become useful if a user-selected model-training or stochastic trial pipeline actually owns candidate execution and dataset membership.

**Critical limitations:** the subprocess backend inherits the environment, has no CPU/address-space restriction on Windows, and truncates stdout/stderr only after `communicate` has collected them. It is not a hostile-code sandbox. The HTTP adapter retries execution and can silently fall back to local execution when its dependency is absent. That fallback changes isolation and is not acceptable for untrusted candidates. Evaluation resume uses result count, not verified dataset/checkpoint identity. Do not transplant it into Agent Core's current process manager.

A future system needs an explicitly chosen Windows-compatible isolation boundary, no secret inheritance, hard resource and output caps while streaming, cancellation/owned-child cleanup, non-replay rules for uncertain execution, immutable corpus/attempt identities, and a separately reviewed persistence protocol. Additional installations may be considered only after those requirements and the actual workload are selected; no hardware assumptions are carried over.

## 4. Family census against current Agent Core

| Family / source basis | Current classification |
|---|---|
| Curriculum reward, question generation/evaluation, diversity penalty | **AG0-C1.** Needs a task-corpus and generator/evaluator consumer. No verified utility follows from a text-fence tool bonus. Question-generation/evaluation entrypoints were inventoried, not launched. |
| Agent0-VL trajectory, step verifier, final-answer extraction, self-repair rollout | **AG0-C2.** Useful role/data separation, but not independent truth or authorization. Native controller-led Reflexion already responds to actual tool failures without a model-confidence router. |
| Agent0-VL reward manager and GRPO advantage | **AG0-C2/C3.** Tensor/token-placement and per-prompt normalization need a trainer. Native Pareto/diversity/stability reports do not consume trainable tensors and are not substituted for a trainer. |
| Agent0-VL subprocess and HTTP sandbox adapters | **AG0-C3 / reject direct replacement.** The native owned process layer is not replaced with a less-contained fallback; candidate security isolation needs a separate approved boundary. |
| Agent0-VL evaluator result aggregation and resume | **Partly covered / AG0-C3.** Native report pipeline already retains invalid/failed attempts and verifies input identities. Count-based resume alone is weaker and not a native recovery improvement. |
| `Agent0/executor_train/verl_tool` rollout/agent/servers; `eval_service` | **Indexed family-level / conditional runtime.** These are model/tool-serving workload integrations, not a missing native MCP machine-control tool. No model server or secondary listener is installed from the catalogue. |
| `Agent0/curriculum_train/verl`, `executor_train/verl`, `Agent0-VL/verl` trainer/worker/model/dataset/checkpoint utilities | **Indexed vendored training infrastructure / AG0-C3.** Their tensor/model/process contracts require actual training integration. No assertion that every vendored helper is novel or audited per branch; generic utilities alone do not justify a parallel runtime. |
| Dataset/SFT preparation, prompts, model configs, multi-round shell launchers | **Support / conditional C1-C3.** Preparing data or model instructions is not runtime proof. Donor prompts and stored reasoning are not executable instructions for Agent Core or durable Memory content. |
| Benchmark metrics, fixtures, tests, assets and packaging | **Reference/support.** Source tests show intended assertions only. Published accuracy, GPU compatibility and deployment readiness were not assessed. |

No current-fit native gap is substantiated beyond responsibilities already owned by explicit report validity, observed-effect evidence, process management and controller-led failure handling. This is not a claim that Agent0 has no transferable mechanism; the concrete future consumers above are why it is retained.

## 5. Execution plan only if a conditional consumer is selected

1. Select C1/C2/C3 and name the workload, input/output artifacts, owner and allowed side effects. New system design is permitted; hidden/autonomous operation is not inferred from general adoption approval.
2. Re-ground the relevant moved source plus native report/process/evidence paths. Preserve upstream license notices and separate copied code from independent redesign. Do not install the whole donor stack by default.
3. Define strict, bounded records and error semantics before implementing. In particular: distinguish observed execution success, verifier judgment, task correctness, confidence, and authorization; never collapse unknown to zero or success.
4. For an offline C1/C2 adapter, reuse native immutable report I/O/provenance and explicit CLI output. For C3, review isolation, model/compute dependency choices, credential handling, result persistence and recovery as a separate system proposal before running candidates.
5. Proposed qualification after specific approval: singleton/empty/duplicate corpus, asymmetrical similarity, missing/nonfinite scores, independent outcome vs verifier text, step/token boundary validation, failure-denominator preservation, reordered-corpus resume refusal, timeout/cancel/output-overflow handling and no remote-to-local isolation downgrade. Pure fixtures first; real model/tool execution only after separate authorization.
6. Update the affected CODEBASE section, this plan and canonical Memory in the same implementation task; material shipped changes require a changeset. Build/live verification cannot be inferred from a successful file copy or training source import.

No test command or installation is prescribed for the present consumer-only classification. Selecting a future workstream is a new explicit implementation decision, not an unfinished mandatory task in this grounding pass.

## 6. Applied reference lifecycle

**CONSUMER ONLY - MOVED, NOT DELETED.** The old root is absent; `Consumer/Agent0` contains the same 1,286 non-Git files with identical sizes/hashes, the same HEAD, and a clean working tree. No reparse points were found in the inspected donor tree. The move did not fetch, reset, check out, rebase, update submodules or alter source bytes.

Pre-move native `src`/`scripts` and package/lockfile searches found no donor-name/path consumer, and a targeted process-command-line check found no process using the Agent0 root. These checks support the scoped move; they are not proof that every possible external application has been inventoried. A blocked move would not authorize forced process termination.

The census is pinned to this revision and the source families actually inspected. No source-backed reason was found to delete the reference as zero-value, and no unsupported current-use claim was manufactured. Conditional mechanisms remain available for a later consumer selection.

Evidence: `Agent0-inventory.json`, `lifecycle-preflight.json`, `Agent0-consumer-move.json` and closure readback under `runtime/tmp/a-evolve-agent0-agent-os-grounding-20260929/`. The plan is newly created; no earlier dedicated plan was found by exact filename/content search. This task did not implement features, run tests/builds, install dependencies, create credentials, restart services, apply a release or mutate the native Git worktree.

## 7. Approval-wave disposition - 2026-09-29

The approved current-fit selections in the associated wave were AE-P1 and AOS-P1/P2; their implementation and approved CLI/resident verification are now closed, as recorded in CODEBASE 0.1.72. This plan has no immediate implementation selection. AG0-C1/C2/C3 remain conditional on an explicitly chosen workload, evaluator/training or sandbox consumer; a blanket implementation continuation does not silently invent that consumer.

Agent0 remains intact at `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/Agent0`. No Agent0 trainer, rollout, sandbox fallback, model, dependency or service has been installed. The existing native outcome/evidence/process capabilities remain the relevant owners. No reference was moved or deleted in this implementation pass.
