# Agent Core Reference UI Parity Plan

> **Status:** COMPLETE — IMPLEMENTED — BUILT — LIVE-ACTIVATED — SIX-ROUTE SIDE-BY-SIDE VISUAL REVIEW COMPLETE. Numerical pixel-diff identity is intentionally not claimed because live runtime values may differ from static reference samples.
> **Created:** 2026-09-24; execution closed 2026-09-24.
> **Goal:** rebuild the active Agent Core desktop UI so its visual composition follows the six approved screenshots while preserving current Agent Core runtime truth, security boundaries, WebView2 ownership, and live data.
> **Scope authority:** sections 1–21 retain the approved implementation specification; section 22 records the achieved live state and its verification boundary.

## 1. Approved visual references

The six local screenshots are the sole visual authority for this redesign:

| Screen | Reference | Native dimensions |
| --- | --- | ---: |
| Dashboard | `docs/UI Agent Core/Dashboard.png` | 1536 × 1024 |
| Core Runtime | `docs/UI Agent Core/Core Runtime.png` | 1672 × 941 |
| Systems | `docs/UI Agent Core/Systems.png` | 1672 × 941 |
| Activity Log | `docs/UI Agent Core/Activity log.png` | 1536 × 1024 |
| Diagnostics | `docs/UI Agent Core/Diagnostics.png` | 1536 × 1024 |
| Settings | `docs/UI Agent Core/Settings.png` | 1536 × 1024 |

“Identical” in this plan means the implementation must reproduce the **visual system, hierarchy, spacing, dimensions, density, navigation placement, card composition, icon treatment, color/state language, controls, tables, overlays, and page-specific proportions** shown in those references.

It does **not** mean hardcoding stale sample values from the images. PID, uptime, version, health counts, timestamps, issue counts, ports, provider states, device names, log rows, and diagnostics must come from current Agent Core state.

## 2. Current implementation baseline

Current production ownership remains:

- `src/ui/src/App.tsx` — current single-screen React surface.
- `src/ui/src/index.css` — global Tailwind/base styling.
- `src/ui/src/host.ts` — WebView2 message contract.
- `src/launcher/MainForm.cs` — native WebView2 host and window.
- `src/launcher/AgentCoreRuntime.cs` — launcher lifecycle/actions/status.
- `src/launcher/DesktopStatus.cs` — current compact desktop status mapping.
- `src/launcher/ActivityJournal.cs` — session-visible activity source.
- Node `/health` — authoritative subsystem health.

Current UI is a compact one-page control/status surface. The target requires a reusable application shell plus six routed pages and richer read-only host snapshots. No second desktop app, browser server, Electron/Tauri runtime, or alternate backend is needed.

## 3. Visual system — global parity contract

### 3.1 Window and canvas

Reference behavior must be matched at both captured viewport families:

- Canonical desktop viewport A: **1536 × 1024**.
- Canonical desktop viewport B: **1672 × 941**.
- Existing minimum launcher size remains a compatibility boundary until implementation proves a smaller layout.
- At canonical sizes, no page may look “mobile”, stretched, oversized, or sparse.
- Main page density must remain high and workstation-like, matching the references.

The native title bar must use Windows dark chrome so the topmost caption area does not remain light while the app is dark. Preserve native minimize/maximize/close semantics; do not invent a custom window manager unless dark native DWM styling cannot achieve the reference.

### 3.2 Shared geometry

Implementation target geometry at canonical scale:

- Native title bar: approximately **30–32 px**.
- App header/topbar below title bar: approximately **80–86 px**.
- Persistent left sidebar: approximately **224–236 px**.
- Main content outer gutter: **16–24 px**.
- Standard card gap: **10–16 px**.
- Main card radius: **10–12 px**.
- Compact control radius: **7–10 px**.
- Border: **1 px**, low-contrast blue/navy.
- Active navigation item: approximately **44–48 px** high with a bright cyan left rail.
- Standard control/input height: approximately **40–44 px**.
- Large primary action height: approximately **46–50 px**.
- System status card height: approximately **112–132 px** depending page density.

### 3.3 Palette

Use a centralized token layer, not scattered ad-hoc Tailwind literals. Initial parity targets from the references:

- App background: near **#06101B / #07111D**.
- Header/sidebar background: near **#06101B–#081522**.
- Panel background: near **#081827 / #091B2B**.
- Elevated/selected panel: near **#0A2034 / #0B2945**.
- Border: near **#14324A / #19425F**.
- Primary cyan: near **#00A8FF / #0AA7FF**.
- Active blue fill: near **#07477C / #075995**.
- Primary text: **#F4F8FC**.
- Secondary text: near **#B6C7D9**.
- Muted text: near **#7F98B2**.
- Healthy: near **#00E58B**.
- Warning/degraded: near **#FFB000**.
- Error: near **#FF4C5E**.
- Offline: near **#7D95AF**.
- Learning accent: violet/purple, near **#9D59FF**.

Status colors must have the same semantic meaning on every page. “Healthy” may not render amber on one screen and green on another.

### 3.4 Typography and iconography

Retain the existing **Plus Jakarta Sans** stack unless a parity check proves a different installed-safe font is required.

Target hierarchy:

- Page title: **28–34 px**, weight 700.
- Major card title: **17–20 px**, weight 650–700.
- System/card title: **14–16 px**, weight 650–700.
- Body: **12–14 px**, weight 400–500.
- Small metadata: **10–12 px**.
- Numeric KPI: **20–26 px**, weight 650–750.

Retain Lucide React. Icons use consistent 18/20/24 px sizes, with larger 32–48 px feature icons inside tinted icon wells. Do not mix icon styles or stroke weights.

## 4. Shared application shell

Every page must reuse one shell so page transitions do not cause visual drift.

### 4.1 Topbar

Left brand block:

- Round Agent Core logo, approximately 46–52 px.
- “AGENT CORE” in bold uppercase.
- Version badge immediately to the right of the product name.
- Subtitle: “Local AI Runtime · Your Machine. Your AI Partner.”
- Alignment and vertical rhythm must match all six references.

Center:

- Large search field with search icon.
- Context-aware placeholder:
  - Dashboard/Core Runtime: “Search systems, components, logs...”
  - Systems: “Search systems, components, dependencies...”
  - Activity Log/Diagnostics: include logs/commands.
  - Settings: include settings/components.
- Right-aligned keyboard badge “Ctrl + K”.
- Search may initially be local navigation/filter command-palette behavior; it must not fabricate remote search capability.

Right:

- Green ONLINE pill with status dot.
- Date/time block on two lines.
- Circular user/initial badge.
- Settings gear.
- Maintain the exact horizontal separation/dividers shown in references.

### 4.2 Left sidebar

Primary navigation, always in this order:

1. Dashboard
2. Core Runtime
3. Systems
4. Activity Log
5. Diagnostics
6. Settings

Active page treatment:

- Blue/cyan filled rounded row.
- Bright cyan vertical rail at far left.
- White active text/icon.
- Non-active items transparent with muted blue-white text.

Below a separator: page-sensitive Quick Actions. The sidebar bottom contains the compact Agent Core process card with green status dot, Running state, PID, uptime, and version.

The bottom process card is not decorative sample data. It must reflect the actual launcher/Core process snapshot.

### 4.3 Panel language

All pages use:

- dark navy panels;
- thin blue borders;
- faint inner/elevation contrast, not large drop shadows;
- status pills with tinted translucent backgrounds;
- cyan outline/focus states;
- hover = slight border/fill lift only;
- no white cards;
- no large gradients that are absent from the references;
- no glass blur unless it is visually indistinguishable from the screenshot.

### 4.4 Shared status components

Create one shared semantic model:

`healthy | degraded | warning | error | offline | unknown`

and one visual mapper for:

- status dot;
- pill;
- icon well;
- count badge;
- border tint;
- selected row tint.

“Degraded” and “Warning” remain visually amber but may keep distinct labels where the reference does.

## 5. Screen parity specification — Dashboard

Reference: `Dashboard.png`.

### 5.1 Hero/status strip

Main content begins with a large “System Dashboard” panel.

Left:

- Page title “System Dashboard”.
- One-line subtitle: monitoring/managing internal systems.

Top-right:

- Compact Core Runtime status block.
- Start, Restart, Stop buttons.
- Narrow chevron menu button.
- Reference screenshot shows the restart menu open; implementation must reproduce that overlay exactly:
  - Graceful Restart
  - Force Restart
  - Restart with Clean Cache
  - Open Runtime Folder
  - View Process Details
- Menu is right-aligned to the chevron, dark elevated panel, same border/radius language, icon + title + secondary description rows.

Below title: four KPI tiles:

1. Healthy
2. Degraded
3. Error
4. Offline

Each tile has:

- large tinted circular icon well;
- large numeric count;
- colored state label;
- one-line muted explanation.

Counts are derived from the real internal-system registry, never hardcoded to 10/1/0/0.

### 5.2 Internal Systems grid

Section header:

- cyan gear icon;
- “Internal Systems” title;
- muted subtitle;
- right-side filter chips: All, Healthy, Warning, Error, Offline with counts.

Grid target:

- four columns at canonical width;
- approximately 3 rows;
- compact system cards matching the reference density.

Cards represented in the reference:

- Core Runtime
- Memory
- Code Intelligence
- Semantic IDE
- Execution
- Learning
- Hermes Partner
- Phone
- Game Mode
- Tunnel
- Integrations
- Add System placeholder

Each real card contains:

- colored/tinted icon well;
- system name;
- green/amber/etc. status text;
- short description;
- one or two bottom metadata points;
- chevron for drill-down when a real details surface exists.

“Add System” is visually dashed/empty and must remain non-operative unless a real integration-registration flow is separately authorized.

### 5.3 Dashboard footer region

Two panels, approximately 45/55 split:

**Recent Activity**
- title + heartbeat icon;
- “View All Logs →” action;
- three compact latest rows with timestamp, module chip, message.

**System Health**
- title + heart icon;
- top-right HEALTHY/DEGRADED badge;
- CPU, Memory, Uptime mini cards;
- progress bars exactly thin and luminous like the reference.

No fake resource graphs. CPU/memory/uptime must be measured from owned process/system evidence available to the launcher.

## 6. Screen parity specification — Core Runtime

Reference: `Core Runtime.png`.

### 6.1 Runtime hero card

Use breadcrumb `Dashboard > Core Runtime`.

Large top card contains:

- large green CPU/chip icon well;
- “Core Runtime” title;
- Running status pill inline with title;
- subtitle “Main agent process and runtime environment”;
- two-line descriptive body matching reference density;
- Start / Restart / Stop / chevron controls on the right;
- same restart dropdown component as Dashboard.

Bottom of hero card: five equal mini metric cards:

- Version
- Uptime
- PID
- Port
- HTTP Health

Each metric card includes a small icon well, label, and bold value.

### 6.2 Resource Usage

Left large panel:

- section title + small blue bar-chart icon;
- subtitle;
- two inner cards side-by-side:
  - CPU Usage
  - Memory Usage

Each inner card:

- icon;
- value;
- max/denominator where applicable;
- thin progress bar;
- compact sparkline in lower half.

Sparkline data must use bounded recent samples from the launcher; if historical samples are unavailable, show a truthful empty/flat state rather than random data.

### 6.3 Runtime Health

Right panel aligned with Resource Usage:

Rows shown in reference:

- Main Process
- HTTP Server (localhost:8765)
- Plugin System
- Memory Management
- Tool Registry
- IPC / Internal Services

Each row has a green/red status dot and right-aligned state. Source every row from real runtime evidence or explicitly mark Unknown/Unavailable.

### 6.4 Recent Activity

Full-width lower table:

- Time
- Level
- Message
- right-aligned “View All Logs →”

Keep exactly the compact row height and badge style shown in the reference. This is a projection of the real Activity Journal, not a separate log store.

## 7. Screen parity specification — Systems

Reference: `Systems.png`.

### 7.1 Header and summary

Breadcrumb: `Dashboard > Systems`.

Header block:

- cyan cube/network icon well;
- “Systems” title;
- subtitle line 1: subsystem status/dependencies/issue hotspots;
- subtitle line 2: monitor internal systems and drill into diagnostics.

Right-side toolbar:

- system search input;
- status chips: All, Healthy, Warning, Error, Offline;
- Category dropdown.

Directly below: five summary cards:

- Total Systems
- Healthy
- Warning
- Error
- Offline

Cards use the same icon/tint language as the Dashboard KPI row.

### 7.2 System catalog

Main left area is a four-column compact card matrix.

Each card contains enough live metadata to match the reference density, for example:

- Core Runtime: Version / Uptime / PID / Components
- Memory: Components / Index / Embedding / Last Check
- Code Intelligence: Provider / Components / Isolation / Last Check
- Semantic IDE: Components / Languages / Index / Last Check
- Execution: Components / HTTP / Local Bridge / Last Check
- Learning: Components / Training Queue/state / Models or sinks / Last Check
- Hermes Partner: Provider / Transport / Issue Count / Last Error
- Phone: Components / Pairing / Transport / Last Check
- Game Mode: Components / Device / Transport / Last Check
- Tunnel: Port / Status / Security / Last Check
- Integrations: Components / Active / Last Check / configuration state
- Auth/OAuth or Connection/Logs where current architecture exposes them.

Selected system:

- amber/cyan border depending state;
- slightly brighter elevated background;
- selection must stay synchronized with the right details inspector.

Do not hardcode the exact catalog size “14” from the screenshot. The count comes from the declared UI system registry.

### 7.3 Right details inspector

Fixed-width right column matching the screenshot.

Header:

- large system icon;
- system name;
- status pill;
- one-line system description.

Tabs:

- Overview
- Components
- Logs
- Dependencies

Overview card:

- large state block, e.g. Degraded;
- issue count at top-right;
- explanation.

Metadata card:

- Provider
- Transport
- configured home/root where safe
- Issue Count
- Last Check

Component Status list:

- colored dots;
- component name;
- right-aligned state.

Latest Issue block:

- red/amber bordered issue card;
- machine-safe issue code;
- concise operator-facing explanation;
- timestamp.

Bottom actions:

- Open Diagnostics
- View Logs

Inspector is driven by selected-system data. It may never expose credentials, OAuth secrets, API keys, raw private logs, or hidden reasoning.

## 8. Screen parity specification — Activity Log

Reference: `Activity log.png`.

### 8.1 Header controls

Header panel:

- cyan log/document icon;
- “Activity Log”;
- subtitle describing real-time events and investigation.

Right:

- green Live pill;
- Auto Scroll labeled toggle;
- Clear button with trash icon.

### 8.2 Filter toolbar

First row:

- wide search field;
- All Systems dropdown;
- All Levels dropdown;
- Last N dropdown;
- Export button.

Second row:

- count chips: All, Info, Success, Warning, Error;
- each chip shows its current count.

Filtering remains client-side over the loaded bounded snapshot unless a larger explicit native query is added. Do not silently scan unlimited historical logs.

### 8.3 Log table

Columns:

- Time
- Level
- System
- Message
- Duration
- row actions/ellipsis

Visual rules:

- blue selected row;
- warning rows can receive low-opacity amber wash;
- error rows can receive low-opacity red wash;
- colored level/module pills;
- system-specific icon in System column;
- compact 36–40 px row height;
- thin row separators.

Bottom:

- pagination buttons;
- current page filled blue;
- ellipsis for long page ranges;
- “Showing X–Y of Z logs” right aligned.

### 8.4 Log Details inspector

Right panel occupies approximately 22–25% of content width.

Top:

- “Log Details”
- close X
- level/module pill
- full date/time
- duration

Main title + description.

Metadata card:

- System
- Component
- Level
- Duration
- Request ID
- Session ID
- User only when a legitimate non-sensitive identity exists.

Additional Data tabs:

- Details
- Raw Data
- Related (count)

Code/data panel uses monospace with syntax-like cyan/green treatment. Raw data must be **redacted/sanitized structured Activity Tracker data only**. Never surface secret-bearing raw arguments/results or model hidden reasoning.

Bottom Related Actions:

- Open File
- View in Editor
- Search Logs

Only enable actions when a real safe target exists; otherwise keep the same geometry with disabled state.

## 9. Screen parity specification — Diagnostics

Reference: `Diagnostics.png`.

### 9.1 Header and page tabs

Header:

- cyan diagnostics/heartbeat icon;
- “Diagnostics”;
- subtitle: deep system diagnostics, health checks, troubleshooting;
- right actions:
  - Run All Diagnostics
  - Generate Report
  - overflow menu

Horizontal tabs exactly follow the reference rhythm:

1. Overview
2. Health Checks
3. System Info
4. Performance
5. Logs & Traces
6. Troubleshooting
7. Export / Report

Tabs share one reusable segmented-tab component with the Settings page.

### 9.2 Summary row

Four KPI cards:

- Passed
- Warnings
- Error
- Skipped

Right-side Overall Status panel:

- status label;
- large Healthy/Degraded text;
- heartbeat icon;
- last checked timestamp.

Counts must be derived from the actual diagnostic run; do not hardcode 42/3/1/0.

### 9.3 Diagnostic Checks table

Main left panel:

- search field;
- filter chips: All / Passed / Warning / Error / Skipped;
- table columns:
  - Name
  - Category
  - Status
  - Duration
  - Last Run
  - chevron

Reference categories include Core, Memory, Code Intelligence, Semantic IDE, Execution, Tunnel, Partner, Phone.

Selected row receives blue fill.

Initial real check families should map to existing evidence owners:

- Agent Core process ownership and responsiveness
- configuration/data-directory readability
- Memory canonical/index/embedding/intelligence
- Grafel daemon/index/graph availability
- Semantic IDE configured provider compatibility
- Execution health
- Tunnel readiness
- Hermes Partner state
- Phone transport/controller state
- OAuth/auth state that can be checked without exposing secrets

No check is allowed to report Passed from absence of evidence.

### 9.4 Right diagnostics inspector

Top “Selected Check Details” panel:

- status pill;
- check title + icon;
- description;
- Category / Status / Duration / Last Run;
- monospace result body in dark inset block.

Below:

**Recent Diagnostic Issues**
- compact rows with system, issue code/message, timestamp, chevron.

**Quick Actions**
- Run All
- Check Health
- Open Logs
- System Snapshot
- Export Results

Export/report actions must produce a sanitized artifact only after the future implementation is explicitly approved.

## 10. Screen parity specification — Settings

Reference: `Settings.png`.

### 10.1 Header and tabs

Header:

- cyan gear icon;
- “Settings”;
- subtitle describing Agent Core preferences/system behavior;
- top-right “Reset to Default” button.

Tabs:

1. General
2. Core Runtime
3. Systems
4. Integrations
5. Security
6. Appearance
7. Advanced

Only General needs to match the shown reference in the first implementation wave; the remaining tabs must still occupy the same visual positions and can route to truthful existing settings/detail surfaces.

### 10.2 General — main left column

**Application panel**

Left form:
- App Name
- Version
- Language

Right toggles:
- Start with Windows
- Minimize to Tray
- Check for Updates
- Send Anonymous Usage Data

Truth boundary:
- Start with Windows already has a real native owner.
- Version is read-only.
- Any unsupported setting must not silently pretend to persist. It should remain disabled/read-only until the corresponding behavior is explicitly implemented.

**Paths & Directories panel**

Rows:
- Agent Core Folder
- Memory Store
- Runtime Cache
- Logs Directory

Each row:
- path field;
- folder icon button;
- Open button.

Paths must come from current resolved Agent Core data/runtime ownership, not screenshot sample strings.

**Logging panel**

Left:
- Log Level
- Max Log Files
- Max File Size + unit

Right toggles:
- Enable File Logging
- Enable Console Logging
- Enable Activity Tracking
- Include Debug Details

Do not create new logging policy merely for visual parity. Unsupported controls remain visibly disabled until a real settings owner exists.

### 10.3 General — right column

**System Status**
- compact green status card;
- “All systems operational” or truthful degraded wording;
- circular status icon.

**Configuration Profile**
- profile dropdown;
- Save Profile;
- Load Profile.

If profiles are not implemented, preserve panel geometry but keep controls disabled and labeled as unavailable rather than writing a fake profile store.

**Danger Zone**
- warning-red/amber header;
- Reset All Settings
- Clear Cache
- Factory Reset

Every destructive action requires a dedicated confirmation contract. No destructive behavior is authorized by this visual plan.

**Help & Documentation**
- Open Documentation
- View Configuration Guide
- external-link icons.

Only known local/trusted documentation targets may be opened.

## 11. Proposed React source architecture

No new frontend framework is required.

Target source split:

```text
src/ui/src/
  App.tsx
  host.ts
  index.css
  types/
    desktop.ts
  design/
    tokens.ts
    system-registry.ts
  components/
    AppShell.tsx
    TopBar.tsx
    Sidebar.tsx
    PageHeader.tsx
    Panel.tsx
    StatusBadge.tsx
    StatusDot.tsx
    IconWell.tsx
    MetricCard.tsx
    SystemCard.tsx
    FilterChip.tsx
    SegmentedTabs.tsx
    DataTable.tsx
    EmptyState.tsx
    RestartMenu.tsx
    Toggle.tsx
    ProcessCard.tsx
  pages/
    DashboardPage.tsx
    CoreRuntimePage.tsx
    SystemsPage.tsx
    ActivityLogPage.tsx
    DiagnosticsPage.tsx
    SettingsPage.tsx
```

This is a plan, not a requirement to create every file if a smaller coherent split proves cleaner. The essential boundary is that page layouts must stop competing inside one monolithic `App.tsx`.

Do not add React Router unless necessary. A small internal page-state/hash router is enough for six local WebView pages and avoids a new dependency/toolchain.

Sparklines should be small SVG components built in-project. Do not add a chart library merely to draw the two reference microcharts.

## 12. Native WebView2 contract expansion

The reference pages need more data than the current compact `DesktopStatus`.

### 12.1 Snapshot contract

Add a versioned, sanitized native-to-UI snapshot concept, for example:

`desktop-snapshot/v1`

Containing only explicit safe fields:

- overall launcher/core state;
- Core process:
  - PID
  - uptime/start time
  - version
  - HTTP port/readiness
  - bounded CPU/memory samples;
- tunnel readiness/port;
- autostart state;
- resolved safe root/runtime/data paths;
- subsystem health projections from Node `/health`:
  - Memory
  - Execution
  - Code Intelligence
  - Semantic IDE
  - Learning
  - Hermes Partner
  - Phone
- issue codes/counts/messages already safe for health output;
- current diagnostic timestamp.

Do **not** forward arbitrary environment variables, tokens, OAuth state, API keys, raw request bodies, raw provider stderr, or unredacted secrets.

### 12.2 Activity contract

Current `ActivityEntry` remains the list-row contract.

For the Activity Log details panel, add an explicit bounded detail projection keyed by event ID when current structured journal evidence supports it:

- full timestamp;
- module/system;
- kind;
- safe status;
- duration if recorded;
- safe correlation IDs;
- redacted structured context;
- related event IDs when deterministic.

Do not invent duration/request/session IDs when absent. Display “—” or Unknown.

### 12.3 Action contract

Existing native actions remain authoritative:

- open folder;
- open tunnel admin;
- restart core;
- restart tunnel;
- restart all;
- reset OAuth;
- toggle autostart;
- clear logs.

New page buttons must initially route only to these real actions or safe local navigation.

Reference-only actions such as Force Restart, Clean Cache, Factory Reset, profile persistence, export reports, and update checks require a separately specified native behavior before becoming enabled. Their visual presence does not authorize implementation.

## 13. Runtime data mapping

Create one UI system registry that maps current native health data into the reference card model.

The registry must define:

- stable system ID;
- display name;
- icon;
- description;
- status derivation;
- metadata fields;
- issue projection;
- dependency labels;
- available actions.

It must **derive**, not independently decide, runtime health.

Examples:

- Code Intelligence status comes from `/health.codeIntelligence`.
- Semantic IDE status comes from `/health.semanticIde`.
- Memory comes from `/health.memory`.
- Learning comes from `/health.learning`.
- Hermes comes from `/health.partner`.
- Phone/Game Mode comes from `/health.phone`.
- Execution comes from `/health.execution`.
- Tunnel remains launcher-owned readiness.

Dashboard counts, Systems counts, and Diagnostics summaries all consume the same registry so they cannot disagree.

## 14. Native window parity

`MainForm.cs` must remain the WebView2 owner.

Future implementation should:

- enable dark Windows titlebar/DWM treatment so the native caption matches the dark references;
- preserve standard minimize/maximize/close behavior;
- preserve window resize;
- use a working-area-aware initial size that favors the canonical reference density on large displays;
- keep existing minimum size compatibility until responsive behavior is verified;
- never remove native crash/hang diagnostics;
- never expose DevTools/context menus in normal production mode.

At viewports below the canonical width:

- sidebar remains fixed until a defined compact breakpoint;
- right inspectors may collapse to overlay/drawer;
- tables gain internal horizontal/vertical scrolling;
- font sizes do not shrink below legible minimums;
- canonical 1536/1672 layouts remain the visual acceptance authority.

## 15. Implementation phases after future approval

### UI-P0 — Freeze reference contract

- Confirm the six screenshots remain the approved visual authority.
- Preserve their original files unchanged.
- Record canonical viewport dimensions and page inventory.
- Do not edit production UI in this phase.
- Acceptance: reference paths readable, dimensions recorded, no screenshot mutated.

### UI-P1 — Shared token system and shell

Owners:
- `src/ui/src/index.css`
- new shared design/component modules
- narrow `App.tsx` shell

Tasks:
- centralize colors, radii, spacing, typography, borders, state colors;
- implement topbar;
- implement sidebar;
- implement page-state navigation;
- implement process card;
- implement page container/grid primitives;
- implement all shared badges/buttons/toggles/tabs.

Acceptance:
- all six pages can render inside the same shell;
- active nav geometry is identical across pages;
- no per-page duplicate color/token definitions.

### UI-P2 — Native safe snapshot bridge

Owners:
- `src/launcher/AgentCoreRuntime.cs`
- `src/launcher/DesktopStatus.cs` or a new explicit snapshot model
- `src/launcher/MainForm.cs`
- `src/ui/src/host.ts`

Tasks:
- add sanitized detailed snapshot;
- preserve existing status compatibility during transition;
- add process/resource measurements required by references;
- expose safe subsystem health detail from `/health`;
- preserve 3-second refresh behavior unless a better bounded cadence is explicitly chosen;
- keep secrets excluded.

Acceptance:
- React receives enough truthful data to populate all visible Dashboard/Core/System health fields;
- existing launcher actions remain functional;
- no direct browser fetch to arbitrary origins is introduced.

### UI-P3 — Dashboard parity

Implement the exact reference composition:

- hero title/action strip;
- four health KPI cards;
- internal-system filter bar;
- 4-column system grid;
- Recent Activity;
- System Health;
- restart menu overlay.

Acceptance:
- structure, density, control dimensions, and state colors match `Dashboard.png`;
- values are live, not copied from screenshot.

### UI-P4 — Core Runtime parity

Implement:

- breadcrumb;
- runtime hero;
- five metric cards;
- resource usage panel;
- two SVG sparklines;
- runtime-health list;
- recent activity table;
- shared restart menu.

Acceptance:
- parity against `Core Runtime.png` at 1672×941;
- no synthetic resource numbers.

### UI-P5 — Systems parity

Implement:

- header/search/filter strip;
- five summary cards;
- system catalog grid;
- selected system state;
- right inspector tabs;
- component list;
- latest issue;
- diagnostics/log navigation actions.

Acceptance:
- parity against `Systems.png`;
- status counts and selected details resolve from the same registry.

### UI-P6 — Activity Log parity

Implement:

- Live/Auto Scroll/Clear controls;
- filter toolbar;
- count chips;
- paginated bounded table;
- selected-row styling;
- details inspector;
- safe structured context rendering;
- related actions only when valid.

Acceptance:
- parity against `Activity log.png`;
- CLEAR still uses the existing session-visible journal cutoff;
- no private raw payload leakage.

### UI-P7 — Diagnostics parity

Implement:

- seven-tab top navigation;
- summary metrics;
- overall status;
- diagnostic check catalog;
- selected check detail;
- recent diagnostic issues;
- quick action area.

Initial diagnostic checks must be deterministic projections of existing health/runtime evidence. Do not create “green” checks with no actual evidence.

Acceptance:
- parity against `Diagnostics.png`;
- check counts equal the actual generated catalog;
- warning/error rows remain truthful.

### UI-P8 — Settings parity

Implement the General tab reference composition.

Wire only current real settings/actions:

- autostart;
- safe resolved paths;
- open-folder actions;
- version/status display.

Unsupported reference controls remain disabled until a later separately approved behavior owner exists.

Acceptance:
- parity against `Settings.png`;
- disabled controls remain visually intentional, not broken;
- no new destructive/reset/cache/profile behavior is silently introduced.

### UI-P9 — Native dark chrome and window sizing

Owner:
- `src/launcher/MainForm.cs`

Implement dark native caption treatment and canonical initial sizing behavior without replacing standard window semantics.

Acceptance:
- no white/light native titlebar remains in normal dark theme;
- minimize/maximize/close work normally;
- WebView diagnostics and hang watchdog remain active.

### UI-P10 — Documentation, memory, and activation preparation

- update the implemented-state section of `docs/CODEBASE.md`;
- update this plan from OPEN to the exact achieved stage;
- create/update canonical memory;
- create a material UI changeset when behavior actually ships;
- build production UI candidate;
- do not replace root launcher or active `dist/ui` until explicit activation approval if activation remains a separate task.

## 16. Visual acceptance matrix

Future implementation is not accepted merely because all content exists. Each page must satisfy a screenshot-parity review.

### 16.1 Shared-shell acceptance

Across all six screens verify:

- same topbar height;
- same logo scale;
- same brand/version alignment;
- same search control dimensions;
- same ONLINE pill geometry;
- same date/time placement;
- same user badge + gear placement;
- same sidebar width;
- same nav row heights;
- same active cyan rail;
- same separator positions;
- same bottom process-card footprint;
- same base panel/radius/border language.

A page-specific workaround that visibly shifts the shell fails parity.

### 16.2 Page-specific visual checkpoints

**Dashboard**
- 4 KPI tiles same proportions;
- Internal Systems title/filter line aligned;
- system cards form the same dense 4-column rhythm;
- bottom Recent Activity/System Health split matches reference;
- restart dropdown overlays rather than pushing layout.

**Core Runtime**
- hero icon/title block height matches;
- 5 mini metrics align on one baseline;
- Resource Usage and Runtime Health share one row;
- sparklines remain compact;
- Recent Activity fills remaining width.

**Systems**
- five summary tiles remain one row;
- catalog cards remain compact;
- selected card border is visible but not oversized;
- right inspector width and tab strip match reference;
- card grid and inspector top/bottom edges align.

**Activity Log**
- table dominates left area;
- details inspector remains full-height right column;
- filter controls do not wrap at canonical width;
- pagination sits at bottom of the table panel;
- selected/log severity washes remain low opacity.

**Diagnostics**
- seven page tabs fit one horizontal row;
- four KPI cards plus Overall Status preserve the reference split;
- diagnostic table and right stack align vertically;
- Quick Actions remains compact at lower right.

**Settings**
- seven tabs fit one row;
- main/side columns match reference ratio;
- Application, Paths & Directories, Logging panels align vertically;
- System Status / Profile / Danger Zone / Help stack matches right-column spacing;
- input and toggle geometry stays uniform.

## 17. Responsive acceptance

Canonical references are desktop-first. Future implementation must additionally remain usable below reference width without changing the canonical visual target.

Proposed behavior:

- ≥ 1440 px content viewport: full reference layout.
- 1180–1439 px: keep sidebar; allow tighter gutters and 3-column system grids where unavoidable.
- 960–1179 px: right inspectors become slide-over panels; main grids reduce columns.
- Below current launcher minimum: not required unless launcher minimum is separately changed.

No global browser zoom trick is allowed to “fake” parity.

## 18. Truth and security boundaries

The redesign may improve visibility, but it must not change ownership.

- UI is not a new health authority.
- UI is not a new execution router.
- Diagnostics are not a new repair engine.
- Systems dependencies are descriptive unless exact source/runtime evidence exists.
- Settings do not gain hidden side effects from visual controls.
- Activity Log remains redacted and evidence-bounded.
- No credentials are rendered into React state.
- No API key/OAuth client secret/token value is shown in Settings, Diagnostics, Systems, or log details.
- No hidden chain-of-thought/model scratchpad is surfaced.
- No destructive action is enabled without a separate explicit contract and confirmation boundary.
- No external Remote Desktop Commander health is substituted for Agent Core health.

## 19. Future verification after implementation approval

Per the current Agent Core operating contract, tests/extra verification are user-controlled. These are proposed verification steps only; they are **not authorized by this planning task**.

Recommended targeted verification after implementation:

1. UI TypeScript typecheck.
2. Existing React UI tests plus new shell/navigation/status tests.
3. Host bridge contract tests for snapshot/message compatibility.
4. Launcher tests for dark chrome/window actions only where source changes require them.
5. Page-level static/render tests for all six routes.
6. Explicit canonical-size screenshot captures at:
   - 1536 × 1024
   - 1672 × 941
7. Side-by-side visual review against each source PNG.
8. Focused live readback proving:
   - status values are current;
   - Core controls call native actions;
   - Systems/Diagnostics agree on state;
   - Activity Log details remain redacted;
   - unsupported Settings controls do not mutate state.
9. If approved, pixel-diff tooling may be introduced as a development-only helper, not a production dependency.

Visual failure criteria:

- light native title bar;
- wrong sidebar width;
- different navigation order;
- page cards substantially larger/sparser than reference;
- incorrect state colors;
- mismatched right inspector width;
- toolbar wrapping at canonical viewport;
- sample screenshot values hardcoded;
- fabricated diagnostics/status;
- secret-bearing log/context display.

## 20. Rollback boundary for future implementation

Rollback must be scoped to the UI/launcher changes introduced by this plan:

- React page/component/token files;
- `host.ts` contract additions;
- launcher snapshot/action additions;
- dark native titlebar/window sizing changes;
- corresponding UI/launcher tests;
- generated `dist/ui` and launcher candidate artifacts from this wave.

Rollback must not revert:

- current Agent Core Node runtime;
- Memory;
- Grafel;
- Semantic IDE;
- OAuth state;
- tunnel profile;
- prior six-plan/health repairs;
- unrelated user changes.

## 21. Planning-task outcome

This document is the only product change requested now.

No React source, launcher source, `dist/ui`, root executable, runtime process, setting, registry value, dependency, build artifact, or active service is modified by this plan-only task.

**OPEN implementation scope:** UI-P0 through UI-P10.

Execution requires a later explicit user approval.

## 22. Implementation and live-activation closure — 2026-09-24

**COMPLETE — IMPLEMENTED — BUILT — LIVE-ACTIVATED.**

The approved six-screen parity scope is now represented in active current-line source and production artifacts.

Implemented React/UI ownership:
- `src/ui/src/App.tsx` — lightweight hash/page controller for Dashboard, Core Runtime, Systems, Activity Log, Diagnostics and Settings.
- `src/ui/src/components.tsx` — shared shell/topbar/sidebar/status/metric/system/restart/tab/toggle/process primitives.
- `src/ui/src/pages.tsx` — all six reference-derived page compositions.
- `src/ui/src/model.ts` + `systems.ts` — shared truthful status/system registry; Dashboard/Systems/Diagnostics use the same health projection.
- `src/ui/src/index.css` — centralized dark navy/cyan/green/amber/red visual system, reference-density grids/inspectors/tables, and desktop responsive breakpoints.
- `src/ui/src/host.ts` — richer sanitized desktop snapshot contract.

Implemented native ownership:
- `src/launcher/DesktopSnapshot.cs` — sanitized live snapshot record for process/runtime paths and subsystem health.
- `src/launcher/AgentCoreRuntime.cs` — live snapshot creation, process CPU/working-set/memory-capacity evidence and existing safe launcher actions.
- `src/launcher/MainForm.cs` — snapshot delivery, dark DWM titlebar treatment, reference-oriented initial sizing and unchanged WebView2 security/diagnostics ownership.

Truth fixes completed during execution:
- CPU/memory sparklines use bounded live samples from the 3-second snapshot cadence rather than synthetic arrays.
- memory bars use measured process working set versus available-memory capacity evidence when available.
- Integrations/Auth no longer claim Healthy without a dedicated health authority; they report Unknown plus explicit evidence boundary.
- diagnostic durations no longer display fabricated sample values.
- screenshot-specific user initials were replaced by neutral Agent Core initials.
- top search placeholder and sidebar quick actions are page-sensitive while routing only to already-owned safe launcher actions.
- unsupported/destructive reference actions remain disabled.

Dependency/toolchain repair:
The existing `src/ui/node_modules` tree was physically incomplete. No dependency/version was added to the source manifest. The damaged tree was preserved as `src/ui/node_modules.partial-20260924-1910`; exact-package tarballs were used to restore missing Rollup 4.63.3, esbuild Win32 0.25.12, enhanced-resolve 5.25.1 and react-dom 19.3.0 files. Temporary npm `allowScripts` metadata was removed from `src/ui/package.json`.

Activation/build evidence:
- UI production build: Vite 6.4.3, **1678 modules transformed**, output written to active `dist/ui`; final JS ~294.24 kB and CSS ~27.05 kB.
- Native launcher Release build: **0 warnings / 0 errors**.
- Production-style win-x64 self-contained single-file publish created `runtime/launcher-publish-ui-20260924/Agent Core.exe`.
- Published launcher metadata: FileVersion `0.12.0.0`, ProductVersion `0.12.0`, SHA-256 `DD68D32058A47A3ACF1900D1063584ED8239D903FF4BB577C4A2D349524BA65A`.
- Previous launcher was backed up to `runtime/backups/reference-ui-parity-20260924/Agent Core.exe` (SHA-256 `ABBC80B6D3DFB7E30B931930100A25A79C37823FA7E8A9D00C2F8001F2FDECE8`).
- Cutover stopped only the two old root launcher processes (PID 380 and native dump helper PID 13304), copied the qualified launcher, and started new launcher PID **9044**. Node Core PID **15404** and tunnel PID **7336** remained alive.
- Installed root launcher SHA-256 matches the publish artifact exactly.
- Fresh Activity Journal after launch records `Agent Core desktop initialized` and successful core+tunnel reachability, with no WebView2/React startup/navigation/runtime error in the readback window.

Verification boundary:
No broad test suite, pixel-diff run, or independent screenshot capture comparison was executed. Therefore this task establishes **implemented/build/live activation**, not an independent claim of pixel-perfect visual verification. The six PNGs remain the acceptance references for any later visual-review task.

Release intent:
.changeset/20260924-reference-ui-parity.md records a minor UI capability change. No release:apply, package version bump, commit, tag, push, publish or deployment was performed.

## 23. Reference-side visual tightening and screenshot review — 2026-09-24

**COMPLETE — BUILT — SIX-ROUTE SIDE-BY-SIDE REVIEWED.**

A continuation review was performed against the six local PNG authorities after the initial live activation. The existing implementation was retained; only visually proven drift was tightened.

Observed drift and correction:
- topbar branding still used the prior placeholder mark; src/ui/public/agent-core-reference-logo.png was derived from the local Dashboard reference and the shared TopBar now uses that reference mark;
- the subtitle separator is CSS-rendered rather than a non-ASCII text glyph;
- Dashboard subsystem cards were too tall because four metadata rows were shown. Dashboard now uses the same shared SystemCard in a compact two-row presentation, while the full Systems catalog preserves four evidence rows;
- non-ASCII text glyphs used for breadcrumb arrows, log chevrons, duration placeholders, ellipsis/actions and diagnostic quick-action symbols could render as mojibake in the WebView path. Runtime-facing TS/TSX/CSS now uses Lucide SVG icons or ASCII-safe fallback text instead;
- Systems cold-start selection now resolves to the first degraded/warning/error subsystem when one exists, matching the reference inspector intent without fabricating status;
- Activity Log now selects the newest available real session event after logs arrive instead of leaving the detail inspector empty on a cold route;
- a partial custom React window-chrome experiment was rejected before activation. Native MainForm remains the only window-caption owner; no unsupported window-* action contract was introduced.

Development-only capture evidence:
- runtime/tmp/capture-reference-ui-parity.mjs served the rebuilt dist/ui with UTF-8 MIME and captured Dashboard 1536x1024, Core Runtime 1672x941, Systems 1672x941, Activity Log 1536x1024, Diagnostics 1536x1024 and Settings 1536x1024;
- all six captures reported errors=[];
- for every route, document/body scroll dimensions matched the canonical client viewport, proving no page-level overflow at the reference size;
- captures are under runtime/tmp/reference-ui-parity-captures/ and were reviewed side-by-side against the six docs/UI Agent Core/*.png references.

Rebuilt production artifact:
- Vite 6.4.3: **1678 modules transformed**;
- active dist/ui JS: ~295.20 kB; CSS: ~27.65 kB;
- the pre-tightening dist/ui is preserved under runtime/backups/ui-parity-visual-tightening-20260924/dist-ui-before-tightening/.

This closes the previously stated independent screenshot-review gap. It is a manual side-by-side visual acceptance, not a numerical pixel-diff claim. Live runtime values remain authoritative and may differ from static reference sample values.

Live reload evidence after the tightening build:
- primary launcher restarted from PID 9044 to PID 12884;
- Node Core PID 15404 was preserved through the launcher-only reload;
- `/health` returned `ok`, version `0.12.0`;
- active `dist/ui/index.html` references `assets/index-HjFZI-sP.js` (SHA-256 `2D7D2DD69706B964B0E9C40EC57E646E8A4A8E86BE6238035D75CC9D5FC51DEC`) and `assets/index-Dplt5ICP.css` (SHA-256 `BD19386DD9B95201F691A7149B231C520D9A28D7B762D2C62AAD4F75D745A9D5`);
- the reference-derived logo copied into active `dist/ui` has SHA-256 `746ADD6D87C574C8961E05324C4A1577DA0C50529A3DA50DF388131C55CF8A59`;
- the fresh desktop session journal records initialization and Core+tunnel reachability with no UI/WebView2 runtime error in the inspected window;
- a native-window capture after reload (`runtime/tmp/reference-ui-parity-captures/live-native-after-tightening.png`, SHA-256 `A61F078EE0DF313FAC658C3339F41D59055A6869CD6BB37146FD48A811D595A9`) confirms the active WebView renders the tightened reference logo, compact Dashboard cards, and lower Dashboard panels. An unrelated always-on-top window partially covered the top-right of that desktop capture and is not part of Agent Core;
- `release:check-intent` could not validate intent coverage because `refs/agent-core/current-line-baseline` is absent locally. No baseline ref was synthesized; the existing UI changeset remains present in the read-only release plan.

## 24. Native-window responsive visual refinement — 2026-09-24

**COMPLETE — CSS-ONLY VISUAL REFINEMENT — BUILT — LIVE-RELOADED.**

User review of the real maximized desktop window exposed a layout-density gap that the canonical browser captures did not reproduce: the native Windows title bar reduces WebView height, and the 1536-wide Systems page still kept the 1672-wide four-column catalog beside its inspector. The result was oversized composition, cramped cards, truncation and lower-panel overflow despite canonical captures being clean.

The correction is visual-only in `src/ui/src/index.css`. No React data model, host contract, launcher behavior, backend action, icon artwork, health authority or persistence behavior changed. A bounded native-window media query applies only at 1180–1599 px width and at most 1000 px viewport height. It conservatively tightens panel gaps/heights, form controls, runtime resource rows, activity/diagnostic tables and Settings spacing. Systems alone switches to a three-column catalog with a 330 px inspector in that constrained desktop window so card content remains readable. The existing shell/topbar/sidebar sizing remains unchanged.

Verification used the rebuilt active `dist/ui` and a development-only capture variant at 1536x993 for all six routes. Dashboard, Core Runtime, Systems, Activity Log, Diagnostics and Settings each returned `errors=[]`; document/body dimensions matched the client viewport for all six, so no page-level overflow remained. Evidence lives under `runtime/tmp/reference-ui-native-density-captures/`.

Vite 6.4.3 rebuilt 1678 modules. Active JS remains behavior-identical by hash at `2D7D2DD69706B964B0E9C40EC57E646E8A4A8E86BE6238035D75CC9D5FC51DEC`; responsive CSS is `assets/index-DwHCpg-1.css`, SHA-256 `4ED4E741C59DBF0FC3E08C2306FEE2061A9E579ED8F78423B61CF40CD9F2AD7D`. Scoped pre-change source and dist backup: `runtime/backups/ui-responsive-refinement-20260924/`.

Launcher-only reload replaced primary PID 12884/helper 10408 with PID 4428/helper 11804. Node Core PID 15404 remained on `dist/index.js`; `/health` stayed `ok` on 0.12.0 with Memory, Execution, Grafel, Semantic IDE and Learning available. Hermes Partner remains separately degraded by `HERMES_HOME_NOT_FOUND`.

No new dependency, release apply, version bump, commit, tag, push, publish or deploy occurred. The existing `.changeset/20260924-reference-ui-parity.md` remains the release intent for this same UI-parity wave.

## 25. Official product logo restoration — 2026-09-24

**COMPLETE — OFFICIAL ASSETS ACTIVE — LIVE-RELOADED.**

The topbar brand mark now uses the canonical product asset `assets/agent-core.png` through the identical public copy `src/ui/public/agent-core.png`. The prior reference-derived logo remains only as historical evidence and is no longer the active brand source.

The official PNG is 512×512 and contains substantial transparent canvas padding. The UI therefore keeps the original file intact and uses a bounded `.brand-logo-frame` crop/scale presentation so the artwork occupies the same visual footprint as the prior mark without modifying the source image.

Native launcher icon ownership was also checked: `src/launcher/AgentCore.Launcher.csproj` already sets `ApplicationIcon` to `..\..\assets\agent-core.ico`, and MainForm reads the embedded executable icon. No native icon rebuild/change was required for this task.

Official PNG SHA-256 is `4E0FE25FD14837B941D5A62FF47E0EC66E8B96910A22544767D620B7AE346806`; the source public copy and rebuilt `dist/ui/agent-core.png` match it exactly. Official ICO SHA-256 is `4A318B3889B5417400C620BDB286BCE2EAD96CC9B5FA9427986D8761266B5C02`.

Vite rebuilt 1678 modules and the native-window capture set returned `errors=[]` for all six routes with no page-level overflow. Launcher-only reload moved the WebView to the rebuilt UI while Node Core remained healthy on version 0.12.0.

Backup: `runtime/backups/official-logo-20260924/`. No dependency, release apply, version bump, commit, tag, push, publish, or deploy occurred.
