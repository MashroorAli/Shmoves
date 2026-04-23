import { type User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/config/supabase';

interface AuthContextValue {
  user: User | null;
  uid: string | null;
  isLoading: boolean;
  profileName: string | null;
  profileAvatarUrl: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('name, avatar_url')
      .eq('id', userId)
      .single();
    if (data) {
      setProfileName(data.name ?? null);
      setProfileAvatarUrl(data.avatar_url ?? null);
    }
  }, []);

  useEffect(() => {
    const upsertProfile = async (user: User) => {
      const email = user.email ?? user.user_metadata?.email ?? null;
      await supabase.from('profiles').upsert(
        { id: user.id, email },
        { onConflict: 'id' }
      );
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) {
        upsertProfile(session.user);
        fetchProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) {
        upsertProfile(session.user);
        fetchProfile(session.user.id);
      } else {
        setProfileName(null);
        setProfileAvatarUrl(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    uid: user?.id ?? null,
    isLoading,
    profileName,
    profileAvatarUrl,
    refreshProfile: () => (user ? fetchProfile(user.id) : Promise.resolve()),
    signOut: async () => { await supabase.auth.signOut(); },
  }), [isLoading, user, profileName, profileAvatarUrl, fetchProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
