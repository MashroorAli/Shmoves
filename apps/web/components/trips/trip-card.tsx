'use client';

import Link from 'next/link';
import { format } from 'date-fns';

import { toDate } from '@/components/shared/date-field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { type TripBundle } from '@/context/trips-context';

export function TripCard({ bundle }: { bundle: TripBundle }) {
  const { trip } = bundle;
  const members = bundle.members.filter((m) => m.status === 'accepted');

  const range =
    trip.startDate && trip.endDate
      ? `${format(toDate(trip.startDate), 'MMM d')} – ${format(toDate(trip.endDate), 'MMM d, yyyy')}`
      : 'Dates TBD';

  return (
    <Link href={`/trips/${trip.id}`} className="block">
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{trip.destination}</p>
            <p className="text-sm text-muted-foreground">{range}</p>
          </div>
          {members.length > 1 && (
            <div className="flex -space-x-2">
              {members.slice(0, 4).map((m) => (
                <Avatar key={m.id} className="size-7 border-2 border-background">
                  {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt={m.displayName ?? ''} />}
                  <AvatarFallback className="text-xs">
                    {(m.displayName ?? '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {members.length > 4 && (
                <span className="ml-3 self-center text-xs text-muted-foreground">
                  +{members.length - 4}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
