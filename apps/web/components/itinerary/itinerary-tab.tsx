'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

import { DayCard } from '@/components/itinerary/day-card';
import { DayDialog } from '@/components/itinerary/day-dialog';
import { Button } from '@/components/ui/button';
import { type TripBundle } from '@/context/trips-context';

export function ItineraryTab({ bundle }: { bundle: TripBundle }) {
  const [addOpen, setAddOpen] = useState(false);
  const tripId = bundle.trip.id;

  return (
    <div className="flex flex-col gap-4">
      {bundle.itinerary.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No days yet — start your itinerary with “Add day”.
        </p>
      ) : (
        bundle.itinerary.map((day) => (
          <DayCard key={day.id} tripId={tripId} destination={bundle.trip.destination} day={day} />
        ))
      )}
      <Button variant="outline" className="self-start" onClick={() => setAddOpen(true)}>
        <Plus className="size-4" /> Add day
      </Button>
      <DayDialog open={addOpen} onOpenChange={setAddOpen} tripId={tripId} />
    </div>
  );
}
