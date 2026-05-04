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
import { SharedTripsProvider, useSharedTrips } from '@/context/shared-trips-context';
import { SocialProvider, useSocial } from '@/context/social-context';
import { TripsProvider } from '@/context/trips-context';
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
            <Stack.Screen name="trip-public/[source]/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="compose-post" options={{ headerShown: false, presentation: 'modal' }} />
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
    <TripsProvider userKey={uid}>
      <SharedTripsProvider uid={uid}>
        <SocialProvider uid={uid}>
          <DeepLinkHandler>
            {children}
          </DeepLinkHandler>
        </SocialProvider>
      </SharedTripsProvider>
    </TripsProvider>
  );
}

const PENDING_INVITE_KEY = 'PENDING_INVITE_TOKEN';
const PENDING_FRIEND_KEY = 'PENDING_ADD_FRIEND_USERNAME';

function DeepLinkHandler({ children }: { children: React.ReactNode }) {
  const url = Linking.useURL();
  const { uid } = useAuth();
  const { resolveInviteToken } = useSharedTrips();
  const { getProfileByUsername, sendFriendRequest, getRelationship } = useSocial();

  const resolveAddFriend = async (username: string) => {
    const profile = await getProfileByUsername(username);
    if (!profile) {
      Alert.alert('Add friend', `No user found with username @${username}.`);
      return;
    }
    const rel = getRelationship(profile.id);
    if (rel === 'self') {
      Alert.alert('Add friend', "That's your own link.");
      return;
    }
    if (rel === 'friends') {
      Alert.alert('Add friend', `You and @${username} are already friends.`);
      return;
    }
    if (rel === 'outgoing') {
      Alert.alert('Add friend', `You've already sent @${username} a request.`);
      return;
    }
    if (rel === 'incoming') {
      Alert.alert('Add friend', `@${username} has already sent you a request. Open the Friends sheet to accept.`);
      return;
    }
    Alert.alert(
      'Add friend',
      `Send a friend request to ${profile.name ?? `@${username}`}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: () => {
            sendFriendRequest(profile.id).catch((e) =>
              Alert.alert('Error', e.message || 'Could not send request.'),
            );
          },
        },
      ],
    );
  };

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
      return;
    }

    // shmoves://add-friend/USERNAME
    if (parsed.hostname === 'add-friend' && parsed.path) {
      const username = parsed.path.replace(/^\//, '');
      if (!username) return;
      if (!uid) {
        AsyncStorage.setItem(PENDING_FRIEND_KEY, username);
        return;
      }
      resolveAddFriend(username);
      return;
    }
  }, [url, uid, resolveInviteToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // On login, check for stashed tokens
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
      const stashedFriend = await AsyncStorage.getItem(PENDING_FRIEND_KEY);
      if (stashedFriend) {
        await AsyncStorage.removeItem(PENDING_FRIEND_KEY);
        resolveAddFriend(stashedFriend);
      }
    })();
  }, [uid, resolveInviteToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
