# Form, fallacy and inference checks

Authors: Ikbal and Claude Code (AI assistant). MIT licence, see `../LICENSE`.

Reviewed 2026-10-25. Adapted from three read-only references: Logika (EvilFreelancer/logika,
commit 8bf28c4, MIT; a distillation of G. Chelpanov's public-domain textbook of logic), the
taxonomy and method of Jin et al., "Logical Fallacy Detection" (EMNLP Findings 2022), and PyArg
(see [argument_reconstruction.md](argument_reconstruction.md)). Nothing was executed. No text or
data was copied from the fallacy dataset: its repository has no licence file, so only the ideas
and class names are used.

Use after reconstruction, on the arguments that carry the decision. A fallacy name points at
what to verify. It is not a verdict.

## 1. Check form and truth separately

- **Formal validity:** the conclusion follows if the premises are true.
- **Material truth:** the premises are true.
- Report which one fails. Valid form with a false premise: fix the premise. Invalid form with a
  true conclusion: the conclusion is unsupported, not refuted. A fallacy in the argument does
  not make the claim false.
- **Reason to believe is not cause.** A log line is a reason to believe the cache was stale. It
  is not what made it stale. Do not present evidence of X as the mechanism of X.
- **Restore the hidden premise** in its strongest fair form before attacking an argument. The
  missing premise is usually the weakest link and the first thing to verify.
- **Repairing an argument you did not write** (Logika's fix mode): change the minimum, keep the
  author's style, and add no new facts. If the conclusion cannot be saved, weaken it to what the
  evidence supports ("all" to "some", "proved" to "there is reason to think", "X caused Y" to
  "Y followed X") or mark it `[needs basis]`. State a contested hidden premise or drop the
  conclusion that depends on it, then list what changed and which flaw each change removed.

## 2. Quick form checks

| Form | Verdict | Software example |
| --- | --- | --- |
| If A then B; A; so B | valid (modus ponens) | "If the flag is on, the path is skipped. Flag is on." |
| If A then B; not B; so not A | valid (modus tollens) | "If the migration ran, the column exists. No column." Premise 1 may still be false |
| If A then B; B; so A | **invalid** (affirming the consequent) | "If the cache is stale the test fails. It fails, so the cache is stale." |
| If A then B; not A; so not B | **invalid** (denying the antecedent) | "The fix is not deployed, so the bug is not present." |
| A or B or C; not A; not B; so C | valid only if the alternatives are exhaustive and exclusive | "Race or timeout" misses an ordering bug |
| If A then X; if B then X; A or B; so X | valid only if "A or B" is exhaustive | "Either retry or fail; both are bad" |

**Quantified claims** ("all", "no", "some") in a two-premise chain:

- Exactly three terms. A term that changes meaning breaks the chain (equivocation: "failure"
  as failed test versus failed process).
- The middle term must be universal ("all" or "no") in at least one premise.
- A term universal in the conclusion must be universal in its premise.
- Two negative premises prove nothing. Two "some" premises prove nothing.
- A negative premise gives a negative conclusion. A "some" premise gives a "some" conclusion.
- Which terms count as universal: "All S are P" only S; "No S is P" both; "Some S are P"
  neither; "Some S are not P" only P.
- **Existential import:** this tradition assumes the classes are non-empty. "All callers
  validate input" is true with zero callers. Do not infer "some caller validates" until the
  class is shown to be non-empty.

**Opposites:** "always fails" and "never fails" are contraries, so both can be false. "Always
fails" and "sometimes passes" are contradictories, so exactly one is true. To refute a universal
claim, one counterexample is enough: aim for the contradictory, not the contrary.

**Four audit questions** (the laws of thought):

1. Identity: does each key term keep one meaning from premise to conclusion?
2. Non-contradiction: do two accepted claims conflict, at the same time and in the same respect?
   If accepting a claim forces a contradiction, reject the claim (reductio).
3. Excluded middle: are the two options true complements, or only opposites?
4. Sufficient reason: does each step have a stated basis?

## 3. Fallacy pointers, by what they attack

| Pattern | What to check | Repair |
| --- | --- | --- |
| **Thesis** | | |
| Substituted thesis | The evidence proves a nearby claim ("downloaded 10M times" for "secure") | Restate the claim, match evidence to that claim |
| Proves too much | Apply the same reasoning to a case you reject ("anyone can edit it, so distrust it") | Narrow the premise |
| Attack on the person, doubted credibility | The source, not the claim, is being judged | Evaluate the claim; source reliability only shifts the prior |
| Strawman | An exaggerated version is being refuted | Restate the opponent's claim in their terms first |
| **Grounds** | | |
| Begging the question, circular proof | A premise needs the conclusion ("the log is reliable because the logger says so") | Find an independent check |
| Qualified claim taken as unqualified | "p99 improved" without load or hardware conditions | State the conditions |
| Whole versus parts | "Every service is fast, so the system is fast"; the reverse too | Measure at the level claimed |
| Equivocation | A key term shifts meaning | Pin definitions before arguing |
| **Induction** | | |
| Hasty generalisation | Small or unrepresentative sample | State n and how cases were picked; weaken "all" to "some" |
| After this, therefore because of this | Order in time offered as cause | Difference method (section 5) |
| One-sided enumeration | Only confirming cases are remembered | Look for cases that should fail and do not |
| False analogy | Surface likeness | Count relevant similarities, known differences, how much is unknown |
| **Pressure** | | |
| False dilemma | A third option exists | List the alternatives before choosing |
| Popularity, appeal to emotion | Support is not evidence | Ask what evidence remains without it |

The Jin et al. classes (faulty generalization, false causality, circular reasoning, ad populum,
ad hominem, fallacy of logic, appeal to emotion, false dilemma, equivocation, fallacy of
extension, fallacy of relevance, fallacy of credibility, intentional) map onto the rows above and
section 2. "Intentional" is not assessed here: intent is not needed to evaluate an argument.

## 4. Strip the content to see the form

Replace the topic words with placeholders and read the pattern: "<X> happened, then <Y>
happened, so <X> caused <Y>". If the stripped form looks weak, the argument was leaning on topic
familiarity. Jin et al. report that pretrained language models did poorly at fallacy detection
and that a simple structure-aware classifier beat the best of them by 5.46% F1 on their Logic set
and 4.51% on LogicClimate. That used 2022 models and a fine-tuned classifier on sentence-level
data. It does not show that this step improves current prompting. Treat it as a cheap check.

## 5. Causal and inductive checks for debugging

- **Agreement:** every failing case shares one circumstance. A candidate cause, weak alone.
- **Difference:** two cases identical except one circumstance, and only one fails. That
  circumstance is the cause or part of it (`git bisect`, a feature flag). It needs everything
  else to be truly equal.
- **Joint agreement and difference:** both together; stronger than either.
- **Residues:** subtract effects already explained; the remainder points to the other causes.
- **Concomitant variation:** change one factor and the effect varies with it (load tests, A/B
  tests). Works when you cannot remove the factor.
- **Analogy** is stronger with more relevant similarities, weaker with more known differences, and
  weaker when you know little about what is compared. Use it to choose where to look.
- **Hypothesis:** derive a consequence and check it. A crucial test is an observation that fits
  one rival and contradicts another. "Most S are P" cannot be applied to one case unchecked.

## 6. Definitions and divisions (specs, enums, state machines)

A definition is neither too broad nor too narrow, is not circular, says what the thing is
rather than what it is not, and avoids metaphor. A division uses one basis per level, with
parts that exclude each other, together cover the whole, and skip no level. Apply both to error
categories, severity levels and state enums.

## Sources and how far they support this

| Source | What it supports | Strength and limits |
| --- | --- | --- |
| [Logika](https://github.com/EvilFreelancer/logika) (MIT), after Chelpanov | Form versus truth, syllogism and conditional rules, laws of thought, fallacy catalogue, Mill's methods, concept rules | Read locally. Traditional Aristotelian logic with existential import. Skill text is Russian; software examples here are added |
| [Jin et al., Logical Fallacy Detection](https://aclanthology.org/2022.findings-emnlp.532/) | 13-class fallacy taxonomy; structure-aware classification beat pretrained LMs in 2022 | Abstract and repository read. Not a test of current LLM prompting. Repository has no licence, so nothing was copied |
| Mill's methods | Standard inductive causal checks | Textbook method. Difference method needs controlled comparison |
| Lord, Lepper and Preston, and Dhami et al. | Structure and instructions do not reliably debias | See argument_reconstruction.md |
