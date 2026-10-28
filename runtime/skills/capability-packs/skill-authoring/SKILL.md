---
name: skill-authoring
description: "Use when writing a new Skill, revising an existing one, or reviewing a Skill imported from another ecosystem before it is staged, and when a Skill loads in the wrong tasks or is skipped in the right ones. Covers the strict format, size, routing, tool declarations and the import review."
compatibility: "Agent Core adapter: existing grants and available tools; Windows PowerShell examples."
---
# Skill authoring

How to write or import a Skill for Agent Core so that it passes the strict parser, routes to the right tasks, can be read in full by a model, and never claims authority it does not have.

## Triggers

- Writing a new Skill or revising an existing one.
- Reviewing an imported Skill (from a plugin, a repository or another assistant) before it is staged.
- A Skill is loaded in the wrong tasks or skipped in the right ones and its text must be fixed.

## Non-triggers

- Using an existing Skill to do a task: follow that Skill, not this one.
- Choose `documentation-and-adrs` when the text is documentation for people, not instructions that an agent reads.
- Packaging or exporting an already active Skill: use the `render_export` action of the `skills` tool.

## Workflow

1. **Format.** The frontmatter accepts only `name`, `description`, `license`, `compatibility`, `allowed-tools` and `metadata`. The `name` is lowercase with hyphens and equals the folder name. The `description` is one line, a quoted string if it contains a colon, without angle brackets, and says when to use the Skill. Multi-line values (`|`, `>`) are not supported.
2. **Size and files.** Keep `SKILL.md` at or under 8192 bytes, which is one `skills(read)` fragment. Put long material in `references/*.md`, each at or under 8192 bytes, with one pointer line per reference in `SKILL.md`. Only `references/` can be read through `skills(read)`: a file beside `SKILL.md`, or under `scripts/`, never reaches the model.
3. **Routing.** Write `## Triggers` and `## Non-triggers`. Where two Skills overlap, name the sibling in the form "Choose `<sibling>` when `<signal>`". Boilerplate Non-triggers copied between Skills hide the difference a router needs; `node scripts/verify/skill-pack-lint.mjs` reports shared text and near-identical Triggers.
4. **Body.** State the purpose, then numbered steps with one imperative action each, then a **Tools used** table (tool, why it is used, tier: read-only, writes local files, runs a process, or network), then a verification step that says how to know the work succeeded.
5. **Windows.** Give command examples in PowerShell, not only bash, and say when a step needs a tool that may be absent.
6. **Authority.** `allowed-tools` is a declaration, never a grant. Do not write steps that run scripts, send messages, publish or install automatically, and do not tell the agent to skip confirmation the user would normally give. Installing a Skill never widens a tool grant.
7. **Imports.** Run the [intake review](references/intake-review.md) before you stage an imported Skill. Keep upstream text untouched; put local changes in the adapter section or in references.
8. **Validate and submit.** Edit the Skill in its one source home, `runtime/skills/capability-packs/<name>/`; never write the catalog directly and never create a second Skill folder elsewhere. Run the lint and `skills(validate)`. A revision of an active Skill goes through `skills(stage_revision)`; a new Skill goes through `skills(propose)` or, when the owner asks you to install it directly, the import path. Activation follows the owner's decision for the exact revision (its digest).

## Tools used

| Tool | Why | Tier |
|---|---|---|
| `read_file`, `list_directory` | read the Skill and its siblings | read-only |
| `write_file`, `edit_block` | edit the Skill source | writes local files |
| `start_process` | run `skill-pack-lint.mjs` | runs a process |
| `skills` (`validate`, `stage_revision`, `propose`) | check and submit the Skill | writes Skill state, never the active catalog |

Declaring a tool here is not a grant.

## Verification

```powershell
node scripts/verify/skill-pack-lint.mjs --packs runtime/skills/capability-packs
```

Read the finding for your pack: no error, no dangling link, size as intended, Non-triggers not shared. Then run `skills(validate)` on the folder and quote the digest and file count. A Skill drafted by following this list should pass validation without correction; if it did not, fix this list.
