---
"agent-core": minor
---

Native can now look at pictures that its tools return (read_file on an image, image_inspect, screenshots) on Anthropic routes: they are sent to the model inside the tool result, kept out of checkpoints, and only the newest two stay attached to later calls. Image attachments in chat are opened with image_inspect or read_file.
