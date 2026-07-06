# 0005 — Realtime Sync with Refetch-on-Foreground Backstop

**Status:** Accepted (2026-07-06)

## Context

Changes on web must appear on the phone and vice versa. Beyond plumbing, "planning together should feel like being together" is a product thesis — live updates are part of the personality, not just infrastructure.

## Decision

- Supabase realtime subscriptions on shared trip data. Edits appear on other open clients within ~a second.
- Refetch on app foreground / page load as the reliability backstop, and also on realtime channel reconnect (events during a disconnect are lost, not replayed). Realtime is the enhancement on top, never the only path to fresh data.
- Normalized tables (ADR 0003) make subscriptions granular and cheap.
- Sharp edge to design around: `postgres_changes` DELETE events only carry the replica identity (usually just the PK), and RLS must grant SELECT for events to be delivered at all — every table needs complete policies (see ADR 0003 migration notes).

## Consequences

- The "I added the flight — it's already on your screen" moment works.
- Missed realtime events can't strand a client with stale data.
- Opens the door to presence features later ("Sarah is viewing") — Phase 3, not v1.
