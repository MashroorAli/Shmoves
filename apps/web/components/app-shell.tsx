'use client';

import Link from 'next/link';

import { useAuth } from '@/context/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profileName, profileAvatarUrl } = useAuth();

  const displayName = profileName ?? user?.email ?? '';
  const initial = (displayName || '?').charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link
            href="/trips"
            className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-wide text-foreground transition-colors hover:text-primary"
          >
            Shmoves
          </Link>
          <Link
            href="/profile"
            aria-label="My profile"
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar>
              {profileAvatarUrl && <AvatarImage src={profileAvatarUrl} alt={displayName} />}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
