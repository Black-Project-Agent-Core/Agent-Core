---
"agent-core": minor
---

Make Native Chat read like a conversation: the assistant's short pre-tool narration is shown as the main status and as chat lines in the Activity list, every finished tool step shows a one-line result summary (match counts, lines read, exit code, edited path, or a bounded error excerpt, with secret-like values masked), and a one-time "Mendekati batas langkah (n/max)" warning appears at 75% of the iteration limit. The limit and its failure behaviour are unchanged. Activity remains live UI state and is lost on reload.
