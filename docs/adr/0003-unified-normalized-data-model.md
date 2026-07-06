# 0003 — Unify Personal + Shared Trips into One Normalized Schema

**Status:** Accepted (2026-07-06)

## Context

Two parallel data systems exist today, and both break in a multi-client world:

1. **Personal trips:** one JSON blob per user in `user_data`, rewritten wholesale on every change. Two clients (web + phone) means last-write-wins on the whole account — silent data loss.
2. **Shared trips:** JSON columns per data type in `shared_trips`, edited via read-modify-write. Same race, scoped to a column. Concurrent group edits are the core use case, not an edge case.

## Decision

One unified, normalized schema. A personal trip is just a trip with one member.

Tables: `trips`, `trip_members`, `flights`, `itinerary_items`, `expenses`, `expense_splits`, `housing`.

- Each item is its own row. Concurrent edits to different items don't conflict.
- Row-level security scopes access to trip members.
- `estimated_cost` (and `cost_type`: total vs per-person) on flights, itinerary items, and housing — powers the live cost ticker (ADR 0006).
- Migrate existing blob + JSON-column data (trivial at <5 users).

## Consequences

- Both frontends are built once, against the right model.
- Granular realtime becomes possible ("expense X added" vs "refetch everything").
- Finance becomes queryable data, not JSON parsing.
- Real migration work: schema, RLS, rewriting `trips-context` and `shared-trips-context`. Paid at the cheapest possible moment.
