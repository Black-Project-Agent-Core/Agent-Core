# Agent Core desktop UI

React/TypeScript UI for the Agent Core Windows launcher. This is the product UI under `src/ui`, built with Vite and Tailwind; it is not an AI Studio application and needs no Gemini key to build.

## Build and checks

From the Agent Core repository root, with the UI dependencies installed:

```bash
npm ci --prefix src/ui
npm run typecheck --prefix src/ui
npm run test --prefix src/ui
npm run build --prefix src/ui
```

These are available commands, not results from the documentation refresh. The UI package has no `dev` script. Root `npm run build` compiles the Memory subproject and core TypeScript; it does not build this UI.

`vite.config.ts` writes assets to `<PROJECT_ROOT>/dist/ui` with relative asset URLs. The launcher loads that directory through its `https://app.agentcore.local` WebView2 mapping and keeps its profile under `runtime/webview2`. Use the Agent Core launcher for the host-connected application; opening static assets in an ordinary browser does not create a host connection.

## Source map

- `src/App.tsx`: application state and host event/action dispatch, including Native Agent Chat
- `src/host.ts`: typed snapshots, chat messages and the `window.chrome.webview` bridge
- `src/pages.tsx`, `src/components.tsx`: screens and reusable UI
- `src/model.ts`, `src/systems.ts`: status interpretation and subsystem presentation
- `src/App.test.tsx`, `vitest.config.ts`: UI tests and test setup
- `../launcher/MainForm.cs`: WebView2 initialization, local asset mapping and host message handling

Provider configuration and execution belong to the Agent Core host. UI status or a successful frontend build alone does not prove a provider, browser, Memory engine or native runtime is healthy. Product version follows the root `package.json` through the existing release-version sync.
