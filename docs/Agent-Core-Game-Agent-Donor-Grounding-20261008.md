# Agent Core Game-Agent Donor Grounding

**Status:** SOURCE-GROUNDED DONOR REVIEW — PLAN INPUT ONLY  
**Date:** 2026-10-08  
**Parent plan:** `docs/Agent-Core-Advanced-Android-Game-Mode-Plan-20261008.md`  
**Temporary donor root:** `runtime/tmp/game-agent-donors`  

## 1. Purpose

This review answers one question: which existing game/mobile-agent capabilities are valuable enough to adapt into Agent Core so the Game Mode roadmap does not re-invent proven patterns.

Agent Core remains the single controller/body. Donor architectures are capability references, not new authorities. The target is selective adoption into the existing `src/phone` and `src/mcp/phone-*` ownership plus existing Memory/Learning/Web Research, not a parallel Python agent platform.

## 2. Grounded donor pins

| Donor | Clone ref inspected | License | Disposition |
| --- | --- | --- | --- |
| sonpiaz/4x-game-agent | main @ `de7f073040e3741800ff428c60e23f88870bb0b6` | MIT | **Primary donor** |
| minitap-ai/mobile-use | main @ `62913c933e21b27da353a89316a09f60525af496` | Apache-2.0 | **Primary Android sensor/control donor** |
| ruslanmv/BOT-MMORPG-AI | master @ `1bbe2aae4adff2ed8c7966f7c3f591b39f4ae47b` | Apache-2.0 | **Selective advanced donor** |
| SerpentAI/SerpentAI | dev @ `00a487dd088c6ca2528d025f3273c0a796efe210` | MIT | **Historical pattern donor only** |

SerpentAI is archived and its inspected branch has no meaningful recent implementation activity after 2020. The other three inspected donors were active in 2026.

## 3. Ranking

### #1 — 4x-game-agent

**Fit:** very high.

The strongest architectural match is its layered split:

```text
local perception
    -> state machine
    -> persistent world model
    -> verified workflow engine
    -> strategic LLM / fallback
```

For Agent Core, the last layer maps to the current external or Native AI controller; no second LLM wrapper is required.

### #2 — mobile-use

**Fit:** high for Android-device semantics, medium for games.

Its README explicitly notes that games often provide poor accessibility-tree data. That makes its UI hierarchy valuable as a side-channel, not a game-state authority.

Strong areas are structured Android screen data, app-foreground guarding, UI element bounds, Unicode-safe text paths, and bounded screen recording.

### #3 — BOT-MMORPG-AI

**Fit:** high for profile/action/temporal-learning concepts, low as a default dependency.

It contains useful typed game profiles, normalized important regions, action taxonomy/cooldowns, temporal models, data collection, motion/stuck detection, and training/inference separation. The full PyTorch/TorchVision/TIMM stack is too heavy to become a baseline Game Mode dependency.

### #4 — SerpentAI

**Fit:** useful concepts, low implementation reuse.

The old framework contributes good ideas around frame rings, frame transformation pipelines, named screen regions and synchronizing user input with recent frames. Its Redis/WAMP/offshoot architecture and old Python ecosystem do not fit current Agent Core.

## 4. Adopt from 4x-game-agent

### A. Fast local screen-state classification — ADOPT

Source grounding:
- `games/kingshot/screen_analyzer.py`

Valuable behavior:
- normalized screen regions;
- brightness/color/contrast features;
- popup overlay detection;
- cheap screen-change detection;
- fast deterministic classification before OCR/AI;
- ambiguous state falls back to richer perception.

Agent Core adaptation:

```text
phone_observe
   |
   +-- cheap local feature extraction
   |      region mean/std/color/edge/change
   |
   +-- known state confidence high?
   |       yes -> typed screen-state observation
   |       no  -> controller vision / optional OCR / richer sensor
```

This directly reduces full-frame AI inspection and helps long play sessions.

Do not copy Kingshot-specific thresholds into core. Thresholds belong in per-game profiles.

### B. Adaptive visual-anchor discovery — ADOPT

Source grounding:
- `agent/template_match.py`
- `games/kingshot/building_finder.py`

Valuable behavior:
- template lookup first;
- cached coordinate second;
- defaults/exploration as fallback;
- successful target discovery increases trust;
- misses reduce trust and can invalidate stale positions;
- dynamically capture a visual template after a verified successful discovery.

Agent Core target record:

```json
{
  "anchorId": "party.edit",
  "region": [0.0, 0.0, 1.0, 1.0],
  "position": [0.82, 0.91],
  "templateRef": "...",
  "hits": 18,
  "misses": 2,
  "confidence": 0.90,
  "lastVerifiedAt": "...",
  "gameVersion": "..."
}
```

This is more valuable than hardcoded coordinates.

Initial Agent Core implementation should reuse existing Sharp/image primitives and normalized region comparison. A project-local OpenCV helper should only be added if measured matching quality justifies it.

### C. World model + timer prediction — ADOPT STRONGLY

Source grounding:
- `games/kingshot/world_model.py`

Valuable behavior:
- observed state is updated incrementally instead of reconstructed from scratch;
- per-field observation age;
- timer end prediction;
- next-event prediction;
- cached-position reliability;
- bounded historical metrics.

Agent Core adaptation:
- operational `GameSessionModel` under `runtime/phone/sessions`;
- no duplicate long-term knowledge database;
- every field carries `observedAt`, optional `expiresAt` / confidence / evidence;
- predicted state is explicitly distinguished from observed state.

This is one of the highest-value donor ideas.

### D. Verified workflow engine — ADOPT STRONGLY

Source grounding:
- `games/kingshot/workflow_engine.py`

Donor pattern:

```text
ensure expected screen
-> act
-> verify visual change
-> identify resulting state
-> update world model
-> recover/replan on mismatch
```

Agent Core already has mixed action sequences and `waitStable`; the missing upgrade is semantic pre/post conditions.

Target step contract should support:
- `precondition`;
- action;
- expected screen/anchor/region change;
- timeout;
- idempotent retry policy;
- recovery target;
- evidence checkpoint.

This eliminates blind macro behavior.

### E. Strategic cadence / smart idle timing — ADOPT AS SCHEDULING LOGIC

Source grounding:
- `games/kingshot/engine.py`
- `docs/architecture.md`

The useful part is not its Claude calls. It is the principle that deterministic local state handles routine cycles while high-level reasoning is requested only when strategically useful, uncertain or stuck.

Agent Core controller is already the strategic brain, so the adaptation is:
- keep rich semantic reasoning on milestones/uncertainty;
- use local state transitions for deterministic waits and verification;
- schedule observations around predicted events rather than polling at a constant rate.

### F. Reflection store — DO NOT ADOPT AS A STORE

Source:
- `agent/reflection.py`

The success/failure scoring concept is useful, but Agent Core already owns Memory, Learning, retrieval/use receipts and Reflexion discipline. Creating `reflections.json` would duplicate authority.

Steal the signal:
- workflow success count;
- failure count;
- correction;
- reuse rate.

Route it into existing Learning/Memory.

## 5. Adopt from mobile-use

### A. Combined screenshot + hierarchy observation — ADOPT AS OPTIONAL SENSOR

Source:
- `controllers/android_controller.py`
- `clients/ui_automator_client.py`

Its screen-data contract combines:
- screenshot;
- width/height;
- flattened UI hierarchy;
- text/content description;
- resource ID;
- bounds;
- clickable/selected/focused state.

Agent Core should first implement a dependency-light ADB `uiautomator dump` side-channel. If that proves insufficient and UIAutomator2 has measurable benefit, a project-local Python helper can be considered.

Game canvas pixels remain authoritative because many games expose little useful accessibility data.

### B. App lock / foreground guard — ADOPT STRONGLY

Source:
- `agents/contextor/contextor.py`

Useful behavior:
- know which package should currently own the screen;
- detect unexpected package transitions;
- stop/recover instead of sending game coordinates into Android launcher/system UI.

Agent Core target:

```text
expectedPackage = game package

before action:
  foreground == expectedPackage ? proceed : stop/recover

after transition:
  package changed unexpectedly ? return control / bounded relaunch
```

This has immediate safety and reliability value.

### C. Subgoal state and explicit replanning — ADOPT CONCEPT, NOT MULTI-AGENT STACK

Source:
- `agents/planner`
- `agents/orchestrator`
- `agents/cortex`
- `agents/executor`
- `graph/state.py`

Valuable:
- typed subgoals;
- explicit completion/failure;
- replan when a subgoal fails;
- clear short-lived screenshot/UI state after it has served a decision.

Do not adopt LangGraph or four internal agent personalities. Agent Core already has one controller/native-agent ownership model.

### D. Android screen recording — ADOPT ON DEMAND

Source:
- `controllers/android_controller.py`
- `tools/mobile/video_recording.py`

Useful:
- ADB `screenrecord`;
- bounded duration;
- pull result;
- clean device-side temporary files.

Use cases:
- inspect a battle sequence;
- learn timing;
- collect a short calibration trace;
- compare repeated results.

Do not record continuously by default.

### E. Automatic package removal — EXPLICITLY REJECT

The inspected UIAutomator2 client automatically checks for and uninstalls a Maestro package because of a conflict.

Agent Core must not adopt this behavior. A sensor conflict should be reported to the controller/user; no unrelated Android package should be silently removed.

## 6. Adopt from BOT-MMORPG-AI

### A. Typed game profiles — ADOPT STRONGLY, SIMPLIFIED

Source:
- `config/profile_loader.py`
- `game_profiles/_template/profile.yaml`
- representative profiles such as `genshin_impact/profile.yaml`

Useful profile concepts:
- game ID / package / version;
- normalized important regions;
- action space;
- task types;
- task-specific temporal requirement;
- desired observation cadence;
- UI scale information.

Agent Core profile should be much smaller and focused on mobile-control semantics rather than ML training parameters.

Recommended Agent Core shape:

```json
{
  "gameId": "...",
  "packageName": "...",
  "version": "...",
  "regions": {},
  "anchors": {},
  "actions": {},
  "states": {},
  "resourceGuards": {},
  "taskPolicies": {},
  "updatedAt": "..."
}
```

### B. Action taxonomy / cooldown semantics — ADOPT

Source:
- `config/action_mapping.py`

Useful:
- action category;
- toggle vs momentary;
- cooldown;
- mutually exclusive groups.

Agent Core mobile categories should be game-oriented:
- navigation;
- battle;
- skill/card;
- party/formation;
- roster/character;
- inventory;
- economy;
- summon;
- premium-sensitive;
- system/account.

This improves tactical planning and prevents rapid accidental repetition.

### C. Stuck detection with history + cooldown — ADOPT, CHANGE RECOVERY

Source:
- `scripts/test_model.py`

The donor keeps motion history and has a cooldown before another stuck recovery.

Agent Core should adopt:
- expected movement/change;
- rolling no-progress evidence;
- recovery cooldown;
- escalating diagnosis.

Do **not** adopt random evasive movement as the generic recovery. Agent Core should re-observe, classify state, use a known recovery path or ask the controller to replan.

### D. User-demonstration learning pipeline — DEFERRED HIGH-VALUE ADOPTION

The repo records user gameplay and trains visual-action models.

This could become an optional later Agent Core mode:
- capture short user demonstrations;
- align frame/touch/action/outcome;
- extract anchors, timings and common routes;
- optionally train a small local recognizer only when enough data exists.

Do not introduce PyTorch/TorchVision/TIMM as baseline dependencies.

### E. Temporal neural models — DEFER

EfficientNet/LSTM/Transformer ideas are only justified if:
- deterministic perception is insufficient;
- sufficient labeled demonstrations exist;
- measured accuracy/latency improves.

No ML model should be installed merely because the donor includes one.

## 7. Adopt from SerpentAI

### A. Bounded recent-frame ring — ADOPT CONCEPT

Source:
- `frame_grabber.py`
- `game_frame_buffer.py`

Agent Core target:
- in-memory recent frame metadata;
- optional bounded project-local spill;
- sample last N frames by timestamp/offset;
- no Redis.

Useful for:
- temporal comparison;
- recovering the seconds before a failure;
- battle transition analysis;
- user demonstration capture.

### B. Composable frame transformation pipeline — ADOPT CONCEPT

Source:
- `frame_transformation_pipeline.py`

Existing Sharp support already covers much of resize/crop/encoding. Extend current image primitives only as needed; do not introduce Serpent’s old transformation stack.

### C. User-input/frame synchronization — DEFERRED, POTENTIALLY POWERFUL

Source:
- `game_agent.py`
- `input_recorder.py`

The powerful idea is timestamp-aligning recent frames with human inputs for demonstration learning.

For Android this belongs in a future explicit “Teach Game Mode” session, potentially using companion touch-event capture. It must be opt-in and bounded.

### D. Redis/WAMP/offshoot/plugin runtime — REJECT

Do not bring SerpentAI’s runtime architecture into Agent Core.

## 8. Selected combined architecture

The best result is not picking one donor wholesale.

```text
                         AI CONTROLLER
                              |
                 Memory + Web Research
                              |
                              v
                    GAME SESSION MODEL
                  [4x world-model pattern]
                              |
          +-------------------+-------------------+
          |                                       |
          v                                       v
 FAST LOCAL PERCEPTION                    STRUCTURED ANDROID SENSOR
 [4x screen analyzer]                     [mobile-use hierarchy/app]
          |                                       |
          +-------------------+-------------------+
                              |
                              v
                    STATE CLASSIFICATION
                              |
                    uncertain? -> AI vision
                              |
                              v
                 VERIFIED WORKFLOW EXECUTOR
                    [4x verification pattern]
                              |
            +-----------------+------------------+
            |                                    |
            v                                    v
      ACTION SEMANTICS                       APP GUARD
    [BOT-MMORPG pattern]                 [mobile-use pattern]
            |                                    |
            +-----------------+------------------+
                              |
                              v
                      ADB / GATEWAY
                              |
                              v
                         ANDROID GAME
                              |
                              v
                RECENT FRAME / EVENT RING
                  [Serpent pattern, bounded]
                              |
                              v
                 outcome / stuck / evidence
                              |
               +--------------+--------------+
               |                             |
               v                             v
          replan/recover            proven durable lesson
                                             |
                                             v
                                      Agent Core Memory
```

## 9. Exact priority for Agent Core

### P0 — Keep the already-built phone improvements

Do not regress:
- live orientation;
- crop/burst;
- motion difference;
- mixed sequence;
- waitStable;
- companion overlay.

### P1 — 4x-derived fast state classifier + profile-defined regions

Highest immediate impact.

### P2 — 4x-derived adaptive anchors with hit/miss confidence and verified template capture

Removes fragile static coordinate dependence.

### P3 — 4x-derived GameSessionModel with observation age and predicted timers/events

Makes the controller reason over persistent game state rather than screenshots alone.

### P4 — 4x-derived verified workflow contract

Precondition -> action -> postcondition -> evidence -> recovery.

### P5 — mobile-use-derived app guard + optional UI hierarchy

Makes Android interaction safer and more structured.

### P6 — BOT-MMORPG-derived action semantics, cooldowns and task profiles

Gives tactical execution a richer action model.

### P7 — BOT-MMORPG-derived stuck/no-progress detector

Use evidence-based replan/recovery, not random movement.

### P8 — Serpent-derived bounded frame ring

Adds temporal evidence without a new database.

### P9 — mobile-use-derived on-demand screen recording

Useful for battles and timing analysis.

### P10 — demonstration mode

Combine Serpent frame/input alignment with BOT-MMORPG training philosophy. First use demonstrations to learn regions/anchors/timing. ML training is optional later.

### P11 — optional learned local perception

Only after measured evidence justifies a project-local ML runtime.

## 10. What should not be installed as baseline

Do not make these baseline dependencies:
- LangGraph;
- Redis;
- WAMP/Crossbar;
- Serpent offshoot;
- PyTorch/TorchVision/TIMM;
- PaddleOCR/PaddlePaddle;
- Docker;
- a second provider/LLM agent stack.

They may be evaluated later in isolated project-local environments only when a measured gap justifies them.

## 11. Code reuse / license discipline

The donor licenses are permissive, but source reuse must stay traceable.

- MIT donors: preserve copyright/license notice for substantial copied/adapted portions.
- Apache-2.0 donors: preserve required license/NOTICE/attribution and mark modified files when substantial source is adapted.
- Prefer Agent Core-native TypeScript ports of bounded algorithms and contracts over vendoring entire projects.
- Record every substantial donor-derived implementation in `THIRD_PARTY_NOTICES.md` or a dedicated NOTICE section with repository, pinned commit and affected Agent Core files.
- Ideas and architecture patterns can be reimplemented cleanly; verbatim/substantial source reuse must retain licensing obligations.

## 12. Donor clone lifecycle

The four checkouts under `runtime/tmp/game-agent-donors` are inspection-only and are not runtime dependencies. Do not make Agent Core depend on those paths. Production behavior must live under ordinary Agent Core source/runtime owners.

No donor checkout should be published inside a release archive as an accidental runtime dependency.
