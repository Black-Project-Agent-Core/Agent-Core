---
"agent-core": minor
---

Add a per-Skill on/off switch for Native on the server. A Skill that is off cannot be inspected, read, selected from the "/" menu or declared as used by Native, and it is left out of Native's skill guidance; Native may ask the owner in its reply to switch it on, and a refusal is not permanent. External controllers are unaffected. New routes `GET /agent/skills` and `POST /agent/skills/<name>/native-enabled` expose the state; the Skill page that uses them comes next.
