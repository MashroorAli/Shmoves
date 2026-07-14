'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { toDate } from '@/components/shared/date-field';
import { InviteDialog } from '@/components/trip/invite-dialog';
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
import { useAuth } from '@/context/auth-context';
import { type TripBundle, useTrips } from '@/context/trips-context';

export function TripHeader({ bundle }: { bundle: TripBundle }) {
  const { trip } = bundle;
  const { uid } = useAuth();
  const { deleteTrip, leaveTrip } = useTrips();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOwner = bundle.members.some((m) => m.userId === uid && m.role === 'owner');

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
        <h1 className="text-3xl">{trip.destination}</h1>
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
          <DropdownMenuItem onClick={() => setInviteOpen(true)}>Invite people</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit trip</DropdownMenuItem>
          {!isOwner && (
            <DropdownMenuItem variant="destructive" onClick={() => setLeaveOpen(true)}>
              Leave trip
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete trip
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TripDialog open={editOpen} onOpenChange={setEditOpen} trip={trip} />
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tripId={trip.id}
        destination={trip.destination}
      />

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave “{trip.destination}”?</AlertDialogTitle>
            <AlertDialogDescription>
              You’ll lose access to the trip until someone invites you back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await leaveTrip(trip.id);
                  router.replace('/trips');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Could not leave the trip.');
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Leaving…' : 'Leave trip'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
