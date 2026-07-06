// Finance math (ADR 0006). One implementation for both platforms — a balance
// must never disagree between web and phone (ADR 0001).
//
// Semantics carried over from the pre-refactor app, with one deliberate
// change: shares are the STORED per-participant amounts, fixed when the
// expense was written, rather than recomputed over currently-valid members.

import type { CostType, ExpenseWithSplits, Settlement } from './types';

/** Converts an amount from `currency` into the viewer's display currency.
 * Returns null when rates for that currency aren't available (the expense is
 * then skipped and reported, matching existing app behavior). */
export type CurrencyConverter = (amount: number, currency: string) => number | null;

/** For single-currency contexts (or tests). */
export const identityConverter: CurrencyConverter = (amount) => amount;

/** Balances only ever differ by amounts under one cent from rounding. */
export const SETTLE_EPS = 0.01;

export interface BalanceResult {
  /** userId → net amount in the converter's target currency.
   * Positive = is owed money; negative = owes money. */
  balances: Record<string, number>;
  /** Expenses ignored because the payer isn't a member or rates were missing. */
  skippedCount: number;
  skippedCurrencies: string[];
}

export function computeBalances(
  expenses: ExpenseWithSplits[],
  memberIds: string[],
  convert: CurrencyConverter,
): BalanceResult {
  const balances: Record<string, number> = {};
  for (const id of memberIds) balances[id] = 0;

  let skippedCount = 0;
  const skippedCurrencies = new Set<string>();

  for (const e of expenses) {
    if (e.splitType === 'none' || e.splits.length < 2) continue;

    const payer = e.paidBy ?? e.createdBy;
    if (!payer || !Object.prototype.hasOwnProperty.call(balances, payer)) {
      skippedCount++;
      continue;
    }

    const convertedAmount = convert(e.amount, e.currency);
    if (convertedAmount === null) {
      skippedCount++;
      skippedCurrencies.add(e.currency || '?');
      continue;
    }

    balances[payer] += convertedAmount;
    for (const s of e.splits) {
      if (!Object.prototype.hasOwnProperty.call(balances, s.userId)) continue;
      const share = convert(s.shareAmount, e.currency);
      if (share === null) continue;
      balances[s.userId] -= share;
    }
  }

  return { balances, skippedCount, skippedCurrencies: [...skippedCurrencies] };
}

export interface Transfer {
  from: string; // debtor
  to: string; // creditor
  amount: number;
}

/** Greedy min-transfer matching: largest creditor absorbs largest debtor. */
export function computeTransfers(
  balances: Record<string, number>,
  eps: number = SETTLE_EPS,
): Transfer[] {
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > eps)
    .map(([id, v]) => ({ id, amount: v }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -eps)
    .map(([id, v]) => ({ id, amount: -v }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const cr = creditors[ci];
    const dr = debtors[di];
    const pay = Math.min(cr.amount, dr.amount);
    if (pay > eps) {
      transfers.push({ from: dr.id, to: cr.id, amount: pay });
    }
    cr.amount -= pay;
    dr.amount -= pay;
    if (cr.amount < eps) ci++;
    if (dr.amount < eps) di++;
  }
  return transfers;
}

export function isPairSettled(settlements: Settlement[], from: string, to: string): boolean {
  return settlements.some((s) => s.fromUser === from && s.toUser === to);
}

/** Even split across `count` participants (payer included). Callers round for
 * display; the unrounded value is what gets stored per split row. */
export function evenShare(amount: number, count: number): number {
  return amount / count;
}

// ── Forward-looking cost (level 4, ADR 0006) ─────────────────────────────────

export interface CostedItem {
  estimatedCost: number | null;
  costType: CostType | null;
  currency: string | null;
}

/** The live "this trip will cost ~$X right now" number: total per currency.
 * per_person estimates are multiplied by the accepted member count. Items
 * without an estimate contribute nothing. */
export function sumEstimatedCosts(
  items: CostedItem[],
  memberCount: number,
): Record<string, number> {
  const people = Math.max(memberCount, 1);
  const totals: Record<string, number> = {};
  for (const item of items) {
    if (item.estimatedCost == null) continue;
    const currency = item.currency || 'USD';
    const amount =
      item.costType === 'per_person' ? item.estimatedCost * people : item.estimatedCost;
    totals[currency] = (totals[currency] ?? 0) + amount;
  }
  return totals;
}
