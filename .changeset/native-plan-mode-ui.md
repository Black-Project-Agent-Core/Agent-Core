---
"agent-core": minor
---

Added the Plan mode toggle (C# + UI): a second composer button next to Goals (ClipboardList icon, "Plan mode" aria-label, same disabled rule as Goals) that turns on `planMode` for the next turn and turns Goals off, and vice versa. The launcher forwards `planMode` to Core exactly like `goalMode`; the composer, App and host types carry it through to the sent request.
