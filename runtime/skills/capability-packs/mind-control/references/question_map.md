# Fifteen questions, frame check and report claims

Authors: Ikbal and Claude Code (AI assistant). MIT licence, see `../LICENSE`.

Reviewed 2026-10-25. The fifteen questions, the five daily questions and the quality criteria are
the user's own framework (a research request written 2026-10-24 and kept in the user's protected
research folder). This file maps them onto the skill's steps and records which claims in three
research reports about GitHub tools could and could not be checked. Nothing here is a new
external source.

## 1. The fifteen questions and where this skill answers them

Not every question applies every time. Depth is proportional to the stakes of the decision.

| # | Question | Tests | Handled in | Software check |
| --- | --- | --- | --- | --- |
| 1 | WHAT: what am I actually trying to solve? | Problem clarity | Procedure step 1; Appraisal step 1 | State the claim in one sentence. If two readers would take it differently, split it |
| 2 | WHY: why do I think it is true or important? | Basis and purpose | Steps 1-2; frame check below | A reason of "we always did it" is an unsupported premise |
| 3 | HOW DO I KNOW: how do I know this is true? | Basis of knowledge | Adaptation bullet: observed versus inferred | Which part did I run or read at source, and which did I infer? |
| 4 | EVIDENCE: what supports it and what opposes it? | Strength of evidence | Steps 2 and 5; evidence_links section 1 | List both sides; count evidence with a shared source once |
| 5 | ASSUMPTION: what am I taking as true without proof? | Hidden assumptions | Step 2 (`#aux`); step 4 (rival warrant) | Write the missing premise and test it against its rival |
| 6 | SOURCE: how credible and independent is the source? | Reliability | evidence_links section 1; evidence_hierarchy | Primary or second-hand? Current? Independent of the other sources? |
| 7 | ALTERNATIVE: is there another plausible explanation? | Alternatives | Step 5 (rival table) | Name at least one rival before choosing |
| 8 | COUNTERARGUMENT: what is the strongest case against me? | Testing belief | Step 3 (typed objections) | State the strongest objection in its best form first, then answer it |
| 9 | BIAS: are emotion, preference or experience steering me? | Cognitive bias | common_biases; section 2 below | Prefer procedural checks (rival table, flip condition) to the instruction alone |
| 10 | LOGIC: does the conclusion follow from the premises? | Consistency | Step 4; fallacies_and_form sections 1-2 | Form and truth are checked separately |
| 11 | CAUSALITY: cause, or only correlation? | Cause and effect | fallacies_and_form section 5 | Difference method: change one thing, hold the rest fixed |
| 12 | FALSIFICATION: what evidence would show I am wrong? | Openness to correction | Step 7 (flip condition) | Name the observation, and say whether it was run |
| 13 | UNCERTAINTY: how sure am I, and what is unknown? | Calibration | Ordinal labels; stability in argument_reconstruction | Label each claim known, inferred or unknown, with a reason |
| 14 | CONSEQUENCES: what happens if I am wrong? | Risk | evidence_links section 6 (proof standard) | Cost if wrong and whether it can be undone |
| 15 | REVISION: will I change my conclusion on new evidence? | Updating | Step 7; stability | On new evidence, say what changed, what stays and why |

**Five daily questions, in order** (the practical version): what do I actually know; what
supports and opposes it; what else could explain it; how can I test whether I am right; what
would change my mind.

**Quality criteria.** A line of thought is critical when its conclusion is clear and backed by
relevant reasons; facts are kept apart from assumptions and speculation; contrary evidence is
weighed fairly; alternatives are compared by the same standard; uncertainty is stated; and the
conclusion can be tested and revised.

## 2. The self-audit question

"Am I looking for the truth, or only for reasons to justify what I already believe?" The measure
of critical thinking is how well one finds and fixes errors in one's own reasoning, not how often
one finds errors in others'. Apply every check to your own conclusion first.

The instruction alone is weak. A preregistered test found that "consider the opposite" and
psychoeducation did not significantly reduce biased assimilation (see
argument_reconstruction.md). So back the question with something observable: a recorded rival,
a stated flip condition, a disconfirming case you went and looked for.

## 3. Frame check: "it works" is not "it is complete"

The user's example: "The system works, so it is perfect." Ordinary thinking stops at working.
Critical thinking asks:

1. Were all functions tested, and which conditions were never checked?
2. Does the test represent real use?
3. What evidence would show the system is not yet stable?
4. What risk is still hidden?
5. **Frame:** are the problem, the goal and the approach themselves right? Could a simpler,
   more reliable, easier-to-repair design reach the same goal?

Question 5 stops a conclusion from merely defending the existing solution. Use it before polishing
an approach, not after.

## 4. Claims in the three reports, checked

Two short deep-research summaries and one long Gemini export list GitHub tools. Every repository
they name had already been surveyed in the earlier source studies (README and key documents, not
every file), so nothing in them adds a method. This table records what could be checked on
2026-10-25 against those local read-only clones (later moved to the Recycle Bin) and the
acquisition record, so the unsupported claims are not adopted later.

| Claim in a report | Check | Result |
| --- | --- | --- |
| Logika is a "PHP / Python logic engine" | Clone contents | Wrong. A Markdown skill (instructions and references); no engine code |
| Carneades repository evaluates standards of proof (Java) | Clone contents | Unsupported. Two tracked files, README and LICENSE (MPL-2.0). The concept comes from the paper, not this repository |
| OpenDebate is "open source" | LICENSE | Understated. AGPL-3.0, which constrains reuse |
| `Jeevan-04/epistemic-reasoning-core` generates formal proofs | Acquisition record | The 2026-10-25 acquisition recorded clone exit 128 ("Repository not found") and HTTP 404 from the archive and API endpoints. The claim cannot be verified and was not adopted |
| logic-puzzle-solver does constraint-based elimination and proves alternatives inconsistent | README and files | Unsupported. The repository is the frontend only; the solver backend is not included |
| Argdown is MIT, funded by DebateLab (KIT), has a VS Code extension and exports maps | README | Consistent with the README. Star counts were not checked |
| ARCT has about 2k annotated arguments with warrants (Apache-2.0) | README | Consistent |
| AMTM does component detection and relation classification | README | Consistent; AGPL-3.0 |
| QBAF-Learning measures degrees of belief (UNCERTAINTY); GridDrive covers CONSEQUENCES; LogicClimate tests FALSIFICATION; TARGRES is bias-reducing; abs_arg_dung covers REVISION | Each README | These mappings are the report's, not the repositories' stated purposes. QBAF-Learning learns argument-graph classifiers, GridDrive is a reinforcement-learning driving environment, LogicClimate is a fallacy-detection test set, abs_arg_dung computes Dung semantics, and the TARGRES README describes thesis robustness from a pro/con tree (its paper PDF could not be rendered, so any bias-reduction claim is unchecked). The mapping is not used; section 1 maps the questions to this skill's own steps |
| Combining LLMs with argumentation frameworks (GRASP, "argeval") reduces hallucination | GRASP abstract | Unsupported. The abstract reports more reproducible rankings, nothing about hallucination; "argeval" was not examined |
| Solving logic puzzles (Simon Tatham's collection) trains deduction | No source given | Unsupported. No evidence of transfer to general reasoning was offered |

Verdict for adoption: the user's fifteen questions, the five daily questions, the criteria, the
self-audit and the frame check are adopted. The repository catalogue and its tool-to-question
mapping are not.
