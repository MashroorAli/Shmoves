import 'react-native-url-polyfill/auto';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/context/auth-context';
import { TripsProvider } from '@/context/trips-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

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

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === 'auth';

    if (!uid && !inAuth) {
      router.replace('/auth');
      return;
    }

    if (uid && inAuth) {
      router.replace('/(tabs)');
    }
  }, [isLoading, uid, router, segments]);

  if (isLoading) return null;

  return <TripsProvider userKey={uid}>{children}</TripsProvider>;
}
