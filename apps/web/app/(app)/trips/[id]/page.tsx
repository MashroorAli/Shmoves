'use client';

import { use } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ExpensesTab } from '@/components/expenses/expenses-tab';
import { ItineraryTab } from '@/components/itinerary/itinerary-tab';
import { TripHeader } from '@/components/trip/trip-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTrips } from '@/context/trips-context';

const TABS = ['itinerary', 'expenses'] as const;
type Tab = (typeof TABS)[number];

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { trips, isLoading } = useTrips();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'itinerary';

  const bundle = trips.find((t) => t.trip.id === id);

  if (isLoading && !bundle) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-xl font-semibold">Trip not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted, or you may no longer be a member.
        </p>
        <Link href="/trips" className="text-sm text-primary underline underline-offset-4">
          Back to my trips
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TripHeader bundle={bundle} />
      <Tabs
        value={tab}
        onValueChange={(v: string) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}
      >
        <TabsList>
          <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="itinerary" className="mt-4">
          <ItineraryTab bundle={bundle} />
        </TabsContent>
        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab bundle={bundle} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
