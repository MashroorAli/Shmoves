import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/context/auth-context';
import { useSharedTrips } from '@/context/shared-trips-context';
import { type Trip, useTrips } from '@/context/trips-context';
import { useColors } from '@/hooks/use-colors';

export default function MyTripsScreen() {
  const router = useRouter();
  const { uid } = useAuth();
  const { trips, deleteTrip, updateTrip } = useTrips();
  const { sharedTrips, pendingInvites, acceptInvite, declineInvite, deleteSharedTrip, leaveSharedTrip, updateSharedTripDetails } = useSharedTrips();
  const colors = useColors();


  type MergedTrip = Trip & { isShared?: boolean; sharedTripId?: string };
  type EditingTrip = { trip: MergedTrip; isShared: boolean };
  const [editingTrip, setEditingTrip] = useState<EditingTrip | null>(null);
  const [editDestination, setEditDestination] = useState('');
  const [editStartDate, setEditStartDate] = useState<Date>(new Date());
  const [editEndDate, setEditEndDate] = useState<Date>(new Date());
  const [editStartPickerVisible, setEditStartPickerVisible] = useState(false);
  const [editEndPickerVisible, setEditEndPickerVisible] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const toLocalIsoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const openEdit = (trip: MergedTrip) => {
    const start = parseLocalDate(trip.startDate) ?? new Date();
    const end = parseLocalDate(trip.endDate) ?? new Date();
    setEditDestination(trip.destination);
    setEditStartDate(start);
    setEditEndDate(end);
    setEditingTrip({ trip, isShared: !!trip.isShared });
  };

  const saveEdit = async () => {
    if (!editingTrip) return;
    const destination = editDestination.trim();
    if (!destination) { Alert.alert('Missing destination', 'Please enter a destination.'); return; }
    setEditBusy(true);
    try {
      const updates = {
        destination,
        startDate: toLocalIsoDate(editStartDate),
        endDate: toLocalIsoDate(editEndDate),
      };
      if (editingTrip.isShared && editingTrip.trip.sharedTripId) {
        await updateSharedTripDetails(editingTrip.trip.sharedTripId, updates);
      } else {
        updateTrip(editingTrip.trip.id, updates);
      }
      setEditingTrip(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save changes.');
    } finally {
      setEditBusy(false);
    }
  };

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

  const { currentTrips, upcomingTrips, pastTrips, daysUntilNext } = useMemo(() => {
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

    const current: MergedTrip[] = [];
    const upcoming: MergedTrip[] = [];
    const past: MergedTrip[] = [];

    for (const trip of allTrips) {
      const start = parseLocalDate(trip.startDate);
      const end = parseLocalDate(trip.endDate);
      if (end && end.getTime() < todayStart.getTime()) {
        past.push(trip);
      } else if (start && start.getTime() <= todayStart.getTime()) {
        current.push(trip);
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

    const nextStart = upcoming[0] ? parseLocalDate(upcoming[0].startDate) : undefined;
    let daysUntilNext: number | null = null;
    if (nextStart) {
      const diff = nextStart.getTime() - todayStart.getTime();
      daysUntilNext = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    return { currentTrips: current, upcomingTrips: upcoming, pastTrips: past, daysUntilNext };
  }, [trips, sharedTrips]);

  const handleTripOptions = (trip: MergedTrip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (trip.isShared && trip.sharedTripId) {
      const sharedData = sharedTrips.find((st) => st.id === trip.sharedTripId);
      const isOwner = sharedData?.ownerId === uid;

      const options = isOwner
        ? ['Edit Trip', 'Delete', 'Cancel']
        : ['Leave', 'Cancel'];
      const destructiveIndex = isOwner ? 1 : 0;
      const cancelIndex = isOwner ? 2 : 1;

      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: cancelIndex },
        (index) => {
          if (isOwner) {
            if (index === 0) openEdit(trip);
            if (index === 1) {
              Alert.alert(
                'Delete Trip?',
                'This will permanently delete the trip for everyone in the group.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSharedTrip(trip.sharedTripId!); await deleteTrip(trip.id); } },
                ],
              );
            }
          } else {
            if (index === 0) leaveSharedTrip(trip.sharedTripId!);
          }
        },
      );
    } else {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Edit Trip', 'Delete', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) openEdit(trip);
          if (index === 1) deleteTrip(trip.id);
        },
      );
    }
  };

  const renderTripCard = (trip: MergedTrip) => (
    <Pressable
      key={trip.sharedTripId ?? trip.id}
      style={[styles.tripCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
      onPress={() => handleTripPress(trip)}>
      <View style={styles.tripCardTopRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <ThemedText style={styles.tripDestination}>{trip.destination}</ThemedText>
          {trip.isShared ? (
            <IconSymbol name="person.2.fill" size={14} color={colors.icon} />
          ) : null}
        </View>
        <Pressable onPress={() => handleTripOptions(trip)} hitSlop={8} style={styles.dotsButton}>
          <IconSymbol name="ellipsis" size={18} color={colors.icon} />
        </Pressable>
      </View>
      <ThemedText style={styles.tripDates}>{formatTripMonthRange(trip.startDate, trip.endDate)}</ThemedText>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 40, paddingTop: 60 }} showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={{ marginBottom: 8 }}>My Shmoves</ThemedText>
        {/* Current Trip */}
        {currentTrips.length > 0 && (
          <>
            <ThemedText style={styles.sectionHeader}>Current Trip</ThemedText>
            {currentTrips.map(renderTripCard)}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        {/* Invited */}
        <>
          <ThemedText style={styles.sectionHeader}>Invites</ThemedText>
          {pendingInvites.length > 0 ? pendingInvites.map((invite) => (
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
          )) : (
            <ThemedText style={[styles.placeholder, { marginBottom: 4 }]}>No pending invites.</ThemedText>
          )}
        </>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <ThemedText style={styles.sectionHeader}>
          {daysUntilNext === null
            ? 'Upcoming'
            : daysUntilNext === 0
            ? 'Upcoming - Today!'
            : `Upcoming - ${daysUntilNext} day${daysUntilNext === 1 ? '' : 's'} left`}
        </ThemedText>

        {upcomingTrips.length > 0 ? (
          upcomingTrips.map(renderTripCard)
        ) : trips.length === 0 && sharedTrips.length === 0 && currentTrips.length === 0 ? (
          <ThemedText style={styles.placeholder}>Your saved trips will appear here.</ThemedText>
        ) : upcomingTrips.length === 0 ? (
          <ThemedText style={styles.placeholder}>No upcoming trips.</ThemedText>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <ThemedText style={styles.sectionHeader}>Past</ThemedText>

        {pastTrips.length > 0 ? (
          pastTrips.map(renderTripCard)
        ) : (
          <ThemedText style={styles.placeholder}>No past trips yet.</ThemedText>
        )}
      </ScrollView>
      <Modal visible={!!editingTrip} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingTrip(null)}>
        <View style={[styles.editRoot, { backgroundColor: colors.background }]}>
          <View style={styles.editHeader}>
            <Pressable onPress={() => setEditingTrip(null)} hitSlop={10}>
              <ThemedText style={[styles.editCancel, { color: colors.icon }]}>Cancel</ThemedText>
            </Pressable>
            <ThemedText style={[styles.editTitle, { color: colors.text }]}>Edit Trip</ThemedText>
            <Pressable
              onPress={saveEdit}
              disabled={editBusy}
              style={[styles.editSaveBtn, { backgroundColor: colors.primary, opacity: editBusy ? 0.6 : 1 }]}
            >
              <ThemedText style={styles.editSaveBtnText}>Save</ThemedText>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editScroll} keyboardShouldPersistTaps="handled">
            <ThemedText style={[styles.editLabel, { color: colors.icon }]}>Destination</ThemedText>
            <TextInput
              value={editDestination}
              onChangeText={setEditDestination}
              placeholder="Where are you going?"
              placeholderTextColor={colors.icon}
              style={[styles.editInput, { color: colors.inputText, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <ThemedText style={[styles.editLabel, { color: colors.icon }]}>Start Date</ThemedText>
            <Pressable
              onPress={() => setEditStartPickerVisible(true)}
              style={[styles.editDateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <ThemedText style={{ color: colors.text }}>
                {editStartDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </ThemedText>
            </Pressable>

            <ThemedText style={[styles.editLabel, { color: colors.icon }]}>End Date</ThemedText>
            <Pressable
              onPress={() => setEditEndPickerVisible(true)}
              style={[styles.editDateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <ThemedText style={{ color: colors.text }}>
                {editEndDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </ThemedText>
            </Pressable>
          </ScrollView>

          <Modal visible={editStartPickerVisible} transparent animationType="fade" onRequestClose={() => setEditStartPickerVisible(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setEditStartPickerVisible(false)}>
              <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
                <DateTimePicker
                  value={editStartDate}
                  mode="date"
                  display="spinner"
                  onChange={(_, d) => { if (d) setEditStartDate(d); }}
                />
                <Pressable onPress={() => setEditStartPickerVisible(false)} style={[styles.pickerDone, { backgroundColor: colors.primary }]}>
                  <ThemedText style={styles.pickerDoneText}>Done</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Modal>

          <Modal visible={editEndPickerVisible} transparent animationType="fade" onRequestClose={() => setEditEndPickerVisible(false)}>
            <Pressable style={styles.pickerBackdrop} onPress={() => setEditEndPickerVisible(false)}>
              <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
                <DateTimePicker
                  value={editEndDate}
                  mode="date"
                  display="spinner"
                  onChange={(_, d) => { if (d) setEditEndDate(d); }}
                />
                <Pressable onPress={() => setEditEndPickerVisible(false)} style={[styles.pickerDone, { backgroundColor: colors.primary }]}>
                  <ThemedText style={styles.pickerDoneText}>Done</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    borderRadius: 1,
  },
  container: {
    flex: 1,
    padding: 24,
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
  dotsButton: {
    padding: 4,
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

  editRoot: { flex: 1 },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  editTitle: { fontSize: 18, fontWeight: '800' },
  editCancel: { fontSize: 15, fontWeight: '600' },
  editSaveBtn: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSaveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  editScroll: { padding: 20, gap: 6 },
  editLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  editInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  editDateBtn: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  pickerDone: {
    marginTop: 8,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  pickerDoneText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
