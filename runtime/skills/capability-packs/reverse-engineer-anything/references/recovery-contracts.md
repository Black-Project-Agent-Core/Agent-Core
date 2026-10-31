# Recovery contracts and difficult inputs

Use these methods only for the selected investigation or reconstruction. They
use existing tools and task-local evidence, not new REA commands or providers.
Keep [case-evidence.md](case-evidence.md) for provenance and finite acceptance,
and [investigation-methods.md](investigation-methods.md) for analyzer controls,
machine arithmetic and interpreter state.

## Choose reuse and a recovery goal

Before rederiving a feature, look for existing work on the same target, version,
platform and format. A catalogue can locate a specification, matching source,
extractor or compatibility layer; inspect the primary material before reuse.
Treat a "Uses REA" tag as attribution, not a quality ranking or an eligibility
filter: work using other tools may answer the question. A README advertising a
release or provider is insufficient when its files are stubs or its package is
absent. Keep the installed pin rather than replacing it from that claim.

Name the intended result: readable behavior, a matching build, static
recompilation, an engine/OS adapter, emulation or data compatibility. These
require different evidence. A native port starting successfully does not prove
a matching build or remove its dependence on original assets. Select the
smallest reusable result that meets the user's objective.

## Follow behavior when labels disappear

For a Dart/Flutter AOT target, establish the actual native image, architecture,
build mode and compiler/runtime identity before choosing a compatible analyzer.
APK/DEX inspection alone does not recover code compiled into `libapp.so`.
No Dart/Flutter decoder or new toolchain is implied by this guide.

If enum names or helper symbols are absent, do not conclude the feature is gone
or the program cannot be analyzed. A generated extension type may erase to an
integer; branches can remain in callers after inlining. Follow available value
flows from input/deserialization through comparisons, tables and state updates
to the observable effect. Preserve widths, raw constants, call sites and default
or invalid-value branches. Use neutral labels until behavior grounds a name;
recovering a branch's effect is different from recovering its original name.

When matching source/generator evidence exists, inspect explicit values,
key/seed configuration, label emission, hash truncation/normalization and
collision handling. Stable-looking constants need not survive a rename, key
rotation, collision or generator change. Reintroduced labels or ordinary UI
text can be leads, not proof of a particular security decision. Do not infer
global collision freedom, zero runtime cost, authorization enforcement or
irreversibility from a string scan, inline pragma or sample test.

## Make negative evidence non-vacuous

For a removal or absence claim, first verify that the selected bytes were
actually acquired and scanned successfully. Record digest, selected image/member,
encoding/search method, tool/build settings and the exact property being checked.
Empty extraction, unsupported input, unreadable bytes or an unperformed platform
mode leaves that claim unverified; a different successful mode is not a fallback
proof. Literal byte absence does not exclude encoded or reconstructed strings.

When a paired control is needed and building an owned sample is authorized,
retain an observable effect so both relevant paths survive optimization. Use
distinctive canary identifiers to separate target labels from common runtime
words. Establish presence in the matching control for **each** identifier whose
removal is claimed; one positive string cannot validate every negative result.
Keep compiler, flags, architecture and relevant behavior comparable. Scan the
exact requested release image: desktop Dart evidence alone does not establish
Flutter arm64 APK behavior. A finite string result proves that property on those
bytes, not general resistance to reverse engineering. Do not copy or execute a
donor's verification script merely because it reports success.

## Freeze traceable acceptance

Before implementation, map each required behavior and acceptance case to its
source location, inputs, units, normalization and expected output. Distinguish
inherited behavior, an adapted interface and intentionally new composition.
A model-assigned donor label is not lineage proof: a formatter's specification
does not establish a parser, and bytes-to-bits conversion can change a contract.
Resolve disagreement against the source/oracle rather than changing an expected
result solely to make the implementation pass.

Keep the accepted contract separate from generated implementation and repair
outputs. Check the resolved canonical destination and ownership before applying
generated files; checking an unnormalized path prefix is insufficient. Record
contract changes explicitly with their reason and revalidation. This is a
task-local acceptance method, never a production dependency on test files.

Check expected case identities against cases actually executed. Preserve process
exit/signal, timeout, cancelled/skipped/missing cases and output truncation;
reconcile counts with complete runner evidence instead of trusting printed TAP
summaries or a report banner alone. A suite that never loaded is not a pass.
Implementation tests and an LLM-generated contract using the same specification
can share an error; retain the independent oracle from case-evidence.md.
A report hash binds its recorded bytes, not correctness, clean-room separation
or licensing. Token-overlap heuristics cannot certify those properties either.

## Bound amplification, not only each record

When rebuilding an archive/parser/VM, recover ranges, lengths, chunk boundaries,
terminators and operand widths from selected bytes before decoding content.
Check boundaries before allocations and reads. Preserve overlapping archive
entries as ranges into one owned volume when practical; avoid copying the same
large payload for each alias. Bound decompressed output as well as input size.

Distinguish per-item limits from aggregate retained/decoded data, nesting depth
and per-step work. Many individually valid aliases, referenced programs or
resource-load opcodes can exceed the total budget. Share immutable decoded
resources only with explicit identity and lifetime; a cache is optional, not a
new subsystem. For the required reconstruction, check truncated records, an
overlapping/aliased entry, nested or repeated references and budget exhaustion
with the narrow authorized correctness checks. Do not copy donor limit values
as universal requirements or introduce a benchmark.

Keep safe rejection, skipped work, clipping and iteration limits distinct from
original behavior. Record which cases a deliberate guard changes; do not report
an interrupted or bounded interpretation as faithful completion.

## Sources and limits

Independently written methods from inspected local snapshots:
- [Open Scrantic](https://github.com/glauberlima/open-scrantic/tree/d90f1692927e7955e7c0745d3770af58e8d1f3e2), MIT: `src/assets/resource.rs`, `src/assets/exe.rs`, `src/engine/{ads,ttm}.rs`.
- [ReaFuse](https://github.com/sickpyramid/ReaFuse/tree/c64502a2827832c042d894ba90dc678a95772cb1), MIT: `src/{pipeline,schemas,verify,originality,report}.mjs` and `showcase/ratewise` specification/contract mismatch.
- [stealth_enum](https://github.com/aslamambiloly/stealth_enum_workspace/tree/57ab57524c7013dc664e2c1d03d70d4f6b92df0a), MIT: generator, generated examples and `scripts/verify_aot_strings.sh`.
- [REA Atlas](https://github.com/jammyfu/rea-atlas/tree/877b34ecab0043bc56aa0773d2333161039731f1), CC0-1.0: `data.json`, English descriptions and renderer; a discovery map, not verification of linked projects.

Source inspection established mechanisms and limits, not reproduced runtime
outcomes or performance. No donor code, tool list or dependencies are imported.
