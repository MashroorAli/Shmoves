import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import 'react-native-reanimated';

import { AccentProvider } from '@/context/accent-context';
import { HomeCurrencyProvider } from '@/context/home-currency-context';
import { TempUnitProvider } from '@/context/temp-unit-context';
import { TimeFormatProvider } from '@/context/time-format-context';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { TripsProvider, useTrips } from '@/context/trips-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/config/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AccentProvider>
    <HomeCurrencyProvider>
    <TempUnitProvider>
    <TimeFormatProvider>
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
    </TimeFormatProvider>
    </TempUnitProvider>
    </HomeCurrencyProvider>
    </AccentProvider>
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
    <TripsProvider uid={uid}>
      <DeepLinkHandler>
        {children}
      </DeepLinkHandler>
    </TripsProvider>
  );
}

const PENDING_INVITE_KEY = 'PENDING_INVITE_TOKEN';

function DeepLinkHandler({ children }: { children: React.ReactNode }) {
  const url = Linking.useURL();
  const { uid } = useAuth();
  const { resolveInviteToken } = useTrips();

  // Handle incoming deep links
  useEffect(() => {
    if (!url) return;

    const parsed = Linking.parse(url);

    // shmoves://invite/TOKEN → hostname="invite", path="TOKEN"
    if (parsed.hostname === 'invite' && parsed.path) {
      const token = parsed.path.replace(/^\//, '');
      if (!uid) {
        AsyncStorage.setItem(PENDING_INVITE_KEY, token);
        return;
      }
      resolveInviteToken(token).catch((err) => {
        Alert.alert('Invite', err.message || 'Could not resolve invite.');
      });
    }
  }, [url, uid, resolveInviteToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // On login, check for a stashed token
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const stashedInvite = await AsyncStorage.getItem(PENDING_INVITE_KEY);
      if (stashedInvite) {
        await AsyncStorage.removeItem(PENDING_INVITE_KEY);
        resolveInviteToken(stashedInvite).catch((err) => {
          Alert.alert('Invite', err.message || 'Could not resolve invite.');
        });
      }
    })();
  }, [uid, resolveInviteToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
