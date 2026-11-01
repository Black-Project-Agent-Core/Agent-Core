---
name: requirements-and-planning
description: "Takes work from a vague wish to a verified plan: extract what the user actually wants by one-question-at-a-time interviewing, refine a rough idea into sharp options, write a specification with acceptance criteria, then break it into ordered tasks that can each be verified. Use when the goal or user need is unclear, an idea is still raw, no specification exists for a new project or significant change, or a clear specification must be turned into implementable tasks. Not for implementing the tasks or for small obvious fixes."
license: MIT
compatibility: "Agent Core adapter: existing grants and available tools; Windows-safe equivalent commands; load references only when relevant."
metadata:
  upstream-repository: "https://github.com/addyosmani/agent-skills"
  upstream-commit: aeac41d4d005999432bb7312f7ff06383a91d59d
  upstream-path: merged
  adapter-revision: "1"
---
## Triggers
- The goal, user or constraint is unclear and the real need must be drawn out.
- An idea is still raw and alternatives must be generated and narrowed.
- A new project or significant change has no specification or acceptance criteria yet.
- A clear specification must be broken into ordered, verifiable tasks.

## Non-triggers
- Writing the code for planned tasks; choose `incremental-implementation` once tasks exist.
- A small, obvious change where the requirement is already stated and verifiable.
- Testing the plan's assumptions with an independent review; choose `doubt-driven-development` when a decision needs an adversarial check.

## Agent Core integration
Read the compact `agent-core-capability-index` first, then this Skill through every returned fragment. Open a stage reference only when that stage is selected. Record actual use and evidence; reading is not use. Current user instructions, host rules and task scope win over stage defaults. Map Claude-specific tool names to available equivalents, adapt shell examples to Windows PowerShell, and report an unavailable operation instead of claiming it ran. A stage is a workflow, not permission to install dependencies, publish, send messages or change credentials.

## Requirements and planning
The front half of engineering work as one flow: understand the person, shape the idea, fix the specification, plan the tasks. Enter at the stage that matches what is already settled; do not re-interview when a specification exists, and do not plan tasks before the specification is agreed.

### Stages
| Stage | Use for |
|---|---|
| [interview-me](references/interview-me.md) | Interview the user one question at a time to find what they actually want. |
| [idea-refine](references/idea-refine.md) | Diverge and converge on a raw idea; templates, frameworks and refinement criteria are included. Also: [examples](references/examples.md), [frameworks](references/frameworks.md), [refinement-criteria](references/refinement-criteria.md). |
| [spec-driven-development](references/spec-driven-development.md) | Write the specification and acceptance criteria before a significant change. |
| [planning-and-task-breakdown](references/planning-and-task-breakdown.md) | Turn the agreed specification into ordered tasks with verification steps. |

### Order
1. Interview when the need is unclear; skip when the user already stated it precisely.
2. Refine the idea when alternatives are still open; skip when the approach is chosen.
3. Specify before any significant change; the specification is the input of planning.
4. Plan last: tasks must trace back to acceptance criteria.

### Kit
Templates and small standard-library Python tools live in `references/kit/`. Read a file with skills(read), save the copies you need into the project (tools together with their data files), then run them from there.

### Origin
Each stage is the full text of a former Skill, retired into this pack. Provenance, upstream pins and the restore path: [merged-from](references/merged-from.md).
