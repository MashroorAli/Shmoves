import { type User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/config/supabase';

interface AuthContextValue {
  user: User | null;
  uid: string | null;
  phoneNumber: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const upsertProfile = async (user: User) => {
      if (!user.phone) return;
      await supabase.from('profiles').upsert(
        { id: user.id, phone: user.phone },
        { onConflict: 'id' }
      );
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) upsertProfile(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) upsertProfile(session.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const signOut: AuthContextValue['signOut'] = async () => {
      await supabase.auth.signOut();
    };

    return {
      user,
      uid: user?.id ?? null,
      phoneNumber: user?.phone ?? null,
      isLoading,
      signOut,
    };
  }, [isLoading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
