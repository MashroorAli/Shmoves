import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useSharedTrips } from '@/context/shared-trips-context';
import { type Trip, useTrips } from '@/context/trips-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function MyTripsScreen() {
  const router = useRouter();
  const { trips, deleteTrip } = useTrips();
  const { sharedTrips, pendingInvites, acceptInvite, declineInvite } = useSharedTrips();
  const { signOut } = useAuth();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme];

  const [editMode, setEditMode] = useState(false);

  const parseLocalDate = (value?: string) => {
    if (!value) return undefined;
    const iso = value.trim();
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      const d = new Date(year, month - 1, day);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const formatTripMonthRange = (start?: string, end?: string) => {
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    if (!startDate || !endDate) return '';

    const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
    const startMonth = monthFmt.format(startDate);
    const endMonth = monthFmt.format(endDate);

    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    const sameYear = startYear === endYear;
    const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth();

    if (sameMonth) return `${startMonth} ${startYear}`;
    if (sameYear) return `${startMonth} - ${endMonth} ${startYear}`;
    return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
  };

  const handleTripPress = (trip: Trip) => {
    router.push({
      pathname: '/trip/[id]',
      params: {
        id: trip.id,
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
      },
    });
  };

  // Merge personal trips and shared trips into a single list
  type MergedTrip = Trip & { isShared?: boolean; sharedTripId?: string };

  const { upcomingTrips, pastTrips } = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // Personal trips (exclude ones that have been migrated to shared)
    const sharedTripIds = new Set(sharedTrips.map((st) => st.trip.id));
    const personalTrips: MergedTrip[] = trips
      .filter((t) => !sharedTripIds.has(t.id))
      .map((t) => ({ ...t }));

    // Shared trips
    const shared: MergedTrip[] = sharedTrips.map((st) => ({
      ...st.trip,
      isShared: true,
      sharedTripId: st.id,
    }));

    const allTrips = [...personalTrips, ...shared];

    const upcoming: MergedTrip[] = [];
    const past: MergedTrip[] = [];

    for (const trip of allTrips) {
      const end = parseLocalDate(trip.endDate);
      if (end && end.getTime() < todayStart.getTime()) {
        past.push(trip);
      } else {
        upcoming.push(trip);
      }
    }

    upcoming.sort((a, b) => {
      const aStart = parseLocalDate(a.startDate)?.getTime() ?? 0;
      const bStart = parseLocalDate(b.startDate)?.getTime() ?? 0;
      return aStart - bStart;
    });

    past.sort((a, b) => {
      const aEnd = parseLocalDate(a.endDate)?.getTime() ?? 0;
      const bEnd = parseLocalDate(b.endDate)?.getTime() ?? 0;
      return bEnd - aEnd;
    });

    return { upcomingTrips: upcoming, pastTrips: past };
  }, [trips, sharedTrips]);

  const renderTripCard = (trip: MergedTrip) => (
    <Pressable
      key={trip.sharedTripId ?? trip.id}
      style={[styles.tripCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
      onPress={() => {
        if (editMode) return;
        handleTripPress(trip);
      }}>
      <View style={styles.tripCardTopRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ThemedText style={styles.tripDestination}>{trip.destination}</ThemedText>
          {trip.isShared ? (
            <IconSymbol name="person.2.fill" size={14} color={colors.icon} />
          ) : null}
        </View>
        {editMode && !trip.isShared ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Alert.alert('Delete trip?', 'This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    deleteTrip(trip.id);
                  },
                },
              ]);
            }}>
            <ThemedText style={[styles.deleteText, { color: colors.destructive }]}>Delete</ThemedText>
          </Pressable>
        ) : null}
      </View>
      <ThemedText style={styles.tripDates}>{formatTripMonthRange(trip.startDate, trip.endDate)}</ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <View style={styles.headerRow}>
          <ThemedText type="title">My Shmoves</ThemedText>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                setEditMode((v) => !v);
              }}>
              <ThemedText style={[styles.signOutText, { color: colors.primary }]}>{editMode ? 'Done' : 'Edit'}</ThemedText>
            </Pressable>
            <Pressable
              onPress={async () => {
                await signOut();
                router.replace('/auth');
              }}>
              <ThemedText style={[styles.signOutText, { color: colors.primary }]}>Sign out</ThemedText>
            </Pressable>
          </View>
        </View>
      </ThemedView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 40 }}>
        {/* Pending Invitations */}
        {pendingInvites.length > 0 ? (
          <>
            <ThemedText style={styles.sectionHeader}>Pending Invitations</ThemedText>
            {pendingInvites.map((invite) => (
              <View
                key={invite.memberRowId}
                style={[styles.inviteCard, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.tripDestination}>{invite.destination}</ThemedText>
                  <ThemedText style={styles.tripDates}>
                    {formatTripMonthRange(invite.startDate, invite.endDate)}
                  </ThemedText>
                  {invite.inviterName || invite.inviterPhone ? (
                    <ThemedText style={[styles.inviteFrom, { color: colors.icon }]}>
                      Invited by {invite.inviterName || invite.inviterPhone}
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.inviteActions}>
                  <Pressable
                    style={[styles.inviteButton, { backgroundColor: colors.primary }]}
                    onPress={() => acceptInvite(invite.tripId)}>
                    <ThemedText style={styles.inviteButtonText}>Accept</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.inviteButton, { backgroundColor: colors.border }]}
                    onPress={() => declineInvite(invite.tripId)}>
                    <ThemedText style={[styles.inviteButtonText, { color: colors.text }]}>Decline</ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {upcomingTrips.length > 0 ? (
          upcomingTrips.map(renderTripCard)
        ) : trips.length === 0 && sharedTrips.length === 0 ? (
          <ThemedText style={styles.placeholder}>Your saved trips will appear here.</ThemedText>
        ) : null}

        {pastTrips.length > 0 ? (
          <>
            <ThemedText style={styles.sectionHeader}>Past Trips</ThemedText>
            {pastTrips.map(renderTripCard)}
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    marginTop: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signOutText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  tripCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  tripCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tripDestination: {
    fontSize: 18,
    fontWeight: '600',
  },
  tripDates: {
    fontSize: 14,
    opacity: 0.7,
  },
  deleteText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHeader: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '800',
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  placeholder: {
    opacity: 0.5,
  },
  inviteCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteFrom: {
    fontSize: 12,
    marginTop: 2,
  },
  inviteActions: {
    gap: 8,
    alignItems: 'center',
  },
  inviteButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
