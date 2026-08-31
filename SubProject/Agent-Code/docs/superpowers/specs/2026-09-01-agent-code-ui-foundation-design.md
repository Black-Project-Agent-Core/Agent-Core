# Agent Code UI Foundation — Design Spec

Date: 2026-09-01
Status: Proposed / awaiting user review
Scope: Milestone 1 — premium desktop UI shell only

## 1. Product intent

Agent Code is a new desktop coding-agent application that will live beside Super-Runtime under `SubProject/Agent-Code/`.

The first milestone is intentionally visual and interaction-first. It must feel like a polished modern coding-agent product without yet connecting to Super-Runtime, an LLM, an agent executor, remote services, or any production backend.

The design direction is inspired by the restraint and workflow clarity of modern tools such as Claude Code and Codex, while remaining visually original.

## 2. Frozen milestone constraints

- Product name: `Agent Code`.
- Target shell: Windows desktop.
- Desktop stack: Tauri + React + Vite + TypeScript.
- One primary application window only.
- One primary screen only for this milestone.
- Dark-first visual system.
- Minimal, premium, spacious UI.
- No Super-Runtime integration in Milestone 1.
- No LLM/model invocation.
- No agent execution backend.
- No authentication, cloud account, billing, telemetry service, or remote sync.
- No settings screen yet.
- No dashboard/statistics cards.
- No feature-heavy IDE/editor surface yet.

## 3. Recommended product form

### Focused Console

The application uses a restrained two-column shell:

```text
┌──────────────────────────────────────────────────────────────┐
│ >_  Agent Code                                  —  □  ×     │
├────────────────┬─────────────────────────────────────────────┤
│ + New          │                                             │
│                │                    [AC]                     │
│ PROJECTS       │                                             │
│ ○ Agent Code   │              What are we building?          │
│                │                                             │
│ RECENT         │                                             │
│ ○ Session 01   │                                             │
│ ○ Session 02   │                                             │
│                │                                             │
│                │        ┌───────────────────────────┐        │
│                │        │ Describe a task...        │        │
│                │        │                      ↵    │        │
│                │        └───────────────────────────┘        │
│                │             Local  •  Ready                 │
└────────────────┴─────────────────────────────────────────────┘
```

The empty space is intentional. The composer is the dominant interactive element, not a dashboard.

## 4. Window and layout

### Window

- Windows desktop application window with native Tauri shell.
- Recommended initial size: approximately 1280 × 800 px.
- Minimum size should preserve composer usability and sidebar hierarchy.
- Resizable.
- Custom visual chrome may be introduced only if it remains stable and does not compromise native window behavior.

### Sidebar

- Width target: 232–248 px.
- Slightly lighter than the main canvas.
- Contains:
  - Agent Code brand mark and name.
  - `New` action.
  - Projects section.
  - Recent sessions section.
- Supports collapse to a narrow icon rail.
- Selection, hover, and focus states remain subtle.

### Main canvas

- Large quiet central workspace.
- Welcome mark near the visual center but slightly above composer balance.
- Greeting: `What are we building?`
- No permanent cards, graphs, statistics, or onboarding clutter.

### Composer

- Anchored near the lower central area rather than hard against the window edge.
- Wide rounded container.
- Placeholder: `Describe a task or ask a question` or shortened `Describe a task...` depending on final width.
- Enter/submit affordance at the right.
- Keyboard focus ring must be visible but understated.

## 5. Branding system

The three approved Agent Code logos are treated as one identity family, not competing alternatives.

### Primary app icon — command prompt `>_`

Use for:

- Windows desktop shortcut.
- `.exe` application icon.
- taskbar icon.
- installer icon.
- small titlebar/sidebar brand mark.

This mark is the most legible at 16–32 px.

### Primary large brand mark — `AC` monogram

Use for:

- Welcome state.
- Splash screen.
- Larger product branding.

In the main screen it should appear around 48–56 px, never as a large poster graphic.

### Secondary premium emblem — orbit/ribbon `A`

Use later for:

- About surface.
- installer/release artwork.
- marketing imagery.
- optional splash/release branding.

It should not remain permanently visible in the Milestone-1 main workspace.

### Asset rule

Do not use the full raster wordmark everywhere. In compact UI surfaces, use the symbol as an image and render `Agent Code` as native UI text so scaling remains crisp across Windows display scaling levels.

## 6. Visual system

### Palette

Dark-first, near-neutral palette with one cool accent family.

Suggested token direction:

- `bg.canvas`: near-black / charcoal.
- `bg.sidebar`: one step lighter than canvas.
- `bg.elevated`: subtle raised surface for composer/selection.
- `text.primary`: warm/off white.
- `text.secondary`: muted neutral gray.
- `border.subtle`: low-contrast graphite.
- `accent.primary`: restrained cyan-to-blue family inspired by the approved logos.

The UI must not rely on large gradients. Logo gradients may remain inside logo artwork, while the application shell stays mostly flat and quiet.

### Typography

Use a modern, highly legible sans-serif system.

Preferred implementation direction:

- Inter or a similar open, crisp UI sans-serif if bundled appropriately.
- Native fallback stack available for Windows.
- Headings medium/semibold, never overly heavy.
- Body/session labels regular/medium.
- UI labels compact and low-contrast where secondary.

### Spacing

- Base rhythm: 4 px.
- Primary spacing steps: 8 / 12 / 16 / 24 / 32 px.
- Main canvas deliberately uses larger negative space.
- Borders and dividers are sparse.

### Radius

- Sidebar items: 7–9 px.
- Composer: approximately 12–14 px.
- Avoid excessive pill shapes.

## 7. Milestone-1 interactions

The following interactions should work without any AI backend:

1. Collapse/expand sidebar.
2. Select a project/session item.
3. Press `New` to create/select a local mock session.
4. Type into the composer.
5. Submit composer text.
6. Submitted text appears as a local dummy conversation/message state only.
7. Empty composer cannot submit.
8. Basic keyboard focus/navigation works.
9. Window resize preserves layout.

No fake AI response should be generated. The local submit action exists only to validate interaction rhythm and future conversation layout.

## 8. Component architecture

Keep Milestone 1 intentionally small.

Suggested frontend boundaries:

```text
AppShell
├── TitleBar / Brand
├── Sidebar
│   ├── NewSessionButton
│   ├── ProjectList
│   └── RecentSessionList
└── Workspace
    ├── WelcomeState
    ├── ConversationPreview
    ├── Composer
    └── RuntimeStatus
```

State remains local React state for this milestone. Do not introduce Redux, Zustand, database persistence, or backend abstractions yet unless implementation evidence demonstrates a real need.

## 9. Tauri boundary

Tauri exists only to provide the Windows desktop shell in this milestone.

Allowed Tauri responsibilities:

- application window creation.
- icon/application metadata.
- build/package configuration.
- safe native window lifecycle.

Not allowed yet:

- Super-Runtime bridge.
- command execution.
- filesystem agent actions.
- shell/process invocation.
- model lifecycle.
- credential storage.

This keeps the initial desktop boundary intentionally boring and stable.

## 10. Data flow

Milestone-1 data flow is entirely local UI state:

```text
User selects New/session
        ↓
React local state
        ↓
Workspace updates

User types prompt
        ↓
Composer local state
        ↓
Submit validation
        ↓
Append local mock user message
        ↓
Clear composer
```

No request crosses into Super-Runtime or an external service.

## 11. Error and empty states

Because there is no backend yet, error handling is deliberately limited:

- Empty submit: ignored or visually disabled.
- Asset failure: graceful text/icon fallback where possible.
- Unsupported narrow window: maintain minimum window dimensions rather than letting layout collapse.
- Tauri startup failure is treated as application-level failure, not masked by fake UI state.

Do not add synthetic network/model errors before those systems exist.

## 12. Testing strategy

Milestone-1 quality gates:

### Frontend unit/component tests

- composer does not submit empty text.
- valid local prompt becomes a visible local message.
- `New` creates/selects a fresh mock session.
- sidebar collapse state changes layout classes/state correctly.
- selected session highlighting is deterministic.

### Build checks

- TypeScript build succeeds.
- Vite production build succeeds.
- Tauri configuration validates/builds in supported environment.

### Visual acceptance

The UI should be reviewed at approximately:

- 1280 × 800.
- 1440 × 900.
- a narrower supported desktop size.

Acceptance criteria:

- no horizontal overflow.
- composer remains visually dominant.
- sidebar hierarchy remains readable.
- welcome state stays visually balanced.
- logos remain sharp and not oversized.
- no unnecessary visual clutter.

## 13. Proposed repository structure

After this design is approved and implementation begins:

```text
SubProject/Agent-Code/
├── README.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── app/
│   ├── components/
│   ├── assets/
│   │   └── branding/
│   ├── styles/
│   └── main.tsx
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/
│   └── src/
└── tests/
```

Brand assets are stored under Agent Code only. Super-Runtime remains untouched.

## 14. Explicit non-goals

Not part of this milestone:

- Super-Runtime integration.
- llama.cpp/GGML invocation.
- real coding agent execution.
- terminal/process execution.
- file explorer/editor implementation.
- Git integration.
- model picker.
- settings page.
- authentication.
- cloud sync.
- multi-agent orchestration.
- plugin/extension system.
- production persistence.

## 15. Milestone-1 completion definition

Milestone 1 is complete when:

- Agent Code launches as a Windows-oriented Tauri desktop shell.
- The one-screen Focused Console UI matches the approved direction.
- approved branding is integrated in the intended hierarchy.
- sidebar, New/session selection, composer, and local dummy-message behavior work.
- responsive desktop resizing is stable.
- frontend/build tests pass.
- no Super-Runtime or AI backend integration exists yet.

The next milestone may then define the first backend boundary deliberately rather than retrofitting it into an unstable interface.
