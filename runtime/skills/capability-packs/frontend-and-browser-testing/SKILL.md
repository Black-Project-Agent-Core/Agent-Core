---
name: frontend-and-browser-testing
description: "Builds user interfaces and proves them in a real browser: production-quality, accessible, responsive components and pages with complete state handling, then verification with Chrome DevTools data (DOM, console errors, network requests, performance profile, visual output). Use when building or changing interfaces, pages, components or layouts, when meeting accessibility requirements, or when anything that runs in a browser must be inspected, debugged or verified with real runtime data. Not for backend-only work or for choosing the test strategy of non-UI code."
license: MIT
compatibility: "Agent Core adapter: existing grants and available tools; Windows-safe equivalent commands; load references only when relevant."
metadata:
  upstream-repository: "https://github.com/addyosmani/agent-skills"
  upstream-commit: aeac41d4d005999432bb7312f7ff06383a91d59d
  upstream-path: merged
  adapter-revision: "1"
---
## Triggers
- Building or modifying interfaces, pages, components, layouts or client-side state.
- Meeting accessibility (WCAG) and responsive requirements.
- Anything that runs in a browser must be inspected: DOM, console errors, network requests, performance profile, visual output.

## Non-triggers
- Backend-only or CLI work with no rendered output.
- Writing the failing test first for non-UI behavior; choose `test-driven-development`.
- Root-cause debugging of non-browser failures; choose `debugging-and-observability`.

## Agent Core integration
Read the compact `agent-core-capability-index` first, then this Skill through every returned fragment. Open a stage reference only when that stage is selected. Record actual use and evidence; reading is not use. Current user instructions, host rules and task scope win over stage defaults. Map Claude-specific tool names to available equivalents, adapt shell examples to Windows PowerShell, and report an unavailable operation instead of claiming it ran. A stage is a workflow, not permission to install dependencies, publish, send messages or change credentials.

## Frontend and browser testing
Build the interface, then look at what the browser actually did. UI work is only done when the rendered result, the console and the network behavior have been observed, not assumed from the code.

### Stages
| Stage | Use for |
|---|---|
| [frontend-ui-engineering](references/frontend-ui-engineering.md) | Component architecture, state, responsive layout, accessibility and avoiding generic AI-looking output. |
| [browser-testing-with-devtools](references/browser-testing-with-devtools.md) | Inspect and verify in a real browser through Chrome DevTools data; requires a configured DevTools server or an equivalent browser tool. |

### Order
1. Build with the frontend stage; keep accessibility and state coverage in scope from the start.
2. Verify in the browser stage after each meaningful change, not only at the end.
3. Use background `browser_control` or the granted browser tool when the DevTools server is not configured; report the gap when neither exists.

### Origin
Each stage is the full text of a former Skill, retired into this pack. Provenance, upstream pins and the restore path: [merged-from](references/merged-from.md).
