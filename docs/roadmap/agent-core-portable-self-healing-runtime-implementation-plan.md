# Agent Core Portable Self-Healing Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent Core self-healing after cold relocation and able to provision required Windows-local dependencies without admin access.

**Architecture:** Add a PowerShell bootstrap boundary invoked by the unified launcher. It owns relocation identity, machine-local cleanup, root-locator refresh, runtime discovery/provisioning, and dependency health. Tray remains the service lifecycle authority.

**Tech Stack:** Windows PowerShell 5.1+, Node.js >=24.15.0, npm, Vitest, existing tunnel-client.

**Spec:** `docs/roadmap/agent-core-portable-self-healing-runtime-design.md`

## Global Constraints
- Preserve `runtime/data`, `runtime/memory`, `runtime/execution`, `secrets`, and tunnel profile.
- Never require administrator privileges for Node fallback installation.
- Never hard-code project drive/folder paths.
- Never accept stale PID state after root/machine/user identity changes.
- Preserve existing OAuth protected-resource behavior and custom Agent Core keys.

### Task 1: Relocation identity and root locator
- [ ] RED: add tests proving the launcher refreshes a missing/stale LocalAppData root pointer and that relocation invalidates machine-local tray state only.
- [ ] GREEN: add portable identity helpers and relocation cleanup.
- [ ] REGRESSION: run launcher, tray-autostart, tray-manager focused tests.

### Task 2: Portable Node/npm bootstrap
- [ ] RED: add tests for compatible system Node, local portable fallback, unsupported version, and no fixed drive assumptions.
- [ ] GREEN: implement `scripts/windows/agent-core-bootstrap.ps1` with version validation and verified Node download fallback.
- [ ] REGRESSION: verify normal machines do not download when compatible Node exists.

### Task 3: Launcher integration and dependency health
- [ ] RED: prove launcher consumes bootstrap-resolved Node/npm and recreates dependencies when `npm ls --depth=0` fails.
- [ ] GREEN: integrate bootstrap before build/start and keep `-ContractOnly` mutation-free.
- [ ] REGRESSION: build and unified launcher suite.

### Task 4: Machine-change lifecycle hardening
- [ ] RED: prove stale PID/request files are ignored after identity change while durable data hashes remain unchanged.
- [ ] GREEN: clear only ephemeral runtime files and regenerate portable install metadata.
- [ ] REGRESSION: tray lifecycle + OAuth reset regression.

### Task 5: Live relocation acceptance
- [ ] Create a temporary relocated copy contract using the current machine without touching production ports.
- [ ] Run bootstrap/contract in relocated root and verify path rebinding.
- [ ] Restart production through the unified launcher and verify health, tunnel readiness, OAuth metadata, custom-key count, and stale-grant count.
- [ ] Run build, scoped diff check, and focused test gate before declaring stable.
