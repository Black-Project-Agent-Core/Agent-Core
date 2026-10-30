---
"agent-core": patch
---

Make tool steps of a running Native chat turn appear in the open conversation without switching sessions, including turns delegated from outside the launcher. Step and progress writes now move the conversation's updated time, and the launcher polls every 1.5 seconds (instead of 4) while the open conversation has a running turn.
