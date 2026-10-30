---
"agent-core": patch
---

Add Background tasks, Connectors and Environment cards to the launcher Inspector (PANEL-2). Background tasks lists running steps from the latest turn with tool name, args summary and running duration. Connectors shows Agent Core subsystem health from `snapshot.health` with coloured status dots. Environment replaces the old workspace footer with a `dl/dt` list: Workspace, Root, Core (port + healthy/tidak sehat), Version. CSS adds `.inspector-bg-`, `.inspector-conn-`, `.inspector-env-` and `.inspector-dot` rules. New test `LauncherInspectorPanels.test.tsx` covers the four cases. PANEL-1 OPEN reduced to PANEL-3 only.