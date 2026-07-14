'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

export default function ProfilePage() {
  const { user, uid, profileName, profileAvatarUrl, refreshProfile, signOut } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) return;
    supabase
      .from('profiles')
      .select('name, username')
      .eq('id', uid)
      .single()
      .then(({ data }) => {
        setName(data?.name ?? '');
        setUsername(data?.username ?? '');
        setLoaded(true);
      });
  }, [uid]);

  const save = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: name.trim() || null,
          username: username.trim().toLowerCase() || null,
        })
        .eq('id', uid);
      if (error) {
        throw new Error(
          error.code === '23505' ? 'That username is taken.' : error.message,
        );
      }
      await refreshProfile();
      toast.success('Profile saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  const displayName = profileName ?? user?.email ?? '';
  const initial = (displayName || '?').charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {profileAvatarUrl && <AvatarImage src={profileAvatarUrl} alt={displayName} />}
          <AvatarFallback className="text-xl">{initial}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl">{profileName ?? 'My profile'}</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile details</CardTitle>
          <CardDescription>What other trip members see.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy || !loaded}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy || !loaded}
            />
            <p className="text-xs text-muted-foreground">
              Friends can invite you to trips by username.
            </p>
          </div>
          <Button className="self-start" onClick={save} disabled={busy || !loaded}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <Button
        variant="outline"
        className="self-start"
        onClick={async () => {
          await signOut();
          router.replace('/login');
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
