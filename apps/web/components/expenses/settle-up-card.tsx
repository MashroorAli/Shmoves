'use client';

import { toast } from 'sonner';

import { CurrencySelect } from '@/components/shared/currency-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import { useHomeCurrency } from '@/context/home-currency-context';
import { type TripBundle, useTrips } from '@/context/trips-context';
import { computeBalances, computeTransfers, isPairSettled } from '@shmoves/core';

export function SettleUpCard({ bundle }: { bundle: TripBundle }) {
  const { uid } = useAuth();
  const { markSettled, unmarkSettled } = useTrips();
  const { homeCurrency, setHomeCurrency, convertToHome, ratesReady } = useHomeCurrency();

  const members = bundle.members.filter((m) => m.status === 'accepted');
  const splitExpenses = bundle.expenses.filter(
    (e) => e.splitType !== 'none' && e.splits.length >= 2,
  );
  if (!splitExpenses.length) return null;

  // Balance math lives in @shmoves/core so web and phone can never disagree
  // (ADR 0006).
  const { balances, skippedCount, skippedCurrencies } = computeBalances(
    splitExpenses,
    members.map((m) => m.userId),
    (amount, currency) => convertToHome(amount, currency || homeCurrency),
  );
  const transfers = computeTransfers(balances);

  const nameOf = (id: string) =>
    id === uid ? 'You' : (members.find((m) => m.userId === id)?.displayName ?? 'Trip member');

  const toggleSettlement = async (from: string, to: string) => {
    try {
      if (isPairSettled(bundle.settlements, from, to)) {
        await unmarkSettled(bundle.trip.id, from, to);
      } else {
        await markSettled(bundle.trip.id, from, to);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the settlement.');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Settle up</CardTitle>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Show in</Label>
          <CurrencySelect value={homeCurrency} onChange={setHomeCurrency} className="h-8 w-36" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!ratesReady && (
          <p className="text-xs text-muted-foreground">Loading exchange rates…</p>
        )}
        {skippedCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {skippedCount === 1 ? '1 expense' : `${skippedCount} expenses`}
            {skippedCurrencies.length > 0 ? ` in ${skippedCurrencies.join(', ')}` : ''}
            {" couldn't be converted — rate unavailable."}
          </p>
        )}
        {transfers.length === 0 && skippedCount === 0 && (
          <p className="text-sm text-muted-foreground">All square — nobody owes anything.</p>
        )}
        {transfers.map((t) => {
          const settled = isPairSettled(bundle.settlements, t.from, t.to);
          return (
            <label
              key={`${t.from}-${t.to}`}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className={settled ? 'text-muted-foreground line-through' : ''}>
                {nameOf(t.from)} owe{t.from === uid ? '' : 's'} {nameOf(t.to)}{' '}
                <span className="font-medium tabular-nums">
                  {formatMoney(t.amount, homeCurrency)}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {settled ? 'Settled' : 'Mark settled'}
                <Checkbox
                  checked={settled}
                  onCheckedChange={() => toggleSettlement(t.from, t.to)}
                />
              </span>
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}
