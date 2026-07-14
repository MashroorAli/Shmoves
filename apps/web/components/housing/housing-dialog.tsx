'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CurrencySelect } from '@/components/shared/currency-select';
import { DateField } from '@/components/shared/date-field';
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
import { type HousingInput, useTrips } from '@/context/trips-context';

export function HousingDialog({
  open,
  onOpenChange,
  tripId,
  destination,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  /** Used to pick a sensible default currency. */
  destination: string;
}) {
  const { addHousing } = useTrips();

  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [earlyCheckIn, setEarlyCheckIn] = useState(false);
  const [cost, setCost] = useState('');
  const [costType, setCostType] = useState<'total' | 'per_person'>('total');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setLocation('');
      setStartDate(null);
      setEndDate(null);
      setCheckInTime('');
      setCheckOutTime('');
      setEarlyCheckIn(false);
      setCost('');
      setCostType('total');
      setCurrency(inferDestinationCurrency(destination) ?? 'USD');
    }
  }, [open, destination]);

  const save = async () => {
    if (!location.trim()) return;
    const parsedCost = cost.trim() === '' ? null : Number(cost);
    if (parsedCost != null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      toast.error('Estimated cost must be a positive number.');
      return;
    }
    setBusy(true);
    try {
      const input: HousingInput = {
        location: location.trim(),
        startDate,
        endDate,
        checkInTime: checkInTime || null,
        checkOutTime: checkOutTime || null,
        earlyCheckInRequested: earlyCheckIn,
        estimatedCost: parsedCost,
        costType: parsedCost != null ? costType : null,
        currency: parsedCost != null ? currency : null,
      };
      await addHousing(tripId, input);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the stay.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a stay</DialogTitle>
          <DialogDescription>Where the group is staying.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="housing-location">Place</Label>
            <Input
              id="housing-location"
              placeholder="Shinjuku Granbell Hotel"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Check-in</Label>
              <DateField value={startDate} onChange={setStartDate} disabled={busy} />
              <Input
                aria-label="Check-in time"
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Check-out</Label>
              <DateField value={endDate} onChange={setEndDate} disabled={busy} />
              <Input
                aria-label="Check-out time"
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={earlyCheckIn}
              onCheckedChange={(v) => setEarlyCheckIn(v === true)}
              disabled={busy}
            />
            Early check-in requested
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="housing-cost">Est. cost</Label>
              <Input
                id="housing-cost"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Cost type</Label>
              <Select
                value={costType}
                items={{ total: 'Total', per_person: 'Per person' }}
                onValueChange={(v: string | null) => v && setCostType(v as 'total' | 'per_person')}
                disabled={busy || cost.trim() === ''}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="per_person">Per person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Currency</Label>
              <CurrencySelect
                value={currency}
                onChange={setCurrency}
                disabled={busy || cost.trim() === ''}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !location.trim()}>
            {busy ? 'Saving…' : 'Add stay'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
