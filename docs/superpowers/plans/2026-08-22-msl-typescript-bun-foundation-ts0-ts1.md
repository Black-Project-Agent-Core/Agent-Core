# MSL TypeScript/Bun Foundation TS0–TS1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-duplicating Bun/TypeScript engineering foundation and migrate only `analytics_engine.js` to a TypeScript source-of-truth while preserving MSL runtime behavior, Go embed paths, Rust ownership, and native packaging.

**Architecture:** Bun is development tooling only. TypeScript becomes the manual source for the isolated analytics-engine UI pilot; deterministic JavaScript remains committed at the existing Go-embedded path. No new production server/runtime is introduced and no existing Go/Rust/Python/PowerShell/Node subsystem is rewritten.

**Tech Stack:** Go 1.22+/1.26.4 verified toolchain, Rust 1.97.1, TypeScript 5.9.3, Bun 1.4.0, vanilla browser DOM APIs, existing Go `embed.FS`, existing PowerShell/Inno Setup packaging.

**Spec:** `docs/superpowers/specs/2026-08-22-msl-polyglot-foundation-v3-design.md`

## Global Constraints

- Bun is not an installed MSL runtime and no Bun background service may be introduced.
- Go remains host/API/persistence/security/credential owner.
- Rust remains mandatory production analytics through `msl-analytics/2`.
- TypeScript TS0/TS1 changes no market formula, ranking formula, semantic value, HTTP route, storage schema, or credential behavior.
- `internal/web/assets/js/analytics_engine.js` remains the served and embedded output path.
- `frontend/src/analytics_engine.ts` becomes the only hand-maintained pilot implementation; generated JS must never be hand-edited.
- Browser Companion, Node Windows relay, existing Python QA tools, and PowerShell installer scripts remain unchanged.
- Generated JavaScript is committed and a rebuild must produce zero Git diff.
- No Go↔TypeScript bulk DTO generator is introduced in TS0/TS1.
- Default sequencing requires C2 formal closeout before TS0/TS1; however, the user explicitly authorized a one-time execution-order exception on 2026-08-22 ("silahkan mulai"), so TS0/TS1 executed from exact C2 implementation HEAD `48b50f05ed952fb008be1349e46091a553d3d281` before formal closeout. This historical exception does not mark C2 formally complete and does not authorize TS2+.

---

## File Structure Locked by This Plan

```text
package.json                         Bun/TypeScript scripts + pinned dev dependency
bun.lock                             committed deterministic Bun lockfile
frontend/tsconfig.json               strict pilot compiler configuration
frontend/src/globals.d.ts            minimal existing-browser global declarations
frontend/src/analytics_engine.ts     sole manual pilot implementation
frontend/tests/analytics_engine.test.ts  Bun source/generated contract checks
internal/web/assets/js/analytics_engine.js generated committed browser asset
internal/web/frontend_build_contract_test.go Go-side repository/embed contract
.github/workflows/frontend-contract-ci.yml independent frontend verification lane
```

### Task 1: Lock the Bun/TypeScript Toolchain Contract Without Changing Runtime JS

**Files:**
- Create: `package.json`
- Create: `bun.lock`
- Create: `frontend/tsconfig.json`
- Create: `frontend/src/globals.d.ts`
- Create: `internal/web/frontend_build_contract_test.go`

**Interfaces:**
- Produces scripts `typecheck`, `build:frontend`, `test:frontend`, `verify:frontend-generated`.
- Produces pinned `packageManager = "bun@1.4.0"` and `typescript = "5.9.3"`.
- Produces strict compiler output from `frontend/src` to `internal/web/assets/js`.

- [ ] **Step 1: Write the failing Go repository contract test**

Create `internal/web/frontend_build_contract_test.go` that reads `../../package.json` and `../../frontend/tsconfig.json`, then asserts the exact Bun version, TypeScript version, four script names, `strict: true`, `module: "None"`, and output directory `../internal/web/assets/js`.

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `go test ./internal/web -run 'FrontendBuildContract' -count=1`
Expected: FAIL because `package.json` / `frontend/tsconfig.json` do not exist.

- [ ] **Step 3: Add the minimal package manifest**

```json
{
  "name": "market-signal-lab-frontend-tooling",
  "private": true,
  "packageManager": "bun@1.4.0",
  "scripts": {
    "typecheck": "tsc -p frontend/tsconfig.json --noEmit",
    "build:frontend": "tsc -p frontend/tsconfig.json",
    "test:frontend": "bun test frontend/tests",
    "verify:frontend-generated": "bun run build:frontend && git diff --exit-code -- internal/web/assets/js/analytics_engine.js"
  },
  "devDependencies": {
    "typescript": "5.9.3"
  }
}
```

- [ ] **Step 4: Add strict compiler configuration and minimal globals**

`frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "None",
    "strict": true,
    "noImplicitAny": true,
    "noEmitOnError": true,
    "rootDir": "src",
    "outDir": "../internal/web/assets/js",
    "newLine": "lf",
    "removeComments": false,
    "sourceMap": false,
    "declaration": false,
    "skipLibCheck": true
  },
  "files": ["src/globals.d.ts", "src/analytics_engine.ts"]
}
```

`frontend/src/globals.d.ts` initially declares only the existing API global required by the pilot:

```ts
declare function api<T = unknown>(url: string, opts?: RequestInit): Promise<T>;
```

- [ ] **Step 5: Install exactly the pinned dependency and commit the lockfile**

Run: `bun install --frozen-lockfile` only if `bun.lock` already exists; on the first creation run `bun install`, inspect `bun.lock`, then subsequent verification MUST use `bun install --frozen-lockfile`.

- [ ] **Step 6: Re-run the Go contract test**

Run: `go test ./internal/web -run 'FrontendBuildContract' -count=1`
Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add package.json bun.lock frontend/tsconfig.json frontend/src/globals.d.ts internal/web/frontend_build_contract_test.go
git commit -m "build: add selective Bun TypeScript foundation"
```

---

### Task 2: Migrate Only Analytics-Engine Diagnostics to TypeScript Source-of-Truth

**Files:**
- Create: `frontend/src/analytics_engine.ts`
- Create: `frontend/tests/analytics_engine.test.ts`
- Modify/generated: `internal/web/assets/js/analytics_engine.js`
- Modify: `internal/web/analytics_engine_ui_test.go`

**Interfaces:**
- Keeps browser URL `/assets/js/analytics_engine.js` unchanged.
- Keeps global function names `analyticsComponentStatusText`, `renderAnalyticsEngineDiagnostics`, and `loadAnalyticsEngineDiagnostics` unchanged.
- Consumes existing browser global `api<T>()` declared in `globals.d.ts`.
- Introduces no imports, framework, router, or runtime package.

- [ ] **Step 1: Write a RED Bun contract test**

Create `frontend/tests/analytics_engine.test.ts` that reads `frontend/src/analytics_engine.ts` and `internal/web/assets/js/analytics_engine.js`. Assert the TypeScript source contains the generated-file notice and typed `AnalyticsEngineSnapshot`, and the generated output contains the same generated-file notice, `/api/system/analytics-engine`, and `async function loadAnalyticsEngineDiagnostics`.

- [ ] **Step 2: Run the frontend test and confirm RED**

Run: `bun run test:frontend`
Expected: FAIL because `frontend/src/analytics_engine.ts` does not exist.

- [ ] **Step 3: Create the typed source with unchanged behavior**

Use this bounded source shape:

```ts
// GENERATED FILE NOTICE: internal/web/assets/js/analytics_engine.js is generated from frontend/src/analytics_engine.ts; edit only the TypeScript source.
interface AnalyticsComponentHealth {
  status?: string;
  message?: string;
}

interface AnalyticsEngineSnapshot {
  applicationHost?: AnalyticsComponentHealth;
  productionAnalytics?: AnalyticsComponentHealth;
  protocol?: string;
  workerVersion?: string;
  lastWorkerError?: string;
  quantResearchLab?: AnalyticsComponentHealth;
  nativeAccelerator?: AnalyticsComponentHealth;
}

function analyticsComponentStatusText(health?: AnalyticsComponentHealth): string {
  if (!health) return '-';
  const status = health.status || 'unavailable';
  return health.message ? status + ' - ' + health.message : status;
}
```

Continue the same source without semantic changes:

```ts
function renderAnalyticsEngineDiagnostics(snapshot?: AnalyticsEngineSnapshot): void {
  if (!snapshot) return;
  const values: Record<string, string> = {
    applicationHostHealth: analyticsComponentStatusText(snapshot.applicationHost),
    productionAnalyticsHealth: analyticsComponentStatusText(snapshot.productionAnalytics),
    analyticsProtocol: snapshot.protocol || '-',
    workerVersion: snapshot.workerVersion || '-',
    lastWorkerError: snapshot.lastWorkerError || '-',
    quantResearchHealth: analyticsComponentStatusText(snapshot.quantResearchLab),
    nativeAcceleratorHealth: analyticsComponentStatusText(snapshot.nativeAccelerator)
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

async function loadAnalyticsEngineDiagnostics(): Promise<AnalyticsEngineSnapshot> {
  const snapshot = await api<AnalyticsEngineSnapshot>('/api/system/analytics-engine');
  renderAnalyticsEngineDiagnostics(snapshot);
  return snapshot;
}

document.addEventListener('DOMContentLoaded', () => {
  loadAnalyticsEngineDiagnostics().catch(error => console.error(error));
});
```

- [ ] **Step 4: Run strict typecheck and confirm GREEN**

Run: `bun run typecheck`
Expected: PASS with zero TypeScript diagnostics.

- [ ] **Step 5: Generate the committed JavaScript output**

Run: `bun run build:frontend`
Expected: `internal/web/assets/js/analytics_engine.js` is regenerated from the TypeScript source and contains the source-of-truth/generated warning comment.

- [ ] **Step 6: Strengthen the existing Go UI contract**

Extend `TestComputeSettingsShowsComponentHealthWithoutModeSelector` to require the generated warning and continue requiring `async function loadAnalyticsEngineDiagnostics`; do not weaken any existing forbidden legacy-control checks.

- [ ] **Step 7: Run pilot verification**

Run:

```bash
bun run test:frontend
bun run verify:frontend-generated
go test ./internal/web -run 'ComputeSettings|RuntimeUIContainsNoLegacyDemoControls|FrontendBuildContract' -count=1
```

Expected: all PASS and generated drift command exits `0`.

- [ ] **Step 8: Commit Task 2**

```bash
git add frontend/src/analytics_engine.ts frontend/tests/analytics_engine.test.ts internal/web/assets/js/analytics_engine.js internal/web/analytics_engine_ui_test.go
git commit -m "refactor: make analytics diagnostics TypeScript-owned"
```

---

### Task 3: Add a Dedicated Frontend Contract CI Lane Without Duplicating Go/Rust CI

**Files:**
- Create: `.github/workflows/frontend-contract-ci.yml`
- Modify: `internal/web/frontend_build_contract_test.go`

**Interfaces:**
- CI verifies Bun/TypeScript source, tests, and generated drift only.
- Existing Go/Rust/native workflows remain owners of their current gates.

- [ ] **Step 1: Extend the Go contract test and confirm RED**

Require `../../.github/workflows/frontend-contract-ci.yml` to contain `oven-sh/setup-bun@v2`, `bun-version: 1.4.0`, `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test:frontend`, and `bun run verify:frontend-generated`.

Run: `go test ./internal/web -run 'FrontendBuildContract' -count=1`
Expected: FAIL because the workflow is absent.

- [ ] **Step 2: Create the narrowly scoped workflow**

```yaml
name: Frontend Contract CI
on:
  push:
    paths:
      - 'package.json'
      - 'bun.lock'
      - 'frontend/**'
      - 'internal/web/assets/js/**'
      - '.github/workflows/frontend-contract-ci.yml'
  pull_request:
    paths:
      - 'package.json'
      - 'bun.lock'
      - 'frontend/**'
      - 'internal/web/assets/js/**'
      - '.github/workflows/frontend-contract-ci.yml'
jobs:
  frontend-contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.0
      - run: bun install --frozen-lockfile
      - run: bun run typecheck
      - run: bun run test:frontend
      - run: bun run verify:frontend-generated
```

- [ ] **Step 3: Re-run local contract and frontend gates**

Run:

```bash
go test ./internal/web -run 'FrontendBuildContract' -count=1
bun install --frozen-lockfile
bun run typecheck
bun run test:frontend
bun run verify:frontend-generated
```

Expected: PASS / zero generated diff.

- [ ] **Step 4: Commit Task 3**

```bash
git add .github/workflows/frontend-contract-ci.yml internal/web/frontend_build_contract_test.go
git commit -m "ci: verify TypeScript source and generated frontend"
```

---

### Task 4: Prove TS0/TS1 Does Not Alter Product Runtime, Rust Ownership, or Native Packaging

**Files:**
- No production code changes expected.
- Evidence only under ignored `dist/ts-foundation-acceptance/`.

**Interfaces:**
- Consumes committed generated JavaScript from Task 2.
- Proves Bun is not required by the installed application.
- Proves Rust/numeric production source is untouched.

- [ ] **Step 1: Establish the C2 integration baseline**

Run:

```bash
BASE="48b50f05ed952fb008be1349e46091a553d3d281"
echo "$BASE"
git diff --exit-code "$BASE" -- engines/rust internal/analyticsengine internal/ranking/rust_input_v01.go internal/ranking/rust_output_v01.go internal/indexing
```

Expected: no Rust/numeric diff from the C2 integration baseline.

- [ ] **Step 2: Run all frontend gates from a clean dependency install**

```bash
rm -rf node_modules
bun install --frozen-lockfile
bun run typecheck
bun run test:frontend
bun run verify:frontend-generated
```

Expected: all PASS and no tracked generated diff.

- [ ] **Step 3: Run repository Go regression**

Use the repository-local Go toolchain and a verified release Rust worker:

```bash
export MSL_RUST_WORKER='/f/Market-Signal-Lab/dist/native-c1-acceptance/rust-target/release/msl-analytics-rust.exe'
'/f/Market-Signal-Lab/dist/.local-tools/go1.26.4/go/bin/go.exe' test ./... -count=1
```

Expected: all Go packages PASS.

- [ ] **Step 4: Run full Rust regression**

Run with repository-local Cargo/Rustup environment:

```bash
export CARGO_HOME='/f/Market-Signal-Lab/dist/.local-tools/rust/cargo'
export RUSTUP_HOME='/f/Market-Signal-Lab/dist/.local-tools/rust/rustup'
export RUSTUP_TOOLCHAIN='1.97.1-x86_64-pc-windows-gnu'
"$CARGO_HOME/bin/cargo.exe" test --manifest-path engines/rust/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Build the native Windows installer without adding Bun to the installer runtime contract**

From Git Bash invoke the existing PowerShell build with explicit native tools and session-only Go VCS stamping disable for linked-worktree compatibility:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '
$env:GOFLAGS="-buildvcs=false"
$env:CARGO_HOME="F:\Market-Signal-Lab\dist\.local-tools\rust\cargo"
$env:RUSTUP_HOME="F:\Market-Signal-Lab\dist\.local-tools\rust\rustup"
$env:RUSTUP_TOOLCHAIN="1.97.1-x86_64-pc-windows-gnu"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER="F:\Market-Signal-Lab\dist\.local-tools\rust\rustup\toolchains\1.97.1-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\rust-lld.exe"
& .\scripts\build-windows-installer.ps1 `
  -GoExe "F:\Market-Signal-Lab\dist\.local-tools\go1.26.4\go\bin\go.exe" `
  -CargoExe "F:\Market-Signal-Lab\dist\.local-tools\rust\rustup\toolchains\1.97.1-x86_64-pc-windows-gnu\bin\cargo.exe" `
  -ISCCExe "F:\Market-Signal-Lab\dist\.local-tools\inno-6.7.3\ISCC.exe" `
  -DistRoot (Join-Path (Get-Location) "dist\ts-foundation-acceptance\windows-installer")
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
'
```

Expected: installer build PASS. The build script remains Bun-free; compiled JavaScript is consumed from the committed Go-embedded asset path.

- [ ] **Step 6: Verify the installed runtime and compiled frontend asset**

Run the existing installer verifier into `dist/ts-foundation-acceptance/installed-app` on an unused local port, require `healthy / rust-production / msl-analytics/2`, then fetch `/assets/js/analytics_engine.js` and assert it contains both the generated warning and `loadAnalyticsEngineDiagnostics`.

- [ ] **Step 7: Confirm installed runtime has no Bun dependency**

Inspect the installed directory and running process tree. There must be no `bun.exe`, Bun package tree, Bun cache, or required Bun child process. The runtime process owners remain Go host + Rust analytics worker.

- [ ] **Step 8: Confirm generated/build artifacts are ignored**

Run: `git status --short` and `git check-ignore -v dist/ts-foundation-acceptance/windows-installer/output/*`.
Expected: no generated native artifact is staged or tracked.

---

### Task 5: Close TS0/TS1 With Durable QA and Explicit Future Migration Gates

**Files:**
- Create: `docs/qa/polyglot-foundation-v3-ts0-ts1-qa.md`
- Create: `docs/checkpoints/2026-08-22-MSL-TS0-TS1-FOUNDATION-VERIFIED.md`
- Modify: `docs/checkpoints/CONTINUE_MSL.md`

**Interfaces:**
- Records actual TS0/TS1 evidence only.
- Keeps TS2 telemetry, TS3 consensus/workspace, TS4 app-domain extraction, and TS5 Browser Companion as separate future design gates.
- Does not change C2/C3 product semantics or formal release status.

- [ ] **Step 1: Write QA from observed evidence only**

Record Bun/TypeScript versions, source/output paths, generated drift result, frontend tests, Go regression, Rust diff/regression, installer/app/worker hashes, native health, installed frontend marker result, and proof that Bun is absent from the runtime package/process tree.

- [ ] **Step 2: Write the verified checkpoint with explicit future gates**

The checkpoint must state:

```text
TS0 Bun/TypeScript toolchain foundation          VERIFIED only if all gates pass
TS1 analytics-engine TypeScript pilot           VERIFIED only if all gates pass
TS2 telemetry TypeScript migration              DESIGN REQUIRED / NOT AUTHORIZED
TS3 consensus/workspace migration               DESIGN REQUIRED / NOT AUTHORIZED
TS4 app.js bounded domain extraction            DESIGN REQUIRED / NOT AUTHORIZED
TS5 Browser Companion migration                 NOT JUSTIFIED / NOT AUTHORIZED
Python Quant Lab                                FUTURE PHASE G
C++ accelerator                                 FUTURE PHASE H / PROFILING REQUIRED
```

- [ ] **Step 3: Update `CONTINUE_MSL.md` with the canonical foundation pointer**

Add a short section that points to the v3 design and this plan, reiterates the anti-duplication law, and tells future agents not to migrate existing subsystems merely for language consistency.

- [ ] **Step 4: Run documentation and secret hygiene checks**

```bash
git diff --check
git grep -n -I -E 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,}' -- .
```

Expected: `git diff --check` exit `0`; secret scan returns no matches.

- [ ] **Step 5: Run final focused and full verification**

```bash
bun install --frozen-lockfile
bun run typecheck
bun run test:frontend
bun run verify:frontend-generated
'/f/Market-Signal-Lab/dist/.local-tools/go1.26.4/go/bin/go.exe' test ./internal/web -count=1
'/f/Market-Signal-Lab/dist/.local-tools/go1.26.4/go/bin/go.exe' test ./... -count=1
```

Expected: PASS and zero generated diff.

- [ ] **Step 6: Commit TS0/TS1 closeout**

```bash
git add docs/qa/polyglot-foundation-v3-ts0-ts1-qa.md docs/checkpoints/2026-08-22-MSL-TS0-TS1-FOUNDATION-VERIFIED.md docs/checkpoints/CONTINUE_MSL.md
git commit -m "docs: verify selective TypeScript Bun foundation"
```

- [ ] **Step 7: Publish only the TS0/TS1 feature branch**

Push the reviewed feature branch; do not merge to `main` implicitly and do not start TS2 without a separate approved design.

---

## Completion Definition

TS0/TS1 is complete only when one manual TypeScript pilot source generates the existing JavaScript asset deterministically, Bun remains development-only, all existing Go/Rust/runtime ownership contracts remain intact, the Windows package still runs without Bun, and all automated/native gates are green.

After completion, return to the product roadmap. TS2 is optional follow-on engineering work, not permission to rewrite the frontend.
