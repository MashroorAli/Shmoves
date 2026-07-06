# 0008 — Build Sequence: Foundation → Slim App → Web → Polish

**Status:** Accepted (2026-07-06)

## Context

Solo dev, significant but uncertain time budget. Wrong ordering means building things twice. Each phase must end with a working product so life can interrupt between phases.

## Decision

**Phase 0 — Backend refactor (foundation).**
New normalized schema + RLS (ADR 0003). Migrate blob/JSON-column data. Migrate Apple users to email identities (ADR 0004). Set up monorepo, extract logic into `packages/core` (ADR 0001). Fold feature removal into the context rewrite — don't rewrite contexts for features being deleted (ADR 0002). App still works at the end.

Notes:
- Start the Apple-user email outreach at the very beginning of Phase 0 — it's the only step gated on other humans responding, and it blocks Phase 1.
- Definition of done includes rewriting the CLAUDE.md data-model section to describe the new schema, so the docs never describe a dead architecture.

**Phase 1 — App slim-down.**
Remove photos/journal/feed UI, remove Apple Sign-In (after user migration). Ship the leaner app. Mostly deletion.

**Phase 2 — Web app v1.**
Next.js in `apps/web` on `packages/core`: auth, trip CRUD, flights/itinerary/housing, expenses with splits and balances, cost ticker, realtime, invite pages with peek-then-join (ADR 0007). Pure frontend — Phase 0 did the hard thinking.

**Phase 3 — Polish the pillars.**
Settlement flows, presence ("Sarah is viewing"), budgeting depth, Android groundwork (revisit Google Sign-In here).

## Consequences

- Schema-first means both frontends are built once.
- Open threads parked for later: cost-ticker UX, settlement design, presence, Google Sign-In, email deliverability (Resend/Postmark at scale).
