# Agent Core Advanced Android / Game Mode Plan

**Status:** IN PROGRESS — source/dist implementation underway; live MCP reload, game-screen calibration and companion APK decision remain open  
**Date:** 2026-10-08  
**Project root:** `E:\Projects\Agent-Core`  
**Scope owner:** existing `src\phone` + `src\mcp\phone-*` only  
**Primary device observed:** Nubia Z2465N / serial `325F60192864`  
**Existing local ADB observed:** `E:\scrcpy-win64-v5.0\adb.exe`, ADB 37.0.1  
**Storage boundary:** all new toolchains, caches, companion source, build artifacts, runtime state and downloads stay under the Agent Core project root. The existing scrcpy folder is read-only bootstrap input unless the user later explicitly changes that boundary.

## 1. Goal

Upgrade Game Mode from a generic remote-control surface into a controller-independent Android gameplay capability that gives ChatGPT, Claude, Codex, the Native Agent, or a future provider enough sensory fidelity, action precision, state continuity and durable learning to play the user's games intelligently.

The target is not a coordinate bot. The target loop is:

```text
AI controller
    |
    v
Game context + durable Memory + fresh public meta when needed
    |
    v
Observe / inspect / compare / infer state
    |
    v
Choose strategy, party, character investment, navigation or battle action
    |
    v
Bounded action sequence
    |
    v
Visual/state verification
    |
    v
Outcome evidence
    |
    +--> active game-session state
    |
    +--> durable Memory only when the lesson is reusable and sufficiently grounded
```

The design must work across portrait and landscape titles. Seven Knights is an example of a landscape-heavy target; 7DS Grand Cross is a portrait-heavy target. Orientation is observed state, never a hardcoded game property.

## 2. Non-goals and hard boundaries

This work does not add a second machine-control system, second Memory authority, autonomous background game daemon, root requirement, packet interception, game-process memory injection, anti-cheat bypass, input spoofing outside normal Android control APIs, or exploit/cheat subsystem.

Routine reversible gameplay may be delegated by the user as a session-level intent. Premium-currency spending, purchases, account/security changes, deletion/consumption of valuable assets, or comparable irreversible commitments remain intent-gated.

Canonical reusable knowledge remains Agent Core Memory. Runtime phone/game state is operational state only and must not become a second long-term knowledge database.

## 3. Current grounded baseline

Current source/dist already has:

- gateway and ADB transports behind one `PhoneController`;
- phone status, observe, tap, swipe, long press, text, keys, navigation, app launch, named actions and macros;
- live-observation-based orientation/dimension tracking for normalized coordinates;
- crop/zoom observation;
- bounded multi-frame burst observation with motion/stability scoring;
- mixed action sequences;
- `waitStable` visual settling;
- final observation after mixed sequences;
- existing companion gateway overlay controls `android_set_overlay` and `android_clear_markers`;
- Memory/Learning/Web Research sibling capabilities that controllers can use for game knowledge.

Observed local machine state:

- `E:\scrcpy-win64-v5.0\adb.exe` exists;
- ADB version: 37.0.1 / 1.0.41;
- USB device: `325F60192864 device product:P820F05 model:Z2465N device:P820F05`;
- the current Agent Core phone config does not yet search the scrcpy path directly;
- companion/gateway is already usable and remains the current resident transport until a supported Core reload activates source/dist changes.

## 4. Target architecture

```text
                         ANY AI CONTROLLER
                                |
                +---------------+---------------+
                |                               |
                v                               v
         Agent Core Memory                Web Research
     proven strategy/history          patch/meta/tier data
                |                               |
                +---------------+---------------+
                                |
                                v
                    GAME REASONING CONTEXT
                                |
                                v
                      PHONE CONTROLLER
                 existing single authority
                                |
          +---------------------+---------------------+
          |                                           |
          v                                           v
     LOCAL ADB                                     GATEWAY
 project-local toolchain                       existing companion
 low-latency USB                               remote/fallback path
          |                                           |
          +---------------------+---------------------+
                                |
                                v
                         ANDROID DEVICE
                                |
              +-----------------+------------------+
              |                 |                  |
              v                 v                  v
         visual frames      UI/system state   device telemetry
              |                 |                  |
              +-----------------+------------------+
                                |
                                v
                     GAME SESSION STATE
                   bounded operational cache
                                |
                                v
                      outcome + evidence
                                |
                   +------------+------------+
                   |                         |
                   v                         v
             continue/replan          durable lesson?
                                            |
                                         yes v
                                      Agent Core Memory
```

## 5. Storage and toolchain layout

No global installation is required. During implementation, use the following project-local layout:

```text
<PROJECT_ROOT>\
  SubProject\
    android-game-companion\
      app\
      gradle\
      gradlew / gradlew.bat
      settings.gradle(.kts)
      build.gradle(.kts)

  runtime\
    android\
      platform-tools\
        adb.exe
        AdbWinApi.dll
        AdbWinUsbApi.dll
      sdk\
        cmdline-tools\
        platforms\
        build-tools\
      jdk\
      gradle-home\
      downloads\
      manifests\
      cache\
      tmp\

    phone\
      devices\
      sessions\
      games\
        <package-or-game-id>\
          profile.json
          anchors\
          roster.json
          session-state.json
          evidence\
```

Implementation rule:

1. Bootstrap ADB from the already-installed scrcpy bundle by copying the minimum required ADB trio into `runtime\android\platform-tools`.
2. Record source path, byte size and SHA-256 in a local manifest.
3. Do not modify `E:\scrcpy-win64-v5.0`.
4. If a newer/official Android platform-tools package is later needed, download/extract it only under `runtime\android\downloads` and `runtime\android\platform-tools`.
5. If companion APK work begins, install JDK/Android command-line SDK/Gradle caches only under `runtime\android`. Set process-scoped `JAVA_HOME`, `ANDROID_SDK_ROOT`, and `GRADLE_USER_HOME`; do not change system environment variables or global PATH.
6. APK source belongs under `SubProject\android-game-companion`; generated output belongs under that subproject build tree or `runtime\build`.

## 6. Workstreams

### G0 — Resident activation and baseline

Purpose: establish one truthful baseline before deeper work.

Planned work:

- reload Agent Core through the supported launcher path when the user authorizes activation;
- confirm the fresh MCP schema exposes crop, burst observation, mixed steps and `waitStable`;
- configure or project-locally stage the verified ADB binary;
- switch default Game Mode resolution toward `auto` only after local ADB readiness is confirmed;
- retain gateway as fallback.

Acceptance:

- fresh `phone_status` reports both transports truthfully;
- USB ADB identifies Z2465N without system PATH dependency;
- gateway fallback remains available.

### G1 — Transport quality and latency

Purpose: make the action/observe cycle fast enough for practical gameplay.

Planned work:

- add per-transport latency measurements for screenshot, action and round-trip;
- prefer local USB ADB when healthy;
- retain gateway when USB is absent;
- add bounded transport failover between decision boundaries, never halfway through an irreversible sequence;
- cache current display/orientation/device identity from live observations;
- keep action coordinates bound to the live frame geometry.

Metrics:

- observation latency;
- action latency;
- final-observation latency;
- transport failover count;
- failed-action rate.

### G2 — Visual perception primitives

Purpose: reduce expensive full-screen re-reading and improve state recognition.

Planned primitives:

- named screen regions such as party slots, skill bar, battle result, stamina/currency, character stats;
- multi-region crop in one observation cycle;
- frame digest/perceptual difference;
- region-specific change detection;
- `waitRegionStable` / `waitRegionChange`;
- optional anchor/template matching using the existing image stack before introducing a heavy CV dependency;
- screenshot evidence ring buffer with strict byte/count bounds;
- retain raw screenshots only when explicitly valuable as task evidence.

Important rule: controller vision remains the semantic recognizer. Local CV only reduces latency/token use and provides deterministic state-change evidence.

### G3 — Android structured observation

Purpose: obtain structured signals that pixels alone do not provide.

ADB path candidates:

- foreground package/activity;
- live display size/orientation;
- `uiautomator dump` when the app exposes useful accessibility nodes;
- window/activity state;
- battery/charging/thermal status;
- package/version information;
- safe performance/frame telemetry where Android exposes it without root.

Game UIs frequently render through custom surfaces, so accessibility/UIAutomator output is advisory and may be empty. Pixel observation remains authoritative for game state.

### G4 — Bounded action plans

Purpose: let the controller execute coherent tactical chunks without excessive round trips while retaining semantic checkpoints.

Extend mixed action steps conservatively with:

- `waitRegionChange`;
- `waitRegionStable`;
- `waitForeground`;
- `observeCheckpoint`;
- bounded retry of an idempotent UI action when the expected visual state did not change;
- stop-on-unexpected-state.

Do not add unbounded loops. The AI controller continues to own strategy and replanning.

Example:

```text
observe battle menu
-> tap start
-> waitRegionChange(battle area)
-> waitRegionStable()
-> observeCheckpoint
-> controller reasons about new state
```

### G5 — Game profiles

Purpose: remember how to inspect/control each game without hardcoding strategy in source.

A profile is operational metadata, not canonical knowledge.

Candidate fields:

```json
{
  "gameId": "seven-knights",
  "packageName": "...",
  "observedOrientation": "dynamic",
  "regions": {},
  "anchors": {},
  "navigation": {},
  "resourceGuards": {},
  "lastObservedVersion": "...",
  "updatedAt": "..."
}
```

Profiles may contain screen regions, stable navigation anchors and safe reusable control metadata. They must not contain passwords, credentials or unverified strategy claims.

### G6 — Game session state

Purpose: give any controller continuity during a long play session.

Bounded state can include:

- current game/package/version;
- current screen/state label;
- active party;
- observed roster subset;
- current stage/mode;
- recent actions/outcomes;
- current experiment/hypothesis;
- pending objective;
- resource balances relevant to a guardrail;
- recent screenshot/evidence references.

This is not long-term Memory. At session/task boundaries, only reusable proven lessons are promoted to Memory.

### G7 — Character, party and strategy intelligence

Purpose: allow the AI controller to judge “worthy or not”, build teams, experiment and learn.

Workflow:

```text
observe roster/stats
    +
current game/version
    +
durable prior experience
    +
fresh public meta when patch-sensitive
    |
    v
character assessment
    |
    +--> role
    +--> synergy
    +--> investment cost
    +--> current account fit
    +--> stage/mode fit
    +--> confidence/freshness
    |
    v
party proposal
    |
    v
play/experiment
    |
    v
outcome evidence
    |
    v
update/supersede strategy Memory when justified
```

A public tier list is evidence, not authority. Actual account roster, equipment, stage constraints and observed results can override generic meta advice.

### G8 — Companion APK v2 decision gate

Do not create a new APK merely because an APK is possible.

First inspect what the current companion can expose. Build v2 only for missing high-impact sensors.

Candidate high-impact APK capabilities:

1. **Accessibility event bridge**
   - foreground window transitions;
   - structured text/control nodes when games expose them;
   - event timestamps.
   - Must gracefully degrade for custom-rendered game canvases.

2. **Region capture / MediaProjection helper**
   - user-authorized screen-capture session;
   - crop regions on-device;
   - send reduced frames instead of full-screen images;
   - bounded frame ring;
   - no covert capture.

3. **Display and device telemetry**
   - exact orientation/display changes;
   - battery/thermal state;
   - foreground package;
   - network connectivity summary.

4. **Visual marker/overlay service**
   - preserve existing touch-through markers;
   - named calibration regions;
   - optional transient party/target markers.

5. **Local operational cache**
   - only calibration/profile/session state;
   - canonical strategy remains Agent Core Memory.

6. **Efficient event stream**
   - push meaningful state changes rather than requiring constant polling;
   - Agent Core remains the authority that decides what actions follow.

Explicit exclusions:

- no root;
- no game-process injection;
- no memory editing;
- no packet manipulation/interception;
- no anti-cheat bypass;
- no hidden autonomous gameplay authority;
- no premium-purchase automation without explicit intent.

### G9 — Companion build environment

If G8 proves worthwhile, provision a reproducible project-local Android build environment:

- JDK stored under `runtime\android\jdk`;
- Android SDK command-line tools under `runtime\android\sdk`;
- platform/build-tools limited to the versions required by the companion;
- Gradle wrapper committed inside the companion subproject;
- Gradle cache under `runtime\android\gradle-home`;
- downloads under `runtime\android\downloads`;
- hashes/manifests under `runtime\android\manifests`.

No installer may write toolchains to C:, Program Files, the user's global Gradle cache, or the global Android SDK.

### G10 — Memory/Learning integration

Do not store battle noise.

Good durable Memory candidates:

- proven stage mechanic;
- repeated successful counter;
- party synergy that repeatedly works;
- character evaluation tied to game version/mode/account context;
- navigation/calibration lesson that survives sessions;
- important failure lesson once a correction is proven.

Example durable record:

```text
Game: 7DS Grand Cross
Version/patch: <observed/current>
Mode: <mode>
Character/party: <entities>
Finding: <proven lesson>
Evidence: <battle/outcome refs>
Confidence: <bounded>
Reuse when: <conditions>
Supersedes: <older strategy if applicable>
```

Raw screenshots, temporary battle states and speculative ratings remain runtime/session evidence unless explicitly promoted.

### G11 — Web Research integration

For patch-sensitive decisions:

- identify current game/app version first;
- use Web Research for current official notes and trusted community/meta evidence;
- distinguish official mechanics from community ranking/opinion;
- store the date/version with any durable meta-derived Memory;
- supersede stale evaluations rather than accumulating contradictory tier claims.

### G12 — Safety and resource guardrails

Game Mode should know classes of risky action:

- premium/paid currency spend;
- real-money purchase;
- summon/pull using premium currency when not explicitly authorized;
- irreversible character/item dismantle;
- selling/consuming rare equipment/material;
- account linking/logout/deletion/security actions.

Routine battle actions, team changes, navigation, retries and reversible experimentation are low-risk when the user has asked the agent to play.

### G13 — Measurement

Every advanced primitive must justify itself.

Measure:

- average observe->decide-ready latency;
- bytes and approximate token load per observation;
- full-frame vs cropped-observation usage;
- number of AI round trips per battle/navigation objective;
- visual-state timeout rate;
- wrong-screen action rate;
- recovery rate after unexpected UI;
- transport latency ADB vs gateway;
- strategy reuse success;
- stale-memory corrections;
- long-session continuity.

If a new helper does not improve latency, accuracy, continuity or controller autonomy measurably, do not retain it merely because it is technically interesting.

## 7. Planned implementation order

### Wave A — Local USB control foundation

- stage the verified ADB trio project-locally;
- configure project-local ADB resolution;
- activate the already-built orientation/crop/burst/sequence changes;
- prove gateway fallback remains intact.

### Wave B — Perception efficiency

- region registry;
- multi-region observation;
- region difference/stability/change primitives;
- bounded screenshot/evidence ring.

### Wave C — Game session cognition

- game profile store;
- bounded game-session state;
- structured outcome records;
- Memory promotion rules;
- Web Research freshness/version convention.

### Wave D — Tactical execution

- conditional waits/checkpoints;
- stop-on-unexpected-state;
- bounded idempotent retry;
- latency telemetry;
- controller-facing action-plan diagnostics.

### Wave E — Companion APK v2

Only after Waves A-D identify concrete missing device-side signals.

- provision project-local Android toolchain;
- create `SubProject\android-game-companion`;
- implement only justified sensor/event capabilities;
- reuse the existing gateway/control authority;
- install APK to the authorized USB device only after build/package review.

### Wave F — Game-specific calibration

Start with representative titles:

- Seven Knights: landscape-oriented battle/menu flow;
- 7DS Grand Cross: portrait-oriented menu/roster/battle flow.

Calibration is data/profile work, not game-specific branching in core source.

## 8. Acceptance criteria

The implementation is not complete until the applicable criteria are demonstrated with user-authorized targeted verification:

1. Agent Core uses project-local ADB while USB is connected and gateway fallback when disconnected.
2. No C: or global toolchain state is required.
3. Portrait/landscape rotation does not invalidate normalized coordinates after fresh observation.
4. Crop/multi-region observations materially reduce image payload while retaining necessary game details.
5. Motion/stability waits stop on actual visual state rather than fixed timing alone.
6. A bounded mixed action plan can execute and return a final verified observation.
7. Unexpected UI stops or returns control instead of blindly continuing.
8. Game session state survives controller handoff without becoming canonical Memory noise.
9. A character/party assessment contains game version/context and can be updated/superseded.
10. Proven gameplay lessons can be retrieved in a future session and reused.
11. Any companion APK capability has a demonstrated advantage over host/gateway-only control.
12. Premium/irreversible resource guardrails remain intact.
13. No new second controller, Memory authority or remote gateway is introduced.
14. CODEBASE.md, changeset intent and implementation evidence stay synchronized.

## 9. Verification policy

This plan does not authorize a broad regression suite by itself.

Implementation-required builds are allowed. Before game/device acceptance, use bounded targeted checks and state exactly what will be exercised. Do not spend premium currency or destroy valuable game assets during verification.

## 10. Current disposition

The user approved implementation. Game Mode remains a first-class Agent Core capability, not a second agent/service. This plan is **IN PROGRESS**. ADB is now staged at `runtime/android/platform-tools` from the verified scrcpy bundle and sees the USB device; source/dist includes controller-independent Game Mode profiles, session state, visual classification, adaptive anchors, guarded workflows and new MCP tools.

**Still open:** supported resident Core reload and fresh connector exposure; game-screen calibration, battle/party acceptance and comparison across AI controllers; any companion APK build only when a real device-side sensing gap is established. Do not report these as verified outcomes.

## 11. Donor-grounded refinement — 2026-10-08

Source-first donor authority: `docs\Agent-Core-Game-Agent-Donor-Grounding-20261008.md`.

The donor review changes the implementation order without changing the single-controller architecture:

1. **4x-game-agent is the primary capability donor** for fast local state classification, adaptive anchor/template discovery, bounded world/session state, timer prediction and verified workflows.
2. **mobile-use is the primary Android semantic donor** for optional UI hierarchy, foreground/app guard, bounded screen recording and short-lived structured task state. Its LangGraph/multi-agent runtime is not adopted.
3. **BOT-MMORPG-AI is a selective advanced donor** for typed game profiles, normalized important regions, action taxonomy/cooldowns, no-progress detection and future demonstration/learned-perception work. Its PyTorch stack is not a baseline dependency.
4. **SerpentAI is a historical pattern donor only** for bounded recent-frame rings, composable frame transforms and frame/input alignment. Redis/WAMP/offshoot are rejected.

Updated near-term implementation order:

- **G1:** project-local ADB + latency/transport metrics;
- **G2A:** 4x-derived profile-defined fast screen-state classifier;
- **G2B:** 4x-derived adaptive anchors with hit/miss confidence + verified visual-template capture;
- **G3:** 4x-derived `GameSessionModel` with field freshness, timers and predicted next events;
- **G4:** verified workflows with typed preconditions/postconditions/evidence/recovery;
- **G4B:** mobile-use-derived foreground app guard + optional ADB UI hierarchy;
- **G4C:** BOT-MMORPG-derived action categories/cooldowns + evidence-based no-progress detector;
- **G4D:** Serpent-derived bounded recent-frame ring;
- **G4E:** mobile-use-derived on-demand screen recording;
- **G8+:** user-demonstration capture and optional learned local recognizer only after measured need.

Licensing rule: donor checkouts remain inspection-only under `runtime\tmp\game-agent-donors`; production code must live in normal Agent Core owners. Any substantial copied/adapted MIT or Apache-2.0 source must be attributed with repository + pinned commit in the project third-party notices and retain applicable license/NOTICE obligations.

## 12. Implementation checkpoint — 2026-10-08 (source/dist; acceptance pending)

| Workstream | Current implementation evidence | Remaining acceptance |
| --- | --- | --- |
| G0/G1 USB/transport | ADB 37.0.1 staged inside `runtime/android/platform-tools`, USB Z2465N detected; `auto` prefers local ADB and falls back to gateway on read-only failures; operation latency metrics are collected | fresh resident reload, USB/gateway device-level behavior |
| G2 local perception | normalized named regions, RGB/darkness/brightness/contrast classifier, ambiguity abstention, adaptive template anchors with per-version freshness, bounded JPEG frame ring | in-game real UI classification, coordinate calibration, measured token/latency savings |
| G3 structured Android | ADB foreground, UIAutomator hierarchy, package/version and device battery/thermal telemetry; status/profiles readable by all controllers | real game hierarchy availability, performance overhead |
| G4 tactical execution | bounded action sequences, region change/stability, foreground guard, app-guarded semantic workflows requiring reversible action definitions; no irreversible economy/premium action paths | in-game pre/postcondition and unexpected-UI scenarios |
| G5–G7 profiles/cognition | installed-game profiles for Seven Knights Re:BIRTH and 7DS Grand Cross; durable operational session state, controller labels, party/roster/resource fields, evidence-referenced outcomes and comparison | account roster/party/character/stage grounding and evidence-based strategy reuse |
| G8/G9 companion APK | existing gateway overlay/sensors reused; no new APK or toolchain installed | prove concrete device-side missing sensor, then choose/build locally if justified |
| G10–G13 learning/evaluation | controller uses existing canonical Memory/Learning/Web Research; game observations remain bounded runtime state, no independent Memory DB; scoreboards scoped to comparable evidence | genuine multi-session/multi-controller play evidence and outcome-quality review |

### Source/API compatibility

- Public MCP tools: `phone_game_inspect` (read-only) and `phone_game_manage` (mutating), registered by the existing Phone owner and included in Native Agent capability grants.
- On-demand Game Mode API guide returned via `phone_game_inspect(action=status)` rather than exposing large duplicated nested schemas on every handshake. Full runtime validation remains active.
- The release compatibility scripts include these registration/schema files; final TypeScript build exit 0 and release compatibility `ok=true`, no removed tools, `breakingEvidence=false`, manifest `119735/120000` bytes.
- No broad test suite was run. No resident launcher reload, Android game manipulation or APK installation was performed. This checkpoint is not a completed acceptance claim.

## 13. Fresh-connector Android acceptance checkpoint — 2026-10-08

Full evidence: `docs/Game-Mode-Live-Acceptance-20261008.md`.

| Area | Proven so far | Remains open |
| --- | --- | --- |
| Connector/runtime | New read/write Game Mode MCP tools reachable after creator restart; project-local ADB and gateway both online | Restart again for source/dist hotfixes made *after* this restart |
| Device orientation | Seven Knights live landscape 2392x1080 and 7DS live portrait 1080x2392 | Rotation within one running game and sustained device handoff |
| Screen intelligence | Crop, burst, named regions, real hero/roster screens and verified anchors; 7DS two saved frames classify correctly offline | More scenes, updates, loading transitions, false-positive rates, runtime postcondition after reload |
| Gameplay control | Both games reached live Heroes screens, reversible guarded navigation executed; character detail read without premium spending | Live battle/win/loss verification, strategy/party quality, false-stuck recovery, cross-controller comparisons |
| Android semantic data | UIAutomator on 7DS reveals only a Unity SurfaceView; device telemetry available | Reliable gateway companion foreground package and optional efficient sensor event stream |
| Safety/continuity | No purchases/summons/valuable asset edits; operation evidence persisted in bounded game sessions | End-to-end verified action decisions across controller handoff and long unattended sessions |
| Quality gates | Current Game Mode/MCP/capability targeted set 23/23 pass, TypeScript build and MCP release-compat pass | Repository-wide suite red due independently observed portability, Git fixture and Windows symlink failures |

The installed companion can already stream screenshots, but its gateway observation reported its **own app package** instead of the real game, while ADB observed the game. For guarded control, prefer `transport=adb` when USB exists. Do not bypass foreground mismatch on gateway by assuming its screenshot implies ownership. APK v2 is now a justified *candidate* for accurate device-side foreground sensing, not an automatic install/deployment authorization.

Controller working memory remains operational game session state in `runtime/phone`; only verified reusable engineering/gameplay lessons should be promoted to canonical Memory. Source/dist hotfixes since the creator's first restart are not considered resident-active until a supported reload and fresh connector observation.
