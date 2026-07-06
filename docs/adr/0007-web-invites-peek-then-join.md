# 0007 — Web Invite Links with Peek-Then-Join

**Status:** Accepted (2026-07-06)

## Context

Invites today are `shmoves://invite/TOKEN` deep links — useless without the app installed. Shmoves spreads via friends inviting friends, so the invite is the growth funnel. Domain owned: **shmoves.app**.

## Decision

- Invites become web URLs: `shmoves.app/invite/TOKEN`.
- Logged-out invitees see a **read-only preview** — trip name, dates, destination, members, cost-so-far — with one button: "Join this trip." Signup (OTP) happens after they're sold.
- Token grants scoped read access to a limited preview only (edge function or RLS-safe view keyed on the token). Full trip data never leaks to anyone holding the URL.
- Universal links: same URL opens the app if installed, falls back to web otherwise.
- The existing pending-join stash flow (token saved until login) carries over.

## Consequences

- Every invite becomes a growth loop; the trip itself is the sales pitch.
- Fixes the current gap where invites require the app.
- Requires Apple domain verification config on shmoves.app for universal links.
