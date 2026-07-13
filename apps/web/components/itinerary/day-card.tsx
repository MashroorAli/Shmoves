'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { toDate } from '@/components/shared/date-field';
import { ItemDialog } from '@/components/itinerary/item-dialog';
import { ItemRow } from '@/components/itinerary/item-row';
import { DayDialog } from '@/components/itinerary/day-dialog';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type ItineraryDayWithItems,
  type ItineraryItem,
  useTrips,
} from '@/context/trips-context';

export function DayCard({
  tripId,
  destination,
  day,
}: {
  tripId: string;
  destination: string;
  day: ItineraryDayWithItems;
}) {
  const { deleteItineraryDay } = useTrips();

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ItineraryItem | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteItineraryDay(tripId, day.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the day.');
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{day.label}</CardTitle>
          {day.date && (
            <p className="text-sm text-muted-foreground">{format(toDate(day.date), 'EEEE, MMM d')}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label="Day actions" />}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>Rename day</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete day
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {day.items.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing planned yet.</p>
        )}
        {day.items.map((item) => (
          <ItemRow
            key={item.id}
            tripId={tripId}
            dayId={day.id}
            item={item}
            onEdit={() => setEditItem(item)}
          />
        ))}
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add item
        </Button>
      </CardContent>

      <ItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tripId={tripId}
        dayId={day.id}
        destination={destination}
      />
      <ItemDialog
        open={editItem !== null}
        onOpenChange={(o) => !o && setEditItem(null)}
        tripId={tripId}
        dayId={day.id}
        destination={destination}
        item={editItem ?? undefined}
      />
      <DayDialog open={renameOpen} onOpenChange={setRenameOpen} tripId={tripId} day={day} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{day.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the day and its {day.items.length} item
              {day.items.length === 1 ? '' : 's'} for everyone on the trip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete day'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
