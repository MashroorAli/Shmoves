'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CurrencySelect } from '@/components/shared/currency-select';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { inferDestinationCurrency } from '@/constants/currencies';
import {
  type ItineraryItem,
  type ItineraryItemInput,
  useTrips,
} from '@/context/trips-context';

export function ItemDialog({
  open,
  onOpenChange,
  tripId,
  dayId,
  destination,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  dayId: string;
  /** Used to pick a sensible default currency for new items. */
  destination: string;
  /** Present = edit, absent = create. */
  item?: ItineraryItem;
}) {
  const { addItineraryItem, updateItineraryItem } = useTrips();

  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [costType, setCostType] = useState<'total' | 'per_person'>('total');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '');
      setStartTime(item?.startTime ?? '');
      setEndTime(item?.endTime ?? '');
      setLocation(item?.location ?? '');
      setNotes(item?.notes ?? '');
      setCost(item?.estimatedCost != null ? String(item.estimatedCost) : '');
      setCostType(item?.costType ?? 'total');
      setCurrency(item?.currency ?? inferDestinationCurrency(destination) ?? 'USD');
    }
  }, [open, item, destination]);

  const save = async () => {
    if (!name.trim()) return;
    const parsedCost = cost.trim() === '' ? null : Number(cost);
    if (parsedCost != null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      toast.error('Estimated cost must be a positive number.');
      return;
    }
    setBusy(true);
    try {
      const input: ItineraryItemInput = {
        name: name.trim(),
        startTime: startTime || null,
        endTime: endTime || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        tickets: item?.tickets ?? [],
        estimatedCost: parsedCost,
        costType: parsedCost != null ? costType : null,
        currency: parsedCost != null ? currency : null,
      };
      if (item) {
        await updateItineraryItem(tripId, dayId, item.id, input);
      } else {
        await addItineraryItem(tripId, dayId, input);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the item.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add an item'}</DialogTitle>
          <DialogDescription>Something you’re planning to do that day.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              placeholder="Visit Senso-ji Temple"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-start">Start time</Label>
              <Input
                id="item-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-end">End time</Label>
              <Input
                id="item-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-location">Location</Label>
            <Input
              id="item-location"
              placeholder="Asakusa, Tokyo"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="item-notes">Notes</Label>
            <Textarea
              id="item-notes"
              placeholder="Anything worth remembering"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-cost">Est. cost</Label>
              <Input
                id="item-cost"
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
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : item ? 'Save' : 'Add item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
