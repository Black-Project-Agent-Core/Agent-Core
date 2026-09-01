# Vault Current Contract

Status: Phase 0 Baseline Freeze

## Purpose

This document freezes the Vault Core behavior before Credential Intelligence upgrades.

## Security Boundary

- Plaintext credentials must never be persisted.
- Plaintext credentials must never be serialized into UI/API responses.
- Protected blobs require integrity verification.
- Corruption must fail closed.

## Rotation Contract

- RotationSession must not reuse the same credential during one logical session.
- Disabled credentials cannot be selected.
- Invalid credentials cannot be selected.
- Cooldown credentials cannot be selected until eligible.
- Provider transient failures must not burn the credential pool.
- Rotation state must survive restart.

## Validation Contract

OpenRouter validation:

- Uses bounded current-key metadata validation only.
- Does not perform model inference requests.
- Does not persist raw provider responses.

## Intelligence Layer Constraint

Future Credential Intelligence features must extend this contract without weakening Vault Core guarantees.
