'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { ExpenseDialog } from '@/components/expenses/expense-dialog';
import { ExpenseRow } from '@/components/expenses/expense-row';
import { SettleUpCard } from '@/components/expenses/settle-up-card';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { type ExpenseWithSplits, type TripBundle } from '@/context/trips-context';

export function ExpensesTab({ bundle }: { bundle: TripBundle }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseWithSplits | null>(null);

  // Total spent, one figure per currency actually used (no conversion here —
  // the converted view lives in Settle up).
  const totals = useMemo(() => {
    const byCurrency: Record<string, number> = {};
    for (const e of bundle.expenses) {
      byCurrency[e.currency] = (byCurrency[e.currency] ?? 0) + e.amount;
    }
    return Object.entries(byCurrency);
  }, [bundle.expenses]);

  const expenses = useMemo(
    () =>
      [...bundle.expenses].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [bundle.expenses],
  );

  return (
    <div className="flex flex-col gap-4">
      {expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No expenses yet — log the first one with “Add expense”.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Total spent:{' '}
            <span className="font-medium text-foreground tabular-nums">
              {totals.map(([currency, amount]) => formatMoney(amount, currency)).join(' + ')}
            </span>
          </p>
          <div className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                bundle={bundle}
                expense={expense}
                onEdit={() => setEditExpense(expense)}
              />
            ))}
          </div>
        </>
      )}
      <Button variant="outline" className="self-start" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" /> Add expense
      </Button>

      <SettleUpCard bundle={bundle} />

      <ExpenseDialog open={addOpen} onOpenChange={setAddOpen} bundle={bundle} />
      <ExpenseDialog
        open={editExpense !== null}
        onOpenChange={(o) => !o && setEditExpense(null)}
        bundle={bundle}
        expense={editExpense ?? undefined}
      />
    </div>
  );
}
