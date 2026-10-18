# Agent Core Full-System Anatomy

This is a **standalone interactive documentation artifact**, authored with the original Anatomy isometric rendering kit. It is not part of the production UI and does not query or change live Agent Core state.

- **Open:** Double-click `OPEN-AGENT-CORE-ANATOMY.cmd`, or open `Agent-Core-Full-Anatomy.html` in a recent Chrome/Edge browser.
- **Modules:** Controller, Memory, Code Intelligence, Verification, Interfaces, Learning, Machine Control, and Governance.
- **Motion:** Central piston, four memory drawers, scanner carriage, machine gantry, Learning plunger, I/O beacon, animated links, and an optional exploded view.
- **Interact:** Click a machine module or right-hand section; use arrows, Home, End on the focused diagram or navigation.
- **Controls:** Pause/resume motion and open/close Exploded View. Respects reduced-motion settings.
- **Regenerate:** Run `E:\Projects\Agent-Core\runtime\node\node.exe build.mjs` from this folder. Builder uses the existing sibling `E:\Projects\anatomy` kit; the generated HTML is self-contained.
- **Architecture basis:** `docs/CODEBASE.md`, `src/memory/host-runtime.ts`, MemoryService, FileMemoryStore and established tool composition. The figure is an explanatory analogy, not a live health/dashboard view.

No credentials, private notes, Git operations, Agent Core runtime code, or external uploads are involved.
