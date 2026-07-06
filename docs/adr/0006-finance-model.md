# 0006 — Finance: Schema for Levels 1–4, Build 1–3, Forward-Looking Differentiator

**Status:** Accepted (2026-07-06)

## Context

Finance is a pillar. "Trip finance" spans a spectrum:

1. Expense log (who paid, how much, for what)
2. Splitting + balances ("you owe Dana $84")
3. Settlement (simplify debts, mark-as-paid, settle-up summaries)
4. Forward-looking budgeting (estimated costs, "this trip will cost ~$X")
5. Payments (Venmo integration etc.)

Splitwise owns 1–3 looking backward. Nobody does 4 well.

## Decision

- Design the schema for levels 1–4 now: `expenses`, `expense_splits` (one row per person per expense), `estimated_cost` + `cost_type` on plannable items.
- Build levels 1–3 for launch.
- Level 4 is the differentiator, fleshed out after launch. Core mechanic: a live "estimated trip cost as of right now" ticker that grows as the itinerary fills in. It's a SUM over estimated costs; per-person is a divide. In a live group session it's a social object ("this hotel just made the trip $200/person more").
- Level 5 is a link-out to Venmo at most. No payment integrations.

## Consequences

- Finance math lives in `packages/core` — one implementation, both platforms (ADR 0001).
- Ticker UX and settlement design are parked as open threads, but the schema won't need rework to support them.
