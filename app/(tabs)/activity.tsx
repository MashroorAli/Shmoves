import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColors } from '@/hooks/use-colors';

type ActivityItem = {
  id: string;
  name: string;
  initials: string;
  action: string;
  destination: string;
  timestamp: string;
  details?: string;
};

export default function ActivityScreen() {
  const colors = useColors();

  const items = useMemo<ActivityItem[]>(
    () => [
      {
        id: 'a1',
        name: 'Sarah',
        initials: 'S',
        action: 'booked a trip',
        destination: 'Tokyo, Japan',
        timestamp: '2h',
        details: 'Cherry blossom season itinerary coming together.',
      },
      {
        id: 'a2',
        name: 'Mike',
        initials: 'M',
        action: 'checked in',
        destination: 'Lisbon, Portugal',
        timestamp: '6h',
        details: 'Just landed. Pastéis de nata first.',
      },
      {
        id: 'a3',
        name: 'Aisha',
        initials: 'A',
        action: 'added housing',
        destination: 'Reykjavík, Iceland',
        timestamp: '1d',
        details: 'Found a cozy Airbnb near the harbor.',
      },
      {
        id: 'a4',
        name: 'Daniel',
        initials: 'D',
        action: 'shared a photo',
        destination: 'Vancouver, Canada',
        timestamp: '3d',
        details: 'Mountain views all week.',
      },
    ],
    [],
  );

  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});

  const toggleLike = (id: string) => {
    setLikedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.comingSoonWrap}>
        <ThemedText style={[styles.comingSoonText, { color: colors.text }]}>Coming soon</ThemedText>
      </View>

      {false ? (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.feedContent}
          renderItem={({ item }) => {
            const liked = !!likedIds[item.id];
            return (
              <ThemedView style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={styles.cardHeaderRow}>
                  <View style={[styles.avatar, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                  >
                    <ThemedText style={styles.avatarText}>{item.initials}</ThemedText>
                  </View>

                  <View style={styles.headerTextBlock}>
                    <ThemedText style={styles.nameLine}>
                      {item.name}{' '}
                      <ThemedText style={[styles.actionText, { color: colors.inputText }]}>{item.action}</ThemedText>
                    </ThemedText>
                    <ThemedText style={styles.metaLine}>
                      {item.destination} · {item.timestamp}
                    </ThemedText>
                  </View>
                </View>

                {item.details ? <ThemedText style={styles.detailsText}>{item.details}</ThemedText> : null}

                <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
                  <Pressable
                    onPress={() => toggleLike(item.id)}
                    style={[styles.actionButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                  >
                    <ThemedText style={[styles.actionButtonText, liked ? { color: colors.primary } : null]}>
                      {liked ? 'Liked' : 'Like'}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      // UI-only for now
                    }}
                    style={[styles.actionButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
                  >
                    <ThemedText style={styles.actionButtonText}>Comment</ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            );
          }}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  comingSoonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: {
    fontSize: 16,
    fontWeight: '700',
    opacity: 0.7,
  },
  feedContent: {
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  headerTextBlock: {
    flex: 1,
    gap: 2,
  },
  nameLine: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  metaLine: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: '600',
  },
  detailsText: {
    fontSize: 13,
    opacity: 0.85,
    fontWeight: '600',
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
