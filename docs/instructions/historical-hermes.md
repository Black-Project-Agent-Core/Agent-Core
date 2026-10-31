# RETIRED Hermes history

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Historical Hermes A2A partner protocol — RETIRED, NOT CURRENT INSTRUCTIONS

The following subsection is retained only as historical context for the bridge retired on 2026-09-27. It does not describe the current tool surface, authorize a partner delegation, or require any controller to follow its old workflow. Current source registration has no `partner` tool. Do not reinstall or start Hermes to satisfy this historical text; future native AI runtime remains a later, separate phase.

Historical description: Agent Core formerly exposed a controller-led Hermes partner bridge through the single `partner` MCP tool. The old protocol below is superseded by the retirement and current product-direction boundaries.

- The connected AI/controller remains the **lead, integrator, final decision-maker, and sole user-facing authority**. Hermes is a subordinate partner/advisor/executor for an explicitly assigned workstream.
- For substantive decomposable tasks, default toward an approximately **50/50 responsibility split**: the lead owns one coherent workstream and Hermes owns another. This is an ownership balance, not exact token/tool-call/time accounting.
- For atomic/non-decomposable work, do not invent a fake split. Keep execution with the lead and use Hermes for an independent review, alternative analysis, or risk check when that adds value.
- Before Hermes is allowed to execute a partner workstream, follow the bridge sequence: `align -> discuss (when needed) -> approve_alignment -> delegate`. `delegate` is rejected until the lead explicitly approves alignment.
- Alignment is discussion-only. Send Hermes the overall goal, lead-owned half, Hermes-owned half, constraints, workspace/path scope, and expected evidence. Ask Hermes to restate understanding, dependencies, ambiguities, risks, and its proposed approach.
- Alignment discussion is bounded (default maximum three rounds). If material ambiguity remains after bounded discussion, do not let Hermes improvise authority; resolve it yourself or ask the user when genuinely necessary.
- Once aligned, dispatch Hermes asynchronously and **continue the lead-owned workstream instead of waiting idly**. Use `collect` later, and `steer` when evidence shows the partner is drifting.
- Hermes may propose improvements or disagree with evidence, but it does not redefine the user's task, broaden scope, authorize tests, authorize destructive actions, release, deploy, publish, or decide overall completion.
- Partner approval requests are resolved by the lead through explicit `partner(action=approve)`; the bridge intentionally exposes only one-shot approve or deny, not permanent authority escalation.
- Treat Hermes results as **self-reports until independently verified**. Verify material file changes, command results, IDs, external side effects, and integration claims through normal Agent Core tools before relying on them.
- Do not send secrets, credentials, hidden/private reasoning, or raw chain-of-thought through the partner bridge. Share only the task facts, constraints, selected context, paths, and evidence Hermes needs.
- Partner failure/degradation is fail-soft. Continue with normal Agent Core tools; Hermes availability must never gate Memory, Grafel, Game Mode, machine control, OAuth, or the user-facing result.
- The partner bridge owns only its isolated loopback Hermes API child process. It must not start/stop external RDC, alter OAuth state, or take ownership of the user's interactive Hermes TUI.
- The user may explicitly opt out of Hermes collaboration for any task; obey that without substituting another agent.

