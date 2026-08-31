# Agent Code UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first premium, Windows-oriented Agent Code desktop shell with one Focused Console screen, local-only interactions, approved branding, and no Super-Runtime or AI backend integration.

**Architecture:** Agent Code is a standalone sibling project under `SubProject/Agent-Code/`. React owns all Milestone-1 state through a small deterministic reducer; presentation is split into focused components and plain CSS tokens; Tauri provides only window metadata, packaging, and icons. No frontend action crosses a native/backend boundary in this milestone.

**Tech Stack:** React 19.2.8, React DOM 19.2.8, TypeScript 7.0.2, Vite 8.2.2, Vitest 4.1.11, Testing Library React 16.3.3, Testing Library User Event 14.6.6, jsdom 30.0.1, Lucide React 1.38.0, Tauri API 2.11.1, Tauri CLI 2.11.4, Rust `tauri` 2.11.5, `tauri-build` 2.6.3, plain CSS custom properties.

**Spec:** `SubProject/Agent-Code/docs/superpowers/specs/2026-09-01-agent-code-ui-foundation-design.md`

## Global Constraints

- Product name is exactly `Agent Code`.
- Target shell is Windows desktop using Tauri + React + Vite + TypeScript.
- Milestone 1 contains one primary window and one primary Focused Console screen.
- Visual system is dark-first, minimal, premium, spacious, and original rather than a clone of Claude Code or Codex.
- No Super-Runtime imports, links, process bridges, commands, sockets, or runtime calls are allowed.
- No LLM/model invocation, agent execution backend, shell/process execution, file agent actions, authentication, cloud account, billing, remote sync, or settings screen is allowed.
- State is local React state only; do not add Redux, Zustand, SQLite, persistence, or backend abstractions.
- The approved command-prompt `>_` mark is the primary small app icon; the approved `AC` monogram is the welcome/splash mark; the orbit/ribbon `A` remains secondary and is not permanently visible in the main workspace.
- Compact UI renders logo symbols as raster assets and renders `Agent Code` as real UI text.
- Main window target is 1280×800 with a supported minimum of 900×620; sidebar target is 240 px expanded and 64 px collapsed.
- Composer placeholder is `Describe a task or ask a question`; empty input cannot submit; a valid submit appends only a local user message and never fabricates an AI response.
- Existing `SubProject/Super-Runtime/` files must remain untouched.
- Existing root `.vscode/` is user-owned/untracked and must remain untouched.

## File Structure

```text
SubProject/Agent-Code/
├── README.md                         # scope, dev/build commands, explicit M1 non-goals
├── package.json                      # pinned frontend/Tauri/test scripts
├── package-lock.json                 # npm dependency lock
├── index.html                        # Vite host page
├── vite.config.ts                    # Vite + React + Vitest configuration
├── tsconfig.json                     # TS project references
├── tsconfig.app.json                 # browser/React compiler options
├── tsconfig.node.json                # Vite/config compiler options
├── .gitignore                        # dist/node_modules/Tauri target artifacts
├── scripts/
│   └── codespace-bootstrap.sh        # install/check project-local build prerequisites
├── src/
│   ├── main.tsx                      # React root entry
│   ├── app/
│   │   ├── AgentCodeApp.tsx          # top-level reducer wiring
│   │   ├── workspace-state.ts        # deterministic local reducer/types
│   │   └── workspace-state.test.ts   # reducer contract tests
│   ├── components/
│   │   ├── AppShell.tsx              # title/sidebar/workspace composition
│   │   ├── Sidebar.tsx               # brand/new/projects/recent/collapse
│   │   ├── Workspace.tsx             # welcome/messages/composer/status
│   │   ├── Composer.tsx              # prompt input and submit affordance
│   │   ├── BrandMark.tsx             # app/monogram/emblem asset variants
│   │   └── AgentCodeApp.test.tsx     # user-visible interaction tests
│   ├── assets/
│   │   └── branding/
│   │       ├── agent-code-app-icon.png
│   │       ├── agent-code-monogram.png
│   │       └── agent-code-emblem.png
│   ├── styles/
│   │   ├── tokens.css                # palette/type/spacing/radius tokens
│   │   └── app.css                   # shell/component layout and states
│   └── test/
│       └── setup.ts                   # jest-dom/Vitest DOM setup
├── src-tauri/
│   ├── Cargo.toml                    # minimal Tauri Rust crate
│   ├── build.rs                      # tauri_build entry
│   ├── tauri.conf.json               # window/build/bundle metadata
│   ├── src/
│   │   └── main.rs                   # minimal native window lifecycle only
│   └── icons/                        # generated Windows/Tauri icon set
├── tests/
│   └── visual/
│       └── focused-console.spec.ts    # three-viewport visual acceptance
└── playwright.config.ts              # screenshot test server/viewports
```

---

### Task 1: Scaffold the testable React/Vite foundation

**Files:**
- Create: `SubProject/Agent-Code/package.json`
- Create: `SubProject/Agent-Code/index.html`
- Create: `SubProject/Agent-Code/vite.config.ts`
- Create: `SubProject/Agent-Code/tsconfig.json`
- Create: `SubProject/Agent-Code/tsconfig.app.json`
- Create: `SubProject/Agent-Code/tsconfig.node.json`
- Create: `SubProject/Agent-Code/.gitignore`
- Create: `SubProject/Agent-Code/src/main.tsx`
- Create: `SubProject/Agent-Code/src/app/AgentCodeApp.tsx`
- Create: `SubProject/Agent-Code/src/components/AgentCodeApp.test.tsx`
- Create: `SubProject/Agent-Code/src/test/setup.ts`
- Create: `SubProject/Agent-Code/README.md`

**Interfaces:**
- Consumes: approved design spec only.
- Produces: `AgentCodeApp(): JSX.Element`, `npm test`, `npm run typecheck`, and `npm run build` as the stable frontend gates later tasks extend.

- [x] **Step 1: Write the package/toolchain files and a failing app smoke test**

Create `package.json` with these exact scripts/dependencies:

```json
{
  "name": "agent-code",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 1420",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "2.11.1",
    "lucide-react": "1.38.0",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.6",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.1.1",
    "@tauri-apps/cli": "2.11.4",
    "jsdom": "30.0.1",
    "typescript": "7.0.2",
    "vite": "8.2.2",
    "vitest": "4.1.11"
  }
}
```

Create `src/components/AgentCodeApp.test.tsx` before `AgentCodeApp.tsx` exists:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentCodeApp } from '../app/AgentCodeApp';

describe('AgentCodeApp', () => {
  it('renders the Agent Code product shell', () => {
    render(<AgentCodeApp />);
    expect(screen.getByRole('application', { name: 'Agent Code' })).toBeInTheDocument();
  });
});
```

Configure Vitest in `vite.config.ts` with `environment: 'jsdom'` and `setupFiles: './src/test/setup.ts'`.

- [x] **Step 2: Install packages and run the smoke test to verify RED**

Run:

```bash
cd SubProject/Agent-Code
npm install
npm test -- src/components/AgentCodeApp.test.tsx
```

Expected: FAIL because `../app/AgentCodeApp` does not exist.

- [x] **Step 3: Add the minimal React entry and shell component**

Create `src/app/AgentCodeApp.tsx`:

```tsx
export function AgentCodeApp() {
  return <main role="application" aria-label="Agent Code">Agent Code</main>;
}
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentCodeApp } from './app/AgentCodeApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentCodeApp />
  </StrictMode>,
);
```

Add `index.html` with a single `<div id="root"></div>`, TypeScript project references, and a `.gitignore` covering `node_modules/`, `dist/`, `src-tauri/target/`, and Playwright output.

- [x] **Step 4: Run initial frontend gates**

Run:

```bash
npm test -- src/components/AgentCodeApp.test.tsx
npm run typecheck
npm run build
```

Expected: test PASS; TypeScript PASS; Vite production build PASS.

- [x] **Step 5: Commit the scaffold**

```bash
git add SubProject/Agent-Code

git commit -m "feat(agent-code): scaffold desktop ui foundation"
```

---

### Task 2: Add deterministic local workspace/session state

**Files:**
- Create: `SubProject/Agent-Code/src/app/workspace-state.ts`
- Create: `SubProject/Agent-Code/src/app/workspace-state.test.ts`

**Interfaces:**
- Consumes: no runtime/backend dependency.
- Produces: `WorkspaceState`, `WorkspaceAction`, `createInitialWorkspaceState()`, and `workspaceReducer(state, action)` used by the application shell.

- [x] **Step 1: Write reducer tests first**

Create `src/app/workspace-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialWorkspaceState, workspaceReducer } from './workspace-state';

describe('workspaceReducer', () => {
  it('creates and selects a fresh local session', () => {
    const state = createInitialWorkspaceState();
    const next = workspaceReducer(state, { type: 'new-session' });
    expect(next.sessions).toHaveLength(3);
    expect(next.activeSessionId).toBe('session-3');
    expect(next.sessions[2].title).toBe('New session');
  });

  it('ignores whitespace-only submission', () => {
    const state = createInitialWorkspaceState();
    const next = workspaceReducer(state, { type: 'submit-message', text: '   ' });
    expect(next).toEqual(state);
  });

  it('appends only a local user message to the active session', () => {
    const state = createInitialWorkspaceState();
    const next = workspaceReducer(state, { type: 'submit-message', text: 'Build a parser' });
    expect(next.sessions[0].messages).toEqual([
      { id: 'message-1', role: 'user', text: 'Build a parser' },
    ]);
  });

  it('toggles sidebar collapse deterministically', () => {
    const state = createInitialWorkspaceState();
    expect(workspaceReducer(state, { type: 'toggle-sidebar' }).sidebarCollapsed).toBe(true);
  });
});
```

- [x] **Step 2: Run reducer tests to verify RED**

Run:

```bash
npm test -- src/app/workspace-state.test.ts
```

Expected: FAIL because `workspace-state.ts` does not exist.

- [x] **Step 3: Implement the reducer and exact data model**

Create `src/app/workspace-state.ts` with these public types:

```ts
export type LocalMessage = {
  id: string;
  role: 'user';
  text: string;
};

export type LocalSession = {
  id: string;
  title: string;
  messages: LocalMessage[];
};

export type WorkspaceState = {
  projectName: 'Agent Code';
  sessions: LocalSession[];
  activeSessionId: string;
  sidebarCollapsed: boolean;
  nextSessionNumber: number;
  nextMessageNumber: number;
};

export type WorkspaceAction =
  | { type: 'new-session' }
  | { type: 'select-session'; sessionId: string }
  | { type: 'submit-message'; text: string }
  | { type: 'toggle-sidebar' };
```

`createInitialWorkspaceState()` must seed exactly `session-1` (`General coding session`) and `session-2` (`Design system review`), select `session-1`, and initialize counters at 3 and 1. `submit-message` trims text and updates only the active session; unknown session selection returns the existing state unchanged.

- [x] **Step 4: Run reducer tests**

```bash
npm test -- src/app/workspace-state.test.ts
```

Expected: 4 tests PASS.

- [x] **Step 5: Commit deterministic local state**

```bash
git add SubProject/Agent-Code/src/app/workspace-state.ts SubProject/Agent-Code/src/app/workspace-state.test.ts

git commit -m "feat(agent-code): add local workspace state"
```

---

### Task 3: Build the Focused Console layout and visual token system

**Files:**
- Create: `SubProject/Agent-Code/src/components/AppShell.tsx`
- Create: `SubProject/Agent-Code/src/components/Sidebar.tsx`
- Create: `SubProject/Agent-Code/src/components/Workspace.tsx`
- Create: `SubProject/Agent-Code/src/components/Composer.tsx`
- Create: `SubProject/Agent-Code/src/styles/tokens.css`
- Create: `SubProject/Agent-Code/src/styles/app.css`
- Modify: `SubProject/Agent-Code/src/app/AgentCodeApp.tsx`
- Modify: `SubProject/Agent-Code/src/components/AgentCodeApp.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceState` and callback props only; no Tauri API calls.
- Produces: semantic shell regions with stable labels used by interaction and visual tests.

- [x] **Step 1: Extend component test with shell hierarchy expectations**

Add to `AgentCodeApp.test.tsx`:

```tsx
it('renders the focused console hierarchy without dashboard cards', () => {
  render(<AgentCodeApp />);
  expect(screen.getByRole('button', { name: 'New session' })).toBeInTheDocument();
  expect(screen.getByText('PROJECTS')).toBeInTheDocument();
  expect(screen.getByText('RECENT')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'What are we building?' })).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Describe a task or ask a question')).toBeInTheDocument();
  expect(screen.queryByText(/sessions|tokens|streak|statistics/i)).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run the shell test to verify RED**

```bash
npm test -- src/components/AgentCodeApp.test.tsx
```

Expected: FAIL on missing New/session/sidebar/workspace elements.

- [x] **Step 3: Implement semantic layout components**

Create components with these boundaries:

```tsx
// AppShell.tsx
export type AppShellProps = {
  sidebar: React.ReactNode;
  workspace: React.ReactNode;
  collapsed: boolean;
};
```

```tsx
// Sidebar.tsx
export type SidebarProps = {
  sessions: LocalSession[];
  activeSessionId: string;
  collapsed: boolean;
  onNewSession(): void;
  onSelectSession(sessionId: string): void;
  onToggleCollapse(): void;
};
```

```tsx
// Composer.tsx
export type ComposerProps = {
  onSubmit(text: string): void;
};
```

```tsx
// Workspace.tsx
export type WorkspaceProps = {
  session: LocalSession;
  onSubmit(text: string): void;
};
```

Use Lucide icons (`Plus`, `PanelLeftClose`, `PanelLeftOpen`, `ArrowUp`, `Folder`, `MessageSquare`) only as subtle functional glyphs.

- [x] **Step 4: Implement exact CSS token baseline**

Create `tokens.css` with these first-release values:

```css
:root {
  color-scheme: dark;
  --bg-canvas: #111214;
  --bg-sidebar: #161719;
  --bg-elevated: #1c1d20;
  --bg-hover: #222428;
  --text-primary: #f1f1ef;
  --text-secondary: #8f9298;
  --text-tertiary: #666a71;
  --border-subtle: #292b2f;
  --border-strong: #363940;
  --accent: #56b9ff;
  --accent-strong: #278cff;
  --sidebar-expanded: 240px;
  --sidebar-collapsed: 64px;
  --radius-item: 8px;
  --radius-composer: 14px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  font-family: "Segoe UI Variable Text", "Segoe UI", Inter, system-ui, sans-serif;
}
```

`app.css` must use CSS Grid for `AppShell`, animate only sidebar width/opacity/transform, prevent horizontal overflow, and keep the composer centered with `width: min(760px, calc(100% - 48px))`.

- [x] **Step 5: Run component/build gates**

```bash
npm test -- src/components/AgentCodeApp.test.tsx
npm run typecheck
npm run build
```

Expected: PASS.

- [x] **Step 6: Commit the Focused Console shell**

```bash
git add SubProject/Agent-Code/src

git commit -m "feat(agent-code): build focused console shell"
```

---

### Task 4: Integrate the approved three-logo identity hierarchy

**Files:**
- Create: `SubProject/Agent-Code/src/assets/branding/agent-code-app-icon.png`
- Create: `SubProject/Agent-Code/src/assets/branding/agent-code-monogram.png`
- Create: `SubProject/Agent-Code/src/assets/branding/agent-code-emblem.png`
- Create: `SubProject/Agent-Code/src/components/BrandMark.tsx`
- Modify: `SubProject/Agent-Code/src/components/Sidebar.tsx`
- Modify: `SubProject/Agent-Code/src/components/Workspace.tsx`
- Modify: `SubProject/Agent-Code/src/components/AgentCodeApp.test.tsx`

**Interfaces:**
- Consumes: the three user-approved PNG assets supplied in the conversation: AC/code monogram → `agent-code-monogram.png`; command-prompt `>_` icon → `agent-code-app-icon.png`; orbit/ribbon A → `agent-code-emblem.png`.
- Produces: `BrandMark({ variant, className? })`, where `variant` is `'app' | 'monogram' | 'emblem'`.

- [x] **Step 1: Add a failing branding hierarchy test**

```tsx
it('uses the prompt mark in the sidebar and the monogram in the welcome state', () => {
  render(<AgentCodeApp />);
  expect(screen.getByRole('img', { name: 'Agent Code app icon' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Agent Code monogram' })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'Agent Code premium emblem' })).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run test to verify RED**

```bash
npm test -- src/components/AgentCodeApp.test.tsx
```

Expected: FAIL because branding assets/component are absent.

- [x] **Step 3: Transfer the approved assets and implement `BrandMark`**

Map the user-approved raster sources exactly as defined in **Interfaces**. Preserve alpha; do not bake a black rectangle behind the artwork. Implement:

```tsx
const marks = {
  app: { src: appIcon, alt: 'Agent Code app icon' },
  monogram: { src: monogram, alt: 'Agent Code monogram' },
  emblem: { src: emblem, alt: 'Agent Code premium emblem' },
} as const;

export function BrandMark({ variant, className }: BrandMarkProps) {
  const mark = marks[variant];
  return <img src={mark.src} alt={mark.alt} className={className} draggable={false} />;
}
```

Use the app mark at 24×24 in the sidebar brand row and the monogram at 52×52 in the welcome state. Do not render the emblem in the permanent workspace.

- [x] **Step 4: Run branding/component/build gates**

```bash
npm test -- src/components/AgentCodeApp.test.tsx
npm run build
```

Expected: PASS and imported image assets emitted by Vite.

- [x] **Step 5: Commit branding**

```bash
git add SubProject/Agent-Code/src/assets SubProject/Agent-Code/src/components

git commit -m "feat(agent-code): integrate product branding"
```

---

### Task 5: Wire local-only interaction behavior end to end

**Files:**
- Modify: `SubProject/Agent-Code/src/app/AgentCodeApp.tsx`
- Modify: `SubProject/Agent-Code/src/components/Sidebar.tsx`
- Modify: `SubProject/Agent-Code/src/components/Workspace.tsx`
- Modify: `SubProject/Agent-Code/src/components/Composer.tsx`
- Modify: `SubProject/Agent-Code/src/components/AgentCodeApp.test.tsx`
- Modify: `SubProject/Agent-Code/src/styles/app.css`

**Interfaces:**
- Consumes: `workspaceReducer`, reducer actions, shell components.
- Produces: complete M1 UI behavior without any AI/backend response path.

- [x] **Step 1: Add interaction tests before wiring state**

Add these tests:

```tsx
it('does not submit an empty composer', async () => {
  const user = userEvent.setup();
  render(<AgentCodeApp />);
  await user.click(screen.getByRole('button', { name: 'Submit prompt' }));
  expect(screen.queryByTestId('local-message')).not.toBeInTheDocument();
});

it('shows a submitted local user message and no AI response', async () => {
  const user = userEvent.setup();
  render(<AgentCodeApp />);
  const composer = screen.getByPlaceholderText('Describe a task or ask a question');
  await user.type(composer, 'Build a clean command palette');
  await user.keyboard('{Enter}');
  expect(screen.getByText('Build a clean command palette')).toHaveAttribute('data-testid', 'local-message');
  expect(screen.queryByText(/assistant response|thinking|generated/i)).not.toBeInTheDocument();
  expect(composer).toHaveValue('');
});

it('creates a fresh local session and can select an existing session', async () => {
  const user = userEvent.setup();
  render(<AgentCodeApp />);
  await user.click(screen.getByRole('button', { name: 'New session' }));
  expect(screen.getByRole('button', { name: 'New session, selected' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'General coding session' }));
  expect(screen.getByRole('button', { name: 'General coding session, selected' })).toBeInTheDocument();
});

it('collapses and expands the sidebar without removing accessible navigation', async () => {
  const user = userEvent.setup();
  render(<AgentCodeApp />);
  await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
  expect(screen.getByRole('navigation', { name: 'Agent Code workspace' })).toHaveAttribute('data-collapsed', 'true');
  await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
  expect(screen.getByRole('navigation', { name: 'Agent Code workspace' })).toHaveAttribute('data-collapsed', 'false');
});
```

- [x] **Step 2: Run interaction suite to verify RED**

```bash
npm test -- src/components/AgentCodeApp.test.tsx
```

Expected: FAIL on unimplemented reducer wiring/accessibility states.

- [x] **Step 3: Wire reducer actions and composer keyboard behavior**

`AgentCodeApp` must use:

```tsx
const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialWorkspaceState);
```

`Composer` owns only transient textarea text. Enter submits unless Shift is held; Shift+Enter inserts a newline. `Submit prompt` is disabled for `value.trim().length === 0`. On valid submit it calls `onSubmit(value)`, then clears local input. No timer, mock assistant object, fake response, or backend call is allowed.

- [x] **Step 4: Add selected/hover/focus visual states**

Use `aria-current="page"` for the selected session, `:focus-visible` with a 2 px low-glow accent outline, and a subtle `--bg-hover` selected surface. Collapsed sidebar keeps icons and accessible names while visually hiding labels with CSS rather than removing navigation semantics.

- [x] **Step 5: Run all frontend tests and build**

```bash
npm test
npm run typecheck
npm run build
```

Expected: reducer + UI tests PASS; build PASS.

- [x] **Step 6: Commit complete local interactions**

```bash
git add SubProject/Agent-Code/src

git commit -m "feat(agent-code): add local console interactions"
```

---

### Task 6: Add the minimal Tauri Windows desktop shell and generated icons

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/Cargo.toml`
- Create: `SubProject/Agent-Code/src-tauri/build.rs`
- Create: `SubProject/Agent-Code/src-tauri/src/main.rs`
- Create: `SubProject/Agent-Code/src-tauri/tauri.conf.json`
- Create: `SubProject/Agent-Code/src-tauri/icons/*`
- Create: `SubProject/Agent-Code/scripts/codespace-bootstrap.sh`
- Modify: `SubProject/Agent-Code/package.json`
- Modify: `SubProject/Agent-Code/README.md`

**Interfaces:**
- Consumes: built Vite frontend and primary app-icon PNG.
- Produces: a Tauri 2 desktop shell with native window lifecycle only; no commands exposed to React.

- [x] **Step 1: Add a static Tauri contract test script before config exists**

Add `scripts/check-tauri-contract.mjs` and package script `test:tauri-contract` that loads `src-tauri/tauri.conf.json` and asserts:

```js
assert.equal(config.productName, 'Agent Code');
assert.equal(config.identifier, 'com.pitchlook.agentcode');
assert.equal(config.app.windows.length, 1);
assert.equal(config.app.windows[0].width, 1280);
assert.equal(config.app.windows[0].height, 800);
assert.equal(config.app.windows[0].minWidth, 900);
assert.equal(config.app.windows[0].minHeight, 620);
assert.equal(config.app.windows[0].resizable, true);
assert.equal(config.app.windows[0].decorations, true);
assert.equal(config.build.frontendDist, '../dist');
```

- [x] **Step 2: Run contract test to verify RED**

```bash
npm run test:tauri-contract
```

Expected: FAIL because `src-tauri/tauri.conf.json` does not exist.

- [x] **Step 3: Create the minimal native crate and exact Tauri config**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "agent-code"
version = "0.1.0"
description = "Agent Code desktop shell"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.6.3", features = [] }

[dependencies]
tauri = { version = "2.11.5", features = [] }
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

Create `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Agent Code");
}
```

Create `src-tauri/tauri.conf.json` with:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Agent Code",
  "version": "0.1.0",
  "identifier": "com.pitchlook.agentcode",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Agent Code",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 620,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "center": true
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico",
      "icons/icon.png"
    ]
  }
}
```

- [x] **Step 4: Generate native icon variants from the approved app mark**

Run from `SubProject/Agent-Code`:

```bash
npx tauri icon src/assets/branding/agent-code-app-icon.png --output src-tauri/icons
```

Verify `src-tauri/icons/icon.ico` exists and the generated PNG sizes are non-zero.

- [x] **Step 5: Add a project-local Codespace bootstrap for missing Rust**

Create `scripts/codespace-bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
source "$HOME/.cargo/env"
rustup toolchain install stable --profile minimal
rustup default stable
npm ci
```

This records the setup path rather than relying on a one-off manual Rust install.

- [x] **Step 6: Run Tauri contract and native metadata checks**

Run:

```bash
npm run test:tauri-contract
bash scripts/codespace-bootstrap.sh
source "$HOME/.cargo/env"
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 --no-deps >/dev/null
npx tauri info
```

Expected: contract PASS; Cargo metadata PASS; Tauri sees the frontend and Rust toolchain. A Windows `.exe` bundle is not claimed from the Linux Codespace; actual Windows packaging remains a later Windows-host verification step.

- [x] **Step 7: Commit the desktop shell**

```bash
git add SubProject/Agent-Code/src-tauri SubProject/Agent-Code/scripts SubProject/Agent-Code/package.json SubProject/Agent-Code/package-lock.json SubProject/Agent-Code/README.md

git commit -m "feat(agent-code): add tauri desktop shell"
```

---

### Task 7: Add visual acceptance tests and close Milestone-1 verification

**Files:**
- Create: `SubProject/Agent-Code/playwright.config.ts`
- Create: `SubProject/Agent-Code/tests/visual/focused-console.spec.ts`
- Modify: `SubProject/Agent-Code/package.json`
- Modify: `SubProject/Agent-Code/scripts/codespace-bootstrap.sh`
- Modify: `SubProject/Agent-Code/README.md`

**Interfaces:**
- Consumes: final local Vite UI.
- Produces: screenshot evidence at 1280×800, 1440×900, and 980×680 plus final build/test gate.

- [ ] **Step 1: Add Playwright dependency/script and the failing visual test**

Add devDependency `@playwright/test` at the current resolved npm version and scripts:

```json
{
  "test:visual": "playwright test",
  "preview": "vite preview --host 127.0.0.1 --port 4173"
}
```

Create `tests/visual/focused-console.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const viewports = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '980x680', width: 980, height: 680 },
];

for (const viewport of viewports) {
  test(`focused console ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What are we building?' })).toBeVisible();
    await expect(page.getByPlaceholder('Describe a task or ask a question')).toBeVisible();
    await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    await expect(page).toHaveScreenshot(`focused-console-${viewport.name}.png`, {
      fullPage: true,
      animations: 'disabled'
    });
  });
}
```

- [ ] **Step 2: Run visual test before baselines to verify RED**

```bash
npm run build
npm run test:visual
```

Expected: FAIL because approved screenshot baselines do not exist yet.

- [ ] **Step 3: Configure Playwright preview server and install Chromium reproducibly**

Create `playwright.config.ts` with `webServer.command = 'npm run preview'`, `webServer.url = 'http://127.0.0.1:4173'`, `use.baseURL` matching that URL, and Chromium only. Extend `scripts/codespace-bootstrap.sh` with:

```bash
npx playwright install chromium
```

Then generate first baselines:

```bash
npm run test:visual -- --update-snapshots
```

- [ ] **Step 4: Manually inspect the three generated screenshots against the approved direction**

Reject the baseline and adjust CSS if any of these are true: horizontal overflow; sidebar hierarchy is cramped; composer is not the dominant control; greeting/monogram is oversized; app mark appears blurry/boxed; workspace contains dashboard-like clutter; minimum viewport hides submit/navigation controls. After any CSS change, rerun unit tests and regenerate only changed snapshots.

- [ ] **Step 5: Run the complete Agent Code release gate**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:tauri-contract
npm run test:visual
source "$HOME/.cargo/env"
cargo metadata --manifest-path src-tauri/Cargo.toml --format-version 1 --no-deps >/dev/null
git diff --check
```

Expected: all gates PASS.

Also assert scope isolation:

```bash
! grep -RniE 'Super-Runtime|llama\.cpp|GGML|invoke\(|Command::new|std::process|@tauri-apps/plugin-shell' \
  src src-tauri/src package.json
```

Expected: exit 0 because no forbidden backend/runtime integration exists in Milestone 1.

- [ ] **Step 6: Verify Super-Runtime is untouched by this implementation range**

Use the design commit as the diff base and run:

```bash
git diff --name-only be6b525..HEAD -- SubProject/Super-Runtime
```

Expected: no output.

- [ ] **Step 7: Finalize README and commit Milestone-1 UI foundation**

README must document: product purpose; `npm run dev`; `npm test`; `npm run build`; `npm run test:visual`; project-local Codespace bootstrap; Tauri shell scope; Linux Codespace cannot truthfully certify a Windows `.exe`; and explicit statement that Super-Runtime/AI integration is absent by design in Milestone 1.

Commit:

```bash
git add SubProject/Agent-Code

git commit -m "test(agent-code): certify ui foundation"
```

---

## Final Milestone-1 Acceptance

Implementation is accepted only when all of the following are simultaneously true:

```text
React/Vitest unit suite                        PASS
TypeScript                                    PASS
Vite production build                         PASS
Tauri static contract                         PASS
Cargo metadata / Tauri environment             PASS
Playwright 1280x800                            PASS
Playwright 1440x900                            PASS
Playwright 980x680                             PASS
No horizontal overflow                         PASS
Local New/session/composer behavior             PASS
Empty prompt refusal                            PASS
No synthetic AI response                       PASS
Command-prompt app mark hierarchy               PASS
AC welcome mark hierarchy                       PASS
Premium emblem absent from permanent workspace  PASS
Super-Runtime diff                              EMPTY
Forbidden backend/runtime integration scan      CLEAN
git diff --check                               PASS
```

A Windows-native `.exe` packaging run is intentionally not fabricated from Linux Codespace. The Milestone-1 source/configuration is Windows-oriented and Tauri-ready; actual Windows package execution can be certified later when a Windows build host/Agent Core endpoint is available.
