---
"agent-core": minor
---

Native and the external controller now work in the owner's real user profile instead of Core's redirected one: tool shells get the real HOME, USERPROFILE, APPDATA and LOCALAPPDATA, and `~` in file tools means the real profile. The delete guard protects that real profile. The Native prompt states that its access is not tied to the workspace (a folder limit applies only when the owner sets one) and that a refusal it must honor ends the work as OPEN instead of looping.
