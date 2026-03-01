import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface AuthContextValue {
  user: FirebaseAuthTypes.User | null;
  uid: string | null;
  phoneNumber: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const signOut: AuthContextValue['signOut'] = async () => {
      await auth().signOut();
    };

    return {
      user,
      uid: user?.uid ?? null,
      phoneNumber: user?.phoneNumber ?? null,
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
