# 0004 — Email OTP Only, Everywhere

**Status:** Accepted (2026-07-06)

## Context

Web + app must land users in the same Supabase account. Most existing users signed up with Apple Sign-In. Apple auth on web needs extra config; adding Google invites duplicate accounts (especially with Apple's Hide My Email masking addresses) and eventually account-linking code. Mash wants maximum simplicity.

## Decision

Email OTP is the only auth method, on every platform.

Migration required first:

1. Get real email addresses from existing Apple users (watch for `@privaterelay.appleid.com` relay addresses — OTP can't reliably reach those and users don't know them).
2. Update their auth records via Supabase admin.
3. Only then remove Apple Sign-In from the app.

## Consequences

- One identity per human. No duplicate accounts, no linking code, no provider config. Android and web come free.
- Higher signup friction than one-tap social login. Accepted — funnel optimization is not today's problem.
- OTP delivery is now a single point of failure. Supabase built-in email is fine for now; wire in Resend/Postmark at real scale.
- Social auth (Google, Apple) can return later if signup drop-off shows up as a real problem. Revisit Google at Android launch.
