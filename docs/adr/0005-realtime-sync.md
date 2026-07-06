# 0005 — Realtime Sync with Refetch-on-Foreground Backstop

**Status:** Accepted (2026-07-06)

## Context

Changes on web must appear on the phone and vice versa. Beyond plumbing, "planning together should feel like being together" is a product thesis — live updates are part of the personality, not just infrastructure.

## Decision

- Supabase realtime subscriptions on shared trip data. Edits appear on other open clients within ~a second.
- Refetch on app foreground / page load as the reliability backstop. Realtime is the enhancement on top, never the only path to fresh data.
- Normalized tables (ADR 0003) make subscriptions granular and cheap.

## Consequences

- The "I added the flight — it's already on your screen" moment works.
- Missed realtime events can't strand a client with stale data.
- Opens the door to presence features later ("Sarah is viewing") — Phase 3, not v1.
