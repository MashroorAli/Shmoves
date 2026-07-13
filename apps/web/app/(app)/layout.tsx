'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { TripsProvider } from '@/context/trips-context';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, uid, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading || !uid) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <Skeleton className="mb-6 h-14 w-full" />
        <Skeleton className="mb-3 h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <TripsProvider uid={uid}>
      <AppShell>{children}</AppShell>
    </TripsProvider>
  );
}
