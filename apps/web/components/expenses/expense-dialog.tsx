'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CurrencySelect } from '@/components/shared/currency-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inferDestinationCurrency } from '@/constants/currencies';
import { formatMoney } from '@/lib/format';
import { useAuth } from '@/context/auth-context';
import {
  type ExpenseInput,
  type ExpenseWithSplits,
  type TripBundle,
  useTrips,
} from '@/context/trips-context';

export function ExpenseDialog({
  open,
  onOpenChange,
  bundle,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bundle: TripBundle;
  /** Present = edit, absent = create. */
  expense?: ExpenseWithSplits;
}) {
  const { uid } = useAuth();
  const { addExpense, updateExpense } = useTrips();

  const members = useMemo(
    () => bundle.members.filter((m) => m.status === 'accepted'),
    [bundle.members],
  );
  // value → label map so SelectValue shows the name, not the raw user id.
  const memberLabels = useMemo(
    () =>
      Object.fromEntries(
        members.map((m) => [m.userId, m.userId === uid ? 'You' : (m.displayName ?? 'Trip member')]),
      ),
    [members, uid],
  );

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [paidBy, setPaidBy] = useState<string>('');
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(expense?.name ?? '');
      setAmount(expense ? String(expense.amount) : '');
      setCurrency(
        expense?.currency ?? inferDestinationCurrency(bundle.trip.destination) ?? 'USD',
      );
      setPaidBy(expense?.paidBy ?? uid ?? '');
      // New expenses default to splitting across everyone; edits keep the
      // stored participant set (payer only when the expense was unsplit).
      setParticipants(
        expense
          ? expense.splits.length
            ? new Set(expense.splits.map((s) => s.userId))
            : new Set([expense.paidBy ?? ''].filter(Boolean))
          : new Set(members.map((m) => m.userId)),
      );
    }
  }, [open, expense, bundle.trip.destination, uid, members]);

  const toggleParticipant = (userId: string) => {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const parsedAmount = Number(amount);
  const amountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const share = amountValid && participants.size >= 2 ? parsedAmount / participants.size : null;

  const save = async () => {
    if (!name.trim() || !amountValid || !paidBy) return;
    setBusy(true);
    try {
      const input: ExpenseInput = {
        name: name.trim(),
        amount: parsedAmount,
        currency,
        paidBy,
        participantIds: [...participants],
      };
      if (expense) {
        await updateExpense(bundle.trip.id, expense.id, input);
      } else {
        await addExpense(bundle.trip.id, input);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the expense.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit expense' : 'Add an expense'}</DialogTitle>
          <DialogDescription>
            Costs split evenly across everyone you check below.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="expense-name">Name</Label>
            <Input
              id="expense-name"
              placeholder="Dinner at Ichiran"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-amount">Amount</Label>
              <Input
                id="expense-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Currency</Label>
              <CurrencySelect value={currency} onChange={setCurrency} disabled={busy} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Paid by</Label>
            <Select
              value={paidBy || null}
              items={memberLabels}
              onValueChange={(v: string | null) => v && setPaidBy(v)}
              disabled={busy}
            >
              <SelectTrigger>
                <SelectValue placeholder="Who paid?" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.userId === uid ? 'You' : (m.displayName ?? 'Trip member')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Split between</Label>
            <div className="flex flex-col gap-2 rounded-md border p-3">
              {members.map((m) => (
                <label key={m.userId} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={participants.has(m.userId)}
                    onCheckedChange={() => toggleParticipant(m.userId)}
                    disabled={busy}
                  />
                  {m.userId === uid ? 'You' : (m.displayName ?? 'Trip member')}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {participants.size < 2
                ? 'Fewer than two people checked — the expense won’t be split.'
                : share != null
                  ? `${formatMoney(share, currency)} each, ${participants.size} people`
                  : 'Enter an amount to see each person’s share.'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim() || !amountValid || !paidBy}>
            {busy ? 'Saving…' : expense ? 'Save' : 'Add expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
