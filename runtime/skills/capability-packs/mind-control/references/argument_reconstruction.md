# Argument reconstruction for contested claims

Authors: Ikbal and Claude Code (AI assistant). MIT licence, see `../LICENSE`.

Reviewed 2026-10-25. Method adapted from the [Argdown](https://argdown.org) syntax and guides
(local read-only clone, `argdown-core` 2.0.2) and, for evaluation, from PyArg (`python-argumentation`
2.0.2); nothing was executed or modified. Argdown is used here as a **plain-text notation and
discipline**. No Argdown or PyArg tool, network call or package is required, and the notation
below was not run through the Argdown parser. Form and fallacy checks are in
[fallacies_and_form.md](fallacies_and_form.md).

Use this when a decision, diagnosis or review finding rests on a contested claim, on rival
explanations, or on an inference with several steps. Skip it for settled, mechanical or
single-step questions: the cost must stay proportionate to the decision.

## Procedure

1. **Sketch first.** One sentence per central claim and per argument for or against it.
   Argdown's own guidance: sketching precedes detailed reconstruction, and full
   reconstruction of every argument is overkill.
2. **Reconstruct only what carries weight.** Write the argument as numbered premises, an
   inference line, and a conclusion. Add the implicit premise explicitly and tag it `#aux`.
   Mark intermediary versus main conclusion. Keep the number of named statements small; hide
   routine premises inside the argument.
3. **Type every objection** (table below). Each type needs a different check.
4. **Rival explanations:** list hypotheses against evidence items. Mark each cell consistent,
   inconsistent, or not diagnostic. Look for inconsistencies, not confirmations. This is
   bookkeeping to expose gaps, not proof.
5. **Name the flip condition:** the one observation or test that would change the conclusion,
   and whether it was actually run (observed) or only proposed (inferred).

## Three kinds of objection

| Argdown | Attack on | Software example | What resolves it |
| --- | --- | --- | --- |
| `-` to a statement (rebut) | The conclusion: argues it is false | "The cache is not the cause: failures persist with it disabled." | A direct observation or counter-case |
| `-` to a premise (undermine) | A premise: argues it is false | "The log you cite is from a stale build." | Verify the premise at source |
| `_` (undercut) | The inference: premise may be true, yet does not support the conclusion here | "The test passes on retry, but retry masks the race instead of ruling it out." | Show the inference rule fails or holds in this case |

Rebut and undercut are Pollock's distinction. Undermining is the third attack type in ASPIC+.
Undercutters are the easiest to miss because they leave the premises untouched. Pollock's
distinction is confirmed in the Stanford Encyclopedia entry on defeasible reasoning.

## Notation (Argdown subset)

```argdown
===
model:
    mode: strict
===
[Claim]: A statement. #tag
    + <Argument for>       // support
    - <Argument against>   // attack

<Argument for>
    <_ <Undercutter>       // undercut: attacks the inference, not a premise

<Argument for>
(1) Premise.
(2) Implicit premise made explicit. #aux
----
(3) Intermediary conclusion.
(4) Another premise.
--
{uses: [3,4]}
--
(5) Main conclusion.
```

- `[Title]: text` is a statement, `<Title>: text` an argument, `(n)` a premise or conclusion.
- `----` is an inference, `--` ... `--` an expanded inference with `{uses: [..]}` naming the lines it relies on.
- `+` support, `-` attack, `_` undercut, `><` contradiction. In **strict mode**, `+` between
  statements means entailment and `-` means contrariness. Loose mode is for first sketches.
- The relation sits on an indented line below its target; the symbol comes before the new element.
- Argdown does **not** check that your relations are logically consistent. Re-read them.

## Worked example: flaky test (illustrative)

```argdown
===
model:
    mode: strict
===
[H1]: The test fails because two async writers race on one row. #H1
[H2]: The test fails because it reads the wall clock at a second boundary. #H2
[H1]
    - [H2]

[E1]: Failures cluster at :59 seconds.
[E2]: Failures persist with DB writes serialised.

<Clock explains E1>
(1) [H2]
(2) Two clock reads near a boundary can differ. #aux
----
(3) [E1]

<Serialising removes the race>
(1) [H1]
(2) If writers are serialised, no race remains. #aux
----
(3) Failures stop under serialisation.
    >< [E2]
```

Reading it: E2 contradicts what H1 predicts, so H1 needs a reason E2 does not apply (an
undercutter on `#aux` premise 2, for example a second writer outside the serialised path). H2
survives both items but only the `#aux` premise ties it to E1. Next step: test the premise,
for example by freezing the clock, then record whether it was run.

## Evaluate the map: grounded labelling

From PyArg's grounded semantics (the least fixed point of "defended by"; PyArg 2.0.2, MIT,
read locally, not executed). Label by hand:

1. Mark every argument with no attacker IN.
2. Mark every argument attacked by an IN argument OUT.
3. Mark an argument IN when all of its attackers are OUT.
4. Repeat steps 2 and 3 until nothing changes. What is left is UNDECIDED (mutual attack or a cycle).

Chain: d attacks c, c attacks b, b attacks a. Then d is IN, c is OUT, b is IN, a is OUT. This
matches the grounded extension `{b, d}` in PyArg's own doctest.

- Count unrefuted attackers, not objections. Five attackers that are all OUT leave an argument
  standing. One unrefuted attacker removes it.
- UNDECIDED means "no position yet", not "false". Gather evidence for one side or state the
  decision as made under uncertainty.
- Grounded is the most cautious semantics. PyArg also offers preferred, stable, complete and
  others; credulous acceptance (holds in some consistent position) is weaker than sceptical
  acceptance (holds in all). Use the cautious reading for decisions.

## Which unknown matters: stability and relevance

PyArg separates known facts from facts that could still be queried (Odekerken et al., ASPIC+
under incomplete information). A conclusion's status is **stable** if no way of resolving the
unknowns can change it. A queryable fact is **relevant** if resolving it could change the status.

- List the unknowns you can check cheaply (read a file, run a test, ask). For each, ask whether
  either answer would change the conclusion.
- If none would, the status is stable: stop checking and act. If some would, check the cheapest
  decisive one first. This sharpens the flip condition in the procedure.
- A premise is **necessary** if every defence of the conclusion uses it; verify necessary premises
  before ones that can be replaced. PyArg computes sufficient, minimal-sufficient and necessary
  argument sets this way.

## Premise and step status (ASPIC+)

- Tag a premise `#axiom` when it cannot reasonably be attacked (a definition, arithmetic, a
  type-checker guarantee). Tag it ordinary when it can (a log, memory, documentation, a claim).
- Tag a step strict if deductive, defeasible if a rule of thumb ("usually", "normally").
- Undercutters defeat a defeasible step whatever the relative strength. Rebutting and undermining
  attacks succeed only if the attacker is not weaker than its target, so state the ordering you
  use. Default here: tool observation and source code over documentation over recollection.

## Misuse to avoid

- Mapping as theatre: a tidy map with shallow answers looks like scrutiny. Each node must trace to
  a source location, an observation, or be labelled inferred.
- Structure does not debias by itself. See the ACH and consider-the-opposite rows below.
- Do not score arguments or people from the map. It records reasoning; it does not measure truth.
- Do not let the map outlive its decision. Drop it once the question is settled.

## Sources and how far they support this

No source below tests this procedure on an LLM agent's coding outcomes. Adopt it as a
discipline and measure it through Agent Core Learning, not as a proven improvement.

| Source | What it supports | Strength and limits |
| --- | --- | --- |
| Argdown [syntax](https://argdown.org/syntax/) and [guide](https://argdown.org/guide/) | Statement/argument split, premise-conclusion structure, support/attack/undercut, strict vs loose mode, sketch-then-reconstruct, complexity management | Primary documentation of the notation. Describes the tool; shows no outcome evidence |
| [Stanford Encyclopedia: Defeasible reasoning](https://plato.stanford.edu/entries/reasoning-defeasible/) | Rebutting vs undercutting defeaters; a conclusion is warranted if supported by an ultimately undefeated argument | Read directly. Philosophical consensus framework, not an empirical test |
| [Prakken, ASPIC+ framework](https://webspace.science.uu.nl/~prakk101/pubs/aspicAF.pdf) | Undermining, rebutting, undercutting as three attack types; undercutters defeat regardless of preference | Seen via search summary; check the paper for exact definitions |
| [PyArg](https://github.com/DaphneOdekerken/PyArg) docs and source, citing Modgil and Prakken, *Artificial Intelligence* 195 (2013) | Grounded labelling, ASPIC+ strict/defeasible rules, axioms versus ordinary premises, sufficient/necessary explanations | Read locally; the stability/relevance modules were skimmed, not run. Tool and theory, no outcome evidence for LLM agents |
| Odekerken, Lehtonen, Borg, Wallner and Järvisalo, [ASPIC+ under incomplete information](https://jair.org/index.php/jair/article/view/18404), KR 2023, JAIR 83 (2025) | Stability and relevance of a conclusion's status under unknown information | Via search summary only. Complexity and algorithms, not a human or agent trial |
| [Bloomfield, Netkachova, Rushby on defeaters in Assurance 2.0](https://arxiv.org/abs/2405.15800) | Defeaters as recorded doubts; eliminative argumentation refutes reasons the top claim could be false (software assurance) | Abstract read. The confirmation-bias motivation is from a search summary only. No outcome data |
| Argument-mapping instruction, [Davies, Barnett and van Gelder chapter](https://ecampusontario.pressbooks.pub/criticalthinking1234/chapter/introduction/) | Reported gain of about 0.8 SD from high-intensity mapping courses (cites van Gelder, 2015) | Secondhand; page not fetched in full (403). Students and analysts, not agents. Treat as weak-to-moderate |
| Dhami, Belton and Mandel, [ACH study, Applied Cognitive Psychology 33, 2019](https://strathprints.strath.ac.uk/69049/) | Tested a hypotheses-by-evidence matrix with 50 intelligence analysts | Evidence mixed; ACH may increase inconsistency and error. Reason this guide calls the matrix bookkeeping |
| Dhami et al., Cognitive Research: Principles and Implications 9:37, 2024 (doi 10.1186/s41235-024-00560-y) | Study 1 (N = 161): layout changed confirmation bias; hypotheses in rows with evidence in columns reduced it | Search summary only; full text not read. Shows layout matters, not a general benefit |
| Lord, Lepper and Preston 1984, J. Personality and Social Psychology; registered report doi 10.1080/23743603.2023.2196755 | Origin of consider-the-opposite | Original positive; the preregistered test found no significant reduction in biased assimilation. Do not rely on the instruction alone |
| [Betz, Guided Reasoning, arXiv:2408.16331](https://arxiv.org/abs/2408.16331) | A guide agent that improves other agents' reasoning (Logikon); same research group behind Argdown work | Abstract read only. Effectiveness not verified |
| Heuer, Psychology of Intelligence Analysis (1999); Walton, argumentation schemes ([NDPR review](https://ndpr.nd.edu/reviews/argumentation-schemes/)) | Background for ACH and critical-question checklists | Not read in full. Walton's schemes are contested in the literature |
