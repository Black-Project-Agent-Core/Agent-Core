---
name: delivery-and-release
description: "Automates and gates delivery to production: CI/CD pipeline setup with quality gates, test runners and deployment strategies, hardening of CI workflows, then the pre-launch checklist, monitoring, staged rollout and rollback plan. Use when setting up or changing build and deployment pipelines, when a CI workflow needs hardening, or when preparing a production launch and asking what must be in place before shipping. Not for branching and commit hygiene or for adding instrumentation code."
license: MIT
compatibility: "Agent Core adapter: existing grants and available tools; Windows-safe equivalent commands; load references only when relevant."
metadata:
  upstream-repository: "https://github.com/addyosmani/agent-skills"
  upstream-commit: aeac41d4d005999432bb7312f7ff06383a91d59d
  upstream-path: merged
  adapter-revision: "1"
---
## Triggers
- Setting up or modifying build, test and deployment pipelines; establishing quality gates.
- Hardening CI workflows (permissions, secrets, third-party actions).
- Preparing a production deploy: pre-launch checklist, monitoring, staged rollout, rollback plan.

## Non-triggers
- Branching, merging, commit messages and version tags; choose `git-workflow-and-versioning`.
- Adding logs, metrics or tracing to code; choose `debugging-and-observability`.
- Deploying a clone of another product; the final stage there lives in `app-replica`.

## Agent Core integration
Read the compact `agent-core-capability-index` first, then this Skill through every returned fragment. Open a stage reference only when that stage is selected. Record actual use and evidence; reading is not use. Current user instructions, host rules and task scope win over stage defaults. Map Claude-specific tool names to available equivalents, adapt shell examples to Windows PowerShell, and report an unavailable operation instead of claiming it ran. A stage is a workflow, not permission to install dependencies, publish, send messages or change credentials.

## Delivery and release
Delivery as one chain: the pipeline that builds, tests and deploys, and the launch checklist that decides whether a given release may go out. Configure the pipeline first, then run the launch checklist against the release candidate.

### Stages
| Stage | Use for |
|---|---|
| [ci-cd-and-automation](references/ci-cd-and-automation.md) | Pipeline design, quality gates, test runners in CI and deployment strategies; includes `references/workflow-hardening.md`. Also: [workflow-hardening](references/workflow-hardening.md). |
| [shipping-and-launch](references/shipping-and-launch.md) | Pre-launch checklist, monitoring, staged rollout and rollback strategy. |

### Order
1. Pipeline first: the launch checklist assumes automated tests and a repeatable deploy.
2. Harden the workflow before it gets production credentials.
3. Run the launch checklist on the release candidate; keep the rollback plan before the rollout starts.

### Origin
Each stage is the full text of a former Skill, retired into this pack. Provenance, upstream pins and the restore path: [merged-from](references/merged-from.md).
