---
"agent-core": minor
---

Provider API keys now live in an encrypted vault under `secrets/` (`credential-vault.json`, `credential-vault.key`). Each key is AES-256-GCM under its own HKDF-derived key; the master key is protected by Windows DPAPI through the launcher helper modes `Agent Core.exe --dpapi-protect` and `--dpapi-unprotect`. At start, new `<PROVIDER>_API_KEY_NN` values found in `.env` are imported once, a different key in a slot the vault already holds replaces and retires the old one, then every slot is cleared and refilled from the vault, so the vault is the source of truth and a removed or rotated-out key is not revived by `.env`. Without the launcher beside Core, or when the vault is locked or corrupt, `.env` keeps working and the state is reported under `/health.credentialVault` and the Credential Vault card, never with a key value. The vault is never rewritten from a state Core could not read.
