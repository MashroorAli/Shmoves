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
import { type Trip, useTrips } from '@/context/trips-context';

export function TripDialog({
  open,
  onOpenChange,
  trip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit, absent = create. */
  trip?: Trip;
}) {
  const { addTrip, updateTrip } = useTrips();

  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDestination(trip?.destination ?? '');
      setStartDate(trip?.startDate ?? null);
      setEndDate(trip?.endDate ?? null);
    }
  }, [open, trip]);

  const valid =
    destination.trim().length > 0 && !!startDate && !!endDate && startDate <= endDate;

  const save = async () => {
    if (!valid || !startDate || !endDate) return;
    setBusy(true);
    try {
      const input = { destination: destination.trim(), startDate, endDate };
      if (trip) {
        await updateTrip(trip.id, input);
      } else {
        await addTrip(input);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the trip.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{trip ? 'Edit trip' : 'New trip'}</DialogTitle>
          <DialogDescription>
            {trip ? 'Update the destination or dates.' : 'Where are you headed?'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="destination">Destination</Label>
            <Input
              id="destination"
              placeholder="Tokyo, Japan"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Start</Label>
              <DateField value={startDate} onChange={setStartDate} disabled={busy} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>End</Label>
              <DateField value={endDate} onChange={setEndDate} disabled={busy} />
            </div>
          </div>
          {startDate && endDate && startDate > endDate && (
            <p className="text-sm text-destructive">The trip can’t end before it starts.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !valid}>
            {busy ? 'Saving…' : trip ? 'Save changes' : 'Create trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
