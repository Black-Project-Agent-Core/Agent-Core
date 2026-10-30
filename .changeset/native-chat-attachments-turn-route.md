---
"agent-core": minor
---

Native chat turns accept attachments. `POST /agent/chat/conversations/:id/turns` takes an optional `attachments` array from the owner's UI; an external controller is refused. The files are stored before the model runs, the model receives a `USER ATTACHMENTS` block (rebuilt from the store on every run and resume), later turns see one history line per file with its path, and the conversation detail returns attachment metadata per turn without content.
