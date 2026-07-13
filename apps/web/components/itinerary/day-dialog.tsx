'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DateField } from '@/components/shared/date-field';
import { Button } from '@/components/ui/button';
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
import { type ItineraryDayWithItems, useTrips } from '@/context/trips-context';

export function DayDialog({
  open,
  onOpenChange,
  tripId,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  /** Present = edit (label only, like mobile), absent = create. */
  day?: ItineraryDayWithItems;
}) {
  const { addItineraryDay, updateItineraryDay } = useTrips();

  const [label, setLabel] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(day?.label ?? '');
      setDate(day?.date ?? null);
    }
  }, [open, day]);

  const save = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      if (day) {
        await updateItineraryDay(tripId, day.id, label.trim());
      } else {
        await addItineraryDay(tripId, label.trim(), date);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the day.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{day ? 'Rename day' : 'Add a day'}</DialogTitle>
          <DialogDescription>
            {day ? 'Change how this day is labeled.' : 'A section of your itinerary, e.g. “Day 1”.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="day-label">Label</Label>
            <Input
              id="day-label"
              placeholder="Day 1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
            />
          </div>
          {!day && (
            <div className="flex flex-col gap-2">
              <Label>Date (optional)</Label>
              <DateField value={date} onChange={setDate} clearable disabled={busy} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !label.trim()}>
            {busy ? 'Saving…' : day ? 'Save' : 'Add day'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
