# 0002 — Pivot to Planning + Finance, Remove Social Features

**Status:** Accepted (2026-07-06)

## Context

Shmoves was planning + photos + social — three products in one. Mash wants to do one thing really well: planning and organizing, with money as the second pillar. The app has fewer than 5 users, so a hard pivot breaks almost nobody.

## Decision

Remove photos, journal, and the activity feed entirely from the app. Do not build them on web. The product is group trip planning + trip finance.

Feature split across surfaces:

- **Web:** trip create/edit, flights, itinerary, housing, expenses, documents, invites, live shared view.
- **App:** same planning data, in-pocket companion on the trip.
- **App-only forever-maybes:** QR scanning stays native. Web can *display* a QR for a phone to scan.

## Consequences

- Sharper product story, less code to maintain going into a two-frontend world.
- Removed features are recoverable from git history if ever missed.
- Courtesy: warn existing users before deleting any uploaded photos (Cloudinary).
- Don't rewrite contexts for features being deleted — fold removal into the backend refactor (ADR 0009).
