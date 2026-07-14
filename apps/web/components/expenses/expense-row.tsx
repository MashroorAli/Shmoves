'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import {
  type ExpenseWithSplits,
  type TripBundle,
  useTrips,
} from '@/context/trips-context';

export function ExpenseRow({
  bundle,
  expense,
  onEdit,
}: {
  bundle: TripBundle;
  expense: ExpenseWithSplits;
  onEdit: () => void;
}) {
  const { uid } = useAuth();
  const { deleteExpense } = useTrips();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameOf = (id: string | null) => {
    if (!id) return '—';
    if (id === uid) return 'You';
    return bundle.members.find((m) => m.userId === id)?.displayName ?? 'Trip member';
  };

  const payer = expense.paidBy ?? expense.createdBy;
  const splitLabel =
    expense.splits.length >= 2
      ? `split ${expense.splits.length} ways`
      : 'not split';

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteExpense(bundle.trip.id, expense.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the expense.');
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{expense.name}</p>
        <p className="text-xs text-muted-foreground">
          {nameOf(payer)} paid · {splitLabel}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-sm font-medium tabular-nums">
          {formatMoney(expense.amount, expense.currency)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label="Expense actions" />}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit expense</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete expense
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{expense.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the expense and its splits for everyone on the trip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete expense'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
