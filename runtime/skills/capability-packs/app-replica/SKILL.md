---
name: app-replica
description: "Rebuilds an existing app as the user's own clone through one pipeline: recon map, user-review research, design system, architecture, backend, screen-by-screen build, tests, parity diff against the original, rebrand, launch material and deployment. Use when the user says clone this app, reverse engineer X, rebuild X, copy this app, map the screens of X, or pastes an app URL or store link to rebuild; also for any single stage of that pipeline such as design tokens, backend, parity score, rebrand, launch page or deploy of a clone. Not for ordinary maintenance of an app the user already owns."
license: MIT
compatibility: "Agent Core adapter: existing grants and available tools; Windows-safe equivalent commands; load references only when relevant."
metadata:
  upstream-repository: "https://github.com/Jakeschincariol/replica-skill"
  upstream-commit: 77c9436fb3d18c3d58169efb8caf4fe906b0dc51
  upstream-path: merged
  adapter-revision: "1"
---
## Triggers
- Clone, copy or rebuild an existing app; map its screens, flows and features.
- Any single stage: recon, review research, design system, architecture, backend, build, test, parity diff, rebrand, launch, deploy of a clone.
- The user pastes an app URL, App Store or Google Play link and wants their own version.

## Non-triggers
- Routine maintenance or new features in an app the user already owns and understands; use the engineering skills instead.
- Investigating a shipped binary or bundle byte by byte; choose `reverse-engineer-anything` when the question is about an executable or archive rather than a product clone.
- Generic launch readiness of the user's own product; choose `delivery-and-release` when no original app is being replicated.

## Agent Core integration
Read the compact `agent-core-capability-index` first, then this Skill through every returned fragment. Open a stage reference only when that stage is selected. Record actual use and evidence; reading is not use. Current user instructions, host rules and task scope win over stage defaults. Map Claude-specific tool names to available equivalents, adapt shell examples to Windows PowerShell, and report an unavailable operation instead of claiming it ran. A stage is a workflow, not permission to install dependencies, publish, send messages or change credentials.

## App replica pipeline
One pipeline for turning a reference app into a clone that is legally and visually the user's own. Every stage reads what the earlier stages wrote into the user's project, so a stage can be run alone only when its inputs already exist. Start with recon: a weak recon map produces a weak clone.

### Stages
| Stage | Use for |
|---|---|
| [replica-recon](references/replica-recon.md) | Reverse-engineer the original into a recon map (screens, flows, components, inferred data model, feature matrix). Always first. |
| [replica-entrepreneur](references/replica-entrepreneur.md) | Read public reviews of the original and find the gaps and the positioning angle for the clone. |
| [replica-design](references/replica-design.md) | Rebuild the design system: colour roles, type scale, spacing, components and their states. |
| [replica-architect](references/replica-architect.md) | Choose the stack, database schema and API from the recon map. |
| [replica-backend](references/replica-backend.md) | Add auth, database access rules, payments, email and background jobs. |
| [replica-build](references/replica-build.md) | Rebuild screen by screen: app shell, core flow as a vertical slice, then every other screen. |
| [replica-test](references/replica-test.md) | Generate and run a test plan from the recon flows; record bugs with evidence. |
| [replica-diff](references/replica-diff.md) | Score feature and layout parity against the original and list what is still missing. |
| [replica-brand](references/replica-brand.md) | Name and rebrand the clone so nothing identifies the original; run the rebrand sweep. |
| [replica-launch](references/replica-launch.md) | Write the landing page, pricing and store listing for the clone. |
| [replica-deploy](references/replica-deploy.md) | Run the preflight gate and ship the clone on the user's own domain. |

### Order
1. Recon first (`references/replica-recon.md`). Every other stage reads its output.
2. Research and design can run once recon exists; architecture follows design.
3. Backend and build interleave: build the vertical slice, then add the backend it needs.
4. Test and diff before rebrand and launch; deploy only after the preflight gate in `references/replica-deploy.md` passes.

### Kit
Templates and small standard-library Python tools live in `references/kit/`. Read a file with skills(read), save the copies you need into the project (tools together with their data files), then run them from there.

### Origin
Each stage is the full text of a former Skill, retired into this pack. Provenance, upstream pins and the restore path: [merged-from](references/merged-from.md).
