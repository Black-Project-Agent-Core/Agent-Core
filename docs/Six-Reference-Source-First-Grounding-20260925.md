# Six-Reference Source-First Grounding — 2026-09-25
> Status: COMPLETE GROUNDING — PROPOSALS WRITTEN — NO IMPLEMENTATION
> Scope: awesome-Self-Improving-Agents, GenericAgent, AutoResearchClaw, atomic-hermes, EvoAgentX, OpenViking

## Evidence boundary
Canonical Agent Core memory was viewed before all local work. Current package authority is `package.json=0.13.0`;
live Node Core still reports 0.12.0, matching the stable-package activation boundary already documented.
The audit used fixed local Git revisions, executable source, tests, file-family inventory, current Agent Core source,
and a temporary Grafel workspace. Documentation claims alone were not accepted as proof.

Reference pins:
- Awesome `99ce3979185536c1efb57b5c6935244b56f1dfec`
- GenericAgent `e86ca723a9439acef38349180b33ee31f45e3388`
- AutoResearchClaw `be4ba4755bf1b52220f25e13b2293b5956590070`
- atomic-hermes `d73323210d1f6e01325f4e112371a14fede93c78`
- EvoAgentX `d77fd6b9a3e76c8dd83bebe3374c53a3f5d16f54`
- OpenViking `184a5cecef0612a893a8db5718674b3084c6811b`

## Source census
| Reference | Non-Git files | Source files | Tests | License |
| --- | ---: | ---: | ---: | --- |
| Awesome | 49 | 0 runtime source | 0 | MIT |
| GenericAgent | 366 | 125 | 14 | MIT |
| AutoResearchClaw | 756 | 413 | 105 | MIT |
| atomic-hermes | 2,680 | 1,615 | 767 | MIT |
| EvoAgentX | 563 | 367 | 42 | MIT + noted third-party MIT components |
| OpenViking | 4,366 | 3,247 | 1,108 | AGPL-3.0 |

The temporary audit marker accounts for the observed one-file dirty state during inspection; it is not upstream content.
Family-level and targeted source inspection excluded Git metadata and audit markers.

## Current-fit proposal census
- Awesome: no new direct local runtime mechanism. Retain only as discovery catalog because 185 external GitHub leads remain unaudited.
- GenericAgent GA-P1: explicit content-addressed file checkpoint/rewind ledger.
- AutoResearchClaw ARC-P1: evidence-locked numeric provenance registry for offline Learning reports.
- atomic-hermes AH-P1: oversized tool-result spill + aggregate response budget.
- atomic-hermes AH-P2: restart-resilient detached process-session ledger.
- EvoAgentX EAX-P1: offline quality-diversity archive report over verified candidates.
- EvoAgentX EAX-P2: convergence/stability advisory over comparable repeated evaluations.
- OpenViking OV-P1: clean-room task lifecycle/finalization hardening for the AH-P2 owner.

## Explicit non-adoptions
No second model/controller runtime, autonomous optimizer, workflow scheduler, external Memory system,
research pipeline, VFS, benchmark harness, tool-generating agent, auto-approval loop, or full upstream service is proposed.
OpenViking source is not eligible for direct transplantation under this plan; only independently implemented behavioral contracts may be selected.

## Reference disposition
No reference qualifies for deletion in this pass.
Five code repositories retain concrete selectable source-derived value.
Awesome retains discovery value until its linked-repository lead set is separately source-audited or intentionally discarded.
A final zero-value census is mandatory after selected proposals are implemented/rejected.

## Plan files
- `docs/GenericAgent-Steal-Use-Integration-Plan.md`
- `docs/AutoResearchClaw-Steal-Use-Integration-Plan.md`
- `docs/Atomic-Hermes-Steal-Use-Integration-Plan.md`
- `docs/EvoAgentX-Steal-Use-Integration-Plan.md`
- `docs/OpenViking-Steal-Use-Integration-Plan.md`
- existing `docs/Awesome-Self-Improving-Agents-Steal-Use-Integration-Plan.md` updated in place.

No proposal was installed, built, activated, released, or deployed by this grounding task.
