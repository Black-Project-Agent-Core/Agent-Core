---
"agent-core": patch
---

Native Anthropic turns now stream. The provider reassembles the event stream into the same message a non-streaming call returns, so long max-effort calls on large contexts no longer fail at the silent-wait timeout; mid-stream errors and cut connections are classified like their non-streaming equivalents. Readiness probes and other providers are unchanged.
