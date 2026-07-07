# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout (npm workspaces monorepo)

- `apps/mobile` — the Expo app
- `apps/web` — Next.js web app (Phase 2, not yet created)
- `packages/core` — shared TypeScript source (`@shmoves/core`): schema types, data access, finance math. Consumed as raw TS; Metro transpiles it for mobile, Next.js will use `transpilePackages`.
- `supabase/` — SQL migrations and edge functions
- `docs/adr/` — architecture decision records. **Read all ADRs before making structural changes.** `docs/apple-user-migration.md` tracks the Apple→email auth migration.

## Commands

```bash
npm install          # install all workspaces (run at repo root)
npm run start        # expo start (proxied to apps/mobile)
npm run ios          # expo run:ios
npm run android      # expo run:android
npm run lint         # eslint via expo lint
npx tsc --noEmit     # typecheck (run inside apps/mobile or packages/core)
```

EAS builds are configured in `apps/mobile/eas.json`. Bundle identifier is `com.shmoves.app` (iOS and Android).

## Environment Variables

In `apps/mobile/.env`:
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (required)
- `EXPO_PUBLIC_RAPIDAPI_KEY` (flight lookup), `EXPO_PUBLIC_PEXELS_API_KEY` (hero images), `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` / `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` (legacy photo uploads — feature removed, keys may still exist)

## Current Status (July 2026)

Phase 0 of the refactor (ADR 0008) is code-complete: normalized schema, monorepo, `packages/core`, unified trips context. The product is group trip planning + trip finance; photos/journal/social were removed (ADR 0002). Next: Phase 1 (remove Apple Sign-In after user migration), Phase 2 (web app).

Migrations `20260706000000` (schema) and `20260706000001` (data) must be applied to Supabase before this app version works; `20260706000002` (drop legacy tables) only after verifying the app runs on the new schema.

## Architecture

### Data Model (ADR 0003)

One normalized schema; **a personal trip is just a trip with one member**. There is no personal/shared split anywhere anymore.

| Table | Purpose |
|---|---|
| `profiles` | User profile: `id`, `email`, `name`, `username`, `phone`, `avatar_url` |
| `trips` | `destination`, `start_date`, `end_date`, `created_by` |
| `trip_members` | Membership: `role` (`owner`/`member`), `status` (`pending`/`accepted`/`declined`), `invited_by` |
| `trip_invites` | Token-based invite links |
| `flights`, `itinerary_days`, `itinerary_items`, `housing` | One row per item; `estimated_cost` + `cost_type` (`total`/`per_person`) + `currency` on each (powers the cost ticker, ADR 0006) |
| `expenses`, `expense_splits` | `expense_splits` has one row per participant **including the payer**, each with `share_amount` |
| `settlements` | One row per resolved debtor→creditor pair; debts computed from expenses |
| `documents` | Schema-only until web v1 |

- Every child table carries `trip_id` so RLS is one membership check and realtime can filter per trip.
- RLS: accepted members get all four operations on child tables; pending invitees can see the `trips` row only. Membership helpers (`is_trip_member`, `can_view_trip`, `is_trip_owner`) are SECURITY DEFINER.
- All tables have `REPLICA IDENTITY FULL` so realtime DELETE events carry the whole row.

### packages/core

- `types.ts` — camelCase app types (`TripBundle` = trip + members + flights + itinerary + expenses + housing + settlements)
- `data.ts` — all CRUD + `fetchAllTrips`; every function takes a `SupabaseClient` (each platform owns its client; mobile's is `apps/mobile/config/supabase.ts` with AsyncStorage sessions)
- `finance.ts` — `computeBalances`, `computeTransfers` (greedy min-transfer), `isPairSettled`, `evenShare`, `sumEstimatedCosts`. Currency-aware via a pluggable converter. **Finance math must live here, never in UI code** — balances may never disagree between platforms.

### Mobile app

**Routing** (expo-router): root layout wraps the app in `AuthProvider` → `TripsProvider` and handles auth/onboarding redirects. Tabs: Plan (`index`), My Shmoves (`my-trips`), My Profile (`profile`). `app/trip/[id].tsx` is the trip detail screen (large file; renders legacy view shapes derived from the `TripBundle` in one block near the top).

**Trips context** (`context/trips-context.tsx`): single provider over `TripBundle[]` via `@shmoves/core`. Mutations write to Supabase then patch local state optimistically. A debounced `refresh()` runs on any realtime event (all nine tables), on app foreground, and on channel rejoin (ADR 0005).

**Invites**: `shmoves://invite/TOKEN` deep links; token stashed in AsyncStorage if logged out and resolved after login (`DeepLinkHandler` in `app/_layout.tsx`). Web invite URLs come with ADR 0007. Any trip can be invited to — there is no "convert to shared" step.

**Home currency** (`context/home-currency-context.tsx`): per-expense currencies converted for display using cached exchange rates; pass its `convertToHome` into core finance functions.

### Theming & Conventions

- Colors in `apps/mobile/constants/theme.ts` (`Colors.light`/`Colors.dark`, purple primary). Always use `Colors[colorScheme].*` tokens; `ThemedText`/`ThemedView` apply them automatically.
- `@/` maps to `apps/mobile/`; core imports are `@shmoves/core`.
- All IDs are Postgres-generated UUIDs.
- Dates are local calendar dates (`YYYY-MM-DD`) — never `toISOString()` on a picker Date (UTC shift bug).
