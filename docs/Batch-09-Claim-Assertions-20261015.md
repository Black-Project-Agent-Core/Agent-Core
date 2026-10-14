# Batch 9 — Actual source-anchored implementation claims

The following three claims refer to files actually present in the main Agent Core Windows checkout. Claim-to-handle validation is structural, not semantic entailment or truth certification.

- C09-01: The explicit version 2 manifest with expectedClaims and claims is defined in src/verification/evidence-links.ts.
- C09-02: The bounded per-claim coverage projection is implemented in src/verification/evidence-links.ts.
- C09-03: The existing external-controller CLI at scripts/verify/verify-evidence-links.mjs calls the compiled verifier and writes a digest-reported persistent result.

Only these declared claim IDs are in scope. No other report sentence or external fact is claimed verified.
