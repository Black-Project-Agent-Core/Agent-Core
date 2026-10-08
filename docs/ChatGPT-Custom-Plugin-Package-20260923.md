# ChatGPT Custom Plugin Package — 2026-09-23

Status: PACKAGE CREATED AND LOCALLY VALIDATED — CHATGPT UPLOAD PENDING.

## Source and output
- Input: `SubProject/dev-6ab288f8a2e88191b706b2d3af6b525d.zip`, 656 bytes, SHA-256 `341e93dadd9c6fe41dff7bfff3ab748c4ffffeec502c68d30652e5118d0c6bce`.
- Output: `SubProject/Agent-Core-ChatGPT-Plugin-v1.0.1.zip`, 641 bytes, SHA-256 `89769f43ba93bfbb0f283d76b27a4198c31a9112c5d2f5be330dd14d394bd656`.
- Technical package name stays `dev-6ab288f8a2e88191b706b2d3af6b525d`; display name stays `Agent Core`.
- The existing `.app.json` is preserved byte-for-byte, referencing `asdk_app_6ab288f8a2e88191b706b2d3af6b525d`.

## Exact changes
- `.codex-plugin/plugin.json`: increment package version from `1.0.0` to `1.0.1`.
- Omit the optional `interface.defaultPrompt` field whose source value was null. No replacement prompt was invented.
- All other original manifest metadata is unchanged. No skill, hook, endpoint, permission, or authentication configuration was added.
- ZIP root contains only `.app.json` and `.codex-plugin/plugin.json`, plus the directory entry. There is no extra wrapper folder.

## Verification and boundaries
- ZIP CRC readback, JSON parsing, exact app mapping, package identity, changed-version, allowlisted entries and unchanged input hash were checked on the PC.
- The downloadable conversation copy is byte-identical and separately passed Python zipfile CRC and manifest checks.
- This is packaging of the existing registered MCP connection, not a runtime installer, release archive, tool-schema snapshot, or completion of the pending repair verification.
- Root package.json remains `0.12.0`. No runtime files were changed, no new dependency was installed, and no restart, release apply, test suite, credential reset or ChatGPT upload occurred.
- No credentials, private memory, backup, logs, source/runtime trees or executable files are bundled.
- Upload through the existing Agent Core plugin's Upload new version dialog. Acceptance by that UI remains untested until the user uploads it.
- Evidence: `runtime/tmp/chatgpt-plugin-package-20260923/validation.json`.

## Format reference
Official OpenAI packaging and validation references checked for this packaging task: https://developers.openai.com/plugins/build/plugins and https://developers.openai.com/plugins/deploy/submission-errors . Public skills-only submission restrictions are not the requested existing-custom-plugin update flow.
