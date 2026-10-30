---
"agent-core": patch
---

Add the "/" menu to the Native chat composer. Typing "/" lists the `/compact` command and the active Skills; arrow keys, Enter, Tab and Escape work, and choosing a Skill inserts `/<skill> ` so the server can apply it to that turn. `/compact` asks the running turn to compact its context and is never sent as a chat message. The composer now stays enabled while a turn runs so `/compact` can be typed, and the Inspector Compact row shows the room left before auto-compact next to a "Compact session" button.
