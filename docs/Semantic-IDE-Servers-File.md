# Semantic IDE: adding a language server through `servers.json`

Extra language servers are explicit project-local configuration. Agent Core never downloads or installs a language toolchain for them. The file is `runtime/semantic-ide/servers.json` unless `AGENT_CORE_SEMANTIC_IDE_SERVERS_FILE` points elsewhere. It holds a JSON list; one entry per server.

An entry that fails validation is skipped and reported as `SEMANTIC_SERVER_CONFIG_INVALID` (with the count) in the Semantic IDE health; the valid entries still load. A file that is not a list is rejected as a whole.

## Minimal entry

```json
[
  {
    "id": "example-ls",
    "extensions": [".ex"],
    "languageIds": { ".ex": "example" },
    "command": "node",
    "args": ["E:\\tools\\example-language-server\\cli.js", "--stdio"]
  }
]
```

Required: a non-empty `id`, `extensions` that each start with a dot, a `languageIds` object, and (for the default `stdio-owned` transport) a non-empty `command`. `args` must be strings. Optional fields include `priority`, `env` (literal, non-secret values only), `initializationOptions`, `readinessTimeoutMs`, `ignoredDirectories`, `encoding` and a `versionProbe` with `minVersion` and `maxVersionExclusive`. A version probe never upgrades anything.

## Windows notes

- `command` is started directly, without a shell (`src/semantic-ide/protocol.ts`). A `.cmd` or `.ps1` launcher that npm creates cannot be started that way. Name the real executable, or use `node` and the path of the server's JavaScript entry file, as in the example.
- Use absolute paths in `args`. They are not resolved against the folder that holds `servers.json`.
- Only the built-in Pyright launch and the generic version probe go through a `.cmd` shim helper (`windowsShim` in `src/semantic-ide/provider-registry.ts`). Do not rely on that for your own entries.
- Externally managed servers over TCP are loopback-only and single-root; Agent Core disconnects from them but never stops them.
