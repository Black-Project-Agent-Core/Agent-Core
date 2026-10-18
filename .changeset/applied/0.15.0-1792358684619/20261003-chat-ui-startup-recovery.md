---
"agent-core": patch
---

Repair Native Agent Chat startup recovery across mixed launcher/UI versions: wait for healthy Core readiness, retry conversation loading after transient startup failures, clear stale error banners, auto-open the newest available thread, keep the composer inside the viewport while the transcript scrolls, and bridge Agent Chat health/counts through the launcher snapshot when available.