'use client';

import { Clock, MapPin, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ItineraryItem, useTrips } from '@/context/trips-context';

function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (t: string) => t.slice(0, 5); // 'HH:mm:ss' or 'HH:mm' → 'HH:mm'
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

export function ItemRow({
  tripId,
  dayId,
  item,
  onEdit,
}: {
  tripId: string;
  dayId: string;
  item: ItineraryItem;
  onEdit: () => void;
}) {
  const { deleteItineraryItem } = useTrips();
  const time = formatTimeRange(item.startTime, item.endTime);

  const remove = async () => {
    try {
      await deleteItineraryItem(tripId, dayId, item.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the item.');
    }
  };

  return (
    <div className="group flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{item.name}</p>
          {item.estimatedCost != null && item.currency && (
            <Badge variant="secondary">
              {formatMoney(item.estimatedCost, item.currency)}
              {item.costType === 'per_person' ? ' / person' : ''}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {time}
            </span>
          )}
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {item.location}
            </span>
          )}
        </div>
        {item.notes && <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p>}
      </div>
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button variant="ghost" size="icon" aria-label="Edit item" onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Delete item" onClick={remove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
