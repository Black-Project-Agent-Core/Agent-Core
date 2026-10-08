# Awesome Lifelong LLM Agent - Reference / Conditional Adoption Plan

> **Status:** SOURCE-FIRST GROUNDED - CONSUMER ONLY - MOVED INTACT - NO IMPLEMENTATION
> **Grounded:** 2026-09-29
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/awesome-lifelong-llm-agent`.
> **Previous location:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/awesome-lifelong-llm-agent`
> **Revision:** `b52ee231579804eace965141180a6d4c7a80108a`, main, clean at inspection.
> **Origin:** `https://github.com/qianlima-lab/awesome-lifelong-llm-agent.git`
> **License evidence:** no LICENSE/NOTICE file in this 14-file snapshot. Do not assume the linked papers, notes or artwork share an implied code licence.

## 1. Decision

There is no immediate native runtime adoption justified by the executable source. This is a research catalogue plus a Markdown table generator, not a memory engine, lifelong-training framework or agent execution runtime. Its remaining useful role is future research discovery or a specifically requested literature workbench. Under the user's consumer-only rule, retain it in `Consumer`, not delete it as useless.

This distinction is source-based: `src/main.py` is the only Python implementation; `pyproject.toml` only configures formatting. The many papers named in Markdown/JSON are not implementations present in the checkout. No linked repository or paper has been fetched, read or functionally verified by this audit merely because its title appears here.

## 2. Grounding evidence

Inventory covers all 14 non-Git files / 13,174,018 bytes, including one Python file with 12 AST declarations and no parse error. Four PNG illustrations account for much of the footprint; their visual content was not used as executable evidence. The implementation, catalogue structure and selected research-note framing were inspected; no generator, benchmark, model or external request was run.

`assets/paper.json` uses **Perception Module**, **Memory Module**, and **Action Module**, subdivided into 13 category paths. Static traversal found 64 full paper entries, 12 label-only aliases, 64 distinct link strings, no duplicate definition labels and no unresolved alias labels in this snapshot. Date strings range from 2017-04 to 2026-08; these are catalogue metadata, not independently confirmed publication dates or completeness claims.

`src/main.py` defines `PaperInformation`, recursively collects descriptions and label aliases, sorts entries and generates Markdown. `PaperInformation.__hash__` returns the label directly rather than an integer; equality also relies on labels, so absent labels are not a robust identity. The selected input happens to have resolvable labels; that does not prove malformed-input safety. The generator mutates lists when sorting, uses raw Markdown values, reads `../assets/paper.json` and writes `../outputs/table.md` relative to process working directory. It is not a drop-in safe native library.

`docs/action.md` discusses Grounding/Retrieval/Reasoning/Planning actions and intra-/inter-episodic use; `docs/subarea.md` lists related research subdivisions. Preserve these as the authors' organizing frame, not a native capability map. Reported descriptions of papers remain secondary-source notes; this audit does not adopt those claims as measured Agent Core improvements, verified algorithms or permission to execute retrieved instructions.

## 3. Conditional options, not pending mandatory implementation

**LLA-C1 - explicit literature catalogue workbench.** A future user request to search/curate this collection can consume normalized entries, aliases and hierarchical categories. Define stable IDs from declared identifiers/links, strict duplicates/missing-label handling, safe Markdown serialization, bounded input and exclusive output. Preserve source revision/entry location and distinguish supplied metadata from independently verified sources. Do not auto-download every link, import raw notes into canonical Memory, or add a second semantic Memory database merely to give this catalogue a consumer.

**LLA-C2 - research coverage annotation for a selected evaluation programme.** The Perception/Memory/Action taxonomy could annotate an explicitly chosen benchmark/task corpus. It cannot certify benchmark coverage or supply missing evaluation data by itself. Such a consumer first needs actual tasks, evidence, ownership and a reviewed mapping; native Learning already owns run validity, provenance and explicit report comparison. Do not introduce an optimizer, model trainer or execution router from a survey taxonomy.

If either option is selected later: (1) name the actual input/output consumer; (2) verify licence/provenance before copying curated text or code; (3) read the relevant source/paper rather than replacing it with the catalogue summary; (4) implement only the requested bounded transformation using existing native file/report facilities; (5) run specifically authorized fixtures for aliases, duplicates, malformed dates/links, unknown metadata and immutable inputs; (6) update CODEBASE and canonical Memory with actual outcomes. No installation/test command is prescribed for an unselected consumer.

## 4. Family census and lifecycle

| Available family | Decision |
|---|---|
| `src/main.py` recursive collection, label resolution, table output | Conditional LLA-C1. A useful catalogue transformation, not a missing agent runtime. Its unsafe identity/cwd/output assumptions are not transplanted. |
| `assets/paper.json` | Retain as discoverable research metadata; links are pointers, not bundled implementations or verified facts. |
| README variants, `docs/action.md`, `docs/subarea.md`, `src/README.md` | Retain source framing and research leads for LLA-C1/C2. Do not silently turn literature descriptions into installed capabilities or verified Memory. |
| PNG illustrations | Reference-only visual assets. No reason to install them into Agent Core or claim their underlying methods are implemented. |
| Formatting/config files | Support only; no new toolchain or dependency consumer. |

**CONSUMER ONLY - RETAIN, DO NOT DELETE.** The catalogue still has useful future research value, so lack of a current executable adoption is not evidence of zero value. The user expressly authorized relocation of consumer-only references. Before moving, verify the destination does not exist, the source tree matches the inventory, the checkout is clean, native src/scripts/package references have no runtime dependency, and no targeted process is using this root. Move once through the native file tool; compare every inventoried file's bytes/hash and HEAD afterward. Do not force termination or delete anything if the move is blocked.

The supplied checkout, including research notes/assets, is the entire scope of this census. It does not establish universal exhaustion of the referenced research field. Conditional consumers may reopen this reference later. Do not install packages, fetch repositories or run the generator simply to manufacture adoption work.

Audit evidence: `runtime/tmp/agixt-aios-lifelong-grounding-20260929/awesome-lifelong-llm-agent-inventory.json`, `catalogue-summary.json`, identity/prior-plan search and final lifecycle evidence. This is a newly created plan; no earlier dedicated plan was found. The final movement result and hash readback are recorded separately below rather than inferred from this proposal.

## 5. Applied lifecycle readback - 2026-09-29

The move to `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/awesome-lifelong-llm-agent` succeeded. All 14 non-Git files retain their inventoried sizes and SHA-256 values. HEAD remains `b52ee231579804eace965141180a6d4c7a80108a`, working tree is clean, and the old root is absent. No current native source/script/package dependency or targeted process-path consumer was found before the move. These are scoped checks, not a claim to inventory every external application.

No repository was deleted. The generator, source, notes, metadata and illustrations were moved together without modification or execution. Evidence: `catalogue-move-preflight.json` and `catalogue-move-result.json` under the audit directory. This subsection supersedes the prospective wording of section 4 for movement status only; LLA-C1/C2 remain unselected consumer proposals, not implemented capabilities.

## 6. Approved-wave disposition — 2026-09-29

The user approved the companion current-fit AGIXT-P1 and AIOS-P1 proposals. Their approved CLI/resident verification and reference lifecycle are now closed, as recorded in CODEBASE 0.1.75 and both implementation plans section 9. AGiXT and AIOS are also retained in Consumer for their remaining conditional mechanisms. LLA-C1/C2 still have no selected catalogue/workbench consumer, so there is no Lifelong runtime implementation to execute under this approval.

This reference remains in `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/Consumer/awesome-lifelong-llm-agent`. No content, research claims, images, links or generator code were installed as a native capability. The catalogue was not moved again or deleted during final closure. All 14 inventoried file sizes/hashes and the original HEAD match; Git is clean. Latest readback is recorded under `runtime/tmp/agixt-aios-implementation-20260929/resident-closure-20260929T145607/`; the prior reference-readback.json remains historical implementation evidence.
