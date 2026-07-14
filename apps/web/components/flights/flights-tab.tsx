'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { MoreHorizontal, Plane, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { toDate } from '@/components/shared/date-field';
import { FlightDialog } from '@/components/flights/flight-dialog';
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
import { type Flight, type TripBundle, useTrips } from '@/context/trips-context';

const SEGMENT_LABELS: Record<string, string> = {
  going: 'Outbound',
  mid: 'Mid-trip',
  return: 'Return',
};

function FlightRow({
  tripId,
  flight,
  onEdit,
}: {
  tripId: string;
  flight: Flight;
  onEdit: () => void;
}) {
  const { deleteFlight } = useTrips();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const route =
    flight.fromCity || flight.toCity
      ? `${flight.fromCity ?? flight.fromAirport ?? '?'} → ${flight.toCity ?? flight.toAirport ?? '?'}`
      : null;
  const when = flight.departureDate
    ? `${format(toDate(flight.departureDate), 'EEE, MMM d')}${
        flight.departureTime ? ` · ${flight.departureTime.slice(0, 5)}` : ''
      }`
    : 'Date TBD';

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteFlight(tripId, flight.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the flight.');
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <Plane className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {[flight.airline, flight.flightNumber].filter(Boolean).join(' ') || 'Flight'}
            {flight.segment && flight.segment !== 'auto' && (
              <span className="ml-2 text-xs text-muted-foreground">
                {SEGMENT_LABELS[flight.segment]}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {[route, when].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {flight.estimatedCost != null && (
          <span className="text-sm tabular-nums">
            {formatMoney(flight.estimatedCost, flight.currency ?? 'USD')}
            {flight.costType === 'per_person' && (
              <span className="text-xs text-muted-foreground"> /person</span>
            )}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label="Flight actions" />}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit flight</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete flight
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this flight?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the flight for everyone on the trip.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete flight'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function FlightsTab({ bundle }: { bundle: TripBundle }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editFlight, setEditFlight] = useState<Flight | null>(null);
  const tripId = bundle.trip.id;

  const flights = useMemo(
    () =>
      [...bundle.flights].sort((a, b) =>
        `${a.departureDate ?? ''}${a.departureTime ?? ''}`.localeCompare(
          `${b.departureDate ?? ''}${b.departureTime ?? ''}`,
        ),
      ),
    [bundle.flights],
  );

  return (
    <div className="flex flex-col gap-4">
      {flights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No flights yet — add the group’s flights with “Add flight”.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {flights.map((flight) => (
            <FlightRow
              key={flight.id}
              tripId={tripId}
              flight={flight}
              onEdit={() => setEditFlight(flight)}
            />
          ))}
        </div>
      )}
      <Button variant="outline" className="self-start" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" /> Add flight
      </Button>

      <FlightDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tripId={tripId}
        destination={bundle.trip.destination}
      />
      <FlightDialog
        open={editFlight !== null}
        onOpenChange={(o) => !o && setEditFlight(null)}
        tripId={tripId}
        destination={bundle.trip.destination}
        flight={editFlight ?? undefined}
      />
    </div>
  );
}
