import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useSharedTrips } from '@/context/shared-trips-context';
import { useTrips } from '@/context/trips-context';
import { useColors } from '@/hooks/use-colors';

interface Props {
  tripId: string;
  source: 'personal' | 'shared';
  isPublic: boolean;
  // For shared trips the user must be a member to change this. We don't
  // enforce member-vs-owner here — any member can toggle.
  canEdit: boolean;
}

export function TripPrivacyCard({ tripId, source, isPublic, canEdit }: Props) {
  const colors = useColors();
  const { setTripPublic } = useTrips();
  const { setSharedTripPublic } = useSharedTrips();
  const [busy, setBusy] = useState(false);

  const onToggle = async (next: boolean) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      if (source === 'personal') {
        setTripPublic(tripId, next);
      } else {
        await setSharedTripPublic(tripId, next);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update privacy.');
    } finally {
      setBusy(false);
    }
  };

  const onInfo = () => {
    Alert.alert(
      'Trip privacy',
      isPublic
        ? 'Friends can see a summary of this trip (destination, dates, photos, and your posts). They cannot see your flights, expenses, or housing.'
        : 'Only you can see this trip. Switch it to public to share posts about it with friends on Shmovements.',
    );
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.iconBubble, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Ionicons
          name={isPublic ? 'earth-outline' : 'lock-closed-outline'}
          size={18}
          color={isPublic ? colors.primary : colors.icon}
        />
      </View>
      <View style={styles.textBlock}>
        <View style={styles.titleRow}>
          <ThemedText style={[styles.title, { color: colors.text }]}>
            {isPublic ? 'Public trip' : 'Private trip'}
          </ThemedText>
          <Pressable onPress={onInfo} hitSlop={8} style={styles.infoBtn}>
            <Ionicons name="information-circle-outline" size={16} color={colors.icon} />
          </Pressable>
        </View>
        <ThemedText style={[styles.subtitle, { color: colors.icon }]}>
          {isPublic
            ? 'Friends see a summary and any posts you share.'
            : 'Only you can see this trip right now.'}
        </ThemedText>
      </View>
      <Switch
        value={isPublic}
        onValueChange={onToggle}
        disabled={!canEdit || busy}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  infoBtn: { padding: 2 },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
