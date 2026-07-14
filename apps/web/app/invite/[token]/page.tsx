'use client';

// Invite landing page (ADR 0007). v1: logged-in users redeem the token and
// land on /trips with the pending invite waiting; logged-out users go
// through login first (?next= brings them back here). The logged-out
// trip preview ("peek") needs a token-scoped edge function and comes later.

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { resolveInviteToken } from '@shmoves/core';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { uid, isLoading } = useAuth();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const redeemed = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!uid) {
      router.replace(`/login?next=/invite/${encodeURIComponent(token)}`);
      return;
    }
    if (redeemed.current) return;
    redeemed.current = true;
    resolveInviteToken(supabase, uid, token)
      .then(() => router.replace('/trips'))
      .catch((e) => setError(e instanceof Error ? e.message : 'This invite could not be used.'));
  }, [isLoading, uid, token, router]);

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <h1 className="text-2xl">This invite didn’t work</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <Link href="/trips" className="text-sm text-primary underline underline-offset-4">
          Go to my trips
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4">
      <Skeleton className="h-8 w-56" />
      <p className="text-sm text-muted-foreground">Opening your invite…</p>
    </main>
  );
}
