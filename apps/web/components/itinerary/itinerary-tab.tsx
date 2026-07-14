'use client';

import { useState } from 'react';
import { LayoutGrid, List, Plus } from 'lucide-react';

import { DayCard } from '@/components/itinerary/day-card';
import { DayDialog } from '@/components/itinerary/day-dialog';
import { MatrixView } from '@/components/itinerary/matrix-view';
import { Button } from '@/components/ui/button';
import { type TripBundle } from '@/context/trips-context';

export function ItineraryTab({ bundle }: { bundle: TripBundle }) {
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<'list' | 'matrix'>('list');
  const tripId = bundle.trip.id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border p-0.5">
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('list')}
          >
            <List className="size-4" /> List
          </Button>
          <Button
            variant={view === 'matrix' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('matrix')}
          >
            <LayoutGrid className="size-4" /> Matrix
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add day
        </Button>
      </div>

      {view === 'matrix' ? (
        <MatrixView bundle={bundle} />
      ) : bundle.itinerary.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No days yet — start your itinerary with “Add day”.
        </p>
      ) : (
        bundle.itinerary.map((day) => (
          <DayCard key={day.id} tripId={tripId} destination={bundle.trip.destination} day={day} />
        ))
      )}
      <DayDialog open={addOpen} onOpenChange={setAddOpen} tripId={tripId} />
    </div>
  );
}
