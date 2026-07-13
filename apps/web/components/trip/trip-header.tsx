'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { toDate } from '@/components/shared/date-field';
import { TripDialog } from '@/components/trips/trip-dialog';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type TripBundle, useTrips } from '@/context/trips-context';

export function TripHeader({ bundle }: { bundle: TripBundle }) {
  const { trip } = bundle;
  const { deleteTrip } = useTrips();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const members = bundle.members.filter((m) => m.status === 'accepted');
  const range =
    trip.startDate && trip.endDate
      ? `${format(toDate(trip.startDate), 'MMM d')} – ${format(toDate(trip.endDate), 'MMM d, yyyy')}`
      : 'Dates TBD';

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteTrip(trip.id);
      router.replace('/trips');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the trip.');
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{trip.destination}</h1>
        <p className="text-sm text-muted-foreground">{range}</p>
        {members.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex -space-x-2">
              {members.map((m) => (
                <Avatar key={m.id} className="size-7 border-2 border-background">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName ?? ''} />}
                  <AvatarFallback className="text-xs">
                    {(m.displayName ?? '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{members.length} members</span>
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Trip actions" />}
        >
          <MoreHorizontal className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit trip</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete trip
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TripDialog open={editOpen} onOpenChange={setEditOpen} trip={trip} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{trip.destination}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the trip for every member — itinerary, expenses, everything. It can’t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete trip'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
