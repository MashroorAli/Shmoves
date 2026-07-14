'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';

import { toast } from 'sonner';

import { toDate } from '@/components/shared/date-field';
import { TripCard } from '@/components/trips/trip-card';
import { TripDialog } from '@/components/trips/trip-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrips } from '@/context/trips-context';

export default function TripsPage() {
  const { trips, pendingInvites, isLoading, acceptInvite, declineInvite } = useTrips();
  const [createOpen, setCreateOpen] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const respond = async (tripId: string, action: 'accept' | 'decline') => {
    setRespondingTo(tripId);
    try {
      await (action === 'accept' ? acceptInvite(tripId) : declineInvite(tripId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not respond to the invite.');
    } finally {
      setRespondingTo(null);
    }
  };

  const { upcoming, past } = useMemo(() => {
    // Local calendar date compare — trip dates are 'yyyy-MM-dd' strings.
    // Dates can be null (legacy data); undated trips sort first and count
    // as upcoming.
    const today = format(new Date(), 'yyyy-MM-dd');
    const sorted = [...trips].sort((a, b) =>
      (a.trip.startDate ?? '').localeCompare(b.trip.startDate ?? ''),
    );
    return {
      upcoming: sorted.filter((t) => !t.trip.endDate || t.trip.endDate >= today),
      past: sorted.filter((t) => t.trip.endDate && t.trip.endDate < today).reverse(),
    };
  }, [trips]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Shmoves</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New trip
        </Button>
      </div>

      {pendingInvites.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Invites
          </h2>
          {pendingInvites.map((invite) => (
            <Card key={invite.memberRowId}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate font-[family-name:var(--font-display)] text-lg font-semibold">
                    {invite.destination}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {invite.startDate && invite.endDate
                      ? `${format(toDate(invite.startDate), 'MMM d')} – ${format(toDate(invite.endDate), 'MMM d, yyyy')}`
                      : 'Dates TBD'}
                    {invite.inviterName && ` · invited by ${invite.inviterName}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={respondingTo === invite.tripId}
                    onClick={() => respond(invite.tripId, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={respondingTo === invite.tripId}
                    onClick={() => respond(invite.tripId, 'decline')}
                  >
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming trips — plan one with “New trip”.
          </p>
        ) : (
          upcoming.map((b) => <TripCard key={b.trip.id} bundle={b} />)
        )}
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Past
          </h2>
          {past.map((b) => (
            <TripCard key={b.trip.id} bundle={b} />
          ))}
        </section>
      )}

      <TripDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
