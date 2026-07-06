# 0003 — Unify Personal + Shared Trips into One Normalized Schema

**Status:** Accepted (2026-07-06)

## Context

Two parallel data systems exist today, and both break in a multi-client world:

1. **Personal trips:** one JSON blob per user in `user_data`, rewritten wholesale on every change. Two clients (web + phone) means last-write-wins on the whole account — silent data loss.
2. **Shared trips:** JSON columns per data type in `shared_trips`, edited via read-modify-write. Same race, scoped to a column. Concurrent group edits are the core use case, not an edge case.

## Decision

One unified, normalized schema. A personal trip is just a trip with one member.

Tables: `trips`, `trip_members`, `flights`, `itinerary_items`, `expenses`, `expense_splits`, `housing`, `settlements`, `documents`.

`documents` (file name, storage path, uploader, trip) is schema-only in Phase 0 — the UI comes with web v1 (Phase 2), but the schema won't need rework.

- Each item is its own row. Concurrent edits to different items don't conflict.
- Row-level security scopes access to trip members.
- `estimated_cost` (and `cost_type`: total vs per-person) on flights, itinerary items, and housing — powers the live cost ticker (ADR 0006).
- `currency` on expenses and estimated costs. The app already supports per-expense currencies with home-currency conversion; the schema must preserve that, not regress to USD-only.
- Settlements become a `settlements` table (one row per resolved pair), replacing the `shared_trips.settlements` JSONB column. Debts are still computed from expenses; settlements only mark pairs resolved.
- Migrate existing blob + JSON-column data (trivial at <5 users).

## Migration notes

- Personal trip IDs today are deterministic strings (`destination|startDate|endDate`). The new schema mints UUIDs — anything referencing old IDs (stashed invite tokens, AsyncStorage state, `trip_posts.trip_id`) needs mapping or invalidation during migration.
- Write RLS policies for **all four operations** on every table up front. A missing DELETE policy on the old schema silently broke delete sync once already.

## Consequences

- Both frontends are built once, against the right model.
- Granular realtime becomes possible ("expense X added" vs "refetch everything").
- Finance becomes queryable data, not JSON parsing.
- Real migration work: schema, RLS, rewriting `trips-context` and `shared-trips-context`. Paid at the cheapest possible moment.
