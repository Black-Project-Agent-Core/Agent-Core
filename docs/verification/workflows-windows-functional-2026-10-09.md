# Workflows: Windows functional verification

**Decision: functional PASS with limitations, on an isolated test candidate.** Production integration and activation were not performed by this verification. This record summarizes a user-supplied Windows/WebView2 report; the documentation update did not rerun the application.

[Workflows plan](../plans/2026-10-09-unified-workflows.md) · [Codebase map](../CODEBASE.md) · [Plan status](../plans/README.md)

## Provenance and scope

- Reported test window: **2026-10-09, 19:46–21:09 UTC**.
- Workflows candidate: [`f22e6e426d9c8937439763602f986b9fb3243f23`](https://github.com/Black-Project-Agent-Core/Agent-Core/commit/f22e6e426d9c8937439763602f986b9fb3243f23), based on `3774a44e83fc941accd299eaefc4fd65a8e5d958`.
- Environment: actual Windows launcher/WebView2 in a separate test checkout with isolated runtime/profile and listener. Production processes and tracked local changes were reported unchanged.
- Test-only wrapper: `src/launcher/Program.cs`, `src/launcher/RootLocator.cs`, and `src/launcher/AgentCoreRuntime.cs` were adjusted in the candidate copy for distinct process identity, local paths/listener, and disabled tunnel/autostart/self-repair behavior. These changes were isolation measures, not production integration.
- Candidate source/build hashes and the process chain were recorded separately. The Workflows UI displayed Git HEAD as unknown; visible UI metadata alone was not used to attest the candidate commit. In-memory binary identity and equivalence to the unmodified production launcher were not established.
- Source prerelease `0.15.0-beta.0` was published at [`23fdca411e152c42fe1a5b81f526b18d6d57bd3b`](https://github.com/Black-Project-Agent-Core/Agent-Core/commit/23fdca411e152c42fe1a5b81f526b18d6d57bd3b). This later commit is not the Windows candidate tested above. This documentation-only follow-up leaves that immutable tag and the source version unchanged.

## Results

The report's case ledger records **17 PASS, 1 FAIL, 5 NOT RUN**, with no blocked cases. The final functional decision does not erase the initial build failure or extend to excluded checks.

| Area | Observed result |
| --- | --- |
| Core and React UI builds | Passed in the isolated Windows checkout using existing dependencies |
| Initial launcher build | Failed with `CS5001`; retained as a failed attempt |
| Targeted launcher retry | Passed with explicit `StartupObject=AgentCore.Launcher.Program` |
| Sidebar navigation | Workflows opened and returned to the same canvas after Dashboard navigation |
| System + Memory view | One Archify canvas; initial Memory-host focus and subsequent system-node focus |
| Search | `code-intelligence` returned one matching node and focused its related connections |
| Zoom | Actual WebView2 controls changed 100% → 125% → 100% |
| Viewport movement | Scroll-based movement observed; pointer-drag was not tested |
| Automatic refresh | Reversible comment-only source edit changed fingerprint and generated timestamp without manual rebuild |
| Stale state and recovery | Renderer failure preserved last-good canvas and error status; restoration recovered automatically |
| Initial error and recovery | Missing renderer at test startup showed unavailable/waiting state; restoration recovered automatically |
| Restoration and teardown | Fixture and renderer hashes restored; normal launcher close removed the candidate listener while production remained unchanged |

The observed graph had 359 source files, 41 nodes, 174 static import edges, and 558 unresolved references. These are dated candidate observations, not runtime execution coverage or permanent source-count requirements.

## Explicitly not established

- Pointer-drag pan. A successful scroll-based viewport movement is a separate interaction.
- Live HTTP token/method security, broader process/security behavior, or complete sandbox escape resistance.
- Exact polling subscriber counts or zero overlap under repeated navigation.
- Benchmarks, throughput/stress tests, or a full regression suite.
- Acceptance of the unmodified production launcher, the later release commit, packaged-source lookup, or production activation.
- Memory 01 acceptance, retrieval-quality benefit, migration, or provider verification. The user explicitly postponed Memory 01; Memory 02 was not started.

## Evidence integrity

- Evidence archive: `workflows-f22e6e4-windows-acceptance.zip`.
- ZIP SHA-256: `e1faef75508cf6b2578a97113d021a3ab0d5c1d9bcd8efee9b8876197dd35b16`.
- All **51 payload entries** matched the supplied manifest's relative paths, byte sizes, and SHA-256 hashes after extraction. The manifest's separate self-entry intentionally has no circular self-hash.
- Functional claims derive from the report, case ledger, and associated recorded observations. Manifest verification establishes archive integrity; it is not an independent rerun of the functional test.
- The original evidence remains in the user-provided archive. This public summary omits private host paths, process identifiers, hardware details, credentials, user Memory, and browser profiles. No original screenshot is republished here.

## Follow-through

The current integration handoff covers the Workflows delta from `3774a44` to `f22e6e4` plus published source-version metadata from `23fdca4`. Preserve unrelated local changes and the active Memory engine/data. Do not migrate or test Memory 01 under this Workflows scope. Production integration, build activation, and functional readback remain separate pending outcomes; do not present this isolated functional PASS as their completion.

## Subsequent production acceptance

The [2026-10-10 report review](../memory/verification/memory01-windows-functional-2026-10-10.md) closes scoped production Workflows acceptance and the launcher provenance discrepancy. Earlier pending states above describe the isolated candidate at that time.
