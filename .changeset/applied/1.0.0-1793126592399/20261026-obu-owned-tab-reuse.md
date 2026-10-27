---
"agent-core": patch
---

Open Browser Use reuses the owner's existing task tab instead of creating another one: a repeated `open` returns the same session and tab (`reused: true`), and a different URL navigates that tab. Concurrent opens for one owner are serialized so they cannot each create a tab. Session expiry closes the owned tab as well as dropping the connection.
