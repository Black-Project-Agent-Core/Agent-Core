# Evidence links, decisions and proof standards

Authors: Ikbal and Claude Code (AI assistant). MIT licence, see `../LICENSE`.

Reviewed 2026-10-25. Adapted at the idea level from read-only references: SciArgGraph (MIT),
ArgBlazer (MIT), AF-XRAY (MIT, built on PyArg), ARCT (Apache-2.0) and GRASP (MIT), plus the
Carneades literature. Nothing was executed. OpenDebate and AMTM are AGPL-3.0 and TARGRES's data
is scraped from Kialo, so no text, code or data from them is used. Read this after
[argument_reconstruction.md](argument_reconstruction.md).

## 1. Structure of support (SciArgGraph)

- **Joint versus independent.** Joint premises work only together: "the log shows the retry
  fired" and "retries are idempotent" jointly support "no duplicate writes". Lose one and the
  support is gone. Independent supports each suffice alone. Write joint premises under one
  inference and independent supports as separate arguments. Do not credit each joint premise
  with carrying the claim on its own.
- **Shared weakness counts once.** Two findings from the same logger, the same test run, the same
  dataset or the same author do not corroborate each other: one hidden flaw removes both. Treat
  them as one line of evidence and write the common flaw as an undercutter on all of them.
  Treating correlated evidence as independent overstates confidence; the SciArgGraph spec says so
  of its own noisy-OR default.
- **Reported is not true.** Separate "what was reported or observed, and by what source" from
  "what it means". Source reliability and inferential strength are two different doubts.
- **Mark how a premise got in:** *stated* in the source, *implicit* (signalled by context), or
  *inferred* (you supplied it). Verify inferred premises first.
- **Apparent cycles.** "A supports B and B supports A" usually mixes evidential support (data to
  theory) with explanation (theory to data), or mixes consistency with support. Keep the
  evidential direction, observation to claim. If two things reinforce each other, look for a
  common cause. Consistent with is not supported by.
- **Absence.** "No evidence for X" (nothing found; weak, and depends on how hard you looked)
  differs from "evidence against X" (a well-powered check came back negative). Do not merge them.

## 2. Warrant test (ARCT)

A *warrant* is the usually unstated rule that explains why a premise gives a claim. The ARCT task
offers two plausible, lexically close warrants that lead to opposite claims.

1. Write the warrant in full.
2. Write the rival warrant that would lead to the opposite claim. For "the build is slow, so the
   cache is cold": the rival is "the cache is warm but oversized".
3. Ask which one the evidence actually supports. If it does not discriminate, the argument is
   not established.

Why not accept the warrant that sounds right: Niven and Kao report that BERT's best ARCT run
(about 77%) was explained by spurious statistical cues, and that a cue-free adversarial version
left all models at chance. A fluent, plausible warrant shows fit with the wording, not that it
holds. This is a result about 2019 models; treat the rival-warrant step as a cheap guard.

## 3. Ask a decision question (ArgBlazer)

- **Quantifier.** "Can we?" holds if the option is defensible in at least one consistent
  position. "Must we?" holds only if it is in all of them. "Is it excluded?" holds if it is in
  none. Two mutually exclusive options attack each other: each is defensible, so "can" is yes
  and "must" is no. Then choose on cost and reversibility; do not pretend the evidence decided.
- **Scenarios.** When the answer depends on circumstances (production or dev, with or without a
  feature), tag arguments with their scenario, evaluate each scenario separately, and say which
  one the decision is about.
- **Order of arrival.** Add arguments one at a time and note when the status changes. The argument
  that flips it is the one the decision depends on.

## 4. When it stays undecided: critical attacks (AF-XRAY)

Undecided arguments come from mutual attacks and cycles. AF-XRAY finds *critical attack sets*:
attacks whose suspension leaves no argument undecided, searched for the fewest. By hand:

1. List the disputed attacks inside the undecided region.
2. For each, ask: if this one attack fails, is the target decided?
3. Investigate the attack that decides the most for the least effort.

This turns "undecided" into a short list of specific questions.

## 5. Judge locally, then aggregate (GRASP)

The GRASP abstract (preprint, May 2026) reports that holistic LLM-as-judge rankings disagree
substantially across models, that local judgments of attack and support are more reproducible, and
that its aggregated score does not correlate with human convincingness (it measures structural
sufficiency only). Practice: before any overall verdict, judge each link on its own. Does this
premise bear on that claim? Does that reply answer this objection? Record each judgment and derive
the verdict from the labelled structure. Reproducible is not the same as correct, and no figures
were seen.

## 6. Proof standard by stakes (Carneades)

Carneades (Gordon, Prakken and Walton, 2007) sets a proof standard per issue and separates the
burden of production from the burden of persuasion. The tiers below are this skill's own
adaptation, not Carneades's named standards.

- **Explore:** a plausible argument with no unanswered undercutter justifies investigating.
- **Act, reversible:** the case for acting outweighs the best case against, and you state what
  you will watch to catch an error.
- **Act, irreversible or security-relevant:** no unanswered rebuttal or undercutter remains.
  Undecided items block the action or need explicit sign-off.

Name the standard before weighing. Moving it afterwards to fit a preferred answer is bias.

## 7. Why this skill stays ordinal

Quantitative argumentation computes a number from input numbers: gradual bipolar frameworks
(QBAF-Learning: base scores and edge weights), tree scoring (TARGRES on Kialo debates, OpenDebate),
SciArgGraph's noisy-OR strengths and base rates, GRASP's propagation. When the base scores and
weights are guessed, the output has precision without accuracy. Use ordinal labels (strong,
moderate, weak, unknown) with a stated reason. Use numbers only when the inputs are measured
(rates, counts, benchmark results).

## 8. Reviewed and not adopted

- Carneades-4 editor repository: README and licence only (MPL-2.0); the concept came from the paper.
- abs_arg_dung: Dung semantics through Java Tweety; duplicates PyArg.
- AMTM (AGPL-3.0): transformer mining of argument components and relations; no new procedure.
- QBAF-Learning: genetic structure learning for classifiers; no reasoning procedure.
- GridDrive: reinforcement-learning environment of road regulations.
- Logical.ly: course project proposal, no licence.
- logic-puzzle-solver: frontend only; the solver is not included.
- Simon Tatham's puzzles: a game collection in C.
- ArgBlazer's extension and MCP server, AF-XRAY's web app: tooling, not used.

## Sources and how far they support this

| Source | What it supports | Strength and limits |
| --- | --- | --- |
| SciArgGraph, `docs/ontology_spec.md` | Joint versus independent support, shared undercutters, datum versus claim, stated/implicit/inferred, cycles, absence | Read locally. A design specification; no empirical validation was seen |
| ArgBlazer README | Could/must/none questions over semantics, scenarios, step-by-step construction | Read locally. Tool documentation, no outcome evidence |
| AF-XRAY, [arXiv:2507.10831](https://arxiv.org/abs/2507.10831); repository encodings | Critical attack sets that resolve undecided arguments | Abstract and Datalog encodings read. A legal-AI case study, not a trial |
| Habernal et al., NAACL 2018 (ARCT); Niven and Kao, [ACL 2019](https://arxiv.org/abs/1907.07355) | Implicit warrants; success explained by spurious cues | ARCT README read; Niven and Kao from a search summary. 2019 models |
| GRASP, [arXiv:2605.19141](https://arxiv.org/abs/2605.19141) | Local judgments more reproducible than holistic LLM ranking | Abstract only, a preprint, no numbers; does not track convincingness |
| Gordon, Prakken and Walton, *Artificial Intelligence* 171(10-15), 2007 | Proof standard per issue; burdens of production and persuasion | Search summaries only; the tiers above are not from the paper |
| QBAF-Learning, TARGRES, OpenDebate READMEs | Existence of numeric argument scoring | Read locally. The TARGRES paper PDF could not be rendered here; no results were read |
