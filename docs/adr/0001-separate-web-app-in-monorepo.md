# 0001 — Separate Next.js Web App in a Monorepo

**Status:** Accepted (2026-07-06)

## Context

Shmoves needs a website with the app's planning features, synced both ways. Options: compile the existing Expo app to web (one codebase, mobile-looking site) or build a separate web app (two frontends, real desktop experience). The web surface is meant to be the planning cockpit, not a companion.

## Decision

Build a separate Next.js web app. Restructure into a monorepo:

- `apps/mobile` — the existing Expo app
- `apps/web` — the new Next.js app
- `packages/core` — shared TypeScript types, Supabase client wrappers, all data and finance logic

Sync comes free because both clients talk to the same Supabase backend.

## Consequences

- Web gets a purpose-built desktop experience (wide layouts, hover, SEO).
- Features are built twice (mobile UI + web UI), but logic is written once in `packages/core`.
- Finance math is shared, so balances can never drift between platforms.
- One-time cost: repo restructure, workspace setup (Turborepo or npm workspaces).
- Expo + Next.js in one workspace can have dependency squabbles. Accepted.
