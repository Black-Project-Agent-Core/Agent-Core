---
"agent-core": minor
---

Rebuild the launcher pages and interactions around the user-supplied prototype: grouped navigation, workspace composer and inspector, dashboard, tools, model cards, Memory, Goals, Artifacts, Dreaming Review, runtime, activity, diagnostics, settings and setup review. Preserve the Agent Core name, existing icons and authenticated host behavior. Keep the former page components as legacy fixtures and clearly mark prototype controls whose backend integration is deferred. Let users apply window-size presets immediately, edit dimensions, and persist the actual native window size across full restarts.

Reject a missing single-file host during launcher publication. Restart now requires the actual Agent Core window and a fresh, identified healthy Core; runtime-error dialogs and failed readiness return failure. Allow up to 300 seconds for cold startup and keep the wrapper receipt budget in sync, while preserving the single-launch boundary.

Combine the composer's provider and Anthropic model choices into one dropdown, preserving model-specific reasoning and per-message routing.

Park recovered chat turns after restart until explicit Continue. Keep running conversations switchable, drafts and replies scoped to their conversation, and completion correlated to its request. Goals mode now marks the existing Native turn and shows its real instruction/status with safe checkpoint Pause, Continue and Stop. Keep the composer focus border inside its rounded outer frame.
