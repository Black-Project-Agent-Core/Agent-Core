---
"agent-core": patch
---

Make the launcher close button perform coordinated full shutdown of Agent Core-owned runtime processes, with graceful Core cleanup, terminal/browser/Hermes child-tree cleanup, exact-root orphan sweeping, native-helper cleanup, and Windows kill-on-job-close fallback; harden the resulting cold-start path by starting Core and tunnel independently, extending Core cold-boot readiness, validating tunnel ownership by the project-local executable, fixing empty port-probe semantics, suppressing intentional shutdown diagnostics, and exposing Restart Tunnel Only in the UI.
