# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npx expo start       # start dev server (Expo Go or dev client)
npx expo run:ios     # run on iOS simulator
npx expo run:android # run on Android emulator/device
npm run lint         # run ESLint via expo lint
```

EAS builds are configured in `eas.json`. The app bundle identifier is `com.shmoves.app` (iOS) and `com.shmoves.app` (Android).

## Environment Variables

Required in a `.env` file at the project root:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Current Status (July 2026)

We are executing a major refactor. Architecture decisions live in
docs/adr/ — read all ADRs before making structural changes.
The "Data Model" section below describes the PRE-refactor state
that Phase 0 (see ADR 0008) is replacing.

## Architecture

### Routing

Uses **expo-router** (file-based routing). The root layout at `app/_layout.tsx` wraps the entire app in three providers (`AuthProvider` → `TripsProvider` → `SharedTripsProvider`) and handles auth/onboarding redirects via `RootLayoutGate`.

Main routes:
- `app/auth.tsx` — sign-in/sign-up
- `app/onboarding.tsx` — first-time profile setup (shown when `profiles.name` is null)
- `app/(tabs)/` — main tab shell: Plan (`index`), My Shmoves (`my-trips`), Shmovements (`activity`), My Profile (`profile`)
- `app/trip/[id].tsx` — full trip detail screen (large file, all trip sections rendered here)

Deep links use the `shmoves://invite/TOKEN` scheme. Pending tokens are stashed in AsyncStorage if the user isn't logged in yet and resolved after login in `DeepLinkHandler`.

### Data Model: Personal vs Shared Trips

There are two parallel data systems:

**Personal trips** (`context/trips-context.tsx`):
- All state lives in React (in-memory) and is persisted as a single JSON blob to the `user_data` Supabase table (`data` column) on every state change.
- Hydration on login reads this blob and restores all state slices: `trips`, `flightsByTripId`, `itineraryByTripId`, `expensesByTripId`, `journalByTripId`, `housingByTripId`.
- `hydrationOk` guard prevents persisting empty state if hydration fails.

**Shared trips** (`context/shared-trips-context.tsx`):
- Stored in the `shared_trips` Supabase table with columns per data type (`flights`, `itinerary`, `expenses`, `housing`, `journal`, `photos`, `feed`).
- Each CRUD operation does a read-modify-write cycle on the relevant column via `readColumn` / `writeColumn` helpers.
- Real-time sync via Supabase Postgres `postgres_changes` subscription — any change to `shared_trips` or `trip_members` triggers a full `refresh()`.
- Membership tracked in `trip_members` table (roles: `owner`/`member`, statuses: `pending`/`accepted`/`declined`).
- Invites: link-based via `trip_invites` table (token-based), or direct username invite via `profiles.username` lookup.
- Photos stored as Cloudinary `secure_url` paths.
- Feed (activity log) appended on each mutation, capped at 200 entries, failures are non-blocking.

### Supabase Tables

| Table | Purpose |
|---|---|
| `profiles` | User profile: `id`, `email`, `name`, `username`, `phone`, `avatar_url` |
| `user_data` | Personal trip blob: `user_id`, `data` (JSONB) |
| `shared_trips` | Collaborative trips: all data stored as JSONB columns |
| `trip_members` | Membership/invite rows linking users to shared trips |
| `trip_invites` | Token-based invite links |

Edge functions: `supabase/functions/send-invite-sms/` — triggered for SMS invite delivery.

### Theming

Colors defined in `constants/theme.ts` as `Colors.light` / `Colors.dark`. Primary brand color is purple (`#7C3AED` light, `#A78BFA` dark). Always use `Colors[colorScheme].*` tokens rather than hardcoded hex values. `ThemedText` and `ThemedView` in `components/` automatically apply theme colors.

### Path Aliases

`@/` maps to the project root. Use `@/context/...`, `@/components/...`, `@/config/...`, `@/constants/...`, `@/hooks/...` throughout.

### Key Conventions

- Trip IDs for personal trips are deterministic: `` `${destination}|${startDate}|${endDate}` ``.
- IDs for all other entities (flights, events, expenses, etc.) are generated as `${type}-${Date.now()}-${random}`.
- Shared trip CRUD always updates local state optimistically via `updateLocalTrip` after the Supabase write.
- `TripsProvider` takes a `userKey` prop and resets/rehydrates whenever the auth user changes.
