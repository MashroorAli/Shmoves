import 'react-native-url-polyfill/auto';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth-context';
import { SharedTripsProvider } from '@/context/shared-trips-context';
import { TripsProvider } from '@/context/trips-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/config/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootLayoutGate>
          <Stack>
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="explore" options={{ title: 'Explore' }} />
            <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </RootLayoutGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

function RootLayoutGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { uid, isLoading } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  // Check if user has completed onboarding (has a name set)
  useEffect(() => {
    if (!uid) {
      setNeedsOnboarding(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', uid)
        .single();
      setNeedsOnboarding(!data?.name);
    })();
  }, [uid]);

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';

    if (!uid && !inAuth) {
      router.replace('/auth');
      return;
    }

    if (uid && inAuth) {
      // Wait until we know onboarding status
      if (needsOnboarding === null) return;
      if (needsOnboarding) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isLoading, uid, needsOnboarding, router, segments]);

  if (isLoading) return null;
  if (uid && needsOnboarding === null) return null; // Loading profile check

  return (
    <TripsProvider userKey={uid}>
      <SharedTripsProvider uid={uid}>
        {children}
      </SharedTripsProvider>
    </TripsProvider>
  );
}
