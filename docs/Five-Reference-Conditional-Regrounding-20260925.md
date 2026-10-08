# Five-Reference Conditional Re-grounding — 2026-09-25

> Status: APPROVED — FOUR CONSUMER REFERENCES RETAINED — AWESOME DISCOVERY CHECKOUT RETIRED / DELETED
> Product/runtime compared: Agent Core 0.13.0
> Scope: Awesome Self-Improving Agents, atomic-hermes, OpenViking, Anthropic SDK Python, Anthropic SDK TypeScript

## Evidence boundary
All five requested checkouts were verified present, on the same previously audited pins, branch main, and Git-clean.
The Agent Core Grafel workspace was current with graph availability true and complete 1/1 current workspace coverage.
This pass read executable source and focused tests for the material residual mechanisms and compared them with current native owners.
No implementation, dependency installation, build, product test run, restart, release action, or checkout mutation was authorized or performed.

## Current-fit conclusion
No new mechanism from these fixed local revisions has a current Agent Core consumer that justifies installation now.
This is not the same as zero value: conditional mechanisms remain source-qualified and can become applicable only when their required consumer exists.
Existing completed adoptions remain closed and are not reopened by this audit.

## Reference disposition
- Awesome: local direct source was exhausted after ASI-P1–P6; the user explicitly chose to discard the remaining external discovery leads as out of scope, so the checkout is now retired/deleted.
- atomic-hermes: retain AH-C1-style outbound MCP OAuth refresh evidence: disk-change invalidation, expiry-aware cold load, 401 single-flight and reconnect signalling.
- OpenViking: retain OV-C1 durable ingest-cursor intent-before-effect semantics; AGPL source remains reference-only and any future adoption must be clean-room.
- Anthropic SDK Python: retain conditional token-cache, credential-chain/OIDC and external-worker/replica lifecycle evidence; no matching current consumer exists.
- Anthropic SDK TypeScript: retain conditional token-cache, credential-chain/OIDC and heartbeat/lost-lease worker lifecycle evidence; no matching current consumer exists.

## Negative consumer evidence
Current Agent Core source has no exact OIDC, federation, workload-identity, ingest-cursor, pending-cursor, or heartbeat-TTL contract.
The existing FileOAuthStore is an inbound/server OAuth issuer and refresh-token store; it is not an outbound MCP OAuth client.
Phone Gateway uses a configured bearer token and bounded single-send transport; it exposes no token-refresh provider contract.
Hermes Partner is a loopback runs API integration and exposes no OAuth-refresh or distributed-lease consumer.
ProcessLedger already owns local child-process lifecycle; it is not a distributed queue lease.

## Activation conditions
Do not implement the retained conditional mechanisms merely to keep the references useful.
Re-ground the relevant family only when a real owner appears:
1. outbound remote MCP/client OAuth with refreshable tokens -> atomic/Anthropic credential mechanisms;
2. external append/import ingestion with crash reconciliation -> OpenViking cursor behavior, clean-room only;
3. distributed claimed work with ownership TTL/heartbeat -> Anthropic environment-worker lease behavior;
4. explicit OIDC/workload-identity requirement -> Anthropic credential-chain/federation behavior.

## Retirement rule
A checkout may be deleted only after its conditional families are implemented/rejected as no longer wanted, current source/scripts/tests have zero dependency on the checkout, no process/reparse boundary depends on it, and provenance/license pins are preserved.
Awesome additionally requires a decision or bounded source-first census for the 185 external discovery leads before the catalog itself can be called corpse.


## Approved execution closure — 2026-09-25

> Status: APPROVED — EXECUTED AS INTENTIONAL NO-OP — CONDITIONAL FAMILIES DORMANT — REFERENCES RETAINED

The user approved this plan in full, including permission to install helper tooling when genuinely needed. A post-approval consumer check did not change the architecture facts that governed the plan:
- no outbound refreshable MCP OAuth client owner;
- no OIDC/workload-identity consumer;
- no external append/import ingest cursor pipeline;
- no distributed claimed-work heartbeat/TTL owner.

Therefore the approved execution is intentionally **no runtime/source implementation** for the retained conditional families. Installing credential, cursor, or lease abstractions without a native consumer would violate the plan's own activation rules and create duplicate/unused subsystem ownership.

No dependency or helper installation was required. No source/runtime files, public MCP schema, provider, release state, process, or reference checkout were changed.

Approved dormant families:
1. atomic-hermes outbound MCP OAuth refresh/reconnect behavior;
2. OpenViking OV-C1 durable ingest cursor, clean-room only because the source is AGPL-3.0;
3. Anthropic Python/TypeScript token cache + credential chain/OIDC behavior;
4. Anthropic distributed heartbeat/lost-lease worker lifecycle.

Awesome is no longer retained: the user explicitly chose to discard the remaining external discovery leads, and the checkout was retired/deleted.

This closure is not a rejection of the conditional mechanisms. It records that the implementation trigger has **not yet become true**. When one of the activation conditions appears, re-ground only that family against the concrete new consumer before implementation.

Release impact: none. This is docs/memory continuity only and does not warrant a changeset.


## Consumer reference classification — 2026-09-25

The user requested a physical separation between references being actively studied for steal/use and references retained only because a future concrete consumer may need their source-qualified mechanisms.

Created:
`DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer`

Moved without changing repository contents:
- `Consumer\07-atomic-hermes`
- `Consumer\09-OpenViking`
- `Consumer\anthropic-sdk-python`
- `Consumer\anthropic-sdk-typescript`

`steal-use-repos` is now reserved for references actively queued for source-first steal/use study. `Consumer` is not an implementation backlog; it is a holding area for consumer-bound references whose activation condition is not currently true.

`awesome-Self-Improving-Agents` remains outside Consumer because its role is discovery/catalog evidence, not a consumer-bound implementation reference.

Post-move Git verification:
- atomic-hermes HEAD `d73323210d1f6e01325f4e112371a14fede93c78`, clean;
- OpenViking HEAD `184a5cecef0612a893a8db5718674b3084c6811b`, clean;
- Anthropic SDK Python HEAD `0af0190679a9e80388bd1b0328d557c9a91a11b2`, clean;
- Anthropic SDK TypeScript HEAD `3c5d9c0c15bb847a628f3f2876ac09719abe3012`, clean.

No runtime/source/public MCP/release behavior changed; this is reference taxonomy and path organization only.


## Awesome discovery checkout retirement — 2026-09-25

The user explicitly decided the remaining external GitHub discovery leads were outside the intended Agent Core scope and authorized complete deletion without extracting the lead catalog.

Pre-delete evidence:
- pinned HEAD `99ce3979185536c1efb57b5c6935244b56f1dfec`;
- Git-clean;
- 49 tracked files;
- zero `src` / `scripts` / `tests` references to the checkout path;
- no independent active process/session using that path.

The checkout `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\awesome-Self-Improving-Agents` was deleted completely. Readback of the protected directory confirms it is absent. ASI-P1–P6 remain live and independent of the deleted catalog. The ~185 GitHub URL leads were intentionally discarded and were not copied into Discovery or Memory.
