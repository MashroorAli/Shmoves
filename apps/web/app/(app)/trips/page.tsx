'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';

import { TripCard } from '@/components/trips/trip-card';
import { TripDialog } from '@/components/trips/trip-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTrips } from '@/context/trips-context';

export default function TripsPage() {
  const { trips, isLoading } = useTrips();
  const [createOpen, setCreateOpen] = useState(false);

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
