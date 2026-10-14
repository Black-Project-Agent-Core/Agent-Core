# Agent Core AI Chat Placeholder Task — 2026-09-26

> **Status:** COMPLETE — UI PLACEHOLDER BUILT — NO CHAT/AI RUNTIME ATTACHED
> **Scope:** UI foundation only. No AI model runtime, chat engine, agent loop, provider routing, persistence, or tool orchestration is introduced.

## Goal

Prepare the desktop UI for a future native Agent Core AI-agent experience where an AI model acts as the brain and Agent Core is the local tool/runtime body.

## Approved UI changes

- Add a disabled `New Chat` placeholder above `Dashboard` in the left sidebar.
- Replace the user-visible `Hermes Partner` system card with an `Agent Core` placeholder labeled `Coming Soon`.
- Keep the existing Hermes/partner backend and health payload untouched; only its dedicated UI card is hidden behind the future Agent Core placeholder.
- Do not add navigation, model selection, chat state, message streaming, session storage, tool-loop logic, or provider configuration yet.

## Deferred future scope

Native chat/session runtime, AI model/provider adapters, model selection, conversation persistence, streaming responses, tool-call orchestration, permission profiles, and multi-session UX remain future design work.

## Acceptance boundary

The placeholder must be visually present, non-functional by design, compile in the existing UI, and leave current backend/runtime behavior unchanged.

Implementation: `src/ui/src/components.tsx` adds the disabled `New Chat` entry, `src/ui/src/systems.ts` and `pages.tsx` replace user-visible Hermes-specific status with `Agent Core / Coming Soon`, and `index.css` styles the placeholder without making it interactive. UI production build completed successfully; backend partner health/state remains untouched.
