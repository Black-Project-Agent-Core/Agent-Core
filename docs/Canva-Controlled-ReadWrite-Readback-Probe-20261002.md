# Canva Controlled Read/Write/Read-back Probe — 2026-10-02

## Status

**TASK 3 IN PROGRESS — BLOCKED BEFORE DEVELOPER APP CREATION.**

**TASK 4 NOT STARTED.**

The controlled runtime probe reached the Canva Developer Portal using the already-authenticated Brave profile without copying cookies, credentials, or session material.

The portal showed first-app onboarding and no existing developer app. Selecting `Create an app` opened a dialog that requires the user to agree to the **Canva Developer Terms** before the app can be created.

The assistant did **not** select that legal agreement and did not create an app.

Therefore no Design Editing SDK runtime, REST OAuth flow, Canva design creation, mutation, or read-back was executed.

## What was verified

- Canva Developer Portal is reachable from the authenticated Brave session.
- The account currently reaches first-app onboarding (`Create an app`).
- A developer app is a prerequisite for Apps SDK preview.
- Canva's current Quickstart requires configuring the app's Development URL in the Developer Portal and opening the app through Preview inside the Canva editor.
- Canva REST APIs require OAuth 2.0 authorization.
- The create-app dialog requires explicit acceptance of Canva Developer Terms.
- No legal acceptance was performed by the assistant.

## Controlled fixture prepared

Machine-readable fixture specification:

`docs/Canva-Controlled-Reference-Design-Spec-20261002.json`

The fixture defines three controlled page families:

1. Page A — GA positive-path semantics: background, text/rich text, rect, shape, group/nested group, stroke/fill, rotation/transparency, ordering, media fill.
2. Page B — replaceable media (`dropTarget`) plus z-order and explicit negative capability probes.
3. Page C — GA existing Autofill dataset read/fill/update, with Preview `getDataFieldFor` isolated as research-only.

## Intended runtime sequence after the legal gate

```text
create private development app
→ configure local Development URL
→ open controlled design in Canva editor
→ openDesign(all_pages)
→ snapshot
→ create supported elements
→ read-back
→ update
→ read-back
→ reorder
→ read-back
→ delete probe element
→ read-back
→ dropTarget media-frame probe
→ Autofill probe
→ normalized semantic diff
```

## Acceptance remains unchanged

A capability may be promoted to proven `NATIVE` only after runtime evidence confirms expected structural read-back. Documentation alone remains candidate evidence.

## Protected boundaries

No Canva user design was created or modified. No Penpot source, Figma adapter, credentials, cookies, private Canva IPC, or production runtime was modified.

## Blocker

The remaining prerequisite is a **user-owned legal action**: review and accept the Canva Developer Terms in the Developer Portal and create the development app. The assistant will not accept contractual terms on the user's behalf.

Once that is done, TASK 3 resumes at app configuration and runtime Design Editing / Autofill probes. TASK 4 must remain blocked until TASK 3 closes.