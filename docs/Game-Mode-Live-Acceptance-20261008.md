# Agent Core Game Mode — Fresh-Connector and Live Android Acceptance

**Date:** 2026-10-08  
**Status:** PARTIAL ACCEPTANCE. Core resident was restarted before these tests, but further source/dist fixes made afterward require a new supported reload. Full project test suite is not green.  
**Plan:** `docs/Agent-Core-Advanced-Android-Game-Mode-Plan-20261008.md`

## Ownership and boundaries

Game Mode is an integrated Agent Core capability owned by `src/phone` and `src/mcp/phone-*`, exposed to ChatGPT and Native Agent through the existing MCP/permissions. It is not another agent, gateway or Memory store. Tests avoided real-money purchases, premium currency, summon, and item/character deletion. No autonomous background gameplay loop was started.

## Fresh connector and USB transport — observed

- `phone_game_inspect` and `phone_game_manage` were callable on the fresh connector after launcher restart.
- ADB 37.0.1 project-local at `runtime/android/platform-tools` detected Nubia Z2465N online; companion gateway was online too.
- Operator configuration remains `configuredMode=gateway`. Explicit `transport=adb` was used for live guarded gameplay; no persistent operator setting was changed.
- Screenshot and crop/burst observation worked through ADB. A three-frame stationary crop yielded stability=true with zero frame difference.
- Screenshot geometry was observed at Seven Knights `2392x1080` (landscape) and 7DS Grand Cross `1080x2392` (portrait).

## Seven Knights Re:BIRTH — live acceptance

- Installed game profile `seven-knights-rebirth` / `com.netmarble.tskgb`, version `1.29.03`.
- Entered game lobby, dismissed launch announcements and the check-in result, opened Heroes, and navigated from Rosie to Dellons. No battle outcome was claimed.
- Configured named regions `hero_name`, `hero_stats`, `hero_skills`, `hero_roster`. Anchor `hero_skills_tab` was visually verified at similarity approximately 0.9997.
- Observed Dellons display: Legendary, level 30; Physical Attack 3550, Defense 1192, HP 8643, Speed 33. These are UI observations, not proof that a character is optimal or worth investing in.
- Session `seven-knights-live-acceptance-20261008` retains controller label, relevant roster observations and screenshot evidence under `runtime/phone/sessions`.
- A live `phone_game_manage(workflow)` with reversible `hero_select` confirmed app guard and navigation. The immediate post-action frame still showed the previous character; a later frame showed Dellons. Original no-progress scoring missed this delayed change. Source/dist was revised to poll bounded read-only post-action observations and compare important regions before marking progress.

## 7DS Grand Cross — live acceptance

- Installed profile `7ds-grand-cross` / `com.netmarble.nanagb`, version `2.113.1`.
- Entered Tavern, opened Heroes, then opened UR level-100 `[The Seven Deadly Sins] Nemesis Meliodas` via a guarded reversible workflow.
- Observed character properties from actual game UI: Darkness, Demon, Combat Class 54781, Attack 13982, Defense 8538, HP 143879, Affinity Lv.5. These are scoped to this observed character/version; no tier-list or battle win was inferred.
- Calibrated `top_resources`, `daily_tasks`, `heroes_nav`, `battle_nav`, `heroes_roster`, `heroes_search`, `heroes_team_actions`, `hero_detail_identity`, `hero_detail_stats`, `hero_detail_skills` and `hero_detail_controls`.
- Saved and verified visual anchors `tavern_heroes_nav` and `hero_detail_action_bar`; action-bar anchor similarity approximately 0.981 on immediate verification.
- Stored rule-based `heroes_roster` and `hero_detail` classifications from two grounded screens. Compiled local classifier identified both stored samples correctly at confidence 1.0 (2/2 examples only; no generalization claim).
- Session `grand-cross-live-acceptance-20261008` retains the observed character details, navigation evidence and measured resources. No permanent team or equipment changes were made.

## Android semantic sensing gaps

- UIAutomator on 7DS returned one `android.view.SurfaceView` / `unitySurfaceView` node, without in-game text or semantic buttons. Screenshot/region vision remains required.
- Gateway `android_observe` captured the visible game but reported `com.joe.androidagentbridge` as the foreground package, while USB ADB reported `com.netmarble.nanagb`. This makes gateway-only guarded gameplay unreliable until the companion provides independently trustworthy game foreground evidence. Keep guard fail-closed; use ADB when USB is available.
- Existing gateway tool inventory lacks a dedicated foreground-app tool. The source-built `phone_game_inspect(action=status)` now returns transport guidance instead of guessing gateway foreground identity.
- Screenshot crop samples from both transports worked. Connector round-trip time was dominated by tool orchestration and is not a valid transport-only latency comparison.
- Companion APK v2 remains a conditional future candidate for accurate device-side foreground events and efficient visual capture. It was not built or installed in this acceptance.

## Regression and broad test evidence

- Live acceptance uncovered Sharp `toColourspace('rgb')` failing with `vips_colourspace: no known route from 'srgb' to 'rgb'`. Source/dist uses `srgb` and targeted classifier tests pass; resident was still running the earlier code and returned that error until another supported reload.
- Repaired `phone_run_macro.expectedPackage` forwarding, region-sensitive progress detection, bounded post-action re-observation and anchor jitter/drift behavior in source. Dedicated regression cases were added.
- Latest targeted run: `tests/game-mode-advanced.test.ts` 9/9, `mcp-manifest-contract` 3/3, `mcp-schema-contract` 2/2, `agent-capability-resolver` 9/9 = **23/23 passed**.
- TypeScript build exit 0, `release-compat` ok=true, breakingEvidence=false; 74 registered tools, MCP manifest 119735/120000 bytes. Earlier path-policy check passed.
- Full project Vitest attempts exited nonzero. A 25-file batch had 231 passing and 4 failing assertions (Windows symlink/reparse EISDIR; authenticity/portability undefined project root and cleanup ENOTEMPTY). A separate 10-file browser/capability batch had 42 passing tests and one startup-failing bridge-runtime suite (`preparePortableRuntime` projectRoot undefined). Another 15-file batch had 6 failing Claude-Mem adoption tests at temporary Git repository setup (`git config ... fatal: not in a git directory`). Do not classify the whole project suite as passing; remaining suites were not exhaustively accepted.

## Remaining acceptance

1. Reload Agent Core through the supported launcher path to activate all fixes built after the first restart; confirm resident `srgb` classifier and post-action visual waits on a fresh connector.
2. Verify Game Mode conditional pre/postconditions in real game UI, error recovery from unexpected overlays, and app guard on USB without invoking irreversible actions.
3. Calibrate a safe free battle/party scenario and distinguish UI transition evidence from actual victory/loss, resource cost and learning effect.
4. Compare actual controller outcomes on equivalent version/mode/stage/party conditions; the existing scoreboard is not yet a proof of model quality.
5. Review independent non-Game-Mode failing suites as a separate scoped engineering task before claiming repository-wide test health.
6. Investigate companion APK v2 only after confirming the precise sensor improvement compared with host ADB and existing companion.
