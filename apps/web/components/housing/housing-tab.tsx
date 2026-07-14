'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BedDouble, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { toDate } from '@/components/shared/date-field';
import { HousingDialog } from '@/components/housing/housing-dialog';
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
import { type Housing, type TripBundle, useTrips } from '@/context/trips-context';

function HousingRow({ tripId, stay }: { tripId: string; stay: Housing }) {
  const { deleteHousing } = useTrips();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const range =
    stay.startDate && stay.endDate
      ? `${format(toDate(stay.startDate), 'MMM d')} – ${format(toDate(stay.endDate), 'MMM d')}`
      : stay.startDate
        ? `From ${format(toDate(stay.startDate), 'MMM d')}`
        : 'Dates TBD';

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteHousing(tripId, stay.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the stay.');
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <BedDouble className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{stay.location}</p>
          <p className="truncate text-xs text-muted-foreground">
            {range}
            {stay.earlyCheckInRequested && ' · early check-in requested'}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {stay.estimatedCost != null && (
          <span className="text-sm tabular-nums">
            {formatMoney(stay.estimatedCost, stay.currency ?? 'USD')}
            {stay.costType === 'per_person' && (
              <span className="text-xs text-muted-foreground"> /person</span>
            )}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label="Stay actions" />}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete stay
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{stay.location}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the stay for everyone on the trip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete stay'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function HousingTab({ bundle }: { bundle: TripBundle }) {
  const [addOpen, setAddOpen] = useState(false);
  const tripId = bundle.trip.id;

  const stays = useMemo(
    () =>
      [...bundle.housing].sort((a, b) =>
        (a.startDate ?? '').localeCompare(b.startDate ?? ''),
      ),
    [bundle.housing],
  );

  return (
    <div className="flex flex-col gap-4">
      {stays.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nowhere booked yet — add where you’re staying with “Add stay”.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {stays.map((stay) => (
            <HousingRow key={stay.id} tripId={tripId} stay={stay} />
          ))}
        </div>
      )}
      <Button variant="outline" className="self-start" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" /> Add stay
      </Button>

      <HousingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tripId={tripId}
        destination={bundle.trip.destination}
      />
    </div>
  );
}
