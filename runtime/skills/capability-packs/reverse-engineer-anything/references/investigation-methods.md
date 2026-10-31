# Investigation methods for incomplete analysis

Select the method that can resolve the current question. These are reasoning
procedures over available tools, not new REA commands, providers or setup steps.
Use [case-evidence.md](case-evidence.md) for provenance and finite acceptance;
the operational guides and actual connected schemas determine supported calls.

## Check an analyzer before trusting a negative

When an expected API, IPC edge or function is absent, distinguish absence from
an unsupported representation. Inspect the selected bytes, entry files, parse
coverage, unresolved aliases and bundle wrappers. Compare a known occurrence
with the analyzer's output. If execution is authorized and needed, a tiny owned
control with the same wrapper can distinguish a coverage failure from absence;
a plain-source control alone does not exercise a bundled registry lookup.

For native checks, a matching symbolized build can supply independent function
and call-site ground truth. Establish source revision, compiler/options and
binary correspondence first; never transfer addresses between builds by name.
Direct-call edges do not cover unresolved or indirect runtime calls.

When evaluating recovery on an owned sample, record predictions before revealing
reference answers. Keep method failures visible. Provider health/doctor success
does not prove the target can be opened or the selected operation succeeds.
Historical blind spots are leads to recheck, not current-version guarantees.

## Reconcile pseudocode with machine-level arithmetic

If a signature, expression or return value conflicts with callers or observed
behavior, inspect the same function's assembly and raw constants. Recover
arguments from calling convention, stack/register uses and call sites; follow
conversion helpers rather than guessing a high-level expression. Preserve the
raw bytes, endianness, operation order, signedness, integer width, division,
wrapping and floating-point conversion/rounding assumptions that affect results.
Keep an unresolved numeric detail unknown instead of silently using the host
language's default. For segmented/relocated images, establish the load mapping
before reading constants; see [native-and-artifacts.md](native-and-artifacts.md).

Write the address-backed behavior specification before the replacement. Compare
boundary and conversion cases with an independent oracle. If byte matching is
also requested, record compiler/options, exact ranges, relocation handling and
referenced constants separately from semantic checks. A changed compiler or
approximate PRNG/frame rate changes that claim's scope.

## Recover predicates before solving constraints

For an authorized input-checking task, trace a prompt/result string through
cross-references to the predicate. Read the actual mask, lookup and target bytes;
translate operations with their machine widths into constraints. Mark guessed
format/charset restrictions as assumptions, not recovered rules. Use an already
available solver only if useful; no installation is implied. Check accepted and
rejected inputs against the original when permitted. A satisfying model, a
candidate accepted by the original, and a unique solution are separate results;
a timed-out search for another model leaves uniqueness unknown.

## Separate interpreter, program, resources and state

For an embedded language, map the interpreter/VM, program tree or script data,
and assets separately. Identify which layer owns the behavior before rewriting
native code. Connect opcode decoding, operands and resource references to state
transitions and observable effects. Distinguish an implemented opcode from one
used by the shipped scripts, and first execution from redraw/repeated execution.

For temporal or random behavior, recover initial state, seed/warm-up, RNG update
and consumption order, timer units, scheduling order and relevant calendar input.
A seed alone does not reproduce a run if clocks or call order differ. Where an
oracle is available, compare a bounded state/event sequence under the same
inputs; a similar screenshot cannot establish scheduling or RNG fidelity.
Record changed rendering, safe failure handling, loop limits and other deliberate
differences with their affected cases. Recovered quirks and chosen improvements
must remain distinguishable in the specification.

## Change evidence route at a packing boundary

Identify the stub/packing evidence and stop treating that static view as game or
application logic. Preserve the original and any derived image identities.
For a remaining question, inspect separately available data archives, scripts,
format records or authorized recordings. Label binary facts, data observations
and inferred behavior independently; a data-compatible rebuild does not imply
recovered packed code. If those sources cannot answer the question, record the
missing evidence. Unpacking, injection or live execution is a separate action
under the existing task scope, not an automatic fallback.

## Find a compatibility seam and verify the final effect

Separate reusable algorithm/protocol logic, vendor-library dependencies and
OS/device adapters. Compare a focused adapter or existing component with a full
rewrite against the user's objective. State retained dependencies and reuse
conditions; a replacement platform layer is not an independent protocol engine.
Choose implementation languages by the component's actual needs; extra runtimes
or FFI need a concrete advantage over the existing stack.

Trace the requested effect across each handoff. For a protocol failure, compare
an authorized known-good trace with the failing one at the first divergent
handshake/message/state transition on the same device/version. Do not replay
traffic or expose credentials implicitly. Keep stages distinct: opening an app,
delivering configuration, installation and usable connectivity; connecting a
printer and printing; joining a game, synchronized visibility and player control.
Match acceptance to the relevant firmware, carrier/gateway, mode and platform.
If no result callback or device run exists, keep the downstream outcome unknown.

## Budget tool schemas as well as target output

Before a large analysis, distinguish model-context exhaustion, analyzer memory,
provider failure and transport truncation. Tool descriptions consume context
before the first call. Use existing usage/token records and supported task-local
tool selection when available; retain required discovery, evidence and cleanup
operations. Do not copy historical PR switches/counts or globally reconfigure
the host. Reuse retained Evidence and select bounded views instead of repeating
analysis. See [evidence-workflows.md](evidence-workflows.md). Stop when the finite
question is answered or name the missing evidence; more tool calls are not proof
of better recovery. No benchmark or speedup claim is required by this method.

## Sources and qualification

Independently written procedures informed by Sanbu's MIT
[awesome-rea catalog](https://github.com/git-sanbu/awesome-rea/tree/9aac7d1121f4f2685109b899d92dde8b297871c5),
especially cases `dx-ball`, `th04`, `ductf-masked-squares`, `rea-groundtruth`,
`bzip2-groundtruth`, `rea-on-rea`, `desktop-games-nostalgia`, `open-scrantic`,
`gunzrs`, `local-model-mcp` and the hardware/compatibility cases. Catalog results
remain author/curator reports, not independently rerun experiments.
Primary text inspected for this adaptation: [DX-Ball evidence](https://github.com/morluto/rea/blob/42fc6c53ae188978deb3bedfe88287b6b316ba22/website/evidence/dx-ball-sound-pan.md),
[known-source controls](https://github.com/UnknownHacker1/rea-groundtruth/blob/5b48f366368c9fbe2abaaab810aba6814c27190b/README.md),
and [Open Scrantic engine notes](https://github.com/glauberlima/open-scrantic/blob/8c049614158f2adb09e517ce9e29da89e8a3ac38/docs/ENGINE.md).
These sources do not establish that their old limitations persist in REA 6.5.0.
